const crypto = require("crypto");
const { AppError } = require("../utils/errors");

/**
 * FPT.eContract port (BAO-07). Two modes, chosen by the server, never by a client:
 *  - FPT_ECONTRACT_ENABLED=true -> real provider (not wired yet: fails closed with 503)
 *  - otherwise, under NODE_ENV development/test only -> SANDBOX: the teacher signs inside Edunity
 * Anywhere else (staging, production) without the real provider, sending a contract fails closed.
 */
const SANDBOX_ENVS = ["development", "test"];
const SIGNATURE_HEADER = "x-econtract-signature";

const isRealEnabled = () => String(process.env.FPT_ECONTRACT_ENABLED || "").trim().toLowerCase() === "true";
const isSandbox = () => !isRealEnabled() && SANDBOX_ENVS.includes(process.env.NODE_ENV);
const getMode = () => (isRealEnabled() ? "FPT_ECONTRACT" : isSandbox() ? "SANDBOX" : null);

const notConfigured = () =>
  new AppError("E-contract provider is not configured", "ECONTRACT_PROVIDER_UNAVAILABLE", 503);

// Returns the provider's id for this signing request
const createEnvelope = async ({ contractCode }) => {
  const mode = getMode();
  if (mode === "SANDBOX") return { name: "SANDBOX", envelopeId: `SBX-${contractCode}-${crypto.randomBytes(4).toString("hex")}` };
  // shortcut: real FPT.eContract API call not implemented, needs FPT credentials + API docs; until then real mode fails closed
  throw notConfigured();
};

/**
 * Webhook authenticity: HMAC-SHA256 (hex) of the exact raw body with FPT_ECONTRACT_WEBHOOK_SECRET.
 * shortcut: assumed scheme, confirm against FPT.eContract's webhook docs when the real account is set up.
 * Returns { envelopeId, event: "SIGNED" | "DECLINED" } or throws (=> 401).
 */
const parseWebhook = (rawBody, headers) => {
  const secret = process.env.FPT_ECONTRACT_WEBHOOK_SECRET;
  const signature = String(headers[SIGNATURE_HEADER] || "");
  if (!secret || !rawBody || !/^[a-f0-9]{64}$/i.test(signature)) throw new Error("unsigned webhook");

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest();
  if (!crypto.timingSafeEqual(expected, Buffer.from(signature, "hex"))) throw new Error("bad webhook signature");

  const body = JSON.parse(rawBody.toString("utf8"));
  if (!body || typeof body.envelopeId !== "string" || !["SIGNED", "DECLINED"].includes(body.event)) {
    throw new Error("malformed webhook");
  }
  return { envelopeId: body.envelopeId, event: body.event };
};

module.exports = { getMode, isSandbox, createEnvelope, parseWebhook, SIGNATURE_HEADER };
