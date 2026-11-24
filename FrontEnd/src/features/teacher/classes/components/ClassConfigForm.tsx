import { useState } from 'react';
import { Alert, Button, Card, Col, DatePicker, Divider, Form, Input, InputNumber, Radio, Row, Tag, Typography } from 'antd';
import type { FormInstance } from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { sessionService } from '../../../../services/session.service';
import type { BusySession } from '../../../../services/session.service';
import { formatDayOfWeek } from '../../../../types/class';
import type { ScheduleEntry } from '../../../../types/class';
import {
  CLASS_PRICE_HINT,
  classPriceRule,
  hasInvalidSlot,
  MAX_CLASS_SESSIONS,
  MIN_CLASS_PRICE,
  notBeforeField,
  parsePrice,
  planSessions,
} from '../../../../utils/classForm';
import type { PlannedSession } from '../../../../utils/classForm';
import PriceInput from '../../../../components/common/PriceInput';
import ScheduleEditor from './ScheduleEditor';

const { Title, Text } = Typography;

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

const formatBusy = (busy: BusySession) => {
  const start = new Date(busy.startDatetime);
  const end = new Date(busy.endDatetime);
  const time = (d: Date) => d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  return `${start.toLocaleDateString('vi-VN')} ${time(start)} – ${time(end)}`;
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

interface ClassConfigFormProps {
  form: FormInstance;
  schedule: ScheduleEntry[];
  onScheduleChange: (schedule: ScheduleEntry[]) => void;
  plan: ClassPlan;
  /** Editing: the class type is fixed once the class exists */
  lockClassType?: boolean;
  /** The day the class was created: enrollment opens from it on. Defaults to today (a new class). */
  createdOn?: Dayjs;
}

/** Class information and teaching schedule, the same form for creating and editing a class. */
export default function ClassConfigForm({ form, schedule, onScheduleChange, plan, lockClassType, createdOn }: ClassConfigFormProps) {
  const firstEnrollmentDay = (createdOn ?? dayjs()).startOf('day');
  const [showAllSessions, setShowAllSessions] = useState(false);
  const isFree = (Form.useWatch('classType', form) || 'PAID') === 'FREE';
  const conflictIndexes = new Set(plan.conflicts.map((conflict) => conflict.session.index));
  const shown = showAllSessions ? plan.sessions : plan.sessions.slice(0, 5);

  return (
    <Form layout="vertical" form={form} preserve initialValues={{ ...CLASS_FORM_DEFAULTS, enrollmentStart: lockClassType ? undefined : firstEnrollmentDay }}>
      <Card className="rounded-2xl shadow-sm border-gray-100 p-6">
        <Title level={4} className="!text-base !mb-6 !font-bold">Thông tin lớp học</Title>

        <Form.Item label="Tên lớp học công khai" name="className" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập tên lớp học' }]}>
          <Input className="rounded-lg" placeholder="VD: Lớp Ôn thi môn Toán 12 Nâng cao" />
        </Form.Item>

        <Form.Item label="Loại hình lớp học" name="classType" rules={[{ required: true }]}>
          <Radio.Group className="w-full" disabled={lockClassType}>
            <Row gutter={16}>
              <Col span={12}>
                <Radio.Button
                  value="PAID"
                  className="w-full h-auto py-3 px-4 rounded-xl text-left border-2 [&.ant-radio-button-wrapper-checked]:border-teal-600 [&.ant-radio-button-wrapper-checked]:bg-teal-50"
                >
                  <div className="font-semibold text-gray-800 mb-1">Lớp có thu phí (PAID)</div>
                  <div className="text-xs text-gray-500 font-normal leading-tight">Học viên đóng học phí để ghi danh.</div>
                </Radio.Button>
              </Col>
              <Col span={12}>
                <Radio.Button
                  value="FREE"
                  className="w-full h-auto py-3 px-4 rounded-xl text-left border-2 [&.ant-radio-button-wrapper-checked]:border-emerald-600 [&.ant-radio-button-wrapper-checked]:bg-emerald-50"
                >
                  <div className="font-semibold text-gray-800 mb-1">Lớp cộng đồng (FREE)</div>
                  <div className="text-xs text-gray-500 font-normal leading-tight">Lớp phi lợi nhuận, miễn phí 100%. Giá = 0 VNĐ.</div>
                </Radio.Button>
              </Col>
            </Row>
          </Radio.Group>
        </Form.Item>

        <Row gutter={24}>
          {!isFree && (
            <Col xs={24} sm={12}>
              <Form.Item label="Học phí trọn khóa (VNĐ)" name="price" required extra={CLASS_PRICE_HINT} rules={[classPriceRule]}>
                <PriceInput className="w-full rounded-lg" />
              </Form.Item>
            </Col>
          )}
          <Col xs={24} sm={isFree ? 24 : 12}>
            <Form.Item
              label="Sĩ số tối đa (học viên)"
              name="capacity"
              rules={[
                { required: true, message: 'Vui lòng nhập sĩ số' },
                { type: 'number', min: 1, message: 'Sĩ số phải >= 1' },
              ]}
            >
              <InputNumber className="w-full rounded-lg" addonAfter="Học viên" min={1} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={24}>
          <Col xs={24} sm={12}>
            <Form.Item
              label="Mở tuyển sinh từ"
              name="enrollmentStart"
              extra={`Từ ngày tạo lớp (${firstEnrollmentDay.format('DD/MM/YYYY')}) trở đi`}
              rules={[
                { required: true, message: 'Vui lòng chọn ngày mở tuyển sinh' },
                {
                  validator: (_, value?: Dayjs | null) =>
                    value && value.isBefore(firstEnrollmentDay, 'day')
                      ? Promise.reject(new Error('Ngày mở tuyển sinh không được trước ngày tạo lớp'))
                      : Promise.resolve(),
                },
              ]}
            >
              <DatePicker
               
                className="w-full rounded-lg"
                format="DD/MM/YYYY"
                placeholder="Chọn ngày"
                disabledDate={(day) => day.isBefore(firstEnrollmentDay, 'day')}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              label="Hạn chót tuyển sinh"
              name="enrollmentEnd"
              dependencies={['enrollmentStart']}
              rules={[
                { required: true, message: 'Vui lòng chọn hạn chót tuyển sinh' },
                notBeforeField('enrollmentStart', 'Không được trước ngày mở tuyển sinh'),
              ]}
            >
              <DatePicker className="w-full rounded-lg" format="DD/MM/YYYY" placeholder="Chọn ngày" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          label="Mô tả lớp học & Mục tiêu đào tạo"
          name="description"
          rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập mô tả lớp học' }]}
        >
          <Input.TextArea rows={4} className="rounded-lg" placeholder="Mô tả chi tiết nội dung, cam kết đầu ra của lớp học..." />
        </Form.Item>
      </Card>

      <Card className="rounded-2xl shadow-sm border-gray-100 p-6 mt-6">
        <div className="flex justify-between items-start gap-4 mb-6">
          <div>
            <Title level={4} className="!text-base !m-0 !font-bold">Lịch giảng dạy & ca học hằng tuần</Title>
            <Text className="text-gray-500 text-sm">
              Chọn số buổi, ngày bắt đầu và các ca trong tuần. Ngày kết thúc được tính tự động từ buổi học cuối cùng.
            </Text>
          </div>
          <Tag color="cyan" className="font-semibold rounded-full px-3 py-1 shrink-0">
            {schedule.length} ca / tuần
          </Tag>
        </div>

        <Row gutter={24}>
          <Col xs={24} sm={12}>
            <Form.Item
              label="Tổng số buổi của lớp"
              name="sessionCount"
              rules={[
                { required: true, message: 'Vui lòng nhập số buổi' },
                { type: 'number', min: 1, max: MAX_CLASS_SESSIONS, message: `Từ 1 đến ${MAX_CLASS_SESSIONS} buổi` },
              ]}
            >
              <InputNumber className="w-full rounded-lg" min={1} max={MAX_CLASS_SESSIONS} precision={0} addonAfter="buổi" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              label="Ngày bắt đầu lớp"
              name="startDate"
              dependencies={['enrollmentEnd']}
              extra="Có thể trùng ngày hạn chót tuyển sinh"
              rules={[notBeforeField('enrollmentEnd', 'Không được trước hạn chót tuyển sinh')]}
            >
              <DatePicker className="w-full rounded-lg" format="DD/MM/YYYY" placeholder="Chọn ngày" />
            </Form.Item>
          </Col>
        </Row>

        <ScheduleEditor value={schedule} onChange={onScheduleChange} />

        <Divider className="my-6" />
        <Title level={5} className="!mb-4 !font-semibold">Tổng quan lịch dự kiến</Title>
        <Row gutter={16} className="mb-4">
          {(
            [
              ['Tổng số buổi', plan.sessions.length],
              ['Ca mỗi tuần', schedule.length],
              ['Số tuần ước tính', schedule.length ? Math.ceil(plan.sessions.length / schedule.length) : 0],
            ] as const
          ).map(([label, value]) => (
            <Col span={8} key={label}>
              <div className="text-sm text-gray-500">{label}</div>
              <div className="text-2xl font-bold text-gray-900">{value}</div>
            </Col>
          ))}
        </Row>

        {plan.conflicts.length > 0 && (
          <Alert
            type="error"
            showIcon
            className="mb-4 rounded-xl"
            title={`${plan.conflicts.length} buổi trùng giờ với lớp khác của bạn`}
            description={
              <ul className="list-disc pl-5 m-0">
                {plan.conflicts.slice(0, 5).map(({ session, busy }) => (
                  <li key={session.index}>
                    Buổi {session.index} ({formatDayOfWeek(session.slot.dayOfWeek)}, {session.date.format('DD/MM/YYYY')} {session.slot.startTime} –{' '}
                    {session.slot.endTime}) trùng "{busy.title}" của lớp {busy.className} ({formatBusy(busy)})
                  </li>
                ))}
                {plan.conflicts.length > 5 && <li>… và {plan.conflicts.length - 5} buổi khác</li>}
              </ul>
            }
          />
        )}
        {plan.conflictCheckFailed && (
          <Alert type="warning" showIcon className="mb-4 rounded-xl" title="Chưa kiểm tra được trùng lịch với các lớp khác. Hệ thống sẽ kiểm tra lại khi lưu." />
        )}

        {plan.sessions.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
            Nhập số buổi, ngày bắt đầu và ít nhất một ca học hợp lệ để xem trước danh sách buổi học.
          </div>
        ) : (
          <>
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 mb-4 grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-500">Buổi học đầu tiên</div>
                <div className="font-semibold text-gray-900">{plan.sessions[0].date.format('DD/MM/YYYY')}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Buổi học cuối cùng (ngày kết thúc)</div>
                <div className="font-semibold text-gray-900">{plan.last?.date.format('DD/MM/YYYY')}</div>
              </div>
            </div>
            {!plan.isComplete && <Alert type="warning" showIcon className="mb-4 rounded-xl" title="Lịch học chưa đủ số buổi đã nhập." />}
            <div className="text-sm font-semibold text-gray-700 mb-2">Xem trước danh sách buổi học ({plan.sessions.length})</div>
            <ol className="flex flex-col divide-y divide-gray-100 border border-gray-100 rounded-xl">
              {shown.map(({ index, date, slot }) => {
                const clash = conflictIndexes.has(index);
                return (
                  <li key={index} className={`flex items-center gap-4 px-4 py-2.5 ${clash ? 'bg-red-50' : ''}`}>
                    <span className={`w-6 text-center font-semibold ${clash ? 'text-red-600' : 'text-teal-600'}`}>{index}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900">
                        Buổi {index} {clash && <Tag color="red" className="ml-1">Trùng lịch</Tag>}
                      </div>
                      <div className="text-sm text-gray-500">
                        {formatDayOfWeek(slot.dayOfWeek)}, {date.format('DD/MM/YYYY')}
                      </div>
                    </div>
                    <span className="text-sm font-medium text-gray-700">
                      {slot.startTime} – {slot.endTime}
                    </span>
                  </li>
                );
              })}
            </ol>
            {plan.sessions.length > 5 && (
              <Button type="link" block className="mt-2" onClick={() => setShowAllSessions((value) => !value)}>
                {showAllSessions ? 'Thu gọn' : `Xem tất cả ${plan.sessions.length} buổi`}
              </Button>
            )}
          </>
        )}
      </Card>
    </Form>
  );
}
