const mongoose = require("mongoose");
const cron = require("node-cron");
const { runExclusive } = require("./jobLock");
const { Class } = require("../models");
const auditService = require("../services/auditService");
const notificationService = require("../services/notificationService");
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

const NOT_DELETED = { isDeleted: { $ne: true } };

const DEFAULT_MAINTENANCE_LOCK_TTL_MS = 4 * 60 * 1000;
const DEFAULT_MAINTENANCE_HEARTBEAT_MS = 60 * 1000;

let isRunning = false;

const resolveTzOffsetMinutes = (options = {}) => {
  if (options && options.tzOffsetMinutes !== undefined && options.tzOffsetMinutes !== null) {
    const num = Number(options.tzOffsetMinutes);
    if (!Number.isNaN(num)) return num;
  }
  if (process.env.APP_TZ_OFFSET_MINUTES !== undefined && process.env.APP_TZ_OFFSET_MINUTES !== null) {
    const envNum = parseInt(process.env.APP_TZ_OFFSET_MINUTES, 10);
    if (!Number.isNaN(envNum)) return envNum;
  }
  // Fallback to Vietnam timezone UTC+7 (420 minutes)
  return 420;
};

const getZonedCalendarDateStr = (date, offsetMinutes) => {
  const localMs = date.getTime() + offsetMinutes * 60 * 1000;
  const d = new Date(localMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isClassStartDateReached = (startDate, now, offsetMinutes) => {
  if (!startDate || !(startDate instanceof Date) || isNaN(startDate.getTime())) {
    return false;
  }
  const nowDateStr = getZonedCalendarDateStr(now, offsetMinutes);
  const startDateStr = getZonedCalendarDateStr(startDate, offsetMinutes);
  return startDateStr <= nowDateStr;
};

// BE-02 / BE-02-FIX: Automatically reject PENDING_APPROVAL classes whose startDate has arrived or passed
// Ensures atomic transaction with AuditLog, post-commit notification isolation, and concurrency safety.
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
    let session = null;
    let committedDoc = null;
    try {
      if (!isClassStartDateReached(cls.startDate, now, offsetMinutes)) {
        continue;
      }

      if (typeof mongoose.startSession === "function") {
        try {
          session = await mongoose.startSession();
        } catch (sessionErr) {
          session = null;
        }
      }

      if (session && typeof session.withTransaction === "function") {
        await session.withTransaction(async () => {
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

          committedDoc = doc;
        });
      } else {
        // Fallback for standalone MongoDB environments without replica set
        const doc = await Class.findOneAndUpdate(
          {
            _id: cls._id,
            status: "PENDING_APPROVAL",
            ...NOT_DELETED,
          },
          {
            $set: {
              status: "REJECTED",
              reviewNote: "Lớp học đã đến ngày khai giảng nhưng chưa được phê duyệt.",
              reviewedAt: now,
              updatedBy: null,
            },
          },
          { returnDocument: "after" }
        ).lean();

        if (doc) {
          await audit({
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
          });
          committedDoc = doc;
        }
      }

      if (!committedDoc) {
        continue;
      }

      // Post-commit notification to teacher with deduplication key to prevent duplicate notifications
      // Isolated in try/catch so notification failures never roll back the class rejection or break job
      try {
        await notify(
          committedDoc.teacherId,
          "Lớp học bị từ chối tự động",
          `Lớp "${committedDoc.className}" đã bị từ chối tự động do đã đến ngày khai giảng nhưng chưa được phê duyệt.`,
          "CLASS_EXPIRED_REJECTED",
          { dedupeKey: `CLASS_EXPIRED_REJECTED:${committedDoc._id.toString()}` }
        );
      } catch (notifyErr) {
        console.error(
          `[maintenanceJob] Failed to send notification for expired class ${committedDoc._id}:`,
          notifyErr.message
        );
      }

      rejected.push(committedDoc._id.toString());
    } catch (err) {
      console.error(
        `[maintenanceJob] Failed to auto-reject expired class ${cls._id}:`,
        err.message
      );
      errors.push({ classId: cls._id.toString(), error: err.message });
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
 * Low-frequency housekeeping. Each step is independent: one failing does not skip the others.
 * - Class lifecycle: OPEN → IN_PROGRESS → COMPLETED (+ enrollments COMPLETED, legacy earnings AVAILABLE)
 * - Expired pending classes: PENDING_APPROVAL → REJECTED (when startDate arrives without approval)
 * - Scholarship expiry: ACTIVE → EXPIRED, unused balance back to the Campaign fund
 * - Recording retention and PROCESSING timeout
 * - Financial outbox recovery sweep (when ENABLE_FINANCIAL_OUTBOX_WORKER=true)
 */
const runMaintenanceJob = async (now = new Date(), options = {}) => {
  if (isRunning) {
    return { skipped: true, reason: "LOCAL_EXECUTION_IN_PROGRESS" };
  }
  isRunning = true;

  try {
    const result = {};
    const steps = {
      classes: () => advanceClassStatuses(now),
      expiredPendingClasses: () => rejectExpiredPendingClasses(now, options),
      scholarships: () => expireScholarships(now),
      expiredRecordings: () => expireOldRecordings(now),
      staleRecordings: () => failStaleProcessingRecordings(now),
      teacherReverification: () => runReverificationSweep(now),
    };

    if (resolveOutboxConfig().isEnabled) {
      steps.financialOutbox = () => runFinancialOutboxTick({ now });
    }

    for (const [name, step] of Object.entries(steps)) {
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
      () => runMaintenanceJob(),
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
  resolveTzOffsetMinutes,
  isClassStartDateReached,
  startFinancialOutboxWorker,
  stopFinancialOutboxWorker,
  DEFAULT_MAINTENANCE_LOCK_TTL_MS,
  DEFAULT_MAINTENANCE_HEARTBEAT_MS,
};
