const mongoose = require("mongoose");
const {
  UNIQUE_INDEX_SPECS,
  ORPHAN_CHECK_SPECS,
  runDuplicatePreflight,
  runOrphanPreflight,
  runSchemaPreflight,
  runFullPreflight,
  evaluateSafeHalt,
  serializeToEJSON,
  deserializeFromEJSON,
} = require("../scripts/migrationPreflight");
const { GRADE_LEVELS, COURSE_LEVELS } = require("../src/models/constants");

describe("TASK G0-03: Migration Plan, Preflight Auditing & Safe Halt Circuit Breaker", () => {
  // =========================================================================
  // 1. Unique Index Specification Integrity
  // =========================================================================
  describe("1. Unique Index Specification Matrix", () => {
    test("G0-03.SPEC.1: All 19 core unique/partial index specifications are defined", () => {
      expect(UNIQUE_INDEX_SPECS.length).toBe(19);

      const collections = UNIQUE_INDEX_SPECS.map((s) => s.collection);
      expect(collections).toContain("users");
      expect(collections).toContain("refreshtokens");
      expect(collections).toContain("categories");
      expect(collections).toContain("subjects");
      expect(collections).toContain("courses");
      expect(collections).toContain("payments");
      expect(collections).toContain("teacherearnings");
      expect(collections).toContain("reviews");
      expect(collections).toContain("sessionattendances");
      expect(collections).toContain("sessionpresenceintervals");
      expect(collections).toContain("sessionreschedulerequests");
      expect(collections).toContain("sessionrefundreviews");
      expect(collections).toContain("teacherviolations");
      expect(collections).toContain("enrollments");
      expect(collections).toContain("sponsorcontributions");
      expect(collections).toContain("scholarshipapplications");
      expect(collections).toContain("scholarships");
      expect(collections).toContain("notifications");
      expect(collections).toContain("joblocks");
    });

    test("G0-03.SPEC.2: Every unique index specification contains valid pipeline and keys", () => {
      for (const spec of UNIQUE_INDEX_SPECS) {
        expect(spec.collection).toBeDefined();
        expect(spec.indexName).toBeDefined();
        expect(typeof spec.keys).toBe("object");
        expect(spec.unique).toBe(true);
        expect(Array.isArray(spec.pipeline)).toBe(true);
        expect(spec.pipeline.length).toBeGreaterThan(0);

        // Every pipeline must have a $group stage followed by a $match count > 1
        const groupStage = spec.pipeline.find((stage) => stage.$group);
        const matchStage = spec.pipeline.find((stage) => stage.$match && stage.$match.count);
        expect(groupStage).toBeDefined();
        expect(matchStage).toBeDefined();
      }
    });

    test("G0-03.SPEC.3: Partial filter expressions match business invariants", () => {
      // Enrollment: only active enrollments block duplicate
      const enrollmentSpec = UNIQUE_INDEX_SPECS.find((s) => s.collection === "enrollments");
      expect(enrollmentSpec.partialFilterExpression).toEqual({
        enrollmentStatus: { $in: ["PENDING_PAYMENT", "CONFIRMED", "COMPLETED"] },
      });

      // Reschedule: only active reschedule requests block duplicate
      const rescheduleSpec = UNIQUE_INDEX_SPECS.find((s) => s.collection === "sessionreschedulerequests");
      expect(rescheduleSpec.partialFilterExpression).toEqual({
        status: { $in: ["PENDING_ADMIN_APPROVAL", "APPROVED"] },
      });

      // Scholarship Application: only pending applications block duplicate
      const appSpec = UNIQUE_INDEX_SPECS.find((s) => s.collection === "scholarshipapplications");
      expect(appSpec.partialFilterExpression).toEqual({
        status: { $in: ["SUBMITTED", "NEED_MORE_INFORMATION"] },
      });
    });
  });

  // =========================================================================
  // 2. Duplicate Preflight Detection
  // =========================================================================
  describe("2. Duplicate Preflight Execution", () => {
    test("G0-03.DUP.1: runDuplicatePreflight detects duplicate key violations across collections", async () => {
      const duplicateUserId1 = new mongoose.Types.ObjectId();
      const duplicateUserId2 = new mongoose.Types.ObjectId();

      const mockDb = {
        collection: (name) => ({
          aggregate: (pipeline) => ({
            toArray: async () => {
              if (name === "users") {
                // Simulate duplicate email detected
                return [
                  {
                    _id: "duplicate@example.com",
                    count: 2,
                    ids: [duplicateUserId1, duplicateUserId2],
                  },
                ];
              }
              if (name === "payments") {
                // Simulate duplicate gatewayReference
                return [
                  {
                    _id: "SBX-DUPLICATE-REF",
                    count: 2,
                    ids: [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()],
                  },
                ];
              }
              return [];
            },
          }),
        }),
      };

      const violations = await runDuplicatePreflight(mockDb);
      expect(violations.length).toBe(2);

      const userViolation = violations.find((v) => v.collection === "users");
      expect(userViolation).toBeDefined();
      expect(userViolation.count).toBe(1);
      expect(userViolation.samples[0]._id).toBe("duplicate@example.com");

      const paymentViolation = violations.find((v) => v.collection === "payments");
      expect(paymentViolation).toBeDefined();
      expect(paymentViolation.samples[0]._id).toBe("SBX-DUPLICATE-REF");
    });

    test("G0-03.DUP.2: runDuplicatePreflight returns empty array when all keys are unique", async () => {
      const mockDb = {
        collection: () => ({
          aggregate: () => ({
            toArray: async () => [],
          }),
        }),
      };

      const violations = await runDuplicatePreflight(mockDb);
      expect(violations).toEqual([]);
    });
  });

  // =========================================================================
  // 3. Orphan & Schema Invariant Preflight Detection
  // =========================================================================
  describe("3. Orphan and Schema Invariant Audits", () => {
    test("G0-03.ORPH.1: runOrphanPreflight detects orphan payments and flags them as financial", async () => {
      const orphanPaymentId = new mongoose.Types.ObjectId();
      const mockDb = {
        collection: (name) => ({
          aggregate: (pipeline) => ({
            toArray: async () => {
              if (name === "payments") {
                return [{ _id: orphanPaymentId, enrollmentId: new mongoose.Types.ObjectId() }];
              }
              return [];
            },
          }),
        }),
      };

      const orphans = await runOrphanPreflight(mockDb);
      expect(orphans.length).toBe(1);
      expect(orphans[0].spec).toBe("orphan_payments_enrollment");
      expect(orphans[0].isFinancial).toBe(true);
      expect(orphans[0].count).toBe(1);
    });

    test("G0-03.SCH.1: runSchemaPreflight catches invalid Course.level enum (e.g. legacy BASIC)", async () => {
      const badCourseId = new mongoose.Types.ObjectId();
      const mockDb = {
        collection: (name) => ({
          find: (query) => ({
            project: () => ({
              toArray: async () => {
                if (name === "courses" && query.level) {
                  return [{ _id: badCourseId, title: "Khóa học thử nghiệm", level: "BASIC" }];
                }
                return [];
              },
            }),
          }),
        }),
      };

      const violations = await runSchemaPreflight(mockDb);
      expect(violations.length).toBe(1);
      expect(violations[0].rule).toBe("COURSE_LEVEL_INVALID");
      expect(violations[0].samples[0].level).toBe("BASIC");
    });

    test("G0-03.SCH.2: runSchemaPreflight catches FREE class with price > 0 and PAID class with price <= 0", async () => {
      const mockDb = {
        collection: (name) => ({
          find: (query) => ({
            project: () => ({
              toArray: async () => {
                if (name === "classes" && query.classType === "FREE") {
                  return [{ _id: new mongoose.Types.ObjectId(), className: "Lớp miễn phí", price: 100000 }];
                }
                if (name === "classes" && query.classType === "PAID") {
                  return [{ _id: new mongoose.Types.ObjectId(), className: "Lớp trả phí", price: 0 }];
                }
                return [];
              },
            }),
          }),
        }),
      };

      const violations = await runSchemaPreflight(mockDb);
      expect(violations.length).toBe(2);

      const freeViolation = violations.find((v) => v.rule === "CLASS_FREE_PRICE_NONZERO");
      expect(freeViolation).toBeDefined();

      const paidViolation = violations.find((v) => v.rule === "CLASS_PAID_PRICE_ZERO_OR_NULL");
      expect(paidViolation).toBeDefined();
    });
  });

  // =========================================================================
  // 4. Safe Halt Criteria (Circuit Breaker)
  // =========================================================================
  describe("4. Safe Halt Criteria Evaluation", () => {
    test("G0-03.HALT.1: evaluateSafeHalt triggers circuit breaker on duplicate key violations", () => {
      const dirtyReport = {
        passed: false,
        duplicateViolations: [
          { collection: "users", indexName: "email_1", count: 2 },
        ],
        orphanViolations: [],
        schemaViolations: [],
      };

      const haltDecision = evaluateSafeHalt(dirtyReport);
      expect(haltDecision.shouldHalt).toBe(true);
      expect(haltDecision.blockerCount).toBe(1);
      expect(haltDecision.blockers[0].rule).toBe("DUPLICATE_KEY_VIOLATION");
    });

    test("G0-03.HALT.2: evaluateSafeHalt triggers circuit breaker on orphan financial records", () => {
      const financialOrphanReport = {
        passed: false,
        duplicateViolations: [],
        orphanViolations: [
          { spec: "orphan_payments_enrollment", isFinancial: true, count: 3 },
        ],
        schemaViolations: [],
      };

      const haltDecision = evaluateSafeHalt(financialOrphanReport);
      expect(haltDecision.shouldHalt).toBe(true);
      expect(haltDecision.blockers[0].rule).toBe("ORPHAN_FINANCIAL_RECORDS");
    });

    test("G0-03.HALT.3: evaluateSafeHalt allows progression when preflight report is clean", () => {
      const cleanReport = {
        passed: true,
        duplicateViolations: [],
        orphanViolations: [],
        schemaViolations: [],
      };

      const haltDecision = evaluateSafeHalt(cleanReport);
      expect(haltDecision.shouldHalt).toBe(false);
      expect(haltDecision.blockerCount).toBe(0);
      expect(haltDecision.blockers).toEqual([]);
    });
  });

  // =========================================================================
  // 5. BSON Canonical EJSON Serialization & Deserialization Fidelity
  // =========================================================================
  describe("5. BSON Canonical EJSON Backup & Restore Fidelity", () => {
    test("G0-03.EJSON.1: Exactly preserves Decimal128, ObjectId, Date, and nested structures", () => {
      const originalObjectId = new mongoose.Types.ObjectId("66e000000000000000000002");
      const originalDecimal = new mongoose.Types.Decimal128("1500000.75");
      const originalDate = new Date("2026-11-07T14:30:00.000Z");

      const documents = [
        {
          _id: originalObjectId,
          name: "Khóa học cao cấp",
          tuitionAmount: originalDecimal,
          createdAt: originalDate,
          meta: {
            isActive: true,
            attempts: 3,
          },
        },
      ];

      // 1. Serialize to Canonical BSON EJSON string
      const jsonString = serializeToEJSON(documents);
      expect(typeof jsonString).toBe("string");
      // Canonical format contains explicit $oid, $numberDecimal, $date
      expect(jsonString).toContain('"$numberDecimal":"1500000.75"');
      expect(jsonString).toContain('"$oid":"66e000000000000000000002"');

      // 2. Deserialize back from EJSON string
      const restored = deserializeFromEJSON(jsonString);
      expect(Array.isArray(restored)).toBe(true);
      expect(restored.length).toBe(1);

      const doc = restored[0];
      // Verify ObjectId type and value
      expect(doc._id).toBeInstanceOf(mongoose.Types.ObjectId);
      expect(doc._id.toHexString()).toBe("66e000000000000000000002");

      // Verify Decimal128 type and value
      expect(doc.tuitionAmount).toBeInstanceOf(mongoose.Types.Decimal128);
      expect(doc.tuitionAmount.toString()).toBe("1500000.75");

      // Verify Date type and value
      expect(doc.createdAt).toBeInstanceOf(Date);
      expect(doc.createdAt.getTime()).toBe(originalDate.getTime());

      // Verify primitives
      expect(doc.meta.isActive).toBe(true);
      expect(doc.meta.attempts).toBe(3);
    });
  });
});

