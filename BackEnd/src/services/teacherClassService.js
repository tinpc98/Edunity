const mongoose = require("mongoose");
const { Class, Course, Session, Enrollment, User } = require("../models");
const { AppError, FORBIDDEN, CLASS_NOT_FOUND } = require("../utils/errors");
const { paged, validationError, parseDate, isBlank, parseImageUrl } = require("../utils/http");
const { toNum, toDec, parseAmount } = require("../utils/money");
const { computePlannedOccurrences, parseDateTimeInZone, validateTimeZone } = require("../utils/timezone");
const catalog = require("./courseCatalogService");
const {
  validateClassGate,
  assertCourseAlignment,
  assertApprovedAuthorization,
  assertPricingPolicyGate,
  assertTeacherContractGate,
  captureClassSnapshots,
} = (() => {
  const gate = require("./classCreationGateService");
  const tea07 = require("./teacherSubjectAuthorizationService");
  return {
    validateClassGate: gate.validateClassGate,
    assertCourseAlignment: gate.assertCourseAlignment,
    assertPricingPolicyGate: gate.assertPricingPolicyGate,
    assertTeacherContractGate: gate.assertTeacherContractGate,
    captureClassSnapshots: gate.captureClassSnapshots,
    assertApprovedAuthorization: tea07.assertApprovedAuthorization,
  };
})();
const { notifyAdmins } = require("./notificationService");
const { withoutReviewer } = require("../utils/publicView");

const NOT_DELETED = { isDeleted: { $ne: true } };
const EDITABLE_STATUSES = ["DRAFT", "REJECTED"]; // BR-47, BR-51
const DATE_FIELDS = ["enrollmentStart", "enrollmentEnd", "startDate", "endDate"];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// BR-01: only an ACTIVE, VERIFIED Teacher may create a Class or submit it for approval
const getVerifiedTeacher = async (teacherId) => {
  const teacher = await User.findById(teacherId);
  if (!teacher || teacher.isDeleted || teacher.role !== "TEACHER") throw FORBIDDEN("Only TEACHER can perform this action");
  if (teacher.status !== "ACTIVE") throw new AppError("Teacher account is not active", "ACCOUNT_NOT_ACTIVE", 403);
  if (!teacher.teacherProfile || teacher.teacherProfile.verificationStatus !== "VERIFIED") {
    throw new AppError("Teacher must be verified before creating or submitting a class", "TEACHER_NOT_VERIFIED", 403);
  }
  return teacher;
};

// BR-15: Teacher chỉ được quản lý Class do mình phụ trách
const getOwnClass = async (teacherId, classId) => {
  if (!mongoose.isValidObjectId(classId)) throw CLASS_NOT_FOUND();
  const cls = await Class.findOne({ _id: classId, ...NOT_DELETED });
  if (!cls) throw CLASS_NOT_FOUND();
  if (cls.teacherId.toString() !== teacherId.toString()) {
    throw FORBIDDEN("You can only manage your own classes");
  }
  return cls;
};

const getActiveCourse = async (courseId) => {
  if (!mongoose.isValidObjectId(courseId)) throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);
  const course = await Course.findOne({ _id: courseId, status: "ACTIVE", ...NOT_DELETED });
  if (!course) throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);
  return course;
};

const parseStrictInteger = (value) => {
  if (
    value === undefined ||
    value === null ||
    typeof value === "boolean" ||
    Array.isArray(value) ||
    typeof value === "object" ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return NaN;
  }
  return Number(value);
};

const parseSchedule = (schedule) => {
  if (!Array.isArray(schedule)) throw validationError("schedule must be an array");
  return schedule.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw validationError(`schedule[${index}] must be an object`);
    }
    const dayOfWeek = parseStrictInteger(entry.dayOfWeek);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      throw validationError(`schedule[${index}].dayOfWeek must be an integer from 0 (Sunday) to 6`);
    }
    if (
      typeof entry.startTime !== "string" ||
      typeof entry.endTime !== "string" ||
      !TIME_PATTERN.test(entry.startTime) ||
      !TIME_PATTERN.test(entry.endTime)
    ) {
      throw validationError(`schedule[${index}] startTime/endTime must use HH:mm format`);
    }
    if (entry.startTime >= entry.endTime) {
      throw validationError(`schedule[${index}].startTime must be before endTime`);
    }
    return { dayOfWeek, startTime: entry.startTime, endTime: entry.endTime };
  });
};

/**
 * Applies the editable fields of a request body on a Class document and validates
 * the rules that must always hold, even for a DRAFT (BR-08, BR-09, BR-10).
 * Completeness (description, dates, schedule, sessions) is only enforced on submit (BR-48).
 */
const applyClassInput = (cls, body) => {
  if (body.className !== undefined) {
    if (isBlank(body.className)) throw validationError("className must not be empty");
    cls.className = body.className;
  }
  if (body.description !== undefined) cls.description = body.description;
  if (body.coverImage !== undefined) cls.coverImage = parseImageUrl(body.coverImage, "coverImage");

  if (body.classType !== undefined) {
    if (!["FREE", "PAID"].includes(body.classType)) throw validationError("classType must be FREE or PAID");
    cls.classType = body.classType;
  }
  if (body.price !== undefined) {
    cls.price = toDec(parseAmount(body.price, "price", { allowZero: true }));
  } else if (body.classType === "FREE") {
    cls.price = toDec(0);
  }

  if (body.capacity !== undefined) {
    const capacity = parseStrictInteger(body.capacity);
    if (!Number.isInteger(capacity) || capacity < 1) throw validationError("capacity must be an integer >= 1");
    cls.capacity = capacity;
  }

  const timeZone = validateTimeZone(body.timezone);
  for (const field of DATE_FIELDS) {
    if (body[field] !== undefined) cls[field] = parseDateTimeInZone(body[field], field, timeZone);
  }
  if (body.schedule !== undefined) cls.schedule = parseSchedule(body.schedule);

  if (isBlank(cls.className)) throw validationError("className is required");
  if (!cls.classType) throw validationError("classType is required");
  if (!cls.capacity) throw validationError("capacity is required");

  const price = toNum(cls.price);
  if (cls.classType === "FREE" && price !== 0) throw validationError("FREE class must have price = 0");
  if (cls.classType === "PAID" && price <= 0) throw validationError("PAID class must have price > 0");

  if (cls.enrollmentStart && cls.enrollmentEnd && cls.enrollmentStart > cls.enrollmentEnd) {
    throw validationError("enrollmentStart must be before enrollmentEnd");
  }
  if (cls.startDate && cls.endDate && cls.startDate > cls.endDate) {
    throw validationError("startDate must be before endDate");
  }
};

// categoryId, subjectId, gradeLevel và level được lấy theo Course đã chọn (UC-TEA-02 bước 3 / CUR-10)
const applyCourse = (cls, course) => {
  cls.courseId = course._id;
  cls.courseTitle = course.title;
  cls.categoryId = course.categoryId;
  cls.subjectId = course.subjectId;
  cls.gradeLevel = course.gradeLevel || null;
  cls.level = course.level ? catalog.resolveLevel(course.level) : null;
};

const createClass = async (teacherId, body = {}, options = {}) => {
  const teacher = await getVerifiedTeacher(teacherId);
  if (!body.courseId) throw validationError("courseId is required");
  const course = await getActiveCourse(body.courseId);

  const cls = new Class({
    teacherId: teacher._id,
    teacherName: teacher.teacherProfile.fullName,
    status: "DRAFT", // BR-47
    updatedBy: teacher._id,
  });
  applyCourse(cls, course);
  applyClassInput(cls, body);

  const gateResult = await validateClassGate({
    teacher,
    course,
    cls,
    body,
    mode: "CREATE",
    pricingPolicyVerifier: options.pricingPolicyVerifier,
    contractVerifier: options.contractVerifier,
  });

  const snapshots = await captureClassSnapshots({
    course,
    pricingResult: gateResult.pricingResult,
  });
  Object.assign(cls, snapshots);

  await cls.save();
  return cls.toObject();
};

const updateClass = async (teacherId, classId, body = {}, options = {}) => {
  const teacher = await getVerifiedTeacher(teacherId);
  const cls = await getOwnClass(teacherId, classId);
  if (!EDITABLE_STATUSES.includes(cls.status)) {
    throw new AppError("Only DRAFT or REJECTED classes can be edited", "CLASS_NOT_EDITABLE", 409);
  }

  const switchingCourse = body.courseId !== undefined && String(body.courseId) !== String(cls.courseId);
  const course = await getActiveCourse(switchingCourse ? body.courseId : cls.courseId);

  const renamed = body.className !== undefined && body.className !== cls.className;
  if (switchingCourse) {
    applyCourse(cls, course);
  }
  applyClassInput(cls, body);

  const gateResult = await validateClassGate({
    teacher,
    course,
    cls,
    body,
    mode: "UPDATE",
    pricingPolicyVerifier: options.pricingPolicyVerifier,
    contractVerifier: options.contractVerifier,
  });

  const snapshots = await captureClassSnapshots({
    course,
    pricingResult: gateResult.pricingResult,
  });
  Object.assign(cls, snapshots);

  if (!cls.level && course.level) {
    cls.level = catalog.resolveLevel(course.level);
  }
  cls.updatedBy = teacherId;
  await cls.save();

  if (renamed) {
    await Session.updateMany({ classId: cls._id }, { $set: { className: cls.className } }); // denormalized
  }
  return withoutReviewer(cls.toObject());
};

// BR-32: Session phải nằm trong thời gian hoạt động của Class (endDate tính đến hết ngày)
const isSessionWithinClass = (cls, startDatetime, endDatetime) => {
  if (cls.startDate && startDatetime < cls.startDate) return false;
  if (cls.endDate && endDatetime.getTime() > cls.endDate.getTime() + DAY_MS) return false;
  return true;
};

const validateClassCompletenessAndSessions = async (cls, incompleteMessage = "Class is not complete enough to be submitted") => {
  const missing = [];
  if (isBlank(cls.description)) missing.push("description");
  for (const field of DATE_FIELDS) {
    if (!cls[field]) missing.push(field);
  }
  if (!cls.schedule || cls.schedule.length === 0) missing.push("schedule");

  const sessions = await Session.find({ classId: cls._id, status: { $ne: "CANCELLED" } }).lean();
  if (sessions.length === 0) missing.push("sessions");
  if (missing.length) {
    throw Object.assign(new AppError(incompleteMessage, "CLASS_INCOMPLETE", 400), {
      details: { missing },
    });
  }

  const outOfRange = sessions.filter((s) => !isSessionWithinClass(cls, s.startDatetime, s.endDatetime));
  if (outOfRange.length) {
    throw Object.assign(new AppError("Some sessions are outside the class start/end date", "SESSION_OUT_OF_CLASS_RANGE", 400), {
      details: { sessionIds: outOfRange.map((s) => s._id.toString()) },
    });
  }

  return sessions;
};

// BR-48 / BR-49 / CUR-10: submit a completed Class for Admin approval
const submitClass = async (teacherId, classId, options = {}) => {
  const teacher = await getVerifiedTeacher(teacherId);
  const cls = await getOwnClass(teacherId, classId);
  if (!EDITABLE_STATUSES.includes(cls.status)) {
    throw new AppError("Only DRAFT or REJECTED classes can be submitted", "CLASS_NOT_SUBMITTABLE", 409);
  }

  const course = await getActiveCourse(cls.courseId);
  const alignment = await assertCourseAlignment({ course, cls });
  await assertApprovedAuthorization({
    teacherId: teacher._id,
    subjectId: course.subjectId,
    gradeLevel: alignment.gradeLevel,
    level: alignment.level,
  });

  const sessions = await validateClassCompletenessAndSessions(cls);

  const pricingResult = await assertPricingPolicyGate({
    teacher,
    course,
    cls,
    totalSessions: sessions.length,
    pricingPolicyVerifier: options.pricingPolicyVerifier,
  });
  await assertTeacherContractGate({
    teacher,
    contractVerifier: options.contractVerifier,
  });

  const snapshots = await captureClassSnapshots({ course, pricingResult });

  const updated = await Class.findOneAndUpdate(
    { _id: cls._id, status: { $in: EDITABLE_STATUSES } },
    { $set: { status: "PENDING_APPROVAL", level: alignment.level, updatedBy: teacherId, ...snapshots } },
    { returnDocument: "after" }
  ).lean();
  if (!updated) throw new AppError("Only DRAFT or REJECTED classes can be submitted", "CLASS_NOT_SUBMITTABLE", 409);

  await notifyAdmins("Lớp học chờ duyệt", `Lớp "${updated.className}" của ${updated.teacherName} đang chờ duyệt.`, "CLASS_SUBMITTED");
  return updated;
};

const listMyClasses = async (teacherId, query, paging) => {
  const filter = { teacherId, ...NOT_DELETED };
  if (query.status) filter.status = { $in: String(query.status).split(",") };
  const [items, total] = await Promise.all([
    Class.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    Class.countDocuments(filter),
  ]);
  return paged(items.map(withoutReviewer), total, paging);
};

const getMyClass = async (teacherId, classId) => {
  const cls = await getOwnClass(teacherId, classId);
  const sessions = await Session.find({ classId: cls._id }).sort({ startDatetime: 1 }).lean();
  return { ...withoutReviewer(cls.toObject()), sessions };
};

// FR-TEA-13 / FR-TEA-14
const getClassStudents = async (teacherId, classId, query) => {
  await getVerifiedTeacher(teacherId);
  const cls = await getOwnClass(teacherId, classId);
  const statuses = query.status ? String(query.status).split(",") : ["CONFIRMED", "COMPLETED"];

  const enrollments = await Enrollment.find({ classId: cls._id, enrollmentStatus: { $in: statuses } })
    .sort({ enrolledAt: 1 })
    .populate("studentId", "email studentProfile.fullName studentProfile.avatarUrl")
    .lean();

  return enrollments.map((enrollment) => {
    const student = enrollment.studentId;
    const profile = (student && student.studentProfile) || {};
    return {
      enrollmentId: enrollment._id,
      studentId: student ? student._id : null,
      fullName: profile.fullName || null,
      avatarUrl: profile.avatarUrl || null,
      email: student ? student.email : null,
      enrollmentStatus: enrollment.enrollmentStatus,
      paymentSource: enrollment.paymentSource,
      enrolledAt: enrollment.enrolledAt,
    };
  });
};

/**
 * UC-TEA-02 bước 15 / CUR-11: planned session occurrences derived from startDate, endDate and schedule.
 * schedule times are wall-clock times in Asia/Ho_Chi_Minh (or specified IANA timezone), normalized to UTC.
 */
const getPlannedSessions = async (teacherId, classId, query = {}) => {
  await getVerifiedTeacher(teacherId);
  const cls = await getOwnClass(teacherId, classId);
  if (!cls.startDate || !cls.endDate || !cls.schedule || cls.schedule.length === 0) {
    throw validationError("startDate, endDate and schedule are required to plan sessions");
  }

  const timeZone = validateTimeZone(query.timezone);
  const planned = computePlannedOccurrences(cls, { timeZone, maxOccurrences: 366 });
  return planned.map((item, index) => ({ index: index + 1, ...item }));
};

module.exports = {
  getVerifiedTeacher,
  getOwnClass,
  isSessionWithinClass,
  validateClassCompletenessAndSessions,
  createClass,
  updateClass,
  submitClass,
  listMyClasses,
  getMyClass,
  getClassStudents,
  getPlannedSessions,
};
