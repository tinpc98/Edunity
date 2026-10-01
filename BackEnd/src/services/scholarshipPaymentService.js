const mongoose = require("mongoose");
const { Class, Enrollment, Payment, Scholarship, ScholarshipCampaign, ScholarshipUsage } = require("../models");
const { AppError, ENROLLMENT_NOT_FOUND, ENROLLMENT_EXPIRED } = require("../utils/errors");
const { toNum, toDec } = require("../utils/money");
const { confirmScholarshipUsage, createTeacherEarning } = require("./settlementService");
const { notify } = require("./notificationService");

const includesId = (ids, id) => (ids || []).some((item) => item.toString() === id.toString());

// BR-24: Scholarship chỉ dùng cho Class nằm trong phạm vi Campaign. Scope trống = không giới hạn.
const isClassInCampaignScope = (campaign, cls) => {
  const scope = campaign.scope || {};
  const hasScope = ["categoryIds", "subjectIds", "courseIds"].some((key) => (scope[key] || []).length > 0);
  if (!hasScope) return true;
  return (
    includesId(scope.courseIds, cls.courseId) ||
    includesId(scope.subjectIds, cls.subjectId) ||
    includesId(scope.categoryIds, cls.categoryId)
  );
};

const scholarshipUnavailable = (message, code = "SCHOLARSHIP_NOT_USABLE") => new AppError(message, code, 409);

/**
 * Resolves the Scholarship to use: the one requested, or the student's usable
 * Scholarship that expires first and whose Campaign scope covers the Class.
 */
const resolveScholarship = async (studentId, scholarshipId, cls, now) => {
  const usable = { studentId, status: "ACTIVE", validFrom: { $lte: now }, expiresAt: { $gt: now }, remainingAmount: { $gt: 0 } };

  if (scholarshipId) {
    if (!mongoose.isValidObjectId(scholarshipId)) throw new AppError("Scholarship not found", "SCHOLARSHIP_NOT_FOUND", 404);
    const scholarship = await Scholarship.findOne({ _id: scholarshipId, studentId });
    if (!scholarship) throw new AppError("Scholarship not found", "SCHOLARSHIP_NOT_FOUND", 404);
    // BR-23 / BR-25
    if (scholarship.status !== "ACTIVE") throw scholarshipUnavailable("Scholarship is not active");
    if (scholarship.expiresAt <= now || scholarship.validFrom > now) {
      throw scholarshipUnavailable("Scholarship is expired or not valid yet", "SCHOLARSHIP_EXPIRED");
    }
    if (toNum(scholarship.remainingAmount) <= 0) throw scholarshipUnavailable("Scholarship has no remaining balance");

    const campaign = await ScholarshipCampaign.findById(scholarship.campaignId);
    if (!campaign || !isClassInCampaignScope(campaign, cls)) {
      throw new AppError("Class is outside the scholarship campaign scope", "CLASS_OUT_OF_SCHOLARSHIP_SCOPE", 409);
    }
    return { scholarship, campaign };
  }

  const candidates = await Scholarship.find(usable).sort({ expiresAt: 1 });
  for (const scholarship of candidates) {
    const campaign = await ScholarshipCampaign.findById(scholarship.campaignId);
    if (campaign && isClassInCampaignScope(campaign, cls)) return { scholarship, campaign };
  }
  throw new AppError("No usable scholarship for this class", "NO_ELIGIBLE_SCHOLARSHIP", 409);
};

/**
 * UC-STU-08: POST /enrollments/:id/scholarship-payment.
 * - Scholarship covers the whole tuition → paymentSource = SCHOLARSHIP, Enrollment CONFIRMED.
 * - Scholarship covers a part → paymentSource = MIXED, the amount is held (usage PENDING) and the
 *   student pays `remainingDue` through POST /enrollments/:id/payments within the seat-hold window.
 */
const payWithScholarship = async (studentId, enrollmentId, scholarshipId) => {
  if (!mongoose.isValidObjectId(enrollmentId)) throw ENROLLMENT_NOT_FOUND();
  const enrollment = await Enrollment.findOne({ _id: enrollmentId, studentId });
  if (!enrollment) throw ENROLLMENT_NOT_FOUND();

  const now = new Date();
  if (enrollment.enrollmentStatus !== "PENDING_PAYMENT" || !enrollment.holdExpiresAt || enrollment.holdExpiresAt <= now) {
    throw ENROLLMENT_EXPIRED();
  }

  const cls = await Class.findById(enrollment.classId);
  if (!cls) throw ENROLLMENT_NOT_FOUND();

  const { scholarship, campaign } = await resolveScholarship(studentId, scholarshipId, cls, now);

  const tuition = toNum(enrollment.tuitionAmount);
  const scholarshipAmount = Math.min(toNum(scholarship.remainingAmount), tuition);
  const remainingDue = tuition - scholarshipAmount;
  const isFullyCovered = remainingDue <= 0;
  const amountDec = toDec(scholarshipAmount);

  // BR-26: Campaign không được sử dụng vượt Available Fund
  if (toNum(campaign.fundedAmount) - toNum(campaign.usedAmount) < scholarshipAmount) {
    throw new AppError("Campaign fund is not available", "CAMPAIGN_FUND_UNAVAILABLE", 409);
  }

  const session = await mongoose.startSession();
  let usage;
  try {
    await session.withTransaction(async () => {
      // Enrollment 1 — 0..1 ScholarshipUsage
      const existingUsage = await ScholarshipUsage.findOne({
        enrollmentId: enrollment._id,
        status: { $in: ["PENDING", "CONFIRMED"] },
      }).session(session);
      if (existingUsage) {
        throw new AppError("A scholarship is already applied to this enrollment", "SCHOLARSHIP_ALREADY_APPLIED", 409);
      }

      // BR-25: atomic deduction, never below zero. Released again if the hold expires (reservationService).
      const deducted = await Scholarship.updateOne(
        { _id: scholarship._id, status: "ACTIVE", remainingAmount: { $gte: amountDec } },
        { $inc: { remainingAmount: toDec(-scholarshipAmount) } },
        { session }
      );
      if (deducted.modifiedCount !== 1) throw scholarshipUnavailable("Scholarship balance is no longer available");

      const enrollmentUpdate = isFullyCovered
        ? { enrollmentStatus: "CONFIRMED", paymentSource: "SCHOLARSHIP", amountPaidViaScholarship: amountDec, holdExpiresAt: null }
        : { paymentSource: "MIXED" };
      const updated = await Enrollment.updateOne(
        { _id: enrollment._id, enrollmentStatus: "PENDING_PAYMENT", holdExpiresAt: { $gt: new Date() } },
        { $set: enrollmentUpdate },
        { session }
      );
      if (updated.modifiedCount !== 1) throw ENROLLMENT_EXPIRED();

      // A payment intent created for the full tuition is no longer valid once a scholarship is applied
      await Payment.updateMany(
        { enrollmentId: enrollment._id, paymentStatus: "PENDING" },
        { $set: { paymentStatus: "FAILED" } },
        { session }
      );

      [usage] = await ScholarshipUsage.create(
        [
          {
            scholarshipId: scholarship._id,
            enrollmentId: enrollment._id,
            classId: enrollment.classId,
            amount: amountDec,
            status: "PENDING",
          },
        ],
        { session }
      );

      if (isFullyCovered) {
        await confirmScholarshipUsage(usage, enrollment, session);
        await createTeacherEarning(enrollment, tuition, session);
      }
    });
  } finally {
    session.endSession();
  }

  if (isFullyCovered) {
    await notify(studentId, "Đăng ký lớp thành công", `Học bổng đã thanh toán toàn bộ học phí lớp "${cls.className}".`, "ENROLLMENT_CONFIRMED");
  }

  const current = await Enrollment.findById(enrollment._id).lean();
  return {
    enrollmentId: current._id,
    enrollmentStatus: current.enrollmentStatus,
    paymentSource: current.paymentSource,
    tuitionAmount: current.tuitionAmount,
    scholarshipId: scholarship._id,
    scholarshipUsageId: usage._id,
    scholarshipAmount: amountDec,
    remainingDue: toDec(Math.max(remainingDue, 0)),
    holdExpiresAt: current.holdExpiresAt,
  };
};

module.exports = { payWithScholarship, isClassInCampaignScope };
