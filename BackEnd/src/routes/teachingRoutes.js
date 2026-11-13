const express = require("express");
const controller = require("../controllers/teachingController");
const qualityProgressController = require("../controllers/qualityProgressController");
const authMiddleware = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/requireRole");

const router = express.Router();
const admin = [authMiddleware, requireRole("ADMIN")];
const teacher = [authMiddleware, requireRole("TEACHER")];
const student = [authMiddleware, requireRole("STUDENT")];
const classroomMember = [authMiddleware, requireRole("STUDENT", "TEACHER")];
const anyAuthenticatedRole = [authMiddleware, requireRole("STUDENT", "TEACHER", "ADMIN")];

// Teacher — subject authorizations (TEA-07)
router.get("/teacher/subject-authorizations", teacher, controller.listMySubjectAuthorizations);
router.post("/teacher/subject-authorizations", teacher, controller.requestSubjectAuthorization);
router.get("/teacher/subject-authorizations/:id", teacher, controller.getMySubjectAuthorization);

// Teacher — classes
router.get("/teacher/classes", teacher, controller.listMyClasses);
router.post("/teacher/classes", teacher, controller.createClass);
router.get("/teacher/classes/:id", teacher, controller.getMyClass);
router.patch("/teacher/classes/:id", teacher, controller.updateClass);
router.post("/teacher/classes/:id/submit", teacher, controller.submitClass);
router.get("/teacher/classes/:id/students", teacher, controller.getClassStudents);
router.get("/teacher/classes/:id/planned-sessions", teacher, controller.getPlannedSessions);

// Teacher — sessions
router.post("/teacher/classes/:classId/sessions/generate", teacher, controller.generateSessions);
router.post("/teacher/classes/:classId/sessions", teacher, controller.createSessions);
router.patch("/teacher/sessions/:id", teacher, controller.updateSession);
router.delete("/teacher/sessions/:id", teacher, controller.deleteSession);
router.post("/teacher/sessions/:id/start", teacher, controller.startSession);
router.post("/teacher/sessions/:id/end", teacher, controller.endSession);
router.get("/teacher/sessions/:id/attendance", teacher, controller.getSessionAttendance);

// Student / Teacher — join the embedded classroom & live presence tracking (TIN-05D)
router.post("/sessions/:id/join", classroomMember, controller.joinSession);
router.get("/sessions/:id/live-status", anyAuthenticatedRole, controller.getSessionLiveStatus);
router.post("/sessions/:id/presence/connect", classroomMember, controller.connectSessionPresence);
router.post("/sessions/:id/presence/heartbeat", classroomMember, controller.heartbeatSessionPresence);
router.post("/sessions/:id/presence/leave", classroomMember, controller.leaveSessionPresence);
router.post("/sessions/:id/presence/disconnect", classroomMember, controller.leaveSessionPresence);
router.post("/sessions/livekit-webhook", controller.livekitWebhook);

// Teacher — incident reports, rescheduling & discipline overview (TIN-05E)
router.get("/teacher/discipline-overview", teacher, controller.getTeacherDisciplineOverview);
router.post("/teacher/sessions/:id/incident-reports", teacher, controller.submitIncidentReport);
router.post("/teacher/incident-reports/:id/appeal", teacher, controller.submitIncidentAppeal);
router.post("/teacher/sessions/:id/reschedule-requests", teacher, controller.requestSessionReschedule);

// Student — reschedule confirmation (TIN-05E)
router.post("/student/reschedule-requests/:id/respond", student, controller.respondToRescheduleAsStudent);

// Admin — subject authorizations (TEA-07)
router.get("/admin/subject-authorizations", admin, controller.adminListSubjectAuthorizations);
router.post("/admin/subject-authorizations", admin, controller.adminCreateSubjectAuthorization);
router.get("/admin/subject-authorizations/:id", admin, controller.adminGetSubjectAuthorization);
router.post("/admin/subject-authorizations/:id/approve", admin, controller.approveSubjectAuthorization);
router.post("/admin/subject-authorizations/:id/suspend", admin, controller.suspendSubjectAuthorization);

// Admin — class approval & Smart Classroom / Incident / Discipline / Reschedule / Refund review (TIN-05E)
router.get("/admin/classes/pending", admin, controller.listPendingClasses);
router.get("/admin/classes/:id", admin, controller.getClassForReview);
router.post("/admin/classes/:id/approve", admin, controller.approveClass);
router.post("/admin/classes/:id/reject", admin, controller.rejectClass);

router.get("/admin/smart-classroom/overview", admin, controller.listAdminSmartClassroomOverview);
router.post("/admin/incident-reports/:id/review", admin, controller.reviewIncidentReport);
router.post("/admin/teacher-violations/:id/review", admin, controller.reviewTeacherViolation);
router.post("/admin/discipline-cases/:id/review", admin, controller.reviewDisciplineCase);
router.post("/admin/reschedule-requests/:id/review", admin, controller.reviewRescheduleRequest);
router.post("/admin/session-refund-reviews/:id/review", admin, controller.reviewRefundCase);

// TEA-16: Incident Contract Review Coordination (Teacher self-readiness & Admin packets)
router.get("/teacher/contract-review-readiness", teacher, qualityProgressController.getTeacherContractReviewReadiness);

router.get("/admin/contract-reviews/incidents", admin, qualityProgressController.adminListContractReviewQueue);
router.get("/admin/contract-reviews/teachers/:teacherId/readiness", admin, qualityProgressController.adminGetTeacherContractReviewReadiness);
router.post("/admin/contract-reviews/packets", admin, qualityProgressController.adminCreateContractReviewPacket);
router.get("/admin/contract-reviews/packets/:id", admin, qualityProgressController.adminGetContractReviewPacket);
router.patch("/admin/contract-reviews/packets/:id/status", admin, qualityProgressController.adminUpdateContractReviewPacketStatus);
router.post("/admin/contract-reviews/packets/:id/execute-contract-action", admin, qualityProgressController.adminAttemptContractExecutionHandoff);

// SPO-07: Teaching Quality Reporting (Admin only)
router.get("/admin/teaching-quality/report", admin, qualityProgressController.adminGetTeachingQualityReport);
router.get("/admin/teaching-quality/teachers/:teacherId", admin, qualityProgressController.adminGetTeacherQualityDetail);

module.exports = router;
