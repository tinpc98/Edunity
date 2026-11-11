const mongoose = require("mongoose");
const crypto = require("crypto");
const Enrollment = require("../models/Enrollment");
const Class = require("../models/Class");
const Payment = require("../models/Payment");
const SponsorContribution = require("../models/SponsorContribution");
const ScholarshipCampaign = require("../models/ScholarshipCampaign");
const PaymentReconciliation = require("../models/PaymentReconciliation");
const Transaction = require("../models/Transaction");
const TeacherEarning = require("../models/TeacherEarning");
const JobLock = require("../models/JobLock");
const { getSetting, resolveCommissionPolicy } = require("../utils/settings");
const { toNum, toDec, parseAmount } = require("../utils/money");
const { getPendingScholarshipUsages, confirmScholarshipUsage } = require("./settlementService");
const { notify, notifyTeacherOfEnrollment } = require("./notificationService");
const payosService = require("./payosService");
const {
  AppError,
  ENROLLMENT_NOT_FOUND,
  ENROLLMENT_EXPIRED,
  PAYMENT_NOT_FOUND,
  FORBIDDEN,
} = require("../utils/errors");

// Non-overlapping positive safe integer prefixes for TUITION vs DONATION.
// Each channel has a strict upper bound of 99,999,999 sequences so TUITION (100,000,001..199,999,999)
// can NEVER overlap with DONATION (200,000,001..299,999,999).
const ORDER_CODE_BASE = Object.freeze({
  TUITION: 100000000,
  DONATION: 200000000,
});
const MAX_SEQUENCE_PER_CHANNEL = 99999999;

// In-process fallback counter for unit tests running without a live MongoDB connection
const fallbackCounters = {
  TUITION: 0,
  DONATION: 0,
};

// Per-intent in-memory mutex to coalesce concurrent same-instance requests before hitting DB/network
const inflightIntentPromises = new Map();

/**
 * Allocate a globally unique positive safe integer orderCode for the given purpose.
 * Uses an atomic MongoDB sequence stored in JobLock (collection `joblocks`) when connected,
 * with a deterministic fallback when disconnected in mocked unit tests.
 * Enforces a hard upper bound (MAX_SEQUENCE_PER_CHANNEL = 99,999,999) so the TUITION range
 * can never overflow into the DONATION range.
 */
const allocateOrderCode = async (purpose = "TUITION") => {
  const normalizedPurpose = purpose === "DONATION" ? "DONATION" : "TUITION";
  const base = ORDER_CODE_BASE[normalizedPurpose];
  const counterName = `payos_order_seq_${normalizedPurpose}`;

  if (mongoose.connection && mongoose.connection.readyState === 1) {
    let doc;
    try {
      doc = await JobLock.collection.findOneAndUpdate(
        { name: counterName },
        {
          $inc: { seq: 1 },
          $setOnInsert: {
            owner: "payos_order_code_allocator",
            lockedUntil: new Date(0),
            createdAt: new Date(),
          },
          $set: { updatedAt: new Date() },
        },
        { upsert: true, returnDocument: "after" }
      );
    } catch (_) {
      doc = null;
    }

    const value = doc && doc.value ? doc.value : doc;
    const seq = value && Number.isSafeInteger(value.seq) ? value.seq : null;
    if (seq && seq > 0) {
      if (seq > MAX_SEQUENCE_PER_CHANNEL) {
        throw new AppError(
          `Order code sequence exhausted for channel ${normalizedPurpose} (max ${MAX_SEQUENCE_PER_CHANNEL})`,
          "ORDER_CODE_RANGE_EXHAUSTED",
          503
        );
      }
      return base + seq;
    }
  }

  fallbackCounters[normalizedPurpose] += 1;
  const randomTail = (Date.now() % 100000) * 100 + (fallbackCounters[normalizedPurpose] % 100);
  const candidateSeq = randomTail + fallbackCounters[normalizedPurpose];
  if (candidateSeq > MAX_SEQUENCE_PER_CHANNEL) {
    throw new AppError(
      `Order code sequence exhausted for channel ${normalizedPurpose}`,
      "ORDER_CODE_RANGE_EXHAUSTED",
      503
    );
  }
  return base + candidateSeq;
};

/**
 * Compute remaining seconds until expiration (>= 0).
 */
const computeRemainingSeconds = (targetDate, now = new Date()) => {
  if (!targetDate) return 0;
  const dt = targetDate instanceof Date ? targetDate : new Date(targetDate);
  if (Number.isNaN(dt.getTime())) return 0;
  return Math.max(0, Math.floor((dt.getTime() - now.getTime()) / 1000));
};

/**
 * Format a Payment or SponsorContribution document into a unified Payment Intent API payload
 * without exposing any provider secrets.
 */
const formatPaymentIntentResponse = (record, extra = {}) => {
  const obj = record && typeof record.toObject === "function" ? record.toObject() : { ...record };
  const isDonation = obj.purpose === "DONATION" || Boolean(obj.contributionStatus);
  const paymentStatus = obj.paymentStatus || obj.contributionStatus || "PENDING";
  const holdExpiresAt =
    extra.holdExpiresAt !== undefined ? extra.holdExpiresAt : obj.expiredAt || null;
  const expiredAt = obj.expiredAt || holdExpiresAt || null;

  return {
    paymentId: obj._id,
    purpose: isDonation ? "DONATION" : obj.purpose || "TUITION",
    channelKey: obj.channelKey || (isDonation ? "DONATION" : "TUITION"),
    provider: obj.provider || "PAYOS",
    gateway: obj.gateway || "SANDBOX",
    gatewayReference: obj.gatewayReference || obj.paymentReference,
    orderCode: obj.orderCode || null,
    paymentLinkId: obj.paymentLinkId || null,
    qrCode: obj.qrCode || null,
    checkoutUrl: obj.checkoutUrl || null,
    amount: obj.amount,
    currency: obj.currency || "VND",
    expiredAt,
    holdExpiresAt,
    remainingSeconds: computeRemainingSeconds(expiredAt),
    paymentStatus,
    providerStatus: obj.providerStatus || paymentStatus || "PENDING",
    enrollmentId: obj.enrollmentId || null,
    campaignId: obj.campaignId || null,
    contributionId:
      extra.contributionId !== undefined
        ? extra.contributionId
        : isDonation
        ? obj._id
        : obj.contributionId || null,
    isAnonymous: Boolean(obj.isAnonymous),
    ...(extra.extraFields || {}),
  };
};

/**
 * Acquire a short-lived cross-instance lease in MongoDB (`joblocks` collection) before calling
 * an external payment gateway so two backend instances cannot simultaneously create two payOS links
 * for the same intent. Falls back gracefully if DB is not connected (mocked unit tests).
 */
const acquireCrossInstanceIntentLease = async (leaseName, leaseDurationMs = 15000) => {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    return { acquired: true, owner: "in_memory_fallback" };
  }
  const owner = `${process.pid}_${crypto.randomUUID()}`;
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + leaseDurationMs);

  try {
    await JobLock.findOneAndUpdate(
      {
        name: leaseName,
        $or: [{ lockedUntil: { $lte: now } }, { owner }],
      },
      {
        $set: {
          owner,
          lockedUntil,
        },
      },
      { upsert: true, returnDocument: "after" }
    );
    return { acquired: true, owner };
  } catch (err) {
    if (err && err.code === 11000) {
      return { acquired: false, owner: null };
    }
    return { acquired: true, owner };
  }
};

const releaseCrossInstanceIntentLease = async (leaseName, owner) => {
  if (!owner || owner === "in_memory_fallback") return;
  if (!mongoose.connection || mongoose.connection.readyState !== 1) return;
  try {
    await JobLock.deleteOne({ name: leaseName, owner });
  } catch (_) {
    // Ignore cleanup errors; lease has a short TTL
  }
};

/**
 * Helper to coalesce concurrent requests for the same logical key within a single Node process,
 * while DB cross-instance leases and partial unique indexes protect across processes.
 */
const withInflightCoalescing = async (lockKey, fn) => {
  if (inflightIntentPromises.has(lockKey)) {
    return inflightIntentPromises.get(lockKey);
  }
  const promise = (async () => {
    const leaseName = `payment_intent_lease:${lockKey}`;
    const lease = await acquireCrossInstanceIntentLease(leaseName, 15000);
    if (!lease.acquired) {
      // Another instance is currently creating this intent; wait briefly for it to persist
      for (let i = 0; i < 15; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
        const currentLock = await JobLock.findOne({ name: leaseName }).lean().catch(() => null);
        if (!currentLock || new Date(currentLock.lockedUntil) <= new Date()) {
          break;
        }
      }
    }
    try {
      return await fn();
    } finally {
      await releaseCrossInstanceIntentLease(leaseName, lease.owner);
      inflightIntentPromises.delete(lockKey);
    }
  })();
  inflightIntentPromises.set(lockKey, promise);
  return promise;
};

/**
 * Unified TUITION Payment Intent creator (also exported as createSandboxPayment for backward compatibility).
 * - Strictly uses channel TUITION.
 * - Never trusts client-provided amount, channelKey, or bank account.
 * - Rejects FREE classes, expired holds, non-PENDING_PAYMENT enrollments, or zero remaining due.
 * - Reuses active PENDING intent idempotently; expires stale PENDING intents.
 * - Calls payOS outside any MongoDB transaction.
 */
const createTuitionPaymentIntent = async (studentId, enrollmentId) => {
  const purpose = payosService.PAYMENT_PURPOSES.TUITION;
  const channelKey = payosService.resolveChannelForPurpose(purpose);

  // Environment / provider guard before touching DB
  if (!payosService.isPayosEnabled(channelKey) && !payosService.isSandboxFallbackAllowed()) {
    throw new AppError("Cổng thanh toán chưa được kích hoạt.", "PAYMENT_PROVIDER_DISABLED", 503);
  }

  if (!mongoose.isValidObjectId(enrollmentId)) {
    throw ENROLLMENT_NOT_FOUND();
  }

  const lockKey = `TUITION:${String(enrollmentId)}`;
  return withInflightCoalescing(lockKey, async () => {
    const enrollment = await Enrollment.findOne({ _id: enrollmentId, studentId });
    if (!enrollment) {
      throw ENROLLMENT_NOT_FOUND();
    }

    // Reject FREE classes explicitly if paymentSource is FREE or classType is FREE
    if (enrollment.paymentSource === "FREE") {
      throw new AppError("FREE class enrollment does not require payment", "VALIDATION_ERROR", 400);
    }
    if (enrollment.classId && mongoose.connection && mongoose.connection.readyState === 1) {
      const cls = await Class.findById(enrollment.classId).select("classType").lean();
      if (cls && cls.classType === "FREE") {
        throw new AppError("FREE class enrollment does not require payment", "VALIDATION_ERROR", 400);
      }
    }

    const now = new Date();
    if (
      enrollment.enrollmentStatus !== "PENDING_PAYMENT" ||
      !enrollment.holdExpiresAt ||
      enrollment.holdExpiresAt <= now
    ) {
      throw ENROLLMENT_EXPIRED();
    }

    // Check if an active PENDING payment intent already exists for this enrollment
    const existingPayment = await Payment.findOne({
      enrollmentId: enrollment._id,
      paymentStatus: "PENDING",
    });

    if (existingPayment) {
      // Never auto-fail an existing PENDING payment just to bypass the unique index.
      // Return the existing PENDING payment idempotently (and if it lacked a QR due to an interrupted attempt,
      // populate its QR/link fields in-place without changing its PENDING status).
      if (Boolean(existingPayment.qrCode) || existingPayment.orderCode == null) {
        return existingPayment;
      }
    }

    // BR-41 (MIXED): When Enrollment has held ScholarshipUsage, charge only the remaining due;
    // otherwise charge the full Enrollment.tuitionAmount snapshot.
    const { total: scholarshipHeld } = await getPendingScholarshipUsages(enrollment._id);
    const remainingNum =
      scholarshipHeld > 0
        ? toNum(enrollment.tuitionAmount) - scholarshipHeld
        : toNum(enrollment.tuitionAmount);

    if (!Number.isFinite(remainingNum) || remainingNum <= 0) {
      throw new AppError("No remaining tuition amount to pay", "VALIDATION_ERROR", 400);
    }

    const amountDec = toDec(remainingNum);
    const orderCode = await allocateOrderCode(purpose);
    const expiredAt = new Date(enrollment.holdExpiresAt);

    // Call provider adapter OUTSIDE any MongoDB transaction
    const providerResult = await payosService.createPaymentLink({
      purpose,
      channelKey,
      orderCode,
      amount: remainingNum,
      description: `EDUNITY HP ${orderCode}`,
      expiredAt,
    });

    const gatewayReference =
      providerResult.gateway === "PAYOS"
        ? `PAYOS-T-${orderCode}`
        : `SBX-${orderCode}-${crypto.randomUUID()}`;

    const payment = new Payment({
      purpose,
      channelKey,
      enrollmentId: enrollment._id,
      payerUserId: studentId,
      gateway: providerResult.gateway,
      provider: providerResult.provider,
      gatewayReference,
      orderCode: providerResult.orderCode,
      paymentLinkId: providerResult.paymentLinkId,
      qrCode: providerResult.qrCode,
      checkoutUrl: providerResult.checkoutUrl,
      expiredAt: providerResult.expiredAt || expiredAt,
      providerStatus: providerResult.providerStatus || "PENDING",
      providerCreatedAt: providerResult.providerCreatedAt || now,
      providerMetadata: providerResult.providerMetadata || null,
      currency: providerResult.currency || "VND",
      amount: amountDec,
      paymentStatus: "PENDING",
    });

    try {
      await payment.save();
      return payment;
    } catch (saveErr) {
      // Handle race condition across processes hitting the partial unique index { enrollmentId: 1, paymentStatus: "PENDING" }
      if (saveErr && saveErr.code === 11000) {
        const winner = await Payment.findOne({
          enrollmentId: enrollment._id,
          paymentStatus: "PENDING",
        });
        if (winner) {
          return winner;
        }
      }
      throw saveErr;
    }
  });
};

// Keep backward-compatible alias createSandboxPayment
const createSandboxPayment = createTuitionPaymentIntent;

/**
 * Unified DONATION Payment Intent creator for Sponsor Contributions.
 * - Strictly uses channel DONATION.
 * - Validates amount (> 0, safe integer VND).
 * - Links to ScholarshipCampaign and SponsorContribution.
 * - Supports anonymous donor policy (isAnonymous=true hides sponsor identity in public views while keeping internal audit).
 * - Reuses active PENDING intent (< 15 minutes left) when the same sponsor retries with the same campaign, amount, and anonymity.
 * - Never increments campaign.fundedAmount on QR creation.
 */
const createDonationPaymentIntent = async ({
  sponsorId,
  campaign,
  amountInput,
  isAnonymous = false,
  donorDisplayName = null,
}) => {
  const purpose = payosService.PAYMENT_PURPOSES.DONATION;
  const channelKey = payosService.resolveChannelForPurpose(purpose);

  if (!payosService.isPayosEnabled(channelKey) && !payosService.isSandboxFallbackAllowed()) {
    throw new AppError("Cổng thanh toán chưa được kích hoạt.", "PAYMENT_PROVIDER_DISABLED", 503);
  }

  const amountNum = parseAmount(amountInput, "amount");
  const normalizedAnonymous = Boolean(isAnonymous);
  const sanitizedDisplayName =
    typeof donorDisplayName === "string" && donorDisplayName.trim()
      ? donorDisplayName.trim().slice(0, 100)
      : null;

  const lockKey = `DONATION:${String(sponsorId)}:${String(campaign._id)}:${amountNum}:${normalizedAnonymous}`;

  return withInflightCoalescing(lockKey, async () => {
    const now = new Date();
    const amountDec = toDec(amountNum);

    // Check for an existing active, non-expired PENDING donation intent for the same sponsor + campaign + amount + anonymity
    const existingContribution = await SponsorContribution.findOne({
      campaignId: campaign._id,
      sponsorId,
      contributionStatus: "PENDING",
      isAnonymous: normalizedAnonymous,
      expiredAt: { $gt: now },
    }).sort({ createdAt: -1 });

    if (
      existingContribution &&
      toNum(existingContribution.amount) === amountNum &&
      existingContribution.qrCode
    ) {
      return {
        payment: existingContribution,
        contribution: existingContribution,
        reused: true,
      };
    }

    const holdMinutes = parseInt(process.env.SEAT_HOLD_MINUTES, 10) || 15;
    const expiredAt = new Date(now.getTime() + holdMinutes * 60 * 1000);
    const orderCode = await allocateOrderCode(purpose);

    // Call provider adapter on DONATION channel OUTSIDE any MongoDB transaction
    const providerResult = await payosService.createPaymentLink({
      purpose,
      channelKey,
      orderCode,
      amount: amountNum,
      description: `EDUNITY DB ${orderCode}`,
      expiredAt,
    });

    // Keep "SBX-C-" prefix in sandbox mode and "CONTRIB-" prefix in real PAYOS mode so routeWebhook routes seamlessly
    const paymentReference =
      providerResult.gateway === "PAYOS"
        ? `CONTRIB-${orderCode}`
        : `SBX-C-${orderCode}-${crypto.randomUUID()}`;

    const contribution = await SponsorContribution.create({
      campaignId: campaign._id,
      sponsorId,
      amount: amountDec,
      contributionStatus: "PENDING",
      paymentReference,
      purpose,
      channelKey,
      provider: providerResult.provider,
      gateway: providerResult.gateway,
      orderCode: providerResult.orderCode,
      paymentLinkId: providerResult.paymentLinkId,
      qrCode: providerResult.qrCode,
      checkoutUrl: providerResult.checkoutUrl,
      expiredAt: providerResult.expiredAt || expiredAt,
      providerStatus: providerResult.providerStatus || "PENDING",
      providerCreatedAt: providerResult.providerCreatedAt || now,
      providerMetadata: providerResult.providerMetadata || null,
      currency: providerResult.currency || "VND",
      isAnonymous: normalizedAnonymous,
      donorDisplayName: normalizedAnonymous ? "Nhà tài trợ ẩn danh" : sanitizedDisplayName,
    });

    return {
      payment: contribution,
      contribution,
      reused: false,
    };
  });
};

const processWebhook = async (gatewayReference, status) => {
  const session = await mongoose.startSession();
  let result = {};
  let successfulPayerId = null;
  let failedPayerId = null;
  let affectedEnrollmentId = null;

  try {
    await session.withTransaction(async () => {
      const now = new Date();

      // PAY-03: Cập nhật trạng thái Payment có điều kiện nguyên tử: chỉ chuyển trạng thái nếu đang PENDING
      const targetPaymentStatus = status === "SUCCESS" ? "COMPLETED" : "FAILED";
      const updatedPayment = await Payment.findOneAndUpdate(
        { gatewayReference, paymentStatus: "PENDING" },
        {
          $set: {
            paymentStatus: targetPaymentStatus,
            providerStatus: status === "SUCCESS" ? "PAID" : "FAILED",
            ...(status === "SUCCESS" ? { paidAt: now } : {}),
          },
        },
        { session, returnDocument: "after" }
      );

      if (!updatedPayment) {
        // Payment đã được xử lý trước đó, hoặc không tồn tại
        const existing = await Payment.findOne({ gatewayReference }).session(session);
        if (!existing) {
          throw PAYMENT_NOT_FOUND();
        }

        // PAY-04: Xử lý webhook SUCCESS đến muộn sau khi đã FAILED
        if (existing.paymentStatus === "FAILED" && status === "SUCCESS") {
          // Ghi audit log (đã redact dữ liệu nhạy cảm)
          console.warn(
            JSON.stringify({
              event: "LATE_SUCCESS_AFTER_FAILED",
              paymentId: existing._id ? existing._id.toString() : null,
              gatewayReference,
              timestamp: now.toISOString(),
            })
          );

          const enrollment = existing.enrollmentId
            ? await Enrollment.findById(existing.enrollmentId).session(session)
            : null;
          result = {
            paymentStatus: "FAILED",
            enrollmentStatus: enrollment ? enrollment.enrollmentStatus : null,
            result: "LATE_SUCCESS_FLAGGED_FOR_REVIEW",
          };
          return;
        }

        const enrollment = existing.enrollmentId
          ? await Enrollment.findById(existing.enrollmentId).session(session)
          : null;
        result = {
          paymentStatus: existing.paymentStatus,
          enrollmentStatus: enrollment ? enrollment.enrollmentStatus : null,
          result: "IDEMPOTENT",
        };
        return;
      }

      // Safety guard: never let a DONATION payment record accidentally confirm an Enrollment or create TeacherEarning
      if (updatedPayment.purpose === "DONATION") {
        throw new AppError(
          "DONATION payment must be processed by contribution webhook handler",
          "PAYMENT_PURPOSE_MISMATCH",
          400
        );
      }

      if (status === "FAILED") {
        failedPayerId = updatedPayment.payerUserId;
        affectedEnrollmentId = updatedPayment.enrollmentId;
        const enrollment = await Enrollment.findById(updatedPayment.enrollmentId).session(session);
        result = {
          paymentStatus: "FAILED",
          enrollmentStatus: enrollment ? enrollment.enrollmentStatus : null,
          result: "PAYMENT_FAILED",
        };
        return;
      }

      if (status === "SUCCESS") {
        // BR-13 / BR-41: Tổng thanh toán (Payment) + phần học bổng tạm giữ (ScholarshipUsage) phải đủ toàn bộ học phí
        const { usages: pendingUsages, total: scholarshipHeld } = await getPendingScholarshipUsages(
          updatedPayment.enrollmentId,
          session
        );
        const totalPaid = toDec(toNum(updatedPayment.amount) + scholarshipHeld);

        // Cập nhật trạng thái Enrollment có điều kiện
        const updateRes = await Enrollment.updateOne(
          {
            _id: updatedPayment.enrollmentId,
            enrollmentStatus: "PENDING_PAYMENT",
            holdExpiresAt: { $gt: now },
            $expr: { $lte: ["$tuitionAmount", totalPaid] },
          },
          {
            $set: {
              enrollmentStatus: "CONFIRMED",
              amountPaidViaPayment: updatedPayment.amount,
              ...(scholarshipHeld > 0 ? { amountPaidViaScholarship: toDec(scholarshipHeld) } : {}),
              holdExpiresAt: null,
            },
          },
          { session }
        );

        if (updateRes.modifiedCount === 1) {
          const enrollment = await Enrollment.findById(updatedPayment.enrollmentId).session(
            session
          );

          // Tạo bản ghi Transaction
          const transaction = new Transaction({
            transactionType: "ENROLLMENT_PAYMENT",
            sourceUserId: updatedPayment.payerUserId,
            destinationUserId: enrollment.teacherId,
            relatedEnrollmentId: enrollment._id,
            relatedPaymentId: updatedPayment._id,
            amount: updatedPayment.amount,
            status: "COMPLETED",
          });
          await transaction.save({ session });

          // MIXED: chính thức ghi nhận phần học bổng (quỹ Campaign, Transaction)
          for (const usage of pendingUsages) {
            await confirmScholarshipUsage(usage, enrollment, session);
          }

          // Tạo TeacherEarning (trên toàn bộ học phí: phần Payment + phần Scholarship)
          const policy = resolveCommissionPolicy();
          const commissionRate = policy.rate;
          const grossAmountNum = Number(updatedPayment.amount.toString()) + scholarshipHeld;
          const commissionAmountNum = Math.round(grossAmountNum * commissionRate);
          const netAmountNum = grossAmountNum - commissionAmountNum;

          const earning = new TeacherEarning({
            teacherId: enrollment.teacherId,
            enrollmentId: enrollment._id,
            classId: enrollment.classId,
            grossAmount: mongoose.Types.Decimal128.fromString(grossAmountNum.toString()),
            commissionRate,
            appliedPolicyVersion: policy.version,
            commissionPolicySource: policy.source,
            commissionAmount: mongoose.Types.Decimal128.fromString(commissionAmountNum.toString()),
            netAmount: mongoose.Types.Decimal128.fromString(netAmountNum.toString()),
            status: "PENDING",
          });
          await earning.save({ session });

          successfulPayerId = updatedPayment.payerUserId;
          affectedEnrollmentId = updatedPayment.enrollmentId;
          result = {
            paymentStatus: "COMPLETED",
            enrollmentStatus: "CONFIRMED",
            result: "PAYMENT_SUCCESS",
          };
        } else {
          // Webhook đến muộn, thời gian giữ chỗ của Enrollment đã hết hạn hoặc bị hủy
          // TIN-FIN-PR5: Ghi nhận 2 bút toán độc lập: UNAPPLIED_TUITION_RECEIPT (COMPLETED) và REFUND (PENDING)
          const isLiveDb = mongoose.connection && mongoose.connection.readyState === 1;
          if (isLiveDb) {
            const receiptTx = new Transaction({
              transactionType: "UNAPPLIED_TUITION_RECEIPT",
              sourceUserId: updatedPayment.payerUserId,
              destinationUserId: null,
              relatedEnrollmentId: updatedPayment.enrollmentId || null,
              relatedPaymentId: updatedPayment._id,
              amount: updatedPayment.amount,
              status: "COMPLETED",
            });
            await receiptTx.save({ session });
          }

          const refundTx = new Transaction({
            transactionType: "REFUND",
            sourceUserId: updatedPayment.payerUserId,
            // Trả lại nguồn, không cần destination
            relatedEnrollmentId: updatedPayment.enrollmentId || null,
            relatedPaymentId: updatedPayment._id,
            amount: updatedPayment.amount,
            status: "PENDING",
          });
          await refundTx.save({ session });

          const currentEnrollment = await Enrollment.findById(
            updatedPayment.enrollmentId
          ).session(session);

          result = {
            paymentStatus: "COMPLETED",
            enrollmentStatus: currentEnrollment ? currentEnrollment.enrollmentStatus : null,
            result: "LATE_PAYMENT_PENDING_REVIEW",
          };
        }
      }
    });
  } finally {
    session.endSession();
  }

  if (result.result === "PAYMENT_SUCCESS" && successfulPayerId) {
    await notify(
      successfulPayerId,
      "Thanh toán thành công",
      "Học phí đã được thanh toán, bạn đã được ghi danh vào lớp.",
      "ENROLLMENT_CONFIRMED"
    );
    await notifyTeacherOfEnrollment(affectedEnrollmentId);
  }
  if (result.result === "PAYMENT_FAILED" && failedPayerId) {
    await notify(
      failedPayerId,
      "Thanh toán chưa thành công",
      "Giao dịch học phí chưa thành công. Chỗ của bạn vẫn được giữ đến hết thời hạn, vui lòng thử thanh toán lại.",
      "PAYMENT_FAILED"
    );
  }

  return result;
};

// GET /payments/:id — xem trạng thái thanh toán cho người trả (STUDENT hoặc SPONSOR sở hữu) hoặc ADMIN
const getPaymentById = async (user, paymentId) => {
  if (!mongoose.isValidObjectId(paymentId)) throw PAYMENT_NOT_FOUND();

  const payment = await Payment.findById(paymentId).lean();
  if (payment) {
    if (user.role !== "ADMIN" && payment.payerUserId.toString() !== user.id.toString()) {
      throw PAYMENT_NOT_FOUND();
    }

    const { providerMetadata, ...safePayment } = payment;
    const expiredAt = payment.expiredAt || null;

    if (payment.purpose === "DONATION") {
      return {
        ...safePayment,
        paymentId: payment._id,
        purpose: "DONATION",
        channelKey: payment.channelKey || "DONATION",
        provider: payment.provider || "PAYOS",
        currency: payment.currency || "VND",
        remainingSeconds: computeRemainingSeconds(expiredAt),
      };
    }

    const enrollment = payment.enrollmentId
      ? await Enrollment.findById(payment.enrollmentId)
          .select("enrollmentStatus paymentSource holdExpiresAt classId tuitionAmount amountPaidViaScholarship")
          .lean()
      : null;
    const holdExpiresAt = enrollment ? enrollment.holdExpiresAt : expiredAt;

    let reconciliation = null;
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      reconciliation = await PaymentReconciliation.findOne({ paymentId: payment._id })
        .sort({ createdAt: -1 })
        .select("reason status")
        .lean()
        .catch(() => null);
    }

    const tuitionAmountNum = enrollment && enrollment.tuitionAmount != null ? toNum(enrollment.tuitionAmount) : null;
    const paymentAmountNum = payment.amount != null ? toNum(payment.amount) : 0;
    const scholarshipAmountNum =
      enrollment && enrollment.amountPaidViaScholarship != null && toNum(enrollment.amountPaidViaScholarship) > 0
        ? toNum(enrollment.amountPaidViaScholarship)
        : tuitionAmountNum != null && tuitionAmountNum > paymentAmountNum
        ? Math.max(0, tuitionAmountNum - paymentAmountNum)
        : 0;

    const isLateCompleted =
      payment.paymentStatus === "COMPLETED" &&
      enrollment &&
      !["CONFIRMED", "COMPLETED"].includes(enrollment.enrollmentStatus);

    return {
      ...safePayment,
      paymentId: payment._id,
      purpose: payment.purpose || "TUITION",
      channelKey: payment.channelKey || "TUITION",
      provider: payment.provider || "PAYOS",
      currency: payment.currency || "VND",
      enrollmentStatus: enrollment ? enrollment.enrollmentStatus : null,
      paymentSource: enrollment ? enrollment.paymentSource : null,
      tuitionAmount: tuitionAmountNum != null ? tuitionAmountNum : paymentAmountNum,
      scholarshipAmount: scholarshipAmountNum,
      reconciliationRequired: Boolean(reconciliation) || isLateCompleted,
      reconciliationReason: reconciliation
        ? reconciliation.reason
        : isLateCompleted
        ? "LATE_PAYMENT_REVIEW"
        : null,
      reconciliationStatus: reconciliation ? reconciliation.status : isLateCompleted ? "OPEN" : null,
      holdExpiresAt,
      expiredAt: expiredAt || holdExpiresAt,
      remainingSeconds: computeRemainingSeconds(expiredAt || holdExpiresAt),
      classId: enrollment ? enrollment.classId : null,
    };
  }

  // Fallback sang SponsorContribution cho luồng DONATION (tránh duplicate record trong collection payments)
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    const contribution = await SponsorContribution.findById(paymentId).lean();
    if (
      contribution &&
      (user.role === "ADMIN" || contribution.sponsorId.toString() === user.id.toString())
    ) {
      const { providerMetadata, sponsorId, ...safeContrib } = contribution;
      const expiredAt = contribution.expiredAt || null;
      const [campaign, reconciliation] = await Promise.all([
        contribution.campaignId
          ? ScholarshipCampaign.findById(contribution.campaignId)
              .select("title status")
              .lean()
              .catch(() => null)
          : null,
        PaymentReconciliation.findOne({ contributionId: contribution._id })
          .sort({ createdAt: -1 })
          .select("reason status")
          .lean()
          .catch(() => null),
      ]);

      return {
        ...safeContrib,
        ...(user.role === "ADMIN" || !contribution.isAnonymous ? { sponsorId } : {}),
        paymentId: contribution._id,
        contributionId: contribution._id,
        purpose: "DONATION",
        channelKey: contribution.channelKey || "DONATION",
        provider: contribution.provider || "PAYOS",
        gateway: contribution.gateway || "SANDBOX",
        gatewayReference: contribution.paymentReference,
        paymentStatus: contribution.contributionStatus,
        contributionStatus: contribution.contributionStatus,
        campaignTitle: campaign ? campaign.title : null,
        campaignStatus: campaign ? campaign.status : null,
        isAnonymous: Boolean(contribution.isAnonymous),
        donorDisplayName: contribution.isAnonymous
          ? "Nhà tài trợ ẩn danh"
          : contribution.donorDisplayName || null,
        reconciliationRequired: Boolean(reconciliation),
        reconciliationReason: reconciliation ? reconciliation.reason : null,
        reconciliationStatus: reconciliation ? reconciliation.status : null,
        currency: contribution.currency || "VND",
        remainingSeconds: computeRemainingSeconds(expiredAt),
      };
    }
  }

  throw PAYMENT_NOT_FOUND();
};

const getPaymentHistory = async (studentId, enrollmentId) => {
  if (!mongoose.isValidObjectId(enrollmentId)) throw ENROLLMENT_NOT_FOUND();

  const enrollment = await Enrollment.findOne({ _id: enrollmentId, studentId });
  if (!enrollment) {
    throw ENROLLMENT_NOT_FOUND();
  }

  const payments = await Payment.find({ enrollmentId }).sort({ createdAt: -1 });
  return payments;
};

module.exports = {
  allocateOrderCode,
  computeRemainingSeconds,
  formatPaymentIntentResponse,
  createTuitionPaymentIntent,
  createDonationPaymentIntent,
  createSandboxPayment,
  processWebhook,
  getPaymentHistory,
  getPaymentById,
};
