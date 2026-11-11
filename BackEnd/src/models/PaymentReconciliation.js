const mongoose = require("mongoose");
const { Schema } = mongoose;

const RECONCILIATION_REASONS = [
  "UNMATCHED",
  "AMOUNT_MISMATCH",
  "CURRENCY_MISMATCH",
  "LINK_MISMATCH",
  "ACCOUNT_MISMATCH",
  "EXPIRED_PAYMENT",
  "LATE_PAYMENT_REVIEW",
  "LATE_SUCCESS_AFTER_FAILED",
  "PURPOSE_CHANNEL_MISMATCH",
  "REFERENCE_COLLISION",
  "CAMPAIGN_NOT_ACCEPTING_FUNDING",
  "NEEDS_REVIEW",
];

const RECONCILIATION_STATUSES = [
  "NEEDS_REVIEW",
  "IN_REVIEW",
  "RESOLVED_APPROVED",
  "RESOLVED_REFUNDED",
  "RESOLVED_IGNORED",
];

/**
 * Reconciliation record for any verified bank transfer event that cannot be safely auto-dispatched
 * (e.g., unmatched orderCode, amount mismatch, wrong receiver account, expired hold, late payment after FAILED).
 */
const paymentReconciliationSchema = new Schema(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "BankTransferEvent",
      required: true,
      unique: true, // Prevent duplicate reconciliation records for the same BankTransferEvent
    },
    purpose: {
      type: String,
      enum: ["TUITION", "DONATION"],
      required: true,
    },
    channelKey: {
      type: String,
      enum: ["TUITION", "DONATION"],
      required: true,
    },
    orderCode: {
      type: Number,
      default: null,
    },
    paymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },
    contributionId: {
      type: Schema.Types.ObjectId,
      ref: "SponsorContribution",
      default: null,
    },
    enrollmentId: {
      type: Schema.Types.ObjectId,
      ref: "Enrollment",
      default: null,
    },
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: "ScholarshipCampaign",
      default: null,
    },
    reason: {
      type: String,
      enum: RECONCILIATION_REASONS,
      required: true,
    },
    expectedAmount: {
      type: Schema.Types.Decimal128,
      default: null,
    },
    receivedAmount: {
      type: Schema.Types.Decimal128,
      required: true,
    },
    currency: {
      type: String,
      default: "VND",
    },
    status: {
      type: String,
      enum: RECONCILIATION_STATUSES,
      default: "NEEDS_REVIEW",
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolutionNote: {
      type: String,
      default: null,
      trim: true,
    },
    auditReferences: [
      {
        action: { type: String, trim: true },
        note: { type: String, trim: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

paymentReconciliationSchema.index({ status: 1, reason: 1, createdAt: -1 });
paymentReconciliationSchema.index({ paymentId: 1 });
paymentReconciliationSchema.index({ contributionId: 1 });
paymentReconciliationSchema.index({ orderCode: 1 });

module.exports = mongoose.model("PaymentReconciliation", paymentReconciliationSchema);
module.exports.RECONCILIATION_REASONS = RECONCILIATION_REASONS;
module.exports.RECONCILIATION_STATUSES = RECONCILIATION_STATUSES;

