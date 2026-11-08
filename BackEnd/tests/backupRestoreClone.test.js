const fs = require("fs");
const path = require("path");
const os = require("os");
const mongoose = require("mongoose");
const {
  measureRTO,
  serializeToEJSON,
  deserializeFromEJSON,
  backupCollectionWithIndexes,
  backupDatabase,
  restoreCollectionWithIndexes,
  restoreDatabase,
  cloneCollections,
  reconcileDocumentCounts,
  reconcileIndexes,
  reconcileFinancialLedgers,
  reconcileOrphans,
  runFullReconciliation,
} = require("../scripts/backupRestoreClone");
const { UNIQUE_INDEX_SPECS, ORPHAN_CHECK_SPECS } = require("../scripts/migrationPreflight");

describe("TASK QA-07: Backup, Restore, DB Clone & Reconciliation Verification", () => {
  let tempBackupDir;

  beforeEach(() => {
    tempBackupDir = fs.mkdtempSync(path.join(os.tmpdir(), "edunity-qa07-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempBackupDir)) {
      fs.rmSync(tempBackupDir, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // 1. RTO Benchmark & Timing Measurement
  // =========================================================================
  describe("1. RTO Benchmark & Timing Measurement", () => {
    test("QA-07.RTO.1: measureRTO records startISO, endISO, durationMs, and durationSeconds", async () => {
      const mockOperation = async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { migratedRecords: 100 };
      };

      const result = await measureRTO(mockOperation);
      expect(result.migratedRecords).toBe(100);
      expect(result.timing).toBeDefined();
      expect(typeof result.timing.startISO).toBe("string");
      expect(typeof result.timing.endISO).toBe("string");
      expect(result.timing.durationMs).toBeGreaterThanOrEqual(40);
      expect(typeof result.timing.durationSeconds).toBe("number");
    });

    test("QA-07.RTO.2: measureRTO attaches timing metadata even when operation fails", async () => {
      const failingOperation = async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        throw new Error("MIGRATION_HALT_TEST");
      };

      try {
        await measureRTO(failingOperation);
        throw new Error("Should have thrown");
      } catch (err) {
        expect(err.message).toBe("MIGRATION_HALT_TEST");
        expect(err.timing).toBeDefined();
        expect(err.timing.durationMs).toBeGreaterThanOrEqual(15);
      }
    });
  });

  // =========================================================================
  // 2. Canonical BSON EJSON Serialization Fidelity
  // =========================================================================
  describe("2. Canonical BSON EJSON Serialization Fidelity", () => {
    test("QA-07.EJSON.1: Preserves Decimal128, ObjectId, and Date without float precision loss", () => {
      const originalDoc = {
        _id: new mongoose.Types.ObjectId("65f1a2b3c4d5e6f7a8b9c0d1"),
        amount: new mongoose.Types.Decimal128("12500000.50"),
        createdAt: new Date("2026-03-31T08:30:00.000Z"),
        currency: "VND",
        status: "COMPLETED",
      };

      const serialized = serializeToEJSON([originalDoc]);
      expect(serialized).toContain("$numberDecimal");
      expect(serialized).toContain("12500000.50");
      expect(serialized).toContain("$oid");
      expect(serialized).toContain("65f1a2b3c4d5e6f7a8b9c0d1");
      expect(serialized).toContain("$date");

      const deserialized = deserializeFromEJSON(serialized);
      expect(deserialized.length).toBe(1);

      const recovered = deserialized[0];
      expect(recovered._id.toString()).toBe("65f1a2b3c4d5e6f7a8b9c0d1");
      expect(recovered.amount.toString()).toBe("12500000.50");
      expect(recovered.createdAt.toISOString()).toBe("2026-03-31T08:30:00.000Z");
    });
  });

  // =========================================================================
  // 3. Backup & Restore with Index Metadata
  // =========================================================================
  describe("3. Backup & Restore with Index Metadata", () => {
    test("QA-07.BKUP.1: backupCollectionWithIndexes writes data and index metadata to disk", async () => {
      const mockCollection = {
        find: () => ({
          toArray: async () => [
            { _id: new mongoose.Types.ObjectId(), name: "Course A", code: "CRS-001" },
            { _id: new mongoose.Types.ObjectId(), name: "Course B", code: "CRS-002" },
          ],
        }),
        getIndexes: async () => [
          { v: 2, key: { _id: 1 }, name: "_id_" },
          { v: 2, key: { code: 1 }, name: "code_1", unique: true },
        ],
      };

      const mockDb = {
        collection: (name) => mockCollection,
      };

      const result = await backupCollectionWithIndexes(mockDb, "courses", tempBackupDir);
      expect(result.collectionName).toBe("courses");
      expect(result.count).toBe(2);
      expect(result.indexCount).toBe(2);
      expect(fs.existsSync(result.dataFilePath)).toBe(true);
      expect(fs.existsSync(result.indexFilePath)).toBe(true);

      // Verify index file content
      const indexFileContent = JSON.parse(fs.readFileSync(result.indexFilePath, "utf8"));
      expect(indexFileContent.length).toBe(2);
      expect(indexFileContent[1].name).toBe("code_1");
    });

    test("QA-07.BKUP.2: backupDatabase dumps all non-system collections", async () => {
      const mockDb = {
        listCollections: () => ({
          toArray: async () => [
            { name: "system.views" },
            { name: "users" },
            { name: "enrollments" },
          ],
        }),
        collection: (name) => ({
          find: () => ({
            toArray: async () => [{ _id: new mongoose.Types.ObjectId(), name: `${name}-1` }],
          }),
          getIndexes: async () => [{ key: { _id: 1 }, name: "_id_" }],
        }),
      };

      const result = await backupDatabase(mockDb, tempBackupDir);
      expect(result.collectionCount).toBe(2); // excludes system.views
      expect(result.totalDocuments).toBe(2);
      expect(fs.existsSync(result.backupDir)).toBe(true);
    });

    test("QA-07.REST.1: restoreCollectionWithIndexes restores data and custom indexes", async () => {
      // First, create mock files
      const data = [{ _id: new mongoose.Types.ObjectId(), title: "Algebra" }];
      const indexes = [
        { key: { _id: 1 }, name: "_id_" },
        { key: { title: 1 }, name: "title_1", unique: true },
      ];

      fs.writeFileSync(path.join(tempBackupDir, "subjects.json"), serializeToEJSON(data), "utf8");
      fs.writeFileSync(path.join(tempBackupDir, "subjects.indexes.json"), JSON.stringify(indexes), "utf8");

      let dropped = false;
      let insertedDocs = null;
      let createdIndexes = null;

      const mockDb = {
        collection: (name) => ({
          drop: async () => {
            dropped = true;
          },
          insertMany: async (docs) => {
            insertedDocs = docs;
            return { insertedCount: docs.length };
          },
          createIndexes: async (idxList) => {
            createdIndexes = idxList;
            return idxList;
          },
        }),
      };

      const result = await restoreCollectionWithIndexes(mockDb, "subjects", tempBackupDir, { drop: true });
      expect(result.restoredCount).toBe(1);
      expect(result.indexesRestored).toBe(1); // _id_ excluded
      expect(dropped).toBe(true);
      expect(insertedDocs.length).toBe(1);
      expect(createdIndexes[0].name).toBe("title_1");
      expect(createdIndexes[0].unique).toBe(true);
    });

    test("QA-07.REST.2: restoreDatabase processes all JSON files in backup directory", async () => {
      // Prepare 2 collections
      fs.writeFileSync(
        path.join(tempBackupDir, "colA.json"),
        serializeToEJSON([{ _id: new mongoose.Types.ObjectId(), a: 1 }]),
        "utf8"
      );
      fs.writeFileSync(
        path.join(tempBackupDir, "colB.json"),
        serializeToEJSON([{ _id: new mongoose.Types.ObjectId(), b: 2 }]),
        "utf8"
      );

      const mockDb = {
        collection: (name) => ({
          drop: async () => {},
          insertMany: async (docs) => ({ insertedCount: docs.length }),
          createIndexes: async () => {},
        }),
      };

      const result = await restoreDatabase(mockDb, tempBackupDir, { drop: true });
      expect(result.restoredCollections).toBe(2);
      expect(result.totalRestored).toBe(2);
    });
  });

  // =========================================================================
  // 4. Database Cloning Between Namespaces
  // =========================================================================
  describe("4. Database Cloning Between Namespaces", () => {
    test("QA-07.CLONE.1: cloneCollections copies documents and custom indexes from source to target", async () => {
      const sourceDocs = [
        { _id: new mongoose.Types.ObjectId(), email: "user1@edunity.vn" },
        { _id: new mongoose.Types.ObjectId(), email: "user2@edunity.vn" },
      ];

      let targetDropped = false;
      let targetInserted = [];
      let targetIndexesCreated = [];

      const sourceDb = {
        listCollections: () => ({
          toArray: async () => [{ name: "users" }],
        }),
        collection: (name) => ({
          find: () => ({ toArray: async () => sourceDocs }),
          getIndexes: async () => [
            { key: { _id: 1 }, name: "_id_" },
            { key: { email: 1 }, name: "email_1", unique: true },
          ],
        }),
      };

      const targetDb = {
        collection: (name) => ({
          drop: async () => {
            targetDropped = true;
          },
          insertMany: async (docs) => {
            targetInserted = docs;
            return { insertedCount: docs.length };
          },
          createIndexes: async (idxList) => {
            targetIndexesCreated = idxList;
            return idxList;
          },
        }),
      };

      const result = await cloneCollections(sourceDb, targetDb, { dropTarget: true });
      expect(result.collectionsCloned).toBe(1);
      expect(result.totalCloned).toBe(2);
      expect(targetDropped).toBe(true);
      expect(targetInserted.length).toBe(2);
      expect(targetIndexesCreated.length).toBe(1);
      expect(targetIndexesCreated[0].name).toBe("email_1");
    });
  });

  // =========================================================================
  // 5. 4-Part Automated Reconciliation Suite
  // =========================================================================
  describe("5. 4-Part Automated Reconciliation Suite", () => {
    // Part 1: Document Count Parity
    test("QA-07.REC.1: reconcileDocumentCounts detects exact matches and discrepancies", async () => {
      const sourceDb = {
        listCollections: () => ({
          toArray: async () => [{ name: "users" }, { name: "courses" }],
        }),
        collection: (name) => ({
          countDocuments: async () => (name === "users" ? 100 : 50),
        }),
      };

      // Scenario A: Exact match
      const matchingTargetDb = {
        collection: (name) => ({
          countDocuments: async () => (name === "users" ? 100 : 50),
        }),
      };
      const passResult = await reconcileDocumentCounts(sourceDb, matchingTargetDb);
      expect(passResult.matchedAll).toBe(true);
      expect(passResult.details.users.diff).toBe(0);
      expect(passResult.details.courses.diff).toBe(0);

      // Scenario B: Mismatch
      const mismatchTargetDb = {
        collection: (name) => ({
          countDocuments: async () => (name === "users" ? 98 : 50),
        }),
      };
      const failResult = await reconcileDocumentCounts(sourceDb, mismatchTargetDb);
      expect(failResult.matchedAll).toBe(false);
      expect(failResult.details.users.diff).toBe(2);
      expect(failResult.details.users.matched).toBe(false);
    });

    // Part 2: Index Parity
    test("QA-07.REC.2: reconcileIndexes verifies all 19 unique indexes are present", async () => {
      // Mock db containing all required indexes
      const mockTargetDb = {
        collection: (collectionName) => ({
          getIndexes: async () => {
            const spec = UNIQUE_INDEX_SPECS.find((s) => s.collection === collectionName);
            if (!spec) return [{ key: { _id: 1 }, name: "_id_" }];
            return [
              { key: { _id: 1 }, name: "_id_" },
              { key: spec.keys, name: spec.indexName, unique: true },
            ];
          },
        }),
      };

      const result = await reconcileIndexes(mockTargetDb);
      expect(result.allIndexesPresent).toBe(true);
      expect(result.missingCount).toBe(0);
      expect(result.checkedCount).toBe(19);
    });

    test("QA-07.REC.3: reconcileIndexes detects missing unique index", async () => {
      const mockTargetDb = {
        collection: (collectionName) => ({
          getIndexes: async () => {
            // Suppose payments unique index is missing
            if (collectionName === "payments") {
              return [{ key: { _id: 1 }, name: "_id_" }];
            }
            const spec = UNIQUE_INDEX_SPECS.find((s) => s.collection === collectionName);
            return [
              { key: { _id: 1 }, name: "_id_" },
              { key: spec.keys, name: spec.indexName, unique: true },
            ];
          },
        }),
      };

      const result = await reconcileIndexes(mockTargetDb);
      expect(result.allIndexesPresent).toBe(false);
      expect(result.missingCount).toBe(1);
      expect(result.missing[0].collection).toBe("payments");
    });

    // Part 3: Financial Ledger Reconciliation (Châu's 4 Invariant Equations)
    test("QA-07.REC.4: reconcileFinancialLedgers verifies all 4 equations when balanced", async () => {
      const mockDb = {
        collection: (name) => ({
          aggregate: () => ({
            toArray: async () => {
              switch (name) {
                case "payments":
                  // Eq 1: 50,000,000 VND
                  return [{ total: new mongoose.Types.Decimal128("50000000") }];
                case "enrollments":
                  // Eq 1: 50,000,000 VND
                  return [{ total: new mongoose.Types.Decimal128("50000000") }];
                case "teacherearnings":
                  // Eq 2: gross 40,000,000 = net 32,000,000 + comm 8,000,000
                  return [
                    {
                      grossTotal: new mongoose.Types.Decimal128("40000000"),
                      netTotal: new mongoose.Types.Decimal128("32000000"),
                      commissionTotal: new mongoose.Types.Decimal128("8000000"),
                    },
                  ];
                case "scholarshipcampaigns":
                  // Eq 3: 100,000,000 VND
                  return [{ total: new mongoose.Types.Decimal128("100000000") }];
                case "sponsorcontributions":
                  // Eq 3: 100,000,000 VND
                  return [{ total: new mongoose.Types.Decimal128("100000000") }];
                case "scholarships":
                  // Eq 4: allocated 20,000,000 = remain 15,000,000 + used 5,000,000
                  return [
                    {
                      allocatedTotal: new mongoose.Types.Decimal128("20000000"),
                      remainingTotal: new mongoose.Types.Decimal128("15000000"),
                    },
                  ];
                case "scholarshipusages":
                  // Eq 4: 5,000,000 VND
                  return [{ total: new mongoose.Types.Decimal128("5000000") }];
                default:
                  return [];
              }
            },
          }),
        }),
      };

      const result = await reconcileFinancialLedgers(mockDb);
      expect(result.allLedgersBalanced).toBe(true);
      expect(result.checks.tuitionEquation.matched).toBe(true);
      expect(result.checks.earningsEquation.matched).toBe(true);
      expect(result.checks.campaignFundingEquation.matched).toBe(true);
      expect(result.checks.scholarshipEquation.matched).toBe(true);
    });

    test("QA-07.REC.5: reconcileFinancialLedgers flags imbalanced tuition ledger", async () => {
      const mockDb = {
        collection: (name) => ({
          aggregate: () => ({
            toArray: async () => {
              if (name === "payments") {
                return [{ total: new mongoose.Types.Decimal128("50000000") }];
              }
              if (name === "enrollments") {
                // Discrepancy: 48,000,000 vs 50,000,000
                return [{ total: new mongoose.Types.Decimal128("48000000") }];
              }
              if (name === "teacherearnings") {
                return [
                  {
                    grossTotal: new mongoose.Types.Decimal128("10000"),
                    netTotal: new mongoose.Types.Decimal128("8000"),
                    commissionTotal: new mongoose.Types.Decimal128("2000"),
                  },
                ];
              }
              if (name === "scholarships") {
                return [
                  {
                    allocatedTotal: new mongoose.Types.Decimal128("10000"),
                    remainingTotal: new mongoose.Types.Decimal128("10000"),
                  },
                ];
              }
              return [{ total: new mongoose.Types.Decimal128("0") }];
            },
          }),
        }),
      };

      const result = await reconcileFinancialLedgers(mockDb);
      expect(result.allLedgersBalanced).toBe(false);
      expect(result.checks.tuitionEquation.matched).toBe(false);
      expect(result.checks.tuitionEquation.diff).toBe(2000000);
    });

    // Part 4: Referential Integrity Check (Orphans)
    test("QA-07.REC.6: reconcileOrphans detects clean database vs orphan records", async () => {
      // Scenario A: Clean database
      const cleanDb = {
        collection: () => ({
          aggregate: () => ({
            toArray: async () => [], // No orphans
          }),
        }),
      };

      const cleanResult = await reconcileOrphans(cleanDb);
      expect(cleanResult.clean).toBe(true);
      expect(cleanResult.orphanCount).toBe(0);

      // Scenario B: Database with orphan payments
      const orphanDb = {
        collection: (name) => ({
          aggregate: () => ({
            toArray: async () => {
              if (name === "payments") {
                return [{ _id: new mongoose.Types.ObjectId(), enrollmentId: new mongoose.Types.ObjectId() }];
              }
              return [];
            },
          }),
        }),
      };

      const orphanResult = await reconcileOrphans(orphanDb);
      expect(orphanResult.clean).toBe(false);
      expect(orphanResult.orphanCount).toBe(1);
      expect(orphanResult.orphans[0].from).toBe("payments");
      expect(orphanResult.orphans[0].isFinancial).toBe(true);
    });

    // Master Full Reconciliation
    test("QA-07.REC.7: runFullReconciliation aggregates all 4 phases and measures duration", async () => {
      const mockSourceDb = {
        listCollections: () => ({
          toArray: async () => [{ name: "users" }],
        }),
        collection: () => ({
          countDocuments: async () => 10,
        }),
      };

      const mockTargetDb = {
        listCollections: () => ({
          toArray: async () => [{ name: "users" }],
        }),
        collection: (name) => ({
          countDocuments: async () => 10,
          getIndexes: async () => {
            const spec = UNIQUE_INDEX_SPECS.find((s) => s.collection === name);
            if (!spec) return [{ key: { _id: 1 }, name: "_id_" }];
            return [
              { key: { _id: 1 }, name: "_id_" },
              { key: spec.keys, name: spec.indexName, unique: true },
            ];
          },
          aggregate: (pipeline) => ({
            toArray: async () => {
              // If it's an orphan check query ($lookup), return empty array (no orphans)
              if (pipeline && pipeline.some((stage) => stage.$lookup)) {
                return [];
              }
              if (name === "payments" || name === "enrollments") {
                return [{ total: new mongoose.Types.Decimal128("1000") }];
              }
              if (name === "teacherearnings") {
                return [
                  {
                    grossTotal: new mongoose.Types.Decimal128("1000"),
                    netTotal: new mongoose.Types.Decimal128("800"),
                    commissionTotal: new mongoose.Types.Decimal128("200"),
                  },
                ];
              }
              if (name === "scholarshipcampaigns" || name === "sponsorcontributions") {
                return [{ total: new mongoose.Types.Decimal128("5000") }];
              }
              if (name === "scholarships") {
                return [
                  {
                    allocatedTotal: new mongoose.Types.Decimal128("5000"),
                    remainingTotal: new mongoose.Types.Decimal128("5000"),
                  },
                ];
              }
              if (name === "scholarshipusages") {
                return [{ total: new mongoose.Types.Decimal128("0") }];
              }
              return [];
            },
          }),
        }),
      };

      const fullResult = await runFullReconciliation(mockSourceDb, mockTargetDb);
      expect(fullResult.passed).toBe(true);
      expect(fullResult.documentCounts.matchedAll).toBe(true);
      expect(fullResult.indexParity.allIndexesPresent).toBe(true);
      expect(fullResult.financialLedgers.allLedgersBalanced).toBe(true);
      expect(fullResult.orphans.clean).toBe(true);
      expect(fullResult.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof fullResult.timestamp).toBe("string");
    });
  });
});
