const express = require("express");
const router = express.Router();
const devAuthController = require("../controllers/authController");
const authMiddleware = require("../middlewares/authMiddleware");

router.post("/register", devAuthController.register);
router.post("/login", devAuthController.loginWithRefreshToken);
router.post("/refresh", devAuthController.refresh);
router.post("/logout", devAuthController.logout);
router.get("/me", authMiddleware, devAuthController.getMe);

// DEV/TEST shortcut only: "dev-<userId>" tokens are not accepted in production
router.use((req, res, next) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ success: false, error: "NOT_FOUND" });
  }
  next();
});

router.post("/dev-login", devAuthController.login);

module.exports = router;
