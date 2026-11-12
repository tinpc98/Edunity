const mongoose = require("mongoose");
const { Schema } = mongoose;

const REFUND_STATUSES = [
  "NEEDS_REVIEW",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "PENDING_BANK_TRANSFER",
  "AWAITING_BANK_VERIFICATION",
  "COMPLETED",
  "CANCELLED",
];

const REFUND_REASONS = [
  "LATE_PAYMENT",
  "OVERPAYMENT",
  "CLASS_CANCELLED",
  "STUDENT_DROPPED",
  "TEACHER_NO_SHOW",
  "SESSION_CANCELLED",
  "DISPUTE_SETTLED",
  "CAMPAIGN_CLOSED",
  "PURPOSE_MISMATCH",
  "OTHER",
];

const refundBankTransferProofSchema = new Schema(
  {
    referenceNumber: { type: String, default: null, trim: true },
    bankReference: { type: String, default: null, trim: true },
    transferredAt: { type: Date, default: null },
    transferProofImage: { type: String, default: null, trim: true },
    submittedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    submittedAt: { type: Date, default: null },
    verifiedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    verifiedAt: { type: Date, default: null },
    notes: { type: String, default: null, trim: true },
  },
  { _id: false }
);

const refundCaseSchema = new Schema(
  {
    caseNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
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

    sourcePaymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },
    relatedContributionId: {
      type: Schema.Types.ObjectId,
      ref: "SponsorContribution",
      default: null,
    },
    relatedBankEventId: {
      type: Schema.Types.ObjectId,
      ref: "BankTransferEvent",
      default: null,
    },
    relatedReconciliationId: {
      type: Schema.Types.ObjectId,
      ref: "PaymentReconciliation",
      default: null,
    },
    relatedEnrollmentId: {
      type: Schema.Types.ObjectId,
      ref: "Enrollment",
      default: null,
    },
    relatedClassId: {
      type: Schema.Types.ObjectId,
      ref: "Class",
      default: null,
    },
    relatedSessionId: {
      type: Schema.Types.ObjectId,
      ref: "Session",
      default: null,
    },

    recipientUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    beneficiaryBankAccount: {
      bankName: { type: String, required: true, trim: true },
      accountNumber: { type: String, required: true, trim: true },
      accountHolderName: { type: String, required: true, trim: true },
    },

    originalAmount: {
      type: Schema.Types.Decimal128,
      required: true,
    },
    eligibleAmount: {
      type: Schema.Types.Decimal128,
      required: true,
    },
    approvedAmount: {
      type: Schema.Types.Decimal128,
      default: null,
    },
    currency: {
      type: String,
      default: "VND",
    },

    reason: {
      type: String,
      required: true,
      trim: true,
    },
    reasonDetails: {
      type: String,
      default: null,
      trim: true,
    },

    status: {
      type: String,
      enum: REFUND_STATUSES,
      default: "NEEDS_REVIEW",
    },
    refundMethod: {
      type: String,
      enum: ["MANUAL_BANK_TRANSFER", "GATEWAY"],
      default: "MANUAL_BANK_TRANSFER",
    },

    bankTransferProof: {
      type: refundBankTransferProofSchema,
      default: () => ({}),
    },

    obligationTransactionId: {
      type: Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
    },
    settlementTransactionId: {
      type: Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
    },

    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rejectionNote: {
      type: String,
      default: null,
      trim: true,
    },

    auditLogs: [
      {
        action: { type: String, required: true, trim: true },
        actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
        actorRole: { type: String, default: null },
        note: { type: String, trim: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

refundCaseSchema.index({ status: 1, createdAt: -1 });
refundCaseSchema.index({ sourcePaymentId: 1, status: 1 });
refundCaseSchema.index({ recipientUserId: 1, status: 1 });
refundCaseSchema.index({ relatedEnrollmentId: 1 });
refundCaseSchema.index({ "bankTransferProof.referenceNumber": 1 }, { sparse: true });

module.exports = mongoose.model("RefundCase", refundCaseSchema);
module.exports.REFUND_STATUSES = REFUND_STATUSES;
module.exports.REFUND_REASONS = REFUND_REASONS;

