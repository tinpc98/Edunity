const mongoose = require("mongoose");
const { Course, SyllabusVersion, CurriculumUnit } = require("../models");
const { AppError } = require("../utils/errors");
const { toPublic } = require("../utils/publicView");
const { assertId, validationError, isBlank } = require("../utils/http");
const { audit } = require("./auditService");

const NOT_DELETED = { isDeleted: { $ne: true } };

const toPublicSyllabusVersion = (doc) => {
  const view = toPublic(doc);
  delete view.publishedBy;
  delete view.archivedBy;
  delete view.clonedFromVersionId;
  delete view.migratedFromLegacy;
  return view;
};

const toPublicCurriculumUnit = (doc) => {
  const view = toPublic(doc);
  delete view.migratedFromLegacy;
  return view;
};

const isDuplicateKeyError = (err) => Boolean(err && (err.code === 11000 || (err.cause && err.cause.code === 11000)));

const getCourseOrThrow = async (courseId) => {
  assertId(courseId, "Course not found", "COURSE_NOT_FOUND");
  const course = await Course.findOne({ _id: courseId, ...NOT_DELETED });
  if (!course) throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);
  return course;
};

const getVersionForCourseOrThrow = async (courseId, versionId) => {
  assertId(versionId, "Syllabus version not found", "SYLLABUS_VERSION_NOT_FOUND");
  const version = await SyllabusVersion.findOne({
    _id: versionId,
    courseId,
    ...NOT_DELETED,
  });
  if (!version) throw new AppError("Syllabus version not found", "SYLLABUS_VERSION_NOT_FOUND", 404);
  return version;
};

const getUnitForVersionOrThrow = async (versionId, courseId, unitId) => {
  assertId(unitId, "Curriculum unit not found", "CURRICULUM_UNIT_NOT_FOUND");
  const unit = await CurriculumUnit.findOne({
    _id: unitId,
    syllabusVersionId: versionId,
    courseId,
    ...NOT_DELETED,
  });
  if (!unit) throw new AppError("Curriculum unit not found", "CURRICULUM_UNIT_NOT_FOUND", 404);
  return unit;
};

const assertDraftVersion = (version) => {
  if (version.status !== "DRAFT") {
    throw new AppError(
      `Syllabus version in status ${version.status} is immutable; create a new DRAFT version instead`,
      "SYLLABUS_VERSION_IMMUTABLE",
      409
    );
  }
};

const validateUnitInput = (input, { requireTitle = true } = {}) => {
  if (!input || typeof input !== "object") {
    throw validationError("Curriculum unit payload must be an object");
  }
  if (requireTitle || input.title !== undefined) {
    if (isBlank(input.title)) throw validationError("title is required for curriculum unit");
  }
  if (input.unitOrder !== undefined && input.unitOrder !== null) {
    if (!Number.isInteger(input.unitOrder) || input.unitOrder < 1) {
      throw validationError("unitOrder must be a positive integer");
    }
  }
  if (input.durationMinutes !== undefined && input.durationMinutes !== null) {
    if (typeof input.durationMinutes !== "number" || !Number.isFinite(input.durationMinutes) || input.durationMinutes < 0) {
      throw validationError("durationMinutes must be a non-negative number");
    }
  }
  if (input.topics !== undefined && input.topics !== null) {
    if (!Array.isArray(input.topics) || input.topics.some((t) => typeof t !== "string")) {
      throw validationError("topics must be an array of strings");
    }
  }
};

const normalizeTopics = (topics) =>
  Array.isArray(topics) ? topics.map((t) => t.trim()).filter(Boolean) : [];

const prepareInitialUnits = (unitsInput, { courseId, syllabusVersionId, adminId }) => {
  if (!Array.isArray(unitsInput) || unitsInput.length === 0) return [];
  const usedOrders = new Set();
  let nextAutoOrder = 1;

  return unitsInput.map((raw) => {
    validateUnitInput(raw, { requireTitle: true });
    let unitOrder = raw.unitOrder;
    if (unitOrder === undefined || unitOrder === null) {
      while (usedOrders.has(nextAutoOrder)) nextAutoOrder += 1;
      unitOrder = nextAutoOrder;
    }
    if (usedOrders.has(unitOrder)) {
      throw new AppError(`Duplicate unitOrder ${unitOrder} in request payload`, "DUPLICATE_UNIT_ORDER", 409);
    }
    usedOrders.add(unitOrder);

    return {
      syllabusVersionId,
      courseId,
      unitOrder,
      title: raw.title.trim(),
      description: raw.description !== undefined && raw.description !== null ? String(raw.description).trim() : "",
      learningObjectives:
        raw.learningObjectives !== undefined && raw.learningObjectives !== null
          ? String(raw.learningObjectives).trim()
          : "",
      durationMinutes: raw.durationMinutes !== undefined ? raw.durationMinutes : null,
      topics: normalizeTopics(raw.topics),
      migratedFromLegacy: false,
      createdBy: adminId,
    };
  });
};

/**
 * Admin: Creates a new DRAFT SyllabusVersion (optionally cloned from an existing version or seeded with units).
 */
const createDraftVersion = async (adminId, courseId, body = {}) => {
  const course = await getCourseOrThrow(courseId);

  if (body.cloneFromVersionId && Array.isArray(body.units) && body.units.length > 0) {
    throw validationError("Cannot specify both cloneFromVersionId and units");
  }

  let sourceVersion = null;
  let sourceUnits = [];
  if (body.cloneFromVersionId) {
    sourceVersion = await getVersionForCourseOrThrow(course._id, body.cloneFromVersionId);
    sourceUnits = await CurriculumUnit.find({
      syllabusVersionId: sourceVersion._id,
      courseId: course._id,
      ...NOT_DELETED,
    })
      .sort({ unitOrder: 1 })
      .lean();
  } else {
    if (isBlank(body.title)) throw validationError("title is required");
  }

  if (body.title !== undefined && isBlank(body.title)) {
    throw validationError("title must not be empty");
  }

  const session = await mongoose.startSession();
  let createdVersion;
  let createdUnits = [];

  try {
    await session.withTransaction(async () => {
      const latest = await SyllabusVersion.findOne({ courseId: course._id })
        .sort({ versionNumber: -1 })
        .select("versionNumber")
        .lean();
      const versionNumber = latest ? latest.versionNumber + 1 : 1;

      const resolvedTitle = !isBlank(body.title)
        ? body.title.trim()
        : `${sourceVersion.title} (Bản nháp v${versionNumber})`;
      const resolvedSummary =
        body.summary !== undefined && body.summary !== null
          ? String(body.summary).trim()
          : sourceVersion
          ? sourceVersion.summary || ""
          : "";

      try {
        [createdVersion] = await SyllabusVersion.create(
          [
            {
              courseId: course._id,
              versionNumber,
              title: resolvedTitle,
              summary: resolvedSummary,
              status: "DRAFT",
              clonedFromVersionId: sourceVersion ? sourceVersion._id : null,
              migratedFromLegacy: false,
              createdBy: adminId,
            },
          ],
          { session }
        );
      } catch (err) {
        if (isDuplicateKeyError(err)) {
          throw new AppError("Concurrent syllabus version number conflict, please retry", "SYLLABUS_VERSION_CONFLICT", 409);
        }
        throw err;
      }

      let unitsToInsert = [];
      if (sourceVersion && sourceUnits.length > 0) {
        unitsToInsert = sourceUnits.map((u) => ({
          syllabusVersionId: createdVersion._id,
          courseId: course._id,
          unitOrder: u.unitOrder,
          title: u.title,
          description: u.description || "",
          learningObjectives: u.learningObjectives || "",
          durationMinutes: u.durationMinutes !== undefined ? u.durationMinutes : null,
          topics: Array.isArray(u.topics) ? u.topics : [],
          migratedFromLegacy: false,
          createdBy: adminId,
        }));
      } else if (Array.isArray(body.units) && body.units.length > 0) {
        unitsToInsert = prepareInitialUnits(body.units, {
          courseId: course._id,
          syllabusVersionId: createdVersion._id,
          adminId,
        });
      }

      if (unitsToInsert.length > 0) {
        createdUnits = await CurriculumUnit.insertMany(unitsToInsert, { session });
      }

      await audit(
        {
          actorAdminId: adminId,
          action: "SYLLABUS_VERSION_CREATED",
          targetType: "SyllabusVersion",
          targetId: createdVersion._id,
          beforeState: null,
          afterState: {
            courseId: course._id,
            versionNumber,
            status: "DRAFT",
            clonedFromVersionId: sourceVersion ? sourceVersion._id : null,
            unitCount: unitsToInsert.length,
          },
        },
        session
      );
    });
  } finally {
    session.endSession();
  }

  const versionObj = typeof createdVersion.toObject === "function" ? createdVersion.toObject() : createdVersion;
  return {
    ...versionObj,
    units: createdUnits.map((u) => (typeof u.toObject === "function" ? u.toObject() : u)),
  };
};

/**
 * Admin: Lists all SyllabusVersions of a Course sorted descending by versionNumber.
 */
const listVersions = async (courseId) => {
  const course = await getCourseOrThrow(courseId);
  const versions = await SyllabusVersion.find({ courseId: course._id, ...NOT_DELETED })
    .sort({ versionNumber: -1 })
    .lean();

  return {
    courseId: course._id,
    courseTitle: course.title,
    publishedSyllabusVersionId: course.publishedSyllabusVersionId || null,
    versions,
  };
};

/**
 * Admin: Gets full detail of a SyllabusVersion and its ordered CurriculumUnits.
 */
const getVersionDetail = async (courseId, versionId) => {
  const course = await getCourseOrThrow(courseId);
  const version = await getVersionForCourseOrThrow(course._id, versionId);
  const units = await CurriculumUnit.find({
    syllabusVersionId: version._id,
    courseId: course._id,
    ...NOT_DELETED,
  })
    .sort({ unitOrder: 1 })
    .lean();

  const versionObj = typeof version.toObject === "function" ? version.toObject() : version;
  return {
    ...versionObj,
    units,
  };
};

/**
 * Public: Gets only the active PUBLISHED syllabus and its units for an ACTIVE Course.
 * Never exposes DRAFT or ARCHIVED versions or internal staff fields.
 * Falls back gracefully to Course.syllabus when the course has no published SyllabusVersion.
 */
const getPublishedSyllabus = async (courseId) => {
  const course = await getCourseOrThrow(courseId);
  if (course.status !== "ACTIVE") {
    throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);
  }

  const filter = {
    courseId: course._id,
    status: "PUBLISHED",
    ...NOT_DELETED,
  };
  if (course.publishedSyllabusVersionId) {
    filter._id = course.publishedSyllabusVersionId;
  }

  const published = await SyllabusVersion.findOne(filter).lean();
  if (!published) {
    return {
      courseId: course._id,
      courseTitle: course.title,
      source: course.syllabus ? "LEGACY" : "NONE",
      version: null,
      units: [],
      legacySyllabus: course.syllabus || null,
    };
  }

  const units = await CurriculumUnit.find({
    syllabusVersionId: published._id,
    courseId: course._id,
    ...NOT_DELETED,
  })
    .sort({ unitOrder: 1 })
    .lean();

  return {
    courseId: course._id,
    courseTitle: course.title,
    source: "VERSIONED",
    version: toPublicSyllabusVersion(published),
    units: units.map(toPublicCurriculumUnit),
    legacySyllabus: course.syllabus || null,
  };
};

/**
 * Admin: Updates metadata (title, summary) of a DRAFT SyllabusVersion.
 */
const updateDraftVersion = async (adminId, courseId, versionId, body = {}) => {
  const course = await getCourseOrThrow(courseId);
  const version = await getVersionForCourseOrThrow(course._id, versionId);
  assertDraftVersion(version);

  if (body.title !== undefined) {
    if (isBlank(body.title)) throw validationError("title must not be empty");
    version.title = body.title.trim();
  }
  if (body.summary !== undefined) {
    version.summary = body.summary === null ? "" : String(body.summary).trim();
  }
  version.updatedBy = adminId;
  await version.save();

  const units = await CurriculumUnit.find({
    syllabusVersionId: version._id,
    courseId: course._id,
    ...NOT_DELETED,
  })
    .sort({ unitOrder: 1 })
    .lean();

  const versionObj = typeof version.toObject === "function" ? version.toObject() : version;
  return { ...versionObj, units };
};

/**
 * Admin: Adds a CurriculumUnit to a DRAFT SyllabusVersion.
 */
const addUnit = async (adminId, courseId, versionId, body = {}) => {
  const course = await getCourseOrThrow(courseId);
  const version = await getVersionForCourseOrThrow(course._id, versionId);
  assertDraftVersion(version);
  validateUnitInput(body, { requireTitle: true });

  let unitOrder = body.unitOrder;
  if (unitOrder === undefined || unitOrder === null) {
    const lastUnit = await CurriculumUnit.findOne({
      syllabusVersionId: version._id,
      courseId: course._id,
      ...NOT_DELETED,
    })
      .sort({ unitOrder: -1 })
      .select("unitOrder")
      .lean();
    unitOrder = lastUnit ? lastUnit.unitOrder + 1 : 1;
  }

  try {
    const unit = await CurriculumUnit.create({
      syllabusVersionId: version._id,
      courseId: course._id,
      unitOrder,
      title: body.title.trim(),
      description: body.description !== undefined && body.description !== null ? String(body.description).trim() : "",
      learningObjectives:
        body.learningObjectives !== undefined && body.learningObjectives !== null
          ? String(body.learningObjectives).trim()
          : "",
      durationMinutes: body.durationMinutes !== undefined ? body.durationMinutes : null,
      topics: normalizeTopics(body.topics),
      migratedFromLegacy: false,
      createdBy: adminId,
    });
    return typeof unit.toObject === "function" ? unit.toObject() : unit;
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new AppError(`unitOrder ${unitOrder} already exists in this syllabus version`, "DUPLICATE_UNIT_ORDER", 409);
    }
    throw err;
  }
};

/**
 * Admin: Updates a CurriculumUnit inside a DRAFT SyllabusVersion.
 */
const updateUnit = async (adminId, courseId, versionId, unitId, body = {}) => {
  const course = await getCourseOrThrow(courseId);
  const version = await getVersionForCourseOrThrow(course._id, versionId);
  assertDraftVersion(version);

  const unit = await getUnitForVersionOrThrow(version._id, course._id, unitId);
  validateUnitInput(body, { requireTitle: false });

  if (body.title !== undefined) unit.title = body.title.trim();
  if (body.description !== undefined) {
    unit.description = body.description === null ? "" : String(body.description).trim();
  }
  if (body.learningObjectives !== undefined) {
    unit.learningObjectives = body.learningObjectives === null ? "" : String(body.learningObjectives).trim();
  }
  if (body.durationMinutes !== undefined) unit.durationMinutes = body.durationMinutes;
  if (body.topics !== undefined) unit.topics = normalizeTopics(body.topics);
  if (body.unitOrder !== undefined && body.unitOrder !== null) unit.unitOrder = body.unitOrder;

  unit.updatedBy = adminId;

  try {
    await unit.save();
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new AppError(`unitOrder ${unit.unitOrder} already exists in this syllabus version`, "DUPLICATE_UNIT_ORDER", 409);
    }
    throw err;
  }

  return typeof unit.toObject === "function" ? unit.toObject() : unit;
};

/**
 * Admin: Soft-deletes a CurriculumUnit inside a DRAFT SyllabusVersion.
 */
const deleteUnit = async (adminId, courseId, versionId, unitId) => {
  const course = await getCourseOrThrow(courseId);
  const version = await getVersionForCourseOrThrow(course._id, versionId);
  assertDraftVersion(version);

  const unit = await getUnitForVersionOrThrow(version._id, course._id, unitId);
  unit.isDeleted = true;
  unit.deletedAt = new Date();
  unit.deletedBy = adminId;
  unit.updatedBy = adminId;
  await unit.save();

  return {
    deleted: true,
    unitId: unit._id,
    syllabusVersionId: version._id,
  };
};

/**
 * Admin: Atomically reorders all active CurriculumUnits inside a DRAFT SyllabusVersion.
 */
const reorderUnits = async (adminId, courseId, versionId, body = {}) => {
  const course = await getCourseOrThrow(courseId);
  const version = await getVersionForCourseOrThrow(course._id, versionId);
  assertDraftVersion(version);

  if (!Array.isArray(body.unitIds)) {
    throw validationError("unitIds array is required");
  }

  const normalizedIds = body.unitIds.map((id) => String(id));
  for (const id of normalizedIds) {
    if (!mongoose.isValidObjectId(id)) {
      throw validationError(`Invalid unitId in unitIds: ${id}`);
    }
  }
  if (new Set(normalizedIds).size !== normalizedIds.length) {
    throw validationError("unitIds must not contain duplicate IDs");
  }

  const existingUnits = await CurriculumUnit.find({
    syllabusVersionId: version._id,
    courseId: course._id,
    ...NOT_DELETED,
  })
    .select("_id")
    .lean();

  const existingSet = new Set(existingUnits.map((u) => u._id.toString()));
  if (
    normalizedIds.length !== existingSet.size ||
    normalizedIds.some((id) => !existingSet.has(id))
  ) {
    throw validationError("unitIds must include the exact set of active curriculum units in this version");
  }

  if (normalizedIds.length === 0) return [];

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Phase 1: shift unitOrders out of target range [1..N] to avoid transient E11000
      await CurriculumUnit.updateMany(
        { syllabusVersionId: version._id, courseId: course._id, ...NOT_DELETED },
        { $inc: { unitOrder: 100000 } },
        { session }
      );

      // Phase 2: assign final sequential 1..N order
      const ops = normalizedIds.map((id, index) => ({
        updateOne: {
          filter: { _id: id, syllabusVersionId: version._id, courseId: course._id, ...NOT_DELETED },
          update: { $set: { unitOrder: index + 1, updatedBy: adminId } },
        },
      }));
      await CurriculumUnit.bulkWrite(ops, { session });
    });
  } finally {
    session.endSession();
  }

  return CurriculumUnit.find({
    syllabusVersionId: version._id,
    courseId: course._id,
    ...NOT_DELETED,
  })
    .sort({ unitOrder: 1 })
    .lean();
};

/**
 * Admin: Atomically publishes a DRAFT SyllabusVersion, archiving any previously PUBLISHED version,
 * and updates Course.publishedSyllabusVersionId & summary Course.syllabus for backward compatibility.
 */
const publishVersion = async (adminId, courseId, versionId) => {
  const course = await getCourseOrThrow(courseId);
  const version = await getVersionForCourseOrThrow(course._id, versionId);

  if (version.status === "PUBLISHED") {
    throw new AppError("Syllabus version is already published", "SYLLABUS_VERSION_ALREADY_PUBLISHED", 409);
  }
  assertDraftVersion(version);

  const units = await CurriculumUnit.find({
    syllabusVersionId: version._id,
    courseId: course._id,
    ...NOT_DELETED,
  })
    .sort({ unitOrder: 1 })
    .lean();

  if (units.length === 0) {
    throw validationError("Cannot publish an empty syllabus version; add at least one curriculum unit first");
  }

  const now = new Date();
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const priorPublished = await SyllabusVersion.findOne({
        courseId: course._id,
        status: "PUBLISHED",
        ...NOT_DELETED,
      });

      if (priorPublished) {
        const archiveRes = await SyllabusVersion.updateOne(
          { _id: priorPublished._id, status: "PUBLISHED" },
          {
            $set: {
              status: "ARCHIVED",
              archivedAt: now,
              archivedBy: adminId,
              updatedBy: adminId,
            },
          },
          { session }
        );
        if (archiveRes.modifiedCount !== 1) {
          throw new AppError(
            "Concurrent publish conflict while archiving previous syllabus version",
            "SYLLABUS_PUBLISH_CONFLICT",
            409
          );
        }
      }

      let publishRes;
      try {
        publishRes = await SyllabusVersion.updateOne(
          { _id: version._id, courseId: course._id, status: "DRAFT", ...NOT_DELETED },
          {
            $set: {
              status: "PUBLISHED",
              publishedAt: now,
              publishedBy: adminId,
              updatedBy: adminId,
            },
          },
          { session }
        );
      } catch (err) {
        if (isDuplicateKeyError(err)) {
          throw new AppError(
            "Another syllabus version was concurrently published for this course",
            "SYLLABUS_PUBLISH_CONFLICT",
            409
          );
        }
        throw err;
      }

      if (publishRes.modifiedCount !== 1) {
        throw new AppError("Syllabus version is no longer in DRAFT status", "SYLLABUS_VERSION_IMMUTABLE", 409);
      }

      const syllabusSummary = units.map((u) => `${u.unitOrder}. ${u.title}`).join("\n");
      await Course.updateOne(
        { _id: course._id },
        {
          $set: {
            publishedSyllabusVersionId: version._id,
            syllabus: syllabusSummary,
            updatedBy: adminId,
          },
        },
        { session }
      );

      await audit(
        {
          actorAdminId: adminId,
          action: "SYLLABUS_VERSION_PUBLISHED",
          targetType: "SyllabusVersion",
          targetId: version._id,
          beforeState: {
            status: "DRAFT",
            previousPublishedVersionId: priorPublished ? priorPublished._id : null,
          },
          afterState: {
            status: "PUBLISHED",
            versionNumber: version.versionNumber,
            courseId: course._id,
            unitCount: units.length,
          },
        },
        session
      );
    });
  } finally {
    session.endSession();
  }

  const versionObj = typeof version.toObject === "function" ? version.toObject() : version;
  return {
    ...versionObj,
    status: "PUBLISHED",
    publishedAt: now,
    publishedBy: adminId,
    updatedBy: adminId,
    units,
  };
};

/**
 * Admin: Archives a DRAFT or PUBLISHED SyllabusVersion cleanly without overwriting historical records.
 */
const archiveVersion = async (adminId, courseId, versionId) => {
  const course = await getCourseOrThrow(courseId);
  const version = await getVersionForCourseOrThrow(course._id, versionId);

  if (version.status === "ARCHIVED") {
    throw new AppError("Syllabus version is already archived", "SYLLABUS_VERSION_IMMUTABLE", 409);
  }

  const previousStatus = version.status;
  const now = new Date();
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const res = await SyllabusVersion.updateOne(
        { _id: version._id, courseId: course._id, status: previousStatus, ...NOT_DELETED },
        {
          $set: {
            status: "ARCHIVED",
            archivedAt: now,
            archivedBy: adminId,
            updatedBy: adminId,
          },
        },
        { session }
      );

      if (res.modifiedCount !== 1) {
        throw new AppError("Concurrent status modification detected", "SYLLABUS_VERSION_IMMUTABLE", 409);
      }

      if (previousStatus === "PUBLISHED") {
        await Course.updateOne(
          { _id: course._id, publishedSyllabusVersionId: version._id },
          { $set: { publishedSyllabusVersionId: null, updatedBy: adminId } },
          { session }
        );
      }

      await audit(
        {
          actorAdminId: adminId,
          action: "SYLLABUS_VERSION_ARCHIVED",
          targetType: "SyllabusVersion",
          targetId: version._id,
          beforeState: { status: previousStatus },
          afterState: { status: "ARCHIVED", courseId: course._id },
        },
        session
      );
    });
  } finally {
    session.endSession();
  }

  const versionObj = typeof version.toObject === "function" ? version.toObject() : version;
  return {
    ...versionObj,
    status: "ARCHIVED",
    archivedAt: now,
    archivedBy: adminId,
    updatedBy: adminId,
  };
};

module.exports = {
  createDraftVersion,
  listVersions,
  getVersionDetail,
  getPublishedSyllabus,
  updateDraftVersion,
  addUnit,
  updateUnit,
  deleteUnit,
  reorderUnits,
  publishVersion,
  archiveVersion,
  toPublicSyllabusVersion,
  toPublicCurriculumUnit,
};

