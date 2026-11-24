import { Button, Select, TimePicker } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { formatDayOfWeek } from '../../../../types/class';
import type { ScheduleEntry } from '../../../../types/class';
import { slotErrors } from '../../../../utils/classForm';

const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0].map((value) => ({ value, label: formatDayOfWeek(value) }));

interface ScheduleEditorProps {
  value?: ScheduleEntry[];
  onChange?: (value: ScheduleEntry[]) => void;
}

export default function ScheduleEditor({ value = [], onChange }: ScheduleEditorProps) {
  const errors = slotErrors(value);
  const updateSlot = (index: number, changes: Partial<ScheduleEntry>) =>
    onChange?.(value.map((entry, i) => (i === index ? { ...entry, ...changes } : entry)));

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
            className={`border rounded-xl p-4 flex flex-col md:flex-row md:flex-wrap items-center justify-between gap-4 transition-colors ${
              errors[index] ? 'border-red-300 bg-red-50/40' : 'border-gray-200 bg-white hover:border-teal-200'
            }`}
          >
            <div className="flex items-center gap-3 w-full md:w-auto">
              <span className="font-semibold text-gray-700 text-sm whitespace-nowrap">Ca {index + 1}:</span>
              <Select
                aria-label={`Thứ của ca ${index + 1}`}
                value={entry.dayOfWeek}
                onChange={(dayOfWeek) => updateSlot(index, { dayOfWeek })}
                options={DAY_OPTIONS}
                className="w-[120px]"
              />
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">Từ</span>
              <TimePicker
                aria-label={`Giờ bắt đầu ca ${index + 1}`}
                value={entry.startTime ? dayjs(`2000-01-01T${entry.startTime}`) : null}
                format="HH:mm"
                minuteStep={5}
                status={errors[index] ? 'error' : undefined}
                onChange={(time) => updateSlot(index, { startTime: time ? time.format('HH:mm') : '' })}
                className="w-[100px]"
              />
              <span className="text-xs text-gray-500">đến</span>
              <TimePicker
                aria-label={`Giờ kết thúc ca ${index + 1}`}
                value={entry.endTime ? dayjs(`2000-01-01T${entry.endTime}`) : null}
                format="HH:mm"
                minuteStep={5}
                status={errors[index] ? 'error' : undefined}
                onChange={(time) => updateSlot(index, { endTime: time ? time.format('HH:mm') : '' })}
                className="w-[100px]"
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
        onClick={() => onChange?.([...value, { dayOfWeek: 1, startTime: '18:00', endTime: '19:30' }])}
        className="rounded-xl border-teal-200 text-teal-600 hover:bg-teal-50 font-medium h-[46px]"
      >
        Thêm ca học trong tuần
      </Button>
    </>
  );
}
