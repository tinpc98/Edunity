const mongoose = require("mongoose");
const { Schema } = mongoose;

const scholarshipApplicationSchema = new Schema(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: "ScholarshipCampaign", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    statement: String, // hoàn cảnh/nhu cầu học tập — KHÔNG có field số tiền (BR-36)
    status: {
      type: String,
      enum: ["SUBMITTED", "NEED_MORE_INFORMATION", "APPROVED", "REJECTED"],
      default: "SUBMITTED",
    },
    submittedAt: { type: Date, default: Date.now },
    reviewedByAdminId: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    reviewNote: String,
  },
  { timestamps: true }
);

// BR-29: no duplicate application to the same campaign while one is still active
scholarshipApplicationSchema.index(
  { studentId: 1, campaignId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["SUBMITTED", "NEED_MORE_INFORMATION"] } },
  }
);

module.exports = mongoose.model("ScholarshipApplication", scholarshipApplicationSchema);
