const mongoose = require("mongoose");
const { Schema } = mongoose;

// Append-only financial ledger. BR-34: completed records must never be hard-deleted.
const transactionSchema = new Schema(
  {
    transactionType: {
      type: String,
      enum: [
        "ENROLLMENT_PAYMENT",
        "UNAPPLIED_TUITION_RECEIPT",
        "SCHOLARSHIP_USAGE",
        "SPONSOR_CONTRIBUTION",
        "TEACHER_PAYOUT",
        "REFUND",
      ],
      required: true,
    },
    sourceUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    destinationUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },

    relatedEnrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment" },
    relatedPaymentId: { type: Schema.Types.ObjectId, ref: "Payment", default: null },
    relatedScholarshipUsageId: { type: Schema.Types.ObjectId, ref: "ScholarshipUsage", default: null },
    relatedContributionId: { type: Schema.Types.ObjectId, ref: "SponsorContribution", default: null },
    relatedBankEventId: { type: Schema.Types.ObjectId, ref: "BankTransferEvent", default: null },

    amount: { type: Schema.Types.Decimal128, required: true },
    status: { type: String, enum: ["PENDING", "COMPLETED", "FAILED"], default: "PENDING" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

transactionSchema.index({ relatedEnrollmentId: 1 });
transactionSchema.index({ sourceUserId: 1, createdAt: -1 });
transactionSchema.index({ destinationUserId: 1, createdAt: -1 });

// DB-level idempotency guards against duplicate financial ledger entries (TIN-FIN-PR5 hardened)
transactionSchema.index(
  { relatedPaymentId: 1, transactionType: 1 },
  {
    name: "uniq_tx_payment_receipt_type",
    unique: true,
    partialFilterExpression: {
      relatedPaymentId: { $type: "objectId" },
      transactionType: {
        $in: ["ENROLLMENT_PAYMENT", "UNAPPLIED_TUITION_RECEIPT"],
      },
    },
  }
);

transactionSchema.index(
  { relatedContributionId: 1, transactionType: 1 },
  {
    name: "uniq_tx_contribution_type",
    unique: true,
    partialFilterExpression: {
      relatedContributionId: { $type: "objectId" },
      transactionType: "SPONSOR_CONTRIBUTION",
    },
  }
);

transactionSchema.index(
  { relatedScholarshipUsageId: 1, transactionType: 1 },
  {
    name: "uniq_tx_scholarship_usage_type",
    unique: true,
    partialFilterExpression: {
      relatedScholarshipUsageId: { $type: "objectId" },
      transactionType: "SCHOLARSHIP_USAGE",
    },
  }
);

// Single-per-bank-event transaction types (excludes SCHOLARSHIP_USAGE so 1 BankTransferEvent can confirm N ScholarshipUsages)
transactionSchema.index(
  { relatedBankEventId: 1, transactionType: 1 },
  {
    name: "uniq_tx_bank_event_single_type",
    unique: true,
    partialFilterExpression: {
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
  }
);

// Compound unique guard for SCHOLARSHIP_USAGE tied to a BankTransferEvent (allows N distinct usages per event, blocks duplicate of same usage)
transactionSchema.index(
  { relatedBankEventId: 1, transactionType: 1, relatedScholarshipUsageId: 1 },
  {
    name: "uniq_tx_bank_event_scholarship_usage",
    unique: true,
    partialFilterExpression: {
      relatedBankEventId: { $type: "objectId" },
      relatedScholarshipUsageId: { $type: "objectId" },
      transactionType: "SCHOLARSHIP_USAGE",
    },
  }
);

module.exports = mongoose.model("Transaction", transactionSchema);
