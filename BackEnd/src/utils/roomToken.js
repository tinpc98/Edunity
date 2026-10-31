const crypto = require("crypto");
const { getSecret } = require("./secrets");

// Placeholder for the Video Provider token API (mục 11.7): until a provider SDK is wired in,
// the backend issues its own short-lived signed token (NFR-11/NFR-12).
const sign = (payload) => crypto.createHmac("sha256", getSecret("ROOM_TOKEN_SECRET")).update(payload).digest("base64url");

const createRoomToken = ({ roomId, sessionId, userId, role, expiresAt }) => {
  const payload = Buffer.from(
    JSON.stringify({ roomId, sessionId, userId, role, exp: Math.floor(expiresAt.getTime() / 1000) })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
};

const verifyRoomToken = (token) => {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  const expected = sign(payload);
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, Buffer.from(expected))) {
    return null;
  }
  const data = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (data.exp * 1000 <= Date.now()) return null;
  return data;
};

module.exports = { createRoomToken, verifyRoomToken };
