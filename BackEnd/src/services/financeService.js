const mongoose = require("mongoose");
const TeacherEarning = require("../models/TeacherEarning");
const Payment = require("../models/Payment");
const Transaction = require("../models/Transaction");
const BankTransferEvent = require("../models/BankTransferEvent");
const PaymentReconciliation = require("../models/PaymentReconciliation");
const User = require("../models/User");
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

exports.getAdminPayments = async (page = 1, limit = 20, status) => {
  const skip = (page - 1) * limit;
  const filter = {};
  if (status && status !== "ALL") filter.paymentStatus = status;

  const total = await Payment.countDocuments(filter);
  const items = await Payment.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

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
    const numOrderCode = Number(orderCode);
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
    .populate("relatedEnrollmentId", "classId studentId status finalPrice")
    .populate("relatedPaymentId", "orderCode amount paymentStatus channelKey purpose")
    .populate("relatedContributionId", "orderCode amount status campaignId")
    .populate("relatedBankEventId", "orderCode providerReference amount eventStatus dispatchStatus channelKey")
    .lean();

  const items = serializeDecimal128(rawItems);

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

exports.getFinanceOverview = async () => {
  const [
    tuitionRevenue,
    donationRevenue,
    unappliedReceipts,
    pendingRefunds,
    completedRefunds,
    teacherPending,
    teacherAvailable,
    teacherPaidOut,
    totalReconciliations,
    reconStatusAgg,
    reconReasonAgg,
    totalBankEvents,
    bankDispatchAgg,
    liveBacklogCount,
    liveExhaustedCount,
  ] = await Promise.all([
    sumAmounts(Transaction, { transactionType: "ENROLLMENT_PAYMENT", status: "COMPLETED" }),
    sumAmounts(Transaction, { transactionType: "SPONSOR_CONTRIBUTION", status: "COMPLETED" }),
    sumAmounts(Transaction, { transactionType: "UNAPPLIED_TUITION_RECEIPT", status: "COMPLETED" }),
    sumAmounts(Transaction, { transactionType: "REFUND", status: "PENDING" }),
    sumAmounts(Transaction, { transactionType: "REFUND", status: "COMPLETED" }),
    sumAmounts(TeacherEarning, { status: "PENDING" }, "netAmount"),
    sumAmounts(TeacherEarning, { status: "AVAILABLE" }, "netAmount"),
    sumAmounts(TeacherEarning, { status: "PAID_OUT" }, "netAmount"),
    PaymentReconciliation.countDocuments(),
    PaymentReconciliation.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    PaymentReconciliation.aggregate([
      { $group: { _id: "$reason", count: { $sum: 1 } } },
    ]),
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
  ]);

  const reconByStatus = {
    needsReview: 0,
    inReview: 0,
    resolvedApproved: 0,
    resolvedRefunded: 0,
    resolvedIgnored: 0,
  };
  for (const s of reconStatusAgg) {
    if (s._id === "NEEDS_REVIEW") reconByStatus.needsReview = s.count;
    else if (s._id === "IN_REVIEW") reconByStatus.inReview = s.count;
    else if (s._id === "RESOLVED_APPROVED") reconByStatus.resolvedApproved = s.count;
    else if (s._id === "RESOLVED_REFUNDED") reconByStatus.resolvedRefunded = s.count;
    else if (s._id === "RESOLVED_IGNORED") reconByStatus.resolvedIgnored = s.count;
  }

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
    revenue: {
      confirmedTuitionRevenue: tuitionRevenue,
      confirmedDonationRevenue: donationRevenue,
      unappliedLateReceipts: unappliedReceipts,
      pendingRefundLiability: pendingRefunds,
      completedRefunds: completedRefunds,
    },
    teacherEarnings: {
      pending: teacherPending,
      available: teacherAvailable,
      paidOut: teacherPaidOut,
      note: "Teacher earnings in PENDING state cannot be paid out until class completes.",
    },
    reconciliations: {
      total: totalReconciliations,
      open: reconByStatus.needsReview + reconByStatus.inReview,
      byStatus: reconByStatus,
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
    disclaimer: {
      receiptVsRevenue: "RECEIPT != REVENUE. Unapplied receipts are liabilities, not earned revenue.",
      donationVsTuition: "DONATION funds are restricted to scholarship campaigns and kept separate from tuition revenue.",
      refundExecution: "PR6 allows auditing and note taking. Automated or live refund execution is reserved for PR8.",
    },
  };
};

exports.getAdminBankEvents = async (params = {}) => {
  const page = parseInt(params.page) || 1;
  const limit = parseInt(params.limit || params.pageSize) || 20;
  const filter = {};

  if (params.channelKey && params.channelKey !== "ALL") filter.channelKey = params.channelKey;
  if (params.purpose && params.purpose !== "ALL") filter.purpose = params.purpose;
  if (params.eventStatus && params.eventStatus !== "ALL") filter.eventStatus = params.eventStatus;
  if (params.dispatchStatus && params.dispatchStatus !== "ALL") filter.dispatchStatus = params.dispatchStatus;
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

  const items = serializeDecimal128(rawItems).map(sanitizeBankEvent);

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
  return sanitizeBankEvent(serializeDecimal128(raw));
};

exports.getAdminReconciliations = async (params = {}) => {
  const page = parseInt(params.page) || 1;
  const limit = parseInt(params.limit || params.pageSize) || 20;
  const filter = {};

  if (params.status && params.status !== "ALL") filter.status = params.status;
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

  const skip = (page - 1) * limit;
  const total = await PaymentReconciliation.countDocuments(filter);
  const rawItems = await PaymentReconciliation.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("eventId", "orderCode providerReference amount eventStatus dispatchStatus")
    .populate("paymentId", "orderCode amount paymentStatus channelKey purpose")
    .populate("contributionId", "orderCode amount status campaignId")
    .populate("enrollmentId", "classId studentId status finalPrice")
    .populate("campaignId", "title targetAmount currentAmount status")
    .populate("assignedTo", "email role studentProfile teacherProfile sponsorProfile")
    .populate("resolvedBy", "email role studentProfile teacherProfile sponsorProfile")
    .lean();

  const items = serializeDecimal128(rawItems);

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
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
    .populate("enrollmentId")
    .populate("campaignId")
    .populate("assignedTo", "email role studentProfile teacherProfile sponsorProfile")
    .populate("resolvedBy", "email role studentProfile teacherProfile sponsorProfile")
    .lean();
  if (!raw) {
    throw new AppError("Payment reconciliation record not found", "NOT_FOUND", 404);
  }
  return serializeDecimal128(raw);
};

exports.assignReconciliation = async (id, adminUser, body = {}) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid reconciliation ID", "VALIDATION_ERROR", 400);
  }
  const recon = await PaymentReconciliation.findById(id);
  if (!recon) {
    throw new AppError("Payment reconciliation record not found", "NOT_FOUND", 404);
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

  // CAS Status Transition: if status is NEEDS_REVIEW, transition to IN_REVIEW
  if (recon.status === "NEEDS_REVIEW") {
    recon.status = "IN_REVIEW";
  }

  recon.assignedTo = targetUser._id;

  const targetName = getUserDisplayName(targetUser) || targetUser.email;
  const adminName = getUserDisplayName(adminUser) || adminUser.email || "Admin";
  const noteText = body.note ? ` - Note: ${body.note.trim()}` : "";

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

  const adminName = getUserDisplayName(adminUser) || adminUser.email || "Admin";
  recon.auditReferences.push({
    action: body.action || "NOTE_ADDED",
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
