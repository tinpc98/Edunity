const reviews = require("../services/reviewService");
const verifications = require("../services/teacherVerificationService");
const notifications = require("../services/notificationService");
const { handle, parsePaging } = require("../utils/http");

const body = (req) => req.body || {};

// Reviews
exports.createReview = handle((req) => reviews.createReview(req.user.id, req.params.id, body(req)), 201);
exports.getClassReviews = handle((req) => reviews.getClassReviews(req.params.id, parsePaging(req.query)));
exports.getTeacherReviews = handle((req) => reviews.getTeacherReviews(req.params.id, parsePaging(req.query)));

// Teacher verification
exports.submitVerification = handle((req) => verifications.submitVerification(req.user.id, body(req)), 201);
exports.getMyVerification = handle((req) => verifications.getMyVerification(req.user.id));
exports.adminListVerifications = handle((req) => verifications.adminListVerifications(req.query, parsePaging(req.query)));
exports.adminGetVerification = handle((req) => verifications.adminGetVerification(req.params.teacherId));
exports.approveVerification = handle((req) => verifications.approveVerification(req.user.id, req.params.teacherId, body(req)));
exports.rejectVerification = handle((req) => verifications.rejectVerification(req.user.id, req.params.teacherId, body(req)));

// Notifications
exports.getMyNotifications = handle((req) =>
  notifications.getMyNotifications(req.user.id, parsePaging(req.query), req.query.unread === "true")
);
exports.markNotificationAsRead = handle((req) => notifications.markAsRead(req.user.id, req.params.id));
exports.markAllNotificationsAsRead = handle((req) => notifications.markAllAsRead(req.user.id));
