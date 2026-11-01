const crypto = require("crypto");
const paymentService = require("../services/paymentService");
const { serializeDecimal128 } = require("../utils/serialize");
const contributionService = require("../services/contributionService");
const { AppError, PAYMENT_NOT_FOUND } = require("../utils/errors");

// Danh sách môi trường được phép kích hoạt sandbox (mặc định chỉ development và test; production và staging luôn chặn)
const ALLOWED_SANDBOX_ENVS = ["development", "test"];

const isSandboxEnabled = () => {
  const currentEnv = process.env.NODE_ENV || "development";
  if (!ALLOWED_SANDBOX_ENVS.includes(currentEnv)) {
    return false;
  }
  return process.env.ENABLE_PAYMENT_SANDBOX === "true";
};

const createSandboxPayment = async (req, res, next) => {
  try {
    if (!isSandboxEnabled()) {
      throw new AppError("Sandbox payment is disabled in this environment", "FORBIDDEN", 403);
    }
    if (req.user.role !== "STUDENT") {
      throw require("../utils/errors").FORBIDDEN("Only STUDENT can perform this action");
    }
    const studentId = req.user.id;
    const enrollmentId = req.params.id;

    const payment = await paymentService.createSandboxPayment(studentId, enrollmentId);
    const enrollment = await require("../models/Enrollment").findById(payment.enrollmentId);

    res.status(201).json({
      success: true,
      data: serializeDecimal128({
        paymentId: payment._id,
        gatewayReference: payment.gatewayReference,
        amount: payment.amount,
        enrollmentId: payment.enrollmentId,
        holdExpiresAt: enrollment.holdExpiresAt
      })
    });
  } catch (err) {
    next(err);
  }
};

const processWebhook = async (req, res, next) => {
  try {
    if (!isSandboxEnabled()) {
      throw new AppError("Sandbox payment is disabled in this environment", "FORBIDDEN", 403);
    }

    const { gatewayReference, status } = req.body || {};
    if (typeof gatewayReference !== "string" || !["SUCCESS", "FAILED"].includes(status)) {
      throw new AppError("gatewayReference and status (SUCCESS | FAILED) are required", "VALIDATION_ERROR", 400);
    }

    // PAY-05: Định tuyến tường minh theo tiền tố mã giao dịch (SBX-C- cho tài trợ, SBX- cho học phí)
    let result = null;
    if (gatewayReference.startsWith("SBX-C-") || gatewayReference.startsWith("CONTRIB-")) {
      result = await contributionService.processWebhook(gatewayReference, status);
      if (!result) {
        throw PAYMENT_NOT_FOUND("Sponsor contribution not found");
      }
    } else {
      result = await paymentService.processWebhook(gatewayReference, status);
    }

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/payments/webhook — callback duy nhất từ gateway cho mọi loại thanh toán:
 * học phí lớp học (Payment) và tài trợ từ Sponsor (Sponsor Contribution). Đảm bảo idempotent khi nhận trùng webhook.
 * Khi PAYMENT_WEBHOOK_SECRET được cấu hình, gateway bắt buộc phải gửi secret qua header `x-webhook-secret`.
 */
const processGatewayWebhook = async (req, res, next) => {
  try {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    // Fail-closed: thiếu secret trong cấu hình thì từ chối ngay, không fallback
    if (!secret) {
      throw new AppError("Webhook secret is not configured", "UNAUTHORIZED", 401);
    }

    const headerSecret = req.headers["x-webhook-secret"];
    if (typeof headerSecret !== "string" || !headerSecret) {
      throw new AppError("Invalid webhook signature", "UNAUTHORIZED", 401);
    }

    // Xác thực bằng timingSafeEqual kết hợp SHA-256 buffer để chống timing attack và lỗi lệch độ dài buffer
    const expectedBuffer = crypto.createHash("sha256").update(secret).digest();
    const providedBuffer = crypto.createHash("sha256").update(headerSecret).digest();
    if (!crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
      throw new AppError("Invalid webhook signature", "UNAUTHORIZED", 401);
    }

    const { gatewayReference, status } = req.body || {};
    if (typeof gatewayReference !== "string" || !["SUCCESS", "FAILED"].includes(status)) {
      throw new AppError("gatewayReference and status (SUCCESS | FAILED) are required", "VALIDATION_ERROR", 400);
    }

    // PAY-05: Định tuyến tường minh theo tiền tố mã giao dịch
    let result = null;
    if (gatewayReference.startsWith("SBX-C-") || gatewayReference.startsWith("CONTRIB-")) {
      result = await contributionService.processWebhook(gatewayReference, status);
      if (!result) {
        throw PAYMENT_NOT_FOUND("Sponsor contribution not found");
      }
    } else {
      result = await paymentService.processWebhook(gatewayReference, status);
    }

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

module.exports = {
  createSandboxPayment,
  processWebhook,
  processGatewayWebhook,
  getPaymentById,
  getPaymentHistory
};
