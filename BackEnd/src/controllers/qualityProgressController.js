const progressReviews = require("../services/studentProgressReviewService");
const learningProgress = require("../services/learningProgressService");
const contractCoordination = require("../services/incidentContractCoordinationService");
const teachingQuality = require("../services/teachingQualityReportService");
const { handle, parsePaging } = require("../utils/http");

const body = (req) => req.body || {};

// ---------- LMS-12: Student Progress Reviews ----------

exports.createStudentProgressReview = handle(
  (req) =>
    progressReviews.createStudentProgressReview(
      req.user.id,
      req.params.classId,
      req.params.studentId,
      body(req)
    ),
  201
);

exports.updateStudentProgressReview = handle((req) =>
  progressReviews.updateStudentProgressReview(req.user.id, req.params.id, body(req))
);

exports.listTeacherClassProgressReviews = handle((req) =>
  progressReviews.listTeacherClassProgressReviews(
    req.user.id,
    req.params.classId,
    req.query,
    parsePaging(req.query)
  )
);

exports.listTeacherStudentProgressReviews = handle((req) =>
  progressReviews.listTeacherStudentProgressReviews(
    req.user.id,
    req.params.classId,
    req.params.studentId,
    parsePaging(req.query)
  )
);

exports.getTeacherProgressReviewHistory = handle((req) =>
  progressReviews.getTeacherProgressReviewHistory(req.user.id, req.params.id)
);

exports.listMyProgressReviews = handle((req) =>
  progressReviews.listMyProgressReviews(req.user.id, req.query, parsePaging(req.query))
);

exports.listMyClassProgressReviews = handle((req) =>
  progressReviews.listMyClassProgressReviews(req.user.id, req.params.classId, parsePaging(req.query))
);

exports.adminListProgressReviews = handle((req) =>
  progressReviews.adminListProgressReviews(req.query, parsePaging(req.query))
);

exports.adminListClassProgressReviews = handle((req) =>
  progressReviews.adminListProgressReviews(
    { ...req.query, classId: req.params.classId },
    parsePaging(req.query)
  )
);

exports.adminGetProgressReviewHistory = handle((req) =>
  progressReviews.adminGetProgressReviewHistory(req.params.id)
);

// ---------- LMS-14: Learning Progress Dashboard ----------

exports.getMyLearningProgress = handle((req) =>
  learningProgress.getMyLearningProgress(req.user.id, req.query, parsePaging(req.query))
);

exports.getMyClassLearningProgress = handle((req) =>
  learningProgress.getMyClassLearningProgress(req.user.id, req.params.classId)
);

exports.getTeacherClassLearningProgress = handle((req) =>
  learningProgress.getTeacherClassLearningProgress(
    req.user.id,
    req.params.classId,
    req.query,
    parsePaging(req.query)
  )
);

exports.getTeacherStudentLearningProgress = handle((req) =>
  learningProgress.getTeacherStudentLearningProgress(
    req.user.id,
    req.params.classId,
    req.params.studentId
  )
);

exports.adminGetLearningProgressOverview = handle((req) =>
  learningProgress.adminGetLearningProgressOverview(req.query, parsePaging(req.query))
);

exports.adminGetClassLearningProgress = handle((req) =>
  learningProgress.adminGetClassLearningProgress(
    req.params.classId,
    req.query,
    parsePaging(req.query)
  )
);

exports.adminGetStudentLearningProgress = handle((req) =>
  learningProgress.adminGetStudentLearningProgress(
    req.params.studentId,
    req.query,
    parsePaging(req.query)
  )
);

// ---------- TEA-16: Incident Contract Review Coordination ----------

exports.getTeacherContractReviewReadiness = handle((req) =>
  contractCoordination.getTeacherContractReviewReadiness(req.user.id)
);

exports.adminListContractReviewQueue = handle((req) =>
  contractCoordination.adminListContractReviewQueue(req.query, parsePaging(req.query))
);

exports.adminGetTeacherContractReviewReadiness = handle((req) =>
  contractCoordination.adminGetTeacherContractReviewReadiness(req.params.teacherId)
);

exports.adminCreateContractReviewPacket = handle(
  (req) => contractCoordination.adminCreateContractReviewPacket(req.user.id, body(req)),
  201
);

exports.adminGetContractReviewPacket = handle((req) =>
  contractCoordination.adminGetContractReviewPacket(req.params.id)
);

exports.adminUpdateContractReviewPacketStatus = handle((req) =>
  contractCoordination.adminUpdateContractReviewPacketStatus(req.user.id, req.params.id, body(req))
);

exports.adminAttemptContractExecutionHandoff = handle((req) =>
  contractCoordination.adminAttemptContractExecutionHandoff(req.user.id, req.params.id, body(req))
);

// ---------- SPO-07: Teaching Quality Reporting ----------

exports.adminGetTeachingQualityReport = handle((req) =>
  teachingQuality.adminGetTeachingQualityReport(req.query, parsePaging(req.query))
);

exports.adminGetTeacherQualityDetail = handle((req) =>
  teachingQuality.adminGetTeacherQualityDetail(req.params.teacherId, req.query)
);

