const mongoose = require("mongoose");
const { AppError } = require("./errors");

const toNum = (value) => (value === null || value === undefined ? 0 : Number(value.toString()));

const toDec = (value) => mongoose.Types.Decimal128.fromString(String(value));

const MAX_AMOUNT = 1e12;

/**
 * Parses a money amount coming from a request body.
 * Accepts numbers or numeric strings; rejects anything that is not a finite, non-negative amount.
 */
const parseAmount = (value, field, { allowZero = false } = {}) => {
  const amount = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) {
    throw new AppError(`${field} must be a valid amount`, "VALIDATION_ERROR", 400);
  }
  if (!allowZero && amount === 0) {
    throw new AppError(`${field} must be greater than 0`, "VALIDATION_ERROR", 400);
  }
  return amount;
};

module.exports = { toNum, toDec, parseAmount };
