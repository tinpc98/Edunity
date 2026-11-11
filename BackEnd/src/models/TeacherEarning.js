const mongoose = require("mongoose");
const { Schema } = mongoose;

const teacherEarningSchema = new Schema(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment", required: true, unique: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },

    grossAmount: { type: Schema.Types.Decimal128, required: true },
    tuitionAmount: { type: Schema.Types.Decimal128, default: null }, // Snapshot of full enrollment tuition at earning creation
    commissionRate: { type: Number, required: true, min: 0, max: 1, default: 0.1 }, // Snapshot of commission rate resolved from policy at earning creation
    appliedPolicyVersion: { type: String, default: "LEGACY_UNVERSIONED", trim: true }, // Immutable snapshot of commission policy version applied at creation
    commissionPolicySource: { type: String, default: "LEGACY_DEFAULT", trim: true }, // Source of policy (RUNTIME_POLICY, ENV_CONFIG, DEV_TEST_FALLBACK)
    commissionAmount: { type: Schema.Types.Decimal128, required: true }, // grossAmount * commissionRate
    netAmount: { type: Schema.Types.Decimal128, required: true }, // grossAmount - commissionAmount
    status: { type: String, enum: ["PENDING", "AVAILABLE", "PAID_OUT", "CANCELLED", "HELD"], default: "PENDING" },

    // V3 Settlement Gate (TIN-FIN-PR7/PR10): All new earnings default to requiring settlement hold (fail-closed)
    settlementHoldRequired: { type: Boolean, default: true },

    // PR7 Settlement Eligibility & Maturity Tracking
    settlementEligibleSince: { type: Date, default: null }, // Thời điểm hoàn thành điều kiện cuối cùng
    availableAt: { type: Date, default: null }, // settlementEligibleSince + 7 ngày
    settledAt: { type: Date, default: null }, // Thời điểm chuyển sang AVAILABLE
    settlementBlockers: [{ type: String, trim: true }], // Danh sách lý do đang chặn quyết toán
    settlementAuditTrail: [
      {
        action: { type: String, trim: true },
        note: { type: String, trim: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],

    // Gắn với Payout khi earning được gộp vào một lần rút tiền (status -> PAID_OUT).
    payoutId: { type: Schema.Types.ObjectId, ref: "Payout", default: null },
  },
  { timestamps: true }
);

teacherEarningSchema.index({ teacherId: 1, createdAt: -1 });
teacherEarningSchema.index({ teacherId: 1, status: 1 }); // tìm các earning AVAILABLE để gộp vào Payout mới
teacherEarningSchema.index({ classId: 1, status: 1 });
teacherEarningSchema.index({ availableAt: 1, status: 1 });

module.exports = mongoose.model("TeacherEarning", teacherEarningSchema);
