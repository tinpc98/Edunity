const mongoose = require("mongoose");
const { Review, Enrollment, Class, Session, User } = require("../models");
const { AppError, CLASS_NOT_FOUND } = require("../utils/errors");
const { paged, validationError } = require("../utils/http");
const { notify } = require("./notificationService");

const NOT_DELETED = { isDeleted: { $ne: true } };

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

/**
 * FR-STU-21 / BR-30: a review can only be created by an eligible Student —
 * one who holds a CONFIRMED/COMPLETED Enrollment in the Class and has actually started learning
 * (the Class is running/finished, or at least one of its Sessions is COMPLETED).
 * One review per Enrollment.
 */
const createReview = async (studentId, classId, body) => {
  if (!mongoose.isValidObjectId(classId)) throw CLASS_NOT_FOUND();
  const cls = await Class.findOne({ _id: classId, ...NOT_DELETED });
  if (!cls) throw CLASS_NOT_FOUND();

  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw validationError("rating must be an integer from 1 to 5");
  if (body.comment !== undefined && body.comment !== null && typeof body.comment !== "string") {
    throw validationError("comment must be a string");
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
            comment: body.comment,
          },
        ],
        { session }
      );

      // Denormalized rating on Class and on the Teacher profile
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

module.exports = { createReview, getClassReviews, getTeacherReviews };
