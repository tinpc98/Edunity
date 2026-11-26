const mongoose = require("mongoose");
const {
  GRADE_LEVELS,
  GUARDIAN_RELATIONSHIPS,
  DOSSIER_SUBMISSION_MODES,
  CHECKLIST_ITEM_MODES,
} = require("../models/constants");
const { AppError } = require("../utils/errors");
const { validationError, isBlank } = require("../utils/http");
const { decrypt } = require("../utils/pii");

const PHONE_PATTERN = /^[0-9+(). -]{8,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CHECKLIST_CODE_PATTERN = /^[A-Z0-9_-]{2,40}$/;
const ALLOWED_CHECKLIST_DOC_TYPES = ["IDENTITY", "QUALIFICATION", "SCHOLARSHIP_PROOF"];
const DEFAULT_SCHOLARSHIP_CHECKLIST = [
  { code: "CCCD_STUDENT", title: "CCCD học sinh", description: "Bản scan PDF từ giấy tờ công chứng.", required: true, acceptedMode: "BOTH", acceptedDocumentTypes: ["IDENTITY"], maxFiles: 1, order: 1 },
  { code: "CCCD_GUARDIAN", title: "CCCD người giám hộ", description: "Bản scan PDF từ giấy tờ công chứng.", required: true, acceptedMode: "BOTH", acceptedDocumentTypes: ["IDENTITY"], maxFiles: 1, order: 2 },
  { code: "TRANSCRIPT", title: "Bảng điểm / học bạ", description: "Bản scan PDF hợp lệ.", required: true, acceptedMode: "BOTH", acceptedDocumentTypes: ["QUALIFICATION", "SCHOLARSHIP_PROOF"], maxFiles: 5, order: 3 },
  { code: "POVERTY_CERTIFICATE", title: "Giấy chứng nhận hộ nghèo / cận nghèo", description: "Nếu có, tải bản PDF hoặc ảnh.", required: false, acceptedMode: "BOTH", acceptedDocumentTypes: ["SCHOLARSHIP_PROOF"], maxFiles: 3, order: 4 },
  { code: "HARDSHIP_CERTIFICATE", title: "Giấy xác nhận hoàn cảnh khó khăn / gia đình chính sách", description: "Nếu có, tải bản PDF hoặc ảnh.", required: false, acceptedMode: "BOTH", acceptedDocumentTypes: ["SCHOLARSHIP_PROOF"], maxFiles: 3, order: 5 },
  { code: "ORPHAN_CERTIFICATE", title: "Giấy chứng nhận mồ côi (cha, mẹ hoặc cả hai)", description: "Nếu có, tải bản PDF hoặc ảnh.", required: false, acceptedMode: "BOTH", acceptedDocumentTypes: ["SCHOLARSHIP_PROOF"], maxFiles: 3, order: 6 },
  { code: "DISABILITY_CERTIFICATE", title: "Giấy xác nhận khuyết tật / bệnh hiểm nghèo", description: "Nếu có, tải bản PDF hoặc ảnh.", required: false, acceptedMode: "BOTH", acceptedDocumentTypes: ["SCHOLARSHIP_PROOF"], maxFiles: 3, order: 7 },
  { code: "ACADEMIC_ACHIEVEMENT", title: "Minh chứng thành tích học tập / giải thưởng", description: "Nếu có, tải bản PDF hoặc ảnh.", required: false, acceptedMode: "BOTH", acceptedDocumentTypes: ["QUALIFICATION", "SCHOLARSHIP_PROOF"], maxFiles: 5, order: 8 },
  { code: "OTHER_CERTIFICATE", title: "Giấy tờ minh chứng khác", description: "Tài liệu bổ trợ khác.", required: false, acceptedMode: "BOTH", acceptedDocumentTypes: ["SCHOLARSHIP_PROOF"], maxFiles: 5, order: 9 },
];

const resolveScholarshipChecklist = (campaign) => {
  const configured = Array.isArray(campaign?.documentChecklist) ? campaign.documentChecklist : [];
  if (configured.length > 0) return configured;
  return [];
};

/**
 * External dependency verifier port for AID-08 (Guardian / Minor Consent by Bao).
 * guardianInfo collected under AID-01 NEVER replaces legal guardian consent under AID-08.
 * When a campaign activates `dossierPolicy.requireGuardianConsentForMinor = true` (or strict
 * consent enforcement is passed via options), this gate FAILS CLOSED (503 CONSENT_DEPENDENCY_BLOCKED)
 * until an official AID-08 consent verifier is registered.
 */
let registeredConsentVerifier = null;

const setConsentVerifier = (verifier) => {
  registeredConsentVerifier = typeof verifier === "function" ? verifier : null;
};

const resetConsentVerifier = () => {
  registeredConsentVerifier = null;
};

const getConsentDependencyStatus = () => ({
  aid08ConsentReady: typeof registeredConsentVerifier === "function",
});

const assertPlainObject = (value, field) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw validationError(`${field} must be an object`);
  }
};

const assertRequiredText = (value, field, { min = 1, max = 500 } = {}) => {
  if (typeof value !== "string") {
    throw validationError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw validationError(`${field} must be between ${min} and ${max} characters`);
  }
  return trimmed;
};

const assertOptionalText = (value, field, { max = 500 } = {}) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw validationError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw validationError(`${field} must be at most ${max} characters`);
  }
  return trimmed;
};

const parseGuardianInfo = (raw, { required = false } = {}) => {
  if (raw === undefined || raw === null) {
    if (required) {
      throw validationError("guardianInfo is required for scholarship dossier", { missing: ["guardianInfo"] });
    }
    return null;
  }
  assertPlainObject(raw, "guardianInfo");

  const fullName = assertRequiredText(raw.fullName, "guardianInfo.fullName", { min: 2, max: 120 });

  if (typeof raw.relationship !== "string") {
    throw validationError("guardianInfo.relationship is required");
  }
  const relationship = raw.relationship.trim().toUpperCase();
  if (!GUARDIAN_RELATIONSHIPS.includes(relationship)) {
    throw validationError(
      `guardianInfo.relationship must be one of ${GUARDIAN_RELATIONSHIPS.join(", ")}`
    );
  }

  const phone = assertRequiredText(raw.phone, "guardianInfo.phone", { min: 8, max: 20 });
  const digitsOnly = phone.replace(/\D/g, "");
  if (!PHONE_PATTERN.test(phone) || digitsOnly.length < 8 || digitsOnly.length > 15) {
    throw validationError("guardianInfo.phone is not a valid phone number");
  }

  let email = null;
  if (raw.email !== undefined && raw.email !== null && raw.email !== "") {
    if (typeof raw.email !== "string") throw validationError("guardianInfo.email must be a string");
    const trimmedEmail = raw.email.trim().toLowerCase();
    if (trimmedEmail) {
      if (trimmedEmail.length > 160 || !EMAIL_PATTERN.test(trimmedEmail)) {
        throw validationError("guardianInfo.email is not a valid email address");
      }
      email = trimmedEmail;
    }
  }

  let nationalIdLast4 = null;
  if (raw.nationalIdLast4 !== undefined && raw.nationalIdLast4 !== null && raw.nationalIdLast4 !== "") {
    if (typeof raw.nationalIdLast4 !== "string") {
      throw validationError("guardianInfo.nationalIdLast4 must be a string");
    }
    const trimmedId = raw.nationalIdLast4.trim();
    if (!/^\d{4}$/.test(trimmedId)) {
      throw validationError("guardianInfo.nationalIdLast4 must be exactly 4 digits");
    }
    nationalIdLast4 = trimmedId;
  }

  let cccd = null;
  let cccdEnc = raw.cccdEnc || null;
  let cccdHash = raw.cccdHash || null;
  const rawCccd = raw.cccd || raw.nationalId || raw.citizenId;
  if (rawCccd !== undefined && rawCccd !== null && rawCccd !== "") {
    if (typeof rawCccd !== "string") {
      throw validationError("guardianInfo.cccd must be a string");
    }
    const trimmedCccd = rawCccd.trim();
    if (/^\d{12}$/.test(trimmedCccd)) {
      cccd = trimmedCccd;
      if (!nationalIdLast4) {
        nationalIdLast4 = trimmedCccd.slice(-4);
      }
    } else if (/^\d{4}$/.test(trimmedCccd)) {
      nationalIdLast4 = trimmedCccd;
    } else {
      throw validationError("guardianInfo.cccd must be a 12-digit string or 4-digit last digits");
    }
  } else if (raw.cccdEnc) {
    try {
      const decrypted = decrypt(raw.cccdEnc);
      if (decrypted && /^\d{12}$/.test(decrypted)) {
        cccd = decrypted;
        if (!nationalIdLast4) {
          nationalIdLast4 = decrypted.slice(-4);
        }
      }
    } catch {
      // ignore
    }
  }

  return {
    fullName,
    relationship,
    phone,
    email,
    occupation: assertOptionalText(raw.occupation, "guardianInfo.occupation", { max: 120 }),
    address: assertOptionalText(raw.address, "guardianInfo.address", { max: 300 }),
    nationalIdLast4,
    cccd,
    cccdEnc,
    cccdHash,
  };
};

const parseApplicantInfo = (raw, { required = false } = {}) => {
  if (raw === undefined || raw === null) {
    if (required) throw validationError("applicantInfo is required for scholarship dossier");
    return null;
  }
  assertPlainObject(raw, "applicantInfo");
  const fullName = required
    ? assertRequiredText(raw.fullName, "applicantInfo.fullName", { min: 2, max: 120 })
    : assertOptionalText(raw.fullName, "applicantInfo.fullName", { max: 120 });
  if (raw.phone !== undefined && raw.phone !== null && raw.phone !== "" && (typeof raw.phone !== "string" || !/^\d{10}$/.test(raw.phone))) {
    throw validationError("applicantInfo.phone must be exactly 10 digits without spaces");
  }
  const phone = assertOptionalText(raw.phone, "applicantInfo.phone", { max: 10 });
  if (required && !phone) throw validationError("applicantInfo.phone is required");
  let email = null;
  const rawEmail = assertOptionalText(raw.email, "applicantInfo.email", { max: 160 });
  if (rawEmail) {
    email = rawEmail.toLowerCase();
    if (!EMAIL_PATTERN.test(email)) throw validationError("applicantInfo.email is not a valid email address");
  }
  const permanentProvince = assertOptionalText(raw.permanentProvince, "applicantInfo.permanentProvince", { max: 100 });
  const permanentCommune = assertOptionalText(raw.permanentCommune, "applicantInfo.permanentCommune", { max: 100 });
  if (raw.isDisadvantaged !== undefined && typeof raw.isDisadvantaged !== "boolean") {
    throw validationError("applicantInfo.isDisadvantaged must be a boolean");
  }
  const isDisadvantaged = raw.isDisadvantaged === true;
  const allowedHardshipCategories = ["POOR_HOUSEHOLD", "NEAR_POOR_HOUSEHOLD", "REMOTE_AREA", "ORPHANED"];
  const hardshipCategories = raw.hardshipCategories === undefined ? [] : raw.hardshipCategories;
  if (!Array.isArray(hardshipCategories) || hardshipCategories.some((item) => !allowedHardshipCategories.includes(item))) {
    throw validationError("applicantInfo.hardshipCategories contains an invalid category");
  }
  if (isDisadvantaged && hardshipCategories.length === 0) {
    throw validationError("Select at least one hardship category when applicantInfo.isDisadvantaged is true");
  }
  return {
    fullName,
    phone,
    email,
    permanentAddress: required
      ? assertRequiredText(raw.permanentAddress, "applicantInfo.permanentAddress", { max: 300 })
      : assertOptionalText(raw.permanentAddress, "applicantInfo.permanentAddress", { max: 300 }),
    permanentProvince,
    permanentDistrict: assertOptionalText(raw.permanentDistrict, "applicantInfo.permanentDistrict", { max: 100 }),
    permanentCommune,
    isDisadvantaged,
    hardshipCategories: isDisadvantaged ? [...new Set(hardshipCategories)] : [],
  };
};

const parseSchoolInfo = (raw, { required = false } = {}) => {
  if (raw === undefined || raw === null) {
    if (required) {
      throw validationError("schoolInfo is required for scholarship dossier", { missing: ["schoolInfo"] });
    }
    return null;
  }
  assertPlainObject(raw, "schoolInfo");

  const schoolName = assertRequiredText(raw.schoolName, "schoolInfo.schoolName", { min: 2, max: 200 });

  if (typeof raw.gradeLevel !== "string") {
    throw validationError("schoolInfo.gradeLevel is required");
  }
  const gradeLevel = raw.gradeLevel.trim().toUpperCase();
  if (!GRADE_LEVELS.includes(gradeLevel)) {
    throw validationError(`schoolInfo.gradeLevel must be one of ${GRADE_LEVELS.join(", ")}`);
  }

  const className = assertRequiredText(raw.className, "schoolInfo.className", { min: 1, max: 50 });

  const academicYear = assertOptionalText(raw.academicYear, "schoolInfo.academicYear", { max: 30 });
  const province = assertOptionalText(raw.province, "schoolInfo.province", { max: 100 });
  const district = assertOptionalText(raw.district, "schoolInfo.district", { max: 100 });
  const principalName = assertOptionalText(raw.principalName, "schoolInfo.principalName", { max: 120 });
  const principalTitle = assertOptionalText(raw.principalTitle, "schoolInfo.principalTitle", { max: 100 });
  const homeroomTeacherName = assertOptionalText(raw.homeroomTeacherName, "schoolInfo.homeroomTeacherName", { max: 120 });
  const homeroomTeacherPhone = assertOptionalText(raw.homeroomTeacherPhone, "schoolInfo.homeroomTeacherPhone", { max: 10 });
  if (raw.homeroomTeacherPhone !== undefined && raw.homeroomTeacherPhone !== null && raw.homeroomTeacherPhone !== "" &&
    (typeof raw.homeroomTeacherPhone !== "string" || !/^\d{10}$/.test(raw.homeroomTeacherPhone))) {
    throw validationError("schoolInfo.homeroomTeacherPhone must be exactly 10 digits without spaces");
  }

  if (raw.isDisadvantaged !== undefined && typeof raw.isDisadvantaged !== "boolean") {
    throw validationError("schoolInfo.isDisadvantaged must be a boolean");
  }
  const isDisadvantaged = raw.isDisadvantaged === true;
  const allowedHardshipCategories = ["POOR_HOUSEHOLD", "NEAR_POOR_HOUSEHOLD", "REMOTE_AREA", "ORPHANED"];
  const hardshipCategories = raw.hardshipCategories === undefined ? [] : raw.hardshipCategories;
  if (!Array.isArray(hardshipCategories) || hardshipCategories.some((item) => !allowedHardshipCategories.includes(item))) {
    throw validationError("schoolInfo.hardshipCategories contains an invalid category");
  }
  if (isDisadvantaged && hardshipCategories.length === 0) {
    throw validationError("Select at least one hardship category when isDisadvantaged is true");
  }

  return {
    schoolName,
    gradeLevel,
    className,
    studentCode: assertOptionalText(raw.studentCode, "schoolInfo.studentCode", { max: 50 }),
    academicYear,
    province,
    district,
    schoolAddress: assertOptionalText(raw.schoolAddress, "schoolInfo.schoolAddress", { max: 300 }),
    principalName,
    principalTitle,
    homeroomTeacherName,
    homeroomTeacherPhone,
    isDisadvantaged,
    hardshipCategories: isDisadvantaged ? [...new Set(hardshipCategories)] : [],
  };
};

const parseSubmissionMode = (rawMode, campaign) => {
  const allowPaper = campaign?.dossierPolicy?.allowPaperDossier !== false;
  const defaultMode = allowPaper ? "HYBRID" : "ONLINE";
  let mode = rawMode === undefined || rawMode === null || rawMode === ""
    ? defaultMode
    : String(rawMode).trim().toUpperCase();
  if (!DOSSIER_SUBMISSION_MODES.includes(mode)) {
    throw validationError(`submissionMode must be one of ${DOSSIER_SUBMISSION_MODES.join(", ")}`);
  }
  if (!allowPaper && (mode === "PAPER" || mode === "HYBRID")) {
    throw new AppError(
      "This campaign does not accept paper dossier submissions",
      "PAPER_DOSSIER_NOT_ALLOWED",
      400
    );
  }
  const hasRequiredPaperChecklist = (campaign?.documentChecklist || []).some(
    (it) => it.required && (it.acceptedMode === "PAPER" || it.acceptedMode === "BOTH")
  );
  if (hasRequiredPaperChecklist && mode === "ONLINE") {
    mode = "HYBRID";
  }
  return mode;
};

const parseChecklistDefinition = (rawChecklist) => {
  if (rawChecklist === undefined || rawChecklist === null) return [];
  if (!Array.isArray(rawChecklist)) {
    throw validationError("documentChecklist must be an array");
  }
  if (rawChecklist.length > 30) {
    throw validationError("documentChecklist cannot contain more than 30 items");
  }

  const seenCodes = new Set();
  return rawChecklist.map((entry, idx) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw validationError(`documentChecklist[${idx}] must be an object`);
    }
    if (typeof entry.code !== "string") {
      throw validationError(`documentChecklist[${idx}].code must be a string`);
    }
    const code = entry.code.trim().toUpperCase();
    if (!CHECKLIST_CODE_PATTERN.test(code)) {
      throw validationError(
        `documentChecklist[${idx}].code must match ${CHECKLIST_CODE_PATTERN.toString()}`
      );
    }
    if (seenCodes.has(code)) {
      throw validationError(`Duplicate checklist code: ${code}`);
    }
    seenCodes.add(code);

    const title = assertRequiredText(entry.title, `documentChecklist[${idx}].title`, { min: 1, max: 150 });
    const description = assertOptionalText(entry.description, `documentChecklist[${idx}].description`, { max: 500 }) || "";
    if (entry.required !== undefined && typeof entry.required !== "boolean") {
      throw validationError(`documentChecklist[${idx}].required must be a boolean`);
    }
    const required = entry.required === undefined ? true : entry.required;

    if (
      entry.acceptedMode !== undefined &&
      entry.acceptedMode !== null &&
      typeof entry.acceptedMode !== "string"
    ) {
      throw validationError(`documentChecklist[${idx}].acceptedMode must be a string`);
    }
    const acceptedMode =
      entry.acceptedMode === undefined || entry.acceptedMode === null
        ? "EITHER"
        : entry.acceptedMode.trim().toUpperCase();
    if (!CHECKLIST_ITEM_MODES.includes(acceptedMode)) {
      throw validationError(
        `documentChecklist[${idx}].acceptedMode must be one of ${CHECKLIST_ITEM_MODES.join(", ")}`
      );
    }

    let acceptedDocumentTypes = ["SCHOLARSHIP_PROOF"];
    if (entry.acceptedDocumentTypes !== undefined) {
      if (!Array.isArray(entry.acceptedDocumentTypes) || entry.acceptedDocumentTypes.length === 0) {
        throw validationError(`documentChecklist[${idx}].acceptedDocumentTypes must be a non-empty array`);
      }
      acceptedDocumentTypes = entry.acceptedDocumentTypes.map((dt) => {
        if (typeof dt !== "string") {
          throw validationError(`documentChecklist[${idx}].acceptedDocumentTypes must contain strings`);
        }
        const upper = dt.trim().toUpperCase();
        if (!ALLOWED_CHECKLIST_DOC_TYPES.includes(upper)) {
          throw validationError(
            `documentChecklist[${idx}].acceptedDocumentTypes contains invalid value: ${upper}`
          );
        }
        return upper;
      });
    }

    const parseChecklistInt = (val, defaultVal) => {
      if (val === undefined) return defaultVal;
      if (
        val === null ||
        typeof val === "boolean" ||
        Array.isArray(val) ||
        typeof val === "object" ||
        (typeof val === "string" && val.trim() === "")
      ) {
        return NaN;
      }
      return Number(val);
    };

    const maxFiles = parseChecklistInt(entry.maxFiles, 5);
    if (!Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > 20) {
      throw validationError(`documentChecklist[${idx}].maxFiles must be an integer between 1 and 20`);
    }

    const order = parseChecklistInt(entry.order, idx + 1);
    if (!Number.isInteger(order) || order < 1) {
      throw validationError(`documentChecklist[${idx}].order must be a positive integer`);
    }

    return {
      code,
      title,
      description,
      required,
      acceptedMode,
      acceptedDocumentTypes,
      maxFiles,
      order,
    };
  });
};

const parseDossierPolicy = (rawPolicy, currentPolicy = {}) => {
  if (rawPolicy === undefined) {
    return {
      requireGuardianInfo: Boolean(currentPolicy?.requireGuardianInfo),
      requireSchoolInfo: Boolean(currentPolicy?.requireSchoolInfo),
      allowPaperDossier: currentPolicy?.allowPaperDossier !== false,
      allowDraftSave: currentPolicy?.allowDraftSave !== false,
      requireGuardianConsentForMinor: Boolean(currentPolicy?.requireGuardianConsentForMinor),
    };
  }
  assertPlainObject(rawPolicy, "dossierPolicy");

  const booleanFields = [
    "requireGuardianInfo",
    "requireSchoolInfo",
    "allowPaperDossier",
    "allowDraftSave",
    "requireGuardianConsentForMinor",
  ];
  const next = {
    requireGuardianInfo: Boolean(currentPolicy?.requireGuardianInfo),
    requireSchoolInfo: Boolean(currentPolicy?.requireSchoolInfo),
    allowPaperDossier: currentPolicy?.allowPaperDossier !== false,
    allowDraftSave: currentPolicy?.allowDraftSave !== false,
    requireGuardianConsentForMinor: Boolean(currentPolicy?.requireGuardianConsentForMinor),
  };

  for (const field of booleanFields) {
    if (rawPolicy[field] !== undefined) {
      if (typeof rawPolicy[field] !== "boolean") {
        throw validationError(`dossierPolicy.${field} must be a boolean`);
      }
      next[field] = rawPolicy[field];
    }
  }
  return next;
};

/**
 * Evaluates full checklist completion state by combining valid uploaded online VerificationDocuments
 * and reconciled PaperDossierReceipt items.
 */
const evaluateChecklistProgress = ({
  campaign,
  submissionMode = "ONLINE",
  onlineDocuments = [],
  paperReceipts = [],
  allowPendingOnlineForVerification = true,
}) => {
  const checklist = resolveScholarshipChecklist(campaign);
  const activeOnlineDocs = (onlineDocuments || []).filter(
    (doc) => doc && !["SUPERSEDED", "REMOVED_BY_STUDENT"].includes(doc.status)
  );

  const docsByCode = new Map();
  for (const doc of activeOnlineDocs) {
    const code = doc.checklistItemCode ? String(doc.checklistItemCode).trim().toUpperCase() : null;
    if (!code) continue;
    if (!docsByCode.has(code)) docsByCode.set(code, []);
    docsByCode.get(code).push(doc);
  }

  const reconciledReceipt = (paperReceipts || []).find((r) => r && r.status === "RECONCILED") || null;
  const latestActiveReceipt =
    reconciledReceipt ||
    (paperReceipts || []).find((r) =>
      r && ["RECEIVED", "IN_RECONCILIATION", "DISCREPANCY"].includes(r.status)
    ) ||
    null;

  const paperItemByCode = new Map();
  if (reconciledReceipt && Array.isArray(reconciledReceipt.reconciledItems)) {
    for (const item of reconciledReceipt.reconciledItems) {
      if (item && item.checklistItemCode) {
        paperItemByCode.set(String(item.checklistItemCode).trim().toUpperCase(), {
          receiptId: reconciledReceipt._id,
          itemStatus: item.itemStatus,
        });
      }
    }
  }

  const progress = checklist.map((item) => {
    const code = String(item.code).trim().toUpperCase();
    const docs = docsByCode.get(code) || [];
    const paperMatch = paperItemByCode.get(code) || null;

    const hasApprovedOnline = docs.some((d) => d.status === "APPROVED");
    const hasPendingOnline = docs.some((d) => d.status === "PENDING");
    const hasRejectedOnline = docs.length > 0 && docs.every((d) => d.status === "REJECTED");
    const hasValidOnline = docs.some((d) => d.status !== "REJECTED");
    const hasUploadedOnline = docs.length > 0;

    const hasMatchedPaper = Boolean(paperMatch && paperMatch.itemStatus === "MATCHED");
    const hasPendingPaper =
      Boolean(paperMatch && ["RECEIVED", "IN_RECONCILIATION"].includes(paperMatch.itemStatus)) ||
      (!paperMatch && latestActiveReceipt && ["RECEIVED", "IN_RECONCILIATION"].includes(latestActiveReceipt.status));
    const hasDiscrepancyPaper =
      Boolean(paperMatch && paperMatch.itemStatus === "DISCREPANCY") ||
      (!paperMatch && latestActiveReceipt && latestActiveReceipt.status === "DISCREPANCY");

    const mode = item.acceptedMode || "EITHER";

    // Online verification: satisfied only when APPROVED (unless administrative verify-dossier explicitly allows uploaded docs)
    const effectiveOnlineValid = allowPendingOnlineForVerification ? hasUploadedOnline && !hasRejectedOnline : hasApprovedOnline;

    let satisfied = false;
    if (mode === "ONLINE") satisfied = effectiveOnlineValid;
    else if (mode === "PAPER") satisfied = hasMatchedPaper;
    else if (mode === "BOTH") satisfied = effectiveOnlineValid && hasMatchedPaper;
    else satisfied = effectiveOnlineValid || hasMatchedPaper; // EITHER

    let itemStatus = "MISSING";
    let missingReason = "REQUIRED_CHECKLIST_ITEM_MISSING";

    if (satisfied) {
      itemStatus = "APPROVED";
      missingReason = null;
    } else if (hasDiscrepancyPaper) {
      itemStatus = "DISCREPANCY";
      missingReason = "PAPER_ITEM_DISCREPANCY";
    } else if (hasPendingOnline || hasPendingPaper) {
      itemStatus = "PENDING_REVIEW";
      missingReason = hasPendingOnline ? "REQUIRED_DOCUMENT_PENDING_REVIEW" : "RECONCILED_PAPER_ITEM_REQUIRED";
    } else if (hasRejectedOnline) {
      itemStatus = "REJECTED";
      missingReason = "REQUIRED_DOCUMENT_REJECTED";
    } else if (mode === "PAPER") {
      itemStatus = "MISSING";
      missingReason = "RECONCILED_PAPER_ITEM_REQUIRED";
    } else if (mode === "BOTH") {
      itemStatus = "MISSING";
      missingReason = hasApprovedOnline ? "RECONCILED_PAPER_ITEM_REQUIRED" : "ONLINE_AND_PAPER_REQUIRED";
    } else {
      itemStatus = "MISSING";
      missingReason = "REQUIRED_CHECKLIST_ITEM_MISSING";
    }

    return {
      code,
      title: item.title,
      required: item.required !== false,
      acceptedMode: mode,
      onlineDocumentIds: docs.map((d) => d._id).filter(Boolean),
      paperReceiptId: paperMatch ? paperMatch.receiptId : latestActiveReceipt ? latestActiveReceipt._id : null,
      paperItemStatus: paperMatch ? paperMatch.itemStatus : null,
      satisfied,
      itemStatus,
      missingReason,
      hasUploadedOnline,
      hasValidOnline,
      hasApprovedOnline,
      hasPendingOnline,
      hasRejectedOnline,
      hasMatchedPaper,
      hasPendingPaper,
      hasDiscrepancyPaper,
    };
  });

  const missingForVerification = progress
    .filter((entry) => entry.required && !entry.satisfied)
    .map((entry) => ({
      code: entry.code,
      title: entry.title,
      acceptedMode: entry.acceptedMode,
      reason: entry.missingReason || "REQUIRED_CHECKLIST_ITEM_MISSING",
      status: entry.itemStatus,
    }));

  // Validate compatibility of checklist items with submissionMode at student submission time
  const missingOnSubmit = [];
  for (const entry of progress) {
    if (!entry.required) continue;
    const hasOnline = entry.hasValidOnline;
    const mode = entry.acceptedMode;

    if (submissionMode === "ONLINE") {
      if (mode === "PAPER" || mode === "BOTH") {
        missingOnSubmit.push({
          code: entry.code,
          acceptedMode: mode,
          reason: "ITEM_REQUIRES_PAPER_OR_HYBRID_MODE",
        });
      } else if (!hasOnline && !entry.satisfied) {
        missingOnSubmit.push({
          code: entry.code,
          acceptedMode: mode,
          reason: "ONLINE_DOCUMENT_REQUIRED",
        });
      }
    } else if (submissionMode === "PAPER") {
      if (mode === "ONLINE") {
        missingOnSubmit.push({
          code: entry.code,
          acceptedMode: mode,
          reason: "ITEM_REQUIRES_ONLINE_OR_HYBRID_MODE",
        });
      }
    } else if (submissionMode === "HYBRID") {
      if ((mode === "ONLINE" || mode === "BOTH") && !hasOnline) {
        missingOnSubmit.push({
          code: entry.code,
          acceptedMode: mode,
          reason: "ONLINE_DOCUMENT_REQUIRED",
        });
      }
    }
  }

  const validOnlineDocs = activeOnlineDocs.filter((d) => d.status !== "REJECTED");

  return {
    progress,
    missingOnSubmit,
    missingForVerification,
    hasReconciledPaperReceipt: Boolean(reconciledReceipt),
    unresolvedDiscrepancyReceipt: (paperReceipts || []).find((r) => r && r.status === "DISCREPANCY") || null,
    pendingPaperReceipt:
      (paperReceipts || []).find((r) => r && ["RECEIVED", "IN_RECONCILIATION"].includes(r.status)) || null,
    validOnlineDocCount: validOnlineDocs.length,
  };
};

const assertConsentGate = async ({
  student,
  campaign,
  application = null,
  guardianInfo = null,
  schoolInfo = null,
  consentVerifier = null,
  requireConsent = false,
}) => {
  const mustVerify =
    Boolean(requireConsent) || Boolean(campaign?.dossierPolicy?.requireGuardianConsentForMinor);
  const verifier =
    typeof consentVerifier === "function" ? consentVerifier : registeredConsentVerifier;

  // A registered verifier is only consulted when consent is actually required, so nothing is marked VERIFIED needlessly
  if (!mustVerify) {
    return {
      status: "NOT_REQUIRED",
      consentRecordId: null,
      guardianUserId: null,
      checkedAt: new Date(),
      note: null,
    };
  }

  if (typeof verifier !== "function") {
    throw new AppError(
      "AID-08 Guardian Consent verification dependency is not available; minor consent cannot be bypassed using guardianInfo",
      "CONSENT_DEPENDENCY_BLOCKED",
      503
    );
  }

  const outcome = await verifier({ student, campaign, application, guardianInfo, schoolInfo });
  if (outcome && outcome.verified && outcome.notRequired) {
    // e.g. the student is 18 or older: consent is not needed, and is not recorded as given
    return { status: "NOT_REQUIRED", consentRecordId: null, guardianUserId: null, checkedAt: new Date(), note: assertOptionalText(outcome.note, "consent.note", { max: 300 }) };
  }
  if (!outcome || !outcome.verified) {
    throw new AppError(
      (outcome && outcome.reason) ||
        "Verified guardian consent (AID-08) is required before submitting or verifying this dossier",
      "GUARDIAN_CONSENT_REQUIRED",
      403
    );
  }

  return {
    status: "VERIFIED",
    consentRecordId:
      outcome.consentRecordId && mongoose.isValidObjectId(outcome.consentRecordId)
        ? outcome.consentRecordId
        : null,
    guardianUserId:
      outcome.guardianUserId && mongoose.isValidObjectId(outcome.guardianUserId)
        ? outcome.guardianUserId
        : null,
    checkedAt: new Date(),
    note: assertOptionalText(outcome.note, "consent.note", { max: 300 }),
  };
};

// Strips staff/admin ObjectIds before returning any application or receipt to Student/Public callers
const redactReceiptForStudent = (receipt) => {
  if (!receipt) return null;
  const {
    receivedBy,
    receivedByName,
    reconciledBy,
    trackingKey,
    reconciledItems,
    history,
    ...rest
  } = receipt;

  return {
    ...rest,
    id: rest._id ? rest._id.toString() : rest.id,
    reconciledItems: Array.isArray(reconciledItems)
      ? reconciledItems.map(({ verifiedBy, ...item }) => item)
      : [],
    history: Array.isArray(history)
      ? history.map(({ actorAdminId, ...event }) => event)
      : [],
  };
};

const redactApplicationForStudent = (application) => {
  if (!application) return null;
  const { reviewedBy, dossierVerification, ...rest } = application;
  const redactedVerification = dossierVerification
    ? (() => {
        const { verifiedBy, ...v } = dossierVerification;
        return v;
      })()
    : undefined;

  const result = {
    ...rest,
    ...(redactedVerification ? { dossierVerification: redactedVerification } : {}),
  };

  if (result.guardianInfo) {
    const g = { ...(result.guardianInfo.toObject ? result.guardianInfo.toObject() : result.guardianInfo) };
    if (g.cccdEnc && !g.cccd) {
      try {
        g.cccd = decrypt(g.cccdEnc);
      } catch {
        // fallback
      }
    }
    delete g.cccdEnc;
    delete g.cccdHash;
    result.guardianInfo = g;
  }

  if (result.studentCccdEnc && !result.studentCccd) {
    try {
      result.studentCccd = decrypt(result.studentCccdEnc);
    } catch {
      // fallback
    }
  }
  delete result.studentCccdEnc;
  delete result.studentCccdHash;

  return result;
};

module.exports = {
  DEFAULT_SCHOLARSHIP_CHECKLIST,
  resolveScholarshipChecklist,
  setConsentVerifier,
  resetConsentVerifier,
  getConsentDependencyStatus,
  assertPlainObject,
  assertRequiredText,
  assertOptionalText,
  parseGuardianInfo,
  parseApplicantInfo,
  parseSchoolInfo,
  parseSubmissionMode,
  parseChecklistDefinition,
  parseDossierPolicy,
  evaluateChecklistProgress,
  assertConsentGate,
  redactReceiptForStudent,
  redactApplicationForStudent,
};
