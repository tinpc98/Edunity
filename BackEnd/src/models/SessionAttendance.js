const mongoose = require("mongoose");
const { Schema } = mongoose;

const sessionAttendanceSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: "Session", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    joinedAt: Date,
    leftAt: Date,
    attendanceStatus: {
      type: String,
      enum: ["PRESENT", "ABSENT", "LATE", "EXCUSED", "NOT_EVALUATED"],
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
  },
  { timestamps: true }
);

sessionAttendanceSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model("SessionAttendance", sessionAttendanceSchema);
