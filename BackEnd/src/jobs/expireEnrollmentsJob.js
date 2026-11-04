const mongoose = require("mongoose");
const cron = require("node-cron");
const Enrollment = require("../models/Enrollment");
const { releaseReservation } = require("../services/reservationService");
const { runExclusive } = require("./jobLock");
const { notify } = require("../services/notificationService");

let isRunning = false;

/**
 * Executes a transaction to expire an enrollment and release reserved resources.
 * Returns true if successful or already processed (idempotent), false if failed.
 */
const expireEnrollmentTransaction = async (enrollmentId) => {
  const released = await releaseReservation(enrollmentId, "EXPIRED");
  if (released) {
    // Tell the student their seat was released, so a lost checkout is not discovered only at the class page
    const enrollment = await Enrollment.findById(enrollmentId).populate("classId", "className").lean();
    if (enrollment && enrollment.enrollmentStatus === "EXPIRED") {
      await notify(
        enrollment.studentId,
        "Hết thời gian giữ chỗ",
        `Đơn đăng ký lớp "${enrollment.classId?.className || ""}" đã hết thời gian thanh toán và chỗ đã được trả lại. Bạn có thể đăng ký lại nếu lớp còn chỗ.`,
        "ENROLLMENT_EXPIRED",
        { dedupeKey: `enrollment:${enrollmentId}:expired` }
      );
    }
  }
  return released;
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
    // With several backend instances only one runs the job (H03)
    runExclusive("expireEnrollments", 55 * 1000, runJob);
  });
  console.log("Expire Enrollments Job started.");
};

module.exports = {
  startJob,
  runJob,
  expireEnrollmentTransaction
};
