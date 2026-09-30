const express = require("express");
const router = express.Router();
const studentController = require("../controllers/studentController");
const mockAuth = require("../middlewares/mockAuth");

router.get("/me/sessions", mockAuth, studentController.getMySessions);
router.get("/sessions/:id/join", mockAuth, studentController.joinSession);
router.get("/me/payments", mockAuth, studentController.getMyPayments);

module.exports = router;
