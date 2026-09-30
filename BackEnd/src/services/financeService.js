const TeacherEarning = require("../models/TeacherEarning");
const Payment = require("../models/Payment");
const Transaction = require("../models/Transaction");
const { serializeDecimal128 } = require("../utils/serialize");

exports.getTeacherEarnings = async (teacherId) => {
  const earnings = await TeacherEarning.find({ teacherId }).sort({ createdAt: -1 }).populate("classId", "className").lean();
  
  let totalGross = 0;
  let totalCommission = 0;
  let totalNet = 0;
  let pending = 0;
  let available = 0;
  let paidOut = 0;

  const items = earnings.map(e => {
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
      classId: e.classId?._id.toString(),
      className: e.classId?.className,
      enrollmentId: e.enrollmentId.toString(),
      grossAmount: e.grossAmount.toString(),
      commissionRate: e.commissionRate,
      commissionAmount: e.commissionAmount.toString(),
      netAmount: e.netAmount.toString(),
      status: e.status,
      createdAt: e.createdAt.toISOString()
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
      paidOut: paidOut.toString()
    }
  };
};

exports.getAdminPayments = async (page = 1, limit = 20, status) => {
  const skip = (page - 1) * limit;
  const filter = {};
  if (status) filter.paymentStatus = status;

  const total = await Payment.countDocuments(filter);
  const items = await Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean();

  return {
    items: serializeDecimal128(items),
    total,
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages: Math.ceil(total / limit)
  };
};

exports.getAdminTransactions = async (page = 1, limit = 20, type, status) => {
  const skip = (page - 1) * limit;
  const filter = {};
  if (type) filter.type = type;
  if (status) filter.status = status;

  const total = await Transaction.countDocuments(filter);
  const items = await Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean();

  return {
    items: serializeDecimal128(items),
    total,
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages: Math.ceil(total / limit)
  };
};
