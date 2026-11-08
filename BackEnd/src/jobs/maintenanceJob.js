const cron = require("node-cron");
const { runExclusive } = require("./jobLock");
const { advanceClassStatuses } = require("../services/classLifecycleService");
const { expireScholarships } = require("../services/scholarshipExpiryService");
const { expireOldRecordings, failStaleProcessingRecordings } = require("../services/recordingMaintenanceService");

let isRunning = false;

/**
 * Low-frequency housekeeping. Each step is independent: one failing does not skip the others.
 * - Class lifecycle: OPEN → IN_PROGRESS → COMPLETED (+ enrollments COMPLETED, earnings AVAILABLE)
 * - Scholarship expiry: ACTIVE → EXPIRED, unused balance back to the Campaign fund
 * - Recording retention and PROCESSING timeout
 */
const runMaintenanceJob = async (now = new Date()) => {
  if (isRunning) {
    return { skipped: true, reason: "LOCAL_EXECUTION_IN_PROGRESS" };
  }
  isRunning = true;

  try {
    const result = {};
    const steps = {
      classes: () => advanceClassStatuses(now),
      scholarships: () => expireScholarships(now),
      expiredRecordings: () => expireOldRecordings(now),
      staleRecordings: () => failStaleProcessingRecordings(now),
    };
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
    runExclusive("maintenance", 4 * 60 * 1000, () => runMaintenanceJob());
  });
  console.log("Maintenance Job started.");
};

module.exports = { runMaintenanceJob, startMaintenanceJob };
