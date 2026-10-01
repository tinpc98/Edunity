const { FORBIDDEN } = require("../utils/errors");

// NFR-03: role-based access control. Must run after mockAuth.
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(FORBIDDEN(`Only ${roles.join("/")} can perform this action`));
  }
  next();
};

module.exports = requireRole;
