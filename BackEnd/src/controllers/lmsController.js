const learningResources = require("../services/learningResourceService");
const assignments = require("../services/assignmentService");
const grades = require("../services/gradeService");
const assessments = require("../services/assessmentService");
const placements = require("../services/placementService");
const { handle, parsePaging } = require("../utils/http");

const body = (req) => req.body || {};
const actor = (req) => ({ id: req.user.id, role: req.user.role });
const idempotencyKey = (req) => req.get("Idempotency-Key");

// ---------- LMS-03: LearningResource ----------

exports.createLearningResource = handle(
  (req) => learningResources.createLearningResource(actor(req), body(req)),
  201
);
exports.updateLearningResource = handle(
  (req) => learningResources.updateLearningResource(actor(req), req.params.id, body(req))
);
exports.deleteLearningResource = handle(
  (req) => learningResources.deleteLearningResource(actor(req), req.params.id)
);
exports.adminListLearningResources = handle(
  (req) => learningResources.adminListResources(req.query, parsePaging(req.query))
);
exports.teacherListLearningResources = handle(
  (req) => learningResources.listTeacherResources(req.user.id, req.query, parsePaging(req.query))
);
exports.migrateSessionContents = handle(
  (req) => learningResources.migrateSessionContents(actor(req), req.params.sessionId, body(req))
);
exports.getLearningResource = handle(
  (req) => learningResources.getLearningResource(actor(req), req.params.id)
);
exports.getLearningResourceDownloadUrl = handle(
  (req) => learningResources.getDownloadUrl(actor(req), req.params.id)
);
exports.listCourseLearningResources = handle(
  (req) => learningResources.listCourseResources(actor(req), req.params.courseId, req.query, parsePaging(req.query))
);
exports.listClassLearningResources = handle(
  (req) => learningResources.listClassResources(actor(req), req.params.classId, req.query, parsePaging(req.query))
);
exports.listSessionLearningResources = handle(
  (req) => learningResources.listSessionResources(actor(req), req.params.sessionId, req.query)
);
exports.listMyLearningResources = handle(
  (req) => learningResources.listMyResources(req.user.id, req.query, parsePaging(req.query))
);

// ---------- LMS-05: Assignment & Submission ----------

exports.createAssignment = handle(
  (req) => assignments.createAssignment(req.user.id, req.params.classId, body(req)),
  201
);
exports.listTeacherAssignments = handle(
  (req) => assignments.listTeacherAssignments(req.user.id, req.query, parsePaging(req.query))
);
exports.getTeacherAssignment = handle(
  (req) => assignments.getTeacherAssignment(req.user.id, req.params.id)
);
exports.updateAssignment = handle(
  (req) => assignments.updateAssignment(req.user.id, req.params.id, body(req))
);
exports.publishAssignment = handle(
  (req) => assignments.publishAssignment(req.user.id, req.params.id)
);
exports.closeAssignment = handle(
  (req) => assignments.closeAssignment(req.user.id, req.params.id)
);
exports.deleteAssignment = handle(
  (req) => assignments.deleteAssignment(req.user.id, req.params.id)
);
exports.listTeacherAssignmentSubmissions = handle(
  (req) => assignments.listTeacherAssignmentSubmissions(req.user.id, req.params.id, req.query, parsePaging(req.query))
);
exports.getTeacherSubmission = handle(
  (req) => assignments.getTeacherSubmission(req.user.id, req.params.id)
);
exports.adminListAssignments = handle(
  (req) => assignments.adminListAssignments(req.query, parsePaging(req.query))
);
exports.adminListAssignmentSubmissions = handle(
  (req) => assignments.adminListAssignmentSubmissions(req.params.id, parsePaging(req.query))
);

exports.listMyAssignments = handle(
  (req) => assignments.listMyAssignments(req.user.id, req.query, parsePaging(req.query))
);
exports.listMyClassAssignments = handle(
  (req) => assignments.listMyClassAssignments(req.user.id, req.params.classId, req.query, parsePaging(req.query))
);
exports.getMyAssignment = handle(
  (req) => assignments.getMyAssignment(req.user.id, req.params.id)
);
exports.submitAssignment = handle(
  (req) =>
    assignments.submitAssignment(req.user.id, req.params.id, body(req), {
      idempotencyKey: idempotencyKey(req),
    }),
  201
);
exports.listMySubmissionsForAssignment = handle(
  (req) => assignments.listMySubmissionsForAssignment(req.user.id, req.params.id)
);
exports.getMySubmission = handle(
  (req) => assignments.getMySubmission(req.user.id, req.params.id)
);

// ---------- LMS-07: Grade & Append-only GradeHistory ----------

exports.gradeSubmission = handle(
  (req) => grades.gradeSubmission(req.user.id, req.params.id, body(req)),
  201
);
exports.regradeSubmission = handle(
  (req) => grades.regradeSubmission(req.user.id, req.params.id, body(req))
);
exports.getTeacherSubmissionGradeHistory = handle(
  (req) => grades.getTeacherSubmissionGradeHistory(req.user.id, req.params.id)
);
exports.listTeacherAssignmentGrades = handle(
  (req) => grades.listTeacherAssignmentGrades(req.user.id, req.params.id, parsePaging(req.query))
);
exports.adminGetSubmissionGradeHistory = handle(
  (req) => grades.adminGetSubmissionGradeHistory(req.params.id)
);
exports.adminListGradeHistory = handle(
  (req) => grades.adminListGradeHistory(req.query, parsePaging(req.query))
);
exports.getMySubmissionGrade = handle(
  (req) => grades.getMySubmissionGrade(req.user.id, req.params.id)
);
exports.listMyGrades = handle(
  (req) => grades.listMyGrades(req.user.id, req.query, parsePaging(req.query))
);

// ---------- LMS-08: Assessment, Question & Attempt ----------

exports.createAssessment = handle(
  (req) => assessments.createAssessment(actor(req), body(req)),
  201
);
exports.updateAssessment = handle(
  (req) => assessments.updateAssessment(actor(req), req.params.id, body(req))
);
exports.publishAssessment = handle(
  (req) => assessments.publishAssessment(actor(req), req.params.id)
);
exports.archiveAssessment = handle(
  (req) => assessments.archiveAssessment(actor(req), req.params.id)
);
exports.listStaffAssessments = handle(
  (req) => assessments.listStaffAssessments(actor(req), req.query, parsePaging(req.query))
);
exports.getStaffAssessment = handle(
  (req) => assessments.getStaffAssessment(actor(req), req.params.id)
);
exports.listStaffAssessmentAttempts = handle(
  (req) => assessments.listStaffAssessmentAttempts(actor(req), req.params.id, req.query, parsePaging(req.query))
);
exports.addQuestion = handle(
  (req) => assessments.addQuestion(actor(req), req.params.id, body(req)),
  201
);
exports.updateQuestion = handle(
  (req) => assessments.updateQuestion(actor(req), req.params.id, req.params.questionId, body(req))
);
exports.deleteQuestion = handle(
  (req) => assessments.deleteQuestion(actor(req), req.params.id, req.params.questionId)
);
exports.manualGradeAttempt = handle(
  (req) => assessments.manualGradeAttempt(actor(req), req.params.id, body(req))
);

exports.listMyAssessments = handle(
  (req) => assessments.listMyAssessments(req.user.id, req.query, parsePaging(req.query))
);
exports.getMyAssessment = handle(
  (req) => assessments.getMyAssessment(req.user.id, req.params.id)
);
exports.startAttempt = handle(
  (req) =>
    assessments.startAttempt(req.user.id, req.params.id, {
      idempotencyKey: idempotencyKey(req) || body(req).idempotencyKey,
    }),
  201
);
exports.listMyAttemptsForAssessment = handle(
  (req) => assessments.listMyAttemptsForAssessment(req.user.id, req.params.id)
);
exports.getMyAttempt = handle(
  (req) => assessments.getMyAttempt(req.user.id, req.params.id)
);
exports.submitAttempt = handle(
  (req) =>
    assessments.submitAttempt(req.user.id, req.params.id, body(req), {
      idempotencyKey: idempotencyKey(req),
    })
);

// ---------- LMS-01: Placement Assessment ----------

exports.listMyPlacementAssessments = handle(
  (req) => placements.listPlacementAssessments(req.query, parsePaging(req.query))
);
exports.evaluatePlacementResult = handle(
  (req) =>
    placements.evaluatePlacementFromAttempt(
      req.user.id,
      req.params.attemptId || body(req).attemptId
    ),
  201
);
exports.listMyPlacementResults = handle(
  (req) => placements.listMyPlacementResults(req.user.id, req.query, parsePaging(req.query))
);
exports.getMyPlacementResult = handle(
  (req) => placements.getMyPlacementResult(req.user.id, req.params.id)
);
exports.adminListPlacementResults = handle(
  (req) => placements.adminListPlacementResults(req.query, parsePaging(req.query))
);

