const mongoose = require("mongoose");
const { Schema } = mongoose;

const teacherDisciplineCaseSchema = new Schema(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    triggerRule: {
      type: String,
      enum: [
        "THREE_YELLOW_WARNINGS",
        "ONE_RED_VIOLATION",
        "THREE_NO_SHOW_VIOLATIONS",
        "EARLY_LEAVE_REVIEW",
      ],
      required: true,
    },
    recommendedAction: {
      type: String,
      enum: [
        "REPUTATION_AND_REMUNERATION_REVIEW",
        "CONTRACT_TERMINATION_REVIEW",
        "ADMIN_DISCIPLINE_REVIEW",
      ],
      required: true,
    },
    triggerViolationIds: [
      { type: Schema.Types.ObjectId, ref: "TeacherViolation", required: true },
    ],
    status: {
      type: String,
      enum: [
        "OPEN_ADMIN_REVIEW",
        "NEEDS_POLICY_CONFIGURATION",
        "RESOLVED_APPROVED",
        "RESOLVED_WAIVED",
      ],
      default: "OPEN_ADMIN_REVIEW",
    },
    autoExecutionBlocked: { type: Boolean, default: true },
    policyBlockerNote: {
      type: String,
      default:
        "Financial deduction formulas, reputation score points, and contract termination rules require Admin/Legal confirmation before execution.",
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    resolutionNote: { type: String, default: null },
  },
  { timestamps: true }
);

teacherDisciplineCaseSchema.index({ teacherId: 1, status: 1, triggerRule: 1 });

module.exports = mongoose.model("TeacherDisciplineCase", teacherDisciplineCaseSchema);

