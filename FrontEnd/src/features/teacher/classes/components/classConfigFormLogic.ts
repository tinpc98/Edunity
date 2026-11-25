import { Form, type FormInstance } from 'antd';
import type { Dayjs } from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { sessionService, type BusySession } from '../../../../services/session.service';
import type { ScheduleEntry } from '../../../../types/class';
import { hasInvalidSlot, MAX_CLASS_SESSIONS, MIN_CLASS_PRICE, parsePrice, planSessions, type PlannedSession } from '../../../../utils/classForm';

export const CLASS_FORM_DEFAULTS = { classType: 'PAID', capacity: 20, price: MIN_CLASS_PRICE, sessionCount: 12 };

export interface PlanConflict {
  session: PlannedSession;
  busy: BusySession;
}

export interface ClassPlan {
  sessions: PlannedSession[];
  last?: PlannedSession;
  /** As many sessions as asked for could be placed */
  isComplete: boolean;
  /** Planned sessions overlapping a session of another of the teacher's classes */
  conflicts: PlanConflict[];
  isCheckingConflicts: boolean;
  conflictCheckFailed: boolean;
}

const at = (date: Dayjs, time: string) => {
  const [hour, minute] = time.split(':').map(Number);
  return date.hour(hour).minute(minute).second(0).millisecond(0).toDate();
};

/**
 * The sessions the form will create, and those of them clashing with the teacher's other classes.
 * `excludeClassId`: the class being edited, whose own sessions are rebuilt on save.
 */
export function useClassPlan(form: FormInstance, schedule: ScheduleEntry[], excludeClassId?: string): ClassPlan {
  const startDate = Form.useWatch('startDate', form) as Dayjs | null | undefined;
  const sessionCount = (Form.useWatch('sessionCount', form) as number | null | undefined) ?? 0;
  const sessions = planSessions(startDate, schedule, sessionCount);
  const last = sessions[sessions.length - 1];
  const from = sessions[0]?.date.startOf('day').toISOString();
  const to = last?.date.endOf('day').toISOString();

  const busyQuery = useQuery({
    queryKey: ['teacher-busy-sessions', from, to, excludeClassId ?? null],
    queryFn: () => sessionService.listBusySessions(from!, to!, excludeClassId),
    enabled: Boolean(from && to),
    staleTime: 30_000,
  });

  const busy = busyQuery.data ?? [];
  const conflicts: PlanConflict[] = [];
  for (const session of sessions) {
    const start = at(session.date, session.slot.startTime);
    const end = at(session.date, session.slot.endTime);
    const clash = busy.find((item) => new Date(item.startDatetime) < end && new Date(item.endDatetime) > start);
    if (clash) conflicts.push({ session, busy: clash });
  }

  return {
    sessions,
    last,
    isComplete: sessions.length > 0 && sessions.length === Math.min(sessionCount, MAX_CLASS_SESSIONS),
    conflicts,
    isCheckingConflicts: busyQuery.isFetching,
    conflictCheckFailed: busyQuery.isError,
  };
}

/** Why the form cannot be saved yet, or null. Field errors are reported by the form itself. */
export const planBlocker = (schedule: ScheduleEntry[], plan: ClassPlan) => {
  if (hasInvalidSlot(schedule)) return 'Ca học chưa hợp lệ: hãy sửa các ca được đánh dấu đỏ.';
  if (plan.conflicts.length) return 'Lịch học trùng giờ với buổi học của lớp khác. Hãy đổi ca học hoặc ngày bắt đầu.';
  return null;
};

/** The fields the create and update requests share */
export const classFormPayload = (form: FormInstance, schedule: ScheduleEntry[], plan: ClassPlan) => {
  const values = form.getFieldsValue(true);
  return {
    className: values.className,
    description: values.description || undefined,
    price: values.classType === 'FREE' ? 0 : parsePrice(values.price),
    capacity: Number(values.capacity || 20),
    enrollmentStart: values.enrollmentStart ? values.enrollmentStart.startOf('day').toISOString() : null,
    enrollmentEnd: values.enrollmentEnd ? values.enrollmentEnd.endOf('day').toISOString() : null,
    startDate: values.startDate ? values.startDate.startOf('day').toISOString() : null,
    // The end date is the day of the last planned session, so saving creates exactly the previewed sessions
    endDate: plan.last ? plan.last.date.endOf('day').toISOString() : null,
    schedule,
  };
};
