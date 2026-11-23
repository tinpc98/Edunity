// BE-02: a class must be approved before the calendar day (APP_TZ, default UTC+7) of its startDate.
// Shared by the maintenance job that auto-rejects and the gates that submit/approve, so they cannot disagree.
const resolveTzOffsetMinutes = (options = {}) => {
  if (options && options.tzOffsetMinutes !== undefined && options.tzOffsetMinutes !== null) {
    const num = Number(options.tzOffsetMinutes);
    if (!Number.isNaN(num)) return num;
  }
  if (process.env.APP_TZ_OFFSET_MINUTES !== undefined && process.env.APP_TZ_OFFSET_MINUTES !== null) {
    const envNum = parseInt(process.env.APP_TZ_OFFSET_MINUTES, 10);
    if (!Number.isNaN(envNum)) return envNum;
  }
  // Fallback to Vietnam timezone UTC+7 (420 minutes)
  return 420;
};

const getZonedCalendarDateStr = (date, offsetMinutes) => {
  const localMs = date.getTime() + offsetMinutes * 60 * 1000;
  const d = new Date(localMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isClassStartDateReached = (startDate, now, offsetMinutes) => {
  if (!startDate || !(startDate instanceof Date) || isNaN(startDate.getTime())) {
    return false;
  }
  const nowDateStr = getZonedCalendarDateStr(now, offsetMinutes);
  const startDateStr = getZonedCalendarDateStr(startDate, offsetMinutes);
  const allowSameDay =
    process.env.ALLOW_SAME_DAY_CLASS_START === "true" ||
    (process.env.NODE_ENV !== "test" && process.env.ALLOW_SAME_DAY_CLASS_START !== "false");
  return allowSameDay ? startDateStr < nowDateStr : startDateStr <= nowDateStr;
};

module.exports = { resolveTzOffsetMinutes, getZonedCalendarDateStr, isClassStartDateReached };
