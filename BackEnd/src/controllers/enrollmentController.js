const enrollmentService = require("../services/enrollmentService");
const { serializeDecimal128 } = require("../utils/serialize");
const { ENROLLMENT_NOT_FOUND } = require("../utils/errors");

const createEnrollment = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const classId = req.params.classId;

    const enrollment = await enrollmentService.createEnrollment(studentId, classId);
    
    res.status(201).json({
      success: true,
      data: serializeDecimal128(enrollment)
    });
  } catch (err) {
    next(err);
  }
};

const getMyEnrollments = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const { items, total } = await enrollmentService.getMyEnrollments(studentId, page, limit);
    
    res.status(200).json({
      success: true,
      data: {
        items: items.map(serializeDecimal128),
        page,
        limit,
        total
      }
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

    res.status(200).json({
      success: true,
      data: serializeDecimal128(enrollment)
    });
  } catch (err) {
    next(err);
  }
};

const cancelEnrollment = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const enrollmentId = req.params.id;

    await enrollmentService.cancelEnrollment(studentId, enrollmentId);
    
    res.status(200).json({
      success: true,
      message: "Enrollment cancelled successfully"
    });
  } catch (err) {
    next(err);
  }
};

const getClassAvailability = async (req, res, next) => {
  try {
    const classId = req.params.classId;
    const availability = await enrollmentService.getClassAvailability(classId);

    res.status(200).json({
      success: true,
      data: serializeDecimal128(availability)
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createEnrollment,
  getMyEnrollments,
  getEnrollmentById,
  cancelEnrollment,
  getClassAvailability
};
