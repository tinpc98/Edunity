const mongoose = require("mongoose");
const { Schema } = mongoose;

const escalationEventSchema = new Schema(
  {
    severity: { type: String, enum: ["YELLOW", "RED", "NO_SHOW", "EARLY_LEAVE"], required: true },
    violationType: { type: String, required: true },
    detectedAt: { type: Date, required: true },
    note: { type: String, default: null },
  },
  { _id: false }
);

const teacherViolationSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: "Session", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    violationCategory: {
      type: String,
      enum: ["START_LATENESS", "EARLY_LEAVE", "ABANDONMENT", "OTHER"],
      required: true,
    },
    violationType: {
      type: String,
      enum: [
        "TEACHER_LATE_10M",
        "TEACHER_LATE_20M",
        "TEACHER_NO_SHOW_30M",
        "TEACHER_LEFT_EARLY_30M",
        "TEACHER_BRIEF_PRESENCE",
      ],
      required: true,
    },
    severity: {
      type: String,
      enum: ["YELLOW", "RED", "NO_SHOW", "EARLY_LEAVE"],
      required: true,
    },
    detectedAt: { type: Date, required: true },
    scheduledStartAt: { type: Date, default: null },
    teacherJoinedAt: { type: Date, default: null },
    absenceDurationSeconds: { type: Number, default: 0, min: 0 },
    escalationHistory: { type: [escalationEventSchema], default: [] },
    reviewStatus: {
      type: String,
      enum: [
        "PENDING_INCIDENT_WINDOW",
        "UNDER_INCIDENT_REVIEW",
        "CONFIRMED",
        "WAIVED",
        "DOWNGRADED",
      ],
      default: "PENDING_INCIDENT_WINDOW",
    },
    linkedIncidentReportId: {
      type: Schema.Types.ObjectId,
      ref: "TeacherIncidentReport",
      default: null,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    adminNote: { type: String, default: null },
    countsTowardDiscipline: { type: Boolean, default: false },
    appealStatus: {
      type: String,
      enum: ["NONE", "SUBMITTED", "APPROVED", "REJECTED"],
      default: "NONE",
    },
    appealReason: { type: String, default: null },
    appealedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

teacherViolationSchema.index(
  { sessionId: 1, teacherId: 1, violationCategory: 1 },
  { unique: true }
);
teacherViolationSchema.index({ teacherId: 1, reviewStatus: 1, severity: 1 });

module.exports = mongoose.model("TeacherViolation", teacherViolationSchema);

