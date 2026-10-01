const catalog = require("../services/courseCatalogService");
const proposals = require("../services/courseProposalService");
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
exports.createCourse = handle((req) => catalog.createCourse(req.user.id, body(req)), 201);
exports.updateCourse = handle((req) => catalog.updateCourse(req.user.id, req.params.id, body(req)));

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
