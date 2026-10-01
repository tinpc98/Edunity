const mongoose = require("mongoose");
const { CourseProposal, Category, Subject, User } = require("../models");
const { COURSE_LEVELS } = require("../models/constants");
const { AppError, FORBIDDEN } = require("../utils/errors");
const { assertId, paged, validationError, isBlank } = require("../utils/http");
const { resolveGradeLevel } = require("../utils/gradeLevel");
const catalog = require("./courseCatalogService");
const { audit } = require("./auditService");
const { notify, notifyAdmins } = require("./notificationService");

const TEXT_FIELDS = ["description", "learningObjectives", "syllabus", "prerequisites", "estimatedDuration"];
const STATUSES = ["PENDING_REVIEW", "NEED_CHANGES", "APPROVED", "REJECTED"];

const getActiveTeacher = async (teacherId) => {
  const teacher = await User.findById(teacherId);
  if (!teacher || teacher.role !== "TEACHER") throw FORBIDDEN("Only TEACHER can perform this action");
  if (teacher.status !== "ACTIVE") throw new AppError("Teacher account is not active", "ACCOUNT_NOT_ACTIVE", 403);
  return teacher;
};

/**
 * UC-TEA-06 validation. The backend re-validates Category ↔ Subject ↔ gradeLevel
 * instead of trusting the select boxes on the frontend (BR-44, BR-45).
 */
const buildProposalData = async (data) => {
  const missing = ["categoryId", "subjectId", "title", "description"].filter(
    (field) => data[field] === undefined || data[field] === null || data[field] === ""
  );
  if (missing.length) throw validationError("Missing required fields", { missing });
  if (isBlank(data.title)) throw validationError("title must not be empty");

  const category = await catalog.getCategoryOrThrow(data.categoryId);
  const subject = await catalog.getSubjectOrThrow(data.subjectId);
  if (category.status !== "ACTIVE" || subject.status !== "ACTIVE") {
    throw validationError("Category or Subject is not active");
  }
  if (subject.categoryId.toString() !== category._id.toString()) {
    throw new AppError("Subject does not belong to the selected category", "SUBJECT_CATEGORY_MISMATCH", 400);
  }
  if (data.level !== undefined && data.level !== null && data.level !== "" && !COURSE_LEVELS.includes(data.level)) {
    throw validationError(`level must be one of ${COURSE_LEVELS.join(", ")}`);
  }

  const proposal = {
    categoryId: category._id,
    subjectId: subject._id,
    title: data.title,
    level: data.level || undefined,
    gradeLevel: resolveGradeLevel(category, data.gradeLevel),
  };
  for (const field of TEXT_FIELDS) proposal[field] = data[field];
  return proposal;
};

const createProposal = async (teacherId, body) => {
  await getActiveTeacher(teacherId);
  const data = await buildProposalData(body);
  const proposal = await CourseProposal.create({ ...data, teacherId, status: "PENDING_REVIEW" });

  await notifyAdmins("Đề xuất khóa học mới", `Đề xuất "${proposal.title}" đang chờ duyệt.`, "COURSE_PROPOSAL_SUBMITTED");
  return proposal.toObject();
};

const listMyProposals = async (teacherId, query, paging) => {
  const filter = { teacherId };
  if (query.status) filter.status = query.status;
  const [items, total] = await Promise.all([
    CourseProposal.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    CourseProposal.countDocuments(filter),
  ]);
  return paged(items, total, paging);
};

// Teacher chỉnh sửa và gửi lại khi Admin yêu cầu (NEED_CHANGES) hoặc khi hồ sơ còn chờ duyệt
const updateMyProposal = async (teacherId, proposalId, body) => {
  await getActiveTeacher(teacherId);
  assertId(proposalId, "Course proposal not found", "COURSE_PROPOSAL_NOT_FOUND");
  const proposal = await CourseProposal.findOne({ _id: proposalId, teacherId });
  if (!proposal) throw new AppError("Course proposal not found", "COURSE_PROPOSAL_NOT_FOUND", 404);
  if (!["PENDING_REVIEW", "NEED_CHANGES"].includes(proposal.status)) {
    throw new AppError("Course proposal can no longer be edited", "COURSE_PROPOSAL_NOT_EDITABLE", 409);
  }

  const data = await buildProposalData({ ...proposal.toObject(), ...body });
  proposal.set({ ...data, status: "PENDING_REVIEW" });
  await proposal.save();
  return proposal.toObject();
};

const present = async (proposals) => {
  const [teachers, categories, subjects] = await Promise.all([
    User.find({ _id: { $in: proposals.map((p) => p.teacherId) } }).select("email teacherProfile.fullName").lean(),
    Category.find({ _id: { $in: proposals.map((p) => p.categoryId) } }).select("name").lean(),
    Subject.find({ _id: { $in: proposals.map((p) => p.subjectId) } }).select("name").lean(),
  ]);
  const byId = (docs) => new Map(docs.map((doc) => [doc._id.toString(), doc]));
  const teacherMap = byId(teachers);
  const categoryMap = byId(categories);
  const subjectMap = byId(subjects);

  return proposals.map((proposal) => {
    const teacher = teacherMap.get(proposal.teacherId.toString());
    return {
      ...proposal,
      teacherName: teacher && teacher.teacherProfile ? teacher.teacherProfile.fullName : null,
      teacherEmail: teacher ? teacher.email : null,
      categoryName: categoryMap.get(proposal.categoryId.toString())?.name || null,
      subjectName: subjectMap.get(proposal.subjectId.toString())?.name || null,
    };
  });
};

const adminListProposals = async (query, paging) => {
  const filter = {};
  if (query.status) {
    if (!STATUSES.includes(query.status)) throw validationError("status is invalid");
    filter.status = query.status;
  }
  const [items, total] = await Promise.all([
    CourseProposal.find(filter).sort({ createdAt: 1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    CourseProposal.countDocuments(filter),
  ]);
  return paged(await present(items), total, paging);
};

const getProposalOrThrow = async (proposalId) => {
  assertId(proposalId, "Course proposal not found", "COURSE_PROPOSAL_NOT_FOUND");
  const proposal = await CourseProposal.findById(proposalId);
  if (!proposal) throw new AppError("Course proposal not found", "COURSE_PROPOSAL_NOT_FOUND", 404);
  return proposal;
};

const adminGetProposal = async (proposalId) => {
  const proposal = await getProposalOrThrow(proposalId);
  const [presented] = await present([proposal.toObject()]);
  return presented;
};

const assertPendingReview = (proposal) => {
  if (proposal.status !== "PENDING_REVIEW") {
    throw new AppError("Course proposal is not pending review", "COURSE_PROPOSAL_NOT_PENDING", 409);
  }
};

// FR-ADM-06: approve → Course được thêm vào catalog với gradeLevel đã được Admin xác nhận
const approveProposal = async (adminId, proposalId, body) => {
  const proposal = await getProposalOrThrow(proposalId);
  assertPendingReview(proposal);

  const category = await catalog.getCategoryOrThrow(proposal.categoryId);
  const subject = await catalog.getSubjectOrThrow(proposal.subjectId);
  const data = proposal.toObject();
  if (body.gradeLevel !== undefined) data.gradeLevel = body.gradeLevel;

  const session = await mongoose.startSession();
  let course;
  try {
    await session.withTransaction(async () => {
      course = await catalog.insertCourse({ adminId, subject, category, data, sourceProposalId: proposal._id, session });

      const updated = await CourseProposal.updateOne(
        { _id: proposal._id, status: "PENDING_REVIEW" },
        {
          $set: {
            status: "APPROVED",
            approvedCourseId: course._id,
            reviewedBy: adminId,
            reviewedAt: new Date(),
            reviewNote: body.reviewNote || null,
          },
        },
        { session }
      );
      if (updated.modifiedCount !== 1) {
        throw new AppError("Course proposal is not pending review", "COURSE_PROPOSAL_NOT_PENDING", 409);
      }

      await audit(
        {
          actorAdminId: adminId,
          action: "COURSE_PROPOSAL_APPROVED",
          targetType: "CourseProposal",
          targetId: proposal._id,
          beforeState: { status: "PENDING_REVIEW" },
          afterState: { status: "APPROVED", approvedCourseId: course._id },
        },
        session
      );
    });
  } finally {
    session.endSession();
  }

  await notify(proposal.teacherId, "Đề xuất khóa học được duyệt", `Khóa học "${course.title}" đã được thêm vào danh mục.`, "COURSE_PROPOSAL_APPROVED");
  return { proposal: await adminGetProposal(proposal._id), course: course.toObject() };
};

const reviewProposal = async (adminId, proposalId, body, status) => {
  const proposal = await getProposalOrThrow(proposalId);
  assertPendingReview(proposal);
  if (status === "NEED_CHANGES" && isBlank(body.reviewNote)) {
    throw validationError("reviewNote is required when requesting changes");
  }

  proposal.set({ status, reviewedBy: adminId, reviewedAt: new Date(), reviewNote: body.reviewNote || null });
  await proposal.save();
  await audit({
    actorAdminId: adminId,
    action: `COURSE_PROPOSAL_${status}`,
    targetType: "CourseProposal",
    targetId: proposal._id,
    beforeState: { status: "PENDING_REVIEW" },
    afterState: { status, reviewNote: proposal.reviewNote },
  });

  const title = status === "REJECTED" ? "Đề xuất khóa học bị từ chối" : "Đề xuất khóa học cần chỉnh sửa";
  await notify(proposal.teacherId, title, proposal.reviewNote || `Đề xuất "${proposal.title}".`, `COURSE_PROPOSAL_${status}`);
  return adminGetProposal(proposal._id);
};

const rejectProposal = (adminId, proposalId, body) => reviewProposal(adminId, proposalId, body, "REJECTED");
const requestProposalChanges = (adminId, proposalId, body) => reviewProposal(adminId, proposalId, body, "NEED_CHANGES");

module.exports = {
  createProposal,
  listMyProposals,
  updateMyProposal,
  adminListProposals,
  adminGetProposal,
  approveProposal,
  rejectProposal,
  requestProposalChanges,
};
