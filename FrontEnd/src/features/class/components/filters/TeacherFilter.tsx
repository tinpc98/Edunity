import { useState, useMemo } from "react";
import { Input, Radio } from "antd";
import { SearchOutlined } from "@ant-design/icons";

interface TeacherOption {
  id: string;
  name: string;
  count: number;
}

interface TeacherFilterProps {
  teachers: TeacherOption[];
  selectedTeacherId?: string;
  onChange: (teacherId: string | undefined) => void;
}

export default function TeacherFilter({
  teachers,
  selectedTeacherId,
  onChange,
}: TeacherFilterProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredTeachers = useMemo(() => {
    if (!searchTerm.trim()) return teachers;
    const q = searchTerm.trim().toLowerCase();
    return teachers.filter((t) => t.name.toLowerCase().includes(q));
  }, [teachers, searchTerm]);

  return (
    <div className="flex flex-col gap-2.5">
      <Input
        size="small"
        placeholder="Tìm giáo viên..."
        prefix={<SearchOutlined className="text-slate-400" />}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        allowClear
        className="rounded text-xs"
      />

      <div className="max-h-48 overflow-y-auto pr-1 flex flex-col gap-1.5 scrollbar-thin">
        <Radio.Group
          value={selectedTeacherId || "ALL"}
          onChange={(e) => {
            const val = e.target.value;
            onChange(val === "ALL" ? undefined : val);
          }}
          className="flex flex-col gap-2 w-full"
        >
          <Radio value="ALL" className="!flex items-center text-[13px] text-slate-700 hover:text-indigo-600">
            <span className="font-medium text-xs">Tất cả giáo viên</span>
          </Radio>

          {filteredTeachers.map((t) => (
            <Radio
              key={t.id}
              value={t.id}
              className="!flex items-center text-[12.5px] text-slate-700 hover:text-indigo-600"
            >
              <span className="flex-1 font-medium truncate">{t.name}</span>
              {t.count > 0 && (
                <span className="text-[11px] text-slate-400 font-normal ml-1 shrink-0">
                  ({t.count})
                </span>
              )}
            </Radio>
          ))}
        </Radio.Group>

        {filteredTeachers.length === 0 && (
          <div className="text-xs text-slate-400 py-2 text-center">
            Không tìm thấy giáo viên
          </div>
        )}
      </div>
    </div>
  );
}
