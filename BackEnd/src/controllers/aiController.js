const aiGovernance = require("../services/aiGovernanceService");
const aiUseCases = require("../services/aiUseCaseService");
const { handle, parsePaging } = require("../utils/http");

const body = (req) => req.body || {};

// AI-01: Student AI Learning Resource Recommendations (with deterministic non-AI fallback)
exports.recommendLearningResources = handle((req) =>
  aiUseCases.recommendLearningResourcesForStudent(req.user, {
    ...(req.query || {}),
    ...(req.body || {}),
  })
);

// AI-02: Teacher AI Lesson Authoring & Quiz Question Drafts (draft-only + teacher verification)
exports.generateTeacherLessonDraft = handle(
  (req) => aiUseCases.generateTeacherLessonDraft(req.user, body(req)),
  201
);
exports.generateTeacherQuizDraft = handle(
  (req) => aiUseCases.generateTeacherQuizDraft(req.user, body(req)),
  201
);
exports.listTeacherAiDrafts = handle((req) =>
  aiUseCases.listTeacherAiDrafts(req.user.id, req.query, parsePaging(req.query))
);
exports.getTeacherAiDraft = handle((req) =>
  aiUseCases.getTeacherAiDraft(req.user.id, req.params.id)
);
exports.approveTeacherAiDraft = handle((req) =>
  aiUseCases.approveTeacherAiDraft(req.user, req.params.id, body(req))
);
exports.rejectTeacherAiDraft = handle((req) =>
  aiUseCases.rejectTeacherAiDraft(req.user.id, req.params.id, body(req))
);

// AI-03: Admin AI Aggregate Reporting & Governance Status
exports.adminGetAiStatus = handle(() => aiGovernance.getAiProviderStatus());
exports.adminListAiAuditLogs = handle((req) =>
  aiGovernance.adminListAiAuditLogs(req.query, parsePaging(req.query))
);
exports.adminGenerateReportSummary = handle((req) =>
  aiUseCases.adminGenerateReportSummary(req.user, body(req))
);

// AI-04: Sponsor AI Campaign Impact Narrative (Aggregate Only)
exports.generateSponsorImpactNarrative = handle((req) =>
  aiUseCases.sponsorGenerateImpactNarrative(req.user, req.params.id, body(req))
);

