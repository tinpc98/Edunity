const express = require("express");
const paymentController = require("../controllers/paymentController");
const mockAuth = require("../middlewares/mockAuth");

const router = express.Router();

router.post("/enrollments/:id/payments", mockAuth, paymentController.createSandboxPayment);
router.get("/enrollments/:id/payments", mockAuth, paymentController.getPaymentHistory);

router.post("/payments/sandbox/webhook", paymentController.processWebhook);
router.post("/payments/webhook", paymentController.processGatewayWebhook);
router.get("/payments/:id", mockAuth, paymentController.getPaymentById);

module.exports = router;
