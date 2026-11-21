const mongoose = require("mongoose");
const { Review, SessionAttendance, Enrollment, Class, Session, User, Report, AuditLog } = require("../models");
const { AppError, FORBIDDEN, CLASS_NOT_FOUND } = require("../utils/errors");
const { assertId, paged, validationError, escapeRegex } = require("../utils/http");
const { notify } = require("./notificationService");
const { audit } = require("./auditService");

const NOT_DELETED = { isDeleted: { $ne: true } };
const NOT_HIDDEN = { isHidden: { $ne: true } };
const PUBLIC_VISIBLE = { isDeleted: { $ne: true }, isHidden: { $ne: true } };
const PRESENT_STATUSES = ["PRESENT", "LATE", "EXCUSED"];

const recalculateRating = async (match, session) => {
  const query = { ...match, ...PUBLIC_VISIBLE };
  const aggregation = Review.aggregate([
    { $match: query },
    { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  if (session) aggregation.session(session);
  const [stats] = await aggregation;
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
 * Format user info for actor display
 */
const formatActor = (user) => {
  if (!user) return null;
  const profile = user.studentProfile || user.teacherProfile || user.sponsorProfile || {};
  return {
    id: user._id ? user._id.toString() : String(user),
    email: user.email || null,
    fullName: profile.fullName || user.email || "Quản trị viên",
  };
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
            isHidden: false,
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

/**
 * Public listing of reviews for a class or teacher (strictly excludes hidden and deleted)
 */
const listReviews = async (filter, paging) => {
  const query = { ...filter, ...PUBLIC_VISIBLE };
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

/**
 * Admin: List all reviews with moderation filters and report awareness
 */
const adminListReviews = async (filters = {}, paging = { skip: 0, pageSize: 10, page: 1 }) => {
  const query = {};

  // Status filter
  const statusFilter = filters.status ? String(filters.status).toUpperCase() : "ALL";
  if (statusFilter === "VISIBLE") {
    query.isDeleted = { $ne: true };
    query.isHidden = { $ne: true };
  } else if (statusFilter === "HIDDEN") {
    query.isDeleted = { $ne: true };
    query.isHidden = true;
  } else if (statusFilter === "REPORTED") {
    query.isDeleted = { $ne: true };
    const reportedIds = await Report.distinct("targetId", { targetType: "REVIEW" });
    query._id = { $in: reportedIds };
  } else {
    // ALL: default to not deleted (deleted items are in Trash)
    query.isDeleted = { $ne: true };
  }

  // Keyword search on comment
  if (filters.search) {
    query.comment = { $regex: escapeRegex(String(filters.search).trim()), $options: "i" };
  }

  // Star rating filter
  if (filters.rating) {
    const numRating = Number(filters.rating);
    if (!isNaN(numRating) && numRating >= 1 && numRating <= 5) {
      query.rating = numRating;
    }
  }

  // Class filter
  if (filters.classId && mongoose.isValidObjectId(filters.classId)) {
    query.classId = filters.classId;
  }

  // Teacher filter
  if (filters.teacherId && mongoose.isValidObjectId(filters.teacherId)) {
    query.teacherId = filters.teacherId;
  }

  // Student filter
  if (filters.studentId && mongoose.isValidObjectId(filters.studentId)) {
    query.studentId = filters.studentId;
  }

  const [items, total] = await Promise.all([
    Review.find(query)
      .sort({ createdAt: -1 })
      .skip(paging.skip)
      .limit(paging.pageSize)
      .populate("studentId", "email studentProfile.fullName studentProfile.avatarUrl")
      .populate("teacherId", "email teacherProfile.fullName")
      .populate("classId", "className")
      .populate("hiddenBy", "email studentProfile teacherProfile")
      .populate("deletedBy", "email studentProfile teacherProfile")
      .lean(),
    Review.countDocuments(query),
  ]);

  // Aggregate reports count for listed reviews
  const reviewIds = items.map((r) => r._id);
  const reports = await Report.find({ targetType: "REVIEW", targetId: { $in: reviewIds } })
    .select("targetId status type")
    .lean();

  const reportMap = {};
  for (const rep of reports) {
    const key = rep.targetId ? rep.targetId.toString() : "";
    if (!reportMap[key]) reportMap[key] = [];
    reportMap[key].push(rep);
  }

  const enrichedItems = items.map((r) => {
    const idStr = r._id.toString();
    const reps = reportMap[idStr] || [];
    const studentProfile = r.studentId?.studentProfile || {};
    const teacherProfile = r.teacherId?.teacherProfile || {};
    return {
      id: idStr,
      rating: r.rating,
      comment: r.comment || "",
      isHidden: !!r.isHidden,
      hiddenAt: r.hiddenAt || null,
      hiddenBy: formatActor(r.hiddenBy),
      hideReason: r.hideReason || null,
      isDeleted: !!r.isDeleted,
      deletedAt: r.deletedAt || null,
      deletedBy: formatActor(r.deletedBy),
      deleteReason: r.deleteReason || null,
      student: {
        id: r.studentId?._id?.toString() || null,
        email: r.studentId?.email || null,
        fullName: studentProfile.fullName || r.studentId?.email || "Học viên",
        avatarUrl: studentProfile.avatarUrl || null,
      },
      teacher: {
        id: r.teacherId?._id?.toString() || null,
        email: r.teacherId?.email || null,
        fullName: teacherProfile.fullName || r.teacherId?.email || "Giảng viên",
      },
      class: {
        id: r.classId?._id?.toString() || null,
        className: r.classId?.className || "Lớp học",
      },
      reportsCount: reps.length,
      hasReports: reps.length > 0,
      openReportsCount: reps.filter((x) => x.status === "OPEN" || x.status === "IN_REVIEW").length,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  });

  return paged(enrichedItems, total, paging);
};

/**
 * Admin: Get complete review details including reports and audit history
 */
const adminGetReviewDetail = async (reviewId) => {
  if (!mongoose.isValidObjectId(reviewId)) throw new AppError("Review not found", "REVIEW_NOT_FOUND", 404);
  const r = await Review.findById(reviewId)
    .populate("studentId", "email studentProfile.fullName studentProfile.avatarUrl")
    .populate("teacherId", "email teacherProfile.fullName")
    .populate("classId", "className")
    .populate("hiddenBy", "email studentProfile teacherProfile")
    .populate("deletedBy", "email studentProfile teacherProfile")
    .lean();
  if (!r) throw new AppError("Review not found", "REVIEW_NOT_FOUND", 404);

  // Associated reports
  const reports = await Report.find({ targetType: "REVIEW", targetId: r._id })
    .populate("reporterId", "email studentProfile.fullName")
    .populate("reviewedBy", "email")
    .sort({ createdAt: -1 })
    .lean();

  // Audit history
  const auditLogs = await AuditLog.find({ targetType: "Review", targetId: r._id })
    .populate("actorAdminId", "email")
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  const studentProfile = r.studentId?.studentProfile || {};
  const teacherProfile = r.teacherId?.teacherProfile || {};

  return {
    id: r._id.toString(),
    rating: r.rating,
    comment: r.comment || "",
    isHidden: !!r.isHidden,
    hiddenAt: r.hiddenAt || null,
    hiddenBy: formatActor(r.hiddenBy),
    hideReason: r.hideReason || null,
    isDeleted: !!r.isDeleted,
    deletedAt: r.deletedAt || null,
    deletedBy: formatActor(r.deletedBy),
    deleteReason: r.deleteReason || null,
    student: {
      id: r.studentId?._id?.toString() || null,
      email: r.studentId?.email || null,
      fullName: studentProfile.fullName || r.studentId?.email || "Học viên",
      avatarUrl: studentProfile.avatarUrl || null,
    },
    teacher: {
      id: r.teacherId?._id?.toString() || null,
      email: r.teacherId?.email || null,
      fullName: teacherProfile.fullName || r.teacherId?.email || "Giảng viên",
    },
    class: {
      id: r.classId?._id?.toString() || null,
      className: r.classId?.className || "Lớp học",
    },
    reports: reports.map((rep) => ({
      id: rep._id.toString(),
      type: rep.type,
      description: rep.description,
      status: rep.status,
      reporter: {
        id: rep.reporterId?._id?.toString(),
        fullName: rep.reporterId?.studentProfile?.fullName || rep.reporterId?.email || "Người dùng",
        email: rep.reporterId?.email,
      },
      reviewNote: rep.reviewNote,
      reviewedAt: rep.reviewedAt,
      createdAt: rep.createdAt,
    })),
    auditLogs: auditLogs.map((log) => ({
      id: log._id.toString(),
      action: log.action,
      adminEmail: log.actorAdminId?.email || "Quản trị viên",
      createdAt: log.createdAt,
      beforeState: log.beforeState,
      afterState: log.afterState,
    })),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
};

/**
 * Admin: Hide a review/comment from public visibility
 */
const hideReview = async (adminId, reviewId, reason = null) => {
  if (!mongoose.isValidObjectId(reviewId)) throw new AppError("Review not found", "REVIEW_NOT_FOUND", 404);
  const review = await Review.findById(reviewId);
  if (!review) throw new AppError("Review not found", "REVIEW_NOT_FOUND", 404);
  if (review.isDeleted) {
    throw new AppError("Không thể ẩn đánh giá đã bị xóa mềm vào Thùng rác.", "INVALID_STATE", 400);
  }

  const beforeState = { isHidden: review.isHidden, rating: review.rating, comment: review.comment };

  review.isHidden = true;
  review.hiddenAt = new Date();
  review.hiddenBy = adminId;
  review.hideReason = reason || "Quản trị viên ẩn nội dung vi phạm";
  await review.save();

  // Recalculate rating without the hidden review
  const [classStats, teacherStats] = await Promise.all([
    recalculateRating({ classId: review.classId }),
    recalculateRating({ teacherId: review.teacherId }),
  ]);

  await Promise.all([
    Class.updateOne({ _id: review.classId }, { $set: classStats }),
    User.updateOne(
      { _id: review.teacherId },
      {
        $set: {
          "teacherProfile.ratingAverage": teacherStats.ratingAverage,
          "teacherProfile.ratingCount": teacherStats.ratingCount,
        },
      }
    ),
  ]);

  await audit({
    actorAdminId: adminId,
    action: "REVIEW_HIDDEN",
    targetType: "Review",
    targetId: review._id,
    beforeState,
    afterState: { isHidden: true, hideReason: review.hideReason },
  });

  return {
    success: true,
    message: "Đánh giá đã được ẩn khỏi danh sách công khai thành công.",
    reviewId: review._id.toString(),
  };
};

/**
 * Admin: Unhide a review/comment and restore public visibility
 */
const unhideReview = async (adminId, reviewId) => {
  if (!mongoose.isValidObjectId(reviewId)) throw new AppError("Review not found", "REVIEW_NOT_FOUND", 404);
  const review = await Review.findById(reviewId);
  if (!review) throw new AppError("Review not found", "REVIEW_NOT_FOUND", 404);
  if (review.isDeleted) {
    throw new AppError("Không thể hiện lại đánh giá đang nằm trong Thùng rác. Hãy khôi phục trước.", "INVALID_STATE", 400);
  }

  const beforeState = { isHidden: review.isHidden, hideReason: review.hideReason };

  review.isHidden = false;
  review.hiddenAt = null;
  review.hiddenBy = null;
  review.hideReason = null;
  await review.save();

  // Recalculate rating with the review unhidden
  const [classStats, teacherStats] = await Promise.all([
    recalculateRating({ classId: review.classId }),
    recalculateRating({ teacherId: review.teacherId }),
  ]);

  await Promise.all([
    Class.updateOne({ _id: review.classId }, { $set: classStats }),
    User.updateOne(
      { _id: review.teacherId },
      {
        $set: {
          "teacherProfile.ratingAverage": teacherStats.ratingAverage,
          "teacherProfile.ratingCount": teacherStats.ratingCount,
        },
      }
    ),
  ]);

  await audit({
    actorAdminId: adminId,
    action: "REVIEW_UNHIDDEN",
    targetType: "Review",
    targetId: review._id,
    beforeState,
    afterState: { isHidden: false },
  });

  return {
    success: true,
    message: "Đánh giá đã được hiển thị công khai trở lại thành công.",
    reviewId: review._id.toString(),
  };
};

const deleteReview = async (adminId, reviewId, reason = null) => {
  if (!mongoose.isValidObjectId(reviewId)) throw new AppError("Review not found", "REVIEW_NOT_FOUND", 404);
  const review = await Review.findOne({ _id: reviewId, ...NOT_DELETED });
  if (!review) throw new AppError("Review not found", "REVIEW_NOT_FOUND", 404);

  const beforeState = { rating: review.rating, comment: review.comment };

  review.isDeleted = true;
  review.deletedAt = new Date();
  review.deletedBy = adminId;
  review.deleteReason = reason || null;
  await review.save();

  // Recalculate Class and Teacher rating
  const [classStats, teacherStats] = await Promise.all([
    recalculateRating({ classId: review.classId }),
    recalculateRating({ teacherId: review.teacherId }),
  ]);

  await Promise.all([
    Class.updateOne({ _id: review.classId }, { $set: classStats }),
    User.updateOne(
      { _id: review.teacherId },
      {
        $set: {
          "teacherProfile.ratingAverage": teacherStats.ratingAverage,
          "teacherProfile.ratingCount": teacherStats.ratingCount,
        },
      }
    ),
  ]);

  await audit({
    actorAdminId: adminId,
    action: "REVIEW_SOFT_DELETED",
    targetType: "Review",
    targetId: review._id,
    beforeState,
    afterState: { isDeleted: true, deleteReason: reason || null },
  });

  return { success: true, message: "Review soft-deleted successfully", reviewId: review._id };
};

const restoreReview = async (adminId, reviewId) => {
  if (!mongoose.isValidObjectId(reviewId)) throw new AppError("Review not found", "REVIEW_NOT_FOUND", 404);
  const review = await Review.findById(reviewId);
  if (!review) throw new AppError("Review not found", "REVIEW_NOT_FOUND", 404);
  if (!review.isDeleted) return review.toObject();

  review.isDeleted = false;
  review.deletedAt = null;
  review.deletedBy = null;
  review.deleteReason = null;
  await review.save();

  const [classStats, teacherStats] = await Promise.all([
    recalculateRating({ classId: review.classId }),
    recalculateRating({ teacherId: review.teacherId }),
  ]);

  await Promise.all([
    Class.updateOne({ _id: review.classId }, { $set: classStats }),
    User.updateOne(
      { _id: review.teacherId },
      {
        $set: {
          "teacherProfile.ratingAverage": teacherStats.ratingAverage,
          "teacherProfile.ratingCount": teacherStats.ratingCount,
        },
      }
    ),
  ]);

  await audit({
    actorAdminId: adminId,
    action: "REVIEW_RESTORED",
    targetType: "Review",
    targetId: review._id,
    beforeState: { isDeleted: true },
    afterState: { isDeleted: false },
  });

  return review.toObject();
};

module.exports = {
  createReview,
  getClassReviews,
  getTeacherReviews,
  getMyReviews,
  adminListReviews,
  adminGetReviewDetail,
  hideReview,
  unhideReview,
  deleteReview,
  restoreReview,
};
