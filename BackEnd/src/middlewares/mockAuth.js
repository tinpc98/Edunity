const mockAuth = (req, res, next) => {
  if (process.env.NODE_ENV === "test") {
    // In test environment, if req.user is not set by test, set a default mock
    if (!req.user) {
      req.user = {
        _id: "507f1f77bcf86cd799439011",
        role: "STUDENT",
      };
    }
    return next();
  }

  // Outside of test environment, wait for BE-1's JWT middleware.
  // If req.user is still missing (JWT not implemented yet), return 401.
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }

  next();
};

module.exports = mockAuth;
