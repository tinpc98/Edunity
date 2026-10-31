const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const MINUTE = 60 * 1000;

const ipKey = (req) => ipKeyGenerator(req.ip);

// Counters live in this process's memory: enough for one instance, a multi-instance deployment needs a shared store.
const limiter = ({ windowMs, max, keyGenerator = ipKey, skipSuccessfulRequests = false }) =>
  rateLimit({
    windowMs,
    limit: max,
    keyGenerator,
    skipSuccessfulRequests,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // Suites fire hundreds of logins from one address; the limits have their own test that opts back in
    skip: () => process.env.NODE_ENV === "test" && !process.env.RATE_LIMIT_IN_TEST,
    handler: (req, res) =>
      res.status(429).json({ success: false, error: "RATE_LIMITED", message: "Too many attempts, please try again later" }),
  });

const emailOf = (req) => (typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "");

// Only failures count, so a shared network (school, café) is not locked out by normal use
const loginByIp = limiter({ windowMs: 15 * MINUTE, max: 50, skipSuccessfulRequests: true });
const loginByAccount = limiter({
  windowMs: 15 * MINUTE,
  max: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${ipKey(req)}|${emailOf(req)}`, // per address too: nobody can lock a victim out from elsewhere
});
const register = limiter({ windowMs: 60 * MINUTE, max: 20 });
const refresh = limiter({ windowMs: 15 * MINUTE, max: 100 });
const changePassword = limiter({
  windowMs: 15 * MINUTE,
  max: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => req.user.id, // runs after authMiddleware: a stolen token cannot brute-force the password
});

// Per account, after authMiddleware: stops one account from filling disk and memory or flooding inboxes
const byUser = (max, windowMs) => limiter({ windowMs, max, keyGenerator: (req) => req.user.id });
const uploads = byUser(60, 60 * MINUTE);
const messages = byUser(60, MINUTE);
const reports = byUser(20, 60 * MINUTE);

module.exports = { login: [loginByIp, loginByAccount], register, refresh, changePassword, uploads, messages, reports };
