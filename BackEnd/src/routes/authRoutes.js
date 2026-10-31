const express = require("express");
const router = express.Router();
const devAuthController = require("../controllers/authController");
const authMiddleware = require("../middlewares/authMiddleware");
const rateLimit = require("../middlewares/rateLimit");

router.post("/register", rateLimit.register, devAuthController.register);
router.post("/login", rateLimit.login, devAuthController.loginWithRefreshToken);
router.post("/refresh", rateLimit.refresh, devAuthController.refresh);
router.post("/logout", devAuthController.logout);
router.get("/me", authMiddleware, devAuthController.getMe);

// Test-suite shortcut only: "dev-<userId>" tokens are accepted nowhere else
router.post("/dev-login", (req, res, next) => {
  if (process.env.NODE_ENV !== "test") {
    return res.status(404).json({ success: false, error: "NOT_FOUND" });
  }
  next();
}, devAuthController.login);

module.exports = router;
