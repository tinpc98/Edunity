const crypto = require("crypto");
const os = require("os");
const JobLock = require("../models/JobLock");

const INSTANCE_ID = `${os.hostname()}:${process.pid}:${crypto.randomBytes(4).toString("hex")}`;

/**
 * Takes the lease `name` for `ttlMs` if it is free or expired. Returns true when this instance holds it.
 * Two instances racing for a free lease: the unique index on `name` lets exactly one upsert win.
 */
const acquire = async (name, ttlMs) => {
  const now = new Date();
  try {
    const lock = await JobLock.findOneAndUpdate(
      { name, $or: [{ lockedUntil: { $lte: now } }, { owner: INSTANCE_ID }] },
      { $set: { owner: INSTANCE_ID, lockedUntil: new Date(now.getTime() + ttlMs) } },
      { upsert: true, returnDocument: "after" }
    ).lean();
    return Boolean(lock && lock.owner === INSTANCE_ID);
  } catch (err) {
    if (err && err.code === 11000) return false; // another instance holds a live lease
    throw err;
  }
};

const release = async (name) => {
  await JobLock.updateOne({ name, owner: INSTANCE_ID }, { $set: { lockedUntil: new Date(0) } });
};

/**
 * Runs `task` only if this instance obtains the lease. Errors are logged, never thrown into node-cron.
 */
const runExclusive = async (name, ttlMs, task) => {
  let acquired = false;
  try {
    acquired = await acquire(name, ttlMs);
    if (!acquired) return { skipped: true, reason: "LOCKED_BY_OTHER_INSTANCE" };
    return await task();
  } catch (err) {
    console.error(`[${name}] job failed:`, err.message);
    return { skipped: false, error: err.message };
  } finally {
    if (acquired) {
      await release(name).catch(() => {});
    }
  }
};

module.exports = { acquire, release, runExclusive, INSTANCE_ID };
