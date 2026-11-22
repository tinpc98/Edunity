const mongoose = require("mongoose");
const { Schema } = mongoose;

const tokenRevocationTaskSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    targetStatus: { type: String, enum: ["SUSPENDED", "BANNED"], required: true },
    reason: { type: String, default: null },

    // Token cutoff timestamp: tokens created AFTER this timestamp are issued
    // after account reactivation and MUST NOT be revoked by this task.
    revokeBefore: { type: Date, required: true },

    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"],
      default: "PENDING",
      index: true,
    },

    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    nextRunAt: { type: Date, default: Date.now, index: true },

    // Distributed lease / worker concurrency lock
    lockedUntil: { type: Date, default: null },
    lockedBy: { type: String, default: null },

    lastError: { type: String, default: null },
    revokedCount: { type: Number, default: 0 },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

tokenRevocationTaskSchema.index({ status: 1, nextRunAt: 1, lockedUntil: 1 });
tokenRevocationTaskSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model("TokenRevocationTask", tokenRevocationTaskSchema);
