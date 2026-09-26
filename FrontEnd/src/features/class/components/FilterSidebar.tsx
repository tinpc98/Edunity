import { useState } from "react";
import { FilterOutlined, ReloadOutlined } from "@ant-design/icons";
import type { FilterMetadata, FilterState } from "../../../types/classDiscovery";
import FilterSection from "./FilterSection";
import SubjectFilter from "./filters/SubjectFilter";
import GradeFilter from "./filters/GradeFilter";
import CourseFilter from "./filters/CourseFilter";
import ClassTypeFilter from "./filters/ClassTypeFilter";
import PriceFilter from "./filters/PriceFilter";
import ScheduleFilter from "./filters/ScheduleFilter";
import StatusFilter from "./filters/StatusFilter";
import TeacherFilter from "./filters/TeacherFilter";

interface FilterSidebarProps {
  metadata?: FilterMetadata;
  filters: FilterState;
  onFilterChange: (updates: Partial<FilterState>) => void;
  onResetAll: () => void;
  hasActiveFilters: boolean;
}

type FilterSectionId =
  | "subject"
  | "grade"
  | "course"
  | "classType"
  | "price"
  | "schedule"
  | "status"
  | "teacher";

export default function FilterSidebar({
  metadata,
  filters,
  onFilterChange,
  onResetAll,
  hasActiveFilters,
}: FilterSidebarProps) {
  // Section 8: Default open state: Môn học (OPEN), Khối lớp (OPEN). Others CLOSED.
  // Neither is locked open. User can toggle any section.
  const [openSections, setOpenSections] = useState<Record<FilterSectionId, boolean>>({
    subject: true,
    grade: true,
    course: false,
    classType: false,
    price: false,
    schedule: false,
    status: false,
    teacher: false,
  });

  const toggleSection = (id: FilterSectionId) => {
    setOpenSections((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Active counts for indicators
  const subjectActiveCount = filters.subjectId ? 1 : 0;
  const gradeActiveCount = filters.gradeLevels.length;
  const courseActiveCount = filters.courseId ? 1 : 0;
  const classTypeActiveCount = filters.classTypes.length;
  const priceActiveCount =
    (filters.minPrice !== undefined && filters.minPrice > 0) ||
    (filters.maxPrice !== undefined && filters.maxPrice < (metadata?.maxPrice ?? 2000000))
      ? 1
      : 0;
  const scheduleActiveCount = filters.timeOfDay.length;
  const statusActiveCount = filters.statuses.length;
  const teacherActiveCount = filters.teacherId ? 1 : 0;

  return (
    <aside className="w-full bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 flex flex-col">
      {/* Top Header of the Single Filter Panel */}
      <div className="flex items-center justify-between pb-3.5 border-b border-slate-200/80">
        <div className="flex items-center gap-2">
          <FilterOutlined className="text-indigo-600 text-sm" />
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider !m-0">
            Bộ lọc tìm kiếm
          </h2>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onResetAll}
            className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
          >
            <ReloadOutlined className="text-[10px]" />
            Xóa tất cả
          </button>
        )}
      </div>

      {/* Accordion Sections in Single Panel */}
      <div className="flex flex-col divide-y divide-slate-100">
        {/* 1. MÔN HỌC (Default OPEN) */}
        <FilterSection
          id="subject"
          title="Môn học"
          isOpen={openSections.subject}
          onToggle={() => toggleSection("subject")}
          activeCount={subjectActiveCount}
        >
          <SubjectFilter
            subjects={metadata?.subjects || []}
            selectedSubjectId={filters.subjectId}
            onChange={(subjectId) => onFilterChange({ subjectId })}
          />
        </FilterSection>

        {/* 2. KHỐI LỚP (Default OPEN) */}
        <FilterSection
          id="grade"
          title="Khối lớp"
          isOpen={openSections.grade}
          onToggle={() => toggleSection("grade")}
          activeCount={gradeActiveCount}
        >
          <GradeFilter
            grades={metadata?.grades || []}
            selectedGrades={filters.gradeLevels}
            onChange={(gradeLevels) => onFilterChange({ gradeLevels })}
          />
        </FilterSection>

        {/* 3. KHÓA HỌC (Default CLOSED) */}
        <FilterSection
          id="course"
          title="Khóa học"
          isOpen={openSections.course}
          onToggle={() => toggleSection("course")}
          activeCount={courseActiveCount}
        >
          <CourseFilter
            courses={metadata?.courses || []}
            selectedCourseId={filters.courseId}
            onChange={(courseId) => onFilterChange({ courseId })}
          />
        </FilterSection>

        {/* 4. LOẠI LỚP (Default CLOSED) */}
        <FilterSection
          id="classType"
          title="Loại lớp"
          isOpen={openSections.classType}
          onToggle={() => toggleSection("classType")}
          activeCount={classTypeActiveCount}
        >
          <ClassTypeFilter
            selectedTypes={filters.classTypes}
            onChange={(classTypes) => onFilterChange({ classTypes })}
          />
        </FilterSection>

        {/* 5. KHOẢNG GIÁ (Default CLOSED) */}
        <FilterSection
          id="price"
          title="Khoảng giá"
          isOpen={openSections.price}
          onToggle={() => toggleSection("price")}
          activeCount={priceActiveCount}
        >
          <PriceFilter
            minLimit={metadata?.minPrice || 0}
            maxLimit={metadata?.maxPrice || 2000000}
            minPrice={filters.minPrice}
            maxPrice={filters.maxPrice}
            onChange={([minPrice, maxPrice]) =>
              onFilterChange({ minPrice, maxPrice })
            }
          />
        </FilterSection>

        {/* 6. LỊCH HỌC (Default CLOSED) */}
        <FilterSection
          id="schedule"
          title="Lịch học"
          isOpen={openSections.schedule}
          onToggle={() => toggleSection("schedule")}
          activeCount={scheduleActiveCount}
        >
          <ScheduleFilter
            selectedTimes={filters.timeOfDay}
            onChange={(timeOfDay) => onFilterChange({ timeOfDay })}
          />
        </FilterSection>

        {/* 7. TRẠNG THÁI (Default CLOSED) */}
        <FilterSection
          id="status"
          title="Trạng thái"
          isOpen={openSections.status}
          onToggle={() => toggleSection("status")}
          activeCount={statusActiveCount}
        >
          <StatusFilter
            selectedStatuses={filters.statuses}
            onChange={(statuses) => onFilterChange({ statuses })}
          />
        </FilterSection>

        {/* 8. GIÁO VIÊN (Default CLOSED) */}
        <FilterSection
          id="teacher"
          title="Giáo viên"
          isOpen={openSections.teacher}
          onToggle={() => toggleSection("teacher")}
          activeCount={teacherActiveCount}
        >
          <TeacherFilter
            teachers={metadata?.teachers || []}
            selectedTeacherId={filters.teacherId}
            onChange={(teacherId) => onFilterChange({ teacherId })}
          />
        </FilterSection>
      </div>
    </aside>
  );
}
