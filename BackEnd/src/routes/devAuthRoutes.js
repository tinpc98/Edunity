const express = require("express");
const router = express.Router();
const devAuthController = require("../controllers/devAuthController");
const mockAuth = require("../middlewares/mockAuth");

router.post("/register", devAuthController.register);
router.post("/dev-login", devAuthController.login);

// Auth only for non-production
router.use((req, res, next) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ success: false, error: "NOT_FOUND" });
  }
  next();
});

router.get("/me", mockAuth, devAuthController.getMe);

module.exports = router;
