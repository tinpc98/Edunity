const mongoose = require("mongoose");
const { Category, Subject, Course, Class } = require("../models");
const { GRADE_LEVELS, COURSE_LEVELS } = require("../models/constants");
const { AppError } = require("../utils/errors");
const { assertId, paged, validationError, escapeRegex, isBlank } = require("../utils/http");
const { slugify, uniqueSlug } = require("../utils/slug");
const { allowedGradeLevelsForCategory, resolveGradeLevel } = require("../utils/gradeLevel");

const NOT_DELETED = { isDeleted: { $ne: true } };
const STATUSES = ["ACTIVE", "INACTIVE"];
const COURSE_TEXT_FIELDS = ["description", "learningObjectives", "syllabus", "prerequisites"];

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

const resolveLevel = (level) => {
  if (level === undefined || level === null || level === "") return undefined;
  if (!COURSE_LEVELS.includes(level)) throw validationError(`level must be one of ${COURSE_LEVELS.join(", ")}`);
  return level;
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
  return categories.map(presentCategory);
};

const createCategory = async (adminId, body) => {
  if (isBlank(body.name)) throw validationError("name is required");
  if (await findByName(Category, "name", body.name)) {
    throw new AppError("Category already exists", "DUPLICATE_CATEGORY", 409);
  }

  const category = await Category.create({
    name: body.name,
    slug: await resolveSlug(Category, body, body.name),
    description: body.description,
    status: body.status === undefined ? "ACTIVE" : resolveStatus(body.status),
    createdBy: adminId,
  });
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
  return Subject.find({ categoryId: category._id, status: "ACTIVE", ...NOT_DELETED }).sort({ name: 1 }).lean();
};

const getSubject = async (subjectId) => {
  const subject = await getSubjectOrThrow(subjectId);
  const courses = await Course.find({ subjectId: subject._id, status: "ACTIVE", ...NOT_DELETED })
    .select("title slug level gradeLevel")
    .sort({ title: 1 })
    .lean();
  return { ...subject.toObject(), courses };
};

const createSubject = async (adminId, body) => {
  if (isBlank(body.name)) throw validationError("name is required");
  if (!body.categoryId) throw validationError("categoryId is required");
  const category = await getCategoryOrThrow(body.categoryId); // BR-02

  if (await findByName(Subject, "name", body.name, { categoryId: category._id })) {
    throw new AppError("Subject already exists in this category", "DUPLICATE_SUBJECT", 409);
  }

  const subject = await Subject.create({
    categoryId: category._id,
    categoryName: category.name,
    name: body.name,
    slug: await resolveSlug(Subject, body, body.name),
    description: body.description,
    status: body.status === undefined ? "ACTIVE" : resolveStatus(body.status),
    createdBy: adminId,
  });
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
    filter.$or = [{ title: pattern }, { description: pattern }];
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

  const [items, total] = await Promise.all([
    Course.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    Course.countDocuments(filter),
  ]);
  return paged(items, total, paging);
};

const getCourse = async (courseId) => {
  const course = await getCourseOrThrow(courseId);
  if (course.status !== "ACTIVE") throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);
  const openClassCount = await Class.countDocuments({ courseId: course._id, status: "OPEN", ...NOT_DELETED });
  return { ...course.toObject(), openClassCount };
};

// FR-STU-11: only classes approved by Admin and OPEN are available to students
const getCourseClasses = async (courseId, paging) => {
  const course = await getCourseOrThrow(courseId);
  const filter = { courseId: course._id, status: "OPEN", ...NOT_DELETED };
  const [items, total] = await Promise.all([
    Class.find(filter).sort({ startDate: 1, createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    Class.countDocuments(filter),
  ]);
  return paged(items, total, paging);
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

  const [course] = await Course.create([doc], { session });
  return course;
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

  if (body.title !== undefined) {
    if (isBlank(body.title)) throw validationError("title must not be empty");
    await assertCourseTitleAvailable(course.subjectId, body.title, course._id);
    course.title = body.title;
  }
  for (const field of COURSE_TEXT_FIELDS) {
    if (body[field] !== undefined) course[field] = body[field];
  }
  if (body.level !== undefined) course.level = resolveLevel(body.level);
  if (body.gradeLevel !== undefined) course.gradeLevel = resolveGradeLevel(category, body.gradeLevel); // FR-ADM-22
  if (body.status !== undefined) course.status = resolveStatus(body.status);
  course.updatedBy = adminId;
  await course.save();

  // courseTitle and gradeLevel are denormalized in Class
  await Class.updateMany({ courseId: course._id }, { $set: { courseTitle: course.title, gradeLevel: course.gradeLevel } });
  return course.toObject();
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
};
