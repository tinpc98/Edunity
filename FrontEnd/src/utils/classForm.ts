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

export const INVALID_SLOT_MESSAGE = "Giờ bắt đầu phải trước giờ kết thúc cho tất cả ca học.";

export const hasInvalidSlot = (schedule: ScheduleEntry[] = []) =>
  schedule.some((slot) => !slot.startTime || !slot.endTime || slot.startTime >= slot.endTime);

export const notBeforeField =
  (field: string, message: string): FormRule =>
  ({ getFieldValue }) => ({
    validator(_, value: Dayjs | null | undefined) {
      const start: Dayjs | null | undefined = getFieldValue(field);
      return value && start && value.isBefore(start) ? Promise.reject(new Error(message)) : Promise.resolve();
    },
  });
