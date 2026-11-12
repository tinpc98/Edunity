const crypto = require("crypto");
const os = require("os");
const JobLock = require("../models/JobLock");

const INSTANCE_ID = `${os.hostname()}:${process.pid}:${crypto.randomBytes(4).toString("hex")}`;

/**
 * Takes the lease `name` for `ttlMs` if it is free or expired. Returns true when this instance holds it.
 * Two instances racing for a free lease: the unique index on `name` lets exactly one upsert win.
 */
const acquire = async (name, ttlMs, instanceId = INSTANCE_ID) => {
  const now = new Date();
  try {
    const lock = await JobLock.findOneAndUpdate(
      { name, $or: [{ lockedUntil: { $lte: now } }, { owner: instanceId }] },
      { $set: { owner: instanceId, lockedUntil: new Date(now.getTime() + ttlMs) } },
      { upsert: true, returnDocument: "after" }
    ).lean();
    return Boolean(lock && lock.owner === instanceId);
  } catch (err) {
    if (err && err.code === 11000) return false; // another instance holds a live lease
    throw err;
  }
};

const extend = async (name, ttlMs, instanceId = INSTANCE_ID) => {
  const now = new Date();
  const res = await JobLock.updateOne(
    { name, owner: instanceId, lockedUntil: { $gt: now } },
    { $set: { lockedUntil: new Date(now.getTime() + ttlMs) } }
  );
  return res.modifiedCount === 1;
};

const release = async (name, instanceId = INSTANCE_ID) => {
  const res = await JobLock.updateOne(
    { name, owner: instanceId },
    { $set: { lockedUntil: new Date(0) } }
  );
  return res.modifiedCount === 1;
};

/**
 * Runs `task` only if this instance obtains the lease. Errors are logged, never thrown into node-cron.
 * Supports optional lease heartbeat renewal via `options.heartbeatIntervalMs` so long-running jobs
 * do not lose their distributed lease prematurely.
 */
const runExclusive = async (name, ttlMs, task, instanceId = INSTANCE_ID, options = {}) => {
  let acquired = false;
  let heartbeatTimer = null;
  try {
    acquired = await acquire(name, ttlMs, instanceId);
    if (!acquired) return { skipped: true, reason: "LOCKED_BY_OTHER_INSTANCE" };

    const heartbeatMs = Number(options.heartbeatIntervalMs);
    if (Number.isFinite(heartbeatMs) && heartbeatMs > 0) {
      heartbeatTimer = setInterval(() => {
        extend(name, ttlMs, instanceId).catch((err) => {
          console.error(`[${name}] lease heartbeat failed:`, err.message);
        });
      }, heartbeatMs);
      if (typeof heartbeatTimer.unref === "function") heartbeatTimer.unref();
    }

    return await task();
  } catch (err) {
    console.error(`[${name}] job failed:`, err.message);
    return { skipped: false, error: err.message };
  } finally {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
    if (acquired) {
      await release(name, instanceId).catch(() => {});
    }
  }
};

module.exports = { acquire, extend, release, runExclusive, INSTANCE_ID };
