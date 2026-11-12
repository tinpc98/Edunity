const mongoose = require("mongoose");
const { runExclusive } = require("./jobLock");
const { evaluateAllPendingSettlements } = require("../services/settlementService");

const JOB_NAME = "financialSettlementJob";
const DEFAULT_INTERVAL_MS = 60 * 1000; // 1 minute
const LOCK_TTL_MS = 45 * 1000;

let settlementTimer = null;
let isTickInProgress = false;

const jobState = {
  isEnabled: false,
  isRunning: false,
  intervalMs: DEFAULT_INTERVAL_MS,
  startedAt: null,
  stoppedAt: null,
  lastRunAt: null,
  lastSuccessAt: null,
  lastRunStatus: "IDLE",
  lastError: null,
  totalRuns: 0,
  totalSettled: 0,
  totalHeld: 0,
};

function resolveSettlementConfig(overrides = {}) {
  const rawEnabled =
    overrides.enabled !== undefined
      ? overrides.enabled
      : process.env.ENABLE_FINANCIAL_SETTLEMENT_JOB;
  const isEnabled =
    rawEnabled === true ||
    String(rawEnabled || "").trim().toLowerCase() === "true";

  const parsedInterval = Number(
    overrides.intervalMs !== undefined
      ? overrides.intervalMs
      : process.env.FINANCIAL_SETTLEMENT_INTERVAL_MS
  );
  const intervalMs =
    Number.isFinite(parsedInterval) && parsedInterval >= 5000
      ? parsedInterval
      : DEFAULT_INTERVAL_MS;

  return { isEnabled, intervalMs };
}

async function runSettlementTick(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();

  if (mongoose.connection.readyState !== 1) {
    return { skipped: true, reason: "DB_NOT_CONNECTED" };
  }

  if (isTickInProgress) {
    return { status: "SKIPPED_LOCK_BUSY", skipped: true, reason: "OVERLAPPING_TICK" };
  }

  isTickInProgress = true;
  jobState.lastRunAt = now;
  jobState.totalRuns += 1;

  try {
    const result = await runExclusive(JOB_NAME, LOCK_TTL_MS, async () => {
      const evaluationResults = await evaluateAllPendingSettlements({ now });
      const settled = evaluationResults.filter((r) => r.status === "AVAILABLE").length;
      const held = evaluationResults.filter((r) => r.status === "PENDING").length;

      jobState.totalSettled += settled;
      jobState.totalHeld += held;
      jobState.lastSuccessAt = new Date();
      jobState.lastRunStatus = "SUCCESS";
      jobState.lastError = null;

      return {
        totalEvaluated: evaluationResults.length,
        settled,
        held,
        timestamp: now,
      };
    });

    if (!result) {
      jobState.lastRunStatus = "LOCK_BUSY";
      return { status: "SKIPPED_LOCK_BUSY", skipped: true, reason: "LOCK_BUSY" };
    }

    return { status: "SUCCESS", executed: true, summary: result };
  } catch (err) {
    jobState.lastRunStatus = "ERROR";
    jobState.lastError = err.message || String(err);
    return { status: "ERROR", executed: false, error: jobState.lastError };
  } finally {
    isTickInProgress = false;
  }
}

function startFinancialSettlementJob(options = {}) {
  const config = resolveSettlementConfig(options);
  jobState.isEnabled = config.isEnabled;
  jobState.intervalMs = config.intervalMs;

  if (!config.isEnabled) {
    return { started: false, reason: "DISABLED_BY_CONFIG", status: getSettlementJobStatus() };
  }

  if (settlementTimer) {
    return { started: false, reason: "ALREADY_RUNNING", status: getSettlementJobStatus() };
  }

  jobState.isRunning = true;
  jobState.startedAt = new Date();
  jobState.stoppedAt = null;

  settlementTimer = setInterval(() => {
    runSettlementTick().catch(() => {});
  }, config.intervalMs);

  if (typeof settlementTimer.unref === "function") {
    settlementTimer.unref();
  }

  return { started: true, reason: "STARTED", status: getSettlementJobStatus() };
}

function stopFinancialSettlementJob() {
  if (settlementTimer) {
    clearInterval(settlementTimer);
    settlementTimer = null;
  }
  jobState.isRunning = false;
  jobState.stoppedAt = new Date();
  return getSettlementJobStatus();
}

function getSettlementJobStatus() {
  return {
    jobName: JOB_NAME,
    isEnabled: jobState.isEnabled,
    isRunning: jobState.isRunning,
    isTickInProgress,
    intervalMs: jobState.intervalMs,
    startedAt: jobState.startedAt,
    stoppedAt: jobState.stoppedAt,
    lastRunAt: jobState.lastRunAt,
    lastSuccessAt: jobState.lastSuccessAt,
    lastRunStatus: jobState.lastRunStatus,
    lastError: jobState.lastError,
    totalRuns: jobState.totalRuns,
    totalSettled: jobState.totalSettled,
    totalHeld: jobState.totalHeld,
  };
}

module.exports = {
  JOB_NAME,
  startFinancialSettlementJob,
  stopFinancialSettlementJob,
  runSettlementTick,
  runSettlementJobTick: runSettlementTick,
  getSettlementJobStatus,
  resolveSettlementConfig,
};

