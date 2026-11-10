const crypto = require("crypto");
const mongoose = require("mongoose");
const {
  PaperDossierReceipt,
  ScholarshipApplication,
  ScholarshipCampaign,
  VerificationDocument,
  User,
} = require("../models");
const {
  PAPER_RECEIPT_STATUSES,
  PAPER_RECONCILIATION_ITEM_STATUSES,
} = require("../models/constants");
const { AppError } = require("../utils/errors");
const { paged, validationError, parseDate, escapeRegex, isBlank } = require("../utils/http");
const { audit } = require("./auditService");
const { notify } = require("./notificationService");
const {
  assertPlainObject,
  assertRequiredText,
  assertOptionalText,
  evaluateChecklistProgress,
  redactReceiptForStudent,
} = require("./scholarshipDossierGateService");

const DELIVERY_METHODS = ["POSTAL_MAIL", "COURIER", "IN_PERSON_DROP_OFF"];
const PACKAGE_CONDITIONS = ["INTACT", "DAMAGED", "TORN", "WET", "PARTIAL"];
const PHONE_PATTERN = /^[0-9+(). -]{8,20}$/;
const RECEIPT_CODE_PATTERN = /^[A-Z0-9_-]{4,40}$/;

const ACTIVE_RECEIPT_STATUSES = ["RECEIVED", "IN_RECONCILIATION", "DISCREPANCY", "RECONCILED"];
const MUTABLE_RECEIPT_STATUSES = ["RECEIVED", "IN_RECONCILIATION", "DISCREPANCY"];
const ALLOWED_TRANSITIONS = {
  RECEIVED: ["IN_RECONCILIATION", "DISCREPANCY", "RECONCILED", "REJECTED", "CANCELLED"],
  IN_RECONCILIATION: ["IN_RECONCILIATION", "DISCREPANCY", "RECONCILED", "REJECTED", "CANCELLED"],
  DISCREPANCY: ["IN_RECONCILIATION", "DISCREPANCY", "RECONCILED", "REJECTED", "CANCELLED"],
  RECONCILED: [],
  REJECTED: [],
  CANCELLED: [],
};

const NON_LINKABLE_APP_STATUSES = ["REJECTED", "WITHDRAWN", "APPROVED"];

const receiptNotFound = () => new AppError("Paper dossier receipt not found", "PAPER_RECEIPT_NOT_FOUND", 404);
const applicationNotFound = () => new AppError("Scholarship application not found", "APPLICATION_NOT_FOUND", 404);

const generateReceiptCode = () => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `PDR-${datePart}-${randPart}`;
};

const parsePostalInfo = (raw, receivedAt) => {
  assertPlainObject(raw, "postalInfo");

  const deliveryMethod =
    raw.deliveryMethod === undefined || raw.deliveryMethod === null || raw.deliveryMethod === ""
      ? "POSTAL_MAIL"
      : String(raw.deliveryMethod).trim().toUpperCase();
  if (!DELIVERY_METHODS.includes(deliveryMethod)) {
    throw validationError(`postalInfo.deliveryMethod must be one of ${DELIVERY_METHODS.join(", ")}`);
  }

  const carrierName =
    raw.carrierName !== undefined && raw.carrierName !== null && String(raw.carrierName).trim() !== ""
      ? assertRequiredText(raw.carrierName, "postalInfo.carrierName", { min: 2, max: 100 })
      : deliveryMethod === "IN_PERSON_DROP_OFF"
        ? "DIRECT_DROP_OFF"
        : (() => {
            throw validationError("postalInfo.carrierName is required");
          })();

  let trackingNumber = assertOptionalText(raw.trackingNumber, "postalInfo.trackingNumber", { max: 80 });
  if (trackingNumber) trackingNumber = trackingNumber.toUpperCase();

  if (deliveryMethod === "COURIER" && !trackingNumber) {
    throw validationError("postalInfo.trackingNumber is required for courier deliveries");
  }

  const senderName = assertRequiredText(raw.senderName, "postalInfo.senderName", { min: 2, max: 120 });

  let senderPhone = assertOptionalText(raw.senderPhone, "postalInfo.senderPhone", { max: 20 });
  if (senderPhone) {
    const digits = senderPhone.replace(/\D/g, "");
    if (!PHONE_PATTERN.test(senderPhone) || digits.length < 8 || digits.length > 15) {
      throw validationError("postalInfo.senderPhone is not a valid phone number");
    }
  }

  const senderAddress = assertOptionalText(raw.senderAddress, "postalInfo.senderAddress", { max: 300 });
  const sentAt = parseDate(raw.sentAt, "postalInfo.sentAt");
  const postmarkDate = parseDate(raw.postmarkDate, "postalInfo.postmarkDate");

  if (deliveryMethod === "POSTAL_MAIL" && !trackingNumber && !sentAt && !postmarkDate) {
    throw validationError("Postal receipt requires trackingNumber, sentAt, or postmarkDate");
  }
  if (sentAt && receivedAt && sentAt > receivedAt) {
    throw validationError("postalInfo.sentAt cannot be after receivedAt");
  }

  const envelopeSealed = raw.envelopeSealed === undefined ? true : Boolean(raw.envelopeSealed);
  const packageCondition =
    raw.packageCondition === undefined || raw.packageCondition === null || raw.packageCondition === ""
      ? "INTACT"
      : String(raw.packageCondition).trim().toUpperCase();
  if (!PACKAGE_CONDITIONS.includes(packageCondition)) {
    throw validationError(`postalInfo.packageCondition must be one of ${PACKAGE_CONDITIONS.join(", ")}`);
  }

  const trackingKey = trackingNumber ? `${carrierName.trim().toUpperCase()}::${trackingNumber}` : null;

  return {
    postalInfo: {
      deliveryMethod,
      carrierName,
      trackingNumber,
      senderName,
      senderPhone,
      senderAddress,
      sentAt,
      postmarkDate,
      envelopeSealed,
      packageCondition,
    },
    trackingKey,
  };
};

const resolveTargetApplication = async ({ applicationId, applicationCode, campaignId, studentId }) => {
  let appById = null;
  let appByCode = null;

  if (applicationId !== undefined && applicationId !== null && applicationId !== "") {
    if (!mongoose.isValidObjectId(applicationId)) throw applicationNotFound();
    appById = await ScholarshipApplication.findById(applicationId);
    if (!appById) throw applicationNotFound();
  }

  let normalizedCode = null;
  if (applicationCode !== undefined && applicationCode !== null && String(applicationCode).trim() !== "") {
    normalizedCode = String(applicationCode).trim().toUpperCase();
    appByCode = await ScholarshipApplication.findOne({ applicationCode: normalizedCode });
    if (!appByCode) throw applicationNotFound();
  }

  if (appById && appByCode && appById._id.toString() !== appByCode._id.toString()) {
    throw new AppError(
      "applicationId and applicationCode do not point to the same scholarship application",
      "APPLICATION_LINK_MISMATCH",
      409
    );
  }

  const application = appById || appByCode;
  if (!application) return null;

  if (campaignId && String(application.campaignId) !== String(campaignId)) {
    throw new AppError(
      "Application does not belong to the specified campaign",
      "APPLICATION_LINK_MISMATCH",
      409
    );
  }
  if (studentId && String(application.studentId) !== String(studentId)) {
    throw new AppError(
      "Application does not belong to the specified student",
      "APPLICATION_LINK_MISMATCH",
      409
    );
  }

  if (NON_LINKABLE_APP_STATUSES.includes(application.status)) {
    throw new AppError(
      `Cannot link paper dossier to an application in status ${application.status}`,
      "APPLICATION_NOT_ACCEPTING_PAPER",
      409
    );
  }

  const campaign = await ScholarshipCampaign.findOne({
    _id: application.campaignId,
    isDeleted: { $ne: true },
  }).lean();
  if (!campaign) throw new AppError("Campaign not found", "CAMPAIGN_NOT_FOUND", 404);
  if (campaign.dossierPolicy && campaign.dossierPolicy.allowPaperDossier === false) {
    throw new AppError("Campaign does not accept paper dossier submissions", "PAPER_DOSSIER_NOT_ALLOWED", 400);
  }

  return { application, campaign, normalizedCode };
};

const mapDuplicateKeyError = (err) => {
  if (!err || err.code !== 11000) return err;
  const pattern = JSON.stringify(err.keyPattern || err.keyValue || err.message || "");
  if (pattern.includes("trackingKey") || pattern.includes("trackingNumber")) {
    return new AppError(
      "An active paper dossier receipt with this tracking number already exists",
      "DUPLICATE_TRACKING_NUMBER",
      409
    );
  }
  if (pattern.includes("receiptCode")) {
    return new AppError("Paper dossier receiptCode already exists", "DUPLICATE_RECEIPT_CODE", 409);
  }
  if (pattern.includes("applicationId")) {
    return new AppError(
      "This scholarship application already has an active paper dossier receipt",
      "DUPLICATE_PAPER_RECEIPT",
      409
    );
  }
  return new AppError("Duplicate paper dossier receipt conflict", "DUPLICATE_PAPER_RECEIPT", 409);
};

const syncApplicationChecklistProgress = async (applicationId, session = null) => {
  const application = await ScholarshipApplication.findById(applicationId).session(session);
  if (!application) return null;

  const campaign = await ScholarshipCampaign.findById(application.campaignId).session(session).lean();
  const onlineDocuments = await VerificationDocument.find({ applicationId: application._id }).session(session).lean();
  const paperReceipts = await PaperDossierReceipt.find({ applicationId: application._id })
    .sort({ receivedAt: -1 })
    .session(session)
    .lean();
  if (!campaign) return application;

  const evaluated = evaluateChecklistProgress({
    campaign,
    submissionMode: application.submissionMode || "ONLINE",
    onlineDocuments,
    paperReceipts,
  });

  const latestActive = paperReceipts.find((r) => ACTIVE_RECEIPT_STATUSES.includes(r.status)) || null;
  application.checklistProgress = evaluated.progress;
  application.latestPaperReceiptId = latestActive ? latestActive._id : null;
  await application.save({ session });
  return application;
};

const intakePaperDossier = async (adminId, body) => {
  const adminUser = await User.findById(adminId).select("email").lean();
  if (!adminUser) throw new AppError("Admin user not found", "USER_NOT_FOUND", 404);

  const receivedAt = parseDate(body.receivedAt, "receivedAt") || new Date();
  if (receivedAt.getTime() > Date.now() + 5 * 60 * 1000) {
    throw validationError("receivedAt cannot be in the future");
  }

  let receiptCode = generateReceiptCode();
  if (body.receiptCode !== undefined && body.receiptCode !== null && String(body.receiptCode).trim() !== "") {
    if (typeof body.receiptCode !== "string") throw validationError("receiptCode must be a string");
    receiptCode = body.receiptCode.trim().toUpperCase();
    if (!RECEIPT_CODE_PATTERN.test(receiptCode)) {
      throw validationError(`receiptCode must match ${RECEIPT_CODE_PATTERN.toString()}`);
    }
  }

  const { postalInfo, trackingKey } = parsePostalInfo(body.postalInfo, receivedAt);
  const receivingLocation =
    assertOptionalText(body.receivingLocation, "receivingLocation", { max: 200 }) || "Central Admission Office";
  const intakeNote = assertOptionalText(body.intakeNote, "intakeNote", { max: 1000 });

  if (body.campaignId !== undefined && body.campaignId !== null && !mongoose.isValidObjectId(body.campaignId)) {
    throw validationError("campaignId is invalid");
  }
  if (body.studentId !== undefined && body.studentId !== null && !mongoose.isValidObjectId(body.studentId)) {
    throw validationError("studentId is invalid");
  }

  const resolved = await resolveTargetApplication({
    applicationId: body.applicationId,
    applicationCode: body.applicationCode,
    campaignId: body.campaignId,
    studentId: body.studentId,
  });

  if (resolved) {
    const existingActive = await PaperDossierReceipt.findOne({
      applicationId: resolved.application._id,
      status: { $in: ACTIVE_RECEIPT_STATUSES },
    }).lean();
    if (existingActive) {
      throw Object.assign(
        new AppError(
          "This scholarship application already has an active paper dossier receipt",
          "DUPLICATE_PAPER_RECEIPT",
          409
        ),
        { details: { existingReceiptId: existingActive._id.toString(), receiptCode: existingActive.receiptCode } }
      );
    }
  } else {
    // Allow unlinked mailroom receipt when declaredApplicationCode or explicit unlinked intake
    if (body.declaredApplicationCode !== undefined && typeof body.declaredApplicationCode !== "string") {
      throw validationError("declaredApplicationCode must be a string");
    }
  }

  const declaredApplicationCode = resolved
    ? resolved.application.applicationCode || null
    : assertOptionalText(body.declaredApplicationCode, "declaredApplicationCode", { max: 40 })?.toUpperCase() || null;

  const session = await mongoose.startSession();
  let created;
  try {
    await session.withTransaction(async () => {
      const [doc] = await PaperDossierReceipt.create(
        [
          {
            receiptCode,
            applicationId: resolved ? resolved.application._id : null,
            declaredApplicationCode,
            campaignId: resolved ? resolved.application.campaignId : body.campaignId || null,
            studentId: resolved ? resolved.application.studentId : body.studentId || null,
            postalInfo,
            trackingKey,
            receivedBy: adminId,
            receivedByName: adminUser.email,
            receivedAt,
            receivingLocation,
            intakeNote,
            status: "RECEIVED",
            history: [
              {
                action: "RECEIPT_LOGGED",
                actorAdminId: adminId,
                fromStatus: null,
                toStatus: "RECEIVED",
                note: intakeNote,
                metadata: {
                  receiptCode,
                  trackingNumber: postalInfo.trackingNumber,
                  linkedAtIntake: Boolean(resolved),
                },
                recordedAt: new Date(),
              },
            ],
          },
        ],
        { session }
      );
      created = doc;

      if (resolved) {
        await syncApplicationChecklistProgress(resolved.application._id, session);
      }

      await audit(
        {
          actorAdminId: adminId,
          action: "PAPER_DOSSIER_RECEIVED",
          targetType: "PaperDossierReceipt",
          targetId: created._id,
          beforeState: null,
          afterState: {
            receiptCode: created.receiptCode,
            status: created.status,
            applicationId: created.applicationId,
            trackingNumber: postalInfo.trackingNumber,
          },
        },
        session
      );
    });
  } catch (err) {
    throw mapDuplicateKeyError(err);
  } finally {
    session.endSession();
  }

  if (resolved) {
    await notify(
      resolved.application.studentId,
      "Đã tiếp nhận hồ sơ bản giấy",
      `Hồ sơ bản giấy mã biên nhận ${created.receiptCode} đã được tiếp nhận và đang chờ đối chiếu.`,
      "PAPER_DOSSIER_RECEIVED"
    );
  }

  return created.toObject();
};

const linkPaperDossierToApplication = async (adminId, receiptId, body) => {
  if (!mongoose.isValidObjectId(receiptId)) throw receiptNotFound();
  const receipt = await PaperDossierReceipt.findById(receiptId);
  if (!receipt) throw receiptNotFound();

  if (receipt.status !== "RECEIVED") {
    throw new AppError(
      `Cannot link receipt in status ${receipt.status}`,
      "INVALID_PAPER_RECEIPT_STATUS",
      409
    );
  }

  if (!body.applicationId && isBlank(body.applicationCode)) {
    throw validationError("applicationId or applicationCode is required to link receipt");
  }

  const resolved = await resolveTargetApplication({
    applicationId: body.applicationId,
    applicationCode: body.applicationCode,
    campaignId: body.campaignId || receipt.campaignId,
    studentId: body.studentId || receipt.studentId,
  });
  if (!resolved) throw applicationNotFound();

  if (receipt.applicationId && receipt.applicationId.toString() !== resolved.application._id.toString()) {
    throw new AppError(
      "This receipt is already linked to a different scholarship application",
      "PAPER_RECEIPT_ALREADY_LINKED",
      409
    );
  }

  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      updated = await PaperDossierReceipt.findOneAndUpdate(
        {
          _id: receipt._id,
          status: "RECEIVED",
          $or: [{ applicationId: null }, { applicationId: resolved.application._id }],
        },
        {
          $set: {
            applicationId: resolved.application._id,
            declaredApplicationCode: resolved.application.applicationCode || receipt.declaredApplicationCode,
            campaignId: resolved.application.campaignId,
            studentId: resolved.application.studentId,
          },
          $push: {
            history: {
              action: "APPLICATION_LINKED",
              actorAdminId: adminId,
              fromStatus: "RECEIVED",
              toStatus: "RECEIVED",
              note: assertOptionalText(body.note, "note", { max: 500 }),
              metadata: {
                applicationId: resolved.application._id.toString(),
                applicationCode: resolved.application.applicationCode,
              },
              recordedAt: new Date(),
            },
          },
        },
        { returnDocument: "after", session }
      ).lean();

      if (!updated) {
        throw new AppError(
          "Paper dossier receipt cannot be linked in its current state",
          "INVALID_PAPER_RECEIPT_STATUS",
          409
        );
      }

      await syncApplicationChecklistProgress(resolved.application._id, session);

      await audit(
        {
          actorAdminId: adminId,
          action: "PAPER_DOSSIER_LINKED",
          targetType: "PaperDossierReceipt",
          targetId: receipt._id,
          beforeState: { applicationId: receipt.applicationId },
          afterState: {
            applicationId: resolved.application._id,
            applicationCode: resolved.application.applicationCode,
          },
        },
        session
      );
    });
  } catch (err) {
    throw mapDuplicateKeyError(err);
  } finally {
    session.endSession();
  }

  await notify(
    resolved.application.studentId,
    "Hồ sơ bản giấy đã được liên kết",
    `Biên nhận hồ sơ bản giấy ${updated.receiptCode} đã được gắn với hồ sơ ${resolved.application.applicationCode || ""}.`.trim(),
    "PAPER_DOSSIER_LINKED"
  );

  return updated;
};

const parseReconciledItems = (rawItems, campaign, adminId, outcomeStatus) => {
  if (rawItems === undefined || rawItems === null) {
    if (outcomeStatus === "RECONCILED") {
      throw validationError("reconciledItems must be a non-empty array when marking receipt RECONCILED");
    }
    return [];
  }
  if (!Array.isArray(rawItems)) throw validationError("reconciledItems must be an array");
  if (outcomeStatus === "RECONCILED" && rawItems.length === 0) {
    throw validationError("reconciledItems must be a non-empty array when marking receipt RECONCILED");
  }

  const checklist = Array.isArray(campaign?.documentChecklist) ? campaign.documentChecklist : [];
  const checklistByCode = new Map(checklist.map((item) => [item.code.toUpperCase(), item]));
  const seenCodes = new Set();
  const now = new Date();

  const parsed = rawItems.map((entry, idx) => {
    assertPlainObject(entry, `reconciledItems[${idx}]`);
    if (typeof entry.checklistItemCode !== "string" || isBlank(entry.checklistItemCode)) {
      throw validationError(`reconciledItems[${idx}].checklistItemCode is required`);
    }
    const code = entry.checklistItemCode.trim().toUpperCase();
    if (seenCodes.has(code)) {
      throw validationError(`Duplicate checklistItemCode in reconciledItems: ${code}`);
    }
    seenCodes.add(code);

    const def = checklistByCode.get(code);
    if (checklist.length > 0 && !def) {
      throw new AppError(
        `Checklist code "${code}" does not exist in campaign checklist`,
        "INVALID_CHECKLIST_ITEM_CODE",
        400
      );
    }

    if (typeof entry.itemStatus !== "string") {
      throw validationError(`reconciledItems[${idx}].itemStatus is required`);
    }
    const itemStatus = entry.itemStatus.trim().toUpperCase();
    if (!PAPER_RECONCILIATION_ITEM_STATUSES.includes(itemStatus)) {
      throw validationError(
        `reconciledItems[${idx}].itemStatus must be one of ${PAPER_RECONCILIATION_ITEM_STATUSES.join(", ")}`
      );
    }

    const pageCount = entry.pageCount === undefined ? 1 : Number(entry.pageCount);
    if (!Number.isInteger(pageCount) || pageCount < 0 || pageCount > 500) {
      throw validationError(`reconciledItems[${idx}].pageCount must be an integer between 0 and 500`);
    }

    return {
      checklistItemCode: code,
      itemStatus,
      documentTitle: assertOptionalText(entry.documentTitle, `reconciledItems[${idx}].documentTitle`, {
        max: 200,
      }) || (def ? def.title : null),
      pageCount,
      isOriginal: Boolean(entry.isOriginal),
      hasOfficialStamp: Boolean(entry.hasOfficialStamp),
      note: assertOptionalText(entry.note, `reconciledItems[${idx}].note`, { max: 500 }),
      verifiedBy: adminId,
      verifiedAt: now,
    };
  });

  if (outcomeStatus === "RECONCILED") {
    const blockingItems = parsed.filter((item) => ["MISSING", "MISMATCH", "DAMAGED"].includes(item.itemStatus));
    if (blockingItems.length > 0) {
      throw Object.assign(
        new AppError(
          "Cannot mark receipt RECONCILED while items have MISSING, MISMATCH, or DAMAGED status",
          "RECONCILIATION_HAS_UNRESOLVED_ITEMS",
          409
        ),
        { details: { unresolvedCodes: blockingItems.map((i) => i.checklistItemCode) } }
      );
    }

    // Ensure every required PAPER / BOTH checklist item is present as MATCHED
    const itemMap = new Map(parsed.map((item) => [item.checklistItemCode, item]));
    const missingRequiredPaper = checklist
      .filter((def) => def.required !== false && ["PAPER", "BOTH"].includes(def.acceptedMode))
      .filter((def) => {
        const matched = itemMap.get(def.code.toUpperCase());
        return !matched || matched.itemStatus !== "MATCHED";
      })
      .map((def) => def.code);

    if (missingRequiredPaper.length > 0) {
      throw Object.assign(
        new AppError(
          "Required paper checklist items must all be reconciled as MATCHED before marking receipt RECONCILED",
          "PAPER_CHECKLIST_INCOMPLETE",
          409
        ),
        { details: { missingCodes: missingRequiredPaper } }
      );
    }
  }

  return parsed;
};

const reconcilePaperDossier = async (adminId, receiptId, body) => {
  if (!mongoose.isValidObjectId(receiptId)) throw receiptNotFound();
  const receipt = await PaperDossierReceipt.findById(receiptId);
  if (!receipt) throw receiptNotFound();

  if (!receipt.applicationId) {
    throw new AppError(
      "Paper dossier receipt must be linked to a scholarship application before reconciliation",
      "APPLICATION_LINK_REQUIRED",
      409
    );
  }

  const targetStatus =
    body.status === undefined || body.status === null || body.status === ""
      ? "RECONCILED"
      : String(body.status).trim().toUpperCase();

  if (!["IN_RECONCILIATION", "DISCREPANCY", "RECONCILED"].includes(targetStatus)) {
    throw validationError("status for reconciliation must be IN_RECONCILIATION, DISCREPANCY, or RECONCILED");
  }

  const allowedNext = ALLOWED_TRANSITIONS[receipt.status] || [];
  if (!allowedNext.includes(targetStatus)) {
    throw new AppError(
      `Cannot transition paper dossier receipt from ${receipt.status} to ${targetStatus}`,
      "INVALID_PAPER_RECEIPT_STATUS",
      409
    );
  }

  const reconciliationNote = assertOptionalText(body.reconciliationNote || body.note, "reconciliationNote", {
    max: 1000,
  });
  const discrepancyReason = assertOptionalText(body.discrepancyReason, "discrepancyReason", { max: 1000 });
  if (targetStatus === "DISCREPANCY" && !discrepancyReason) {
    throw validationError("discrepancyReason is required when reporting DISCREPANCY");
  }

  const application = await ScholarshipApplication.findById(receipt.applicationId);
  if (!application) throw applicationNotFound();
  if (NON_LINKABLE_APP_STATUSES.includes(application.status)) {
    throw new AppError(
      `Cannot reconcile receipt for an application in status ${application.status}`,
      "APPLICATION_NOT_ACCEPTING_PAPER",
      409
    );
  }

  const campaign = await ScholarshipCampaign.findById(application.campaignId).lean();
  if (!campaign) throw new AppError("Campaign not found", "CAMPAIGN_NOT_FOUND", 404);

  const reconciledItems = parseReconciledItems(
    body.reconciledItems,
    campaign,
    adminId,
    targetStatus
  );

  const actionByStatus = {
    IN_RECONCILIATION: "RECONCILIATION_STARTED",
    RECONCILED: "RECONCILED_MATCHED",
    DISCREPANCY: "DISCREPANCY_REPORTED",
  };

  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      const now = new Date();
      const setUpdate = {
        status: targetStatus,
        reconciliationNote,
        discrepancyReason: targetStatus === "DISCREPANCY" ? discrepancyReason : null,
      };
      if (reconciledItems.length > 0 || targetStatus === "RECONCILED") {
        setUpdate.reconciledItems = reconciledItems;
      }
      if (targetStatus === "RECONCILED" || targetStatus === "DISCREPANCY") {
        setUpdate.reconciledBy = adminId;
        setUpdate.reconciledAt = now;
      }

      updated = await PaperDossierReceipt.findOneAndUpdate(
        { _id: receipt._id, status: receipt.status },
        {
          $set: setUpdate,
          $push: {
            history: {
              action: actionByStatus[targetStatus],
              actorAdminId: adminId,
              fromStatus: receipt.status,
              toStatus: targetStatus,
              note: targetStatus === "DISCREPANCY" ? discrepancyReason : reconciliationNote,
              metadata: {
                reconciledItemCount: setUpdate.reconciledItems ? setUpdate.reconciledItems.length : receipt.reconciledItems.length,
              },
              recordedAt: now,
            },
          },
        },
        { returnDocument: "after", session }
      ).lean();

      if (!updated) {
        throw new AppError(
          "Paper dossier receipt status changed concurrently; please refresh and retry",
          "INVALID_PAPER_RECEIPT_STATUS",
          409
        );
      }

      await syncApplicationChecklistProgress(application._id, session);

      await audit(
        {
          actorAdminId: adminId,
          action: `PAPER_DOSSIER_${targetStatus}`,
          targetType: "PaperDossierReceipt",
          targetId: receipt._id,
          beforeState: { status: receipt.status },
          afterState: {
            status: targetStatus,
            applicationId: application._id,
            reconciledItemCount: updated.reconciledItems.length,
          },
        },
        session
      );
    });
  } finally {
    session.endSession();
  }

  if (targetStatus === "RECONCILED") {
    await notify(
      application.studentId,
      "Đối chiếu hồ sơ bản giấy hoàn tất",
      `Biên nhận ${updated.receiptCode} đã được đối chiếu hợp lệ (chưa phải quyết định cấp quỹ).`,
      "PAPER_DOSSIER_RECONCILED"
    );
  } else if (targetStatus === "DISCREPANCY") {
    await notify(
      application.studentId,
      "Hồ sơ bản giấy có sai lệch cần kiểm tra",
      `Biên nhận ${updated.receiptCode} ghi nhận sai lệch: ${discrepancyReason}`,
      "PAPER_DOSSIER_DISCREPANCY"
    );
  }

  return updated;
};

const closePaperDossierReceipt = async (adminId, receiptId, body, targetStatus) => {
  if (!mongoose.isValidObjectId(receiptId)) throw receiptNotFound();
  const receipt = await PaperDossierReceipt.findById(receiptId);
  if (!receipt) throw receiptNotFound();

  const allowedNext = ALLOWED_TRANSITIONS[receipt.status] || [];
  if (!allowedNext.includes(targetStatus)) {
    throw new AppError(
      `Cannot transition paper dossier receipt from ${receipt.status} to ${targetStatus}`,
      "INVALID_PAPER_RECEIPT_STATUS",
      409
    );
  }

  const reason = assertOptionalText(body.reason || body.reviewNote || body.note, "reason", { max: 1000 });
  if (targetStatus === "REJECTED" && !reason) {
    throw validationError("reason is required when rejecting a paper dossier receipt");
  }

  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      const now = new Date();
      updated = await PaperDossierReceipt.findOneAndUpdate(
        { _id: receipt._id, status: { $in: MUTABLE_RECEIPT_STATUSES } },
        {
          $set: {
            status: targetStatus,
            reconciledBy: adminId,
            reconciledAt: now,
            reconciliationNote: reason,
          },
          $push: {
            history: {
              action: targetStatus === "REJECTED" ? "RECEIPT_REJECTED" : "RECEIPT_CANCELLED",
              actorAdminId: adminId,
              fromStatus: receipt.status,
              toStatus: targetStatus,
              note: reason,
              recordedAt: now,
            },
          },
        },
        { returnDocument: "after", session }
      ).lean();

      if (!updated) {
        throw new AppError(
          "Paper dossier receipt cannot be updated in its current state",
          "INVALID_PAPER_RECEIPT_STATUS",
          409
        );
      }

      if (receipt.applicationId) {
        await syncApplicationChecklistProgress(receipt.applicationId, session);
      }

      await audit(
        {
          actorAdminId: adminId,
          action: `PAPER_DOSSIER_${targetStatus}`,
          targetType: "PaperDossierReceipt",
          targetId: receipt._id,
          beforeState: { status: receipt.status },
          afterState: { status: targetStatus, reason },
        },
        session
      );
    });
  } finally {
    session.endSession();
  }

  if (targetStatus === "REJECTED" && receipt.studentId) {
    await notify(
      receipt.studentId,
      "Hồ sơ bản giấy bị từ chối",
      `Biên nhận ${updated.receiptCode} bị từ chối: ${reason}`,
      "PAPER_DOSSIER_REJECTED"
    );
  }

  return updated;
};

const rejectPaperDossier = (adminId, receiptId, body) =>
  closePaperDossierReceipt(adminId, receiptId, body, "REJECTED");

const cancelPaperDossier = (adminId, receiptId, body) =>
  closePaperDossierReceipt(adminId, receiptId, body, "CANCELLED");

const adminListPaperReceipts = async (query, paging) => {
  const filter = {};
  if (query.status) {
    const statuses = String(query.status)
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (statuses.some((s) => !PAPER_RECEIPT_STATUSES.includes(s))) {
      throw validationError(`status must be one of ${PAPER_RECEIPT_STATUSES.join(", ")}`);
    }
    filter.status = { $in: statuses };
  }
  if (query.campaignId) {
    if (!mongoose.isValidObjectId(query.campaignId)) throw validationError("campaignId is invalid");
    filter.campaignId = query.campaignId;
  }
  if (query.applicationId) {
    if (!mongoose.isValidObjectId(query.applicationId)) throw validationError("applicationId is invalid");
    filter.applicationId = query.applicationId;
  }
  if (query.applicationCode) {
    filter.declaredApplicationCode = String(query.applicationCode).trim().toUpperCase();
  }
  if (query.receiptCode) {
    filter.receiptCode = new RegExp(escapeRegex(String(query.receiptCode).trim().toUpperCase()), "i");
  }
  if (query.trackingNumber) {
    filter["postalInfo.trackingNumber"] = new RegExp(
      escapeRegex(String(query.trackingNumber).trim().toUpperCase()),
      "i"
    );
  }

  const [items, total] = await Promise.all([
    PaperDossierReceipt.find(filter)
      .sort({ receivedAt: -1 })
      .skip(paging.skip)
      .limit(paging.pageSize)
      .populate("applicationId", "applicationCode status submissionMode")
      .populate("studentId", "email studentProfile.fullName")
      .populate("campaignId", "title status")
      .lean(),
    PaperDossierReceipt.countDocuments(filter),
  ]);

  return paged(items, total, paging);
};

const adminGetPaperReceipt = async (receiptId) => {
  if (!mongoose.isValidObjectId(receiptId)) throw receiptNotFound();
  const receipt = await PaperDossierReceipt.findById(receiptId).lean();
  if (!receipt) throw receiptNotFound();

  const [application, student, campaign] = await Promise.all([
    receipt.applicationId
      ? ScholarshipApplication.findById(receipt.applicationId)
          .select("applicationCode status submissionMode schoolInfo submittedAt checklistProgress")
          .lean()
      : null,
    receipt.studentId ? User.findById(receipt.studentId).select("email studentProfile.fullName").lean() : null,
    receipt.campaignId ? ScholarshipCampaign.findById(receipt.campaignId).select("title status documentChecklist").lean() : null,
  ]);

  return {
    ...receipt,
    application,
    student: student
      ? {
          id: student._id.toString(),
          email: student.email,
          fullName: student.studentProfile ? student.studentProfile.fullName : null,
        }
      : null,
    campaign,
  };
};

const studentGetApplicationPaperReceipts = async (studentId, applicationId) => {
  if (!mongoose.isValidObjectId(applicationId)) throw applicationNotFound();
  const application = await ScholarshipApplication.findOne({ _id: applicationId, studentId }).lean();
  if (!application) throw applicationNotFound();

  const receipts = await PaperDossierReceipt.find({ applicationId: application._id })
    .sort({ receivedAt: -1 })
    .lean();

  return receipts.map(redactReceiptForStudent);
};

module.exports = {
  intakePaperDossier,
  linkPaperDossierToApplication,
  reconcilePaperDossier,
  rejectPaperDossier,
  cancelPaperDossier,
  adminListPaperReceipts,
  adminGetPaperReceipt,
  studentGetApplicationPaperReceipts,
  syncApplicationChecklistProgress,
};
