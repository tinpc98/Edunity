const mongoose = require("mongoose");
const User = require("../models/User");

const mockAuth = async (req, res, next) => {
  try {
    if (req.user && req.user.id) {
      return next();
    }

    if (process.env.NODE_ENV === "production" && !req.user) {
      return res.status(401).json({
        success: false,
        error: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    let extractedUserId = req.headers["x-user-id"];
    const authHeader = req.headers["authorization"];
    
    if (authHeader && authHeader.startsWith("Bearer dev-")) {
      extractedUserId = authHeader.replace("Bearer dev-", "");
    }

    if (process.env.NODE_ENV === "test" && !extractedUserId) {
      req.user = {
        id: "507f1f77bcf86cd799439011",
        role: req.headers["x-user-role"] || "STUDENT",
      };
      return next();
    }

    if (!extractedUserId || !mongoose.isValidObjectId(extractedUserId)) {
      return res.status(401).json({
        success: false,
        error: "UNAUTHORIZED",
        message: "Valid auth identifier is required",
      });
    }

    const user = await User.findById(extractedUserId).lean();
    if (user) {
      req.user = {
        id: user._id.toString(),
        role: user.role,
      };
      return next();
    } else {
      if (process.env.NODE_ENV === "test") {
        req.user = {
          id: extractedUserId,
          role: req.headers["x-user-role"] || "STUDENT",
        };
        return next();
      } else {
        return res.status(401).json({
          success: false,
          error: "UNAUTHORIZED",
          message: "User not found",
        });
      }
    }
  } catch (error) {
    next(error);
  }
};

module.exports = mockAuth;
