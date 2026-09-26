import { Checkbox } from "antd";
import type { TimeOfDay } from "../../../../types/classDiscovery";

interface ScheduleFilterProps {
  selectedTimes: TimeOfDay[];
  onChange: (times: TimeOfDay[]) => void;
}

const SCHEDULE_OPTIONS: Array<{ value: TimeOfDay; label: string; sub: string }> = [
  { value: "MORNING", label: "Buổi sáng", sub: "06:00 - 12:00" },
  { value: "AFTERNOON", label: "Buổi chiều", sub: "12:00 - 18:00" },
  { value: "EVENING", label: "Buổi tối", sub: "18:00 - 22:30" },
];

export default function ScheduleFilter({
  selectedTimes,
  onChange,
}: ScheduleFilterProps) {
  return (
    <div className="flex flex-col gap-2 w-full">
      <Checkbox.Group
        value={selectedTimes}
        onChange={(checked) => onChange(checked as TimeOfDay[])}
        className="flex flex-col gap-2 w-full"
      >
        {SCHEDULE_OPTIONS.map((opt) => (
          <Checkbox
            key={opt.value}
            value={opt.value}
            className="!flex items-center text-[13px] text-slate-700 hover:text-indigo-600 !ml-0"
          >
            <span className="flex-1 font-medium">{opt.label}</span>
            <span className="text-[11px] text-slate-400 font-normal ml-1">
              ({opt.sub})
            </span>
          </Checkbox>
        ))}
      </Checkbox.Group>
    </div>
  );
}
