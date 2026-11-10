/**
 * EDUNITY V3 — SYLLABUS VERSIONING MIGRATION ENGINE (TASK CUR-02)
 *
 * Idempotent forward & backward migration converting legacy `Course.syllabus`
 * strings into structured `SyllabusVersion` (v1, status: PUBLISHED) and `CurriculumUnit`
 * documents while preserving `Course.syllabus` for full backward compatibility.
 *
 * Defaults to DRY-RUN unless `{ dryRun: false }` or `--execute` is explicitly provided.
 */

const mongoose = require("mongoose");
const defaultModels = require("../src/models");

const NOT_DELETED = { isDeleted: { $ne: true } };
const ALLOWED_MIGRATION_DATABASES = ["edunity_demo_v3", "edunity_test", "test"];

const assertSafeMigrationTarget = (dbName, connectionUri = "", allowProduction = false) => {
  const isLocalOrMemory =
    !connectionUri ||
    connectionUri.includes("127.0.0.1") ||
    connectionUri.includes("localhost");

  if (dbName === "edunity" && !isLocalOrMemory && !allowProduction) {
    throw new Error(
      `[SECURITY BLOCKER] Refusing to migrate production database "${dbName}" without explicit override (--allow-prod).`
    );
  }

  const isAllowed = ALLOWED_MIGRATION_DATABASES.includes(dbName) || isLocalOrMemory || allowProduction;
  if (!isAllowed) {
    throw new Error(
      `[SECURITY BLOCKER] Database "${dbName}" is not in allowed migration list [${ALLOWED_MIGRATION_DATABASES.join(", ")}].`
    );
  }
};

/**
 * Parses a legacy multiline `Course.syllabus` string into ordered unit titles.
 */
const parseLegacySyllabusLines = (syllabusText) => {
  if (typeof syllabusText !== "string") return [];
  return syllabusText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.replace(/^(?:\d+\s*[.):\-]\s+|[-*•]\s+)/, "").trim())
    .filter(Boolean);
};

/**
 * Runs read-only preflight checks prior to syllabus migration.
 */
const runSyllabusPreflight = async (options = {}) => {
  const models = options.models || defaultModels;
  const { Course, SyllabusVersion, CurriculumUnit } = models;

  const [courses, versions, units] = await Promise.all([
    Course.find(NOT_DELETED).select("_id title syllabus publishedSyllabusVersionId createdBy").lean(),
    SyllabusVersion.find(NOT_DELETED).select("_id courseId versionNumber status migratedFromLegacy").lean(),
    CurriculumUnit.find(NOT_DELETED).select("_id courseId syllabusVersionId unitOrder migratedFromLegacy").lean(),
  ]);

  const courseIds = new Set(courses.map((c) => c._id.toString()));
  const versionIds = new Set(versions.map((v) => v._id.toString()));

  // Detect duplicate active PUBLISHED versions for the same course
  const publishedByCourse = new Map();
  const duplicatePublishedCourses = [];
  const versionNumbersByCourse = new Set();
  const duplicateVersionNumbers = [];
  const orphanVersions = [];

  for (const v of versions) {
    const cid = v.courseId ? v.courseId.toString() : null;
    if (!cid || !courseIds.has(cid)) {
      orphanVersions.push(v._id.toString());
    }
    const verKey = `${cid}:${v.versionNumber}`;
    if (versionNumbersByCourse.has(verKey)) {
      duplicateVersionNumbers.push(verKey);
    }
    versionNumbersByCourse.add(verKey);

    if (v.status === "PUBLISHED") {
      if (publishedByCourse.has(cid)) {
        duplicatePublishedCourses.push(cid);
      } else {
        publishedByCourse.set(cid, v._id.toString());
      }
    }
  }

  const orphanUnits = [];
  for (const u of units) {
    const vid = u.syllabusVersionId ? u.syllabusVersionId.toString() : null;
    if (!vid || !versionIds.has(vid)) {
      orphanUnits.push(u._id.toString());
    }
  }

  const pendingCourses = courses.filter(
    (c) => !c.publishedSyllabusVersionId && parseLegacySyllabusLines(c.syllabus).length > 0
  );

  const blockers = [];
  if (duplicatePublishedCourses.length > 0) {
    blockers.push({ rule: "DUPLICATE_PUBLISHED_SYLLABUS", courses: duplicatePublishedCourses });
  }
  if (duplicateVersionNumbers.length > 0) {
    blockers.push({ rule: "DUPLICATE_SYLLABUS_VERSION_NUMBER", keys: duplicateVersionNumbers });
  }
  if (orphanVersions.length > 0) {
    blockers.push({ rule: "ORPHAN_SYLLABUS_VERSIONS", ids: orphanVersions });
  }
  if (orphanUnits.length > 0) {
    blockers.push({ rule: "ORPHAN_CURRICULUM_UNITS", ids: orphanUnits });
  }

  return {
    passed: blockers.length === 0,
    blockers,
    summary: {
      totalCourses: courses.length,
      alreadyPointingToVersion: courses.filter((c) => Boolean(c.publishedSyllabusVersionId)).length,
      pendingLegacyMigration: pendingCourses.length,
      totalVersions: versions.length,
      totalUnits: units.length,
    },
  };
};

/**
 * Forward migration: converts legacy `Course.syllabus` into `SyllabusVersion` v1 (PUBLISHED) + `CurriculumUnit`s.
 */
const migrateForward = async (options = {}) => {
  const {
    dryRun = true,
    actorAdminId = null,
    connectionUri = process.env.MONGODB_URI || "",
    allowProduction = false,
    models: injectedModels,
    logger = console.log,
  } = options;

  const currentDb = mongoose.connection.name || "edunity_test";
  assertSafeMigrationTarget(currentDb, connectionUri, allowProduction);

  const models = injectedModels || defaultModels;
  const { Course, SyllabusVersion, CurriculumUnit } = models;

  const courses = await Course.find(NOT_DELETED)
    .select("_id title syllabus publishedSyllabusVersionId createdBy createdAt")
    .lean();

  const stats = {
    dryRun,
    scanned: courses.length,
    migrated: 0,
    linkedExisting: 0,
    skippedAlreadyMigrated: 0,
    skippedEmptySyllabus: 0,
    unitsCreated: 0,
    plan: [],
  };

  for (const course of courses) {
    if (course.publishedSyllabusVersionId) {
      stats.skippedAlreadyMigrated += 1;
      continue;
    }

    // Check if an active PUBLISHED version already exists (idempotent recovery)
    const existingPublished = await SyllabusVersion.findOne({
      courseId: course._id,
      status: "PUBLISHED",
      ...NOT_DELETED,
    }).lean();

    if (existingPublished) {
      stats.linkedExisting += 1;
      stats.plan.push({
        courseId: course._id.toString(),
        title: course.title,
        action: "LINK_EXISTING_PUBLISHED",
        versionId: existingPublished._id.toString(),
      });
      if (!dryRun) {
        await Course.updateOne(
          { _id: course._id, publishedSyllabusVersionId: null },
          { $set: { publishedSyllabusVersionId: existingPublished._id } }
        );
      }
      continue;
    }

    const lines = parseLegacySyllabusLines(course.syllabus);
    if (lines.length === 0) {
      stats.skippedEmptySyllabus += 1;
      continue;
    }

    // Determine next safe versionNumber
    const latestVersion = await SyllabusVersion.findOne({ courseId: course._id })
      .sort({ versionNumber: -1 })
      .select("versionNumber")
      .lean();
    const versionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

    stats.migrated += 1;
    stats.unitsCreated += lines.length;
    stats.plan.push({
      courseId: course._id.toString(),
      title: course.title,
      action: "CREATE_MIGRATED_V1",
      versionNumber,
      unitCount: lines.length,
    });

    if (dryRun) continue;

    const ownerId = actorAdminId || course.createdBy;
    const publishedAt = course.createdAt || new Date();

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const [version] = await SyllabusVersion.create(
          [
            {
              courseId: course._id,
              versionNumber,
              title: "Phiên bản 1.0 (Khởi tạo từ giáo trình cũ)",
              summary: `Chuyển đổi tự động từ syllabus khóa học "${course.title}"`,
              status: "PUBLISHED",
              publishedAt,
              publishedBy: ownerId,
              migratedFromLegacy: true,
              createdBy: ownerId,
            },
          ],
          { session }
        );

        const unitDocs = lines.map((line, index) => ({
          syllabusVersionId: version._id,
          courseId: course._id,
          unitOrder: index + 1,
          title: line,
          description: "",
          learningObjectives: "",
          durationMinutes: null,
          topics: [],
          migratedFromLegacy: true,
          createdBy: ownerId,
        }));

        await CurriculumUnit.insertMany(unitDocs, { session });

        // Link pointer without overwriting legacy Course.syllabus
        await Course.updateOne(
          { _id: course._id },
          { $set: { publishedSyllabusVersionId: version._id } },
          { session }
        );
      });
    } finally {
      session.endSession();
    }
  }

  logger(
    `[migrateSyllabusVersions] Forward ${dryRun ? "(DRY-RUN)" : "(EXECUTED)"}: ` +
      `scanned=${stats.scanned}, migrated=${stats.migrated}, linkedExisting=${stats.linkedExisting}, ` +
      `skippedAlready=${stats.skippedAlreadyMigrated}, skippedEmpty=${stats.skippedEmptySyllabus}, units=${stats.unitsCreated}`
  );

  return stats;
};

/**
 * Safe rollback: reverts ONLY migration-created SyllabusVersions (`migratedFromLegacy: true`),
 * restoring Course.publishedSyllabusVersionId = null while preserving Course.syllabus and user-created versions.
 */
const migrateBackward = async (options = {}) => {
  const {
    dryRun = true,
    connectionUri = process.env.MONGODB_URI || "",
    allowProduction = false,
    models: injectedModels,
    logger = console.log,
  } = options;

  const currentDb = mongoose.connection.name || "edunity_test";
  assertSafeMigrationTarget(currentDb, connectionUri, allowProduction);

  const models = injectedModels || defaultModels;
  const { Course, SyllabusVersion, CurriculumUnit } = models;

  const migratedVersions = await SyllabusVersion.find({ migratedFromLegacy: true })
    .select("_id courseId")
    .lean();
  const migratedVersionIds = migratedVersions.map((v) => v._id);

  const unitCount = migratedVersionIds.length
    ? await CurriculumUnit.countDocuments({
        $or: [{ migratedFromLegacy: true }, { syllabusVersionId: { $in: migratedVersionIds } }],
      })
    : 0;

  const stats = {
    dryRun,
    versionsToRemove: migratedVersionIds.length,
    unitsToRemove: unitCount,
    coursesCleared: 0,
  };

  if (dryRun || migratedVersionIds.length === 0) {
    logger(
      `[migrateSyllabusVersions] Rollback ${dryRun ? "(DRY-RUN)" : "(EXECUTED)"}: ` +
        `versions=${stats.versionsToRemove}, units=${stats.unitsToRemove}`
    );
    return stats;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const courseRes = await Course.updateMany(
        { publishedSyllabusVersionId: { $in: migratedVersionIds } },
        { $set: { publishedSyllabusVersionId: null } },
        { session }
      );
      stats.coursesCleared = courseRes.modifiedCount || 0;

      await CurriculumUnit.deleteMany(
        { $or: [{ migratedFromLegacy: true }, { syllabusVersionId: { $in: migratedVersionIds } }] },
        { session }
      );
      await SyllabusVersion.deleteMany({ _id: { $in: migratedVersionIds }, migratedFromLegacy: true }, { session });
    });
  } finally {
    session.endSession();
  }

  logger(
    `[migrateSyllabusVersions] Rollback EXECUTED: clearedCourses=${stats.coursesCleared}, ` +
      `removedVersions=${stats.versionsToRemove}, removedUnits=${stats.unitsToRemove}`
  );
  return stats;
};

if (require.main === module) {
  require("dotenv").config();
  const connectDB = require("../src/config/db");

  const args = new Set(process.argv.slice(2));
  const dryRun = !args.has("--execute");
  const isRollback = args.has("--rollback");
  const isPreflight = args.has("--preflight");
  const allowProduction = args.has("--allow-prod") && process.env.ALLOW_PROD_MIGRATION === "true";

  const runCLI = async () => {
    try {
      const uri = process.env.MONGODB_URI;
      await connectDB(uri);

      if (isPreflight) {
        const preflight = await runSyllabusPreflight();
        console.log(JSON.stringify(preflight, null, 2));
      } else if (isRollback) {
        await migrateBackward({ dryRun, connectionUri: uri, allowProduction });
      } else {
        await migrateForward({ dryRun, connectionUri: uri, allowProduction });
      }

      await mongoose.disconnect();
      process.exit(0);
    } catch (err) {
      console.error("[SYLLABUS MIGRATION ERROR]:", err.message);
      await mongoose.disconnect().catch(() => {});
      process.exit(1);
    }
  };

  runCLI();
}

module.exports = {
  ALLOWED_MIGRATION_DATABASES,
  assertSafeMigrationTarget,
  parseLegacySyllabusLines,
  runSyllabusPreflight,
  migrateForward,
  migrateBackward,
};

