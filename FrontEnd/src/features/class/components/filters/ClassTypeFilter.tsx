import { Checkbox } from "antd";
import type { BackendClassType } from "../../../../types/classDiscovery";

interface ClassTypeFilterProps {
  selectedTypes: BackendClassType[];
  onChange: (types: BackendClassType[]) => void;
}

const TYPE_OPTIONS: Array<{ value: BackendClassType; label: string; badge?: string }> = [
  { value: "FREE", label: "Lớp miễn phí", badge: "FREE" },
  { value: "PAID", label: "Lớp trả phí", badge: "Có học phí" },
];

export default function ClassTypeFilter({
  selectedTypes,
  onChange,
}: ClassTypeFilterProps) {
  return (
    <div className="flex flex-col gap-2 w-full">
      <Checkbox.Group
        value={selectedTypes}
        onChange={(checked) => onChange(checked as BackendClassType[])}
        className="flex flex-col gap-2 w-full"
      >
        {TYPE_OPTIONS.map((opt) => (
          <Checkbox
            key={opt.value}
            value={opt.value}
            className="!flex items-center text-[13px] text-[#334155] hover:text-[#0D9488] !ml-0"
          >
            <span className="flex-1 font-medium">{opt.label}</span>
            {opt.badge && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-bold ml-1.5 ${
                  opt.value === "FREE"
                    ? "text-[#0F766E] bg-[#CCFBF1]"
                    : "text-[#0F766E] bg-[#CCFBF1]"
                }`}
              >
                {opt.badge}
              </span>
            )}
          </Checkbox>
        ))}
      </Checkbox.Group>
    </div>
  );
}
