const mongoose = require("mongoose");
const { Schema } = mongoose;

const sessionRefundReviewSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: "Session", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", default: null },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment", required: true },
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment", default: null },
    triggerReason: {
      type: String,
      enum: [
        "TEACHER_NO_SHOW",
        "UNEXCUSED_TEACHER_CANCELLATION",
        "INCIDENT_CANCELLED_NO_MAKEUP",
        "RESCHEDULE_DECLINED_BY_STUDENT",
        "TEACHER_LEFT_EARLY",
      ],
      required: true,
    },
    status: {
      type: String,
      enum: [
        "NEEDS_FINANCIAL_REVIEW",
        "RESCHEDULED_WAIVED",
        "APPROVED_FOR_PAYMENT_TEAM",
        "REJECTED",
      ],
      default: "NEEDS_FINANCIAL_REVIEW",
    },
    earningReconciliationStatus: {
      type: String,
      enum: [
        "HOLD_RECOMMENDED",
        "PENDING_PAYMENT_TEAM_REVIEW",
        "CLEARED_AFTER_MAKEUP",
        "RESOLVED",
      ],
      default: "HOLD_RECOMMENDED",
    },
    paidAmountSnapshot: { type: Number, default: null },
    scholarshipAppliedSnapshot: { type: Boolean, default: false },
    crossTeamBlockerNote: {
      type: String,
      default:
        "Course-level vs single-session refund calculation and TeacherEarning adjustment require Chau (Payment/Earnings) and Admin approval.",
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: null },
  },
  { timestamps: true }
);

sessionRefundReviewSchema.index({ sessionId: 1, enrollmentId: 1 }, { unique: true });
sessionRefundReviewSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("SessionRefundReview", sessionRefundReviewSchema);

