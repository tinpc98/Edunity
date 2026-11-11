const mongoose = require("mongoose");
const { Schema } = mongoose;

const bankProofRegistrySchema = new Schema(
  {
    bankReference: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    bankName: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      default: "UNKNOWN",
    },
    entityType: {
      type: String,
      enum: ["PAYOUT", "REFUND"],
      required: true,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    amount: {
      type: Schema.Types.Decimal128,
      default: null,
    },
    accountNumber: {
      type: String,
      trim: true,
      default: null,
    },
    accountHolderName: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    status: {
      type: String,
      enum: ["PENDING_VERIFICATION", "VERIFIED", "REJECTED"],
      default: "PENDING_VERIFICATION",
    },
    claimedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    claimedAt: {
      type: Date,
      default: Date.now,
    },
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    note: {
      type: String,
      trim: true,
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// Cross-collection uniqueness guarantee: platform-wide unique bankReference
bankProofRegistrySchema.index({ bankReference: 1 }, { unique: true });
bankProofRegistrySchema.index({ bankReference: 1, bankName: 1 });
bankProofRegistrySchema.index({ entityType: 1, entityId: 1 });
bankProofRegistrySchema.index({ status: 1 });

module.exports = mongoose.model("BankProofRegistry", bankProofRegistrySchema);

