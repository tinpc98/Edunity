const express = require("express");
const controller = require("../controllers/teachingController");
const authMiddleware = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/requireRole");

const router = express.Router();
const admin = [authMiddleware, requireRole("ADMIN")];
const teacher = [authMiddleware, requireRole("TEACHER")];

// Teacher — classes
router.get("/teacher/classes", teacher, controller.listMyClasses);
router.post("/teacher/classes", teacher, controller.createClass);
router.get("/teacher/classes/:id", teacher, controller.getMyClass);
router.patch("/teacher/classes/:id", teacher, controller.updateClass);
router.post("/teacher/classes/:id/submit", teacher, controller.submitClass);
router.get("/teacher/classes/:id/students", teacher, controller.getClassStudents);
router.get("/teacher/classes/:id/planned-sessions", teacher, controller.getPlannedSessions);

// Teacher — sessions
router.post("/teacher/classes/:classId/sessions", teacher, controller.createSessions);
router.patch("/teacher/sessions/:id", teacher, controller.updateSession);
router.delete("/teacher/sessions/:id", teacher, controller.deleteSession);
router.post("/teacher/sessions/:id/end", teacher, controller.endSession);
router.get("/teacher/sessions/:id/attendance", teacher, controller.getSessionAttendance);

// Student / Teacher — join the embedded classroom
router.post("/sessions/:id/join", authMiddleware, requireRole("STUDENT", "TEACHER"), controller.joinSession);
router.post("/sessions/livekit-webhook", controller.livekitWebhook);

// Admin — class approval
router.get("/admin/classes/pending", admin, controller.listPendingClasses);
router.get("/admin/classes/:id", admin, controller.getClassForReview);
router.post("/admin/classes/:id/approve", admin, controller.approveClass);
router.post("/admin/classes/:id/reject", admin, controller.rejectClass);

module.exports = router;
