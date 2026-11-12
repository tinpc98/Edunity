const crypto = require("crypto");
const { AiAuditLog } = require("../models");
const { AI_TASK_TYPES, AI_AUDIT_OUTCOMES } = require("../models/constants");
const { AppError } = require("../utils/errors");
const { paged, validationError } = require("../utils/http");
const { getConsentDependencyStatus } = require("./scholarshipDossierGateService");

const ALLOWED_AI_ACTOR_ROLES = ["STUDENT", "TEACHER", "SPONSOR", "ADMIN"];
const toId = (val) => (val && val._id ? val._id.toString() : val ? String(val) : null);
const assertQueryEnum = (val, allowed, field) => {
  if (val === undefined || val === null || val === "") return null;
  if (typeof val !== "string") {
    throw validationError(`${field} query parameter must be a string`);
  }
  const upper = val.trim().toUpperCase();
  if (!upper) return null;
  if (!allowed.includes(upper)) {
    throw validationError(`${field} must be one of ${allowed.join(", ")}`);
  }
  return upper;
};

/**
 * Pluggable AI Provider Port (Fail-Closed by default).
 * Production stays BLOCKED (503 AI_PROVIDER_BLOCKED) until Product Owner / Security approve:
 *  - Official AI provider SDK & contractual DPA
 *  - Provider API credentials in .env / secret manager
 *  - AID-08 guardian/student AI consent policy
 *  - Monthly/daily token cost budget
 * Tests may inject a controlled in-memory mock adapter via `setAiProviderAdapter(...)` and MUST
 * reset it via `resetAiProviderAdapter()` after test execution.
 */
let registeredAiAdapter = null;

const DEFAULT_CONFIG = {
  timeoutMs: 8000,
  maxRetries: 1,
  maxInputChars: 4000,
  maxOutputTokens: 1200,
  rateWindowMs: 15 * 60 * 1000,
  rateMaxRequests: 20,
  dailyTokenBudgetPerUser: 50000,
};

let governanceConfig = { ...DEFAULT_CONFIG };
const inMemoryRateWindow = new Map();

const setAiProviderAdapter = (adapter) => {
  if (!adapter) {
    registeredAiAdapter = null;
    return;
  }
  if (typeof adapter.generate !== "function") {
    throw new Error("AI provider adapter must expose an async generate(payload) method");
  }
  registeredAiAdapter = {
    providerId: String(adapter.providerId || "TEST_MOCK_PROVIDER"),
    modelId: String(adapter.modelId || "mock-v1"),
    isTestMock: Boolean(adapter.isTestMock ?? true),
    generate: adapter.generate,
  };
};

const resetAiProviderAdapter = () => {
  registeredAiAdapter = null;
};

const setAiGovernanceConfig = (overrides = {}) => {
  governanceConfig = { ...DEFAULT_CONFIG, ...overrides };
};

const resetAiGovernanceConfig = () => {
  governanceConfig = { ...DEFAULT_CONFIG };
  inMemoryRateWindow.clear();
};

const getAiProviderStatus = () => {
  const consentStatus = getConsentDependencyStatus();
  const envConfigured = Boolean(process.env.AI_PROVIDER && process.env.AI_API_KEY);
  const adapterReady = Boolean(registeredAiAdapter);

  const blockers = [];
  if (!adapterReady) blockers.push("NO_APPROVED_AI_PROVIDER");
  if (!envConfigured && !adapterReady) blockers.push("NO_AI_API_CREDENTIALS");
  if (!consentStatus.aid08ConsentReady) blockers.push("AID_08_CONSENT_DEPENDENCY_BLOCKED");

  return {
    status: adapterReady ? "READY" : "BLOCKED",
    providerConfigured: adapterReady,
    providerId: registeredAiAdapter ? registeredAiAdapter.providerId : null,
    modelId: registeredAiAdapter ? registeredAiAdapter.modelId : null,
    sdkInstalled: false,
    envCredentialsPresent: envConfigured,
    aid08ConsentReady: Boolean(consentStatus.aid08ConsentReady),
    blockers,
    limits: {
      timeoutMs: governanceConfig.timeoutMs,
      maxRetries: governanceConfig.maxRetries,
      maxOutputTokens: governanceConfig.maxOutputTokens,
      rateWindowMs: governanceConfig.rateWindowMs,
      rateMaxRequests: governanceConfig.rateMaxRequests,
      dailyTokenBudgetPerUser: governanceConfig.dailyTokenBudgetPerUser,
    },
  };
};

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+|any\s+)?(previous|prior|above|system)\s+(instructions?|rules?|prompts?)/i,
  /disregard\s+(all\s+|any\s+)?(previous|prior|above)\s+(instructions?|rules?)/i,
  /you\s+are\s+now\s+(a\s+|an\s+)?(admin|root|system|developer|unrestricted)/i,
  /(reveal|print|dump|leak|show)\s+(your\s+)?(system\s*prompt|api[_\s-]*key|secrets?|env|passwordHash|private\s+data|student\s+list|emails?)/i,
  /<\|\s*(im_start|system|endoftext)\s*\|>/i,
  /###\s*system\s*:/i,
  /\b(jailbreak|dan\s+mode|bypass\s+rbac|override\s+authorization)\b/i,
];

const detectPromptInjection = (text) => {
  if (!text || typeof text !== "string") return false;
  return PROMPT_INJECTION_PATTERNS.some((rx) => rx.test(text));
};

const EMAIL_RX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const VN_PHONE_RX = /(?:\+?84|0)(?:3|5|7|8|9|2)\d(?:[\s.-]*\d){7,8}\b/g;
const VN_CCCD_RX = /\b0\d{11}\b/g;
const EXPLICIT_ID_RX = /\b(?:cccd|cmnd|national\s*id|passport)\s*[:#-]?\s*[A-Z0-9]{6,15}\b/gi;
const PRIVATE_KEY_RX = /private\/[a-f0-9]{24}\/\S+/gi;
const JWT_RX = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

const FORBIDDEN_PII_KEYS = new Set([
  "passwordHash",
  "tokenHash",
  "tokenVersion",
  "email",
  "actorEmail",
  "phone",
  "dateOfBirth",
  "guardianInfo",
  "schoolInfo",
  "nationalIdLast4",
  "householdCircumstance",
  "address",
  "schoolAddress",
  "storageKey",
  "studentProfile",
  "verificationDocs",
  "sponsorProfile",
  "reviewedBy",
  "moderatedBy",
  "lockedBy",
  "mutedBy",
]);

const redactPiiText = (input) => {
  if (typeof input !== "string") return { text: "", redactionCount: 0 };
  let count = 0;
  let out = input;

  const replaceWith = (rx, token) => {
    out = out.replace(rx, () => {
      count += 1;
      return token;
    });
  };

  replaceWith(PRIVATE_KEY_RX, "[REDACTED_STORAGE_KEY]");
  replaceWith(JWT_RX, "[REDACTED_TOKEN]");
  replaceWith(EMAIL_RX, "[REDACTED_EMAIL]");
  replaceWith(VN_PHONE_RX, "[REDACTED_PHONE]");
  replaceWith(VN_CCCD_RX, "[REDACTED_ID]");
  replaceWith(EXPLICIT_ID_RX, "[REDACTED_ID]");

  return { text: out, redactionCount: count };
};

const sanitizeContextData = (value, { depth = 0 } = {}) => {
  if (depth > 8) return { sanitized: "[TRUNCATED]", redactionCount: 0 };
  if (value === null || value === undefined) return { sanitized: value, redactionCount: 0 };
  if (typeof value === "number" || typeof value === "boolean") return { sanitized: value, redactionCount: 0 };
  if (value instanceof Date) return { sanitized: value.toISOString(), redactionCount: 0 };
  if (typeof value === "string") {
    const res = redactPiiText(value);
    return { sanitized: res.text, redactionCount: res.redactionCount };
  }
  if (Array.isArray(value)) {
    let total = 0;
    const arr = value.map((item) => {
      const sub = sanitizeContextData(item, { depth: depth + 1 });
      total += sub.redactionCount;
      return sub.sanitized;
    });
    return { sanitized: arr, redactionCount: total };
  }
  if (typeof value === "object") {
    if (value._bsontype === "ObjectId" || typeof value.toHexString === "function") {
      return { sanitized: value.toString(), redactionCount: 0 };
    }
    if (value._bsontype === "Decimal128") {
      return { sanitized: value.toString(), redactionCount: 0 };
    }
    let total = 0;
    const obj = {};
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_PII_KEYS.has(k)) {
        total += 1;
        continue;
      }
      const sub = sanitizeContextData(v, { depth: depth + 1 });
      total += sub.redactionCount;
      obj[k] = sub.sanitized;
    }
    return { sanitized: obj, redactionCount: total };
  }
  return { sanitized: String(value), redactionCount: 0 };
};

const detectPiiLeak = (text, forbiddenValues = []) => {
  if (!text || typeof text !== "string") return null;
  if (EMAIL_RX.test(text)) {
    EMAIL_RX.lastIndex = 0;
    return "EMAIL_DETECTED";
  }
  EMAIL_RX.lastIndex = 0;

  if (VN_PHONE_RX.test(text)) {
    VN_PHONE_RX.lastIndex = 0;
    return "PHONE_DETECTED";
  }
  VN_PHONE_RX.lastIndex = 0;

  if (VN_CCCD_RX.test(text)) {
    VN_CCCD_RX.lastIndex = 0;
    return "NATIONAL_ID_DETECTED";
  }
  VN_CCCD_RX.lastIndex = 0;

  if (PRIVATE_KEY_RX.test(text)) {
    PRIVATE_KEY_RX.lastIndex = 0;
    return "STORAGE_KEY_DETECTED";
  }
  PRIVATE_KEY_RX.lastIndex = 0;

  const lower = text.toLowerCase();
  for (const val of forbiddenValues) {
    if (val && typeof val === "string" && val.trim().length >= 4) {
      if (lower.includes(val.trim().toLowerCase())) {
        return "FORBIDDEN_PII_VALUE_MATCH";
      }
    }
  }
  return null;
};

const collectAllowedNumbers = (data, bucket = new Set()) => {
  if (data === null || data === undefined) return bucket;
  if (typeof data === "number" && Number.isFinite(data)) {
    bucket.add(data);
    bucket.add(Math.round(data));
    bucket.add(Math.round(data * 10) / 10);
    bucket.add(Math.round(data * 100) / 100);
    return bucket;
  }
  if (typeof data === "string") {
    const trimmed = data.trim();
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      const n = Number(trimmed);
      if (Number.isFinite(n)) collectAllowedNumbers(n, bucket);
    }
    return bucket;
  }
  if (Array.isArray(data)) {
    for (const item of data) collectAllowedNumbers(item, bucket);
    return bucket;
  }
  if (typeof data === "object") {
    for (const [k, v] of Object.entries(data)) {
      if (k === "filtersApplied") continue;
      collectAllowedNumbers(v, bucket);
    }
  }
  return bucket;
};

/**
 * Ensures AI-generated report narratives (AI-03, AI-04) do not invent or tamper with numbers.
 * Strips numbered markdown list prefixes (`1. `, `2) `) and compares every metric number in output
 * against the exact set of verified aggregate numbers passed to the model.
 */
const assertNumericGrounding = (text, sourceAggregateData) => {
  if (!text || typeof text !== "string") return;
  const allowed = collectAllowedNumbers(sourceAggregateData);
  allowed.add(0);

  // Strip line-leading markdown numbered bullets like "1. " or "2) " so formatting lists never triggers false positives
  const cleaned = text.replace(/^\s*\d+[.)]\s+/gm, "");
  // Remove comma thousand separators before scanning numbers (e.g. "500,000" -> "500000")
  const normalized = cleaned.replace(/(?<=\d),(?=\d{3}\b)/g, "");

  const matches = normalized.match(/\b\d+(?:\.\d+)?\b/g) || [];
  const ungrounded = [];
  for (const token of matches) {
    const num = Number(token);
    if (!Number.isFinite(num)) continue;
    if (!allowed.has(num)) {
      ungrounded.push(token);
    }
  }

  if (ungrounded.length > 0) {
    const err = new AppError(
      `AI response contained ungrounded metrics not present in verified source aggregates: ${[...new Set(ungrounded)].slice(0, 5).join(", ")}`,
      "AI_OUTPUT_UNGROUNDED",
      502
    );
    err.details = { ungroundedNumbers: [...new Set(ungrounded)].slice(0, 10) };
    throw err;
  }
};

const estimateTokens = (text) => Math.max(1, Math.ceil(String(text || "").length / 4));
const hashPrompt = (text) => crypto.createHash("sha256").update(String(text || "")).digest("hex");

const assertAiRateAndBudget = async (userId) => {
  const uid = toId(userId);
  const now = Date.now();
  const windowStart = now - governanceConfig.rateWindowMs;
  const timestamps = (inMemoryRateWindow.get(uid) || []).filter((t) => t > windowStart);

  if (timestamps.length >= governanceConfig.rateMaxRequests) {
    throw new AppError(
      "AI request rate limit exceeded for your account; please try again later",
      "AI_RATE_LIMITED",
      429
    );
  }

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const [usage] = await AiAuditLog.aggregate([
    {
      $match: {
        actorUserId: new AiAuditLog.base.Types.ObjectId(uid),
        createdAt: { $gte: startOfDay },
      },
    },
    { $group: { _id: null, totalTokens: { $sum: "$totalTokens" } } },
  ]);
  const usedToday = usage ? usage.totalTokens : 0;
  if (usedToday >= governanceConfig.dailyTokenBudgetPerUser) {
    throw new AppError(
      "Daily AI token budget exceeded for your account",
      "AI_BUDGET_EXCEEDED",
      429
    );
  }

  timestamps.push(now);
  inMemoryRateWindow.set(uid, timestamps);
  return { usedToday, remainingTokens: Math.max(0, governanceConfig.dailyTokenBudgetPerUser - usedToday) };
};

const writeAiAudit = async (payload) => {
  try {
    const doc = await AiAuditLog.create({
      requestId: `AI-${crypto.randomUUID()}`,
      ...payload,
    });
    return doc;
  } catch (err) {
    console.error("Failed to write AiAuditLog:", err.message);
    return null;
  }
};

const invokeAdapterWithTimeout = async (adapter, payload) => {
  let timerId = null;
  const controller = new AbortController();
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      controller.abort();
      reject(new AppError("AI provider request timed out", "AI_PROVIDER_TIMEOUT", 504));
    }, governanceConfig.timeoutMs);
  });

  try {
    return await Promise.race([
      Promise.resolve(adapter.generate({ ...payload, signal: controller.signal })),
      timeoutPromise,
    ]);
  } finally {
    if (timerId) clearTimeout(timerId);
  }
};

/**
 * Central AI orchestration & safety boundary.
 * All AI use cases (AI-01..04) MUST route through this engine.
 */
const executeGovernedAi = async ({
  actorUser,
  featureCode,
  operation,
  targetType = null,
  targetId = null,
  userPrompt = "",
  systemPrompt = "",
  contextData = {},
  forbiddenOutputValues = [],
  requireNumericGrounding = false,
  fallbackHandler = null,
  metadata = {},
}) => {
  const startedAt = Date.now();
  if (userPrompt !== undefined && userPrompt !== null && typeof userPrompt !== "string") {
    throw validationError("prompt must be a string");
  }
  const trimmedPrompt = typeof userPrompt === "string" ? userPrompt.trim() : "";
  if (trimmedPrompt.length > governanceConfig.maxInputChars) {
    throw validationError(`prompt exceeds maximum length of ${governanceConfig.maxInputChars} characters`);
  }

  // 1. Prompt injection guard BEFORE any rate/provider execution
  if (detectPromptInjection(trimmedPrompt)) {
    const promptHash = hashPrompt(trimmedPrompt);
    await writeAiAudit({
      featureCode,
      operation,
      actorUserId: actorUser.id,
      actorRole: actorUser.role,
      targetType,
      targetId,
      providerId: registeredAiAdapter ? registeredAiAdapter.providerId : "NONE",
      modelId: registeredAiAdapter ? registeredAiAdapter.modelId : "NONE",
      outcome: "REJECTED",
      errorCode: "PROMPT_INJECTION_DETECTED",
      promptHash,
      promptInjectionBlocked: true,
      latencyMs: Date.now() - startedAt,
      metadata,
    });
    throw new AppError(
      "Input contains disallowed instruction-override or data-exfiltration patterns",
      "PROMPT_INJECTION_DETECTED",
      400
    );
  }

  // 2. PII Redaction on both user prompt & context payload
  const promptRedacted = redactPiiText(trimmedPrompt);
  const contextSanitized = sanitizeContextData(contextData);
  const totalRedactions = promptRedacted.redactionCount + contextSanitized.redactionCount;
  const serializedInput = `${promptRedacted.text}\n${JSON.stringify(contextSanitized.sanitized)}`;
  const promptHash = hashPrompt(serializedInput);
  const estInputTokens = estimateTokens(serializedInput);

  // 3. Fail-Closed AI Provider Readiness Gate BEFORE consuming user rate/token quota
  // Ensures deterministic fallbacks (AI-01) and 503 AI_PROVIDER_BLOCKED (AI-02..04) waste ZERO AI quota.
  const status = getAiProviderStatus();
  if (!registeredAiAdapter) {
    if (typeof fallbackHandler === "function") {
      const fallbackResult = await fallbackHandler({ blockerStatus: status, sanitizedContext: contextSanitized.sanitized });
      const auditDoc = await writeAiAudit({
        featureCode,
        operation,
        actorUserId: actorUser.id,
        actorRole: actorUser.role,
        targetType,
        targetId,
        providerId: "NONE",
        modelId: "NONE",
        outcome: "FALLBACK",
        fallbackUsed: true,
        errorCode: "AI_PROVIDER_BLOCKED",
        promptHash,
        piiRedactionCount: totalRedactions,
        latencyMs: Date.now() - startedAt,
        metadata: { ...metadata, blockers: status.blockers },
      });
      return {
        aiUsed: false,
        mode: "DETERMINISTIC_FALLBACK",
        providerStatus: "BLOCKED",
        blockers: status.blockers,
        auditLogId: auditDoc ? toId(auditDoc._id) : null,
        result: fallbackResult,
      };
    }

    await writeAiAudit({
      featureCode,
      operation,
      actorUserId: actorUser.id,
      actorRole: actorUser.role,
      targetType,
      targetId,
      providerId: "NONE",
      modelId: "NONE",
      outcome: "BLOCKED",
      errorCode: "AI_PROVIDER_BLOCKED",
      promptHash,
      piiRedactionCount: totalRedactions,
      latencyMs: Date.now() - startedAt,
      metadata: { ...metadata, blockers: status.blockers },
    });

    const err = new AppError(
      "AI generation is currently BLOCKED: no approved AI provider, credentials, consent policy, or budget decision is configured",
      "AI_PROVIDER_BLOCKED",
      503
    );
    err.details = {
      featureCode,
      blockers: status.blockers,
      aid08ConsentReady: status.aid08ConsentReady,
    };
    throw err;
  }

  // 4. Per-user rate limit & daily token budget (only when invoking a configured provider adapter)
  try {
    await assertAiRateAndBudget(actorUser.id);
  } catch (rateErr) {
    await writeAiAudit({
      featureCode,
      operation,
      actorUserId: actorUser.id,
      actorRole: actorUser.role,
      targetType,
      targetId,
      providerId: registeredAiAdapter ? registeredAiAdapter.providerId : "NONE",
      modelId: registeredAiAdapter ? registeredAiAdapter.modelId : "NONE",
      outcome: "BLOCKED",
      errorCode: rateErr.code || "AI_RATE_LIMITED",
      promptHash,
      piiRedactionCount: totalRedactions,
      latencyMs: Date.now() - startedAt,
      metadata,
    });
    throw rateErr;
  }

  // 5. Execute adapter with bounded retry & timeout
  let adapterResponse = null;
  let lastError = null;
  const maxAttempts = 1 + Math.max(0, governanceConfig.maxRetries);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      adapterResponse = await invokeAdapterWithTimeout(registeredAiAdapter, {
        featureCode,
        operation,
        systemPrompt,
        userPrompt: promptRedacted.text,
        contextData: contextSanitized.sanitized,
        maxOutputTokens: governanceConfig.maxOutputTokens,
      });
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      const retryable = err.code === "AI_PROVIDER_TIMEOUT" || err.retryable === true;
      if (!retryable || attempt >= maxAttempts) break;
    }
  }

  if (lastError) {
    if (typeof fallbackHandler === "function") {
      const fallbackResult = await fallbackHandler({
        blockerStatus: { status: "DEGRADED_FALLBACK", blockers: [lastError.code || "AI_PROVIDER_FAILED"] },
        sanitizedContext: contextSanitized.sanitized,
      });
      const auditDoc = await writeAiAudit({
        featureCode,
        operation,
        actorUserId: actorUser.id,
        actorRole: actorUser.role,
        targetType,
        targetId,
        providerId: registeredAiAdapter.providerId,
        modelId: registeredAiAdapter.modelId,
        outcome: "FALLBACK",
        fallbackUsed: true,
        errorCode: lastError.code || "AI_PROVIDER_FAILED",
        promptHash,
        piiRedactionCount: totalRedactions,
        latencyMs: Date.now() - startedAt,
        metadata: { ...metadata, errorMessage: lastError.message },
      });
      return {
        aiUsed: false,
        mode: "DETERMINISTIC_FALLBACK",
        providerStatus: "DEGRADED_FALLBACK",
        blockers: [lastError.code || "AI_PROVIDER_FAILED"],
        auditLogId: auditDoc ? toId(auditDoc._id) : null,
        result: fallbackResult,
      };
    }

    const code = lastError.code === "AI_PROVIDER_TIMEOUT" ? "AI_PROVIDER_TIMEOUT" : "AI_PROVIDER_FAILED";
    const statusCode = lastError.statusCode || (code === "AI_PROVIDER_TIMEOUT" ? 504 : 502);
    await writeAiAudit({
      featureCode,
      operation,
      actorUserId: actorUser.id,
      actorRole: actorUser.role,
      targetType,
      targetId,
      providerId: registeredAiAdapter.providerId,
      modelId: registeredAiAdapter.modelId,
      outcome: "FAILED",
      errorCode: code,
      promptHash,
      piiRedactionCount: totalRedactions,
      latencyMs: Date.now() - startedAt,
      metadata: { ...metadata, errorMessage: lastError.message },
    });
    throw new AppError(lastError.message || "AI provider failed", code, statusCode);
  }

  // 6. Post-Output Security Guards (PII Leak Check + Numeric Grounding)
  const rawOutputText =
    typeof adapterResponse === "string"
      ? adapterResponse
      : adapterResponse?.text || JSON.stringify(adapterResponse?.data ?? adapterResponse ?? "");

  const piiLeak = detectPiiLeak(rawOutputText, forbiddenOutputValues);
  if (piiLeak) {
    await writeAiAudit({
      featureCode,
      operation,
      actorUserId: actorUser.id,
      actorRole: actorUser.role,
      targetType,
      targetId,
      providerId: registeredAiAdapter.providerId,
      modelId: registeredAiAdapter.modelId,
      outcome: "REJECTED",
      errorCode: "AI_OUTPUT_PII_LEAK_BLOCKED",
      promptHash,
      piiRedactionCount: totalRedactions,
      latencyMs: Date.now() - startedAt,
      metadata: { ...metadata, leakType: piiLeak },
    });
    throw new AppError(
      `AI response blocked because it contained sensitive or personal data (${piiLeak})`,
      "AI_OUTPUT_PII_LEAK_BLOCKED",
      502
    );
  }

  if (requireNumericGrounding) {
    try {
      assertNumericGrounding(rawOutputText, contextSanitized.sanitized);
    } catch (groundErr) {
      await writeAiAudit({
        featureCode,
        operation,
        actorUserId: actorUser.id,
        actorRole: actorUser.role,
        targetType,
        targetId,
        providerId: registeredAiAdapter.providerId,
        modelId: registeredAiAdapter.modelId,
        outcome: "REJECTED",
        errorCode: "AI_OUTPUT_UNGROUNDED",
        promptHash,
        piiRedactionCount: totalRedactions,
        latencyMs: Date.now() - startedAt,
        metadata: { ...metadata, ungrounded: groundErr.details?.ungroundedNumbers || [] },
      });
      throw groundErr;
    }
  }

  const estOutputTokens = estimateTokens(rawOutputText);
  const totalTokens = estInputTokens + estOutputTokens;

  const auditDoc = await writeAiAudit({
    featureCode,
    operation,
    actorUserId: actorUser.id,
    actorRole: actorUser.role,
    targetType,
    targetId,
    providerId: registeredAiAdapter.providerId,
    modelId: registeredAiAdapter.modelId,
    outcome: "SUCCESS",
    fallbackUsed: false,
    promptHash,
    piiRedactionCount: totalRedactions,
    latencyMs: Date.now() - startedAt,
    estimatedInputTokens: estInputTokens,
    estimatedOutputTokens: estOutputTokens,
    totalTokens,
    metadata: { ...metadata, isTestMock: registeredAiAdapter.isTestMock },
  });

  return {
    aiUsed: true,
    mode: "AI_GENERATED",
    providerStatus: "READY",
    providerId: registeredAiAdapter.providerId,
    modelId: registeredAiAdapter.modelId,
    isTestMock: registeredAiAdapter.isTestMock,
    auditLogId: auditDoc ? toId(auditDoc._id) : null,
    tokenUsage: { estimatedInputTokens: estInputTokens, estimatedOutputTokens: estOutputTokens, totalTokens },
    result: adapterResponse,
  };
};

const adminListAiAuditLogs = async (query = {}, paging) => {
  const filter = {};
  const featureCode = assertQueryEnum(query.featureCode, AI_TASK_TYPES, "featureCode");
  if (featureCode) filter.featureCode = featureCode;
  const outcome = assertQueryEnum(query.outcome, AI_AUDIT_OUTCOMES, "outcome");
  if (outcome) filter.outcome = outcome;
  const actorRole = assertQueryEnum(query.actorRole, ALLOWED_AI_ACTOR_ROLES, "actorRole");
  if (actorRole) filter.actorRole = actorRole;

  const [items, total] = await Promise.all([
    AiAuditLog.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.pageSize).lean(),
    AiAuditLog.countDocuments(filter),
  ]);
  return paged(
    items.map((doc) => ({ ...doc, id: toId(doc._id) })),
    total,
    paging
  );
};

module.exports = {
  setAiProviderAdapter,
  resetAiProviderAdapter,
  setAiGovernanceConfig,
  resetAiGovernanceConfig,
  getAiProviderStatus,
  detectPromptInjection,
  redactPiiText,
  sanitizeContextData,
  detectPiiLeak,
  assertNumericGrounding,
  executeGovernedAi,
  adminListAiAuditLogs,
};

