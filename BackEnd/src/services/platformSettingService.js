const mongoose = require("mongoose");
const { PlatformSetting, AuditLog } = require("../models");
const { AppError } = require("../utils/errors");
const { validationError, parseDate, parsePaging, paged } = require("../utils/http");

const SETTING_DEFINITIONS = Object.freeze({
  SEAT_HOLD_MINUTES: {
    key: "SEAT_HOLD_MINUTES",
    valueType: "INTEGER",
    envVar: "SEAT_HOLD_MINUTES",
    defaultValue: 15,
    min: 1,
    max: 1440,
    description: "Seat reservation hold duration in minutes",
  },
  COMMISSION_RATE: {
    key: "COMMISSION_RATE",
    valueType: "NUMBER",
    envVar: "COMMISSION_RATE",
    defaultValue: 0.1,
    min: 0,
    max: 0.5,
    description: "Platform commission rate charged on paid enrollments (0 to 0.5)",
  },
  SCHOLARSHIP_VALID_DAYS: {
    key: "SCHOLARSHIP_VALID_DAYS",
    valueType: "INTEGER",
    envVar: "SCHOLARSHIP_VALID_DAYS",
    defaultValue: 180,
    min: 1,
    max: 3650,
    description: "Default validity window in days for newly issued scholarships",
  },
  RECORDING_RETENTION_DAYS: {
    key: "RECORDING_RETENTION_DAYS",
    valueType: "INTEGER",
    envVar: "RECORDING_RETENTION_DAYS",
    defaultValue: 90,
    min: 1,
    max: 1095,
    description: "Number of days session recordings remain downloadable before retention expiry",
  },
  RECORDING_PROCESSING_TIMEOUT_HOURS: {
    key: "RECORDING_PROCESSING_TIMEOUT_HOURS",
    valueType: "INTEGER",
    envVar: "RECORDING_PROCESSING_TIMEOUT_HOURS",
    defaultValue: 6,
    min: 1,
    max: 168,
    description: "Hours before a recording stuck in PROCESSING is marked FAILED",
  },
  TEACHER_BRIEF_PRESENCE_MIN_SECONDS: {
    key: "TEACHER_BRIEF_PRESENCE_MIN_SECONDS",
    valueType: "INTEGER",
    envVar: "TEACHER_BRIEF_PRESENCE_MIN_SECONDS",
    defaultValue: 300,
    min: 0,
    max: 3600,
    description: "Minimum teacher presence duration (seconds) before brief-presence flagging",
  },
  ATTENDANCE_THRESHOLD_PERCENT: {
    key: "ATTENDANCE_THRESHOLD_PERCENT",
    valueType: "NUMBER",
    envVar: "ATTENDANCE_THRESHOLD_PERCENT",
    defaultValue: 70,
    min: 0,
    max: 100,
    description: "Minimum attendance percentage required to mark a student PRESENT or LATE",
  },
});

const ALIAS_KEYS = Object.freeze({
  SEAT_HOLD_DURATION: "SEAT_HOLD_MINUTES",
});

// Map<settingKey, Array<{ version, value, effectiveFrom, status, description, changeReason, updatedAt }>>
const settingsCache = new Map();
let refreshPromise = null;

const normalizeKey = (rawKey) => String(rawKey || "").trim().toUpperCase();

const parseNumericValue = (raw, valueType) => {
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
    return undefined;
  }
  if (typeof raw === "boolean") return undefined;
  const num = Number(raw);
  if (!Number.isFinite(num)) return undefined;
  if (valueType === "INTEGER" && !Number.isInteger(num)) return undefined;
  return num;
};

const readEnvFallback = (def) => {
  if (!def) return undefined;
  const raw = def.envVar ? process.env[def.envVar] : undefined;
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return def.defaultValue;
  }
  const parsed = parseNumericValue(raw, def.valueType);
  if (parsed === undefined) return def.defaultValue;
  if (def.min !== undefined && parsed < def.min) return def.defaultValue;
  if (def.max !== undefined && parsed > def.max) return def.defaultValue;
  return parsed;
};

const pickEffectiveCachedRecord = (key, now = new Date()) => {
  const entries = settingsCache.get(key);
  if (!entries || entries.length === 0) return null;
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();

  let best = null;
  for (const item of entries) {
    if (item.status !== "ACTIVE") continue;
    const effMs = new Date(item.effectiveFrom).getTime();
    if (!Number.isFinite(effMs) || effMs > nowMs) continue;
    if (
      !best ||
      effMs > new Date(best.effectiveFrom).getTime() ||
      (effMs === new Date(best.effectiveFrom).getTime() && item.version > best.version)
    ) {
      best = item;
    }
  }
  return best;
};

const clearCache = () => {
  settingsCache.clear();
};

const warmCache = async () => {
  if (mongoose.connection.readyState !== 1) return;
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const docs = await PlatformSetting.find({ status: "ACTIVE" })
        .sort({ key: 1, effectiveFrom: -1, version: -1 })
        .lean();
      const nextMap = new Map();
      for (const doc of docs) {
        const list = nextMap.get(doc.key) || [];
        list.push(doc);
        nextMap.set(doc.key, list);
      }
      settingsCache.clear();
      for (const [k, v] of nextMap.entries()) {
        settingsCache.set(k, v);
      }
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

const refreshKeyCache = async (key) => {
  const normalized = normalizeKey(key);
  if (mongoose.connection.readyState !== 1) {
    settingsCache.delete(normalized);
    return;
  }
  const docs = await PlatformSetting.find({ key: normalized, status: "ACTIVE" })
    .sort({ effectiveFrom: -1, version: -1 })
    .lean();
  if (docs.length > 0) {
    settingsCache.set(normalized, docs);
  } else {
    settingsCache.delete(normalized);
  }
};

// Keep synchronous cache in sync when PlatformSetting is mutated directly via Mongoose
PlatformSetting.registerCacheListener(() => {
  if (mongoose.connection.readyState === 1) {
    warmCache().catch(() => {});
  }
});

/**
 * Synchronous accessor preserved for existing TIN/payment/enrollment/scholarship/settlement callers.
 * Zero values (e.g., COMMISSION_RATE = 0) are respected faithfully without `||` falsy fallback bugs.
 */
const getEffectiveSettingSync = (rawKey, now = new Date()) => {
  const key = normalizeKey(rawKey);
  if (key === "SEAT_HOLD_DURATION") {
    const minutes = getEffectiveSettingSync("SEAT_HOLD_MINUTES", now);
    return minutes * 60 * 1000;
  }

  const def = SETTING_DEFINITIONS[key];
  const cached = pickEffectiveCachedRecord(key, now);
  if (cached && cached.value !== undefined && cached.value !== null) {
    return cached.value;
  }
  if (!def) return undefined;
  return readEnvFallback(def);
};

const getSettingMetaSync = (rawKey, now = new Date()) => {
  const key = normalizeKey(rawKey);
  const canonicalKey = ALIAS_KEYS[key] || key;
  const def = SETTING_DEFINITIONS[canonicalKey];
  if (!def) return null;

  const cached = pickEffectiveCachedRecord(canonicalKey, now);
  const envRaw = def.envVar ? process.env[def.envVar] : undefined;
  const envVal = parseNumericValue(envRaw, def.valueType);
  const hasValidEnv =
    envVal !== undefined &&
    (def.min === undefined || envVal >= def.min) &&
    (def.max === undefined || envVal <= def.max);

  let effectiveValue = def.defaultValue;
  let source = "DEFAULT";
  if (cached && cached.value !== undefined && cached.value !== null) {
    effectiveValue = cached.value;
    source = "DB";
  } else if (hasValidEnv) {
    effectiveValue = envVal;
    source = "ENV";
  }

  const allActive = settingsCache.get(canonicalKey) || [];
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const scheduledNext = allActive
    .filter((item) => new Date(item.effectiveFrom).getTime() > nowMs)
    .sort((a, b) => new Date(a.effectiveFrom).getTime() - new Date(b.effectiveFrom).getTime())[0] || null;

  return {
    key: canonicalKey,
    value: effectiveValue,
    valueType: def.valueType,
    source,
    activeVersion: cached ? cached.version : null,
    effectiveFrom: cached ? cached.effectiveFrom : null,
    description: cached?.description || def.description,
    constraints: { min: def.min, max: def.max },
    defaultValue: def.defaultValue,
    envVar: def.envVar,
    scheduledNext: scheduledNext
      ? {
          version: scheduledNext.version,
          value: scheduledNext.value,
          effectiveFrom: scheduledNext.effectiveFrom,
        }
      : null,
  };
};

const assertValidSettingKey = (rawKey) => {
  const key = normalizeKey(rawKey);
  if (!SETTING_DEFINITIONS[key]) {
    throw new AppError(
      `Unknown or non-configurable platform setting key "${key}"`,
      "SETTING_KEY_NOT_FOUND",
      404
    );
  }
  return SETTING_DEFINITIONS[key];
};

const validateSettingValue = (def, rawValue) => {
  if (rawValue === undefined || rawValue === null) {
    throw validationError(`Setting "${def.key}" value is required`);
  }

  if (def.valueType === "INTEGER" || def.valueType === "NUMBER") {
    const parsed = parseNumericValue(rawValue, def.valueType);
    if (parsed === undefined) {
      throw validationError(
        `Setting "${def.key}" must be a valid ${def.valueType === "INTEGER" ? "integer" : "number"}`
      );
    }
    if (def.min !== undefined && parsed < def.min) {
      throw validationError(`Setting "${def.key}" must be >= ${def.min}`);
    }
    if (def.max !== undefined && parsed > def.max) {
      throw validationError(`Setting "${def.key}" must be <= ${def.max}`);
    }
    return parsed;
  }

  if (def.valueType === "BOOLEAN") {
    if (typeof rawValue !== "boolean") {
      throw validationError(`Setting "${def.key}" must be a boolean`);
    }
    return rawValue;
  }

  return String(rawValue);
};

const getEffectiveSetting = async (rawKey, now = new Date()) => {
  const key = normalizeKey(rawKey);
  if (key === "SEAT_HOLD_DURATION") {
    const minutesMeta = await getEffectiveSetting("SEAT_HOLD_MINUTES", now);
    return {
      ...minutesMeta,
      key: "SEAT_HOLD_DURATION",
      derivedFrom: "SEAT_HOLD_MINUTES",
      value: minutesMeta.value * 60 * 1000,
    };
  }

  const def = assertValidSettingKey(key);
  await refreshKeyCache(def.key);
  return getSettingMetaSync(def.key, now);
};

const listSettings = async (now = new Date()) => {
  await warmCache();
  return {
    items: Object.keys(SETTING_DEFINITIONS).map((key) => getSettingMetaSync(key, now)),
    derived: {
      SEAT_HOLD_DURATION: getEffectiveSettingSync("SEAT_HOLD_DURATION", now),
    },
  };
};

const getSettingHistory = async (rawKey, pagingInput = {}) => {
  const def = assertValidSettingKey(rawKey);
  const { page, pageSize, skip } = parsePaging(pagingInput);
  await refreshKeyCache(def.key);

  const [items, total] = await Promise.all([
    PlatformSetting.find({ key: def.key })
      .sort({ version: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    PlatformSetting.countDocuments({ key: def.key }),
  ]);

  return {
    current: getSettingMetaSync(def.key),
    history: paged(items, total, { page, pageSize }),
  };
};

const upsertSettingVersion = async (adminId, rawKey, payload = {}) => {
  const def = assertValidSettingKey(rawKey);
  const parsedValue = validateSettingValue(def, payload.value);
  const now = new Date();
  const effectiveFrom = payload.effectiveFrom
    ? parseDate(payload.effectiveFrom, "effectiveFrom")
    : now;

  if (!effectiveFrom) {
    throw validationError("effectiveFrom must be a valid date");
  }

  const changeReason = payload.changeReason !== undefined ? String(payload.changeReason).trim() : "";
  const description = payload.description !== undefined ? String(payload.description).trim() : def.description;

  const beforeState = getSettingMetaSync(def.key, now);

  let createdDoc;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const latest = await PlatformSetting.findOne({ key: def.key })
        .sort({ version: -1 })
        .select("version")
        .session(session)
        .lean();

      const nextVersion = latest ? latest.version + 1 : 1;

      if (effectiveFrom.getTime() <= now.getTime()) {
        await PlatformSetting.updateMany(
          {
            key: def.key,
            status: "ACTIVE",
            effectiveFrom: { $lte: effectiveFrom },
          },
          { $set: { status: "SUPERSEDED", updatedBy: adminId } },
          { session }
        );
      }

      const [created] = await PlatformSetting.create(
        [
          {
            key: def.key,
            version: nextVersion,
            value: parsedValue,
            valueType: def.valueType,
            effectiveFrom,
            status: "ACTIVE",
            description,
            changeReason,
            createdBy: adminId,
            updatedBy: adminId,
          },
        ],
        { session }
      );
      createdDoc = created.toObject();

      await AuditLog.create(
        [
          {
            actorAdminId: adminId,
            action: "PLATFORM_SETTING_UPDATED",
            targetType: "PlatformSetting",
            targetId: created._id,
            beforeState: {
              key: def.key,
              value: beforeState?.value,
              version: beforeState?.activeVersion,
              source: beforeState?.source,
            },
            afterState: {
              key: def.key,
              value: parsedValue,
              version: nextVersion,
              effectiveFrom,
              changeReason,
            },
          },
        ],
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  await refreshKeyCache(def.key);
  return {
    setting: createdDoc,
    current: getSettingMetaSync(def.key),
  };
};

const rollbackSetting = async (adminId, rawKey, payload = {}) => {
  const def = assertValidSettingKey(rawKey);
  const targetVersion = Number(payload.targetVersion);
  if (!Number.isInteger(targetVersion) || targetVersion < 1) {
    throw validationError("targetVersion must be a positive integer");
  }

  const targetDoc = await PlatformSetting.findOne({ key: def.key, version: targetVersion }).lean();
  if (!targetDoc) {
    throw new AppError(
      `Version ${targetVersion} not found for setting "${def.key}"`,
      "SETTING_VERSION_NOT_FOUND",
      404
    );
  }

  const now = new Date();
  await refreshKeyCache(def.key);
  const beforeState = getSettingMetaSync(def.key, now);
  const changeReason = payload.changeReason
    ? String(payload.changeReason).trim()
    : `Rollback to version ${targetVersion}`;

  let createdDoc;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const latest = await PlatformSetting.findOne({ key: def.key })
        .sort({ version: -1 })
        .select("version")
        .session(session)
        .lean();

      const nextVersion = latest ? latest.version + 1 : 1;

      await PlatformSetting.updateMany(
        {
          key: def.key,
          status: "ACTIVE",
          effectiveFrom: { $lte: now },
        },
        { $set: { status: "ROLLED_BACK", updatedBy: adminId } },
        { session }
      );

      const [created] = await PlatformSetting.create(
        [
          {
            key: def.key,
            version: nextVersion,
            value: targetDoc.value,
            valueType: def.valueType,
            effectiveFrom: now,
            status: "ACTIVE",
            description: targetDoc.description || def.description,
            changeReason,
            rolledBackFromVersion: beforeState?.activeVersion || latest?.version || null,
            rolledBackToVersion: targetVersion,
            createdBy: adminId,
            updatedBy: adminId,
          },
        ],
        { session }
      );
      createdDoc = created.toObject();

      await AuditLog.create(
        [
          {
            actorAdminId: adminId,
            action: "PLATFORM_SETTING_ROLLED_BACK",
            targetType: "PlatformSetting",
            targetId: created._id,
            beforeState: {
              key: def.key,
              value: beforeState?.value,
              version: beforeState?.activeVersion,
            },
            afterState: {
              key: def.key,
              value: targetDoc.value,
              version: nextVersion,
              rolledBackFromVersion: beforeState?.activeVersion || latest?.version || null,
              rolledBackToVersion: targetVersion,
              changeReason,
            },
          },
        ],
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  await refreshKeyCache(def.key);
  return {
    setting: createdDoc,
    current: getSettingMetaSync(def.key),
  };
};

module.exports = {
  SETTING_DEFINITIONS,
  warmCache,
  clearCache,
  refreshKeyCache,
  getEffectiveSettingSync,
  getEffectiveSetting,
  listSettings,
  getSettingHistory,
  upsertSettingVersion,
  rollbackSetting,
};

