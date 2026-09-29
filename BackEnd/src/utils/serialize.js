const mongoose = require("mongoose");

const serializeDecimal128 = (obj) => {
  if (obj === null || obj === undefined) return obj;

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => serializeDecimal128(item));
  }

  // Handle Mongoose Decimal128 directly
  if (obj instanceof mongoose.Types.Decimal128) {
    return obj.toString();
  }

  // Handle objects with $numberDecimal property (from raw lean() result)
  if (obj.$numberDecimal) {
    return obj.$numberDecimal;
  }

  // If it's a Mongoose document, convert to lean object first
  if (typeof obj.toObject === "function") {
    obj = obj.toObject();
  }

  // If it's a regular object, recurse
  if (typeof obj === "object") {
    const serialized = {};
    for (const key of Object.keys(obj)) {
      serialized[key] = serializeDecimal128(obj[key]);
    }
    return serialized;
  }

  return obj;
};

module.exports = {
  serializeDecimal128,
};
