const catalogService = require("../services/catalogService");
const { AppError } = require("../utils/errors");
const { parsePaging } = require("../utils/http");
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
    
    // Validate categoryId
    if (filters.categoryId !== undefined && filters.categoryId !== null && filters.categoryId !== "") {
      if (typeof filters.categoryId !== "string" || !mongoose.isValidObjectId(filters.categoryId)) {
        throw new AppError("Invalid categoryId format", "VALIDATION_ERROR", 400);
      }
    } else {
      delete filters.categoryId;
    }

    // Ignore invalid ObjectIds to prevent 500 for optional filters
    if (filters.subjectId && !mongoose.isValidObjectId(filters.subjectId)) delete filters.subjectId;
    if (filters.courseId && !mongoose.isValidObjectId(filters.courseId)) delete filters.courseId;
    if (filters.teacherId && !mongoose.isValidObjectId(filters.teacherId)) delete filters.teacherId;

    const parsedPage = parseInt(req.query.page, 10);
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

    const parsedPageSize = parseInt(req.query.pageSize, 10);
    const rawPageSize = Number.isInteger(parsedPageSize) && parsedPageSize > 0 ? parsedPageSize : 12;
    const pageSize = Math.min(rawPageSize, 100);
    
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
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 6, 1), 100);
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
