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
 * Tìm Scholarship phù hợp để sử dụng: theo scholarshipId yêu cầu, hoặc học bổng còn hiệu lực
 * hết hạn sớm nhất của học viên có Campaign scope bao trùm Class.
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
 * - Học bổng chi trả toàn bộ học phí → paymentSource = SCHOLARSHIP, Enrollment CONFIRMED.
 * - Học bổng chi trả một phần → paymentSource = MIXED, số tiền được tạm giữ (ScholarshipUsage PENDING)
 *   và học viên thanh toán phần chênh lệch (remainingDue) qua POST /enrollments/:id/payments trong thời gian giữ chỗ.
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
  // PAY-06: Kiểm tra chặt chẽ số tiền học phí, không cho phép âm / 0 / NaN hoặc vượt ngưỡng an toàn
  if (!Number.isFinite(tuition) || tuition <= 0 || tuition > 1e12) {
    throw new AppError("Invalid tuition amount", "VALIDATION_ERROR", 400);
  }

  const scholarshipRemaining = toNum(scholarship.remainingAmount);
  if (!Number.isFinite(scholarshipRemaining) || scholarshipRemaining <= 0) {
    throw scholarshipUnavailable("Scholarship has no remaining balance");
  }

  const scholarshipAmount = Math.min(scholarshipRemaining, tuition);
  if (!Number.isFinite(scholarshipAmount) || scholarshipAmount <= 0) {
    throw scholarshipUnavailable("Scholarship balance is not available");
  }

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
      // Quan hệ Enrollment 1 — 0..1 ScholarshipUsage
      const existingUsage = await ScholarshipUsage.findOne({
        enrollmentId: enrollment._id,
        status: { $in: ["PENDING", "CONFIRMED"] },
      }).session(session);
      if (existingUsage) {
        throw new AppError("A scholarship is already applied to this enrollment", "SCHOLARSHIP_ALREADY_APPLIED", 409);
      }

      // PAY-06: Đảm bảo quỹ Campaign khả dụng đủ chi trả bên trong session transaction
      const campaignCheck = await ScholarshipCampaign.findOne({
        _id: scholarship.campaignId,
        $expr: {
          $gte: [{ $subtract: ["$fundedAmount", "$usedAmount"] }, amountDec]
        }
      }).session(session);
      if (!campaignCheck) {
        throw new AppError("Campaign fund is not available", "CAMPAIGN_FUND_UNAVAILABLE", 409);
      }

      // BR-25 / PAY-06: Trừ số dư học bổng bằng findOneAndUpdate có điều kiện nguyên tử (kiểm tra và cập nhật cùng một thao tác) trong session
      const deducted = await Scholarship.findOneAndUpdate(
        { _id: scholarship._id, status: "ACTIVE", remainingAmount: { $gte: amountDec } },
        { $inc: { remainingAmount: toDec(-scholarshipAmount) } },
        { session, new: true }
      );
      if (!deducted) throw scholarshipUnavailable("Scholarship balance is no longer available");

      const enrollmentUpdate = isFullyCovered
        ? { enrollmentStatus: "CONFIRMED", paymentSource: "SCHOLARSHIP", amountPaidViaScholarship: amountDec, holdExpiresAt: null }
        : { paymentSource: "MIXED" };
      const updated = await Enrollment.updateOne(
        { _id: enrollment._id, enrollmentStatus: "PENDING_PAYMENT", holdExpiresAt: { $gt: new Date() } },
        { $set: enrollmentUpdate },
        { session }
      );
      if (updated.modifiedCount !== 1) throw ENROLLMENT_EXPIRED();

      // Payment intent tạo cho toàn bộ học phí trước đó sẽ không còn hiệu lực khi áp dụng học bổng
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
