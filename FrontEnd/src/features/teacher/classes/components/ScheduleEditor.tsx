import { Button, Select } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { formatDayOfWeek } from '../../../../types/class';
import type { ScheduleEntry } from '../../../../types/class';
import { slotErrors } from '../../../../utils/classForm';

const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0].map((value) => ({ value, label: formatDayOfWeek(value) }));
const timeOptions = (size: number) => Array.from({ length: size }, (_, index) => {
  const value = String(index).padStart(2, '0');
  return { value, label: value };
});
const HOUR_OPTIONS = timeOptions(24);
const MINUTE_OPTIONS = timeOptions(60);

interface ScheduleTimeProps {
  label: string;
  slotNumber: number;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
}

function ScheduleTime({ label, slotNumber, value, invalid, onChange }: ScheduleTimeProps) {
  const [hour, minute] = value.split(':');
  const status = invalid ? 'error' : undefined;
  return (
    <div role="group" aria-label={`Thời gian ${label} ca ${slotNumber}`}>
      <div className="text-xs text-gray-500 mb-1">Giờ {label}</div>
      <div className="flex items-center gap-1">
        <Select
          aria-label={`Giờ ${label} ca ${slotNumber}`}
          value={hour || undefined}
          options={HOUR_OPTIONS}
          placeholder="Giờ"
          allowClear
          showSearch
          status={status}
          onChange={(nextHour) => onChange(nextHour ? `${nextHour}:${minute || '00'}` : '')}
          className="w-[4.5rem]"
        />
        <span aria-hidden="true">:</span>
        <Select
          aria-label={`Phút ${label} ca ${slotNumber}`}
          value={minute || undefined}
          options={MINUTE_OPTIONS}
          placeholder="Phút"
          disabled={!hour}
          showSearch
          status={status}
          onChange={(nextMinute) => onChange(`${hour}:${nextMinute}`)}
          className="w-[4.5rem]"
        />
      </div>
    </div>
  );
}

interface ScheduleEditorProps {
  value?: ScheduleEntry[];
  onChange?: (value: ScheduleEntry[]) => void;
}

export default function ScheduleEditor({ value = [], onChange }: ScheduleEditorProps) {
  const errors = slotErrors(value);
  const updateSlot = (index: number, changes: Partial<ScheduleEntry>) =>
    onChange?.(value.map((entry, i) => (i === index ? { ...entry, ...changes } : entry)));

  const addSlot = () => {
    const nextDay = DAY_OPTIONS.find(({ value: day }) => !value.some((slot) => slot.dayOfWeek === day));
    onChange?.([...value, { dayOfWeek: nextDay?.value ?? DAY_OPTIONS[0].value, startTime: '', endTime: '' }]);
  };

  return (
    <>
      <div className="flex flex-col gap-3.5 mb-6">
        {value.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
            Chưa có ca học. Bạn có thể lưu nháp và bổ sung sau; lịch học là bắt buộc khi gửi duyệt.
          </div>
        )}
        {value.map((entry, index) => (
          <div
            key={index}
            className={`border rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 transition-colors ${
              errors[index] ? 'border-red-300 bg-red-50/40' : 'border-gray-200 bg-white hover:border-teal-200'
            }`}
          >
            <div className="flex items-center gap-3 w-full md:w-auto">
              <span className="font-semibold text-gray-700 text-sm whitespace-nowrap">Ca {index + 1}</span>
              <Select
                aria-label={`Thứ của ca ${index + 1}`}
                value={entry.dayOfWeek}
                onChange={(dayOfWeek) => updateSlot(index, { dayOfWeek })}
                options={DAY_OPTIONS}
                className="w-[120px]"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <ScheduleTime
                label="bắt đầu"
                slotNumber={index + 1}
                value={entry.startTime}
                invalid={Boolean(errors[index])}
                onChange={(startTime) => updateSlot(index, { startTime })}
              />
              <ScheduleTime
                label="kết thúc"
                slotNumber={index + 1}
                value={entry.endTime}
                invalid={Boolean(errors[index])}
                onChange={(endTime) => updateSlot(index, { endTime })}
              />
            </div>

            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => onChange?.(value.filter((_, i) => i !== index))}
            >
              Xóa
            </Button>
            {errors[index] && (
              <div role="alert" className="w-full text-sm text-red-600">
                {errors[index]}
              </div>
            )}
          </div>
        ))}
      </div>

      <Button
        type="dashed"
        block
        icon={<PlusOutlined />}
        onClick={addSlot}
        className="rounded-xl border-teal-200 text-teal-600 hover:bg-teal-50 font-medium h-[46px]"
      >
        Thêm ca học trong tuần
      </Button>
    </>
  );
}
