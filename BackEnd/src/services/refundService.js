const mongoose = require("mongoose");
const crypto = require("crypto");
const {
  RefundCase,
  Payment,
  Enrollment,
  Class,
  User,
  Transaction,
  TeacherEarning,
  TeacherSettlement,
  Payout,
  Scholarship,
  ScholarshipUsage,
  ScholarshipCampaign,
  PaymentReconciliation,
  BankTransferEvent,
  SponsorContribution,
} = require("../models");
const { toNum, toDec } = require("../utils/money");
const { AppError } = require("../utils/errors");
const { notify } = require("./notificationService");
const { claimBankProof, verifyBankProof } = require("./bankProofService");

const isBlank = (val) => !val || String(val).trim().length === 0;

const refundCaseNotFound = () =>
  new AppError("Không tìm thấy hồ sơ hoàn tiền", "REFUND_CASE_NOT_FOUND", 404);

const generateCaseNumber = () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `REF-${dateStr}-${rand}`;
};

/**
 * Calculate eligible refund amount for a Payment / Contribution.
 * Distinguishes direct student tuition, MIXED co-payments, and full scholarships.
 */
const calculateEligibleRefundAmount = async (paymentId, enrollmentId) => {
  let payment = null;
  if (paymentId) {
    payment = await Payment.findById(paymentId);
  }

  let enrollment = null;
  if (enrollmentId) {
    enrollment = await Enrollment.findById(enrollmentId);
  } else if (payment && payment.enrollmentId) {
    enrollment = await Enrollment.findById(payment.enrollmentId);
  }

  // Case 1: Full Scholarship enrollment (100% scholarship, 0 direct payment)
  if (enrollment && enrollment.paymentSource === "SCHOLARSHIP") {
    return {
      eligibleAmount: 0,
      originalAmount: 0,
      isFullScholarship: true,
      isMixed: false,
      tuitionAmount: toNum(enrollment.tuitionAmount),
      paidViaPayment: 0,
      paidViaScholarship: toNum(enrollment.amountPaidViaScholarship),
      alreadyRefunded: 0,
    };
  }

  // Case 2: MIXED or DIRECT PAYMENT
  if (payment) {
    if (payment.paymentStatus !== "COMPLETED") {
      return {
        eligibleAmount: 0,
        originalAmount: toNum(payment.amount),
        isFullScholarship: false,
        isMixed: false,
        tuitionAmount: enrollment ? toNum(enrollment.tuitionAmount) : toNum(payment.amount),
        paidViaPayment: 0,
        paidViaScholarship: 0,
        alreadyRefunded: 0,
      };
    }

    const originalAmountNum = toNum(payment.amount);

    // Sum already approved/completed refunds for this payment
    const existingRefunds = await RefundCase.find({
      sourcePaymentId: payment._id,
      status: { $in: ["APPROVED", "PENDING_BANK_TRANSFER", "AWAITING_BANK_VERIFICATION", "COMPLETED"] },
    });

    const alreadyRefunded = existingRefunds.reduce((sum, r) => {
      const amt = r.approvedAmount ? toNum(r.approvedAmount) : toNum(r.eligibleAmount);
      return sum + amt;
    }, 0);

    const eligibleAmount = Math.max(0, originalAmountNum - alreadyRefunded);

    return {
      eligibleAmount,
      originalAmount: originalAmountNum,
      isFullScholarship: false,
      isMixed: enrollment ? enrollment.paymentSource === "MIXED" : false,
      tuitionAmount: enrollment ? toNum(enrollment.tuitionAmount) : originalAmountNum,
      paidViaPayment: originalAmountNum,
      paidViaScholarship: enrollment && enrollment.amountPaidViaScholarship ? toNum(enrollment.amountPaidViaScholarship) : 0,
      alreadyRefunded,
    };
  }

  return { eligibleAmount: 0, originalAmount: 0, alreadyRefunded: 0 };
};

/**
 * Create a new RefundCase in NEEDS_REVIEW.
 * Guarantees idempotency and prevents double creation.
 */
const createRefundCase = async (data = {}, options = {}) => {
  const now = options.now instanceof Date ? options.now : new Date();
  const actorId = options.actorId || null;
  const actorRole = options.actorRole || "SYSTEM";

  const {
    sourcePaymentId,
    relatedContributionId,
    relatedBankEventId,
    relatedReconciliationId,
    relatedEnrollmentId,
    reason,
    reasonDetails,
    beneficiaryBankAccount,
    requestedAmount,
  } = data;

  if (isBlank(reason)) {
    throw new AppError("Lý do hoàn tiền (reason) là bắt buộc", "VALIDATION_ERROR", 400);
  }

  if (
    !beneficiaryBankAccount ||
    isBlank(beneficiaryBankAccount.bankName) ||
    isBlank(beneficiaryBankAccount.accountNumber) ||
    isBlank(beneficiaryBankAccount.accountHolderName)
  ) {
    throw new AppError(
      "Thông tin tài khoản ngân hàng thụ hưởng (bankName, accountNumber, accountHolderName) là bắt buộc",
      "BENEFICIARY_ACCOUNT_REQUIRED",
      400
    );
  }

  let payment = null;
  let contribution = null;
  let recipientUserId = null;
  let purpose = "TUITION";
  let channelKey = "TUITION";

  if (sourcePaymentId) {
    payment = await Payment.findById(sourcePaymentId);
    if (!payment) {
      throw new AppError("Không tìm thấy giao dịch thanh toán gốc", "PAYMENT_NOT_FOUND", 404);
    }
    purpose = payment.purpose || "TUITION";
    channelKey = payment.channelKey || "TUITION";
    recipientUserId = payment.payerUserId;
  } else if (relatedContributionId) {
    contribution = await SponsorContribution.findById(relatedContributionId);
    if (!contribution) {
      throw new AppError("Không tìm thấy khoản tài trợ gốc", "CONTRIBUTION_NOT_FOUND", 404);
    }
    purpose = "DONATION";
    channelKey = "DONATION";
    recipientUserId = contribution.sponsorId;
  } else if (data.recipientUserId) {
    recipientUserId = data.recipientUserId;
    purpose = data.purpose || "TUITION";
    channelKey = data.channelKey || "TUITION";
  } else {
    throw new AppError(
      "Phải cung cấp sourcePaymentId hoặc relatedContributionId hoặc recipientUserId",
      "VALIDATION_ERROR",
      400
    );
  }

  // Calculate eligible amount
  const {
    eligibleAmount,
    originalAmount,
    isFullScholarship,
    alreadyRefunded,
  } = await calculateEligibleRefundAmount(
    sourcePaymentId,
    relatedEnrollmentId || (payment ? payment.enrollmentId : null)
  );

  // BR: Full scholarship cannot be refunded as cash
  if (isFullScholarship) {
    throw new AppError(
      "Học bổng toàn phần không được phép hoàn tiền mặt cho học sinh. Chỉ hoàn nguyên suất học bổng về quỹ.",
      "CASH_REFUND_NOT_PERMITTED",
      400
    );
  }

  // Prevent refunding if payment has 0 eligible amount or was already fully refunded
  if (eligibleAmount <= 0) {
    throw new AppError(
      `Khoản thanh toán đã được hoàn tất hoặc không còn số dư đủ điều kiện hoàn (Đã hoàn: ${alreadyRefunded.toLocaleString("vi-VN")}đ)`,
      "NO_ELIGIBLE_REFUND_AMOUNT",
      400
    );
  }

  // Requested amount validation
  let finalRequested = eligibleAmount;
  if (requestedAmount !== undefined && requestedAmount !== null) {
    const reqNum = toNum(requestedAmount);
    if (reqNum <= 0) {
      throw new AppError("Số tiền hoàn phải lớn hơn 0", "INVALID_AMOUNT", 400);
    }
    if (reqNum > eligibleAmount) {
      throw new AppError(
        `Số tiền yêu cầu (${reqNum.toLocaleString("vi-VN")}đ) vượt quá số tiền đủ điều kiện hoàn (${eligibleAmount.toLocaleString("vi-VN")}đ)`,
        "AMOUNT_EXCEEDS_ELIGIBLE",
        400
      );
    }
    finalRequested = reqNum;
  }

  // Idempotency guard: prevent duplicate active refund case for same sourcePaymentId
  if (sourcePaymentId) {
    const existingActive = await RefundCase.findOne({
      sourcePaymentId,
      status: { $in: ["NEEDS_REVIEW", "IN_REVIEW", "APPROVED", "PENDING_BANK_TRANSFER", "AWAITING_BANK_VERIFICATION"] },
    });
    if (existingActive) {
      return existingActive;
    }
  }

  const caseNumber = generateCaseNumber();

  const refundCase = await RefundCase.create({
    caseNumber,
    purpose,
    channelKey,
    sourcePaymentId: payment ? payment._id : null,
    relatedContributionId: contribution ? contribution._id : null,
    relatedBankEventId: relatedBankEventId || (payment ? payment.relatedBankEventId : null),
    relatedReconciliationId: relatedReconciliationId || null,
    relatedEnrollmentId: relatedEnrollmentId || (payment ? payment.enrollmentId : null),
    recipientUserId,
    beneficiaryBankAccount: {
      bankName: String(beneficiaryBankAccount.bankName).trim(),
      accountNumber: String(beneficiaryBankAccount.accountNumber).trim(),
      accountHolderName: String(beneficiaryBankAccount.accountHolderName).trim().toUpperCase(),
    },
    originalAmount: toDec(originalAmount),
    eligibleAmount: toDec(eligibleAmount),
    approvedAmount: null,
    currency: "VND",
    reason: reason.trim(),
    reasonDetails: reasonDetails ? reasonDetails.trim() : null,
    status: "NEEDS_REVIEW",
    auditLogs: [
      {
        action: "CREATED",
        actorId,
        actorRole,
        note: `Tạo hồ sơ hoàn tiền cho lý do: ${reason}. Số tiền đủ điều kiện: ${eligibleAmount.toLocaleString("vi-VN")}đ`,
        timestamp: now,
      },
    ],
  });

  return refundCase;
};

/**
 * Admin assigns or marks RefundCase as IN_REVIEW.
 */
const reviewRefundCase = async (adminId, refundCaseId, data = {}) => {
  if (!mongoose.isValidObjectId(refundCaseId)) throw refundCaseNotFound();

  const refundCase = await RefundCase.findOneAndUpdate(
    {
      _id: refundCaseId,
      status: { $in: ["NEEDS_REVIEW", "IN_REVIEW"] },
    },
    {
      $set: {
        status: "IN_REVIEW",
        assignedTo: data.assignedTo || adminId,
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
      $push: {
        auditLogs: {
          action: "IN_REVIEW",
          actorId: adminId,
          actorRole: "ADMIN",
          note: data.note || "Tiếp nhận và bắt đầu xem xét hồ sơ hoàn tiền",
          timestamp: new Date(),
        },
      },
    },
    { returnDocument: "after" }
  );

  if (!refundCase) {
    const existing = await RefundCase.findById(refundCaseId);
    if (!existing) throw refundCaseNotFound();
    throw new AppError("Hồ sơ hoàn tiền không ở trạng thái chờ xem xét", "INVALID_STATUS", 400);
  }

  return refundCase;
};

/**
 * Admin approves refund case:
 * - Fixes approved amount (<= eligibleAmount).
 * - Transitions status to APPROVED and PENDING_BANK_TRANSFER.
 * - Creates/attaches Transaction (type: REFUND, status: PENDING) as a payable obligation.
 * - Handles Enrollment cancellation, TeacherEarning adjustments, and Scholarship reverts atomically.
 */
const approveRefundCase = async (adminId, refundCaseId, data = {}, options = {}) => {
  if (!mongoose.isValidObjectId(refundCaseId)) throw refundCaseNotFound();
  const now = options.now instanceof Date ? options.now : new Date();

  const session = await mongoose.startSession();
  let updatedCase;
  try {
    await session.withTransaction(async () => {
      const existing = await RefundCase.findById(refundCaseId).session(session);
      if (!existing) throw refundCaseNotFound();
      if (existing.status !== "NEEDS_REVIEW" && existing.status !== "IN_REVIEW") {
        throw new AppError("Hồ sơ hoàn tiền không ở trạng thái có thể phê duyệt", "INVALID_STATUS", 400);
      }

      const eligibleNum = toNum(existing.eligibleAmount);
      let approvedNum = eligibleNum;
      if (data.approvedAmount !== undefined && data.approvedAmount !== null) {
        const parsed = toNum(data.approvedAmount);
        if (parsed <= 0 || parsed > eligibleNum) {
          throw new AppError(
            `Số tiền duyệt (${parsed.toLocaleString("vi-VN")}đ) không hợp lệ hoặc vượt quá số tiền đủ điều kiện (${eligibleNum.toLocaleString("vi-VN")}đ)`,
            "INVALID_APPROVED_AMOUNT",
            400
          );
        }
        approvedNum = parsed;
      }

      // Step 1: Create or find PENDING REFUND Transaction (Payable obligation)
      let obligationTx = await Transaction.findOne({
        relatedPaymentId: existing.sourcePaymentId,
        transactionType: "REFUND",
        status: "PENDING",
      }).session(session);

      if (!obligationTx) {
        [obligationTx] = await Transaction.create(
          [
            {
              transactionType: "REFUND",
              sourceUserId: adminId,
              destinationUserId: existing.recipientUserId,
              relatedPaymentId: existing.sourcePaymentId,
              relatedEnrollmentId: existing.relatedEnrollmentId,
              amount: toDec(approvedNum),
              status: "PENDING",
            },
          ],
          { session }
        );
      }

      // Step 2: Handle Enrollment & TeacherEarning adjustments if linked
      if (existing.relatedEnrollmentId) {
        const enrollment = await Enrollment.findById(existing.relatedEnrollmentId).session(session);
        if (enrollment) {
          // If enrollment not completed, mark as CANCELLED
          if (enrollment.enrollmentStatus !== "COMPLETED") {
            enrollment.enrollmentStatus = "CANCELLED";
            await enrollment.save({ session });
          }

          // Handle Scholarship Usage revert if MIXED
          if (enrollment.paymentSource === "MIXED") {
            const usages = await ScholarshipUsage.find({
              enrollmentId: enrollment._id,
              isReverted: false,
            }).session(session);

            for (const usage of usages) {
              usage.isReverted = true;
              usage.revertedAt = now;
              await usage.save({ session });

              const revertAmount = usage.amount || usage.appliedAmount;
              const revertNum = toNum(revertAmount);

              // Revert remainingAmount on Scholarship
              if (usage.scholarshipId && revertNum > 0) {
                const sc = await Scholarship.findById(usage.scholarshipId).session(session);
                if (sc) {
                  sc.remainingAmount = toDec(toNum(sc.remainingAmount) + revertNum);
                  await sc.save({ session });

                  const campId = usage.campaignId || sc.campaignId;
                  if (campId) {
                    await ScholarshipCampaign.updateOne(
                      { _id: campId },
                      { $inc: { usedAmount: -revertNum } },
                      { session }
                    );
                  }
                }
              }
            }
          }

          // Handle TeacherEarning: if still PENDING or AVAILABLE, cancel or reduce it
          const earning = await TeacherEarning.findOne({
            enrollmentId: enrollment._id,
          }).session(session);

          if (earning) {
            if (earning.status === "PENDING" || earning.status === "AVAILABLE") {
              earning.status = "CANCELLED";
              earning.settlementBlockers.push(
                `ENROLLMENT_REFUNDED: Khoản ghi danh đã được duyệt hoàn tiền #${existing.caseNumber}`
              );
              if (earning.settlementAuditTrail) {
                earning.settlementAuditTrail.push({
                  action: "REFUND_CANCELLED",
                  note: `Khoản ghi danh đã được duyệt hoàn tiền #${existing.caseNumber}`,
                  timestamp: now,
                });
              }
              await earning.save({ session });

              if (TeacherSettlement) {
                await TeacherSettlement.updateOne(
                  { earningId: earning._id },
                  { $set: { status: "HELD" } },
                  { session }
                );
              }
            } else if (earning.status === "PAID_OUT") {
              // Earning was already paid out: record audit recovery note, DO NOT mutate historical payout
              if (TeacherSettlement) {
                await TeacherSettlement.updateOne(
                  { earningId: earning._id },
                  {
                    $push: {
                      auditLogs: {
                        action: "RECOVERY_REQUIRED",
                        actorId: adminId,
                        note: `Student refund #${existing.caseNumber} approved after earning was already PAID_OUT. Manual deduction/adjustment required.`,
                        timestamp: now,
                      },
                    },
                  },
                  { session }
                );
              }
            }
          }
        }
      }

      // Step 3: Update RefundCase
      updatedCase = await RefundCase.findByIdAndUpdate(
        refundCaseId,
        {
          $set: {
            status: "PENDING_BANK_TRANSFER",
            approvedAmount: toDec(approvedNum),
            approvedBy: adminId,
            approvedAt: now,
            obligationTransactionId: obligationTx._id,
          },
          $push: {
            auditLogs: {
              action: "APPROVED",
              actorId: adminId,
              actorRole: "ADMIN",
              note: `Phê duyệt hoàn tiền: ${approvedNum.toLocaleString("vi-VN")}đ. Chờ chuyển khoản ngân hàng. Ghi chú: ${data.note || "Hợp lệ"}`,
              timestamp: now,
            },
          },
        },
        { session, returnDocument: "after" }
      );
    });
  } finally {
    await session.endSession();
  }

  await notify(
    updatedCase.recipientUserId,
    "Yêu cầu hoàn tiền đã được phê duyệt",
    `Hồ sơ #${updatedCase.caseNumber} đã được phê duyệt số tiền ${toNum(updatedCase.approvedAmount).toLocaleString("vi-VN")}đ và đang chờ ngân hàng chuyển khoản.`,
    "REFUND_APPROVED"
  );

  return updatedCase;
};

/**
 * Admin rejects refund case with mandatory note.
 */
const rejectRefundCase = async (adminId, refundCaseId, data = {}) => {
  if (!mongoose.isValidObjectId(refundCaseId)) throw refundCaseNotFound();
  if (isBlank(data.rejectionNote)) {
    throw new AppError("Lý do từ chối (rejectionNote) là bắt buộc", "REJECTION_NOTE_REQUIRED", 400);
  }

  const refundCase = await RefundCase.findOneAndUpdate(
    {
      _id: refundCaseId,
      status: { $in: ["NEEDS_REVIEW", "IN_REVIEW"] },
    },
    {
      $set: {
        status: "REJECTED",
        rejectionNote: data.rejectionNote.trim(),
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
      $push: {
        auditLogs: {
          action: "REJECTED",
          actorId: adminId,
          actorRole: "ADMIN",
          note: `Từ chối hoàn tiền: ${data.rejectionNote.trim()}`,
          timestamp: new Date(),
        },
      },
    },
    { returnDocument: "after" }
  );

  if (!refundCase) {
    const existing = await RefundCase.findById(refundCaseId);
    if (!existing) throw refundCaseNotFound();
    throw new AppError("Hồ sơ không ở trạng thái có thể từ chối", "INVALID_STATUS", 400);
  }

  await notify(
    refundCase.recipientUserId,
    "Yêu cầu hoàn tiền bị từ chối",
    `Hồ sơ #${refundCase.caseNumber} bị từ chối. Lý do: ${data.rejectionNote.trim()}`,
    "REFUND_REJECTED"
  );

  return refundCase;
};

/**
 * Submit bank transfer evidence for a refund case.
 * Validates reference uniqueness against existing refunds and payouts.
 * Transitions to AWAITING_BANK_VERIFICATION (or COMPLETED if auto-verification allowed).
 */
const submitRefundProof = async (adminId, refundCaseId, proofData = {}, options = {}) => {
  if (!mongoose.isValidObjectId(refundCaseId)) throw refundCaseNotFound();
  const now = options.now instanceof Date ? options.now : new Date();

  const bankReference = proofData.bankReference || proofData.referenceNumber;
  if (isBlank(bankReference)) {
    throw new AppError(
      "Mã tham chiếu ngân hàng (bankReference) là bắt buộc để nộp chứng từ hoàn tiền",
      "BANK_TRANSFER_PROOF_REQUIRED",
      400
    );
  }

  const trimmedRef = String(bankReference).trim();

  // Validate duplicate bank reference against other RefundCases
  const duplicateRefund = await RefundCase.findOne({
    _id: { $ne: refundCaseId },
    $or: [
      { "bankTransferProof.referenceNumber": trimmedRef },
      { "bankTransferProof.bankReference": trimmedRef },
    ],
    status: { $in: ["AWAITING_BANK_VERIFICATION", "COMPLETED"] },
  });
  if (duplicateRefund) {
    throw new AppError(
      `Mã giao dịch ngân hàng ${trimmedRef} đã được sử dụng cho hồ sơ hoàn tiền #${duplicateRefund.caseNumber}. Không được trùng.`,
      "DUPLICATE_BANK_REFERENCE",
      400
    );
  }

  // Validate duplicate bank reference against Payouts
  const duplicatePayout = await Payout.findOne({
    $or: [
      { "bankTransferProof.referenceNumber": trimmedRef },
      { "bankTransferProof.bankReference": trimmedRef },
    ],
    status: { $in: ["AWAITING_BANK_VERIFICATION", "COMPLETED"] },
  });
  if (duplicatePayout) {
    throw new AppError(
      `Mã giao dịch ngân hàng ${trimmedRef} đã được sử dụng cho khoản chi trả #${duplicatePayout._id}. Không được trùng.`,
      "DUPLICATE_BANK_REFERENCE",
      400
    );
  }

  const autoVerify = Boolean(options.autoVerify || proofData.autoVerify);
  const targetStatus = autoVerify ? "COMPLETED" : "AWAITING_BANK_VERIFICATION";

  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      const existing = await RefundCase.findById(refundCaseId).session(session);
      if (!existing) throw refundCaseNotFound();
      if (existing.status !== "PENDING_BANK_TRANSFER" && existing.status !== "APPROVED" && existing.status !== "AWAITING_BANK_VERIFICATION") {
        throw new AppError("Hồ sơ hoàn tiền không ở trạng thái chờ chuyển khoản", "INVALID_STATUS", 400);
      }

      // Claim bankReference in BankProofRegistry across all channels
      await claimBankProof({
        bankReference: trimmedRef,
        bankName: (proofData.beneficiaryBank || existing.beneficiaryBankAccount?.bankName || "UNKNOWN"),
        entityType: "REFUND",
        entityId: refundCaseId,
        amount: existing.approvedAmount || existing.eligibleAmount,
        accountNumber: proofData.beneficiaryAccount || existing.beneficiaryBankAccount?.accountNumber,
        accountHolderName: proofData.beneficiaryName || existing.beneficiaryBankAccount?.accountHolderName,
        adminId,
        session,
        isVerified: autoVerify,
        now,
      });

      updated = await RefundCase.findByIdAndUpdate(
        refundCaseId,
        {
          $set: {
            status: targetStatus,
            bankTransferProof: {
              referenceNumber: trimmedRef,
              bankReference: trimmedRef,
              transferredAt: proofData.transferredAt ? new Date(proofData.transferredAt) : now,
              transferProofImage: proofData.transferProofImage || null,
              submittedBy: adminId,
              submittedAt: now,
              verifiedBy: options.autoVerify ? adminId : null,
              verifiedAt: options.autoVerify ? now : null,
              notes: proofData.notes || "Chứng từ chuyển khoản hoàn tiền đã nộp",
            },
          },
          $push: {
            auditLogs: {
              action: targetStatus === "COMPLETED" ? "PROOF_VERIFIED_COMPLETED" : "PROOF_SUBMITTED",
              actorId: adminId,
              actorRole: "ADMIN",
              note: `Nộp chứng từ hoàn tiền với mã GD: ${trimmedRef}. Trạng thái: ${targetStatus}`,
              timestamp: now,
            },
          },
        },
        { session, returnDocument: "after" }
      );

      // If auto-verified, update Transaction to COMPLETED
      if (autoVerify) {
        if (updated.obligationTransactionId) {
          await Transaction.updateOne(
            { _id: updated.obligationTransactionId },
            { $set: { status: "COMPLETED" } },
            { session }
          );
        } else {
          const [settleTx] = await Transaction.create(
            [
              {
                transactionType: "REFUND",
                sourceUserId: adminId,
                destinationUserId: updated.recipientUserId,
                relatedPaymentId: updated.sourcePaymentId,
                amount: updated.approvedAmount || updated.eligibleAmount,
                status: "COMPLETED",
              },
            ],
            { session }
          );
          updated.settlementTransactionId = settleTx._id;
          await updated.save({ session });
        }

        // If linked to PaymentReconciliation, resolve it
        if (updated.relatedReconciliationId) {
          await PaymentReconciliation.updateOne(
            { _id: updated.relatedReconciliationId },
            {
              $set: {
                status: "RESOLVED_REFUNDED",
                resolvedBy: adminId,
                resolvedAt: now,
                resolutionNote: `Đã hoàn tiền theo hồ sơ #${updated.caseNumber} với mã GD: ${trimmedRef}`,
              },
            },
            { session }
          );
        }
      }
    });
  } finally {
    await session.endSession();
  }

  return updated;
};

/**
 * Independent verification of refund bank proof (Four-Eyes Principle):
 * - Confirms proof against bank statement.
 * - Enforces verifierAdminId !== approvedBy if dual verification required.
 * - Transitions status to COMPLETED.
 * - Updates Transaction to COMPLETED.
 */
const verifyAndCompleteRefund = async (verifierAdminId, refundCaseId, data = {}, options = {}) => {
  if (!mongoose.isValidObjectId(refundCaseId)) throw refundCaseNotFound();
  const now = options.now instanceof Date ? options.now : new Date();

  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      const existing = await RefundCase.findById(refundCaseId).session(session);
      if (!existing) throw refundCaseNotFound();
      if (existing.status === "COMPLETED") {
        updated = existing;
        return;
      }
      if (existing.status !== "AWAITING_BANK_VERIFICATION" && existing.status !== "PENDING_BANK_TRANSFER") {
        throw new AppError("Hồ sơ hoàn tiền không ở trạng thái chờ xác minh ngân hàng", "INVALID_STATUS", 400);
      }

      // Validation of verifier identity & active admin role (PR10 Hardening)
      if (!verifierAdminId || !mongoose.isValidObjectId(verifierAdminId)) {
        throw new AppError("Người xác minh không hợp lệ (INVALID_VERIFIER_IDENTITY)", "INVALID_VERIFIER_IDENTITY", 400);
      }
      const verifier = await User.findById(verifierAdminId).session(session);
      if (!verifier || verifier.role !== "ADMIN" || verifier.status !== "ACTIVE") {
        throw new AppError("Người xác minh phải là Quản trị viên đang hoạt động", "FORBIDDEN_VERIFIER", 403);
      }

      const bankRef = data.bankReference || existing.bankTransferProof.referenceNumber;
      if (!bankRef) {
        throw new AppError("Mã tham chiếu ngân hàng là bắt buộc", "BANK_TRANSFER_PROOF_REQUIRED", 400);
      }

      // Check approver / submitter identity: must not be missing (fail-closed)
      const approverId = existing.approvedBy;
      const submitterId = existing.bankTransferProof && existing.bankTransferProof.submittedBy;

      if (!approverId && !submitterId) {
        throw new AppError(
          "Không xác định được danh tính người phê duyệt hoặc nộp chứng từ (MISSING_APPROVER_IDENTITY). Không thể xác minh.",
          "MISSING_APPROVER_IDENTITY",
          400
        );
      }

      // Four-Eyes check: verifier cannot be the same admin who approved/submitted proof (fail-closed default)
      const shouldEnforceFourEyes =
        options.enforceDifferentAdmin !== undefined
          ? Boolean(options.enforceDifferentAdmin)
          : true;

      if (
        shouldEnforceFourEyes &&
        ((approverId && String(approverId) === String(verifierAdminId)) ||
          (submitterId && String(submitterId) === String(verifierAdminId)))
      ) {
        throw new AppError(
          "Người xác minh chứng từ ngân hàng phải độc lập với người phê duyệt hoàn tiền (Four-Eyes Principle).",
          "DUAL_VERIFICATION_REQUIRED",
          403
        );
      }

      const trimmedRef = String(bankRef).trim();

      await claimBankProof({
        bankReference: trimmedRef,
        bankName: existing.beneficiaryBankAccount?.bankName || "UNKNOWN",
        entityType: "REFUND",
        entityId: refundCaseId,
        amount: existing.approvedAmount || existing.eligibleAmount,
        accountNumber: existing.beneficiaryBankAccount?.accountNumber,
        accountHolderName: existing.beneficiaryBankAccount?.accountHolderName,
        adminId: verifierAdminId,
        session,
        isVerified: true,
        now,
      });

      await verifyBankProof({
        bankReference: trimmedRef,
        entityType: "REFUND",
        entityId: refundCaseId,
        verifierAdminId,
        session,
        now,
      });

      updated = await RefundCase.findByIdAndUpdate(
        refundCaseId,
        {
          $set: {
            status: "COMPLETED",
            "bankTransferProof.verifiedBy": verifierAdminId,
            "bankTransferProof.verifiedAt": now,
            "bankTransferProof.referenceNumber": trimmedRef,
            "bankTransferProof.bankReference": trimmedRef,
          },
          $push: {
            auditLogs: {
              action: "VERIFIED_COMPLETED",
              actorId: verifierAdminId,
              actorRole: "ADMIN",
              note: `Chứng từ ngân hàng đã được xác minh độc lập. Mã GD: ${trimmedRef}`,
              timestamp: now,
            },
          },
        },
        { session, returnDocument: "after" }
      );

      // Complete Transaction
      if (updated.obligationTransactionId) {
        await Transaction.updateOne(
          { _id: updated.obligationTransactionId },
          { $set: { status: "COMPLETED" } },
          { session }
        );
      } else {
        const [settleTx] = await Transaction.create(
          [
            {
              transactionType: "REFUND",
              sourceUserId: verifierAdminId,
              destinationUserId: updated.recipientUserId,
              relatedPaymentId: updated.sourcePaymentId,
              amount: updated.approvedAmount || updated.eligibleAmount,
              status: "COMPLETED",
            },
          ],
          { session }
        );
        updated.settlementTransactionId = settleTx._id;
        await updated.save({ session });
      }

      // If linked to PaymentReconciliation, resolve it
      if (updated.relatedReconciliationId) {
        await PaymentReconciliation.updateOne(
          { _id: updated.relatedReconciliationId },
          {
            $set: {
              status: "RESOLVED_REFUNDED",
              resolvedBy: verifierAdminId,
              resolvedAt: now,
              resolutionNote: `Đã hoàn tiền theo hồ sơ #${updated.caseNumber} với mã GD: ${trimmedRef}`,
            },
          },
          { session }
        );
      }
    });
  } finally {
    await session.endSession();
  }

  await notify(
    updated.recipientUserId,
    "Tiền hoàn đã được chuyển thành công",
    `Khoản hoàn tiền ${toNum(updated.approvedAmount || updated.eligibleAmount).toLocaleString("vi-VN")}đ đã được chuyển vào tài khoản ngân hàng của bạn (Mã GD: ${data.bankReference || updated.bankTransferProof.referenceNumber}).`,
    "REFUND_COMPLETED"
  );

  return updated;
};

/**
 * List refund cases with filtering and pagination.
 */
const listRefundCases = async (query = {}) => {
  const filter = {};
  if (query.status) {
    filter.status = query.status;
  }
  if (query.purpose) {
    filter.purpose = query.purpose;
  }
  if (query.channelKey) {
    filter.channelKey = query.channelKey;
  }
  if (query.recipientUserId) {
    filter.recipientUserId = query.recipientUserId;
  }
  if (query.search) {
    const s = String(query.search).trim();
    filter.$or = [
      { caseNumber: { $regex: s, $options: "i" } },
      { "beneficiaryBankAccount.accountHolderName": { $regex: s, $options: "i" } },
      { "beneficiaryBankAccount.accountNumber": { $regex: s, $options: "i" } },
      { "bankTransferProof.referenceNumber": { $regex: s, $options: "i" } },
    ];
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    RefundCase.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("recipientUserId", "email fullName role")
      .populate("assignedTo", "email fullName")
      .populate("approvedBy", "email fullName")
      .lean(),
    RefundCase.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get refund case by ID.
 */
const getRefundCaseById = async (refundCaseId) => {
  if (!mongoose.isValidObjectId(refundCaseId)) throw refundCaseNotFound();

  const refundCase = await RefundCase.findById(refundCaseId)
    .populate("recipientUserId", "email fullName role")
    .populate("sourcePaymentId")
    .populate("relatedEnrollmentId")
    .populate("relatedClassId")
    .populate("assignedTo", "email fullName")
    .populate("approvedBy", "email fullName")
    .populate("obligationTransactionId")
    .populate("settlementTransactionId")
    .lean();

  if (!refundCase) throw refundCaseNotFound();
  return refundCase;
};

module.exports = {
  createRefundCase,
  reviewRefundCase,
  approveRefundCase,
  rejectRefundCase,
  submitRefundProof,
  verifyAndCompleteRefund,
  listRefundCases,
  getRefundCaseById,
  calculateEligibleRefundAmount,
};

