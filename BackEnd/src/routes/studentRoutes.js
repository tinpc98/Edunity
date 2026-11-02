const express = require("express");
const router = express.Router();
const studentController = require("../controllers/studentController");
const authMiddleware = require("../middlewares/authMiddleware");

router.get("/me/sessions", authMiddleware, studentController.getMySessions);

// BUG-TIN03-01: Reject GET join to prevent mutation side-effects (attendance, room creation).
// Joining is a mutation that must use POST /api/sessions/:id/join.
router.get(["/sessions/:id/join", "/student/sessions/:id/join"], (req, res) => {
  res.status(405).json({
    success: false,
    error: "METHOD_NOT_ALLOWED",
    message: "GET method is not allowed for joining a session. Use POST /api/sessions/:id/join instead.",
  });
});

router.get("/me/payments", authMiddleware, studentController.getMyPayments);
router.get("/sessions/:id/recording", authMiddleware, studentController.getRecording);

module.exports = router;
