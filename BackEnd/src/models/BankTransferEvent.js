const mongoose = require("mongoose");
const { Schema } = mongoose;

const EVENT_STATUSES = [
  "VERIFIED",
  "READY_FOR_DISPATCH",
  "DISPATCHING",
  "DISPATCHED",
  "DISPATCH_FAILED",
  "DUPLICATE",
  "UNMATCHED",
  "AMOUNT_MISMATCH",
  "ACCOUNT_MISMATCH",
  "CURRENCY_MISMATCH",
  "LINK_MISMATCH",
  "EXPIRED_PAYMENT",
  "LATE_SUCCESS_AFTER_FAILED",
  "NEEDS_REVIEW",
  "WEBHOOK_TEST_IGNORED",
];

const DISPATCH_STATUSES = [
  "NOT_REQUIRED",
  "PENDING_DISPATCH",
  "DISPATCHING",
  "DISPATCHED",
  "DISPATCH_FAILED",
  "RECONCILIATION_REQUIRED",
];

/**
 * Append-only record of verified incoming payment gateway / bank transfer webhooks.
 * Never stores secrets, raw credentials, or unredacted sensitive banking PII.
 */
const bankTransferEventSchema = new Schema(
  {
    provider: {
      type: String,
      enum: ["PAYOS", "SANDBOX"],
      default: "PAYOS",
      required: true,
    },
    channelKey: {
      type: String,
      enum: ["TUITION", "DONATION"],
      required: true,
    },
    purpose: {
      type: String,
      enum: ["TUITION", "DONATION"],
      required: true,
    },
    orderCode: {
      type: Number,
      required: true,
      validate: {
        validator: (v) => Number.isSafeInteger(v) && v > 0,
        message: "orderCode must be a positive safe integer",
      },
    },
    providerReference: {
      type: String,
      required: true,
      trim: true,
    },
    paymentLinkId: {
      type: String,
      default: null,
      trim: true,
    },
    amount: {
      type: Schema.Types.Decimal128,
      required: true,
    },
    currency: {
      type: String,
      default: "VND",
      trim: true,
    },
    providerEventCode: {
      type: String,
      default: "00",
      trim: true,
    },
    eventStatus: {
      type: String,
      enum: EVENT_STATUSES,
      required: true,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
    },
    processedAt: {
      type: Date,
      default: Date.now,
    },
    linkedPaymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },
    contributionId: {
      type: Schema.Types.ObjectId,
      ref: "SponsorContribution",
      default: null,
    },
    fingerprint: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: null,
    },
    normalizedError: {
      type: String,
      default: null,
    },
    dispatchStatus: {
      type: String,
      enum: DISPATCH_STATUSES,
      default: "NOT_REQUIRED",
    },
    dispatchAttempts: {
      type: Number,
      default: 0,
    },
    lastDispatchError: {
      type: String,
      default: null,
    },
    dispatchedAt: {
      type: Date,
      default: null,
    },
    nextRetryAt: {
      type: Date,
      default: null,
    },
    dispatchLeaseOwner: {
      type: String,
      default: null,
    },
    dispatchLeaseUntil: {
      type: Date,
      default: null,
    },
    linkedTransactionIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Transaction",
      },
    ],
    linkedTeacherEarningId: {
      type: Schema.Types.ObjectId,
      ref: "TeacherEarning",
      default: null,
    },
  },
  { timestamps: true }
);

// Prevent the same bank reference on a channel from ever being processed/credited twice under different orderCodes
bankTransferEventSchema.index(
  { provider: 1, channelKey: 1, providerReference: 1 },
  {
    unique: true,
    partialFilterExpression: {
      providerReference: { $type: "string" },
    },
  }
);

bankTransferEventSchema.index({ orderCode: 1, receivedAt: -1 });
bankTransferEventSchema.index({ linkedPaymentId: 1 });
bankTransferEventSchema.index({ contributionId: 1 });
bankTransferEventSchema.index({ eventStatus: 1, createdAt: -1 });
bankTransferEventSchema.index({ dispatchStatus: 1, nextRetryAt: 1, dispatchLeaseUntil: 1 });

module.exports = mongoose.model("BankTransferEvent", bankTransferEventSchema);
module.exports.EVENT_STATUSES = EVENT_STATUSES;
module.exports.DISPATCH_STATUSES = DISPATCH_STATUSES;
