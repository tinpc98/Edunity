const mongoose = require("mongoose");
const { Schema } = mongoose;

const attendanceStatuses = ["PRESENT", "ABSENT", "LATE", "EXCUSED", "NOT_EVALUATED"];
const correctionSchema = new Schema({
  status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], required: true },
  requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  requestedAt: { type: Date, required: true },
  reason: { type: String, required: true, maxlength: 1000 },
  requestedStatus: { type: String, enum: attendanceStatuses, required: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
  reviewedAt: Date,
  reviewNote: { type: String, maxlength: 1000 },
  method: { type: String, enum: ["MANUAL", "LIVEKIT"] },
  before: { status: String, percent: Number },
  after: { status: String, percent: Number },
});

const sessionAttendanceSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: "Session", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    joinedAt: Date,
    leftAt: Date,
    attendanceStatus: {
      type: String,
      enum: attendanceStatuses,
      default: "ABSENT",
    },

    // Smart Classroom & Verified Presence Tracking (TIN-05D)
    hasVerifiedConnection: { type: Boolean, default: false },
    firstPreOpenJoinAt: { type: Date, default: null },
    firstVerifiedJoinAt: { type: Date, default: null },
    firstValidTeachingJoin: { type: Date, default: null },
    lastVerifiedConnect: { type: Date, default: null },
    lastVerifiedDisconnect: { type: Date, default: null },
    isCurrentlyConnected: { type: Boolean, default: false },
    reconnectionCount: { type: Number, default: 0, min: 0 },
    tokenIssuedCount: { type: Number, default: 0, min: 0 },
    lastTokenIssuedAt: { type: Date, default: null },

    // Duration & Attendance Formula Metrics
    rawOnlineSeconds: { type: Number, default: 0, min: 0 },
    waitingRoomSeconds: { type: Number, default: 0, min: 0 },
    scheduledDurationSeconds: { type: Number, default: 0, min: 0 },
    scheduledOnlineSeconds: { type: Number, default: 0, min: 0 },
    teacherStudentOverlapSeconds: { type: Number, default: 0, min: 0 },
    attendancePercentage: { type: Number, default: 0, min: 0, max: 100 },
    lateArrivalSeconds: { type: Number, default: 0, min: 0 },
    isLate: { type: Boolean, default: false },

    // Evaluation State
    evaluationStatus: {
      type: String,
      enum: ["PENDING", "FINALIZED", "NOT_EVALUATED", "EXCUSED"],
      default: "PENDING",
    },
    evaluationReason: { type: String, default: null },
    finalizedAt: { type: Date, default: null },
    correctionRequest: { type: correctionSchema, default: undefined },
    correctionHistory: { type: [correctionSchema], default: undefined, select: false },
    correctionAppliedAt: Date,
  },
  { timestamps: true }
);

sessionAttendanceSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });
sessionAttendanceSchema.index(
  { "correctionRequest.status": 1, "correctionRequest.requestedAt": -1 },
  { partialFilterExpression: { "correctionRequest.status": { $exists: true } } }
);

module.exports = mongoose.model("SessionAttendance", sessionAttendanceSchema);
