const mongoose = require("mongoose");
const { Schema } = mongoose;
const { reviewablePlugin } = require("./plugins");

const reportSchema = new Schema(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true }, // = createdBy, không cần field riêng
    reportedUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    classId: { type: Schema.Types.ObjectId, ref: "Class", default: null },
    targetType: { type: String, default: null }, // e.g. "REVIEW", "USER", "CLASS"
    targetId: { type: Schema.Types.ObjectId, default: null },

    type: { type: String, required: true },
    description: String, // nội dung khiếu nại do reporter cung cấp
    status: { type: String, enum: ["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"], default: "OPEN" },
  },
  { timestamps: true }
);

reportSchema.plugin(reviewablePlugin); // reviewedBy / reviewedAt / reviewNote — ghi nhận Admin xử lý khiếu nại

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ targetType: 1, targetId: 1 });

module.exports = mongoose.model("Report", reportSchema);
