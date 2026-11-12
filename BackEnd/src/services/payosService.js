const { PayOS, ConnectionTimeoutError } = require("@payos/node");
const { AppError } = require("../utils/errors");

const ALLOWED_MOCK_ENVS = ["development", "test"];
const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Valid payment purposes and their server-enforced channel mapping.
 * Frontend/client NEVER chooses channelKey, merchant credentials, or bank account.
 */
const PAYMENT_PURPOSES = Object.freeze({
  TUITION: "TUITION",
  DONATION: "DONATION",
});

const CHANNEL_KEYS = Object.freeze({
  TUITION: "TUITION",
  DONATION: "DONATION",
});

const PURPOSE_TO_CHANNEL = Object.freeze({
  [PAYMENT_PURPOSES.TUITION]: CHANNEL_KEYS.TUITION,
  [PAYMENT_PURPOSES.DONATION]: CHANNEL_KEYS.DONATION,
});

// Per-channel cached PayOS SDK client instances
const cachedClients = {
  [CHANNEL_KEYS.TUITION]: { client: null, configKey: null },
  [CHANNEL_KEYS.DONATION]: { client: null, configKey: null },
};

/**
 * Resolve server-trusted channelKey strictly from server-determined purpose.
 * Rejects any unknown or invalid purpose.
 */
const resolveChannelForPurpose = (purpose) => {
  const normalized = String(purpose || "").trim().toUpperCase();
  const channelKey = PURPOSE_TO_CHANNEL[normalized];
  if (!channelKey) {
    throw new AppError(
      `Unsupported payment purpose: ${purpose}`,
      "INVALID_PAYMENT_PURPOSE",
      400
    );
  }
  return channelKey;
};

/**
 * Check if real payOS mode is explicitly enabled globally or for a specific channel.
 */
const isPayosEnabled = (channelKey = null) => {
  if (channelKey) {
    const channelFlag = String(process.env[`PAYOS_${channelKey}_ENABLED`] || "")
      .trim()
      .toLowerCase();
    if (channelFlag === "true") return true;
    if (channelFlag === "false") return false;
  }
  return String(process.env.PAYOS_ENABLED || "").trim().toLowerCase() === "true";
};

/**
 * Check if deterministic mock/sandbox fallback is allowed in current environment.
 * In REAL LOCAL RUNTIME, or when ENABLE_PAYMENT_SANDBOX is not explicitly "true",
 * mock fallback is strictly disabled to prevent simulated payments on acceptance databases.
 */
const isSandboxFallbackAllowed = () => {
  if (process.env.REAL_LOCAL_RUNTIME === "true" || process.env.NODE_ENV === "production") {
    return false;
  }
  if (!ALLOWED_MOCK_ENVS.includes(process.env.NODE_ENV)) {
    return false;
  }
  return process.env.ENABLE_PAYMENT_SANDBOX === "true";
};

/**
 * Read payOS configuration for a specific channelKey ("TUITION" | "DONATION").
 * Prefers channel-specific env vars (`PAYOS_TUITION_*`, `PAYOS_DONATION_*`) and
 * falls back to generic `PAYOS_*` only for TUITION when channel-specific vars are unset.
 * Never logs or exposes secret values in error messages.
 */
const getChannelConfig = (channelKey = CHANNEL_KEYS.TUITION) => {
  const normalizedChannel = resolveChannelForPurpose(channelKey);
  const prefix = `PAYOS_${normalizedChannel}_`;

  // For TUITION, allow fallback to legacy PAYOS_CLIENT_ID / API_KEY / CHECKSUM_KEY if channel-specific ones are unset.
  // For DONATION, require PAYOS_DONATION_* (or explicit configuration) so channels do not silently share credentials in production.
  const allowGenericFallback = normalizedChannel === CHANNEL_KEYS.TUITION;

  const clientId = (
    process.env[`${prefix}CLIENT_ID`] ||
    (allowGenericFallback ? process.env.PAYOS_CLIENT_ID : "") ||
    ""
  ).trim();
  const apiKey = (
    process.env[`${prefix}API_KEY`] ||
    (allowGenericFallback ? process.env.PAYOS_API_KEY : "") ||
    ""
  ).trim();
  const checksumKey = (
    process.env[`${prefix}CHECKSUM_KEY`] ||
    (allowGenericFallback ? process.env.PAYOS_CHECKSUM_KEY : "") ||
    ""
  ).trim();

  const defaultReturnUrl =
    normalizedChannel === CHANNEL_KEYS.DONATION
      ? "http://localhost:5173/sponsor/contributions/return"
      : "http://localhost:5173/payment/return";
  const defaultCancelUrl =
    normalizedChannel === CHANNEL_KEYS.DONATION
      ? "http://localhost:5173/sponsor/contributions/cancel"
      : "http://localhost:5173/payment/cancel";

  const returnUrl = (
    process.env[`${prefix}RETURN_URL`] ||
    process.env.PAYOS_RETURN_URL ||
    defaultReturnUrl
  ).trim();
  const cancelUrl = (
    process.env[`${prefix}CANCEL_URL`] ||
    process.env.PAYOS_CANCEL_URL ||
    defaultCancelUrl
  ).trim();

  const parsedTimeout = parseInt(
    process.env[`${prefix}TIMEOUT_MS`] || process.env.PAYOS_TIMEOUT_MS,
    10
  );
  const timeoutMs =
    Number.isFinite(parsedTimeout) && parsedTimeout > 0
      ? parsedTimeout
      : DEFAULT_TIMEOUT_MS;

  return {
    channelKey: normalizedChannel,
    clientId,
    apiKey,
    checksumKey,
    returnUrl,
    cancelUrl,
    timeoutMs,
  };
};

// Alias for backward compatibility
const getPayosConfig = (channelKey = CHANNEL_KEYS.TUITION) => getChannelConfig(channelKey);

/**
 * Ensure all required payOS credentials exist for the requested channel when PAYOS_ENABLED=true.
 */
const assertChannelConfig = (channelKey = CHANNEL_KEYS.TUITION) => {
  const cfg = getChannelConfig(channelKey);
  const prefix = `PAYOS_${cfg.channelKey}_`;
  const missing = [];
  if (!cfg.clientId) missing.push(`${prefix}CLIENT_ID`);
  if (!cfg.apiKey) missing.push(`${prefix}API_KEY`);
  if (!cfg.checksumKey) missing.push(`${prefix}CHECKSUM_KEY`);
  if (!cfg.returnUrl) missing.push(`${prefix}RETURN_URL`);
  if (!cfg.cancelUrl) missing.push(`${prefix}CANCEL_URL`);

  if (missing.length > 0) {
    throw new AppError(
      `payOS channel [${cfg.channelKey}] configuration is incomplete (missing: ${missing.join(", ")})`,
      "PAYOS_CONFIG_ERROR",
      503
    );
  }
  return cfg;
};

const assertPayosConfig = (channelKey = CHANNEL_KEYS.TUITION) => assertChannelConfig(channelKey);

/**
 * Build or reuse PayOS SDK client instance for a specific channelKey.
 */
const getPayosClient = (channelKey = CHANNEL_KEYS.TUITION) => {
  const cfg = assertChannelConfig(channelKey);
  const cacheEntry = cachedClients[cfg.channelKey];
  const configKey = `${cfg.channelKey}:${cfg.clientId}:${cfg.timeoutMs}:${cfg.apiKey.length}:${cfg.checksumKey.length}`;

  if (!cacheEntry.client || cacheEntry.configKey !== configKey) {
    cacheEntry.client = new PayOS({
      clientId: cfg.clientId,
      apiKey: cfg.apiKey,
      checksumKey: cfg.checksumKey,
      timeout: cfg.timeoutMs,
      maxRetries: 0,
    });
    cacheEntry.configKey = configKey;
  }
  return { client: cacheEntry.client, cfg };
};

/**
 * Reset cached SDK clients (useful for unit/integration tests that mutate process.env).
 */
const resetPayosClient = () => {
  for (const key of Object.keys(cachedClients)) {
    cachedClients[key].client = null;
    cachedClients[key].configKey = null;
  }
};

/**
 * Sanitize transfer description for payOS (max 25 chars per Napas247/payOS standard).
 */
const sanitizeDescription = (rawDescription, orderCode, channelKey) => {
  const prefix = channelKey === CHANNEL_KEYS.DONATION ? "EDUNITY DB" : "EDUNITY HP";
  const fallback = `${prefix} ${orderCode}`.slice(0, 25);
  if (!rawDescription || typeof rawDescription !== "string") {
    return fallback;
  }
  const cleaned = rawDescription
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || fallback).slice(0, 25);
};

/**
 * Redact any accidental credential substrings from error messages before logging or throwing.
 */
const redactSafeMessage = (channelOrErr, maybeErr) => {
  const target = maybeErr !== undefined ? maybeErr : channelOrErr;
  const raw =
    target && typeof target.message === "string"
      ? target.message
      : typeof target === "string"
      ? target
      : "Unknown payOS provider error";
  const tuitionCfg = getChannelConfig(CHANNEL_KEYS.TUITION);
  const donationCfg = getChannelConfig(CHANNEL_KEYS.DONATION);
  const secrets = [
    tuitionCfg.clientId,
    tuitionCfg.apiKey,
    tuitionCfg.checksumKey,
    donationCfg.clientId,
    donationCfg.apiKey,
    donationCfg.checksumKey,
  ];
  let safe = raw;
  for (const secret of secrets) {
    if (secret && secret.length >= 4) {
      safe = safe.split(secret).join("[REDACTED]");
    }
  }
  return safe;
};

/**
 * Create a payment link & VietQR via the resolved payOS channel (TUITION or DONATION)
 * or deterministic mock adapter (when PAYOS_ENABLED!=true in allowed dev/test environments).
 *
 * @param {Object} params
 * @param {string} [params.purpose="TUITION"] - "TUITION" | "DONATION"
 * @param {string} [params.channelKey] - Server-resolved channel ("TUITION" | "DONATION")
 * @param {number} params.orderCode - Positive safe integer orderCode
 * @param {number} params.amount - Positive integer amount in VND
 * @param {string} [params.description] - Short transfer description
 * @param {Date|number} params.expiredAt - Expiration Date or Unix timestamp (seconds)
 * @param {string} [params.returnUrl] - Optional override return URL
 * @param {string} [params.cancelUrl] - Optional override cancel URL
 */
const createPaymentLink = async ({
  purpose = PAYMENT_PURPOSES.TUITION,
  channelKey,
  orderCode,
  amount,
  description,
  expiredAt,
  returnUrl,
  cancelUrl,
}) => {
  const resolvedPurpose = String(purpose || PAYMENT_PURPOSES.TUITION)
    .trim()
    .toUpperCase();
  const expectedChannel = resolveChannelForPurpose(resolvedPurpose);
  const resolvedChannel = channelKey ? resolveChannelForPurpose(channelKey) : expectedChannel;

  if (resolvedChannel !== expectedChannel) {
    throw new AppError(
      `Channel mismatch: purpose ${resolvedPurpose} must use channel ${expectedChannel}`,
      "PAYMENT_CHANNEL_MISMATCH",
      400
    );
  }

  if (!Number.isSafeInteger(orderCode) || orderCode <= 0) {
    throw new AppError("orderCode must be a positive safe integer", "VALIDATION_ERROR", 400);
  }

  const normalizedAmount = Math.round(Number(amount));
  if (!Number.isSafeInteger(normalizedAmount) || normalizedAmount <= 0) {
    throw new AppError("Payment amount must be a positive integer in VND", "VALIDATION_ERROR", 400);
  }

  const expiredAtDate =
    expiredAt instanceof Date ? expiredAt : new Date(Number(expiredAt) * 1000);
  if (Number.isNaN(expiredAtDate.getTime())) {
    throw new AppError("Invalid payment expiration timestamp", "VALIDATION_ERROR", 400);
  }
  const expiredAtUnix = Math.floor(expiredAtDate.getTime() / 1000);
  const safeDescription = sanitizeDescription(description, orderCode, resolvedChannel);

  // Branch 1: Real payOS SDK mode for resolvedChannel
  if (isPayosEnabled(resolvedChannel)) {
    const { client, cfg } = getPayosClient(resolvedChannel);
    const requestPayload = {
      orderCode,
      amount: normalizedAmount,
      description: safeDescription,
      returnUrl: returnUrl || cfg.returnUrl,
      cancelUrl: cancelUrl || cfg.cancelUrl,
      expiredAt: expiredAtUnix,
    };

    let timer = null;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          const timeoutErr = new Error(
            `payOS [${resolvedChannel}] request timed out after ${cfg.timeoutMs}ms`
          );
          timeoutErr.code = "ETIMEDOUT";
          reject(timeoutErr);
        }, cfg.timeoutMs);
      });

      const response = await Promise.race([
        client.paymentRequests.create(requestPayload),
        timeoutPromise,
      ]);

      if (!response || typeof response !== "object") {
        throw new Error("Empty or invalid response from payOS provider");
      }

      const resolvedExpiredAt =
        typeof response.expiredAt === "number" && response.expiredAt > 0
          ? new Date(response.expiredAt * 1000)
          : expiredAtDate;

      return {
        purpose: resolvedPurpose,
        channelKey: resolvedChannel,
        provider: "PAYOS",
        gateway: "PAYOS",
        orderCode: Number.isSafeInteger(response.orderCode) ? response.orderCode : orderCode,
        paymentLinkId: response.paymentLinkId || `plink_${resolvedChannel.toLowerCase()}_${orderCode}`,
        qrCode: typeof response.qrCode === "string" ? response.qrCode : null,
        checkoutUrl: response.checkoutUrl || null,
        expiredAt: resolvedExpiredAt,
        providerStatus: response.status || "PENDING",
        providerCreatedAt: new Date(),
        currency: response.currency || "VND",
        providerMetadata: {
          channelKey: resolvedChannel,
          bin: response.bin || null,
          accountNumber: response.accountNumber || null,
          accountName: response.accountName || null,
          description: response.description || safeDescription,
        },
      };
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }

      const isTimeout =
        err instanceof ConnectionTimeoutError ||
        err.code === "ETIMEDOUT" ||
        err.name === "AbortError" ||
        /timed?\s*out/i.test(err.message || "");

      if (isTimeout) {
        throw new AppError(
          `Payment gateway [${resolvedChannel}] request timed out. Please try again.`,
          "PAYOS_TIMEOUT",
          504
        );
      }

      throw new AppError(
        `Unable to create payment link from provider [${resolvedChannel}]: ${redactSafeMessage(err)}`,
        "PAYOS_PROVIDER_ERROR",
        502
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // Branch 2: PAYOS_ENABLED is not true -> check if deterministic dev/test mock is allowed
  if (!isSandboxFallbackAllowed()) {
    throw new AppError(
      "Cổng thanh toán chưa được kích hoạt.",
      "PAYMENT_PROVIDER_DISABLED",
      503
    );
  }

  // Deterministic EMVCo VietQR payload & checkoutUrl for development/test per channel
  const channelTag = resolvedChannel === CHANNEL_KEYS.DONATION ? "DONATION" : "TUITION";
  const mockVietQrPayload = `00020101021238570010A000000727012700069704220113EDUNITY${orderCode}0208QRIBFTTA5303704540${String(
    normalizedAmount
  ).length}${normalizedAmount}5802VN62200816${channelTag}${orderCode}6304MOCK`;

  return {
    purpose: resolvedPurpose,
    channelKey: resolvedChannel,
    provider: "PAYOS",
    gateway: "SANDBOX",
    orderCode,
    paymentLinkId: `mock_${resolvedChannel.toLowerCase()}_plink_${orderCode}`,
    qrCode: mockVietQrPayload,
    checkoutUrl: `https://pay.payos.vn/web/mock_${resolvedChannel.toLowerCase()}_${orderCode}`,
    expiredAt: expiredAtDate,
    providerStatus: "PENDING",
    providerCreatedAt: new Date(),
    currency: "VND",
    providerMetadata: {
      channelKey: resolvedChannel,
      mode: "SANDBOX_MOCK",
      description: safeDescription,
    },
  };
};

/**
 * Retrieve a PayOS SDK instance configured with at least checksumKey for webhook signature verification
 * via the official `await client.webhooks.verify(body)` API.
 */
const getWebhookVerifyClient = (channelKey = CHANNEL_KEYS.TUITION) => {
  const cfg = getChannelConfig(channelKey);
  const prefix = `PAYOS_${cfg.channelKey}_`;
  if (!cfg.checksumKey) {
    throw new AppError(
      `payOS channel [${cfg.channelKey}] webhook checksum key is not configured (missing: ${prefix}CHECKSUM_KEY)`,
      "PAYOS_CONFIG_ERROR",
      401
    );
  }
  return new PayOS({
    clientId: cfg.clientId || `webhook_verify_${cfg.channelKey.toLowerCase()}`,
    apiKey: cfg.apiKey || `webhook_verify_${cfg.channelKey.toLowerCase()}`,
    checksumKey: cfg.checksumKey,
  });
};

/**
 * Verify a payOS webhook payload strictly against the specified channel's checksumKey
 * using the official `@payos/node` SDK method `await client.webhooks.verify(webhookBody)`.
 *
 * Never trusts client-declared channelKey; caller MUST pass the route-bound channelKey.
 */
const verifyWebhookPayload = async (channelKey, webhookBody) => {
  const resolvedChannel = resolveChannelForPurpose(channelKey);

  if (!webhookBody || typeof webhookBody !== "object" || Array.isArray(webhookBody)) {
    throw new AppError("Webhook body must be a valid JSON object", "VALIDATION_ERROR", 400);
  }

  const { data, signature } = webhookBody;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new AppError("Webhook payload is missing required data object", "VALIDATION_ERROR", 400);
  }
  if (typeof signature !== "string" || !signature.trim()) {
    throw new AppError("Webhook signature is required", "UNAUTHORIZED", 401);
  }

  const client = getWebhookVerifyClient(resolvedChannel);
  try {
    const verifiedData = await client.webhooks.verify(webhookBody);
    return verifiedData;
  } catch (err) {
    throw new AppError(
      `Invalid payOS webhook signature for channel ${resolvedChannel}`,
      "UNAUTHORIZED",
      401
    );
  }
};

/**
 * Helper to sign a webhook data object using the official `@payos/node` crypto utility
 * for the specified channel (used by automated tests or internal webhook simulation).
 */
const signWebhookDataForChannel = async (channelKey, dataObj) => {
  const resolvedChannel = resolveChannelForPurpose(channelKey);
  const client = getWebhookVerifyClient(resolvedChannel);
  return client.crypto.createSignatureFromObj(dataObj, client.checksumKey);
};

/**
 * Query an existing payment link on payOS by orderCode or paymentLinkId (recovery helper
 * when createPaymentLink succeeded on payOS but network timed out or local DB save failed).
 */
const getPaymentLinkInfo = async (channelKey, orderCodeOrLinkId) => {
  const resolvedChannel = resolveChannelForPurpose(channelKey);
  if (!isPayosEnabled(resolvedChannel)) {
    return null;
  }
  const { client } = getPayosClient(resolvedChannel);
  try {
    return await client.paymentRequests.get(orderCodeOrLinkId);
  } catch (err) {
    throw new AppError(
      `Unable to query payment link from provider [${resolvedChannel}]: ${redactSafeMessage(err)}`,
      "PAYOS_PROVIDER_ERROR",
      502
    );
  }
};

module.exports = {
  PAYMENT_PURPOSES,
  CHANNEL_KEYS,
  resolveChannelForPurpose,
  isPayosEnabled,
  isSandboxFallbackAllowed,
  getChannelConfig,
  getPayosConfig,
  assertChannelConfig,
  assertPayosConfig,
  getPayosClient,
  resetPayosClient,
  createPaymentLink,
  verifyWebhookPayload,
  signWebhookDataForChannel,
  getPaymentLinkInfo,
  redactSafeMessage,
};
