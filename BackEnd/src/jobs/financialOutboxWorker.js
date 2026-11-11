const mongoose = require("mongoose");
const { runExclusive } = require("./jobLock");
const { runPendingDispatchWorker } = require("../services/financialDispatchService");

const JOB_NAME = "financialOutboxWorker";
const DEFAULT_INTERVAL_MS = 30 * 1000;
const DEFAULT_BATCH_SIZE = 25;
const MIN_INTERVAL_MS = 1000;

let outboxTimer = null;
let isTickInProgress = false;

const workerState = {
  isEnabled: false,
  isRunning: false,
  intervalMs: DEFAULT_INTERVAL_MS,
  batchSize: DEFAULT_BATCH_SIZE,
  startedAt: null,
  stoppedAt: null,
  lastRunAt: null,
  lastSuccessAt: null,
  lastRunStatus: "IDLE",
  lastError: null,
  lastSummary: null,
  totalRuns: 0,
  totalDispatched: 0,
  totalReconciled: 0,
  totalFailed: 0,
  backlogCount: 0,
  exhaustedCount: 0,
};

function resolveOutboxConfig(overrides = {}) {
  const rawEnabled =
    overrides.enabled !== undefined
      ? overrides.enabled
      : process.env.ENABLE_FINANCIAL_OUTBOX_WORKER;
  const isEnabled =
    rawEnabled === true ||
    String(rawEnabled || "")
      .trim()
      .toLowerCase() === "true";

  const parsedInterval = Number(
    overrides.intervalMs !== undefined
      ? overrides.intervalMs
      : process.env.FINANCIAL_OUTBOX_INTERVAL_MS
  );
  const intervalMs =
    Number.isFinite(parsedInterval) && parsedInterval >= MIN_INTERVAL_MS
      ? parsedInterval
      : DEFAULT_INTERVAL_MS;

  const parsedBatchSize = Number(
    overrides.batchSize !== undefined
      ? overrides.batchSize
      : process.env.FINANCIAL_OUTBOX_BATCH_SIZE
  );
  const batchSize =
    Number.isFinite(parsedBatchSize) && parsedBatchSize > 0
      ? Math.min(Math.floor(parsedBatchSize), 200)
      : DEFAULT_BATCH_SIZE;

  return {
    isEnabled,
    intervalMs,
    batchSize,
  };
}

/**
 * Executes a single tick of the Financial Outbox Recovery Worker.
 * Safe against:
 * - Unconnected MongoDB (readyState !== 1)
 * - Overlapping ticks in the same process (isTickInProgress)
 * - Concurrent ticks across multiple Node.js instances (JobLock runExclusive)
 * - Unhandled exceptions (caught and recorded in worker telemetry)
 */
async function runFinancialOutboxTick(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const cfg = resolveOutboxConfig(options);

  if (isTickInProgress) {
    workerState.lastRunAt = now;
    workerState.lastRunStatus = "SKIPPED_ALREADY_RUNNING_LOCAL";
    return {
      status: "SKIPPED_ALREADY_RUNNING_LOCAL",
      scanned: 0,
      dispatched: 0,
      reconciled: 0,
      failed: 0,
      skipped: 0,
      backlogCount: workerState.backlogCount,
      exhaustedCount: workerState.exhaustedCount,
    };
  }

  const dbState = options.readyState !== undefined ? options.readyState : (mongoose.connection ? mongoose.connection.readyState : 0);
  if (dbState !== 1) {
    workerState.lastRunAt = now;
    workerState.lastRunStatus = "SKIPPED_DB_NOT_READY";
    return {
      status: "SKIPPED_DB_NOT_READY",
      scanned: 0,
      dispatched: 0,
      reconciled: 0,
      failed: 0,
      skipped: 0,
      backlogCount: workerState.backlogCount,
      exhaustedCount: workerState.exhaustedCount,
    };
  }

  isTickInProgress = true;
  workerState.lastRunAt = now;
  workerState.totalRuns += 1;

  const lockTtlMs = Math.max(cfg.intervalMs * 2, 60 * 1000);

  try {
    const lockResult = await runExclusive(JOB_NAME, lockTtlMs, async () => {
      return await runPendingDispatchWorker({
        now,
        batchSize: cfg.batchSize,
        leaseMs: options.leaseMs,
        maxAttempts: options.maxAttempts,
      });
    });

    if (lockResult && lockResult.skipped && lockResult.reason === "LOCKED_BY_OTHER_INSTANCE") {
      workerState.lastRunStatus = "SKIPPED_DISTRIBUTED_LOCK_HELD";
      return {
        status: "SKIPPED_DISTRIBUTED_LOCK_HELD",
        scanned: 0,
        dispatched: 0,
        reconciled: 0,
        failed: 0,
        skipped: 0,
        backlogCount: workerState.backlogCount,
        exhaustedCount: workerState.exhaustedCount,
      };
    }

    const summary = lockResult;

    workerState.lastSuccessAt = new Date();
    workerState.lastRunStatus = summary ? summary.status || "COMPLETED" : "COMPLETED";
    workerState.lastError = null;
    workerState.lastSummary = summary
      ? {
          scanned: summary.scanned,
          dispatched: summary.dispatched,
          reconciled: summary.reconciled,
          failed: summary.failed,
          skipped: summary.skipped,
          backlogCount: summary.backlogCount,
          exhaustedCount: summary.exhaustedCount,
        }
      : null;

    if (summary) {
      workerState.totalDispatched += Number(summary.dispatched || 0);
      workerState.totalReconciled += Number(summary.reconciled || 0);
      workerState.totalFailed += Number(summary.failed || 0);
      workerState.backlogCount = Number(summary.backlogCount || 0);
      workerState.exhaustedCount = Number(summary.exhaustedCount || 0);
    }

    return summary;
  } catch (err) {
    const safeMsg = err && err.message ? String(err.message) : "Unknown outbox worker error";
    workerState.lastRunStatus = "ERROR";
    workerState.lastError = safeMsg;
    console.error(
      JSON.stringify({
        event: "FINANCIAL_OUTBOX_WORKER_TICK_ERROR",
        error: safeMsg,
        timestamp: new Date().toISOString(),
      })
    );
    return {
      status: "ERROR",
      error: safeMsg,
      scanned: 0,
      dispatched: 0,
      reconciled: 0,
      failed: 0,
      skipped: 0,
      backlogCount: workerState.backlogCount,
      exhaustedCount: workerState.exhaustedCount,
    };
  } finally {
    isTickInProgress = false;
  }
}

/**
 * Starts the Financial Outbox Recovery Worker background interval if enabled.
 * Safe against duplicate registration / hot reload (clears any previous timer first).
 */
function startFinancialOutboxWorker(options = {}) {
  const cfg = resolveOutboxConfig(options);
  workerState.isEnabled = cfg.isEnabled;
  workerState.intervalMs = cfg.intervalMs;
  workerState.batchSize = cfg.batchSize;

  if (outboxTimer) {
    clearInterval(outboxTimer);
    outboxTimer = null;
    workerState.isRunning = false;
  }

  if (!cfg.isEnabled) {
    workerState.lastRunStatus = "DISABLED";
    return {
      started: false,
      reason: "DISABLED_BY_CONFIG",
      status: getFinancialOutboxWorkerStatus(),
    };
  }

  outboxTimer = setInterval(() => {
    runFinancialOutboxTick({
      batchSize: cfg.batchSize,
      intervalMs: cfg.intervalMs,
    }).catch(() => {});
  }, cfg.intervalMs);

  if (outboxTimer && typeof outboxTimer.unref === "function") {
    outboxTimer.unref();
  }

  workerState.isRunning = true;
  workerState.startedAt = new Date();
  workerState.stoppedAt = null;
  if (workerState.lastRunStatus === "DISABLED") {
    workerState.lastRunStatus = "IDLE";
  }

  return {
    started: true,
    reason: "STARTED",
    status: getFinancialOutboxWorkerStatus(),
  };
}

/**
 * Stops the Financial Outbox Recovery Worker background interval cleanly.
 */
function stopFinancialOutboxWorker() {
  if (outboxTimer) {
    clearInterval(outboxTimer);
    outboxTimer = null;
  }
  workerState.isRunning = false;
  workerState.stoppedAt = new Date();
  return getFinancialOutboxWorkerStatus();
}

function getFinancialOutboxWorkerStatus() {
  return {
    jobName: JOB_NAME,
    isEnabled: workerState.isEnabled,
    isRunning: workerState.isRunning,
    isTickInProgress,
    intervalMs: workerState.intervalMs,
    batchSize: workerState.batchSize,
    startedAt: workerState.startedAt,
    stoppedAt: workerState.stoppedAt,
    lastRunAt: workerState.lastRunAt,
    lastSuccessAt: workerState.lastSuccessAt,
    lastRunStatus: workerState.lastRunStatus,
    lastError: workerState.lastError,
    lastSummary: workerState.lastSummary,
    totalRuns: workerState.totalRuns,
    totalDispatched: workerState.totalDispatched,
    totalReconciled: workerState.totalReconciled,
    totalFailed: workerState.totalFailed,
    backlogCount: workerState.backlogCount,
    exhaustedCount: workerState.exhaustedCount,
  };
}

module.exports = {
  JOB_NAME,
  startFinancialOutboxWorker,
  stopFinancialOutboxWorker,
  runFinancialOutboxTick,
  getFinancialOutboxWorkerStatus,
  resolveOutboxConfig,
};

