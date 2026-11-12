const mongoose = require("mongoose");
const { LearningPath, Category, Course, AuditLog } = require("../models");
const { GRADE_LEVELS, LEARNING_PATH_STATUSES } = require("../models/constants");
const { AppError } = require("../utils/errors");
const { toPublic } = require("../utils/publicView");
const { assertId, paged, validationError, escapeRegex, isBlank } = require("../utils/http");
const { slugify, uniqueSlug } = require("../utils/slug");
const { resolveGradeLevel } = require("../utils/gradeLevel");
const catalog = require("./courseCatalogService");

const NOT_DELETED = { isDeleted: { $ne: true } };

const isDuplicateKeyError = (err) =>
  Boolean(err && (err.code === 11000 || (err.cause && err.cause.code === 11000)));

const toPublicLearningPath = (doc, courseMap = null) => {
  const view = toPublic(doc);
  delete view.publishedBy;
  delete view.archivedBy;

  if (Array.isArray(view.steps)) {
    view.steps = view.steps.map((step) => {
      const course = courseMap ? courseMap.get(String(step.courseId)) : null;
      return {
        stepOrder: step.stepOrder,
        courseId: String(step.courseId),
        isRequired: Boolean(step.isRequired),
        prerequisiteCourseIds: Array.isArray(step.prerequisiteCourseIds)
          ? step.prerequisiteCourseIds.map((id) => String(id))
          : [],
        notes: step.notes || "",
        course: course
          ? {
              id: String(course._id),
              title: course.title,
              slug: course.slug,
              level: course.level || null,
              gradeLevel: course.gradeLevel || null,
              curriculumReference: course.curriculumReference || null,
              status: course.status,
            }
          : null,
      };
    });
  }
  return view;
};

const loadCoursesForPaths = async (paths) => {
  const courseIds = new Set();
  for (const pathDoc of paths) {
    for (const step of pathDoc.steps || []) {
      if (step && step.courseId) courseIds.add(String(step.courseId));
    }
  }
  if (courseIds.size === 0) return new Map();
  const courses = await Course.find({ _id: { $in: Array.from(courseIds) }, ...NOT_DELETED })
    .select("title slug level gradeLevel curriculumReference status")
    .lean();
  return new Map(courses.map((c) => [String(c._id), c]));
};

const resolvePathSlug = async (body, fallbackText, excludeId = null) => {
  if (isBlank(body.slug)) return uniqueSlug(LearningPath, fallbackText);
  const slug = slugify(body.slug);
  if (!slug) throw validationError("slug is invalid");
  const query = { slug };
  if (excludeId) query._id = { $ne: excludeId };
  if (await LearningPath.exists(query)) {
    throw new AppError("Slug already exists", "DUPLICATE_SLUG", 409);
  }
  return slug;
};

/**
 * Validates ordered LearningPath steps and prerequisite DAG sequence:
 * - Each courseId must exist, not be soft-deleted, and be ACTIVE.
 * - No duplicate courseId inside the same LearningPath.
 * - stepOrder must be unique positive integers.
 * - Every prerequisiteCourseId MUST belong to a strictly earlier step (stepOrder < current.stepOrder),
 *   preventing self-dependencies, forward dependencies, and cycles.
 */
const normalizeAndValidateSteps = async (rawSteps, { requireActiveCourses = true } = {}) => {
  if (rawSteps === undefined) return [];
  if (!Array.isArray(rawSteps)) throw validationError("steps must be an array");

  const rawNormalized = [];
  const usedOrders = new Set();
  const usedCourseIds = new Set();
  let nextAutoOrder = 1;

  for (const item of rawSteps) {
    if (!item || typeof item !== "object") {
      throw validationError("Each learning path step must be an object");
    }
    if (!item.courseId || !mongoose.isValidObjectId(item.courseId)) {
      throw validationError("Each step requires a valid courseId");
    }
    const courseIdStr = String(item.courseId);
    if (usedCourseIds.has(courseIdStr)) {
      throw new AppError(
        `Course ${courseIdStr} appears multiple times in the same learning path`,
        "DUPLICATE_LEARNING_PATH_COURSE",
        409
      );
    }
    usedCourseIds.add(courseIdStr);

    let stepOrder = item.stepOrder;
    if (stepOrder !== undefined && stepOrder !== null) {
      if (!Number.isInteger(stepOrder) || stepOrder < 1) {
        throw validationError("stepOrder must be a positive integer");
      }
      if (usedOrders.has(stepOrder)) {
        throw new AppError(`Duplicate stepOrder ${stepOrder}`, "DUPLICATE_STEP_ORDER", 409);
      }
    } else {
      while (usedOrders.has(nextAutoOrder)) nextAutoOrder += 1;
      stepOrder = nextAutoOrder;
    }
    usedOrders.add(stepOrder);

    const prereqRaw = Array.isArray(item.prerequisiteCourseIds) ? item.prerequisiteCourseIds : [];
    const prereqIds = [];
    for (const pid of prereqRaw) {
      if (!mongoose.isValidObjectId(pid)) {
        throw validationError(`Invalid prerequisiteCourseId: ${pid}`);
      }
      const pStr = String(pid);
      if (!prereqIds.includes(pStr)) prereqIds.push(pStr);
    }

    rawNormalized.push({
      stepOrder,
      courseId: new mongoose.Types.ObjectId(courseIdStr),
      courseIdStr,
      isRequired: item.isRequired !== undefined ? Boolean(item.isRequired) : true,
      prerequisiteCourseIds: prereqIds,
      notes: item.notes !== undefined && item.notes !== null ? String(item.notes).trim() : "",
    });
  }

  // Sort ascending by stepOrder
  rawNormalized.sort((a, b) => a.stepOrder - b.stepOrder);

  // Verify referenced Course existence & active status
  if (usedCourseIds.size > 0) {
    const courses = await Course.find({
      _id: { $in: Array.from(usedCourseIds) },
      ...NOT_DELETED,
    })
      .select("_id status title")
      .lean();
    const courseById = new Map(courses.map((c) => [String(c._id), c]));

    for (const step of rawNormalized) {
      const course = courseById.get(step.courseIdStr);
      if (!course) {
        throw new AppError(`Course ${step.courseIdStr} not found`, "COURSE_NOT_FOUND", 404);
      }
      if (requireActiveCourses && course.status !== "ACTIVE") {
        throw new AppError(
          `Course "${course.title}" is not ACTIVE and cannot be included in a learning path`,
          "COURSE_NOT_ACTIVE",
          400
        );
      }
    }
  }

  // Validate prerequisite DAG ordering (strictly earlier steps only)
  const earlierCourses = new Set();
  for (const step of rawNormalized) {
    for (const prereqId of step.prerequisiteCourseIds) {
      if (prereqId === step.courseIdStr) {
        throw new AppError(
          `Course ${step.courseIdStr} cannot list itself as a prerequisite`,
          "LEARNING_PATH_INVALID_PREREQUISITE",
          400
        );
      }
      if (!earlierCourses.has(prereqId)) {
        throw new AppError(
          `Prerequisite course ${prereqId} must appear in an earlier step before course ${step.courseIdStr}`,
          "LEARNING_PATH_INVALID_PREREQUISITE",
          400
        );
      }
    }
    earlierCourses.add(step.courseIdStr);
  }

  return rawNormalized.map(({ courseIdStr, ...rest }) => ({
    ...rest,
    prerequisiteCourseIds: rest.prerequisiteCourseIds.map((id) => new mongoose.Types.ObjectId(id)),
  }));
};

const validateCategoryAndGrade = async (categoryIdInput, gradeLevelInput) => {
  let category = null;
  if (categoryIdInput !== undefined && categoryIdInput !== null && categoryIdInput !== "") {
    assertId(categoryIdInput, "Category not found", "CATEGORY_NOT_FOUND");
    category = await Category.findOne({ _id: categoryIdInput, ...NOT_DELETED }).lean();
    if (!category) throw new AppError("Category not found", "CATEGORY_NOT_FOUND", 404);
    if (category.status !== "ACTIVE") {
      throw validationError("Category is not active");
    }
  }

  let gradeLevel = null;
  if (category) {
    gradeLevel = resolveGradeLevel(category, gradeLevelInput === "" ? null : gradeLevelInput);
  } else if (gradeLevelInput !== undefined && gradeLevelInput !== null && gradeLevelInput !== "") {
    if (!GRADE_LEVELS.includes(gradeLevelInput)) {
      throw new AppError("gradeLevel is not a standard grade level", "INVALID_GRADE_LEVEL", 400);
    }
    gradeLevel = gradeLevelInput;
  }

  return { category, categoryId: category ? category._id : null, gradeLevel };
};

const getLearningPathOrThrow = async (id) => {
  assertId(id, "Learning path not found", "LEARNING_PATH_NOT_FOUND");
  const doc = await LearningPath.findOne({ _id: id, ...NOT_DELETED });
  if (!doc) throw new AppError("Learning path not found", "LEARNING_PATH_NOT_FOUND", 404);
  return doc;
};

const createLearningPath = async (adminId, body = {}) => {
  if (isBlank(body.title)) throw validationError("title is required");

  const { categoryId, gradeLevel } = await validateCategoryAndGrade(body.categoryId, body.gradeLevel);
  const targetLevel = body.targetLevel !== undefined ? catalog.resolveLevel(body.targetLevel) : null;
  const steps = await normalizeAndValidateSteps(body.steps || [], { requireActiveCourses: true });

  const requestedStatus = body.status === undefined ? "DRAFT" : String(body.status).trim().toUpperCase();
  if (!["DRAFT", "PUBLISHED"].includes(requestedStatus)) {
    throw validationError("Initial status must be DRAFT or PUBLISHED");
  }
  if (requestedStatus === "PUBLISHED" && steps.length === 0) {
    throw validationError("Cannot publish a learning path without at least one course step");
  }

  const now = new Date();
  let created;
  try {
    created = await LearningPath.create({
      title: body.title.trim(),
      slug: await resolvePathSlug(body, body.title),
      description: body.description !== undefined && body.description !== null ? String(body.description).trim() : "",
      categoryId,
      gradeLevel,
      targetLevel,
      steps,
      status: requestedStatus,
      publishedAt: requestedStatus === "PUBLISHED" ? now : null,
      publishedBy: requestedStatus === "PUBLISHED" ? adminId : null,
      createdBy: adminId,
      updatedBy: adminId,
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new AppError("Slug already exists", "DUPLICATE_SLUG", 409);
    }
    throw err;
  }

  await AuditLog.create({
    actorAdminId: adminId,
    action: "LEARNING_PATH_CREATED",
    targetType: "LearningPath",
    targetId: created._id,
    beforeState: null,
    afterState: {
      title: created.title,
      slug: created.slug,
      status: created.status,
      stepCount: steps.length,
    },
  });

  const obj = created.toObject();
  const courseMap = await loadCoursesForPaths([obj]);
  return {
    ...obj,
    steps: toPublicLearningPath(obj, courseMap).steps,
  };
};

const updateLearningPath = async (adminId, pathId, body = {}) => {
  const lp = await getLearningPathOrThrow(pathId);
  if (lp.status === "ARCHIVED") {
    throw new AppError("Archived learning path cannot be modified", "LEARNING_PATH_IMMUTABLE", 409);
  }

  const beforeState = {
    title: lp.title,
    status: lp.status,
    stepCount: Array.isArray(lp.steps) ? lp.steps.length : 0,
  };

  if (body.title !== undefined) {
    if (isBlank(body.title)) throw validationError("title must not be empty");
    lp.title = body.title.trim();
  }
  if (body.slug !== undefined) {
    lp.slug = await resolvePathSlug(body, lp.title, lp._id);
  }
  if (body.description !== undefined) {
    lp.description = body.description === null ? "" : String(body.description).trim();
  }
  if (body.categoryId !== undefined || body.gradeLevel !== undefined) {
    const nextCategoryId = body.categoryId !== undefined ? body.categoryId : lp.categoryId;
    const nextGradeLevel = body.gradeLevel !== undefined ? body.gradeLevel : lp.gradeLevel;
    const validated = await validateCategoryAndGrade(nextCategoryId, nextGradeLevel);
    lp.categoryId = validated.categoryId;
    lp.gradeLevel = validated.gradeLevel;
  }
  if (body.targetLevel !== undefined) {
    lp.targetLevel = body.targetLevel === null || body.targetLevel === "" ? null : catalog.resolveLevel(body.targetLevel);
  }
  if (body.steps !== undefined) {
    const nextSteps = await normalizeAndValidateSteps(body.steps, { requireActiveCourses: true });
    if (lp.status === "PUBLISHED" && nextSteps.length === 0) {
      throw validationError("Published learning path must contain at least one step");
    }
    lp.steps = nextSteps;
  }

  lp.updatedBy = adminId;
  try {
    await lp.save();
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new AppError("Slug already exists", "DUPLICATE_SLUG", 409);
    }
    throw err;
  }

  await AuditLog.create({
    actorAdminId: adminId,
    action: "LEARNING_PATH_UPDATED",
    targetType: "LearningPath",
    targetId: lp._id,
    beforeState,
    afterState: {
      title: lp.title,
      status: lp.status,
      stepCount: Array.isArray(lp.steps) ? lp.steps.length : 0,
    },
  });

  const obj = lp.toObject();
  const courseMap = await loadCoursesForPaths([obj]);
  return { ...obj, steps: toPublicLearningPath(obj, courseMap).steps };
};

const publishLearningPath = async (adminId, pathId) => {
  const lp = await getLearningPathOrThrow(pathId);
  if (lp.status === "ARCHIVED") {
    throw new AppError("Archived learning path cannot be published", "LEARNING_PATH_IMMUTABLE", 409);
  }
  if (lp.status === "PUBLISHED") {
    throw new AppError("Learning path is already published", "LEARNING_PATH_ALREADY_PUBLISHED", 409);
  }
  if (!Array.isArray(lp.steps) || lp.steps.length === 0) {
    throw validationError("Cannot publish a learning path with zero steps");
  }

  // Re-verify active courses & DAG before publish
  await normalizeAndValidateSteps(lp.steps, { requireActiveCourses: true });

  const now = new Date();
  lp.status = "PUBLISHED";
  lp.publishedAt = now;
  lp.publishedBy = adminId;
  lp.updatedBy = adminId;
  await lp.save();

  await AuditLog.create({
    actorAdminId: adminId,
    action: "LEARNING_PATH_PUBLISHED",
    targetType: "LearningPath",
    targetId: lp._id,
    beforeState: { status: "DRAFT" },
    afterState: { status: "PUBLISHED", publishedAt: now, stepCount: lp.steps.length },
  });

  const obj = lp.toObject();
  const courseMap = await loadCoursesForPaths([obj]);
  return { ...obj, steps: toPublicLearningPath(obj, courseMap).steps };
};

const archiveLearningPath = async (adminId, pathId) => {
  const lp = await getLearningPathOrThrow(pathId);
  if (lp.status === "ARCHIVED") {
    throw new AppError("Learning path is already archived", "LEARNING_PATH_IMMUTABLE", 409);
  }
  const prevStatus = lp.status;
  const now = new Date();
  lp.status = "ARCHIVED";
  lp.archivedAt = now;
  lp.archivedBy = adminId;
  lp.updatedBy = adminId;
  await lp.save();

  await AuditLog.create({
    actorAdminId: adminId,
    action: "LEARNING_PATH_ARCHIVED",
    targetType: "LearningPath",
    targetId: lp._id,
    beforeState: { status: prevStatus },
    afterState: { status: "ARCHIVED", archivedAt: now },
  });

  return lp.toObject();
};

const deleteLearningPath = async (adminId, pathId) => {
  const lp = await getLearningPathOrThrow(pathId);
  const now = new Date();
  lp.isDeleted = true;
  lp.deletedAt = now;
  lp.deletedBy = adminId;
  if (lp.status !== "ARCHIVED") {
    lp.status = "ARCHIVED";
    lp.archivedAt = now;
    lp.archivedBy = adminId;
  }
  lp.updatedBy = adminId;
  await lp.save();

  await AuditLog.create({
    actorAdminId: adminId,
    action: "LEARNING_PATH_DELETED",
    targetType: "LearningPath",
    targetId: lp._id,
    beforeState: { isDeleted: false },
    afterState: { isDeleted: true, deletedAt: now },
  });

  return { deleted: true, id: lp._id.toString() };
};

const buildQueryFilter = (query, { publicOnly = false } = {}) => {
  const filter = { ...NOT_DELETED };
  if (publicOnly) {
    filter.status = "PUBLISHED";
  } else if (query.status) {
    if (!LEARNING_PATH_STATUSES.includes(query.status)) {
      throw validationError(`status must be one of ${LEARNING_PATH_STATUSES.join(", ")}`);
    }
    filter.status = query.status;
  }

  if (query.categoryId) {
    if (!mongoose.isValidObjectId(query.categoryId)) throw validationError("categoryId is invalid");
    filter.categoryId = query.categoryId;
  }
  if (query.gradeLevel) {
    if (!GRADE_LEVELS.includes(query.gradeLevel)) {
      throw new AppError("gradeLevel is not a standard grade level", "INVALID_GRADE_LEVEL", 400);
    }
    filter.gradeLevel = query.gradeLevel;
  }
  if (query.targetLevel) {
    filter.targetLevel = catalog.resolveLevel(query.targetLevel);
  }
  if (query.courseId) {
    if (!mongoose.isValidObjectId(query.courseId)) throw validationError("courseId is invalid");
    filter["steps.courseId"] = query.courseId;
  }
  if (query.search && typeof query.search === "string" && query.search.trim()) {
    const pattern = { $regex: escapeRegex(query.search.trim()), $options: "i" };
    filter.$or = [{ title: pattern }, { description: pattern }];
  }
  return filter;
};

const listPublicLearningPaths = async (query = {}, paging) => {
  const filter = buildQueryFilter(query, { publicOnly: true });
  const [items, total] = await Promise.all([
    LearningPath.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    LearningPath.countDocuments(filter),
  ]);
  const courseMap = await loadCoursesForPaths(items);
  return paged(items.map((item) => toPublicLearningPath(item, courseMap)), total, paging);
};

const getPublicLearningPath = async (idOrSlug) => {
  const filter = mongoose.isValidObjectId(idOrSlug)
    ? { _id: idOrSlug, status: "PUBLISHED", ...NOT_DELETED }
    : { slug: String(idOrSlug || "").toLowerCase(), status: "PUBLISHED", ...NOT_DELETED };

  const lp = await LearningPath.findOne(filter).lean();
  if (!lp) throw new AppError("Learning path not found", "LEARNING_PATH_NOT_FOUND", 404);

  const courseMap = await loadCoursesForPaths([lp]);
  return toPublicLearningPath(lp, courseMap);
};

const adminListLearningPaths = async (query = {}, paging) => {
  const filter = buildQueryFilter(query, { publicOnly: false });
  const [items, total] = await Promise.all([
    LearningPath.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    LearningPath.countDocuments(filter),
  ]);
  const courseMap = await loadCoursesForPaths(items);
  return paged(
    items.map((item) => ({ ...item, steps: toPublicLearningPath(item, courseMap).steps })),
    total,
    paging
  );
};

const adminGetLearningPath = async (pathId) => {
  const lp = await getLearningPathOrThrow(pathId);
  const obj = lp.toObject();
  const courseMap = await loadCoursesForPaths([obj]);
  return { ...obj, steps: toPublicLearningPath(obj, courseMap).steps };
};

module.exports = {
  createLearningPath,
  updateLearningPath,
  publishLearningPath,
  archiveLearningPath,
  deleteLearningPath,
  listPublicLearningPaths,
  getPublicLearningPath,
  adminListLearningPaths,
  adminGetLearningPath,
  normalizeAndValidateSteps,
};

