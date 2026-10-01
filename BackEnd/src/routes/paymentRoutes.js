const express = require("express");
const paymentController = require("../controllers/paymentController");
const authMiddleware = require("../middlewares/authMiddleware");

const router = express.Router();

router.post("/enrollments/:id/payments", authMiddleware, paymentController.createSandboxPayment);
router.get("/enrollments/:id/payments", authMiddleware, paymentController.getPaymentHistory);

router.post("/payments/sandbox/webhook", paymentController.processWebhook);
router.post("/payments/webhook", paymentController.processGatewayWebhook);
router.get("/payments/:id", authMiddleware, paymentController.getPaymentById);

module.exports = router;
