const express = require("express");
const controller = require("../controllers/accountController");
const authMiddleware = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/requireRole");

const router = express.Router();
const admin = [authMiddleware, requireRole("ADMIN")];
const teacher = [authMiddleware, requireRole("TEACHER")];
const student = [authMiddleware, requireRole("STUDENT")];

// Reviews (Class-level)
router.post("/classes/:id/reviews", student, controller.createReview);
router.get("/classes/:id/reviews", controller.getClassReviews);
router.get("/teachers/:id/reviews", controller.getTeacherReviews);
router.get("/me/reviews", student, controller.getMyReviews);

// Teacher verification (BR-01)
router.post("/teacher/verification", teacher, controller.submitVerification);
router.get("/teacher/verification", teacher, controller.getMyVerification);
router.get("/admin/teacher-verifications", admin, controller.adminListVerifications);
router.get("/admin/teacher-verifications/:teacherId", admin, controller.adminGetVerification);
router.post("/admin/teacher-verifications/:teacherId/approve", admin, controller.approveVerification);
router.post("/admin/teacher-verifications/:teacherId/reject", admin, controller.rejectVerification);

// Teacher contracts (TEA-12 / BAO-06..08)
const contractController = require("../controllers/contractController");
router.get("/teacher/contracts", teacher, contractController.listMyContracts);
router.post("/teacher/contracts/:id/sandbox-sign", teacher, contractController.sandboxSign);
router.get("/admin/teachers/:teacherId/contracts", admin, contractController.adminListContracts);
router.post("/admin/teachers/:teacherId/contracts", admin, contractController.adminCreateContract);
router.post("/admin/contracts/:id/end", admin, contractController.adminEndContract);
router.post("/contracts/econtract-webhook", contractController.econtractWebhook);

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
