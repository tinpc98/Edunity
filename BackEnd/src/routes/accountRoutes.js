const express = require("express");
const controller = require("../controllers/accountController");
const authMiddleware = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/requireRole");

const router = express.Router();
const admin = [authMiddleware, requireRole("ADMIN")];
const teacher = [authMiddleware, requireRole("TEACHER")];
const student = [authMiddleware, requireRole("STUDENT")];
const anyLmsRole = [authMiddleware, requireRole("STUDENT", "TEACHER", "ADMIN")];

// Reviews
router.post("/classes/:id/reviews", student, controller.createReview);
router.get("/classes/:id/reviews", controller.getClassReviews);
router.get("/teachers/:id/reviews", controller.getTeacherReviews);
router.post("/sessions/:id/reviews", student, controller.createSessionReview);
router.get("/sessions/:id/reviews", anyLmsRole, controller.getSessionReviews);
router.get("/classes/:id/session-reviews", anyLmsRole, controller.getClassSessionReviews);
router.get("/me/reviews", student, controller.getMyReviews);
router.delete("/admin/session-reviews/:id", admin, controller.adminDeleteSessionReview);

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

// Admin Platform Settings (G0-05)
router.get("/admin/settings", admin, controller.adminListSettings);
router.get("/admin/settings/:key", admin, controller.adminGetSetting);
router.put("/admin/settings/:key", admin, controller.adminUpdateSetting);
router.post("/admin/settings/:key/rollback", admin, controller.adminRollbackSetting);

module.exports = router;
