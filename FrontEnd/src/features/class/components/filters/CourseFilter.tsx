import { useState, useMemo } from "react";
import { Input, Radio } from "antd";
import { SearchOutlined } from "@ant-design/icons";

interface CourseOption {
  id: string;
  title: string;
  count: number;
}

interface CourseFilterProps {
  courses: CourseOption[];
  selectedCourseId?: string;
  onChange: (courseId: string | undefined) => void;
}

export default function CourseFilter({
  courses,
  selectedCourseId,
  onChange,
}: CourseFilterProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredCourses = useMemo(() => {
    if (!searchTerm.trim()) return courses;
    const q = searchTerm.trim().toLowerCase();
    return courses.filter((c) => c.title.toLowerCase().includes(q));
  }, [courses, searchTerm]);

  return (
    <div className="flex flex-col gap-2.5">
      <Input
        size="small"
        placeholder="Tìm khóa học..."
        prefix={<SearchOutlined className="text-slate-400" />}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        allowClear
        className="rounded text-xs"
      />

      <div className="max-h-52 overflow-y-auto pr-1 flex flex-col gap-1.5 scrollbar-thin">
        <Radio.Group
          value={selectedCourseId || "ALL"}
          onChange={(e) => {
            const val = e.target.value;
            onChange(val === "ALL" ? undefined : val);
          }}
          className="flex flex-col gap-2 w-full"
        >
          <Radio value="ALL" className="!flex items-start text-[13px] text-slate-700 hover:text-indigo-600">
            <span className="font-medium text-xs leading-5">Tất cả khóa học</span>
          </Radio>

          {filteredCourses.map((c) => (
            <Radio
              key={c.id}
              value={c.id}
              className="!flex items-start text-[12.5px] text-slate-700 hover:text-indigo-600"
            >
              <span className="leading-snug line-clamp-2">{c.title}</span>
              {c.count > 0 && (
                <span className="text-[11px] text-slate-400 font-normal ml-1 shrink-0">
                  ({c.count})
                </span>
              )}
            </Radio>
          ))}
        </Radio.Group>

        {filteredCourses.length === 0 && (
          <div className="text-xs text-slate-400 py-2 text-center">
            Không tìm thấy khóa học
          </div>
        )}
      </div>
    </div>
  );
}
