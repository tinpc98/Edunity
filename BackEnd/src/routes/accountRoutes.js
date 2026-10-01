const express = require("express");
const controller = require("../controllers/accountController");
const authMiddleware = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/requireRole");

const router = express.Router();
const admin = [authMiddleware, requireRole("ADMIN")];
const teacher = [authMiddleware, requireRole("TEACHER")];

// Reviews
router.post("/classes/:id/reviews", authMiddleware, requireRole("STUDENT"), controller.createReview);
router.get("/classes/:id/reviews", controller.getClassReviews);
router.get("/teachers/:id/reviews", controller.getTeacherReviews);

// Teacher verification (BR-01)
router.post("/teacher/verification", teacher, controller.submitVerification);
router.get("/teacher/verification", teacher, controller.getMyVerification);
router.get("/admin/teacher-verifications", admin, controller.adminListVerifications);
router.get("/admin/teacher-verifications/:teacherId", admin, controller.adminGetVerification);
router.post("/admin/teacher-verifications/:teacherId/approve", admin, controller.approveVerification);
router.post("/admin/teacher-verifications/:teacherId/reject", admin, controller.rejectVerification);

// Notifications
router.get("/me/notifications", authMiddleware, controller.getMyNotifications);
router.post("/me/notifications/read-all", authMiddleware, controller.markAllNotificationsAsRead);
router.post("/me/notifications/:id/read", authMiddleware, controller.markNotificationAsRead);

module.exports = router;
