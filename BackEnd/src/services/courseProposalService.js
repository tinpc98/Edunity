const mongoose = require("mongoose");
const { CourseProposal, Category, Subject, User, SyllabusVersion, CurriculumUnit, Course } = require("../models");
const { COURSE_LEVELS } = require("../models/constants");
const { AppError, FORBIDDEN } = require("../utils/errors");
const { assertId, paged, validationError, isBlank } = require("../utils/http");
const { resolveGradeLevel } = require("../utils/gradeLevel");
const catalog = require("./courseCatalogService");
const { audit } = require("./auditService");
const { notify, notifyAdmins } = require("./notificationService");
const { withoutReviewer } = require("../utils/publicView");
const { getVerifiedTeacher } = require("./teacherClassService");

const TEXT_FIELDS = ["description", "learningObjectives", "syllabus", "prerequisites", "estimatedDuration", "curriculumReference"];
const STATUSES = ["PENDING_REVIEW", "NEED_CHANGES", "APPROVED", "REJECTED"];

const redactTeacherProposalView = (doc) => {
  const view = withoutReviewer(doc);
  if (Array.isArray(view.revisionHistory)) {
    view.revisionHistory = view.revisionHistory.map((entry) => {
      if (entry && entry.actorRole === "ADMIN") {
        const { actorId, ...rest } = entry;
        return rest;
      }
      return entry;
    });
  }
  return view;
};

const normalizeSyllabusDraft = (draft) => {
  if (draft === undefined) return undefined;
  if (draft === null) return { summary: "", units: [] };
  if (typeof draft !== "object") throw validationError("syllabusDraft must be an object");

  const unitsRaw = draft.units === undefined ? [] : draft.units;
  if (!Array.isArray(unitsRaw)) throw validationError("syllabusDraft.units must be an array");

  const usedOrders = new Set();
  let nextAuto = 1;
  const units = unitsRaw.map((u) => {
    if (!u || typeof u !== "object" || isBlank(u.title)) {
      throw validationError("Each syllabusDraft unit requires a non-empty title");
    }
    let unitOrder = u.unitOrder;
    if (unitOrder !== undefined && unitOrder !== null) {
      if (!Number.isInteger(unitOrder) || unitOrder < 1) {
        throw validationError("syllabusDraft unitOrder must be a positive integer");
      }
      if (usedOrders.has(unitOrder)) {
        throw new AppError(`Duplicate unitOrder ${unitOrder} in syllabusDraft`, "DUPLICATE_UNIT_ORDER", 409);
      }
    } else {
      while (usedOrders.has(nextAuto)) nextAuto += 1;
      unitOrder = nextAuto;
    }
    usedOrders.add(unitOrder);

    let durationMinutes = null;
    if (u.durationMinutes !== undefined && u.durationMinutes !== null) {
      if (typeof u.durationMinutes !== "number" || !Number.isFinite(u.durationMinutes) || u.durationMinutes < 0) {
        throw validationError("syllabusDraft unit durationMinutes must be a non-negative number");
      }
      durationMinutes = u.durationMinutes;
    }
    if (u.topics !== undefined && u.topics !== null) {
      if (!Array.isArray(u.topics) || u.topics.some((t) => typeof t !== "string")) {
        throw validationError("syllabusDraft unit topics must be an array of strings");
      }
    }

    return {
      unitOrder,
      title: u.title.trim(),
      description: u.description !== undefined && u.description !== null ? String(u.description).trim() : "",
      learningObjectives: u.learningObjectives !== undefined && u.learningObjectives !== null ? String(u.learningObjectives).trim() : "",
      durationMinutes,
      topics: Array.isArray(u.topics) ? u.topics.map((t) => t.trim()).filter(Boolean) : [],
    };
  });

  units.sort((a, b) => a.unitOrder - b.unitOrder);

  return {
    summary: draft.summary !== undefined && draft.summary !== null ? String(draft.summary).trim() : "",
    units,
  };
};

const normalizePricingExpectation = (raw) => {
  if (raw === undefined) return undefined;
  if (raw === null) return undefined;
  if (typeof raw !== "object") throw validationError("pricingExpectation must be an object");

  const result = {
    suggestedClassType: null,
    suggestedMinPrice: null,
    suggestedMaxPrice: null,
    estimatedSessions: null,
    notes: raw.notes !== undefined && raw.notes !== null ? String(raw.notes).trim() : "",
  };

  if (raw.suggestedClassType !== undefined && raw.suggestedClassType !== null && raw.suggestedClassType !== "") {
    if (!["FREE", "PAID"].includes(raw.suggestedClassType)) {
      throw validationError("pricingExpectation.suggestedClassType must be FREE or PAID");
    }
    result.suggestedClassType = raw.suggestedClassType;
  }

  for (const field of ["suggestedMinPrice", "suggestedMaxPrice"]) {
    if (raw[field] !== undefined && raw[field] !== null) {
      const val = Number(raw[field]);
      if (!Number.isFinite(val) || val < 0) {
        throw validationError(`pricingExpectation.${field} must be a non-negative number`);
      }
      result[field] = val;
    }
  }

  if (result.suggestedMinPrice !== null && result.suggestedMaxPrice !== null && result.suggestedMaxPrice < result.suggestedMinPrice) {
    throw validationError("pricingExpectation.suggestedMaxPrice must be >= suggestedMinPrice");
  }

  if (raw.estimatedSessions !== undefined && raw.estimatedSessions !== null) {
    const s = Number(raw.estimatedSessions);
    if (!Number.isInteger(s) || s < 1) {
      throw validationError("pricingExpectation.estimatedSessions must be an integer >= 1");
    }
    result.estimatedSessions = s;
  }

  return result;
};

const getActiveTeacher = async (teacherId) => {
  const teacher = await User.findById(teacherId);
  if (!teacher || teacher.isDeleted || teacher.role !== "TEACHER") throw FORBIDDEN("Only TEACHER can perform this action");
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
  const level = catalog.resolveLevel(data.level);

  const proposal = {
    categoryId: category._id,
    subjectId: subject._id,
    title: data.title,
    level,
    gradeLevel: resolveGradeLevel(category, data.gradeLevel),
  };
  for (const field of TEXT_FIELDS) proposal[field] = data[field];

  const syllabusDraft = normalizeSyllabusDraft(data.syllabusDraft);
  if (syllabusDraft !== undefined) {
    proposal.syllabusDraft = syllabusDraft;
    if (!proposal.syllabus && syllabusDraft.units.length > 0) {
      proposal.syllabus = syllabusDraft.units.map((u) => `${u.unitOrder}. ${u.title}`).join("\n");
    }
  }

  const pricingExpectation = normalizePricingExpectation(data.pricingExpectation);
  if (pricingExpectation !== undefined) {
    proposal.pricingExpectation = pricingExpectation;
  }

  return proposal;
};

const createProposal = async (teacherId, body = {}) => {
  await getVerifiedTeacher(teacherId);
  const data = await buildProposalData(body);
  const now = new Date();
  const proposal = await CourseProposal.create({
    ...data,
    teacherId,
    status: "PENDING_REVIEW",
    submittedAt: now,
    revisionNumber: 1,
    revisionHistory: [
      {
        revisionNumber: 1,
        action: "SUBMITTED",
        actorId: teacherId,
        actorRole: "TEACHER",
        note: null,
        at: now,
      },
    ],
  });

  await notifyAdmins("Đề xuất khóa học mới", `Đề xuất "${proposal.title}" đang chờ duyệt.`, "COURSE_PROPOSAL_SUBMITTED");
  return redactTeacherProposalView(proposal.toObject());
};

const listMyProposals = async (teacherId, query = {}, paging) => {
  await getActiveTeacher(teacherId);
  const filter = { teacherId };
  if (query.status) filter.status = query.status;
  const [items, total] = await Promise.all([
    CourseProposal.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    CourseProposal.countDocuments(filter),
  ]);
  return paged(items.map(redactTeacherProposalView), total, paging);
};

// Teacher chỉnh sửa và gửi lại khi Admin yêu cầu (NEED_CHANGES) hoặc khi hồ sơ còn chờ duyệt
const updateMyProposal = async (teacherId, proposalId, body = {}) => {
  await getVerifiedTeacher(teacherId);
  assertId(proposalId, "Course proposal not found", "COURSE_PROPOSAL_NOT_FOUND");
  const proposal = await CourseProposal.findOne({ _id: proposalId, teacherId });
  if (!proposal) throw new AppError("Course proposal not found", "COURSE_PROPOSAL_NOT_FOUND", 404);
  if (!["PENDING_REVIEW", "NEED_CHANGES"].includes(proposal.status)) {
    throw new AppError("Course proposal can no longer be edited", "COURSE_PROPOSAL_NOT_EDITABLE", 409);
  }

  const data = await buildProposalData({ ...proposal.toObject(), ...body });
  const nextRevision = (proposal.revisionNumber || 1) + 1;
  const now = new Date();
  proposal.set({
    ...data,
    status: "PENDING_REVIEW",
    submittedAt: now,
    revisionNumber: nextRevision,
  });
  proposal.revisionHistory = Array.isArray(proposal.revisionHistory) ? proposal.revisionHistory : [];
  proposal.revisionHistory.push({
    revisionNumber: nextRevision,
    action: "RESUBMITTED",
    actorId: teacherId,
    actorRole: "TEACHER",
    note: body.revisionNote ? String(body.revisionNote).trim() : null,
    at: now,
  });
  await proposal.save();
  return redactTeacherProposalView(proposal.toObject());
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
const approveProposal = async (adminId, proposalId, body = {}) => {
  const proposal = await getProposalOrThrow(proposalId);
  assertPendingReview(proposal);

  const category = await catalog.getCategoryOrThrow(proposal.categoryId);
  const subject = await catalog.getSubjectOrThrow(proposal.subjectId);
  const data = proposal.toObject();
  if (body.gradeLevel !== undefined) data.gradeLevel = body.gradeLevel;
  if (body.curriculumReference !== undefined) data.curriculumReference = body.curriculumReference;
  const overrideDraft = body.syllabusDraft !== undefined ? normalizeSyllabusDraft(body.syllabusDraft) : null;
  const effectiveDraft = overrideDraft || (data.syllabusDraft && Array.isArray(data.syllabusDraft.units) && data.syllabusDraft.units.length > 0 ? data.syllabusDraft : null);
  const hasUnitsForSyllabus = Boolean(effectiveDraft && Array.isArray(effectiveDraft.units) && effectiveDraft.units.length > 0);
  if (hasUnitsForSyllabus && !data.syllabus) {
    data.syllabus = effectiveDraft.units.map((u) => `${u.unitOrder}. ${u.title}`).join("\n");
  }

  const now = new Date();
  const session = await mongoose.startSession();
  let course;
  let initialSyllabusVersion = null;
  try {
    await session.withTransaction(async () => {
      course = await catalog.insertCourse({ adminId, subject, category, data, sourceProposalId: proposal._id, session });

      if (hasUnitsForSyllabus) {
        const syllabusSummaryText = effectiveDraft.units.map((u) => `${u.unitOrder}. ${u.title}`).join("\n");
        const [createdSv] = await SyllabusVersion.create(
          [
            {
              courseId: course._id,
              versionNumber: 1,
              title: `${course.title} v1`,
              summary: effectiveDraft.summary || "",
              status: "PUBLISHED",
              publishedAt: now,
              publishedBy: adminId,
              createdBy: adminId,
            },
          ],
          { session }
        );
        initialSyllabusVersion = createdSv;

        const unitDocs = effectiveDraft.units.map((u) => ({
          syllabusVersionId: createdSv._id,
          courseId: course._id,
          unitOrder: u.unitOrder,
          title: u.title,
          description: u.description || "",
          learningObjectives: u.learningObjectives || "",
          durationMinutes: u.durationMinutes !== undefined ? u.durationMinutes : null,
          topics: Array.isArray(u.topics) ? u.topics : [],
          migratedFromLegacy: false,
          createdBy: adminId,
        }));
        await CurriculumUnit.insertMany(unitDocs, { session });

        await Course.updateOne(
          { _id: course._id },
          {
            $set: {
              publishedSyllabusVersionId: createdSv._id,
              syllabus: syllabusSummaryText,
              updatedBy: adminId,
            },
          },
          { session }
        );
        course.publishedSyllabusVersionId = createdSv._id;
        course.syllabus = syllabusSummaryText;
      }

      const updated = await CourseProposal.updateOne(
        { _id: proposal._id, status: "PENDING_REVIEW" },
        {
          $set: {
            status: "APPROVED",
            approvedCourseId: course._id,
            reviewedBy: adminId,
            reviewedAt: now,
            reviewNote: body.reviewNote || null,
          },
          $push: {
            revisionHistory: {
              revisionNumber: proposal.revisionNumber || 1,
              action: "APPROVED",
              actorId: adminId,
              actorRole: "ADMIN",
              note: body.reviewNote || null,
              at: now,
            },
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
          afterState: {
            status: "APPROVED",
            approvedCourseId: course._id,
            publishedSyllabusVersionId: initialSyllabusVersion ? initialSyllabusVersion._id : null,
          },
        },
        session
      );
    });
  } finally {
    session.endSession();
  }

  await notify(proposal.teacherId, "Đề xuất khóa học được duyệt", `Khóa học "${course.title}" đã được thêm vào danh mục.`, "COURSE_PROPOSAL_APPROVED");
  return {
    proposal: await adminGetProposal(proposal._id),
    course: course.toObject(),
    ...(initialSyllabusVersion ? { syllabusVersion: initialSyllabusVersion.toObject() } : {}),
  };
};

const reviewProposal = async (adminId, proposalId, body = {}, status) => {
  const proposal = await getProposalOrThrow(proposalId);
  assertPendingReview(proposal);
  if (status === "NEED_CHANGES" && isBlank(body.reviewNote)) {
    throw validationError("reviewNote is required when requesting changes");
  }

  const now = new Date();
  const updated = await CourseProposal.findOneAndUpdate(
    { _id: proposal._id, status: "PENDING_REVIEW" },
    {
      $set: { status, reviewedBy: adminId, reviewedAt: now, reviewNote: body.reviewNote || null },
      $push: {
        revisionHistory: {
          revisionNumber: proposal.revisionNumber || 1,
          action: status,
          actorId: adminId,
          actorRole: "ADMIN",
          note: body.reviewNote || null,
          at: now,
        },
      },
    },
    { returnDocument: "after" }
  );
  if (!updated) throw new AppError("Course proposal is not pending review", "COURSE_PROPOSAL_NOT_PENDING", 409);

  await audit({
    actorAdminId: adminId,
    action: `COURSE_PROPOSAL_${status}`,
    targetType: "CourseProposal",
    targetId: proposal._id,
    beforeState: { status: "PENDING_REVIEW" },
    afterState: { status, reviewNote: updated.reviewNote },
  });

  const title = status === "REJECTED" ? "Đề xuất khóa học bị từ chối" : "Đề xuất khóa học cần chỉnh sửa";
  await notify(proposal.teacherId, title, updated.reviewNote || `Đề xuất "${proposal.title}".`, `COURSE_PROPOSAL_${status}`);
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
