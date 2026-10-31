/**
 * Startup configuration check. server.js refuses to boot when this reports a problem, so a
 * misconfigured deployment fails loudly instead of running with weak security.
 * Problems name the variable only: secret values must never reach the logs.
 */
const BOOTABLE_ENVS = ["development", "production"]; // "test" only ever runs through supertest, never as a server
const MIN_SECRET_LENGTH = 32;
const PLACEHOLDER = /change-?me|edunity-dev|your[-_]?secret|example/i;

const parseCorsOrigins = (value) =>
  String(value || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

const isOrigin = (origin) => {
  try {
    const url = new URL(origin);
    return ["http:", "https:"].includes(url.protocol) && url.origin === origin;
  } catch {
    return false;
  }
};

const checkSecret = (env, name, problems) => {
  const value = env[name];
  if (!value) problems.push(`${name} is required in production`);
  else if (value.length < MIN_SECRET_LENGTH) problems.push(`${name} must be at least ${MIN_SECRET_LENGTH} characters`);
  else if (PLACEHOLDER.test(value)) problems.push(`${name} still contains a placeholder value`);
};

const validateEnv = (env = process.env) => {
  const problems = [];

  if (!BOOTABLE_ENVS.includes(env.NODE_ENV)) {
    problems.push(`NODE_ENV must be one of: ${BOOTABLE_ENVS.join(", ")}`);
    return problems; // every other rule depends on knowing the environment
  }

  const origins = parseCorsOrigins(env.CORS_ORIGIN);
  if (origins.includes("*")) problems.push("CORS_ORIGIN must list explicit origins, not *");
  const invalid = origins.filter((origin) => origin !== "*" && !isOrigin(origin));
  if (invalid.length) problems.push(`CORS_ORIGIN contains an invalid origin: ${invalid.join(", ")}`);

  if (env.NODE_ENV !== "production") return problems;

  if (origins.length === 0) problems.push("CORS_ORIGIN is required in production");

  const required = ["JWT_SECRET", "FILE_URL_SECRET", "PAYMENT_WEBHOOK_SECRET"];
  const liveKit = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"].filter((name) => env[name]);
  if (liveKit.length > 0 && liveKit.length < 3) problems.push("LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set together");
  if (liveKit.length === 0) required.push("ROOM_TOKEN_SECRET"); // only signs classroom tokens when LiveKit is off

  required.forEach((name) => checkSecret(env, name, problems));

  // One leaked secret must not unlock the others
  const values = required.map((name) => env[name]).filter(Boolean);
  if (new Set(values).size !== values.length) problems.push(`${required.join(", ")} must all be different`);

  return problems;
};

const assertEnv = () => {
  const problems = validateEnv();
  if (problems.length === 0) return;
  console.error("Invalid configuration, refusing to start:");
  problems.forEach((problem) => console.error(`  - ${problem}`));
  process.exit(1);
};

// "*" is never honoured, even if configured: browsers would then accept responses for any site
const getAllowedOrigins = () => {
  const origins = parseCorsOrigins(process.env.CORS_ORIGIN).filter((origin) => origin !== "*");
  if (origins.length > 0) return origins;
  return process.env.NODE_ENV === "production" ? [] : ["http://localhost:5173"];
};

module.exports = { validateEnv, assertEnv, parseCorsOrigins, getAllowedOrigins };
