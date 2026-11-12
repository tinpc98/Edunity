const mongoose = require("mongoose");
const crypto = require("crypto");
const {
  Class,
  Enrollment,
  Payment,
  SponsorContribution,
  Scholarship,
  ScholarshipCampaign,
  ScholarshipUsage,
  Transaction,
  TeacherEarning,
  BankTransferEvent,
  PaymentReconciliation,
  SessionRefundReview,
} = require("../models");
const payosService = require("./payosService");
const campaignService = require("./campaignService");
const { releaseReservation } = require("./reservationService");
const {
  getPendingScholarshipUsages,
  confirmScholarshipUsage,
  createTeacherEarning,
} = require("./settlementService");
const { notify, notifyTeacherOfEnrollment } = require("./notificationService");
const { toNum, toDec } = require("../utils/money");
const { AppError } = require("../utils/errors");

const DEFAULT_LEASE_MS = 30 * 1000;
const MAX_DISPATCH_ATTEMPTS = 5;
const BASE_RETRY_BACKOFF_MS = 1000;
const MAX_RETRY_BACKOFF_MS = 5 * 60 * 1000;

const ELIGIBLE_EVENT_STATUSES = [
  "READY_FOR_DISPATCH",
  "DISPATCHING",
  "DISPATCH_FAILED",
];

const ELIGIBLE_DISPATCH_STATUSES = [
  "NOT_REQUIRED",
  "PENDING_DISPATCH",
  "DISPATCHING",
  "DISPATCH_FAILED",
];

// In-process coalescing map to avoid duplicate local dispatch calls on the same eventId
const inflightDispatchPromises = new Map();

/**
 * Compute bounded exponential backoff in milliseconds for retry attempt N (1-based).
 */
const computeRetryBackoffMs = (attemptNumber) => {
  const exp = Math.max(0, Number(attemptNumber || 1) - 1);
  return Math.min(MAX_RETRY_BACKOFF_MS, BASE_RETRY_BACKOFF_MS * Math.pow(2, exp));
};

/**
 * Upsert a PaymentReconciliation record inside a MongoDB session without throwing E11000 if one already exists.
 */
const ensureReconciliationInSession = async (
  session,
  {
    eventDoc,
    reason,
    paymentId = null,
    contributionId = null,
    enrollmentId = null,
    campaignId = null,
    expectedAmount = null,
    receivedAmount,
    note = null,
    now = new Date(),
  }
) => {
  const existing = await PaymentReconciliation.findOne({
    eventId: eventDoc._id,
  }).session(session);

  if (existing) {
    existing.reason = reason || existing.reason;
    if (note) {
      existing.auditReferences.push({
        action: "DISPATCH_RECONCILIATION_UPDATED",
        note,
        timestamp: now,
      });
    }
    await existing.save({ session });
    return existing;
  }

  const [created] = await PaymentReconciliation.create(
    [
      {
        eventId: eventDoc._id,
        purpose: eventDoc.purpose,
        channelKey: eventDoc.channelKey,
        orderCode: eventDoc.orderCode,
        paymentId,
        contributionId,
        enrollmentId,
        campaignId,
        reason,
        expectedAmount,
        receivedAmount: receivedAmount || eventDoc.amount,
        currency: eventDoc.currency || "VND",
        status: "NEEDS_REVIEW",
        auditReferences: [
          {
            action: "DISPATCH_RECONCILIATION_OPENED",
            note: note || reason,
            timestamp: now,
          },
        ],
      },
    ],
    { session }
  );
  return created;
};

/**
 * Execute atomic TUITION financial settlement inside an active MongoDB transaction session.
 */
const dispatchTuitionWithinTransaction = async (eventDoc, session, options = {}) => {
  const now = options.now instanceof Date ? options.now : new Date();

  if (eventDoc.channelKey !== "TUITION" || eventDoc.purpose !== "TUITION") {
    const recon = await ensureReconciliationInSession(session, {
      eventDoc,
      reason: "PURPOSE_CHANNEL_MISMATCH",
      receivedAmount: eventDoc.amount,
      note: `Event purpose/channel (${eventDoc.purpose}/${eventDoc.channelKey}) is not TUITION`,
      now,
    });
    eventDoc.eventStatus = "NEEDS_REVIEW";
    eventDoc.dispatchStatus = "RECONCILIATION_REQUIRED";
    eventDoc.normalizedError = "Purpose/channel mismatch during TUITION dispatch";
    eventDoc.dispatchLeaseOwner = null;
    eventDoc.dispatchLeaseUntil = null;
    await eventDoc.save({ session });
    return {
      dispatched: false,
      idempotent: false,
      reconciliationRequired: true,
      reconciliationId: recon._id,
      reconciliationReason: recon.reason,
      eventStatus: eventDoc.eventStatus,
      dispatchStatus: eventDoc.dispatchStatus,
    };
  }

  const payment = eventDoc.linkedPaymentId
    ? await Payment.findById(eventDoc.linkedPaymentId).session(session)
    : await Payment.findOne({ orderCode: eventDoc.orderCode }).session(session);

  if (!payment) {
    const recon = await ensureReconciliationInSession(session, {
      eventDoc,
      reason: "UNMATCHED",
      receivedAmount: eventDoc.amount,
      note: `No Payment found for orderCode ${eventDoc.orderCode}`,
      now,
    });
    eventDoc.eventStatus = "UNMATCHED";
    eventDoc.dispatchStatus = "RECONCILIATION_REQUIRED";
    eventDoc.normalizedError = `No Payment found for orderCode ${eventDoc.orderCode}`;
    eventDoc.dispatchLeaseOwner = null;
    eventDoc.dispatchLeaseUntil = null;
    await eventDoc.save({ session });
    return {
      dispatched: false,
      idempotent: false,
      reconciliationRequired: true,
      reconciliationId: recon._id,
      reconciliationReason: recon.reason,
      eventStatus: eventDoc.eventStatus,
      dispatchStatus: eventDoc.dispatchStatus,
    };
  }

  if (
    (payment.purpose && payment.purpose !== "TUITION") ||
    (payment.channelKey && payment.channelKey !== "TUITION")
  ) {
    const recon = await ensureReconciliationInSession(session, {
      eventDoc,
      reason: "PURPOSE_CHANNEL_MISMATCH",
      paymentId: payment._id,
      enrollmentId: payment.enrollmentId,
      expectedAmount: payment.amount,
      receivedAmount: eventDoc.amount,
      note: "Payment purpose/channel is not TUITION",
      now,
    });
    eventDoc.eventStatus = "NEEDS_REVIEW";
    eventDoc.dispatchStatus = "RECONCILIATION_REQUIRED";
    eventDoc.dispatchLeaseOwner = null;
    eventDoc.dispatchLeaseUntil = null;
    await eventDoc.save({ session });
    return {
      dispatched: false,
      idempotent: false,
      reconciliationRequired: true,
      reconciliationId: recon._id,
      reconciliationReason: recon.reason,
      eventStatus: eventDoc.eventStatus,
      dispatchStatus: eventDoc.dispatchStatus,
    };
  }

  const enrollment = payment.enrollmentId
    ? await Enrollment.findById(payment.enrollmentId).session(session)
    : null;

  if (!enrollment) {
    const recon = await ensureReconciliationInSession(session, {
      eventDoc,
      reason: "UNMATCHED",
      paymentId: payment._id,
      expectedAmount: payment.amount,
      receivedAmount: eventDoc.amount,
      note: "Enrollment not found for Payment",
      now,
    });
    eventDoc.eventStatus = "UNMATCHED";
    eventDoc.dispatchStatus = "RECONCILIATION_REQUIRED";
    eventDoc.dispatchLeaseOwner = null;
    eventDoc.dispatchLeaseUntil = null;
    await eventDoc.save({ session });
    return {
      dispatched: false,
      idempotent: false,
      reconciliationRequired: true,
      reconciliationId: recon._id,
      reconciliationReason: recon.reason,
      eventStatus: eventDoc.eventStatus,
      dispatchStatus: eventDoc.dispatchStatus,
    };
  }

  // Idempotent check: if this Payment + Enrollment were already confirmed previously
  if (
    payment.paymentStatus === "COMPLETED" &&
    (enrollment.enrollmentStatus === "CONFIRMED" || enrollment.enrollmentStatus === "COMPLETED")
  ) {
    const existingTx = await Transaction.findOne({
      relatedPaymentId: payment._id,
      transactionType: "ENROLLMENT_PAYMENT",
    }).session(session);
    const existingEarning = await TeacherEarning.findOne({
      enrollmentId: enrollment._id,
    }).session(session);

    eventDoc.eventStatus = "DISPATCHED";
    eventDoc.dispatchStatus = "DISPATCHED";
    eventDoc.dispatchedAt = eventDoc.dispatchedAt || now;
    eventDoc.dispatchLeaseOwner = null;
    eventDoc.dispatchLeaseUntil = null;
    if (existingTx && !eventDoc.linkedTransactionIds.some((id) => id.toString() === existingTx._id.toString())) {
      eventDoc.linkedTransactionIds.push(existingTx._id);
    }
    if (existingEarning) {
      eventDoc.linkedTeacherEarningId = existingEarning._id;
    }
    await eventDoc.save({ session });

    return {
      dispatched: false,
      idempotent: true,
      reconciliationRequired: false,
      eventStatus: "DISPATCHED",
      dispatchStatus: "DISPATCHED",
      paymentId: payment._id,
      enrollmentId: enrollment._id,
    };
  }

  // Case 2: Payment was already marked FAILED or REFUNDED before dispatch
  if (payment.paymentStatus === "FAILED" || payment.paymentStatus === "REFUNDED") {
    const recon = await ensureReconciliationInSession(session, {
      eventDoc,
      reason: "LATE_SUCCESS_AFTER_FAILED",
      paymentId: payment._id,
      enrollmentId: enrollment._id,
      expectedAmount: payment.amount,
      receivedAmount: eventDoc.amount,
      note: `Transfer arrived after Payment was already ${payment.paymentStatus}`,
      now,
    });
    eventDoc.eventStatus = "LATE_SUCCESS_AFTER_FAILED";
    eventDoc.dispatchStatus = "RECONCILIATION_REQUIRED";
    eventDoc.normalizedError = `Payment was already ${payment.paymentStatus}`;
    eventDoc.dispatchLeaseOwner = null;
    eventDoc.dispatchLeaseUntil = null;
    await eventDoc.save({ session });

    return {
      dispatched: false,
      idempotent: false,
      reconciliationRequired: true,
      reconciliationId: recon._id,
      reconciliationReason: recon.reason,
      eventStatus: eventDoc.eventStatus,
      dispatchStatus: eventDoc.dispatchStatus,
    };
  }

  // Case 1: Enrollment hold expired / Enrollment already EXPIRED/CANCELLED/FAILED / Payment expiredAt passed
  const isEnrollmentExpiredOrInactive =
    enrollment.enrollmentStatus !== "PENDING_PAYMENT" ||
    !enrollment.holdExpiresAt ||
    new Date(enrollment.holdExpiresAt) <= now;
  const isPaymentQrExpired =
    payment.expiredAt && new Date(payment.expiredAt) <= now;

  if (isEnrollmentExpiredOrInactive || isPaymentQrExpired) {
    // If Enrollment is still PENDING_PAYMENT but holdExpiresAt <= now (cron hasn't run yet),
    // release the reservation atomically so seat and any held ScholarshipUsage are returned cleanly.
    if (
      enrollment.enrollmentStatus === "PENDING_PAYMENT" &&
      enrollment.holdExpiresAt &&
      new Date(enrollment.holdExpiresAt) <= now
    ) {
      await releaseReservation(enrollment._id, "EXPIRED", { session });
    }

    // Record that real money arrived on Payment, and record TWO distinct financial facts (TIN-FIN-PR5):
    // 1. UNAPPLIED_TUITION_RECEIPT (COMPLETED) -> real cash-in received into TUITION bank account (not class revenue)
    // 2. REFUND (PENDING) -> pending refund obligation (never COMPLETED until bank refund proof)
    if (payment.paymentStatus === "PENDING") {
      payment.paymentStatus = "COMPLETED";
      payment.providerStatus = "PAID";
      payment.paidAt = now;
      await payment.save({ session });
    }

    let receiptTx = await Transaction.findOne({
      relatedBankEventId: eventDoc._id,
      transactionType: "UNAPPLIED_TUITION_RECEIPT",
    }).session(session);

    if (!receiptTx) {
      [receiptTx] = await Transaction.create(
        [
          {
            transactionType: "UNAPPLIED_TUITION_RECEIPT",
            sourceUserId: payment.payerUserId,
            destinationUserId: null,
            relatedEnrollmentId: enrollment._id,
            relatedPaymentId: payment._id,
            relatedBankEventId: eventDoc._id,
            amount: eventDoc.amount,
            status: "COMPLETED",
          },
        ],
        { session }
      );
    }

    let refundTx = await Transaction.findOne({
      relatedBankEventId: eventDoc._id,
      transactionType: "REFUND",
    }).session(session);

    if (!refundTx) {
      [refundTx] = await Transaction.create(
        [
          {
            transactionType: "REFUND",
            sourceUserId: payment.payerUserId,
            destinationUserId: null,
            relatedEnrollmentId: enrollment._id,
            relatedPaymentId: payment._id,
            relatedBankEventId: eventDoc._id,
            amount: eventDoc.amount,
            status: "PENDING",
          },
        ],
        { session }
      );
    }

    const recon = await ensureReconciliationInSession(session, {
      eventDoc,
      reason: "LATE_PAYMENT_REVIEW",
      paymentId: payment._id,
      enrollmentId: enrollment._id,
      expectedAmount: payment.amount,
      receivedAmount: eventDoc.amount,
      note: isEnrollmentExpiredOrInactive
        ? `Transfer arrived after Enrollment (${enrollment.enrollmentStatus}) hold expired`
        : "Transfer arrived after Payment QR expiredAt",
      now,
    });

    eventDoc.eventStatus = "EXPIRED_PAYMENT";
    eventDoc.dispatchStatus = "RECONCILIATION_REQUIRED";
    eventDoc.normalizedError = "Late payment arrived after reservation/QR expiry";
    eventDoc.linkedTransactionIds = [receiptTx._id, refundTx._id];
    eventDoc.dispatchLeaseOwner = null;
    eventDoc.dispatchLeaseUntil = null;
    await eventDoc.save({ session });

    return {
      dispatched: false,
      idempotent: false,
      reconciliationRequired: true,
      reconciliationId: recon._id,
      reconciliationReason: recon.reason,
      eventStatus: eventDoc.eventStatus,
      dispatchStatus: eventDoc.dispatchStatus,
    };
  }

  // Verify Class is PAID and active
  const cls = await Class.findById(enrollment.classId).session(session);
  if (!cls || cls.classType === "FREE") {
    const recon = await ensureReconciliationInSession(session, {
      eventDoc,
      reason: "NEEDS_REVIEW",
      paymentId: payment._id,
      enrollmentId: enrollment._id,
      expectedAmount: payment.amount,
      receivedAmount: eventDoc.amount,
      note: "Class not found or is FREE class",
      now,
    });
    eventDoc.eventStatus = "NEEDS_REVIEW";
    eventDoc.dispatchStatus = "RECONCILIATION_REQUIRED";
    eventDoc.dispatchLeaseOwner = null;
    eventDoc.dispatchLeaseUntil = null;
    await eventDoc.save({ session });
    return {
      dispatched: false,
      idempotent: false,
      reconciliationRequired: true,
      reconciliationId: recon._id,
      reconciliationReason: recon.reason,
      eventStatus: eventDoc.eventStatus,
      dispatchStatus: eventDoc.dispatchStatus,
    };
  }

  // Check pending ScholarshipUsage for MIXED co-payment and verify exact tuition equation
  const { usages: pendingUsages, total: scholarshipHeld } = await getPendingScholarshipUsages(
    enrollment._id,
    session
  );

  const paymentAmountNum = toNum(payment.amount);
  const eventAmountNum = toNum(eventDoc.amount);
  const tuitionNum = toNum(enrollment.tuitionAmount);

  if (
    paymentAmountNum <= 0 ||
    paymentAmountNum !== eventAmountNum ||
    paymentAmountNum + scholarshipHeld !== tuitionNum
  ) {
    const recon = await ensureReconciliationInSession(session, {
      eventDoc,
      reason: "AMOUNT_MISMATCH",
      paymentId: payment._id,
      enrollmentId: enrollment._id,
      expectedAmount: toDec(Math.max(0, tuitionNum - scholarshipHeld)),
      receivedAmount: eventDoc.amount,
      note: `Tuition equation mismatch: event=${eventAmountNum}, payment=${paymentAmountNum}, scholarshipHeld=${scholarshipHeld}, tuition=${tuitionNum}`,
      now,
    });
    eventDoc.eventStatus = "AMOUNT_MISMATCH";
    eventDoc.dispatchStatus = "RECONCILIATION_REQUIRED";
    eventDoc.normalizedError = "Amount + scholarshipHeld does not equal enrollment.tuitionAmount";
    eventDoc.dispatchLeaseOwner = null;
    eventDoc.dispatchLeaseUntil = null;
    await eventDoc.save({ session });

    return {
      dispatched: false,
      idempotent: false,
      reconciliationRequired: true,
      reconciliationId: recon._id,
      reconciliationReason: recon.reason,
      eventStatus: eventDoc.eventStatus,
      dispatchStatus: eventDoc.dispatchStatus,
    };
  }

  // Step 1: CAS update Payment -> COMPLETED
  const updatedPayment = await Payment.findOneAndUpdate(
    { _id: payment._id, paymentStatus: "PENDING" },
    {
      $set: {
        paymentStatus: "COMPLETED",
        providerStatus: "PAID",
        paidAt: now,
      },
    },
    { session, returnDocument: "after" }
  );
  if (!updatedPayment) {
    throw new AppError("Payment state changed concurrently during dispatch", "CONFLICT", 409);
  }

  if (typeof options.simulateErrorAfterStep === "function") {
    await options.simulateErrorAfterStep("PAYMENT_UPDATED", { payment: updatedPayment, session });
  }

  // Step 2: CAS update Enrollment -> CONFIRMED (never increment Class.enrolledCount again)
  const expectedPaymentSource = scholarshipHeld > 0 ? "MIXED" : "DIRECT_PAYMENT";
  const updatedEnrollment = await Enrollment.findOneAndUpdate(
    {
      _id: enrollment._id,
      enrollmentStatus: "PENDING_PAYMENT",
      holdExpiresAt: { $gt: now },
    },
    {
      $set: {
        enrollmentStatus: "CONFIRMED",
        paymentSource: expectedPaymentSource,
        amountPaidViaPayment: updatedPayment.amount,
        ...(scholarshipHeld > 0 ? { amountPaidViaScholarship: toDec(scholarshipHeld) } : {}),
        holdExpiresAt: null,
      },
    },
    { session, returnDocument: "after" }
  );
  if (!updatedEnrollment) {
    throw new AppError("Enrollment hold expired or state changed during dispatch", "CONFLICT", 409);
  }

  if (typeof options.simulateErrorAfterStep === "function") {
    await options.simulateErrorAfterStep("ENROLLMENT_CONFIRMED", {
      payment: updatedPayment,
      enrollment: updatedEnrollment,
      session,
    });
  }

  // Step 3: Create ENROLLMENT_PAYMENT Transaction
  const createdTxIds = [];
  const [enrollmentTx] = await Transaction.create(
    [
      {
        transactionType: "ENROLLMENT_PAYMENT",
        sourceUserId: updatedPayment.payerUserId,
        destinationUserId: updatedEnrollment.teacherId,
        relatedEnrollmentId: updatedEnrollment._id,
        relatedPaymentId: updatedPayment._id,
        relatedBankEventId: eventDoc._id,
        amount: updatedPayment.amount,
        status: "COMPLETED",
      },
    ],
    { session }
  );
  createdTxIds.push(enrollmentTx._id);

  // Step 4: Confirm pending ScholarshipUsages if MIXED
  for (const usage of pendingUsages) {
    const schTx = await confirmScholarshipUsage(usage, updatedEnrollment, session, {
      relatedBankEventId: eventDoc._id,
    });
    if (schTx && schTx._id) {
      createdTxIds.push(schTx._id);
    }
  }

  if (typeof options.simulateErrorAfterStep === "function") {
    await options.simulateErrorAfterStep("TRANSACTIONS_CREATED", {
      payment: updatedPayment,
      enrollment: updatedEnrollment,
      session,
    });
  }

  // Step 5: Create TeacherEarning on full tuition (status = PENDING, settlementHoldRequired = true)
  const grossAmountNum = tuitionNum;
  const earning = await createTeacherEarning(updatedEnrollment, grossAmountNum, session, {
    settlementHoldRequired: true,
  });

  // Step 6: Mark BankTransferEvent as DISPATCHED
  eventDoc.eventStatus = "DISPATCHED";
  eventDoc.dispatchStatus = "DISPATCHED";
  eventDoc.dispatchedAt = now;
  eventDoc.processedAt = now;
  eventDoc.dispatchAttempts = (eventDoc.dispatchAttempts || 0) + 1;
  eventDoc.lastDispatchError = null;
  eventDoc.nextRetryAt = null;
  eventDoc.dispatchLeaseOwner = null;
  eventDoc.dispatchLeaseUntil = null;
  eventDoc.linkedTransactionIds = createdTxIds;
  eventDoc.linkedTeacherEarningId = earning._id;
  await eventDoc.save({ session });

  return {
    dispatched: true,
    idempotent: false,
    reconciliationRequired: false,
    purpose: "TUITION",
    eventStatus: "DISPATCHED",
    dispatchStatus: "DISPATCHED",
    paymentId: updatedPayment._id,
    enrollmentId: updatedEnrollment._id,
    studentId: updatedEnrollment.studentId,
    teacherEarningId: earning._id,
    transactionIds: createdTxIds,
  };
};

/**
 * Execute atomic DONATION financial settlement inside an active MongoDB transaction session.
 */
const dispatchDonationWithinTransaction = async (eventDoc, session, options = {}) => {
  const now = options.now instanceof Date ? options.now : new Date();

  if (eventDoc.channelKey !== "DONATION" || eventDoc.purpose !== "DONATION") {
    const recon = await ensureReconciliationInSession(session, {
      eventDoc,
      reason: "PURPOSE_CHANNEL_MISMATCH",
      receivedAmount: eventDoc.amount,
      note: `Event purpose/channel (${eventDoc.purpose}/${eventDoc.channelKey}) is not DONATION`,
      now,
    });
    eventDoc.eventStatus = "NEEDS_REVIEW";
    eventDoc.dispatchStatus = "RECONCILIATION_REQUIRED";
    eventDoc.normalizedError = "Purpose/channel mismatch during DONATION dispatch";
    eventDoc.dispatchLeaseOwner = null;
    eventDoc.dispatchLeaseUntil = null;
    await eventDoc.save({ session });
    return {
      dispatched: false,
      idempotent: false,
      reconciliationRequired: true,
      reconciliationId: recon._id,
      reconciliationReason: recon.reason,
      eventStatus: eventDoc.eventStatus,
      dispatchStatus: eventDoc.dispatchStatus,
    };
  }

  const contribution = eventDoc.contributionId
    ? await SponsorContribution.findById(eventDoc.contributionId).session(session)
    : await SponsorContribution.findOne({ orderCode: eventDoc.orderCode }).session(session);

  if (!contribution) {
    const recon = await ensureReconciliationInSession(session, {
      eventDoc,
      reason: "UNMATCHED",
      receivedAmount: eventDoc.amount,
      note: `No SponsorContribution found for orderCode ${eventDoc.orderCode}`,
      now,
    });
    eventDoc.eventStatus = "UNMATCHED";
    eventDoc.dispatchStatus = "RECONCILIATION_REQUIRED";
    eventDoc.normalizedError = `No SponsorContribution found for orderCode ${eventDoc.orderCode}`;
    eventDoc.dispatchLeaseOwner = null;
    eventDoc.dispatchLeaseUntil = null;
    await eventDoc.save({ session });
    return {
      dispatched: false,
      idempotent: false,
      reconciliationRequired: true,
      reconciliationId: recon._id,
      reconciliationReason: recon.reason,
      eventStatus: eventDoc.eventStatus,
      dispatchStatus: eventDoc.dispatchStatus,
    };
  }

  if (
    (contribution.purpose && contribution.purpose !== "DONATION") ||
    (contribution.channelKey && contribution.channelKey !== "DONATION")
  ) {
    const recon = await ensureReconciliationInSession(session, {
      eventDoc,
      reason: "PURPOSE_CHANNEL_MISMATCH",
      contributionId: contribution._id,
      campaignId: contribution.campaignId,
      expectedAmount: contribution.amount,
      receivedAmount: eventDoc.amount,
      note: "Contribution purpose/channel is not DONATION",
      now,
    });
    eventDoc.eventStatus = "NEEDS_REVIEW";
    eventDoc.dispatchStatus = "RECONCILIATION_REQUIRED";
    eventDoc.dispatchLeaseOwner = null;
    eventDoc.dispatchLeaseUntil = null;
    await eventDoc.save({ session });
    return {
      dispatched: false,
      idempotent: false,
      reconciliationRequired: true,
      reconciliationId: recon._id,
      reconciliationReason: recon.reason,
      eventStatus: eventDoc.eventStatus,
      dispatchStatus: eventDoc.dispatchStatus,
    };
  }

  // Idempotent check: if this contribution was already completed
  if (contribution.contributionStatus === "COMPLETED") {
    const existingTx = await Transaction.findOne({
      relatedContributionId: contribution._id,
      transactionType: "SPONSOR_CONTRIBUTION",
    }).session(session);

    eventDoc.eventStatus = "DISPATCHED";
    eventDoc.dispatchStatus = "DISPATCHED";
    eventDoc.dispatchedAt = eventDoc.dispatchedAt || now;
    eventDoc.dispatchLeaseOwner = null;
    eventDoc.dispatchLeaseUntil = null;
    if (existingTx && !eventDoc.linkedTransactionIds.some((id) => id.toString() === existingTx._id.toString())) {
      eventDoc.linkedTransactionIds.push(existingTx._id);
    }
    await eventDoc.save({ session });

    return {
      dispatched: false,
      idempotent: true,
      reconciliationRequired: false,
      eventStatus: "DISPATCHED",
      dispatchStatus: "DISPATCHED",
      contributionId: contribution._id,
      campaignId: contribution.campaignId,
    };
  }

  // Late arrival after FAILED
  if (contribution.contributionStatus === "FAILED") {
    const recon = await ensureReconciliationInSession(session, {
      eventDoc,
      reason: "LATE_SUCCESS_AFTER_FAILED",
      contributionId: contribution._id,
      campaignId: contribution.campaignId,
      expectedAmount: contribution.amount,
      receivedAmount: eventDoc.amount,
      note: "Donation transfer arrived after contribution was already marked FAILED",
      now,
    });
    eventDoc.eventStatus = "LATE_SUCCESS_AFTER_FAILED";
    eventDoc.dispatchStatus = "RECONCILIATION_REQUIRED";
    eventDoc.normalizedError = "Contribution was already FAILED";
    eventDoc.dispatchLeaseOwner = null;
    eventDoc.dispatchLeaseUntil = null;
    await eventDoc.save({ session });
    return {
      dispatched: false,
      idempotent: false,
      reconciliationRequired: true,
      reconciliationId: recon._id,
      reconciliationReason: recon.reason,
      eventStatus: eventDoc.eventStatus,
      dispatchStatus: eventDoc.dispatchStatus,
    };
  }

  // Late arrival after QR expiredAt
  if (contribution.expiredAt && new Date(contribution.expiredAt) <= now) {
    const recon = await ensureReconciliationInSession(session, {
      eventDoc,
      reason: "EXPIRED_PAYMENT",
      contributionId: contribution._id,
      campaignId: contribution.campaignId,
      expectedAmount: contribution.amount,
      receivedAmount: eventDoc.amount,
      note: "Donation transfer arrived after QR expiredAt",
      now,
    });
    eventDoc.eventStatus = "EXPIRED_PAYMENT";
    eventDoc.dispatchStatus = "RECONCILIATION_REQUIRED";
    eventDoc.normalizedError = "Donation QR expired before transfer arrived";
    eventDoc.dispatchLeaseOwner = null;
    eventDoc.dispatchLeaseUntil = null;
    await eventDoc.save({ session });
    return {
      dispatched: false,
      idempotent: false,
      reconciliationRequired: true,
      reconciliationId: recon._id,
      reconciliationReason: recon.reason,
      eventStatus: eventDoc.eventStatus,
      dispatchStatus: eventDoc.dispatchStatus,
    };
  }

  const campaign = await ScholarshipCampaign.findById(contribution.campaignId).session(session);
  if (!campaign || campaign.isDeleted || !campaignService.isAcceptingFunding(campaign, now)) {
    const recon = await ensureReconciliationInSession(session, {
      eventDoc,
      reason: "CAMPAIGN_NOT_ACCEPTING_FUNDING",
      contributionId: contribution._id,
      campaignId: contribution.campaignId,
      expectedAmount: contribution.amount,
      receivedAmount: eventDoc.amount,
      note: "ScholarshipCampaign is closed, deleted, or outside funding window when transfer arrived",
      now,
    });
    eventDoc.eventStatus = "NEEDS_REVIEW";
    eventDoc.dispatchStatus = "RECONCILIATION_REQUIRED";
    eventDoc.normalizedError = "Campaign is no longer accepting funding";
    eventDoc.dispatchLeaseOwner = null;
    eventDoc.dispatchLeaseUntil = null;
    await eventDoc.save({ session });
    return {
      dispatched: false,
      idempotent: false,
      reconciliationRequired: true,
      reconciliationId: recon._id,
      reconciliationReason: recon.reason,
      eventStatus: eventDoc.eventStatus,
      dispatchStatus: eventDoc.dispatchStatus,
    };
  }

  const contribAmountNum = toNum(contribution.amount);
  const eventAmountNum = toNum(eventDoc.amount);
  if (contribAmountNum <= 0 || contribAmountNum !== eventAmountNum) {
    const recon = await ensureReconciliationInSession(session, {
      eventDoc,
      reason: "AMOUNT_MISMATCH",
      contributionId: contribution._id,
      campaignId: contribution.campaignId,
      expectedAmount: contribution.amount,
      receivedAmount: eventDoc.amount,
      note: `Donation amount mismatch: expected ${contribAmountNum}, received ${eventAmountNum}`,
      now,
    });
    eventDoc.eventStatus = "AMOUNT_MISMATCH";
    eventDoc.dispatchStatus = "RECONCILIATION_REQUIRED";
    eventDoc.normalizedError = "Donation amount mismatch";
    eventDoc.dispatchLeaseOwner = null;
    eventDoc.dispatchLeaseUntil = null;
    await eventDoc.save({ session });
    return {
      dispatched: false,
      idempotent: false,
      reconciliationRequired: true,
      reconciliationId: recon._id,
      reconciliationReason: recon.reason,
      eventStatus: eventDoc.eventStatus,
      dispatchStatus: eventDoc.dispatchStatus,
    };
  }

  // Step 1: CAS update SponsorContribution -> COMPLETED
  const updatedContribution = await SponsorContribution.findOneAndUpdate(
    { _id: contribution._id, contributionStatus: "PENDING" },
    {
      $set: {
        contributionStatus: "COMPLETED",
        providerStatus: "PAID",
        contributedAt: now,
      },
    },
    { session, returnDocument: "after" }
  );
  if (!updatedContribution) {
    throw new AppError("SponsorContribution state changed concurrently during dispatch", "CONFLICT", 409);
  }

  if (typeof options.simulateErrorAfterStep === "function") {
    await options.simulateErrorAfterStep("CONTRIBUTION_UPDATED", {
      contribution: updatedContribution,
      session,
    });
  }

  // Step 2: Atomically increment ScholarshipCampaign.fundedAmount
  const updatedCampaign = await ScholarshipCampaign.findOneAndUpdate(
    { _id: campaign._id, isDeleted: { $ne: true }, status: "OPEN_FOR_FUNDING" },
    { $inc: { fundedAmount: updatedContribution.amount } },
    { session, returnDocument: "after" }
  );
  if (!updatedCampaign) {
    throw new AppError("ScholarshipCampaign closed concurrently during dispatch", "CONFLICT", 409);
  }

  if (typeof options.simulateErrorAfterStep === "function") {
    await options.simulateErrorAfterStep("CAMPAIGN_FUND_INCREMENTED", {
      contribution: updatedContribution,
      campaign: updatedCampaign,
      session,
    });
  }

  // Step 3: Create SPONSOR_CONTRIBUTION Transaction
  const [donationTx] = await Transaction.create(
    [
      {
        transactionType: "SPONSOR_CONTRIBUTION",
        sourceUserId: updatedContribution.sponsorId,
        destinationUserId: null,
        relatedContributionId: updatedContribution._id,
        relatedBankEventId: eventDoc._id,
        amount: updatedContribution.amount,
        status: "COMPLETED",
      },
    ],
    { session }
  );

  // Step 4: Mark BankTransferEvent as DISPATCHED
  eventDoc.eventStatus = "DISPATCHED";
  eventDoc.dispatchStatus = "DISPATCHED";
  eventDoc.dispatchedAt = now;
  eventDoc.processedAt = now;
  eventDoc.dispatchAttempts = (eventDoc.dispatchAttempts || 0) + 1;
  eventDoc.lastDispatchError = null;
  eventDoc.nextRetryAt = null;
  eventDoc.dispatchLeaseOwner = null;
  eventDoc.dispatchLeaseUntil = null;
  eventDoc.linkedTransactionIds = [donationTx._id];
  await eventDoc.save({ session });

  return {
    dispatched: true,
    idempotent: false,
    reconciliationRequired: false,
    purpose: "DONATION",
    eventStatus: "DISPATCHED",
    dispatchStatus: "DISPATCHED",
    contributionId: updatedContribution._id,
    campaignId: updatedCampaign._id,
    sponsorId: updatedContribution.sponsorId,
    amount: updatedContribution.amount,
    paymentReference: updatedContribution.paymentReference,
    transactionIds: [donationTx._id],
  };
};

/**
 * Dispatch a single verified BankTransferEvent (`READY_FOR_DISPATCH` / `DISPATCH_FAILED` / expired `DISPATCHING` lease).
 * Guaranteed atomic, idempotent, and recoverable on failure.
 */
const dispatchBankTransferEvent = async (eventId, options = {}) => {
  if (!eventId || !mongoose.isValidObjectId(eventId)) {
    throw new AppError("Valid BankTransferEvent id is required", "VALIDATION_ERROR", 400);
  }

  const key = String(eventId);
  if (!options.bypassCoalescing && inflightDispatchPromises.has(key)) {
    const firstResult = await inflightDispatchPromises.get(key);
    return { ...firstResult, dispatched: false, idempotent: true };
  }

  const runPromise = (async () => {
    const now = options.now instanceof Date ? options.now : new Date();
    const leaseMs = Number(options.leaseMs) > 0 ? Number(options.leaseMs) : DEFAULT_LEASE_MS;
    const workerId = options.workerId || `worker_${process.pid}_${crypto.randomUUID()}`;

    const initialEvent = await BankTransferEvent.findById(eventId);
    if (!initialEvent) {
      throw new AppError("BankTransferEvent not found", "EVENT_NOT_FOUND", 404);
    }

    if (
      initialEvent.eventStatus === "DISPATCHED" ||
      initialEvent.dispatchStatus === "DISPATCHED"
    ) {
      return {
        dispatched: false,
        idempotent: true,
        reconciliationRequired: false,
        reason: "ALREADY_DISPATCHED",
        eventId: initialEvent._id,
        eventStatus: "DISPATCHED",
        dispatchStatus: "DISPATCHED",
      };
    }

    if (
      !ELIGIBLE_EVENT_STATUSES.includes(initialEvent.eventStatus) ||
      initialEvent.dispatchStatus === "RECONCILIATION_REQUIRED"
    ) {
      const existingRecon = await PaymentReconciliation.findOne({ eventId: initialEvent._id }).lean();
      return {
        dispatched: false,
        idempotent: false,
        reconciliationRequired: Boolean(existingRecon),
        reconciliationId: existingRecon ? existingRecon._id : null,
        reconciliationReason: existingRecon ? existingRecon.reason : null,
        reason: "EVENT_NOT_ELIGIBLE_FOR_DISPATCH",
        eventId: initialEvent._id,
        eventStatus: initialEvent.eventStatus,
        dispatchStatus: initialEvent.dispatchStatus,
      };
    }

    // Atomic CAS claim with lease so concurrent workers across instances never dispatch the same event twice
    const claimedEvent = await BankTransferEvent.findOneAndUpdate(
      {
        _id: initialEvent._id,
        eventStatus: { $in: ELIGIBLE_EVENT_STATUSES },
        dispatchStatus: { $in: ELIGIBLE_DISPATCH_STATUSES },
        $or: [
          { dispatchLeaseUntil: null },
          { dispatchLeaseUntil: { $lte: now } },
        ],
      },
      {
        $set: {
          eventStatus: "DISPATCHING",
          dispatchStatus: "DISPATCHING",
          dispatchLeaseOwner: workerId,
          dispatchLeaseUntil: new Date(now.getTime() + leaseMs),
        },
      },
      { returnDocument: "after" }
    );

    if (!claimedEvent) {
      const current = await BankTransferEvent.findById(eventId).lean();
      if (current && (current.eventStatus === "DISPATCHED" || current.dispatchStatus === "DISPATCHED")) {
        return {
          dispatched: false,
          idempotent: true,
          reconciliationRequired: false,
          reason: "ALREADY_DISPATCHED",
          eventId: current._id,
          eventStatus: "DISPATCHED",
          dispatchStatus: "DISPATCHED",
        };
      }
      return {
        dispatched: false,
        idempotent: true,
        reconciliationRequired: false,
        reason: "IN_FLIGHT_LEASED",
        eventId: initialEvent._id,
        eventStatus: current ? current.eventStatus : initialEvent.eventStatus,
        dispatchStatus: current ? current.dispatchStatus : initialEvent.dispatchStatus,
      };
    }

    const session = await mongoose.startSession();
    let txResult = null;
    try {
      await session.withTransaction(async () => {
        const eventDoc = await BankTransferEvent.findOne({
          _id: claimedEvent._id,
          dispatchLeaseOwner: workerId,
        }).session(session);

        if (!eventDoc) {
          throw new AppError("Dispatch lease lost before transaction execution", "CONFLICT", 409);
        }

        if (eventDoc.eventStatus === "DISPATCHED" || eventDoc.dispatchStatus === "DISPATCHED") {
          txResult = {
            dispatched: false,
            idempotent: true,
            reconciliationRequired: false,
            reason: "ALREADY_DISPATCHED",
            eventId: eventDoc._id,
            eventStatus: "DISPATCHED",
            dispatchStatus: "DISPATCHED",
          };
          return;
        }

        if (eventDoc.purpose === "TUITION") {
          txResult = await dispatchTuitionWithinTransaction(eventDoc, session, {
            ...options,
            now,
          });
        } else if (eventDoc.purpose === "DONATION") {
          txResult = await dispatchDonationWithinTransaction(eventDoc, session, {
            ...options,
            now,
          });
        } else {
          throw new AppError(`Unsupported event purpose: ${eventDoc.purpose}`, "VALIDATION_ERROR", 400);
        }
      });
    } catch (err) {
      const attempts = (claimedEvent.dispatchAttempts || 0) + 1;
      const backoffMs = computeRetryBackoffMs(attempts);
      const nextRetryAt = new Date(Date.now() + backoffMs);
      const safeErrorMsg = payosService.redactSafeMessage(
        claimedEvent.channelKey || "TUITION",
        err && err.message ? err.message : "Dispatch transaction failed"
      );

      await BankTransferEvent.updateOne(
        { _id: claimedEvent._id },
        {
          $set: {
            eventStatus: "DISPATCH_FAILED",
            dispatchStatus: "DISPATCH_FAILED",
            dispatchAttempts: attempts,
            lastDispatchError: safeErrorMsg,
            nextRetryAt,
            dispatchLeaseOwner: null,
            dispatchLeaseUntil: null,
          },
        }
      );

      if (attempts >= MAX_DISPATCH_ATTEMPTS) {
        console.warn(
          JSON.stringify({
            event: "FINANCIAL_DISPATCH_MAX_RETRIES_REACHED",
            eventId: claimedEvent._id.toString(),
            channelKey: claimedEvent.channelKey,
            purpose: claimedEvent.purpose,
            orderCode: claimedEvent.orderCode,
            dispatchAttempts: attempts,
            lastDispatchError: safeErrorMsg,
            timestamp: new Date().toISOString(),
          })
        );
      }

      if (options.throwOnError) {
        throw err;
      }

      return {
        dispatched: false,
        idempotent: false,
        reconciliationRequired: false,
        reason: "DISPATCH_FAILED",
        eventId: claimedEvent._id,
        eventStatus: "DISPATCH_FAILED",
        dispatchStatus: "DISPATCH_FAILED",
        dispatchAttempts: attempts,
        lastDispatchError: safeErrorMsg,
        nextRetryAt,
      };
    } finally {
      await session.endSession();
    }

    // Best-effort post-commit notifications (never roll back or fail committed financial state)
    if (txResult && txResult.dispatched) {
      try {
        if (txResult.purpose === "TUITION" && txResult.studentId && txResult.enrollmentId) {
          await notify(
            txResult.studentId,
            "Thanh toán thành công",
            "Học phí đã được thanh toán, bạn đã được ghi danh vào lớp.",
            "ENROLLMENT_CONFIRMED"
          );
          await notifyTeacherOfEnrollment(txResult.enrollmentId);
        } else if (txResult.purpose === "DONATION" && txResult.sponsorId) {
          await notify(
            txResult.sponsorId,
            "Xác nhận tài trợ",
            `Khoản tài trợ ${txResult.amount.toString()} VNĐ đã được ghi nhận. Mã giao dịch: ${txResult.paymentReference}.`,
            "CONTRIBUTION_RECEIPT"
          );
        }
      } catch (_notifyErr) {
        // Ignore notification errors after financial commit
      }
    }

    return {
      ...txResult,
      eventId: claimedEvent._id,
    };
  })();

  if (!options.bypassCoalescing) {
    inflightDispatchPromises.set(key, runPromise);
  }
  try {
    return await runPromise;
  } finally {
    if (!options.bypassCoalescing) {
      inflightDispatchPromises.delete(key);
    }
  }
};

/**
 * Outbox Recovery Worker: scans for undispatched or retry-ready BankTransferEvents
 * (including events whose previous worker crashed after ACK or whose lease expired)
 * and dispatches them safely.
 */
const runPendingDispatchWorker = async (options = {}) => {
  const now = options.now instanceof Date ? options.now : new Date();
  const batchSize =
    Number(options.batchSize) > 0
      ? Number(options.batchSize)
      : Number(process.env.FINANCIAL_OUTBOX_BATCH_SIZE) > 0
        ? Number(process.env.FINANCIAL_OUTBOX_BATCH_SIZE)
        : 25;
  const maxAttempts =
    Number(options.maxAttempts) > 0 ? Number(options.maxAttempts) : MAX_DISPATCH_ATTEMPTS;

  // Guard: never run DB queries when MongoDB connection is not ready
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    return {
      status: "SKIPPED_DB_NOT_READY",
      scanned: 0,
      dispatched: 0,
      reconciled: 0,
      failed: 0,
      skipped: 0,
      backlogCount: 0,
      exhaustedCount: 0,
      results: [],
    };
  }

  const eligibleFilter = {
    eventStatus: { $in: ELIGIBLE_EVENT_STATUSES },
    dispatchStatus: { $in: ELIGIBLE_DISPATCH_STATUSES },
    dispatchAttempts: { $lt: maxAttempts },
    $and: [
      {
        $or: [{ nextRetryAt: null }, { nextRetryAt: { $lte: now } }],
      },
      {
        $or: [{ dispatchLeaseUntil: null }, { dispatchLeaseUntil: { $lte: now } }],
      },
    ],
  };

  const candidates = await BankTransferEvent.find(eligibleFilter)
    .sort({ receivedAt: 1 })
    .limit(batchSize)
    .select("_id")
    .lean();

  const summary = {
    status: "COMPLETED",
    scanned: candidates.length,
    dispatched: 0,
    reconciled: 0,
    failed: 0,
    skipped: 0,
    backlogCount: 0,
    exhaustedCount: 0,
    results: [],
  };

  for (const candidate of candidates) {
    const res = await dispatchBankTransferEvent(candidate._id, {
      now,
      leaseMs: options.leaseMs,
    });
    summary.results.push(res);
    if (res.dispatched) {
      summary.dispatched += 1;
    } else if (res.reconciliationRequired) {
      summary.reconciled += 1;
    } else if (res.dispatchStatus === "DISPATCH_FAILED") {
      summary.failed += 1;
    } else {
      summary.skipped += 1;
    }
  }

  const [backlogCount, exhaustedEvents] = await Promise.all([
    BankTransferEvent.countDocuments({
      eventStatus: { $in: ELIGIBLE_EVENT_STATUSES },
      dispatchStatus: { $in: ELIGIBLE_DISPATCH_STATUSES },
      dispatchAttempts: { $lt: maxAttempts },
    }),
    BankTransferEvent.find({
      eventStatus: { $in: ELIGIBLE_EVENT_STATUSES },
      dispatchStatus: { $in: ELIGIBLE_DISPATCH_STATUSES },
      dispatchAttempts: { $gte: maxAttempts },
    })
      .limit(10)
      .select("_id orderCode purpose dispatchAttempts lastDispatchError")
      .lean(),
  ]);

  summary.backlogCount = backlogCount;
  summary.exhaustedCount = exhaustedEvents.length;

  if (exhaustedEvents.length > 0) {
    console.warn(
      JSON.stringify({
        event: "FINANCIAL_OUTBOX_EXHAUSTED_EVENTS_ALERT",
        exhaustedCount: exhaustedEvents.length,
        maxAttempts,
        sampleEvents: exhaustedEvents.map((e) => ({
          eventId: e._id.toString(),
          orderCode: e.orderCode,
          purpose: e.purpose,
          dispatchAttempts: e.dispatchAttempts,
          lastDispatchError: e.lastDispatchError,
        })),
        timestamp: now.toISOString(),
      })
    );
  }

  return summary;
};

/**
 * Read-only Ledger & Financial Integrity Verifier (Section 8 + TIN-FIN-PR5).
 * Cross-checks Payments, SponsorContributions, Enrollments, ScholarshipCampaigns,
 * ScholarshipUsages, Transactions, TeacherEarnings, BankTransferEvents, and PaymentReconciliations.
 */
const verifyLedgerIntegrity = async () => {
  const discrepancies = [];

  const [
    completedPayments,
    completedContributions,
    allEnrollments,
    campaigns,
    scholarships,
    usages,
    transactions,
    earnings,
    events,
    reconciliations,
    refundReviews,
  ] = await Promise.all([
    Payment.find({ paymentStatus: "COMPLETED" }).lean(),
    SponsorContribution.find({ contributionStatus: "COMPLETED" }).lean(),
    Enrollment.find({}).lean(),
    ScholarshipCampaign.find({ isDeleted: { $ne: true } }).lean(),
    Scholarship.find({}).lean(),
    ScholarshipUsage.find({}).lean(),
    Transaction.find({}).lean(),
    TeacherEarning.find({}).lean(),
    BankTransferEvent.find({}).lean(),
    PaymentReconciliation.find({}).lean(),
    SessionRefundReview.find({ status: "APPROVED_FOR_PAYMENT_TEAM" }).lean(),
  ]);

  const confirmedEnrollments = allEnrollments.filter((e) =>
    ["CONFIRMED", "COMPLETED"].includes(e.enrollmentStatus)
  );
  const enrollmentById = new Map(allEnrollments.map((e) => [e._id.toString(), e]));
  const earningByEnrollmentId = new Map(earnings.map((e) => [e.enrollmentId.toString(), e]));

  const txByPaymentId = new Map();
  const unappliedReceiptTxByPaymentId = new Map();
  const refundTxByPaymentId = new Map();
  const txByContributionId = new Map();
  const txByUsageId = new Map();

  let confirmedTuitionRevenueAmount = 0;
  let unappliedLateReceiptsAmount = 0;
  let pendingRefundLiabilityAmount = 0;
  let completedRefundsAmount = 0;
  let donationRevenueAmount = 0;

  for (const tx of transactions) {
    const amt = toNum(tx.amount);
    if (tx.transactionType === "ENROLLMENT_PAYMENT" && tx.status === "COMPLETED") {
      confirmedTuitionRevenueAmount += amt;
      if (tx.relatedPaymentId) {
        txByPaymentId.set(tx.relatedPaymentId.toString(), tx);
      }
    }
    if (tx.transactionType === "UNAPPLIED_TUITION_RECEIPT" && tx.status === "COMPLETED") {
      unappliedLateReceiptsAmount += amt;
      if (tx.relatedPaymentId) {
        unappliedReceiptTxByPaymentId.set(tx.relatedPaymentId.toString(), tx);
      }
    }
    if (tx.transactionType === "REFUND") {
      if (tx.status === "PENDING") {
        pendingRefundLiabilityAmount += amt;
      } else if (tx.status === "COMPLETED") {
        completedRefundsAmount += amt;
      }
      if (tx.relatedPaymentId) {
        refundTxByPaymentId.set(tx.relatedPaymentId.toString(), tx);
      }
    }
    if (tx.transactionType === "SPONSOR_CONTRIBUTION" && tx.status === "COMPLETED") {
      donationRevenueAmount += amt;
      if (tx.relatedContributionId) {
        txByContributionId.set(tx.relatedContributionId.toString(), tx);
      }
    }
    if (
      tx.relatedScholarshipUsageId &&
      tx.transactionType === "SCHOLARSHIP_USAGE" &&
      tx.status === "COMPLETED"
    ) {
      txByUsageId.set(tx.relatedScholarshipUsageId.toString(), tx);
    }
  }

  // 1. Check every COMPLETED Payment has either:
  //    (a) ENROLLMENT_PAYMENT (for confirmed enrollments), OR
  //    (b) BOTH UNAPPLIED_TUITION_RECEIPT (COMPLETED) AND REFUND (PENDING) for late/expired enrollments
  for (const p of completedPayments) {
    const pid = p._id.toString();
    const pAmount = toNum(p.amount);
    const hasEnrollTx = txByPaymentId.has(pid);
    const hasUnappliedReceiptTx = unappliedReceiptTxByPaymentId.has(pid);
    const hasRefundTx = refundTxByPaymentId.has(pid);
    const linkedEnrollment = p.enrollmentId ? enrollmentById.get(p.enrollmentId.toString()) : null;
    const isLateOrExpiredEnrollment =
      linkedEnrollment && !["CONFIRMED", "COMPLETED"].includes(linkedEnrollment.enrollmentStatus);

    if (!hasEnrollTx && !hasRefundTx) {
      discrepancies.push({
        type: "COMPLETED_PAYMENT_MISSING_TRANSACTION",
        paymentId: pid,
        amount: pAmount,
      });
    }

    if (hasEnrollTx && toNum(txByPaymentId.get(pid).amount) !== pAmount) {
      discrepancies.push({
        type: "PAYMENT_TRANSACTION_AMOUNT_MISMATCH",
        paymentId: pid,
        paymentAmount: pAmount,
        txAmount: toNum(txByPaymentId.get(pid).amount),
      });
    }

    if (isLateOrExpiredEnrollment) {
      if (hasEnrollTx) {
        discrepancies.push({
          type: "LATE_PAYMENT_HAS_ENROLLMENT_REVENUE_TX",
          paymentId: pid,
          enrollmentId: linkedEnrollment._id.toString(),
        });
      }
      if (!hasUnappliedReceiptTx) {
        discrepancies.push({
          type: "LATE_PAYMENT_MISSING_UNAPPLIED_RECEIPT_TX",
          paymentId: pid,
          enrollmentId: linkedEnrollment._id.toString(),
          amount: pAmount,
        });
      } else if (toNum(unappliedReceiptTxByPaymentId.get(pid).amount) !== pAmount) {
        discrepancies.push({
          type: "LATE_PAYMENT_UNAPPLIED_RECEIPT_AMOUNT_MISMATCH",
          paymentId: pid,
          paymentAmount: pAmount,
          txAmount: toNum(unappliedReceiptTxByPaymentId.get(pid).amount),
        });
      }
      if (!hasRefundTx) {
        discrepancies.push({
          type: "LATE_PAYMENT_MISSING_REFUND_LIABILITY_TX",
          paymentId: pid,
          enrollmentId: linkedEnrollment._id.toString(),
          amount: pAmount,
        });
      }
      if (earningByEnrollmentId.has(linkedEnrollment._id.toString())) {
        discrepancies.push({
          type: "LATE_PAYMENT_UNEXPECTED_TEACHER_EARNING",
          paymentId: pid,
          enrollmentId: linkedEnrollment._id.toString(),
        });
      }
    }
  }

  // 2. Check every COMPLETED SponsorContribution has matching SPONSOR_CONTRIBUTION transaction (when created via PR3/webhook)
  for (const c of completedContributions) {
    const cid = c._id.toString();
    const matchedTx =
      txByContributionId.get(cid) ||
      transactions.find(
        (t) =>
          t.transactionType === "SPONSOR_CONTRIBUTION" &&
          t.status === "COMPLETED" &&
          t.sourceUserId.toString() === c.sponsorId.toString() &&
          toNum(t.amount) === toNum(c.amount)
      );
    if (!matchedTx) {
      discrepancies.push({
        type: "COMPLETED_CONTRIBUTION_MISSING_TRANSACTION",
        contributionId: cid,
        amount: toNum(c.amount),
      });
    }
  }

  // 3. Check every CONFIRMED/COMPLETED PAID Enrollment has matching tuition equation and TeacherEarning
  for (const e of confirmedEnrollments) {
    const eid = e._id.toString();
    if (e.paymentSource === "FREE" || toNum(e.tuitionAmount) === 0) continue;

    const paidViaPayment = toNum(e.amountPaidViaPayment);
    const paidViaScholarship = toNum(e.amountPaidViaScholarship);
    const tuition = toNum(e.tuitionAmount);

    if (paidViaPayment + paidViaScholarship !== tuition) {
      discrepancies.push({
        type: "ENROLLMENT_TUITION_SUM_MISMATCH",
        enrollmentId: eid,
        paidViaPayment,
        paidViaScholarship,
        tuition,
      });
    }

    const earning = earningByEnrollmentId.get(eid);
    if (!earning) {
      discrepancies.push({
        type: "CONFIRMED_ENROLLMENT_MISSING_TEACHER_EARNING",
        enrollmentId: eid,
      });
    } else {
      const refundedForEnrollment = refundReviews
        .filter((r) => r.enrollmentId.toString() === eid)
        .reduce((sum, r) => sum + Number(r.refundAmount || 0), 0);
      const expectedGross = Math.max(0, tuition - refundedForEnrollment);
      if (toNum(earning.grossAmount) !== expectedGross) {
        discrepancies.push({
          type: "TEACHER_EARNING_GROSS_MISMATCH",
          enrollmentId: eid,
          expectedGross,
          actualGross: toNum(earning.grossAmount),
        });
      }
    }
  }

  // 4. Check every CONFIRMED ScholarshipUsage has a matching SCHOLARSHIP_USAGE Transaction
  for (const u of usages) {
    if (u.status === "CONFIRMED") {
      const uid = u._id.toString();
      const tx = txByUsageId.get(uid);
      if (!tx || toNum(tx.amount) !== toNum(u.amount)) {
        discrepancies.push({
          type: "CONFIRMED_SCHOLARSHIP_USAGE_TX_MISMATCH",
          usageId: uid,
        });
      }
    }
  }

  // 5. Check ScholarshipCampaign fund invariants: fundedAmount >= allocatedAmount and fundedAmount >= usedAmount
  const scholarshipById = new Map(scholarships.map((s) => [s._id.toString(), s]));
  for (const camp of campaigns) {
    const campId = camp._id.toString();
    const funded = toNum(camp.fundedAmount);
    const allocated = toNum(camp.allocatedAmount);
    const used = toNum(camp.usedAmount);

    if (used > funded) {
      discrepancies.push({
        type: "CAMPAIGN_USED_EXCEEDS_FUNDED",
        campaignId: campId,
        funded,
        used,
      });
    }
    if (allocated > funded) {
      discrepancies.push({
        type: "CAMPAIGN_ALLOCATED_EXCEEDS_FUNDED",
        campaignId: campId,
        funded,
        allocated,
      });
    }

    const confirmedUsagesSum = usages
      .filter((u) => {
        if (u.status !== "CONFIRMED") return false;
        const sch = scholarshipById.get(u.scholarshipId.toString());
        return sch && sch.campaignId.toString() === campId;
      })
      .reduce((sum, u) => sum + toNum(u.amount), 0);

    if (confirmedUsagesSum !== used) {
      discrepancies.push({
        type: "CAMPAIGN_USED_AMOUNT_DRIFT",
        campaignId: campId,
        campaignUsedAmount: used,
        confirmedUsagesSum,
      });
    }
  }

  // 6. Check BankTransferEvent vs PaymentReconciliation invariants
  const reconByEventId = new Map(reconciliations.map((r) => [r.eventId.toString(), r]));
  for (const ev of events) {
    const evId = ev._id.toString();
    if (ev.dispatchStatus === "RECONCILIATION_REQUIRED" && !reconByEventId.has(evId)) {
      discrepancies.push({
        type: "EVENT_MISSING_RECONCILIATION",
        eventId: evId,
        eventStatus: ev.eventStatus,
      });
    }
  }

  return {
    valid: discrepancies.length === 0,
    discrepancies,
    summary: {
      completedPaymentsCount: completedPayments.length,
      completedContributionsCount: completedContributions.length,
      confirmedEnrollmentsCount: confirmedEnrollments.length,
      transactionsCount: transactions.length,
      teacherEarningsCount: earnings.length,
      bankEventsCount: events.length,
      dispatchedEventsCount: events.filter((e) => e.dispatchStatus === "DISPATCHED").length,
      pendingDispatchEventsCount: events.filter((e) =>
        ["PENDING_DISPATCH", "DISPATCHING", "DISPATCH_FAILED"].includes(e.dispatchStatus)
      ).length,
      openReconciliationsCount: reconciliations.filter((r) => r.status === "NEEDS_REVIEW").length,
      confirmedTuitionRevenueAmount,
      unappliedLateReceiptsAmount,
      pendingRefundLiabilityAmount,
      completedRefundsAmount,
      donationRevenueAmount,
    },
  };
};

/**
 * Read-only preflight check for Transaction unique indexes (TIN-FIN-PR5 Section 5).
 * Detects any existing duplicate rows in MongoDB that would violate the hardened unique indexes
 * and inspects active indexes on the Transaction collection.
 */
const checkTransactionIndexPreflight = async () => {
  const [
    dupPaymentReceipts,
    dupContributions,
    dupScholarshipUsages,
    dupBankEventSingleTypes,
    dupBankEventScholarshipUsages,
    activeIndexes,
  ] = await Promise.all([
    Transaction.aggregate([
      {
        $match: {
          relatedPaymentId: { $type: "objectId" },
          transactionType: { $in: ["ENROLLMENT_PAYMENT", "UNAPPLIED_TUITION_RECEIPT"] },
        },
      },
      {
        $group: {
          _id: { relatedPaymentId: "$relatedPaymentId", transactionType: "$transactionType" },
          count: { $sum: 1 },
          ids: { $push: "$_id" },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]),
    Transaction.aggregate([
      {
        $match: {
          relatedContributionId: { $type: "objectId" },
          transactionType: "SPONSOR_CONTRIBUTION",
        },
      },
      {
        $group: {
          _id: {
            relatedContributionId: "$relatedContributionId",
            transactionType: "$transactionType",
          },
          count: { $sum: 1 },
          ids: { $push: "$_id" },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]),
    Transaction.aggregate([
      {
        $match: {
          relatedScholarshipUsageId: { $type: "objectId" },
          transactionType: "SCHOLARSHIP_USAGE",
        },
      },
      {
        $group: {
          _id: {
            relatedScholarshipUsageId: "$relatedScholarshipUsageId",
            transactionType: "$transactionType",
          },
          count: { $sum: 1 },
          ids: { $push: "$_id" },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]),
    Transaction.aggregate([
      {
        $match: {
          relatedBankEventId: { $type: "objectId" },
          transactionType: {
            $in: [
              "ENROLLMENT_PAYMENT",
              "UNAPPLIED_TUITION_RECEIPT",
              "SPONSOR_CONTRIBUTION",
              "REFUND",
            ],
          },
        },
      },
      {
        $group: {
          _id: {
            relatedBankEventId: "$relatedBankEventId",
            transactionType: "$transactionType",
          },
          count: { $sum: 1 },
          ids: { $push: "$_id" },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]),
    Transaction.aggregate([
      {
        $match: {
          relatedBankEventId: { $type: "objectId" },
          relatedScholarshipUsageId: { $type: "objectId" },
          transactionType: "SCHOLARSHIP_USAGE",
        },
      },
      {
        $group: {
          _id: {
            relatedBankEventId: "$relatedBankEventId",
            transactionType: "$transactionType",
            relatedScholarshipUsageId: "$relatedScholarshipUsageId",
          },
          count: { $sum: 1 },
          ids: { $push: "$_id" },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]),
    Transaction.collection.indexes().catch(() => []),
  ]);

  const duplicateViolations = [
    ...dupPaymentReceipts.map((d) => ({ index: "uniq_tx_payment_receipt_type", ...d })),
    ...dupContributions.map((d) => ({ index: "uniq_tx_contribution_type", ...d })),
    ...dupScholarshipUsages.map((d) => ({ index: "uniq_tx_scholarship_usage_type", ...d })),
    ...dupBankEventSingleTypes.map((d) => ({ index: "uniq_tx_bank_event_single_type", ...d })),
    ...dupBankEventScholarshipUsages.map((d) => ({
      index: "uniq_tx_bank_event_scholarship_usage",
      ...d,
    })),
  ];

  const requiredIndexNames = [
    "uniq_tx_payment_receipt_type",
    "uniq_tx_contribution_type",
    "uniq_tx_scholarship_usage_type",
    "uniq_tx_bank_event_single_type",
    "uniq_tx_bank_event_scholarship_usage",
  ];
  const existingIndexNames = activeIndexes.map((idx) => idx.name);
  const missingIndexNames = requiredIndexNames.filter(
    (name) => !existingIndexNames.includes(name)
  );

  return {
    safeToMigrate: duplicateViolations.length === 0,
    duplicateViolationsCount: duplicateViolations.length,
    duplicateViolations,
    activeIndexNames: existingIndexNames,
    missingIndexNames,
  };
};

/**
 * Read-only preflight / idempotent backfill planner for legacy late-completed Payments
 * that had a PENDING REFUND Transaction without an UNAPPLIED_TUITION_RECEIPT Transaction.
 * Defaults to dryRun=true (read-only).
 */
const planLatePaymentLedgerBackfill = async ({ dryRun = true } = {}) => {
  const completedPayments = await Payment.find({ paymentStatus: "COMPLETED" }).lean();
  const candidates = [];

  for (const p of completedPayments) {
    const [enrollTx, unappliedTx, refundTx] = await Promise.all([
      Transaction.findOne({
        relatedPaymentId: p._id,
        transactionType: "ENROLLMENT_PAYMENT",
      }).lean(),
      Transaction.findOne({
        relatedPaymentId: p._id,
        transactionType: "UNAPPLIED_TUITION_RECEIPT",
      }).lean(),
      Transaction.findOne({
        relatedPaymentId: p._id,
        transactionType: "REFUND",
      }).lean(),
    ]);

    if (!enrollTx && refundTx && !unappliedTx) {
      candidates.push({
        paymentId: p._id,
        payerUserId: p.payerUserId,
        enrollmentId: p.enrollmentId || refundTx.relatedEnrollmentId || null,
        relatedBankEventId: refundTx.relatedBankEventId || null,
        amount: p.amount,
        refundTxId: refundTx._id,
      });
    }
  }

  let backfilledCount = 0;
  if (!dryRun && candidates.length > 0) {
    for (const item of candidates) {
      const existing = await Transaction.findOne({
        relatedPaymentId: item.paymentId,
        transactionType: "UNAPPLIED_TUITION_RECEIPT",
      });
      if (!existing) {
        await Transaction.create({
          transactionType: "UNAPPLIED_TUITION_RECEIPT",
          sourceUserId: item.payerUserId,
          destinationUserId: null,
          relatedEnrollmentId: item.enrollmentId,
          relatedPaymentId: item.paymentId,
          relatedBankEventId: item.relatedBankEventId,
          amount: item.amount,
          status: "COMPLETED",
        });
        backfilledCount += 1;
      }
    }
  }

  return {
    dryRun: Boolean(dryRun),
    candidatesCount: candidates.length,
    backfilledCount,
    candidates,
  };
};

module.exports = {
  dispatchBankTransferEvent,
  runPendingDispatchWorker,
  verifyLedgerIntegrity,
  checkTransactionIndexPreflight,
  planLatePaymentLedgerBackfill,
  computeRetryBackoffMs,
  MAX_DISPATCH_ATTEMPTS,
};

