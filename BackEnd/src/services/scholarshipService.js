const mongoose = require("mongoose");
const {
  ScholarshipApplication,
  ScholarshipCampaign,
  Scholarship,
  VerificationDocument,
  User,
} = require("../models");
const { AppError } = require("../utils/errors");
const { paged, validationError, isBlank } = require("../utils/http");
const { toNum } = require("../utils/money");
const { getSetting } = require("../utils/settings");
const campaignService = require("./campaignService");
const storage = require("./storageService");
const { audit } = require("./auditService");
const { notify, notifyAdmins } = require("./notificationService");

const APPLICATION_STATUSES = ["SUBMITTED", "NEED_MORE_INFORMATION", "APPROVED", "REJECTED"];
// BR-29: hồ sơ còn active. An APPROVED application also blocks a new one — one Scholarship per Campaign.
const BLOCKING_STATUSES = ["SUBMITTED", "NEED_MORE_INFORMATION", "APPROVED"];
const FILE_SIDES = ["FRONT", "BACK", "SINGLE"];

const applicationNotFound = () => new AppError("Scholarship application not found", "APPLICATION_NOT_FOUND", 404);

/**
 * Validates uploaded document references. Only private storage keys are accepted —
 * a public URL must never be stored (NFR-04, NFR-14, mục 10.22).
 */
const parseDocuments = (documents, { required }) => {
  if (documents === undefined || documents === null) {
    if (required) throw validationError("documents is required: at least one verification document must be uploaded");
    return [];
  }
  if (!Array.isArray(documents) || (required && documents.length === 0)) {
    throw validationError("documents must be a non-empty array");
  }

  return documents.map((document, index) => {
    const files = document && Array.isArray(document.files) ? document.files : [];
    if (files.length === 0) throw validationError(`documents[${index}].files must contain at least one file`);
    return files.map((file) => {
      if (!file || isBlank(file.storageKey)) throw validationError(`documents[${index}]: storageKey is required`);
      if (/^https?:\/\//i.test(file.storageKey)) {
        throw validationError(`documents[${index}]: storageKey must be a private storage key, not a URL`);
      }
      const side = file.side || "SINGLE";
      if (!FILE_SIDES.includes(side)) throw validationError(`documents[${index}]: side is invalid`);
      return { side, storageKey: file.storageKey, mimeType: file.mimeType };
    });
  });
};

const assertOwnedFiles = (studentId, fileGroups) =>
  storage.assertOwnedKeys(studentId, fileGroups.flat().map((file) => file.storageKey));

const saveDocuments = async (studentId, applicationId, fileGroups, session) => {
  if (!fileGroups.length) return;
  await VerificationDocument.create(
    fileGroups.map((files) => ({
      userId: studentId,
      applicationId,
      documentType: "SCHOLARSHIP_PROOF",
      files,
    })),
    { session, ordered: true }
  );
};

// ---------- Student ----------

/**
 * UC-STU-07. The award amount is never read from the request (BR-36):
 * it is always Campaign.awardAmountPerStudent.
 */
const applyForScholarship = async (studentId, campaignId, body) => {
  const campaign = await campaignService.getCampaignOrThrow(campaignId);
  // BR-19: Student chỉ được Apply Campaign đang nhận hồ sơ
  if (!campaignService.isAcceptingApplications(campaign)) {
    throw new AppError("Campaign is not accepting applications", "CAMPAIGN_NOT_ACCEPTING_APPLICATIONS", 409);
  }
  if (isBlank(body.statement)) throw validationError("statement is required");
  const fileGroups = parseDocuments(body.documents, { required: true });
  await assertOwnedFiles(studentId, fileGroups);

  const duplicate = await ScholarshipApplication.findOne({
    studentId,
    campaignId: campaign._id,
    status: { $in: BLOCKING_STATUSES },
  });
  if (duplicate) {
    throw Object.assign(new AppError("You already have an active application for this campaign", "DUPLICATE_APPLICATION", 409), {
      details: { existingApplicationId: duplicate._id.toString(), status: duplicate.status },
    });
  }

  const session = await mongoose.startSession();
  let application;
  try {
    await session.withTransaction(async () => {
      [application] = await ScholarshipApplication.create(
        [{ campaignId: campaign._id, studentId, statement: body.statement, status: "SUBMITTED" }],
        { session }
      );
      await saveDocuments(studentId, application._id, fileGroups, session);
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new AppError("You already have an active application for this campaign", "DUPLICATE_APPLICATION", 409);
    }
    throw err;
  } finally {
    session.endSession();
  }

  await notifyAdmins("Hồ sơ học bổng mới", `Có hồ sơ mới cho chiến dịch "${campaign.title}".`, "SCHOLARSHIP_APPLICATION_SUBMITTED");
  return { ...application.toObject(), awardAmountPerStudent: campaign.awardAmountPerStudent };
};

// UC-STU-07 Alternative: Student bổ sung tài liệu và resubmit khi NEED_MORE_INFORMATION
const resubmitApplication = async (studentId, applicationId, body) => {
  if (!mongoose.isValidObjectId(applicationId)) throw applicationNotFound();
  const application = await ScholarshipApplication.findOne({ _id: applicationId, studentId });
  if (!application) throw applicationNotFound();
  if (application.status !== "NEED_MORE_INFORMATION") {
    throw new AppError("Application is not waiting for more information", "APPLICATION_NOT_RESUBMITTABLE", 409);
  }
  if (body.statement !== undefined && isBlank(body.statement)) throw validationError("statement must not be empty");
  const fileGroups = parseDocuments(body.documents, { required: false });
  await assertOwnedFiles(studentId, fileGroups);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (body.statement !== undefined) application.statement = body.statement;
      application.status = "SUBMITTED";
      application.submittedAt = new Date();
      await application.save({ session });
      await saveDocuments(studentId, application._id, fileGroups, session);
    });
  } finally {
    session.endSession();
  }

  await notifyAdmins("Hồ sơ học bổng được bổ sung", "Một hồ sơ học bổng đã được bổ sung và gửi lại.", "SCHOLARSHIP_APPLICATION_SUBMITTED");
  return application.toObject();
};

const attachCampaigns = async (rows) => {
  const campaigns = await ScholarshipCampaign.find({ _id: { $in: rows.map((row) => row.campaignId) } })
    .select("title status awardAmountPerStudent scope")
    .lean();
  const map = new Map(campaigns.map((campaign) => [campaign._id.toString(), campaign]));
  return rows.map((row) => ({ ...row, campaign: map.get(row.campaignId.toString()) || null }));
};

// FR-STU-25
const getMyApplications = async (studentId, paging) => {
  const filter = { studentId };
  const [items, total] = await Promise.all([
    ScholarshipApplication.find(filter).sort({ submittedAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    ScholarshipApplication.countDocuments(filter),
  ]);
  return paged(await attachCampaigns(items), total, paging);
};

// FR-STU-26
const getMyScholarships = async (studentId) => {
  const now = new Date();
  const scholarships = await Scholarship.find({ studentId }).sort({ expiresAt: 1 }).lean();
  const rows = await attachCampaigns(scholarships);
  return rows.map((row) => ({
    ...row,
    // BR-23: usable only while ACTIVE, within its validity period and with a remaining balance
    isUsable: row.status === "ACTIVE" && row.validFrom <= now && row.expiresAt > now && toNum(row.remainingAmount) > 0,
  }));
};

// ---------- Admin ----------

const adminListApplications = async (query, paging) => {
  const filter = {};
  if (query.status) {
    const statuses = String(query.status).split(",");
    if (statuses.some((status) => !APPLICATION_STATUSES.includes(status))) throw validationError("status is invalid");
    filter.status = { $in: statuses };
  }
  if (query.campaignId) {
    if (!mongoose.isValidObjectId(query.campaignId)) throw validationError("campaignId is invalid");
    filter.campaignId = query.campaignId;
  }

  const [items, total] = await Promise.all([
    ScholarshipApplication.find(filter)
      .sort({ submittedAt: 1 })
      .skip(paging.skip)
      .limit(paging.pageSize)
      .populate("studentId", "email studentProfile.fullName")
      .populate("campaignId", "title awardAmountPerStudent status")
      .lean(),
    ScholarshipApplication.countDocuments(filter),
  ]);

  return paged(
    items.map(({ studentId: student, campaignId: campaign, ...item }) => ({
      ...item,
      studentId: student ? student._id : null,
      studentName: student && student.studentProfile ? student.studentProfile.fullName : null,
      studentEmail: student ? student.email : null,
      campaignId: campaign ? campaign._id : null,
      campaignTitle: campaign ? campaign.title : null,
      awardAmountPerStudent: campaign ? campaign.awardAmountPerStudent : null,
    })),
    total,
    paging
  );
};

const getApplicationOrThrow = async (applicationId) => {
  if (!mongoose.isValidObjectId(applicationId)) throw applicationNotFound();
  const application = await ScholarshipApplication.findById(applicationId);
  if (!application) throw applicationNotFound();
  return application;
};

// UC-ADM-04 bước 1-4: Student information, Verification Documents, Campaign criteria
const adminGetApplication = async (applicationId) => {
  const application = await getApplicationOrThrow(applicationId);
  const [student, campaign, documents, scholarship] = await Promise.all([
    User.findById(application.studentId).select("email status studentProfile").lean(),
    ScholarshipCampaign.findById(application.campaignId).lean(),
    VerificationDocument.find({ applicationId: application._id }).sort({ uploadedAt: 1 }).lean(),
    Scholarship.findOne({ applicationId: application._id }).lean(),
  ]);

  return {
    ...application.toObject(),
    student: student
      ? { id: student._id.toString(), email: student.email, status: student.status, ...(student.studentProfile || {}) }
      : null,
    campaign: campaign ? campaignService.present(campaign) : null,
    documents: storage.withSignedUrls(documents), // short-lived signed URLs, Admin only (NFR-04)
    scholarship,
  };
};

const assertSubmitted = (application) => {
  if (application.status !== "SUBMITTED") {
    throw new AppError("Application is not waiting for review", "APPLICATION_NOT_REVIEWABLE", 409);
  }
};

/**
 * UC-ADM-04: approve. The allocation is never taken from the request (BR-37):
 * allocatedAmount = Campaign.awardAmountPerStudent, guarded by the Campaign Available Fund.
 */
const approveApplication = async (adminId, applicationId, body) => {
  const application = await getApplicationOrThrow(applicationId);
  assertSubmitted(application);
  const campaign = await campaignService.getCampaignOrThrow(application.campaignId);
  const award = campaign.awardAmountPerStudent;

  const session = await mongoose.startSession();
  let scholarship;
  try {
    await session.withTransaction(async () => {
      const now = new Date();
      const reviewed = await ScholarshipApplication.updateOne(
        { _id: application._id, status: "SUBMITTED" },
        { $set: { status: "APPROVED", reviewedBy: adminId, reviewedAt: now, reviewNote: body.reviewNote || null } },
        { session }
      );
      if (reviewed.modifiedCount !== 1) {
        throw new AppError("Application is not waiting for review", "APPLICATION_NOT_REVIEWABLE", 409);
      }

      // BR-26 / BR-37: atomically reserve the award from the fund that is not allocated yet
      const allocated = await ScholarshipCampaign.updateOne(
        {
          _id: campaign._id,
          $expr: { $gte: [{ $subtract: ["$fundedAmount", "$allocatedAmount"] }, award] },
        },
        { $inc: { allocatedAmount: award } },
        { session }
      );
      if (allocated.modifiedCount !== 1) {
        throw new AppError("Campaign available fund is not enough for this scholarship", "INSUFFICIENT_CAMPAIGN_FUND", 409);
      }

      const validDays = getSetting("SCHOLARSHIP_VALID_DAYS");
      [scholarship] = await Scholarship.create(
        [
          {
            campaignId: campaign._id,
            applicationId: application._id,
            studentId: application.studentId,
            allocatedAmount: award,
            remainingAmount: award,
            validFrom: now,
            expiresAt: new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000),
            status: "ACTIVE",
          },
        ],
        { session }
      );

      await VerificationDocument.updateMany(
        { applicationId: application._id, status: "PENDING" },
        { $set: { status: "APPROVED", reviewedBy: adminId, reviewedAt: now } },
        { session }
      );

      await audit(
        {
          actorAdminId: adminId,
          action: "SCHOLARSHIP_APPLICATION_APPROVED",
          targetType: "ScholarshipApplication",
          targetId: application._id,
          beforeState: { status: "SUBMITTED" },
          afterState: { status: "APPROVED", scholarshipId: scholarship._id, allocatedAmount: award.toString() },
        },
        session
      );
    });
  } finally {
    session.endSession();
  }

  await notify(
    application.studentId,
    "Hồ sơ học bổng được duyệt",
    `Bạn đã được cấp học bổng ${award.toString()} VNĐ từ chiến dịch "${campaign.title}".`,
    "SCHOLARSHIP_APPROVED"
  );
  return { application: (await getApplicationOrThrow(application._id)).toObject(), scholarship: scholarship.toObject() };
};

const reviewApplication = async (adminId, applicationId, body, status) => {
  const application = await getApplicationOrThrow(applicationId);
  // An application left in NEED_MORE_INFORMATION can still be rejected, otherwise it would stay active forever
  const reviewable = status === "REJECTED" ? ["SUBMITTED", "NEED_MORE_INFORMATION"] : ["SUBMITTED"];
  if (!reviewable.includes(application.status)) {
    throw new AppError("Application is not waiting for review", "APPLICATION_NOT_REVIEWABLE", 409);
  }
  if (status === "NEED_MORE_INFORMATION" && isBlank(body.reviewNote)) {
    throw validationError("reviewNote is required: describe the information the student must provide");
  }

  const updated = await ScholarshipApplication.findOneAndUpdate(
    { _id: application._id, status: { $in: reviewable } },
    { $set: { status, reviewedBy: adminId, reviewedAt: new Date(), reviewNote: body.reviewNote || null } },
    { returnDocument: "after" }
  ).lean();
  if (!updated) throw new AppError("Application is not waiting for review", "APPLICATION_NOT_REVIEWABLE", 409);

  await audit({
    actorAdminId: adminId,
    action: `SCHOLARSHIP_APPLICATION_${status === "REJECTED" ? "REJECTED" : "INFORMATION_REQUESTED"}`,
    targetType: "ScholarshipApplication",
    targetId: updated._id,
    beforeState: { status: application.status },
    afterState: { status, reviewNote: updated.reviewNote },
  });

  if (status === "REJECTED") {
    await notify(updated.studentId, "Hồ sơ học bổng bị từ chối", updated.reviewNote || "Hồ sơ học bổng của bạn không đạt.", "SCHOLARSHIP_REJECTED");
  } else {
    await notify(updated.studentId, "Hồ sơ học bổng cần bổ sung", updated.reviewNote, "SCHOLARSHIP_NEED_MORE_INFORMATION");
  }
  return updated;
};

const rejectApplication = (adminId, applicationId, body) => reviewApplication(adminId, applicationId, body, "REJECTED");
const requestInformation = (adminId, applicationId, body) =>
  reviewApplication(adminId, applicationId, body, "NEED_MORE_INFORMATION");

module.exports = {
  applyForScholarship,
  resubmitApplication,
  getMyApplications,
  getMyScholarships,
  adminListApplications,
  adminGetApplication,
  approveApplication,
  rejectApplication,
  requestInformation,
};
