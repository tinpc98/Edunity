const profiles = require("../services/profileService");
const messaging = require("../services/messagingService");
const reports = require("../services/reportService");
const admin = require("../services/adminService");
const { handle, parsePaging } = require("../utils/http");

const body = (req) => req.body || {};

// Profile
exports.getMyProfile = handle((req) => profiles.getMyProfile(req.user.id));
exports.updateMyProfile = handle((req) => profiles.updateMyProfile(req.user.id, body(req)));
exports.updateMyAvatar = handle((req) => profiles.updateMyAvatar(req.user.id, req.file));
exports.changeMyPassword = handle((req) => profiles.changeMyPassword(req.user.id, body(req)));

// Messaging
exports.openConversation = handle((req) => messaging.openConversation(req.user, body(req)));
exports.listMyConversations = handle((req) => messaging.listMyConversations(req.user.id, parsePaging(req.query)));
exports.listMessages = handle((req) => messaging.listMessages(req.user.id, req.params.id, req.query));
exports.sendMessage = handle((req) => messaging.sendMessage(req.user, req.params.id, body(req)), 201);
exports.deleteMessage = handle((req) => messaging.deleteMessage(req.user.id, req.params.id));

// Complaints
exports.createReport = handle((req) => reports.createReport(req.user, body(req)), 201);
exports.getMyReports = handle((req) => reports.getMyReports(req.user.id, parsePaging(req.query)));
exports.adminListReports = handle((req) => reports.adminListReports(req.query, parsePaging(req.query)));
exports.adminGetReport = handle((req) => reports.adminGetReport(req.params.id));
exports.adminUpdateReport = handle((req) => reports.adminUpdateReport(req.user.id, req.params.id, body(req)));

// Admin — users and dashboard
exports.listUsers = handle((req) => admin.listUsers(req.query, parsePaging(req.query)));
exports.getUser = handle((req) => admin.getUser(req.params.id));
exports.updateUserStatus = handle((req) => admin.updateUserStatus(req.user.id, req.params.id, body(req)));
exports.getDashboard = handle(() => admin.getDashboard());
