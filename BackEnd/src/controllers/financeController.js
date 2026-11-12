const financeService = require("../services/financeService");
const settlementService = require("../services/settlementService");
const payoutService = require("../services/payoutService");
const refundService = require("../services/refundService");
const { parsePaging } = require("../utils/http");
const clock = require("../utils/clock");

// ==========================================
// Teacher Finance Controllers
// ==========================================

exports.getTeacherEarnings = async (req, res, next) => {
  try {
    if (req.user.role !== "TEACHER") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only teachers can access" });
    }
    const testNow = clock.getNow();
    const result = await settlementService.getTeacherSettlementSummary(req.user.id, { now: testNow });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.getTeacherSettlements = async (req, res, next) => {
  try {
    if (req.user.role !== "TEACHER") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only teachers can access" });
    }
    const testNow = clock.getNow();
    const result = await settlementService.getTeacherSettlementSummary(req.user.id, { now: testNow });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.teacherListPayouts = async (req, res, next) => {
  try {
    if (req.user.role !== "TEACHER") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only teachers can access" });
    }
    const { page, pageSize } = parsePaging(req.query);
    const result = await payoutService.listMyPayouts(req.user.id, { ...req.query, page, pageSize });
    res.status(200).json({ success: true, data: result, ...result });
  } catch (err) {
    next(err);
  }
};

exports.teacherRequestPayout = async (req, res, next) => {
  try {
    if (req.user.role !== "TEACHER") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only teachers can access" });
    }
    const testNow = clock.getNow();
    const result = await payoutService.requestPayout(req.user.id, req.body, { now: testNow });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.getPayoutDetails = async (req, res, next) => {
  try {
    const result = await payoutService.getPayoutById(req.params.id, req.user);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ==========================================
// Admin Payouts Controllers
// ==========================================

exports.getAdminPayouts = async (req, res, next) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only admins can access" });
    }
    const { page, pageSize } = parsePaging(req.query);
    const result = await payoutService.adminListPayouts(req.query, { page, pageSize, skip: (page - 1) * pageSize });
    res.status(200).json({ success: true, data: result, ...result });
  } catch (err) {
    next(err);
  }
};

exports.approvePayout = async (req, res, next) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only admins can access" });
    }
    const result = await payoutService.approvePayout(req.user.id, req.params.id, req.body || {});
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.completePayout = async (req, res, next) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only admins can access" });
    }
    const testNow = clock.getNow();
    const result = await payoutService.completePayout(req.user.id, req.params.id, req.body || {}, {
      now: testNow,
      requireDualVerification: req.body?.requireDualVerification === true,
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.verifyPayoutProof = async (req, res, next) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only admins can access" });
    }
    const testNow = clock.getNow();
    // P0 Financial Safety Hardening (PR10): Fail-closed Four-Eyes enforcement unconditionally.
    // Client payload cannot disable or bypass Four-Eyes verification.
    const result = await payoutService.verifyPayoutProof(req.user.id, req.params.id, req.body || {}, {
      now: testNow,
      enforceDifferentAdmin: true,
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.rejectPayout = async (req, res, next) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only admins can access" });
    }
    const result = await payoutService.rejectPayout(req.user.id, req.params.id, req.body || {});
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.evaluateSettlements = async (req, res, next) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only admins can access" });
    }
    const testNow = clock.getNow();
    const classId = req.query.classId || req.body?.classId;
    let result;
    if (classId) {
      result = await settlementService.evaluateClassSettlement(classId, { now: testNow });
    } else {
      result = await settlementService.evaluateAllPendingSettlements({ now: testNow });
    }
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ==========================================
// Admin Overview, Bank Events & Reconciliations
// ==========================================

exports.getFinanceOverview = async (req, res, next) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only admins can access" });
    }
    const result = await financeService.getFinanceOverview(req.query);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.getAdminPayments = async (req, res, next) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only admins can access" });
    }
    const { page, pageSize } = parsePaging(req.query);
    const result = await financeService.getAdminPayments(page, pageSize, req.query.status);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.getAdminTransactions = async (req, res, next) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only admins can access" });
    }
    const result = await financeService.getAdminTransactions(req.query);
    res.status(200).json({ success: true, data: result, ...result });
  } catch (err) {
    next(err);
  }
};

exports.getAdminBankEvents = async (req, res, next) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only admins can access" });
    }
    const result = await financeService.getAdminBankEvents(req.query);
    res.status(200).json({ success: true, data: result, ...result });
  } catch (err) {
    next(err);
  }
};

exports.getAdminBankEventById = async (req, res, next) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only admins can access" });
    }
    const result = await financeService.getAdminBankEventById(req.params.id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.getAdminReconciliations = async (req, res, next) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only admins can access" });
    }
    const result = await financeService.getAdminReconciliations(req.query);
    res.status(200).json({ success: true, data: result, ...result });
  } catch (err) {
    next(err);
  }
};

exports.getAdminReconciliationById = async (req, res, next) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only admins can access" });
    }
    const result = await financeService.getAdminReconciliationById(req.params.id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.assignReconciliation = async (req, res, next) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only admins can access" });
    }
    const result = await financeService.assignReconciliation(req.params.id, req.user, req.body || {});
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.addReconciliationNote = async (req, res, next) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only admins can access" });
    }
    const result = await financeService.addReconciliationNote(req.params.id, req.user.id, req.body || {});
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ==========================================
// Admin Safe Refund Controllers (PR8)
// ==========================================

exports.listRefundCases = async (req, res, next) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only admins can access" });
    }
    const result = await refundService.listRefundCases(req.query);
    res.status(200).json({ success: true, data: result, ...result });
  } catch (err) {
    next(err);
  }
};

exports.getRefundCaseById = async (req, res, next) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only admins can access" });
    }
    const result = await refundService.getRefundCaseById(req.params.id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.createRefundCase = async (req, res, next) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only admins can access" });
    }
    const result = await refundService.createRefundCase(req.body, {
      actorId: req.user.id,
      actorRole: req.user.role,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.reviewRefundCase = async (req, res, next) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only admins can access" });
    }
    const result = await refundService.reviewRefundCase(req.user.id, req.params.id, req.body || {});
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.approveRefundCase = async (req, res, next) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only admins can access" });
    }
    const testNow = clock.getNow();
    const result = await refundService.approveRefundCase(req.user.id, req.params.id, req.body || {}, { now: testNow });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.rejectRefundCase = async (req, res, next) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only admins can access" });
    }
    const result = await refundService.rejectRefundCase(req.user.id, req.params.id, req.body || {});
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.submitRefundProof = async (req, res, next) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only admins can access" });
    }
    const testNow = clock.getNow();
    const result = await refundService.submitRefundProof(req.user.id, req.params.id, req.body || {}, {
      now: testNow,
      autoVerify: req.body?.autoVerify === true,
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.verifyAndCompleteRefund = async (req, res, next) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only admins can access" });
    }
    const testNow = clock.getNow();
    // P0 Financial Safety Hardening (PR10): Fail-closed Four-Eyes enforcement unconditionally.
    // Client payload cannot disable or bypass Four-Eyes verification.
    const result = await refundService.verifyAndCompleteRefund(req.user.id, req.params.id, req.body || {}, {
      now: testNow,
      enforceDifferentAdmin: true,
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};
