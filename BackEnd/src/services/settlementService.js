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

module.exports = { getPendingScholarshipUsages, confirmScholarshipUsage, createTeacherEarning };
