const teacherClasses = require("../services/teacherClassService");
const adminClasses = require("../services/adminClassService");
const sessions = require("../services/sessionService");
const presenceService = require("../services/sessionPresenceService");
const incidentService = require("../services/sessionIncidentService");
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
exports.startSession = handle((req) => sessions.startSession(req.user.id, req.params.id));
exports.endSession = handle((req) => sessions.endSession(req.user.id, req.params.id));
exports.getSessionAttendance = handle((req) => sessions.getSessionAttendance(req.user.id, req.params.id));

// Student / Teacher — embedded classroom
exports.joinSession = handle((req) => sessions.joinSession(req.user, req.params.id));
exports.livekitWebhook = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const videoProvider = require("../services/videoProvider");
    if (!authHeader) return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
    let event;
    try {
      event = videoProvider.processWebhook(req.rawBody, req.body, authHeader);
    } catch (err) {
      // Only a signature/checksum failure is an authentication error
      return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
    }
    try {
      await sessions.handleLiveKitWebhook(event);
    } catch (err) {
      // Processing failures are server errors: logged, and a 5xx lets LiveKit retry the delivery
      console.error(`[livekitWebhook] Failed to process ${event?.event || "event"}:`, err.message);
      return res.status(500).json({ success: false, error: "WEBHOOK_PROCESSING_FAILED" });
    }
    res.status(200).send("OK");
  } catch (err) {
    next(err);
  }
};

// Admin — class approval
exports.listPendingClasses = handle((req) => adminClasses.listPendingClasses(parsePaging(req.query)));
exports.getClassForReview = handle((req) => adminClasses.getClassForReview(req.params.id));
exports.approveClass = handle((req) => adminClasses.approveClass(req.user.id, req.params.id, body(req)));
exports.rejectClass = handle((req) => adminClasses.rejectClass(req.user.id, req.params.id, body(req)));

// Smart Classroom Lifecycle & Presence (TIN-05D)
exports.getSessionLiveStatus = handle((req) => presenceService.getSessionLiveStatus(req.user, req.params.id));
exports.connectSessionPresence = handle((req) =>
  presenceService.verifyAndRecordClientPresence({
    sessionId: req.params.id,
    userId: req.user.id,
    role: req.user.role,
    connectionSessionId: body(req).connectionSessionId || null,
    connectedAt: new Date(),
    action: "CONNECT",
    now: new Date(),
  })
);
exports.heartbeatSessionPresence = handle((req) =>
  presenceService.verifyAndRecordClientPresence({
    sessionId: req.params.id,
    userId: req.user.id,
    role: req.user.role,
    connectionSessionId: body(req).connectionSessionId || null,
    action: "HEARTBEAT",
    now: new Date(),
  })
);
exports.leaveSessionPresence = handle((req) =>
  presenceService.recordParticipantDisconnected({
    sessionId: req.params.id,
    userId: req.user.id,
    connectionSessionId: body(req).connectionSessionId || null,
    disconnectedAt: new Date(),
    closeReason: "LEAVE_API",
  })
);

// Teacher Discipline, Incident Reports & Rescheduling (TIN-05E)
exports.submitIncidentReport = handle(
  (req) => incidentService.submitIncidentReport(req.user.id, req.params.id, body(req)),
  201
);
exports.submitIncidentAppeal = handle((req) =>
  incidentService.submitIncidentAppeal(req.user.id, req.params.id, body(req))
);
exports.requestSessionReschedule = handle(
  (req) => incidentService.requestSessionReschedule(req.user.id, req.params.id, body(req)),
  201
);
exports.getTeacherDisciplineOverview = handle((req) =>
  incidentService.getTeacherDisciplineOverview(req.user.id)
);

// Student Reschedule Confirmation (TIN-05E)
exports.respondToRescheduleAsStudent = handle((req) =>
  incidentService.respondToRescheduleAsStudent(req.user.id, req.params.id, body(req))
);

// Admin Smart Classroom, Incident, Violation, Discipline, Reschedule & Refund Review (TIN-05E)
exports.listAdminSmartClassroomOverview = handle((req) =>
  incidentService.listAdminSmartClassroomOverview(req.query, parsePaging(req.query))
);
exports.reviewIncidentReport = handle((req) =>
  incidentService.reviewIncidentReport(req.user.id, req.params.id, body(req))
);
exports.reviewTeacherViolation = handle((req) =>
  incidentService.reviewTeacherViolation(req.user.id, req.params.id, body(req))
);
exports.reviewDisciplineCase = handle((req) =>
  incidentService.reviewDisciplineCase(req.user.id, req.params.id, body(req))
);
exports.reviewRescheduleRequest = handle((req) =>
  incidentService.reviewRescheduleRequest(req.user.id, req.params.id, body(req))
);
exports.reviewRefundCase = handle((req) =>
  incidentService.reviewRefundCase(req.user.id, req.params.id, body(req))
);
