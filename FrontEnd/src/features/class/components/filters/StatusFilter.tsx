import { Checkbox } from "antd";
import type { BackendClassStatus } from "../../../../types/classDiscovery";

interface StatusFilterProps {
  selectedStatuses: BackendClassStatus[];
  onChange: (statuses: BackendClassStatus[]) => void;
}

const STATUS_OPTIONS: Array<{ value: BackendClassStatus; label: string; badgeColor: string }> = [
  { value: "OPEN", label: "Đang tuyển sinh", badgeColor: "bg-emerald-500" },
  { value: "IN_PROGRESS", label: "Đang diễn ra", badgeColor: "bg-blue-500" },
  { value: "COMPLETED", label: "Đã kết thúc", badgeColor: "bg-slate-400" },
];

export default function StatusFilter({
  selectedStatuses,
  onChange,
}: StatusFilterProps) {
  return (
    <div className="flex flex-col gap-2 w-full">
      <Checkbox.Group
        value={selectedStatuses}
        onChange={(checked) => onChange(checked as BackendClassStatus[])}
        className="flex flex-col gap-2 w-full"
      >
        {STATUS_OPTIONS.map((opt) => (
          <Checkbox
            key={opt.value}
            value={opt.value}
            className="!flex items-center text-[13px] text-slate-700 hover:text-indigo-600 !ml-0"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <span className={`w-2 h-2 rounded-full ${opt.badgeColor}`} />
              {opt.label}
            </span>
          </Checkbox>
        ))}
      </Checkbox.Group>
    </div>
  );
}
