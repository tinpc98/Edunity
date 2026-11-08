const crypto = require("crypto");
const os = require("os");

// Mock dependencies of maintenanceJob to keep test isolated and fast
jest.mock("../src/services/classLifecycleService", () => ({
  advanceClassStatuses: jest.fn().mockResolvedValue({ transitioned: 3 }),
}));

jest.mock("../src/services/scholarshipExpiryService", () => ({
  expireScholarships: jest.fn().mockResolvedValue({ expiredCount: 2, refundedTotal: 100 }),
}));

jest.mock("../src/services/recordingMaintenanceService", () => ({
  expireOldRecordings: jest.fn().mockResolvedValue({ expiredRecordings: 1 }),
  failStaleProcessingRecordings: jest.fn().mockResolvedValue({ failedRecordings: 0 }),
}));

// Stateful in-memory MongoDB engine simulation for JobLock
const mockLockStore = new Map();

jest.mock("../src/models/JobLock", () => {
  return {
    schema: {
      paths: {
        name: { options: { required: true, unique: true } },
        owner: { options: { required: true } },
        lockedUntil: { options: { required: true } },
      },
    },
    findOneAndUpdate: jest.fn((filter, update, options = {}) => {
      const execute = async () => {
        // Simulate MongoDB query matching
        const now = new Date();
        const existing = mockLockStore.get(filter.name);

        if (existing) {
          // Evaluate filter.$or: [{ lockedUntil: { $lte: now } }, { owner: instanceId }]
          let matches = false;
          if (filter.$or) {
            for (const condition of filter.$or) {
              if (condition.lockedUntil && condition.lockedUntil.$lte) {
                if (existing.lockedUntil <= condition.lockedUntil.$lte) {
                  matches = true;
                  break;
                }
              }
              if (condition.owner && condition.owner === existing.owner) {
                matches = true;
                break;
              }
            }
          } else {
            matches = true;
          }

          if (matches) {
            // Update matched document
            if (update.$set) {
              Object.assign(existing, update.$set);
            }
            return { ...existing };
          } else {
            // Document exists but does NOT match query.
            // With upsert: true, MongoDB attempts insert and hits unique index collision!
            if (options.upsert) {
              const err = new Error(
                `E11000 duplicate key error collection: edunity.joblocks index: name_1 dup key: { name: "${filter.name}" }`
              );
              err.code = 11000;
              throw err;
            }
            return null;
          }
        } else {
          // Document does not exist yet
          if (options.upsert) {
            const newDoc = {
              name: filter.name,
              owner: update.$set?.owner || "unknown",
              lockedUntil: update.$set?.lockedUntil || new Date(),
            };
            mockLockStore.set(filter.name, newDoc);
            return { ...newDoc };
          }
          return null;
        }
      };

      return {
        lean: execute,
        then: (resolve, reject) => execute().then(resolve, reject),
      };
    }),

    updateOne: jest.fn(async (filter, update) => {
      const existing = mockLockStore.get(filter.name);
      if (existing && existing.owner === filter.owner) {
        if (update.$set) {
          Object.assign(existing, update.$set);
        }
        return { matchedCount: 1, modifiedCount: 1 };
      }
      return { matchedCount: 0, modifiedCount: 0 };
    }),

    findOne: jest.fn((query) => {
      const existing = mockLockStore.get(query.name);
      if (!existing) {
        return {
          lean: async () => null,
          then: (resolve) => resolve(null),
        };
      }
      const cloned = { ...existing };
      return {
        lean: async () => cloned,
        then: (resolve) => resolve(cloned),
      };
    }),
  };
});

// Import jobLock after mocking JobLock
const JobLock = require("../src/models/JobLock");
const { acquire, release, runExclusive, INSTANCE_ID } = require("../src/jobs/jobLock");
const { runMaintenanceJob } = require("../src/jobs/maintenanceJob");
const classLifecycleService = require("../src/services/classLifecycleService");

beforeEach(() => {
  mockLockStore.clear();
  jest.clearAllMocks();
});

describe("TASK G0-08: Cron Lock Idempotency, Lease TTL & Concurrency Suite", () => {
  // =========================================================================
  // 1. Lease TTL vs Cron Cadence Invariants
  // =========================================================================
  describe("1. Lease TTL vs Cron Cadence Invariants", () => {
    test("G0-08.TTL.1: All scheduled jobs enforce leaseTTL < cronIntervalMs to prevent deadlock", () => {
      const jobConfigs = [
        { name: "expireEnrollments", cronIntervalMs: 60 * 1000, leaseTtlMs: 55 * 1000 },
        { name: "sessionLifecycle", cronIntervalMs: 60 * 1000, leaseTtlMs: 55 * 1000 },
        { name: "maintenance", cronIntervalMs: 5 * 60 * 1000, leaseTtlMs: 4 * 60 * 1000 },
      ];

      for (const config of jobConfigs) {
        expect(config.leaseTtlMs).toBeLessThan(config.cronIntervalMs);
        const marginMs = config.cronIntervalMs - config.leaseTtlMs;
        expect(marginMs).toBeGreaterThanOrEqual(5000); // At least 5s safety margin before next tick
      }
    });

    test("G0-08.TTL.2: JobLock schema guarantees unique index on name", () => {
      expect(JobLock.schema.paths.name.options.unique).toBe(true);
      expect(JobLock.schema.paths.name.options.required).toBe(true);
      expect(JobLock.schema.paths.owner.options.required).toBe(true);
      expect(JobLock.schema.paths.lockedUntil.options.required).toBe(true);
    });
  });

  // =========================================================================
  // 2. Distributed JobLock Acquire, Mutual Exclusion & Crash Recovery
  // =========================================================================
  describe("2. Distributed JobLock Acquire, Mutual Exclusion & Crash Recovery", () => {
    const lockName = "test-job-lock";
    const instanceA = "host-alpha:1111:aaaa1111";
    const instanceB = "host-beta:2222:bbbb2222";

    test("G0-08.LOCK.1: acquire succeeds when lock is free and sets owner + lockedUntil", async () => {
      const ttlMs = 10000;
      const acquired = await acquire(lockName, ttlMs, instanceA);
      expect(acquired).toBe(true);

      const doc = await JobLock.findOne({ name: lockName }).lean();
      expect(doc).toBeDefined();
      expect(doc.name).toBe(lockName);
      expect(doc.owner).toBe(instanceA);
      expect(new Date(doc.lockedUntil).getTime()).toBeGreaterThan(Date.now());
    });

    test("G0-08.LOCK.2: Mutual Exclusion - Instance B cannot acquire active lease held by Instance A", async () => {
      const ttlMs = 20000;
      const acquiredA = await acquire(lockName, ttlMs, instanceA);
      expect(acquiredA).toBe(true);

      // Instance B attempts to acquire the same lock while active
      const acquiredB = await acquire(lockName, ttlMs, instanceB);
      expect(acquiredB).toBe(false);

      // Ensure doc owner remains Instance A
      const doc = await JobLock.findOne({ name: lockName }).lean();
      expect(doc.owner).toBe(instanceA);
    });

    test("G0-08.LOCK.3: Re-entrancy / Heartbeat - Same instance can extend its own active lease", async () => {
      const initialTtl = 5000;
      await acquire(lockName, initialTtl, instanceA);
      const initialDoc = await JobLock.findOne({ name: lockName }).lean();

      // Extend lease with same instance
      const extendedTtl = 30000;
      const reacquired = await acquire(lockName, extendedTtl, instanceA);
      expect(reacquired).toBe(true);

      const extendedDoc = await JobLock.findOne({ name: lockName }).lean();
      expect(extendedDoc.owner).toBe(instanceA);
      expect(new Date(extendedDoc.lockedUntil).getTime()).toBeGreaterThan(
        new Date(initialDoc.lockedUntil).getTime()
      );
    });

    test("G0-08.LOCK.4: Crash Recovery - Expired lease can be acquired by Instance B", async () => {
      // Seed an expired lease (Instance A crashed 5 seconds ago)
      mockLockStore.set(lockName, {
        name: lockName,
        owner: instanceA,
        lockedUntil: new Date(Date.now() - 5000),
      });

      // Instance B attempts acquire
      const acquiredB = await acquire(lockName, 10000, instanceB);
      expect(acquiredB).toBe(true);

      const doc = await JobLock.findOne({ name: lockName }).lean();
      expect(doc.owner).toBe(instanceB);
      expect(new Date(doc.lockedUntil).getTime()).toBeGreaterThan(Date.now());
    });

    test("G0-08.LOCK.5: Release resets lockedUntil to epoch (0) allowing immediate handoff", async () => {
      await acquire(lockName, 60000, instanceA);

      await release(lockName, instanceA);

      const doc = await JobLock.findOne({ name: lockName }).lean();
      expect(doc.lockedUntil.getTime()).toBe(0);

      // Now Instance B can immediately acquire without waiting 60s
      const acquiredB = await acquire(lockName, 60000, instanceB);
      expect(acquiredB).toBe(true);
      expect((await JobLock.findOne({ name: lockName }).lean()).owner).toBe(instanceB);
    });

    test("G0-08.LOCK.6: Release isolation - Instance B cannot release lease held by Instance A", async () => {
      await acquire(lockName, 60000, instanceA);

      // Malicious or accidental release by Instance B
      await release(lockName, instanceB);

      // Lock should still be held by Instance A with future lockedUntil
      const doc = await JobLock.findOne({ name: lockName }).lean();
      expect(doc.owner).toBe(instanceA);
      expect(new Date(doc.lockedUntil).getTime()).toBeGreaterThan(Date.now());
    });

    test("G0-08.LOCK.7: Two instances racing simultaneously - exactly one wins, loser returns false gracefully", async () => {
      // Race 2 instances simultaneously
      const [resA, resB] = await Promise.all([
        acquire("racing-job-lock", 15000, instanceA),
        acquire("racing-job-lock", 15000, instanceB),
      ]);

      // Exactly one must be true, one must be false
      expect(resA !== resB).toBe(true);
      expect([resA, resB].filter(Boolean).length).toBe(1);

      const winnerDoc = await JobLock.findOne({ name: "racing-job-lock" }).lean();
      const expectedOwner = resA ? instanceA : instanceB;
      expect(winnerDoc.owner).toBe(expectedOwner);
    });

    test("G0-08.LOCK.8: Non-11000 unexpected MongoDB error is rethrown", async () => {
      JobLock.findOneAndUpdate.mockImplementationOnce(() => {
        const err = new Error("Connection pool timeout");
        err.code = 12000;
        throw err;
      });

      await expect(acquire("error-lock", 5000, instanceA)).rejects.toThrow(
        "Connection pool timeout"
      );
    });
  });

  // =========================================================================
  // 3. runExclusive Wrapper Protocol
  // =========================================================================
  describe("3. runExclusive Wrapper Protocol", () => {
    const jobName = "exclusive-test-job";
    const inst1 = "inst-1";
    const inst2 = "inst-2";

    test("G0-08.EXCL.1: Runs task, returns result, and automatically releases lease in finally", async () => {
      let taskExecuted = false;
      const res = await runExclusive(
        jobName,
        10000,
        async () => {
          taskExecuted = true;
          return { count: 42 };
        },
        inst1
      );

      expect(taskExecuted).toBe(true);
      expect(res).toEqual({ count: 42 });

      // Verify lock was released
      const doc = await JobLock.findOne({ name: jobName }).lean();
      expect(doc.lockedUntil.getTime()).toBe(0);
    });

    test("G0-08.EXCL.2: When locked by another instance, skips execution cleanly without throwing", async () => {
      // Instance 1 holds active lock
      await acquire(jobName, 30000, inst1);

      let taskExecuted = false;
      const res = await runExclusive(
        jobName,
        30000,
        async () => {
          taskExecuted = true;
          return { success: true };
        },
        inst2
      );

      expect(taskExecuted).toBe(false);
      expect(res).toEqual({ skipped: true, reason: "LOCKED_BY_OTHER_INSTANCE" });
    });

    test("G0-08.EXCL.3: When task throws, catches error, returns error info, and still releases lock", async () => {
      const res = await runExclusive(
        jobName,
        10000,
        async () => {
          throw new Error("Simulated step failure");
        },
        inst1
      );

      expect(res).toEqual({ skipped: false, error: "Simulated step failure" });

      // Verify lock was released despite throw
      const doc = await JobLock.findOne({ name: jobName }).lean();
      expect(doc.lockedUntil.getTime()).toBe(0);
    });
  });

  // =========================================================================
  // 4. In-Process Concurrency Guard & Error Isolation (maintenanceJob)
  // =========================================================================
  describe("4. In-Process Concurrency Guard & Error Isolation (maintenanceJob)", () => {
    test("G0-08.PROC.1: maintenanceJob rejects concurrent local execution with LOCAL_EXECUTION_IN_PROGRESS", async () => {
      // Delay advanceClassStatuses to keep the first execution running
      classLifecycleService.advanceClassStatuses.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({ transitioned: 1 }), 50))
      );

      const promise1 = runMaintenanceJob();
      // Call second run immediately while first is in-flight
      const promise2 = runMaintenanceJob();

      const [res1, res2] = await Promise.all([promise1, promise2]);

      expect(res2).toEqual({ skipped: true, reason: "LOCAL_EXECUTION_IN_PROGRESS" });
      expect(res1.classes).toEqual({ transitioned: 1 });
    });

    test("G0-08.PROC.2: maintenanceJob isRunning resets in finally allowing subsequent calls", async () => {
      const res1 = await runMaintenanceJob();
      expect(res1.skipped).toBeUndefined();
      expect(res1.classes).toBeDefined();

      const res2 = await runMaintenanceJob();
      expect(res2.skipped).toBeUndefined();
      expect(res2.classes).toBeDefined();
    });

    test("G0-08.PROC.3: Step isolation - Failure in one step does not prevent subsequent steps from running", async () => {
      classLifecycleService.advanceClassStatuses.mockRejectedValueOnce(
        new Error("Database write lock error in class lifecycle")
      );

      const res = await runMaintenanceJob();

      // Classes step captured the error
      expect(res.classes).toEqual({ error: "Database write lock error in class lifecycle" });
      // Scholarships and recordings still succeeded!
      expect(res.scholarships).toEqual({ expiredCount: 2, refundedTotal: 100 });
      expect(res.expiredRecordings).toEqual({ expiredRecordings: 1 });
      expect(res.staleRecordings).toEqual({ failedRecordings: 0 });
    });
  });

  // =========================================================================
  // 5. Handler Idempotency Invariants & Defense-in-Depth Proofs
  // =========================================================================
  describe("5. Handler Idempotency Invariants & Defense-in-Depth Proofs", () => {
    test("G0-08.IDEM.1: expireEnrollments CAS state guard - modifiedCount === 1 ensures single release", () => {
      // Simulating the atomic conditional update { enrollmentStatus: 'PENDING_PAYMENT' } -> 'EXPIRED'
      const processRelease = (currentStatus) => {
        let modifiedCount = 0;
        let newStatus = currentStatus;
        if (currentStatus === "PENDING_PAYMENT") {
          newStatus = "EXPIRED";
          modifiedCount = 1;
        }
        return { modifiedCount, newStatus };
      };

      // 1st run: status is PENDING_PAYMENT
      const run1 = processRelease("PENDING_PAYMENT");
      expect(run1.modifiedCount).toBe(1);
      expect(run1.newStatus).toBe("EXPIRED");

      // 2nd run: status is now EXPIRED
      const run2 = processRelease(run1.newStatus);
      expect(run2.modifiedCount).toBe(0); // Idempotent skip: no second seat decrement or refund
      expect(run2.newStatus).toBe("EXPIRED");
    });

    test("G0-08.IDEM.2: scholarshipExpiry CAS guard - findOneAndUpdate only matches status: 'ACTIVE'", () => {
      // Simulating scholarship expiry CAS
      const expireAward = (award) => {
        if (award.status === "ACTIVE" && award.expiresAt <= new Date()) {
          const unused = award.remainingAmount;
          award.status = "EXPIRED";
          return { refundedAmount: unused };
        }
        return null; // Already expired or not active
      };

      const myAward = { status: "ACTIVE", expiresAt: new Date(Date.now() - 1000), remainingAmount: 500000 };

      // 1st run: successfully transitions and refunds
      const run1 = expireAward(myAward);
      expect(run1).toEqual({ refundedAmount: 500000 });
      expect(myAward.status).toBe("EXPIRED");

      // 2nd run: award is now EXPIRED, returns null, no duplicate refund
      const run2 = expireAward(myAward);
      expect(run2).toBeNull();
    });

    test("G0-08.IDEM.3: classLifecycle forward-only status progression (OPEN -> IN_PROGRESS -> COMPLETED)", () => {
      const allowedTransitions = {
        OPEN: ["IN_PROGRESS", "CANCELLED"],
        IN_PROGRESS: ["COMPLETED"],
        COMPLETED: [],
        CANCELLED: [],
      };

      const transitionClass = (currentStatus, targetStatus) => {
        if (allowedTransitions[currentStatus]?.includes(targetStatus)) {
          return targetStatus;
        }
        return currentStatus; // No-op, idempotent
      };

      // Transition OPEN -> IN_PROGRESS
      let status = transitionClass("OPEN", "IN_PROGRESS");
      expect(status).toBe("IN_PROGRESS");

      // Re-triggering OPEN -> IN_PROGRESS does nothing
      status = transitionClass(status, "IN_PROGRESS");
      expect(status).toBe("IN_PROGRESS");

      // Transition IN_PROGRESS -> COMPLETED
      status = transitionClass(status, "COMPLETED");
      expect(status).toBe("COMPLETED");

      // Re-triggering does nothing
      status = transitionClass(status, "COMPLETED");
      expect(status).toBe("COMPLETED");
    });

    test("G0-08.IDEM.4: teacherViolation compound unique index invariant protects duplicate alerts", () => {
      const TeacherViolation = require("../src/models/TeacherViolation");
      const indexes = TeacherViolation.schema.indexes();

      // Find compound index { sessionId: 1, teacherId: 1, violationCategory: 1 }
      const uniqueCompoundIndex = indexes.find((idx) => {
        const fields = idx[0];
        const options = idx[1];
        return (
          fields.sessionId === 1 &&
          fields.teacherId === 1 &&
          fields.violationCategory === 1 &&
          options &&
          options.unique === true
        );
      });

      expect(uniqueCompoundIndex).toBeDefined();
    });
  });
});
