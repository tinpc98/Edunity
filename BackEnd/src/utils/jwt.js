const jwt = require("jsonwebtoken");
const secrets = require("./secrets");

const ISSUER = "edunity";

const getSecret = () => secrets.getSecret("JWT_SECRET");

const getAccessTtl = () => process.env.JWT_ACCESS_TTL || "15m";

const signAccessToken = (user) =>
  jwt.sign({ role: user.role, tv: user.tokenVersion || 0 }, getSecret(), {
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
