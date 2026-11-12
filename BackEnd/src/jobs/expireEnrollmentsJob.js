const mongoose = require("mongoose");
const cron = require("node-cron");
const Enrollment = require("../models/Enrollment");
const reservationService = require("../services/reservationService");
const { runExclusive } = require("./jobLock");
const { notify } = require("../services/notificationService");

let isRunning = false;

/**
 * Executes a transaction to expire an enrollment and release reserved resources.
 * Returns true if successful or already processed (idempotent), false if failed.
 */
const expireEnrollmentTransaction = async (enrollmentId) => {
  const released = await reservationService.releaseReservation(enrollmentId, "EXPIRED");
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
    return { skipped: true, reason: "LOCAL_EXECUTION_IN_PROGRESS" };
  }
  isRunning = true;

  const now = new Date();
  const summary = { skipped: false, processed: 0, released: 0, alreadyHandled: 0, failed: 0, failedIds: [] };
  try {
    // BR-40: Find oldest expired pending enrollments first (FIFO fairness)
    const expiredEnrollments = await Enrollment.find({
      enrollmentStatus: "PENDING_PAYMENT",
      holdExpiresAt: { $lte: now },
    })
      .sort({ holdExpiresAt: 1, _id: 1 })
      .select("_id")
      .limit(100)
      .lean();

    for (const enrollment of expiredEnrollments) {
      summary.processed += 1;
      try {
        const released = await expireEnrollmentTransaction(enrollment._id);
        if (released) summary.released += 1;
        else summary.alreadyHandled += 1;
      } catch (itemErr) {
        summary.failed += 1;
        summary.failedIds.push(enrollment._id.toString());
        console.error(
          `Error expiring enrollment ${enrollment._id.toString()}:`,
          itemErr.message
        );
      }
    }
  } catch (err) {
    console.error("Error in expireEnrollmentsJob:", err);
    summary.error = err.message;
  } finally {
    isRunning = false;
  }
  return summary;
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
