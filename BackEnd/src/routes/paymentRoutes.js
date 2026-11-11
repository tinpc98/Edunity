const express = require("express");
const paymentController = require("../controllers/paymentController");
const authMiddleware = require("../middlewares/authMiddleware");

const router = express.Router();

// The sandbox webhook confirms a payment for whoever calls it: strictly isolated to test/dev when sandbox is explicitly enabled
const sandboxOnly = (req, res, next) => {
  if (
    process.env.REAL_LOCAL_RUNTIME === "true" ||
    process.env.ENABLE_PAYMENT_SANDBOX !== "true" ||
    !["development", "test"].includes(process.env.NODE_ENV)
  ) {
    return res.status(403).json({
      success: false,
      code: "PAYMENT_PROVIDER_DISABLED",
      message: "Cổng thanh toán chưa được kích hoạt hoặc chế độ sandbox bị vô hiệu hóa.",
    });
  }
  next();
};

router.post("/enrollments/:id/payments", authMiddleware, paymentController.createSandboxPayment);
router.get("/enrollments/:id/payments", authMiddleware, paymentController.getPaymentHistory);

router.post("/payments/sandbox/webhook", sandboxOnly, paymentController.processWebhook);
router.post("/payments/webhook", paymentController.processGatewayWebhook);
router.post("/payments/webhooks/payos/tuition", paymentController.processPayosTuitionWebhook);
router.post("/payments/webhooks/payos/donation", paymentController.processPayosDonationWebhook);
router.get("/payments/:id", authMiddleware, paymentController.getPaymentById);

module.exports = router;
