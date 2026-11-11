const express = require("express");
const router = express.Router();
const studentController = require("../controllers/studentController");
const lmsController = require("../controllers/lmsController");
const qualityProgressController = require("../controllers/qualityProgressController");
const authMiddleware = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/requireRole");

const student = [authMiddleware, requireRole("STUDENT")];

router.get("/me/sessions", authMiddleware, studentController.getMySessions);

// BUG-TIN03-01: Reject GET join to prevent mutation side-effects (attendance, room creation).
// Joining is a mutation that must use POST /api/sessions/:id/join.
router.get("/sessions/:id/join", authMiddleware, (req, res) => {
  res.status(405).json({
    success: false,
    error: "METHOD_NOT_ALLOWED",
    message: "GET method is not allowed for joining a session. Use POST /api/sessions/:id/join instead.",
  });
});

router.get("/student/sessions/:id/join", authMiddleware, (req, res) => {
  res.status(405).json({
    success: false,
    error: "METHOD_NOT_ALLOWED",
    message: "GET method is not allowed for joining a session. Use POST /api/sessions/:id/join instead.",
  });
});

router.get("/me/payments", authMiddleware, studentController.getMyPayments);
router.get("/sessions/:id/recording", authMiddleware, studentController.getRecording);

// Stage 4 Core LMS — Student Endpoints
// LMS-03 Learning Resources
router.get("/me/learning-resources", student, lmsController.listMyLearningResources);

// LMS-05 Assignment & Submission
router.get("/me/assignments", student, lmsController.listMyAssignments);
router.get("/me/classes/:classId/assignments", student, lmsController.listMyClassAssignments);
router.get("/me/assignments/:id", student, lmsController.getMyAssignment);
router.post("/me/assignments/:id/submissions", student, lmsController.submitAssignment);
router.get("/me/assignments/:id/submissions", student, lmsController.listMySubmissionsForAssignment);
router.get("/me/submissions/:id", student, lmsController.getMySubmission);

// LMS-07 Grades & History
router.get("/me/grades", student, lmsController.listMyGrades);
router.get("/me/submissions/:id/grade", student, lmsController.getMySubmissionGrade);

// LMS-08 Assessments & Attempts
router.get("/me/assessments", student, lmsController.listMyAssessments);
router.get("/me/assessments/:id", student, lmsController.getMyAssessment);
router.post("/me/assessments/:id/attempts", student, lmsController.startAttempt);
router.get("/me/assessments/:id/attempts", student, lmsController.listMyAttemptsForAssessment);
router.get("/me/attempts/:id", student, lmsController.getMyAttempt);
router.post("/me/attempts/:id/submit", student, lmsController.submitAttempt);

// LMS-01 Placement Assessments & Results
router.get("/me/placement-assessments", student, lmsController.listMyPlacementAssessments);
router.post("/me/placement-results", student, lmsController.evaluatePlacementResult);
router.post("/me/placement-attempts/:attemptId/evaluate", student, lmsController.evaluatePlacementResult);
router.get("/me/placement-results", student, lmsController.listMyPlacementResults);
router.get("/me/placement-results/:id", student, lmsController.getMyPlacementResult);

// Stage 5: Learning Progress & Student Progress Reviews (LMS-12, LMS-14)
router.get("/me/progress-reviews", student, qualityProgressController.listMyProgressReviews);
router.get("/me/classes/:classId/progress-reviews", student, qualityProgressController.listMyClassProgressReviews);
router.get("/me/learning-progress", student, qualityProgressController.getMyLearningProgress);
router.get("/me/classes/:classId/learning-progress", student, qualityProgressController.getMyClassLearningProgress);

module.exports = router;
