const mongoose = require("mongoose");
const Class = require("../models/Class");
const Enrollment = require("../models/Enrollment");
const User = require("../models/User");
const { getSetting } = require("../utils/settings");
const { 
  CLASS_FULL, 
  ENROLLMENT_CLOSED, 
  CLASS_NOT_OPEN, 
  CLASS_NOT_FOUND, 
  DUPLICATE_ENROLLMENT 
} = require("../utils/errors");

const createEnrollment = async (studentId, classId, retried = false) => {
  if (!mongoose.isValidObjectId(classId) || !mongoose.isValidObjectId(studentId)) {
    throw CLASS_NOT_FOUND();
  }

  const student = await User.findById(studentId);
  if (!student || student.role !== "STUDENT") {
    const error = new Error("Only STUDENT can enroll");
    error.code = "FORBIDDEN";
    error.statusCode = 403;
    throw error;
  }

  // Check active enrollment first
  const activeEnrollment = await Enrollment.findOne({
    studentId,
    classId,
    enrollmentStatus: { $in: ["PENDING_PAYMENT", "CONFIRMED", "COMPLETED"] }
  });
  if (activeEnrollment) {
    throw DUPLICATE_ENROLLMENT();
  }

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
    if (err.code === "DUPLICATE_ENROLLMENT" && !retried) {
      const existing = await Enrollment.findOne({ studentId, classId, enrollmentStatus: "PENDING_PAYMENT" });
      if (existing && existing.holdExpiresAt && existing.holdExpiresAt <= new Date()) {
        const { releaseReservation } = require("./reservationService");
        await releaseReservation(existing._id, "EXPIRED");
        // Try creating again after expiring the old one (only once)
        return await createEnrollment(studentId, classId, true);
      }
    }
    throw err;
  } finally {
    session.endSession();
  }
};

const getMyEnrollments = async (studentId, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const total = await Enrollment.countDocuments({ studentId });
  const items = await Enrollment.find({ studentId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("classId", "className coverImage classType price startDate endDate status capacity enrolledCount");
  
  return { items, page, limit, total };
};

const getEnrollmentById = async (studentId, enrollmentId) => {
  if (!mongoose.isValidObjectId(enrollmentId)) throw CLASS_NOT_FOUND(); // Using CLASS_NOT_FOUND as general 404 for now, or ENROLLMENT_NOT_FOUND
  const enrollment = await Enrollment.findOne({ _id: enrollmentId, studentId }).populate("classId");
  return enrollment;
};

const cancelEnrollment = async (studentId, enrollmentId) => {
  if (!mongoose.isValidObjectId(enrollmentId)) throw CLASS_NOT_FOUND();
  
  const enrollment = await Enrollment.findOne({ _id: enrollmentId, studentId });
  if (!enrollment) {
    const err = new Error("Enrollment not found");
    err.code = "ENROLLMENT_NOT_FOUND";
    err.statusCode = 404;
    throw err;
  }

  if (enrollment.enrollmentStatus !== "PENDING_PAYMENT") {
    const err = new Error("Enrollment is not cancellable");
    err.code = "ENROLLMENT_NOT_CANCELLABLE";
    err.statusCode = 409;
    throw err;
  }

  const { releaseReservation } = require("./reservationService");
  const success = await releaseReservation(enrollmentId, "CANCELLED");
  return success;
};

const getClassAvailability = async (classId) => {
  if (!mongoose.isValidObjectId(classId)) throw CLASS_NOT_FOUND();
  const targetClass = await Class.findById(classId);
  if (!targetClass) throw CLASS_NOT_FOUND();

  const now = new Date();
  const enrollmentOpen = targetClass.status === "OPEN" &&
    (!targetClass.enrollmentStart || targetClass.enrollmentStart <= now) &&
    (!targetClass.enrollmentEnd || targetClass.enrollmentEnd >= now);

  return {
    capacity: targetClass.capacity,
    enrolledCount: targetClass.enrolledCount,
    remaining: Math.max(0, targetClass.capacity - targetClass.enrolledCount),
    enrollmentOpen,
    classType: targetClass.classType,
    price: targetClass.price
  };
};

module.exports = {
  createEnrollment,
  getMyEnrollments,
  getEnrollmentById,
  cancelEnrollment,
  getClassAvailability
};
