const express = require("express");
const router = express.Router();
const studentController = require("../controllers/studentController");
const authMiddleware = require("../middlewares/authMiddleware");

router.get("/me/sessions", authMiddleware, studentController.getMySessions);
router.get("/sessions/:id/join", authMiddleware, studentController.joinSession);
router.get("/me/payments", authMiddleware, studentController.getMyPayments);
router.get("/sessions/:id/recording", authMiddleware, studentController.getRecording);

module.exports = router;
