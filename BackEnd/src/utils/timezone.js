const { validationError } = require("./http");

const DEFAULT_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Ho_Chi_Minh";
const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NAIVE_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
const EXPLICIT_TZ_RE = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;
const ISO_PREFIX_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]|$)/;

const formatterCache = new Map();

const getFormatter = (timeZone) => {
  if (!formatterCache.has(timeZone)) {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, fmt);
  }
  return formatterCache.get(timeZone);
};

const validateTimeZone = (timeZone) => {
  const tz =
    timeZone === undefined || timeZone === null || String(timeZone).trim() === ""
      ? DEFAULT_TIMEZONE
      : String(timeZone).trim();
  try {
    getFormatter(tz);
    return tz;
  } catch {
    throw validationError(`Unsupported timezone: ${tz}`);
  }
};

const assertValidCalendarParts = (year, month, day, hour = 0, minute = 0, second = 0, field = "date") => {
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    throw validationError(`${field} is not a valid date`);
  }
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw validationError(`${field} is not a valid calendar date`);
  }
};

const getZonedParts = (date, timeZone = DEFAULT_TIMEZONE) => {
  const tz = validateTimeZone(timeZone);
  const parts = getFormatter(tz).formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = Number(part.value);
  }
  const hour = map.hour === 24 ? 0 : map.hour;
  const dayOfWeek = new Date(Date.UTC(map.year, map.month - 1, map.day)).getUTCDay();
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour,
    minute: map.minute,
    second: map.second,
    dayOfWeek,
  };
};

const getTimeZoneOffsetMs = (date, timeZone = DEFAULT_TIMEZONE) => {
  const parts = getZonedParts(date, timeZone);
  const shownAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    date.getUTCMilliseconds()
  );
  return shownAsUtc - date.getTime();
};

const zonedWallTimeToUtc = ({ year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0 }, timeZone = DEFAULT_TIMEZONE) => {
  const tz = validateTimeZone(timeZone);
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const offset1 = getTimeZoneOffsetMs(new Date(guess), tz);
  let utcMs = guess - offset1;
  const offset2 = getTimeZoneOffsetMs(new Date(utcMs), tz);
  if (offset2 !== offset1) {
    utcMs = guess - offset2;
  }
  return new Date(utcMs);
};

/**
 * Parses a datetime input into a UTC Date.
 * - Explicit ISO timestamps with Z or ±HH:MM preserve their exact UTC instant.
 * - Naive ISO datetimes or YYYY-MM-DD dates (without timezone suffix) are interpreted
 *   in the specified IANA timezone (default: Asia/Ho_Chi_Minh) so server OS TZ never leaks.
 */
const parseDateTimeInZone = (value, field = "datetime", timeZone = DEFAULT_TIMEZONE) => {
  if (value === null || value === undefined || value === "") return null;
  const tz = validateTimeZone(timeZone);

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw validationError(`${field} is not a valid date`);
    return new Date(value.getTime());
  }

  if (typeof value === "number") {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw validationError(`${field} is not a valid date`);
    return parsed;
  }

  if (typeof value !== "string") {
    throw validationError(`${field} is not a valid date`);
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (!EXPLICIT_TZ_RE.test(trimmed)) {
    const dateOnlyMatch = DATE_ONLY_RE.exec(trimmed);
    if (dateOnlyMatch) {
      const year = Number(dateOnlyMatch[1]);
      const month = Number(dateOnlyMatch[2]);
      const day = Number(dateOnlyMatch[3]);
      assertValidCalendarParts(year, month, day, 0, 0, 0, field);
      return zonedWallTimeToUtc({ year, month, day, hour: 0, minute: 0, second: 0, millisecond: 0 }, tz);
    }

    const naiveMatch = NAIVE_DATETIME_RE.exec(trimmed);
    if (naiveMatch) {
      const year = Number(naiveMatch[1]);
      const month = Number(naiveMatch[2]);
      const day = Number(naiveMatch[3]);
      const hour = Number(naiveMatch[4]);
      const minute = Number(naiveMatch[5]);
      const second = naiveMatch[6] ? Number(naiveMatch[6]) : 0;
      const millisecond = naiveMatch[7] ? Number(naiveMatch[7].padEnd(3, "0")) : 0;
      assertValidCalendarParts(year, month, day, hour, minute, second, field);
      return zonedWallTimeToUtc({ year, month, day, hour, minute, second, millisecond }, tz);
    }
  } else {
    const prefix = ISO_PREFIX_RE.exec(trimmed);
    if (prefix) {
      assertValidCalendarParts(Number(prefix[1]), Number(prefix[2]), Number(prefix[3]), 0, 0, 0, field);
    }
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw validationError(`${field} is not a valid date`);
  }
  return parsed;
};

const addCalendarDays = ({ year, month, day }, deltaDays = 1) => {
  const next = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
    dayOfWeek: next.getUTCDay(),
  };
};

const compareCalendarDay = (a, b) => {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
};

/**
 * Computes UTC session occurrences from a Class's recurring schedule in the target IANA timezone.
 * Respects startDate lower bound, BR-32 endDate inclusive calendar day, and optional sub-window bounds.
 */
const computePlannedOccurrences = (cls, options = {}) => {
  const {
    timeZone = DEFAULT_TIMEZONE,
    fromDate = null,
    untilDate = null,
    maxOccurrences = 366,
  } = options;

  const tz = validateTimeZone(timeZone);
  if (!cls || !cls.startDate || !cls.endDate || !Array.isArray(cls.schedule) || cls.schedule.length === 0) {
    throw validationError("startDate, endDate and schedule are required to plan sessions");
  }

  const classStart = new Date(cls.startDate);
  const classEnd = new Date(cls.endDate);
  if (Number.isNaN(classStart.getTime()) || Number.isNaN(classEnd.getTime())) {
    throw validationError("Class startDate and endDate must be valid dates");
  }

  const fromInstant = fromDate ? parseDateTimeInZone(fromDate, "fromDate", tz) : null;
  const untilInstant = untilDate ? parseDateTimeInZone(untilDate, "untilDate", tz) : null;

  const startDay = getZonedParts(classStart, tz);
  const endDay = getZonedParts(classEnd, tz);
  const occurrences = [];

  for (
    let cursor = { year: startDay.year, month: startDay.month, day: startDay.day, dayOfWeek: startDay.dayOfWeek };
    compareCalendarDay(cursor, endDay) <= 0;
    cursor = addCalendarDays(cursor, 1)
  ) {
    for (const entry of cls.schedule) {
      if (entry.dayOfWeek !== cursor.dayOfWeek) continue;
      const [startH, startM] = String(entry.startTime).split(":").map(Number);
      const [endH, endM] = String(entry.endTime).split(":").map(Number);
      const startDatetime = zonedWallTimeToUtc(
        { year: cursor.year, month: cursor.month, day: cursor.day, hour: startH, minute: startM, second: 0, millisecond: 0 },
        tz
      );
      const endDatetime = zonedWallTimeToUtc(
        { year: cursor.year, month: cursor.month, day: cursor.day, hour: endH, minute: endM, second: 0, millisecond: 0 },
        tz
      );

      // Respect lower/upper instant bounds (BR-32 inclusive endDate day; no pre-startDate session emission)
      if (startDatetime < classStart) continue;
      if (endDatetime.getTime() > classEnd.getTime() + DAY_MS) continue;
      if (fromInstant && startDatetime < fromInstant) continue;
      if (untilInstant && endDatetime > untilInstant) continue;

      occurrences.push({
        dayOfWeek: cursor.dayOfWeek,
        startDatetime,
        endDatetime,
        timezone: tz,
      });

      if (occurrences.length > maxOccurrences) {
        throw validationError(`Planned schedule exceeds maximum allowed batch size (${maxOccurrences})`);
      }
    }
  }

  occurrences.sort((a, b) => a.startDatetime - b.startDatetime);
  return occurrences;
};

module.exports = {
  DEFAULT_TIMEZONE,
  DAY_MS,
  validateTimeZone,
  getZonedParts,
  zonedWallTimeToUtc,
  parseDateTimeInZone,
  computePlannedOccurrences,
};

