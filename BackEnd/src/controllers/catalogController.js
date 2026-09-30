const catalogService = require("../services/catalogService");
const { AppError } = require("../utils/errors");
const { serializeDecimal128 } = require("../utils/serialize");
const mongoose = require("mongoose");

exports.getCategories = async (req, res, next) => {
  try {
    const result = await catalogService.getCategories();
    res.json({ success: true, data: serializeDecimal128(result) });
  } catch (error) {
    next(error);
  }
};

exports.getFilters = async (req, res, next) => {
  try {
    const result = await catalogService.getFilters();
    res.json({ success: true, data: serializeDecimal128(result) });
  } catch (error) {
    next(error);
  }
};

exports.getClasses = async (req, res, next) => {
  try {
    const filters = { ...req.query };
    
    // Ignore invalid ObjectIds to prevent 500
    if (filters.subjectId && !mongoose.isValidObjectId(filters.subjectId)) delete filters.subjectId;
    if (filters.courseId && !mongoose.isValidObjectId(filters.courseId)) delete filters.courseId;
    if (filters.teacherId && !mongoose.isValidObjectId(filters.teacherId)) delete filters.teacherId;

    const page = parseInt(req.query.page) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize) || 12, 100);
    
    const result = await catalogService.getClasses(filters, page, pageSize);
    res.json({ success: true, data: serializeDecimal128(result) });
  } catch (error) {
    next(error);
  }
};

exports.getClassById = async (req, res, next) => {
  try {
    const result = await catalogService.getClassById(req.params.id);
    res.json({ success: true, data: serializeDecimal128(result) });
  } catch (error) {
    next(error);
  }
};

exports.getClassSessions = async (req, res, next) => {
  try {
    const result = await catalogService.getClassSessions(req.params.id);
    res.json({ success: true, data: serializeDecimal128(result) });
  } catch (error) {
    next(error);
  }
};

exports.getTeachers = async (req, res, next) => {
  try {
    const { featured, limit } = req.query;
    const isFeatured = featured === "true";
    const limitNum = parseInt(limit) || 6;
    const result = await catalogService.getTeachers(isFeatured, limitNum);
    res.json({ success: true, data: serializeDecimal128(result) });
  } catch (error) {
    next(error);
  }
};

exports.getTeacherById = async (req, res, next) => {
  try {
    const result = await catalogService.getTeacherById(req.params.id);
    res.json({ success: true, data: serializeDecimal128(result) });
  } catch (error) {
    next(error);
  }
};
