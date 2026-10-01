const express = require("express");
const enrollmentController = require("../controllers/enrollmentController");
const authMiddleware = require("../middlewares/authMiddleware");

const router = express.Router();

// GET /api/classes/:classId/availability (Public)
router.get("/classes/:classId/availability", enrollmentController.getClassAvailability);

// GET /api/me/enrollments
router.get("/me/enrollments", authMiddleware, enrollmentController.getMyEnrollments);

// GET /api/enrollments/:id
router.get("/enrollments/:id", authMiddleware, enrollmentController.getEnrollmentById);

// POST /api/enrollments/:id/cancel
router.post("/enrollments/:id/cancel", authMiddleware, enrollmentController.cancelEnrollment);

// POST /api/classes/:classId/enrollments
router.post("/classes/:classId/enrollments", authMiddleware, enrollmentController.createEnrollment);

module.exports = router;
