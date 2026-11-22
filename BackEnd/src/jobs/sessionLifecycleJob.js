const cron = require("node-cron");
const { Session } = require("../models");
const presenceService = require("../services/sessionPresenceService");
const incidentService = require("../services/sessionIncidentService");
const { runExclusive } = require("./jobLock");

let isRunning = false;

/**
 * DB-backed idempotent scheduler job for Smart Classroom Lifecycle (TIN-05D + TIN-05E).
 * Handles:
 * 1. Nothing before startDatetime: the room opens when the Teacher joins, teaching starts only on the Teacher's
 *    "Bắt đầu buổi học" — the job never pre-opens, auto-starts or sets LIVE
 * 2. Official start evaluation at startDatetime (lateness is measured; no auto-start)
 * 3. Teacher lateness milestones (+10m YELLOW, +20m RED, +30m NO_SHOW auto-cancellation)
 * 4. Teacher 30-minute continuous absence detection (INTERRUPTED / TEACHER_LEFT_EARLY)
 * 5. Teacher overtime reminder after endDatetime
 * 6. Auto-end of a started Session after endDatetime + 30 minutes (AUTO_ENDED_AFTER_GRACE_PERIOD), regardless of
 *    presence; a Session the Teacher never started is never auto-completed
 * 7. Closing presence intervals without a heartbeat, and retrying LiveKit room cleanups that failed
 * 8. Finalizing expired 24h incident-report windows for TeacherViolation
 */
const runSessionLifecycleJob = async (referenceNow = new Date()) => {
  if (isRunning) {
    return { skipped: true };
  }
  isRunning = true;

  const now = referenceNow instanceof Date ? referenceNow : new Date(referenceNow);
  const startedAt = Date.now();
  const processedSessionIds = [];
  const autoEndedSessionIds = [];
  let errorCount = 0;

  try {
    // Every candidate leaves this set on its own: a started Session is auto-ended at endDatetime + 30m, a Session not
    // started is cancelled at +30m (NO_SHOW) or drops out once its grace period is over. So the set stays small and
    // no hard cap is needed (a cap sorted oldest-first let stuck Sessions starve every newer one).
    const graceStart = new Date(now.getTime() - presenceService.POST_END_GRACE_PERIOD_MS);
    const candidateSessions = await Session.find({
      // An INTERRUPTED session that has been closed out keeps its status for the incident record but is final
      roomState: { $ne: "ENDED" },
      startDatetime: { $lte: now },
      $or: [
        { status: { $in: ["IN_PROGRESS", "INTERRUPTED"] } },
        { status: { $in: ["SCHEDULED", "WAITING"] }, endDatetime: { $gte: graceStart } },
      ],
    })
      .select("_id status")
      .sort({ endDatetime: 1, _id: 1 })
      .lean();

    for (const s of candidateSessions) {
      try {
        const result = await presenceService.evaluateSessionLifecycleAt(s._id, now);
        processedSessionIds.push(s._id.toString());
        if (result && result.autoEnded) autoEndedSessionIds.push(s._id.toString());
      } catch (sessionErr) {
        errorCount += 1;
        console.error(`[sessionLifecycleJob] Error evaluating session ${s._id}:`, sessionErr.message);
      }
    }

    const cleanup = await presenceService.retryPendingRoomCleanups();
    const confirmedViolationIds = await incidentService.finalizeExpiredPendingViolations(now);

    if (candidateSessions.length || cleanup.retried || errorCount) {
      console.log(
        `[sessionLifecycleJob] checked=${candidateSessions.length} evaluated=${processedSessionIds.length} autoEnded=${autoEndedSessionIds.length} errors=${errorCount} roomCleanupRetried=${cleanup.retried} roomCleanupPending=${cleanup.stillPending} in ${Date.now() - startedAt}ms`
      );
    }

    return {
      skipped: false,
      evaluatedCount: processedSessionIds.length,
      processedSessionIds,
      autoEndedSessionIds,
      errorCount,
      roomCleanup: cleanup,
      confirmedViolationCount: confirmedViolationIds.length,
    };
  } catch (err) {
    console.error("[sessionLifecycleJob] Unexpected error:", err.message);
    return { skipped: false, error: err.message };
  } finally {
    isRunning = false;
  }
};

const startSessionLifecycleJob = () => {
  // Run every minute to evaluate session lifecycle milestones
  cron.schedule("* * * * *", () => {
    // With several backend instances only one runs the job (H03)
    // The lease is extended while a long run is still working, so a second instance never overlaps it
    runExclusive("sessionLifecycle", 55 * 1000, () => runSessionLifecycleJob(), undefined, { heartbeatIntervalMs: 20 * 1000 });
  });
  console.log("Smart Session Lifecycle Job started.");
};

module.exports = {
  runSessionLifecycleJob,
  startSessionLifecycleJob,
};

