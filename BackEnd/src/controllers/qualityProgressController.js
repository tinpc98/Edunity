const contractCoordination = require("../services/incidentContractCoordinationService");
const teachingQuality = require("../services/teachingQualityReportService");
const { handle, parsePaging } = require("../utils/http");

const body = (req) => req.body || {};

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
