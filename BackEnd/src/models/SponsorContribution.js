const mongoose = require("mongoose");
const { Schema } = mongoose;

const sponsorContributionSchema = new Schema(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: "ScholarshipCampaign", required: true },
    sponsorId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    amount: { type: Schema.Types.Decimal128, required: true },
    contributionStatus: { type: String, enum: ["PENDING", "COMPLETED", "FAILED"], default: "PENDING" },
    paymentReference: { type: String, default: null }, // idempotency key cho webhook Payment Gateway (mục 9.10)
    contributedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

sponsorContributionSchema.index({ campaignId: 1 });
sponsorContributionSchema.index({ sponsorId: 1, contributedAt: -1 });
// sparse: PENDING contribution có thể chưa có reference; nhưng đã có thì không được trùng (chống duplicate webhook)
sponsorContributionSchema.index({ paymentReference: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("SponsorContribution", sponsorContributionSchema);
