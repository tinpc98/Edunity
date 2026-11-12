const mongoose = require("mongoose");
const { Schema } = mongoose;

const teacherSettlementSchema = new Schema(
  {
    earningId: {
      type: Schema.Types.ObjectId,
      ref: "TeacherEarning",
      required: true,
      unique: true,
    },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment", required: true },

    grossAmount: { type: Schema.Types.Decimal128, required: true },
    commissionRate: { type: Number, required: true },
    commissionAmount: { type: Schema.Types.Decimal128, required: true },
    netAmount: { type: Schema.Types.Decimal128, required: true },

    status: {
      type: String,
      enum: ["HELD", "ELIGIBLE_PENDING_MATURITY", "SETTLED_AVAILABLE", "PAID_OUT"],
      default: "HELD",
    },

    milestones: {
      classCompletedAt: { type: Date, default: null },
      lastSessionCompletedAt: { type: Date, default: null },
      lastMakeupCompletedAt: { type: Date, default: null },
      lastDisputeResolvedAt: { type: Date, default: null },
      lastRefundReviewResolvedAt: { type: Date, default: null },
      latestMilestoneAt: { type: Date, default: null },
    },

    settlementEligibleSince: { type: Date, default: null },
    availableAt: { type: Date, default: null },
    settledAt: { type: Date, default: null },

    blockers: [
      {
        code: { type: String, required: true },
        message: { type: String, required: true },
        detectedAt: { type: Date, default: Date.now },
      },
    ],

    auditLogs: [
      {
        action: { type: String, trim: true },
        actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
        note: { type: String, trim: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

teacherSettlementSchema.index({ teacherId: 1, status: 1 });
teacherSettlementSchema.index({ classId: 1 });
teacherSettlementSchema.index({ availableAt: 1, status: 1 });

module.exports = mongoose.model("TeacherSettlement", teacherSettlementSchema);

