const mongoose = require("mongoose");
const { Schema } = mongoose;

const sessionPresenceIntervalSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: "Session", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["STUDENT", "TEACHER", "ADMIN"], required: true },
    connectionSessionId: { type: String, required: true },
    connectedAt: { type: Date, required: true },
    disconnectedAt: { type: Date, default: null },
    durationSeconds: { type: Number, default: 0, min: 0 },
    source: {
      type: String,
      enum: ["LIVEKIT_WEBHOOK", "LIVEKIT_RECONCILED", "HEARTBEAT", "JOIN_API", "LEAVE_API", "SESSION_END", "SYSTEM_RECOVERY"],
      default: "LIVEKIT_WEBHOOK",
    },
    closeReason: { type: String, default: null },
    processedEventIds: { type: [String], default: [] },
  },
  { timestamps: true }
);

sessionPresenceIntervalSchema.index({ sessionId: 1, userId: 1, connectedAt: 1 });
sessionPresenceIntervalSchema.index(
  { sessionId: 1, userId: 1, connectionSessionId: 1 },
  { unique: true }
);
sessionPresenceIntervalSchema.index({ processedEventIds: 1 });

module.exports = mongoose.model("SessionPresenceInterval", sessionPresenceIntervalSchema);

