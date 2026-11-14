const crypto = require("crypto");

/**
 * Field-level protection for personal data (CCCD number, address, bank account) — BAO-04.
 *  - encrypt/decrypt: AES-256-GCM, stored as "v1:<base64 iv|tag|ciphertext>" (the version allows key rotation later)
 *  - blindIndex: keyed HMAC, so "is this CCCD already used?" is answerable without decrypting anything
 * Keys are derived from PII_ENCRYPTION_KEY. Losing that key makes the encrypted fields unreadable: back it up.
 */
const DEV_ENVS = ["development", "test"];
// Fixed (not random) in dev/test so local data stays readable across restarts. Never used in production: env.js requires the real key.
const DEV_KEY = "dev-only-pii-key-never-use-in-production";

const masterKey = () => {
  if (process.env.PII_ENCRYPTION_KEY) return process.env.PII_ENCRYPTION_KEY;
  if (DEV_ENVS.includes(process.env.NODE_ENV)) return DEV_KEY;
  throw new Error("PII_ENCRYPTION_KEY is not set");
};

const deriveKey = (purpose) => Buffer.from(crypto.hkdfSync("sha256", masterKey(), "edunity-pii", purpose, 32));

const encrypt = (plain) => {
  if (plain === null || plain === undefined) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey("encrypt-v1"), iv);
  const data = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64")}`;
};

const decrypt = (blob) => {
  if (!blob) return null;
  if (!blob.startsWith("v1:")) throw new Error("Unknown PII ciphertext version");
  const raw = Buffer.from(blob.slice(3), "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey("encrypt-v1"), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
};

const blindIndex = (value) => crypto.createHmac("sha256", deriveKey("blind-index-v1")).update(String(value)).digest("hex");

// "079203001234" -> "********1234"
const maskTail = (value, visible = 4) => (value ? `${"*".repeat(Math.max(value.length - visible, 0))}${value.slice(-visible)}` : null);

// Keeps only the last two comma-separated parts (district, province): "12 Lê Lợi, P.1, Q.1, TP.HCM" -> "***, Q.1, TP.HCM"
const maskAddress = (address) => {
  if (!address) return null;
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length <= 2 ? "***" : `***, ${parts.slice(-2).join(", ")}`;
};

// "Nguyễn  Văn A" -> "NGUYEN VAN A": OCR, bank records and typing differ in accents, case and spacing, not in letters
const normalizePersonName = (name) =>
  String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "D").replace(/\s+/g, " ").trim().toUpperCase();

module.exports = { encrypt, decrypt, blindIndex, maskTail, maskAddress, normalizePersonName };
