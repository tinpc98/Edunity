import type { ScheduleEntry } from "../types/classDiscovery";
import type { Enrollment } from "../types/enrollment";

export interface ScheduleConflict {
  conflictingClassName: string;
  dayOfWeek: number;
  dayLabel: string;
  existingTime: string;
  targetTime: string;
}

const DAY_LABELS: Record<number, string> = {
  0: "Chủ nhật",
  1: "Thứ 2",
  2: "Thứ 3",
  3: "Thứ 4",
  4: "Thứ 5",
  5: "Thứ 6",
  6: "Thứ 7",
};

/**
 * Converts "HH:mm" time string into total minutes from start of day.
 */
function timeToMinutes(tStr?: string): number | null {
  if (!tStr || typeof tStr !== "string") return null;
  const parts = tStr.trim().split(":").map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
  return parts[0] * 60 + parts[1];
}

/**
 * Checks if a target class's weekly schedule overlaps with any confirmed class
 * in the student's existing enrollments.
 *
 * Overlap requires ALL of:
 * 1. Course date ranges intersect (or are open/unspecified).
 * 2. Day of the week matches (e.g. both on Thứ 2).
 * 3. Time ranges intersect (start1 < end2 && start2 < end1).
 */
export function checkScheduleConflicts(
  targetClass: {
    startDate?: string;
    endDate?: string;
    schedule?: ScheduleEntry[];
  },
  existingEnrollments: Enrollment[]
): ScheduleConflict[] {
  if (!targetClass.schedule || !Array.isArray(targetClass.schedule) || targetClass.schedule.length === 0) {
    return [];
  }

  const targetStart = targetClass.startDate ? new Date(targetClass.startDate).getTime() : null;
  const targetEnd = targetClass.endDate ? new Date(targetClass.endDate).getTime() : null;

  const conflicts: ScheduleConflict[] = [];

  for (const enr of existingEnrollments) {
    // Only check active/confirmed enrollments
    if (!["CONFIRMED", "COMPLETED"].includes(enr.enrollmentStatus)) {
      continue;
    }

    const cls = enr.class;
    if (!cls || !cls.schedule || !Array.isArray(cls.schedule) || cls.schedule.length === 0) {
      continue;
    }

    // 1. Check course date range overlap if both have dates
    const exStart = cls.startDate ? new Date(cls.startDate).getTime() : null;
    const exEnd = cls.endDate ? new Date(cls.endDate).getTime() : null;

    if (targetStart && targetEnd && exStart && exEnd) {
      if (targetStart > exEnd || targetEnd < exStart) {
        continue; // Course terms do not overlap
      }
    }

    // 2 & 3. Check dayOfWeek and time overlap
    for (const tSlot of targetClass.schedule) {
      const tStartMin = timeToMinutes(tSlot.startTime);
      const tEndMin = timeToMinutes(tSlot.endTime);
      if (tStartMin === null || tEndMin === null) continue;

      for (const exSlot of cls.schedule) {
        if (Number(exSlot.dayOfWeek) !== Number(tSlot.dayOfWeek)) {
          continue; // Different days of week
        }

        const exStartMin = timeToMinutes(exSlot.startTime);
        const exEndMin = timeToMinutes(exSlot.endTime);
        if (exStartMin === null || exEndMin === null) continue;

        // Interval intersection condition: startA < endB && startB < endA
        if (tStartMin < exEndMin && exStartMin < tEndMin) {
          conflicts.push({
            conflictingClassName: cls.className || cls.courseTitle || "Lớp học đã ghi danh",
            dayOfWeek: Number(tSlot.dayOfWeek),
            dayLabel: DAY_LABELS[Number(tSlot.dayOfWeek)] || `Thứ ${tSlot.dayOfWeek + 1}`,
            existingTime: `${exSlot.startTime} - ${exSlot.endTime}`,
            targetTime: `${tSlot.startTime} - ${tSlot.endTime}`,
          });
        }
      }
    }
  }

  return conflicts;
}
