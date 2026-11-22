import type { FormRule } from "antd";
import type { Dayjs } from "dayjs";
import type { ScheduleEntry } from "../types/class";

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
