const express = require("express");
const paymentController = require("../controllers/paymentController");
const authMiddleware = require("../middlewares/authMiddleware");

const router = express.Router();

// The sandbox webhook confirms a payment for whoever calls it: allow-listed to development and test only
const sandboxOnly = (req, res, next) => {
  if (!["development", "test"].includes(process.env.NODE_ENV)) {
    return res.status(404).json({ success: false, error: "NOT_FOUND" });
  }
  next();
};

router.post("/enrollments/:id/payments", authMiddleware, paymentController.createSandboxPayment);
router.get("/enrollments/:id/payments", authMiddleware, paymentController.getPaymentHistory);

router.post("/payments/sandbox/webhook", sandboxOnly, paymentController.processWebhook);
router.post("/payments/webhook", paymentController.processGatewayWebhook);
router.get("/payments/:id", authMiddleware, paymentController.getPaymentById);

module.exports = router;
