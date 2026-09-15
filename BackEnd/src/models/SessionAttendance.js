const mongoose = require("mongoose");
const { Schema } = mongoose;

const sessionAttendanceSchema = new Schema({
  sessionId: { type: Schema.Types.ObjectId, ref: "Session", required: true },
  classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
  studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  joinedAt: Date,
  leftAt: Date,
  attendanceStatus: { type: String, enum: ["PRESENT", "ABSENT", "LATE"], default: "ABSENT" },
});

sessionAttendanceSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model("SessionAttendance", sessionAttendanceSchema);
