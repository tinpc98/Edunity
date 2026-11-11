const crypto = require("crypto");
const paymentService = require("../services/paymentService");
const payosService = require("../services/payosService");
const payosWebhookService = require("../services/payosWebhookService");
const { serializeDecimal128 } = require("../utils/serialize");
const contributionService = require("../services/contributionService");
const { AppError, PAYMENT_NOT_FOUND } = require("../utils/errors");

const ALLOWED_SANDBOX_ENVS = ["development", "test"];

const isSandboxEnabled = () => {
  if (process.env.REAL_LOCAL_RUNTIME === "true" || process.env.NODE_ENV === "production") {
    return false;
  }
  if (!ALLOWED_SANDBOX_ENVS.includes(process.env.NODE_ENV)) {
    return false;
  }
  return process.env.ENABLE_PAYMENT_SANDBOX === "true";
};

const isTuitionPaymentAllowed = () => {
  return payosService.isPayosEnabled("TUITION") || isSandboxEnabled();
};

const routeWebhook = async (gatewayReference, status) => {
  if (gatewayReference.startsWith("SBX-C-") || gatewayReference.startsWith("CONTRIB-")) {
    const result = await contributionService.processWebhook(gatewayReference, status);
    if (!result) {
      throw PAYMENT_NOT_FOUND("Sponsor contribution not found");
    }
    return result;
  }
  return paymentService.processWebhook(gatewayReference, status);
};

const createSandboxPayment = async (req, res, next) => {
  try {
    if (!isTuitionPaymentAllowed()) {
      throw new AppError(
        "Cổng thanh toán chưa được kích hoạt.",
        "PAYMENT_PROVIDER_DISABLED",
        503
      );
    }
    if (!req.user || req.user.role !== "STUDENT") {
      throw require("../utils/errors").FORBIDDEN("Only STUDENT can perform this action");
    }
    const studentId = req.user.id;
    const enrollmentId = req.params.id;

    const payment = await paymentService.createSandboxPayment(studentId, enrollmentId);
    const enrollment = payment.enrollmentId
      ? await require("../models/Enrollment").findById(payment.enrollmentId)
      : null;
    const holdExpiresAt = enrollment ? enrollment.holdExpiresAt : payment.expiredAt || null;
    const tuitionAmountNum =
      enrollment && enrollment.tuitionAmount != null
        ? Number(enrollment.tuitionAmount.toString())
        : payment.amount != null
        ? Number(payment.amount.toString())
        : 0;
    const paymentAmountNum = payment.amount != null ? Number(payment.amount.toString()) : 0;
    const scholarshipAmountNum = Math.max(0, tuitionAmountNum - paymentAmountNum);

    res.status(201).json({
      success: true,
      data: serializeDecimal128(
        paymentService.formatPaymentIntentResponse(payment, {
          holdExpiresAt,
          extraFields: {
            enrollmentStatus: enrollment ? enrollment.enrollmentStatus : null,
            paymentSource: enrollment ? enrollment.paymentSource : null,
            classId: enrollment ? enrollment.classId : null,
            tuitionAmount: tuitionAmountNum,
            scholarshipAmount: scholarshipAmountNum,
          },
        })
      ),
    });
  } catch (err) {
    next(err);
  }
};

const WEBHOOK_STATUSES = ["SUCCESS", "FAILED"];

const safeEqual = (a, b) => {
  const hash = (value) => crypto.createHash("sha256").update(String(value)).digest();
  return crypto.timingSafeEqual(hash(a), hash(b));
};

/**
 * POST /api/payments/sandbox/webhook — simulates the gateway so payments can be exercised without one.
 * It has no credentials by design, so the route only exists in development and test (see paymentRoutes).
 */
const processWebhook = async (req, res, next) => {
  try {
    if (!isSandboxEnabled()) {
      throw new AppError("Sandbox payment is disabled in this environment", "FORBIDDEN", 403);
    }

    const { gatewayReference, status } = req.body || {};
    if (typeof gatewayReference !== "string" || !WEBHOOK_STATUSES.includes(status)) {
      throw new AppError("gatewayReference and status (SUCCESS | FAILED) are required", "VALIDATION_ERROR", 400);
    }

    const result = await routeWebhook(gatewayReference, status);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/payments/webhook — single gateway callback for every payment kind:
 * class tuition (Payment) and Sponsor Contribution. Idempotent on duplicate webhooks.
 * The gateway must send PAYMENT_WEBHOOK_SECRET in `x-webhook-secret`. Only development and test
 * may run without one configured; everywhere else a missing secret refuses every call.
 */
const processGatewayWebhook = async (req, res, next) => {
  try {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    const headerSecret = req.headers["x-webhook-secret"];
    const secretOptional = ["development", "test"].includes(process.env.NODE_ENV);
    if (!secret) {
      if (!secretOptional || headerSecret !== undefined) {
        throw new AppError("Webhook secret is not configured", "UNAUTHORIZED", 401);
      }
    } else if (typeof headerSecret !== "string" || !headerSecret || !safeEqual(headerSecret, secret)) {
      throw new AppError("Invalid webhook signature", "UNAUTHORIZED", 401);
    }

    const { gatewayReference, status } = req.body || {};
    if (typeof gatewayReference !== "string" || !WEBHOOK_STATUSES.includes(status)) {
      throw new AppError("gatewayReference and status (SUCCESS | FAILED) are required", "VALIDATION_ERROR", 400);
    }

    const result = await routeWebhook(gatewayReference, status);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
};

const getPaymentById = async (req, res, next) => {
  try {
    const payment = await paymentService.getPaymentById(req.user, req.params.id);

    res.status(200).json({
      success: true,
      data: serializeDecimal128(payment)
    });
  } catch (err) {
    next(err);
  }
};

const getPaymentHistory = async (req, res, next) => {
  try {
    if (req.user.role !== "STUDENT") {
      throw require("../utils/errors").FORBIDDEN("Only STUDENT can perform this action");
    }
    const studentId = req.user.id;
    const enrollmentId = req.params.id;

    const payments = await paymentService.getPaymentHistory(studentId, enrollmentId);

    res.status(200).json({
      success: true,
      data: serializeDecimal128(payments)
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Factory for channel-bound payOS webhook handlers (`TUITION` and `DONATION`).
 * Both routes call the same Unified Webhook Processor (`payosWebhookService.processPayosChannelWebhook`)
 * with the server-trusted `channelKey`. Never trusts channelKey from client payload.
 */
const createPayosChannelWebhookHandler = (channelKey) => async (req, res, next) => {
  try {
    const result = await payosWebhookService.processPayosChannelWebhook(channelKey, req.body);
    return res.status(200).json({
      success: true,
      data: serializeDecimal128(result),
    });
  } catch (err) {
    return next(err);
  }
};

const processPayosTuitionWebhook = createPayosChannelWebhookHandler("TUITION");
const processPayosDonationWebhook = createPayosChannelWebhookHandler("DONATION");

module.exports = {
  createSandboxPayment,
  createPaymentIntent: createSandboxPayment,
  processWebhook,
  processGatewayWebhook,
  processPayosTuitionWebhook,
  processPayosDonationWebhook,
  getPaymentById,
  getPaymentHistory
};
