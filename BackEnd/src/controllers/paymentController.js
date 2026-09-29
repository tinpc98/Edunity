const paymentService = require("../services/paymentService");
const { serializeDecimal128 } = require("../utils/serialize");

const createSandboxPayment = async (req, res, next) => {
  try {
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
    const { gatewayReference, status } = req.body;

    const result = await paymentService.processWebhook(gatewayReference, status);

    res.status(200).json({
      success: true,
      data: result
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
  getPaymentHistory
};
