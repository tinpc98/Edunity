const mongoose = require("mongoose");
const { Category, Class, Course, Session, Subject, User } = require("../models");
const { AppError, CLASS_NOT_FOUND } = require("../utils/errors");
const { paged } = require("../utils/http");
const auditService = require("./auditService");
const notificationService = require("./notificationService");
const audit = (...args) => auditService.audit(...args);
const notify = (...args) => notificationService.notify(...args);
const { evaluateClass, getReadiness, runInTransaction } = require("./teacherClassService");
const { captureClassSnapshots, throwFailedChecks } = require("./classCreationGateService");

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

const getClassReadiness = async (classId) => {
  if (!mongoose.isValidObjectId(classId)) throw CLASS_NOT_FOUND();
  const cls = await Class.findOne({ _id: classId, ...NOT_DELETED }).lean();
  if (!cls) throw CLASS_NOT_FOUND();
  return getReadiness(cls);
};

// BR-50 + CUR-09 + CUR-10 + TEA-07 + TEA-12: Admin cannot approve/open a class bypassing governance gates
const approveClass = async (adminId, classId, body = {}, options = {}) => {
  if (!mongoose.isValidObjectId(classId)) throw CLASS_NOT_FOUND();

  const cls = await Class.findOne({ _id: classId, ...NOT_DELETED });
  if (!cls) throw CLASS_NOT_FOUND();
  if (cls.status !== "PENDING_APPROVAL") {
    throw new AppError("Class is not pending approval", "CLASS_NOT_PENDING_APPROVAL", 409);
  }

  const { checks, course, level } = await evaluateClass(cls, { contractVerifier: options.contractVerifier });
  throwFailedChecks(checks);

  const snapshots = await captureClassSnapshots({ course });

  const updated = await runInTransaction(async (session) => {
    const doc = await Class.findOneAndUpdate(
      // updatedAt: a class sent back, edited and resubmitted during the checks must be checked again
      { _id: classId, status: "PENDING_APPROVAL", updatedAt: cls.updatedAt, ...NOT_DELETED },
      {
        $set: {
          status: "OPEN",
          level,
          ...snapshots,
          reviewedBy: adminId,
          reviewedAt: new Date(),
          reviewNote: body.reviewNote || null,
          updatedBy: adminId,
        },
      },
      { session, returnDocument: "after" }
    ).lean();

    if (!doc) {
      throw new AppError("Class is not pending approval", "CLASS_NOT_PENDING_APPROVAL", 409);
    }

    await audit(
      {
        actorAdminId: adminId,
        action: "CLASS_APPROVED",
        targetType: "Class",
        targetId: doc._id,
        beforeState: { status: "PENDING_APPROVAL" },
        afterState: {
          status: "OPEN",
          reviewNote: doc.reviewNote,
          syllabusVersionId: doc.syllabusVersionId ? String(doc.syllabusVersionId) : null,
        },
      },
      session
    );
    return doc;
  });

  await notify(updated.teacherId, "Lớp học đã được duyệt", `Lớp "${updated.className}" đã được mở tuyển sinh.`, "CLASS_APPROVED");
  return updated;
};

// A rejected class never runs: its planned sessions must leave schedules, reminders and the no-show job
const cancelUnstartedSessions = (classId, session) =>
  Session.updateMany(
    { classId, status: { $in: ["SCHEDULED", "WAITING"] } },
    { $set: { status: "CANCELLED", roomState: "CANCELLED", lifecycleState: "CANCELLED" } },
    { session }
  );

// BR-50: Admin can reject an invalid/incomplete pending class without being blocked by gates
const rejectClass = async (adminId, classId, body = {}) => {
  if (!mongoose.isValidObjectId(classId)) throw CLASS_NOT_FOUND();

  const updated = await runInTransaction(async (session) => {
    const doc = await Class.findOneAndUpdate(
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
      { session, returnDocument: "after" }
    ).lean();

    if (!doc) {
      const exists = await Class.exists({ _id: classId, ...NOT_DELETED }).session(session);
      if (!exists) throw CLASS_NOT_FOUND();
      throw new AppError("Class is not pending approval", "CLASS_NOT_PENDING_APPROVAL", 409);
    }

    await audit(
      {
        actorAdminId: adminId,
        action: "CLASS_REJECTED",
        targetType: "Class",
        targetId: doc._id,
        beforeState: { status: "PENDING_APPROVAL" },
        afterState: { status: "REJECTED", reviewNote: doc.reviewNote },
      },
      session
    );
    await cancelUnstartedSessions(doc._id, session);
    return doc;
  });

  await notify(
    updated.teacherId,
    "Lớp học bị từ chối",
    updated.reviewNote || `Lớp "${updated.className}" đã bị từ chối.`,
    "CLASS_REJECTED"
  );
  return updated;
};

const isBlank = (val) => val === undefined || val === null || (typeof val === "string" && val.trim() === "");
const validationError = (msg) => new AppError(msg, "VALIDATION_ERROR", 400);

// BE-01.2: Admin requests changes on pending class with mandatory reviewNote and transactional consistency
const requestChanges = async (adminId, classId, body = {}) => {
  if (!mongoose.isValidObjectId(classId)) throw CLASS_NOT_FOUND();

  if (isBlank(body.reviewNote)) {
    throw validationError("reviewNote is required when requesting changes");
  }

  const reviewNote = body.reviewNote.trim();

  if (typeof mongoose.startSession !== "function") {
    throw new AppError(
      "Database session is unavailable; request-changes requires transaction support",
      "DATABASE_TRANSACTION_UNAVAILABLE",
      503
    );
  }

  let session;
  try {
    session = await mongoose.startSession();
  } catch (sessionErr) {
    throw new AppError(
      "Failed to start database transaction session for request-changes",
      "DATABASE_TRANSACTION_UNAVAILABLE",
      503,
      { originalError: sessionErr.message }
    );
  }

  let updated;
  try {
    if (!session || typeof session.withTransaction !== "function") {
      throw new AppError(
        "Database session is unavailable; request-changes requires transaction support",
        "DATABASE_TRANSACTION_UNAVAILABLE",
        503
      );
    }

    await session.withTransaction(async () => {
      // 1. Conditional atomic update inside transaction for concurrency safety
      const doc = await Class.findOneAndUpdate(
        { _id: classId, status: "PENDING_APPROVAL", ...NOT_DELETED },
        {
          $set: {
            status: "NEED_CHANGES",
            reviewedBy: adminId,
            reviewedAt: new Date(),
            reviewNote,
            updatedBy: adminId,
          },
        },
        { session, returnDocument: "after" }
      ).lean();

      if (!doc) {
        const exists = await Class.exists({ _id: classId, ...NOT_DELETED }).session(session);
        if (!exists) throw CLASS_NOT_FOUND();
        throw new AppError("Class is not pending approval", "CLASS_NOT_PENDING_APPROVAL", 409);
      }

      // 2. AuditLog recorded within the exact same transaction session (no partial writes!)
      await audit(
        {
          actorAdminId: adminId,
          action: "CLASS_CHANGES_REQUESTED",
          targetType: "Class",
          targetId: doc._id,
          beforeState: { status: "PENDING_APPROVAL" },
          afterState: { status: "NEED_CHANGES", reviewNote: doc.reviewNote },
        },
        session
      );

      updated = doc;
    });
  } finally {
    if (session && typeof session.endSession === "function") {
      await session.endSession();
    }
  }

  // 3. Post-commit side-effect: Notification is sent strictly AFTER transaction commits
  try {
    await notify(
      updated.teacherId,
      "Lớp học cần chỉnh sửa",
      updated.reviewNote,
      "CLASS_CHANGES_REQUESTED",
      {
        dedupeKey: `CLASS_CHANGES_REQUESTED:${updated._id.toString()}:${updated.reviewedAt ? new Date(updated.reviewedAt).getTime() : Date.now()}`,
      }
    );
  } catch (notifyErr) {
    // Notification failure must NOT invalidate a successfully committed transaction
    console.error(
      `[adminClassService] Failed to send notification for class ${updated._id}:`,
      notifyErr.message
    );
  }

  return updated;
};

const deleteClass = async (adminId, classId, reason = null) => {
  if (!mongoose.isValidObjectId(classId)) throw CLASS_NOT_FOUND();
  const cls = await Class.findOne({ _id: classId, ...NOT_DELETED });
  if (!cls) throw CLASS_NOT_FOUND();

  // 1. Dependency check: Enrollments (paid or confirmed or pending payment)
  const { Enrollment } = require("../models");
  const paidEnrollmentCount = await Enrollment.countDocuments({
    classId: cls._id,
    enrollmentStatus: { $in: ["CONFIRMED", "COMPLETED", "PENDING_PAYMENT"] },
  });
  if (paidEnrollmentCount > 0) {
    throw new AppError(
      "Không thể xóa lớp học vì lớp đã có học viên đăng ký hoặc thanh toán.",
      "DEPENDENCY_CONFLICT",
      409,
      { paidEnrollmentCount, recommendedAction: "CANNOT_DELETE_ACTIVE_ENROLLMENTS" }
    );
  }

  // 2. Lifecycle check: Class in progress
  if (cls.status === "IN_PROGRESS") {
    throw new AppError(
      "Không thể xóa lớp học đang trong thời gian diễn ra.",
      "DEPENDENCY_CONFLICT",
      409,
      { currentStatus: cls.status }
    );
  }

  // 3. Financial dispute / refund review check
  const { SessionRefundReview } = require("../models");
  const disputeCount = await SessionRefundReview.countDocuments({
    classId: cls._id,
    status: { $in: ["PENDING", "IN_REVIEW"] },
  });
  if (disputeCount > 0) {
    throw new AppError(
      "Không thể xóa lớp học đang có khiếu nại hoàn tiền chưa xử lý.",
      "DEPENDENCY_CONFLICT",
      409,
      { disputeCount }
    );
  }

  const beforeState = { className: cls.className, status: cls.status };

  cls.isDeleted = true;
  cls.deletedAt = new Date();
  cls.deletedBy = adminId;
  cls.deleteReason = reason || null;
  cls.status = "CANCELLED";
  cls.updatedBy = adminId;
  await cls.save();

  // Cancel any scheduled sessions
  await Session.updateMany(
    { classId: cls._id, status: "SCHEDULED" },
    { $set: { status: "CANCELLED" } }
  );

  await audit({
    actorAdminId: adminId,
    action: "CLASS_SOFT_DELETED",
    targetType: "Class",
    targetId: cls._id,
    beforeState,
    afterState: { isDeleted: true, status: "CANCELLED", deleteReason: reason || null },
  });

  return { success: true, message: "Class soft-deleted successfully", classId: cls._id };
};

const getClassRestoreConflict = async (cls) => {
  const [course, teacher, category, subject] = await Promise.all([
    Course.exists({ _id: cls.courseId ?? null, ...NOT_DELETED }),
    User.exists({ _id: cls.teacherId ?? null, role: "TEACHER", status: "ACTIVE", ...NOT_DELETED }),
    Category.exists({ _id: cls.categoryId ?? null, ...NOT_DELETED }),
    Subject.exists({ _id: cls.subjectId ?? null, ...NOT_DELETED }),
  ]);
  if (!course) return { field: "courseId", reason: "Không tìm thấy khóa học của lớp hoặc khóa học đã bị xóa." };
  if (!teacher) return { field: "teacherId", reason: "Tài khoản giáo viên phụ trách lớp không tồn tại hoặc không còn hoạt động." };
  if (!category) return { field: "categoryId", reason: "Không tìm thấy danh mục của lớp hoặc danh mục đã bị xóa." };
  if (!subject) return { field: "subjectId", reason: "Không tìm thấy môn học của lớp hoặc môn học đã bị xóa." };
  return null;
};

const restoreClass = async (adminId, classId) => {
  if (!mongoose.isValidObjectId(classId)) throw CLASS_NOT_FOUND();
  const cls = await Class.findById(classId);
  if (!cls) throw CLASS_NOT_FOUND();
  if (!cls.isDeleted) return cls.toObject();

  const conflict = await getClassRestoreConflict(cls);
  if (conflict) {
    throw new AppError(conflict.reason, "RESTORE_CONFLICT", 409, { [conflict.field]: cls[conflict.field] ?? null });
  }

  // 3. Restore to safe lifecycle state: DRAFT
  // Never restore directly to OPEN (requires governance check / re-schedule if needed)
  cls.isDeleted = false;
  cls.deletedAt = null;
  cls.deletedBy = null;
  cls.deleteReason = null;
  cls.status = "DRAFT";
  cls.updatedBy = adminId;
  await cls.save();

  await audit({
    actorAdminId: adminId,
    action: "CLASS_RESTORED",
    targetType: "Class",
    targetId: cls._id,
    beforeState: { isDeleted: true },
    afterState: { isDeleted: false, status: "DRAFT" },
  });

  return cls.toObject();
};

module.exports = {
  listPendingClasses,
  getClassForReview,
  getClassReadiness,
  approveClass,
  rejectClass,
  cancelUnstartedSessions,
  requestChanges,
  requestClassChanges: requestChanges,
  deleteClass,
  getClassRestoreConflict,
  restoreClass,
};
