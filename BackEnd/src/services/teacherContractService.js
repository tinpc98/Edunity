const crypto = require("crypto");
const mongoose = require("mongoose");
const { User, TeacherContract } = require("../models");
const { AppError } = require("../utils/errors");
const { assertId, paged, validationError, isBlank, parseDate } = require("../utils/http");
const { audit } = require("./auditService");
const { notify, notifyAdmins } = require("./notificationService");
const provider = require("./econtractProvider");
const storage = require("./storageService");
const {
  TEMPLATE_VERSION,
  CONTRACT_TYPE,
  CONTRACT_TITLE,
  REVENUE_SHARING_TERMS,
  buildContractSnapshot,
  renderContractHtml,
} = require("./contractTemplateService");
const { generateContractPdf, decodePngDataUrl } = require("./contractPdfService");

const DEFAULT_TERM_MONTHS = 12;
const NOT_DELETED = { isDeleted: { $ne: true } };

const contractNotFound = () => new AppError("Contract not found", "CONTRACT_NOT_FOUND", 404);
const notPending = () => new AppError("Contract is not awaiting signature", "CONTRACT_NOT_PENDING", 409);

const generateContractCode = (now = new Date()) =>
  `HD-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

const generateVerificationCode = (now = new Date()) =>
  `ECV-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

const effectiveStatus = (contract, now = new Date()) =>
  (contract.status === "ACTIVE" || contract.status === "SIGNED") && new Date(contract.expiresAt) <= now
    ? "EXPIRED"
    : contract.status;

const toLifecycleStatus = (status) => {
  switch (status) {
    case "ACTIVE":
    case "SIGNED":
      return "SIGNED";
    case "DECLINED":
    case "REJECTED":
      return "REJECTED";
    case "TERMINATED":
    case "CANCELLED":
      return "CANCELLED";
    case "EXPIRED":
      return "EXPIRED";
    case "DRAFT":
      return "DRAFT";
    default:
      return "PENDING_SIGNATURE";
  }
};

const maskPersonName = (fullName) => {
  if (!fullName || typeof fullName !== "string") return "Giáo viên Edunity";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return `${parts[0].slice(0, 1)}***`;
  return parts
    .map((part, idx) => (idx === 0 || idx === parts.length - 1 ? part : `${part.slice(0, 1)}***`))
    .join(" ");
};

const buildSignedPdfUrl = (pdfMeta) => {
  if (!pdfMeta || !pdfMeta.storageKey) return null;
  const signed = storage.createSignedUrl(pdfMeta.storageKey, { fileName: pdfMeta.fileName });
  return signed ? signed.url : null;
};

// The teacher reads their contract, not which admin issued it or the provider's internal ids
const present = (contract, { audience, includeDetail = false } = {}) => {
  const status = effectiveStatus(contract);
  const lifecycleStatus = toLifecycleStatus(status);
  const initialPdfUrl = buildSignedPdfUrl(contract.initialPdf);
  const signedPdfUrl = buildSignedPdfUrl(contract.signedPdf);
  const currentPdfUrl = signedPdfUrl || initialPdfUrl;

  const view = {
    id: contract._id.toString(),
    contractCode: contract.contractCode,
    verificationCode: contract.verificationCode || contract.contractCode,
    contractType: contract.contractType || CONTRACT_TYPE,
    contractTitle: (contract.snapshot && contract.snapshot.contractTitle) || CONTRACT_TITLE,
    templateVersion: contract.templateVersion || TEMPLATE_VERSION,
    teacherId: contract.teacherId.toString(),
    teacherName:
      (contract.snapshot && contract.snapshot.teacher && contract.snapshot.teacher.fullName) || null,
    teacherEmail:
      (contract.snapshot && contract.snapshot.teacher && contract.snapshot.teacher.email) || null,
    status,
    lifecycleStatus,
    effectiveFrom: contract.effectiveFrom,
    expiresAt: contract.expiresAt,
    sentAt: contract.sentAt,
    viewedAt: contract.viewedAt || null,
    signedAt: contract.signedAt,
    declinedAt: contract.declinedAt,
    terminatedAt: contract.terminatedAt,
    terminationReason: contract.terminationReason,
    provider: contract.provider.name,
    canSign: contract.status === "PENDING_SIGNATURE",
    canSignInSandbox:
      contract.provider.name === "SANDBOX" &&
      contract.status === "PENDING_SIGNATURE" &&
      provider.isSandbox(),
    revenueSharing:
      (contract.snapshot && contract.snapshot.revenueSharing) || { ...REVENUE_SHARING_TERMS },
    documentHash:
      contract.documentHash ||
      (contract.signedPdf && contract.signedPdf.sha256Hash) ||
      (contract.initialPdf && contract.initialPdf.sha256Hash) ||
      null,
    hasInitialPdf: Boolean(contract.initialPdf && contract.initialPdf.storageKey),
    hasSignedPdf: Boolean(contract.signedPdf && contract.signedPdf.storageKey),
    initialPdfUrl,
    signedPdfUrl,
    currentPdfUrl,
    signatureSummary: contract.signature
      ? {
          signerName: contract.signature.signerName,
          signerEmail: contract.signature.signerEmail,
          signingMethod: contract.signature.signingMethod,
          signatureText: contract.signature.signatureText,
          hasSignatureImage: Boolean(contract.signature.signatureDataUrl),
          signedAt: contract.signature.signedAt,
          documentHashAtSigning: contract.signature.documentHashAtSigning,
          finalDocumentHash: contract.signature.finalDocumentHash,
        }
      : null,
  };

  if (includeDetail) {
    view.snapshot = contract.snapshot || null;
    view.renderedHtml = contract.snapshot
      ? renderContractHtml(contract.snapshot, contract.signature, status)
      : null;
    view.initialPdf = contract.initialPdf
      ? {
          fileName: contract.initialPdf.fileName,
          size: contract.initialPdf.size,
          sha256Hash: contract.initialPdf.sha256Hash,
          pageCount: contract.initialPdf.pageCount,
          generatedAt: contract.initialPdf.generatedAt,
          url: initialPdfUrl,
        }
      : null;
    view.signedPdf = contract.signedPdf
      ? {
          fileName: contract.signedPdf.fileName,
          size: contract.signedPdf.size,
          sha256Hash: contract.signedPdf.sha256Hash,
          pageCount: contract.signedPdf.pageCount,
          generatedAt: contract.signedPdf.generatedAt,
          url: signedPdfUrl,
        }
      : null;
    view.auditLogs = (contract.auditLogs || []).map((entry) => ({
      eventType: entry.eventType,
      actorRole: entry.actorRole,
      ...(audience === "ADMIN" ? { actorId: entry.actorId ? entry.actorId.toString() : null } : {}),
      timestamp: entry.timestamp,
      signingMethod: entry.signingMethod || null,
      documentHash: entry.documentHash || null,
      ...(audience === "ADMIN" ? { ipAddress: entry.ipAddress || null, userAgent: entry.userAgent || null } : {}),
      metadata: entry.metadata || null,
    }));
  }

  if (audience === "ADMIN") {
    view.envelopeId = contract.provider.envelopeId;
    view.createdBy = contract.createdBy;
    view.history = contract.history;
  }
  return view;
};

/**
 * Ensures a contract has its snapshot and initial PDF (e.g. if a contract was seeded directly in a test).
 */
const ensureSnapshotAndInitialPdf = async (contract) => {
  let updated = contract;
  let needsUpdate = false;
  const setFields = {};

  if (!updated.verificationCode) {
    setFields.verificationCode = generateVerificationCode(updated.sentAt || new Date());
    needsUpdate = true;
  }

  if (!updated.snapshot) {
    const teacher = await User.findById(updated.teacherId).lean();
    if (teacher) {
      setFields.snapshot = buildContractSnapshot({
        teacher,
        contractCode: updated.contractCode,
        verificationCode: setFields.verificationCode || updated.verificationCode,
        effectiveFrom: updated.effectiveFrom,
        expiresAt: updated.expiresAt,
        createdAt: updated.sentAt || new Date(),
        adminId: updated.createdBy,
      });
      needsUpdate = true;
    }
  }

  const snap = setFields.snapshot || updated.snapshot;
  if (snap && (!updated.initialPdf || !updated.initialPdf.storageKey)) {
    const pdf = await generateContractPdf({
      snapshot: snap,
      status: "PENDING_SIGNATURE",
    });
    const fileName = `${updated.contractCode}-Hop-dong-cong-tac-cho-ky.pdf`;
    const saved = await storage.saveContractPdf(updated.teacherId, pdf.buffer, fileName);
    setFields.initialPdf = {
      ...saved,
      sha256Hash: pdf.sha256Hash,
      pageCount: pdf.pageCount,
      generatedAt: new Date(),
    };
    if (!updated.documentHash) {
      setFields.documentHash = pdf.sha256Hash;
    }
    needsUpdate = true;
  }

  if (needsUpdate) {
    updated =
      (await TeacherContract.findByIdAndUpdate(
        updated._id,
        { $set: setFields },
        { returnDocument: "after" }
      ).lean()) || { ...updated, ...setFields };
  }
  return updated;
};

// ---------- Gate port for classCreationGateService (TEA-12) ----------

/**
 * The contract that decides whether a teacher may open classes: the in-force ACTIVE/SIGNED one with the latest
 * expiry; otherwise the most recent contract (so the gate can say why), or null when there is none.
 */
const verifyContract = async ({ teacherId, now = new Date() }) => {
  const active = await TeacherContract.findOne({
    teacherId,
    status: { $in: ["ACTIVE", "SIGNED"] },
    effectiveFrom: { $lte: now },
    expiresAt: { $gt: now },
  })
    .sort({ expiresAt: -1 })
    .lean();
  const contract = active || (await TeacherContract.findOne({ teacherId }).sort({ createdAt: -1 }).lean());
  if (!contract) return null;

  const isSignedOrActive = contract.status === "ACTIVE" || contract.status === "SIGNED";
  const notYetEffective = isSignedOrActive && contract.effectiveFrom > now;
  return {
    id: contract._id.toString(),
    status: notYetEffective ? "NOT_YET_EFFECTIVE" : isSignedOrActive ? "ACTIVE" : contract.status,
    expiresAt: contract.expiresAt,
  };
};

// ---------- Admin ----------

const adminCreateContract = async (adminId, teacherId, body = {}, reqMeta = {}) => {
  assertId(teacherId, "Teacher not found", "TEACHER_NOT_FOUND");
  const teacher = await User.findOne({ _id: teacherId, role: "TEACHER", ...NOT_DELETED }).lean();
  if (!teacher || !teacher.teacherProfile) throw new AppError("Teacher not found", "TEACHER_NOT_FOUND", 404);
  if (teacher.status !== "ACTIVE") throw new AppError("Teacher account is not active", "ACCOUNT_NOT_ACTIVE", 409);
  if (teacher.teacherProfile.verificationStatus !== "VERIFIED") {
    throw new AppError("Only a verified teacher can be offered a contract", "TEACHER_NOT_VERIFIED", 409);
  }

  const now = new Date();
  const effectiveFrom = parseDate(body.effectiveFrom, "effectiveFrom") || now;
  const expiresAt =
    parseDate(body.expiresAt, "expiresAt") ||
    new Date(new Date(effectiveFrom).setMonth(effectiveFrom.getMonth() + DEFAULT_TERM_MONTHS));
  if (expiresAt <= effectiveFrom) throw validationError("expiresAt must be after effectiveFrom");
  if (expiresAt <= now) throw validationError("expiresAt must be in the future");

  if (await TeacherContract.exists({ teacherId: teacher._id, status: "PENDING_SIGNATURE" })) {
    throw new AppError("This teacher already has a contract awaiting signature", "CONTRACT_ALREADY_PENDING", 409);
  }

  const contractCode = generateContractCode(now);
  const verificationCode = generateVerificationCode(now);

  // Use existing sandbox envelope when in dev/test, or internal eContract envelope in other environments
  let envelope;
  if (provider.getMode()) {
    envelope = await provider.createEnvelope({ contractCode, teacher, effectiveFrom, expiresAt });
  } else {
    envelope = {
      name: "SANDBOX",
      envelopeId: `SBX-${contractCode}-${crypto.randomBytes(4).toString("hex")}`,
    };
  }

  // 1. Build immutable snapshot of Company, Teacher, 90/10 revenue terms and 9 clauses
  const snapshot = buildContractSnapshot({
    teacher,
    contractCode,
    verificationCode,
    effectiveFrom,
    expiresAt,
    createdAt: now,
    adminId,
  });

  // 2. Generate personalized initial PDF and store in private storage
  const pdfResult = await generateContractPdf({
    snapshot,
    status: "PENDING_SIGNATURE",
  });
  const initialFileName = `${contractCode}-Hop-dong-cong-tac-cho-ky.pdf`;
  const savedPdf = await storage.saveContractPdf(teacher._id, pdfResult.buffer, initialFileName);
  const initialPdf = {
    ...savedPdf,
    sha256Hash: pdfResult.sha256Hash,
    pageCount: pdfResult.pageCount,
    generatedAt: now,
  };

  const initialAuditLogs = [
    {
      eventType: "CONTRACT_CREATED",
      actorId: adminId,
      actorRole: "ADMIN",
      timestamp: now,
      ipAddress: reqMeta.ip || null,
      userAgent: reqMeta.userAgent || null,
      documentHash: pdfResult.sha256Hash,
      metadata: {
        contractCode,
        verificationCode,
        templateVersion: TEMPLATE_VERSION,
        teacherSharePercent: REVENUE_SHARING_TERMS.teacherSharePercent,
        platformSharePercent: REVENUE_SHARING_TERMS.platformSharePercent,
      },
    },
    {
      eventType: "CONTRACT_PDF_GENERATED",
      actorId: adminId,
      actorRole: "SYSTEM",
      timestamp: now,
      documentHash: pdfResult.sha256Hash,
      metadata: {
        version: "INITIAL",
        fileName: initialFileName,
        size: pdfResult.size,
        pageCount: pdfResult.pageCount,
      },
    },
    {
      eventType: "CONTRACT_SENT_TO_TEACHER",
      actorId: adminId,
      actorRole: "ADMIN",
      timestamp: now,
      documentHash: pdfResult.sha256Hash,
      metadata: {
        teacherId: teacher._id.toString(),
        note: body.note || null,
      },
    },
  ];

  let contract;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      [contract] = await TeacherContract.create(
        [
          {
            contractCode,
            verificationCode,
            contractType: CONTRACT_TYPE,
            templateVersion: TEMPLATE_VERSION,
            teacherId: teacher._id,
            effectiveFrom,
            expiresAt,
            provider: envelope,
            snapshot,
            initialPdf,
            documentHash: pdfResult.sha256Hash,
            createdBy: adminId,
            sentAt: now,
            history: [
              {
                action: "SENT",
                toStatus: "PENDING_SIGNATURE",
                actorId: adminId,
                actorRole: "ADMIN",
                note: body.note || null,
                at: now,
              },
            ],
            auditLogs: initialAuditLogs,
          },
        ],
        { session }
      );
      await audit(
        {
          actorAdminId: adminId,
          action: "TEACHER_CONTRACT_SENT",
          targetType: "TeacherContract",
          targetId: contract._id,
          afterState: {
            teacherId: teacher._id,
            contractCode,
            verificationCode,
            effectiveFrom,
            expiresAt,
            provider: envelope.name,
            documentHash: pdfResult.sha256Hash,
          },
        },
        session
      );
    });
  } catch (err) {
    if (err && err.code === 11000) {
      throw new AppError("This teacher already has a contract awaiting signature", "CONTRACT_ALREADY_PENDING", 409);
    }
    throw err;
  } finally {
    session.endSession();
  }

  await notify(
    teacher._id,
    "Hợp đồng giảng dạy chờ ký",
    `Hợp đồng cộng tác giảng dạy ${contractCode} đã được khởi tạo. Vui lòng đọc và ký điện tử để kích hoạt quyền mở lớp.`,
    "TEACHER_CONTRACT_SENT",
    { dedupeKey: `contract:${contract._id}:sent` }
  );
  return present(contract.toObject(), { audience: "ADMIN" });
};

/**
 * Idempotent contract creation / repair triggered automatically on Admin Approve Teacher Verification
 * or when Admin clicks "Retry / Khởi tạo lại hợp đồng".
 */
const ensureContractOnVerificationApproved = async (adminId, teacherId, body = {}, reqMeta = {}) => {
  assertId(teacherId, "Teacher not found", "TEACHER_NOT_FOUND");
  const now = new Date();
  const existing = await TeacherContract.findOne({
    teacherId,
    $or: [
      { status: "PENDING_SIGNATURE" },
      { status: { $in: ["ACTIVE", "SIGNED"] }, expiresAt: { $gt: now } },
    ],
  })
    .sort({ createdAt: -1 })
    .lean();

  if (existing) {
    const repaired = await ensureSnapshotAndInitialPdf(existing);
    return {
      outcome: "EXISTING",
      contract: present(repaired, { audience: "ADMIN", includeDetail: true }),
    };
  }

  try {
    const created = await adminCreateContract(
      adminId,
      teacherId,
      {
        ...body,
        note: body.note || "Tự động gửi sau khi duyệt hồ sơ giáo viên",
      },
      reqMeta
    );
    return {
      outcome: "CREATED",
      contract: created,
    };
  } catch (err) {
    if (err && err.code === "CONTRACT_ALREADY_PENDING") {
      const pending = await TeacherContract.findOne({ teacherId, status: "PENDING_SIGNATURE" }).lean();
      if (pending) {
        const repaired = await ensureSnapshotAndInitialPdf(pending);
        return {
          outcome: "EXISTING",
          contract: present(repaired, { audience: "ADMIN", includeDetail: true }),
        };
      }
    }
    throw err;
  }
};

const adminListContracts = async (teacherId) => {
  assertId(teacherId, "Teacher not found", "TEACHER_NOT_FOUND");
  const contracts = await TeacherContract.find({ teacherId }).sort({ createdAt: -1 }).lean();
  const hydrated = await Promise.all(contracts.map((c) => ensureSnapshotAndInitialPdf(c)));
  return hydrated.map((contract) => present(contract, { audience: "ADMIN" }));
};

const adminListAllContracts = async (query = {}, paging = { page: 1, pageSize: 20, skip: 0 }) => {
  const filter = {};
  if (query.teacherId) {
    assertId(query.teacherId, "Teacher not found", "TEACHER_NOT_FOUND");
    filter.teacherId = query.teacherId;
  }
  if (query.status) {
    filter.status = String(query.status).trim().toUpperCase();
  }
  if (query.search && String(query.search).trim()) {
    const regex = new RegExp(String(query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [
      { contractCode: regex },
      { verificationCode: regex },
      { "snapshot.teacher.fullName": regex },
      { "snapshot.teacher.email": regex },
    ];
  }
  const [items, total] = await Promise.all([
    TeacherContract.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    TeacherContract.countDocuments(filter),
  ]);
  return paged(
    items.map((contract) => present(contract, { audience: "ADMIN" })),
    total,
    paging
  );
};

const adminGetContractDetail = async (adminId, contractId) => {
  assertId(contractId, "Contract not found", "CONTRACT_NOT_FOUND");
  const raw = await TeacherContract.findById(contractId).lean();
  if (!raw) throw contractNotFound();
  const contract = await ensureSnapshotAndInitialPdf(raw);
  return present(contract, { audience: "ADMIN", includeDetail: true });
};

// ACTIVE -> TERMINATED, PENDING_SIGNATURE -> CANCELLED. Running classes are not touched here.
const adminEndContract = async (adminId, contractId, body = {}, reqMeta = {}) => {
  assertId(contractId, "Contract not found", "CONTRACT_NOT_FOUND");
  if (isBlank(body.reason)) throw validationError("reason is required");
  const reason = String(body.reason).trim().slice(0, 2000);

  const current = await TeacherContract.findById(contractId).lean();
  if (!current) throw contractNotFound();
  const toStatus = {
    ACTIVE: "TERMINATED",
    SIGNED: "TERMINATED",
    PENDING_SIGNATURE: "CANCELLED",
  }[current.status];
  if (!toStatus) throw new AppError(`A ${current.status} contract cannot be ended`, "CONTRACT_NOT_ENDABLE", 409);

  const now = new Date();
  const auditEventType = toStatus === "TERMINATED" ? "CONTRACT_TERMINATED" : "CONTRACT_CANCELLED";
  let updated;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      updated = await TeacherContract.findOneAndUpdate(
        { _id: current._id, status: current.status },
        {
          $set: { status: toStatus, terminatedAt: now, terminatedBy: adminId, terminationReason: reason },
          $push: {
            history: {
              action: toStatus,
              fromStatus: current.status,
              toStatus,
              actorId: adminId,
              actorRole: "ADMIN",
              note: reason,
              at: now,
            },
            auditLogs: {
              eventType: auditEventType,
              actorId: adminId,
              actorRole: "ADMIN",
              timestamp: now,
              ipAddress: reqMeta.ip || null,
              userAgent: reqMeta.userAgent || null,
              documentHash: current.documentHash || null,
              metadata: { reason, fromStatus: current.status, toStatus },
            },
          },
        },
        { returnDocument: "after", session }
      ).lean();
      if (!updated) throw new AppError("Contract status changed, reload and retry", "CONTRACT_STATUS_CHANGED", 409);
      await audit(
        {
          actorAdminId: adminId,
          action: toStatus === "TERMINATED" ? "TEACHER_CONTRACT_TERMINATED" : "TEACHER_CONTRACT_CANCELLED",
          targetType: "TeacherContract",
          targetId: current._id,
          beforeState: { status: current.status },
          afterState: { status: toStatus, reason },
        },
        session
      );
    });
  } finally {
    session.endSession();
  }

  const title = toStatus === "TERMINATED" ? "Hợp đồng giảng dạy đã chấm dứt" : "Hợp đồng giảng dạy đã bị huỷ";
  await notify(current.teacherId, title, `${current.contractCode}: ${reason}`, `TEACHER_CONTRACT_${toStatus}`);
  return present(updated, { audience: "ADMIN" });
};

// ---------- Signing (internal Teacher eContract signing + provider webhook + sandbox) ----------

/**
 * Core internal helper that finalizes a PENDING_SIGNATURE contract into ACTIVE (lifecycleStatus: SIGNED)
 * or DECLINED (lifecycleStatus: REJECTED), generating the final signed PDF when event === "SIGNED".
 */
const applySigningEvent = async ({
  envelopeId,
  contractId = null,
  event,
  actorId = null,
  actorRole = "ECONTRACT_PROVIDER",
  signatureInput = null,
  reqMeta = {},
}) => {
  const toStatus = event === "SIGNED" ? "ACTIVE" : "DECLINED";
  const query = contractId ? { _id: contractId } : { "provider.envelopeId": envelopeId };
  let contract = await TeacherContract.findOne(query).lean();
  if (!contract) throw contractNotFound();
  if (contract.status === toStatus && actorRole === "ECONTRACT_PROVIDER") return contract;
  if (contract.status !== "PENDING_SIGNATURE") throw notPending();

  contract = await ensureSnapshotAndInitialPdf(contract);
  const now = new Date();

  let signedPdf = null;
  let signatureRecord = null;
  let finalHash = contract.documentHash || (contract.initialPdf && contract.initialPdf.sha256Hash) || null;
  const auditEntries = [];

  if (toStatus === "ACTIVE") {
    const snapTeacher = (contract.snapshot && contract.snapshot.teacher) || {};
    const initialHash = (contract.initialPdf && contract.initialPdf.sha256Hash) || contract.documentHash || null;
    const signingMethod =
      (signatureInput && signatureInput.signingMethod) ||
      (signatureInput && signatureInput.signatureDataUrl
        ? "DRAWN_SIGNATURE"
        : signatureInput && signatureInput.signatureText
          ? "TYPED_SIGNATURE"
          : actorRole === "ECONTRACT_PROVIDER"
            ? "WEBHOOK"
            : "CLICK_TO_SIGN");

    signatureRecord = {
      signerId: actorId || contract.teacherId,
      signerName:
        (signatureInput && signatureInput.signerName) ||
        snapTeacher.fullName ||
        "Giáo viên Edunity",
      signerEmail: (signatureInput && signatureInput.signerEmail) || snapTeacher.email || null,
      signingMethod,
      signatureText:
        (signatureInput && signatureInput.signatureText) ||
        snapTeacher.fullName ||
        null,
      signatureDataUrl: (signatureInput && signatureInput.signatureDataUrl) || null,
      readConfirmed: true,
      agreedToTerms: true,
      ipAddress: reqMeta.ip || null,
      userAgent: reqMeta.userAgent || null,
      signedAt: now,
      documentHashAtSigning: initialHash,
      finalDocumentHash: null,
    };

    const pdfResult = await generateContractPdf({
      snapshot: contract.snapshot,
      status: "SIGNED",
      signature: signatureRecord,
    });
    const signedFileName = `${contract.contractCode}-Hop-dong-cong-tac-da-ky.pdf`;
    const savedSignedPdf = await storage.saveContractPdf(
      contract.teacherId,
      pdfResult.buffer,
      signedFileName
    );
    signedPdf = {
      ...savedSignedPdf,
      sha256Hash: pdfResult.sha256Hash,
      pageCount: pdfResult.pageCount,
      generatedAt: now,
    };
    finalHash = pdfResult.sha256Hash;
    signatureRecord.finalDocumentHash = finalHash;

    auditEntries.push(
      {
        eventType: "CONTRACT_PDF_GENERATED",
        actorId: actorId || contract.teacherId,
        actorRole: "SYSTEM",
        timestamp: now,
        documentHash: finalHash,
        metadata: {
          version: "SIGNED",
          fileName: signedFileName,
          size: pdfResult.size,
          pageCount: pdfResult.pageCount,
        },
      },
      {
        eventType: "CONTRACT_SIGNED",
        actorId: actorId || contract.teacherId,
        actorRole,
        timestamp: now,
        ipAddress: reqMeta.ip || null,
        userAgent: reqMeta.userAgent || null,
        signingMethod,
        documentHash: finalHash,
        metadata: {
          contractCode: contract.contractCode,
          verificationCode: contract.verificationCode,
          initialDocumentHash: initialHash,
          finalDocumentHash: finalHash,
          hasDrawnSignature: Boolean(signatureRecord.signatureDataUrl),
        },
      }
    );
  } else {
    auditEntries.push({
      eventType: "CONTRACT_REJECTED",
      actorId: actorId || contract.teacherId,
      actorRole,
      timestamp: now,
      ipAddress: reqMeta.ip || null,
      userAgent: reqMeta.userAgent || null,
      documentHash: finalHash,
      metadata: {
        reason: (signatureInput && signatureInput.reason) || null,
      },
    });
  }

  const updateFields =
    toStatus === "ACTIVE"
      ? {
          status: toStatus,
          signedAt: now,
          signedPdf,
          documentHash: finalHash,
          signature: signatureRecord,
        }
      : {
          status: toStatus,
          declinedAt: now,
          ...(signatureInput && signatureInput.reason
            ? { terminationReason: String(signatureInput.reason).trim().slice(0, 2000) }
            : {}),
        };

  const updated = await TeacherContract.findOneAndUpdate(
    { _id: contract._id, status: "PENDING_SIGNATURE" },
    {
      $set: updateFields,
      $push: {
        history: {
          action: event,
          fromStatus: "PENDING_SIGNATURE",
          toStatus,
          actorId,
          actorRole,
          note: (signatureInput && signatureInput.reason) || null,
          at: now,
        },
        auditLogs: { $each: auditEntries },
      },
    },
    { returnDocument: "after" }
  ).lean();

  if (!updated) {
    return applySigningEvent({
      envelopeId,
      contractId,
      event,
      actorId,
      actorRole,
      signatureInput,
      reqMeta,
    });
  }

  await audit({
    actorAdminId: null,
    actorType: "SYSTEM",
    action: toStatus === "ACTIVE" ? "CONTRACT_SIGNED" : "CONTRACT_REJECTED",
    targetType: "TeacherContract",
    targetId: contract._id,
    beforeState: { status: "PENDING_SIGNATURE" },
    afterState: {
      status: toStatus,
      lifecycleStatus: toLifecycleStatus(toStatus),
      actorId: actorId ? String(actorId) : null,
      actorRole,
      documentHash: finalHash,
    },
  });

  if (toStatus === "ACTIVE") {
    await notify(
      contract.teacherId,
      "Hợp đồng giảng dạy đã có hiệu lực",
      `Hợp đồng ${contract.contractCode} đã được ký điện tử thành công. Bạn có thể tạo lớp học và gửi duyệt ngay bây giờ.`,
      "TEACHER_CONTRACT_SIGNED",
      { dedupeKey: `contract:${contract._id}:signed` }
    );
    await notifyAdmins(
      "Giáo viên đã ký hợp đồng giảng dạy",
      `Hợp đồng ${contract.contractCode} đã được giáo viên ký xác nhận điện tử.`,
      "TEACHER_CONTRACT_SIGNED"
    );
  } else {
    await notifyAdmins(
      "Giáo viên từ chối ký hợp đồng",
      `Hợp đồng ${contract.contractCode} bị từ chối ký.`,
      "TEACHER_CONTRACT_DECLINED"
    );
  }
  return updated;
};

const handleWebhook = (rawBody, headers) => {
  let event;
  try {
    event = provider.parseWebhook(rawBody, headers);
  } catch {
    throw new AppError("Invalid e-contract webhook", "UNAUTHORIZED", 401);
  }
  return applySigningEvent(event).then(
    () => ({ received: true }),
    (err) => {
      if (err.code === "CONTRACT_NOT_PENDING") return { received: true, ignored: true };
      throw err;
    }
  );
};

// ---------- Teacher ----------

const listMyContracts = async (teacherId) => {
  const contracts = await TeacherContract.find({ teacherId }).sort({ createdAt: -1 }).lean();
  const hydrated = await Promise.all(contracts.map((c) => ensureSnapshotAndInitialPdf(c)));
  return hydrated.map((contract) => present(contract, { audience: "TEACHER" }));
};

const getMyContractDetail = async (teacherId, contractId, reqMeta = {}) => {
  assertId(contractId, "Contract not found", "CONTRACT_NOT_FOUND");
  const raw = await TeacherContract.findOne({ _id: contractId, teacherId }).lean();
  if (!raw) throw contractNotFound();

  const contract = await ensureSnapshotAndInitialPdf(raw);
  const now = new Date();

  const updated =
    (await TeacherContract.findByIdAndUpdate(
      contract._id,
      {
        $set: { viewedAt: contract.viewedAt || now },
        $push: {
          auditLogs: {
            eventType: "CONTRACT_VIEWED",
            actorId: teacherId,
            actorRole: "TEACHER",
            timestamp: now,
            ipAddress: reqMeta.ip || null,
            userAgent: reqMeta.userAgent || null,
            documentHash: contract.documentHash || null,
            metadata: { contractCode: contract.contractCode },
          },
        },
      },
      { returnDocument: "after" }
    ).lean()) || contract;

  return present(updated, { audience: "TEACHER", includeDetail: true });
};

/**
 * Full Teacher eContract Signing endpoint (POST /api/teacher/contracts/:id/sign).
 */
const signMyContract = async (teacherId, contractId, body = {}, reqMeta = {}) => {
  assertId(contractId, "Contract not found", "CONTRACT_NOT_FOUND");
  const contract = await TeacherContract.findOne({ _id: contractId, teacherId }).lean();
  if (!contract) throw contractNotFound();
  if (contract.status !== "PENDING_SIGNATURE") throw notPending();

  if (body.readConfirmed !== true) {
    throw validationError("Vui lòng xác nhận đã đọc toàn bộ nội dung hợp đồng trước khi ký (readConfirmed)");
  }
  if (body.agreedToTerms !== true) {
    throw validationError("Vui lòng đồng ý với các điều khoản hợp đồng trước khi ký (agreedToTerms)");
  }

  let signatureDataUrl = null;
  if (body.signatureDataUrl !== undefined && body.signatureDataUrl !== null && body.signatureDataUrl !== "") {
    if (typeof body.signatureDataUrl !== "string" || body.signatureDataUrl.length > 250000) {
      throw validationError("Chữ ký vẽ không hợp lệ hoặc vượt quá dung lượng cho phép");
    }
    if (!decodePngDataUrl(body.signatureDataUrl)) {
      throw validationError("Định dạng ảnh chữ ký không hợp lệ (chỉ chấp nhận PNG từ khung vẽ chữ ký)");
    }
    signatureDataUrl = body.signatureDataUrl;
  }

  const signatureText =
    typeof body.signatureText === "string" && body.signatureText.trim()
      ? body.signatureText.trim().slice(0, 150)
      : null;

  const allowedMethods = ["DRAWN_SIGNATURE", "TYPED_SIGNATURE", "CLICK_TO_SIGN"];
  const requestedMethod = body.signingMethod ? String(body.signingMethod).trim().toUpperCase() : null;
  if (requestedMethod && !allowedMethods.includes(requestedMethod)) {
    throw validationError(`signingMethod must be one of ${allowedMethods.join(", ")}`);
  }
  const signingMethod =
    requestedMethod ||
    (signatureDataUrl ? "DRAWN_SIGNATURE" : signatureText ? "TYPED_SIGNATURE" : "CLICK_TO_SIGN");

  if (signingMethod === "DRAWN_SIGNATURE" && !signatureDataUrl) {
    throw validationError("Vui lòng vẽ chữ ký vào khung ký trước khi xác nhận");
  }

  const updated = await applySigningEvent({
    contractId: contract._id,
    envelopeId: contract.provider.envelopeId,
    event: "SIGNED",
    actorId: teacherId,
    actorRole: "TEACHER",
    signatureInput: {
      signingMethod,
      signatureDataUrl,
      signatureText,
    },
    reqMeta,
  });

  return present(updated, { audience: "TEACHER", includeDetail: true });
};

const rejectMyContract = async (teacherId, contractId, body = {}, reqMeta = {}) => {
  assertId(contractId, "Contract not found", "CONTRACT_NOT_FOUND");
  const contract = await TeacherContract.findOne({ _id: contractId, teacherId }).lean();
  if (!contract) throw contractNotFound();
  if (contract.status !== "PENDING_SIGNATURE") throw notPending();

  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 2000)
      : null;

  const updated = await applySigningEvent({
    contractId: contract._id,
    envelopeId: contract.provider.envelopeId,
    event: "DECLINED",
    actorId: teacherId,
    actorRole: "TEACHER",
    signatureInput: { reason },
    reqMeta,
  });

  return present(updated, { audience: "TEACHER", includeDetail: true });
};

// Sandbox stand-in for signing on the provider's page. Kept 100% compatible with existing tests.
const sandboxSign = async (teacherId, contractId, body = {}, reqMeta = {}) => {
  if (!provider.isSandbox()) throw new AppError("Not found", "NOT_FOUND", 404);
  assertId(contractId, "Contract not found", "CONTRACT_NOT_FOUND");
  if (!["SIGN", "DECLINE"].includes(body.decision)) throw validationError("decision must be SIGN or DECLINE");

  const contract = await TeacherContract.findOne({ _id: contractId, teacherId }).lean();
  if (!contract || contract.provider.name !== "SANDBOX") throw contractNotFound();
  if (contract.status !== "PENDING_SIGNATURE") throw notPending();

  const event = body.decision === "SIGN" ? "SIGNED" : "DECLINED";
  const updated = await applySigningEvent({
    contractId: contract._id,
    envelopeId: contract.provider.envelopeId,
    event,
    actorId: teacherId,
    actorRole: "TEACHER",
    reqMeta,
  });
  return present(updated, { audience: "TEACHER" });
};

/**
 * Resolves the contract PDF for download/viewing and records CONTRACT_PDF_DOWNLOADED in audit logs.
 */
const getContractPdf = async (actor, contractId, query = {}, reqMeta = {}) => {
  assertId(contractId, "Contract not found", "CONTRACT_NOT_FOUND");
  const raw = await TeacherContract.findById(contractId).lean();
  if (!raw) throw contractNotFound();

  if (actor.role === "TEACHER") {
    if (raw.teacherId.toString() !== actor.id.toString()) {
      throw contractNotFound(); // never reveal another teacher's contract
    }
  } else if (actor.role !== "ADMIN") {
    throw new AppError("Forbidden", "FORBIDDEN", 403);
  }

  const contract = await ensureSnapshotAndInitialPdf(raw);
  const requestedVersion = String(query.version || "latest").toLowerCase();

  let targetPdf;
  let resolvedVersion;
  if (requestedVersion === "initial") {
    targetPdf = contract.initialPdf;
    resolvedVersion = "INITIAL";
  } else if (requestedVersion === "signed") {
    if (!contract.signedPdf || !contract.signedPdf.storageKey) {
      throw new AppError("Signed contract PDF is not available yet", "SIGNED_PDF_NOT_AVAILABLE", 404);
    }
    targetPdf = contract.signedPdf;
    resolvedVersion = "SIGNED";
  } else {
    if (contract.signedPdf && contract.signedPdf.storageKey) {
      targetPdf = contract.signedPdf;
      resolvedVersion = "SIGNED";
    } else {
      targetPdf = contract.initialPdf;
      resolvedVersion = "INITIAL";
    }
  }

  if (!targetPdf || !targetPdf.storageKey) {
    throw new AppError("Contract PDF not found", "CONTRACT_PDF_NOT_FOUND", 404);
  }

  const now = new Date();
  await TeacherContract.updateOne(
    { _id: contract._id },
    {
      $push: {
        auditLogs: {
          eventType: "CONTRACT_PDF_DOWNLOADED",
          actorId: actor.id,
          actorRole: actor.role,
          timestamp: now,
          ipAddress: reqMeta.ip || null,
          userAgent: reqMeta.userAgent || null,
          documentHash: targetPdf.sha256Hash || null,
          metadata: {
            version: resolvedVersion,
            fileName: targetPdf.fileName,
          },
        },
      },
    }
  );

  const signedUrl = storage.createSignedUrl(targetPdf.storageKey, { fileName: targetPdf.fileName });
  const fileData = query.stream === "true" ? await storage.readPrivateFile(targetPdf.storageKey) : null;

  return {
    contractId: contract._id.toString(),
    contractCode: contract.contractCode,
    version: resolvedVersion,
    fileName: targetPdf.fileName,
    mimeType: targetPdf.mimeType || "application/pdf",
    size: targetPdf.size,
    sha256Hash: targetPdf.sha256Hash,
    pageCount: targetPdf.pageCount || 1,
    url: signedUrl ? signedUrl.url : null,
    expiresAt: signedUrl ? signedUrl.expiresAt : null,
    ...(fileData ? { buffer: fileData.buffer } : {}),
  };
};

/**
 * Public / Safe Contract Integrity Verification (Section 9).
 * Never exposes CCCD, address, phone, or email of the Teacher.
 */
const verifyContractPublic = async (code, query = {}) => {
  if (isBlank(code)) throw validationError("Contract or verification code is required");
  const normalizedCode = String(code).trim();
  const raw = await TeacherContract.findOne({
    $or: [{ verificationCode: normalizedCode }, { contractCode: normalizedCode }],
  }).lean();
  if (!raw) throw contractNotFound();

  const contract = await ensureSnapshotAndInitialPdf(raw);
  const status = effectiveStatus(contract);
  const lifecycleStatus = toLifecycleStatus(status);
  const snap = contract.snapshot || {};
  const company = snap.company || {};
  const teacher = snap.teacher || {};

  const currentHash =
    contract.documentHash ||
    (contract.signedPdf && contract.signedPdf.sha256Hash) ||
    (contract.initialPdf && contract.initialPdf.sha256Hash) ||
    null;
  const initialHash = (contract.initialPdf && contract.initialPdf.sha256Hash) || null;
  const signedHash = (contract.signedPdf && contract.signedPdf.sha256Hash) || null;

  const givenHash =
    typeof query.hash === "string" && query.hash.trim()
      ? query.hash.trim().toLowerCase()
      : null;

  let hashMatchResult = null;
  if (givenHash) {
    if (signedHash && givenHash === signedHash.toLowerCase()) {
      hashMatchResult = { matched: true, matchedVersion: "SIGNED" };
    } else if (initialHash && givenHash === initialHash.toLowerCase()) {
      hashMatchResult = { matched: true, matchedVersion: "INITIAL" };
    } else {
      hashMatchResult = { matched: false, matchedVersion: null };
    }
  }

  return {
    contractCode: contract.contractCode,
    verificationCode: contract.verificationCode || contract.contractCode,
    contractType: contract.contractType || CONTRACT_TYPE,
    contractTitle: snap.contractTitle || CONTRACT_TITLE,
    templateVersion: contract.templateVersion || TEMPLATE_VERSION,
    status,
    lifecycleStatus,
    companyName: company.companyName || "Công ty TNHH Edunity",
    companyRepresentative: company.representativeName || "Ông Phạm Công Tin",
    teacherDisplayNameMasked: maskPersonName(teacher.fullName),
    teacherCode: teacher.teacherCode || null,
    createdAt: contract.sentAt,
    effectiveFrom: contract.effectiveFrom,
    expiresAt: contract.expiresAt,
    signedAt: contract.signedAt || null,
    signingMethod: (contract.signature && contract.signature.signingMethod) || null,
    integrity: {
      algorithm: "SHA-256",
      documentHash: currentHash,
      initialDocumentHash: initialHash,
      signedDocumentHash: signedHash,
      hashCheck: hashMatchResult,
      disclaimer:
        "Mã băm SHA-256 dùng để đối chiếu tính toàn vẹn của tệp PDF hợp đồng điện tử nội bộ trên nền tảng Edunity, không phải chứng thư chữ ký số công cộng (CA-certified).",
    },
  };
};

module.exports = {
  verifyContract,
  adminCreateContract,
  ensureContractOnVerificationApproved,
  adminListContracts,
  adminListAllContracts,
  adminGetContractDetail,
  adminEndContract,
  applySigningEvent,
  handleWebhook,
  listMyContracts,
  getMyContractDetail,
  signMyContract,
  rejectMyContract,
  sandboxSign,
  getContractPdf,
  verifyContractPublic,
};
