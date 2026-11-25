const mongoose = require("mongoose");
const {
  Category,
  Subject,
  Course,
  Class,
  Review,
  User,
  Enrollment,
  Payment,
  TeacherEarning,
  RefundCase,
  Session,
  SessionAttendance,
  SessionRefundReview,
  ScholarshipCampaign,
  LearningPath,
  CoursePricingPolicy,
  SyllabusVersion,
  CurriculumUnit,
  TeacherSubjectAuthorization,
  Report,
} = require("../models");
const { AppError } = require("../utils/errors");
const { paged, escapeRegex } = require("../utils/http");
const courseCatalogService = require("./courseCatalogService");
const adminClassService = require("./adminClassService");
const reviewService = require("./reviewService");
const { audit } = require("./auditService");

const NOT_DELETED = { isDeleted: { $ne: true } };

const VALID_TRASH_TYPES = ["ALL", "CATEGORY", "SUBJECT", "COURSE", "CLASS", "REVIEW"];
const VALID_PERMANENT_TYPES = ["CATEGORY", "SUBJECT", "COURSE", "CLASS", "REVIEW"];

/**
 * Normalizes deleted actor information
 */
const formatDeletedBy = (actor) => {
  if (!actor) return null;
  const profile = actor.studentProfile || actor.teacherProfile || actor.sponsorProfile || {};
  return {
    id: actor._id ? actor._id.toString() : String(actor),
    email: actor.email || null,
    fullName: profile.fullName || actor.email || "Quản trị viên",
  };
};

/**
 * RBAC Guard: Verifies that admin has explicit permanent deletion privilege
 */
const verifyPermanentDeletePermission = async (adminId) => {
  if (!mongoose.isValidObjectId(adminId)) {
    throw new AppError("Mã định danh quản trị viên không hợp lệ.", "UNAUTHORIZED", 401);
  }
  const admin = await User.findById(adminId).lean();
  if (!admin || admin.isDeleted || admin.status !== "ACTIVE" || admin.role !== "ADMIN") {
    throw new AppError("Tài khoản không có quyền Quản trị viên hợp lệ.", "FORBIDDEN", 403);
  }

  const hasPerm =
    admin.adminProfile?.isSuperAdmin === true ||
    (Array.isArray(admin.adminProfile?.permissions) && admin.adminProfile.permissions.includes("PERMANENT_DELETE")) ||
    (Array.isArray(admin.permissions) && admin.permissions.includes("PERMANENT_DELETE")) ||
    (process.env.SUPER_ADMIN_EMAIL && admin.email?.toLowerCase() === process.env.SUPER_ADMIN_EMAIL.toLowerCase());

  if (!hasPerm) {
    throw new AppError(
      "Bạn không có quyền thực hiện Xóa vĩnh viễn dữ liệu (Yêu cầu quyền PERMANENT_DELETE hoặc Super Admin).",
      "FORBIDDEN",
      403,
      { requiredPermission: "PERMANENT_DELETE" }
    );
  }

  return admin;
};

/**
 * Checks domain dependencies to verify if an item is safe for permanent deletion
 */
const checkPermanentDeleteEligibility = async (type, id) => {
  const normalizedType = String(type).toUpperCase();
  let canPermanentDelete = true;
  let permanentDeleteBlockReason = null;

  switch (normalizedType) {
    case "CATEGORY": {
      const subjectCount = await Subject.countDocuments({ categoryId: id });
      if (subjectCount > 0) {
        canPermanentDelete = false;
        permanentDeleteBlockReason = `Không thể xóa vĩnh viễn vì vẫn còn ${subjectCount} môn học liên kết với danh mục này.`;
      } else {
        const courseCount = await Course.countDocuments({ categoryId: id });
        if (courseCount > 0) {
          canPermanentDelete = false;
          permanentDeleteBlockReason = `Không thể xóa vĩnh viễn vì vẫn còn ${courseCount} khóa học liên kết với danh mục này.`;
        }
      }
      break;
    }
    case "SUBJECT": {
      const courseCount = await Course.countDocuments({ subjectId: id });
      if (courseCount > 0) {
        canPermanentDelete = false;
        permanentDeleteBlockReason = `Không thể xóa vĩnh viễn vì vẫn còn ${courseCount} khóa học liên kết với môn học này.`;
      } else {
        const classCount = await Class.countDocuments({ subjectId: id });
        if (classCount > 0) {
          canPermanentDelete = false;
          permanentDeleteBlockReason = `Không thể xóa vĩnh viễn vì vẫn còn ${classCount} lớp học liên kết với môn học này.`;
        } else {
          const authCount = await TeacherSubjectAuthorization.countDocuments({ subjectId: id });
          if (authCount > 0) {
            canPermanentDelete = false;
            permanentDeleteBlockReason = `Không thể xóa vĩnh viễn vì vẫn còn ${authCount} hồ sơ phân công giảng dạy liên kết với môn học này.`;
          }
        }
      }
      break;
    }
    case "COURSE": {
      const classCount = await Class.countDocuments({ courseId: id });
      if (classCount > 0) {
        canPermanentDelete = false;
        permanentDeleteBlockReason = `Không thể xóa vĩnh viễn vì vẫn còn ${classCount} lớp học liên kết với khóa học này.`;
      } else {
        const enrollCount = await Enrollment.countDocuments({ courseId: id });
        if (enrollCount > 0) {
          canPermanentDelete = false;
          permanentDeleteBlockReason = `Không thể xóa vĩnh viễn vì khóa học đã có ${enrollCount} lượt ghi danh của học viên.`;
        } else {
          const refundReviewCount = await SessionRefundReview.countDocuments({ courseId: id });
          if (refundReviewCount > 0) {
            canPermanentDelete = false;
            permanentDeleteBlockReason = `Không thể xóa vĩnh viễn vì khóa học có ${refundReviewCount} hồ sơ rà soát tài chính liên quan.`;
          } else {
            const campaignCount = await ScholarshipCampaign.countDocuments({ "scope.courseIds": id });
            if (campaignCount > 0) {
              canPermanentDelete = false;
              permanentDeleteBlockReason = `Không thể xóa vĩnh viễn vì khóa học đang thuộc ${campaignCount} chiến dịch học bổng.`;
            } else {
              const lpCount = await LearningPath.countDocuments({ "steps.courseId": id });
              if (lpCount > 0) {
                canPermanentDelete = false;
                permanentDeleteBlockReason = `Không thể xóa vĩnh viễn vì khóa học đang nằm trong ${lpCount} lộ trình học tập.`;
              } else {
                const pricingCount = await CoursePricingPolicy.countDocuments({ courseId: id });
                if (pricingCount > 0) {
                  canPermanentDelete = false;
                  permanentDeleteBlockReason = `Không thể xóa vĩnh viễn vì khóa học có ${pricingCount} biểu phí liên kết.`;
                }
              }
            }
          }
        }
      }
      break;
    }
    case "CLASS": {
      const enrollCount = await Enrollment.countDocuments({ classId: id });
      if (enrollCount > 0) {
        canPermanentDelete = false;
        permanentDeleteBlockReason = `Không thể xóa vĩnh viễn vì lớp học đã có ${enrollCount} học viên đăng ký hoặc có lịch sử ghi danh.`;
      } else {
        const paymentCount = await Payment.countDocuments({ classId: id });
        if (paymentCount > 0) {
          canPermanentDelete = false;
          permanentDeleteBlockReason = `Không thể xóa vĩnh viễn vì lớp học có ${paymentCount} giao dịch thanh toán liên quan.`;
        } else {
          const earningCount = await TeacherEarning.countDocuments({ classId: id });
          if (earningCount > 0) {
            canPermanentDelete = false;
            permanentDeleteBlockReason = "Không thể xóa vĩnh viễn vì lớp học đã phát sinh doanh thu hoặc thù lao giảng dạy.";
          } else {
            const refundCount = await RefundCase.countDocuments({ classId: id });
            if (refundCount > 0) {
              canPermanentDelete = false;
              permanentDeleteBlockReason = "Không thể xóa vĩnh viễn vì lớp học có hồ sơ hoàn tiền liên quan.";
            } else {
              const reviewCount = await Review.countDocuments({ classId: id });
              if (reviewCount > 0) {
                canPermanentDelete = false;
                permanentDeleteBlockReason = `Không thể xóa vĩnh viễn vì lớp học đã có ${reviewCount} đánh giá từ học viên.`;
              } else {
                const refundReviewCount = await SessionRefundReview.countDocuments({ classId: id });
                if (refundReviewCount > 0) {
                  canPermanentDelete = false;
                  permanentDeleteBlockReason = `Không thể xóa vĩnh viễn vì lớp học có ${refundReviewCount} hồ sơ rà soát tài chính liên quan.`;
                } else {
                  const sessions = await Session.find({ classId: id }).select("_id status").lean();
                  const sessionIds = sessions.map((s) => s._id);
                  if (sessionIds.length > 0) {
                    const attendanceCount = await SessionAttendance.countDocuments({ sessionId: { $in: sessionIds } });
                    if (attendanceCount > 0) {
                      canPermanentDelete = false;
                      permanentDeleteBlockReason = `Không thể xóa vĩnh viễn vì lớp học đã có ${attendanceCount} dữ liệu điểm danh buổi học.`;
                    }
                  }
                }
              }
            }
          }
        }
      }
      break;
    }
    case "REVIEW": {
      const reportCount = await Report.countDocuments({ targetType: "REVIEW", targetId: id, status: { $in: ["OPEN", "IN_REVIEW"] } });
      if (reportCount > 0) {
        canPermanentDelete = false;
        permanentDeleteBlockReason = "Không thể xóa vĩnh viễn vì đánh giá đang có khiếu nại chưa xử lý.";
      }
      break;
    }
    default:
      canPermanentDelete = false;
      permanentDeleteBlockReason = `Không hỗ trợ xóa vĩnh viễn loại dữ liệu: ${type}`;
  }

  return { canPermanentDelete, permanentDeleteBlockReason };
};

/**
 * List soft-deleted records across supported models
 */
const listTrash = async (filters = {}, paging = { skip: 0, pageSize: 10, page: 1 }) => {
  const typeFilter = filters.type ? String(filters.type).toUpperCase() : "ALL";
  if (!VALID_TRASH_TYPES.includes(typeFilter)) {
    throw new AppError(`Invalid trash type. Must be one of: ${VALID_TRASH_TYPES.join(", ")}`, "VALIDATION_ERROR", 400);
  }

  const queryDate = {};
  if (filters.startDate) {
    const start = new Date(filters.startDate);
    if (!isNaN(start.getTime())) queryDate.$gte = start;
  }
  if (filters.endDate) {
    const end = new Date(filters.endDate);
    if (!isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      queryDate.$lte = end;
    }
  }

  const baseMatch = { isDeleted: true };
  if (Object.keys(queryDate).length > 0) {
    baseMatch.deletedAt = queryDate;
  }

  const search = filters.search ? String(filters.search).trim() : "";
  const searchPattern = search ? { $regex: escapeRegex(search), $options: "i" } : null;

  const items = [];

  // 1. Categories
  if (typeFilter === "ALL" || typeFilter === "CATEGORY") {
    const catQuery = { ...baseMatch };
    if (searchPattern) catQuery.$or = [{ name: searchPattern }, { slug: searchPattern }];
    const cats = await Category.find(catQuery).populate("deletedBy", "email studentProfile teacherProfile").lean();
    for (const c of cats) {
      items.push({
        id: c._id.toString(),
        type: "CATEGORY",
        typeLabel: "Danh mục",
        title: c.name,
        codeOrSlug: c.slug,
        originalStatus: c.status,
        deletedAt: c.deletedAt || c.updatedAt,
        deletedBy: formatDeletedBy(c.deletedBy),
        deleteReason: c.deleteReason || "Chưa có lý do ghi nhận",
      });
    }
  }

  // 2. Subjects
  if (typeFilter === "ALL" || typeFilter === "SUBJECT") {
    const subQuery = { ...baseMatch };
    if (searchPattern) subQuery.$or = [{ name: searchPattern }, { slug: searchPattern }, { categoryName: searchPattern }];
    const subs = await Subject.find(subQuery).populate("deletedBy", "email studentProfile teacherProfile").lean();
    for (const s of subs) {
      items.push({
        id: s._id.toString(),
        type: "SUBJECT",
        typeLabel: "Môn học",
        title: s.name,
        codeOrSlug: s.slug,
        parentInfo: s.categoryName,
        originalStatus: s.status,
        deletedAt: s.deletedAt || s.updatedAt,
        deletedBy: formatDeletedBy(s.deletedBy),
        deleteReason: s.deleteReason || "Chưa có lý do ghi nhận",
      });
    }
  }

  // 3. Courses
  if (typeFilter === "ALL" || typeFilter === "COURSE") {
    const courseQuery = { ...baseMatch };
    if (searchPattern) courseQuery.$or = [{ title: searchPattern }, { slug: searchPattern }, { subjectName: searchPattern }];
    const crs = await Course.find(courseQuery).populate("deletedBy", "email studentProfile teacherProfile").lean();
    for (const c of crs) {
      items.push({
        id: c._id.toString(),
        type: "COURSE",
        typeLabel: "Khóa học",
        title: c.title,
        codeOrSlug: c.slug,
        parentInfo: `${c.subjectName || ""} (${c.categoryName || ""})`.trim(),
        originalStatus: c.status,
        deletedAt: c.deletedAt || c.updatedAt,
        deletedBy: formatDeletedBy(c.deletedBy),
        deleteReason: c.deleteReason || "Chưa có lý do ghi nhận",
      });
    }
  }

  // 4. Classes
  if (typeFilter === "ALL" || typeFilter === "CLASS") {
    const classQuery = { ...baseMatch };
    if (searchPattern) classQuery.$or = [{ className: searchPattern }, { courseTitle: searchPattern }, { teacherName: searchPattern }];
    const clss = await Class.find(classQuery).populate("deletedBy", "email studentProfile teacherProfile").lean();
    for (const cl of clss) {
      items.push({
        id: cl._id.toString(),
        type: "CLASS",
        typeLabel: "Lớp học",
        title: cl.className,
        codeOrSlug: cl.courseTitle || "Lớp học",
        parentInfo: `GV: ${cl.teacherName || "Chưa rõ"}`,
        originalStatus: cl.status,
        deletedAt: cl.deletedAt || cl.updatedAt,
        deletedBy: formatDeletedBy(cl.deletedBy),
        deleteReason: cl.deleteReason || "Chưa có lý do ghi nhận",
      });
    }
  }

  // 5. Reviews
  if (typeFilter === "ALL" || typeFilter === "REVIEW") {
    const revQuery = { ...baseMatch };
    if (searchPattern) revQuery.comment = searchPattern;
    const revs = await Review.find(revQuery)
      .populate("deletedBy", "email studentProfile teacherProfile")
      .populate("classId", "className")
      .lean();
    for (const r of revs) {
      items.push({
        id: r._id.toString(),
        type: "REVIEW",
        typeLabel: "Đánh giá",
        title: r.comment ? (r.comment.length > 50 ? `${r.comment.slice(0, 50)}...` : r.comment) : `Đánh giá ${r.rating} sao`,
        codeOrSlug: `Rating: ${r.rating}/5`,
        parentInfo: r.classId ? r.classId.className : "Lớp học",
        originalStatus: "PUBLISHED",
        deletedAt: r.deletedAt || r.updatedAt,
        deletedBy: formatDeletedBy(r.deletedBy),
        deleteReason: r.deleteReason || "Chưa có lý do ghi nhận",
      });
    }
  }

  // Sort descending by deletedAt
  items.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());

  const total = items.length;
  const pagedItems = items.slice(paging.skip, paging.skip + paging.pageSize);

  // Compute eligibility for the active page items
  await Promise.all(
    pagedItems.map(async (item) => {
      try {
        const { canPermanentDelete, permanentDeleteBlockReason } = await checkPermanentDeleteEligibility(item.type, item.id);
        item.canPermanentDelete = canPermanentDelete;
        item.permanentDeleteBlockReason = permanentDeleteBlockReason;
      } catch {
        item.canPermanentDelete = false;
        item.permanentDeleteBlockReason = "Lỗi khi kiểm tra tính toàn vẹn dữ liệu";
      }
    })
  );

  return paged(pagedItems, total, paging);
};

/**
 * Pre-flight dependency check & detail for a soft-deleted item
 */
const getTrashDetail = async (type, id) => {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError("Invalid record ID", "VALIDATION_ERROR", 400);
  }

  const normalizedType = String(type).toUpperCase();
  let item = null;
  let canRestore = true;
  let restoreBlockReason = null;

  switch (normalizedType) {
    case "CATEGORY": {
      item = await Category.findOne({ _id: id, isDeleted: true }).populate("deletedBy", "email studentProfile teacherProfile").lean();
      if (!item) throw new AppError("Deleted category not found in trash", "NOT_FOUND", 404);
      // Check slug conflict
      const conflict = await Category.findOne({ slug: item.slug, ...NOT_DELETED, _id: { $ne: item._id } });
      if (conflict) {
        canRestore = false;
        restoreBlockReason = `Slug '${item.slug}' đang bị trùng lặp với một danh mục đang hoạt động.`;
      }
      break;
    }
    case "SUBJECT": {
      item = await Subject.findOne({ _id: id, isDeleted: true }).populate("deletedBy", "email studentProfile teacherProfile").lean();
      if (!item) throw new AppError("Deleted subject not found in trash", "NOT_FOUND", 404);
      // Check parent category
      const parentCat = await Category.findOne({ _id: item.categoryId, ...NOT_DELETED });
      if (!parentCat) {
        canRestore = false;
        restoreBlockReason = "Danh mục cha của môn học này đã bị xóa hoặc không hoạt động. Cần khôi phục danh mục cha trước.";
      } else {
        const conflict = await Subject.findOne({ slug: item.slug, ...NOT_DELETED, _id: { $ne: item._id } });
        if (conflict) {
          canRestore = false;
          restoreBlockReason = `Slug '${item.slug}' đang bị trùng lặp với một môn học đang hoạt động.`;
        }
      }
      break;
    }
    case "COURSE": {
      item = await Course.findOne({ _id: id, isDeleted: true }).populate("deletedBy", "email studentProfile teacherProfile").lean();
      if (!item) throw new AppError("Deleted course not found in trash", "NOT_FOUND", 404);
      const parentCat = await Category.findOne({ _id: item.categoryId, ...NOT_DELETED });
      const parentSub = await Subject.findOne({ _id: item.subjectId, ...NOT_DELETED });
      if (!parentCat || !parentSub) {
        canRestore = false;
        restoreBlockReason = "Danh mục cha hoặc môn học cha của khóa học này đã bị xóa. Cần khôi phục danh mục và môn học trước.";
      } else {
        const conflict = await Course.findOne({ slug: item.slug, ...NOT_DELETED, _id: { $ne: item._id } });
        if (conflict) {
          canRestore = false;
          restoreBlockReason = `Slug '${item.slug}' đang bị trùng lặp với một khóa học đang hoạt động.`;
        }
      }
      break;
    }
    case "CLASS": {
      item = await Class.findOne({ _id: id, isDeleted: true }).populate("deletedBy", "email studentProfile teacherProfile").lean();
      if (!item) throw new AppError("Deleted class not found in trash", "NOT_FOUND", 404);
      const conflict = await adminClassService.getClassRestoreConflict(item);
      if (conflict) {
        canRestore = false;
        restoreBlockReason = conflict.reason;
      }
      break;
    }
    case "REVIEW": {
      item = await Review.findOne({ _id: id, isDeleted: true }).populate("deletedBy", "email studentProfile teacherProfile").lean();
      if (!item) throw new AppError("Deleted review not found in trash", "NOT_FOUND", 404);
      break;
    }
    default:
      throw new AppError(`Unsupported trash type: ${type}`, "VALIDATION_ERROR", 400);
  }

  // Pre-flight check for permanent deletion
  const { canPermanentDelete, permanentDeleteBlockReason } = await checkPermanentDeleteEligibility(normalizedType, id);

  return {
    ...item,
    id: item._id.toString(),
    type: normalizedType,
    deletedBy: formatDeletedBy(item.deletedBy),
    canRestore,
    restoreBlockReason,
    canPermanentDelete,
    permanentDeleteBlockReason,
  };
};

/**
 * Domain-aware restoration execution
 */
const restoreTrash = async (adminId, type, id) => {
  const normalizedType = String(type).toUpperCase();
  switch (normalizedType) {
    case "CATEGORY":
      return courseCatalogService.restoreCategory(adminId, id);
    case "SUBJECT":
      return courseCatalogService.restoreSubject(adminId, id);
    case "COURSE":
      return courseCatalogService.restoreCourse(adminId, id);
    case "CLASS":
      return adminClassService.restoreClass(adminId, id);
    case "REVIEW":
      return reviewService.restoreReview(adminId, id);
    default:
      throw new AppError(`Cannot restore unsupported type: ${type}`, "VALIDATION_ERROR", 400);
  }
};

/**
 * Irreversible permanent deletion with dependency guards and independent audit log
 */
const permanentDeleteTrashItem = async (adminId, type, id, reason = null) => {
  // 1. Authenticate & Authorize
  await verifyPermanentDeletePermission(adminId);

  // 2. Validate type
  const normalizedType = String(type).toUpperCase();
  if (!VALID_PERMANENT_TYPES.includes(normalizedType)) {
    throw new AppError(`Không hỗ trợ xóa vĩnh viễn loại dữ liệu: ${type}`, "VALIDATION_ERROR", 400);
  }

  // 3. Validate ObjectId
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError("Mã bản ghi không hợp lệ.", "VALIDATION_ERROR", 400);
  }

  // 4. Find record
  let item = null;
  let Model = null;
  switch (normalizedType) {
    case "CATEGORY":
      Model = Category;
      break;
    case "SUBJECT":
      Model = Subject;
      break;
    case "COURSE":
      Model = Course;
      break;
    case "CLASS":
      Model = Class;
      break;
    case "REVIEW":
      Model = Review;
      break;
  }

  item = await Model.findById(id).lean();
  if (!item) {
    throw new AppError("Không tìm thấy bản ghi trong hệ thống.", "NOT_FOUND", 404);
  }

  // 5. Must be soft-deleted
  if (!item.isDeleted) {
    throw new AppError(
      "Chỉ có thể xóa vĩnh viễn bản ghi đã nằm trong Thùng rác (soft-deleted).",
      "INVALID_STATE",
      400
    );
  }

  // 6. Check domain dependencies
  const { canPermanentDelete, permanentDeleteBlockReason } = await checkPermanentDeleteEligibility(normalizedType, id);
  if (!canPermanentDelete) {
    throw new AppError(
      permanentDeleteBlockReason || "Không thể xóa vĩnh viễn do còn dữ liệu ràng buộc.",
      "DEPENDENCY_CONFLICT",
      409,
      { blockReason: permanentDeleteBlockReason }
    );
  }

  // 7. Record irreversible-delete audit log independently
  const beforeState = {
    title: item.name || item.title || item.className || item.comment || "N/A",
    codeOrSlug: item.slug || item.courseTitle || null,
    originalStatus: item.status || "UNKNOWN",
    softDeletedAt: item.deletedAt,
    softDeletedBy: item.deletedBy,
    softDeleteReason: item.deleteReason,
    permanentDeleteReason: reason || "Quản trị viên xóa vĩnh viễn có kiểm soát",
    dependenciesChecked: ["CHILD_RELATIONS", "ENROLLMENT", "FINANCIAL_INTEGRITY", "AUDIT_SAFETY"],
  };

  await audit({
    actorAdminId: adminId,
    action: "PERMANENT_DELETE",
    targetType: normalizedType,
    targetId: item._id,
    beforeState,
    afterState: {
      permanentlyDeleted: true,
      deletedAt: new Date(),
      permanentDeleteReason: reason || null,
    },
  });

  // 8. Controlled deletion
  switch (normalizedType) {
    case "CATEGORY":
      await Category.deleteOne({ _id: id, isDeleted: true });
      break;
    case "SUBJECT":
      await Subject.deleteOne({ _id: id, isDeleted: true });
      break;
    case "COURSE":
      await CurriculumUnit.deleteMany({ courseId: id });
      await SyllabusVersion.deleteMany({ courseId: id });
      await Course.deleteOne({ _id: id, isDeleted: true });
      break;
    case "CLASS":
      await Session.deleteMany({ classId: id });
      await Class.deleteOne({ _id: id, isDeleted: true });
      break;
    case "REVIEW":
      await Review.deleteOne({ _id: id, isDeleted: true });
      break;
  }

  return {
    success: true,
    message: "Dữ liệu đã được xóa vĩnh viễn khỏi hệ thống thành công.",
    id: String(id),
    type: normalizedType,
  };
};

module.exports = {
  listTrash,
  getTrashDetail,
  restoreTrash,
  permanentDeleteTrashItem,
  verifyPermanentDeletePermission,
  checkPermanentDeleteEligibility,
};
