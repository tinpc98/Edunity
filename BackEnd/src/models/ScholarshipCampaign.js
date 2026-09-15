const mongoose = require("mongoose");
const { Schema } = mongoose;

const scopeSchema = new Schema(
  {
    categoryIds: [{ type: Schema.Types.ObjectId, ref: "Category" }],
    subjectIds: [{ type: Schema.Types.ObjectId, ref: "Subject" }],
    courseIds: [{ type: Schema.Types.ObjectId, ref: "Course" }],
  },
  { _id: false }
);

const scholarshipCampaignSchema = new Schema(
  {
    createdByAdminId: { type: Schema.Types.ObjectId, ref: "User", required: true }, // BR-16

    title: { type: String, required: true, trim: true },
    description: String,
    eligibilityCriteria: String,
    scope: scopeSchema,

    targetBudget: { type: Schema.Types.Decimal128, required: true },
    fundedAmount: { type: Schema.Types.Decimal128, default: 0 },
    allocatedAmount: { type: Schema.Types.Decimal128, default: 0 }, // BR-37
    usedAmount: { type: Schema.Types.Decimal128, default: 0 },

    expectedSlots: { type: Number, required: true },
    awardAmountPerStudent: { type: Schema.Types.Decimal128, required: true }, // BR-36

    fundingStart: Date,
    fundingEnd: Date,
    applicationStart: Date,
    applicationEnd: Date,

    status: {
      type: String,
      enum: ["DRAFT", "OPEN_FOR_FUNDING", "OPEN_FOR_APPLICATION", "CLOSED"],
      default: "DRAFT",
    },
  },
  { timestamps: true }
);

scholarshipCampaignSchema.index({ status: 1, applicationStart: 1, applicationEnd: 1 });

module.exports = mongoose.model("ScholarshipCampaign", scholarshipCampaignSchema);
