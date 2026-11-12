const mongoose = require("mongoose");
const { Schema } = mongoose;

const sponsorContributionSchema = new Schema(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: "ScholarshipCampaign", required: true },
    sponsorId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    amount: { type: Schema.Types.Decimal128, required: true },
    contributionStatus: { type: String, enum: ["PENDING", "COMPLETED", "FAILED"], default: "PENDING" },
    paymentReference: { type: String, default: null }, // idempotency key cho webhook Payment Gateway (mục 9.10)

    // Unified Payment Intent fields (purpose = "DONATION", channelKey = "DONATION")
    purpose: { type: String, enum: ["DONATION"], default: "DONATION" },
    channelKey: { type: String, enum: ["DONATION"], default: "DONATION" },
    provider: { type: String, enum: ["PAYOS", "SANDBOX"], default: "PAYOS" },
    gateway: { type: String, default: "SANDBOX" },
    orderCode: {
      type: Number,
      validate: {
        validator: (v) => v === null || v === undefined || (Number.isSafeInteger(v) && v > 0),
        message: "orderCode must be a positive safe integer",
      },
      default: null,
    },
    paymentLinkId: { type: String, default: null },
    qrCode: { type: String, default: null },
    checkoutUrl: { type: String, default: null },
    expiredAt: { type: Date, default: null },
    providerStatus: { type: String, default: "PENDING" },
    providerCreatedAt: { type: Date, default: null },
    providerMetadata: { type: Schema.Types.Mixed, default: null },
    currency: { type: String, default: "VND" },
    isAnonymous: { type: Boolean, default: false },
    donorDisplayName: { type: String, default: null, trim: true },

    contributedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

sponsorContributionSchema.index({ campaignId: 1 });
sponsorContributionSchema.index({ sponsorId: 1, contributedAt: -1 });
// sparse: PENDING contribution có thể chưa có reference; nhưng đã có thì không được trùng (chống duplicate webhook)
sponsorContributionSchema.index({ paymentReference: 1 }, { unique: true, sparse: true });
sponsorContributionSchema.index(
  { orderCode: 1 },
  {
    unique: true,
    partialFilterExpression: { orderCode: { $type: "number" } },
  }
);

module.exports = mongoose.model("SponsorContribution", sponsorContributionSchema);
