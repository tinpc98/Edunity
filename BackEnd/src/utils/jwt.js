const jwt = require("jsonwebtoken");

const ISSUER = "edunity";
const DEV_SECRET = "edunity-dev-jwt-secret";

// In production the secret must come from the environment (server.js refuses to start without it).
const getSecret = () => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === "production") throw new Error("JWT_SECRET is not set");
  return DEV_SECRET;
};

const getAccessTtl = () => process.env.JWT_ACCESS_TTL || "15m";

const signAccessToken = (user) =>
  jwt.sign({ role: user.role }, getSecret(), {
    algorithm: "HS256",
    issuer: ISSUER,
    subject: user._id.toString(),
    expiresIn: getAccessTtl(),
  });

/**
 * Returns `{ payload }` for a valid token, otherwise `{ error }` with
 * TOKEN_EXPIRED (the client should call /auth/refresh) or INVALID_TOKEN.
 */
const verifyAccessToken = (token) => {
  try {
    return { payload: jwt.verify(token, getSecret(), { algorithms: ["HS256"], issuer: ISSUER }) };
  } catch (err) {
    return { error: err.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "INVALID_TOKEN" };
  }
};

module.exports = { signAccessToken, verifyAccessToken, getAccessTtl, getSecret };
