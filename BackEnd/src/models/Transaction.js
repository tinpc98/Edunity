const mongoose = require("mongoose");
const { Schema } = mongoose;

// Append-only financial ledger. BR-34: completed records must never be hard-deleted.
const transactionSchema = new Schema(
  {
    transactionType: {
      type: String,
      enum: ["ENROLLMENT_PAYMENT", "SCHOLARSHIP_USAGE", "SPONSOR_CONTRIBUTION", "TEACHER_PAYOUT", "REFUND"],
      required: true,
    },
    sourceUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    destinationUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },

    relatedEnrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment" },
    relatedPaymentId: { type: Schema.Types.ObjectId, ref: "Payment", default: null },
    relatedScholarshipUsageId: { type: Schema.Types.ObjectId, ref: "ScholarshipUsage", default: null },

    amount: { type: Schema.Types.Decimal128, required: true },
    status: { type: String, enum: ["PENDING", "COMPLETED", "FAILED"], default: "PENDING" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

transactionSchema.index({ relatedEnrollmentId: 1 });
transactionSchema.index({ sourceUserId: 1, createdAt: -1 });
transactionSchema.index({ destinationUserId: 1, createdAt: -1 });

module.exports = mongoose.model("Transaction", transactionSchema);
