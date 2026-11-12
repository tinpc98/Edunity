const mongoose = require("mongoose");
const crypto = require("crypto");
const {
  Payment,
  SponsorContribution,
  Enrollment,
  ScholarshipCampaign,
  Transaction,
  BankTransferEvent,
  PaymentReconciliation,
} = require("../models");
const payosService = require("./payosService");
const campaignService = require("./campaignService");
const { releaseReservation } = require("./reservationService");
const financialDispatchService = require("./financialDispatchService");
const { toNum, toDec } = require("../utils/money");
const { AppError } = require("../utils/errors");

// In-process coalescing map for concurrent identical webhook deliveries
const inflightWebhookPromises = new Map();

/**
 * Mask a bank account number so raw account numbers are never stored in logs or public metadata.
 */
const maskAccountNumber = (acc) => {
  if (!acc || typeof acc !== "string") return null;
  const trimmed = acc.trim();
  if (trimmed.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, trimmed.length - 4))}${trimmed.slice(-4)}`;
};

/**
 * Build a deterministic idempotency fingerprint for a verified payOS webhook event.
 */
const buildEventFingerprint = (channelKey, data) => {
  const ref = String(data.reference || "").trim();
  const orderCode = Number(data.orderCode);
  const linkId = String(data.paymentLinkId || "").trim();
  const amount = Math.round(Number(data.amount || 0));
  const raw = `PAYOS:${channelKey}:${ref}:${orderCode}:${linkId}:${amount}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
};

/**
 * Detect whether a verified payOS webhook payload is a URL confirmation / connectivity test probe
 * sent by payOS when registering the webhook URL on the Merchant Portal.
 *
 * CRITICAL FINANCIAL SAFETY RULE:
 * 1. Must ONLY be evaluated AFTER cryptographic signature verification (HMAC-SHA256) passes.
 * 2. Must match the exact payOS registration contract (orderCode: 123, test reference, test amount/account),
 *    never relying solely on orderCode=123 or unverified user strings to bypass validation.
 * 3. Test probes are acknowledged with 200 OK but NEVER touch the ledger, never record revenue,
 *    never confirm enrollments, never add to campaigns, and never create teacher earnings.
 */
const isPayosWebhookTestProbe = (webhookBody, verifiedData) => {
  if (!verifiedData || typeof verifiedData !== "object") {
    return false;
  }
  const orderCode = Number(verifiedData.orderCode);
  const reference = String(verifiedData.reference || "").trim();
  const paymentLinkId = String(verifiedData.paymentLinkId || "").trim();
  const desc = String(verifiedData.description || "").trim();
  const amount = Number(verifiedData.amount);
  const accountNumber = String(verifiedData.accountNumber || "").trim();

  // Official payOS webhook URL verification contract:
  // orderCode=123, reference="TF230204212323", description="VQRIO123", amount=3000, accountNumber="12345678"
  const isOfficialPayosSamplePayload =
    orderCode === 123 &&
    (reference === "TF230204212323" || desc === "VQRIO123" || paymentLinkId === "124c33293c43417ab7879e14c8d9eb18") &&
    (amount === 3000 || accountNumber === "12345678");

  if (isOfficialPayosSamplePayload) {
    return true;
  }

  // Explicit test flag sent by merchant portal connectivity test with orderCode=123
  if (webhookBody && webhookBody.isWebhookTest === true && orderCode === 123) {
    return true;
  }

  return false;
};

/**
 * Validate required fields inside the verified `data` object of a payOS webhook.
 */
const validateVerifiedWebhookData = (verifiedData, webhookBody) => {
  const orderCode = Number(verifiedData.orderCode);
  if (!Number.isSafeInteger(orderCode) || orderCode <= 0) {
    throw new AppError("Webhook data.orderCode must be a positive safe integer", "VALIDATION_ERROR", 400);
  }

  const amountNum = Number(verifiedData.amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0 || !Number.isSafeInteger(Math.round(amountNum))) {
    throw new AppError("Webhook data.amount must be a positive integer", "VALIDATION_ERROR", 400);
  }

  const reference = typeof verifiedData.reference === "string" ? verifiedData.reference.trim() : "";
  if (!reference) {
    throw new AppError("Webhook data.reference is required", "VALIDATION_ERROR", 400);
  }

  const paymentLinkId =
    typeof verifiedData.paymentLinkId === "string" && verifiedData.paymentLinkId.trim()
      ? verifiedData.paymentLinkId.trim()
      : null;
  if (!paymentLinkId) {
    throw new AppError("Webhook data.paymentLinkId is required", "VALIDATION_ERROR", 400);
  }

  const currency =
    typeof verifiedData.currency === "string" && verifiedData.currency.trim()
      ? verifiedData.currency.trim().toUpperCase()
      : "VND";

  // Critically evaluate the signed transaction status (`verifiedData.code`), NOT just the unsigned outer `webhookBody.success`.
  const signedDataCode =
    typeof verifiedData.code === "string" ? verifiedData.code.trim() : "";
  if (!signedDataCode) {
    throw new AppError("Webhook data.code (signed transaction status code) is required", "VALIDATION_ERROR", 400);
  }

  return {
    orderCode,
    amountNum: Math.round(amountNum),
    reference,
    paymentLinkId,
    currency,
    signedDataCode,
    outerCode: webhookBody && typeof webhookBody.code === "string" ? webhookBody.code.trim() : signedDataCode,
    accountNumber:
      typeof verifiedData.accountNumber === "string" && verifiedData.accountNumber.trim()
        ? verifiedData.accountNumber.trim()
        : null,
    transactionDateTime:
      typeof verifiedData.transactionDateTime === "string" ? verifiedData.transactionDateTime : null,
    description: typeof verifiedData.description === "string" ? verifiedData.description : null,
  };
};

/**
 * Determine expected receiver account (if reliably configured on the server or stored in intent's providerMetadata).
 */
const resolveTrustedExpectedAccount = (channelKey, intent) => {
  if (
    intent &&
    intent.providerMetadata &&
    typeof intent.providerMetadata.accountNumber === "string" &&
    intent.providerMetadata.accountNumber.trim()
  ) {
    return intent.providerMetadata.accountNumber.trim();
  }
  const envAccount = (
    process.env[`PAYOS_${channelKey}_EXPECTED_ACCOUNT_NUMBER`] ||
    (channelKey === "TUITION" ? process.env.PAYOS_EXPECTED_ACCOUNT_NUMBER : "") ||
    ""
  ).trim();
  return envAccount || null;
};

/**
 * Format the standard response returned by the Unified Webhook Processor.
 */
const formatWebhookProcessorResult = (
  eventDoc,
  reconciliationDoc = null,
  idempotent = false,
  dispatchResult = null
) => {
  return {
    acknowledged: true,
    idempotent,
    dispatched: dispatchResult
      ? Boolean(dispatchResult.dispatched)
      : eventDoc
      ? eventDoc.dispatchStatus === "DISPATCHED"
      : false,
    dispatchStatus: eventDoc ? eventDoc.dispatchStatus : null,
    eventId: eventDoc ? eventDoc._id : null,
    channelKey: eventDoc ? eventDoc.channelKey : null,
    purpose: eventDoc ? eventDoc.purpose : null,
    orderCode: eventDoc ? eventDoc.orderCode : null,
    providerReference: eventDoc ? eventDoc.providerReference : null,
    eventStatus: idempotent ? "DUPLICATE" : eventDoc ? eventDoc.eventStatus : null,
    originalEventStatus: eventDoc ? eventDoc.eventStatus : null,
    reconciliationId: reconciliationDoc ? reconciliationDoc._id : null,
    reconciliationReason: reconciliationDoc ? reconciliationDoc.reason : null,
    reconciliationStatus: reconciliationDoc ? reconciliationDoc.status : null,
  };
};

/**
 * Ensure a REFERENCE_COLLISION reconciliation record exists when the same providerReference
 * is presented on the same channel under a DIFFERENT orderCode.
 */
const ensureReferenceCollisionReconciliation = async (existingEvent, parsed) => {
  let recon = await PaymentReconciliation.findOne({ eventId: existingEvent._id });
  const collisionNote = `Reference collision: providerReference '${parsed.reference}' already bound to orderCode ${existingEvent.orderCode}, attempted reuse with orderCode ${parsed.orderCode}`;

  if (recon) {
    const alreadyLogged = (recon.auditReferences || []).some(
      (a) => a.action === "REFERENCE_COLLISION_DETECTED" && a.note === collisionNote
    );
    if (!alreadyLogged) {
      recon.auditReferences.push({
        action: "REFERENCE_COLLISION_DETECTED",
        note: collisionNote,
        timestamp: new Date(),
      });
      await recon.save();
    }
    return recon;
  }

  try {
    recon = await PaymentReconciliation.create({
      eventId: existingEvent._id,
      purpose: existingEvent.purpose,
      channelKey: existingEvent.channelKey,
      orderCode: parsed.orderCode,
      paymentId: existingEvent.linkedPaymentId || null,
      contributionId: existingEvent.contributionId || null,
      reason: "REFERENCE_COLLISION",
      expectedAmount: existingEvent.amount,
      receivedAmount: toDec(parsed.amountNum),
      currency: parsed.currency || "VND",
      status: "NEEDS_REVIEW",
      auditReferences: [
        {
          action: "REFERENCE_COLLISION_DETECTED",
          note: collisionNote,
          timestamp: new Date(),
        },
      ],
    });
  } catch (err) {
    if (err && err.code === 11000) {
      recon = await PaymentReconciliation.findOne({ eventId: existingEvent._id });
    } else {
      throw err;
    }
  }
  return recon;
};

/**
 * Look up an existing BankTransferEvent and its PaymentReconciliation (if any) for idempotent ACK.
 * Also handles REFERENCE_COLLISION when the same providerReference is reused with a different orderCode,
 * and triggers recovery dispatch if a previous webhook persisted READY_FOR_DISPATCH / DISPATCH_FAILED.
 */
const findExistingEventResponse = async (channelKey, parsed, fingerprint) => {
  let existingEvent = await BankTransferEvent.findOne({
    $or: [
      { fingerprint },
      { provider: "PAYOS", channelKey, providerReference: parsed.reference },
    ],
  });
  if (!existingEvent) return null;

  // Section 6 Case 6: Same providerReference reused with a DIFFERENT orderCode -> block 2nd credit + record REFERENCE_COLLISION
  if (existingEvent.orderCode !== parsed.orderCode) {
    const collisionRecon = await ensureReferenceCollisionReconciliation(existingEvent, parsed);
    return formatWebhookProcessorResult(existingEvent, collisionRecon, true);
  }

  // If the previous attempt saved the event as READY_FOR_DISPATCH / DISPATCH_FAILED and verify-only is off,
  // allow the duplicate webhook delivery to complete the pending dispatch idempotently.
  if (
    process.env.PAYOS_WEBHOOK_VERIFY_ONLY !== "true" &&
    existingEvent.dispatchStatus !== "DISPATCHED" &&
    existingEvent.dispatchStatus !== "RECONCILIATION_REQUIRED" &&
    ["READY_FOR_DISPATCH", "DISPATCH_FAILED"].includes(existingEvent.eventStatus)
  ) {
    await financialDispatchService.dispatchBankTransferEvent(existingEvent._id);
    existingEvent = await BankTransferEvent.findById(existingEvent._id);
  }

  const existingRecon = await PaymentReconciliation.findOne({
    eventId: existingEvent._id,
  });
  return formatWebhookProcessorResult(existingEvent, existingRecon, true);
};

/**
 * Unified payOS Webhook Processor for both TUITION and DONATION channels (PR2 + PR3).
 */
const processPayosChannelWebhook = async (routeChannelKey, webhookBody, options = {}) => {
  const channelKey = payosService.resolveChannelForPurpose(routeChannelKey);
  const expectedPurpose = channelKey === "DONATION" ? "DONATION" : "TUITION";
  const verifyOnly =
    options?.verifyOnly === true ||
    process.env.PAYOS_WEBHOOK_VERIFY_ONLY === "true";

  // Step 1 & 2: Verify webhook structure and cryptographic signature using official @payos/node SDK
  const verifiedData = await payosService.verifyWebhookPayload(channelKey, webhookBody);

  // Step 3: Check if this is a payOS webhook URL registration test probe
  if (isPayosWebhookTestProbe(webhookBody, verifiedData)) {
    return {
      acknowledged: true,
      idempotent: false,
      dispatched: false,
      isTestWebhook: true,
      channelKey,
      purpose: expectedPurpose,
      eventStatus: "WEBHOOK_TEST_IGNORED",
      dispatchStatus: "NOT_REQUIRED",
      eventId: null,
      reconciliationId: null,
    };
  }

  // Step 4: Validate verified fields inside signed `data`
  const parsed = validateVerifiedWebhookData(verifiedData, webhookBody);
  const fingerprint = buildEventFingerprint(channelKey, verifiedData);
  const coalesceKey = `${channelKey}:${parsed.reference}:${parsed.orderCode}`;

  if (inflightWebhookPromises.has(coalesceKey)) {
    const firstResult = await inflightWebhookPromises.get(coalesceKey);
    return {
      ...firstResult,
      idempotent: true,
      eventStatus: "DUPLICATE",
    };
  }

  const workPromise = (async () => {
    // Fast pre-check for duplicate webhook delivery or reference collision
    const existingPre = await findExistingEventResponse(channelKey, parsed, fingerprint);
    if (existingPre) {
      return existingPre;
    }

    const now = new Date();

    // Step 5: Look up matching intent in DB across Payment and SponsorContribution to detect cross-channel or unmatched orderCode
    const [tuitionIntent, donationIntent] = await Promise.all([
      Payment.findOne({ orderCode: parsed.orderCode }),
      SponsorContribution.findOne({ orderCode: parsed.orderCode }),
    ]);

    const matchedIntent =
      channelKey === "TUITION"
        ? tuitionIntent || donationIntent
        : donationIntent || tuitionIntent;

    const actualIntentPurpose = matchedIntent
      ? matchedIntent.purpose || (matchedIntent.contributionStatus ? "DONATION" : "TUITION")
      : expectedPurpose;

    let eventStatus = "READY_FOR_DISPATCH";
    let reconciliationReason = null;
    let normalizedError = null;
    let linkedEnrollment = null;
    let linkedCampaign = null;

    if (matchedIntent && matchedIntent.enrollmentId) {
      linkedEnrollment = await Enrollment.findById(matchedIntent.enrollmentId).lean();
    }
    if (matchedIntent && matchedIntent.campaignId) {
      linkedCampaign = await ScholarshipCampaign.findById(matchedIntent.campaignId).lean();
    }

    // Step 6: Evaluate business, security, and state rules in strict priority order
    if (!matchedIntent) {
      eventStatus = "UNMATCHED";
      reconciliationReason = "UNMATCHED";
      normalizedError = `No Payment or SponsorContribution found for orderCode ${parsed.orderCode}`;
    } else if (
      actualIntentPurpose !== expectedPurpose ||
      (matchedIntent.channelKey && matchedIntent.channelKey !== channelKey)
    ) {
      eventStatus = "NEEDS_REVIEW";
      reconciliationReason = "PURPOSE_CHANNEL_MISMATCH";
      normalizedError = `Intent purpose/channel (${actualIntentPurpose}) does not match webhook route channel (${channelKey})`;
    } else if (parsed.signedDataCode !== "00") {
      eventStatus = "NEEDS_REVIEW";
      reconciliationReason = "NEEDS_REVIEW";
      normalizedError = `Signed transaction data.code is '${parsed.signedDataCode}' (not '00')`;
    } else if (parsed.currency !== (matchedIntent.currency || "VND").toUpperCase()) {
      eventStatus = "CURRENCY_MISMATCH";
      reconciliationReason = "CURRENCY_MISMATCH";
      normalizedError = `Currency mismatch: expected ${matchedIntent.currency || "VND"}, received ${parsed.currency}`;
    } else if (
      matchedIntent.paymentLinkId &&
      parsed.paymentLinkId &&
      matchedIntent.paymentLinkId !== parsed.paymentLinkId
    ) {
      eventStatus = "LINK_MISMATCH";
      reconciliationReason = "LINK_MISMATCH";
      normalizedError = `paymentLinkId mismatch for orderCode ${parsed.orderCode}`;
    } else {
      const trustedAccount = resolveTrustedExpectedAccount(channelKey, matchedIntent);
      if (trustedAccount && parsed.accountNumber && trustedAccount !== parsed.accountNumber) {
        eventStatus = "ACCOUNT_MISMATCH";
        reconciliationReason = "ACCOUNT_MISMATCH";
        normalizedError = "Receiver bank account does not match verified channel account";
      } else if (parsed.amountNum !== toNum(matchedIntent.amount)) {
        eventStatus = "AMOUNT_MISMATCH";
        reconciliationReason = "AMOUNT_MISMATCH";
        normalizedError = `Amount mismatch: expected ${toNum(matchedIntent.amount)}, received ${parsed.amountNum}`;
      } else {
        const intentStatus =
          matchedIntent.paymentStatus || matchedIntent.contributionStatus || "PENDING";

        if (intentStatus === "FAILED" || intentStatus === "REFUNDED") {
          eventStatus = "LATE_SUCCESS_AFTER_FAILED";
          reconciliationReason = "LATE_SUCCESS_AFTER_FAILED";
          normalizedError = `Transfer succeeded after intent was already marked ${intentStatus}`;
        } else if (
          linkedEnrollment &&
          (linkedEnrollment.enrollmentStatus === "EXPIRED" ||
            linkedEnrollment.enrollmentStatus === "CANCELLED" ||
            linkedEnrollment.enrollmentStatus === "FAILED" ||
            (linkedEnrollment.enrollmentStatus === "PENDING_PAYMENT" &&
              linkedEnrollment.holdExpiresAt &&
              new Date(linkedEnrollment.holdExpiresAt) <= now))
        ) {
          eventStatus = "EXPIRED_PAYMENT";
          reconciliationReason = "LATE_PAYMENT_REVIEW";
          normalizedError = `Transfer arrived after Enrollment (${linkedEnrollment.enrollmentStatus}) hold expired`;
        } else if (
          matchedIntent.expiredAt &&
          new Date(matchedIntent.expiredAt) <= now
        ) {
          eventStatus = "EXPIRED_PAYMENT";
          reconciliationReason =
            expectedPurpose === "DONATION" ? "EXPIRED_PAYMENT" : "LATE_PAYMENT_REVIEW";
          normalizedError = `Transfer arrived after payment intent expiredAt (${new Date(
            matchedIntent.expiredAt
          ).toISOString()})`;
        } else if (
          expectedPurpose === "DONATION" &&
          (!linkedCampaign ||
            linkedCampaign.isDeleted ||
            !campaignService.isAcceptingFunding(linkedCampaign, now))
        ) {
          eventStatus = "NEEDS_REVIEW";
          reconciliationReason = "CAMPAIGN_NOT_ACCEPTING_FUNDING";
          normalizedError = "Donation arrived after ScholarshipCampaign was closed or stopped accepting funding";
        } else {
          eventStatus = "READY_FOR_DISPATCH";
          reconciliationReason = null;
        }
      }
    }

    const safeMetadata = {
      outerCode: parsed.outerCode,
      signedDataCode: parsed.signedDataCode,
      transactionDateTime: parsed.transactionDateTime,
      maskedReceiverAccount: maskAccountNumber(parsed.accountNumber),
      description: parsed.description ? String(parsed.description).slice(0, 50) : null,
    };

    const isTuitionMatch = matchedIntent && actualIntentPurpose === "TUITION";
    const isDonationMatch = matchedIntent && actualIntentPurpose === "DONATION";
    const initialDispatchStatus = reconciliationReason
      ? "RECONCILIATION_REQUIRED"
      : "PENDING_DISPATCH";

    // Step 7: Persist BankTransferEvent (and PaymentReconciliation + late payment ledger if needed) atomically
    const session = await mongoose.startSession();
    let createdEvent = null;
    let createdRecon = null;

    try {
      await session.withTransaction(async () => {
        const [eventDoc] = await BankTransferEvent.create(
          [
            {
              provider: "PAYOS",
              channelKey,
              purpose: expectedPurpose,
              orderCode: parsed.orderCode,
              providerReference: parsed.reference,
              paymentLinkId: parsed.paymentLinkId,
              amount: toDec(parsed.amountNum),
              currency: parsed.currency,
              providerEventCode: parsed.signedDataCode,
              eventStatus,
              dispatchStatus: initialDispatchStatus,
              receivedAt: now,
              processedAt: new Date(),
              linkedPaymentId: isTuitionMatch ? matchedIntent._id : null,
              contributionId: isDonationMatch ? matchedIntent._id : null,
              fingerprint,
              metadata: safeMetadata,
              normalizedError,
            },
          ],
          { session }
        );
        createdEvent = eventDoc;

        if (reconciliationReason) {
          // Section 6 Case 1: Late TUITION payment after Enrollment hold expired or QR expired
          if (
            !verifyOnly &&
            isTuitionMatch &&
            reconciliationReason === "LATE_PAYMENT_REVIEW"
          ) {
            if (
              linkedEnrollment &&
              linkedEnrollment.enrollmentStatus === "PENDING_PAYMENT" &&
              linkedEnrollment.holdExpiresAt &&
              new Date(linkedEnrollment.holdExpiresAt) <= now
            ) {
              await releaseReservation(linkedEnrollment._id, "EXPIRED", { session });
            }

            await Payment.updateOne(
              { _id: matchedIntent._id, paymentStatus: "PENDING" },
              {
                $set: {
                  paymentStatus: "COMPLETED",
                  providerStatus: "PAID",
                  paidAt: now,
                },
              },
              { session }
            );

            // TIN-FIN-PR5: Late payment records TWO distinct financial facts:
            // 1. UNAPPLIED_TUITION_RECEIPT (COMPLETED) -> real cash-in received into TUITION bank account (not class revenue)
            // 2. REFUND (PENDING) -> pending refund obligation (never COMPLETED until bank refund proof)
            const [receiptTx, refundTx] = await Transaction.create(
              [
                {
                  transactionType: "UNAPPLIED_TUITION_RECEIPT",
                  sourceUserId: matchedIntent.payerUserId,
                  destinationUserId: null,
                  relatedEnrollmentId: matchedIntent.enrollmentId || null,
                  relatedPaymentId: matchedIntent._id,
                  relatedBankEventId: eventDoc._id,
                  amount: toDec(parsed.amountNum),
                  status: "COMPLETED",
                },
                {
                  transactionType: "REFUND",
                  sourceUserId: matchedIntent.payerUserId,
                  destinationUserId: null,
                  relatedEnrollmentId: matchedIntent.enrollmentId || null,
                  relatedPaymentId: matchedIntent._id,
                  relatedBankEventId: eventDoc._id,
                  amount: toDec(parsed.amountNum),
                  status: "PENDING",
                },
              ],
              { session, ordered: true }
            );

            eventDoc.linkedTransactionIds = [receiptTx._id, refundTx._id];
            await eventDoc.save({ session });
          }

          const [reconDoc] = await PaymentReconciliation.create(
            [
              {
                eventId: eventDoc._id,
                purpose: expectedPurpose,
                channelKey,
                orderCode: parsed.orderCode,
                paymentId: isTuitionMatch ? matchedIntent._id : null,
                contributionId: isDonationMatch ? matchedIntent._id : null,
                enrollmentId:
                  isTuitionMatch && matchedIntent.enrollmentId
                    ? matchedIntent.enrollmentId
                    : null,
                campaignId:
                  isDonationMatch && matchedIntent.campaignId
                    ? matchedIntent.campaignId
                    : null,
                reason: reconciliationReason,
                expectedAmount: matchedIntent ? matchedIntent.amount : null,
                receivedAmount: toDec(parsed.amountNum),
                currency: parsed.currency,
                status: "NEEDS_REVIEW",
                auditReferences: [
                  {
                    action: "WEBHOOK_RECONCILIATION_OPENED",
                    note: normalizedError || reconciliationReason,
                    timestamp: now,
                  },
                ],
              },
            ],
            { session }
          );
          createdRecon = reconDoc;
        }
      });
    } catch (dbErr) {
      // Handle duplicate key race (E11000) on fingerprint or (provider, channelKey, providerReference)
      if (dbErr && dbErr.code === 11000) {
        const racedExisting = await findExistingEventResponse(
          channelKey,
          parsed,
          fingerprint
        );
        if (racedExisting) {
          return racedExisting;
        }
      }
      throw dbErr;
    } finally {
      await session.endSession();
    }

    // Step 8 (PR3): Immediately trigger Atomic Financial Dispatch if READY_FOR_DISPATCH (unless in PR2 verify-only mode).
    // If dispatch fails due to a transient post-ACK DB error, BankTransferEvent is already durably saved
    // with dispatchStatus="DISPATCH_FAILED" and nextRetryAt so runPendingDispatchWorker will recover it.
    let dispatchResult = null;
    if (
      !verifyOnly &&
      createdEvent &&
      createdEvent.eventStatus === "READY_FOR_DISPATCH"
    ) {
      dispatchResult = await financialDispatchService.dispatchBankTransferEvent(
        createdEvent._id,
        { now }
      );
      createdEvent = await BankTransferEvent.findById(createdEvent._id);
      if (dispatchResult && dispatchResult.reconciliationId) {
        createdRecon = await PaymentReconciliation.findById(dispatchResult.reconciliationId);
      }
    }

    return formatWebhookProcessorResult(createdEvent, createdRecon, false, dispatchResult);
  })();

  inflightWebhookPromises.set(coalesceKey, workPromise);
  try {
    return await workPromise;
  } finally {
    inflightWebhookPromises.delete(coalesceKey);
  }
};

module.exports = {
  processPayosChannelWebhook,
  isPayosWebhookTestProbe,
  buildEventFingerprint,
  maskAccountNumber,
};
