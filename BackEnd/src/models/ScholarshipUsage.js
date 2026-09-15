const mongoose = require("mongoose");
const { Schema } = mongoose;

const scholarshipUsageSchema = new Schema(
  {
    scholarshipId: { type: Schema.Types.ObjectId, ref: "Scholarship", required: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },

    amount: { type: Schema.Types.Decimal128, required: true },
    usedAt: { type: Date, default: Date.now },
    // PENDING = tạm giữ trong lúc chờ Student thanh toán phần chênh lệch (MIXED, 15 phút)
    status: { type: String, enum: ["PENDING", "CONFIRMED", "RELEASED"], default: "PENDING" },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

scholarshipUsageSchema.index({ enrollmentId: 1 });
scholarshipUsageSchema.index({ scholarshipId: 1 });

module.exports = mongoose.model("ScholarshipUsage", scholarshipUsageSchema);
