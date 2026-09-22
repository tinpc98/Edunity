const mongoose = require("mongoose");
const cron = require("node-cron");
const Enrollment = require("../models/Enrollment");
const { releaseReservation } = require("../services/reservationService");

let isRunning = false;

/**
 * Executes a transaction to expire an enrollment and release reserved resources.
 * Returns true if successful or already processed (idempotent), false if failed.
 */
const expireEnrollmentTransaction = async (enrollmentId) => {
  return await releaseReservation(enrollmentId, "EXPIRED");
};

/**
 * The main job runner that queries for expired enrollments and processes them.
 */
const runJob = async () => {
  if (isRunning) {
    return;
  }
  isRunning = true;

  const now = new Date();
  try {
    // BR-40: Find all pending enrollments that have expired
    const expiredEnrollments = await Enrollment.find({
      enrollmentStatus: "PENDING_PAYMENT",
      holdExpiresAt: { $lte: now }
    }).select('_id').limit(100);

    for (const enrollment of expiredEnrollments) {
      await expireEnrollmentTransaction(enrollment._id);
    }
  } catch (err) {
    console.error("Error in expireEnrollmentsJob:", err);
  } finally {
    isRunning = false;
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
