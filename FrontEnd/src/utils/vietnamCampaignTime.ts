import dayjs, { type Dayjs } from "dayjs";

const VIETNAM_OFFSET_HOURS = 7;

/** Convert a calendar date selected in the UI to its UTC+7 boundary. */
export const toVietnamCampaignBoundary = (value: Dayjs | null | undefined, endOfDay = false): string | null => {
  if (!value?.isValid()) return null;
  const hour = endOfDay ? 16 : -VIETNAM_OFFSET_HOURS;
  return new Date(Date.UTC(
    value.year(),
    value.month(),
    value.date(),
    hour,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  )).toISOString();
};

/** Display an ISO timestamp as its Vietnam calendar date, independent of browser timezone. */
export const fromVietnamCampaignTimestamp = (value: string | Date | null | undefined): Dayjs | null => {
  if (!value) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  return year && month && day ? dayjs(`${year}-${month}-${day}`) : null;
};
