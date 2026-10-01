const express = require("express");
const controller = require("../controllers/communityController");
const fileController = require("../controllers/fileController");
const authMiddleware = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/requireRole");
const { singleFile } = require("../middlewares/upload");

const router = express.Router();
const admin = [authMiddleware, requireRole("ADMIN")];

// Files: private documents (signed URL only) and public images
router.post("/uploads/private", authMiddleware, singleFile, fileController.uploadPrivate);
router.post("/uploads/public", authMiddleware, singleFile, fileController.uploadPublic);
router.post("/files/signed-url", authMiddleware, fileController.createSignedUrl);
router.get("/files/download", fileController.download);

// Profile
router.get("/me/profile", authMiddleware, controller.getMyProfile);
router.patch("/me/profile", authMiddleware, controller.updateMyProfile);
router.post("/me/avatar", authMiddleware, singleFile, controller.updateMyAvatar);
router.post("/me/password", authMiddleware, controller.changeMyPassword);

// Messaging (Student <-> Teacher)
router.get("/conversations", authMiddleware, controller.listMyConversations);
router.post("/conversations", authMiddleware, controller.openConversation);
router.get("/conversations/:id/messages", authMiddleware, controller.listMessages);
router.post("/conversations/:id/messages", authMiddleware, controller.sendMessage);
router.delete("/messages/:id", authMiddleware, controller.deleteMessage);

// Complaints
router.post("/reports", authMiddleware, requireRole("STUDENT", "TEACHER", "SPONSOR"), controller.createReport);
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
