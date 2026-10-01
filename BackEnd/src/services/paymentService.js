const mongoose = require("mongoose");
const crypto = require("crypto");
const Enrollment = require("../models/Enrollment");
const Payment = require("../models/Payment");
const Transaction = require("../models/Transaction");
const TeacherEarning = require("../models/TeacherEarning");
const { getSetting } = require("../utils/settings");
const { toNum, toDec } = require("../utils/money");
const { getPendingScholarshipUsages, confirmScholarshipUsage } = require("./settlementService");
const { notify } = require("./notificationService");
const {
  ENROLLMENT_NOT_FOUND,
  ENROLLMENT_EXPIRED,
  PAYMENT_NOT_FOUND,
  FORBIDDEN
} = require("../utils/errors");

const createSandboxPayment = async (studentId, enrollmentId) => {
  if (!mongoose.isValidObjectId(enrollmentId)) throw ENROLLMENT_NOT_FOUND();
  
  const enrollment = await Enrollment.findOne({ _id: enrollmentId, studentId });
  if (!enrollment) {
    throw ENROLLMENT_NOT_FOUND();
  }

  const now = new Date();
  if (enrollment.enrollmentStatus !== "PENDING_PAYMENT" || !enrollment.holdExpiresAt || enrollment.holdExpiresAt <= now) {
    throw ENROLLMENT_EXPIRED();
  }

  // Check existing PENDING payment
  const existingPayment = await Payment.findOne({
    enrollmentId: enrollment._id,
    paymentStatus: "PENDING"
  });

  if (existingPayment) {
    return existingPayment;
  }

  // BR-41 (MIXED): when a Scholarship amount is held for this Enrollment,
  // the Payment only covers the remaining due; otherwise it is the full tuition.
  const { total: scholarshipHeld } = await getPendingScholarshipUsages(enrollment._id);
  const amount = scholarshipHeld > 0
    ? toDec(toNum(enrollment.tuitionAmount) - scholarshipHeld)
    : enrollment.tuitionAmount;

  const payment = new Payment({
    enrollmentId: enrollment._id,
    payerUserId: studentId,
    gateway: "SANDBOX",
    gatewayReference: "SBX-" + crypto.randomUUID(),
    amount,
    paymentStatus: "PENDING"
  });

  await payment.save();

  return payment;
};

const processWebhook = async (gatewayReference, status) => {
  const payment = await Payment.findOne({ gatewayReference });
  if (!payment) {
    throw PAYMENT_NOT_FOUND();
  }

  if (payment.paymentStatus !== "PENDING") {
    let enrollmentStatus = null;
    const enrollment = await Enrollment.findById(payment.enrollmentId);
    if (enrollment) {
      enrollmentStatus = enrollment.enrollmentStatus;
    }
    return {
      paymentStatus: payment.paymentStatus,
      enrollmentStatus,
      result: "IDEMPOTENT"
    };
  }

  const session = await mongoose.startSession();
  let result = {};

  try {
    await session.withTransaction(async () => {
      const now = new Date();

      if (status === "FAILED") {
        payment.paymentStatus = "FAILED";
        await payment.save({ session });
        
        const enrollment = await Enrollment.findById(payment.enrollmentId).session(session);
        result = {
          paymentStatus: "FAILED",
          enrollmentStatus: enrollment ? enrollment.enrollmentStatus : null,
          result: "PAYMENT_FAILED"
        };
        return;
      }

      if (status === "SUCCESS") {
        // BR-13 / BR-41: Payment + held ScholarshipUsage (MIXED) must cover the whole tuition
        const { usages: pendingUsages, total: scholarshipHeld } = await getPendingScholarshipUsages(payment.enrollmentId, session);
        const totalPaid = toDec(toNum(payment.amount) + scholarshipHeld);

        // Update enrollment with condition
        const updateRes = await Enrollment.updateOne(
          {
            _id: payment.enrollmentId,
            enrollmentStatus: "PENDING_PAYMENT",
            holdExpiresAt: { $gt: now },
            $expr: { $lte: ["$tuitionAmount", totalPaid] }
          },
          {
            $set: {
              enrollmentStatus: "CONFIRMED",
              amountPaidViaPayment: payment.amount,
              ...(scholarshipHeld > 0 ? { amountPaidViaScholarship: toDec(scholarshipHeld) } : {}),
              holdExpiresAt: null
            }
          },
          { session }
        );

        if (updateRes.modifiedCount === 1) {
          // Success update
          payment.paymentStatus = "COMPLETED";
          payment.paidAt = now;
          await payment.save({ session });

          const enrollment = await Enrollment.findById(payment.enrollmentId).session(session);

          // Create Transaction
          const transaction = new Transaction({
            transactionType: "ENROLLMENT_PAYMENT",
            sourceUserId: payment.payerUserId,
            destinationUserId: enrollment.teacherId,
            relatedEnrollmentId: enrollment._id,
            relatedPaymentId: payment._id,
            amount: payment.amount,
            status: "COMPLETED"
          });
          await transaction.save({ session });

          // MIXED: officially record the Scholarship part (Campaign fund, Transaction)
          for (const usage of pendingUsages) {
            await confirmScholarshipUsage(usage, enrollment, session);
          }

          // Create TeacherEarning (on the whole tuition: Payment + Scholarship part)
          const commissionRate = getSetting("COMMISSION_RATE") || 0.10;
          const grossAmountNum = Number(payment.amount.toString()) + scholarshipHeld;
          const commissionAmountNum = Math.round(grossAmountNum * commissionRate);
          const netAmountNum = grossAmountNum - commissionAmountNum;

          const earning = new TeacherEarning({
            teacherId: enrollment.teacherId,
            enrollmentId: enrollment._id,
            classId: enrollment.classId,
            grossAmount: mongoose.Types.Decimal128.fromString(grossAmountNum.toString()),
            commissionAmount: mongoose.Types.Decimal128.fromString(commissionAmountNum.toString()),
            netAmount: mongoose.Types.Decimal128.fromString(netAmountNum.toString()),
            status: "PENDING"
          });
          await earning.save({ session });

          result = {
            paymentStatus: "COMPLETED",
            enrollmentStatus: "CONFIRMED",
            result: "PAYMENT_SUCCESS"
          };
        } else {
          // Late webhook, enrollment already expired or cancelled
          payment.paymentStatus = "COMPLETED";
          payment.paidAt = now;
          await payment.save({ session });

          const refundTx = new Transaction({
            transactionType: "REFUND",
            sourceUserId: payment.payerUserId,
            // no destination needed, returning to source
            relatedPaymentId: payment._id,
            amount: payment.amount,
            status: "PENDING"
          });
          await refundTx.save({ session });

          const currentEnrollment = await Enrollment.findById(payment.enrollmentId).session(session);
          
          result = {
            paymentStatus: "COMPLETED",
            enrollmentStatus: currentEnrollment ? currentEnrollment.enrollmentStatus : null,
            result: "LATE_PAYMENT_REFUND_REQUIRED"
          };
        }
      }
    });
  } finally {
    session.endSession();
  }

  if (result.result === "PAYMENT_SUCCESS") {
    await notify(payment.payerUserId, "Thanh toán thành công", "Học phí đã được thanh toán, bạn đã được ghi danh vào lớp.", "ENROLLMENT_CONFIRMED");
  }

  return result;
};

// GET /payments/:id — payment status for its payer (or an Admin)
const getPaymentById = async (user, paymentId) => {
  if (!mongoose.isValidObjectId(paymentId)) throw PAYMENT_NOT_FOUND();

  const payment = await Payment.findById(paymentId).lean();
  if (!payment || (user.role !== "ADMIN" && payment.payerUserId.toString() !== user.id.toString())) {
    throw PAYMENT_NOT_FOUND();
  }

  const enrollment = await Enrollment.findById(payment.enrollmentId)
    .select("enrollmentStatus paymentSource holdExpiresAt classId")
    .lean();
  return {
    ...payment,
    enrollmentStatus: enrollment ? enrollment.enrollmentStatus : null,
    paymentSource: enrollment ? enrollment.paymentSource : null,
    holdExpiresAt: enrollment ? enrollment.holdExpiresAt : null,
    classId: enrollment ? enrollment.classId : null
  };
};

const getPaymentHistory = async (studentId, enrollmentId) => {
  if (!mongoose.isValidObjectId(enrollmentId)) throw ENROLLMENT_NOT_FOUND();

  const enrollment = await Enrollment.findOne({ _id: enrollmentId, studentId });
  if (!enrollment) {
    throw ENROLLMENT_NOT_FOUND();
  }

  const payments = await Payment.find({ enrollmentId }).sort({ createdAt: -1 });
  return payments;
};

module.exports = {
  createSandboxPayment,
  processWebhook,
  getPaymentHistory,
  getPaymentById
};
