const mongoose = require("mongoose");
const { Schema } = mongoose;

const sponsorContributionSchema = new Schema(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: "ScholarshipCampaign", required: true },
    sponsorId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    amount: { type: Schema.Types.Decimal128, required: true },
    contributionStatus: { type: String, enum: ["PENDING", "COMPLETED", "FAILED"], default: "PENDING" },
    paymentReference: String,
    contributedAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

sponsorContributionSchema.index({ campaignId: 1 });
sponsorContributionSchema.index({ sponsorId: 1, contributedAt: -1 });

module.exports = mongoose.model("SponsorContribution", sponsorContributionSchema);
