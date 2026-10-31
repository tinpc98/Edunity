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

  // A password change ends every session: access tokens from before it stop working right away
  if ((payload.tv || 0) !== (user.tokenVersion || 0)) {
    return reject(res, 401, "UNAUTHORIZED", "Session ended by a password change");
  }

  req.user = { id: user._id.toString(), role: user.role };
  return next();
};

/**
 * Test-suite shortcut (x-user-id header, "dev-<userId>" token). Allow-listed on NODE_ENV === "test",
 * so an unset or mistyped NODE_ENV can never turn it on; server.js also refuses to boot in "test".
 */
const authenticateForTests = async (req, res, next) => {
  const authHeader = req.headers["authorization"] || "";
  const extractedUserId = authHeader.startsWith("Bearer dev-") ? authHeader.replace("Bearer dev-", "") : req.headers["x-user-id"];

  if (!extractedUserId) {
    req.user = { id: "507f1f77bcf86cd799439011", role: req.headers["x-user-role"] || "STUDENT" };
    return next();
  }
  if (!mongoose.isValidObjectId(extractedUserId)) {
    return reject(res, 401, "UNAUTHORIZED", "Valid auth identifier is required");
  }

  const user = await User.findById(extractedUserId).lean();
  if (user && (user.isDeleted || BLOCKED_STATUSES.includes(user.status))) {
    return reject(res, 403, "ACCOUNT_BLOCKED", "Account is suspended or banned");
  }
  req.user = user
    ? { id: user._id.toString(), role: user.role }
    : { id: extractedUserId, role: req.headers["x-user-role"] || "STUDENT" };
  return next();
};

const authMiddleware = async (req, res, next) => {
  try {
    const isTest = process.env.NODE_ENV === "test";
    const bearer = (req.headers["authorization"] || "").match(/^Bearer (.+)$/);

    if (bearer && !(isTest && bearer[1].startsWith("dev-"))) {
      return await authenticateJwt(bearer[1], req, res, next);
    }
    if (isTest) return await authenticateForTests(req, res, next);

    return reject(res, 401, "UNAUTHORIZED", "Authentication required");
  } catch (error) {
    next(error);
  }
};

module.exports = authMiddleware;
