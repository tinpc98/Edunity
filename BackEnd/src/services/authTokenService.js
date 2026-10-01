const crypto = require("crypto");
const RefreshToken = require("../models/RefreshToken");
const User = require("../models/User");
const { AppError } = require("../utils/errors");
const { signAccessToken, getAccessTtl } = require("../utils/jwt");

const REFRESH_TOKEN_TTL_MS = (parseInt(process.env.REFRESH_TOKEN_TTL_DAYS, 10) || 30) * 24 * 60 * 60 * 1000;
const BLOCKED_STATUSES = ["SUSPENDED", "BANNED"];

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const invalidRefreshToken = () => new AppError("Invalid or expired refresh token", "INVALID_REFRESH_TOKEN", 401);

// Short-lived JWT access token (mục 11.5); renewed through the refresh token
const buildAccessToken = (user) => signAccessToken(user);

const assertAccountUsable = (user) => {
  if (!user || user.isDeleted) throw invalidRefreshToken();
  if (BLOCKED_STATUSES.includes(user.status)) {
    throw new AppError("Account is suspended or banned", "ACCOUNT_BLOCKED", 403);
  }
};

// The raw refresh token is only returned to the client; the database stores its hash
const issueRefreshToken = async (userId, meta = {}) => {
  const token = crypto.randomBytes(48).toString("hex");
  const record = await RefreshToken.create({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    userAgent: meta.userAgent,
    ip: meta.ip,
  });
  return { token, record };
};

/**
 * POST /auth/refresh — refresh token rotation: the presented token is revoked and replaced.
 * Presenting an already-revoked token revokes every token of that user (reuse detection).
 */
const refresh = async (refreshToken, meta) => {
  if (typeof refreshToken !== "string" || refreshToken === "") throw invalidRefreshToken();

  const record = await RefreshToken.findOne({ tokenHash: hashToken(refreshToken) });
  if (!record) throw invalidRefreshToken();
  if (record.revokedAt) {
    // A token that was already rotated is being replayed: assume it leaked and end every session.
    // Tokens revoked by logout / password change / suspension are simply refused.
    if (record.replacedByTokenId) {
      await RefreshToken.updateMany({ userId: record.userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    }
    throw invalidRefreshToken();
  }
  if (record.expiresAt <= new Date()) throw invalidRefreshToken();

  const user = await User.findById(record.userId);
  assertAccountUsable(user);

  const { token, record: replacement } = await issueRefreshToken(user._id, meta);
  record.revokedAt = new Date();
  record.replacedByTokenId = replacement._id;
  await record.save();

  return { accessToken: buildAccessToken(user), expiresIn: getAccessTtl(), refreshToken: token, user };
};

// POST /auth/logout — idempotent: an unknown or already revoked token is not an error
const logout = async (refreshToken) => {
  if (typeof refreshToken === "string" && refreshToken !== "") {
    await RefreshToken.updateOne(
      { tokenHash: hashToken(refreshToken), revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
  }
  return { loggedOut: true };
};

// Force-logout: used when an account is suspended/banned or its password changes
const revokeAllForUser = async (userId) => {
  await RefreshToken.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
};

module.exports = { buildAccessToken, assertAccountUsable, issueRefreshToken, refresh, logout, revokeAllForUser };
