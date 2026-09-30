const studentService = require("../services/studentService");
const { serializeDecimal128 } = require("../utils/serialize");
const { AppError } = require("../utils/errors");

exports.getMySessions = async (req, res, next) => {
  try {
    if (req.user.role !== "STUDENT") throw new AppError("FORBIDDEN", "Only STUDENT can access", 403);
    
    const { from, to } = req.query;
    const result = await studentService.getMySessions(req.user.id, from, to);
    res.json({ success: true, data: serializeDecimal128(result) });
  } catch (err) {
    next(err);
  }
};

exports.joinSession = async (req, res, next) => {
  try {
    if (req.user.role !== "STUDENT") throw new AppError("FORBIDDEN", "Only STUDENT can access", 403);
    
    const result = await studentService.joinSession(req.user.id, req.params.id);
    res.json({ success: true, data: serializeDecimal128(result) });
  } catch (err) {
    next(err);
  }
};

exports.getMyPayments = async (req, res, next) => {
  try {
    if (req.user.role !== "STUDENT") throw new AppError("FORBIDDEN", "Only STUDENT can access", 403);
    
    const result = await studentService.getMyPayments(req.user.id);
    res.json({ success: true, data: serializeDecimal128(result) });
  } catch (err) {
    next(err);
  }
};
