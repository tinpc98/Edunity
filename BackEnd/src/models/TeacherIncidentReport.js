const mongoose = require("mongoose");
const { Schema } = mongoose;

const evidenceFileSchema = new Schema(
  {
    storageKey: { type: String, required: true },
    originalName: { type: String, default: null },
    mimeType: { type: String, default: null },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const decisionHistorySchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true },
    previousStatus: { type: String, default: null },
    newStatus: { type: String, required: true },
    reason: { type: String, default: null },
    decidedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const appealEntrySchema = new Schema(
  {
    submittedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, required: true },
    evidenceFiles: { type: [evidenceFileSchema], default: [] },
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: null },
    submittedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const teacherIncidentReportSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: "Session", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    incidentType: {
      type: String,
      enum: [
        "DEVICE_FAILURE",
        "INTERNET_FAILURE",
        "POWER_OUTAGE",
        "HEALTH_ISSUE",
        "PERSONAL_EMERGENCY",
        "PLATFORM_FAILURE",
        "OTHER",
      ],
      required: true,
    },
    description: { type: String, required: true, trim: true },
    evidenceFiles: { type: [evidenceFileSchema], default: [] },
    requestedAction: {
      type: String,
      enum: ["EXCUSE_LATE", "CANCEL_SESSION", "RESCHEDULE_SESSION", "EXCUSE_INTERRUPTION"],
      required: true,
    },
    proposedSchedule: {
      startDatetime: { type: Date, default: null },
      endDatetime: { type: Date, default: null },
      title: { type: String, default: null },
    },
    submittedWithinWindow: { type: Boolean, default: true },
    submissionTiming: {
      type: String,
      enum: ["BEFORE_SESSION", "DURING_SESSION", "WITHIN_24H_AFTER", "LATE_SUBMISSION"],
      default: "DURING_SESSION",
    },
    reviewStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "NEEDS_MORE_EVIDENCE"],
      default: "PENDING",
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    adminDecisionNote: { type: String, default: null },
    linkedViolationId: {
      type: Schema.Types.ObjectId,
      ref: "TeacherViolation",
      default: null,
    },
    linkedRescheduleRequestId: {
      type: Schema.Types.ObjectId,
      ref: "SessionRescheduleRequest",
      default: null,
    },
    decisionHistory: { type: [decisionHistorySchema], default: [] },
    appeals: { type: [appealEntrySchema], default: [] },
  },
  { timestamps: true }
);

teacherIncidentReportSchema.index({ sessionId: 1, teacherId: 1 });
teacherIncidentReportSchema.index({ reviewStatus: 1, createdAt: -1 });

module.exports = mongoose.model("TeacherIncidentReport", teacherIncidentReportSchema);

