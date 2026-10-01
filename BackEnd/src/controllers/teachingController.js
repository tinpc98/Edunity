const teacherClasses = require("../services/teacherClassService");
const adminClasses = require("../services/adminClassService");
const sessions = require("../services/sessionService");
const { handle, parsePaging } = require("../utils/http");

const body = (req) => req.body || {};

// Teacher — classes
exports.createClass = handle((req) => teacherClasses.createClass(req.user.id, body(req)), 201);
exports.updateClass = handle((req) => teacherClasses.updateClass(req.user.id, req.params.id, body(req)));
exports.submitClass = handle((req) => teacherClasses.submitClass(req.user.id, req.params.id));
exports.listMyClasses = handle((req) => teacherClasses.listMyClasses(req.user.id, req.query, parsePaging(req.query)));
exports.getMyClass = handle((req) => teacherClasses.getMyClass(req.user.id, req.params.id));
exports.getClassStudents = handle((req) => teacherClasses.getClassStudents(req.user.id, req.params.id, req.query));
exports.getPlannedSessions = handle((req) => teacherClasses.getPlannedSessions(req.user.id, req.params.id));

// Teacher — sessions
exports.createSessions = handle((req) => sessions.createSessions(req.user.id, req.params.classId, body(req)), 201);
exports.updateSession = handle((req) => sessions.updateSession(req.user.id, req.params.id, body(req)));
exports.deleteSession = handle((req) => sessions.deleteSession(req.user.id, req.params.id));
exports.endSession = handle((req) => sessions.endSession(req.user.id, req.params.id));
exports.getSessionAttendance = handle((req) => sessions.getSessionAttendance(req.user.id, req.params.id));

// Student / Teacher — embedded classroom
exports.joinSession = handle((req) => sessions.joinSession(req.user, req.params.id));
exports.livekitWebhook = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const videoProvider = require("../services/videoProvider");
    if (!authHeader) return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
    const event = videoProvider.processWebhook(req.body, authHeader);
    await sessions.handleLiveKitWebhook(event);
    res.status(200).send("OK");
  } catch (err) {
    res.status(401).json({ success: false, error: "UNAUTHORIZED" });
  }
};

// Admin — class approval
exports.listPendingClasses = handle((req) => adminClasses.listPendingClasses(parsePaging(req.query)));
exports.getClassForReview = handle((req) => adminClasses.getClassForReview(req.params.id));
exports.approveClass = handle((req) => adminClasses.approveClass(req.user.id, req.params.id, body(req)));
exports.rejectClass = handle((req) => adminClasses.rejectClass(req.user.id, req.params.id, body(req)));
