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
exports.changeMyPassword = handle((req) =>
  profiles.changeMyPassword(req.user.id, body(req), { userAgent: req.headers["user-agent"], ip: req.ip })
);

// Messaging (1-1 Direct + LMS-13 Class Channels & Moderation)
exports.openConversation = handle((req) => messaging.openConversation(req.user, body(req)));
exports.listMyConversations = handle((req) => messaging.listMyConversations(req.user.id, parsePaging(req.query)));
exports.listMessages = handle((req) => messaging.listMessages(req.user.id, req.params.id, req.query));
exports.sendMessage = handle((req) => messaging.sendMessage(req.user, req.params.id, body(req)), 201);
exports.deleteMessage = handle((req) => messaging.deleteMessage(req.user.id, req.params.id));

exports.openClassConversation = handle((req) => messaging.openOrGetClassConversation(req.user, req.params.classId));
exports.listClassMessages = handle((req) => messaging.listClassMessages(req.user, req.params.classId, req.query));
exports.sendClassMessage = handle((req) => messaging.sendClassMessage(req.user, req.params.classId, body(req)), 201);
exports.reportMessage = handle((req) => messaging.reportMessage(req.user, req.params.id, body(req)), 201);
exports.getMyMessageReports = handle((req) => messaging.getMyMessageReports(req.user.id, parsePaging(req.query)));

exports.teacherUpdateClassConversationModeration = handle((req) =>
  messaging.teacherUpdateClassConversationModeration(req.user.id, req.params.classId, body(req))
);
exports.teacherMuteClassParticipant = handle((req) =>
  messaging.teacherMuteClassParticipant(req.user.id, req.params.classId, body(req))
);
exports.teacherUnmuteClassParticipant = handle((req) =>
  messaging.teacherUnmuteClassParticipant(req.user.id, req.params.classId, req.params.studentId)
);
exports.teacherModerateMessage = handle((req) =>
  messaging.teacherModerateMessage(req.user.id, req.params.classId, req.params.messageId, body(req))
);

exports.adminListMessageReports = handle((req) =>
  messaging.adminListMessageReports(req.query, parsePaging(req.query))
);
exports.adminGetMessageReport = handle((req) => messaging.adminGetMessageReport(req.params.id));
exports.adminReviewMessageReport = handle((req) =>
  messaging.adminReviewMessageReport(req.user.id, req.params.id, body(req))
);
exports.adminUpdateClassConversationModeration = handle((req) =>
  messaging.adminUpdateClassConversationModeration(req.user.id, req.params.classId, body(req))
);
exports.adminMuteClassParticipant = handle((req) =>
  messaging.adminMuteClassParticipant(req.user.id, req.params.classId, body(req))
);
exports.adminUnmuteClassParticipant = handle((req) =>
  messaging.adminUnmuteClassParticipant(req.user.id, req.params.classId, req.params.userId)
);
exports.adminModerateMessage = handle((req) =>
  messaging.adminModerateMessage(req.user.id, req.params.messageId, body(req))
);

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
