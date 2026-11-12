const mongoose = require("mongoose");
const BankProofRegistry = require("../models/BankProofRegistry");
const Payout = require("../models/Payout");
const RefundCase = require("../models/RefundCase");
const { AppError } = require("../utils/errors");
const { toDec } = require("../utils/money");

const isBlank = (val) => !val || String(val).trim().length === 0;

/**
 * Atomically claim a bank transfer reference number across all outbound financial channels (Payouts and Refunds).
 * Enforces global platform uniqueness via MongoDB unique index on BankProofRegistry.
 */
async function claimBankProof({
  bankReference,
  bankName = "UNKNOWN",
  entityType,
  entityId,
  amount = null,
  accountNumber = null,
  accountHolderName = null,
  adminId,
  session = null,
  isVerified = false,
  now = new Date(),
}) {
  if (isBlank(bankReference)) {
    throw new AppError("Mã tham chiếu ngân hàng là bắt buộc", "BANK_TRANSFER_PROOF_REQUIRED", 400);
  }
  if (!["PAYOUT", "REFUND"].includes(entityType)) {
    throw new AppError("Loại chứng từ ngân hàng không hợp lệ", "INVALID_ENTITY_TYPE", 400);
  }
  if (!entityId) {
    throw new AppError("Entity ID là bắt buộc", "VALIDATION_ERROR", 400);
  }

  const trimmedRef = String(bankReference).trim().toUpperCase();
  const normalizedBankName = String(bankName || "UNKNOWN").trim().toUpperCase();

  // Step 1: Check existing in BankProofRegistry
  const existing = await BankProofRegistry.findOne({ bankReference: trimmedRef }).session(session);
  if (existing) {
    if (String(existing.entityId) !== String(entityId) || existing.entityType !== entityType) {
      throw new AppError(
        `Mã giao dịch ngân hàng ${trimmedRef} đã được sử dụng cho ${existing.entityType} #${existing.entityId}. Không được sử dụng mã trùng.`,
        "DUPLICATE_BANK_REFERENCE",
        400
      );
    }
    // Already claimed for the same entity
    if (isVerified && existing.status !== "VERIFIED") {
      existing.status = "VERIFIED";
      existing.verifiedBy = adminId;
      existing.verifiedAt = now;
      await existing.save({ session });
    }
    return existing;
  }

  // Step 2: Cross-check Payout and RefundCase collections as defense-in-depth
  const [duplicatePayout, duplicateRefund] = await Promise.all([
    Payout.findOne({
      _id: entityType === "PAYOUT" ? { $ne: entityId } : { $exists: true },
      $or: [
        { "bankTransferProof.referenceNumber": trimmedRef },
        { "bankTransferProof.bankReference": trimmedRef },
      ],
      status: { $in: ["AWAITING_BANK_VERIFICATION", "COMPLETED"] },
    }).session(session),
    RefundCase.findOne({
      _id: entityType === "REFUND" ? { $ne: entityId } : { $exists: true },
      $or: [
        { "bankTransferProof.referenceNumber": trimmedRef },
        { "bankTransferProof.bankReference": trimmedRef },
      ],
      status: { $in: ["AWAITING_BANK_VERIFICATION", "COMPLETED"] },
    }).session(session),
  ]);

  if (duplicatePayout) {
    throw new AppError(
      `Mã giao dịch ngân hàng ${trimmedRef} đã được sử dụng cho PAYOUT #${duplicatePayout._id}. Không được sử dụng mã trùng.`,
      "DUPLICATE_BANK_REFERENCE",
      400
    );
  }

  if (duplicateRefund) {
    throw new AppError(
      `Mã giao dịch ngân hàng ${trimmedRef} đã được sử dụng cho REFUND #${duplicateRefund._id}. Không được sử dụng mã trùng.`,
      "DUPLICATE_BANK_REFERENCE",
      400
    );
  }

  // Step 3: Atomic insert into BankProofRegistry (MongoDB unique index protects against concurrent race conditions)
  try {
    const [created] = await BankProofRegistry.create(
      [
        {
          bankReference: trimmedRef,
          bankName: normalizedBankName,
          entityType,
          entityId,
          amount: amount !== null && amount !== undefined ? toDec(amount) : null,
          accountNumber,
          accountHolderName: accountHolderName ? String(accountHolderName).trim().toUpperCase() : null,
          status: isVerified ? "VERIFIED" : "PENDING_VERIFICATION",
          claimedBy: adminId,
          claimedAt: now,
          verifiedBy: isVerified ? adminId : null,
          verifiedAt: isVerified ? now : null,
        },
      ],
      { session }
    );
    return created;
  } catch (err) {
    if (err.code === 11000 || String(err.message).includes("E11000")) {
      throw new AppError(
        `Mã tham chiếu ngân hàng ${trimmedRef} đã tồn tại trong hệ thống (DUPLICATE_BANK_REFERENCE)`,
        "DUPLICATE_BANK_REFERENCE",
        400
      );
    }
    throw err;
  }
}

/**
 * Verify bank proof by independent admin (Four-Eyes Principle).
 */
async function verifyBankProof({
  bankReference,
  entityType,
  entityId,
  verifierAdminId,
  session = null,
  now = new Date(),
}) {
  const trimmedRef = String(bankReference).trim().toUpperCase();
  const proof = await BankProofRegistry.findOne({ bankReference: trimmedRef, entityId }).session(session);
  if (proof) {
    proof.status = "VERIFIED";
    proof.verifiedBy = verifierAdminId;
    proof.verifiedAt = now;
    await proof.save({ session });
    return proof;
  }
  return null;
}

module.exports = {
  claimBankProof,
  verifyBankProof,
};

