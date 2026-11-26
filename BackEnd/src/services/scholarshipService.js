const crypto = require("crypto");
const mongoose = require("mongoose");
const {
  ScholarshipApplication,
  ScholarshipCampaign,
  Scholarship,
  VerificationDocument,
  PaperDossierReceipt,
  GuardianConsent,
  RefundCase,
  User,
} = require("../models");
const {
  SCHOLARSHIP_APPLICATION_STATUSES,
  DOSSIER_SUBMISSION_MODES,
} = require("../models/constants");
const { AppError } = require("../utils/errors");
const {
  paged,
  validationError,
  escapeRegex,
  isBlank,
} = require("../utils/http");
const { toNum, toDec } = require("../utils/money");
const campaignService = require("./campaignService");
const storage = require("./storageService");
const { audit } = require("./auditService");
const { notify, notifyAdmins } = require("./notificationService");
const { encrypt, decrypt, blindIndex } = require("../utils/pii");
const {
  assertOptionalText,
  resolveScholarshipChecklist,
  DEFAULT_SCHOLARSHIP_CHECKLIST,
  parseGuardianInfo,
  parseApplicantInfo,
  parseSchoolInfo,
  parseSubmissionMode,
  evaluateChecklistProgress,
  assertConsentGate,
  redactReceiptForStudent,
  redactApplicationForStudent,
} = require("./scholarshipDossierGateService");

const APPLICATION_STATUSES = SCHOLARSHIP_APPLICATION_STATUSES;
// BR-29: một hồ sơ cho mỗi cặp học sinh–chiến dịch, kể cả khi hồ sơ đã REJECTED hoặc WITHDRAWN.
// Hồ sơ cũ được giữ nguyên làm lịch sử; việc bổ sung diễn ra trên chính hồ sơ NEED_MORE_INFORMATION (resubmit).
const BLOCKING_STATUSES = [...SCHOLARSHIP_APPLICATION_STATUSES];
const FINAL_APPROVE_PERMISSION = "SCHOLARSHIP_FINAL_APPROVE";
const FILE_SIDES = ["FRONT", "BACK", "SINGLE"];
const ALLOWED_DOC_TYPES = ["IDENTITY", "QUALIFICATION", "SCHOLARSHIP_PROOF"];

const applicationNotFound = () =>
  new AppError(
    "Scholarship application not found",
    "APPLICATION_NOT_FOUND",
    404,
  );

const generateApplicationCode = () => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `APP-${datePart}-${randPart}`;
};

const parseHybridSubmissionMode = (value) => {
  if (
    value !== undefined &&
    value !== null &&
    String(value).trim().toUpperCase() !== "HYBRID"
  ) {
    throw validationError(
      "Scholarship applications must use the combined online and paper submission method",
    );
  }
  return "HYBRID";
};

const parseHasPovertyCertificate = (value, fallback = false) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean")
    throw validationError("hasPovertyCertificate must be a boolean");
  return value;
};

const assertPovertyCertificateUpload = (
  hasPovertyCertificate,
  documents = [],
) => {
  if (!hasPovertyCertificate) return;
  const uploaded = documents.some(
    (document) =>
      String(document?.checklistItemCode || "").toUpperCase() ===
        "POVERTY_CERTIFICATE" &&
      !["REJECTED", "SUPERSEDED", "REMOVED_BY_STUDENT"].includes(
        document.status,
      ) &&
      Array.isArray(document.files) &&
      document.files.length > 0,
  );
  if (!uploaded) {
    throw validationError(
      "Upload the PDF poverty or near-poverty certificate when hasPovertyCertificate is true",
      {
        missing: ["POVERTY_CERTIFICATE"],
      },
    );
  }
};

const getActiveStudentOrThrow = async (studentId) => {
  const student = await User.findById(studentId).lean();
  if (!student || student.isDeleted)
    throw new AppError("Student not found", "USER_NOT_FOUND", 404);
  if (student.status !== "ACTIVE")
    throw new AppError(
      "Student account is not active",
      "ACCOUNT_NOT_ACTIVE",
      403,
    );
  return student;
};

/**
 * Validates uploaded document references. Only private storage keys are accepted —
 * a public URL must never be stored (NFR-04, NFR-14, mục 10.22).
 */
const parseDocuments = (
  documents,
  { required, campaign = null, existingDocuments = [], replacingCodes = [] },
) => {
  if (documents === undefined || documents === null) {
    if (required)
      throw validationError(
        "documents is required: at least one verification document must be uploaded",
      );
    return [];
  }
  if (!Array.isArray(documents) || (required && documents.length === 0)) {
    throw validationError("documents must be a non-empty array");
  }

  const checklist = resolveScholarshipChecklist(campaign);
  const checklistByCode = new Map(
    checklist.map((item) => [item.code.toUpperCase(), item]),
  );
  const replacing = new Set(
    replacingCodes.map((code) => String(code).trim().toUpperCase()),
  );
  const existingCountsByCode = new Map();
  for (const doc of existingDocuments || []) {
    if (
      !doc ||
      ["REJECTED", "SUPERSEDED", "REMOVED_BY_STUDENT"].includes(doc.status) ||
      !doc.checklistItemCode
    )
      continue;
    const key = doc.checklistItemCode.toUpperCase();
    if (replacing.has(key)) continue;
    existingCountsByCode.set(
      key,
      (existingCountsByCode.get(key) || 0) + (doc.files ? doc.files.length : 1),
    );
  }

  return documents.map((document, index) => {
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      throw validationError(`documents[${index}] must be an object`);
    }
    const files = Array.isArray(document.files) ? document.files : [];
    if (files.length === 0)
      throw validationError(
        `documents[${index}].files must contain at least one file`,
      );

    let checklistItemCode = null;
    if (
      document.checklistItemCode !== undefined &&
      document.checklistItemCode !== null &&
      String(document.checklistItemCode).trim() !== ""
    ) {
      if (typeof document.checklistItemCode !== "string") {
        throw validationError(
          `documents[${index}].checklistItemCode must be a string`,
        );
      }
      checklistItemCode = document.checklistItemCode.trim().toUpperCase();
      const isKnownDefault = DEFAULT_SCHOLARSHIP_CHECKLIST.some((i) => i.code === checklistItemCode);
      if (checklist.length > 0 && !checklistByCode.has(checklistItemCode) && !isKnownDefault) {
        throw validationError(
          `documents[${index}].checklistItemCode "${checklistItemCode}" is not in this campaign checklist`,
        );
      }
    }

    const defaultItemDef = DEFAULT_SCHOLARSHIP_CHECKLIST.find((i) => i.code === checklistItemCode);
    const checklistDef = checklistItemCode
      ? checklistByCode.get(checklistItemCode) || defaultItemDef
      : null;
    let documentType =
      checklistDef?.acceptedDocumentTypes?.[0] || "SCHOLARSHIP_PROOF";
    if (
      document.documentType !== undefined &&
      document.documentType !== null &&
      String(document.documentType).trim() !== ""
    ) {
      documentType = String(document.documentType).trim().toUpperCase();
      if (!ALLOWED_DOC_TYPES.includes(documentType)) {
        throw validationError(`documents[${index}].documentType is invalid`);
      }
      if (
        checklistDef &&
        Array.isArray(checklistDef.acceptedDocumentTypes) &&
        !checklistDef.acceptedDocumentTypes.includes(documentType)
      ) {
        throw validationError(
          `documents[${index}].documentType "${documentType}" is not accepted for checklist item "${checklistItemCode}"`,
        );
      }
    }

    if (checklistDef) {
      const nextCount =
        (existingCountsByCode.get(checklistItemCode) || 0) + files.length;
      if (nextCount > (checklistDef.maxFiles || 5)) {
        throw validationError(
          `Checklist item "${checklistItemCode}" accepts at most ${checklistDef.maxFiles || 5} files`,
        );
      }
      existingCountsByCode.set(checklistItemCode, nextCount);
    }

    const title = assertOptionalText(
      document.title,
      `documents[${index}].title`,
      { max: 150 },
    );
    const parsedFiles = files.map((file) => {
      if (!file || isBlank(file.storageKey))
        throw validationError(`documents[${index}]: storageKey is required`);
      if (/^https?:\/\//i.test(file.storageKey)) {
        throw validationError(
          `documents[${index}]: storageKey must be a private storage key, not a URL`,
        );
      }
      const side = file.side || "SINGLE";
      if (!FILE_SIDES.includes(side))
        throw validationError(`documents[${index}]: side is invalid`);
      return { side, storageKey: file.storageKey, mimeType: file.mimeType };
    });

    return { checklistItemCode, title, documentType, files: parsedFiles };
  });
};

const assertOwnedFiles = (studentId, parsedDocs) =>
  storage.assertOwnedKeys(
    studentId,
    parsedDocs.flatMap((doc) => doc.files.map((file) => file.storageKey)),
  );

const saveDocuments = async (studentId, applicationId, parsedDocs, session) => {
  if (!parsedDocs.length) return [];
  const created = await VerificationDocument.create(
    parsedDocs.map((doc) => ({
      userId: studentId,
      applicationId,
      checklistItemCode: doc.checklistItemCode || null,
      title: doc.title || null,
      submissionSource: "ONLINE_UPLOAD",
      documentType: doc.documentType || "SCHOLARSHIP_PROOF",
      files: doc.files,
    })),
    { session, ordered: true },
  );
  const newIds = created.map((document) => document._id);
  const newByCode = new Map();
  for (const document of created) {
    if (
      document.checklistItemCode &&
      !newByCode.has(document.checklistItemCode)
    ) {
      newByCode.set(document.checklistItemCode, document._id);
    }
  }
  for (const [checklistItemCode, newDocumentId] of newByCode) {
    await VerificationDocument.updateMany(
      {
        applicationId,
        checklistItemCode,
        _id: { $nin: newIds },
        status: { $nin: ["REJECTED", "SUPERSEDED", "REMOVED_BY_STUDENT"] },
      },
      {
        $set: {
          status: "SUPERSEDED",
          supersededByDocumentId: newDocumentId,
          supersededAt: new Date(),
        },
      },
      { session },
    );
  }
  return created;
};

const documentReplacementCodes = (documents) =>
  (Array.isArray(documents) ? documents : [])
    .map((document) =>
      String(document?.checklistItemCode || "")
        .trim()
        .toUpperCase(),
    )
    .filter(Boolean);

const activeOnlineDocuments = (documents, replacingCodes = []) => {
  const replacing = new Set(
    replacingCodes.map((code) => String(code).trim().toUpperCase()),
  );
  return (documents || []).filter(
    (document) =>
      !["REJECTED", "SUPERSEDED", "REMOVED_BY_STUDENT"].includes(
        document.status,
      ) &&
      !replacing.has(
        String(document.checklistItemCode || "")
          .trim()
          .toUpperCase(),
      ),
  );
};

const requiresFullDossierValidation = (
  campaign,
  body = {},
  existingApp = null,
) => {
  if (!campaign) return false;
  if (
    Array.isArray(campaign.documentChecklist) &&
    campaign.documentChecklist.length > 0
  )
    return true;
  if (
    campaign.dossierPolicy?.requireGuardianInfo ||
    campaign.dossierPolicy?.requireSchoolInfo
  )
    return true;
  if (body.enforceDossierValidation === true) return true;
  if (
    body.submissionMode &&
    String(body.submissionMode).toUpperCase() !== "ONLINE"
  )
    return true;
  if (
    existingApp &&
    (existingApp.guardianInfo ||
      existingApp.schoolInfo ||
      existingApp.submissionMode !== "ONLINE")
  ) {
    return true;
  }
  return false;
};

const stripDocumentReviewer = (doc) => {
  if (!doc) return doc;
  const { reviewedBy, ...rest } = doc;
  return rest;
};

const prepareEncryptedGuardianInfo = (guardianInfo) => {
  if (!guardianInfo) return null;
  const result = {
    ...(guardianInfo.toObject ? guardianInfo.toObject() : guardianInfo),
  };
  if (result.cccd) {
    result.cccdEnc = encrypt(result.cccd);
    result.cccdHash = blindIndex(result.cccd);
    result.cccd = null;
  }
  return result;
};

const prepareEncryptedStudentCccd = (rawStudentCccd) => {
  if (
    rawStudentCccd === undefined ||
    rawStudentCccd === null ||
    rawStudentCccd === ""
  ) {
    return { studentCccd: null, studentCccdEnc: null, studentCccdHash: null };
  }
  if (typeof rawStudentCccd !== "string") {
    throw validationError("studentCccd must be a string");
  }
  if (!/^\d{12}$/.test(rawStudentCccd)) {
    throw validationError("studentCccd must be a 12-digit string");
  }
  return {
    studentCccd: null,
    studentCccdEnc: encrypt(rawStudentCccd),
    studentCccdHash: blindIndex(rawStudentCccd),
  };
};

const currentStudentCccd = (application) => {
  if (application?.studentCccd) return application.studentCccd;
  if (!application?.studentCccdEnc) return null;
  try {
    return decrypt(application.studentCccdEnc);
  } catch {
    return null;
  }
};

// ---------- Student ----------

/**
 * UC-STU-07. The award amount is never read from the request (BR-36):
 * it is always Campaign.awardAmountPerStudent.
 */
const applyForScholarship = async (
  studentId,
  campaignId,
  body,
  options = {},
) => {
  const campaign = await campaignService.getCampaignOrThrow(campaignId);
  // BR-19: Student chỉ được Apply Campaign đang nhận hồ sơ
  if (!campaignService.isAcceptingApplications(campaign)) {
    throw new AppError(
      "Campaign is not accepting applications",
      "CAMPAIGN_NOT_ACCEPTING_APPLICATIONS",
      409,
    );
  }
  const student = await getActiveStudentOrThrow(studentId);

  // Pillar 2: Open-ended essay "hoàn cảnh gia đình" is removed from mandatory gate
  const statement =
    typeof body.statement === "string" ? body.statement.trim() : "";
  const submissionMode = parseSubmissionMode(body.submissionMode, campaign);
  const fullDossierRequired = requiresFullDossierValidation(campaign, body);

  const guardianInfo = parseGuardianInfo(body.guardianInfo, {
    required: fullDossierRequired,
  });
  const applicantInfo = parseApplicantInfo(body.applicantInfo, {
    required: false,
  });
  const schoolInfo = parseSchoolInfo(body.schoolInfo, {
    required: fullDossierRequired,
  });

  const needsOnlineDocs =
    submissionMode === "ONLINE" &&
    (!campaign.documentChecklist || campaign.documentChecklist.length === 0);
  const parsedDocs = parseDocuments(body.documents, {
    required: needsOnlineDocs,
    campaign,
  });
  const hasPovertyCertificate = parseHasPovertyCertificate(
    body.hasPovertyCertificate,
  );
  assertPovertyCertificateUpload(hasPovertyCertificate, parsedDocs);
  await assertOwnedFiles(studentId, parsedDocs);

  const simulatedDocs = parsedDocs.map((d, i) => ({
    ...d,
    _id: new mongoose.Types.ObjectId(),
    status: "PENDING",
    idx: i,
  }));
  const evaluated = evaluateChecklistProgress({
    campaign,
    submissionMode,
    onlineDocuments: simulatedDocs,
    paperReceipts: [],
  });
  if (evaluated.missingOnSubmit.length > 0) {
    throw Object.assign(
      new AppError(
        "Application is missing required checklist items for this submission mode",
        "DOSSIER_CHECKLIST_INCOMPLETE",
        400,
      ),
      { details: { missing: evaluated.missingOnSubmit } },
    );
  }

  const consentSnapshot = {
    status: "NOT_REQUIRED",
    consentRecordId: null,
    guardianUserId: null,
    checkedAt: new Date(),
    note: null,
  };

  const duplicate = await ScholarshipApplication.findOne({
    studentId,
    campaignId: campaign._id,
    status: { $in: BLOCKING_STATUSES },
  });
  if (duplicate) {
    throw Object.assign(
      new AppError(
        "You already have an application for this campaign (one application per student and campaign)",
        "DUPLICATE_APPLICATION",
        409,
      ),
      {
        details: {
          existingApplicationId: duplicate._id.toString(),
          status: duplicate.status,
        },
      },
    );
  }

  const guardianInfoToSave = prepareEncryptedGuardianInfo(guardianInfo);
  const rawStudentCccd =
    body.studentCccd ||
    body.applicantInfo?.cccd ||
    body.studentInfo?.cccd ||
    body.cccd ||
    student.studentProfile?.cccd ||
    null;
  const { studentCccdEnc, studentCccdHash } = rawStudentCccd
    ? prepareEncryptedStudentCccd(rawStudentCccd)
    : { studentCccdEnc: null, studentCccdHash: null };

  const session = await mongoose.startSession();
  let application;
  try {
    await session.withTransaction(async () => {
      const now = new Date();
      const priorityResult = scorePriorityCriteria(
        {
          applicantInfo,
          schoolInfo,
          hasPovertyCertificate,
          campaignPriorityPolicyVersion: campaign.priorityPolicyVersion,
        },
        campaign.priorityCriteria,
      );
      const initialScreening =
        priorityResult.score !== null
          ? {
              scoreStatus: "AUTOMATIC",
              layer1Passed: true,
              layer2Score: priorityResult.score,
              priorityCriteria: priorityResult.matchedCriteria,
              priorityPolicyVersion: priorityResult.policyVersion,
              notes: "Điểm ưu tiên tính tự động từ thông tin khai báo",
            }
          : {
              scoreStatus: "UNSCORED",
              layer1Passed: null,
              layer2Score: null,
              priorityCriteria: [],
              priorityPolicyVersion: campaign.priorityPolicyVersion || 0,
              notes: null,
            };

      [application] = await ScholarshipApplication.create(
        [
          {
            campaignId: campaign._id,
            studentId,
            applicationCode: generateApplicationCode(),
            submissionMode,
            guardianInfo: guardianInfoToSave,
            applicantInfo,
            schoolInfo,
            hasPovertyCertificate,
            studentCccdEnc,
            studentCccdHash,
            consentSnapshot,
            statement: statement,
            screeningResult: initialScreening,
            status: "SUBMITTED",
            submittedAt: now,
            dossierVerification: {
              status: "PENDING_REVIEW",
              checklistVerified: false,
            },
          },
        ],
        { session },
      );
      const createdDocs = await saveDocuments(
        studentId,
        application._id,
        parsedDocs,
        session,
      );
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
      throw new AppError(
        "You already have an application for this campaign (one application per student and campaign)",
        "DUPLICATE_APPLICATION",
        409,
      );
    }
    throw err;
  } finally {
    session.endSession();
  }

  await notifyAdmins(
    "Hồ sơ học bổng mới",
    `Có hồ sơ mới cho chiến dịch "${campaign.title}".`,
    "SCHOLARSHIP_APPLICATION_SUBMITTED",
  );
  return redactApplicationForStudent({
    ...application.toObject(),
    awardAmountPerStudent: campaign.awardAmountPerStudent,
  });
};

/**
 * AID-01: Create a V3 nonfinancial scholarship dossier (either save DRAFT or submit).
 * Always enforces guardianInfo + schoolInfo when submitting (never silently skips).
 */
const createDossier = async (studentId, campaignId, body, options = {}) => {
  const saveAsDraft = Boolean(body.saveAsDraft);
  if (!saveAsDraft) {
    return applyForScholarship(
      studentId,
      campaignId,
      { ...body, enforceDossierValidation: true },
      options,
    );
  }

  const campaign = await campaignService.getCampaignOrThrow(campaignId);
  if (!campaignService.isAcceptingApplications(campaign)) {
    throw new AppError(
      "Campaign is not accepting applications",
      "CAMPAIGN_NOT_ACCEPTING_APPLICATIONS",
      409,
    );
  }
  if (campaign.dossierPolicy?.allowDraftSave === false) {
    throw new AppError(
      "Draft saving is disabled for this campaign",
      "DRAFT_NOT_ALLOWED",
      400,
    );
  }
  await getActiveStudentOrThrow(studentId);

  const submissionMode = parseSubmissionMode(body.submissionMode, campaign);
  const hasPovertyCertificate = parseHasPovertyCertificate(
    body.hasPovertyCertificate,
  );
  const guardianInfo = parseGuardianInfo(body.guardianInfo, {
    required: false,
  });
  const applicantInfo = parseApplicantInfo(body.applicantInfo, {
    required: false,
  });
  const schoolInfo = parseSchoolInfo(body.schoolInfo, { required: false });
  if (
    body.statement !== undefined &&
    body.statement !== null &&
    typeof body.statement !== "string"
  ) {
    throw validationError("statement must be a string");
  }

  const guardianInfoToSave = prepareEncryptedGuardianInfo(guardianInfo);
  const rawStudentCccd =
    body.studentCccd ||
    body.applicantInfo?.cccd ||
    body.studentInfo?.cccd ||
    body.cccd ||
    null;
  const { studentCccdEnc, studentCccdHash } = rawStudentCccd
    ? prepareEncryptedStudentCccd(rawStudentCccd)
    : { studentCccdEnc: null, studentCccdHash: null };

  const parsedDocs = parseDocuments(body.documents, {
    required: false,
    campaign,
  });
  await assertOwnedFiles(studentId, parsedDocs);

  const duplicate = await ScholarshipApplication.findOne({
    studentId,
    campaignId: campaign._id,
    status: { $in: BLOCKING_STATUSES },
  });
  if (duplicate) {
    throw Object.assign(
      new AppError(
        "You already have an application for this campaign (one application per student and campaign)",
        "DUPLICATE_APPLICATION",
        409,
      ),
      {
        details: {
          existingApplicationId: duplicate._id.toString(),
          status: duplicate.status,
        },
      },
    );
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
            guardianInfo: guardianInfoToSave,
            applicantInfo,
            schoolInfo,
            hasPovertyCertificate,
            studentCccdEnc,
            studentCccdHash,
            statement: body.statement ? body.statement.trim() : "",
            status: "DRAFT",
            submittedAt: null,
            dossierVerification: {
              status: "NOT_SUBMITTED",
              checklistVerified: false,
            },
          },
        ],
        { session },
      );
      const createdDocs = await saveDocuments(
        studentId,
        application._id,
        parsedDocs,
        session,
      );
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
      throw new AppError(
        "You already have an application for this campaign (one application per student and campaign)",
        "DUPLICATE_APPLICATION",
        409,
      );
    }
    throw err;
  } finally {
    session.endSession();
  }

  return redactApplicationForStudent({
    ...application.toObject(),
    awardAmountPerStudent: campaign.awardAmountPerStudent,
  });
};

/**
 * AID-01: Student edits their own DRAFT or NEED_MORE_INFORMATION dossier.
 */
const updateDossier = async (studentId, applicationId, body) => {
  if (!mongoose.isValidObjectId(applicationId)) throw applicationNotFound();
  const application = await ScholarshipApplication.findOne({
    _id: applicationId,
    studentId,
  });
  if (!application) throw applicationNotFound();

  if (!["DRAFT", "NEED_MORE_INFORMATION"].includes(application.status)) {
    throw new AppError(
      `Dossier cannot be edited while in status ${application.status}`,
      "APPLICATION_NOT_EDITABLE",
      409,
    );
  }

  const campaign = await campaignService.getCampaignOrThrow(
    application.campaignId,
  );
  const existingDocs = await VerificationDocument.find({
    applicationId: application._id,
  }).lean();

  if (!campaignService.isAcceptingApplications(campaign)) {
    throw new AppError(
      "Campaign application window is closed",
      "CAMPAIGN_NOT_ACCEPTING_APPLICATIONS",
      409,
    );
  }
  const nextMode = parseSubmissionMode(body.submissionMode, campaign);
  const hasPovertyCertificate = parseHasPovertyCertificate(
    body.hasPovertyCertificate,
    application.hasPovertyCertificate === true,
  );
  const nextGuardian =
    body.guardianInfo !== undefined
      ? prepareEncryptedGuardianInfo(
          parseGuardianInfo(body.guardianInfo, {
            required: application.status !== "DRAFT",
          }),
        )
      : application.guardianInfo;
  const nextApplicant =
    body.applicantInfo !== undefined
      ? parseApplicantInfo(body.applicantInfo, {
          required: application.status !== "DRAFT",
        })
      : application.applicantInfo;
  const rawStudentCccd = body.studentCccd ?? body.applicantInfo?.cccd;
  const studentCccdFields =
    rawStudentCccd !== undefined
      ? prepareEncryptedStudentCccd(rawStudentCccd)
      : {
          studentCccd: application.studentCccd || null,
          studentCccdEnc: application.studentCccdEnc || null,
          studentCccdHash: application.studentCccdHash || null,
        };
  const nextSchool =
    body.schoolInfo !== undefined
      ? parseSchoolInfo(body.schoolInfo, {
          required: application.status !== "DRAFT",
        })
      : application.schoolInfo;
  let nextStatement = application.statement;
  if (body.statement !== undefined) {
    if (typeof body.statement !== "string") {
      throw validationError("statement must be a string");
    }
    nextStatement = body.statement.trim();
  }

  let removeDocIds = [];
  if (body.removeDocumentIds !== undefined) {
    if (application.status !== "DRAFT") {
      throw new AppError(
        "Documents can only be removed while dossier is in DRAFT status",
        "APPLICATION_NOT_EDITABLE",
        409,
      );
    }
    if (
      !Array.isArray(body.removeDocumentIds) ||
      body.removeDocumentIds.some((id) => !mongoose.isValidObjectId(id))
    ) {
      throw validationError(
        "removeDocumentIds must be an array of document ids",
      );
    }
    removeDocIds = body.removeDocumentIds.map(String);
  }

  const replacingCodes = documentReplacementCodes(body.documents);
  const remainingDocs = existingDocs.filter(
    (d) => !removeDocIds.includes(d._id.toString()),
  );
  const parsedDocs = parseDocuments(body.documents, {
    required: false,
    campaign,
    existingDocuments: remainingDocs,
    replacingCodes,
  });
  await assertOwnedFiles(studentId, parsedDocs);

  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      if (removeDocIds.length > 0) {
        await VerificationDocument.updateMany(
          {
            _id: { $in: removeDocIds },
            applicationId: application._id,
            userId: studentId,
            status: { $nin: ["SUPERSEDED", "REMOVED_BY_STUDENT"] },
          },
          {
            $set: {
              status: "REMOVED_BY_STUDENT",
              removedByStudentAt: new Date(),
            },
          },
          { session },
        );
      }
      await saveDocuments(studentId, application._id, parsedDocs, session);

      const latestDocs = await VerificationDocument.find({
        applicationId: application._id,
      })
        .session(session)
        .lean();
      const receipts = await PaperDossierReceipt.find({
        applicationId: application._id,
      })
        .session(session)
        .lean();
      const evaluated = evaluateChecklistProgress({
        campaign,
        submissionMode: nextMode,
        onlineDocuments: latestDocs,
        paperReceipts: receipts,
      });

      updated = await ScholarshipApplication.findOneAndUpdate(
        {
          _id: application._id,
          studentId,
          status: { $in: ["DRAFT", "NEED_MORE_INFORMATION"] },
        },
        {
          $set: {
            submissionMode: nextMode,
            guardianInfo: nextGuardian,
            applicantInfo: nextApplicant,
            schoolInfo: nextSchool,
            hasPovertyCertificate,
            studentCccd: studentCccdFields.studentCccd,
            studentCccdEnc: studentCccdFields.studentCccdEnc,
            studentCccdHash: studentCccdFields.studentCccdHash,
            statement: nextStatement,
            checklistProgress: evaluated.progress,
          },
        },
        { returnDocument: "after", session },
      ).lean();

      if (!updated) {
        throw new AppError(
          `Dossier cannot be edited while in status ${application.status}`,
          "APPLICATION_NOT_EDITABLE",
          409,
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
const submitDossier = async (
  studentId,
  applicationId,
  body = {},
  options = {},
) => {
  if (!mongoose.isValidObjectId(applicationId)) throw applicationNotFound();
  const application = await ScholarshipApplication.findOne({
    _id: applicationId,
    studentId,
  });
  if (!application) throw applicationNotFound();

  if (application.status !== "DRAFT") {
    throw new AppError(
      "Only DRAFT dossiers can be submitted via this endpoint",
      "APPLICATION_NOT_SUBMITTABLE",
      409,
    );
  }

  const campaign = await campaignService.getCampaignOrThrow(
    application.campaignId,
  );
  if (!campaignService.isAcceptingApplications(campaign)) {
    throw new AppError(
      "Campaign is not accepting applications",
      "CAMPAIGN_NOT_ACCEPTING_APPLICATIONS",
      409,
    );
  }
  const student = await getActiveStudentOrThrow(studentId);

  const fullRequired = requiresFullDossierValidation(
    campaign,
    body,
    application,
  );
  const nextMode = parseSubmissionMode(body.submissionMode, campaign);
  const nextGuardian =
    body.guardianInfo !== undefined
      ? parseGuardianInfo(body.guardianInfo, { required: fullRequired })
      : parseGuardianInfo(application.guardianInfo, { required: fullRequired });
  const nextApplicant =
    body.applicantInfo !== undefined
      ? parseApplicantInfo(body.applicantInfo, { required: false })
      : parseApplicantInfo(application.applicantInfo, { required: false });
  const rawStudentCccd =
    body.studentCccd ??
    body.applicantInfo?.cccd ??
    currentStudentCccd(application);
  const studentCccdFields = rawStudentCccd
    ? prepareEncryptedStudentCccd(rawStudentCccd)
    : null;
  const nextSchool =
    body.schoolInfo !== undefined
      ? parseSchoolInfo(body.schoolInfo, { required: fullRequired })
      : parseSchoolInfo(application.schoolInfo, { required: fullRequired });

  const statement =
    body.statement !== undefined
      ? typeof body.statement === "string"
        ? body.statement.trim()
        : ""
      : typeof application.statement === "string"
        ? application.statement.trim()
        : "";

  const existingDocs = await VerificationDocument.find({
    applicationId: application._id,
  }).lean();
  const replacingCodes = documentReplacementCodes(body.documents);
  const parsedNewDocs = parseDocuments(body.documents, {
    required: false,
    campaign,
    existingDocuments: existingDocs,
    replacingCodes,
  });
  await assertOwnedFiles(studentId, parsedNewDocs);

  const combinedDocs = [
    ...activeOnlineDocuments(existingDocs, replacingCodes),
    ...parsedNewDocs.map((d) => ({
      ...d,
      _id: new mongoose.Types.ObjectId(),
      status: "PENDING",
    })),
  ];
  const hasPovertyCertificate = parseHasPovertyCertificate(
    body.hasPovertyCertificate,
    application.hasPovertyCertificate === true,
  );
  assertPovertyCertificateUpload(hasPovertyCertificate, combinedDocs);
  const validOnlineCount = combinedDocs.filter(
    (d) => d.status !== "REJECTED",
  ).length;
  if (
    nextMode === "ONLINE" &&
    (!campaign.documentChecklist || campaign.documentChecklist.length === 0) &&
    validOnlineCount === 0
  ) {
    throw validationError(
      "At least one verification document must be uploaded before submitting",
    );
  }

  const receipts = await PaperDossierReceipt.find({
    applicationId: application._id,
  }).lean();
  const evaluated = evaluateChecklistProgress({
    campaign,
    submissionMode: nextMode,
    onlineDocuments: combinedDocs,
    paperReceipts: receipts,
  });
  if (evaluated.missingOnSubmit.length > 0) {
    throw Object.assign(
      new AppError(
        "Application is missing required checklist items for this submission mode",
        "DOSSIER_CHECKLIST_INCOMPLETE",
        400,
      ),
      { details: { missing: evaluated.missingOnSubmit } },
    );
  }

  const consentSnapshot = application.consentSnapshot || {
    status: "NOT_REQUIRED",
    consentRecordId: null,
    guardianUserId: null,
    checkedAt: new Date(),
    note: null,
  };

  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      await saveDocuments(studentId, application._id, parsedNewDocs, session);
      const savedDocs = await VerificationDocument.find({
        applicationId: application._id,
      })
        .session(session)
        .lean();
      const savedReceipts = await PaperDossierReceipt.find({
        applicationId: application._id,
      })
        .session(session)
        .lean();
      const finalEval = evaluateChecklistProgress({
        campaign,
        submissionMode: nextMode,
        onlineDocuments: savedDocs,
        paperReceipts: savedReceipts,
      });

      const priorityResult = scorePriorityCriteria(
        {
          applicantInfo: nextApplicant,
          schoolInfo: nextSchool,
          hasPovertyCertificate,
          campaignPriorityPolicyVersion: campaign.priorityPolicyVersion,
        },
        campaign.priorityCriteria,
      );
      const initialScreening =
        priorityResult.score !== null
          ? {
              scoreStatus: "AUTOMATIC",
              layer1Passed: true,
              layer2Score: priorityResult.score,
              priorityCriteria: priorityResult.matchedCriteria,
              priorityPolicyVersion: priorityResult.policyVersion,
              notes: "Điểm ưu tiên tính tự động từ thông tin khai báo",
            }
          : {
              scoreStatus: "UNSCORED",
              layer1Passed: null,
              layer2Score: null,
              priorityCriteria: [],
              priorityPolicyVersion: campaign.priorityPolicyVersion || 0,
              notes: null,
            };

      updated = await ScholarshipApplication.findOneAndUpdate(
        { _id: application._id, studentId, status: "DRAFT" },
        {
          $set: {
            submissionMode: nextMode,
            guardianInfo: prepareEncryptedGuardianInfo(nextGuardian),
            applicantInfo: nextApplicant,
            schoolInfo: nextSchool,
            hasPovertyCertificate,
            ...(studentCccdFields || {}),
            statement: statement.trim(),
            consentSnapshot,
            checklistProgress: finalEval.progress,
            screeningResult: initialScreening,
            status: "SUBMITTED",
            submittedAt: new Date(),
            "dossierVerification.status": "PENDING_REVIEW",
          },
        },
        { returnDocument: "after", session },
      ).lean();

      if (!updated) {
        throw new AppError(
          "Only DRAFT dossiers can be submitted via this endpoint",
          "APPLICATION_NOT_SUBMITTABLE",
          409,
        );
      }
    });
  } finally {
    session.endSession();
  }

  await notifyAdmins(
    "Hồ sơ học bổng mới",
    `Có hồ sơ mới cho chiến dịch "${campaign.title}".`,
    "SCHOLARSHIP_APPLICATION_SUBMITTED",
  );
  return redactApplicationForStudent(updated);
};

// UC-STU-07 Alternative: Student bổ sung tài liệu và resubmit khi NEED_MORE_INFORMATION
const resubmitApplication = async (
  studentId,
  applicationId,
  body,
  options = {},
) => {
  if (!mongoose.isValidObjectId(applicationId)) throw applicationNotFound();
  const application = await ScholarshipApplication.findOne({
    _id: applicationId,
    studentId,
  });
  if (!application) throw applicationNotFound();
  if (application.status !== "NEED_MORE_INFORMATION") {
    throw new AppError(
      "Application is not waiting for more information",
      "APPLICATION_NOT_RESUBMITTABLE",
      409,
    );
  }
  if (body.statement !== undefined && typeof body.statement !== "string") {
    throw validationError("statement must be a string");
  }

  const campaign = await campaignService.getCampaignOrThrow(
    application.campaignId,
  );
  const now = new Date();
  const campaignWindowOpen = campaignService.isAcceptingApplications(
    campaign,
    now,
  );
  const exceptionWindowOpen =
    application.supplementDeadline &&
    new Date(application.supplementDeadline) >= now;
  const isOnlyPaused = Boolean(campaign.isApplicationPaused) && (!campaign.applicationEnd || new Date(campaign.applicationEnd) >= now);
  if (!campaignWindowOpen && !exceptionWindowOpen && !isOnlyPaused) {
    throw new AppError(
      "Campaign application window is closed",
      "CAMPAIGN_NOT_ACCEPTING_APPLICATIONS",
      409,
    );
  }
  const student = await getActiveStudentOrThrow(studentId);
  const existingDocs = await VerificationDocument.find({
    applicationId: application._id,
  }).lean();

  const nextMode = parseSubmissionMode(body.submissionMode, campaign);

  const fullRequired = requiresFullDossierValidation(
    campaign,
    body,
    application,
  );
  const nextGuardian =
    body.guardianInfo !== undefined
      ? parseGuardianInfo(body.guardianInfo, { required: fullRequired })
      : parseGuardianInfo(application.guardianInfo, { required: fullRequired });
  const nextApplicant =
    body.applicantInfo !== undefined
      ? parseApplicantInfo(body.applicantInfo, { required: false })
      : parseApplicantInfo(application.applicantInfo, { required: false });
  const rawStudentCccd =
    body.studentCccd ??
    body.applicantInfo?.cccd ??
    currentStudentCccd(application);
  const studentCccdFields = rawStudentCccd
    ? prepareEncryptedStudentCccd(rawStudentCccd)
    : null;
  const nextSchool =
    body.schoolInfo !== undefined
      ? parseSchoolInfo(body.schoolInfo, { required: fullRequired })
      : parseSchoolInfo(application.schoolInfo, { required: fullRequired });

  const replacingCodes = documentReplacementCodes(body.documents);
  const parsedDocs = parseDocuments(body.documents, {
    required: false,
    campaign,
    existingDocuments: existingDocs,
    replacingCodes,
  });
  await assertOwnedFiles(studentId, parsedDocs);

  const hasPovertyCertificate = parseHasPovertyCertificate(
    body.hasPovertyCertificate,
    application.hasPovertyCertificate === true,
  );
  assertPovertyCertificateUpload(hasPovertyCertificate, [
    ...activeOnlineDocuments(existingDocs, replacingCodes),
    ...parsedDocs.map((document) => ({ ...document, status: "PENDING" })),
  ]);

  const consentSnapshot = application.consentSnapshot || {
    status: "NOT_REQUIRED",
    consentRecordId: null,
    guardianUserId: null,
    checkedAt: new Date(),
    note: null,
  };

  const nextStatement =
    body.statement !== undefined
      ? body.statement.trim()
      : application.statement;
  const existingDossierVerification = application.dossierVerification
    ? application.dossierVerification.toObject?.() ||
      application.dossierVerification
    : {};

  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      await saveDocuments(studentId, application._id, parsedDocs, session);
      const savedDocs = await VerificationDocument.find({
        applicationId: application._id,
      })
        .session(session)
        .lean();
      const receipts = await PaperDossierReceipt.find({
        applicationId: application._id,
      })
        .session(session)
        .lean();
      const evaluated = evaluateChecklistProgress({
        campaign,
        submissionMode: nextMode,
        onlineDocuments: savedDocs,
        paperReceipts: receipts,
      });
      if (fullRequired && evaluated.missingOnSubmit.length > 0) {
        throw Object.assign(
          new AppError(
            "Application is missing required checklist items for this submission mode",
            "DOSSIER_CHECKLIST_INCOMPLETE",
            400,
          ),
          { details: { missing: evaluated.missingOnSubmit } },
        );
      }

      updated = await ScholarshipApplication.findOneAndUpdate(
        { _id: application._id, studentId, status: "NEED_MORE_INFORMATION" },
        {
          $set: {
            statement: nextStatement,
            submissionMode: nextMode,
            guardianInfo: prepareEncryptedGuardianInfo(nextGuardian),
            applicantInfo: nextApplicant,
            schoolInfo: nextSchool,
            hasPovertyCertificate,
            ...(studentCccdFields || {}),
            consentSnapshot,
            status: "SUBMITTED",
            submittedAt: new Date(),
            dossierVerification: {
              ...existingDossierVerification,
              status: "PENDING_REVIEW",
            },
            screenedBy: null,
            screenedAt: null,
            screeningResult: null,
            verifierResult: null,
            checklistProgress: evaluated.progress,
          },
          $push: {
            history: {
              action: "RESUBMITTED",
              actorId: studentId,
              actorRole: "STUDENT",
              timestamp: new Date(),
              note: nextStatement || "Học sinh nộp bổ sung hồ sơ",
            },
          },
        },
        { returnDocument: "after", session },
      ).lean();

      if (!updated) {
        throw new AppError(
          "Application is not waiting for more information",
          "APPLICATION_NOT_RESUBMITTABLE",
          409,
        );
      }
    });
  } finally {
    session.endSession();
  }

  await notifyAdmins(
    "Hồ sơ học bổng được bổ sung",
    "Một hồ sơ học bổng đã được bổ sung và gửi lại.",
    "SCHOLARSHIP_APPLICATION_SUBMITTED",
  );
  return redactApplicationForStudent(updated);
};

const withdrawDossier = async (studentId, applicationId, body = {}) => {
  if (!mongoose.isValidObjectId(applicationId)) throw applicationNotFound();
  const application = await ScholarshipApplication.findOne({
    _id: applicationId,
    studentId,
  });
  if (!application) throw applicationNotFound();

  const withdrawable = ["DRAFT", "SUBMITTED", "NEED_MORE_INFORMATION"];
  if (!withdrawable.includes(application.status)) {
    throw new AppError(
      `Cannot withdraw dossier in status ${application.status}`,
      "APPLICATION_NOT_WITHDRAWABLE",
      409,
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
        { returnDocument: "after", session },
      ).lean();
      if (!updated) {
        throw new AppError(
          "Dossier is no longer withdrawable",
          "APPLICATION_NOT_WITHDRAWABLE",
          409,
        );
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
        session,
      );
    });
  } finally {
    session.endSession();
  }

  return redactApplicationForStudent(updated);
};

const attachCampaigns = async (rows) => {
  const campaigns = await ScholarshipCampaign.find({
    _id: { $in: rows.map((row) => row.campaignId) },
  })
    .select(
      "title status awardAmountPerStudent scope documentChecklist dossierPolicy",
    )
    .lean();
  const map = new Map(
    campaigns.map((campaign) => [campaign._id.toString(), campaign]),
  );
  return rows.map((row) => ({
    ...row,
    campaign: map.get(row.campaignId.toString()) || null,
  }));
};

// FR-STU-25
const getMyApplications = async (studentId, paging) => {
  const filter = { studentId };
  const [items, total] = await Promise.all([
    ScholarshipApplication.find(filter)
      .sort({ createdAt: -1 })
      .skip(paging.skip)
      .limit(paging.pageSize)
      .lean(),
    ScholarshipApplication.countDocuments(filter),
  ]);
  // The student reads the note and the date of the decision, not which staff member made it
  const rows = await attachCampaigns(items);
  return paged(rows.map(redactApplicationForStudent), total, paging);
};

const getMyApplicationDetail = async (studentId, applicationId) => {
  if (!mongoose.isValidObjectId(applicationId)) throw applicationNotFound();
  const application = await ScholarshipApplication.findOne({
    _id: applicationId,
    studentId,
  }).lean();
  if (!application) throw applicationNotFound();

  const [campaign, documents, paperReceipts] = await Promise.all([
    ScholarshipCampaign.findById(application.campaignId)
      .select(
        "title status awardAmountPerStudent scope documentChecklist dossierPolicy applicationStart applicationEnd",
      )
      .lean(),
    VerificationDocument.find({
      applicationId: application._id,
      status: { $nin: ["REJECTED", "SUPERSEDED", "REMOVED_BY_STUDENT"] },
    })
      .sort({ uploadedAt: 1 })
      .lean(),
    PaperDossierReceipt.find({ applicationId: application._id })
      .sort({ receivedAt: -1 })
      .lean(),
  ]);

  return {
    ...redactApplicationForStudent(application),
    campaign,
    documents: storage.withSignedUrls(documents.map(stripDocumentReviewer)),
    paperReceipts: paperReceipts.map(redactReceiptForStudent),
  };
};

const declarePaperDispatch = async (studentId, applicationId, body = {}) => {
  if (!mongoose.isValidObjectId(applicationId)) throw applicationNotFound();
  const application = await ScholarshipApplication.findOne({
    _id: applicationId,
    studentId,
  });
  if (!application) throw applicationNotFound();
  if (!["SUBMITTED", "NEED_MORE_INFORMATION"].includes(application.status)) {
    throw new AppError(
      "Paper dispatch cannot be changed in the current application state",
      "APPLICATION_NOT_ACCEPTING_PAPER",
      409,
    );
  }
  const campaign = await campaignService.getCampaignOrThrow(
    application.campaignId,
  );
  if (!campaign.applicationEnd)
    throw validationError("Campaign application deadline is not configured");
  const now = new Date();
  if (now > campaign.applicationEnd)
    throw new AppError(
      "Paper dispatch must be declared by the application deadline",
      "APPLICATION_WINDOW_CLOSED",
      409,
    );
  const sentAt = new Date(body.sentAt);
  if (
    !body.sentAt ||
    Number.isNaN(sentAt.getTime()) ||
    sentAt > campaign.applicationEnd ||
    sentAt > now
  ) {
    throw validationError(
      "sentAt must be a valid time on or before the application deadline",
    );
  }
  const carrier = typeof body.carrier === "string" ? body.carrier.trim() : "";
  const trackingNumber =
    typeof body.trackingNumber === "string"
      ? body.trackingNumber.trim().toUpperCase()
      : "";
  const proofStorageKey =
    typeof body.proofStorageKey === "string" ? body.proofStorageKey.trim() : "";
  if (carrier.length < 2 || carrier.length > 100)
    throw validationError("carrier is required");
  if (!trackingNumber && !proofStorageKey)
    throw validationError("trackingNumber or proofStorageKey is required");
  if (proofStorageKey)
    await storage.assertOwnedKeys(studentId, [proofStorageKey]);

  const before = application.paperDispatch?.toObject?.() ||
    application.paperDispatch || { declaredSent: false };
  application.paperDispatch = {
    declaredSent: true,
    sentAt,
    carrier,
    trackingNumber: trackingNumber || null,
    proofStorageKey: proofStorageKey || null,
    declaredAt: now,
  };
  await application.save();
  await audit({
    actorAdminId: null,
    actorType: "SYSTEM",
    action: "STUDENT_PAPER_DISPATCH_DECLARED",
    targetType: "ScholarshipApplication",
    targetId: application._id,
    beforeState: before,
    afterState: application.paperDispatch.toObject(),
  });
  return redactApplicationForStudent(application.toObject());
};

// FR-STU-26
const getMyScholarships = async (studentId) => {
  const now = new Date();
  const scholarships = await Scholarship.find({ studentId })
    .sort({ expiresAt: 1, createdAt: -1 })
    .lean();
  const rows = await attachCampaigns(scholarships);
  return rows.map((row) => ({
    ...row,
    // BR-23: usable only while ACTIVE, within its validity period and with a remaining balance
    isUsable:
      row.status === "ACTIVE" &&
      row.validFrom <= now &&
      (!row.expiresAt || row.expiresAt > now) &&
      toNum(row.remainingAmount) > 0,
  }));
};

// ---------- Admin ----------

const adminListApplications = async (query = {}, paging = {}) => {
  const page = Math.max(1, Number(paging?.page) || 1);
  const pageSize = Math.max(1, Number(paging?.pageSize) || 20);
  const skip = paging?.skip !== undefined ? Number(paging.skip) : (page - 1) * pageSize;
  const safePaging = { page, pageSize, skip };

  const filter = {};
  if (query.status && String(query.status).trim().toUpperCase() !== "ALL") {
    const rawStatuses = String(query.status)
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const statuses = [];
    for (const s of rawStatuses) {
      if (s === "SUBMITTED") {
        statuses.push("SUBMITTED", "PENDING_REVIEW");
      } else if (APPLICATION_STATUSES.includes(s)) {
        statuses.push(s);
      } else {
        throw validationError("status is invalid");
      }
    }
    filter.status = { $in: [...new Set(statuses)] };
  } else {
    // Mặc định không hiển thị bản ghi nháp chưa nộp của học sinh
    filter.status = { $ne: "DRAFT" };
  }

  if (query.submissionMode && String(query.submissionMode).trim().toUpperCase() !== "ALL") {
    const modes = String(query.submissionMode)
      .split(",")
      .map((m) => m.trim().toUpperCase())
      .filter(Boolean);
    if (modes.some((m) => !DOSSIER_SUBMISSION_MODES.includes(m)))
      throw validationError("submissionMode is invalid");
    filter.submissionMode = { $in: modes };
  }

  if (query.campaignId && String(query.campaignId).trim().toUpperCase() !== "ALL") {
    if (!mongoose.isValidObjectId(query.campaignId))
      throw validationError("campaignId is invalid");
    filter.campaignId = new mongoose.Types.ObjectId(query.campaignId);
  }
  if (query.applicationCode) {
    filter.applicationCode = String(query.applicationCode).trim().toUpperCase();
  }
  if (query.province)
    filter["schoolInfo.province"] = new RegExp(
      escapeRegex(String(query.province).trim()),
      "i",
    );
  if (query.residenceProvince)
    filter["applicantInfo.permanentProvince"] = new RegExp(
      escapeRegex(String(query.residenceProvince).trim()),
      "i",
    );
  if (query.schoolName)
    filter["schoolInfo.schoolName"] = new RegExp(
      escapeRegex(String(query.schoolName).trim()),
      "i",
    );
  if (query.gradeLevel)
    filter["schoolInfo.gradeLevel"] = String(query.gradeLevel)
      .trim()
      .toUpperCase();
  for (const field of ["hasPovertyCertificate", "isDisadvantaged"]) {
    if (query[field] !== undefined && query[field] !== "") {
      if (!["true", "false"].includes(String(query[field]).toLowerCase()))
        throw validationError(`${field} must be true or false`);
      if (field === "isDisadvantaged") {
        const expected = String(query[field]).toLowerCase() === "true";
        if (expected) {
          filter.$and = [
            ...(filter.$and || []),
            {
              $or: [
                { "applicantInfo.isDisadvantaged": true },
                { "schoolInfo.isDisadvantaged": true },
              ],
            },
          ];
        } else {
          filter.$and = [
            ...(filter.$and || []),
            { "applicantInfo.isDisadvantaged": { $ne: true } },
            { "schoolInfo.isDisadvantaged": { $ne: true } },
          ];
        }
      } else {
        filter[field] = String(query[field]).toLowerCase() === "true";
      }
    }
  }
  if (query.hardshipCategory) {
    const category = String(query.hardshipCategory).trim().toUpperCase();
    if (
      ![
        "POOR_HOUSEHOLD",
        "NEAR_POOR_HOUSEHOLD",
        "REMOTE_AREA",
        "ORPHANED",
      ].includes(category)
    ) {
      throw validationError("hardshipCategory is invalid");
    }
    filter.$and = [
      ...(filter.$and || []),
      {
        $or: [
          { "applicantInfo.hardshipCategories": category },
          { "schoolInfo.hardshipCategories": category },
        ],
      },
    ];
  }
  if (query.minPriorityScore !== undefined && query.minPriorityScore !== "") {
    const score = Number(query.minPriorityScore);
    if (!Number.isFinite(score) || score < 0)
      throw validationError("minPriorityScore must be a non-negative number");
    filter["screeningResult.layer2Score"] = {
      ...(filter["screeningResult.layer2Score"] || {}),
      $gte: score,
    };
  }
  if (query.maxPriorityScore !== undefined && query.maxPriorityScore !== "") {
    const score = Number(query.maxPriorityScore);
    if (!Number.isFinite(score) || score < 0)
      throw validationError("maxPriorityScore must be a non-negative number");
    filter["screeningResult.layer2Score"] = {
      ...(filter["screeningResult.layer2Score"] || {}),
      $lte: score,
    };
  }
  if (query.scoreStatus && String(query.scoreStatus).trim().toUpperCase() !== "ALL") {
    const statuses = String(query.scoreStatus)
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const validScoreStatuses = [
      "UNSCORED",
      "AUTOMATIC",
      "VERIFIED",
      "ADJUSTED",
      "OFFICIAL",
    ];
    if (statuses.some((s) => !validScoreStatuses.includes(s))) {
      throw validationError("scoreStatus is invalid");
    }
    filter["screeningResult.scoreStatus"] = { $in: statuses };
  }
  if (query.paperStatus) {
    const paperStatus = String(query.paperStatus).trim().toUpperCase();
    if (
      !["NOT_DECLARED", "DECLARED", "RECEIVED", "RECONCILED"].includes(
        paperStatus,
      )
    ) {
      throw validationError("paperStatus is invalid");
    }
    if (paperStatus === "NOT_DECLARED")
      filter["paperDispatch.declaredSent"] = { $ne: true };
    if (paperStatus === "DECLARED") filter["paperDispatch.declaredSent"] = true;
    if (paperStatus === "RECEIVED" || paperStatus === "RECONCILED") {
      const receiptStatuses =
        paperStatus === "RECONCILED"
          ? ["RECONCILED"]
          : ["RECEIVED", "IN_RECONCILIATION", "DISCREPANCY", "RECONCILED"];
      const applicationIds = await PaperDossierReceipt.distinct(
        "applicationId",
        { status: { $in: receiptStatuses } },
      );
      filter._id = { $in: applicationIds };
    }
  }
  if (query.search) {
    const rx = new RegExp(escapeRegex(String(query.search).trim()), "i");
    const studentIds = await User.find({
      $or: [{ "studentProfile.fullName": rx }, { email: rx }],
    }).distinct("_id");
    filter.$or = [
      { applicationCode: rx },
      { "schoolInfo.schoolName": rx },
      { "applicantInfo.fullName": rx },
      { studentId: { $in: studentIds } },
    ];
  }

  // Base filter để đếm số lượng hồ sơ theo từng nhóm trạng thái (đồng bộ với search, campaignId, mode, etc.)
  const countBaseFilter = { ...filter };
  delete countBaseFilter.status;

  const sort =
    query.sortByPriority === "true" || query.sortByPriority === true
      ? { "screeningResult.layer2Score": -1, submittedAt: -1, createdAt: -1, _id: -1 }
      : { submittedAt: -1, createdAt: -1, _id: -1 };

  const [items, total, statusCountsAgg] = await Promise.all([
    ScholarshipApplication.find(filter)
      .sort(sort)
      .skip(safePaging.skip)
      .limit(safePaging.pageSize)
      .populate("studentId", "email studentProfile.fullName")
      .populate("campaignId", "title awardAmountPerStudent status")
      .lean(),
    ScholarshipApplication.countDocuments(filter),
    ScholarshipApplication.aggregate([
      { $match: countBaseFilter },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const statusMap = {};
  for (const sc of statusCountsAgg || []) {
    if (sc._id) statusMap[sc._id] = sc.count;
  }
  const counts = {
    all: Object.entries(statusMap).reduce(
      (sum, [st, c]) => (st !== "DRAFT" ? sum + c : sum),
      0,
    ),
    submitted: (statusMap.SUBMITTED || 0) + (statusMap.PENDING_REVIEW || 0),
    needMoreInfo: statusMap.NEED_MORE_INFORMATION || 0,
    dossierVerified: statusMap.DOSSIER_VERIFIED || 0,
    approved: statusMap.APPROVED || 0,
    rejected: statusMap.REJECTED || 0,
    withdrawn: statusMap.WITHDRAWN || 0,
  };

  const mappedItems = items.map(
    ({ studentId: student, campaignId: campaign, ...item }) => {
      const progress = item.checklistProgress || [];
      const totalRequired = progress.filter((p) => p.required !== false).length;
      const satisfiedRequired = progress.filter(
        (p) => p.required !== false && p.satisfied,
      ).length;

      const pendingItems = progress.filter(
        (p) =>
          p.required !== false &&
          !p.satisfied &&
          (p.hasPendingOnline || p.hasPendingPaper || p.itemStatus === "PENDING_REVIEW")
      );
      const pendingItemTitles = pendingItems.map((p) => p.title || p.code);

      const missingOrRejectedItems = progress.filter(
        (p) =>
          p.required !== false &&
          !p.satisfied &&
          !p.hasPendingOnline &&
          !p.hasPendingPaper &&
          p.itemStatus !== "PENDING_REVIEW"
      );
      const missingTitles = missingOrRejectedItems.map((p) => p.title || p.code);

      const isComplete =
        totalRequired > 0
          ? satisfiedRequired === totalRequired
          : item.status === "DOSSIER_VERIFIED" || item.status === "APPROVED";

      let guardianInfo = item.guardianInfo;
      if (guardianInfo) {
        guardianInfo = { ...(guardianInfo.toObject ? guardianInfo.toObject() : guardianInfo) };
        if (guardianInfo.cccdEnc && !guardianInfo.cccd) {
          try {
            guardianInfo.cccd = decrypt(guardianInfo.cccdEnc);
          } catch {
            // ignore
          }
        }
      }

      let screeningResult = item.screeningResult;
      if (screeningResult) {
        screeningResult = { ...(screeningResult.toObject ? screeningResult.toObject() : screeningResult) };
        if (!screeningResult.scoreStatus) {
          if (item.status === "APPROVED") {
            screeningResult.scoreStatus = "OFFICIAL";
          } else if (item.status === "DOSSIER_VERIFIED") {
            screeningResult.scoreStatus = "VERIFIED";
          } else if (
            screeningResult.layer2Score !== null &&
            screeningResult.layer2Score !== undefined
          ) {
            screeningResult.scoreStatus = "AUTOMATIC";
          } else {
            screeningResult.scoreStatus = "UNSCORED";
          }
        }
      }

      return {
        ...item,
        guardianInfo,
        screeningResult,
        studentId: student ? student._id : null,
        studentName:
          student && student.studentProfile
            ? student.studentProfile.fullName
            : null,
        studentEmail: student ? student.email : null,
        campaignId: campaign ? campaign._id : null,
        campaignTitle: campaign ? campaign.title : null,
        awardAmountPerStudent: campaign ? campaign.awardAmountPerStudent : null,
        checklistSummary: {
          totalRequired,
          satisfiedRequired,
          pendingRequiredCount: pendingItems.length,
          pendingItemTitles,
          missingItemTitles: missingTitles,
          isComplete,
          dossierState: isComplete
            ? "READY_FOR_APPROVAL"
            : pendingItems.length > 0
              ? "PENDING_REVIEW"
              : "NEED_MORE_INFORMATION",
        },
      };
    },
  );

  const response = paged(mappedItems, total, safePaging);
  response.counts = counts;
  return response;
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
  const [student, campaign, documents, paperReceipts, scholarship] =
    await Promise.all([
      User.findById(application.studentId)
        .select("email status studentProfile")
        .lean(),
      ScholarshipCampaign.findById(application.campaignId).lean(),
      VerificationDocument.find({ applicationId: application._id })
        .sort({ uploadedAt: 1 })
        .lean(),
      PaperDossierReceipt.find({ applicationId: application._id })
        .sort({ receivedAt: -1 })
        .lean(),
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

  const appObj = application.toObject();
  if (appObj.guardianInfo) {
    if (appObj.guardianInfo.cccdEnc && !appObj.guardianInfo.cccd) {
      try {
        appObj.guardianInfo.cccd = decrypt(appObj.guardianInfo.cccdEnc);
      } catch {
        // fallback
      }
    }
  }
  if (appObj.studentCccdEnc && !appObj.studentCccd) {
    try {
      appObj.studentCccd = decrypt(appObj.studentCccdEnc);
    } catch {
      // fallback
    }
  }
  if (appObj.paperDispatch?.proofStorageKey) {
    const signedProof = storage.createSignedUrl(
      appObj.paperDispatch.proofStorageKey,
      { fileName: "paper-dossier-dispatch-proof.pdf" },
    );
    appObj.paperDispatch.proofUrl = signedProof?.url || null;
    appObj.paperDispatch.proofUrlExpiresAt = signedProof?.expiresAt || null;
  }

  if (appObj.screeningResult) {
    if (!appObj.screeningResult.scoreStatus) {
      if (appObj.status === "APPROVED") {
        appObj.screeningResult.scoreStatus = "OFFICIAL";
      } else if (appObj.status === "DOSSIER_VERIFIED") {
        appObj.screeningResult.scoreStatus = "VERIFIED";
      } else if (
        appObj.screeningResult.layer2Score !== null &&
        appObj.screeningResult.layer2Score !== undefined
      ) {
        appObj.screeningResult.scoreStatus = "AUTOMATIC";
      } else {
        appObj.screeningResult.scoreStatus = "UNSCORED";
      }
    }
  }

  const signedPaperReceipts = (paperReceipts || []).map((r) => {
    let proofUrl = null;
    let proofUrlExpiresAt = null;
    if (r.proofStorageKey) {
      const signed = storage.createSignedUrl(r.proofStorageKey, {
        fileName: `receipt-${r.receiptCode}-proof.jpg`,
      });
      proofUrl = signed?.url || null;
      proofUrlExpiresAt = signed?.expiresAt || null;
    }
    return {
      ...r,
      proofUrl,
      proofUrlExpiresAt,
    };
  });

  return {
    ...appObj,
    student: student
      ? {
          id: student._id.toString(),
          email: student.email,
          status: student.status,
          ...(student.studentProfile || {}),
        }
      : null,
    campaign: campaign ? campaignService.present(campaign) : null,
    documents: storage.withSignedUrls(documents), // short-lived signed URLs, Admin only (NFR-04)
    paperReceipts: signedPaperReceipts,
    checklistSummary,
    scholarship,
  };
};

const assertSubmitted = (application) => {
  if (application.status !== "SUBMITTED") {
    throw new AppError(
      "Application is not waiting for review",
      "APPLICATION_NOT_REVIEWABLE",
      409,
    );
  }
};

/**
 * AID-01 Nonfinancial Dossier Verification & Approval:
 * Verifies guardian profile, school/class profile, document checklist & reconciled paper receipts,
 * plus AID-08 consent port if required.
 * STRICT BOUNDARY: NEVER creates a Scholarship, NEVER increments Campaign.allocatedAmount,
 * and NEVER creates financial Transactions (left strictly to AID-06 / Tin).
 */
const verifyDossierApplication = async (
  adminId,
  applicationId,
  body = {},
  options = {},
) => {
  const application = await getApplicationOrThrow(applicationId);
  assertSubmitted(application);

  const [campaign, student, documents, paperReceipts] = await Promise.all([
    campaignService.getCampaignOrThrow(application.campaignId),
    getActiveStudentOrThrow(application.studentId),
    VerificationDocument.find({ applicationId: application._id }).lean(),
    PaperDossierReceipt.find({ applicationId: application._id })
      .sort({ receivedAt: -1 })
      .lean(),
  ]);

  const missingProfile = [];
  if (!application.guardianInfo) {
    missingProfile.push("guardianInfo");
  } else {
    parseGuardianInfo(
      application.guardianInfo.toObject
        ? application.guardianInfo.toObject()
        : application.guardianInfo,
      {
        required: true,
      },
    );
  }
  if (!application.schoolInfo) {
    missingProfile.push("schoolInfo");
  } else {
    parseSchoolInfo(
      application.schoolInfo.toObject
        ? application.schoolInfo.toObject()
        : application.schoolInfo,
      {
        required: true,
      },
    );
  }
  if (missingProfile.length > 0) {
    throw Object.assign(
      new AppError(
        "Dossier is missing required guardian, school, or statement fields",
        "DOSSIER_INCOMPLETE",
        400,
      ),
      { details: { missing: missingProfile } },
    );
  }

  const evaluated = evaluateChecklistProgress({
    campaign,
    submissionMode: application.submissionMode || "ONLINE",
    onlineDocuments: documents,
    paperReceipts,
    allowPendingOnlineForVerification: true,
  });

  if (evaluated.unresolvedDiscrepancyReceipt) {
    throw new AppError(
      "Cannot verify dossier while a linked paper dossier receipt has an unresolved DISCREPANCY",
      "PAPER_RECEIPT_DISCREPANCY_UNRESOLVED",
      409,
    );
  }

  if (evaluated.missingForVerification.length > 0) {
    throw Object.assign(
      new AppError(
        "Dossier checklist requirements are not satisfied yet",
        "DOSSIER_CHECKLIST_INCOMPLETE",
        409,
      ),
      { details: { missing: evaluated.missingForVerification } },
    );
  }

  if (!campaign.documentChecklist || campaign.documentChecklist.length === 0) {
    if (
      application.submissionMode === "PAPER" &&
      !evaluated.hasReconciledPaperReceipt
    ) {
      throw new AppError(
        "A reconciled PaperDossierReceipt is required to verify a PAPER dossier",
        "PAPER_RECEIPT_NOT_RECONCILED",
        409,
      );
    }
    if (
      application.submissionMode === "ONLINE" &&
      evaluated.validOnlineDocCount === 0
    ) {
      throw new AppError(
        "At least one valid non-rejected uploaded document is required to verify an ONLINE dossier",
        "DOSSIER_CHECKLIST_INCOMPLETE",
        409,
      );
    }
    if (
      application.submissionMode === "HYBRID" &&
      evaluated.validOnlineDocCount === 0 &&
      !evaluated.hasReconciledPaperReceipt
    ) {
      throw new AppError(
        "HYBRID dossier requires uploaded proof or a reconciled PaperDossierReceipt",
        "DOSSIER_CHECKLIST_INCOMPLETE",
        409,
      );
    }
  }

  const consentSnapshot = application.consentSnapshot || {
    status: "NOT_REQUIRED",
    consentRecordId: null,
    guardianUserId: null,
    checkedAt: new Date(),
    note: null,
  };

  const reviewNote = assertOptionalText(
    body.reviewNote || body.note,
    "reviewNote",
    { max: 1000 },
  );
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
        { returnDocument: "after", session },
      ).lean();

      if (!updated) {
        throw new AppError(
          "Application is not waiting for review",
          "APPLICATION_NOT_REVIEWABLE",
          409,
        );
      }

      // EDUNITY V3: Giữ nguyên trạng thái của minh chứng tùy chọn khi cấp học bổng (không tự động duyệt)

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
        session,
      );
    });
  } finally {
    session.endSession();
  }

  await notify(
    application.studentId,
    "Hồ sơ học bổng đạt yêu cầu hành chính",
    `Hồ sơ ${updated.applicationCode || ""} cho chiến dịch "${campaign.title}" đã được xác minh hợp lệ và đang chờ xét cấp quỹ (AID-06).`.trim(),
    "SCHOLARSHIP_DOSSIER_VERIFIED",
  );

  return {
    application: updated,
    financialAllocated: false,
    readyForAid06GrantReview: true,
  };
};

const adminReviewApplicationDocument = async (
  adminId,
  applicationId,
  documentId,
  body,
) => {
  const application = await getApplicationOrThrow(applicationId);
  if (
    !["SUBMITTED", "NEED_MORE_INFORMATION", "DOSSIER_VERIFIED"].includes(
      application.status,
    )
  ) {
    throw new AppError(
      `Cannot review documents for an application in status ${application.status}`,
      "APPLICATION_NOT_REVIEWABLE",
      409,
    );
  }
  if (!mongoose.isValidObjectId(documentId)) {
    throw new AppError(
      "Verification document not found",
      "DOCUMENT_NOT_FOUND",
      404,
    );
  }
  const doc = await VerificationDocument.findOne({
    _id: documentId,
    applicationId: application._id,
  });
  if (!doc)
    throw new AppError(
      "Verification document not found",
      "DOCUMENT_NOT_FOUND",
      404,
    );
  if (["SUPERSEDED", "REMOVED_BY_STUDENT"].includes(doc.status)) {
    throw new AppError(
      "This document version is no longer active",
      "DOCUMENT_VERSION_INACTIVE",
      409,
    );
  }

  if (typeof body.status !== "string" || isBlank(body.status)) {
    throw validationError("status must be APPROVED or REJECTED");
  }
  const status = body.status.trim().toUpperCase();
  if (!["APPROVED", "REJECTED"].includes(status)) {
    throw validationError("status must be APPROVED or REJECTED");
  }
  const reviewNote = assertOptionalText(body.reviewNote, "reviewNote", {
    max: 500,
  });
  if (status === "REJECTED" && !reviewNote) {
    throw validationError("reviewNote is required when rejecting a document");
  }

  const campaign = await campaignService.getCampaignOrThrow(
    application.campaignId,
  );
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
        { returnDocument: "after", session },
      ).lean();

      const documents = await VerificationDocument.find({
        applicationId: application._id,
      })
        .session(session)
        .lean();
      const paperReceipts = await PaperDossierReceipt.find({
        applicationId: application._id,
      })
        .session(session)
        .lean();
      evaluated = evaluateChecklistProgress({
        campaign,
        submissionMode: application.submissionMode || "ONLINE",
        onlineDocuments: documents,
        paperReceipts,
        allowPendingOnlineForVerification: false,
      });

      const updateFields = {
        checklistProgress: evaluated.progress,
      };

      const approvedPoverty = documents.some(
        (d) =>
          d.checklistItemCode === "POVERTY_CERTIFICATE" &&
          (d.status === "APPROVED" || (String(d._id) === String(doc._id) && status === "APPROVED")),
      );
      const povertyActive = approvedPoverty || application.hasPovertyCertificate === true;
      const priorityResult = scorePriorityCriteria(
        {
          ...application.toObject(),
          hasPovertyCertificate: povertyActive,
          campaignPriorityPolicyVersion: campaign.priorityPolicyVersion,
        },
        campaign.priorityCriteria,
      );

      if (
        application.status === "SUBMITTED" &&
        evaluated.missingForVerification.length === 0 &&
        !evaluated.unresolvedDiscrepancyReceipt
      ) {
        updateFields.status = "DOSSIER_VERIFIED";
        updateFields.reviewedBy = adminId;
        updateFields.reviewedAt = now;
        updateFields.dossierVerification = {
          status: "VERIFIED",
          verifiedBy: adminId,
          verifiedAt: now,
          note: reviewNote || "Đủ minh chứng bắt buộc hợp lệ",
          checklistVerified: true,
        };
        updateFields.screeningResult = {
          ...(application.screeningResult || {}),
          scoreStatus: "VERIFIED",
          layer1Passed: true,
          layer2Score: priorityResult.score,
          priorityCriteria: priorityResult.matchedCriteria,
          priorityPolicyVersion: priorityResult.policyVersion,
        };
      } else if (priorityResult.score !== null) {
        updateFields["screeningResult.layer2Score"] = priorityResult.score;
        updateFields["screeningResult.priorityCriteria"] = priorityResult.matchedCriteria;
        updateFields["screeningResult.priorityPolicyVersion"] = priorityResult.policyVersion;
        if (!application.screeningResult?.scoreStatus || application.screeningResult.scoreStatus === "UNSCORED") {
          updateFields["screeningResult.scoreStatus"] = "AUTOMATIC";
        }
      }

      await ScholarshipApplication.updateOne(
        { _id: application._id },
        { $set: updateFields },
        { session },
      );

      await audit(
        {
          actorAdminId: adminId,
          action: `SCHOLARSHIP_DOCUMENT_${status}`,
          targetType: "VerificationDocument",
          targetId: doc._id,
          beforeState: { status: prevStatus },
          afterState: {
            status,
            checklistItemCode: doc.checklistItemCode,
            reviewNote,
          },
        },
        session,
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
/**
 * Final-approval authority. Follows the existing granular admin permission rule (see trashService):
 * super admin, explicit permission in adminProfile.permissions, or the configured SUPER_ADMIN_EMAIL.
 */
const assertFinalApprover = async (adminId) => {
  if (!mongoose.isValidObjectId(adminId)) {
    throw new AppError(
      "Người duyệt không hợp lệ",
      "FINAL_APPROVAL_PERMISSION_REQUIRED",
      403,
    );
  }
  const admin = await User.findById(adminId).lean();
  if (
    !admin ||
    admin.isDeleted ||
    admin.status !== "ACTIVE" ||
    admin.role !== "ADMIN"
  ) {
    throw new AppError(
      "Người duyệt phải là Quản trị viên đang hoạt động",
      "FINAL_APPROVAL_PERMISSION_REQUIRED",
      403,
    );
  }
  // EDUNITY V3: Mọi tài khoản có role ADMIN đang hoạt động đều có quyền phê duyệt học bổng.
};

const approveApplication = async (
  adminId,
  applicationId,
  body = {},
  options = {},
) => {
  const application = await getApplicationOrThrow(applicationId);
  await assertFinalApprover(adminId);

  const paperReceipts = await PaperDossierReceipt.find({
    applicationId: application._id,
  })
    .sort({ receivedAt: -1 })
    .lean();

  const approvable = ["SUBMITTED", "DOSSIER_VERIFIED", "PENDING_REVIEW"];
  if (!approvable.includes(application.status)) {
    throw new AppError(
      "Application is not waiting for review",
      "APPLICATION_NOT_REVIEWABLE",
      409,
    );
  }

  // Nếu hồ sơ đã có kết quả sơ duyệt thì phải đạt vòng 1 (không bị đánh rớt)
  if (
    application.screeningResult &&
    application.screeningResult.layer1Passed === false
  ) {
    throw new AppError(
      "Hồ sơ không đạt điều kiện bắt buộc qua bước sơ duyệt",
      "SCREENING_REJECTED",
      409,
    );
  }

  const campaign = await campaignService.getCampaignOrThrow(
    application.campaignId,
  );
  const reviewNote = assertOptionalText(body.reviewNote, "reviewNote", {
    max: 1000,
  });
  const award = campaign.awardAmountPerStudent;
  if (
    campaign.officialSlotCount !== null &&
    campaign.officialSlotCount !== undefined &&
    campaign.officialSlotCount < 1
  ) {
    throw new AppError(
      "The campaign has no funded scholarship slots",
      "NO_FUNDED_SCHOLARSHIP_SLOTS",
      409,
    );
  }

  const mustEnforceFullDossier =
    requiresFullDossierValidation(campaign, {}, application);

  let consentSnapshot = application.consentSnapshot;
  let evaluatedProgress = application.checklistProgress;

  const student = await getActiveStudentOrThrow(application.studentId);
  const documents = await VerificationDocument.find({
    applicationId: application._id,
  }).lean();

  if (mustEnforceFullDossier) {
    parseGuardianInfo(
      application.guardianInfo?.toObject?.() || application.guardianInfo,
      { required: true },
    );
    parseSchoolInfo(
      application.schoolInfo?.toObject?.() || application.schoolInfo,
      { required: true },
    );
  }

  const evaluated = evaluateChecklistProgress({
    campaign,
    submissionMode: application.submissionMode || "ONLINE",
    onlineDocuments: documents,
    paperReceipts,
    allowPendingOnlineForVerification: false,
  });

  if (evaluated.unresolvedDiscrepancyReceipt) {
    throw new AppError(
      "Cannot approve application while a linked paper dossier receipt has an unresolved DISCREPANCY",
      "PAPER_RECEIPT_DISCREPANCY_UNRESOLVED",
      409,
    );
  }

  if (evaluated.missingForVerification.length > 0) {
    throw Object.assign(
      new AppError(
        "Dossier checklist requirements are not satisfied yet",
        "DOSSIER_CHECKLIST_INCOMPLETE",
        409,
      ),
      { details: { missing: evaluated.missingForVerification } },
    );
  }
  evaluatedProgress = evaluated.progress;

  const campaignRequiresPaper =
    Boolean(campaign.dossierPolicy?.requirePaperReceipt) ||
    Boolean(campaign.dossierPolicy?.requirePaperProofPhoto) ||
    (Array.isArray(campaign.documentChecklist) &&
      campaign.documentChecklist.length > 0 &&
      campaign.documentChecklist.some(
        (it) => it.required && (it.acceptedMode === "PAPER" || it.acceptedMode === "BOTH"),
      ) &&
      application.submissionMode !== "ONLINE");
  if (campaignRequiresPaper) {
    const validReceipt = paperReceipts.find(
      (r) => ["RECEIVED", "RECONCILED"].includes(r.status),
    );
    if (!validReceipt) {
      throw new AppError(
        "Hồ sơ yêu cầu nộp bản cứng bắt buộc phải có biên nhận tiếp nhận hồ sơ giấy hợp lệ trước khi phê duyệt",
        "PAPER_RECEIPT_REQUIRED",
        409,
      );
    }
    const requireProof =
      campaign.dossierPolicy?.requirePaperProofPhoto === true ||
      body.enforcePaperProof === true;
    if (
      requireProof &&
      !validReceipt.proofStorageKey &&
      (!Array.isArray(validReceipt.proofPhotos) || validReceipt.proofPhotos.length === 0) &&
      !validReceipt.proofUrl
    ) {
      throw new AppError(
        "Biên nhận hồ sơ giấy bắt buộc phải có ảnh minh chứng tiếp nhận trước khi phê duyệt",
        "PAPER_RECEIPT_PROOF_REQUIRED",
        409,
      );
    }
  }

  if (options.requireConsent) {
    consentSnapshot = await assertConsentGate({
      student,
      campaign,
      application,
      guardianInfo: application.guardianInfo,
      schoolInfo: application.schoolInfo,
      consentVerifier: options.consentVerifier,
      requireConsent: true,
    });
  } else if (!consentSnapshot) {
    consentSnapshot = application.consentSnapshot || {
      status: "NOT_REQUIRED",
      consentRecordId: null,
      guardianUserId: null,
      checkedAt: new Date(),
      note: null,
    };
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
      if (application.screeningResult) {
        setUpdate["screeningResult.scoreStatus"] = "OFFICIAL";
      } else {
        const priorityResult = scorePriorityCriteria(
          {
            ...application.toObject(),
            campaignPriorityPolicyVersion: campaign.priorityPolicyVersion,
          },
          campaign.priorityCriteria,
        );
        setUpdate.screeningResult = {
          scoreStatus: "OFFICIAL",
          layer1Passed: true,
          layer2Score: priorityResult.score,
          priorityCriteria: priorityResult.matchedCriteria,
          priorityPolicyVersion: priorityResult.policyVersion,
        };
      }
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
        {
          $set: setUpdate,
          $push: {
            history: {
              action: "APPROVED",
              actorId: adminId,
              actorRole: "ADMIN",
              timestamp: now,
              note: reviewNote,
            },
          },
        },
        { returnDocument: "after", session },
      ).lean();
      if (!updatedApplication) {
        throw new AppError(
          "Application is not waiting for review",
          "APPLICATION_NOT_REVIEWABLE",
          409,
        );
      }

      // BR-26 / BR-37: atomically reserve the award from the net eligible fund that is not allocated yet
      const slotFilter =
        campaign.officialSlotCount !== null &&
        campaign.officialSlotCount !== undefined
          ? [
              {
                $lt: [
                  "$allocatedAmount",
                  toDec(toNum(award) * campaign.officialSlotCount),
                ],
              },
            ]
          : [];
      // Check for approved pending refunds on this campaign to protect allocatable funds
      const approvedPendingRefundCases = await RefundCase.aggregate([
        {
          $match: {
            relatedContributionId: { $ne: null },
            status: { $in: ["APPROVED", "PENDING_BANK_TRANSFER", "AWAITING_BANK_VERIFICATION"] },
          },
        },
        {
          $lookup: {
            from: "sponsorcontributions",
            localField: "relatedContributionId",
            foreignField: "_id",
            as: "contrib",
          },
        },
        { $unwind: "$contrib" },
        { $match: { "contrib.campaignId": campaign._id } },
        { $group: { _id: null, total: { $sum: { $ifNull: ["$approvedAmount", "$eligibleAmount"] } } } },
      ]).session(session);

      const approvedPendingRefundTotal = Math.max(0, toNum(approvedPendingRefundCases[0]?.total || 0));

      const netCurrentFunding = {
        $subtract: [
          "$fundedAmount",
          {
            $add: [
              { $ifNull: ["$refundedAmount", 0] },
              toDec(approvedPendingRefundTotal),
            ],
          },
        ],
      };
      const officialFunding = {
        $ifNull: ["$officialEligibleFunding", "$fundedAmount"],
      };
      const currentlyAllocatableFunding = {
        $min: [officialFunding, netCurrentFunding],
      };
      const allocated = await ScholarshipCampaign.updateOne(
        {
          _id: campaign._id,
          $expr: {
            $and: [
              {
                $gte: [
                  {
                    $subtract: [
                      currentlyAllocatableFunding,
                      "$allocatedAmount",
                    ],
                  },
                  award,
                ],
              },
              ...slotFilter,
            ],
          },
        },
        { $inc: { allocatedAmount: award } },
        { session },
      );
      if (allocated.modifiedCount !== 1) {
        const freshCamp = await ScholarshipCampaign.findById(
          campaign._id,
        ).session(session);
        const currentAllocated = toNum(freshCamp?.allocatedAmount || 0);
        if (
          freshCamp?.officialSlotCount !== null &&
          freshCamp?.officialSlotCount !== undefined &&
          currentAllocated >= freshCamp.officialSlotCount * toNum(award)
        ) {
          throw new AppError(
            "Chiến dịch đã cấp hết số suất chính thức đã chốt",
            "OFFICIAL_SLOTS_EXHAUSTED",
            409,
          );
        }
        throw new AppError(
          "Campaign available fund is not enough for this scholarship",
          "INSUFFICIENT_CAMPAIGN_FUND",
          409,
        );
      }

      const year = now.getFullYear();
      const randHex = crypto.randomBytes(2).toString("hex").toUpperCase();
      const scholarshipCode = `SCH-${year}-${randHex}`;
      [scholarship] = await Scholarship.create(
        [
          {
            campaignId: campaign._id,
            applicationId: application._id,
            studentId: application.studentId,
            code: scholarshipCode,
            allocatedAmount: award,
            remainingAmount: award,
            validFrom: now,
            expiresAt: new Date(now.getTime() + (campaign.entitlementValidityDays || 180) * 24 * 60 * 60 * 1000),
            benefitScope: "ALL_COURSES",
            status: "ACTIVE",
          },
        ],
        { session },
      );

      // EDUNITY V3: Giữ nguyên trạng thái của minh chứng tùy chọn khi cấp học bổng (không tự động duyệt)

      await audit(
        {
          actorAdminId: adminId,
          action: "SCHOLARSHIP_APPLICATION_APPROVED",
          targetType: "ScholarshipApplication",
          targetId: application._id,
          beforeState: { status: application.status },
          afterState: {
            status: "APPROVED",
            scholarshipId: scholarship._id,
            allocatedAmount: award.toString(),
          },
        },
        session,
      );
    });
  } finally {
    session.endSession();
  }

  await notify(
    application.studentId,
    "Hồ sơ học bổng được duyệt",
    `Bạn đã được cấp học bổng ${award.toString()} VNĐ từ chiến dịch "${campaign.title}".`,
    "SCHOLARSHIP_APPROVED",
  );
  return {
    application: updatedApplication,
    scholarship: scholarship.toObject(),
  };
};

const reviewApplication = async (adminId, applicationId, body = {}, status) => {
  const application = await getApplicationOrThrow(applicationId);
  // An application left in NEED_MORE_INFORMATION or DOSSIER_VERIFIED (before AID-06) can still be rejected/returned
  const reviewable =
    status === "REJECTED"
      ? ["SUBMITTED", "NEED_MORE_INFORMATION", "DOSSIER_VERIFIED"]
      : ["SUBMITTED", "DOSSIER_VERIFIED"];
  if (!reviewable.includes(application.status)) {
    throw new AppError(
      "Application is not waiting for review",
      "APPLICATION_NOT_REVIEWABLE",
      409,
    );
  }
  const reviewNote = assertOptionalText(body.reviewNote, "reviewNote", {
    max: 1000,
  });
  if (status === "NEED_MORE_INFORMATION" && !reviewNote) {
    throw validationError(
      "reviewNote is required: describe the information the student must provide",
    );
  }

  const now = new Date();
  const dossierReviewStatus =
    status === "REJECTED" ? "REJECTED" : "NEED_MORE_INFORMATION";
  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      const setFields = {
        status,
        reviewedBy: adminId,
        reviewedAt: now,
        reviewNote,
        "dossierVerification.status": dossierReviewStatus,
        "dossierVerification.note": reviewNote,
        "dossierVerification.checklistVerified": false,
      };
      if (body.supplementDeadline && status === "NEED_MORE_INFORMATION") {
        setFields.supplementDeadline = new Date(body.supplementDeadline);
      }
      updated = await ScholarshipApplication.findOneAndUpdate(
        { _id: application._id, status: { $in: reviewable } },
        {
          $set: setFields,
          $push: {
            history: {
              action: status,
              actorId: adminId,
              actorRole: "ADMIN",
              timestamp: now,
              note: reviewNote,
              details: body.supplementDeadline
                ? { supplementDeadline: body.supplementDeadline }
                : null,
            },
          },
        },
        { returnDocument: "after", session },
      ).lean();
      if (!updated)
        throw new AppError(
          "Application is not waiting for review",
          "APPLICATION_NOT_REVIEWABLE",
          409,
        );

      await audit(
        {
          actorAdminId: adminId,
          action: `SCHOLARSHIP_APPLICATION_${status === "REJECTED" ? "REJECTED" : "INFORMATION_REQUESTED"}`,
          targetType: "ScholarshipApplication",
          targetId: updated._id,
          beforeState: { status: application.status },
          afterState: { status, reviewNote: updated.reviewNote },
        },
        session,
      );
    });
  } finally {
    session.endSession();
  }

  if (status === "REJECTED") {
    await notify(
      updated.studentId,
      "Hồ sơ học bổng bị từ chối",
      updated.reviewNote || "Hồ sơ học bổng của bạn không đạt.",
      "SCHOLARSHIP_REJECTED",
    );
  } else {
    await notify(
      updated.studentId,
      "Hồ sơ học bổng cần bổ sung",
      updated.reviewNote,
      "SCHOLARSHIP_NEED_MORE_INFORMATION",
    );
  }
  return updated;
};

const rejectApplication = (adminId, applicationId, body) =>
  reviewApplication(adminId, applicationId, body, "REJECTED");
const requestInformation = (adminId, applicationId, body) =>
  reviewApplication(adminId, applicationId, body, "NEED_MORE_INFORMATION");

// Pillar 3: 3-Actor Review Workflow (Admin Intake -> Admin Screening -> Verifier -> Approver)

const normalizePriorityValue = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("vi-VN");

const scorePriorityCriteria = (applicationOrCriteria, criteriaOrApplication = []) => {
  let application = applicationOrCriteria;
  let criteria = criteriaOrApplication;
  if (Array.isArray(applicationOrCriteria) && !Array.isArray(criteriaOrApplication)) {
    criteria = applicationOrCriteria;
    application = criteriaOrApplication;
  }
  if (!application) application = {};
  const activeCriteria = (criteria || []).filter(
    (criterion) => criterion && criterion.enabled !== false,
  );
  const matches = activeCriteria.filter((criterion) => {
    const expected = normalizePriorityValue(criterion.matchValue);
    switch (criterion.sourceField) {
      case "HAS_POVERTY_CERTIFICATE": {
        const hasPoverty =
          application.hasPovertyCertificate === true ||
          Boolean(application.applicantInfo?.hasPovertyCertificate) ||
          Boolean(application.schoolInfo?.hasPovertyCertificate) ||
          (Array.isArray(application.documents) &&
            application.documents.some(
              (d) =>
                String(d.checklistItemCode || "").toUpperCase() === "POVERTY_CERTIFICATE" &&
                !["REJECTED", "SUPERSEDED", "REMOVED_BY_STUDENT"].includes(d.status),
            )) ||
          [
            ...(application.applicantInfo?.hardshipCategories || []),
            ...(application.schoolInfo?.hardshipCategories || []),
            ...(Array.isArray(application.hardshipCategories) ? application.hardshipCategories : []),
          ].some((v) => ["POOR_HOUSEHOLD", "NEAR_POOR_HOUSEHOLD"].includes(String(v).toUpperCase()));
        return String(Boolean(hasPoverty)) === expected;
      }
      case "HARDSHIP_CATEGORY": {
        const hasHardship = [
          ...(application.applicantInfo?.hardshipCategories || []),
          ...(application.schoolInfo?.hardshipCategories || []),
          ...(Array.isArray(application.hardshipCategories) ? application.hardshipCategories : []),
        ].some((value) => normalizePriorityValue(value) === expected);
        if (!hasHardship) return false;
        // Thông tin cần minh chứng (Hộ nghèo, Cận nghèo) phải có xác minh (hasPovertyCertificate === true hoặc có tải minh chứng)
        if (expected === "poor_household" || expected === "near_poor_household") {
          return (
            application.hasPovertyCertificate === true ||
            Boolean(application.applicantInfo?.hasPovertyCertificate) ||
            Boolean(application.schoolInfo?.hasPovertyCertificate) ||
            (Array.isArray(application.documents) &&
              application.documents.some(
                (d) =>
                  String(d.checklistItemCode || "").toUpperCase() === "POVERTY_CERTIFICATE" &&
                  !["REJECTED", "SUPERSEDED", "REMOVED_BY_STUDENT"].includes(d.status),
              ))
          );
        }
        return true;
      }
      case "IS_DISADVANTAGED":
        return String(
          application.applicantInfo?.isDisadvantaged === true ||
          application.schoolInfo?.isDisadvantaged === true ||
          application.isDisadvantaged === true
        ) === expected;
      case "GRADE_LEVEL":
        return (
          normalizePriorityValue(application.schoolInfo?.gradeLevel) === expected
        );
      case "STUDENT_PROVINCE":
        return (
          normalizePriorityValue(
            application.applicantInfo?.permanentProvince,
          ) === expected ||
          normalizePriorityValue(
            application.schoolInfo?.province,
          ) === expected
        );
      case "STUDENT_COMMUNE":
        return (
          normalizePriorityValue(
            application.applicantInfo?.permanentCommune,
          ) === expected ||
          normalizePriorityValue(
            application.schoolInfo?.district,
          ) === expected
        );
      case "SCHOOL_PROVINCE":
        return (
          normalizePriorityValue(application.schoolInfo?.province) === expected
        );
      case "SCHOOL_COMMUNE":
        return (
          normalizePriorityValue(application.schoolInfo?.district) === expected
        );
      case "SCHOOL_NAME":
        return (
          normalizePriorityValue(application.schoolInfo?.schoolName) ===
          expected
        );
      default:
        return false;
    }
  });

  const selected = [];
  const exclusiveWinners = new Map();
  for (const criterion of matches) {
    if (!criterion.exclusiveGroup) {
      selected.push(criterion);
      continue;
    }
    const key = normalizePriorityValue(criterion.exclusiveGroup);
    const previous = exclusiveWinners.get(key);
    if (!previous || Number(criterion.points) > Number(previous.points))
      exclusiveWinners.set(key, criterion);
  }
  selected.push(...exclusiveWinners.values());

  return {
    score: activeCriteria.length
      ? selected.reduce(
          (sum, criterion) => sum + Number(criterion.points || 0),
          0,
        )
      : null,
    matchedCriteria: selected.map((criterion) => ({
      code: criterion.code,
      label: criterion.label,
      points: Number(criterion.points || 0),
    })),
    policyVersion: Number(application.campaignPriorityPolicyVersion || 0),
  };
};

const getPaperHandlingActorIds = async (applicationId) => {
  const receipts = await PaperDossierReceipt.find({ applicationId })
    .select("receivedBy reconciledBy history.actorAdminId")
    .lean();
  const actors = new Set();
  for (const receipt of receipts) {
    if (receipt.receivedBy) actors.add(String(receipt.receivedBy));
    if (receipt.reconciledBy) actors.add(String(receipt.reconciledBy));
    for (const event of receipt.history || []) {
      if (event.actorAdminId) actors.add(String(event.actorAdminId));
    }
  }
  return actors;
};

const adminScreenApplication = async (adminId, applicationId, body = {}) => {
  const application = await getApplicationOrThrow(applicationId);
  if (
    !["SUBMITTED", "DOSSIER_VERIFIED", "NEED_MORE_INFORMATION"].includes(
      application.status,
    )
  ) {
    throw new AppError(
      "Application is not available for screening",
      "APPLICATION_NOT_SCREENABLE",
      409,
    );
  }
  const paperHandlingActors = await getPaperHandlingActorIds(application._id);
  if (
    (application.intakeAdminId &&
      String(application.intakeAdminId) === String(adminId)) ||
    paperHandlingActors.has(String(adminId))
  ) {
    throw new AppError(
      "The intake reviewer cannot screen the same application",
      "SEGREGATION_OF_DUTIES_CONFLICT",
      403,
    );
  }
  if (
    body.layer1Passed !== undefined &&
    typeof body.layer1Passed !== "boolean"
  ) {
    throw validationError("layer1Passed must be a boolean");
  }
  if (body.layer2Score !== undefined) {
    throw validationError(
      "Priority score is calculated from the campaign policy and cannot be entered manually",
    );
  }
  const campaign = await campaignService.getCampaignOrThrow(
    application.campaignId,
  );
  const now = new Date();
  const layer1Passed = body.layer1Passed === true;
  const priorityResult = scorePriorityCriteria(
    {
      ...application.toObject(),
      campaignPriorityPolicyVersion: campaign.priorityPolicyVersion,
    },
    campaign.priorityCriteria,
  );
  const notes = assertOptionalText(body.notes || body.reviewNote, "notes", {
    max: 1000,
  });
  const assignedVerifierId =
    body.assignedVerifierId && mongoose.isValidObjectId(body.assignedVerifierId)
      ? body.assignedVerifierId
      : application.assignedVerifierId;

  const updateFields = {
    screenedBy: adminId,
    screenedAt: now,
    screeningResult: {
      scoreStatus: "ADJUSTED",
      layer1Passed,
      layer2Score: priorityResult.score,
      priorityCriteria: priorityResult.matchedCriteria,
      priorityPolicyVersion: priorityResult.policyVersion,
      notes,
    },
  };
  if (assignedVerifierId) {
    updateFields.assignedVerifierId = assignedVerifierId;
  }

  const updated = await ScholarshipApplication.findByIdAndUpdate(
    application._id,
    { $set: updateFields },
    { returnDocument: "after" },
  ).lean();

  await audit({
    actorAdminId: adminId,
    action: "SCHOLARSHIP_APPLICATION_SCREENED",
    targetType: "ScholarshipApplication",
    targetId: application._id,
    afterState: updateFields,
  });

  return updated;
};

const adminAssignVerifier = async (adminId, applicationId, body = {}) => {
  const application = await getApplicationOrThrow(applicationId);
  const verifierId = body.verifierId || body.assignedVerifierId;
  if (!verifierId || !mongoose.isValidObjectId(verifierId)) {
    throw validationError("verifierId is required and must be a valid user id");
  }

  const verifier = await User.findById(verifierId).lean();
  if (
    !verifier ||
    !["VERIFIER", "ADMIN"].includes(verifier.role) ||
    verifier.status !== "ACTIVE"
  ) {
    throw new AppError(
      "Người được chỉ định phải là Thẩm định viên hoặc Quản trị viên đang hoạt động",
      "INVALID_VERIFIER",
      400,
    );
  }
  const paperHandlingActors = await getPaperHandlingActorIds(application._id);
  if (
    String(verifierId) === String(adminId) ||
    (application.intakeAdminId &&
      String(verifierId) === String(application.intakeAdminId)) ||
    (application.screenedBy &&
      String(verifierId) === String(application.screenedBy)) ||
    paperHandlingActors.has(String(verifierId))
  ) {
    throw new AppError(
      "Người xác minh phải khác người tiếp nhận, người sơ duyệt và người phân công",
      "SEGREGATION_OF_DUTIES_CONFLICT",
      403,
    );
  }

  const isReassignment =
    application.assignedVerifierId &&
    String(application.assignedVerifierId) !== String(verifierId);
  const setUpdate = { assignedVerifierId: verifierId };
  if (isReassignment) {
    // Invalidate previous verification result since a new verifier must evaluate the dossier independently
    setUpdate.verifierResult = null;
    if (application.status === "DOSSIER_VERIFIED") {
      setUpdate.status = "SUBMITTED";
    }
  }

  const updated = await ScholarshipApplication.findByIdAndUpdate(
    application._id,
    {
      $set: setUpdate,
      $push: {
        history: {
          action: isReassignment ? "VERIFIER_REASSIGNED" : "VERIFIER_ASSIGNED",
          actorId: adminId,
          actorRole: "ADMIN",
          timestamp: new Date(),
          details: {
            verifierId,
            previousVerifierId: application.assignedVerifierId || null,
          },
        },
      },
    },
    { returnDocument: "after" },
  ).lean();

  await audit({
    actorAdminId: adminId,
    action: "SCHOLARSHIP_VERIFIER_ASSIGNED",
    targetType: "ScholarshipApplication",
    targetId: application._id,
    afterState: { assignedVerifierId: verifierId },
  });

  return updated;
};

const verifierSubmitResult = async (verifierId, applicationId, body = {}) => {
  const application = await getApplicationOrThrow(applicationId);
  if (
    !application.assignedVerifierId ||
    String(application.assignedVerifierId) !== String(verifierId)
  ) {
    throw new AppError(
      "Cán bộ thẩm định chỉ được nộp kết quả cho hồ sơ được phân công",
      "FORBIDDEN_VERIFIER_ASSIGNMENT",
      403,
    );
  }
  if (
    !["SUBMITTED", "DOSSIER_VERIFIED"].includes(
      application.status,
    )
  ) {
    throw new AppError(
      "Application is no longer available for verification (waiting for student resubmission or already processed)",
      "APPLICATION_NOT_VERIFIABLE",
      409,
    );
  }
  const status = body.status
    ? String(body.status).trim().toUpperCase()
    : "VERIFIED_MATCHED";
  if (
    ![
      "VERIFIED_MATCHED",
      "DISCREPANCY",
      "SUPPLEMENT_REQUIRED",
      "UNABLE_TO_VERIFY",
    ].includes(status)
  ) {
    throw validationError(
      "status must be one of VERIFIED_MATCHED, DISCREPANCY, SUPPLEMENT_REQUIRED, UNABLE_TO_VERIFY",
    );
  }
  const notes = assertOptionalText(body.notes || body.reviewNote, "notes", {
    max: 1000,
  });
  if (status !== "VERIFIED_MATCHED" && !notes) {
    throw validationError(
      "notes are required for a verification result that is not matched",
    );
  }
  const now = new Date();

  const verifierResult = {
    status,
    notes,
    verifiedBy: verifierId,
    verifiedAt: now,
  };

  const updateSet = {
    verifierResult,
  };

  if (status === "VERIFIED_MATCHED") {
    updateSet.status = "DOSSIER_VERIFIED";
    updateSet.dossierVerification = {
      status: "VERIFIED",
      verifiedBy: verifierId,
      verifiedAt: now,
      note: notes,
      checklistVerified: true,
    };
  } else if (status === "DISCREPANCY" || status === "SUPPLEMENT_REQUIRED") {
    updateSet.status = "NEED_MORE_INFORMATION";
    updateSet.reviewNote = notes;
  }

  const updated = await ScholarshipApplication.findByIdAndUpdate(
    application._id,
    {
      $set: updateSet,
      $push: {
        history: {
          action: `VERIFIER_${status}`,
          actorId: verifierId,
          actorRole: "VERIFIER",
          timestamp: now,
          note: notes,
          details: { status },
        },
      },
    },
    { returnDocument: "after" },
  ).lean();

  await audit({
    actorAdminId: verifierId,
    action: "SCHOLARSHIP_VERIFIER_RESULT_SUBMITTED",
    targetType: "ScholarshipApplication",
    targetId: application._id,
    afterState: updateSet,
  });

  return updated;
};

const getVerifierApplications = async (verifierId, query = {}, paging) => {
  const filter = { assignedVerifierId: verifierId };
  if (query.status) {
    filter.status = query.status;
  }
  const [items, total] = await Promise.all([
    ScholarshipApplication.find(filter)
      .sort({ submittedAt: 1 })
      .skip(paging.skip)
      .limit(paging.pageSize)
      .populate("studentId", "studentProfile.fullName")
      .populate("campaignId", "title")
      .lean(),
    ScholarshipApplication.countDocuments(filter),
  ]);

  return paged(
    items.map(({ studentId: student, campaignId: campaign, ...item }) => ({
      _id: item._id,
      applicationCode: item.applicationCode,
      status: item.status,
      submittedAt: item.submittedAt,
      schoolInfo: item.schoolInfo
        ? {
            schoolName: item.schoolInfo.schoolName,
            province: item.schoolInfo.province,
            gradeLevel: item.schoolInfo.gradeLevel,
            className: item.schoolInfo.className,
          }
        : null,
      verifierResult: item.verifierResult
        ? {
            status: item.verifierResult.status,
            verifiedAt: item.verifierResult.verifiedAt,
          }
        : null,
      studentName: student?.studentProfile?.fullName || null,
      campaignTitle: campaign?.title || null,
    })),
    total,
    paging,
  );
};

const verifierGetApplication = async (verifierId, applicationId) => {
  if (!mongoose.isValidObjectId(applicationId)) throw applicationNotFound();
  const application = await ScholarshipApplication.findOne({
    _id: applicationId,
    assignedVerifierId: verifierId,
  }).lean();
  if (!application) {
    throw new AppError(
      "Hồ sơ không tồn tại hoặc chưa được phân công cho bạn",
      "FORBIDDEN_VERIFIER_ASSIGNMENT",
      403,
    );
  }
  const [campaign, documents, paperReceipts] = await Promise.all([
    ScholarshipCampaign.findById(application.campaignId)
      .select("title documentChecklist paperDeliveryGraceDays")
      .lean(),
    VerificationDocument.find({ applicationId: application._id })
      .sort({ uploadedAt: 1 })
      .lean(),
    PaperDossierReceipt.find({ applicationId: application._id })
      .sort({ receivedAt: -1 })
      .lean(),
  ]);
  const safeApplicant = application.applicantInfo
    ? { ...application.applicantInfo }
    : null;
  if (safeApplicant) {
    delete safeApplicant.cccd;
    delete safeApplicant.cccdEnc;
    delete safeApplicant.cccdHash;
    delete safeApplicant.phone;
    delete safeApplicant.email;
    delete safeApplicant.permanentAddress;
    delete safeApplicant.permanentDistrict;
  }
  const safeGuardian = application.guardianInfo
    ? { ...application.guardianInfo }
    : null;
  if (safeGuardian) {
    delete safeGuardian.cccd;
    delete safeGuardian.cccdEnc;
    delete safeGuardian.cccdHash;
    delete safeGuardian.nationalIdLast4;
    delete safeGuardian.address;
    delete safeGuardian.email;
    delete safeGuardian.phone;
  }
  const safePaperReceipts = paperReceipts.map((receipt) => ({
    receiptCode: receipt.receiptCode,
    receivedAt: receipt.receivedAt,
    status: receipt.status,
    reconciliationNote: receipt.reconciliationNote,
    discrepancyReason: receipt.discrepancyReason,
    reconciledItems: receipt.reconciledItems,
  }));
  const paperDispatch = application.paperDispatch
    ? {
        declaredSent: application.paperDispatch.declaredSent,
        sentAt: application.paperDispatch.sentAt,
        carrier: application.paperDispatch.carrier,
        trackingNumber: application.paperDispatch.trackingNumber,
        declaredAt: application.paperDispatch.declaredAt,
        proofUrl: application.paperDispatch.proofStorageKey
          ? storage.createSignedUrl(application.paperDispatch.proofStorageKey)
              ?.url || null
          : null,
      }
    : null;
  const verifierDocuments = storage
    .withSignedUrls(documents)
    .map((document) => ({
      _id: document._id,
      checklistItemCode: document.checklistItemCode,
      title: document.title,
      status: document.status,
      uploadedAt: document.uploadedAt,
      files: (document.files || []).map((file) => ({
        originalName: file.originalName,
        mimeType: file.mimeType,
        size: file.size,
        url: file.url,
        urlExpiresAt: file.urlExpiresAt,
      })),
    }));
  await audit({
    actorAdminId: verifierId,
    actorType: "VERIFIER",
    action: "SCHOLARSHIP_VERIFIER_DOSSIER_ACCESSED",
    targetType: "ScholarshipApplication",
    targetId: application._id,
    afterState: { applicationCode: application.applicationCode },
  });
  return {
    _id: application._id,
    applicationCode: application.applicationCode,
    status: application.status,
    submittedAt: application.submittedAt,
    applicantInfo: safeApplicant,
    guardianInfo: safeGuardian,
    schoolInfo: application.schoolInfo,
    isDisadvantaged:
      safeApplicant?.isDisadvantaged ??
      application.schoolInfo?.isDisadvantaged ??
      false,
    hardshipCategories:
      safeApplicant?.hardshipCategories ??
      application.schoolInfo?.hardshipCategories ??
      [],
    hasPovertyCertificate: application.hasPovertyCertificate === true,
    paperDispatch,
    checklistProgress: application.checklistProgress,
    verifierResult: application.verifierResult,
    campaign: campaign
      ? {
          title: campaign.title,
          documentChecklist: campaign.documentChecklist,
          paperDeliveryGraceDays: campaign.paperDeliveryGraceDays,
        }
      : null,
    documents: verifierDocuments,
    paperReceipts: safePaperReceipts,
  };
};

const adminListVerifiers = async () => {
  const verifiers = await User.find({
    role: { $in: ["VERIFIER", "ADMIN"] },
    status: "ACTIVE",
    isDeleted: { $ne: true },
  })
    .select("_id email role studentProfile.fullName")
    .lean();

  return verifiers.map((v) => ({
    id: v._id.toString(),
    email: v.email,
    role: v.role,
    name: v.studentProfile?.fullName || v.email,
  }));
};

// Pillar 5: Public transparency consent with instant revoke
const setPublicConsent = async (studentId, applicationId, body = {}) => {
  if (!mongoose.isValidObjectId(applicationId)) throw applicationNotFound();
  const consented = body.consented === true;
  const now = new Date();

  const existingApp = await ScholarshipApplication.findOne({
    _id: applicationId,
    studentId,
  });
  if (!existingApp) throw applicationNotFound();

  if (consented) {
    const student = await User.findById(studentId).lean();
    if (student?.studentProfile?.dateOfBirth) {
      const birth = new Date(student.studentProfile.dateOfBirth);
      const ageDiff = now.getFullYear() - birth.getFullYear();
      const isUnder18 = ageDiff < 18;
      if (isUnder18) {
        // Minor requires guardian consent for public disclosure
        const hasGuardianPublicConsent =
          Boolean(body.guardianConsentConfirmed) ||
          (await GuardianConsent.exists({
            studentId,
            campaignId: existingApp.campaignId,
            status: "VERIFIED",
            allowPublicStory: true,
            revokedAt: null,
          }));
        if (!hasGuardianPublicConsent) {
          throw new AppError(
            "Người chưa thành niên cần có sự đồng ý của người giám hộ để công khai thông tin học bổng",
            "GUARDIAN_CONSENT_REQUIRED_FOR_PUBLIC_DISCLOSURE",
            403,
          );
        }
      }
    }
  }

  const application = await ScholarshipApplication.findOneAndUpdate(
    { _id: applicationId, studentId },
    {
      $set: {
        "publicConsent.consented": consented,
        "publicConsent.consentedAt": consented ? now : undefined,
        "publicConsent.revokedAt": consented ? null : now,
      },
    },
    { returnDocument: "after" },
  ).lean();

  if (!application) throw applicationNotFound();

  return {
    applicationId: application._id.toString(),
    consented,
    consentedAt: application.publicConsent?.consentedAt || null,
    revokedAt: application.publicConsent?.revokedAt || null,
  };
};

module.exports = {
  applyForScholarship,
  createDossier,
  updateDossier,
  submitDossier,
  resubmitApplication,
  withdrawDossier,
  getMyApplications,
  getMyApplicationDetail,
  declarePaperDispatch,
  getMyScholarships,
  adminListApplications,
  adminGetApplication,
  verifyDossierApplication,
  adminReviewApplicationDocument,
  approveApplication,
  rejectApplication,
  requestInformation,
  adminScreenApplication,
  adminAssignVerifier,
  verifierSubmitResult,
  getVerifierApplications,
  verifierGetApplication,
  adminListVerifiers,
  setPublicConsent,
  scorePriorityCriteria,
};
