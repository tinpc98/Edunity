/**
 * EDUNITY V3 — BACKUP, RESTORE, DB CLONE & RECONCILIATION ENGINE (TASK QA-07)
 *
 * Implements:
 * 1. BSON Canonical EJSON snapshot backup & restore with SHA-256 manifest verification,
 *    index metadata preservation, real MongoDB driver `indexes()` compatibility, and atomic temp-staging restore.
 * 2. Recovery Time Objective (RTO) benchmark & measurement utility.
 * 3. Database cloning between namespaces / in-memory environments with self-clone & prod guards.
 * 4. 4-part automated reconciliation (Document Count, Full Unique Index Parity, Financial Ledger, Referential Integrity).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { toNum } = require("../src/utils/money");
const { UNIQUE_INDEX_SPECS, ORPHAN_CHECK_SPECS } = require("./migrationPreflight");

const BACKUP_BATCH_SIZE = 500;
const MANIFEST_FILENAME = "backup-manifest.json";

const sha256 = (content) => crypto.createHash("sha256").update(content, "utf8").digest("hex");

const canonicalStringify = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(",")}}`;
};

// Compatible with MongoDB Node Driver v7 (`indexes()`, `listIndexes()`) AND unit-test mocks (`getIndexes()`)
const getCollectionIndexes = async (coll) => {
  if (!coll) return [];
  try {
    if (typeof coll.indexes === "function") {
      return await coll.indexes();
    }
    if (typeof coll.listIndexes === "function") {
      return await coll.listIndexes().toArray();
    }
    if (typeof coll.getIndexes === "function") {
      const res = await coll.getIndexes();
      return Array.isArray(res) ? res : Object.values(res || {});
    }
  } catch (err) {
    if (err && (err.code === 26 || String(err.message).includes("ns does not exist"))) {
      return [];
    }
    throw err;
  }
  return [];
};

const readCollectionDocs = async (coll, batchSize = BACKUP_BATCH_SIZE) => {
  const cursor = coll.find({});
  if (cursor && typeof cursor.batchSize === "function" && typeof cursor[Symbol.asyncIterator] === "function") {
    cursor.batchSize(batchSize);
    const docs = [];
    for await (const doc of cursor) {
      docs.push(doc);
    }
    return docs;
  }
  return await cursor.toArray();
};

const insertInBatches = async (coll, docs, batchSize = BACKUP_BATCH_SIZE) => {
  if (!docs || docs.length === 0) return 0;
  let inserted = 0;
  for (let i = 0; i < docs.length; i += batchSize) {
    const slice = docs.slice(i, i + batchSize);
    const res = await coll.insertMany(slice, { ordered: true });
    inserted += res && typeof res.insertedCount === "number" ? res.insertedCount : slice.length;
  }
  return inserted;
};

const extractCustomIndexes = (indexes) => {
  const rawList = Array.isArray(indexes) ? indexes : Object.values(indexes || {});
  return rawList
    .filter((idx) => idx && idx.name !== "_id_")
    .map((idx) => {
      const spec = {
        key: idx.key,
        name: idx.name,
      };
      if (idx.unique !== undefined) spec.unique = idx.unique;
      if (idx.sparse !== undefined) spec.sparse = idx.sparse;
      if (idx.partialFilterExpression !== undefined) spec.partialFilterExpression = idx.partialFilterExpression;
      if (idx.expireAfterSeconds !== undefined) spec.expireAfterSeconds = idx.expireAfterSeconds;
      if (idx.weights !== undefined) spec.weights = idx.weights;
      if (idx.default_language !== undefined) spec.default_language = idx.default_language;
      return spec;
    });
};

// =============================================================================
// 1. RTO BENCHMARK & TIMING MEASUREMENT
// =============================================================================

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
// 3. BACKUP & RESTORE WITH CHECKSUM MANIFEST & ATOMIC STAGING
// =============================================================================

const backupCollectionWithIndexes = async (db, collectionName, outputDir) => {
  fs.mkdirSync(outputDir, { recursive: true });

  const coll = db.collection(collectionName);
  const [docs, indexes] = await Promise.all([
    readCollectionDocs(coll),
    getCollectionIndexes(coll),
  ]);

  const dataContent = serializeToEJSON(docs);
  const indexContent = JSON.stringify(indexes, null, 2);

  const dataFilePath = path.join(outputDir, `${collectionName}.json`);
  const indexFilePath = path.join(outputDir, `${collectionName}.indexes.json`);

  fs.writeFileSync(dataFilePath, dataContent, "utf8");
  fs.writeFileSync(indexFilePath, indexContent, "utf8");

  return {
    collectionName,
    count: docs.length,
    indexCount: Array.isArray(indexes) ? indexes.length : Object.keys(indexes || {}).length,
    dataFile: `${collectionName}.json`,
    indexFile: `${collectionName}.indexes.json`,
    dataSha256: sha256(dataContent),
    indexesSha256: sha256(indexContent),
    dataFilePath,
    indexFilePath,
  };
};

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
  const manifestPayload = {
    version: "3.0",
    timestamp: now.toISOString(),
    dbName: db.databaseName || null,
    collectionCount: results.length,
    totalDocuments,
    collections: results.map((r) => ({
      collectionName: r.collectionName,
      count: r.count,
      indexCount: r.indexCount,
      dataFile: r.dataFile,
      indexFile: r.indexFile,
      dataSha256: r.dataSha256,
      indexesSha256: r.indexesSha256,
    })),
  };

  const manifestPath = path.join(targetDir, MANIFEST_FILENAME);
  fs.writeFileSync(manifestPath, JSON.stringify(manifestPayload, null, 2), "utf8");

  return {
    backupDir: targetDir,
    manifestPath,
    timestamp,
    collectionCount: results.length,
    totalDocuments,
    collections: results,
  };
};

const verifyBackupManifest = (inputDir) => {
  const manifestPath = path.join(inputDir, MANIFEST_FILENAME);
  if (!fs.existsSync(manifestPath)) {
    return { verified: false, hasManifest: false };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  for (const entry of manifest.collections || []) {
    const dataPath = path.join(inputDir, entry.dataFile || `${entry.collectionName}.json`);
    if (!fs.existsSync(dataPath)) {
      throw new Error(`BACKUP_CHECKSUM_MISMATCH: Missing data file ${entry.dataFile}`);
    }
    const actualDataHash = sha256(fs.readFileSync(dataPath, "utf8"));
    if (entry.dataSha256 && actualDataHash !== entry.dataSha256) {
      throw new Error(
        `BACKUP_CHECKSUM_MISMATCH: Data checksum mismatch for collection "${entry.collectionName}"`
      );
    }

    const indexPath = path.join(inputDir, entry.indexFile || `${entry.collectionName}.indexes.json`);
    if (entry.indexesSha256) {
      if (!fs.existsSync(indexPath)) {
        throw new Error(`BACKUP_CHECKSUM_MISMATCH: Missing index file ${entry.indexFile}`);
      }
      const actualIdxHash = sha256(fs.readFileSync(indexPath, "utf8"));
      if (actualIdxHash !== entry.indexesSha256) {
        throw new Error(
          `BACKUP_CHECKSUM_MISMATCH: Index metadata checksum mismatch for collection "${entry.collectionName}"`
        );
      }
    }
  }

  return { verified: true, hasManifest: true, manifest };
};

const restoreCollectionWithIndexes = async (db, collectionName, inputDir, { drop = false } = {}) => {
  const dataFilePath = path.join(inputDir, `${collectionName}.json`);
  const indexFilePath = path.join(inputDir, `${collectionName}.indexes.json`);

  if (!fs.existsSync(dataFilePath)) {
    throw new Error(`Data file not found for collection ${collectionName} at ${dataFilePath}`);
  }

  // Parse and validate BEFORE touching the target collection
  const rawData = fs.readFileSync(dataFilePath, "utf8");
  const docs = deserializeFromEJSON(rawData);
  if (!Array.isArray(docs)) {
    throw new Error(`Invalid EJSON payload for collection ${collectionName}: expected array`);
  }

  let customIndexes = [];
  if (fs.existsSync(indexFilePath)) {
    const indexes = JSON.parse(fs.readFileSync(indexFilePath, "utf8"));
    customIndexes = extractCustomIndexes(indexes);
  }

  const coll = db.collection(collectionName);
  const canStageAtomically = drop && typeof coll.rename === "function";

  let insertedCount = 0;
  let indexesRestored = 0;

  if (canStageAtomically) {
    const tempName = `__restore_tmp_${collectionName}_${crypto.randomBytes(4).toString("hex")}`.slice(0, 60);
    const tempColl = db.collection(tempName);
    try {
      if (docs.length === 0 && typeof db.createCollection === "function") {
        await db.createCollection(tempName);
      }
      if (docs.length > 0) {
        insertedCount = await insertInBatches(tempColl, docs);
      }
      if (customIndexes.length > 0 && typeof tempColl.createIndexes === "function") {
        await tempColl.createIndexes(customIndexes);
        indexesRestored = customIndexes.length;
      }
      await tempColl.rename(collectionName, { dropTarget: true });
    } catch (err) {
      if (typeof tempColl.drop === "function") {
        await tempColl.drop().catch(() => {});
      }
      throw err;
    }
  } else {
    if (drop && coll.drop) {
      try {
        await coll.drop();
      } catch (err) {
        if (err.code !== 26) throw err;
      }
    }

    if (docs.length > 0) {
      insertedCount = await insertInBatches(coll, docs);
    }

    if (customIndexes.length > 0 && coll.createIndexes) {
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

const restoreDatabase = async (db, inputDir, { drop = true } = {}) => {
  if (!fs.existsSync(inputDir)) {
    throw new Error(`Backup directory not found: ${inputDir}`);
  }

  // Verify manifest checksums & pre-parse ALL backup files BEFORE any destructive action
  verifyBackupManifest(inputDir);

  const files = fs
    .readdirSync(inputDir)
    .filter(
      (f) =>
        f.endsWith(".json") &&
        !f.endsWith(".indexes.json") &&
        f !== MANIFEST_FILENAME &&
        f !== "migration-manifest.json"
    );

  // Pre-validate readability / EJSON validity before mutating DB even if no manifest exists
  for (const file of files) {
    deserializeFromEJSON(fs.readFileSync(path.join(inputDir, file), "utf8"));
  }

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

const assertSafeTarget = (db, { confirmProduction = false } = {}) => {
  const dbName = db && db.databaseName ? String(db.databaseName).trim().toLowerCase() : "";
  if ((process.env.NODE_ENV === "production" || dbName === "edunity") && !confirmProduction) {
    throw new Error(
      `[SECURITY GUARD] Refusing destructive operation on target database "${dbName || "production"}" without --confirm-production`
    );
  }
};

const cloneCollections = async (sourceDb, targetDb, { dropTarget = true, confirmProduction = false } = {}) => {
  if (
    sourceDb &&
    targetDb &&
    sourceDb === targetDb
  ) {
    throw new Error("CLONE_SELF_FORBIDDEN: sourceDb and targetDb must not be the same instance");
  }
  if (
    sourceDb &&
    targetDb &&
    sourceDb.databaseName &&
    targetDb.databaseName &&
    sourceDb.databaseName === targetDb.databaseName &&
    sourceDb.client === targetDb.client
  ) {
    throw new Error(
      `CLONE_SELF_FORBIDDEN: sourceDb and targetDb resolve to identical database "${sourceDb.databaseName}"`
    );
  }

  assertSafeTarget(targetDb, { confirmProduction });

  const collections = (await sourceDb.listCollections().toArray()).filter(
    (c) => !c.name.startsWith("system.")
  );

  const results = [];
  for (const c of collections) {
    const sourceColl = sourceDb.collection(c.name);
    const targetColl = targetDb.collection(c.name);

    const [docs, rawIndexes] = await Promise.all([
      readCollectionDocs(sourceColl),
      getCollectionIndexes(sourceColl),
    ]);
    const customIndexes = extractCustomIndexes(rawIndexes);

    let clonedCount = 0;
    const canStageAtomically = dropTarget && typeof targetColl.rename === "function";

    if (canStageAtomically) {
      const tempName = `__clone_tmp_${c.name}_${crypto.randomBytes(4).toString("hex")}`.slice(0, 60);
      const tempColl = targetDb.collection(tempName);
      try {
        if (docs.length === 0 && typeof targetDb.createCollection === "function") {
          await targetDb.createCollection(tempName);
        }
        if (docs.length > 0) {
          clonedCount = await insertInBatches(tempColl, docs);
        }
        if (customIndexes.length > 0 && typeof tempColl.createIndexes === "function") {
          await tempColl.createIndexes(customIndexes);
        }
        await tempColl.rename(c.name, { dropTarget: true });
      } catch (err) {
        if (typeof tempColl.drop === "function") {
          await tempColl.drop().catch(() => {});
        }
        throw err;
      }
    } else {
      if (dropTarget && targetColl.drop) {
        try {
          await targetColl.drop();
        } catch (err) {
          if (err.code !== 26) throw err;
        }
      }

      if (docs.length > 0) {
        clonedCount = await insertInBatches(targetColl, docs);
      }

      if (customIndexes.length > 0 && targetColl.createIndexes) {
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
      sourceDb.collection(name).countDocuments
        ? sourceDb.collection(name).countDocuments({})
        : (await sourceDb.collection(name).find({}).toArray()).length,
      targetDb.collection(name).countDocuments
        ? targetDb.collection(name).countDocuments({})
        : (await targetDb.collection(name).find({}).toArray()).length,
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

const reconcileIndexes = async (targetDb, specs = UNIQUE_INDEX_SPECS) => {
  const missing = [];
  const checked = [];

  for (const spec of specs) {
    const coll = targetDb.collection(spec.collection);
    const targetIndexes = await getCollectionIndexes(coll);

    const specKeys = Object.keys(spec.keys);
    const found = targetIndexes.some((idx) => {
      if (!idx || !idx.key) return false;
      const idxKeys = Object.keys(idx.key);
      if (idxKeys.length !== specKeys.length) return false;
      const matchKey = specKeys.every((k, i) => idxKeys[i] === k && idx.key[k] === spec.keys[k]);
      if (!matchKey) return false;
      if (spec.unique && idx.unique !== true) return false;
      if (spec.partialFilterExpression) {
        return (
          idx.partialFilterExpression &&
          canonicalStringify(idx.partialFilterExpression) ===
            canonicalStringify(spec.partialFilterExpression)
        );
      }
      if (idx.partialFilterExpression) {
        return false;
      }
      return true;
    });

    checked.push({ collection: spec.collection, indexName: spec.indexName, found });
    if (!found) {
      missing.push({
        collection: spec.collection,
        indexName: spec.indexName,
        expectedKeys: spec.keys,
        expectedPartialFilter: spec.partialFilterExpression || null,
      });
    }
  }

  return {
    allIndexesPresent: missing.length === 0,
    missingCount: missing.length,
    missing,
    checkedCount: checked.length,
  };
};

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
    .aggregate([{ $group: { _id: null, total: { $sum: { $toDecimal: "$fundedAmount" } } } }])
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

// =============================================================================
// 6. CLI ENTRYPOINT (backup | restore | clone | reconcile)
// =============================================================================
if (require.main === module) {
  require("dotenv").config();
  const connectDB = require("../src/config/db");

  const args = process.argv.slice(2);
  const command = args[0];
  const hasFlag = (f) => args.includes(f);
  const getArgValue = (prefix) => {
    const hit = args.find((a) => a.startsWith(`${prefix}=`));
    if (hit) return hit.slice(prefix.length + 1);
    const idx = args.indexOf(prefix);
    return idx >= 0 ? args[idx + 1] : "";
  };

  const runCLI = async () => {
    try {
      const uri = process.env.MONGODB_URI;
      await connectDB(uri);
      const db = mongoose.connection.db;
      const confirmProduction = hasFlag("--confirm-production");

      if (command === "backup") {
        const outDir = getArgValue("--out") || undefined;
        const res = await measureRTO(() => backupDatabase(db, outDir));
        console.log(JSON.stringify(res, null, 2));
      } else if (command === "restore") {
        assertSafeTarget(db, { confirmProduction });
        const inDir = getArgValue("--in");
        const res = await measureRTO(() => restoreDatabase(db, inDir, { drop: true }));
        console.log(JSON.stringify(res, null, 2));
      } else if (command === "clone") {
        const targetDbName = getArgValue("--target-db");
        if (!targetDbName) throw new Error("--target-db is required for clone");
        const targetDb = mongoose.connection.getClient().db(targetDbName);
        const res = await measureRTO(() =>
          cloneCollections(db, targetDb, { dropTarget: true, confirmProduction })
        );
        console.log(JSON.stringify(res, null, 2));
      } else if (command === "reconcile") {
        const sourceDbName = getArgValue("--source-db");
        const sourceDb = sourceDbName ? mongoose.connection.getClient().db(sourceDbName) : db;
        const res = await runFullReconciliation(sourceDb, db);
        console.log(JSON.stringify(res, null, 2));
      } else {
        throw new Error(`Unknown command "${command}". Expected one of: backup, restore, clone, reconcile`);
      }

      await mongoose.disconnect();
      process.exit(0);
    } catch (err) {
      console.error("[QA-07 ERROR]:", err.message);
      await mongoose.disconnect().catch(() => {});
      process.exit(1);
    }
  };

  runCLI();
}

module.exports = {
  measureRTO,
  serializeToEJSON,
  deserializeFromEJSON,
  getCollectionIndexes,
  verifyBackupManifest,
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
