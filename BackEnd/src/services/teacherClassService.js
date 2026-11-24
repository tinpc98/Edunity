const mongoose = require("mongoose");
const { Class, Course, Session, Enrollment, User } = require("../models");
const { AppError, FORBIDDEN, CLASS_NOT_FOUND } = require("../utils/errors");
const { paged, validationError, parseDate, isBlank, parseImageUrl } = require("../utils/http");
const { toNum, toDec, parseAmount } = require("../utils/money");
const { computePlannedOccurrences, parseDateTimeInZone, validateTimeZone } = require("../utils/timezone");
const catalog = require("./courseCatalogService");
const {
  assertVerificationCurrent,
  assertCourseAlignment,
  assertClassPrice,
  getClassPriceRange,
  assertTeacherContractGate,
  runClassChecks,
  presentCheck,
  throwFailedChecks,
  captureClassSnapshots,
} = require("./classCreationGateService");
const { assertApprovedAuthorization } = require("./teacherSubjectAuthorizationService");
const { resolveTzOffsetMinutes, isClassStartDateReached } = require("../utils/approvalDeadline");
const auditService = require("./auditService");
const { notifyAdmins } = require("./notificationService");
const { withoutReviewer } = require("../utils/publicView");
const { assertSupportedGradeLevel } = require("../utils/gradeLevel");

const NOT_DELETED = { isDeleted: { $ne: true } };
const EDITABLE_STATUSES = ["DRAFT", "NEED_CHANGES"]; // BE-01: REJECTED is final terminal status
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

const classNotEditable = () =>
  new AppError("Only DRAFT or NEED_CHANGES classes can be edited", "CLASS_NOT_EDITABLE", 409);

// Every account, older ones included, opens classes only for a subject and grade it is authorized to teach
const assertMayTeach = (teacherId, course) =>
  assertApprovedAuthorization({ teacherId, subjectId: course.subjectId, gradeLevel: course.gradeLevel || null });

const getActiveCourse = async (courseId) => {
  if (!mongoose.isValidObjectId(courseId)) throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);
  const course = await Course.findOne({ _id: courseId, status: "ACTIVE", ...NOT_DELETED });
  if (!course) throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);
  return course;
};

const runInTransaction = async (work) => {
  let session;
  try {
    session = await mongoose.startSession();
  } catch {
    throw new AppError("Failed to start database transaction session", "DATABASE_TRANSACTION_UNAVAILABLE", 503);
  }
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
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

  assertClassPrice(cls.classType, toNum(cls.price));

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

// The class is saved either way: a schedule that cannot be planned (e.g. it clashes with another class) is reported
const syncPlannedSessions = async (teacherId, classId) => {
  try {
    const { generatedCount } = await require("./sessionService").replanSessions(teacherId, classId);
    return { generatedCount };
  } catch (err) {
    return { generatedCount: 0, error: { code: err.code || "SESSION_PLAN_FAILED", message: err.message } };
  }
};

const createClass = async (teacherId, body = {}, options = {}) => {
  const teacher = await getVerifiedTeacher(teacherId);
  assertVerificationCurrent({ teacher });
  // A teacher opens classes only under a signed, current contract
  await assertTeacherContractGate({ teacher, contractVerifier: options.contractVerifier });
  if (!body.courseId) throw validationError("courseId is required");
  // An operator object such as { $ne: null } would otherwise reach the query and pick any ACTIVE course
  if (!mongoose.isObjectIdOrHexString(body.courseId)) throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);
  // Checked before the transaction: a grant from the teaching profile is written by its own service
  const chosen = await getActiveCourse(body.courseId);
  assertSupportedGradeLevel(chosen.gradeLevel);
  await assertMayTeach(teacher._id, chosen);

  if (typeof mongoose.startSession !== "function") {
    throw new AppError(
      "Database session is unavailable; class creation requires transaction support",
      "DATABASE_TRANSACTION_UNAVAILABLE",
      503
    );
  }

  let session;
  let created;
  try {
    session = await mongoose.startSession();
  } catch (sessionErr) {
    throw new AppError(
      "Failed to start database transaction session for class creation",
      "DATABASE_TRANSACTION_UNAVAILABLE",
      503,
      { originalError: sessionErr.message }
    );
  }

  try {
    if (!session || typeof session.withTransaction !== "function") {
      throw new AppError(
        "Database session is unavailable; class creation requires transaction support",
        "DATABASE_TRANSACTION_UNAVAILABLE",
        503
      );
    }

    await session.withTransaction(async () => {
      // 1. Atomically lock and verify course is ACTIVE and not soft-deleted
      const course = await Course.findOneAndUpdate(
        { _id: body.courseId, status: "ACTIVE", ...NOT_DELETED },
        { $inc: { lockVersion: 1 } },
        { session, returnDocument: "after" }
      );
      if (!course) {
        throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);
      }

      const cls = new Class({
        teacherId: teacher._id,
        teacherName: teacher.teacherProfile.fullName,
        status: "DRAFT", // BR-47
        updatedBy: teacher._id,
      });
      applyCourse(cls, course);
      applyClassInput(cls, body);

      await assertCourseAlignment({ course, cls, body });
      assertSupportedGradeLevel(course.gradeLevel);

      const snapshots = await captureClassSnapshots({ course });
      Object.assign(cls, snapshots);

      await cls.save({ session });
      created = cls.toObject();
    });
  } finally {
    if (session && typeof session.endSession === "function") {
      await session.endSession();
    }
  }
  return { ...created, sessionPlan: await syncPlannedSessions(teacherId, created._id) };
};

const updateClass = async (teacherId, classId, body = {}) => {
  const teacher = await getVerifiedTeacher(teacherId);
  const cls = await getOwnClass(teacherId, classId);
  if (!EDITABLE_STATUSES.includes(cls.status)) throw classNotEditable();
  assertVerificationCurrent({ teacher });

  const switchingCourse = body.courseId !== undefined && String(body.courseId) !== String(cls.courseId);
  // Sessions are rebuilt only when what they come from changes, so a renamed session keeps its name
  const planOf = (doc) => JSON.stringify([doc.startDate, doc.endDate, (doc.schedule || []).map(({ dayOfWeek, startTime, endTime }) => [dayOfWeek, startTime, endTime])]);
  const planBefore = planOf(cls);
  const course = await getActiveCourse(switchingCourse ? body.courseId : cls.courseId);

  const renamed = body.className !== undefined && body.className !== cls.className;
  if (switchingCourse) {
    applyCourse(cls, course);
  }
  applyClassInput(cls, body);

  await assertCourseAlignment({ course, cls, body });
  if (switchingCourse) {
    assertSupportedGradeLevel(course.gradeLevel);
    await assertMayTeach(teacher._id, course);
  }

  const snapshots = await captureClassSnapshots({ course });
  Object.assign(cls, snapshots);

  if (!cls.level && course.level) {
    cls.level = catalog.resolveLevel(course.level);
  }
  cls.updatedBy = teacherId;
  // The status is part of the write, so an edit still in flight cannot land on a class submitted or opened meanwhile
  cls.$where = { status: { $in: EDITABLE_STATUSES } };
  try {
    await cls.save();
  } catch (err) {
    if (err.name === "DocumentNotFoundError") throw classNotEditable();
    throw err;
  }

  if (renamed) {
    await Session.updateMany({ classId: cls._id }, { $set: { className: cls.className } }); // denormalized
  }
  const replanned = planOf(cls) !== planBefore;
  return { ...withoutReviewer(cls.toObject()), sessionPlan: replanned ? await syncPlannedSessions(teacherId, cls._id) : undefined };
};

// BR-32: Session phải nằm trong thời gian hoạt động của Class (endDate tính đến hết ngày)
const isSessionWithinClass = (cls, startDatetime, endDatetime) => {
  if (cls.startDate && startDatetime < cls.startDate) return false;
  if (cls.endDate && endDatetime.getTime() > cls.endDate.getTime() + DAY_MS) return false;
  return true;
};

const incomplete = (missing) => new AppError("Class is not complete", "CLASS_INCOMPLETE", 400, { missing });

const assertClassInformation = (cls, now) => {
  const missing = [];
  if (isBlank(cls.description)) missing.push("description");
  for (const field of DATE_FIELDS) {
    if (!cls[field]) missing.push(field);
  }
  if (missing.length) throw incomplete(missing);

  if (cls.startDate > cls.endDate || cls.enrollmentStart > cls.enrollmentEnd) {
    throw new AppError("Class start dates must be before their end dates", "CLASS_DATES_INVALID", 400);
  }
  if (isClassStartDateReached(cls.startDate, now, resolveTzOffsetMinutes())) {
    throw new AppError("The class start date has been reached; approval is no longer possible", "CLASS_START_DATE_REACHED", 400);
  }
};

const assertScheduleAndSessions = ({ cls, sessions }) => {
  const missing = [];
  if (!cls.schedule || cls.schedule.length === 0) missing.push("schedule");
  if (sessions.length === 0) missing.push("sessions");
  if (missing.length) throw incomplete(missing);

  const slots = parseSchedule(cls.schedule);
  const overlaps = slots.some((a, i) =>
    slots.slice(i + 1).some((b) => a.dayOfWeek === b.dayOfWeek && a.startTime < b.endTime && b.startTime < a.endTime)
  );
  if (overlaps) throw new AppError("Weekly schedule slots overlap", "SCHEDULE_OVERLAP", 400);

  const outOfRange = sessions.filter((s) => !isSessionWithinClass(cls, s.startDatetime, s.endDatetime));
  if (outOfRange.length) {
    throw new AppError("Some sessions are outside the class start/end date", "SESSION_OUT_OF_CLASS_RANGE", 400, {
      sessionIds: outOfRange.map((s) => s._id.toString()),
    });
  }
};

/**
 * The one rule set behind readiness, submit and approve.
 * Submit is stopped only by checks flagged blocksSubmit; approval requires all of them.
 */
const evaluateClass = async (cls, options = {}) => {
  const now = new Date();
  const { teacher = null } = options;
  const course =
    options.course || (await Course.findOne({ _id: cls.courseId, status: "ACTIVE", ...NOT_DELETED }).lean());
  const sessions = await Session.find({ classId: cls._id, status: { $ne: "CANCELLED" } }).lean();
  const teacherRef = teacher || { _id: cls.teacherId };
  const scope = course || cls;

  let level = null;
  const checks = await runClassChecks([
    [
      "TEACHER_VERIFICATION",
      true,
      async () => assertVerificationCurrent({ teacher: teacher || (await getVerifiedTeacher(cls.teacherId)), now }),
    ],
    [
      "COURSE",
      true,
      async () => {
        ({ level } = await assertCourseAlignment({ course, cls }));
        assertSupportedGradeLevel(course.gradeLevel); // so an older class can neither be submitted nor opened
      },
    ],
    ["CLASS_INFORMATION", true, async () => assertClassInformation(cls, now)],
    ["SCHEDULE_SESSIONS", true, () => assertScheduleAndSessions({ cls, sessions })],
    [
      "TEACHING_AUTHORIZATION",
      true,
      () =>
        assertApprovedAuthorization({
          teacherId: cls.teacherId,
          subjectId: scope.subjectId,
          gradeLevel: scope.gradeLevel || null,
          level: scope.level,
        }),
    ],
    ["CLASS_PRICE_RANGE", true, () => assertClassPrice(cls.classType, toNum(cls.price))],
    [
      "TEACHER_CONTRACT",
      false,
      () => assertTeacherContractGate({ teacher: teacherRef, now, contractVerifier: options.contractVerifier }),
    ],
  ]);

  return { checks, course, level };
};

const getReadiness = async (cls) => {
  const { checks } = await evaluateClass(cls);
  const passes = (required) => checks.every((check) => !check.error || !required(check));
  const editable = EDITABLE_STATUSES.includes(cls.status);
  return {
    classId: cls._id,
    status: cls.status,
    canSaveDraft: editable && passes((check) => ["TEACHER_VERIFICATION", "COURSE"].includes(check.key)),
    canSubmit: editable && passes((check) => check.blocksSubmit),
    canApprove: cls.status === "PENDING_APPROVAL" && passes(() => true),
    tuition: { current: toNum(cls.price), ...getClassPriceRange(cls.classType) },
    checks: checks.map(presentCheck),
  };
};

const getMyClassReadiness = async (teacherId, classId) => getReadiness(await getOwnClass(teacherId, classId));

// BR-48 / BR-49 / CUR-10: submit a completed Class. The contract is left to Admin approval
const submitClass = async (teacherId, classId, options = {}) => {
  const teacher = await getVerifiedTeacher(teacherId);
  const cls = await getOwnClass(teacherId, classId);
  if (!EDITABLE_STATUSES.includes(cls.status)) {
    throw new AppError("Only DRAFT or NEED_CHANGES classes can be submitted", "CLASS_NOT_SUBMITTABLE", 409);
  }

  const course = await getActiveCourse(cls.courseId);
  const { checks, level } = await evaluateClass(cls, { ...options, teacher, course });
  throwFailedChecks(checks.filter((check) => check.blocksSubmit));

  const approvalWarnings = checks.filter((check) => check.error).map(presentCheck);
  const snapshots = await captureClassSnapshots({ course });

  const updated = await runInTransaction(async (session) => {
    const doc = await Class.findOneAndUpdate(
      // updatedAt: what was validated above is exactly what gets submitted
      { _id: cls._id, status: { $in: EDITABLE_STATUSES }, updatedAt: cls.updatedAt },
      { $set: { status: "PENDING_APPROVAL", level, updatedBy: teacherId, ...snapshots } },
      { session, returnDocument: "after" }
    ).lean();
    if (!doc) throw new AppError("Only DRAFT or NEED_CHANGES classes can be submitted", "CLASS_NOT_SUBMITTABLE", 409);

    // AuditLog only knows ADMIN and SYSTEM actors, so the teacher is recorded in the state instead of as an admin
    await auditService.audit(
      {
        actorType: "SYSTEM",
        action: "CLASS_SUBMITTED",
        targetType: "Class",
        targetId: doc._id,
        beforeState: { status: cls.status },
        afterState: {
          status: "PENDING_APPROVAL",
          submittedBy: String(teacherId),
          pendingConditions: approvalWarnings.map((warning) => warning.code),
        },
      },
      session
    );
    return doc;
  });

  const toCheck = approvalWarnings.length
    ? ` Cần kiểm tra: ${approvalWarnings.map((warning) => warning.label).join(", ")}.`
    : "";
  await notifyAdmins(
    "Lớp học chờ duyệt",
    `Lớp "${updated.className}" của ${updated.teacherName} đang chờ duyệt.${toCheck}`,
    "CLASS_SUBMITTED"
  );
  return { ...withoutReviewer(updated), approvalWarnings };
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
  runInTransaction,
  evaluateClass,
  getReadiness,
  getMyClassReadiness,
  createClass,
  updateClass,
  submitClass,
  listMyClasses,
  getMyClass,
  getClassStudents,
  getPlannedSessions,
};
