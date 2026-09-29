const mockAuth = (req, res, next) => {
  if (process.env.NODE_ENV === "test") {
    // In test environment, if req.user is not set by test, derive it from the
    // "x-user-id" header (tests impersonate different users this way) and
    // fall back to a default mock id when the header is absent.
    if (!req.user) {
      const headerUserId = req.headers["x-user-id"];
      req.user = {
        id: headerUserId || "507f1f77bcf86cd799439011",
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
