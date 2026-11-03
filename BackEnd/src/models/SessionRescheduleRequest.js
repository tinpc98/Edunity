const mongoose = require("mongoose");
const { Schema } = mongoose;

const studentConfirmationSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "CANNOT_ATTEND"],
      default: "PENDING",
    },
    respondedAt: { type: Date, default: null },
    note: { type: String, default: null },
  },
  { _id: false }
);

const sessionRescheduleRequestSchema = new Schema(
  {
    originalSessionId: { type: Schema.Types.ObjectId, ref: "Session", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    incidentReportId: {
      type: Schema.Types.ObjectId,
      ref: "TeacherIncidentReport",
      default: null,
    },
    proposedStartDatetime: { type: Date, required: true },
    proposedEndDatetime: { type: Date, required: true },
    proposedTitle: { type: String, default: null },
    reason: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["PENDING_ADMIN_APPROVAL", "APPROVED", "REJECTED", "CANCELLED"],
      default: "PENDING_ADMIN_APPROVAL",
    },
    makeupSessionId: { type: Schema.Types.ObjectId, ref: "Session", default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    adminNote: { type: String, default: null },
    studentConfirmations: { type: [studentConfirmationSchema], default: [] },
  },
  { timestamps: true }
);

sessionRescheduleRequestSchema.index(
  { originalSessionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["PENDING_ADMIN_APPROVAL", "APPROVED"] },
    },
  }
);
sessionRescheduleRequestSchema.index({ classId: 1, status: 1 });

module.exports = mongoose.model("SessionRescheduleRequest", sessionRescheduleRequestSchema);

