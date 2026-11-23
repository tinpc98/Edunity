const mongoose = require("mongoose");
const cron = require("node-cron");
const { runExclusive } = require("./jobLock");
const { Class, AuditLog } = require("../models");
const auditService = require("../services/auditService");
const notificationService = require("../services/notificationService");
const { retryFailedNotifications } = require("../services/notificationService");
const Notification = require("../models/Notification");
const audit = (...args) => auditService.audit(...args);
const notify = (...args) => notificationService.notify(...args);
const { advanceClassStatuses } = require("../services/classLifecycleService");
const { expireScholarships } = require("../services/scholarshipExpiryService");
const { runReverificationSweep } = require("../services/teacherVerificationService");
const { expireOldRecordings, failStaleProcessingRecordings } = require("../services/recordingMaintenanceService");
const {
  startFinancialOutboxWorker,
  stopFinancialOutboxWorker,
  runFinancialOutboxTick,
  resolveOutboxConfig,
} = require("./financialOutboxWorker");
const { runTokenRevocationSweep } = require("../services/tokenRevocationService");
const { resolveTzOffsetMinutes, isClassStartDateReached } = require("../utils/approvalDeadline");

const NOT_DELETED = { isDeleted: { $ne: true } };

const DEFAULT_MAINTENANCE_LOCK_TTL_MS = 4 * 60 * 1000;
const DEFAULT_MAINTENANCE_HEARTBEAT_MS = 60 * 1000;

let isRunning = false;

// BE-02 / BE-02-FIX-02: Automatically reject PENDING_APPROVAL classes whose startDate has arrived or passed
// Ensures atomic transaction with AuditLog, post-commit notification isolation, lease-loss abort, and concurrency safety.
const rejectExpiredPendingClasses = async (now = new Date(), options = {}) => {
  const offsetMinutes = resolveTzOffsetMinutes(options);

  const candidates = await Class.find({
    status: "PENDING_APPROVAL",
    startDate: { $exists: true, $ne: null },
    ...NOT_DELETED,
  })
    .select("_id className teacherId startDate status")
    .lean();

  const rejected = [];
  const errors = [];

  for (const cls of candidates) {
    // FIX-02 & FIX-03: Pre-transaction in-memory and DB lease verification
    if (
      options.lockContext &&
      typeof options.lockContext.isLeaseActive === "function" &&
      !options.lockContext.isLeaseActive()
    ) {
      console.warn(
        `[maintenanceJob] Aborting class rejection loop because distributed lease was lost`
      );
      errors.push({ classId: cls._id.toString(), error: "LEASE_LOST" });
      break;
    }
    if (
      options.lockContext &&
      typeof options.lockContext.verifyOwnership === "function"
    ) {
      const isOwner = await options.lockContext.verifyOwnership();
      if (!isOwner) {
        console.warn(
          `[maintenanceJob] Aborting class rejection loop: lock ownership verification failed before candidate ${cls._id}`
        );
        errors.push({ classId: cls._id.toString(), error: "LOCK_OWNERSHIP_LOST" });
        break;
      }
    }

    let session = null;
    let committedDoc = null;
    try {
      if (!isClassStartDateReached(cls.startDate, now, offsetMinutes)) {
        continue;
      }

      // FIX-01: Mandatory MongoDB session and withTransaction. Zero non-transactional fallback!
      if (typeof mongoose.startSession !== "function") {
        throw new Error(
          "Database session is unavailable; class auto-rejection requires transaction support"
        );
      }

      try {
        session = await mongoose.startSession();
      } catch (sessionErr) {
        throw new Error(`Failed to start database session: ${sessionErr.message}`);
      }

      if (!session || typeof session.withTransaction !== "function") {
        throw new Error("Database session does not support transactions");
      }

      await session.withTransaction(async () => {
        // FIX-03: Fencing check INSIDE transaction session
        if (
          options.lockContext &&
          typeof options.lockContext.verifyOwnership === "function"
        ) {
          const isStillOwner = await options.lockContext.verifyOwnership(session);
          if (!isStillOwner) {
            const fencingErr = new Error(
              `Lock fencing error: distributed lock "${options.lockContext.name}" is no longer owned by ${options.lockContext.instanceId}`
            );
            fencingErr.code = "LOCK_FENCING_FAILED";
            throw fencingErr;
          }
        }

        // Conditional atomic update inside transaction for concurrency safety
        const doc = await Class.findOneAndUpdate(
          {
            _id: cls._id,
            status: "PENDING_APPROVAL",
            ...NOT_DELETED,
          },
          {
            $set: {
              status: "REJECTED",
              reviewedBy: null,
              reviewNote: "Lớp học đã đến ngày khai giảng nhưng chưa được phê duyệt.",
              reviewedAt: now,
              updatedBy: null,
            },
          },
          { session, returnDocument: "after" }
        ).lean();

        if (!doc) return;

        // AuditLog with SYSTEM actor (no fake Admin ID) recorded inside the exact same transaction
        await audit(
          {
            actorAdminId: null,
            actorType: "SYSTEM",
            action: "CLASS_EXPIRED_REJECTED",
            targetType: "Class",
            targetId: doc._id,
            beforeState: { status: "PENDING_APPROVAL" },
            afterState: {
              status: "REJECTED",
              reviewNote: doc.reviewNote,
              reason: "START_DATE_PASSED_WITHOUT_APPROVAL",
            },
          },
          session
        );

        await require("../services/adminClassService").cancelUnstartedSessions(doc._id, session);

        // FIX-01 (BE-02-FIX-03): Atomic Notification Persistence inside the exact same transaction!
        const dedupeKey = `CLASS_EXPIRED_REJECTED:${doc._id.toString()}`;
        await notify(
          doc.teacherId,
          "Lớp học bị từ chối tự động",
          `Lớp "${doc.className}" đã bị từ chối tự động do đã đến ngày khai giảng nhưng chưa được phê duyệt.`,
          "CLASS_EXPIRED_REJECTED",
          {
            dedupeKey,
            session,
            deliveryStatus: "DELIVERED",
            throwOnError: true,
          }
        );

        committedDoc = doc;
      });

      if (!committedDoc) {
        continue;
      }

      rejected.push(committedDoc._id.toString());
    } catch (err) {
      console.error(
        `[maintenanceJob] Failed to auto-reject expired class ${cls._id}:`,
        err.message
      );
      errors.push({ classId: cls._id.toString(), error: err.message });
      if (err && err.code === "LOCK_FENCING_FAILED") {
        break; // Stop candidate loop on lock fencing failure
      }
    } finally {
      if (session && typeof session.endSession === "function") {
        try {
          await session.endSession();
        } catch (endErr) {
          // ignore cleanup errors
        }
      }
    }
  }

  return { rejected, rejectedCount: rejected.length, errors };
};

/**
 * FIX-02 (BE-02-FIX-04): Reliable Recovery Scan with Keyset Pagination.
 * Uses definitive AuditLog action "CLASS_EXPIRED_REJECTED" as the immutable business marker.
 * Strictly ignores manual admin rejections ("CLASS_REJECTED").
 * Paginates via keyset pagination (`_id: { $gt: lastId }`) so earlier batches never perpetually hog the scan.
 */
const recoverMissingExpiredClassNotifications = async (now = new Date(), options = {}) => {
  const { lockContext = null, batchSize = 100 } = options || {};

  if (
    lockContext &&
    typeof lockContext.isLeaseActive === "function" &&
    !lockContext.isLeaseActive()
  ) {
    console.warn(
      "[maintenanceJob] Aborting recoverMissingExpiredClassNotifications: lease lost"
    );
    return { count: 0, recoveredCount: 0, recovered: [], abortedDueToLeaseLoss: true };
  }

  const recovered = [];
  const errors = [];
  let lastId = options?.lastAuditId || null;
  let hasMore = true;

  while (hasMore) {
    if (
      lockContext &&
      typeof lockContext.isLeaseActive === "function" &&
      !lockContext.isLeaseActive()
    ) {
      break;
    }

    const query = {
      action: "CLASS_EXPIRED_REJECTED",
      targetType: "Class",
    };
    if (lastId) {
      query._id = { $gt: lastId };
    }

    const auditEntries = await AuditLog.find(query)
      .sort({ _id: 1 })
      .limit(batchSize)
      .lean();

    if (!auditEntries || auditEntries.length === 0) {
      hasMore = false;
      break;
    }

    for (const entry of auditEntries) {
      lastId = entry._id; // Always advance keyset pointer

      if (
        lockContext &&
        typeof lockContext.isLeaseActive === "function" &&
        !lockContext.isLeaseActive()
      ) {
        hasMore = false;
        break;
      }

      const classId = entry.targetId;
      if (!classId) continue;

      const dedupeKey = `CLASS_EXPIRED_REJECTED:${classId.toString()}`;
      const existingNotif = await Notification.findOne({ dedupeKey }).lean();
      if (existingNotif) {
        continue;
      }

      const cls = await Class.findById(classId).select("_id teacherId className status").lean();
      if (!cls || cls.status !== "REJECTED") {
        continue;
      }

      // FIX-03 (BE-02-FIX-05): Safe per-entry error boundary and structured error reporting
      try {
        const res = await notify(
          cls.teacherId,
          "Lớp học bị từ chối tự động",
          `Lớp "${cls.className}" đã bị từ chối tự động do đã đến ngày khai giảng nhưng chưa được phê duyệt.`,
          "CLASS_EXPIRED_REJECTED",
          {
            dedupeKey,
            deliveryStatus: "DELIVERED",
            throwOnError: true,
          }
        );
        if (res && res.success) {
          recovered.push(cls._id.toString());
        } else {
          errors.push({
            classId: classId.toString(),
            auditId: entry._id.toString(),
            error: res?.error || "Notification creation returned failure",
          });
        }
      } catch (notifyErr) {
        console.error(
          `[maintenanceJob] Failed to recover notification for class ${classId}:`,
          notifyErr.message
        );
        errors.push({
          classId: classId.toString(),
          auditId: entry._id.toString(),
          error: notifyErr.message,
        });
      }
    }

    if (options && options.singleBatch) {
      break;
    }
    if (auditEntries.length < batchSize) {
      hasMore = false;
    }
  }

  return {
    count: recovered.length,
    recoveredCount: recovered.length,
    recovered,
    errors,
    errorCount: errors.length,
    lastAuditId: lastId,
  };
};

/**
 * Low-frequency housekeeping. Each step is independent: one failing does not skip the others.
 * - Class lifecycle: OPEN → IN_PROGRESS → COMPLETED (+ enrollments COMPLETED, legacy earnings AVAILABLE)
 * - Expired pending classes: PENDING_APPROVAL → REJECTED (when startDate arrives without approval)
 * - Notification recovery: Self-heals missing notifications for expired classes (BE-02-FIX-03)
 * - Scholarship expiry: ACTIVE → EXPIRED, unused balance back to the Campaign fund
 * - Recording retention and PROCESSING timeout
 * - Financial outbox recovery sweep (when ENABLE_FINANCIAL_OUTBOX_WORKER=true)
 * - Notification retry sweep (for legacy FAILED notifications)
 */
const runMaintenanceJob = async (now = new Date(), options = {}, lockContext = null) => {
  if (isRunning) {
    return { skipped: true, reason: "LOCAL_EXECUTION_IN_PROGRESS" };
  }
  isRunning = true;

  try {
    const result = {};
    const steps = {
      classes: () => advanceClassStatuses(now),
      expiredPendingClasses: () =>
        rejectExpiredPendingClasses(now, { ...options, lockContext }),
      notificationRecovery: () =>
        recoverMissingExpiredClassNotifications(now, { ...options, lockContext }),
      scholarships: () => expireScholarships(now),
      expiredRecordings: () => expireOldRecordings(now),
      staleRecordings: () => failStaleProcessingRecordings(now),
      teacherReverification: () => runReverificationSweep(now),
      notificationRetry: () => retryFailedNotifications(),
      tokenRevocationSweep: () => runTokenRevocationSweep(now, { lockContext }),
    };

    if (resolveOutboxConfig().isEnabled) {
      steps.financialOutbox = () => runFinancialOutboxTick({ now });
    }

    for (const [name, step] of Object.entries(steps)) {
      // FIX-02: Check distributed lease before executing each major maintenance step
      if (
        lockContext &&
        typeof lockContext.isLeaseActive === "function" &&
        !lockContext.isLeaseActive()
      ) {
        console.warn(
          `[maintenanceJob] Aborting remaining steps because distributed lease was lost: ${name}`
        );
        result[name] = { skipped: true, reason: "LEASE_LOST" };
        break;
      }

      try {
        result[name] = await step();
      } catch (err) {
        console.error(`[maintenanceJob] ${name} failed:`, err.message);
        result[name] = { error: err.message };
      }
    }
    return result;
  } finally {
    isRunning = false;
  }
};

const startMaintenanceJob = () => {
  cron.schedule("*/5 * * * *", () => {
    runExclusive(
      "maintenance",
      DEFAULT_MAINTENANCE_LOCK_TTL_MS,
      (lockContext) => runMaintenanceJob(undefined, {}, lockContext),
      undefined,
      { heartbeatIntervalMs: DEFAULT_MAINTENANCE_HEARTBEAT_MS }
    );
  });
  startFinancialOutboxWorker();
  console.log("Maintenance Job started.");
};

module.exports = {
  runMaintenanceJob,
  startMaintenanceJob,
  rejectExpiredPendingClasses,
  recoverMissingExpiredClassNotifications,
  runTokenRevocationSweep,
  resolveTzOffsetMinutes,
  isClassStartDateReached,
  startFinancialOutboxWorker,
  stopFinancialOutboxWorker,
  DEFAULT_MAINTENANCE_LOCK_TTL_MS,
  DEFAULT_MAINTENANCE_HEARTBEAT_MS,
};
