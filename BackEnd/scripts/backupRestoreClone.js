/**
 * EDUNITY V3 — BACKUP, RESTORE, DB CLONE & RECONCILIATION ENGINE (TASK QA-07)
 *
 * Implements:
 * 1. BSON Canonical EJSON snapshot backup & restore with index metadata preservation.
 * 2. Recovery Time Objective (RTO) benchmark & measurement utility.
 * 3. Database cloning between namespaces / in-memory environments.
 * 4. 4-part automated reconciliation (Document Count, Index Parity, Financial Ledger, Referential Integrity).
 */

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { toNum } = require("../src/utils/money");
const { UNIQUE_INDEX_SPECS, ORPHAN_CHECK_SPECS } = require("./migrationPreflight");

// =============================================================================
// 1. RTO BENCHMARK & TIMING MEASUREMENT
// =============================================================================

/**
 * Measures the execution time (RTO) of a backup, restore, or migration operation.
 */
const measureRTO = async (operationFn) => {
  const startMs = Date.now();
  const startISO = new Date(startMs).toISOString();

  let error = null;
  let result = null;

  try {
    result = await operationFn();
  } catch (err) {
    error = err;
  }

  const endMs = Date.now();
  const endISO = new Date(endMs).toISOString();
  const durationMs = endMs - startMs;
  const durationSeconds = Math.round((durationMs / 1000) * 100) / 100;

  if (error) {
    throw Object.assign(error, {
      timing: { startISO, endISO, durationMs, durationSeconds },
    });
  }

  return {
    ...result,
    timing: {
      startISO,
      endISO,
      durationMs,
      durationSeconds,
    },
  };
};

// =============================================================================
// 2. BSON CANONICAL EJSON SERIALIZATION
// =============================================================================

const serializeToEJSON = (documents) => {
  const { EJSON } = mongoose.mongo.BSON;
  return EJSON.stringify(documents, null, 0, { relaxed: false });
};

const deserializeFromEJSON = (jsonString) => {
  const { EJSON } = mongoose.mongo.BSON;
  return EJSON.parse(jsonString);
};

// =============================================================================
// 3. BACKUP & RESTORE WITH INDEX METADATA PRESERVATION
// =============================================================================

/**
 * Dumps a single collection and its index definitions to canonical EJSON files.
 */
const backupCollectionWithIndexes = async (db, collectionName, outputDir) => {
  fs.mkdirSync(outputDir, { recursive: true });

  const coll = db.collection(collectionName);
  const [docs, indexes] = await Promise.all([
    coll.find({}).toArray(),
    coll.getIndexes ? coll.getIndexes() : [],
  ]);

  const dataFilePath = path.join(outputDir, `${collectionName}.json`);
  const indexFilePath = path.join(outputDir, `${collectionName}.indexes.json`);

  fs.writeFileSync(dataFilePath, serializeToEJSON(docs), "utf8");
  fs.writeFileSync(indexFilePath, JSON.stringify(indexes, null, 2), "utf8");

  return {
    collectionName,
    count: docs.length,
    indexCount: Array.isArray(indexes) ? indexes.length : Object.keys(indexes || {}).length,
    dataFilePath,
    indexFilePath,
  };
};

/**
 * Backs up all non-system collections in the database.
 */
const backupDatabase = async (db, baseDir = path.join(__dirname, "..", "backups")) => {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const targetDir = path.join(baseDir, timestamp);
  fs.mkdirSync(targetDir, { recursive: true });

  const collections = (await db.listCollections().toArray()).filter(
    (c) => !c.name.startsWith("system.")
  );

  const results = [];
  for (const c of collections) {
    const res = await backupCollectionWithIndexes(db, c.name, targetDir);
    results.push(res);
  }

  const totalDocuments = results.reduce((sum, item) => sum + item.count, 0);

  return {
    backupDir: targetDir,
    timestamp,
    collectionCount: results.length,
    totalDocuments,
    collections: results,
  };
};

/**
 * Restores a collection from EJSON files with optional clean drop and index recreation.
 */
const restoreCollectionWithIndexes = async (db, collectionName, inputDir, { drop = false } = {}) => {
  const dataFilePath = path.join(inputDir, `${collectionName}.json`);
  const indexFilePath = path.join(inputDir, `${collectionName}.indexes.json`);

  if (!fs.existsSync(dataFilePath)) {
    throw new Error(`Data file not found for collection ${collectionName} at ${dataFilePath}`);
  }

  const coll = db.collection(collectionName);
  if (drop && coll.drop) {
    try {
      await coll.drop();
    } catch (err) {
      // Ignore ns not found
      if (err.code !== 26) throw err;
    }
  }

  const docs = deserializeFromEJSON(fs.readFileSync(dataFilePath, "utf8"));
  let insertedCount = 0;
  if (docs.length > 0) {
    const res = await coll.insertMany(docs, { ordered: false });
    insertedCount = res.insertedCount || docs.length;
  }

  // Restore indexes if available
  let indexesRestored = 0;
  if (fs.existsSync(indexFilePath) && coll.createIndexes) {
    const indexes = JSON.parse(fs.readFileSync(indexFilePath, "utf8"));
    const rawList = Array.isArray(indexes) ? indexes : Object.values(indexes);
    // Filter out default _id_ index
    const customIndexes = rawList
      .filter((idx) => idx.name !== "_id_")
      .map((idx) => ({
        key: idx.key,
        name: idx.name,
        unique: idx.unique,
        sparse: idx.sparse,
        partialFilterExpression: idx.partialFilterExpression,
        expireAfterSeconds: idx.expireAfterSeconds,
      }));

    if (customIndexes.length > 0) {
      await coll.createIndexes(customIndexes);
      indexesRestored = customIndexes.length;
    }
  }

  return {
    collectionName,
    restoredCount: insertedCount,
    indexesRestored,
  };
};

/**
 * Restores entire database from a timestamped backup directory.
 */
const restoreDatabase = async (db, inputDir, { drop = true } = {}) => {
  if (!fs.existsSync(inputDir)) {
    throw new Error(`Backup directory not found: ${inputDir}`);
  }

  const files = fs.readdirSync(inputDir).filter((f) => f.endsWith(".json") && !f.endsWith(".indexes.json"));
  const results = [];

  for (const file of files) {
    const collectionName = file.replace(/\.json$/, "");
    const res = await restoreCollectionWithIndexes(db, collectionName, inputDir, { drop });
    results.push(res);
  }

  const totalRestored = results.reduce((sum, item) => sum + item.restoredCount, 0);

  return {
    inputDir,
    restoredCollections: results.length,
    totalRestored,
    collections: results,
  };
};

// =============================================================================
// 4. DATABASE CLONING (Between Namespaces or In-Memory Instances)
// =============================================================================

/**
 * Clones all documents from sourceDb to targetDb without mutating source.
 */
const cloneCollections = async (sourceDb, targetDb, { dropTarget = true } = {}) => {
  const collections = (await sourceDb.listCollections().toArray()).filter(
    (c) => !c.name.startsWith("system.")
  );

  const results = [];
  for (const c of collections) {
    const sourceColl = sourceDb.collection(c.name);
    const targetColl = targetDb.collection(c.name);

    if (dropTarget && targetColl.drop) {
      try {
        await targetColl.drop();
      } catch (err) {
        if (err.code !== 26) throw err;
      }
    }

    const docs = await sourceColl.find({}).toArray();
    let clonedCount = 0;
    if (docs.length > 0) {
      const res = await targetColl.insertMany(docs, { ordered: false });
      clonedCount = res.insertedCount || docs.length;
    }

    // Replicate indexes if available
    if (sourceColl.getIndexes && targetColl.createIndexes) {
      const indexes = await sourceColl.getIndexes();
      const rawList = Array.isArray(indexes) ? indexes : Object.values(indexes || {});
      const customIndexes = rawList
        .filter((idx) => idx.name !== "_id_")
        .map((idx) => ({
          key: idx.key,
          name: idx.name,
          unique: idx.unique,
          sparse: idx.sparse,
          partialFilterExpression: idx.partialFilterExpression,
          expireAfterSeconds: idx.expireAfterSeconds,
        }));
      if (customIndexes.length > 0) {
        await targetColl.createIndexes(customIndexes);
      }
    }

    results.push({ collectionName: c.name, count: clonedCount });
  }

  const totalCloned = results.reduce((sum, item) => sum + item.count, 0);
  return {
    collectionsCloned: results.length,
    totalCloned,
    details: results,
  };
};

// =============================================================================
// 5. 4-PART AUTOMATED RECONCILIATION SUITE
// =============================================================================

/**
 * Part 1: Compares document counts per collection between source and target database.
 */
const reconcileDocumentCounts = async (sourceDb, targetDb, collectionNames) => {
  const names =
    collectionNames ||
    (await sourceDb.listCollections().toArray())
      .map((c) => c.name)
      .filter((n) => !n.startsWith("system."));

  const details = {};
  let matchedAll = true;

  for (const name of names) {
    const [sourceCount, targetCount] = await Promise.all([
      sourceDb.collection(name).countDocuments ? sourceDb.collection(name).countDocuments({}) : (await sourceDb.collection(name).find({}).toArray()).length,
      targetDb.collection(name).countDocuments ? targetDb.collection(name).countDocuments({}) : (await targetDb.collection(name).find({}).toArray()).length,
    ]);

    const matched = sourceCount === targetCount;
    if (!matched) matchedAll = false;

    details[name] = {
      sourceCount,
      targetCount,
      diff: sourceCount - targetCount,
      matched,
    };
  }

  return {
    matchedAll,
    details,
  };
};

/**
 * Part 2: Verifies index parity (19 Unique Indexes present on target).
 */
const reconcileIndexes = async (targetDb, specs = UNIQUE_INDEX_SPECS) => {
  const missing = [];
  const checked = [];

  for (const spec of specs) {
    const coll = targetDb.collection(spec.collection);
    let targetIndexes = [];
    if (coll.getIndexes) {
      const idxObj = await coll.getIndexes();
      targetIndexes = Array.isArray(idxObj) ? idxObj : Object.values(idxObj || {});
    }

    const found = targetIndexes.some((idx) => {
      // Check if all keys match
      const keyFields = Object.keys(spec.keys);
      const matchKey = keyFields.every((k) => idx.key && idx.key[k] === spec.keys[k]);
      return matchKey && (spec.unique ? idx.unique === true : true);
    });

    checked.push({ collection: spec.collection, indexName: spec.indexName, found });
    if (!found) {
      missing.push({ collection: spec.collection, indexName: spec.indexName, expectedKeys: spec.keys });
    }
  }

  return {
    allIndexesPresent: missing.length === 0,
    missingCount: missing.length,
    missing,
    checkedCount: checked.length,
  };
};

/**
 * Part 3: Financial Ledger Reconciliation (Châu's 4 Invariant Equations).
 */
const reconcileFinancialLedgers = async (db) => {
  const checks = {};

  // Eq 1: Sum(Payment.amount where COMPLETED) == Sum(Enrollment.amountPaidViaPayment where CONFIRMED/COMPLETED)
  const paymentsCompleted = await db
    .collection("payments")
    .aggregate([
      { $match: { paymentStatus: "COMPLETED" } },
      { $group: { _id: null, total: { $sum: { $toDecimal: "$amount" } } } },
    ])
    .toArray();

  const enrollmentsPaid = await db
    .collection("enrollments")
    .aggregate([
      { $match: { enrollmentStatus: { $in: ["CONFIRMED", "COMPLETED"] } } },
      { $group: { _id: null, total: { $sum: { $toDecimal: "$amountPaidViaPayment" } } } },
    ])
    .toArray();

  const paymentTotal = toNum(paymentsCompleted[0]?.total || 0);
  const enrollmentPaidTotal = toNum(enrollmentsPaid[0]?.total || 0);
  const tuitionMatched = Math.abs(paymentTotal - enrollmentPaidTotal) < 0.001;

  checks.tuitionEquation = {
    paymentCompletedTotal: paymentTotal,
    enrollmentPaidTotal,
    diff: paymentTotal - enrollmentPaidTotal,
    matched: tuitionMatched,
  };

  // Eq 2: Sum(TeacherEarning.grossAmount) == Sum(netAmount + commissionAmount)
  const earningsAgg = await db
    .collection("teacherearnings")
    .aggregate([
      {
        $group: {
          _id: null,
          grossTotal: { $sum: { $toDecimal: "$grossAmount" } },
          netTotal: { $sum: { $toDecimal: "$netAmount" } },
          commissionTotal: { $sum: { $toDecimal: "$commissionAmount" } },
        },
      },
    ])
    .toArray();

  const gross = toNum(earningsAgg[0]?.grossTotal || 0);
  const net = toNum(earningsAgg[0]?.netTotal || 0);
  const comm = toNum(earningsAgg[0]?.commissionTotal || 0);
  const earningsMatched = Math.abs(gross - (net + comm)) < 0.001;

  checks.earningsEquation = {
    grossTotal: gross,
    netTotal: net,
    commissionTotal: comm,
    diff: gross - (net + comm),
    matched: earningsMatched,
  };

  // Eq 3: Campaign.fundedAmount == Sum(SponsorContribution.amount where COMPLETED)
  const campaignsAgg = await db
    .collection("scholarshipcampaigns")
    .aggregate([
      { $group: { _id: null, total: { $sum: { $toDecimal: "$fundedAmount" } } } },
    ])
    .toArray();

  const contribsAgg = await db
    .collection("sponsorcontributions")
    .aggregate([
      { $match: { contributionStatus: "COMPLETED" } },
      { $group: { _id: null, total: { $sum: { $toDecimal: "$amount" } } } },
    ])
    .toArray();

  const campaignFunded = toNum(campaignsAgg[0]?.total || 0);
  const contribCompleted = toNum(contribsAgg[0]?.total || 0);
  const fundingMatched = Math.abs(campaignFunded - contribCompleted) < 0.001;

  checks.campaignFundingEquation = {
    campaignFundedTotal: campaignFunded,
    contributionsCompletedTotal: contribCompleted,
    diff: campaignFunded - contribCompleted,
    matched: fundingMatched,
  };

  // Eq 4: Scholarship.allocatedAmount == remainingAmount + Sum(ScholarshipUsage.amount where CONFIRMED)
  const scholarshipAgg = await db
    .collection("scholarships")
    .aggregate([
      {
        $group: {
          _id: null,
          allocatedTotal: { $sum: { $toDecimal: "$allocatedAmount" } },
          remainingTotal: { $sum: { $toDecimal: "$remainingAmount" } },
        },
      },
    ])
    .toArray();

  const usageAgg = await db
    .collection("scholarshipusages")
    .aggregate([
      { $match: { status: "CONFIRMED" } },
      { $group: { _id: null, total: { $sum: { $toDecimal: "$amount" } } } },
    ])
    .toArray();

  const alloc = toNum(scholarshipAgg[0]?.allocatedTotal || 0);
  const remain = toNum(scholarshipAgg[0]?.remainingTotal || 0);
  const used = toNum(usageAgg[0]?.total || 0);
  const scholarshipMatched = Math.abs(alloc - (remain + used)) < 0.001;

  checks.scholarshipEquation = {
    allocatedTotal: alloc,
    remainingTotal: remain,
    usedConfirmedTotal: used,
    diff: alloc - (remain + used),
    matched: scholarshipMatched,
  };

  const allLedgersBalanced = tuitionMatched && earningsMatched && fundingMatched && scholarshipMatched;

  return {
    allLedgersBalanced,
    checks,
  };
};

/**
 * Part 4: Referential Integrity Check (Orphans).
 */
const reconcileOrphans = async (db) => {
  const results = [];
  for (const spec of ORPHAN_CHECK_SPECS) {
    const orphans = await db
      .collection(spec.from)
      .aggregate([
        {
          $lookup: {
            from: spec.target,
            localField: spec.localField,
            foreignField: "_id",
            as: "parent",
          },
        },
        { $match: { parent: { $size: 0 } } },
        { $project: { _id: 1, [spec.localField]: 1 } },
        { $limit: 10 },
      ])
      .toArray();

    if (orphans.length > 0) {
      results.push({
        spec: spec.name,
        from: spec.from,
        target: spec.target,
        isFinancial: Boolean(spec.isFinancial),
        orphanCount: orphans.length,
        sampleIds: orphans.map((o) => o._id),
      });
    }
  }

  return {
    clean: results.length === 0,
    orphanCount: results.length,
    orphans: results,
  };
};

/**
 * Master 4-part automated reconciliation runner.
 */
const runFullReconciliation = async (sourceDb, targetDb) => {
  const startMs = Date.now();

  const [documentCounts, indexParity, financialLedgers, orphans] = await Promise.all([
    reconcileDocumentCounts(sourceDb, targetDb),
    reconcileIndexes(targetDb),
    reconcileFinancialLedgers(targetDb),
    reconcileOrphans(targetDb),
  ]);

  const durationMs = Date.now() - startMs;
  const passed =
    documentCounts.matchedAll &&
    indexParity.allIndexesPresent &&
    financialLedgers.allLedgersBalanced &&
    orphans.clean;

  return {
    timestamp: new Date().toISOString(),
    durationMs,
    passed,
    documentCounts,
    indexParity,
    financialLedgers,
    orphans,
  };
};

module.exports = {
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
};

