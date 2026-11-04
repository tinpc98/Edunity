const { Scholarship, ScholarshipCampaign, ScholarshipUsage, Transaction, TeacherEarning } = require("../models");
const { getSetting } = require("../utils/settings");
const { toNum, toDec } = require("../utils/money");

/**
 * Sum of the Scholarship amounts currently held (PENDING) for an Enrollment (MIXED co-payment).
 */
const getPendingScholarshipUsages = async (enrollmentId, session) => {
  const usages = await ScholarshipUsage.find({ enrollmentId, status: "PENDING" }).session(session || null);
  const total = usages.reduce((sum, usage) => sum + toNum(usage.amount), 0);
  return { usages, total };
};

/**
 * Finalizes a ScholarshipUsage once the Enrollment is fully paid (UC-STU-08):
 * the Campaign used fund is updated, the ledger Transaction is written (BR-28)
 * and the Scholarship is marked EXHAUSTED when nothing remains.
 * The Scholarship balance itself was already deducted when the usage was created (held).
 */
const confirmScholarshipUsage = async (usage, enrollment, session) => {
  usage.status = "CONFIRMED";
  usage.usedAt = new Date();
  await usage.save({ session });

  const scholarship = await Scholarship.findById(usage.scholarshipId).session(session);
  await ScholarshipCampaign.updateOne({ _id: scholarship.campaignId }, { $inc: { usedAmount: usage.amount } }, { session });

  if (toNum(scholarship.remainingAmount) <= 0) {
    scholarship.status = "EXHAUSTED";
    await scholarship.save({ session });
  }

  await Transaction.create(
    [
      {
        transactionType: "SCHOLARSHIP_USAGE",
        sourceUserId: enrollment.studentId,
        destinationUserId: enrollment.teacherId,
        relatedEnrollmentId: enrollment._id,
        relatedScholarshipUsageId: usage._id,
        amount: usage.amount,
        status: "COMPLETED",
      },
    ],
    { session }
  );
};

// BR-27: Scholarship payment vẫn tạo Teacher Earning, theo cùng quy tắc Commission (mục 4.2)
const createTeacherEarning = async (enrollment, grossAmountNum, session) => {
  const commissionRate = getSetting("COMMISSION_RATE") || 0.1;
  const commissionAmountNum = Math.round(grossAmountNum * commissionRate);
  const netAmountNum = grossAmountNum - commissionAmountNum;

  await TeacherEarning.create(
    [
      {
        teacherId: enrollment.teacherId,
        enrollmentId: enrollment._id,
        classId: enrollment.classId,
        grossAmount: toDec(grossAmountNum),
        commissionAmount: toDec(commissionAmountNum),
        netAmount: toDec(netAmountNum),
        status: "PENDING",
      },
    ],
    { session }
  );
};


/**
 * F03: refund of one Session to one student, issued when an Admin approves a SessionRefundReview.
 * - Amount: the student's tuition divided by the class's number of sessions, capped by what was actually paid.
 * - Ledger: a REFUND Transaction (PENDING until the payment team / gateway executes the transfer).
 * - Teacher: the matching TeacherEarning is reduced by the refunded gross amount (commission recomputed) unless it has
 *   already been paid out, in which case the review is left for manual reconciliation.
 * Returns { refundAmount, transaction, earningAdjusted }.
 */
const issueSessionRefund = async (review, session) => {
  const { Enrollment, Session } = require("../models");
  const enrollment = await Enrollment.findById(review.enrollmentId).session(session || null);
  if (!enrollment) return { refundAmount: 0, transaction: null, earningAdjusted: false };

  const paid = toNum(enrollment.amountPaidViaPayment) + toNum(enrollment.amountPaidViaScholarship);
  const sessionCount = Math.max(1, await Session.countDocuments({ classId: enrollment.classId }).session(session || null));
  const refundAmount = Math.min(paid, Math.round(toNum(enrollment.tuitionAmount) / sessionCount));
  if (refundAmount <= 0) return { refundAmount: 0, transaction: null, earningAdjusted: false };

  const [transaction] = await Transaction.create(
    [
      {
        transactionType: "REFUND",
        sourceUserId: enrollment.teacherId,
        destinationUserId: enrollment.studentId,
        relatedEnrollmentId: enrollment._id,
        relatedPaymentId: review.paymentId || null,
        amount: toDec(refundAmount),
        status: "PENDING",
      },
    ],
    { session }
  );

  let earningAdjusted = false;
  const earning = await TeacherEarning.findOne({ enrollmentId: enrollment._id }).session(session || null);
  if (earning && earning.status !== "PAID_OUT") {
    const gross = Math.max(0, toNum(earning.grossAmount) - refundAmount);
    const commissionRate = getSetting("COMMISSION_RATE") || 0.1;
    const commission = Math.round(gross * commissionRate);
    earning.grossAmount = toDec(gross);
    earning.commissionAmount = toDec(commission);
    earning.netAmount = toDec(gross - commission);
    await earning.save({ session });
    earningAdjusted = true;
  }

  return { refundAmount, transaction, earningAdjusted };
};

module.exports = { getPendingScholarshipUsages, confirmScholarshipUsage, createTeacherEarning, issueSessionRefund };
