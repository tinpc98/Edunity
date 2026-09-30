const financeService = require("../services/financeService");

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
    const { page, limit, status } = req.query;
    const result = await financeService.getAdminPayments(page, limit, status);
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
    const { page, limit, type, status } = req.query;
    const result = await financeService.getAdminTransactions(page, limit, type, status);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};
