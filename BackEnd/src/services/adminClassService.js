const mongoose = require("mongoose");
const { Class, Course, Session, User } = require("../models");
const { AppError, CLASS_NOT_FOUND } = require("../utils/errors");
const { paged } = require("../utils/http");
const { audit } = require("./auditService");
const { notify } = require("./notificationService");

const NOT_DELETED = { isDeleted: { $ne: true } };

// UC-ADM-07 bước 1
const listPendingClasses = async (paging) => {
  const filter = { status: "PENDING_APPROVAL", ...NOT_DELETED };
  const [items, total] = await Promise.all([
    Class.find(filter).sort({ updatedAt: 1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    Class.countDocuments(filter),
  ]);

  const counts = await Session.aggregate([
    { $match: { classId: { $in: items.map((item) => item._id) } } },
    { $group: { _id: "$classId", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((row) => [row._id.toString(), row.count]));

  return paged(
    items.map((item) => ({ ...item, sessionCount: countMap.get(item._id.toString()) || 0 })),
    total,
    paging
  );
};

// UC-ADM-07 bước 2: Class, Course liên quan, Teacher, Schedule và kế hoạch Session
const getClassForReview = async (classId) => {
  if (!mongoose.isValidObjectId(classId)) throw CLASS_NOT_FOUND();
  const cls = await Class.findOne({ _id: classId, ...NOT_DELETED }).lean();
  if (!cls) throw CLASS_NOT_FOUND();

  const [course, teacher, sessions] = await Promise.all([
    Course.findById(cls.courseId).select("title slug description level gradeLevel subjectName categoryName status").lean(),
    User.findById(cls.teacherId).select("email status teacherProfile").lean(),
    Session.find({ classId: cls._id }).sort({ startDatetime: 1 }).lean(),
  ]);

  const profile = (teacher && teacher.teacherProfile) || {};
  return {
    ...cls,
    course,
    teacher: teacher
      ? {
          id: teacher._id.toString(),
          email: teacher.email,
          status: teacher.status,
          fullName: profile.fullName,
          biography: profile.biography,
          qualificationSummary: profile.qualificationSummary,
          verificationStatus: profile.verificationStatus,
          ratingAverage: profile.ratingAverage,
          ratingCount: profile.ratingCount,
        }
      : null,
    sessions,
  };
};

// BR-50: only Admin approves/rejects, and only a Class that is PENDING_APPROVAL
const reviewClass = async (adminId, classId, body, status) => {
  if (!mongoose.isValidObjectId(classId)) throw CLASS_NOT_FOUND();

  const updated = await Class.findOneAndUpdate(
    { _id: classId, status: "PENDING_APPROVAL", ...NOT_DELETED },
    {
      $set: {
        status,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        reviewNote: body.reviewNote || null,
        updatedBy: adminId,
      },
    },
    { returnDocument: "after" }
  ).lean();

  if (!updated) {
    const exists = await Class.exists({ _id: classId, ...NOT_DELETED });
    if (!exists) throw CLASS_NOT_FOUND();
    throw new AppError("Class is not pending approval", "CLASS_NOT_PENDING_APPROVAL", 409);
  }

  await audit({
    actorAdminId: adminId,
    action: status === "OPEN" ? "CLASS_APPROVED" : "CLASS_REJECTED",
    targetType: "Class",
    targetId: updated._id,
    beforeState: { status: "PENDING_APPROVAL" },
    afterState: { status, reviewNote: updated.reviewNote },
  });

  if (status === "OPEN") {
    await notify(updated.teacherId, "Lớp học đã được duyệt", `Lớp "${updated.className}" đã được mở tuyển sinh.`, "CLASS_APPROVED");
  } else {
    await notify(
      updated.teacherId,
      "Lớp học bị từ chối",
      updated.reviewNote || `Lớp "${updated.className}" cần chỉnh sửa và gửi duyệt lại.`,
      "CLASS_REJECTED"
    );
  }
  return updated;
};

const approveClass = (adminId, classId, body) => reviewClass(adminId, classId, body, "OPEN");
const rejectClass = (adminId, classId, body) => reviewClass(adminId, classId, body, "REJECTED");

module.exports = { listPendingClasses, getClassForReview, approveClass, rejectClass };
