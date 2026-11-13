/**
 * EDUNITY V3 — MIGRATION PREFLIGHT, BACKUP, DRY-RUN, FORWARD & ROLLBACK ENGINE (TASK G0-03)
 *
 * Provides:
 * 1. Full unique/partial-filter index specification matrix synced 100% with Mongoose models.
 * 2. Read-only duplicate key, referential orphan, and schema invariant preflight audits.
 * 3. Safe-halt circuit breaker protection.
 * 4. JobLock-protected V3 migration runner with mandatory pre-backup, dry-run default,
 *    forward execution (--apply), and deterministic rollback (--rollback).
 */

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { GRADE_LEVELS, COURSE_LEVELS } = require("../src/models/constants");
const { AuditLog } = require("../src/models");
const jobLock = require("../src/jobs/jobLock");

// =============================================================================
// 1. UNIQUE INDEX SPECIFICATIONS (Synced across ALL active Mongoose models)
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
    collection: "learningpaths",
    indexName: "slug_1",
    keys: { slug: 1 },
    unique: true,
    description: "Unique learning path slug",
    pipeline: [
      { $match: { slug: { $exists: true, $ne: null } } },
      { $group: { _id: "$slug", count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "coursepricingpolicies",
    indexName: "policyKey_1_version_1",
    keys: { policyKey: 1, version: 1 },
    unique: true,
    description: "Unique pricing policy key and version",
    pipeline: [
      { $group: { _id: { policyKey: "$policyKey", version: "$version" }, count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "syllabusversions",
    indexName: "courseId_1_versionNumber_1",
    keys: { courseId: 1, versionNumber: 1 },
    unique: true,
    description: "Unique syllabus version number per course",
    pipeline: [
      { $group: { _id: { courseId: "$courseId", versionNumber: "$versionNumber" }, count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "syllabusversions",
    indexName: "courseId_1",
    keys: { courseId: 1 },
    unique: true,
    partialFilterExpression: { status: "PUBLISHED", isDeleted: false },
    description: "At most one active PUBLISHED non-deleted syllabus version per course",
    pipeline: [
      { $match: { status: "PUBLISHED", isDeleted: false } },
      { $group: { _id: "$courseId", count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "curriculumunits",
    indexName: "syllabusVersionId_1_unitOrder_1",
    keys: { syllabusVersionId: 1, unitOrder: 1 },
    unique: true,
    partialFilterExpression: { isDeleted: false },
    description: "Unique non-deleted unit order per syllabus version",
    pipeline: [
      { $match: { isDeleted: false } },
      { $group: { _id: { syllabusVersionId: "$syllabusVersionId", unitOrder: "$unitOrder" }, count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "scheduleidempotencykeys",
    indexName: "teacherId_1_classId_1_operation_1_idempotencyKey_1",
    keys: { teacherId: 1, classId: 1, operation: 1, idempotencyKey: 1 },
    unique: true,
    description: "Unique idempotency key per teacher/class/schedule operation",
    pipeline: [
      {
        $group: {
          _id: {
            teacherId: "$teacherId",
            classId: "$classId",
            operation: "$operation",
            idempotencyKey: "$idempotencyKey",
          },
          count: { $sum: 1 },
          ids: { $push: "$_id" },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "teacherschedulelocks",
    indexName: "teacherId_1",
    keys: { teacherId: 1 },
    unique: true,
    description: "Unique schedule serialization mutex document per teacher",
    pipeline: [
      { $group: { _id: "$teacherId", count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "teachersubjectauthorizations",
    indexName: "teacherId_1_subjectId_1_gradeLevel_1_level_1",
    keys: { teacherId: 1, subjectId: 1, gradeLevel: 1, level: 1 },
    unique: true,
    description: "Unique teacher authorization tuple per subject/grade/level",
    pipeline: [
      {
        $group: {
          _id: {
            teacherId: "$teacherId",
            subjectId: "$subjectId",
            gradeLevel: "$gradeLevel",
            level: "$level",
          },
          count: { $sum: 1 },
          ids: { $push: "$_id" },
        },
      },
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
    partialFilterExpression: { status: { $in: ["DRAFT", "SUBMITTED", "NEED_MORE_INFORMATION", "DOSSIER_VERIFIED", "APPROVED"] } },
    description: "Unique active or approved application per student per campaign",
    pipeline: [
      { $match: { status: { $in: ["DRAFT", "SUBMITTED", "NEED_MORE_INFORMATION", "DOSSIER_VERIFIED", "APPROVED"] } } },
      { $group: { _id: { studentId: "$studentId", campaignId: "$campaignId" }, count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "scholarshipapplications",
    indexName: "applicationCode_1",
    keys: { applicationCode: 1 },
    unique: true,
    partialFilterExpression: { applicationCode: { $type: "string" } },
    description: "Unique string application code across scholarship dossiers",
    pipeline: [
      { $match: { applicationCode: { $type: "string" } } },
      { $group: { _id: "$applicationCode", count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "paperdossierreceipts",
    indexName: "receiptCode_1",
    keys: { receiptCode: 1 },
    unique: true,
    description: "Unique paper dossier receipt code",
    pipeline: [
      { $group: { _id: "$receiptCode", count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "paperdossierreceipts",
    indexName: "trackingKey_1",
    keys: { trackingKey: 1 },
    unique: true,
    partialFilterExpression: {
      trackingKey: { $type: "string" },
      status: { $in: ["RECEIVED", "IN_RECONCILIATION", "DISCREPANCY", "RECONCILED"] },
    },
    description: "Unique active postal trackingKey across paper receipts",
    pipeline: [
      {
        $match: {
          trackingKey: { $type: "string" },
          status: { $in: ["RECEIVED", "IN_RECONCILIATION", "DISCREPANCY", "RECONCILED"] },
        },
      },
      { $group: { _id: "$trackingKey", count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "paperdossierreceipts",
    indexName: "applicationId_1",
    keys: { applicationId: 1 },
    unique: true,
    partialFilterExpression: {
      applicationId: { $type: "objectId" },
      status: { $in: ["RECEIVED", "IN_RECONCILIATION", "DISCREPANCY", "RECONCILED"] },
    },
    description: "Unique active linked paper receipt per scholarship application",
    pipeline: [
      {
        $match: {
          applicationId: { $type: "objectId" },
          status: { $in: ["RECEIVED", "IN_RECONCILIATION", "DISCREPANCY", "RECONCILED"] },
        },
      },
      { $group: { _id: "$applicationId", count: { $sum: 1 }, ids: { $push: "$_id" } } },
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
    collection: "conversations",
    indexName: "channelType_1_classId_1",
    keys: { channelType: 1, classId: 1 },
    unique: true,
    partialFilterExpression: { channelType: "CLASS" },
    description: "Unique CLASS messaging channel per class",
    pipeline: [
      { $match: { channelType: "CLASS" } },
      { $group: { _id: { channelType: "$channelType", classId: "$classId" }, count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "platformsettings",
    indexName: "key_1_version_1",
    keys: { key: 1, version: 1 },
    unique: true,
    description: "Unique setting key and version number",
    pipeline: [
      { $group: { _id: { key: "$key", version: "$version" }, count: { $sum: 1 }, ids: { $push: "$_id" } } },
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
  {
    collection: "teachercontractreviewpackets",
    indexName: "packetCode_1",
    keys: { packetCode: 1 },
    unique: true,
    description: "Unique contract review coordination packet code",
    pipeline: [
      { $group: { _id: "$packetCode", count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ],
  },
  {
    collection: "teachercontractreviewpackets",
    indexName: "teacherId_1",
    keys: { teacherId: 1 },
    unique: true,
    partialFilterExpression: {
      status: { $in: ["DRAFT", "READY_FOR_CONTRACT_TEAM", "ACKNOWLEDGED_PENDING_TEA12", "ON_HOLD"] },
    },
    description: "Single active (non-CLOSED) contract review coordination packet per teacher",
    pipeline: [
      {
        $match: {
          status: { $in: ["DRAFT", "READY_FOR_CONTRACT_TEAM", "ACKNOWLEDGED_PENDING_TEA12", "ON_HOLD"] },
        },
      },
      { $group: { _id: "$teacherId", count: { $sum: 1 }, ids: { $push: "$_id" } } },
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

const runSchemaPreflight = async (db) => {
  const violations = [];

  try {
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

    const badProposalLevels = await db
      .collection("courseproposals")
      .find({
        level: { $exists: true, $nin: [...COURSE_LEVELS, null] },
      })
      .project({ _id: 1, title: 1, level: 1 })
      .toArray();

    if (badProposalLevels.length > 0) {
      violations.push({
        rule: "COURSE_PROPOSAL_LEVEL_INVALID",
        description: `Found course proposals with invalid level enum (expected one of ${COURSE_LEVELS.join(", ")})`,
        count: badProposalLevels.length,
        samples: badProposalLevels.slice(0, 5),
      });
    }

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
const evaluateSafeHalt = (report, options = {}) => {
  const blockers = [];
  const allowLegacyBasicToBeginner = Boolean(options.allowLegacyBasicToBeginner);

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

  const blockingSchema = (report.schemaViolations || []).filter((v) => {
    if (!allowLegacyBasicToBeginner) return true;
    const isLevelRule = v.rule === "COURSE_LEVEL_INVALID" || v.rule === "COURSE_PROPOSAL_LEVEL_INVALID";
    if (!isLevelRule) return true;
    // Allow automatic transform only if samples appear limited to convertible legacy "BASIC"
    return false;
  });

  if (blockingSchema.length > 0) {
    blockers.push({
      rule: "SCHEMA_VALIDATION_VIOLATION",
      message: `Detected ${blockingSchema.length} schema invariant violation(s) (invalid enum or price hook).`,
      details: blockingSchema,
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

const serializeToEJSON = (documents) => {
  const { EJSON } = mongoose.mongo.BSON;
  return EJSON.stringify(documents, null, 0, { relaxed: false });
};

const deserializeFromEJSON = (jsonString) => {
  const { EJSON } = mongoose.mongo.BSON;
  return EJSON.parse(jsonString);
};

const backupCollection = async (db, collectionName, outputDir) => {
  fs.mkdirSync(outputDir, { recursive: true });
  const docs = await db.collection(collectionName).find({}).toArray();
  const filePath = path.join(outputDir, `${collectionName}.json`);
  const content = serializeToEJSON(docs);
  fs.writeFileSync(filePath, content, "utf8");
  return { collectionName, count: docs.length, filePath };
};

const restoreCollection = async (db, collectionName, filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Backup file not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, "utf8");
  const docs = deserializeFromEJSON(content);
  if (docs.length > 0) {
    await db.collection(collectionName).insertMany(docs, { ordered: true });
  }
  return { collectionName, restoredCount: docs.length };
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
    const res = await backupCollection(db, c.name, targetDir);
    results.push(res);
  }

  return { backupDir: targetDir, collections: results };
};

// =============================================================================
// 6. EXECUTABLE V3 MIGRATION ENGINE (DRY-RUN / APPLY / ROLLBACK + GUARDRAIL)
// =============================================================================

const assertMigrationAllowed = ({
  dbName,
  connectionUri = "",
  allowProduction = false,
  confirmDb = "",
} = {}) => {
  const isProdNodeEnv = process.env.NODE_ENV === "production";
  const isProdDbName = String(dbName || "").trim().toLowerCase() === "edunity";
  const isRemote =
    Boolean(connectionUri) &&
    !connectionUri.includes("127.0.0.1") &&
    !connectionUri.includes("localhost");

  if (isProdNodeEnv || (isProdDbName && isRemote)) {
    if (!allowProduction || String(confirmDb || "") !== String(dbName || "")) {
      throw new Error(
        `[PRODUCTION GUARD] Refusing destructive/forward migration on "${dbName}" without both --allow-production and --confirm-db=${dbName}`
      );
    }
  }
};

const snapshotCollectionCounts = async (db) => {
  const collections = (await db.listCollections().toArray())
    .map((c) => c.name)
    .filter((name) => !name.startsWith("system."));
  const counts = {};
  for (const name of collections) {
    counts[name] = await db.collection(name).countDocuments({});
  }
  return counts;
};

const getExistingIndexNames = async (coll) => {
  if (typeof coll.indexes === "function") {
    return (await coll.indexes()).map((i) => i.name);
  }
  if (typeof coll.listIndexes === "function") {
    return (await coll.listIndexes().toArray()).map((i) => i.name);
  }
  return [];
};

const recordAuditIfAvailable = async ({ actorId, action, targetId, beforeState, afterState }) => {
  try {
    if (actorId && mongoose.isValidObjectId(actorId) && mongoose.connection.readyState === 1) {
      await AuditLog.create({
        actorAdminId: actorId,
        action,
        targetType: "DatabaseMigration",
        targetId,
        beforeState,
        afterState,
      });
    }
  } catch {
    // Non-fatal in unit/script runs without Admin actor
  }
};

/**
 * Executes V3 academic migration in one of three modes:
 * - dryRun (default): read-only preflight + plan estimation (0 writes)
 * - apply: JobLock -> Preflight & SafeHalt -> Mandatory Checksum Backup -> Data Transform -> Index Build -> Postflight
 * - rollback: JobLock -> Drop newly created indexes -> Verified EJSON restore -> Postflight
 */
const runV3AcademicMigration = async (options = {}) => {
  const {
    db = mongoose.connection.db,
    connectionUri = process.env.MONGODB_URI || "",
    apply = false,
    rollback = false,
    backupDir = null,
    outputDir = path.join(__dirname, "..", "backups", "migrations"),
    allowProduction = false,
    confirmDb = "",
    actorId = null,
    useLock = mongoose.connection.readyState === 1 && mongoose.models.JobLock,
  } = options;

  if (!db) {
    throw new Error("Database handle `db` is required for migration");
  }

  const dbName = db.databaseName || "unknown";
  const {
    backupDatabase: backupFullWithManifest,
    restoreDatabase: restoreFullVerified,
    reconcileIndexes,
  } = require("./backupRestoreClone");

  if (!apply && !rollback) {
    const preflightReport = await runFullPreflight(db);
    const safeHalt = evaluateSafeHalt(preflightReport, { allowLegacyBasicToBeginner: true });
    const legacyBasicCourses = await db.collection("courses").countDocuments({ level: { $in: ["BASIC", "basic"] } });
    const legacyBasicProposals = await db
      .collection("courseproposals")
      .countDocuments({ level: { $in: ["BASIC", "basic"] } });

    return {
      mode: "DRY_RUN",
      dbName,
      preflightReport,
      safeHalt,
      plannedTransforms: {
        legacyCoursesBasicToBeginner: legacyBasicCourses,
        legacyProposalsBasicToBeginner: legacyBasicProposals,
        uniqueIndexesToEnsure: UNIQUE_INDEX_SPECS.length,
      },
      wroteChanges: false,
    };
  }

  assertMigrationAllowed({ dbName, connectionUri, allowProduction, confirmDb });

  const executeLocked = async () => {
    const migrationRunId = new mongoose.Types.ObjectId();

    // -------------------------------------------------------------------------
    // ROLLBACK MODE
    // -------------------------------------------------------------------------
    if (rollback) {
      const targetBackupDir = backupDir || options.rollbackDir;
      if (!targetBackupDir || !fs.existsSync(targetBackupDir)) {
        throw new Error(`Rollback backup directory not found: ${targetBackupDir}`);
      }

      const manifestPath = path.join(targetBackupDir, "migration-manifest.json");
      const createdIndexes = fs.existsSync(manifestPath)
        ? JSON.parse(fs.readFileSync(manifestPath, "utf8")).createdIndexes || []
        : [];

      // Restore data first from checksum-verified backup (aborts cleanly if corrupted)
      const restoreResult = await restoreFullVerified(db, targetBackupDir, { drop: true });

      // Remove indexes created specifically by the forward run if they did not exist before
      const droppedIndexes = [];
      for (const idx of createdIndexes) {
        try {
          const coll = db.collection(idx.collection);
          const names = await getExistingIndexNames(coll);
          if (names.includes(idx.indexName) && typeof coll.dropIndex === "function") {
            await coll.dropIndex(idx.indexName);
            droppedIndexes.push(idx);
          }
        } catch {
          // ignore already-removed index
        }
      }

      await recordAuditIfAvailable({
        actorId,
        action: "V3_MIGRATION_ROLLBACK",
        targetId: migrationRunId,
        beforeState: { targetBackupDir },
        afterState: { restoredCollections: restoreResult.restoredCollections, droppedIndexes },
      });

      return {
        mode: "ROLLBACK",
        success: true,
        dbName,
        targetBackupDir,
        restoreResult,
        droppedIndexes,
      };
    }

    // -------------------------------------------------------------------------
    // FORWARD APPLY MODE
    // -------------------------------------------------------------------------
    const preflightReport = await runFullPreflight(db);
    const safeHalt = evaluateSafeHalt(preflightReport, { allowLegacyBasicToBeginner: true });
    if (safeHalt.shouldHalt) {
      return {
        mode: "APPLY",
        success: false,
        halted: true,
        reason: "MIGRATION_SAFE_HALT",
        dbName,
        preflightReport,
        safeHalt,
        wroteChanges: false,
      };
    }

    // Mandatory checksum-verified backup BEFORE any write
    const preCounts = await snapshotCollectionCounts(db);
    const backup = await backupFullWithManifest(db, outputDir);
    if (!backup || !backup.backupDir || !fs.existsSync(backup.manifestPath)) {
      throw new Error("MIGRATION_BACKUP_FAILED: aborting before any mutation");
    }

    const createdIndexes = [];
    const transformStats = { coursesNormalized: 0, courseProposalsNormalized: 0 };

    try {
      // Normalize legacy level="BASIC" -> "BEGINNER"
      const courseRes = await db
        .collection("courses")
        .updateMany({ level: { $in: ["BASIC", "basic"] } }, { $set: { level: "BEGINNER" } });
      transformStats.coursesNormalized = courseRes.modifiedCount || 0;

      const proposalRes = await db
        .collection("courseproposals")
        .updateMany({ level: { $in: ["BASIC", "basic"] } }, { $set: { level: "BEGINNER" } });
      transformStats.courseProposalsNormalized = proposalRes.modifiedCount || 0;

      // Ensure unique/partial unique indexes safely and track newly created ones for rollback
      for (const spec of UNIQUE_INDEX_SPECS) {
        const coll = db.collection(spec.collection);
        const existingNames = await getExistingIndexNames(coll);
        if (existingNames.includes(spec.indexName)) continue;

        const indexOpts = {
          name: spec.indexName,
          unique: true,
        };
        if (spec.partialFilterExpression) {
          indexOpts.partialFilterExpression = spec.partialFilterExpression;
        }
        if (spec.sparse) {
          indexOpts.sparse = true;
        }

        const createdName = await coll.createIndex(spec.keys, indexOpts);
        createdIndexes.push({ collection: spec.collection, indexName: createdName || spec.indexName });
      }

      const manifest = {
        migrationRunId: migrationRunId.toString(),
        timestamp: new Date().toISOString(),
        dbName,
        backupDir: backup.backupDir,
        preCounts,
        transformStats,
        createdIndexes,
      };
      const manifestPath = path.join(backup.backupDir, "migration-manifest.json");
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

      const postflightCounts = await snapshotCollectionCounts(db);
      const indexParity = await reconcileIndexes(db, UNIQUE_INDEX_SPECS);

      await recordAuditIfAvailable({
        actorId,
        action: "V3_MIGRATION_APPLY",
        targetId: migrationRunId,
        beforeState: { preCounts },
        afterState: { transformStats, createdIndexes, postflightCounts, indexParityPassed: indexParity.allIndexesPresent },
      });

      return {
        mode: "APPLY",
        success: indexParity.allIndexesPresent,
        halted: false,
        dbName,
        backupDir: backup.backupDir,
        manifestPath,
        transformStats,
        createdIndexes,
        preCounts,
        postflightCounts,
        indexParity,
      };
    } catch (applyErr) {
      // Automatic compensating rollback on forward failure (e.g. unexpected E11000)
      await restoreFullVerified(db, backup.backupDir, { drop: true }).catch(() => {});
      for (const idx of createdIndexes) {
        await db.collection(idx.collection).dropIndex(idx.indexName).catch(() => {});
      }
      throw Object.assign(applyErr, { rolledBackFromBackup: backup.backupDir });
    }
  };

  if (useLock) {
    let innerResult;
    const lockRes = await jobLock.runExclusive("migration_v3_core", options.jobLockTtlMs || 15 * 60 * 1000, async () => {
      innerResult = await executeLocked();
      return innerResult;
    });
    if (lockRes && lockRes.skipped) {
      throw new Error(`MIGRATION_LOCKED: ${lockRes.reason || "Another migration instance holds the lock"}`);
    }
    if (lockRes && lockRes.error && !innerResult) {
      throw new Error(lockRes.error);
    }
    return innerResult || lockRes;
  }

  return executeLocked();
};

// =============================================================================
// 7. CLI ENTRYPOINT (--dry-run | --apply | --rollback <dir>)
// =============================================================================
if (require.main === module) {
  require("dotenv").config();
  const connectDB = require("../src/config/db");

  const args = process.argv.slice(2);
  const hasFlag = (flag) => args.includes(flag);
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
      const result = await runV3AcademicMigration({
        db: mongoose.connection.db,
        connectionUri: uri,
        apply: hasFlag("--apply"),
        rollback: hasFlag("--rollback"),
        backupDir: getArgValue("--backup-dir") || getArgValue("--rollback"),
        outputDir: getArgValue("--output-dir") || undefined,
        allowProduction: hasFlag("--allow-production"),
        confirmDb: getArgValue("--confirm-db"),
      });
      console.log(JSON.stringify(result, null, 2));
      await mongoose.disconnect();
      process.exit(result.halted ? 2 : 0);
    } catch (err) {
      console.error("[MIGRATION ERROR]:", err.message);
      await mongoose.disconnect().catch(() => {});
      process.exit(1);
    }
  };

  runCLI();
}

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
  assertMigrationAllowed,
  runV3AcademicMigration,
};
