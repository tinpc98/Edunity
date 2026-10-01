const express = require("express");
const controller = require("../controllers/accountController");
const mockAuth = require("../middlewares/mockAuth");
const requireRole = require("../middlewares/requireRole");

const router = express.Router();
const admin = [mockAuth, requireRole("ADMIN")];
const teacher = [mockAuth, requireRole("TEACHER")];

// Reviews
router.post("/classes/:id/reviews", mockAuth, requireRole("STUDENT"), controller.createReview);
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
router.get("/me/notifications", mockAuth, controller.getMyNotifications);
router.post("/me/notifications/read-all", mockAuth, controller.markAllNotificationsAsRead);
router.post("/me/notifications/:id/read", mockAuth, controller.markNotificationAsRead);

module.exports = router;
