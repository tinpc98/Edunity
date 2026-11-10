const mongoose = require("mongoose");
const {
  GRADE_LEVELS,
  GUARDIAN_RELATIONSHIPS,
  DOSSIER_SUBMISSION_MODES,
  CHECKLIST_ITEM_MODES,
} = require("../models/constants");
const { AppError } = require("../utils/errors");
const { validationError, isBlank } = require("../utils/http");

const PHONE_PATTERN = /^[0-9+(). -]{8,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CHECKLIST_CODE_PATTERN = /^[A-Z0-9_-]{2,40}$/;
const ALLOWED_CHECKLIST_DOC_TYPES = ["IDENTITY", "QUALIFICATION", "SCHOLARSHIP_PROOF"];

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

  return {
    fullName,
    relationship,
    phone,
    email,
    occupation: assertOptionalText(raw.occupation, "guardianInfo.occupation", { max: 120 }),
    address: assertOptionalText(raw.address, "guardianInfo.address", { max: 300 }),
    nationalIdLast4,
    householdCircumstance: assertOptionalText(raw.householdCircumstance, "guardianInfo.householdCircumstance", {
      max: 1000,
    }),
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

  return {
    schoolName,
    gradeLevel,
    className,
    studentCode: assertOptionalText(raw.studentCode, "schoolInfo.studentCode", { max: 50 }),
    academicYear: assertOptionalText(raw.academicYear, "schoolInfo.academicYear", { max: 30 }),
    province: assertOptionalText(raw.province, "schoolInfo.province", { max: 100 }),
    district: assertOptionalText(raw.district, "schoolInfo.district", { max: 100 }),
    schoolAddress: assertOptionalText(raw.schoolAddress, "schoolInfo.schoolAddress", { max: 300 }),
  };
};

const parseSubmissionMode = (rawMode, campaign) => {
  const mode = rawMode === undefined || rawMode === null || rawMode === ""
    ? "ONLINE"
    : String(rawMode).trim().toUpperCase();
  if (!DOSSIER_SUBMISSION_MODES.includes(mode)) {
    throw validationError(`submissionMode must be one of ${DOSSIER_SUBMISSION_MODES.join(", ")}`);
  }
  const allowPaper = campaign?.dossierPolicy?.allowPaperDossier !== false;
  if (!allowPaper && (mode === "PAPER" || mode === "HYBRID")) {
    throw new AppError(
      "This campaign does not accept paper dossier submissions",
      "PAPER_DOSSIER_NOT_ALLOWED",
      400
    );
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
    const required = entry.required === undefined ? true : Boolean(entry.required);

    const acceptedMode =
      entry.acceptedMode === undefined || entry.acceptedMode === null
        ? "EITHER"
        : String(entry.acceptedMode).trim().toUpperCase();
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
        const upper = String(dt).trim().toUpperCase();
        if (!ALLOWED_CHECKLIST_DOC_TYPES.includes(upper)) {
          throw validationError(
            `documentChecklist[${idx}].acceptedDocumentTypes contains invalid value: ${upper}`
          );
        }
        return upper;
      });
    }

    const maxFiles = entry.maxFiles === undefined ? 5 : Number(entry.maxFiles);
    if (!Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > 20) {
      throw validationError(`documentChecklist[${idx}].maxFiles must be an integer between 1 and 20`);
    }

    const order = entry.order === undefined ? idx + 1 : Number(entry.order);
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
}) => {
  const checklist = Array.isArray(campaign?.documentChecklist) ? campaign.documentChecklist : [];
  const validOnlineDocs = (onlineDocuments || []).filter((doc) => doc && doc.status !== "REJECTED");

  const docsByCode = new Map();
  for (const doc of validOnlineDocs) {
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
    const hasOnline = docs.length > 0;
    const hasMatchedPaper = Boolean(paperMatch && paperMatch.itemStatus === "MATCHED");
    const mode = item.acceptedMode || "EITHER";

    let satisfied = false;
    if (mode === "ONLINE") satisfied = hasOnline;
    else if (mode === "PAPER") satisfied = hasMatchedPaper;
    else if (mode === "BOTH") satisfied = hasOnline && hasMatchedPaper;
    else satisfied = hasOnline || hasMatchedPaper; // EITHER

    return {
      code,
      title: item.title,
      required: item.required !== false,
      acceptedMode: mode,
      onlineDocumentIds: docs.map((d) => d._id).filter(Boolean),
      paperReceiptId: paperMatch ? paperMatch.receiptId : latestActiveReceipt ? latestActiveReceipt._id : null,
      paperItemStatus: paperMatch ? paperMatch.itemStatus : null,
      satisfied,
    };
  });

  const missingForVerification = progress
    .filter((entry) => entry.required && !entry.satisfied)
    .map((entry) => ({
      code: entry.code,
      title: entry.title,
      acceptedMode: entry.acceptedMode,
      reason:
        entry.acceptedMode === "PAPER"
          ? "RECONCILED_PAPER_ITEM_REQUIRED"
          : entry.acceptedMode === "BOTH"
            ? "ONLINE_AND_PAPER_REQUIRED"
            : "REQUIRED_CHECKLIST_ITEM_MISSING",
    }));

  // Validate compatibility of checklist items with submissionMode at student submission time
  const missingOnSubmit = [];
  for (const entry of progress) {
    if (!entry.required) continue;
    const hasOnline = entry.onlineDocumentIds.length > 0;
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

  if (!mustVerify && !verifier) {
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

  return {
    ...rest,
    ...(redactedVerification ? { dossierVerification: redactedVerification } : {}),
  };
};

module.exports = {
  setConsentVerifier,
  resetConsentVerifier,
  getConsentDependencyStatus,
  assertPlainObject,
  assertRequiredText,
  assertOptionalText,
  parseGuardianInfo,
  parseSchoolInfo,
  parseSubmissionMode,
  parseChecklistDefinition,
  parseDossierPolicy,
  evaluateChecklistProgress,
  assertConsentGate,
  redactReceiptForStudent,
  redactApplicationForStudent,
};
