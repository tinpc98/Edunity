const crypto = require("node:crypto");
const mongoose = require("mongoose");
const { RefreshToken, User } = require("../models");
const { AppError } = require("../utils/errors");
const { validationError } = require("../utils/http");
const { hashPasswordAsync, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } = require("../utils/password");

const RESET_DURATION_MS = 30 * 60 * 1000;
const RESEND_DELAY_MS = 60 * 1000;
const activeAccount = { status: "ACTIVE", isDeleted: { $ne: true } };
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const invalidToken = () => new AppError("Invalid or expired password reset link", "INVALID_PASSWORD_RESET", 400);

const mailSettings = () => {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.PASSWORD_RESET_FROM?.trim();
  let url;
  try {
    url = new URL("/reset-password", process.env.PASSWORD_RESET_WEB_ORIGIN);
  } catch {
    // Incomplete configuration is reported uniformly for all addresses.
  }
  const trustOrigin = url && (url.protocol === "https:" ||
    (process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)));
  if (!apiKey || !from || !trustOrigin || url.username || url.password) {
    throw new AppError("Password reset email is unavailable", "PASSWORD_RESET_UNAVAILABLE", 503);
  }
  return { apiKey, from, url };
};

const sendResetEmail = async ({ apiKey, from, url }, email, token) => {
  // Keep the token in the fragment so it is not sent in HTTP requests for the page.
  url.hash = token;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Đặt lại mật khẩu Edunity",
      text: `Mở liên kết sau để đặt mật khẩu mới cho tài khoản Edunity của bạn:\n${url}\n\nLiên kết hết hạn sau 30 phút và chỉ dùng được một lần. Nếu bạn không gửi yêu cầu này, hãy bỏ qua email.`,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
};

const requestReset = async (input) => {
  const email = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw validationError("Invalid email format");
  }
  const settings = mailSettings();
  const token = crypto.randomBytes(32).toString("base64url");
  const passwordResetHash = hashToken(token);
  const now = Date.now();
  const user = await User.findOneAndUpdate(
    {
      ...activeAccount,
      email,
      $or: [
        { passwordResetExpiresAt: { $exists: false } },
        { passwordResetExpiresAt: { $lte: new Date(now + RESET_DURATION_MS - RESEND_DELAY_MS) } },
      ],
    },
    { $set: { passwordResetHash, passwordResetExpiresAt: new Date(now + RESET_DURATION_MS) } },
    { projection: { _id: 1 } }
  ).lean();

  if (user) {
    // Delivery is asynchronous so response time and status do not disclose membership.
    void sendResetEmail(settings, email, token).catch(() => {
      console.error("[passwordReset] Email delivery failed");
      // Keep the resend throttle even when the mail provider fails.
    });
  }
};

const resetPassword = async ({ token, password } = {}) => {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw invalidToken();
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw validationError(`Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters`);
  }

  const passwordResetHash = hashToken(token);
  const validReset = () => ({
    ...activeAccount,
    passwordResetHash,
    passwordResetExpiresAt: { $gt: new Date() },
  });
  if (!(await User.exists(validReset()))) throw invalidToken();
  const passwordHash = await hashPasswordAsync(password);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const user = await User.findOneAndUpdate(
        validReset(),
        {
          $set: { passwordHash },
          $unset: { passwordResetHash: "", passwordResetExpiresAt: "" },
          $inc: { tokenVersion: 1 },
        },
        { session, projection: { _id: 1 } }
      );
      if (!user) throw invalidToken();
      await RefreshToken.updateMany(
        { userId: user._id, revokedAt: null },
        { $set: { revokedAt: new Date() } },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }
};

module.exports = { requestReset, resetPassword };
