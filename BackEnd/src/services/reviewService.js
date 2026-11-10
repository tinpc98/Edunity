const mongoose = require("mongoose");
const { Review, SessionReview, SessionAttendance, Enrollment, Class, Session, User } = require("../models");
const { AppError, FORBIDDEN, CLASS_NOT_FOUND } = require("../utils/errors");
const { assertId, paged, validationError } = require("../utils/http");
const { notify } = require("./notificationService");
const { audit } = require("./auditService");

const NOT_DELETED = { isDeleted: { $ne: true } };
const PRESENT_STATUSES = ["PRESENT", "LATE", "EXCUSED"];

const recalculateRating = async (match, session) => {
  const [stats] = await Review.aggregate([
    { $match: { ...match, ...NOT_DELETED } },
    { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]).session(session);
  return {
    ratingAverage: stats ? Math.round(stats.average * 100) / 100 : 0,
    ratingCount: stats ? stats.count : 0,
  };
};

const summarizeSessionReviews = async (match) => {
  const [stats] = await SessionReview.aggregate([
    { $match: { ...match, ...NOT_DELETED } },
    {
      $group: {
        _id: null,
        average: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
  ]);
  return {
    ratingAverage: stats ? Math.round(stats.average * 100) / 100 : 0,
    ratingCount: stats ? stats.count : 0,
  };
};

const parseIntRating = (value, field, { required = false } = {}) => {
  if (value === undefined || value === null || value === "") {
    if (required) throw validationError(`${field} must be an integer from 1 to 5`);
    return null;
  }
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1 || num > 5) {
    throw validationError(`${field} must be an integer from 1 to 5`);
  }
  return num;
};

/**
 * FR-STU-21 / BR-30 + LMS-10 (Class-level Review):
 * Keeps backwards compatibility with single-review-per-enrollment (`Review` model without `sessionId`),
 * while also verifying real session attendance whenever the class tracks/finalizes SessionAttendance.
 */
const createReview = async (studentId, classId, body = {}) => {
  if (!mongoose.isValidObjectId(classId)) throw CLASS_NOT_FOUND();
  const cls = await Class.findOne({ _id: classId, ...NOT_DELETED });
  if (!cls) throw CLASS_NOT_FOUND();

  const rating = parseIntRating(body.rating, "rating", { required: true });
  if (body.comment !== undefined && body.comment !== null && typeof body.comment !== "string") {
    throw validationError("comment must be a string");
  }
  if (typeof body.comment === "string" && body.comment.trim().length > 2000) {
    throw validationError("comment must not exceed 2000 characters");
  }

  const enrollment = await Enrollment.findOne({
    studentId,
    classId: cls._id,
    enrollmentStatus: { $in: ["CONFIRMED", "COMPLETED"] },
  });
  if (!enrollment) throw new AppError("Only enrolled students can review this class", "REVIEW_NOT_ALLOWED", 403);

  const hasStartedLearning =
    enrollment.enrollmentStatus === "COMPLETED" ||
    ["IN_PROGRESS", "COMPLETED"].includes(cls.status) ||
    (await Session.exists({ classId: cls._id, status: "COMPLETED" }));
  if (!hasStartedLearning) {
    throw new AppError("You can review this class after attending it", "REVIEW_NOT_ALLOWED", 403);
  }

  // Real attendance check (LMS-10) when class has tracked/finalized attendance records
  const hasTrackedAttendance =
    (await SessionAttendance.exists({ classId: cls._id })) ||
    (await Session.exists({ classId: cls._id, status: "COMPLETED", attendanceFinalizedAt: { $ne: null } }));
  if (hasTrackedAttendance) {
    const attended = await SessionAttendance.exists({
      classId: cls._id,
      studentId,
      $or: [{ attendanceStatus: { $in: PRESENT_STATUSES } }, { hasVerifiedConnection: true }],
    });
    if (!attended) {
      throw new AppError("You can review this class only after attending at least one session", "REVIEW_NOT_ALLOWED", 403);
    }
  }

  if (await Review.exists({ enrollmentId: enrollment._id })) {
    throw new AppError("You have already reviewed this class", "DUPLICATE_REVIEW", 409);
  }

  const session = await mongoose.startSession();
  let review;
  try {
    await session.withTransaction(async () => {
      [review] = await Review.create(
        [
          {
            enrollmentId: enrollment._id,
            studentId,
            teacherId: cls.teacherId,
            classId: cls._id,
            rating,
            comment: body.comment ? body.comment.trim() : undefined,
          },
        ],
        { session }
      );

      // Denormalized rating on Class and on the Teacher profile (no disciplinary or earning side-effects)
      await Class.updateOne({ _id: cls._id }, { $set: await recalculateRating({ classId: cls._id }, session) }, { session });
      const teacherRating = await recalculateRating({ teacherId: cls.teacherId }, session);
      await User.updateOne(
        { _id: cls.teacherId, "teacherProfile.fullName": { $exists: true } },
        {
          $set: {
            "teacherProfile.ratingAverage": teacherRating.ratingAverage,
            "teacherProfile.ratingCount": teacherRating.ratingCount,
          },
        },
        { session }
      );
    });
  } catch (err) {
    if (err.code === 11000) throw new AppError("You have already reviewed this class", "DUPLICATE_REVIEW", 409);
    throw err;
  } finally {
    session.endSession();
  }

  await notify(cls.teacherId, "Đánh giá mới", `Lớp "${cls.className}" vừa nhận được đánh giá ${rating} sao.`, "REVIEW_CREATED");
  return review.toObject();
};

const listReviews = async (filter, paging) => {
  const query = { ...filter, ...NOT_DELETED };
  const [items, total] = await Promise.all([
    Review.find(query)
      .sort({ createdAt: -1 })
      .skip(paging.skip)
      .limit(paging.pageSize)
      .populate("studentId", "studentProfile.fullName studentProfile.avatarUrl")
      .populate("classId", "className")
      .lean(),
    Review.countDocuments(query),
  ]);

  return paged(
    items.map(({ studentId: student, classId: cls, enrollmentId, ...item }) => {
      const profile = (student && student.studentProfile) || {};
      return {
        ...item,
        classId: cls ? cls._id : null,
        className: cls ? cls.className : null,
        student: { id: student ? student._id.toString() : null, fullName: profile.fullName || null, avatarUrl: profile.avatarUrl || null },
      };
    }),
    total,
    paging
  );
};

const getClassReviews = async (classId, paging) => {
  if (!mongoose.isValidObjectId(classId)) throw CLASS_NOT_FOUND();
  const cls = await Class.findOne({ _id: classId, ...NOT_DELETED }).select("ratingAverage ratingCount").lean();
  if (!cls) throw CLASS_NOT_FOUND();
  const [reviews, sessionReviewSummary] = await Promise.all([
    listReviews({ classId: cls._id }, paging),
    summarizeSessionReviews({ classId: cls._id }),
  ]);
  return { ...reviews, ratingAverage: cls.ratingAverage, ratingCount: cls.ratingCount, sessionReviewSummary };
};

// FR-TEA-19 / FR-STU-09
const getTeacherReviews = async (teacherId, paging) => {
  const notFound = () => new AppError("Teacher not found", "TEACHER_NOT_FOUND", 404);
  if (!mongoose.isValidObjectId(teacherId)) throw notFound();
  const teacher = await User.findOne({ _id: teacherId, role: "TEACHER", ...NOT_DELETED }).select("teacherProfile").lean();
  if (!teacher) throw notFound();

  const profile = teacher.teacherProfile || {};
  const [reviews, sessionReviewSummary] = await Promise.all([
    listReviews({ teacherId: teacher._id }, paging),
    summarizeSessionReviews({ teacherId: teacher._id }),
  ]);
  return { ...reviews, ratingAverage: profile.ratingAverage || 0, ratingCount: profile.ratingCount || 0, sessionReviewSummary };
};

/**
 * LMS-10: Đánh giá ở cấp độ từng buổi học (SessionReview).
 * - Xác minh tham gia thật qua Enrollment (CONFIRMED/COMPLETED) + Session (COMPLETED) + SessionAttendance.
 * - Kiểm soát thời điểm mở (chỉ sau khi buổi học kết thúc/COMPLETED) và chống đánh giá trùng (unique sessionId + studentId).
 * - Lưu đầy đủ nguồn gốc truy vết (sessionId, classId, courseId, enrollmentId, attendanceId).
 * - TUYỆT ĐỐI không phát sinh TeacherViolation, TeacherDisciplineCase hay trừ TeacherEarning/Payout.
 */
const createSessionReview = async (studentId, sessionId, body = {}) => {
  assertId(sessionId, "Session not found", "SESSION_NOT_FOUND");
  const sessionDoc = await Session.findById(sessionId).lean();
  if (!sessionDoc) throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);

  const cls = await Class.findOne({ _id: sessionDoc.classId, ...NOT_DELETED }).lean();
  if (!cls) throw CLASS_NOT_FOUND();

  const rating = parseIntRating(body.rating, "rating", { required: true });
  const teacherPreparednessRating = parseIntRating(body.teacherPreparednessRating, "teacherPreparednessRating");
  const clarityRating = parseIntRating(body.clarityRating, "clarityRating");

  if (body.comment !== undefined && body.comment !== null && typeof body.comment !== "string") {
    throw validationError("comment must be a string");
  }
  const comment = body.comment ? body.comment.trim() : "";
  if (comment.length > 2000) {
    throw validationError("comment must not exceed 2000 characters");
  }

  // Timing window guard: session must actually be completed (not upcoming/live/cancelled/rescheduled)
  if (sessionDoc.status !== "COMPLETED" || sessionDoc.lifecycleState === "RESCHEDULED") {
    throw new AppError("Session reviews open only after the session has completed", "SESSION_REVIEW_NOT_OPEN", 409);
  }
  const now = new Date();
  const endedAt = sessionDoc.actualEndAt ? new Date(sessionDoc.actualEndAt) : new Date(sessionDoc.endDatetime);
  if (sessionDoc.actualEndAt && endedAt > now) {
    throw new AppError("Session reviews open only after the session has ended", "SESSION_REVIEW_NOT_OPEN", 409);
  }
  const windowDays = Number(process.env.SESSION_REVIEW_WINDOW_DAYS || 0);
  if (windowDays > 0 && now.getTime() - endedAt.getTime() > windowDays * 24 * 60 * 60 * 1000) {
    throw new AppError("The review window for this session has closed", "SESSION_REVIEW_WINDOW_CLOSED", 409);
  }

  const enrollment = await Enrollment.findOne({
    studentId,
    classId: cls._id,
    enrollmentStatus: { $in: ["CONFIRMED", "COMPLETED"] },
  }).lean();
  if (!enrollment) {
    throw new AppError("Only enrolled students can review this session", "REVIEW_NOT_ALLOWED", 403);
  }

  const attendance = await SessionAttendance.findOne({
    sessionId: sessionDoc._id,
    studentId,
  }).lean();
  const isParticipant =
    Boolean(attendance) &&
    (PRESENT_STATUSES.includes(attendance.attendanceStatus) || Boolean(attendance.hasVerifiedConnection));
  if (!isParticipant) {
    throw new AppError("Only students with verified attendance in this session can review it", "REVIEW_NOT_ALLOWED", 403);
  }

  if (await SessionReview.exists({ sessionId: sessionDoc._id, studentId })) {
    throw new AppError("You have already reviewed this session", "DUPLICATE_REVIEW", 409);
  }

  let created;
  try {
    [created] = await SessionReview.create([
      {
        sessionId: sessionDoc._id,
        classId: cls._id,
        courseId: cls.courseId,
        teacherId: cls.teacherId,
        studentId,
        enrollmentId: enrollment._id,
        attendanceId: attendance._id,
        attendanceStatusSnapshot: attendance.attendanceStatus,
        reviewedSessionEndedAt: endedAt,
        rating,
        teacherPreparednessRating,
        clarityRating,
        comment,
      },
    ]);
  } catch (err) {
    if (err && err.code === 11000) {
      throw new AppError("You have already reviewed this session", "DUPLICATE_REVIEW", 409);
    }
    throw err;
  }

  // Informational notification only — strictly zero disciplinary or remuneration impact
  await notify(
    cls.teacherId,
    "Đánh giá buổi học mới",
    `Buổi học "${sessionDoc.title}" (${cls.className}) vừa nhận được đánh giá ${rating} sao.`,
    "SESSION_REVIEW_CREATED",
    { dedupeKey: `session-review:${created._id}:teacher`, sessionId: sessionDoc._id }
  );

  return { ...created.toObject(), id: created._id.toString() };
};

const presentSessionReview = (doc, includeTraceIds = false) => {
  const { studentId: student, deletedBy, deletedAt, isDeleted, ...rest } = doc;
  const profile = (student && student.studentProfile) || {};
  const out = {
    id: rest._id.toString(),
    sessionId: rest.sessionId.toString(),
    classId: rest.classId.toString(),
    courseId: rest.courseId.toString(),
    teacherId: rest.teacherId.toString(),
    rating: rest.rating,
    teacherPreparednessRating: rest.teacherPreparednessRating ?? null,
    clarityRating: rest.clarityRating ?? null,
    comment: rest.comment || "",
    attendanceStatusSnapshot: rest.attendanceStatusSnapshot,
    reviewedSessionEndedAt: rest.reviewedSessionEndedAt,
    createdAt: rest.createdAt,
    student: {
      id: student && student._id ? student._id.toString() : null,
      fullName: profile.fullName || null,
      avatarUrl: profile.avatarUrl || null,
    },
  };
  if (includeTraceIds) {
    out.enrollmentId = rest.enrollmentId.toString();
    out.attendanceId = rest.attendanceId.toString();
  }
  return out;
};

const assertSessionReviewReadAccess = async (actor, classId, teacherId) => {
  if (actor.role === "ADMIN") return;
  if (actor.role === "TEACHER") {
    if (String(teacherId) !== String(actor.id)) {
      throw FORBIDDEN("You can only view session reviews of your own classes");
    }
    return;
  }
  if (actor.role === "STUDENT") {
    const enrolled = await Enrollment.exists({
      studentId: actor.id,
      classId,
      enrollmentStatus: { $in: ["CONFIRMED", "COMPLETED"] },
    });
    if (!enrolled) {
      throw new AppError("Only enrolled students can view session reviews of this class", "NOT_ENROLLED", 403);
    }
    return;
  }
  throw FORBIDDEN("You are not allowed to view session reviews");
};

const getSessionReviews = async (actor, sessionId, paging) => {
  assertId(sessionId, "Session not found", "SESSION_NOT_FOUND");
  const sessionDoc = await Session.findById(sessionId).lean();
  if (!sessionDoc) throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);
  const cls = await Class.findOne({ _id: sessionDoc.classId, ...NOT_DELETED }).lean();
  if (!cls) throw CLASS_NOT_FOUND();

  await assertSessionReviewReadAccess(actor, cls._id, cls.teacherId);

  const filter = { sessionId: sessionDoc._id, ...NOT_DELETED };
  const [items, total, summary] = await Promise.all([
    SessionReview.find(filter)
      .sort({ createdAt: -1 })
      .skip(paging.skip)
      .limit(paging.pageSize)
      .populate("studentId", "studentProfile.fullName studentProfile.avatarUrl")
      .lean(),
    SessionReview.countDocuments(filter),
    summarizeSessionReviews({ sessionId: sessionDoc._id }),
  ]);

  const includeTrace = actor.role === "ADMIN" || actor.role === "TEACHER";
  return {
    ...paged(items.map((item) => presentSessionReview(item, includeTrace)), total, paging),
    sessionId: sessionDoc._id.toString(),
    ...summary,
  };
};

const getClassSessionReviews = async (actor, classId, paging) => {
  assertId(classId, "Class not found", "CLASS_NOT_FOUND");
  const cls = await Class.findOne({ _id: classId, ...NOT_DELETED }).lean();
  if (!cls) throw CLASS_NOT_FOUND();

  await assertSessionReviewReadAccess(actor, cls._id, cls.teacherId);

  const filter = { classId: cls._id, ...NOT_DELETED };
  const [items, total, summary] = await Promise.all([
    SessionReview.find(filter)
      .sort({ createdAt: -1 })
      .skip(paging.skip)
      .limit(paging.pageSize)
      .populate("studentId", "studentProfile.fullName studentProfile.avatarUrl")
      .lean(),
    SessionReview.countDocuments(filter),
    summarizeSessionReviews({ classId: cls._id }),
  ]);

  const includeTrace = actor.role === "ADMIN" || actor.role === "TEACHER";
  return {
    ...paged(items.map((item) => presentSessionReview(item, includeTrace)), total, paging),
    classId: cls._id.toString(),
    ...summary,
  };
};

const getMyReviews = async (studentId, paging) => {
  const [classReviews, sessionReviews] = await Promise.all([
    Review.find({ studentId, ...NOT_DELETED })
      .sort({ createdAt: -1 })
      .limit(paging.pageSize)
      .populate("classId", "className")
      .lean(),
    SessionReview.find({ studentId, ...NOT_DELETED })
      .sort({ createdAt: -1 })
      .limit(paging.pageSize)
      .populate("sessionId", "title startDatetime")
      .populate("classId", "className")
      .lean(),
  ]);

  return {
    classReviews: classReviews.map(({ deletedBy, deletedAt, isDeleted, ...r }) => ({
      ...r,
      id: r._id.toString(),
      className: r.classId ? r.classId.className : null,
      classId: r.classId && r.classId._id ? r.classId._id.toString() : String(r.classId),
    })),
    sessionReviews: sessionReviews.map(({ deletedBy, deletedAt, isDeleted, ...r }) => ({
      ...r,
      id: r._id.toString(),
      sessionTitle: r.sessionId ? r.sessionId.title : null,
      sessionId: r.sessionId && r.sessionId._id ? r.sessionId._id.toString() : String(r.sessionId),
      className: r.classId ? r.classId.className : null,
      classId: r.classId && r.classId._id ? r.classId._id.toString() : String(r.classId),
    })),
  };
};

const adminDeleteSessionReview = async (adminId, reviewId, body = {}) => {
  assertId(reviewId, "Session review not found", "SESSION_REVIEW_NOT_FOUND");
  const review = await SessionReview.findOne({ _id: reviewId, ...NOT_DELETED });
  if (!review) throw new AppError("Session review not found", "SESSION_REVIEW_NOT_FOUND", 404);

  const dbSession = await mongoose.startSession();
  try {
    await dbSession.withTransaction(async () => {
      review.isDeleted = true;
      review.deletedAt = new Date();
      review.deletedBy = adminId;
      await review.save({ session: dbSession });

      await audit(
        {
          actorAdminId: adminId,
          action: "SESSION_REVIEW_DELETE",
          targetType: "SessionReview",
          targetId: review._id,
          beforeState: { sessionId: review.sessionId, rating: review.rating, comment: review.comment },
          afterState: { isDeleted: true, reason: body.reason || null },
        },
        dbSession
      );
    });
  } finally {
    await dbSession.endSession();
  }

  return { deleted: true, id: review._id.toString() };
};

module.exports = {
  createReview,
  getClassReviews,
  getTeacherReviews,
  createSessionReview,
  getSessionReviews,
  getClassSessionReviews,
  getMyReviews,
  adminDeleteSessionReview,
};
