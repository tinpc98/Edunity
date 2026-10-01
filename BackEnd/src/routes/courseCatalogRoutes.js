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

module.exports = router;
