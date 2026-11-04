const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Lease used by scheduled jobs so that, with several backend instances, only one of them runs a given job at a time.
 * A lease expires on its own (lockedUntil), so a crashed instance never blocks the job forever.
 */
const jobLockSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    owner: { type: String, required: true },
    lockedUntil: { type: Date, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("JobLock", jobLockSchema);
