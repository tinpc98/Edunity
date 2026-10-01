const express = require("express");
const controller = require("../controllers/communityController");
const fileController = require("../controllers/fileController");
const mockAuth = require("../middlewares/mockAuth");
const requireRole = require("../middlewares/requireRole");
const { singleFile } = require("../middlewares/upload");

const router = express.Router();
const admin = [mockAuth, requireRole("ADMIN")];

// Files: private documents (signed URL only) and public images
router.post("/uploads/private", mockAuth, singleFile, fileController.uploadPrivate);
router.post("/uploads/public", mockAuth, singleFile, fileController.uploadPublic);
router.post("/files/signed-url", mockAuth, fileController.createSignedUrl);
router.get("/files/download", fileController.download);

// Profile
router.get("/me/profile", mockAuth, controller.getMyProfile);
router.patch("/me/profile", mockAuth, controller.updateMyProfile);
router.post("/me/avatar", mockAuth, singleFile, controller.updateMyAvatar);
router.post("/me/password", mockAuth, controller.changeMyPassword);

// Messaging (Student <-> Teacher)
router.get("/conversations", mockAuth, controller.listMyConversations);
router.post("/conversations", mockAuth, controller.openConversation);
router.get("/conversations/:id/messages", mockAuth, controller.listMessages);
router.post("/conversations/:id/messages", mockAuth, controller.sendMessage);
router.delete("/messages/:id", mockAuth, controller.deleteMessage);

// Complaints
router.post("/reports", mockAuth, requireRole("STUDENT", "TEACHER", "SPONSOR"), controller.createReport);
router.get("/me/reports", mockAuth, controller.getMyReports);
router.get("/admin/reports", admin, controller.adminListReports);
router.get("/admin/reports/:id", admin, controller.adminGetReport);
router.patch("/admin/reports/:id", admin, controller.adminUpdateReport);

// Admin — users and dashboard
router.get("/admin/dashboard", admin, controller.getDashboard);
router.get("/admin/users", admin, controller.listUsers);
router.get("/admin/users/:id", admin, controller.getUser);
router.patch("/admin/users/:id/status", admin, controller.updateUserStatus);

module.exports = router;
