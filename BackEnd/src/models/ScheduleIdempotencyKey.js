const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * CUR-11: Transactional idempotency ledger preventing duplicate Session creation
 * when retrying POST /sessions or POST /sessions/generate with an Idempotency-Key.
 */
const scheduleIdempotencyKeySchema = new Schema(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    operation: {
      type: String,
      enum: ["CREATE_SESSIONS", "GENERATE_SESSIONS"],
      required: true,
    },
    idempotencyKey: { type: String, required: true, trim: true },
    requestHash: { type: String, required: true },
    isBulk: { type: Boolean, default: true },
    sessionIds: [{ type: Schema.Types.ObjectId, ref: "Session" }],
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true }
);

scheduleIdempotencyKeySchema.index(
  { teacherId: 1, classId: 1, operation: 1, idempotencyKey: 1 },
  { unique: true }
);
scheduleIdempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("ScheduleIdempotencyKey", scheduleIdempotencyKeySchema);

