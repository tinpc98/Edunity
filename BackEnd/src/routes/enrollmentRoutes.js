const express = require("express");
const enrollmentController = require("../controllers/enrollmentController");

const router = express.Router();

// Mock authentication middleware, usually this will extract user from JWT
const mockAuth = (req, res, next) => {
  const customId = req.headers["x-user-id"];
  req.user = { id: customId || "000000000000000000000000" };
  next();
};

// GET /api/me/enrollments
router.get("/me/enrollments", mockAuth, enrollmentController.getMyEnrollments);

// GET /api/enrollments/:id
router.get("/enrollments/:id", mockAuth, enrollmentController.getEnrollmentById);

// POST /api/classes/:classId/enrollments
// Note: Normally we'd mount this on classRoutes and use mergeParams, 
// but since we only have enrollment routes right now, we can define it directly.
router.post("/classes/:classId/enrollments", mockAuth, enrollmentController.createEnrollment);

module.exports = router;
