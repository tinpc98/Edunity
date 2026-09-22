const express = require("express");
const enrollmentController = require("../controllers/enrollmentController");
const mockAuth = require("../middlewares/mockAuth");

const router = express.Router();

// GET /api/classes/:classId/availability (Public)
router.get("/classes/:classId/availability", enrollmentController.getClassAvailability);

// GET /api/me/enrollments
router.get("/me/enrollments", mockAuth, enrollmentController.getMyEnrollments);

// GET /api/enrollments/:id
router.get("/enrollments/:id", mockAuth, enrollmentController.getEnrollmentById);

// POST /api/enrollments/:id/cancel
router.post("/enrollments/:id/cancel", mockAuth, enrollmentController.cancelEnrollment);

// POST /api/classes/:classId/enrollments
router.post("/classes/:classId/enrollments", mockAuth, enrollmentController.createEnrollment);

module.exports = router;
