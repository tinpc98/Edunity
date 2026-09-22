class AppError extends Error {
  constructor(message, code, statusCode) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

const errors = {
  CLASS_FULL: (msg = "Class is full") => new AppError(msg, "CLASS_FULL", 409),
  ENROLLMENT_CLOSED: (msg = "Enrollment is closed for this class") => new AppError(msg, "ENROLLMENT_CLOSED", 400),
  CLASS_NOT_OPEN: (msg = "Class is not open for enrollment") => new AppError(msg, "CLASS_NOT_OPEN", 400),
  DUPLICATE_ENROLLMENT: (msg = "You are already enrolled in this class") => new AppError(msg, "DUPLICATE_ENROLLMENT", 409),
  CLASS_NOT_FOUND: (msg = "Class not found") => new AppError(msg, "CLASS_NOT_FOUND", 404),
  ENROLLMENT_NOT_FOUND: (msg = "Enrollment not found") => new AppError(msg, "ENROLLMENT_NOT_FOUND", 404),
};

module.exports = {
  AppError,
  ...errors
};
