const mongoose = require("mongoose");
const { Category, Subject, Course, Class } = require("../models");
const { GRADE_LEVELS, COURSE_LEVELS } = require("../models/constants");
const { AppError } = require("../utils/errors");
const { toPublic } = require("../utils/publicView");
const { assertId, paged, validationError, escapeRegex, isBlank } = require("../utils/http");
const { slugify, uniqueSlug } = require("../utils/slug");
const { allowedGradeLevelsForCategory, resolveGradeLevel } = require("../utils/gradeLevel");

const NOT_DELETED = { isDeleted: { $ne: true } };
const STATUSES = ["ACTIVE", "INACTIVE"];
const COURSE_TEXT_FIELDS = ["description", "learningObjectives", "syllabus", "prerequisites", "curriculumReference"];

const isDuplicateKeyError = (err) =>
  Boolean(err && (err.code === 11000 || (err.cause && err.cause.code === 11000)));

const presentCategory = (category) => ({
  ...category,
  allowedGradeLevels: allowedGradeLevelsForCategory(category), // BR-45: null = không giới hạn theo khối
});

const findByName = (Model, field, name, extra = {}) =>
  Model.findOne({ ...NOT_DELETED, ...extra, [field]: { $regex: `^${escapeRegex(name.trim())}$`, $options: "i" } });

const resolveSlug = async (Model, body, fallbackText) => {
  if (isBlank(body.slug)) return uniqueSlug(Model, fallbackText);
  const slug = slugify(body.slug);
  if (!slug) throw validationError("slug is invalid");
  if (await Model.exists({ slug })) throw new AppError("Slug already exists", "DUPLICATE_SLUG", 409);
  return slug;
};

const resolveStatus = (status) => {
  if (!STATUSES.includes(status)) throw validationError("status must be ACTIVE or INACTIVE");
  return status;
};

const normalizeLevel = (rawLevel) => {
  if (rawLevel === undefined || rawLevel === null || rawLevel === "") return undefined;
  const upper = String(rawLevel).trim().toUpperCase();
  if (upper === "BASIC") return "BEGINNER";
  return upper;
};

const resolveLevel = (level) => {
  const normalized = normalizeLevel(level);
  if (normalized === undefined) return undefined;
  if (!COURSE_LEVELS.includes(normalized)) throw validationError(`level must be one of ${COURSE_LEVELS.join(", ")}`);
  return normalized;
};

const getCategoryOrThrow = async (categoryId) => {
  assertId(categoryId, "Category not found", "CATEGORY_NOT_FOUND");
  const category = await Category.findOne({ _id: categoryId, ...NOT_DELETED });
  if (!category) throw new AppError("Category not found", "CATEGORY_NOT_FOUND", 404);
  return category;
};

const getSubjectOrThrow = async (subjectId) => {
  assertId(subjectId, "Subject not found", "SUBJECT_NOT_FOUND");
  const subject = await Subject.findOne({ _id: subjectId, ...NOT_DELETED });
  if (!subject) throw new AppError("Subject not found", "SUBJECT_NOT_FOUND", 404);
  return subject;
};

const getCourseOrThrow = async (courseId) => {
  assertId(courseId, "Course not found", "COURSE_NOT_FOUND");
  const course = await Course.findOne({ _id: courseId, ...NOT_DELETED });
  if (!course) throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);
  return course;
};

// ---------- Categories ----------

const listCategories = async () => {
  const categories = await Category.find({ status: "ACTIVE", ...NOT_DELETED }).sort({ name: 1 }).lean();
  return categories.map(presentCategory).map(toPublic);
};

const createCategory = async (adminId, body) => {
  if (isBlank(body.name)) throw validationError("name is required");
  if (await findByName(Category, "name", body.name)) {
    throw new AppError("Category already exists", "DUPLICATE_CATEGORY", 409);
  }

  let category;
  try {
    category = await Category.create({
      name: body.name,
      slug: await resolveSlug(Category, body, body.name),
      description: body.description,
      status: body.status === undefined ? "ACTIVE" : resolveStatus(body.status),
      createdBy: adminId,
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new AppError("Slug already exists", "DUPLICATE_SLUG", 409);
    throw err;
  }
  return presentCategory(category.toObject());
};

const updateCategory = async (adminId, categoryId, body) => {
  const category = await getCategoryOrThrow(categoryId);
  const renamed = typeof body.name === "string" && body.name.trim() !== category.name;

  if (body.name !== undefined) {
    if (isBlank(body.name)) throw validationError("name must not be empty");
    const duplicate = await findByName(Category, "name", body.name, { _id: { $ne: category._id } });
    if (duplicate) throw new AppError("Category already exists", "DUPLICATE_CATEGORY", 409);
    category.name = body.name;
  }
  if (body.description !== undefined) category.description = body.description;
  if (body.status !== undefined) category.status = resolveStatus(body.status);
  category.updatedBy = adminId;
  await category.save();

  if (renamed) {
    // categoryName is denormalized in Subject and Course
    await Subject.updateMany({ categoryId: category._id }, { $set: { categoryName: category.name } });
    await Course.updateMany({ categoryId: category._id }, { $set: { categoryName: category.name } });
  }
  return presentCategory(category.toObject());
};

// ---------- Subjects ----------

const listSubjectsByCategory = async (categoryId) => {
  const category = await getCategoryOrThrow(categoryId);
  const subjects = await Subject.find({ categoryId: category._id, status: "ACTIVE", ...NOT_DELETED }).sort({ name: 1 }).lean();
  return subjects.map(toPublic);
};

const getSubject = async (subjectId) => {
  const subject = await getSubjectOrThrow(subjectId);
  const courses = await Course.find({ subjectId: subject._id, status: "ACTIVE", ...NOT_DELETED })
    .select("title slug level gradeLevel")
    .sort({ title: 1 })
    .lean();
  return { ...toPublic(subject.toObject()), courses };
};

const createSubject = async (adminId, body) => {
  if (isBlank(body.name)) throw validationError("name is required");
  if (!body.categoryId) throw validationError("categoryId is required");
  const category = await getCategoryOrThrow(body.categoryId); // BR-02

  if (await findByName(Subject, "name", body.name, { categoryId: category._id })) {
    throw new AppError("Subject already exists in this category", "DUPLICATE_SUBJECT", 409);
  }

  let subject;
  try {
    subject = await Subject.create({
      categoryId: category._id,
      categoryName: category.name,
      name: body.name,
      slug: await resolveSlug(Subject, body, body.name),
      description: body.description,
      status: body.status === undefined ? "ACTIVE" : resolveStatus(body.status),
      createdBy: adminId,
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new AppError("Slug already exists", "DUPLICATE_SLUG", 409);
    throw err;
  }
  return subject.toObject();
};

const updateSubject = async (adminId, subjectId, body) => {
  const subject = await getSubjectOrThrow(subjectId);
  const renamed = typeof body.name === "string" && body.name.trim() !== subject.name;

  if (body.name !== undefined) {
    if (isBlank(body.name)) throw validationError("name must not be empty");
    const duplicate = await findByName(Subject, "name", body.name, {
      categoryId: subject.categoryId,
      _id: { $ne: subject._id },
    });
    if (duplicate) throw new AppError("Subject already exists in this category", "DUPLICATE_SUBJECT", 409);
    subject.name = body.name;
  }
  if (body.description !== undefined) subject.description = body.description;
  if (body.status !== undefined) subject.status = resolveStatus(body.status);
  subject.updatedBy = adminId;
  await subject.save();

  if (renamed) {
    await Course.updateMany({ subjectId: subject._id }, { $set: { subjectName: subject.name } });
  }
  return subject.toObject();
};

// ---------- Courses ----------

const searchCourses = async (query, paging) => {
  const filter = { status: "ACTIVE", ...NOT_DELETED };

  if (query.search) {
    const pattern = { $regex: escapeRegex(query.search), $options: "i" };
    filter.$or = [{ title: pattern }, { description: pattern }, { curriculumReference: pattern }];
  }
  for (const field of ["categoryId", "subjectId"]) {
    if (query[field]) {
      if (!mongoose.isValidObjectId(query[field])) throw validationError(`${field} is invalid`);
      filter[field] = query[field];
    }
  }
  if (query.gradeLevel) {
    // FR-STU-29 / BR-43
    if (!GRADE_LEVELS.includes(query.gradeLevel)) {
      throw new AppError("gradeLevel is not a standard grade level", "INVALID_GRADE_LEVEL", 400);
    }
    filter.gradeLevel = query.gradeLevel;
  }
  if (query.level) filter.level = resolveLevel(query.level);
  if (query.curriculumReference) {
    filter.curriculumReference = { $regex: escapeRegex(query.curriculumReference.trim()), $options: "i" };
  }

  const [items, total] = await Promise.all([
    Course.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    Course.countDocuments(filter),
  ]);
  return paged(items.map(toPublic), total, paging);
};

const getCourse = async (courseId) => {
  const course = await getCourseOrThrow(courseId);
  if (course.status !== "ACTIVE") throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);
  const openClassCount = await Class.countDocuments({ courseId: course._id, status: "OPEN", ...NOT_DELETED });
  return { ...toPublic(course.toObject()), openClassCount };
};

// FR-STU-11: only classes approved by Admin and OPEN are available to students
const getCourseClasses = async (courseId, paging) => {
  const course = await getCourseOrThrow(courseId);
  const filter = { courseId: course._id, status: "OPEN", ...NOT_DELETED };
  const [items, total] = await Promise.all([
    Class.find(filter).sort({ startDate: 1, createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    Class.countDocuments(filter),
  ]);
  return paged(items.map(toPublic), total, paging);
};

const assertCourseTitleAvailable = async (subjectId, title, excludeId) => {
  const extra = { subjectId };
  if (excludeId) extra._id = { $ne: excludeId };
  if (await findByName(Course, "title", title, extra)) {
    throw new AppError("A course with this title already exists in this subject", "DUPLICATE_COURSE", 409);
  }
};

/**
 * Creates a Course in the catalog. Shared by Admin "Create Course" and Course Proposal approval,
 * so both paths apply the same Subject/Category and gradeLevel rules (BR-03, BR-42..46).
 */
const insertCourse = async ({ adminId, subject, category, data, sourceProposalId = null, session }) => {
  if (isBlank(data.title)) throw validationError("title is required");
  await assertCourseTitleAvailable(subject._id, data.title);

  const doc = {
    subjectId: subject._id,
    subjectName: subject.name,
    categoryId: category._id,
    categoryName: category.name,
    title: data.title,
    slug: await uniqueSlug(Course, data.title),
    level: resolveLevel(data.level),
    gradeLevel: resolveGradeLevel(category, data.gradeLevel),
    status: "ACTIVE",
    sourceProposalId,
    createdBy: adminId,
  };
  for (const field of COURSE_TEXT_FIELDS) {
    if (data[field] !== undefined) doc[field] = data[field];
  }

  try {
    const [course] = await Course.create([doc], { session });
    return course;
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new AppError("Slug already exists", "DUPLICATE_SLUG", 409);
    throw err;
  }
};

const createCourse = async (adminId, body) => {
  if (!body.subjectId) throw validationError("subjectId is required");
  const subject = await getSubjectOrThrow(body.subjectId);
  const category = await getCategoryOrThrow(subject.categoryId);
  const course = await insertCourse({ adminId, subject, category, data: body });
  return course.toObject();
};

const updateCourse = async (adminId, courseId, body) => {
  const course = await getCourseOrThrow(courseId);
  const category = await getCategoryOrThrow(course.categoryId);

  if (body.syllabus !== undefined && course.publishedSyllabusVersionId && body.syllabus !== course.syllabus) {
    throw new AppError(
      "Course syllabus is governed by an immutable published SyllabusVersion; create a new DRAFT SyllabusVersion instead",
      "SYLLABUS_VERSION_IMMUTABLE",
      409
    );
  }

  const prevTitle = course.title;
  const prevStatus = course.status;

  if (body.title !== undefined) {
    if (isBlank(body.title)) throw validationError("title must not be empty");
    await assertCourseTitleAvailable(course.subjectId, body.title, course._id);
    course.title = body.title;
  }
  for (const field of COURSE_TEXT_FIELDS) {
    if (body[field] !== undefined) course[field] = body[field];
  }
  const levelUpdated = body.level !== undefined;
  if (levelUpdated) course.level = resolveLevel(body.level);
  if (body.gradeLevel !== undefined) course.gradeLevel = resolveGradeLevel(category, body.gradeLevel); // FR-ADM-22

  if (body.status !== undefined) {
    const nextStatus = resolveStatus(body.status);
    if (nextStatus === "ACTIVE" && course.status !== "ACTIVE") {
      // Reactivation gate: ensure Subject and Category are active
      const subject = await Subject.findOne({ _id: course.subjectId, ...NOT_DELETED });
      if (!subject) throw new AppError("Subject not found or deleted", "SUBJECT_NOT_FOUND", 400);
      if (subject.status !== "ACTIVE") {
        throw new AppError("Cannot activate course under an inactive subject", "SUBJECT_INACTIVE", 400);
      }
    }
    course.status = nextStatus;
  }

  course.updatedBy = adminId;
  await course.save();

  try {
    const { audit } = require("./auditService");
    await audit({
      actorAdminId: adminId,
      action: "COURSE_UPDATED",
      targetType: "Course",
      targetId: course._id,
      beforeState: { title: prevTitle, status: prevStatus },
      afterState: { title: course.title, status: course.status },
    });
  } catch (err) {
    // Non-blocking audit log
  }

  // courseTitle and gradeLevel are denormalized in Class
  await Class.updateMany({ courseId: course._id }, { $set: { courseTitle: course.title, gradeLevel: course.gradeLevel } });
  if (levelUpdated && course.level) {
    await Class.updateMany(
      { courseId: course._id, status: { $in: ["DRAFT", "REJECTED"] } },
      { $set: { level: course.level } }
    );
  }
  return course.toObject();
};

const adminListCourses = async (query, paging) => {
  const filter = { ...NOT_DELETED };

  if (query.status && query.status !== "ALL") {
    filter.status = resolveStatus(query.status);
  }

  if (query.search) {
    const pattern = { $regex: escapeRegex(query.search.trim()), $options: "i" };
    filter.$or = [
      { title: pattern },
      { slug: pattern },
      { description: pattern },
      { curriculumReference: pattern },
    ];
  }

  for (const field of ["categoryId", "subjectId"]) {
    if (query[field]) {
      if (!mongoose.isValidObjectId(query[field])) throw validationError(`${field} is invalid`);
      filter[field] = query[field];
    }
  }

  if (query.gradeLevel) {
    if (!GRADE_LEVELS.includes(query.gradeLevel)) {
      throw new AppError("gradeLevel is not a standard grade level", "INVALID_GRADE_LEVEL", 400);
    }
    filter.gradeLevel = query.gradeLevel;
  }

  if (query.level) filter.level = resolveLevel(query.level);
  if (query.curriculumReference) {
    filter.curriculumReference = { $regex: escapeRegex(query.curriculumReference.trim()), $options: "i" };
  }

  // Stable sort: default createdAt: -1, _id: -1
  let sort = { createdAt: -1, _id: -1 };
  if (query.sortBy) {
    const validSortFields = ["title", "createdAt", "updatedAt", "status"];
    const sortField = validSortFields.includes(query.sortBy) ? query.sortBy : "createdAt";
    const sortOrder = query.sortOrder === "asc" || query.sortOrder === "1" ? 1 : -1;
    sort = { [sortField]: sortOrder, _id: sortOrder };
  }

  const [items, total] = await Promise.all([
    Course.find(filter).sort(sort).skip(paging.skip).limit(paging.pageSize).lean(),
    Course.countDocuments(filter),
  ]);

  return paged(items, total, paging);
};

const adminGetCourse = async (courseId) => {
  const course = await getCourseOrThrow(courseId);
  // Admin detail returns Course regardless of status (ACTIVE or INACTIVE)
  const [openClassCount, totalClassCount] = await Promise.all([
    Class.countDocuments({ courseId: course._id, status: "OPEN", ...NOT_DELETED }),
    Class.countDocuments({ courseId: course._id, ...NOT_DELETED }),
  ]);
  return { ...course.toObject(), openClassCount, totalClassCount };
};

const deleteCourse = async (adminId, courseId) => {
  assertId(courseId, "Course not found", "COURSE_NOT_FOUND");

  if (typeof mongoose.startSession !== "function") {
    throw new AppError(
      "Database session is unavailable; course deletion requires transaction support",
      "DATABASE_TRANSACTION_UNAVAILABLE",
      503
    );
  }

  let session;
  try {
    session = await mongoose.startSession();
  } catch (sessionErr) {
    throw new AppError(
      "Failed to start database transaction session for course deletion",
      "DATABASE_TRANSACTION_UNAVAILABLE",
      503,
      { originalError: sessionErr.message }
    );
  }

  try {
    if (!session || typeof session.withTransaction !== "function") {
      throw new AppError(
        "Database session is unavailable; course deletion requires transaction support",
        "DATABASE_TRANSACTION_UNAVAILABLE",
        503
      );
    }

    let result;
    await session.withTransaction(async () => {
      // 1. Concurrency guard & exclusive write lock on Course document:
      // Atomically verify course exists and is ACTIVE/not deleted, while acquiring exclusive write lock
      const course = await Course.findOneAndUpdate(
        { _id: courseId, ...NOT_DELETED },
        { $inc: { lockVersion: 1 } },
        { session, returnDocument: "after" }
      );
      if (!course) throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);

      const originalStatus = course.status;
      const beforeState = { title: course.title, status: originalStatus };

      // 2. Dependency check: Class (any existing class)
      const classCount = await Class.countDocuments({ courseId: course._id }, { session });
      if (classCount > 0) {
        throw new AppError(
          `Cannot delete course: ${classCount} class(es) exist. Deactivate the course by setting status to INACTIVE instead.`,
          "COURSE_HAS_CLASSES",
          409,
          { classCount, recommendedAction: "SET_INACTIVE" }
        );
      }

      // 3. Dependency check: Enrollment
      const { Enrollment } = require("../models");
      const enrollmentCount = await Enrollment.countDocuments({ courseId: course._id }, { session });
      if (enrollmentCount > 0) {
        throw new AppError(
          `Cannot delete course: ${enrollmentCount} enrollment(s) exist. Deactivate the course by setting status to INACTIVE instead.`,
          "COURSE_HAS_ENROLLMENTS",
          409,
          { enrollmentCount, recommendedAction: "SET_INACTIVE" }
        );
      }

      // 4. Dependency check: SessionRefundReview (financial dispute / refund history)
      const { SessionRefundReview } = require("../models");
      const refundReviewCount = await SessionRefundReview.countDocuments({ courseId: course._id }, { session });
      if (refundReviewCount > 0) {
        throw new AppError(
          `Cannot delete course: ${refundReviewCount} financial refund review record(s) exist. Deactivate the course by setting status to INACTIVE instead.`,
          "COURSE_HAS_REFUND_REVIEWS",
          409,
          { refundReviewCount, recommendedAction: "SET_INACTIVE" }
        );
      }

      // 5. Dependency check: ScholarshipCampaign
      const { ScholarshipCampaign } = require("../models");
      const scholarshipCount = await ScholarshipCampaign.countDocuments(
        {
          courseIds: course._id,
          ...NOT_DELETED,
        },
        { session }
      );
      if (scholarshipCount > 0) {
        throw new AppError(
          `Cannot delete course: referenced in ${scholarshipCount} active scholarship campaign(s). Deactivate the course by setting status to INACTIVE instead.`,
          "COURSE_IN_SCHOLARSHIP_CAMPAIGN",
          409,
          { scholarshipCount, recommendedAction: "SET_INACTIVE" }
        );
      }

      // 6. Dependency check: LearningPath
      const { LearningPath } = require("../models");
      const learningPathCount = await LearningPath.countDocuments(
        {
          $or: [{ "steps.courseId": course._id }, { prerequisiteCourseIds: course._id }],
          ...NOT_DELETED,
        },
        { session }
      );
      if (learningPathCount > 0) {
        throw new AppError(
          `Cannot delete course: referenced in ${learningPathCount} learning path(s). Deactivate the course by setting status to INACTIVE instead.`,
          "COURSE_IN_LEARNING_PATH",
          409,
          { learningPathCount, recommendedAction: "SET_INACTIVE" }
        );
      }

      // 7. Dependency check: CoursePricingPolicy
      const { CoursePricingPolicy } = require("../models");
      const activePolicyCount = await CoursePricingPolicy.countDocuments(
        {
          courseId: course._id,
          status: "ACTIVE",
          ...NOT_DELETED,
        },
        { session }
      );
      if (activePolicyCount > 0) {
        throw new AppError(
          `Cannot delete course: active pricing policy exists. Deactivate the course by setting status to INACTIVE instead.`,
          "COURSE_HAS_ACTIVE_PRICING_POLICY",
          409,
          { activePolicyCount, recommendedAction: "SET_INACTIVE" }
        );
      }

      // 8. All dependency checks passed: apply soft-delete
      course.isDeleted = true;
      course.deletedAt = new Date();
      course.deletedBy = adminId;
      course.status = "INACTIVE";
      await course.save({ session });

      // Soft delete associated draft/published syllabus versions and curriculum units atomically
      const { SyllabusVersion, CurriculumUnit } = require("../models");
      await Promise.all([
        SyllabusVersion.updateMany(
          { courseId: course._id, ...NOT_DELETED },
          { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: adminId } },
          { session }
        ),
        CurriculumUnit.updateMany(
          { courseId: course._id, ...NOT_DELETED },
          { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: adminId } },
          { session }
        ),
      ]);

      // 9. AuditLog: Included directly in transaction session, NO silent swallowing!
      const { audit } = require("./auditService");
      await audit(
        {
          actorAdminId: adminId,
          action: "COURSE_SOFT_DELETED",
          targetType: "Course",
          targetId: course._id,
          beforeState,
          afterState: { isDeleted: true, status: "INACTIVE" },
        },
        session
      );

      result = {
        success: true,
        message: "Course soft-deleted successfully",
        courseId: course._id,
      };
    });

    return result;
  } finally {
    if (session && typeof session.endSession === "function") {
      await session.endSession();
    }
  }
};

module.exports = {
  getCategoryOrThrow,
  getSubjectOrThrow,
  getCourseOrThrow,
  listCategories,
  createCategory,
  updateCategory,
  listSubjectsByCategory,
  getSubject,
  createSubject,
  updateSubject,
  searchCourses,
  getCourse,
  getCourseClasses,
  insertCourse,
  createCourse,
  updateCourse,
  adminListCourses,
  adminGetCourse,
  deleteCourse,
  normalizeLevel,
  resolveLevel,
};
