const mongoose = require("mongoose");
const { Schema } = mongoose;

const bankAccountSnapshotSchema = new Schema(
  {
    bankName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    accountHolderName: { type: String, required: true },
  },
  { _id: false }
);

const bankTransferProofSchema = new Schema(
  {
    referenceNumber: { type: String, default: null, trim: true },
    bankReference: { type: String, default: null, trim: true },
    transferredAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    proofDocumentKey: { type: String, default: null, trim: true },
    transferProofImage: { type: String, default: null, trim: true },
    verifiedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    executedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    submittedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    submittedAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    notes: { type: String, default: null, trim: true },
    note: { type: String, default: null, trim: true },
  },
  { _id: false }
);

const payoutSchema = new Schema(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Schema.Types.Decimal128, required: true },

    status: {
      type: String,
      enum: [
        "PENDING",
        "PROCESSING",
        "APPROVED",
        "SCHEDULED",
        "PENDING_BANK_TRANSFER",
        "AWAITING_BANK_VERIFICATION",
        "HELD_FOR_REVIEW",
        "COMPLETED",
        "FAILED",
        "REJECTED",
      ],
      default: "PENDING",
    },
    payoutMethod: { type: String, enum: ["BANK_TRANSFER"], default: "BANK_TRANSFER" },
    bankAccountSnapshot: { type: bankAccountSnapshotSchema, required: true }, // snapshot tại thời điểm yêu cầu

    requestedAt: { type: Date, default: Date.now },
    approvedAt: { type: Date, default: null },
    scheduledAt: { type: Date, default: null }, // Thứ Sáu dự kiến giải ngân
    processedAt: { type: Date, default: null },
    processedBy: { type: Schema.Types.ObjectId, ref: "User", default: null }, // Admin xử lý
    heldReason: { type: String, default: null },

    bankTransferProof: { type: bankTransferProofSchema, default: () => ({}) },

    failureReason: { type: String, default: null }, // khi status = FAILED
    reviewNote: { type: String, default: null }, // khi Admin reject/ghi chú
    auditLogs: [
      {
        action: { type: String, trim: true },
        actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
        actorRole: { type: String, default: null },
        note: { type: String, trim: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

payoutSchema.index({ teacherId: 1, status: 1 });
payoutSchema.index({ status: 1, requestedAt: 1 }); // hàng đợi xử lý cho Admin
payoutSchema.index({ "bankTransferProof.referenceNumber": 1 }, { sparse: true });

module.exports = mongoose.model("Payout", payoutSchema);
