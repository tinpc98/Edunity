const mongoose = require("mongoose");
const cron = require("node-cron");
const Enrollment = require("../models/Enrollment");
const Class = require("../models/Class");
const ScholarshipUsage = require("../models/ScholarshipUsage");
const Scholarship = require("../models/Scholarship");

/**
 * Executes a transaction to expire an enrollment and release reserved resources.
 * Returns true if successful or already processed (idempotent), false if failed.
 */
const expireEnrollmentTransaction = async (enrollmentId) => {
  const session = await mongoose.startSession();
  let success = false;

  try {
    await session.withTransaction(async () => {
      // 1. Mark Enrollment as EXPIRED
      // Find the enrollment but only if it's currently PENDING_PAYMENT.
      const enrollment = await Enrollment.findOneAndUpdate(
        { _id: enrollmentId, enrollmentStatus: "PENDING_PAYMENT" },
        { $set: { enrollmentStatus: "EXPIRED" } },
        { session, new: false } // return old doc to check classId
      );

      // If not found, it means it's already processed or status changed (e.g. to CONFIRMED). Idempotent.
      if (!enrollment) {
        return; // Exits transaction gracefully
      }

      // 2. Decrement enrolledCount in Class
      await Class.updateOne(
        { _id: enrollment.classId },
        { $inc: { enrolledCount: -1 } },
        { session }
      );

      // 3. Release any pending scholarship usage
      // Find any PENDING ScholarshipUsage for this enrollment
      const usages = await ScholarshipUsage.find({
        enrollmentId: enrollment._id,
        status: "PENDING"
      }).session(session);

      for (const usage of usages) {
        // Change status to RELEASED
        usage.status = "RELEASED";
        await usage.save({ session });

        // Refund the scholarship remaining amount
        await Scholarship.updateOne(
          { _id: usage.scholarshipId },
          { $inc: { remainingAmount: usage.amount } },
          { session }
        );
      }
    });

    success = true;
  } catch (error) {
    console.error(`Failed to expire enrollment ${enrollmentId}:`, error);
  } finally {
    session.endSession();
  }

  return success;
};

/**
 * The main job runner that queries for expired enrollments and processes them.
 */
const runJob = async () => {
  const now = new Date();
  try {
    // BR-40: Find all pending enrollments that have expired
    const expiredEnrollments = await Enrollment.find({
      enrollmentStatus: "PENDING_PAYMENT",
      holdExpiresAt: { $lte: now }
    }).select('_id');

    for (const enrollment of expiredEnrollments) {
      await expireEnrollmentTransaction(enrollment._id);
    }
  } catch (err) {
    console.error("Error in expireEnrollmentsJob:", err);
  }
};

/**
 * Initializes and starts the cron job.
 */
const startJob = () => {
  // Run every 1 minute
  cron.schedule("* * * * *", () => {
    runJob();
  });
  console.log("Expire Enrollments Job started.");
};

module.exports = {
  startJob,
  runJob,
  expireEnrollmentTransaction
};
