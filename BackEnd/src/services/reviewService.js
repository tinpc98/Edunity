const mongoose = require("mongoose");
const { Review, SessionAttendance, Enrollment, Class, Session, User } = require("../models");
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

const parseIntRating = (value, field, { required = false } = {}) => {
  if (value === undefined || value === null || value === "") {
    if (required) throw validationError(`${field} must be an integer from 1 to 5`);
    return null;
  }
  if (typeof value === "boolean" || typeof value === "object") {
    throw validationError(`${field} must be an integer from 1 to 5`);
  }
  const num = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(num) || num < 1 || num > 5) {
    throw validationError(`${field} must be an integer from 1 to 5`);
  }
  return num;
};

const parseOptionalReason = (value, field = "reason", maxLen = 1000) => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw validationError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLen) {
    throw validationError(`${field} must not exceed ${maxLen} characters`);
  }
  return trimmed || null;
};

/**
 * FR-STU-21 / BR-30 + LMS-10 (Class-level Review):
 * Keeps backwards compatibility with single-review-per-enrollment (`Review` model without `sessionId`),
 * while also verifying real session attendance whenever the class tracks/finalizes SessionAttendance.
 */
const createReview = async (studentId, classId, body = {}) => {
  if (!mongoose.isValidObjectId(classId)) throw CLASS_NOT_FOUND();
  const preCls = await Class.findOne({ _id: classId, ...NOT_DELETED });
  if (!preCls) throw CLASS_NOT_FOUND();

  const rating = parseIntRating(body.rating, "rating", { required: true });
  if (body.comment !== undefined && body.comment !== null && typeof body.comment !== "string") {
    throw validationError("comment must be a string");
  }
  const trimmedComment = typeof body.comment === "string" ? body.comment.trim() : "";
  if (trimmedComment.length > 2000) {
    throw validationError("comment must not exceed 2000 characters");
  }

  const session = await mongoose.startSession();
  let review;
  let teacherIdForNotify = preCls.teacherId;
  let classNameForNotify = preCls.className;
  try {
    await session.withTransaction(async () => {
      const cls = await Class.findOne({ _id: classId, ...NOT_DELETED }).session(session);
      if (!cls) throw CLASS_NOT_FOUND();
      teacherIdForNotify = cls.teacherId;
      classNameForNotify = cls.className;

      const enrollment = await Enrollment.findOne({
        studentId,
        classId: cls._id,
        enrollmentStatus: { $in: ["CONFIRMED", "COMPLETED"] },
      }).session(session);
      if (!enrollment) throw new AppError("Only enrolled students can review this class", "REVIEW_NOT_ALLOWED", 403);

      const hasStartedLearning =
        enrollment.enrollmentStatus === "COMPLETED" ||
        ["IN_PROGRESS", "COMPLETED"].includes(cls.status) ||
        (await Session.exists({ classId: cls._id, status: "COMPLETED" }).session(session));
      if (!hasStartedLearning) {
        throw new AppError("You can review this class after attending it", "REVIEW_NOT_ALLOWED", 403);
      }

      // Real attendance check (LMS-10) when class has tracked/finalized attendance records
      const hasAnyAttendance = await SessionAttendance.exists({ classId: cls._id }).session(session);
      const hasFinalizedSession = await Session.exists({
        classId: cls._id,
        status: "COMPLETED",
        attendanceFinalizedAt: { $ne: null },
      }).session(session);
      if (hasAnyAttendance || hasFinalizedSession) {
        const attended = await SessionAttendance.exists({
          classId: cls._id,
          studentId,
          $or: [{ attendanceStatus: { $in: PRESENT_STATUSES } }, { hasVerifiedConnection: true }],
        }).session(session);
        if (!attended) {
          throw new AppError("You can review this class only after attending at least one session", "REVIEW_NOT_ALLOWED", 403);
        }
      }

      if (await Review.exists({ enrollmentId: enrollment._id }).session(session)) {
        throw new AppError("You have already reviewed this class", "DUPLICATE_REVIEW", 409);
      }

      [review] = await Review.create(
        [
          {
            enrollmentId: enrollment._id,
            studentId,
            teacherId: cls.teacherId,
            classId: cls._id,
            rating,
            comment: trimmedComment || undefined,
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
    if (err && err.code === 11000) throw new AppError("You have already reviewed this class", "DUPLICATE_REVIEW", 409);
    throw err;
  } finally {
    await session.endSession();
  }

  await notify(
    teacherIdForNotify,
    "Đánh giá mới",
    `Lớp "${classNameForNotify}" vừa nhận được đánh giá ${rating} sao.`,
    "REVIEW_CREATED"
  );
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
  const reviews = await listReviews({ classId: cls._id }, paging);
  return { ...reviews, ratingAverage: cls.ratingAverage, ratingCount: cls.ratingCount };
};

// FR-TEA-19 / FR-STU-09
const getTeacherReviews = async (teacherId, paging) => {
  const notFound = () => new AppError("Teacher not found", "TEACHER_NOT_FOUND", 404);
  if (!mongoose.isValidObjectId(teacherId)) throw notFound();
  const teacher = await User.findOne({ _id: teacherId, role: "TEACHER", ...NOT_DELETED }).select("teacherProfile").lean();
  if (!teacher) throw notFound();

  const profile = teacher.teacherProfile || {};
  const reviews = await listReviews({ teacherId: teacher._id }, paging);
  return { ...reviews, ratingAverage: profile.ratingAverage || 0, ratingCount: profile.ratingCount || 0 };
};

const getMyReviews = async (studentId, paging) => {
  const classReviews = await Review.find({ studentId, ...NOT_DELETED })
    .sort({ createdAt: -1 })
    .limit(paging.pageSize)
    .populate("classId", "className")
    .lean();

  return {
    classReviews: classReviews.map(({ deletedBy, deletedAt, isDeleted, ...r }) => ({
      ...r,
      id: r._id.toString(),
      className: r.classId ? r.classId.className : null,
      classId: r.classId && r.classId._id ? r.classId._id.toString() : String(r.classId),
    })),
  };
};

module.exports = {
  createReview,
  getClassReviews,
  getTeacherReviews,
  getMyReviews,
};
