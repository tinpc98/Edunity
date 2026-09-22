const mongoose = require("mongoose");
const Enrollment = require("../models/Enrollment");
const Class = require("../models/Class");
const ScholarshipUsage = require("../models/ScholarshipUsage");
const Scholarship = require("../models/Scholarship");

/**
 * Releases a reservation for an enrollment by updating its status,
 * decrementing the class enrolledCount, and releasing scholarships.
 * 
 * @param {string} enrollmentId - The ID of the enrollment.
 * @param {string} targetStatus - The status to set (EXPIRED or CANCELLED).
 * @param {object} options - Options containing an optional mongoose session.
 * @returns {boolean} - True if successfully processed, false if already processed or not found.
 */
const releaseReservation = async (enrollmentId, targetStatus, options = {}) => {
  const session = options.session;
  let success = false;

  const executeLogic = async (sess) => {
    // 1. Mark Enrollment as targetStatus (EXPIRED or CANCELLED)
    // Only update if it is currently PENDING_PAYMENT
    const updateResult = await Enrollment.updateOne(
      { _id: enrollmentId, enrollmentStatus: "PENDING_PAYMENT" },
      { $set: { enrollmentStatus: targetStatus } },
      { session: sess }
    );

    // If not updated, it means it's already processed or status changed (e.g. to CONFIRMED). Idempotent.
    if (updateResult.modifiedCount !== 1) {
      return false;
    }

    // Need to get the enrollment to know classId
    const enrollment = await Enrollment.findById(enrollmentId).session(sess);

    // 2. Decrement enrolledCount in Class
    await Class.updateOne(
      { _id: enrollment.classId },
      { $inc: { enrolledCount: -1 } },
      { session: sess }
    );

    // 3. Release any pending scholarship usage
    const usages = await ScholarshipUsage.find({
      enrollmentId: enrollment._id,
      status: "PENDING"
    }).session(sess);

    for (const usage of usages) {
      usage.status = "RELEASED";
      await usage.save({ session: sess });

      await Scholarship.updateOne(
        { _id: usage.scholarshipId },
        { $inc: { remainingAmount: usage.amount } },
        { session: sess }
      );
    }

    return true;
  };

  if (session) {
    success = await executeLogic(session);
  } else {
    const newSession = await mongoose.startSession();
    try {
      await newSession.withTransaction(async () => {
        success = await executeLogic(newSession);
      });
    } finally {
      newSession.endSession();
    }
  }

  return success;
};

module.exports = {
  releaseReservation
};
