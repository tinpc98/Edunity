import type { FormRule } from "antd";
import type { Dayjs } from "dayjs";
import type { ScheduleEntry } from "../types/class";

// Same limits as BackEnd classCreationGateService: tuition per student for the whole course
export const MIN_CLASS_PRICE = 1_000;
export const MAX_CLASS_PRICE = 5_000_000;

const priceLimits = `từ ${MIN_CLASS_PRICE.toLocaleString("vi-VN")}đ đến ${MAX_CLASS_PRICE.toLocaleString("vi-VN")}đ/học viên`;
export const CLASS_PRICE_HINT = `Học phí ${priceLimits}`;

// Reads "5000000", "5.000.000" and "5,000,000". Anything else is NaN: money is rejected, never guessed.
export const parsePrice = (value: unknown) => {
  const text = String(value ?? "").trim();
  return /^(\d+|\d{1,3}(\.\d{3})+|\d{1,3}(,\d{3})+)$/.test(text) ? Number(text.replace(/[.,]/g, "")) : NaN;
};

export const classPriceRule: FormRule = {
  validator: (_, value: unknown) => {
    const price = parsePrice(value);
    return Number.isInteger(price) && price >= MIN_CLASS_PRICE && price <= MAX_CLASS_PRICE
      ? Promise.resolve()
      : Promise.reject(new Error(`Học phí phải là số nguyên ${priceLimits}.`));
  },
};

export const INVALID_SLOT_MESSAGE = "Ca học chưa hợp lệ: giờ bắt đầu phải trước giờ kết thúc và các ca không được trùng giờ nhau.";

/** Why each weekly slot is invalid (null when it is fine): an empty or reversed time range, or a clash with another slot. */
export const slotErrors = (schedule: ScheduleEntry[] = []): (string | null)[] =>
  schedule.map((slot, index) => {
    if (!slot.startTime || !slot.endTime) return "Chọn đủ giờ bắt đầu và giờ kết thúc.";
    if (slot.startTime >= slot.endTime) return "Giờ bắt đầu phải trước giờ kết thúc.";
    const clash = schedule.findIndex(
      (other, j) =>
        j !== index &&
        other.dayOfWeek === slot.dayOfWeek &&
        Boolean(other.startTime && other.endTime) &&
        other.startTime < slot.endTime &&
        slot.startTime < other.endTime
    );
    return clash >= 0 ? `Trùng giờ với Ca ${clash + 1} trong cùng ngày.` : null;
  });

export const hasInvalidSlot = (schedule: ScheduleEntry[] = []) => slotErrors(schedule).some(Boolean);

export const notBeforeField =
  (field: string, message: string): FormRule =>
  ({ getFieldValue }) => ({
    validator(_, value: Dayjs | null | undefined) {
      const start: Dayjs | null | undefined = getFieldValue(field);
      // Whole days: the same day is allowed (e.g. a class starting on the last enrollment day)
      return value && start && value.isBefore(start, "day") ? Promise.reject(new Error(message)) : Promise.resolve();
    },
  });

/** What happened to a class's sessions after it was saved: they follow its weekly schedule and dates. */
export const sessionPlanNotice = (plan?: { generatedCount: number; error?: { code: string } }) => {
  if (!plan) return null;
  if (plan.error) {
    return {
      type: 'warning' as const,
      text:
        plan.error.code === 'SESSION_TIME_CONFLICT'
          ? 'Chưa tạo được buổi học: lịch học trùng giờ với buổi học của một lớp khác của bạn. Hãy đổi lịch học.'
          : 'Chưa tạo được buổi học theo lịch. Hãy kiểm tra lại lịch học, ngày khai giảng và ngày kết thúc.',
    };
  }
  return plan.generatedCount > 0
    ? { type: 'info' as const, text: `Đã tạo ${plan.generatedCount} buổi học theo lịch học.` }
    : null;
};

export interface PlannedSession {
  index: number;
  date: Dayjs;
  slot: ScheduleEntry;
}

export const MAX_CLASS_SESSIONS = 200;

/**
 * The first `count` sessions the weekly schedule yields from `startDate` on, in time order.
 * Mirrors the Backend planner: a slot already started today is skipped. Its last date is the class end date.
 */
export const planSessions = (startDate: Dayjs | null | undefined, schedule: ScheduleEntry[], count: number, now = new Date()) => {
  const sessions: PlannedSession[] = [];
  if (!startDate || !schedule.length || hasInvalidSlot(schedule) || !(count > 0)) return sessions;
  const target = Math.min(Math.floor(count), MAX_CLASS_SESSIONS);
  const slots = [...schedule].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (let day = startDate.startOf("day"); sessions.length < target; day = day.add(1, "day")) {
    for (const slot of slots) {
      if (slot.dayOfWeek !== day.day() || sessions.length >= target) continue;
      const [hour, minute] = slot.startTime.split(":").map(Number);
      if (day.hour(hour).minute(minute).toDate() <= now) continue;
      sessions.push({ index: sessions.length + 1, date: day, slot });
    }
  }
  return sessions;
};
