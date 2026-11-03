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
  AppError,
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

  // Kiểm tra Payment trạng thái PENDING đã tồn tại
  const existingPayment = await Payment.findOne({
    enrollmentId: enrollment._id,
    paymentStatus: "PENDING"
  });

  if (existingPayment) {
    return existingPayment;
  }

  // BR-41 (MIXED): Khi Enrollment có giữ tiền học bổng (Scholarship),
  // Payment chỉ thanh toán phần còn lại; ngược lại là toàn bộ học phí.
  const { total: scholarshipHeld } = await getPendingScholarshipUsages(enrollment._id);
  const remainingNum = scholarshipHeld > 0
    ? toNum(enrollment.tuitionAmount) - scholarshipHeld
    : toNum(enrollment.tuitionAmount);

  if (!Number.isFinite(remainingNum) || remainingNum <= 0) {
    throw new AppError("No remaining tuition amount to pay", "VALIDATION_ERROR", 400);
  }
  const amount = toDec(remainingNum);

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
  const session = await mongoose.startSession();
  let result = {};
  let successfulPayerId = null;

  try {
    await session.withTransaction(async () => {
      const now = new Date();

      // PAY-03: Cập nhật trạng thái Payment có điều kiện nguyên tử: chỉ chuyển trạng thái nếu đang PENDING
      const targetPaymentStatus = status === "SUCCESS" ? "COMPLETED" : "FAILED";
      const updatedPayment = await Payment.findOneAndUpdate(
        { gatewayReference, paymentStatus: "PENDING" },
        {
          $set: {
            paymentStatus: targetPaymentStatus,
            ...(status === "SUCCESS" ? { paidAt: now } : {})
          }
        },
        { session, new: true }
      );

      if (!updatedPayment) {
        // Payment đã được xử lý trước đó, hoặc không tồn tại
        const existing = await Payment.findOne({ gatewayReference }).session(session);
        if (!existing) {
          throw PAYMENT_NOT_FOUND();
        }

        // PAY-04: Xử lý webhook SUCCESS đến muộn sau khi đã FAILED
        if (existing.paymentStatus === "FAILED" && status === "SUCCESS") {
          // Ghi audit log (đã redact dữ liệu nhạy cảm)
          console.warn(JSON.stringify({
            event: "LATE_SUCCESS_AFTER_FAILED",
            paymentId: existing._id ? existing._id.toString() : null,
            gatewayReference,
            timestamp: now.toISOString()
          }));

          const enrollment = await Enrollment.findById(existing.enrollmentId).session(session);
          result = {
            paymentStatus: "FAILED",
            enrollmentStatus: enrollment ? enrollment.enrollmentStatus : null,
            result: "LATE_SUCCESS_FLAGGED_FOR_REVIEW"
          };
          return;
        }

        const enrollment = await Enrollment.findById(existing.enrollmentId).session(session);
        result = {
          paymentStatus: existing.paymentStatus,
          enrollmentStatus: enrollment ? enrollment.enrollmentStatus : null,
          result: "IDEMPOTENT"
        };
        return;
      }

      if (status === "FAILED") {
        const enrollment = await Enrollment.findById(updatedPayment.enrollmentId).session(session);
        result = {
          paymentStatus: "FAILED",
          enrollmentStatus: enrollment ? enrollment.enrollmentStatus : null,
          result: "PAYMENT_FAILED"
        };
        return;
      }

      if (status === "SUCCESS") {
        // BR-13 / BR-41: Tổng thanh toán (Payment) + phần học bổng tạm giữ (ScholarshipUsage) phải đủ toàn bộ học phí
        const { usages: pendingUsages, total: scholarshipHeld } = await getPendingScholarshipUsages(updatedPayment.enrollmentId, session);
        const totalPaid = toDec(toNum(updatedPayment.amount) + scholarshipHeld);

        // Cập nhật trạng thái Enrollment có điều kiện
        const updateRes = await Enrollment.updateOne(
          {
            _id: updatedPayment.enrollmentId,
            enrollmentStatus: "PENDING_PAYMENT",
            holdExpiresAt: { $gt: now },
            $expr: { $lte: ["$tuitionAmount", totalPaid] }
          },
          {
            $set: {
              enrollmentStatus: "CONFIRMED",
              amountPaidViaPayment: updatedPayment.amount,
              ...(scholarshipHeld > 0 ? { amountPaidViaScholarship: toDec(scholarshipHeld) } : {}),
              holdExpiresAt: null
            }
          },
          { session }
        );

        if (updateRes.modifiedCount === 1) {
          const enrollment = await Enrollment.findById(updatedPayment.enrollmentId).session(session);

          // Tạo bản ghi Transaction
          const transaction = new Transaction({
            transactionType: "ENROLLMENT_PAYMENT",
            sourceUserId: updatedPayment.payerUserId,
            destinationUserId: enrollment.teacherId,
            relatedEnrollmentId: enrollment._id,
            relatedPaymentId: updatedPayment._id,
            amount: updatedPayment.amount,
            status: "COMPLETED"
          });
          await transaction.save({ session });

          // MIXED: chính thức ghi nhận phần học bổng (quỹ Campaign, Transaction)
          for (const usage of pendingUsages) {
            await confirmScholarshipUsage(usage, enrollment, session);
          }

          // Tạo TeacherEarning (trên toàn bộ học phí: phần Payment + phần Scholarship)
          const commissionRate = getSetting("COMMISSION_RATE") || 0.10;
          const grossAmountNum = Number(updatedPayment.amount.toString()) + scholarshipHeld;
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

          successfulPayerId = updatedPayment.payerUserId;
          result = {
            paymentStatus: "COMPLETED",
            enrollmentStatus: "CONFIRMED",
            result: "PAYMENT_SUCCESS"
          };
        } else {
          // Webhook đến muộn, thời gian giữ chỗ của Enrollment đã hết hạn hoặc bị hủy
          const refundTx = new Transaction({
            transactionType: "REFUND",
            sourceUserId: updatedPayment.payerUserId,
            // Trả lại nguồn, không cần destination
            relatedPaymentId: updatedPayment._id,
            amount: updatedPayment.amount,
            status: "PENDING"
          });
          await refundTx.save({ session });

          const currentEnrollment = await Enrollment.findById(updatedPayment.enrollmentId).session(session);
          
          result = {
            paymentStatus: "COMPLETED",
            enrollmentStatus: currentEnrollment ? currentEnrollment.enrollmentStatus : null,
            result: "LATE_PAYMENT_PENDING_REVIEW"
          };
        }
      }
    });
  } finally {
    session.endSession();
  }

  if (result.result === "PAYMENT_SUCCESS" && successfulPayerId) {
    await notify(successfulPayerId, "Thanh toán thành công", "Học phí đã được thanh toán, bạn đã được ghi danh vào lớp.", "ENROLLMENT_CONFIRMED");
  }

  return result;
};

// GET /payments/:id — xem trạng thái thanh toán cho người trả (hoặc Admin)
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
