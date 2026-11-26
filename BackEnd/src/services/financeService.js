const mongoose = require("mongoose");
const crypto = require("crypto");
const TeacherEarning = require("../models/TeacherEarning");
const Payment = require("../models/Payment");
const Transaction = require("../models/Transaction");
const BankTransferEvent = require("../models/BankTransferEvent");
const PaymentReconciliation = require("../models/PaymentReconciliation");
const RefundCase = require("../models/RefundCase");
const User = require("../models/User");
const Enrollment = require("../models/Enrollment");
const Class = require("../models/Class");
const SponsorContribution = require("../models/SponsorContribution");
const ScholarshipCampaign = require("../models/ScholarshipCampaign");
const { getFinancialOutboxWorkerStatus } = require("../jobs/financialOutboxWorker");
const { serializeDecimal128 } = require("../utils/serialize");
const { AppError } = require("../utils/errors");

function getUserDisplayName(user) {
  if (!user) return "";
  if (user.studentProfile?.fullName) return user.studentProfile.fullName;
  if (user.teacherProfile?.fullName) return user.teacherProfile.fullName;
  if (user.sponsorProfile?.representativeName) return user.sponsorProfile.representativeName;
  if (user.sponsorProfile?.organizationName) return user.sponsorProfile.organizationName;
  return user.email || "";
}

function sanitizeBankEvent(evt) {
  if (!evt) return evt;
  const copy = { ...evt };
  if (copy.metadata && typeof copy.metadata === "object") {
    const safeMeta = { ...copy.metadata };
    delete safeMeta.checksum;
    delete safeMeta.signature;
    delete safeMeta.apiKey;
    delete safeMeta.secret;
    copy.metadata = safeMeta;
  }
  return copy;
}

async function sumAmounts(model, filter, field = "amount") {
  const result = await model.aggregate([
    { $match: filter },
    { $group: { _id: null, total: { $sum: `$${field}` } } },
  ]);
  if (!result || result.length === 0 || result[0].total === null || result[0].total === undefined) {
    return "0";
  }
  return result[0].total.toString();
}

exports.getTeacherEarnings = async (teacherId) => {
  const earnings = await TeacherEarning.find({ teacherId })
    .sort({ createdAt: -1 })
    .populate("classId", "className")
    .lean();

  let totalGross = 0;
  let totalCommission = 0;
  let totalNet = 0;
  let pending = 0;
  let available = 0;
  let paidOut = 0;

  const items = earnings.map((e) => {
    const gross = parseFloat(e.grossAmount.toString());
    const comm = parseFloat(e.commissionAmount.toString());
    const net = parseFloat(e.netAmount.toString());

    totalGross += gross;
    totalCommission += comm;
    totalNet += net;

    if (e.status === "PENDING") pending += net;
    if (e.status === "AVAILABLE") available += net;
    if (e.status === "PAID_OUT") paidOut += net;

    return {
      id: e._id.toString(),
      classId: e.classId?._id?.toString() || e.classId?.toString(),
      className: e.classId?.className,
      enrollmentId: e.enrollmentId.toString(),
      grossAmount: e.grossAmount.toString(),
      commissionRate: e.commissionRate,
      commissionAmount: e.commissionAmount.toString(),
      netAmount: e.netAmount.toString(),
      status: e.status,
      createdAt: e.createdAt.toISOString(),
    };
  });

  return {
    items,
    summary: {
      totalGross: totalGross.toString(),
      totalCommission: totalCommission.toString(),
      totalNet: totalNet.toString(),
      pending: pending.toString(),
      available: available.toString(),
      paidOut: paidOut.toString(),
    },
  };
};

exports.getAdminPayments = async function (pageOrParams = 1, limitArg = 20, statusArg, searchArg) {
  let page = 1;
  let limit = 20;
  let status = null;
  let search = null;
  let startDate = null;
  let endDate = null;

  if (typeof pageOrParams === "object" && pageOrParams !== null) {
    page = parseInt(pageOrParams.page) || 1;
    limit = parseInt(pageOrParams.limit || pageOrParams.pageSize) || 20;
    status = pageOrParams.status;
    search = pageOrParams.search || pageOrParams.q;
    startDate = pageOrParams.startDate;
    endDate = pageOrParams.endDate;
  } else {
    page = parseInt(pageOrParams) || 1;
    limit = parseInt(limitArg) || 20;
    status = statusArg;
    search = searchArg;
  }

  const filter = {};

  // Status Filter: By default, ONLY show COMPLETED and FAILED (Strictly NO PENDING)
  if (!status || status === "ALL" || status === "ALL_FINAL") {
    filter.paymentStatus = { $in: ["COMPLETED", "FAILED"] };
  } else if (status === "COMPLETED") {
    filter.paymentStatus = "COMPLETED";
  } else if (status === "FAILED") {
    filter.paymentStatus = "FAILED";
  } else if (status === "PENDING") {
    filter.paymentStatus = "PENDING";
  } else if (status === "REFUNDED") {
    filter.paymentStatus = "REFUNDED";
  } else if (status === "ALL_WITH_PENDING") {
    // raw view without status filter
  } else {
    filter.paymentStatus = status;
  }

  // Date Range filter
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) {
      const s = new Date(startDate);
      if (!isNaN(s.getTime())) filter.createdAt.$gte = s;
    }
    if (endDate) {
      const e = new Date(endDate);
      if (!isNaN(e.getTime())) {
        e.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = e;
      }
    }
  }

  // Search filter
  if (search && typeof search === "string" && search.trim()) {
    const term = search.trim();
    const orConditions = [];

    const num = Number(term);
    if (!isNaN(num) && Number.isSafeInteger(num) && num > 0) {
      orConditions.push({ orderCode: num });
    }

    orConditions.push({ gatewayReference: { $regex: term, $options: "i" } });

    const matchedUsers = await User.find({
      $or: [
        { email: { $regex: term, $options: "i" } },
        { "studentProfile.fullName": { $regex: term, $options: "i" } },
        { fullName: { $regex: term, $options: "i" } },
      ],
    })
      .select("_id")
      .limit(100)
      .lean();

    if (matchedUsers.length > 0) {
      const userIds = matchedUsers.map((u) => u._id);
      orConditions.push({ payerUserId: { $in: userIds } });
    }

    const matchedClasses = await Class.find({
      className: { $regex: term, $options: "i" },
    })
      .select("_id")
      .limit(50)
      .lean();

    if (matchedClasses.length > 0) {
      const classIds = matchedClasses.map((c) => c._id);
      const matchedEnrollments = await Enrollment.find({
        classId: { $in: classIds },
      })
        .select("_id")
        .limit(100)
        .lean();
      if (matchedEnrollments.length > 0) {
        orConditions.push({ enrollmentId: { $in: matchedEnrollments.map((e) => e._id) } });
      }
    }

    if (orConditions.length > 0) {
      filter.$or = orConditions;
    }
  }

  const skip = (page - 1) * limit;
  const total = await Payment.countDocuments(filter);

  const rawPayments = await Payment.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("payerUserId", "email studentProfile teacherProfile sponsorProfile fullName")
    .populate({
      path: "enrollmentId",
      populate: [
        { path: "classId", select: "className courseTitle teacherName price classType status" },
        { path: "studentId", select: "email studentProfile teacherProfile sponsorProfile fullName" },
      ],
    })
    .lean();

  const paymentIds = rawPayments.map((p) => p._id);
  const orderCodes = rawPayments.map((p) => p.orderCode).filter(Boolean);
  const enrollmentIds = rawPayments.map((p) => p.enrollmentId?._id || p.enrollmentId).filter(Boolean);

  const [refundCases, reconciliations] = await Promise.all([
    RefundCase.find({
      $or: [
        { sourcePaymentId: { $in: paymentIds } },
        { relatedEnrollmentId: { $in: enrollmentIds } },
      ],
    }).lean(),
    PaymentReconciliation.find({
      $or: [
        { paymentId: { $in: paymentIds } },
        { orderCode: { $in: orderCodes } },
        { enrollmentId: { $in: enrollmentIds } },
      ],
    }).lean(),
  ]);

  const refundCaseByPayment = new Map();
  for (const rc of refundCases) {
    if (rc.sourcePaymentId) refundCaseByPayment.set(String(rc.sourcePaymentId), rc);
    if (rc.relatedEnrollmentId) refundCaseByPayment.set(String(rc.relatedEnrollmentId), rc);
  }

  const reconByPayment = new Map();
  for (const rec of reconciliations) {
    if (rec.paymentId) reconByPayment.set(String(rec.paymentId), rec);
    if (rec.orderCode) reconByPayment.set(`order_${rec.orderCode}`, rec);
    if (rec.enrollmentId) reconByPayment.set(String(rec.enrollmentId), rec);
  }

  const items = rawPayments.map((p) => {
    const matchedRefund =
      refundCaseByPayment.get(String(p._id)) ||
      (p.enrollmentId?._id ? refundCaseByPayment.get(String(p.enrollmentId._id)) : null);
    const matchedRecon =
      reconByPayment.get(String(p._id)) ||
      (p.orderCode ? reconByPayment.get(`order_${p.orderCode}`) : null) ||
      (p.enrollmentId?._id ? reconByPayment.get(String(p.enrollmentId._id)) : null);

    const student = p.enrollmentId?.studentId || p.payerUserId;
    const studentName = getUserDisplayName(student) || "Không tìm thấy thông tin học viên";
    const studentEmail = student?.email || "";
    const studentPhone = student?.studentProfile?.phone || student?.phone || "";

    let payerName = null;
    if (p.providerMetadata && p.providerMetadata.accountName) {
      payerName = p.providerMetadata.accountName;
    } else if (matchedRefund?.beneficiaryBankAccount?.accountHolderName) {
      payerName = matchedRefund.beneficiaryBankAccount.accountHolderName;
    }

    const classObj = p.enrollmentId?.classId;
    const className =
      classObj?.className ||
      classObj?.courseTitle ||
      (p.enrollmentId ? "Thông tin lớp học không khả dụng" : "Không áp dụng");
    const teacherName = classObj?.teacherName || "";
    const classPrice = classObj?.price || p.enrollmentId?.tuitionAmount || null;

    const isRefundPending = Boolean(
      matchedRefund &&
        ["NEEDS_REVIEW", "IN_REVIEW", "APPROVED", "PENDING_BANK_TRANSFER", "AWAITING_BANK_VERIFICATION"].includes(
          matchedRefund.status
        )
    );

    return {
      ...p,
      studentName,
      studentEmail,
      studentPhone,
      payerName,
      className,
      teacherName,
      classPrice,
      enrollmentStatus: p.enrollmentId?.enrollmentStatus || null,
      isRefundPending,
      refundCase: matchedRefund
        ? {
            caseNumber: matchedRefund.caseNumber,
            status: matchedRefund.status,
            reason: matchedRefund.reason,
            eligibleAmount: matchedRefund.eligibleAmount ? matchedRefund.eligibleAmount.toString() : null,
            approvedAmount: matchedRefund.approvedAmount ? matchedRefund.approvedAmount.toString() : null,
            beneficiaryBankAccount: matchedRefund.beneficiaryBankAccount,
            notes: matchedRefund.notes,
          }
        : null,
      reconciliation: matchedRecon
        ? {
            status: matchedRecon.status,
            reason: matchedRecon.reason,
            resolutionAction: matchedRecon.resolutionAction,
          }
        : null,
    };
  });

  return {
    items: serializeDecimal128(items),
    total,
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages: Math.ceil(total / limit) || 1,
  };
};

exports.getAdminTransactions = async function (pageOrParams = 1, limitArg = 20, typeArg, statusArg) {
  let page = 1;
  let limit = 20;
  let transactionType = null;
  let status = null;
  let startDate = null;
  let endDate = null;
  let orderCode = null;

  if (typeof pageOrParams === "object" && pageOrParams !== null) {
    page = parseInt(pageOrParams.page) || 1;
    limit = parseInt(pageOrParams.limit || pageOrParams.pageSize) || 20;
    transactionType = pageOrParams.transactionType || pageOrParams.type;
    status = pageOrParams.status;
    startDate = pageOrParams.startDate;
    endDate = pageOrParams.endDate;
    orderCode = pageOrParams.orderCode;
  } else {
    page = parseInt(pageOrParams) || 1;
    limit = parseInt(limitArg) || 20;
    transactionType = typeArg;
    status = statusArg;
  }

  const filter = {};
  if (transactionType && transactionType !== "ALL") {
    filter.transactionType = transactionType;
  }
  if (status && status !== "ALL") {
    filter.status = status;
  }
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  if (orderCode) {
    const trimmed = String(orderCode).trim();
    const numOrderCode = Number(trimmed);
    if (Number.isSafeInteger(numOrderCode) && numOrderCode > 0) {
      const [events, payments, SponsorContribution] = await Promise.all([
        BankTransferEvent.find({ orderCode: numOrderCode }, "_id").lean(),
        Payment.find({ orderCode: numOrderCode }, "_id").lean(),
        mongoose.models.SponsorContribution
          ? mongoose.models.SponsorContribution.find({ orderCode: numOrderCode }, "_id").lean()
          : [],
      ]);
      const eventIds = events.map((e) => e._id);
      const paymentIds = payments.map((p) => p._id);
      const contribIds = (SponsorContribution || []).map((c) => c._id);

      filter.$or = [
        { relatedBankEventId: { $in: eventIds } },
        { relatedPaymentId: { $in: paymentIds } },
        { relatedContributionId: { $in: contribIds } },
      ];
    } else if (trimmed.toUpperCase().startsWith("REF-")) {
      const rc = await RefundCase.findOne({ caseNumber: trimmed.toUpperCase() }).lean();
      if (rc) {
        const txIds = [rc.obligationTransactionId, rc.settlementTransactionId].filter(Boolean);
        filter._id = { $in: txIds };
      } else {
        filter._id = new mongoose.Types.ObjectId();
      }
    } else if (mongoose.Types.ObjectId.isValid(trimmed)) {
      filter._id = trimmed;
    }
  }

  const skip = (page - 1) * limit;
  const total = await Transaction.countDocuments(filter);
  const rawItems = await Transaction.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("sourceUserId", "email role studentProfile teacherProfile sponsorProfile")
    .populate("destinationUserId", "email role studentProfile teacherProfile sponsorProfile")
    .populate({
      path: "relatedEnrollmentId",
      select: "classId studentId status finalPrice",
      populate: { path: "classId", select: "className subject code title" },
    })
    .populate("relatedPaymentId", "orderCode amount paymentStatus channelKey purpose")
    .populate("relatedContributionId", "orderCode amount status campaignId")
    .populate("relatedBankEventId", "orderCode providerReference amount eventStatus dispatchStatus channelKey")
    .lean();

  const refundTxIds = rawItems.filter((t) => t.transactionType === "REFUND").map((t) => t._id);
  const refundCaseMap = new Map();
  if (refundTxIds.length > 0) {
    const refundCases = await RefundCase.find({
      $or: [
        { obligationTransactionId: { $in: refundTxIds } },
        { settlementTransactionId: { $in: refundTxIds } },
      ],
    })
      .populate("recipientUserId", "email role studentProfile")
      .lean();

    for (const rc of refundCases) {
      if (rc.obligationTransactionId) {
        refundCaseMap.set(String(rc.obligationTransactionId), rc);
      }
      if (rc.settlementTransactionId) {
        refundCaseMap.set(String(rc.settlementTransactionId), rc);
      }
    }
  }

  const serialized = serializeDecimal128(rawItems);
  const items = (serialized || []).map((tx) => {
    const matchedRefund = refundCaseMap.get(String(tx._id || tx.id));
    const code =
      tx.orderCode ||
      matchedRefund?.caseNumber ||
      tx.relatedPaymentId?.orderCode ||
      tx.relatedBankEventId?.orderCode ||
      tx.relatedContributionId?.orderCode ||
      null;

    return {
      ...tx,
      orderCode: code,
      refundCase: matchedRefund ? serializeDecimal128(matchedRefund) : undefined,
    };
  });

  const summaryAmounts = await Transaction.aggregate([
    { $match: filter },
    {
      $group: {
        _id: "$transactionType",
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  const summary = {
    byType: {},
    totalCount: total,
  };
  for (const s of summaryAmounts) {
    summary.byType[s._id] = {
      total: s.total ? s.total.toString() : "0",
      count: s.count,
    };
  }

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    summary,
  };
};

function getVietnamDateBoundaries(period = "7d", customFrom, customTo) {
  const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;
  const now = new Date();
  const nowIctMs = now.getTime() + ICT_OFFSET_MS;
  const nowIct = new Date(nowIctMs);

  const y = nowIct.getUTCFullYear();
  const m = nowIct.getUTCMonth();
  const d = nowIct.getUTCDate();

  const todayStartUtc = new Date(Date.UTC(y, m, d, 0, 0, 0) - ICT_OFFSET_MS);
  const todayEndUtc = new Date(Date.UTC(y, m, d + 1, 0, 0, 0) - ICT_OFFSET_MS);

  let fromUtc, toUtc, prevFromUtc, prevToUtc, granularity = "day", periodLabel = "";

  switch (period) {
    case "today":
      fromUtc = todayStartUtc;
      toUtc = todayEndUtc;
      prevFromUtc = new Date(todayStartUtc.getTime() - 24 * 60 * 60 * 1000);
      prevToUtc = todayStartUtc;
      granularity = "hour";
      periodLabel = `Hôm nay (${String(d).padStart(2, "0")}/${String(m + 1).padStart(2, "0")}/${y})`;
      break;
    case "yesterday":
      fromUtc = new Date(todayStartUtc.getTime() - 24 * 60 * 60 * 1000);
      toUtc = todayStartUtc;
      prevFromUtc = new Date(fromUtc.getTime() - 24 * 60 * 60 * 1000);
      prevToUtc = fromUtc;
      granularity = "hour";
      const ydDate = new Date(fromUtc.getTime() + ICT_OFFSET_MS);
      periodLabel = `Hôm qua (${String(ydDate.getUTCDate()).padStart(2, "0")}/${String(ydDate.getUTCMonth() + 1).padStart(2, "0")}/${ydDate.getUTCFullYear()})`;
      break;
    case "3d":
      fromUtc = new Date(todayStartUtc.getTime() - 2 * 24 * 60 * 60 * 1000);
      toUtc = todayEndUtc;
      const duration3d = toUtc.getTime() - fromUtc.getTime();
      prevFromUtc = new Date(fromUtc.getTime() - duration3d);
      prevToUtc = fromUtc;
      granularity = "day";
      const f3Date = new Date(fromUtc.getTime() + ICT_OFFSET_MS);
      periodLabel = `3 ngày qua (${f3Date.getUTCDate()}/${f3Date.getUTCMonth() + 1} - ${d}/${m + 1}/${y})`;
      break;
    case "7d":
      fromUtc = new Date(todayStartUtc.getTime() - 6 * 24 * 60 * 60 * 1000);
      toUtc = todayEndUtc;
      const duration7d = toUtc.getTime() - fromUtc.getTime();
      prevFromUtc = new Date(fromUtc.getTime() - duration7d);
      prevToUtc = fromUtc;
      granularity = "day";
      const f7Date = new Date(fromUtc.getTime() + ICT_OFFSET_MS);
      periodLabel = `7 ngày qua (${f7Date.getUTCDate()}/${f7Date.getUTCMonth() + 1} - ${d}/${m + 1}/${y})`;
      break;
    case "30d":
      fromUtc = new Date(todayStartUtc.getTime() - 29 * 24 * 60 * 60 * 1000);
      toUtc = todayEndUtc;
      const duration30d = toUtc.getTime() - fromUtc.getTime();
      prevFromUtc = new Date(fromUtc.getTime() - duration30d);
      prevToUtc = fromUtc;
      granularity = "day";
      const f30Date = new Date(fromUtc.getTime() + ICT_OFFSET_MS);
      periodLabel = `30 ngày qua (${f30Date.getUTCDate()}/${f30Date.getUTCMonth() + 1} - ${d}/${m + 1}/${y})`;
      break;
    case "custom":
      if (customFrom && customTo) {
        const [fy, fm, fd] = customFrom.split("-").map(Number);
        const [ty, tm, td] = customTo.split("-").map(Number);
        fromUtc = new Date(Date.UTC(fy, fm - 1, fd, 0, 0, 0) - ICT_OFFSET_MS);
        toUtc = new Date(Date.UTC(ty, tm - 1, td + 1, 0, 0, 0) - ICT_OFFSET_MS);
        if (fromUtc > toUtc) {
          const tmp = fromUtc;
          fromUtc = toUtc;
          toUtc = tmp;
        }
      } else {
        fromUtc = new Date(todayStartUtc.getTime() - 6 * 24 * 60 * 60 * 1000);
        toUtc = todayEndUtc;
      }
      const customDuration = toUtc.getTime() - fromUtc.getTime();
      prevFromUtc = new Date(fromUtc.getTime() - customDuration);
      prevToUtc = fromUtc;
      granularity = customDuration > 45 * 24 * 60 * 60 * 1000 ? "month" : "day";
      const cfDate = new Date(fromUtc.getTime() + ICT_OFFSET_MS);
      const ctDate = new Date(toUtc.getTime() - 1 + ICT_OFFSET_MS);
      periodLabel = `Tùy chọn (${cfDate.getUTCDate()}/${cfDate.getUTCMonth() + 1}/${cfDate.getUTCFullYear()} - ${ctDate.getUTCDate()}/${ctDate.getUTCMonth() + 1}/${ctDate.getUTCFullYear()})`;
      break;
    default:
      fromUtc = new Date(todayStartUtc.getTime() - 6 * 24 * 60 * 60 * 1000);
      toUtc = todayEndUtc;
      const durationDef = toUtc.getTime() - fromUtc.getTime();
      prevFromUtc = new Date(fromUtc.getTime() - durationDef);
      prevToUtc = fromUtc;
      granularity = "day";
      periodLabel = "7 ngày qua";
      break;
  }

  return { fromUtc, toUtc, prevFromUtc, prevToUtc, granularity, periodLabel };
}

function calcDelta(currentVal, prevVal) {
  const cur = parseFloat(currentVal) || 0;
  const prev = parseFloat(prevVal) || 0;
  if (prev === 0) {
    return {
      hasComparison: false,
      deltaPercent: null,
      trendDirection: cur > 0 ? "up" : "neutral",
      label: "Không có dữ liệu kỳ trước",
    };
  }
  const diff = cur - prev;
  const pct = Math.round((diff / prev) * 1000) / 10;
  return {
    hasComparison: true,
    deltaPercent: pct,
    trendDirection: pct > 0 ? "up" : pct < 0 ? "down" : "neutral",
    label: `${pct >= 0 ? "+" : ""}${pct.toLocaleString("vi-VN")}% so với kỳ trước`,
  };
}

function generateTimeBuckets(fromUtc, toUtc, granularity) {
  const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;
  const buckets = [];
  if (granularity === "hour") {
    for (let h = 0; h < 24; h++) {
      const hh = String(h).padStart(2, "0");
      buckets.push({
        key: `${hh}:00`,
        label: `${hh}:00`,
        tuition: 0,
        donation: 0,
        total: 0,
      });
    }
  } else if (granularity === "month") {
    let cur = new Date(fromUtc.getTime() + ICT_OFFSET_MS);
    const end = new Date(toUtc.getTime() + ICT_OFFSET_MS);
    while (cur < end) {
      const y = cur.getUTCFullYear();
      const m = String(cur.getUTCMonth() + 1).padStart(2, "0");
      const key = `${y}-${m}`;
      buckets.push({
        key,
        label: `Th${parseInt(m, 10)}/${y}`,
        tuition: 0,
        donation: 0,
        total: 0,
      });
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
  } else {
    let cur = new Date(fromUtc.getTime() + ICT_OFFSET_MS);
    const end = new Date(toUtc.getTime() + ICT_OFFSET_MS);
    while (cur < end) {
      const y = cur.getUTCFullYear();
      const m = String(cur.getUTCMonth() + 1).padStart(2, "0");
      const d = String(cur.getUTCDate()).padStart(2, "0");
      const key = `${y}-${m}-${d}`;
      buckets.push({
        key,
        label: `${d}/${m}`,
        tuition: 0,
        donation: 0,
        total: 0,
      });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }
  return buckets;
}

function getTransactionTypeLabel(txType) {
  switch (txType) {
    case "ENROLLMENT_PAYMENT":
      return "Thu học phí";
    case "SPONSOR_CONTRIBUTION":
      return "Tài trợ học bổng";
    case "SCHOLARSHIP_USAGE":
      return "Sử dụng học bổng";
    case "TEACHER_PAYOUT":
      return "Chi trả giáo viên";
    case "REFUND":
      return "Hoàn tiền";
    case "UNAPPLIED_TUITION_RECEIPT":
      return "Khoản thu tạm giữ";
    default:
      return txType;
  }
}

function getTransactionStatusMeta(status) {
  switch (status) {
    case "COMPLETED":
      return { label: "Hoàn tất", type: "success" };
    case "PENDING":
      return { label: "Đang chờ", type: "warning" };
    case "FAILED":
      return { label: "Không thành công", type: "error" };
    default:
      return { label: status, type: "neutral" };
  }
}

exports.getFinanceOverview = async (query = {}) => {
  const period = query.period || "7d";
  const customFrom = query.from;
  const customTo = query.to;

  const { fromUtc, toUtc, prevFromUtc, prevToUtc, granularity, periodLabel } =
    getVietnamDateBoundaries(period, customFrom, customTo);

  const [
    // Period-filtered revenue & disbursements
    tuitionPeriod,
    donationPeriod,
    payoutPeriod,
    refundCompletedPeriod,
    unappliedPeriod,

    // Previous period values for delta comparisons
    tuitionPrev,
    donationPrev,
    payoutPrev,

    // All-time / Snapshot balances (as-of-time)
    tuitionAllTime,
    donationAllTime,
    unappliedReceiptsAllTime,
    pendingRefundLiability,
    completedRefundsAllTime,
    refundCasesOpenCount,
    teacherPending,
    teacherAvailable,
    teacherPaidOutAllTime,

    // Reconciliation snapshot
    totalReconciliations,
    reconOpenCount,
    reconOpenAmount,
    reconStatusAgg,
    reconReasonAgg,

    // Operations & Outbox worker
    totalBankEvents,
    bankDispatchAgg,
    liveBacklogCount,
    liveExhaustedCount,

    // Time-series aggregation for interactive charts
    chartAggRaw,

    // Transaction status breakdown in period
    txStatusInPeriodRaw,

    // Recent transactions
    recentTxsRaw,
  ] = await Promise.all([
    // Current period
    sumAmounts(Transaction, {
      transactionType: "ENROLLMENT_PAYMENT",
      status: "COMPLETED",
      createdAt: { $gte: fromUtc, $lt: toUtc },
    }),
    sumAmounts(Transaction, {
      transactionType: "SPONSOR_CONTRIBUTION",
      status: "COMPLETED",
      createdAt: { $gte: fromUtc, $lt: toUtc },
    }),
    sumAmounts(Transaction, {
      transactionType: "TEACHER_PAYOUT",
      status: "COMPLETED",
      createdAt: { $gte: fromUtc, $lt: toUtc },
    }),
    sumAmounts(Transaction, {
      transactionType: "REFUND",
      status: "COMPLETED",
      createdAt: { $gte: fromUtc, $lt: toUtc },
    }),
    sumAmounts(Transaction, {
      transactionType: "UNAPPLIED_TUITION_RECEIPT",
      status: "COMPLETED",
      createdAt: { $gte: fromUtc, $lt: toUtc },
    }),

    // Previous period
    sumAmounts(Transaction, {
      transactionType: "ENROLLMENT_PAYMENT",
      status: "COMPLETED",
      createdAt: { $gte: prevFromUtc, $lt: prevToUtc },
    }),
    sumAmounts(Transaction, {
      transactionType: "SPONSOR_CONTRIBUTION",
      status: "COMPLETED",
      createdAt: { $gte: prevFromUtc, $lt: prevToUtc },
    }),
    sumAmounts(Transaction, {
      transactionType: "TEACHER_PAYOUT",
      status: "COMPLETED",
      createdAt: { $gte: prevFromUtc, $lt: prevToUtc },
    }),

    // All-time balances (for backward-compatible revenue keys)
    sumAmounts(Transaction, { transactionType: "ENROLLMENT_PAYMENT", status: "COMPLETED" }),
    sumAmounts(Transaction, { transactionType: "SPONSOR_CONTRIBUTION", status: "COMPLETED" }),
    sumAmounts(Transaction, { transactionType: "UNAPPLIED_TUITION_RECEIPT", status: "COMPLETED" }),
    sumAmounts(Transaction, { transactionType: "REFUND", status: "PENDING" }),
    sumAmounts(Transaction, { transactionType: "REFUND", status: "COMPLETED" }),
    RefundCase.countDocuments({
      status: {
        $in: [
          "NEEDS_REVIEW",
          "IN_REVIEW",
          "APPROVED",
          "PENDING_BANK_TRANSFER",
          "AWAITING_BANK_VERIFICATION",
        ],
      },
    }),
    sumAmounts(TeacherEarning, { status: "PENDING" }, "netAmount"),
    sumAmounts(TeacherEarning, { status: "AVAILABLE" }, "netAmount"),
    sumAmounts(TeacherEarning, { status: "PAID_OUT" }, "netAmount"),

    // Reconciliation
    PaymentReconciliation.countDocuments(),
    PaymentReconciliation.countDocuments({ status: { $in: ["NEEDS_REVIEW", "IN_REVIEW"] } }),
    sumAmounts(PaymentReconciliation, { status: { $in: ["NEEDS_REVIEW", "IN_REVIEW"] } }, "receivedAmount"),
    PaymentReconciliation.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$receivedAmount" } } },
    ]),
    PaymentReconciliation.aggregate([
      { $group: { _id: "$reason", count: { $sum: 1 } } },
    ]),

    // Operations
    BankTransferEvent.countDocuments(),
    BankTransferEvent.aggregate([
      { $group: { _id: "$dispatchStatus", count: { $sum: 1 } } },
    ]),
    BankTransferEvent.countDocuments({
      dispatchStatus: { $in: ["PENDING_DISPATCH", "DISPATCH_FAILED"] },
      dispatchAttempts: { $lt: 5 },
    }),
    BankTransferEvent.countDocuments({
      dispatchAttempts: { $gte: 5 },
      dispatchStatus: { $ne: "DISPATCHED" },
    }),

    // Time-series aggregation
    Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: fromUtc, $lt: toUtc },
          status: "COMPLETED",
          transactionType: { $in: ["ENROLLMENT_PAYMENT", "SPONSOR_CONTRIBUTION"] },
        },
      },
      {
        $group: {
          _id: {
            timeKey: {
              $dateToString: {
                format: granularity === "hour" ? "%H:00" : (granularity === "month" ? "%Y-%m" : "%Y-%m-%d"),
                date: "$createdAt",
                timezone: "+07:00",
              },
            },
            type: "$transactionType",
          },
          total: { $sum: "$amount" },
        },
      },
      { $sort: { "_id.timeKey": 1 } },
    ]),

    // Transaction status counts in period
    Transaction.aggregate([
      { $match: { createdAt: { $gte: fromUtc, $lt: toUtc } } },
      { $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$amount" } } },
    ]),

    // Recent transactions in period
    Transaction.find({ createdAt: { $gte: fromUtc, $lt: toUtc } })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("sourceUserId", "studentProfile teacherProfile sponsorProfile email")
      .populate("relatedPaymentId", "orderCode")
      .lean(),
  ]);

  // If no transactions in period, fallback to 10 latest overall
  let txList = recentTxsRaw;
  if (!txList || txList.length === 0) {
    txList = await Transaction.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("sourceUserId", "studentProfile teacherProfile sponsorProfile email")
      .populate("relatedPaymentId", "orderCode")
      .lean();
  }

  // Build Time Series Buckets
  const buckets = generateTimeBuckets(fromUtc, toUtc, granularity);
  const bucketMap = new Map();
  buckets.forEach((b) => bucketMap.set(b.key, b));

  chartAggRaw.forEach((item) => {
    const key = item._id.timeKey;
    const type = item._id.type;
    const val = parseFloat(item.total?.toString()) || 0;
    if (bucketMap.has(key)) {
      const b = bucketMap.get(key);
      if (type === "ENROLLMENT_PAYMENT") {
        b.tuition += val;
      } else if (type === "SPONSOR_CONTRIBUTION") {
        b.donation += val;
      }
      b.total = b.tuition + b.donation;
    }
  });

  const revenueTimeSeries = buckets;

  // Format recent transactions
  const recentTransactions = (txList || []).map((tx) => {
    const isDebit = tx.transactionType === "TEACHER_PAYOUT" || tx.transactionType === "REFUND";
    const numAmount = parseFloat(tx.amount?.toString()) || 0;
    const statusMeta = getTransactionStatusMeta(tx.status);
    const createdDate = new Date(tx.createdAt);
    const ictDate = new Date(createdDate.getTime() + 7 * 60 * 60 * 1000);
    const formattedDate = `${String(ictDate.getUTCDate()).padStart(2, "0")}/${String(ictDate.getUTCMonth() + 1).padStart(2, "0")}/${ictDate.getUTCFullYear()} ${String(ictDate.getUTCHours()).padStart(2, "0")}:${String(ictDate.getUTCMinutes()).padStart(2, "0")}`;

    return {
      id: tx._id.toString(),
      code: tx.relatedPaymentId?.orderCode
        ? String(tx.relatedPaymentId.orderCode)
        : tx._id.toString().slice(-8).toUpperCase(),
      type: getTransactionTypeLabel(tx.transactionType),
      rawType: tx.transactionType,
      amount: numAmount,
      formattedAmount: `${isDebit ? "-" : "+"} ${numAmount.toLocaleString("vi-VN")} ₫`,
      isDebit,
      isCredit: !isDebit,
      createdAt: tx.createdAt.toISOString(),
      formattedDate,
      status: statusMeta.label,
      statusType: statusMeta.type,
      actorName: getUserDisplayName(tx.sourceUserId),
    };
  });

  // Calculate 6 KPI deltas
  const tuitionDelta = calcDelta(tuitionPeriod, tuitionPrev);
  const donationDelta = calcDelta(donationPeriod, donationPrev);
  const payoutDelta = calcDelta(payoutPeriod, payoutPrev);

  // Fund structure Donut
  const tuitionNum = parseFloat(tuitionPeriod) || 0;
  const donationNum = parseFloat(donationPeriod) || 0;
  const unappliedNum = parseFloat(unappliedPeriod) || 0;
  const totalInflow = tuitionNum + donationNum + unappliedNum;

  const fundStructure = {
    tuition: tuitionNum,
    donation: donationNum,
    other: unappliedNum,
    total: totalInflow,
    tuitionPercent: totalInflow > 0 ? Math.round((tuitionNum / totalInflow) * 1000) / 10 : 0,
    donationPercent: totalInflow > 0 ? Math.round((donationNum / totalInflow) * 1000) / 10 : 0,
    otherPercent: totalInflow > 0 ? Math.round((unappliedNum / totalInflow) * 1000) / 10 : 0,
  };

  // Reconciliation distribution
  const reconStatusCounts = {
    needsReview: { count: 0, amount: 0 },
    inReview: { count: 0, amount: 0 },
    resolvedApproved: { count: 0, amount: 0 },
    resolvedRefunded: { count: 0, amount: 0 },
    resolvedIgnored: { count: 0, amount: 0 },
  };

  reconStatusAgg.forEach((s) => {
    const amt = parseFloat(s.amount?.toString()) || 0;
    if (s._id === "NEEDS_REVIEW") reconStatusCounts.needsReview = { count: s.count, amount: amt };
    else if (s._id === "IN_REVIEW") reconStatusCounts.inReview = { count: s.count, amount: amt };
    else if (s._id === "RESOLVED_APPROVED") reconStatusCounts.resolvedApproved = { count: s.count, amount: amt };
    else if (s._id === "RESOLVED_REFUNDED") reconStatusCounts.resolvedRefunded = { count: s.count, amount: amt };
    else if (s._id === "RESOLVED_IGNORED") reconStatusCounts.resolvedIgnored = { count: s.count, amount: amt };
  });

  const reconTotal = totalReconciliations || 1;
  const reconciliationDistribution = [
    {
      key: "needsReview",
      status: "NEEDS_REVIEW",
      label: "Cần kiểm tra",
      count: reconStatusCounts.needsReview.count,
      amount: reconStatusCounts.needsReview.amount,
      percent: Math.round((reconStatusCounts.needsReview.count / reconTotal) * 1000) / 10,
      color: "#DC2626", // Red
    },
    {
      key: "inReview",
      status: "IN_REVIEW",
      label: "Đang kiểm tra",
      count: reconStatusCounts.inReview.count,
      amount: reconStatusCounts.inReview.amount,
      percent: Math.round((reconStatusCounts.inReview.count / reconTotal) * 1000) / 10,
      color: "#D97706", // Amber
    },
    {
      key: "resolvedApproved",
      status: "RESOLVED_APPROVED",
      label: "Đã đối soát",
      count: reconStatusCounts.resolvedApproved.count,
      amount: reconStatusCounts.resolvedApproved.amount,
      percent: Math.round((reconStatusCounts.resolvedApproved.count / reconTotal) * 1000) / 10,
      color: "#15803D", // Green
    },
    {
      key: "resolvedRefunded",
      status: "RESOLVED_REFUNDED",
      label: "Đã hoàn tiền",
      count: reconStatusCounts.resolvedRefunded.count,
      amount: reconStatusCounts.resolvedRefunded.amount,
      percent: Math.round((reconStatusCounts.resolvedRefunded.count / reconTotal) * 1000) / 10,
      color: "#7C3AED", // Purple
    },
    {
      key: "resolvedIgnored",
      status: "RESOLVED_IGNORED",
      label: "Đã đóng",
      count: reconStatusCounts.resolvedIgnored.count,
      amount: reconStatusCounts.resolvedIgnored.amount,
      percent: Math.round((reconStatusCounts.resolvedIgnored.count / reconTotal) * 1000) / 10,
      color: "#64748B", // Slate
    },
  ];

  // Transaction Status Distribution in period
  let txSuccessCount = 0;
  let txSuccessAmount = 0;
  let txPendingCount = 0;
  let txPendingAmount = 0;

  (txStatusInPeriodRaw || []).forEach((s) => {
    const amt = parseFloat(s.total?.toString()) || 0;
    if (s._id === "COMPLETED") {
      txSuccessCount = s.count;
      txSuccessAmount = amt;
    } else if (s._id === "PENDING") {
      txPendingCount = s.count;
      txPendingAmount = amt;
    }
  });

  const txReconCount = reconOpenCount || 0;
  const txReconAmount = parseFloat(reconOpenAmount) || 0;
  const txRefundCount = refundCasesOpenCount || 0;
  const txRefundAmount = parseFloat(pendingRefundLiability) || 0;

  const totalTxDistributionCount =
    txSuccessCount + txPendingCount + txReconCount + txRefundCount || 1;

  const transactionStatusDistribution = [
    {
      key: "completed",
      label: "Đã thanh toán thành công",
      count: txSuccessCount,
      amount: txSuccessAmount,
      percent: Math.round((txSuccessCount / totalTxDistributionCount) * 1000) / 10,
      color: "#0D9488", // Mint/Teal
      subtext: "Giao dịch học phí & tài trợ hoàn tất",
    },
    {
      key: "pending",
      label: "Chờ xử lý",
      count: txPendingCount,
      amount: txPendingAmount,
      percent: Math.round((txPendingCount / totalTxDistributionCount) * 1000) / 10,
      color: "#D97706", // Amber
      subtext: "Giao dịch đang chờ xác nhận",
    },
    {
      key: "reconciliation",
      label: "Cần đối soát",
      count: txReconCount,
      amount: txReconAmount,
      percent: Math.round((txReconCount / totalTxDistributionCount) * 1000) / 10,
      color: "#DC2626", // Red
      subtext: "Bất thường hoặc tiền tạm giữ",
    },
    {
      key: "refund",
      label: "Hoàn tiền / Chờ hoàn",
      count: txRefundCount,
      amount: txRefundAmount,
      percent: Math.round((txRefundCount / totalTxDistributionCount) * 1000) / 10,
      color: "#7C3AED", // Purple
      subtext: "Hồ sơ hoàn tiền đang xử lý",
    },
  ];

  const reconByReason = {};
  for (const r of reconReasonAgg) {
    if (r._id) reconByReason[r._id] = r.count;
  }

  const bankByDispatch = {
    pendingDispatch: 0,
    dispatching: 0,
    dispatched: 0,
    dispatchFailed: 0,
    reconciliationRequired: 0,
    notRequired: 0,
  };
  for (const d of bankDispatchAgg) {
    if (d._id === "PENDING_DISPATCH") bankByDispatch.pendingDispatch = d.count;
    else if (d._id === "DISPATCHING") bankByDispatch.dispatching = d.count;
    else if (d._id === "DISPATCHED") bankByDispatch.dispatched = d.count;
    else if (d._id === "DISPATCH_FAILED") bankByDispatch.dispatchFailed = d.count;
    else if (d._id === "RECONCILIATION_REQUIRED") bankByDispatch.reconciliationRequired = d.count;
    else if (d._id === "NOT_REQUIRED") bankByDispatch.notRequired = d.count;
  }

  const workerTelemetry = getFinancialOutboxWorkerStatus();

  return {
    // Period & Time Filter Metadata
    period: {
      key: period,
      from: fromUtc.toISOString(),
      to: toUtc.toISOString(),
      label: periodLabel,
      granularity,
    },

    // 6 Period-based KPI Cards
    kpis: {
      tuitionRevenue: {
        title: "Doanh thu Học phí",
        value: tuitionPeriod,
        previousValue: tuitionPrev,
        deltaPercent: tuitionDelta.deltaPercent,
        hasComparison: tuitionDelta.hasComparison,
        trendDirection: tuitionDelta.trendDirection,
        trendLabel: tuitionDelta.label,
        subtext: "Khoản thu học phí hợp lệ trong kỳ",
        variant: "teal",
      },
      donationRevenue: {
        title: "Quỹ Tài trợ Học bổng",
        value: donationPeriod,
        previousValue: donationPrev,
        deltaPercent: donationDelta.deltaPercent,
        hasComparison: donationDelta.hasComparison,
        trendDirection: donationDelta.trendDirection,
        trendLabel: donationDelta.label,
        subtext: "Nguồn quỹ học bổng độc lập",
        variant: "mint",
      },
      reconciliationPending: {
        title: "Khoản cần Đối soát",
        value: reconOpenAmount,
        count: reconOpenCount,
        isSnapshot: true,
        subtext: `Hiện có ${reconOpenCount} sự vụ cần kiểm tra`,
        variant: "amber",
      },
      refundLiability: {
        title: "Nghĩa vụ Hoàn tiền",
        value: pendingRefundLiability,
        completedValue: completedRefundsAllTime,
        openCasesCount: refundCasesOpenCount,
        isSnapshot: true,
        subtext: `Đang có ${refundCasesOpenCount} hồ sơ chờ xử lý`,
        variant: "rose",
      },
      teacherPendingPayout: {
        title: "Thù lao GV chờ chi trả",
        value: (parseFloat(teacherPending) + parseFloat(teacherAvailable)).toString(),
        pendingHold: teacherPending,
        availableToWithdraw: teacherAvailable,
        isSnapshot: true,
        subtext: `Khả dụng: ${parseFloat(teacherAvailable).toLocaleString("vi-VN")} ₫`,
        variant: "indigo",
      },
      teacherPaidOut: {
        title: "Đã chi trả Giáo viên",
        value: payoutPeriod,
        previousValue: payoutPrev,
        deltaPercent: payoutDelta.deltaPercent,
        hasComparison: payoutDelta.hasComparison,
        trendDirection: payoutDelta.trendDirection,
        trendLabel: payoutDelta.label,
        subtext: "Giải ngân thành công trong kỳ",
        variant: "emerald",
      },
    },

    // Charts data
    charts: {
      revenueTimeSeries,
      fundStructure,
      reconciliationDistribution,
      transactionStatusDistribution,
    },

    // Recent transactions table
    recentTransactions,

    // Operations Overview in Vietnamese
    operationsSummary: {
      syncStatus:
        liveExhaustedCount > 0
          ? "Cần kiểm tra"
          : workerTelemetry.isRunning
          ? "Đang hoạt động"
          : "Đang chờ tác vụ",
      syncStatusType:
        liveExhaustedCount > 0
          ? "error"
          : workerTelemetry.isRunning
          ? "success"
          : "neutral",
      isRunning: Boolean(workerTelemetry.isRunning),
      processedCount: workerTelemetry.totalDispatched || 0,
      pendingCount: liveBacklogCount,
      attentionCount: liveExhaustedCount,
      refundCasesOpen: refundCasesOpenCount,
    },

    // Backward-compatible fields
    revenue: {
      confirmedTuitionRevenue: tuitionAllTime,
      confirmedDonationRevenue: donationAllTime,
      unappliedLateReceipts: unappliedReceiptsAllTime,
      pendingRefundLiability,
      completedRefunds: completedRefundsAllTime,
    },
    teacherEarnings: {
      pending: teacherPending,
      available: teacherAvailable,
      paidOut: teacherPaidOutAllTime,
      note: "Thù lao giảng viên chỉ chuyển sang khả dụng khi khóa học/lớp học hoàn tất.",
    },
    reconciliations: {
      total: totalReconciliations,
      open: reconOpenCount,
      byStatus: {
        needsReview: reconStatusCounts.needsReview.count,
        inReview: reconStatusCounts.inReview.count,
        resolvedApproved: reconStatusCounts.resolvedApproved.count,
        resolvedRefunded: reconStatusCounts.resolvedRefunded.count,
        resolvedIgnored: reconStatusCounts.resolvedIgnored.count,
      },
      byReason: reconByReason,
    },
    bankEvents: {
      total: totalBankEvents,
      byDispatchStatus: bankByDispatch,
      backlogCount: liveBacklogCount,
      exhaustedCount: liveExhaustedCount,
    },
    outboxWorker: {
      ...workerTelemetry,
      backlogCount: liveBacklogCount,
      exhaustedCount: liveExhaustedCount,
    },
  };
};

exports.getAdminBankEvents = async (params = {}) => {
  const page = parseInt(params.page) || 1;
  const limit = parseInt(params.limit || params.pageSize) || 20;
  const filter = {};

  if (params.channelKey && params.channelKey !== "ALL") filter.channelKey = params.channelKey;
  if (params.purpose && params.purpose !== "ALL") filter.purpose = params.purpose;

  // Business-friendly status mapping
  const statusParam = params.status || params.businessStatus;
  if (statusParam && statusParam !== "ALL") {
    if (statusParam === "DISPATCHED") {
      filter.dispatchStatus = "DISPATCHED";
    } else if (statusParam === "RECONCILIATION_REQUIRED") {
      filter.$or = [
        { dispatchStatus: "RECONCILIATION_REQUIRED" },
        {
          eventStatus: {
            $in: [
              "UNMATCHED",
              "ACCOUNT_MISMATCH",
              "AMOUNT_MISMATCH",
              "REFERENCE_COLLISION",
              "EXPIRED_PAYMENT",
              "NEEDS_REVIEW",
              "DUPLICATE",
            ],
          },
        },
      ];
    } else if (statusParam === "PROCESSING") {
      filter.dispatchStatus = { $in: ["PENDING_DISPATCH", "DISPATCHING"] };
    } else if (statusParam === "FAILED") {
      filter.$or = [{ dispatchStatus: "DISPATCH_FAILED" }, { eventStatus: "DISPATCH_FAILED" }];
    } else {
      filter.dispatchStatus = statusParam;
    }
  } else {
    if (params.eventStatus && params.eventStatus !== "ALL") filter.eventStatus = params.eventStatus;
    if (params.dispatchStatus && params.dispatchStatus !== "ALL") filter.dispatchStatus = params.dispatchStatus;
  }

  if (params.provider && params.provider !== "ALL") filter.provider = params.provider;
  if (params.orderCode) {
    const code = Number(params.orderCode);
    if (!Number.isNaN(code)) filter.orderCode = code;
  }
  if (params.providerReference) {
    filter.providerReference = { $regex: params.providerReference.trim(), $options: "i" };
  }
  if (params.isExhausted === true || params.isExhausted === "true") {
    filter.dispatchAttempts = { $gte: 5 };
    filter.dispatchStatus = { $ne: "DISPATCHED" };
  }
  if (params.startDate || params.endDate) {
    filter.receivedAt = {};
    if (params.startDate) filter.receivedAt.$gte = new Date(params.startDate);
    if (params.endDate) filter.receivedAt.$lte = new Date(params.endDate);
  }

  const skip = (page - 1) * limit;
  const total = await BankTransferEvent.countDocuments(filter);
  const rawItems = await BankTransferEvent.find(filter)
    .sort({ receivedAt: -1, _id: -1 })
    .skip(skip)
    .limit(limit)
    .populate("linkedPaymentId", "orderCode amount paymentStatus channelKey purpose")
    .populate("contributionId", "orderCode amount status campaignId")
    .lean();

  // Attach linked reconciliation records if available
  const eventIds = rawItems.map((item) => item._id);
  const recons = await PaymentReconciliation.find({ eventId: { $in: eventIds } })
    .select("_id eventId status reason orderCode resolutionNote")
    .lean();
  const reconMap = new Map();
  recons.forEach((r) => reconMap.set(r.eventId.toString(), r));

  const items = serializeDecimal128(rawItems).map((raw) => {
    const sanitized = sanitizeBankEvent(raw);
    sanitized.reconciliation = reconMap.get(sanitized._id?.toString() || "") || null;
    return sanitized;
  });

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
};

exports.getAdminBankEventById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid bank event ID", "VALIDATION_ERROR", 400);
  }
  const raw = await BankTransferEvent.findById(id)
    .populate("linkedPaymentId")
    .populate("contributionId")
    .lean();
  if (!raw) {
    throw new AppError("Bank transfer event not found", "NOT_FOUND", 404);
  }

  const recon = await PaymentReconciliation.findOne({ eventId: raw._id })
    .select("_id status reason orderCode resolutionNote auditReferences")
    .lean();
  const serialized = serializeDecimal128(raw);
  if (recon) {
    serialized.reconciliation = serializeDecimal128(recon);
  }
  return sanitizeBankEvent(serialized);
};

exports.getAdminReconciliations = async (params = {}) => {
  const page = parseInt(params.page) || 1;
  const limit = parseInt(params.limit || params.pageSize) || 20;
  const filter = {};

  // Tab filtering:
  // tab = "NEEDS_REVIEW" (Cần xử lý)
  // tab = "IN_REVIEW" (Đang xử lý)
  // tab = "RESOLVED" (Đã giải quyết)
  // tab = "ALL" (Tất cả)
  if (params.tab === "NEEDS_REVIEW" || params.status === "NEEDS_REVIEW") {
    filter.status = "NEEDS_REVIEW";
  } else if (params.tab === "IN_REVIEW" || params.status === "IN_REVIEW") {
    filter.status = "IN_REVIEW";
  } else if (params.tab === "RESOLVED" || params.status === "RESOLVED") {
    filter.status = { $in: ["RESOLVED_APPROVED", "RESOLVED_REFUNDED", "RESOLVED_IGNORED"] };
  } else if (params.status && params.status !== "ALL") {
    filter.status = params.status;
  }

  if (params.reason && params.reason !== "ALL") filter.reason = params.reason;
  if (params.purpose && params.purpose !== "ALL") filter.purpose = params.purpose;
  if (params.channelKey && params.channelKey !== "ALL") filter.channelKey = params.channelKey;
  if (params.orderCode) {
    const code = Number(params.orderCode);
    if (!Number.isNaN(code)) filter.orderCode = code;
  }
  if (params.assignedTo) {
    if (mongoose.Types.ObjectId.isValid(params.assignedTo)) {
      filter.assignedTo = params.assignedTo;
    }
  }
  if (params.startDate || params.endDate) {
    filter.createdAt = {};
    if (params.startDate) filter.createdAt.$gte = new Date(params.startDate);
    if (params.endDate) filter.createdAt.$lte = new Date(params.endDate);
  }

  const baseFilterWithoutStatus = { ...filter };
  delete baseFilterWithoutStatus.status;

  const skip = (page - 1) * limit;
  const [total, rawItems, needsReviewCount, inReviewCount, resolvedCount, allCount] = await Promise.all([
    PaymentReconciliation.countDocuments(filter),
    PaymentReconciliation.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("eventId", "orderCode providerReference amount eventStatus dispatchStatus")
      .populate("paymentId", "orderCode amount paymentStatus channelKey purpose")
      .populate("contributionId", "orderCode amount status campaignId")
      .populate({
        path: "enrollmentId",
        select: "classId studentId status finalPrice",
        populate: { path: "classId", select: "className title code" },
      })
      .populate("campaignId", "title targetAmount currentAmount status")
      .populate("assignedTo", "email role studentProfile teacherProfile sponsorProfile")
      .populate("resolvedBy", "email role studentProfile teacherProfile sponsorProfile")
      .lean(),
    PaymentReconciliation.countDocuments({ ...baseFilterWithoutStatus, status: "NEEDS_REVIEW" }),
    PaymentReconciliation.countDocuments({ ...baseFilterWithoutStatus, status: "IN_REVIEW" }),
    PaymentReconciliation.countDocuments({
      ...baseFilterWithoutStatus,
      status: { $in: ["RESOLVED_APPROVED", "RESOLVED_REFUNDED", "RESOLVED_IGNORED"] },
    }),
    PaymentReconciliation.countDocuments(baseFilterWithoutStatus),
  ]);

  // Lookup linked RefundCase if exists
  const reconIds = rawItems.map((r) => r._id);
  const refundCases = await RefundCase.find({ relatedReconciliationId: { $in: reconIds } })
    .select("caseNumber status reason reasonDetails eligibleAmount approvedAmount beneficiaryBankAccount relatedReconciliationId")
    .lean();
  const refundMap = new Map(refundCases.map((rc) => [String(rc.relatedReconciliationId), rc]));

  const items = serializeDecimal128(rawItems).map((recon) => {
    const linkedRefund = refundMap.get(String(recon._id || recon.id));
    return {
      ...recon,
      refundCase: linkedRefund ? serializeDecimal128(linkedRefund) : undefined,
    };
  });

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    tabCounts: {
      needsReview: needsReviewCount,
      inReview: inReviewCount,
      resolved: resolvedCount,
      all: allCount,
    },
  };
};

exports.getAdminReconciliationById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid reconciliation ID", "VALIDATION_ERROR", 400);
  }
  const raw = await PaymentReconciliation.findById(id)
    .populate("eventId")
    .populate("paymentId")
    .populate("contributionId")
    .populate({
      path: "enrollmentId",
      select: "classId studentId status finalPrice",
      populate: { path: "classId", select: "className title code" },
    })
    .populate("campaignId")
    .populate("assignedTo", "email role studentProfile teacherProfile sponsorProfile")
    .populate("resolvedBy", "email role studentProfile teacherProfile sponsorProfile")
    .lean();
  if (!raw) {
    throw new AppError("Payment reconciliation record not found", "NOT_FOUND", 404);
  }

  const refundCase = await RefundCase.findOne({ relatedReconciliationId: raw._id })
    .select("caseNumber status reason reasonDetails eligibleAmount approvedAmount beneficiaryBankAccount createdAt")
    .lean();

  const serialized = serializeDecimal128(raw);
  if (refundCase) {
    serialized.refundCase = serializeDecimal128(refundCase);
  }
  return serialized;
};

exports.assignReconciliation = async (id, adminUser, body = {}) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid reconciliation ID", "VALIDATION_ERROR", 400);
  }
  const recon = await PaymentReconciliation.findById(id);
  if (!recon) {
    throw new AppError("Payment reconciliation record not found", "NOT_FOUND", 404);
  }

  // Guard: Resolved reconciliations cannot be assigned or re-opened!
  const isResolved = ["RESOLVED_APPROVED", "RESOLVED_REFUNDED", "RESOLVED_IGNORED"].includes(recon.status);
  if (isResolved) {
    throw new AppError(
      "Không thể phân công hoặc tiếp nhận hồ sơ đối soát đã giải quyết",
      "RECONCILIATION_ALREADY_RESOLVED",
      409
    );
  }

  let targetUserId = body.assignedTo;
  if (!targetUserId || targetUserId === "me") {
    targetUserId = typeof adminUser === "string" ? adminUser : (adminUser.id || adminUser._id);
  }

  if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
    throw new AppError("Invalid assignee user ID", "VALIDATION_ERROR", 400);
  }

  const targetUser = await User.findById(targetUserId);
  if (!targetUser) {
    throw new AppError("Target user for assignment not found", "USER_NOT_FOUND", 404);
  }
  if (targetUser.role !== "ADMIN") {
    throw new AppError("Reconciliations can only be assigned to ADMIN users", "INVALID_ASSIGNEE", 400);
  }

  // Guard: Idempotent duplicate assignment check
  const isSameAssignee = recon.assignedTo && recon.assignedTo.toString() === targetUser._id.toString();
  if (isSameAssignee && (!body.note || !body.note.trim())) {
    const current = await PaymentReconciliation.findById(id)
      .populate("eventId")
      .populate("assignedTo", "email role studentProfile teacherProfile sponsorProfile")
      .lean();
    return serializeDecimal128(current);
  }

  // CAS Status Transition: if status is NEEDS_REVIEW, transition to IN_REVIEW
  if (recon.status === "NEEDS_REVIEW") {
    recon.status = "IN_REVIEW";
  }

  recon.assignedTo = targetUser._id;

  const targetName = getUserDisplayName(targetUser) || targetUser.email;
  const adminName = getUserDisplayName(adminUser) || adminUser.email || "Admin";
  const noteText = body.note && body.note.trim() ? ` - Note: ${body.note.trim()}` : "";

  recon.auditReferences.push({
    action: "ASSIGNED",
    note: `Assigned to ${targetName} (${targetUser.email}) by ${adminName}${noteText}`,
    timestamp: new Date(),
  });

  await recon.save();

  const updated = await PaymentReconciliation.findById(id)
    .populate("eventId")
    .populate("assignedTo", "email role studentProfile teacherProfile sponsorProfile")
    .lean();

  return serializeDecimal128(updated);
};

exports.addReconciliationNote = async (id, adminUser, body = {}) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid reconciliation ID", "VALIDATION_ERROR", 400);
  }
  if (!body.note || typeof body.note !== "string" || !body.note.trim()) {
    throw new AppError("Note content is required", "VALIDATION_ERROR", 400);
  }

  const recon = await PaymentReconciliation.findById(id);
  if (!recon) {
    throw new AppError("Payment reconciliation record not found", "NOT_FOUND", 404);
  }

  let adminObj = adminUser;
  if (typeof adminUser === "string" && mongoose.Types.ObjectId.isValid(adminUser)) {
    adminObj = (await User.findById(adminUser).lean()) || { email: "Admin" };
  }

  const adminName = getUserDisplayName(adminObj) || adminObj.email || "Admin";
  const isResolved = ["RESOLVED_APPROVED", "RESOLVED_REFUNDED", "RESOLVED_IGNORED"].includes(recon.status);

  recon.auditReferences.push({
    action: isResolved ? "POST_RESOLVED_NOTE" : (body.action || "NOTE_ADDED"),
    note: `[${adminName}] ${body.note.trim()}`,
    timestamp: new Date(),
  });

  await recon.save();

  const updated = await PaymentReconciliation.findById(id)
    .populate("eventId")
    .populate("assignedTo", "email role studentProfile teacherProfile sponsorProfile")
    .lean();

  return serializeDecimal128(updated);
};

exports.resolveReconciliation = async (id, adminUser, body = {}) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid reconciliation ID", "VALIDATION_ERROR", 400);
  }

  const recon = await PaymentReconciliation.findById(id);
  if (!recon) {
    throw new AppError("Payment reconciliation record not found", "NOT_FOUND", 404);
  }

  // Guard: Resolved reconciliations cannot be resolved again (terminal state)
  const isAlreadyResolved = ["RESOLVED_APPROVED", "RESOLVED_REFUNDED", "RESOLVED_IGNORED"].includes(recon.status);
  if (isAlreadyResolved) {
    throw new AppError(
      "Hồ sơ đối soát đã được giải quyết trước đó, không thể thay đổi kết quả",
      "RECONCILIATION_ALREADY_RESOLVED",
      409
    );
  }

  const ALLOWED_OUTCOMES = ["RESOLVED_APPROVED", "RESOLVED_REFUNDED", "RESOLVED_IGNORED"];
  const outcome = body.outcome;
  if (!outcome || !ALLOWED_OUTCOMES.includes(outcome)) {
    throw new AppError(
      `Kết quả xử lý không hợp lệ. Phải là một trong: ${ALLOWED_OUTCOMES.join(", ")}`,
      "INVALID_RESOLUTION_OUTCOME",
      400
    );
  }

  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (!note) {
    throw new AppError("Ghi chú kết quả xử lý là bắt buộc", "RESOLUTION_NOTE_REQUIRED", 400);
  }

  let adminObj = adminUser;
  let adminId = typeof adminUser === "string" ? adminUser : (adminUser?.id || adminUser?._id);
  if (typeof adminUser === "string" && mongoose.Types.ObjectId.isValid(adminUser)) {
    adminObj = (await User.findById(adminUser).lean()) || { email: "Admin" };
  }
  const adminName = getUserDisplayName(adminObj) || adminObj?.email || "Admin";
  const now = new Date();

  if (outcome === "RESOLVED_APPROVED") {
    // Safety guard 1: Cannot approve unmatched transaction without linked payment or contribution
    if (!recon.paymentId && !recon.contributionId) {
      throw new AppError(
        "Không thể duyệt hợp lệ giao dịch chưa xác định được đơn thanh toán hoặc khoản tài trợ trên hệ thống",
        "CANNOT_APPROVE_UNMATCHED_PAYMENT",
        400
      );
    }

    // Safety guard 2: Cannot approve reference collision
    if (recon.reason === "REFERENCE_COLLISION") {
      throw new AppError(
        "Không thể duyệt hợp lệ giao dịch đang bị cảnh báo trùng lặp mã tham chiếu ngân hàng",
        "CANNOT_APPROVE_COLLISION",
        400
      );
    }

    // Update Payment and Enrollment if present
    if (recon.paymentId) {
      const payment = await Payment.findById(recon.paymentId);
      if (payment) {
        payment.paymentStatus = "COMPLETED";
        payment.providerStatus = "PAID";
        payment.paidAt = payment.paidAt || now;
        await payment.save();
      }

      const enrollmentId = recon.enrollmentId || payment?.enrollmentId;
      if (enrollmentId) {
        const enrollment = await Enrollment.findById(enrollmentId);
        if (enrollment && enrollment.enrollmentStatus !== "CONFIRMED") {
          enrollment.enrollmentStatus = "CONFIRMED";
          enrollment.amountPaidViaPayment = payment ? payment.amount : recon.receivedAmount;
          await enrollment.save();

          if (enrollment.classId) {
            await Class.findByIdAndUpdate(enrollment.classId, { $inc: { enrolledCount: 1 } });
          }
        }
      }
    }

    // Update SponsorContribution and Campaign if present
    const contributionId =
      recon.contributionId ||
      (recon.purpose === "DONATION" ? recon.relatedContributionId : null);
    if (contributionId) {
      const contrib = await SponsorContribution.findById(contributionId);
      if (contrib && contrib.contributionStatus !== "COMPLETED") {
        contrib.contributionStatus = "COMPLETED";
        contrib.providerStatus = "PAID";
        contrib.contributedAt = contrib.contributedAt || now;
        await contrib.save();

        if (contrib.campaignId) {
          await ScholarshipCampaign.findByIdAndUpdate(contrib.campaignId, {
            $inc: { fundedAmount: contrib.amount },
          });
        }

        const existingTx = await Transaction.findOne({
          relatedContributionId: contrib._id,
          transactionType: "SPONSOR_CONTRIBUTION",
        });
        if (!existingTx) {
          await Transaction.create({
            transactionType: "SPONSOR_CONTRIBUTION",
            sourceUserId: contrib.sponsorId,
            destinationUserId: null,
            relatedContributionId: contrib._id,
            relatedBankEventId: recon.eventId,
            amount: contrib.amount,
            status: "COMPLETED",
          });
        }
      }
    }

    // Update BankTransferEvent if present
    if (recon.eventId) {
      const bte = await BankTransferEvent.findById(recon.eventId);
      if (bte) {
        bte.dispatchStatus = "DISPATCHED";
        bte.eventStatus = "DISPATCHED";
        await bte.save();
      }
    }

    recon.status = "RESOLVED_APPROVED";
    recon.auditReferences.push({
      action: "RECONCILIATION_RESOLVED",
      note: `[Duyệt hợp lệ] ${note} (Xác nhận bởi ${adminName})`,
      timestamp: now,
    });
  } else if (outcome === "RESOLVED_REFUNDED") {
    // Check if RefundCase already exists
    let refundCase = await RefundCase.findOne({ relatedReconciliationId: recon._id });
    if (!refundCase && recon.paymentId) {
      refundCase = await RefundCase.findOne({ sourcePaymentId: recon.paymentId });
    }

    if (!refundCase) {
      let recipientUserId = null;
      let payment = null;
      if (recon.paymentId) {
        payment = await Payment.findById(recon.paymentId);
        recipientUserId = payment?.payerUserId;
      }
      if (!recipientUserId && recon.enrollmentId) {
        const enrollment = await Enrollment.findById(recon.enrollmentId);
        recipientUserId = enrollment?.studentId;
      }
      if (!recipientUserId && body.recipientUserId && mongoose.Types.ObjectId.isValid(body.recipientUserId)) {
        recipientUserId = body.recipientUserId;
      }

      if (!recipientUserId) {
        throw new AppError(
          "Không thể lập hồ sơ hoàn tiền tự động do thiếu thông tin định danh học viên. Vui lòng xác minh người nộp tiền trước.",
          "RECIPIENT_USER_REQUIRED",
          400
        );
      }

      let bankInfo = body.beneficiaryBankAccount;
      if (!bankInfo || !bankInfo.bankName || !bankInfo.accountNumber || !bankInfo.accountHolderName) {
        const event = recon.eventId ? await BankTransferEvent.findById(recon.eventId) : null;
        if (event?.metadata?.counterAccountNumber) {
          bankInfo = {
            bankName: event.metadata.counterAccountBankId || "Ngân hàng thụ hưởng",
            accountNumber: event.metadata.counterAccountNumber,
            accountHolderName: event.metadata.counterAccountName || "Chủ tài khoản",
          };
        } else {
          bankInfo = {
            bankName: "Ngân hàng thụ hưởng",
            accountNumber: "Chờ học viên cung cấp",
            accountHolderName: "Chờ xác nhận",
          };
        }
      }

      const caseNumber = `REF-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
      refundCase = await RefundCase.create({
        caseNumber,
        purpose: recon.purpose || "TUITION",
        channelKey: recon.channelKey || "TUITION",
        sourcePaymentId: recon.paymentId || null,
        relatedBankEventId: recon.eventId || null,
        relatedReconciliationId: recon._id,
        relatedEnrollmentId: recon.enrollmentId || (payment ? payment.enrollmentId : null),
        recipientUserId,
        beneficiaryBankAccount: bankInfo,
        originalAmount: recon.receivedAmount,
        eligibleAmount: recon.receivedAmount,
        approvedAmount: null,
        currency: recon.currency || "VND",
        reason: "OVERPAYMENT",
        reasonDetails: note,
        status: "NEEDS_REVIEW",
        refundMethod: "MANUAL_BANK_TRANSFER",
        auditLogs: [
          {
            action: "CREATED",
            actorId: adminId,
            actorRole: "ADMIN",
            note: `Tạo hồ sơ hoàn tiền từ kết quả đối soát. ${note}`,
            timestamp: now,
          },
        ],
      });
    }

    recon.status = "RESOLVED_REFUNDED";
    recon.auditReferences.push({
      action: "REFUND_REQUIRED",
      note: `[Chuyển xử lý hoàn tiền] ${note} (Chuyển tiếp bởi ${adminName})`,
      timestamp: now,
    });
  } else if (outcome === "RESOLVED_IGNORED") {
    recon.status = "RESOLVED_IGNORED";
    recon.auditReferences.push({
      action: "RECONCILIATION_RESOLVED",
      note: `[Bỏ qua / Không hợp lệ] ${note} (Đóng bởi ${adminName})`,
      timestamp: now,
    });
  }

  recon.resolvedBy = adminId;
  recon.resolvedAt = now;
  recon.resolutionNote = note;
  await recon.save();

  return exports.getAdminReconciliationById(id);
};
