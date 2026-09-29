const mockAuth = (req, res, next) => {
  if (req.user && req.user.id) {
    return next();
  }

  if (process.env.NODE_ENV === "production" && !req.user) {
    return res.status(401).json({
      success: false,
      error: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }

  const headerUserId = req.headers["x-user-id"];
  const headerUserRole = req.headers["x-user-role"] || "STUDENT";

  if (process.env.NODE_ENV === "test" && !headerUserId) {
    req.user = {
      id: "507f1f77bcf86cd799439011",
      role: headerUserRole,
    };
    return next();
  }

  const mongoose = require("mongoose");
  if (!headerUserId || !mongoose.isValidObjectId(headerUserId)) {
    return res.status(401).json({
      success: false,
      error: "UNAUTHORIZED",
      message: "Valid x-user-id header is required",
    });
  }

  req.user = {
    id: headerUserId,
    role: headerUserRole,
  };

  next();
};

module.exports = mockAuth;
