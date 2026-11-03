const mongoose = require("mongoose");
const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    content: String,
    type: String,
    sessionId: { type: Schema.Types.ObjectId, ref: "Session", default: null },
    dedupeKey: { type: String, default: null },
    deliveryStatus: {
      type: String,
      enum: ["DELIVERED", "PENDING", "FAILED"],
      default: "DELIVERED",
    },
    retryCount: { type: Number, default: 0, min: 0 },
    lastError: { type: String, default: null },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index(
  { userId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } }
);

module.exports = mongoose.model("Notification", notificationSchema);
