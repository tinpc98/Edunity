import { Checkbox } from "antd";
import type { BackendGradeLevel } from "../../../../types/classDiscovery";

interface GradeOption {
  level: BackendGradeLevel;
  label: string;
  count: number;
}

interface GradeFilterProps {
  grades: GradeOption[];
  selectedGrades: BackendGradeLevel[];
  onChange: (grades: BackendGradeLevel[]) => void;
}

export default function GradeFilter({
  grades,
  selectedGrades,
  onChange,
}: GradeFilterProps) {
  return (
    <div className="flex flex-col gap-2 w-full">
      <Checkbox.Group
        value={selectedGrades}
        onChange={(checkedValues) => onChange(checkedValues as BackendGradeLevel[])}
        className="flex flex-col gap-2 w-full"
      >
        {grades.map((grade) => (
          <Checkbox
            key={grade.level}
            value={grade.level}
            className="!flex items-center text-[13px] text-slate-700 hover:text-indigo-600 !ml-0"
          >
            <span className="flex-1 font-medium">{grade.label}</span>
            {grade.count > 0 && (
              <span className="text-xs text-slate-400 font-normal ml-1">
                ({grade.count})
              </span>
            )}
          </Checkbox>
        ))}
      </Checkbox.Group>
    </div>
  );
}
