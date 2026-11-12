const crypto = require("crypto");
const mongoose = require("mongoose");
const {
  ScholarshipApplication,
  ScholarshipCampaign,
  Scholarship,
  VerificationDocument,
  PaperDossierReceipt,
  User,
} = require("../models");
const {
  SCHOLARSHIP_APPLICATION_STATUSES,
  DOSSIER_SUBMISSION_MODES,
} = require("../models/constants");
const { AppError } = require("../utils/errors");
const { paged, validationError, escapeRegex, isBlank } = require("../utils/http");
const { toNum } = require("../utils/money");
const { getSetting } = require("../utils/settings");
const campaignService = require("./campaignService");
const storage = require("./storageService");
const { audit } = require("./auditService");
const { notify, notifyAdmins } = require("./notificationService");
const {
  assertOptionalText,
  parseGuardianInfo,
  parseSchoolInfo,
  parseSubmissionMode,
  evaluateChecklistProgress,
  assertConsentGate,
  redactReceiptForStudent,
  redactApplicationForStudent,
} = require("./scholarshipDossierGateService");

const APPLICATION_STATUSES = SCHOLARSHIP_APPLICATION_STATUSES;
// BR-29: hồ sơ còn active. Active drafts, verified dossiers and APPROVED grants all block duplicates — one Scholarship per Campaign.
const BLOCKING_STATUSES = ["DRAFT", "SUBMITTED", "NEED_MORE_INFORMATION", "DOSSIER_VERIFIED", "APPROVED"];
const FILE_SIDES = ["FRONT", "BACK", "SINGLE"];
const ALLOWED_DOC_TYPES = ["IDENTITY", "QUALIFICATION", "SCHOLARSHIP_PROOF"];

const applicationNotFound = () => new AppError("Scholarship application not found", "APPLICATION_NOT_FOUND", 404);

const generateApplicationCode = () => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `APP-${datePart}-${randPart}`;
};

const getActiveStudentOrThrow = async (studentId) => {
  const student = await User.findById(studentId).lean();
  if (!student || student.isDeleted) throw new AppError("Student not found", "USER_NOT_FOUND", 404);
  if (student.status !== "ACTIVE") throw new AppError("Student account is not active", "ACCOUNT_NOT_ACTIVE", 403);
  return student;
};

/**
 * Validates uploaded document references. Only private storage keys are accepted —
 * a public URL must never be stored (NFR-04, NFR-14, mục 10.22).
 */
const parseDocuments = (documents, { required, campaign = null, existingDocuments = [] }) => {
  if (documents === undefined || documents === null) {
    if (required) throw validationError("documents is required: at least one verification document must be uploaded");
    return [];
  }
  if (!Array.isArray(documents) || (required && documents.length === 0)) {
    throw validationError("documents must be a non-empty array");
  }

  const checklist = Array.isArray(campaign?.documentChecklist) ? campaign.documentChecklist : [];
  const checklistByCode = new Map(checklist.map((item) => [item.code.toUpperCase(), item]));
  const existingCountsByCode = new Map();
  for (const doc of existingDocuments || []) {
    if (!doc || doc.status === "REJECTED" || !doc.checklistItemCode) continue;
    const key = doc.checklistItemCode.toUpperCase();
    existingCountsByCode.set(key, (existingCountsByCode.get(key) || 0) + (doc.files ? doc.files.length : 1));
  }

  return documents.map((document, index) => {
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      throw validationError(`documents[${index}] must be an object`);
    }
    const files = Array.isArray(document.files) ? document.files : [];
    if (files.length === 0) throw validationError(`documents[${index}].files must contain at least one file`);

    let checklistItemCode = null;
    if (document.checklistItemCode !== undefined && document.checklistItemCode !== null && String(document.checklistItemCode).trim() !== "") {
      if (typeof document.checklistItemCode !== "string") {
        throw validationError(`documents[${index}].checklistItemCode must be a string`);
      }
      checklistItemCode = document.checklistItemCode.trim().toUpperCase();
      if (checklist.length > 0 && !checklistByCode.has(checklistItemCode)) {
        throw validationError(`documents[${index}].checklistItemCode "${checklistItemCode}" is not in this campaign checklist`);
      }
    }

    const checklistDef = checklistItemCode ? checklistByCode.get(checklistItemCode) : null;
    let documentType = "SCHOLARSHIP_PROOF";
    if (document.documentType !== undefined && document.documentType !== null && String(document.documentType).trim() !== "") {
      documentType = String(document.documentType).trim().toUpperCase();
      if (!ALLOWED_DOC_TYPES.includes(documentType)) {
        throw validationError(`documents[${index}].documentType is invalid`);
      }
      if (checklistDef && Array.isArray(checklistDef.acceptedDocumentTypes) && !checklistDef.acceptedDocumentTypes.includes(documentType)) {
        throw validationError(
          `documents[${index}].documentType "${documentType}" is not accepted for checklist item "${checklistItemCode}"`
        );
      }
    }

    if (checklistDef) {
      const nextCount = (existingCountsByCode.get(checklistItemCode) || 0) + files.length;
      if (nextCount > (checklistDef.maxFiles || 5)) {
        throw validationError(
          `Checklist item "${checklistItemCode}" accepts at most ${checklistDef.maxFiles || 5} files`
        );
      }
      existingCountsByCode.set(checklistItemCode, nextCount);
    }

    const title = assertOptionalText(document.title, `documents[${index}].title`, { max: 150 });
    const parsedFiles = files.map((file) => {
      if (!file || isBlank(file.storageKey)) throw validationError(`documents[${index}]: storageKey is required`);
      if (/^https?:\/\//i.test(file.storageKey)) {
        throw validationError(`documents[${index}]: storageKey must be a private storage key, not a URL`);
      }
      const side = file.side || "SINGLE";
      if (!FILE_SIDES.includes(side)) throw validationError(`documents[${index}]: side is invalid`);
      return { side, storageKey: file.storageKey, mimeType: file.mimeType };
    });

    return { checklistItemCode, title, documentType, files: parsedFiles };
  });
};

const assertOwnedFiles = (studentId, parsedDocs) =>
  storage.assertOwnedKeys(studentId, parsedDocs.flatMap((doc) => doc.files.map((file) => file.storageKey)));

const saveDocuments = async (studentId, applicationId, parsedDocs, session) => {
  if (!parsedDocs.length) return [];
  return VerificationDocument.create(
    parsedDocs.map((doc) => ({
      userId: studentId,
      applicationId,
      checklistItemCode: doc.checklistItemCode || null,
      title: doc.title || null,
      submissionSource: "ONLINE_UPLOAD",
      documentType: doc.documentType || "SCHOLARSHIP_PROOF",
      files: doc.files,
    })),
    { session, ordered: true }
  );
};

const requiresFullDossierValidation = (campaign, body = {}, existingApp = null) => {
  if (!campaign) return false;
  if (Array.isArray(campaign.documentChecklist) && campaign.documentChecklist.length > 0) return true;
  if (campaign.dossierPolicy?.requireGuardianInfo || campaign.dossierPolicy?.requireSchoolInfo) return true;
  if (body.enforceDossierValidation === true) return true;
  if (body.submissionMode && String(body.submissionMode).toUpperCase() !== "ONLINE") return true;
  if (existingApp && (existingApp.guardianInfo || existingApp.schoolInfo || existingApp.submissionMode !== "ONLINE")) {
    return true;
  }
  return false;
};

const stripDocumentReviewer = (doc) => {
  if (!doc) return doc;
  const { reviewedBy, ...rest } = doc;
  return rest;
};

// ---------- Student ----------

/**
 * UC-STU-07. The award amount is never read from the request (BR-36):
 * it is always Campaign.awardAmountPerStudent.
 */
const applyForScholarship = async (studentId, campaignId, body, options = {}) => {
  const campaign = await campaignService.getCampaignOrThrow(campaignId);
  // BR-19: Student chỉ được Apply Campaign đang nhận hồ sơ
  if (!campaignService.isAcceptingApplications(campaign)) {
    throw new AppError("Campaign is not accepting applications", "CAMPAIGN_NOT_ACCEPTING_APPLICATIONS", 409);
  }
  const student = await getActiveStudentOrThrow(studentId);

  if (isBlank(body.statement)) throw validationError("statement is required");
  const submissionMode = parseSubmissionMode(body.submissionMode, campaign);
  const fullDossierRequired = requiresFullDossierValidation(campaign, body);

  const guardianInfo = parseGuardianInfo(body.guardianInfo, {
    required: fullDossierRequired || Boolean(campaign.dossierPolicy?.requireGuardianInfo),
  });
  const schoolInfo = parseSchoolInfo(body.schoolInfo, {
    required: fullDossierRequired || Boolean(campaign.dossierPolicy?.requireSchoolInfo),
  });

  const needsOnlineDocs = submissionMode === "ONLINE" && (!campaign.documentChecklist || campaign.documentChecklist.length === 0);
  const parsedDocs = parseDocuments(body.documents, { required: needsOnlineDocs, campaign });
  await assertOwnedFiles(studentId, parsedDocs);

  const simulatedDocs = parsedDocs.map((d, i) => ({ ...d, _id: new mongoose.Types.ObjectId(), status: "PENDING", idx: i }));
  const evaluated = evaluateChecklistProgress({
    campaign,
    submissionMode,
    onlineDocuments: simulatedDocs,
    paperReceipts: [],
  });
  if (evaluated.missingOnSubmit.length > 0) {
    throw Object.assign(
      new AppError("Application is missing required checklist items for this submission mode", "DOSSIER_CHECKLIST_INCOMPLETE", 400),
      { details: { missing: evaluated.missingOnSubmit } }
    );
  }

  const consentSnapshot = await assertConsentGate({
    student,
    campaign,
    guardianInfo,
    schoolInfo,
    consentVerifier: options.consentVerifier,
    requireConsent: options.requireConsent,
  });

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
      const now = new Date();
      [application] = await ScholarshipApplication.create(
        [
          {
            campaignId: campaign._id,
            studentId,
            applicationCode: generateApplicationCode(),
            submissionMode,
            guardianInfo,
            schoolInfo,
            consentSnapshot,
            statement: body.statement.trim(),
            status: "SUBMITTED",
            submittedAt: now,
            dossierVerification: {
              status: "PENDING_REVIEW",
              checklistVerified: false,
            },
          },
        ],
        { session }
      );
      const createdDocs = await saveDocuments(studentId, application._id, parsedDocs, session);
      const finalProgress = evaluateChecklistProgress({
        campaign,
        submissionMode,
        onlineDocuments: createdDocs,
        paperReceipts: [],
      });
      application.checklistProgress = finalProgress.progress;
      await application.save({ session });
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
  return redactApplicationForStudent({ ...application.toObject(), awardAmountPerStudent: campaign.awardAmountPerStudent });
};

/**
 * AID-01: Create a V3 nonfinancial scholarship dossier (either save DRAFT or submit).
 * Always enforces guardianInfo + schoolInfo when submitting (never silently skips).
 */
const createDossier = async (studentId, campaignId, body, options = {}) => {
  const saveAsDraft = Boolean(body.saveAsDraft);
  if (!saveAsDraft) {
    return applyForScholarship(studentId, campaignId, { ...body, enforceDossierValidation: true }, options);
  }

  const campaign = await campaignService.getCampaignOrThrow(campaignId);
  if (!campaignService.isAcceptingApplications(campaign)) {
    throw new AppError("Campaign is not accepting applications", "CAMPAIGN_NOT_ACCEPTING_APPLICATIONS", 409);
  }
  if (campaign.dossierPolicy?.allowDraftSave === false) {
    throw new AppError("Draft saving is disabled for this campaign", "DRAFT_NOT_ALLOWED", 400);
  }
  await getActiveStudentOrThrow(studentId);

  const submissionMode = parseSubmissionMode(body.submissionMode, campaign);
  const guardianInfo = parseGuardianInfo(body.guardianInfo, { required: false });
  const schoolInfo = parseSchoolInfo(body.schoolInfo, { required: false });
  if (body.statement !== undefined && body.statement !== null && typeof body.statement !== "string") {
    throw validationError("statement must be a string");
  }

  const parsedDocs = parseDocuments(body.documents, { required: false, campaign });
  await assertOwnedFiles(studentId, parsedDocs);

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
        [
          {
            campaignId: campaign._id,
            studentId,
            applicationCode: generateApplicationCode(),
            submissionMode,
            guardianInfo,
            schoolInfo,
            statement: body.statement ? body.statement.trim() : "",
            status: "DRAFT",
            submittedAt: null,
            dossierVerification: {
              status: "NOT_SUBMITTED",
              checklistVerified: false,
            },
          },
        ],
        { session }
      );
      const createdDocs = await saveDocuments(studentId, application._id, parsedDocs, session);
      const evaluated = evaluateChecklistProgress({
        campaign,
        submissionMode,
        onlineDocuments: createdDocs,
        paperReceipts: [],
      });
      application.checklistProgress = evaluated.progress;
      await application.save({ session });
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new AppError("You already have an active application for this campaign", "DUPLICATE_APPLICATION", 409);
    }
    throw err;
  } finally {
    session.endSession();
  }

  return redactApplicationForStudent({ ...application.toObject(), awardAmountPerStudent: campaign.awardAmountPerStudent });
};

/**
 * AID-01: Student edits their own DRAFT or NEED_MORE_INFORMATION dossier.
 */
const updateDossier = async (studentId, applicationId, body) => {
  if (!mongoose.isValidObjectId(applicationId)) throw applicationNotFound();
  const application = await ScholarshipApplication.findOne({ _id: applicationId, studentId });
  if (!application) throw applicationNotFound();

  if (!["DRAFT", "NEED_MORE_INFORMATION"].includes(application.status)) {
    throw new AppError(
      `Dossier cannot be edited while in status ${application.status}`,
      "APPLICATION_NOT_EDITABLE",
      409
    );
  }

  const campaign = await campaignService.getCampaignOrThrow(application.campaignId);
  const existingDocs = await VerificationDocument.find({ applicationId: application._id }).lean();

  const nextMode =
    body.submissionMode !== undefined
      ? parseSubmissionMode(body.submissionMode, campaign)
      : application.submissionMode || "ONLINE";
  const nextGuardian =
    body.guardianInfo !== undefined
      ? parseGuardianInfo(body.guardianInfo, {
          required: application.status !== "DRAFT",
        })
      : application.guardianInfo;
  const nextSchool =
    body.schoolInfo !== undefined
      ? parseSchoolInfo(body.schoolInfo, {
          required: application.status !== "DRAFT",
        })
      : application.schoolInfo;
  let nextStatement = application.statement;
  if (body.statement !== undefined) {
    if (typeof body.statement !== "string" || (application.status !== "DRAFT" && isBlank(body.statement))) {
      throw validationError("statement must be a non-empty string");
    }
    nextStatement = body.statement.trim();
  }

  let removeDocIds = [];
  if (body.removeDocumentIds !== undefined) {
    if (application.status !== "DRAFT") {
      throw new AppError("Documents can only be removed while dossier is in DRAFT status", "APPLICATION_NOT_EDITABLE", 409);
    }
    if (!Array.isArray(body.removeDocumentIds) || body.removeDocumentIds.some((id) => !mongoose.isValidObjectId(id))) {
      throw validationError("removeDocumentIds must be an array of document ids");
    }
    removeDocIds = body.removeDocumentIds.map(String);
  }

  const remainingDocs = existingDocs.filter((d) => !removeDocIds.includes(d._id.toString()));
  const parsedDocs = parseDocuments(body.documents, { required: false, campaign, existingDocuments: remainingDocs });
  await assertOwnedFiles(studentId, parsedDocs);

  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      if (removeDocIds.length > 0) {
        await VerificationDocument.deleteMany(
          { _id: { $in: removeDocIds }, applicationId: application._id, userId: studentId },
          { session }
        );
      }
      await saveDocuments(studentId, application._id, parsedDocs, session);

      const latestDocs = await VerificationDocument.find({ applicationId: application._id }).session(session).lean();
      const receipts = await PaperDossierReceipt.find({ applicationId: application._id }).session(session).lean();
      const evaluated = evaluateChecklistProgress({
        campaign,
        submissionMode: nextMode,
        onlineDocuments: latestDocs,
        paperReceipts: receipts,
      });

      updated = await ScholarshipApplication.findOneAndUpdate(
        { _id: application._id, studentId, status: { $in: ["DRAFT", "NEED_MORE_INFORMATION"] } },
        {
          $set: {
            submissionMode: nextMode,
            guardianInfo: nextGuardian,
            schoolInfo: nextSchool,
            statement: nextStatement,
            checklistProgress: evaluated.progress,
          },
        },
        { returnDocument: "after", session }
      ).lean();

      if (!updated) {
        throw new AppError(
          `Dossier cannot be edited while in status ${application.status}`,
          "APPLICATION_NOT_EDITABLE",
          409
        );
      }
    });
  } finally {
    session.endSession();
  }

  return redactApplicationForStudent(updated);
};

/**
 * AID-01: Student submits a DRAFT dossier into SUBMITTED for Admin nonfinancial review.
 */
const submitDossier = async (studentId, applicationId, body = {}, options = {}) => {
  if (!mongoose.isValidObjectId(applicationId)) throw applicationNotFound();
  const application = await ScholarshipApplication.findOne({ _id: applicationId, studentId });
  if (!application) throw applicationNotFound();

  if (application.status !== "DRAFT") {
    throw new AppError("Only DRAFT dossiers can be submitted via this endpoint", "APPLICATION_NOT_SUBMITTABLE", 409);
  }

  const campaign = await campaignService.getCampaignOrThrow(application.campaignId);
  if (!campaignService.isAcceptingApplications(campaign)) {
    throw new AppError("Campaign is not accepting applications", "CAMPAIGN_NOT_ACCEPTING_APPLICATIONS", 409);
  }
  const student = await getActiveStudentOrThrow(studentId);

  const nextMode =
    body.submissionMode !== undefined ? parseSubmissionMode(body.submissionMode, campaign) : application.submissionMode || "ONLINE";
  const nextGuardian =
    body.guardianInfo !== undefined
      ? parseGuardianInfo(body.guardianInfo, { required: true })
      : parseGuardianInfo(application.guardianInfo, { required: true });
  const nextSchool =
    body.schoolInfo !== undefined
      ? parseSchoolInfo(body.schoolInfo, { required: true })
      : parseSchoolInfo(application.schoolInfo, { required: true });

  const statement = body.statement !== undefined ? body.statement : application.statement;
  if (isBlank(statement)) throw validationError("statement is required");

  const existingDocs = await VerificationDocument.find({ applicationId: application._id }).lean();
  const parsedNewDocs = parseDocuments(body.documents, { required: false, campaign, existingDocuments: existingDocs });
  await assertOwnedFiles(studentId, parsedNewDocs);

  const combinedDocs = [
    ...existingDocs,
    ...parsedNewDocs.map((d) => ({ ...d, _id: new mongoose.Types.ObjectId(), status: "PENDING" })),
  ];
  const validOnlineCount = combinedDocs.filter((d) => d.status !== "REJECTED").length;
  if (nextMode === "ONLINE" && (!campaign.documentChecklist || campaign.documentChecklist.length === 0) && validOnlineCount === 0) {
    throw validationError("At least one verification document must be uploaded before submitting");
  }

  const receipts = await PaperDossierReceipt.find({ applicationId: application._id }).lean();
  const evaluated = evaluateChecklistProgress({
    campaign,
    submissionMode: nextMode,
    onlineDocuments: combinedDocs,
    paperReceipts: receipts,
  });
  if (evaluated.missingOnSubmit.length > 0) {
    throw Object.assign(
      new AppError("Application is missing required checklist items for this submission mode", "DOSSIER_CHECKLIST_INCOMPLETE", 400),
      { details: { missing: evaluated.missingOnSubmit } }
    );
  }

  const consentSnapshot = await assertConsentGate({
    student,
    campaign,
    application,
    guardianInfo: nextGuardian,
    schoolInfo: nextSchool,
    consentVerifier: options.consentVerifier,
    requireConsent: options.requireConsent,
  });

  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      await saveDocuments(studentId, application._id, parsedNewDocs, session);
      const savedDocs = await VerificationDocument.find({ applicationId: application._id }).session(session).lean();
      const savedReceipts = await PaperDossierReceipt.find({ applicationId: application._id }).session(session).lean();
      const finalEval = evaluateChecklistProgress({
        campaign,
        submissionMode: nextMode,
        onlineDocuments: savedDocs,
        paperReceipts: savedReceipts,
      });

      updated = await ScholarshipApplication.findOneAndUpdate(
        { _id: application._id, studentId, status: "DRAFT" },
        {
          $set: {
            submissionMode: nextMode,
            guardianInfo: nextGuardian,
            schoolInfo: nextSchool,
            statement: statement.trim(),
            consentSnapshot,
            checklistProgress: finalEval.progress,
            status: "SUBMITTED",
            submittedAt: new Date(),
            "dossierVerification.status": "PENDING_REVIEW",
          },
        },
        { returnDocument: "after", session }
      ).lean();

      if (!updated) {
        throw new AppError("Only DRAFT dossiers can be submitted via this endpoint", "APPLICATION_NOT_SUBMITTABLE", 409);
      }
    });
  } finally {
    session.endSession();
  }

  await notifyAdmins("Hồ sơ học bổng mới", `Có hồ sơ mới cho chiến dịch "${campaign.title}".`, "SCHOLARSHIP_APPLICATION_SUBMITTED");
  return redactApplicationForStudent(updated);
};

// UC-STU-07 Alternative: Student bổ sung tài liệu và resubmit khi NEED_MORE_INFORMATION
const resubmitApplication = async (studentId, applicationId, body, options = {}) => {
  if (!mongoose.isValidObjectId(applicationId)) throw applicationNotFound();
  const application = await ScholarshipApplication.findOne({ _id: applicationId, studentId });
  if (!application) throw applicationNotFound();
  if (application.status !== "NEED_MORE_INFORMATION") {
    throw new AppError("Application is not waiting for more information", "APPLICATION_NOT_RESUBMITTABLE", 409);
  }
  if (body.statement !== undefined && isBlank(body.statement)) throw validationError("statement must not be empty");

  const campaign = await campaignService.getCampaignOrThrow(application.campaignId);
  const student = await getActiveStudentOrThrow(studentId);
  const existingDocs = await VerificationDocument.find({ applicationId: application._id }).lean();

  const nextMode =
    body.submissionMode !== undefined ? parseSubmissionMode(body.submissionMode, campaign) : application.submissionMode || "ONLINE";

  const fullRequired = requiresFullDossierValidation(campaign, body, application);
  const nextGuardian =
    body.guardianInfo !== undefined
      ? parseGuardianInfo(body.guardianInfo, { required: true })
      : parseGuardianInfo(application.guardianInfo, { required: fullRequired || Boolean(application.guardianInfo) });
  const nextSchool =
    body.schoolInfo !== undefined
      ? parseSchoolInfo(body.schoolInfo, { required: true })
      : parseSchoolInfo(application.schoolInfo, { required: fullRequired || Boolean(application.schoolInfo) });

  const parsedDocs = parseDocuments(body.documents, { required: false, campaign, existingDocuments: existingDocs });
  await assertOwnedFiles(studentId, parsedDocs);

  const consentSnapshot = await assertConsentGate({
    student,
    campaign,
    application,
    guardianInfo: nextGuardian,
    schoolInfo: nextSchool,
    consentVerifier: options.consentVerifier,
    requireConsent: options.requireConsent,
  });

  const nextStatement = body.statement !== undefined ? body.statement.trim() : application.statement;
  const existingDossierVerification = application.dossierVerification
    ? application.dossierVerification.toObject?.() || application.dossierVerification
    : {};

  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      await saveDocuments(studentId, application._id, parsedDocs, session);
      const savedDocs = await VerificationDocument.find({ applicationId: application._id }).session(session).lean();
      const receipts = await PaperDossierReceipt.find({ applicationId: application._id }).session(session).lean();
      const evaluated = evaluateChecklistProgress({
        campaign,
        submissionMode: nextMode,
        onlineDocuments: savedDocs,
        paperReceipts: receipts,
      });
      if (fullRequired && evaluated.missingOnSubmit.length > 0) {
        throw Object.assign(
          new AppError("Application is missing required checklist items for this submission mode", "DOSSIER_CHECKLIST_INCOMPLETE", 400),
          { details: { missing: evaluated.missingOnSubmit } }
        );
      }

      updated = await ScholarshipApplication.findOneAndUpdate(
        { _id: application._id, studentId, status: "NEED_MORE_INFORMATION" },
        {
          $set: {
            statement: nextStatement,
            submissionMode: nextMode,
            guardianInfo: nextGuardian,
            schoolInfo: nextSchool,
            consentSnapshot,
            status: "SUBMITTED",
            submittedAt: new Date(),
            dossierVerification: {
              ...existingDossierVerification,
              status: "PENDING_REVIEW",
            },
            checklistProgress: evaluated.progress,
          },
        },
        { returnDocument: "after", session }
      ).lean();

      if (!updated) {
        throw new AppError("Application is not waiting for more information", "APPLICATION_NOT_RESUBMITTABLE", 409);
      }
    });
  } finally {
    session.endSession();
  }

  await notifyAdmins("Hồ sơ học bổng được bổ sung", "Một hồ sơ học bổng đã được bổ sung và gửi lại.", "SCHOLARSHIP_APPLICATION_SUBMITTED");
  return redactApplicationForStudent(updated);
};

const withdrawDossier = async (studentId, applicationId, body = {}) => {
  if (!mongoose.isValidObjectId(applicationId)) throw applicationNotFound();
  const application = await ScholarshipApplication.findOne({ _id: applicationId, studentId });
  if (!application) throw applicationNotFound();

  const withdrawable = ["DRAFT", "SUBMITTED", "NEED_MORE_INFORMATION"];
  if (!withdrawable.includes(application.status)) {
    throw new AppError(
      `Cannot withdraw dossier in status ${application.status}`,
      "APPLICATION_NOT_WITHDRAWABLE",
      409
    );
  }

  const reason = assertOptionalText(body.reason, "reason", { max: 500 });
  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      updated = await ScholarshipApplication.findOneAndUpdate(
        { _id: application._id, studentId, status: { $in: withdrawable } },
        {
          $set: {
            status: "WITHDRAWN",
            reviewNote: reason || application.reviewNote,
          },
        },
        { returnDocument: "after", session }
      ).lean();
      if (!updated) {
        throw new AppError("Dossier is no longer withdrawable", "APPLICATION_NOT_WITHDRAWABLE", 409);
      }

      await audit(
        {
          actorAdminId: studentId,
          action: "SCHOLARSHIP_DOSSIER_WITHDRAWN",
          targetType: "ScholarshipApplication",
          targetId: updated._id,
          beforeState: { status: application.status },
          afterState: { status: "WITHDRAWN", reason: reason || null },
        },
        session
      );
    });
  } finally {
    session.endSession();
  }

  return redactApplicationForStudent(updated);
};

const attachCampaigns = async (rows) => {
  const campaigns = await ScholarshipCampaign.find({ _id: { $in: rows.map((row) => row.campaignId) } })
    .select("title status awardAmountPerStudent scope documentChecklist dossierPolicy")
    .lean();
  const map = new Map(campaigns.map((campaign) => [campaign._id.toString(), campaign]));
  return rows.map((row) => ({ ...row, campaign: map.get(row.campaignId.toString()) || null }));
};

// FR-STU-25
const getMyApplications = async (studentId, paging) => {
  const filter = { studentId };
  const [items, total] = await Promise.all([
    ScholarshipApplication.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    ScholarshipApplication.countDocuments(filter),
  ]);
  // The student reads the note and the date of the decision, not which staff member made it
  const rows = await attachCampaigns(items);
  return paged(rows.map(redactApplicationForStudent), total, paging);
};

const getMyApplicationDetail = async (studentId, applicationId) => {
  if (!mongoose.isValidObjectId(applicationId)) throw applicationNotFound();
  const application = await ScholarshipApplication.findOne({ _id: applicationId, studentId }).lean();
  if (!application) throw applicationNotFound();

  const [campaign, documents, paperReceipts] = await Promise.all([
    ScholarshipCampaign.findById(application.campaignId)
      .select("title status awardAmountPerStudent scope documentChecklist dossierPolicy applicationStart applicationEnd")
      .lean(),
    VerificationDocument.find({ applicationId: application._id }).sort({ uploadedAt: 1 }).lean(),
    PaperDossierReceipt.find({ applicationId: application._id }).sort({ receivedAt: -1 }).lean(),
  ]);

  return {
    ...redactApplicationForStudent(application),
    campaign,
    documents: storage.withSignedUrls(documents.map(stripDocumentReviewer)),
    paperReceipts: paperReceipts.map(redactReceiptForStudent),
  };
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
    const statuses = String(query.status).split(",").map((s) => s.trim().toUpperCase());
    if (statuses.some((status) => !APPLICATION_STATUSES.includes(status))) throw validationError("status is invalid");
    filter.status = { $in: statuses };
  }
  if (query.submissionMode) {
    const modes = String(query.submissionMode).split(",").map((m) => m.trim().toUpperCase());
    if (modes.some((m) => !DOSSIER_SUBMISSION_MODES.includes(m))) throw validationError("submissionMode is invalid");
    filter.submissionMode = { $in: modes };
  }
  if (query.campaignId) {
    if (!mongoose.isValidObjectId(query.campaignId)) throw validationError("campaignId is invalid");
    filter.campaignId = query.campaignId;
  }
  if (query.applicationCode) {
    filter.applicationCode = String(query.applicationCode).trim().toUpperCase();
  }
  if (query.search) {
    const rx = new RegExp(escapeRegex(String(query.search).trim()), "i");
    filter.$or = [{ applicationCode: rx }, { "schoolInfo.schoolName": rx }];
  }

  const [items, total] = await Promise.all([
    ScholarshipApplication.find(filter)
      .sort({ submittedAt: 1, createdAt: 1 })
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
  const [student, campaign, documents, paperReceipts, scholarship] = await Promise.all([
    User.findById(application.studentId).select("email status studentProfile").lean(),
    ScholarshipCampaign.findById(application.campaignId).lean(),
    VerificationDocument.find({ applicationId: application._id }).sort({ uploadedAt: 1 }).lean(),
    PaperDossierReceipt.find({ applicationId: application._id }).sort({ receivedAt: -1 }).lean(),
    Scholarship.findOne({ applicationId: application._id }).lean(),
  ]);

  const checklistSummary = campaign
    ? evaluateChecklistProgress({
        campaign,
        submissionMode: application.submissionMode || "ONLINE",
        onlineDocuments: documents,
        paperReceipts,
      })
    : null;

  return {
    ...application.toObject(),
    student: student
      ? { id: student._id.toString(), email: student.email, status: student.status, ...(student.studentProfile || {}) }
      : null,
    campaign: campaign ? campaignService.present(campaign) : null,
    documents: storage.withSignedUrls(documents), // short-lived signed URLs, Admin only (NFR-04)
    paperReceipts,
    checklistSummary,
    scholarship,
  };
};

const assertSubmitted = (application) => {
  if (application.status !== "SUBMITTED") {
    throw new AppError("Application is not waiting for review", "APPLICATION_NOT_REVIEWABLE", 409);
  }
};

/**
 * AID-01 Nonfinancial Dossier Verification & Approval:
 * Verifies guardian profile, school/class profile, document checklist & reconciled paper receipts,
 * plus AID-08 consent port if required.
 * STRICT BOUNDARY: NEVER creates a Scholarship, NEVER increments Campaign.allocatedAmount,
 * and NEVER creates financial Transactions (left strictly to AID-06 / Tin).
 */
const verifyDossierApplication = async (adminId, applicationId, body = {}, options = {}) => {
  const application = await getApplicationOrThrow(applicationId);
  assertSubmitted(application);

  const [campaign, student, documents, paperReceipts] = await Promise.all([
    campaignService.getCampaignOrThrow(application.campaignId),
    getActiveStudentOrThrow(application.studentId),
    VerificationDocument.find({ applicationId: application._id }).lean(),
    PaperDossierReceipt.find({ applicationId: application._id }).sort({ receivedAt: -1 }).lean(),
  ]);

  const missingProfile = [];
  if (isBlank(application.statement)) missingProfile.push("statement");
  if (!application.guardianInfo) {
    missingProfile.push("guardianInfo");
  } else {
    parseGuardianInfo(application.guardianInfo.toObject ? application.guardianInfo.toObject() : application.guardianInfo, {
      required: true,
    });
  }
  if (!application.schoolInfo) {
    missingProfile.push("schoolInfo");
  } else {
    parseSchoolInfo(application.schoolInfo.toObject ? application.schoolInfo.toObject() : application.schoolInfo, {
      required: true,
    });
  }
  if (missingProfile.length > 0) {
    throw Object.assign(
      new AppError("Dossier is missing required guardian, school, or statement fields", "DOSSIER_INCOMPLETE", 400),
      { details: { missing: missingProfile } }
    );
  }

  const evaluated = evaluateChecklistProgress({
    campaign,
    submissionMode: application.submissionMode || "ONLINE",
    onlineDocuments: documents,
    paperReceipts,
  });

  if (evaluated.unresolvedDiscrepancyReceipt) {
    throw new AppError(
      "Cannot verify dossier while a linked paper dossier receipt has an unresolved DISCREPANCY",
      "PAPER_RECEIPT_DISCREPANCY_UNRESOLVED",
      409
    );
  }

  if (evaluated.missingForVerification.length > 0) {
    throw Object.assign(
      new AppError("Dossier checklist requirements are not satisfied yet", "DOSSIER_CHECKLIST_INCOMPLETE", 409),
      { details: { missing: evaluated.missingForVerification } }
    );
  }

  if ((!campaign.documentChecklist || campaign.documentChecklist.length === 0)) {
    if (application.submissionMode === "PAPER" && !evaluated.hasReconciledPaperReceipt) {
      throw new AppError(
        "A reconciled PaperDossierReceipt is required to verify a PAPER dossier",
        "PAPER_RECEIPT_NOT_RECONCILED",
        409
      );
    }
    if (application.submissionMode === "ONLINE" && evaluated.validOnlineDocCount === 0) {
      throw new AppError(
        "At least one valid non-rejected uploaded document is required to verify an ONLINE dossier",
        "DOSSIER_CHECKLIST_INCOMPLETE",
        409
      );
    }
    if (application.submissionMode === "HYBRID" && evaluated.validOnlineDocCount === 0 && !evaluated.hasReconciledPaperReceipt) {
      throw new AppError(
        "HYBRID dossier requires uploaded proof or a reconciled PaperDossierReceipt",
        "DOSSIER_CHECKLIST_INCOMPLETE",
        409
      );
    }
  }

  const consentSnapshot = await assertConsentGate({
    student,
    campaign,
    application,
    guardianInfo: application.guardianInfo,
    schoolInfo: application.schoolInfo,
    consentVerifier: options.consentVerifier,
    requireConsent: options.requireConsent,
  });

  const reviewNote = assertOptionalText(body.reviewNote || body.note, "reviewNote", { max: 1000 });
  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      const now = new Date();
      updated = await ScholarshipApplication.findOneAndUpdate(
        { _id: application._id, status: "SUBMITTED" },
        {
          $set: {
            status: "DOSSIER_VERIFIED",
            reviewedBy: adminId,
            reviewedAt: now,
            reviewNote,
            checklistProgress: evaluated.progress,
            consentSnapshot,
            dossierVerification: {
              status: "VERIFIED",
              verifiedBy: adminId,
              verifiedAt: now,
              note: reviewNote,
              checklistVerified: true,
            },
          },
        },
        { returnDocument: "after", session }
      ).lean();

      if (!updated) {
        throw new AppError("Application is not waiting for review", "APPLICATION_NOT_REVIEWABLE", 409);
      }

      await VerificationDocument.updateMany(
        { applicationId: application._id, status: "PENDING" },
        { $set: { status: "APPROVED", reviewedBy: adminId, reviewedAt: now } },
        { session }
      );

      await audit(
        {
          actorAdminId: adminId,
          action: "SCHOLARSHIP_DOSSIER_VERIFIED",
          targetType: "ScholarshipApplication",
          targetId: application._id,
          beforeState: { status: "SUBMITTED" },
          afterState: {
            status: "DOSSIER_VERIFIED",
            submissionMode: application.submissionMode,
            checklistVerified: true,
            financialAllocated: false,
          },
        },
        session
      );
    });
  } finally {
    session.endSession();
  }

  await notify(
    application.studentId,
    "Hồ sơ học bổng đạt yêu cầu hành chính",
    `Hồ sơ ${updated.applicationCode || ""} cho chiến dịch "${campaign.title}" đã được xác minh hợp lệ và đang chờ xét cấp quỹ (AID-06).`.trim(),
    "SCHOLARSHIP_DOSSIER_VERIFIED"
  );

  return {
    application: updated,
    financialAllocated: false,
    readyForAid06GrantReview: true,
  };
};

const adminReviewApplicationDocument = async (adminId, applicationId, documentId, body) => {
  const application = await getApplicationOrThrow(applicationId);
  if (!["SUBMITTED", "NEED_MORE_INFORMATION", "DOSSIER_VERIFIED"].includes(application.status)) {
    throw new AppError(
      `Cannot review documents for an application in status ${application.status}`,
      "APPLICATION_NOT_REVIEWABLE",
      409
    );
  }
  if (!mongoose.isValidObjectId(documentId)) {
    throw new AppError("Verification document not found", "DOCUMENT_NOT_FOUND", 404);
  }
  const doc = await VerificationDocument.findOne({ _id: documentId, applicationId: application._id });
  if (!doc) throw new AppError("Verification document not found", "DOCUMENT_NOT_FOUND", 404);

  if (typeof body.status !== "string" || isBlank(body.status)) {
    throw validationError("status must be APPROVED or REJECTED");
  }
  const status = body.status.trim().toUpperCase();
  if (!["APPROVED", "REJECTED"].includes(status)) {
    throw validationError("status must be APPROVED or REJECTED");
  }
  const reviewNote = assertOptionalText(body.reviewNote, "reviewNote", { max: 500 });
  if (status === "REJECTED" && !reviewNote) {
    throw validationError("reviewNote is required when rejecting a document");
  }

  const campaign = await campaignService.getCampaignOrThrow(application.campaignId);
  const now = new Date();
  const prevStatus = doc.status;

  const session = await mongoose.startSession();
  let updatedDoc;
  let evaluated;
  try {
    await session.withTransaction(async () => {
      updatedDoc = await VerificationDocument.findOneAndUpdate(
        { _id: doc._id, applicationId: application._id },
        {
          $set: {
            status,
            reviewedBy: adminId,
            reviewedAt: now,
            reviewNote,
          },
        },
        { returnDocument: "after", session }
      ).lean();

      const documents = await VerificationDocument.find({ applicationId: application._id }).session(session).lean();
      const paperReceipts = await PaperDossierReceipt.find({ applicationId: application._id }).session(session).lean();
      evaluated = evaluateChecklistProgress({
        campaign,
        submissionMode: application.submissionMode || "ONLINE",
        onlineDocuments: documents,
        paperReceipts,
      });

      await ScholarshipApplication.updateOne(
        { _id: application._id },
        { $set: { checklistProgress: evaluated.progress } },
        { session }
      );

      await audit(
        {
          actorAdminId: adminId,
          action: `SCHOLARSHIP_DOCUMENT_${status}`,
          targetType: "VerificationDocument",
          targetId: doc._id,
          beforeState: { status: prevStatus },
          afterState: { status, checklistItemCode: doc.checklistItemCode, reviewNote },
        },
        session
      );
    });
  } finally {
    session.endSession();
  }

  return {
    document: updatedDoc,
    checklistProgress: evaluated.progress,
  };
};

/**
 * UC-ADM-04 (Legacy combined financial + grant flow preserved untouched for backwards compatibility).
 * Enforces AID-01 dossier/paper/consent prerequisites when granting from a V3 AID-01 campaign or DOSSIER_VERIFIED,
 * preventing any bypass via /approve while keeping simple legacy campaigns compatible with platform.test.js.
 */
const approveApplication = async (adminId, applicationId, body = {}, options = {}) => {
  const application = await getApplicationOrThrow(applicationId);
  const approvable = ["SUBMITTED", "DOSSIER_VERIFIED"];
  if (!approvable.includes(application.status)) {
    throw new AppError("Application is not waiting for review", "APPLICATION_NOT_REVIEWABLE", 409);
  }
  const campaign = await campaignService.getCampaignOrThrow(application.campaignId);
  const reviewNote = assertOptionalText(body.reviewNote, "reviewNote", { max: 1000 });
  const award = campaign.awardAmountPerStudent;

  const mustEnforceFullDossier =
    requiresFullDossierValidation(campaign, {}, application) ||
    Boolean(campaign.dossierPolicy?.requireGuardianConsentForMinor);

  let consentSnapshot = application.consentSnapshot;
  let evaluatedProgress = application.checklistProgress;

  if (mustEnforceFullDossier || application.status === "DOSSIER_VERIFIED") {
    const student = await getActiveStudentOrThrow(application.studentId);
    const documents = await VerificationDocument.find({ applicationId: application._id }).lean();
    const paperReceipts = await PaperDossierReceipt.find({ applicationId: application._id }).sort({ receivedAt: -1 }).lean();

    if (mustEnforceFullDossier) {
      if (isBlank(application.statement)) {
        throw new AppError("Dossier statement is required", "DOSSIER_INCOMPLETE", 400);
      }
      parseGuardianInfo(application.guardianInfo?.toObject?.() || application.guardianInfo, { required: true });
      parseSchoolInfo(application.schoolInfo?.toObject?.() || application.schoolInfo, { required: true });
    }

    const evaluated = evaluateChecklistProgress({
      campaign,
      submissionMode: application.submissionMode || "ONLINE",
      onlineDocuments: documents,
      paperReceipts,
    });
    if (evaluated.unresolvedDiscrepancyReceipt) {
      throw new AppError(
        "Cannot approve application while a linked paper dossier receipt has an unresolved DISCREPANCY",
        "PAPER_RECEIPT_DISCREPANCY_UNRESOLVED",
        409
      );
    }
    if (mustEnforceFullDossier && evaluated.missingForVerification.length > 0) {
      throw Object.assign(
        new AppError("Dossier checklist requirements are not satisfied yet", "DOSSIER_CHECKLIST_INCOMPLETE", 409),
        { details: { missing: evaluated.missingForVerification } }
      );
    }
    evaluatedProgress = evaluated.progress;

    if (mustEnforceFullDossier) {
      consentSnapshot = await assertConsentGate({
        student,
        campaign,
        application,
        guardianInfo: application.guardianInfo,
        schoolInfo: application.schoolInfo,
        consentVerifier: options.consentVerifier,
        requireConsent: options.requireConsent,
      });
    }
  }

  const session = await mongoose.startSession();
  let scholarship;
  let updatedApplication;
  try {
    await session.withTransaction(async () => {
      const now = new Date();
      const setUpdate = {
        status: "APPROVED",
        reviewedBy: adminId,
        reviewedAt: now,
        reviewNote,
      };
      if (evaluatedProgress) setUpdate.checklistProgress = evaluatedProgress;
      if (consentSnapshot) setUpdate.consentSnapshot = consentSnapshot;
      if (application.status === "SUBMITTED" && mustEnforceFullDossier) {
        setUpdate.dossierVerification = {
          status: "VERIFIED",
          verifiedBy: adminId,
          verifiedAt: now,
          note: reviewNote,
          checklistVerified: true,
        };
      }

      updatedApplication = await ScholarshipApplication.findOneAndUpdate(
        { _id: application._id, status: { $in: approvable } },
        { $set: setUpdate },
        { returnDocument: "after", session }
      ).lean();
      if (!updatedApplication) {
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
          beforeState: { status: application.status },
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
  return { application: updatedApplication, scholarship: scholarship.toObject() };
};

const reviewApplication = async (adminId, applicationId, body = {}, status) => {
  const application = await getApplicationOrThrow(applicationId);
  // An application left in NEED_MORE_INFORMATION or DOSSIER_VERIFIED (before AID-06) can still be rejected/returned
  const reviewable =
    status === "REJECTED"
      ? ["SUBMITTED", "NEED_MORE_INFORMATION", "DOSSIER_VERIFIED"]
      : ["SUBMITTED", "DOSSIER_VERIFIED"];
  if (!reviewable.includes(application.status)) {
    throw new AppError("Application is not waiting for review", "APPLICATION_NOT_REVIEWABLE", 409);
  }
  const reviewNote = assertOptionalText(body.reviewNote, "reviewNote", { max: 1000 });
  if (status === "NEED_MORE_INFORMATION" && !reviewNote) {
    throw validationError("reviewNote is required: describe the information the student must provide");
  }

  const now = new Date();
  const dossierReviewStatus = status === "REJECTED" ? "REJECTED" : "NEED_MORE_INFORMATION";
  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      updated = await ScholarshipApplication.findOneAndUpdate(
        { _id: application._id, status: { $in: reviewable } },
        {
          $set: {
            status,
            reviewedBy: adminId,
            reviewedAt: now,
            reviewNote,
            "dossierVerification.status": dossierReviewStatus,
            "dossierVerification.note": reviewNote,
            "dossierVerification.checklistVerified": false,
          },
        },
        { returnDocument: "after", session }
      ).lean();
      if (!updated) throw new AppError("Application is not waiting for review", "APPLICATION_NOT_REVIEWABLE", 409);

      await audit(
        {
          actorAdminId: adminId,
          action: `SCHOLARSHIP_APPLICATION_${status === "REJECTED" ? "REJECTED" : "INFORMATION_REQUESTED"}`,
          targetType: "ScholarshipApplication",
          targetId: updated._id,
          beforeState: { status: application.status },
          afterState: { status, reviewNote: updated.reviewNote },
        },
        session
      );
    });
  } finally {
    session.endSession();
  }

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
  createDossier,
  updateDossier,
  submitDossier,
  resubmitApplication,
  withdrawDossier,
  getMyApplications,
  getMyApplicationDetail,
  getMyScholarships,
  adminListApplications,
  adminGetApplication,
  verifyDossierApplication,
  adminReviewApplicationDocument,
  approveApplication,
  rejectApplication,
  requestInformation,
};
