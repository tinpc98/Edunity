const crypto = require("crypto");

const ephemeral = new Map();

/**
 * The only place signing secrets are read from. There is deliberately no shared default value:
 *  - configured value  -> used as is (server.js has validated it in production)
 *  - NODE_ENV=test     -> fixed value so the test suite is deterministic (server.js refuses to boot in "test")
 *  - development       -> random per process: nothing a stranger could reproduce; tokens die on restart
 *  - anything else     -> throws (fail closed)
 */
const getSecret = (name) => {
  if (process.env[name]) return process.env[name];

  if (process.env.NODE_ENV === "test") return `test-only-${name}`;
  if (process.env.NODE_ENV === "development") {
    if (!ephemeral.has(name)) ephemeral.set(name, crypto.randomBytes(48).toString("hex"));
    return ephemeral.get(name);
  }
  throw new Error(`${name} is not set`);
};

module.exports = { getSecret };
