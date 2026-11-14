const crypto = require("crypto");
const mongoose = require("mongoose");
const { User, TeacherContract } = require("../models");
const { AppError } = require("../utils/errors");
const { assertId, validationError, isBlank, parseDate } = require("../utils/http");
const { audit } = require("./auditService");
const { notify, notifyAdmins } = require("./notificationService");
const provider = require("./econtractProvider");

const DEFAULT_TERM_MONTHS = 12;
const NOT_DELETED = { isDeleted: { $ne: true } };

const contractNotFound = () => new AppError("Contract not found", "CONTRACT_NOT_FOUND", 404);
const notPending = () => new AppError("Contract is not awaiting signature", "CONTRACT_NOT_PENDING", 409);

const generateContractCode = (now) =>
  `HD-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

const effectiveStatus = (contract, now = new Date()) =>
  contract.status === "ACTIVE" && new Date(contract.expiresAt) <= now ? "EXPIRED" : contract.status;

// The teacher reads their contract, not which admin issued it or the provider's internal ids
const present = (contract, { audience }) => {
  const view = {
    id: contract._id.toString(),
    contractCode: contract.contractCode,
    teacherId: contract.teacherId.toString(),
    status: effectiveStatus(contract),
    effectiveFrom: contract.effectiveFrom,
    expiresAt: contract.expiresAt,
    sentAt: contract.sentAt,
    signedAt: contract.signedAt,
    declinedAt: contract.declinedAt,
    terminatedAt: contract.terminatedAt,
    terminationReason: contract.terminationReason,
    provider: contract.provider.name,
    canSignInSandbox: contract.provider.name === "SANDBOX" && contract.status === "PENDING_SIGNATURE" && provider.isSandbox(),
  };
  if (audience === "ADMIN") {
    view.envelopeId = contract.provider.envelopeId;
    view.createdBy = contract.createdBy;
    view.history = contract.history;
  }
  return view;
};

// ---------- Gate port for classCreationGateService (TEA-12) ----------

/**
 * The contract that decides whether a teacher may open classes: the in-force ACTIVE one with the latest
 * expiry; otherwise the most recent contract (so the gate can say why), or null when there is none.
 */
const verifyContract = async ({ teacherId, now = new Date() }) => {
  const active = await TeacherContract.findOne({ teacherId, status: "ACTIVE", effectiveFrom: { $lte: now }, expiresAt: { $gt: now } })
    .sort({ expiresAt: -1 })
    .lean();
  const contract = active || (await TeacherContract.findOne({ teacherId }).sort({ createdAt: -1 }).lean());
  if (!contract) return null;

  const notYetEffective = contract.status === "ACTIVE" && contract.effectiveFrom > now;
  return {
    id: contract._id.toString(),
    status: notYetEffective ? "NOT_YET_EFFECTIVE" : contract.status,
    expiresAt: contract.expiresAt,
  };
};

// ---------- Admin ----------

const adminCreateContract = async (adminId, teacherId, body = {}) => {
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
  const envelope = await provider.createEnvelope({ contractCode, teacher, effectiveFrom, expiresAt });

  let contract;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      [contract] = await TeacherContract.create(
        [
          {
            contractCode,
            teacherId: teacher._id,
            effectiveFrom,
            expiresAt,
            provider: envelope,
            createdBy: adminId,
            sentAt: now,
            history: [{ action: "SENT", toStatus: "PENDING_SIGNATURE", actorId: adminId, actorRole: "ADMIN", note: body.note || null, at: now }],
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
          afterState: { teacherId: teacher._id, contractCode, effectiveFrom, expiresAt, provider: envelope.name },
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

  await notify(teacher._id, "Hợp đồng giảng dạy chờ ký", `Hợp đồng ${contractCode} đã được gửi, vui lòng ký để mở lớp.`, "TEACHER_CONTRACT_SENT");
  return present(contract.toObject(), { audience: "ADMIN" });
};

const adminListContracts = async (teacherId) => {
  assertId(teacherId, "Teacher not found", "TEACHER_NOT_FOUND");
  const contracts = await TeacherContract.find({ teacherId }).sort({ createdAt: -1 }).lean();
  return contracts.map((contract) => present(contract, { audience: "ADMIN" }));
};

// ACTIVE -> TERMINATED, PENDING_SIGNATURE -> CANCELLED. Running classes are not touched here.
const adminEndContract = async (adminId, contractId, body = {}) => {
  assertId(contractId, "Contract not found", "CONTRACT_NOT_FOUND");
  if (isBlank(body.reason)) throw validationError("reason is required");
  const reason = String(body.reason).trim().slice(0, 2000);

  const current = await TeacherContract.findById(contractId).lean();
  if (!current) throw contractNotFound();
  const toStatus = { ACTIVE: "TERMINATED", PENDING_SIGNATURE: "CANCELLED" }[current.status];
  if (!toStatus) throw new AppError(`A ${current.status} contract cannot be ended`, "CONTRACT_NOT_ENDABLE", 409);

  const now = new Date();
  let updated;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      updated = await TeacherContract.findOneAndUpdate(
        { _id: current._id, status: current.status },
        {
          $set: { status: toStatus, terminatedAt: now, terminatedBy: adminId, terminationReason: reason },
          $push: { history: { action: toStatus, fromStatus: current.status, toStatus, actorId: adminId, actorRole: "ADMIN", note: reason, at: now } },
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

// ---------- Signing (provider webhook, or the teacher in sandbox) ----------

/**
 * Applies a provider signing event. Idempotent: a repeated delivery of the same outcome is a no-op,
 * so provider retries are safe. Only a contract still awaiting signature can change.
 */
const applySigningEvent = async ({ envelopeId, event, actorId = null, actorRole = "ECONTRACT_PROVIDER" }) => {
  const toStatus = event === "SIGNED" ? "ACTIVE" : "DECLINED";
  const contract = await TeacherContract.findOne({ "provider.envelopeId": envelopeId }).lean();
  if (!contract) throw contractNotFound();
  if (contract.status === toStatus) return contract;
  if (contract.status !== "PENDING_SIGNATURE") throw notPending();

  const now = new Date();
  const updated = await TeacherContract.findOneAndUpdate(
    { _id: contract._id, status: "PENDING_SIGNATURE" },
    {
      $set: toStatus === "ACTIVE" ? { status: toStatus, signedAt: now } : { status: toStatus, declinedAt: now },
      $push: { history: { action: event, fromStatus: "PENDING_SIGNATURE", toStatus, actorId, actorRole, at: now } },
    },
    { returnDocument: "after" }
  ).lean();
  if (!updated) return applySigningEvent({ envelopeId, event, actorId, actorRole }); // lost a race: re-evaluate

  if (toStatus === "ACTIVE") {
    await notify(contract.teacherId, "Hợp đồng giảng dạy đã có hiệu lực", `Hợp đồng ${contract.contractCode} đã được ký.`, "TEACHER_CONTRACT_SIGNED");
  } else {
    await notifyAdmins("Giáo viên từ chối ký hợp đồng", `Hợp đồng ${contract.contractCode} bị từ chối ký.`, "TEACHER_CONTRACT_DECLINED");
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
      // A late event for a contract already cancelled/terminated changes nothing; acknowledge so the provider stops retrying
      if (err.code === "CONTRACT_NOT_PENDING") return { received: true, ignored: true };
      throw err;
    }
  );
};

// ---------- Teacher ----------

const listMyContracts = async (teacherId) => {
  const contracts = await TeacherContract.find({ teacherId }).sort({ createdAt: -1 }).lean();
  return contracts.map((contract) => present(contract, { audience: "TEACHER" }));
};

// Sandbox stand-in for signing on the provider's page. Does not exist outside sandbox mode.
const sandboxSign = async (teacherId, contractId, body = {}) => {
  if (!provider.isSandbox()) throw new AppError("Not found", "NOT_FOUND", 404);
  assertId(contractId, "Contract not found", "CONTRACT_NOT_FOUND");
  if (!["SIGN", "DECLINE"].includes(body.decision)) throw validationError("decision must be SIGN or DECLINE");

  const contract = await TeacherContract.findOne({ _id: contractId, teacherId }).lean();
  if (!contract || contract.provider.name !== "SANDBOX") throw contractNotFound(); // never reveal others' contracts
  if (contract.status !== "PENDING_SIGNATURE") throw notPending();

  const event = body.decision === "SIGN" ? "SIGNED" : "DECLINED";
  const updated = await applySigningEvent({ envelopeId: contract.provider.envelopeId, event, actorId: teacherId, actorRole: "TEACHER" });
  return present(updated, { audience: "TEACHER" });
};

module.exports = {
  verifyContract,
  adminCreateContract,
  adminListContracts,
  adminEndContract,
  applySigningEvent,
  handleWebhook,
  listMyContracts,
  sandboxSign,
};
