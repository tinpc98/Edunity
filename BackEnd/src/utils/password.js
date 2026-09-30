const crypto = require("crypto");

const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
  keyLen: 64,
};

const hashPassword = (plainPassword) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(plainPassword, salt, SCRYPT_PARAMS.keyLen, SCRYPT_PARAMS);
  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
};

const verifyPassword = (plainPassword, storedHash) => {
  if (!storedHash || !storedHash.startsWith("scrypt$")) {
    return false;
  }
  
  const parts = storedHash.split("$");
  if (parts.length !== 3) {
    return false;
  }
  
  const salt = parts[1];
  const hashHex = parts[2];
  const hashBuffer = Buffer.from(hashHex, "hex");
  
  const derivedKey = crypto.scryptSync(plainPassword, salt, SCRYPT_PARAMS.keyLen, SCRYPT_PARAMS);
  
  if (hashBuffer.length !== derivedKey.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(hashBuffer, derivedKey);
};

module.exports = {
  hashPassword,
  verifyPassword,
};
