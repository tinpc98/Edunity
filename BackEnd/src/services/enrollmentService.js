const mongoose = require("mongoose");
const Class = require("../models/Class");
const Enrollment = require("../models/Enrollment");
const { getSetting } = require("../utils/settings");
const { 
  CLASS_FULL, 
  ENROLLMENT_CLOSED, 
  CLASS_NOT_OPEN, 
  CLASS_NOT_FOUND, 
  DUPLICATE_ENROLLMENT 
} = require("../utils/errors");

const createEnrollment = async (studentId, classId) => {
  const session = await mongoose.startSession();
  
  let newEnrollment = null;
  
  try {
    await session.withTransaction(async () => {
      // 1. Fetch class info
      const targetClass = await Class.findById(classId).session(session);
      if (!targetClass) {
        throw CLASS_NOT_FOUND();
      }

      // 2. Validate class status & enrollment window
      // BR-15 related (class must be OPEN)
      if (targetClass.status !== "OPEN") {
        throw CLASS_NOT_OPEN();
      }

      const now = new Date();
      if (
        (targetClass.enrollmentStart && now < targetClass.enrollmentStart) ||
        (targetClass.enrollmentEnd && now > targetClass.enrollmentEnd)
      ) {
        throw ENROLLMENT_CLOSED();
      }

      // 3. Prepare enrollment data
      const isFree = targetClass.classType === "FREE";
      // BR-10: FREE=0, PAID>0. snapshot price.
      const tuitionAmount = targetClass.price; 
      
      let holdExpiresAt = null;
      let enrollmentStatus = "PENDING_PAYMENT";
      let paymentSource = "DIRECT_PAYMENT";

      if (isFree) {
        enrollmentStatus = "CONFIRMED";
        paymentSource = "FREE";
      } else {
        // BR-38: keep seat for 15 mins
        const seatHoldDuration = getSetting("SEAT_HOLD_DURATION") || 15 * 60 * 1000;
        holdExpiresAt = new Date(now.getTime() + seatHoldDuration);
      }

      // 4. Update capacity - atomic operation
      // BR-11: enrolledCount < capacity
      const updatedClass = await Class.findOneAndUpdate(
        { 
          _id: classId, 
          $expr: { $lt: ["$enrolledCount", "$capacity"] } 
        },
        { $inc: { enrolledCount: 1 } },
        { session, new: true }
      );

      if (!updatedClass) {
        // If not updated, it could be because class is full or doesn't exist
        // We already checked existence, so it's full.
        throw CLASS_FULL();
      }

      // 5. Create Enrollment
      const enrollmentDoc = new Enrollment({
        classId: targetClass._id,
        courseId: targetClass.courseId, // denormalized
        teacherId: targetClass.teacherId, // denormalized
        studentId: studentId,
        enrollmentStatus,
        paymentSource,
        tuitionAmount,
        enrolledAt: now,
        holdExpiresAt
      });

      try {
        newEnrollment = await enrollmentDoc.save({ session });
      } catch (err) {
        // BR-31: unique index on studentId + classId with active status
        if (err.code === 11000) {
          throw DUPLICATE_ENROLLMENT();
        }
        throw err;
      }
    });

    return newEnrollment;
  } catch (err) {
    // If we caught a DUPLICATE_ENROLLMENT, check if the existing enrollment is actually expired but not processed yet
    if (err.code === "DUPLICATE_ENROLLMENT") {
      const existing = await Enrollment.findOne({ studentId, classId, enrollmentStatus: "PENDING_PAYMENT" });
      if (existing && existing.holdExpiresAt && existing.holdExpiresAt <= new Date()) {
        const { expireEnrollmentTransaction } = require("../jobs/expireEnrollmentsJob");
        await expireEnrollmentTransaction(existing._id);
        // Try creating again after expiring the old one
        return await createEnrollment(studentId, classId);
      }
    }
    throw err;
  } finally {
    session.endSession();
  }
};

const getMyEnrollments = async (studentId) => {
  return await Enrollment.find({ studentId }).sort({ createdAt: -1 }).populate("classId", "className coverImage classType price startDate endDate status");
};

const getEnrollmentById = async (studentId, enrollmentId) => {
  const enrollment = await Enrollment.findOne({ _id: enrollmentId, studentId }).populate("classId");
  return enrollment;
};

module.exports = {
  createEnrollment,
  getMyEnrollments,
  getEnrollmentById
};
