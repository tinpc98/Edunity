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
 * FIX-02 (BE-02-FIX-05): Transactional Lock Fencing against MongoDB.
 * Under MongoDB Snapshot Isolation, reading a document within a transaction can read
 * a stale snapshot without detecting concurrent modifications unless a write lock is taken.
 * When `session` is provided, this function performs an atomic `findOneAndUpdate` that increments
 * `fencingToken`, acquiring an exclusive write lock on the `JobLock` document for the transaction.
 * If another worker acquired the lock or if the lease expired, the update returns null, guaranteeing
 * that a stale/expired worker cannot commit.
 */
const verifyOwnership = async (name, instanceId = INSTANCE_ID, session = null) => {
  const now = new Date();
  if (session) {
    const lock = await JobLock.findOneAndUpdate(
      {
        name,
        owner: instanceId,
        lockedUntil: { $gt: now },
      },
      {
        $inc: { fencingToken: 1 },
      },
      { session, returnDocument: "after" }
    ).lean();
    return Boolean(lock);
  }

  const query = JobLock.findOne({
    name,
    owner: instanceId,
    lockedUntil: { $gt: now },
  });
  const lock = await query.lean();
  return Boolean(lock);
};

/**
 * Runs `task` only if this instance obtains the lease. Errors are logged, never thrown into node-cron.
 * Supports optional lease heartbeat renewal via `options.heartbeatIntervalMs` so long-running jobs
 * do not lose their distributed lease prematurely.
 *
 * FIX-02 & FIX-03:
 * - Detects when extend() returns false or throws, marking the lease as lost immediately.
 * - Prevents overlapping heartbeat timer executions.
 * - Passes `lockContext` to `task(lockContext)` so callers can inspect lease health.
 * - Fencing & DB ownership verification via `verifyOwnership(session)`.
 * - Only releases lock if acquired and still held by this instance.
 */
const runExclusive = async (name, ttlMs, task, instanceId = INSTANCE_ID, options = {}) => {
  let acquired = false;
  let leaseActive = false;
  let lostReason = null;
  let inFlightHeartbeat = false;
  let heartbeatTimer = null;

  const lockContext = {
    name,
    instanceId,
    isLeaseActive: () => leaseActive,
    checkLeaseOrThrow: () => {
      if (!leaseActive) {
        throw new Error(
          `[${name}] Distributed lock lease lost by instance ${instanceId}: ${lostReason || "UNKNOWN"}`
        );
      }
    },
    verifyOwnership: async (session = null) => {
      if (!leaseActive) return false;
      const isOwner = await verifyOwnership(name, instanceId, session);
      if (!isOwner) {
        leaseActive = false;
        lostReason = "FENCING_OWNERSHIP_VERIFICATION_FAILED";
        return false;
      }
      return true;
    },
    getLeaseState: () => ({
      active: leaseActive,
      lostReason,
    }),
  };

  try {
    acquired = await acquire(name, ttlMs, instanceId);
    if (!acquired) return { skipped: true, reason: "LOCKED_BY_OTHER_INSTANCE" };

    leaseActive = true;

    const heartbeatMs = Number(options.heartbeatIntervalMs);
    if (Number.isFinite(heartbeatMs) && heartbeatMs > 0) {
      heartbeatTimer = setInterval(async () => {
        // Prevent overlapping heartbeats or execution after lease lost
        if (inFlightHeartbeat || !leaseActive) return;
        inFlightHeartbeat = true;
        try {
          const extended = await extend(name, ttlMs, instanceId);
          if (!extended) {
            leaseActive = false;
            lostReason = "LEASE_NOT_EXTENDED";
            console.warn(
              `[${name}] lease heartbeat returned false; lease lost by instance ${instanceId}`
            );
            if (heartbeatTimer) clearInterval(heartbeatTimer);
          }
        } catch (err) {
          leaseActive = false;
          lostReason = `HEARTBEAT_ERROR: ${err.message}`;
          console.error(`[${name}] lease heartbeat failed with error:`, err.message);
          if (heartbeatTimer) clearInterval(heartbeatTimer);
        } finally {
          inFlightHeartbeat = false;
        }
      }, heartbeatMs);
      if (typeof heartbeatTimer.unref === "function") heartbeatTimer.unref();
    }

    return await task(lockContext);
  } catch (err) {
    console.error(`[${name}] job failed:`, err.message);
    return { skipped: false, error: err.message };
  } finally {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
    if (acquired && leaseActive) {
      await release(name, instanceId).catch(() => {});
    }
  }
};

module.exports = { acquire, extend, release, verifyOwnership, runExclusive, INSTANCE_ID };
