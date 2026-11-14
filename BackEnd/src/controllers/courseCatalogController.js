const catalog = require("../services/courseCatalogService");
const proposals = require("../services/courseProposalService");
const syllabusService = require("../services/syllabusService");
const learningPathService = require("../services/learningPathService");
const coursePricingPolicyService = require("../services/coursePricingPolicyService");
const { handle, parsePaging } = require("../utils/http");

const body = (req) => req.body || {};

// Categories
exports.listCategories = handle(() => catalog.listCategories());
exports.createCategory = handle((req) => catalog.createCategory(req.user.id, body(req)), 201);
exports.updateCategory = handle((req) => catalog.updateCategory(req.user.id, req.params.id, body(req)));

// Subjects
exports.listSubjectsByCategory = handle((req) => catalog.listSubjectsByCategory(req.params.id));
exports.getSubject = handle((req) => catalog.getSubject(req.params.id));
exports.createSubject = handle((req) => catalog.createSubject(req.user.id, body(req)), 201);
exports.updateSubject = handle((req) => catalog.updateSubject(req.user.id, req.params.id, body(req)));

// Courses
exports.searchCourses = handle((req) => catalog.searchCourses(req.query, parsePaging(req.query)));
exports.getCourse = handle((req) => catalog.getCourse(req.params.id));
exports.getCourseClasses = handle((req) => catalog.getCourseClasses(req.params.id, parsePaging(req.query)));
exports.adminListCourses = handle((req) => catalog.adminListCourses(req.query, parsePaging(req.query)));
exports.adminGetCourse = handle((req) => catalog.adminGetCourse(req.params.id));
exports.createCourse = handle((req) => catalog.createCourse(req.user.id, body(req)), 201);
exports.updateCourse = handle((req) => catalog.updateCourse(req.user.id, req.params.id, body(req)));
exports.deleteCourse = handle((req) => catalog.deleteCourse(req.user.id, req.params.id));

// Course proposals — Teacher
exports.createProposal = handle((req) => proposals.createProposal(req.user.id, body(req)), 201);
exports.listMyProposals = handle((req) => proposals.listMyProposals(req.user.id, req.query, parsePaging(req.query)));
exports.updateMyProposal = handle((req) => proposals.updateMyProposal(req.user.id, req.params.id, body(req)));

// Course proposals — Admin
exports.adminListProposals = handle((req) => proposals.adminListProposals(req.query, parsePaging(req.query)));
exports.adminGetProposal = handle((req) => proposals.adminGetProposal(req.params.id));
exports.approveProposal = handle((req) => proposals.approveProposal(req.user.id, req.params.id, body(req)));
exports.rejectProposal = handle((req) => proposals.rejectProposal(req.user.id, req.params.id, body(req)));
exports.requestProposalChanges = handle((req) => proposals.requestProposalChanges(req.user.id, req.params.id, body(req)));

// Syllabus Versions & Curriculum Units (CUR-02, CUR-12)
exports.getCoursePublishedSyllabus = handle((req) => syllabusService.getPublishedSyllabus(req.params.id));
exports.getClassSyllabus = handle((req) => syllabusService.getClassSyllabus(req.params.id, req.user));
exports.listSyllabusVersions = handle((req) => syllabusService.listVersions(req.params.id));
exports.createSyllabusVersion = handle((req) => syllabusService.createDraftVersion(req.user.id, req.params.id, body(req)), 201);
exports.getSyllabusVersion = handle((req) => syllabusService.getVersionDetail(req.params.id, req.params.versionId));
exports.updateSyllabusVersion = handle((req) =>
  syllabusService.updateDraftVersion(req.user.id, req.params.id, req.params.versionId, body(req))
);
exports.publishSyllabusVersion = handle((req) =>
  syllabusService.publishVersion(req.user.id, req.params.id, req.params.versionId)
);
exports.archiveSyllabusVersion = handle((req) =>
  syllabusService.archiveVersion(req.user.id, req.params.id, req.params.versionId)
);
exports.addCurriculumUnit = handle(
  (req) => syllabusService.addUnit(req.user.id, req.params.id, req.params.versionId, body(req)),
  201
);
exports.updateCurriculumUnit = handle((req) =>
  syllabusService.updateUnit(req.user.id, req.params.id, req.params.versionId, req.params.unitId, body(req))
);
exports.deleteCurriculumUnit = handle((req) =>
  syllabusService.deleteUnit(req.user.id, req.params.id, req.params.versionId, req.params.unitId)
);
exports.reorderCurriculumUnits = handle((req) =>
  syllabusService.reorderUnits(req.user.id, req.params.id, req.params.versionId, body(req))
);

// Learning Paths (CUR-03)
exports.listPublicLearningPaths = handle((req) =>
  learningPathService.listPublicLearningPaths(req.query, parsePaging(req.query))
);
exports.getPublicLearningPath = handle((req) => learningPathService.getPublicLearningPath(req.params.id));
exports.adminListLearningPaths = handle((req) =>
  learningPathService.adminListLearningPaths(req.query, parsePaging(req.query))
);
exports.adminGetLearningPath = handle((req) => learningPathService.adminGetLearningPath(req.params.id));
exports.createLearningPath = handle((req) => learningPathService.createLearningPath(req.user.id, body(req)), 201);
exports.updateLearningPath = handle((req) =>
  learningPathService.updateLearningPath(req.user.id, req.params.id, body(req))
);
exports.publishLearningPath = handle((req) =>
  learningPathService.publishLearningPath(req.user.id, req.params.id)
);
exports.archiveLearningPath = handle((req) =>
  learningPathService.archiveLearningPath(req.user.id, req.params.id)
);
exports.deleteLearningPath = handle((req) =>
  learningPathService.deleteLearningPath(req.user.id, req.params.id)
);

// Course Pricing Policies (CUR-07)
exports.listPricingPolicies = handle((req) =>
  coursePricingPolicyService.listPolicies(req.query, parsePaging(req.query))
);
exports.getPricingPolicy = handle((req) => coursePricingPolicyService.getPolicyDetail(req.params.id));
exports.createPricingPolicy = handle(
  (req) => coursePricingPolicyService.createPolicyVersion(req.user.id, body(req)),
  201
);
exports.createNextPricingPolicyVersion = handle(
  (req) => coursePricingPolicyService.createNextVersionFromId(req.user.id, req.params.id, body(req)),
  201
);
exports.activatePricingPolicy = handle((req) =>
  coursePricingPolicyService.activatePolicy(req.user.id, req.params.id, body(req))
);
exports.rollbackPricingPolicy = handle((req) =>
  coursePricingPolicyService.rollbackToPolicyVersion(req.user.id, req.params.id, body(req))
);
exports.archivePricingPolicy = handle((req) =>
  coursePricingPolicyService.archivePolicy(req.user.id, req.params.id)
);
exports.verifyPricingPreview = handle((req) =>
  coursePricingPolicyService.previewVerificationForCourse(body(req))
);
exports.getTeacherCoursePricingPolicy = handle((req) =>
  coursePricingPolicyService.getEffectivePolicyForCourse(req.params.courseId, req.query)
);
