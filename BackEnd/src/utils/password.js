const crypto = require("crypto");
const { promisify } = require("util");

const scryptAsync = promisify(crypto.scrypt);

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
  keyLen: 64,
};

const format = (salt, derivedKey) => `scrypt$${salt}$${derivedKey.toString("hex")}`;

const parseHash = (storedHash) => {
  if (typeof storedHash !== "string" || !storedHash.startsWith("scrypt$")) return null;
  const parts = storedHash.split("$");
  return parts.length === 3 ? { salt: parts[1], hash: Buffer.from(parts[2], "hex") } : null;
};

const matches = (expected, derivedKey) =>
  expected.length === derivedKey.length && crypto.timingSafeEqual(expected, derivedKey);

// Synchronous variants block the event loop: only for scripts and test fixtures, never in a request.
const hashPassword = (plainPassword) => {
  const salt = crypto.randomBytes(16).toString("hex");
  return format(salt, crypto.scryptSync(plainPassword, salt, SCRYPT_PARAMS.keyLen, SCRYPT_PARAMS));
};

const verifyPassword = (plainPassword, storedHash) => {
  const parsed = parseHash(storedHash);
  if (!parsed) return false;
  return matches(parsed.hash, crypto.scryptSync(plainPassword, parsed.salt, SCRYPT_PARAMS.keyLen, SCRYPT_PARAMS));
};

const hashPasswordAsync = async (plainPassword) => {
  const salt = crypto.randomBytes(16).toString("hex");
  return format(salt, await scryptAsync(plainPassword, salt, SCRYPT_PARAMS.keyLen, SCRYPT_PARAMS));
};

const verifyPasswordAsync = async (plainPassword, storedHash) => {
  const parsed = parseHash(storedHash);
  if (!parsed) return false;
  return matches(parsed.hash, await scryptAsync(plainPassword, parsed.salt, SCRYPT_PARAMS.keyLen, SCRYPT_PARAMS));
};

let dummyHash = null;

/** Costs the same as a real check, so a login for an unknown email is not faster than a wrong password. */
const burnPasswordCheck = async (plainPassword) => {
  if (!dummyHash) dummyHash = await hashPasswordAsync(crypto.randomBytes(16).toString("hex"));
  await verifyPasswordAsync(plainPassword, dummyHash);
  return false;
};

module.exports = {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  hashPassword,
  verifyPassword,
  hashPasswordAsync,
  verifyPasswordAsync,
  burnPasswordCheck,
};
