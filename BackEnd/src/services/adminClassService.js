const mongoose = require("mongoose");
const { Class, Course, Session, User } = require("../models");
const { AppError, CLASS_NOT_FOUND } = require("../utils/errors");
const { paged } = require("../utils/http");
const { audit } = require("./auditService");
const { notify } = require("./notificationService");
const {
  getVerifiedTeacher,
  validateClassCompletenessAndSessions,
} = require("./teacherClassService");
const {
  validateClassGate,
  captureClassSnapshots,
} = require("./classCreationGateService");

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

// BR-50 + CUR-09 + CUR-10 + TEA-07 + TEA-12: Admin cannot approve/open a class bypassing governance gates
const approveClass = async (adminId, classId, body = {}, options = {}) => {
  if (!mongoose.isValidObjectId(classId)) throw CLASS_NOT_FOUND();

  const cls = await Class.findOne({ _id: classId, ...NOT_DELETED });
  if (!cls) throw CLASS_NOT_FOUND();
  if (cls.status !== "PENDING_APPROVAL") {
    throw new AppError("Class is not pending approval", "CLASS_NOT_PENDING_APPROVAL", 409);
  }

  const teacher = await getVerifiedTeacher(cls.teacherId);
  const course = await Course.findOne({ _id: cls.courseId, status: "ACTIVE", ...NOT_DELETED }).lean();
  const sessions = await validateClassCompletenessAndSessions(cls, "Class is not complete enough to be approved");

  const gateResult = await validateClassGate({
    teacher,
    course,
    cls,
    mode: "APPROVE",
    totalSessions: sessions.length,
    pricingPolicyVerifier: options.pricingPolicyVerifier,
    contractVerifier: options.contractVerifier,
  });

  const snapshots = await captureClassSnapshots({
    course,
    pricingResult: gateResult.pricingResult,
  });

  const updated = await Class.findOneAndUpdate(
    { _id: classId, status: "PENDING_APPROVAL", ...NOT_DELETED },
    {
      $set: {
        status: "OPEN",
        level: gateResult.alignment.level,
        ...snapshots,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        reviewNote: body.reviewNote || null,
        updatedBy: adminId,
      },
    },
    { returnDocument: "after" }
  ).lean();

  if (!updated) {
    throw new AppError("Class is not pending approval", "CLASS_NOT_PENDING_APPROVAL", 409);
  }

  await audit({
    actorAdminId: adminId,
    action: "CLASS_APPROVED",
    targetType: "Class",
    targetId: updated._id,
    beforeState: { status: "PENDING_APPROVAL" },
    afterState: {
      status: "OPEN",
      reviewNote: updated.reviewNote,
      syllabusVersionId: updated.syllabusVersionId ? String(updated.syllabusVersionId) : null,
      pricingPolicyVersion: updated.pricingPolicyVersion || null,
    },
  });

  await notify(updated.teacherId, "Lớp học đã được duyệt", `Lớp "${updated.className}" đã được mở tuyển sinh.`, "CLASS_APPROVED");
  return updated;
};

// BR-50: Admin can reject an invalid/incomplete pending class without being blocked by gates
const rejectClass = async (adminId, classId, body = {}) => {
  if (!mongoose.isValidObjectId(classId)) throw CLASS_NOT_FOUND();

  const updated = await Class.findOneAndUpdate(
    { _id: classId, status: "PENDING_APPROVAL", ...NOT_DELETED },
    {
      $set: {
        status: "REJECTED",
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
    action: "CLASS_REJECTED",
    targetType: "Class",
    targetId: updated._id,
    beforeState: { status: "PENDING_APPROVAL" },
    afterState: { status: "REJECTED", reviewNote: updated.reviewNote },
  });

  await notify(
    updated.teacherId,
    "Lớp học bị từ chối",
    updated.reviewNote || `Lớp "${updated.className}" cần chỉnh sửa và gửi duyệt lại.`,
    "CLASS_REJECTED"
  );
  return updated;
};

module.exports = { listPendingClasses, getClassForReview, approveClass, rejectClass };
