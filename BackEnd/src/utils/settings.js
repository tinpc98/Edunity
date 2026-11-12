const { AppError } = require("./errors");
const platformSettingService = require("../services/platformSettingService");

// Runtime commission policy store (can be populated by Admin/System config or tests).
// Never treats 0.1 as an approved final business policy in production/staging.
let runtimeCommissionPolicy = null;

function isStrictCommissionPolicyEnv(options = {}) {
  if (typeof options.requireApprovedPolicy === "boolean") {
    return options.requireApprovedPolicy;
  }
  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  const requireFlag = String(process.env.REQUIRE_APPROVED_COMMISSION_POLICY || "")
    .trim()
    .toLowerCase();
  return (
    nodeEnv === "production" ||
    nodeEnv === "staging" ||
    requireFlag === "true"
  );
}

function validateCommissionRateValue(rateValue) {
  const num = Number(rateValue);
  if (!Number.isFinite(num) || num < 0 || num > 1) {
    throw new AppError(
      `Invalid commission rate policy value: "${rateValue}". Rate must be a finite number in [0, 1].`,
      "COMMISSION_POLICY_INVALID",
      500
    );
  }
  return num;
}

/**
 * Sets or updates the runtime commission rate policy (e.g. from DB settings or Admin policy update).
 * Future TeacherEarning records will snapshot this rate and version; existing TeacherEarning
 * records remain immutable with their previously snapshotted rate and version.
 */
function setCommissionPolicyForRuntime({
  rate,
  version,
  source = "RUNTIME_POLICY",
  isApproved = true,
} = {}) {
  const validatedRate = validateCommissionRateValue(rate);
  const normalizedVersion = String(version || "").trim();
  if (!normalizedVersion) {
    throw new AppError(
      "Commission policy version (appliedPolicyVersion) is required",
      "COMMISSION_POLICY_INVALID",
      500
    );
  }
  runtimeCommissionPolicy = {
    rate: validatedRate,
    version: normalizedVersion,
    source: String(source || "RUNTIME_POLICY").trim(),
    isApproved: Boolean(isApproved),
    updatedAt: new Date(),
  };
  return { ...runtimeCommissionPolicy };
}

function clearCommissionPolicyForRuntime() {
  runtimeCommissionPolicy = null;
}

/**
 * Resolves the active Commission Rate Policy for creating new TeacherEarning snapshots.
 *
 * Rules (TIN-FIN-PR5):
 * 1. Never treat 0.1 as a hardcoded approved business constant.
 * 2. In production/staging (or when REQUIRE_APPROVED_COMMISSION_POLICY=true), an explicitly
 *    approved policy with a valid rate in [0, 1] and a policy version MUST be present, otherwise
 *    throws COMMISSION_POLICY_NOT_CONFIGURED / COMMISSION_POLICY_NOT_APPROVED.
 * 3. In development/test (non-strict mode), if no approved policy is configured, falls back to
 *    { rate: 0.1, version: "DEV_TEST_FALLBACK_V1", source: "DEV_TEST_UNAPPROVED_FALLBACK", isApproved: false }
 *    so local/dev tests remain deterministic without pretending 0.1 is an approved production policy.
 */
function resolveCommissionPolicy(options = {}) {
  const isStrict = isStrictCommissionPolicyEnv(options);

  if (runtimeCommissionPolicy) {
    const rate = validateCommissionRateValue(runtimeCommissionPolicy.rate);
    const version = String(runtimeCommissionPolicy.version || "").trim();
    if (!version) {
      throw new AppError(
        "Runtime commission policy is missing version",
        "COMMISSION_POLICY_INVALID",
        500
      );
    }
    if (isStrict && !runtimeCommissionPolicy.isApproved) {
      throw new AppError(
        "Configured commission rate policy is not marked as approved for production/staging",
        "COMMISSION_POLICY_NOT_APPROVED",
        503
      );
    }
    return {
      rate,
      version,
      source: runtimeCommissionPolicy.source || "RUNTIME_POLICY",
      isApproved: Boolean(runtimeCommissionPolicy.isApproved),
    };
  }

  const rawEnvRate = process.env.COMMISSION_RATE;
  const hasEnvRate =
    rawEnvRate !== undefined &&
    rawEnvRate !== null &&
    String(rawEnvRate).trim() !== "";

  if (hasEnvRate) {
    const rate = validateCommissionRateValue(rawEnvRate);
    const envVersion = String(process.env.COMMISSION_POLICY_VERSION || "").trim();
    const envApproved =
      String(process.env.COMMISSION_POLICY_APPROVED || "")
        .trim()
        .toLowerCase() === "true";

    if (isStrict) {
      if (!envVersion || !envApproved) {
        throw new AppError(
          "Approved commission rate policy is not configured (requires COMMISSION_RATE, COMMISSION_POLICY_VERSION, and COMMISSION_POLICY_APPROVED=true in production/staging)",
          "COMMISSION_POLICY_NOT_CONFIGURED",
          503
        );
      }
    }

    return {
      rate,
      version: envVersion || "ENV_UNVERSIONED_V1",
      source: "ENV_CONFIG",
      isApproved: envApproved,
    };
  }

  if (isStrict) {
    throw new AppError(
      "[COMMISSION_POLICY_NOT_CONFIGURED] Approved commission rate policy is missing in production/staging; refusing to silently apply unapproved 0.1 fallback",
      "COMMISSION_POLICY_NOT_CONFIGURED",
      503
    );
  }

  // Non-strict development/test fallback ONLY (explicitly tagged as unapproved fallback)
  return {
    rate: 0.1,
    version: "DEV_TEST_FALLBACK_V1",
    source: "DEV_TEST_UNAPPROVED_FALLBACK",
    isApproved: false,
  };
}

/**
 * Synchronous accessor backed by PlatformSetting cache + zero-safe env fallback + defaults,
 * while preserving Tin PR5's commission policy enforcement when no DB override is active.
 */
function getSetting(key, now = new Date()) {
  const normalized = String(key || "").trim().toUpperCase();
  if (normalized === "COMMISSION_RATE") {
    const meta = platformSettingService.getSettingMetaSync("COMMISSION_RATE", now);
    if (meta && meta.source === "DB") {
      return meta.value;
    }
    return resolveCommissionPolicy().rate;
  }

  return platformSettingService.getEffectiveSettingSync(key, now);
}

module.exports = {
  getSetting,
  getEffectiveSetting: platformSettingService.getEffectiveSetting,
  refreshSettingsCache: platformSettingService.warmCache,
  clearSettingsCache: platformSettingService.clearCache,
  resolveCommissionPolicy,
  setCommissionPolicyForRuntime,
  clearCommissionPolicyForRuntime,
  validateCommissionRateValue,
};
