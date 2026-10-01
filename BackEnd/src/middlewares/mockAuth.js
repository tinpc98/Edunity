const mongoose = require("mongoose");
const User = require("../models/User");
const { verifyAccessToken } = require("../utils/jwt");

const BLOCKED_STATUSES = ["SUSPENDED", "BANNED"];

const reject = (res, statusCode, error, message) => res.status(statusCode).json({ success: false, error, message });

/**
 * Real authentication: `Authorization: Bearer <JWT access token>` issued by /auth/login and /auth/refresh.
 * The account is re-read on every request so a suspended/banned/removed user loses access immediately
 * and role changes apply without waiting for the token to expire.
 */
const authenticateJwt = async (token, req, res, next) => {
  const { payload, error } = verifyAccessToken(token);
  if (error === "TOKEN_EXPIRED") return reject(res, 401, "TOKEN_EXPIRED", "Access token has expired");
  if (error) return reject(res, 401, "UNAUTHORIZED", "Invalid access token");

  const user = mongoose.isValidObjectId(payload.sub) ? await User.findById(payload.sub).lean() : null;
  if (!user || user.isDeleted) return reject(res, 401, "UNAUTHORIZED", "User not found");
  if (BLOCKED_STATUSES.includes(user.status)) return reject(res, 403, "ACCOUNT_BLOCKED", "Account is suspended or banned");

  req.user = { id: user._id.toString(), role: user.role };
  return next();
};

const mockAuth = async (req, res, next) => {
  try {
    if (req.user && req.user.id) {
      return next();
    }

    const bearer = (req.headers["authorization"] || "").match(/^Bearer (.+)$/);
    if (bearer && !bearer[1].startsWith("dev-")) {
      return await authenticateJwt(bearer[1], req, res, next);
    }

    // Everything below is the DEV/TEST shortcut (x-user-id header, "dev-<userId>" token); never in production.
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
      if (user.isDeleted || BLOCKED_STATUSES.includes(user.status)) {
        return reject(res, 403, "ACCOUNT_BLOCKED", "Account is suspended or banned");
      }
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
