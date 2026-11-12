const mongoose = require("mongoose");
const { Class, Session, Enrollment, TeacherEarning } = require("../models");
const { notify } = require("./notificationService");

const NOT_DELETED = { isDeleted: { $ne: true } };
const SETTLEMENT_LEASE_MS = 5 * 60 * 1000;

// A Session that can no longer change: ended, cancelled, or interrupted and closed out
const isTerminalSession = (s) =>
  s.status === "COMPLETED" || s.status === "CANCELLED" || (s.status === "INTERRUPTED" && s.roomState === "ENDED");

/**
 * OPEN → IN_PROGRESS once teaching has actually begun (a Session has been started). Enrollment requires OPEN, so the
 * calendar startDate alone does not close enrollment: a class whose first session has not run yet stays joinable.
 */
const startClassesThatBegan = async () => {
  const openClasses = await Class.find({ status: "OPEN", ...NOT_DELETED }).select("_id").lean();
  const started = [];
  for (const cls of openClasses) {
    const began = await Session.exists({
      classId: cls._id,
      status: { $in: ["IN_PROGRESS", "COMPLETED", "INTERRUPTED"] },
    });
    if (!began) continue;
    const res = await Class.updateOne({ _id: cls._id, status: "OPEN" }, { $set: { status: "IN_PROGRESS" } });
    if (res.modifiedCount === 1) started.push(cls._id.toString());
  }
  return started;
};

/**
 * Synchronizes V3 PR7 settlement state for a completed class with structured error logging and
 * persistent retry tracking on Class (never silently swallows failures).
 */
const syncClassSettlementWithTracking = async (classId, now = new Date()) => {
  try {
    const settlementService = require("./settlementService");
    await settlementService.evaluateClassSettlement(classId, { now });
    await Class.updateOne(
      { _id: classId },
      {
        $set: {
          settlementSyncStatus: "SYNCED",
          settlementSyncError: null,
          settlementSyncedAt: now,
          settlementSyncLastAttemptAt: now,
        },
        $inc: { settlementSyncAttempts: 1 },
      }
    );
    return { ok: true };
  } catch (err) {
    console.error(
      `[classLifecycleService] evaluateClassSettlement failed for class ${classId}:`,
      err
    );
    try {
      await Class.updateOne(
        { _id: classId },
        {
          $set: {
            settlementSyncStatus: "FAILED",
            settlementSyncError: err.message || String(err),
            settlementSyncLastAttemptAt: now,
          },
          $inc: { settlementSyncAttempts: 1 },
        }
      );
    } catch (trackErr) {
      console.error(
        `[classLifecycleService] Failed to persist settlement sync failure for class ${classId}:`,
        trackErr
      );
    }
    return { ok: false, error: err.message || String(err) };
  }
};

/**
 * Retries settlement evaluation for COMPLETED classes whose post-commit settlement sync previously failed
 * or whose in-progress lease went stale. Uses atomic findOneAndUpdate claim so concurrent runners do not race.
 */
const retryPendingClassSettlements = async (now = new Date(), skipClassIds = new Set()) => {
  const staleBefore = new Date(now.getTime() - SETTLEMENT_LEASE_MS);
  const candidates = await Class.find({
    status: "COMPLETED",
    ...NOT_DELETED,
    $or: [
      { settlementSyncStatus: "FAILED" },
      {
        settlementSyncStatus: "IN_PROGRESS",
        $or: [
          { settlementSyncLastAttemptAt: null },
          { settlementSyncLastAttemptAt: { $lte: staleBefore } },
        ],
      },
    ],
  })
    .select("_id")
    .lean();

  for (const candidate of candidates) {
    const cid = candidate._id.toString();
    if (skipClassIds.has(cid)) continue;

    const claimed = await Class.findOneAndUpdate(
      {
        _id: candidate._id,
        status: "COMPLETED",
        $or: [
          { settlementSyncStatus: "FAILED" },
          {
            settlementSyncStatus: "IN_PROGRESS",
            $or: [
              { settlementSyncLastAttemptAt: null },
              { settlementSyncLastAttemptAt: { $lte: staleBefore } },
            ],
          },
        ],
      },
      {
        $set: {
          settlementSyncStatus: "IN_PROGRESS",
          settlementSyncLastAttemptAt: now,
        },
      },
      { returnDocument: "after" }
    );
    if (!claimed) continue;

    await syncClassSettlementWithTracking(candidate._id, now);
  }
};

/**
 * IN_PROGRESS → COMPLETED when every Session is final and the class period is over (endDate, or the last Session's
 * end when no endDate is set). Completing a class atomically updates Class, CONFIRMED Enrollments, and legacy
 * (settlementHoldRequired === false) TeacherEarnings inside a MongoDB Replica Set transaction.
 *
 * V3 Settlement Guard (GAP-P0-05 / PR3 Section 4.8):
 * Earnings created under the V3 payment dispatch pipeline (or missing the flag, fail-closed default true)
 * MUST NOT be auto-released to `AVAILABLE` upon class completion; they remain `PENDING` until PR7's 7-day
 * maturity evaluation and verified absence of incidents, makeup sessions, and disputes.
 */
const completeFinishedClasses = async (now = new Date()) => {
  const running = await Class.find({ status: "IN_PROGRESS", ...NOT_DELETED })
    .select("_id endDate teacherId className")
    .lean();
  const completed = [];
  for (const cls of running) {
    const sessions = await Session.find({ classId: cls._id }).select("status roomState endDatetime").lean();
    if (!sessions.length || !sessions.every(isTerminalSession)) continue;

    const lastEnd = Math.max(...sessions.map((s) => new Date(s.endDatetime).getTime()));
    const periodEnd = cls.endDate ? new Date(cls.endDate).getTime() : lastEnd;
    if (periodEnd > now.getTime()) continue;

    let didComplete = false;
    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        didComplete = false;
        const res = await Class.updateOne(
          { _id: cls._id, status: "IN_PROGRESS" },
          {
            $set: {
              status: "COMPLETED",
              completedAt: now,
              settlementSyncStatus: "IN_PROGRESS",
              settlementSyncLastAttemptAt: now,
              settlementSyncError: null,
            },
          },
          { session: dbSession }
        );
        if (res.modifiedCount !== 1) return;

        await Enrollment.updateMany(
          { classId: cls._id, enrollmentStatus: "CONFIRMED" },
          { $set: { enrollmentStatus: "COMPLETED" } },
          { session: dbSession }
        );
        // Only explicit legacy records with `settlementHoldRequired: false` auto-release here.
        // V3 earnings (`settlementHoldRequired: true` or omitted) remain `PENDING` for PR7 7-day hold.
        await TeacherEarning.updateMany(
          { classId: cls._id, status: "PENDING", settlementHoldRequired: false },
          { $set: { status: "AVAILABLE" } },
          { session: dbSession }
        );
        didComplete = true;
      });
    } finally {
      await dbSession.endSession();
    }

    if (!didComplete) continue;

    await syncClassSettlementWithTracking(cls._id, now);

    await notify(
      cls.teacherId,
      "Lớp học đã hoàn thành",
      `Lớp "${cls.className}" đã kết thúc. Thu nhập của lớp đã sẵn sàng để quyết toán.`,
      "CLASS_COMPLETED"
    );
    completed.push(cls._id.toString());
  }

  await retryPendingClassSettlements(now, new Set(completed));
  return completed;
};

const advanceClassStatuses = async (now = new Date()) => ({
  started: await startClassesThatBegan(),
  completed: await completeFinishedClasses(now),
});

module.exports = {
  advanceClassStatuses,
  startClassesThatBegan,
  completeFinishedClasses,
  retryPendingClassSettlements,
  isTerminalSession,
};
