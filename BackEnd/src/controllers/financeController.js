const financeService = require("../services/financeService");
const { parsePaging } = require("../utils/http");

exports.getTeacherEarnings = async (req, res, next) => {
  try {
    if (req.user.role !== "TEACHER") {
      return res.status(403).json({ success: false, error: "FORBIDDEN", message: "Only teachers can access" });
    }
    const result = await financeService.getTeacherEarnings(req.user.id);
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
    const { page, pageSize } = parsePaging(req.query);
    const result = await financeService.getAdminTransactions(page, pageSize, req.query.type, req.query.status);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};
