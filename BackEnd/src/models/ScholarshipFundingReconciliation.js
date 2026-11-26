const mongoose = require("mongoose");
const { Schema } = mongoose;

const scholarshipFundingReconciliationSchema = new Schema(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: "ScholarshipCampaign", required: true, index: true },
    reconciledBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    eligibleFunding: { type: Schema.Types.Decimal128, required: true },
    refundedFunding: { type: Schema.Types.Decimal128, required: true },
    approvedRefundFunding: { type: Schema.Types.Decimal128, default: 0 },
    pendingFunding: { type: Schema.Types.Decimal128, required: true },
    officialSlots: { type: Number, min: 0, required: true },
    unusedRemainder: { type: Schema.Types.Decimal128, required: true },
    eligibleContributionCount: { type: Number, min: 0, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    supersedesId: { type: Schema.Types.ObjectId, ref: "ScholarshipFundingReconciliation", default: null },
    reconciledAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

scholarshipFundingReconciliationSchema.index({ campaignId: 1, reconciledAt: -1 });

module.exports = mongoose.model("ScholarshipFundingReconciliation", scholarshipFundingReconciliationSchema);
