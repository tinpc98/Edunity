const mongoose = require("mongoose");
const { AppError } = require("./errors");
const { serializeDecimal128 } = require("./serialize");

/**
 * Wraps a controller function: the returned value becomes `data` in the
 * standard `{ success, data }` envelope, errors are forwarded to the global handler.
 */
const handle = (fn, statusCode = 200) => async (req, res, next) => {
  try {
    const data = await fn(req);
    res.status(statusCode).json({ success: true, data: serializeDecimal128(data) });
  } catch (err) {
    next(err);
  }
};

const parsePaging = (query = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(query.pageSize || query.limit, 10) || 20, 1), 100);
  return { page, pageSize, skip: (page - 1) * pageSize };
};

const paged = (items, total, { page, pageSize }) => ({
  items,
  total,
  page,
  pageSize,
  totalPages: Math.ceil(total / pageSize),
});

const assertId = (id, message = "Resource not found", code = "NOT_FOUND") => {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(message, code, 404);
  }
};

const validationError = (message, details) => {
  const err = new AppError(message, "VALIDATION_ERROR", 400);
  if (details) err.details = details;
  return err;
};

const parseDate = (value, field) => {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw validationError(`${field} is not a valid date`);
  }
  return date;
};

const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isBlank = (value) => typeof value !== "string" || value.trim() === "";

module.exports = {
  handle,
  parsePaging,
  paged,
  assertId,
  validationError,
  parseDate,
  escapeRegex,
  isBlank,
};
