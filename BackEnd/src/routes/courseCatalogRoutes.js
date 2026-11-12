const express = require("express");
const controller = require("../controllers/courseCatalogController");
const authMiddleware = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/requireRole");

const router = express.Router();
const admin = [authMiddleware, requireRole("ADMIN")];
const teacher = [authMiddleware, requireRole("TEACHER")];

// Categories
router.get("/categories", controller.listCategories);
router.post("/admin/categories", admin, controller.createCategory);
router.patch("/admin/categories/:id", admin, controller.updateCategory);

// Subjects
router.get("/categories/:id/subjects", controller.listSubjectsByCategory);
router.get("/subjects/:id", controller.getSubject);
router.post("/admin/subjects", admin, controller.createSubject);
router.patch("/admin/subjects/:id", admin, controller.updateSubject);

// Courses
router.get("/courses", controller.searchCourses);
router.get("/courses/:id", controller.getCourse);
router.get("/courses/:id/classes", controller.getCourseClasses);
router.post("/admin/courses", admin, controller.createCourse);
router.patch("/admin/courses/:id", admin, controller.updateCourse);

// Course proposals
router.post("/teacher/course-proposals", teacher, controller.createProposal);
router.get("/teacher/course-proposals", teacher, controller.listMyProposals);
router.patch("/teacher/course-proposals/:id", teacher, controller.updateMyProposal);
router.get("/admin/course-proposals", admin, controller.adminListProposals);
router.get("/admin/course-proposals/:id", admin, controller.adminGetProposal);
router.post("/admin/course-proposals/:id/approve", admin, controller.approveProposal);
router.post("/admin/course-proposals/:id/reject", admin, controller.rejectProposal);
router.post("/admin/course-proposals/:id/request-changes", admin, controller.requestProposalChanges);

// Syllabus Versions & Curriculum Units (CUR-02)
router.get("/courses/:id/syllabus", controller.getCoursePublishedSyllabus);
router.get("/admin/courses/:id/syllabus-versions", admin, controller.listSyllabusVersions);
router.post("/admin/courses/:id/syllabus-versions", admin, controller.createSyllabusVersion);
router.get("/admin/courses/:id/syllabus-versions/:versionId", admin, controller.getSyllabusVersion);
router.patch("/admin/courses/:id/syllabus-versions/:versionId", admin, controller.updateSyllabusVersion);
router.post("/admin/courses/:id/syllabus-versions/:versionId/publish", admin, controller.publishSyllabusVersion);
router.post("/admin/courses/:id/syllabus-versions/:versionId/archive", admin, controller.archiveSyllabusVersion);
router.put("/admin/courses/:id/syllabus-versions/:versionId/units/reorder", admin, controller.reorderCurriculumUnits);
router.post("/admin/courses/:id/syllabus-versions/:versionId/units", admin, controller.addCurriculumUnit);
router.patch("/admin/courses/:id/syllabus-versions/:versionId/units/:unitId", admin, controller.updateCurriculumUnit);
router.delete("/admin/courses/:id/syllabus-versions/:versionId/units/:unitId", admin, controller.deleteCurriculumUnit);

// Learning Paths (CUR-03)
router.get("/learning-paths", controller.listPublicLearningPaths);
router.get("/learning-paths/:id", controller.getPublicLearningPath);
router.get("/admin/learning-paths", admin, controller.adminListLearningPaths);
router.post("/admin/learning-paths", admin, controller.createLearningPath);
router.get("/admin/learning-paths/:id", admin, controller.adminGetLearningPath);
router.patch("/admin/learning-paths/:id", admin, controller.updateLearningPath);
router.post("/admin/learning-paths/:id/publish", admin, controller.publishLearningPath);
router.post("/admin/learning-paths/:id/archive", admin, controller.archiveLearningPath);
router.delete("/admin/learning-paths/:id", admin, controller.deleteLearningPath);

// Course Pricing Policies (CUR-07)
router.get("/teacher/courses/:courseId/pricing-policy", teacher, controller.getTeacherCoursePricingPolicy);
router.get("/admin/pricing-policies", admin, controller.listPricingPolicies);
router.post("/admin/pricing-policies/verify-preview", admin, controller.verifyPricingPreview);
router.post("/admin/pricing-policies", admin, controller.createPricingPolicy);
router.get("/admin/pricing-policies/:id", admin, controller.getPricingPolicy);
router.post("/admin/pricing-policies/:id/versions", admin, controller.createNextPricingPolicyVersion);
router.post("/admin/pricing-policies/:id/activate", admin, controller.activatePricingPolicy);
router.post("/admin/pricing-policies/:id/rollback", admin, controller.rollbackPricingPolicy);
router.post("/admin/pricing-policies/:id/archive", admin, controller.archivePricingPolicy);

module.exports = router;
