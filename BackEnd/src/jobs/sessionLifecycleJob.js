const cron = require("node-cron");
const { Session } = require("../models");
const presenceService = require("../services/sessionPresenceService");
const incidentService = require("../services/sessionIncidentService");
const { runExclusive } = require("./jobLock");

let isRunning = false;

/**
 * DB-backed idempotent scheduler job for Smart Classroom Lifecycle (TIN-05D + TIN-05E).
 * Handles:
 * 1. Pre-open waiting room transition at startDatetime - 10 minutes
 * 2. Official start evaluation at startDatetime
 * 3. Teacher lateness milestones (+10m YELLOW, +20m RED, +30m NO_SHOW auto-cancellation)
 * 4. Teacher 30-minute continuous absence detection (INTERRUPTED / TEACHER_LEFT_EARLY)
 * 5. Teacher overtime reminder after endDatetime
 * 6. Safe AUTO_COMPLETED after endDatetime + 30 minutes grace period
 * 7. Finalizing expired 24h incident-report windows for TeacherViolation
 */
const runSessionLifecycleJob = async (referenceNow = new Date()) => {
  if (isRunning) {
    return { skipped: true };
  }
  isRunning = true;

  const now = referenceNow instanceof Date ? referenceNow : new Date(referenceNow);
  const preOpenHorizon = new Date(now.getTime() + presenceService.PRE_OPEN_BEFORE_MS);
  const processedSessionIds = [];

  try {
    const candidateSessions = await Session.find({
      status: { $in: ["SCHEDULED", "WAITING", "IN_PROGRESS", "INTERRUPTED"] },
      // An INTERRUPTED session that has been closed out keeps its status for the incident record but is final:
      // re-evaluating it every minute would only repeat side effects and starve newer sessions of the 200 slots.
      roomState: { $ne: "ENDED" },
      startDatetime: { $lte: preOpenHorizon },
    })
      .select("_id")
      .sort({ startDatetime: 1 })
      .limit(200)
      .lean();

    for (const s of candidateSessions) {
      try {
        await presenceService.evaluateSessionLifecycleAt(s._id, now);
        processedSessionIds.push(s._id.toString());
      } catch (sessionErr) {
        console.error(`[sessionLifecycleJob] Error evaluating session ${s._id}:`, sessionErr.message);
      }
    }

    const confirmedViolationIds = await incidentService.finalizeExpiredPendingViolations(now);

    return {
      skipped: false,
      evaluatedCount: processedSessionIds.length,
      processedSessionIds,
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
    runExclusive("sessionLifecycle", 55 * 1000, () => runSessionLifecycleJob());
  });
  console.log("Smart Session Lifecycle Job started.");
};

module.exports = {
  runSessionLifecycleJob,
  startSessionLifecycleJob,
};

