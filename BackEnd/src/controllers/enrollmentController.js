const enrollmentService = require("../services/enrollmentService");
const { AppError, ENROLLMENT_NOT_FOUND } = require("../utils/errors");

const createEnrollment = async (req, res, next) => {
  try {
    const studentId = req.user.id; // Mocked from auth middleware
    const classId = req.params.classId;

    const enrollment = await enrollmentService.createEnrollment(studentId, classId);

    // Convert decimal128 to string for response consistency
    const responseData = {
      ...enrollment.toObject(),
      tuitionAmount: enrollment.tuitionAmount.toString(),
      amountPaidViaPayment: enrollment.amountPaidViaPayment.toString(),
      amountPaidViaScholarship: enrollment.amountPaidViaScholarship.toString(),
    };

    res.status(201).json({
      success: true,
      data: responseData
    });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({
        success: false,
        error: err.code,
        message: err.message
      });
    }
    next(err);
  }
};

const getMyEnrollments = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const enrollments = await enrollmentService.getMyEnrollments(studentId);
    
    const responseData = enrollments.map(e => {
      const obj = e.toObject();
      return {
        ...obj,
        tuitionAmount: obj.tuitionAmount.toString(),
        amountPaidViaPayment: obj.amountPaidViaPayment.toString(),
        amountPaidViaScholarship: obj.amountPaidViaScholarship.toString(),
      };
    });

    res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (err) {
    next(err);
  }
};

const getEnrollmentById = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const enrollmentId = req.params.id;

    const enrollment = await enrollmentService.getEnrollmentById(studentId, enrollmentId);
    if (!enrollment) {
      throw ENROLLMENT_NOT_FOUND();
    }

    const responseData = {
      ...enrollment.toObject(),
      tuitionAmount: enrollment.tuitionAmount.toString(),
      amountPaidViaPayment: enrollment.amountPaidViaPayment.toString(),
      amountPaidViaScholarship: enrollment.amountPaidViaScholarship.toString(),
    };

    res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({
        success: false,
        error: err.code,
        message: err.message
      });
    }
    next(err);
  }
};

module.exports = {
  createEnrollment,
  getMyEnrollments,
  getEnrollmentById
};
