const os = require("os");
const crypto = require("crypto");
const mongoose = require("mongoose");
const TokenRevocationTask = require("../models/TokenRevocationTask");
const RefreshToken = require("../models/RefreshToken");
const authTokenService = require("./authTokenService");

const DEFAULT_LEASE_MS = 30 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BATCH_SIZE = 25;

const generateWorkerId = () =>
  `${os.hostname()}:${process.pid}:${crypto.randomBytes(4).toString("hex")}`;

/**
 * Creates a durable revocation task within an ongoing MongoDB transaction (or standalone).
 */
const recordRevocationTask = async (
  { userId, targetStatus, reason, revokeBefore = new Date(), maxAttempts = DEFAULT_MAX_ATTEMPTS },
  session = null
) => {
  const options = session ? { session } : {};
  const [task] = await TokenRevocationTask.create(
    [
      {
        userId,
        targetStatus,
        reason: reason || null,
        revokeBefore,
        status: "PENDING",
        nextRunAt: new Date(),
        attempts: 0,
        maxAttempts,
      },
    ],
    options
  );
  return task;
};

/**
 * Atomically claims one eligible pending task for processing using a lease.
 * Safe across concurrent workers and processes.
 */
const claimNextPendingTask = async (
  now = new Date(),
  leaseMs = DEFAULT_LEASE_MS,
  workerId = null
) => {
  const worker = workerId || generateWorkerId();
  return await TokenRevocationTask.findOneAndUpdate(
    {
      status: { $in: ["PENDING", "PROCESSING"] },
      nextRunAt: { $lte: now },
      $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
    },
    {
      $set: {
        status: "PROCESSING",
        lockedUntil: new Date(now.getTime() + leaseMs),
        lockedBy: worker,
      },
    },
    { returnDocument: "after" }
  );
};

/**
 * Processes a specific TokenRevocationTask.
 * Crucial safety guarantee: only revokes tokens issued/created at or before `revokeBefore`.
 * Tokens issued after account reactivation (with createdAt > revokeBefore) will NOT be revoked!
 */
const processTask = async (task) => {
  if (!task) return { success: false, error: new Error("Task not found") };
  if (task.status === "COMPLETED") {
    return { success: true, alreadyCompleted: true, task };
  }

  task.attempts = (task.attempts || 0) + 1;
  const cutoff = task.revokeBefore || task.createdAt || new Date();

  try {
    const filter = {
      userId: task.userId,
      $or: [{ createdAt: { $lte: cutoff } }, { issuedAt: { $lte: cutoff } }],
      revokedAt: null,
    };

    const res = await RefreshToken.updateMany(filter, { $set: { revokedAt: new Date() } });

    task.status = "COMPLETED";
    task.completedAt = new Date();
    task.revokedCount = res.modifiedCount;
    task.lockedUntil = null;
    task.lockedBy = null;
    task.lastError = null;
    await task.save();

    return {
      success: true,
      revokedCount: res.modifiedCount,
      task,
    };
  } catch (err) {
    const isExhausted = task.attempts >= (task.maxAttempts || DEFAULT_MAX_ATTEMPTS);
    const backoffMs = Math.min(60000, 1000 * Math.pow(2, Math.max(0, task.attempts - 1)));

    task.status = isExhausted ? "FAILED" : "PENDING";
    task.nextRunAt = new Date(Date.now() + backoffMs);
    task.lastError = err && err.message ? err.message : String(err);
    task.lockedUntil = null;
    task.lockedBy = null;
    await task.save();

    console.error(
      `[tokenRevocationService] Failed processing task ${task._id} (attempt ${task.attempts}/${task.maxAttempts}):`,
      task.lastError
    );

    return {
      success: false,
      error: err,
      exhausted: isExhausted,
      task,
    };
  }
};

/**
 * Processes any pending tasks for a given user immediately.
 * If no tasks exist (e.g. legacy records), performs direct safeRevokeAllForUser.
 */
const processPendingTasksForUser = async (userId) => {
  const pendingTasks = await TokenRevocationTask.find({
    userId,
    status: { $in: ["PENDING", "PROCESSING"] },
  });

  if (pendingTasks.length === 0) {
    return await authTokenService.safeRevokeAllForUser(userId);
  }

  let allSuccess = true;
  for (const task of pendingTasks) {
    const res = await processTask(task);
    if (!res.success) allSuccess = false;
  }

  return { success: allSuccess, processedTasks: pendingTasks.length };
};

/**
 * Sweeps and processes pending revocation tasks in batches.
 * Integrated with maintenanceJob and supports distributed locking.
 */
const runTokenRevocationSweep = async (now = new Date(), options = {}) => {
  const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
  const leaseMs = options.leaseMs || DEFAULT_LEASE_MS;
  const workerId = options.workerId || generateWorkerId();

  let scanned = 0;
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < batchSize; i++) {
    // Check distributed lease if provided
    if (
      options.lockContext &&
      typeof options.lockContext.isLeaseActive === "function" &&
      !options.lockContext.isLeaseActive()
    ) {
      console.warn("[tokenRevocationService] Aborting sweep because distributed lease was lost");
      break;
    }

    const task = await claimNextPendingTask(now, leaseMs, workerId);
    if (!task) break;

    scanned++;
    const res = await processTask(task);
    if (res.success) {
      processed++;
    } else {
      failed++;
    }
  }

  return {
    status: "COMPLETED",
    scanned,
    processed,
    failed,
    batchSize,
  };
};

module.exports = {
  recordRevocationTask,
  claimNextPendingTask,
  processTask,
  processPendingTasksForUser,
  runTokenRevocationSweep,
  generateWorkerId,
  DEFAULT_LEASE_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_BATCH_SIZE,
};
