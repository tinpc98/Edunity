const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * CUR-11: Per-teacher serialization lock document for MongoDB WiredTiger transactions.
 * Concurrent session creation / generation / update transactions targeting the same teacher
 * increment this lock document, forcing WiredTiger WriteConflict detection and transactional
 * retry so concurrent snapshot reads can never miss overlapping sessions.
 */
const teacherScheduleLockSchema = new Schema(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lockSeq: { type: Number, default: 0, min: 0 },
    lastLockedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

teacherScheduleLockSchema.index({ teacherId: 1 }, { unique: true });

module.exports = mongoose.model("TeacherScheduleLock", teacherScheduleLockSchema);

