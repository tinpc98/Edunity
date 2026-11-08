/**
 * EDUNITY V3 — MIGRATION PREFLIGHT, BACKUP & SAFE-HALT ENGINE (TASK G0-03)
 *
 * Provides comprehensive preflight data auditing before building unique indexes,
 * BSON Canonical EJSON snapshot backup/restore, dry-run validation, and
 * safe-halt circuit breaker protection to guarantee zero data loss.
 */

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { GRADE_LEVELS, COURSE_LEVELS } = require("../src/models/constants");

// =============================================================================
// 1. UNIQUE INDEX SPECIFICATIONS (19 Core Unique / Partial Filter Indexes)
// =============================================================================
const UNIQUE_INDEX_SPECS = [
  {
    collection: "users",
    indexName: "email_1",
    keys: { email: 1 },
    unique: true,
    description: "Unique user email (case-insensitive audit)",
    pipeline: [
      { $group: { _id: { $toLower: "$email" }, count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "refreshtokens",
    indexName: "tokenHash_1",
    keys: { tokenHash: 1 },
    unique: true,
    description: "Unique refresh token hash",
    pipeline: [
      { $match: { tokenHash: { $exists: true, $ne: null } } },
      { $group: { _id: "$tokenHash", count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "categories",
    indexName: "slug_1",
    keys: { slug: 1 },
    unique: true,
    description: "Unique category slug",
    pipeline: [
      { $match: { slug: { $exists: true, $ne: null } } },
      { $group: { _id: "$slug", count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "subjects",
    indexName: "slug_1",
    keys: { slug: 1 },
    unique: true,
    description: "Unique subject slug",
    pipeline: [
      { $match: { slug: { $exists: true, $ne: null } } },
      { $group: { _id: "$slug", count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "courses",
    indexName: "slug_1",
    keys: { slug: 1 },
    unique: true,
    description: "Unique course slug",
    pipeline: [
      { $match: { slug: { $exists: true, $ne: null } } },
      { $group: { _id: "$slug", count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "payments",
    indexName: "gatewayReference_1",
    keys: { gatewayReference: 1 },
    unique: true,
    description: "Unique payment gateway reference (webhook idempotency)",
    pipeline: [
      { $match: { gatewayReference: { $exists: true, $ne: null } } },
      { $group: { _id: "$gatewayReference", count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "teacherearnings",
    indexName: "enrollmentId_1",
    keys: { enrollmentId: 1 },
    unique: true,
    description: "Unique earning per enrollment",
    pipeline: [
      { $match: { enrollmentId: { $exists: true, $ne: null } } },
      { $group: { _id: "$enrollmentId", count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "reviews",
    indexName: "enrollmentId_1",
    keys: { enrollmentId: 1 },
    unique: true,
    description: "Unique review per enrollment",
    pipeline: [
      { $match: { enrollmentId: { $exists: true, $ne: null } } },
      { $group: { _id: "$enrollmentId", count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "sessionattendances",
    indexName: "sessionId_1_studentId_1",
    keys: { sessionId: 1, studentId: 1 },
    unique: true,
    description: "Unique attendance per student per session",
    pipeline: [
      { $group: { _id: { sessionId: "$sessionId", studentId: "$studentId" }, count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "sessionpresenceintervals",
    indexName: "sessionId_1_userId_1_connectionSessionId_1",
    keys: { sessionId: 1, userId: 1, connectionSessionId: 1 },
    unique: true,
    description: "Unique presence interval per connection session",
    pipeline: [
      { $match: { connectionSessionId: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: { sessionId: "$sessionId", userId: "$userId", connectionSessionId: "$connectionSessionId" },
          count: { $sum: 1 },
          ids: { $push: "$_id" },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "sessionreschedulerequests",
    indexName: "originalSessionId_1",
    keys: { originalSessionId: 1 },
    unique: true,
    partialFilterExpression: { status: { $in: ["PENDING_ADMIN_APPROVAL", "APPROVED"] } },
    description: "Unique active reschedule request per session",
    pipeline: [
      { $match: { status: { $in: ["PENDING_ADMIN_APPROVAL", "APPROVED"] } } },
      { $group: { _id: "$originalSessionId", count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "sessionrefundreviews",
    indexName: "sessionId_1_enrollmentId_1",
    keys: { sessionId: 1, enrollmentId: 1 },
    unique: true,
    description: "Unique refund review per session per enrollment",
    pipeline: [
      { $group: { _id: { sessionId: "$sessionId", enrollmentId: "$enrollmentId" }, count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "teacherviolations",
    indexName: "sessionId_1_teacherId_1_violationCategory_1",
    keys: { sessionId: 1, teacherId: 1, violationCategory: 1 },
    unique: true,
    description: "Unique violation category per session per teacher",
    pipeline: [
      {
        $group: {
          _id: { sessionId: "$sessionId", teacherId: "$teacherId", violationCategory: "$violationCategory" },
          count: { $sum: 1 },
          ids: { $push: "$_id" },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "enrollments",
    indexName: "studentId_1_classId_1",
    keys: { studentId: 1, classId: 1 },
    unique: true,
    partialFilterExpression: { enrollmentStatus: { $in: ["PENDING_PAYMENT", "CONFIRMED", "COMPLETED"] } },
    description: "Unique active enrollment per student per class",
    pipeline: [
      { $match: { enrollmentStatus: { $in: ["PENDING_PAYMENT", "CONFIRMED", "COMPLETED"] } } },
      { $group: { _id: { studentId: "$studentId", classId: "$classId" }, count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "sponsorcontributions",
    indexName: "paymentReference_1",
    keys: { paymentReference: 1 },
    unique: true,
    sparse: true,
    description: "Unique non-null sponsor contribution payment reference",
    pipeline: [
      { $match: { paymentReference: { $exists: true, $ne: null } } },
      { $group: { _id: "$paymentReference", count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "scholarshipapplications",
    indexName: "studentId_1_campaignId_1",
    keys: { studentId: 1, campaignId: 1 },
    unique: true,
    partialFilterExpression: { status: { $in: ["SUBMITTED", "NEED_MORE_INFORMATION"] } },
    description: "Unique pending application per student per campaign",
    pipeline: [
      { $match: { status: { $in: ["SUBMITTED", "NEED_MORE_INFORMATION"] } } },
      { $group: { _id: { studentId: "$studentId", campaignId: "$campaignId" }, count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "scholarships",
    indexName: "applicationId_1",
    keys: { applicationId: 1 },
    unique: true,
    description: "Unique scholarship grant per application",
    pipeline: [
      { $match: { applicationId: { $exists: true, $ne: null } } },
      { $group: { _id: "$applicationId", count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "notifications",
    indexName: "userId_1_dedupeKey_1",
    keys: { userId: 1, dedupeKey: 1 },
    unique: true,
    partialFilterExpression: { dedupeKey: { $type: "string" } },
    description: "Unique string dedupeKey per user notification",
    pipeline: [
      { $match: { dedupeKey: { $type: "string" } } },
      { $group: { _id: { userId: "$userId", dedupeKey: "$dedupeKey" }, count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "joblocks",
    indexName: "name_1",
    keys: { name: 1 },
    unique: true,
    description: "Unique distributed job lock name",
    pipeline: [
      { $group: { _id: "$name", count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
];

// =============================================================================
// 2. ORPHAN RECORD SPECIFICATIONS (Referential Integrity Audits)
// =============================================================================
const ORPHAN_CHECK_SPECS = [
  {
    name: "orphan_subjects_category",
    from: "subjects",
    target: "categories",
    localField: "categoryId",
    description: "Subjects referencing non-existent categoryId",
  },
  {
    name: "orphan_courses_subject",
    from: "courses",
    target: "subjects",
    localField: "subjectId",
    description: "Courses referencing non-existent subjectId",
  },
  {
    name: "orphan_classes_course",
    from: "classes",
    target: "courses",
    localField: "courseId",
    description: "Classes referencing non-existent courseId",
  },
  {
    name: "orphan_sessions_class",
    from: "sessions",
    target: "classes",
    localField: "classId",
    description: "Sessions referencing non-existent classId",
  },
  {
    name: "orphan_enrollments_class",
    from: "enrollments",
    target: "classes",
    localField: "classId",
    description: "Enrollments referencing non-existent classId",
  },
  {
    name: "orphan_payments_enrollment",
    from: "payments",
    target: "enrollments",
    localField: "enrollmentId",
    isFinancial: true,
    description: "Payments referencing non-existent enrollmentId",
  },
  {
    name: "orphan_teacherearnings_enrollment",
    from: "teacherearnings",
    target: "enrollments",
    localField: "enrollmentId",
    isFinancial: true,
    description: "TeacherEarnings referencing non-existent enrollmentId",
  },
];

// =============================================================================
// 3. PREFLIGHT AUDITING FUNCTIONS (Read-Only)
// =============================================================================

/**
 * Runs duplicate key checks across all 19 unique index specifications.
 */
const runDuplicatePreflight = async (db) => {
  const violations = [];
  for (const spec of UNIQUE_INDEX_SPECS) {
    try {
      const coll = db.collection(spec.collection);
      const results = await coll.aggregate(spec.pipeline).toArray();
      if (results && results.length > 0) {
        violations.push({
          collection: spec.collection,
          indexName: spec.indexName,
          description: spec.description,
          count: results.length,
          samples: results.slice(0, 5),
        });
      }
    } catch (err) {
      violations.push({
        collection: spec.collection,
        indexName: spec.indexName,
        error: err.message,
      });
    }
  }
  return violations;
};

/**
 * Runs referential integrity checks to detect orphan documents.
 */
const runOrphanPreflight = async (db) => {
  const orphans = [];
  for (const spec of ORPHAN_CHECK_SPECS) {
    try {
      const results = await db
        .collection(spec.from)
        .aggregate([
          {
            $lookup: {
              from: spec.target,
              localField: spec.localField,
              foreignField: "_id",
              as: "matchedTarget",
            },
          },
          { $match: { matchedTarget: { $size: 0 } } },
          { $project: { _id: 1, [spec.localField]: 1 } },
          { $limit: 10 },
        ])
        .toArray();

      if (results && results.length > 0) {
        orphans.push({
          spec: spec.name,
          from: spec.from,
          target: spec.target,
          isFinancial: Boolean(spec.isFinancial),
          count: results.length,
          sampleIds: results.map((r) => r._id),
        });
      }
    } catch (err) {
      orphans.push({ spec: spec.name, error: err.message });
    }
  }
  return orphans;
};

/**
 * Checks schema enum and hook invariants (e.g. Course.level, Class price rule).
 */
const runSchemaPreflight = async (db) => {
  const violations = [];

  try {
    // 1. Course.level invalid enums (e.g. legacy "BASIC" instead of "BEGINNER")
    const badLevels = await db
      .collection("courses")
      .find({
        level: { $exists: true, $nin: [...COURSE_LEVELS, null] },
      })
      .project({ _id: 1, title: 1, level: 1 })
      .toArray();

    if (badLevels.length > 0) {
      violations.push({
        rule: "COURSE_LEVEL_INVALID",
        description: `Found courses with invalid level enum (expected one of ${COURSE_LEVELS.join(", ")})`,
        count: badLevels.length,
        samples: badLevels.slice(0, 5),
      });
    }

    // 2. Course.gradeLevel invalid enums
    const badGrades = await db
      .collection("courses")
      .find({
        gradeLevel: { $exists: true, $nin: [...GRADE_LEVELS, null] },
      })
      .project({ _id: 1, title: 1, gradeLevel: 1 })
      .toArray();

    if (badGrades.length > 0) {
      violations.push({
        rule: "COURSE_GRADE_LEVEL_INVALID",
        description: "Found courses with invalid gradeLevel enum",
        count: badGrades.length,
        samples: badGrades.slice(0, 5),
      });
    }

    // 3. Class price hook: FREE classes must have price == 0
    const badFreeClasses = await db
      .collection("classes")
      .find({
        classType: "FREE",
        $or: [{ price: { $gt: 0 } }, { price: { $type: "string", $ne: "0" } }],
      })
      .project({ _id: 1, className: 1, classType: 1, price: 1 })
      .toArray();

    if (badFreeClasses.length > 0) {
      violations.push({
        rule: "CLASS_FREE_PRICE_NONZERO",
        description: "Found FREE classes with price > 0",
        count: badFreeClasses.length,
        samples: badFreeClasses.slice(0, 5),
      });
    }

    // 4. Class price hook: PAID classes must have price > 0
    const badPaidClasses = await db
      .collection("classes")
      .find({
        classType: "PAID",
        $or: [{ price: { $lte: 0 } }, { price: null }, { price: { $exists: false } }],
      })
      .project({ _id: 1, className: 1, classType: 1, price: 1 })
      .toArray();

    if (badPaidClasses.length > 0) {
      violations.push({
        rule: "CLASS_PAID_PRICE_ZERO_OR_NULL",
        description: "Found PAID classes with price <= 0 or null",
        count: badPaidClasses.length,
        samples: badPaidClasses.slice(0, 5),
      });
    }
  } catch (err) {
    violations.push({ rule: "SCHEMA_QUERY_FAILED", error: err.message });
  }

  return violations;
};

/**
 * Master preflight execution returning aggregated audit report.
 */
const runFullPreflight = async (db) => {
  const [duplicateViolations, orphanViolations, schemaViolations] = await Promise.all([
    runDuplicatePreflight(db),
    runOrphanPreflight(db),
    runSchemaPreflight(db),
  ]);

  const passed =
    duplicateViolations.length === 0 &&
    orphanViolations.length === 0 &&
    schemaViolations.length === 0;

  return {
    timestamp: new Date().toISOString(),
    passed,
    duplicateViolations,
    orphanViolations,
    schemaViolations,
  };
};

// =============================================================================
// 4. SAFE HALT CRITERIA (Circuit Breaker)
// =============================================================================
const evaluateSafeHalt = (report) => {
  const blockers = [];

  if (report.duplicateViolations && report.duplicateViolations.length > 0) {
    blockers.push({
      rule: "DUPLICATE_KEY_VIOLATION",
      message: `Detected ${report.duplicateViolations.length} duplicate key violation(s) on unique indexes. Index build will fail with E11000.`,
      details: report.duplicateViolations,
    });
  }

  const financialOrphans = (report.orphanViolations || []).filter((o) => o.isFinancial);
  if (financialOrphans.length > 0) {
    blockers.push({
      rule: "ORPHAN_FINANCIAL_RECORDS",
      message: `Detected ${financialOrphans.length} orphan financial record set(s) in Payment or TeacherEarning.`,
      details: financialOrphans,
    });
  }

  if (report.schemaViolations && report.schemaViolations.length > 0) {
    blockers.push({
      rule: "SCHEMA_VALIDATION_VIOLATION",
      message: `Detected ${report.schemaViolations.length} schema invariant violation(s) (invalid enum or price hook).`,
      details: report.schemaViolations,
    });
  }

  return {
    shouldHalt: blockers.length > 0,
    blockerCount: blockers.length,
    blockers,
  };
};

// =============================================================================
// 5. BSON CANONICAL EJSON BACKUP & RESTORE UTILITIES
// =============================================================================

/**
 * Serializes MongoDB documents to Canonical BSON EJSON string (preserves Decimal128, Date, ObjectId).
 */
const serializeToEJSON = (documents) => {
  const { EJSON } = mongoose.mongo.BSON;
  return EJSON.stringify(documents, null, 0, { relaxed: false });
};

/**
 * Parses Canonical BSON EJSON string back to MongoDB document objects with true BSON types.
 */
const deserializeFromEJSON = (jsonString) => {
  const { EJSON } = mongoose.mongo.BSON;
  return EJSON.parse(jsonString);
};

/**
 * Dumps a single collection to a canonical EJSON file.
 */
const backupCollection = async (db, collectionName, outputDir) => {
  fs.mkdirSync(outputDir, { recursive: true });
  const docs = await db.collection(collectionName).find({}).toArray();
  const filePath = path.join(outputDir, `${collectionName}.json`);
  const content = serializeToEJSON(docs);
  fs.writeFileSync(filePath, content, "utf8");
  return { collectionName, count: docs.length, filePath };
};

/**
 * Restores a collection from a canonical EJSON file.
 */
const restoreCollection = async (db, collectionName, filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Backup file not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, "utf8");
  const docs = deserializeFromEJSON(content);
  if (docs.length > 0) {
    await db.collection(collectionName).insertMany(docs, { ordered: false });
  }
  return { collectionName, restoredCount: docs.length };
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
    const res = await backupCollection(db, c.name, targetDir);
    results.push(res);
  }

  return { backupDir: targetDir, collections: results };
};

module.exports = {
  UNIQUE_INDEX_SPECS,
  ORPHAN_CHECK_SPECS,
  runDuplicatePreflight,
  runOrphanPreflight,
  runSchemaPreflight,
  runFullPreflight,
  evaluateSafeHalt,
  serializeToEJSON,
  deserializeFromEJSON,
  backupCollection,
  restoreCollection,
  backupDatabase,
};

