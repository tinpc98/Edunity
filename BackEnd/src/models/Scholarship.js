const mongoose = require("mongoose");
const { Schema } = mongoose;

const scholarshipSchema = new Schema(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: "ScholarshipCampaign", required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: "ScholarshipApplication", required: true, unique: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    allocatedAmount: { type: Schema.Types.Decimal128, required: true }, // = campaign.awardAmountPerStudent (BR-37)
    remainingAmount: { type: Schema.Types.Decimal128, required: true },

    validFrom: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    status: { type: String, enum: ["ACTIVE", "EXHAUSTED", "EXPIRED", "REVOKED"], default: "ACTIVE" },
  },
  { timestamps: true }
);

scholarshipSchema.index({ studentId: 1, status: 1 });

module.exports = mongoose.model("Scholarship", scholarshipSchema);
