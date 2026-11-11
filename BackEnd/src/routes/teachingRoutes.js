const express = require("express");
const controller = require("../controllers/teachingController");
const lmsController = require("../controllers/lmsController");
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

// ---------- Stage 4 Core LMS (LMS-03, LMS-05, LMS-07, LMS-08, LMS-01) ----------

// Shared authenticated Learning Resource view & signed URL download (LMS-03)
router.get("/learning-resources/:id", anyAuthenticatedRole, lmsController.getLearningResource);
router.get("/learning-resources/:id/download-url", anyAuthenticatedRole, lmsController.getLearningResourceDownloadUrl);
router.get("/courses/:courseId/learning-resources", anyAuthenticatedRole, lmsController.listCourseLearningResources);
router.get("/classes/:classId/learning-resources", anyAuthenticatedRole, lmsController.listClassLearningResources);
router.get("/sessions/:sessionId/learning-resources", anyAuthenticatedRole, lmsController.listSessionLearningResources);

// Teacher LMS Management
router.get("/teacher/learning-resources", teacher, lmsController.teacherListLearningResources);
router.post("/teacher/learning-resources", teacher, lmsController.createLearningResource);
router.patch("/teacher/learning-resources/:id", teacher, lmsController.updateLearningResource);
router.delete("/teacher/learning-resources/:id", teacher, lmsController.deleteLearningResource);
router.post("/teacher/sessions/:sessionId/learning-resources/migrate", teacher, lmsController.migrateSessionContents);

router.post("/teacher/classes/:classId/assignments", teacher, lmsController.createAssignment);
router.get("/teacher/assignments", teacher, lmsController.listTeacherAssignments);
router.get("/teacher/assignments/:id", teacher, lmsController.getTeacherAssignment);
router.patch("/teacher/assignments/:id", teacher, lmsController.updateAssignment);
router.post("/teacher/assignments/:id/publish", teacher, lmsController.publishAssignment);
router.post("/teacher/assignments/:id/close", teacher, lmsController.closeAssignment);
router.delete("/teacher/assignments/:id", teacher, lmsController.deleteAssignment);
router.get("/teacher/assignments/:id/submissions", teacher, lmsController.listTeacherAssignmentSubmissions);
router.get("/teacher/submissions/:id", teacher, lmsController.getTeacherSubmission);

router.post("/teacher/submissions/:id/grade", teacher, lmsController.gradeSubmission);
router.patch("/teacher/submissions/:id/grade", teacher, lmsController.regradeSubmission);
router.post("/teacher/submissions/:id/regrade", teacher, lmsController.regradeSubmission);
router.get("/teacher/submissions/:id/grade-history", teacher, lmsController.getTeacherSubmissionGradeHistory);
router.get("/teacher/assignments/:id/grades", teacher, lmsController.listTeacherAssignmentGrades);

router.post("/teacher/assessments", teacher, lmsController.createAssessment);
router.get("/teacher/assessments", teacher, lmsController.listStaffAssessments);
router.get("/teacher/assessments/:id", teacher, lmsController.getStaffAssessment);
router.patch("/teacher/assessments/:id", teacher, lmsController.updateAssessment);
router.post("/teacher/assessments/:id/publish", teacher, lmsController.publishAssessment);
router.post("/teacher/assessments/:id/archive", teacher, lmsController.archiveAssessment);
router.post("/teacher/assessments/:id/questions", teacher, lmsController.addQuestion);
router.patch("/teacher/assessments/:id/questions/:questionId", teacher, lmsController.updateQuestion);
router.delete("/teacher/assessments/:id/questions/:questionId", teacher, lmsController.deleteQuestion);
router.get("/teacher/assessments/:id/attempts", teacher, lmsController.listStaffAssessmentAttempts);
router.post("/teacher/attempts/:id/grade", teacher, lmsController.manualGradeAttempt);

// Admin LMS Management & Audit Oversight
router.get("/admin/learning-resources", admin, lmsController.adminListLearningResources);
router.post("/admin/learning-resources", admin, lmsController.createLearningResource);
router.patch("/admin/learning-resources/:id", admin, lmsController.updateLearningResource);
router.delete("/admin/learning-resources/:id", admin, lmsController.deleteLearningResource);
router.post("/admin/sessions/:sessionId/learning-resources/migrate", admin, lmsController.migrateSessionContents);

router.get("/admin/assignments", admin, lmsController.adminListAssignments);
router.get("/admin/assignments/:id/submissions", admin, lmsController.adminListAssignmentSubmissions);
router.get("/admin/submissions/:id/grade-history", admin, lmsController.adminGetSubmissionGradeHistory);
router.get("/admin/grades/history", admin, lmsController.adminListGradeHistory);

router.post("/admin/assessments", admin, lmsController.createAssessment);
router.get("/admin/assessments", admin, lmsController.listStaffAssessments);
router.get("/admin/assessments/:id", admin, lmsController.getStaffAssessment);
router.patch("/admin/assessments/:id", admin, lmsController.updateAssessment);
router.post("/admin/assessments/:id/publish", admin, lmsController.publishAssessment);
router.post("/admin/assessments/:id/archive", admin, lmsController.archiveAssessment);
router.post("/admin/assessments/:id/questions", admin, lmsController.addQuestion);
router.patch("/admin/assessments/:id/questions/:questionId", admin, lmsController.updateQuestion);
router.delete("/admin/assessments/:id/questions/:questionId", admin, lmsController.deleteQuestion);
router.get("/admin/assessments/:id/attempts", admin, lmsController.listStaffAssessmentAttempts);
router.post("/admin/attempts/:id/grade", admin, lmsController.manualGradeAttempt);

router.get("/admin/placement-results", admin, lmsController.adminListPlacementResults);

// ---------- Stage 5: Learning Progress, Contract Review Coordination & Teaching Quality (LMS-12, LMS-14, TEA-16, SPO-07) ----------

// LMS-12: Student Progress Reviews (Teacher & Admin)
router.post("/teacher/classes/:classId/students/:studentId/progress-reviews", teacher, qualityProgressController.createStudentProgressReview);
router.get("/teacher/classes/:classId/progress-reviews", teacher, qualityProgressController.listTeacherClassProgressReviews);
router.get("/teacher/classes/:classId/students/:studentId/progress-reviews", teacher, qualityProgressController.listTeacherStudentProgressReviews);
router.patch("/teacher/progress-reviews/:id", teacher, qualityProgressController.updateStudentProgressReview);
router.get("/teacher/progress-reviews/:id/history", teacher, qualityProgressController.getTeacherProgressReviewHistory);

router.get("/admin/progress-reviews", admin, qualityProgressController.adminListProgressReviews);
router.get("/admin/classes/:classId/progress-reviews", admin, qualityProgressController.adminListClassProgressReviews);
router.get("/admin/progress-reviews/:id/history", admin, qualityProgressController.adminGetProgressReviewHistory);

// LMS-14: Learning Progress Dashboard (Teacher & Admin)
router.get("/teacher/classes/:classId/learning-progress", teacher, qualityProgressController.getTeacherClassLearningProgress);
router.get("/teacher/classes/:classId/students/:studentId/learning-progress", teacher, qualityProgressController.getTeacherStudentLearningProgress);

router.get("/admin/learning-progress/overview", admin, qualityProgressController.adminGetLearningProgressOverview);
router.get("/admin/learning-progress/classes/:classId", admin, qualityProgressController.adminGetClassLearningProgress);
router.get("/admin/learning-progress/students/:studentId", admin, qualityProgressController.adminGetStudentLearningProgress);

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
