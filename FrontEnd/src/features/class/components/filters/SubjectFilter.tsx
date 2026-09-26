import { useState } from "react";
import { Radio } from "antd";

interface SubjectOption {
  id: string;
  name: string;
  count: number;
}

interface SubjectFilterProps {
  subjects: SubjectOption[];
  selectedSubjectId?: string;
  onChange: (subjectId: string | undefined) => void;
}

const INITIAL_VISIBLE_COUNT = 5;

export default function SubjectFilter({
  subjects,
  selectedSubjectId,
  onChange,
}: SubjectFilterProps) {
  const [showAll, setShowAll] = useState(false);

  const visibleSubjects = showAll
    ? subjects
    : subjects.slice(0, INITIAL_VISIBLE_COUNT);

  return (
    <div className="flex flex-col gap-1.5">
      <Radio.Group
        value={selectedSubjectId || "ALL"}
        onChange={(e) => {
          const val = e.target.value;
          onChange(val === "ALL" ? undefined : val);
        }}
        className="flex flex-col gap-2 w-full"
      >
        <Radio value="ALL" className="!flex items-center text-[13px] text-slate-700 hover:text-indigo-600">
          <span className="flex-1 font-medium">Tất cả môn học</span>
        </Radio>

        {visibleSubjects.map((sub) => (
          <Radio
            key={sub.id}
            value={sub.id}
            className="!flex items-center text-[13px] text-slate-700 hover:text-indigo-600"
          >
            <span className="flex-1 font-medium">{sub.name}</span>
            {sub.count > 0 && (
              <span className="text-xs text-slate-400 font-normal ml-1">
                ({sub.count})
              </span>
            )}
          </Radio>
        ))}
      </Radio.Group>

      {subjects.length > INITIAL_VISIBLE_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll((prev) => !prev)}
          className="text-left text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:underline pt-1.5 cursor-pointer"
        >
          {showAll ? "Thu gọn ▲" : `Xem thêm (${subjects.length - INITIAL_VISIBLE_COUNT}) ▼`}
        </button>
      )}
    </div>
  );
}
