const mongoose = require("mongoose");
const {
  Scholarship,
  ScholarshipCampaign,
  ScholarshipUsage,
  Transaction,
  TeacherEarning,
  TeacherSettlement,
  Class,
  Session,
  Enrollment,
  Payment,
  Report,
  SessionRefundReview,
  SessionRescheduleRequest,
  TeacherIncidentReport,
  PaymentReconciliation,
} = require("../models");
const { getSetting, resolveCommissionPolicy } = require("../utils/settings");
const { toNum, toDec } = require("../utils/money");
const { AppError } = require("../utils/errors");

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Vietnam Timezone Helper (Asia/Ho_Chi_Minh, UTC+7)
 */
function getVietnamTimeParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour12: false,
    weekday: "short", // 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const partMap = {};
  for (const p of parts) partMap[p.type] = p.value;

  const weekday = partMap.weekday;
  const hour = parseInt(partMap.hour, 10);
  const minute = parseInt(partMap.minute, 10);
  const second = parseInt(partMap.second, 10);

  return { weekday, hour, minute, second, partMap };
}

/**
 * BR-09: Teacher withdrawal window is MONDAYS from 08:00:00 to before 17:00:00 (Asia/Ho_Chi_Minh).
 */
function isMondayWithdrawalWindow(date = new Date()) {
  const { weekday, hour } = getVietnamTimeParts(date);
  if (weekday !== "Mon") return false;
  if (hour < 8 || hour >= 17) return false;
  return true;
}

/**
 * BR-10: Admin payout execution window is FRIDAYS from 08:00:00 to before 17:00:00 (Asia/Ho_Chi_Minh).
 */
function isFridayPayoutWindow(date = new Date()) {
  const { weekday, hour } = getVietnamTimeParts(date);
  if (weekday !== "Fri") return false;
  if (hour < 8 || hour >= 17) return false;
  return true;
}

function getBlockerMessage(code) {
  const map = {
    ENROLLMENT_NOT_ELIGIBLE: "Ghi danh chưa được xác nhận hoặc đã bị hủy.",
    PAYMENT_NOT_COMPLETED: "Khoản thanh toán học phí chưa hoàn tất thành công.",
    CLASS_NOT_COMPLETED: "Lớp học chưa kết thúc chương trình.",
    NO_SESSIONS_FOUND: "Lớp học không có dữ liệu buổi học hợp lệ.",
    UNFINISHED_SESSIONS: "Còn buổi học chính chưa kết thúc.",
    PENDING_MAKEUP_SESSIONS: "Còn buổi học bù chưa hoàn thành.",
    PENDING_RESCHEDULE_REQUESTS: "Còn yêu cầu dời lịch học đang chờ duyệt.",
    ACTIVE_TEACHER_INCIDENTS: "Có sự cố giảng dạy đang điều tra.",
    ACTIVE_DISPUTES: "Có khiếu nại hoặc tranh chấp chưa được giải quyết.",
    PENDING_REFUND_REVIEWS: "Có yêu cầu hoàn phí chưa xử lý xong.",
    ACTIVE_PAYMENT_RECONCILIATIONS: "Giao dịch thanh toán đang cần đối soát.",
    SEVEN_DAY_HOLD_ACTIVE: "Đang trong thời gian chờ an toàn 7 ngày theo quy định BR-07.",
    COMMISSION_POLICY_INVALID: "Chính sách hoa hồng của bản ghi thu nhập không hợp lệ.",
    ALREADY_PAID_OUT: "Khoản thu nhập đã được chi trả.",
  };
  return map[code] || code;
}

/**
 * Sum of the Scholarship amounts currently held (PENDING) for an Enrollment (MIXED co-payment).
 */
const getPendingScholarshipUsages = async (enrollmentId, session) => {
  const usages = await ScholarshipUsage.find({
    enrollmentId,
    status: "PENDING",
  }).session(session || null);
  const total = usages.reduce((sum, usage) => sum + toNum(usage.amount), 0);
  return { usages, total };
};

/**
 * Finalizes a ScholarshipUsage once the Enrollment is fully paid (UC-STU-08).
 */
const confirmScholarshipUsage = async (
  usage,
  enrollment,
  session,
  extraTxFields = {},
) => {
  const isLiveDb = mongoose.connection && mongoose.connection.readyState === 1;

  if (isLiveDb) {
    const updatedUsage = await ScholarshipUsage.findOneAndUpdate(
      { _id: usage._id, status: "PENDING" },
      { $set: { status: "CONFIRMED", usedAt: new Date() } },
      { session, returnDocument: "after" },
    );
    if (!updatedUsage) {
      throw new AppError(
        "ScholarshipUsage is no longer PENDING",
        "SCHOLARSHIP_USAGE_INVALID_STATE",
        409,
      );
    }
    usage.status = "CONFIRMED";
    usage.usedAt = updatedUsage.usedAt;
  } else {
    usage.status = "CONFIRMED";
    usage.usedAt = new Date();
    if (typeof usage.save === "function") {
      await usage.save({ session });
    }
  }

  const scholarship = await Scholarship.findById(usage.scholarshipId).session(
    session,
  );
  if (!scholarship) {
    throw new AppError(
      "Scholarship not found for usage",
      "SCHOLARSHIP_NOT_FOUND",
      404,
    );
  }

  if (isLiveDb) {
    const updatedCampaign = await ScholarshipCampaign.findOneAndUpdate(
      {
        _id: scholarship.campaignId,
        $expr: {
          $lte: [{ $add: ["$usedAmount", usage.amount] }, "$fundedAmount"],
        },
      },
      { $inc: { usedAmount: usage.amount } },
      { session, returnDocument: "after" },
    );
    if (!updatedCampaign) {
      throw new AppError(
        "Campaign fund is insufficient to confirm scholarship usage",
        "CAMPAIGN_FUND_UNAVAILABLE",
        409,
      );
    }
  } else {
    await ScholarshipCampaign.updateOne(
      { _id: scholarship.campaignId },
      { $inc: { usedAmount: usage.amount } },
      { session },
    );
  }

  if (
    toNum(scholarship.remainingAmount) <= 0 &&
    scholarship.status !== "EXHAUSTED"
  ) {
    scholarship.status = "EXHAUSTED";
    await scholarship.save({ session });
  }

  const [tx] = await Transaction.create(
    [
      {
        transactionType: "SCHOLARSHIP_USAGE",
        sourceUserId: enrollment.studentId,
        destinationUserId: enrollment.teacherId,
        relatedEnrollmentId: enrollment._id,
        relatedScholarshipUsageId: usage._id,
        ...(extraTxFields.relatedBankEventId
          ? { relatedBankEventId: extraTxFields.relatedBankEventId }
          : {}),
        amount: usage.amount,
        status: "COMPLETED",
      },
    ],
    { session },
  );
  return tx;
};

/**
 * BR-01, BR-02, BR-13: Create TeacherEarning with snapshot commission rate and settlement hold.
 */
const createTeacherEarning = async (
  enrollment,
  grossAmountNum,
  session,
  options = {},
) => {
  const policy = resolveCommissionPolicy({
    requireApprovedPolicy: options.requireApprovedPolicy,
  });
  const commissionRate = policy.rate;
  const commissionAmountNum = Math.round(grossAmountNum * commissionRate);
  const netAmountNum = grossAmountNum - commissionAmountNum;
  const tuitionNum = enrollment.tuitionAmount
    ? toNum(enrollment.tuitionAmount)
    : grossAmountNum;

  const [earning] = await TeacherEarning.create(
    [
      {
        teacherId: enrollment.teacherId,
        enrollmentId: enrollment._id,
        classId: enrollment.classId,
        tuitionAmount: toDec(tuitionNum),
        grossAmount: toDec(grossAmountNum),
        commissionRate,
        appliedPolicyVersion: policy.version,
        commissionPolicySource: policy.source,
        commissionAmount: toDec(commissionAmountNum),
        netAmount: toDec(netAmountNum),
        status: "PENDING",
        settlementHoldRequired:
          options.settlementHoldRequired !== undefined
            ? Boolean(options.settlementHoldRequired)
            : true, // Default to true in PR7
      },
    ],
    { session },
  );
  return earning;
};

/**
 * Evaluates Settlement Eligibility for a TeacherEarning against all 12 Business Rules.
 * If all conditions are met and 7-day period has elapsed: transitions to AVAILABLE.
 * If blockers exist: remains PENDING (or re-locks to PENDING if previously AVAILABLE).
 */
const evaluateEarningSettlement = async (earningId, options = {}) => {
  const now = options.now instanceof Date ? options.now : new Date();
  const session = options.session || null;

  const earning = await TeacherEarning.findById(earningId).session(session);
  if (!earning) {
    throw new AppError("Teacher earning not found", "EARNING_NOT_FOUND", 404);
  }

  // If already PAID_OUT, no further settlement evaluation needed
  if (earning.status === "PAID_OUT") {
    return {
      earningId: earning._id.toString(),
      eligible: false,
      status: "PAID_OUT",
      blockers: [],
      availableAt: earning.availableAt,
      settledAt: earning.settledAt,
    };
  }

  // Fail-closed (TIN-FIN-PR10-FINAL-GATE): Missing or undefined settlementHoldRequired is treated as requiring hold (true).
  // Only records explicitly marked with settlementHoldRequired: false bypass V3 hold.
  if (earning.settlementHoldRequired === false) {
    return {
      earningId: earning._id.toString(),
      eligible: true,
      status: earning.status,
      blockers: [],
      availableAt: earning.availableAt,
      settledAt: earning.settledAt,
    };
  }

  const blockers = [];
  const milestones = {
    classCompletedAt: null,
    lastSessionCompletedAt: null,
    lastMakeupCompletedAt: null,
    lastDisputeResolvedAt: null,
    lastRefundReviewResolvedAt: null,
    latestMilestoneAt: null,
  };

  // Rule 1: Enrollment validity
  const enrollment = await Enrollment.findById(earning.enrollmentId).session(session);
  if (!enrollment || !["CONFIRMED", "COMPLETED"].includes(enrollment.enrollmentStatus)) {
    blockers.push("ENROLLMENT_NOT_ELIGIBLE");
  }

  // Rule 2: Payment validity (for paid portion)
  if (enrollment && toNum(enrollment.amountPaidViaPayment) > 0) {
    const payment = await Payment.findOne({ enrollmentId: enrollment._id }).session(session);
    if (!payment || payment.paymentStatus !== "COMPLETED") {
      blockers.push("PAYMENT_NOT_COMPLETED");
    }
  }

  // Rule 3: Class completion
  const classDoc = await Class.findById(earning.classId).session(session);
  if (!classDoc || classDoc.status !== "COMPLETED") {
    blockers.push("CLASS_NOT_COMPLETED");
  } else {
    milestones.classCompletedAt = classDoc.completedAt || classDoc.endDate || classDoc.updatedAt;
  }

  // Rule 4: Sessions completion & terminal state
  const sessions = await Session.find({ classId: earning.classId }).session(session);
  if (!sessions || sessions.length === 0) {
    blockers.push("NO_SESSIONS_FOUND");
  } else {
    const nonTerminal = sessions.filter(
      (s) => !["COMPLETED", "CANCELLED"].includes(s.status) && !(s.status === "INTERRUPTED" && s.roomState === "ENDED")
    );
    if (nonTerminal.length > 0) {
      blockers.push("UNFINISHED_SESSIONS");
    } else {
      const regularSessions = sessions.filter((s) => !s.rescheduleMetadata?.isMakeupSession);
      if (regularSessions.length > 0) {
        const regularEndTimes = regularSessions.map((s) =>
          new Date(s.actualEndAt || s.endDatetime).getTime()
        );
        milestones.lastSessionCompletedAt = new Date(Math.max(...regularEndTimes));
      }
    }

    // Rule 5: Makeup sessions completion
    const makeupSessions = sessions.filter((s) => s.rescheduleMetadata?.isMakeupSession);
    if (makeupSessions.length > 0) {
      const pendingMakeups = makeupSessions.filter(
        (s) => !["COMPLETED", "CANCELLED"].includes(s.status)
      );
      if (pendingMakeups.length > 0) {
        blockers.push("PENDING_MAKEUP_SESSIONS");
      } else {
        const makeupEndTimes = makeupSessions.map((s) =>
          new Date(s.actualEndAt || s.endDatetime).getTime()
        );
        milestones.lastMakeupCompletedAt = new Date(Math.max(...makeupEndTimes));
      }
    }
  }

  // Check pending reschedule requests
  if (SessionRescheduleRequest) {
    const pendingReschedules = await SessionRescheduleRequest.countDocuments({
      classId: earning.classId,
      status: { $in: ["PENDING", "PENDING_ADMIN_APPROVAL"] },
    }).session(session);
    if (pendingReschedules > 0) {
      blockers.push("PENDING_RESCHEDULE_REQUESTS");
    }
  }

  // Rule 6: Open Teacher Incident Reports
  if (TeacherIncidentReport) {
    const openIncidents = await TeacherIncidentReport.countDocuments({
      classId: earning.classId,
      $or: [
        { status: { $in: ["OPEN", "UNDER_INVESTIGATION", "PENDING", "INVESTIGATING"] } },
        { reviewStatus: { $in: ["PENDING", "NEEDS_MORE_EVIDENCE"] } },
      ],
    }).session(session);
    if (openIncidents > 0) {
      blockers.push("ACTIVE_TEACHER_INCIDENTS");
    }
  }

  // Rule 7: Open Complaints / Disputes
  if (Report) {
    const openReports = await Report.find({
      classId: earning.classId,
      status: { $in: ["OPEN", "IN_REVIEW"] },
    }).session(session);
    if (openReports.length > 0) {
      blockers.push("ACTIVE_DISPUTES");
    } else {
      const resolvedReports = await Report.find({
        classId: earning.classId,
        status: { $in: ["RESOLVED", "REJECTED"] },
      }).session(session);
      if (resolvedReports.length > 0) {
        const resolvedTimes = resolvedReports.map((r) =>
          new Date(r.reviewedAt || r.updatedAt).getTime()
        );
        milestones.lastDisputeResolvedAt = new Date(Math.max(...resolvedTimes));
      }
    }
  }

  // Rule 8: Open Session Refund Reviews
  if (SessionRefundReview) {
    const openReviews = await SessionRefundReview.find({
      classId: earning.classId,
      $or: [
        { status: "NEEDS_FINANCIAL_REVIEW" },
        { earningReconciliationStatus: { $in: ["HOLD_RECOMMENDED", "PENDING_PAYMENT_TEAM_REVIEW"] } },
      ],
    }).session(session);
    if (openReviews.length > 0) {
      blockers.push("PENDING_REFUND_REVIEWS");
    } else {
      const closedReviews = await SessionRefundReview.find({
        classId: earning.classId,
        status: { $in: ["RESCHEDULED_WAIVED", "APPROVED_FOR_PAYMENT_TEAM", "REJECTED"] },
      }).session(session);
      if (closedReviews.length > 0) {
        const reviewTimes = closedReviews.map((r) => new Date(r.updatedAt).getTime());
        milestones.lastRefundReviewResolvedAt = new Date(Math.max(...reviewTimes));
      }
    }
  }

  // Rule 9: Open Payment Reconciliations
  if (PaymentReconciliation && enrollment) {
    const openRecons = await PaymentReconciliation.countDocuments({
      $or: [{ enrollmentId: enrollment._id }, { orderCode: enrollment.orderCode }],
      status: { $in: ["NEEDS_REVIEW", "IN_REVIEW"] },
    }).session(session);
    if (openRecons > 0) {
      blockers.push("ACTIVE_PAYMENT_RECONCILIATIONS");
    }
  }

  // Rule 10: Snapshot Commission Policy Check
  if (!Number.isFinite(earning.commissionRate) || earning.commissionRate < 0 || earning.commissionRate > 1) {
    blockers.push("COMMISSION_POLICY_INVALID");
  }

  // Rule 11 & 12: The 7-Day Waiting Period (BR-07, BR-08)
  const milestoneCandidates = [
    milestones.classCompletedAt ? milestones.classCompletedAt.getTime() : null,
    milestones.lastSessionCompletedAt ? milestones.lastSessionCompletedAt.getTime() : null,
    milestones.lastMakeupCompletedAt ? milestones.lastMakeupCompletedAt.getTime() : null,
    milestones.lastDisputeResolvedAt ? milestones.lastDisputeResolvedAt.getTime() : null,
    milestones.lastRefundReviewResolvedAt ? milestones.lastRefundReviewResolvedAt.getTime() : null,
  ].filter(Boolean);

  const latestMilestoneMs = milestoneCandidates.length > 0
    ? Math.max(...milestoneCandidates)
    : earning.createdAt.getTime();

  milestones.latestMilestoneAt = new Date(latestMilestoneMs);
  const settlementEligibleSince = milestones.latestMilestoneAt;
  const availableAt = new Date(latestMilestoneMs + SEVEN_DAYS_MS);

  // If other conditions are clear, check if 7 days have passed
  const nonTimeBlockers = blockers.filter((b) => b !== "SEVEN_DAY_HOLD_ACTIVE");
  if (nonTimeBlockers.length === 0) {
    if (now.getTime() < availableAt.getTime()) {
      blockers.push("SEVEN_DAY_HOLD_ACTIVE");
    }
  }

  // Update Earning & Settlement records
  const isEligible = blockers.length === 0;

  earning.settlementEligibleSince = settlementEligibleSince;
  earning.availableAt = availableAt;
  earning.settlementBlockers = blockers;

  if (isEligible) {
    if (earning.status === "PENDING") {
      earning.status = "AVAILABLE";
      earning.settledAt = now;
      earning.settlementAuditTrail.push({
        action: "SETTLED_AVAILABLE",
        note: `All conditions met; 7-day maturation completed at ${availableAt.toISOString()}`,
        timestamp: now,
      });
    }
  } else {
    // BR-08: If currently AVAILABLE but new blockers detected and not yet paid out, re-lock safely!
    if (earning.status === "AVAILABLE" && !earning.payoutId) {
      earning.status = "PENDING";
      earning.settlementAuditTrail.push({
        action: "RE_LOCKED_PENDING",
        note: `Re-locked to PENDING due to active blockers: ${blockers.join(", ")}`,
        timestamp: now,
      });
    }
  }

  await earning.save({ session });

  // Upsert TeacherSettlement audit record
  if (TeacherSettlement) {
    let settlementStatus = "HELD";
    if (earning.status === "AVAILABLE") settlementStatus = "SETTLED_AVAILABLE";
    else if (blockers.length === 1 && blockers[0] === "SEVEN_DAY_HOLD_ACTIVE") {
      settlementStatus = "ELIGIBLE_PENDING_MATURITY";
    }

    await TeacherSettlement.findOneAndUpdate(
      { earningId: earning._id },
      {
        $set: {
          teacherId: earning.teacherId,
          classId: earning.classId,
          enrollmentId: earning.enrollmentId,
          grossAmount: earning.grossAmount,
          commissionRate: earning.commissionRate,
          commissionAmount: earning.commissionAmount,
          netAmount: earning.netAmount,
          status: settlementStatus,
          milestones,
          settlementEligibleSince,
          availableAt,
          settledAt: isEligible ? now : null,
          blockers: blockers.map((b) => ({
            code: b,
            message: getBlockerMessage(b),
            detectedAt: now,
          })),
        },
        $push: {
          auditLogs: {
            action: isEligible ? "EVALUATE_SETTLED" : "EVALUATE_HELD",
            note: isEligible
              ? "All conditions satisfied. Funds unlocked to AVAILABLE."
              : `Evaluation completed with blockers: ${blockers.join(", ")}`,
            timestamp: now,
          },
        },
      },
      { upsert: true, session }
    );
  }

  return {
    earningId: earning._id.toString(),
    eligible: isEligible,
    status: earning.status,
    blockers,
    settlementEligibleSince,
    availableAt,
    latestMilestoneAt: milestones.latestMilestoneAt,
  };
};

/**
 * Evaluates all TeacherEarnings for a specific Class.
 */
const evaluateClassSettlement = async (classId, options = {}) => {
  const earnings = await TeacherEarning.find({
    classId,
    status: { $in: ["PENDING", "AVAILABLE"] },
  });
  const results = [];
  for (const e of earnings) {
    const res = await evaluateEarningSettlement(e._id, options);
    results.push(res);
  }
  return results;
};

/**
 * Batch evaluates all pending TeacherEarnings across the platform.
 */
const evaluateAllPendingSettlements = async (options = {}) => {
  const earnings = await TeacherEarning.find({
    status: { $in: ["PENDING", "AVAILABLE"] },
  }).select("_id");
  const results = [];
  let settledCount = 0;
  let heldCount = 0;
  for (const e of earnings) {
    try {
      const res = await evaluateEarningSettlement(e._id, options);
      if (res.eligible && res.status === "AVAILABLE") {
        settledCount++;
      } else {
        heldCount++;
      }
      results.push(res);
    } catch (err) {
      results.push({ earningId: e._id.toString(), error: err.message });
    }
  }
  results.evaluatedCount = earnings.length;
  results.settledCount = settledCount;
  results.heldCount = heldCount;
  return results;
};

/**
 * Teacher Settlement & Withdrawal Summary Dashboard Data.
 */
const getTeacherSettlementSummary = async (teacherId, options = {}) => {
  const now = options.now instanceof Date ? options.now : new Date();

  // Evaluate any pending earnings for this teacher to ensure up-to-the-minute freshness
  const pendingEarnings = await TeacherEarning.find({
    teacherId,
    status: "PENDING",
  }).select("_id");
  for (const e of pendingEarnings) {
    try {
      await evaluateEarningSettlement(e._id, { now });
    } catch (_) {}
  }

  const earnings = await TeacherEarning.find({ teacherId })
    .populate("classId", "className status startDate endDate")
    .populate("enrollmentId", "enrollmentStatus orderCode")
    .sort({ createdAt: -1 })
    .lean();

  let totalGross = 0;
  let totalNet = 0;
  let pendingSettlement = 0;
  let availableForWithdrawal = 0;
  let inWithdrawalRequest = 0;
  let paidOut = 0;

  const items = earnings.map((e) => {
    const gross = toNum(e.grossAmount);
    const net = toNum(e.netAmount);

    totalGross += gross;
    totalNet += net;

    if (e.status === "PENDING") {
      pendingSettlement += net;
    } else if (e.status === "AVAILABLE") {
      if (e.payoutId) {
        inWithdrawalRequest += net;
      } else {
        availableForWithdrawal += net;
      }
    } else if (e.status === "PAID_OUT") {
      paidOut += net;
    }

    return {
      id: e._id.toString(),
      classId: e.classId?._id?.toString() || e.classId?.toString(),
      className: e.classId?.className || "Lớp học",
      enrollmentId: e.enrollmentId?._id?.toString() || e.enrollmentId?.toString(),
      grossAmount: gross,
      commissionRate: e.commissionRate,
      commissionAmount: toNum(e.commissionAmount),
      netAmount: net,
      status: e.status,
      settlementHoldRequired: e.settlementHoldRequired,
      settlementEligibleSince: e.settlementEligibleSince,
      availableAt: e.availableAt,
      settledAt: e.settledAt,
      blockers: e.settlementBlockers || [],
      blockerMessages: (e.settlementBlockers || []).map(getBlockerMessage),
      payoutId: e.payoutId ? e.payoutId.toString() : null,
      createdAt: e.createdAt,
    };
  });

  const { weekday, hour, minute } = getVietnamTimeParts(now);
  const isWindowOpen = isMondayWithdrawalWindow(now);

  return {
    summary: {
      totalGross,
      totalNet,
      pendingSettlement,
      availableForWithdrawal,
      available: availableForWithdrawal,
      inWithdrawalRequest,
      paidOut,
    },
    withdrawalWindow: {
      isOpen: isWindowOpen,
      day: weekday,
      time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      rule: "Thứ Hai hàng tuần từ 08:00 đến 17:00 (Asia/Ho_Chi_Minh)",
    },
    items,
  };
};

/**
 * F03: refund of one Session to one student, issued when an Admin approves a SessionRefundReview.
 */
const issueSessionRefund = async (review, session) => {
  const { Enrollment, Session } = require("../models");
  const enrollment = await Enrollment.findById(review.enrollmentId).session(
    session || null,
  );
  if (!enrollment)
    return { refundAmount: 0, transaction: null, earningAdjusted: false };

  const paid =
    toNum(enrollment.amountPaidViaPayment) +
    toNum(enrollment.amountPaidViaScholarship);
  const sessionCount = Math.max(
    1,
    await Session.countDocuments({ classId: enrollment.classId }).session(
      session || null,
    ),
  );
  const refundAmount = Math.min(
    paid,
    Math.round(toNum(enrollment.tuitionAmount) / sessionCount),
  );
  if (refundAmount <= 0)
    return { refundAmount: 0, transaction: null, earningAdjusted: false };

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
    { session },
  );

  let earningAdjusted = false;
  const earning = await TeacherEarning.findOne({
    enrollmentId: enrollment._id,
  }).session(session || null);
  if (earning && earning.status !== "PAID_OUT") {
    const gross = Math.max(0, toNum(earning.grossAmount) - refundAmount);
    const commissionRate =
      typeof earning.commissionRate === "number" && Number.isFinite(earning.commissionRate)
        ? earning.commissionRate
        : resolveCommissionPolicy().rate;
    const commission = Math.round(gross * commissionRate);
    earning.grossAmount = toDec(gross);
    earning.commissionAmount = toDec(commission);
    earning.netAmount = toDec(gross - commission);
    await earning.save({ session });
    earningAdjusted = true;
  }

  return { refundAmount, transaction, earningAdjusted };
};

module.exports = {
  getPendingScholarshipUsages,
  confirmScholarshipUsage,
  createTeacherEarning,
  issueSessionRefund,
  isMondayWithdrawalWindow,
  isFridayPayoutWindow,
  getVietnamTimeParts,
  getBlockerMessage,
  evaluateEarningSettlement,
  evaluateClassSettlement,
  evaluateAllPendingSettlements,
  getTeacherSettlementSummary,
  SEVEN_DAYS_MS,
};
