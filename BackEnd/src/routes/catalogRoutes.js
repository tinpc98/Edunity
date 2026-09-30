const express = require("express");
const router = express.Router();
const catalogController = require("../controllers/catalogController");

router.get("/catalog/categories", catalogController.getCategories);
router.get("/catalog/filters", catalogController.getFilters);
router.get("/classes", catalogController.getClasses);
router.get("/classes/:id", catalogController.getClassById);
router.get("/classes/:id/sessions", catalogController.getClassSessions);
router.get("/teachers", catalogController.getTeachers);
router.get("/teachers/:id", catalogController.getTeacherById);

module.exports = router;
