const express = require("express");
const controller = require("../controllers/communityController");
const aiController = require("../controllers/aiController");
const fileController = require("../controllers/fileController");
const authMiddleware = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/requireRole");
const { singleFile } = require("../middlewares/upload");
const rateLimit = require("../middlewares/rateLimit");

const router = express.Router();
const admin = [authMiddleware, requireRole("ADMIN")];
const teacher = [authMiddleware, requireRole("TEACHER")];
const sponsor = [authMiddleware, requireRole("SPONSOR")];
const classMember = [authMiddleware, requireRole("STUDENT", "TEACHER")];

// Files: private documents (signed URL only) and public images
router.post("/uploads/private", authMiddleware, rateLimit.uploads, singleFile, fileController.uploadPrivate);
router.post("/uploads/public", authMiddleware, rateLimit.uploads, singleFile, fileController.uploadPublic);
router.post("/files/signed-url", authMiddleware, fileController.createSignedUrl);
router.get("/files/download", fileController.download);

// Profile
router.get("/me/profile", authMiddleware, controller.getMyProfile);
router.patch("/me/profile", authMiddleware, controller.updateMyProfile);
router.post("/me/avatar", authMiddleware, rateLimit.uploads, singleFile, controller.updateMyAvatar);
router.post("/me/password", authMiddleware, rateLimit.changePassword, controller.changeMyPassword);

// Messaging (Student <-> Teacher Direct + LMS-13 Class Channels & Moderation)
router.get("/conversations", authMiddleware, controller.listMyConversations);
router.post("/conversations", authMiddleware, controller.openConversation);
router.get("/conversations/:id/messages", authMiddleware, controller.listMessages);
router.post("/conversations/:id/messages", authMiddleware, rateLimit.messages, controller.sendMessage);
router.delete("/messages/:id", authMiddleware, controller.deleteMessage);

// LMS-13: Class Channel Messaging & Moderation
router.get("/classes/:classId/conversation", classMember, controller.openClassConversation);
router.post("/classes/:classId/conversation", classMember, controller.openClassConversation);
router.get("/classes/:classId/conversation/messages", classMember, controller.listClassMessages);
router.post("/classes/:classId/conversation/messages", classMember, rateLimit.messages, controller.sendClassMessage);
router.post("/messages/:id/report", classMember, rateLimit.reports, controller.reportMessage);
router.get("/me/message-reports", classMember, controller.getMyMessageReports);

router.patch("/teacher/classes/:classId/conversation/moderation", teacher, controller.teacherUpdateClassConversationModeration);
router.post("/teacher/classes/:classId/conversation/mute", teacher, controller.teacherMuteClassParticipant);
router.delete("/teacher/classes/:classId/conversation/mute/:studentId", teacher, controller.teacherUnmuteClassParticipant);
router.post("/teacher/classes/:classId/messages/:messageId/moderate", teacher, controller.teacherModerateMessage);

router.get("/admin/message-reports", admin, controller.adminListMessageReports);
router.get("/admin/message-reports/:id", admin, controller.adminGetMessageReport);
router.patch("/admin/message-reports/:id", admin, controller.adminReviewMessageReport);
router.patch("/admin/classes/:classId/conversation/moderation", admin, controller.adminUpdateClassConversationModeration);
router.post("/admin/classes/:classId/conversation/mute", admin, controller.adminMuteClassParticipant);
router.delete("/admin/classes/:classId/conversation/mute/:userId", admin, controller.adminUnmuteClassParticipant);
router.post("/admin/messages/:messageId/moderate", admin, controller.adminModerateMessage);

// AI-04: Sponsor AI Campaign Impact Narrative (Aggregate Only)
router.post("/sponsor/campaigns/:id/ai-impact-narrative", sponsor, aiController.generateSponsorImpactNarrative);

// Complaints
router.post("/reports", authMiddleware, requireRole("STUDENT", "TEACHER", "SPONSOR"), rateLimit.reports, controller.createReport);
router.get("/me/reports", authMiddleware, controller.getMyReports);
router.get("/admin/reports", admin, controller.adminListReports);
router.get("/admin/reports/:id", admin, controller.adminGetReport);
router.patch("/admin/reports/:id", admin, controller.adminUpdateReport);

// Admin — users and dashboard
router.get("/admin/dashboard", admin, controller.getDashboard);
router.get("/admin/users", admin, controller.listUsers);
router.get("/admin/users/:id", admin, controller.getUser);
router.patch("/admin/users/:id/status", admin, controller.updateUserStatus);

module.exports = router;
