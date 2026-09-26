import { useMemo } from "react";
import { Breadcrumb, Pagination, Alert } from "antd";
import { HomeOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import {
  useClassDiscoveryFilters,
  useClassDiscoveryQuery,
  useFilterMetadataQuery,
} from "../hooks/useClassDiscovery";
import FilterSidebar from "../components/FilterSidebar";
import SearchToolbar from "../components/SearchToolbar";
import ClassGrid from "../components/ClassGrid";
import { GRADE_LEVEL_LABELS } from "../data/mockClassDiscovery";

export default function ClassDiscoveryPage() {
  const { filters, updateFilters, resetAllFilters, hasActiveFilters } =
    useClassDiscoveryFilters();

  const {
    data: discoveryData,
    isLoading,
    isError,
    error,
    refetch,
  } = useClassDiscoveryQuery(filters);

  const { data: metadata } = useFilterMetadataQuery();

  // Active filter tags for the toolbar
  const activeTags = useMemo(() => {
    const tags: Array<{ key: string; label: string; onRemove: () => void }> = [];

    // Search query
    if (filters.search) {
      tags.push({
        key: "search",
        label: `"${filters.search}"`,
        onRemove: () => updateFilters({ search: "" }),
      });
    }

    // Subject
    if (filters.subjectId && metadata?.subjects) {
      const sub = metadata.subjects.find((s) => s.id === filters.subjectId);
      if (sub) {
        tags.push({
          key: `subject-${sub.id}`,
          label: `Môn: ${sub.name}`,
          onRemove: () => updateFilters({ subjectId: undefined }),
        });
      }
    }

    // Grades
    filters.gradeLevels.forEach((gl) => {
      tags.push({
        key: `grade-${gl}`,
        label: GRADE_LEVEL_LABELS[gl] || gl,
        onRemove: () =>
          updateFilters({
            gradeLevels: filters.gradeLevels.filter((g) => g !== gl),
          }),
      });
    });

    // Course
    if (filters.courseId && metadata?.courses) {
      const crs = metadata.courses.find((c) => c.id === filters.courseId);
      if (crs) {
        tags.push({
          key: `course-${crs.id}`,
          label: `Khóa: ${crs.title}`,
          onRemove: () => updateFilters({ courseId: undefined }),
        });
      }
    }

    // Class Types
    filters.classTypes.forEach((ct) => {
      tags.push({
        key: `type-${ct}`,
        label: ct === "FREE" ? "Miễn phí" : "Có học phí",
        onRemove: () =>
          updateFilters({
            classTypes: filters.classTypes.filter((t) => t !== ct),
          }),
      });
    });

    // Schedule Time of Day
    filters.timeOfDay.forEach((tod) => {
      const label =
        tod === "MORNING"
          ? "Buổi sáng"
          : tod === "AFTERNOON"
          ? "Buổi chiều"
          : "Buổi tối";
      tags.push({
        key: `time-${tod}`,
        label,
        onRemove: () =>
          updateFilters({
            timeOfDay: filters.timeOfDay.filter((t) => t !== tod),
          }),
      });
    });

    // Statuses
    filters.statuses.forEach((st) => {
      const label =
        st === "OPEN"
          ? "Đang tuyển sinh"
          : st === "IN_PROGRESS"
          ? "Đang diễn ra"
          : st;
      tags.push({
        key: `status-${st}`,
        label,
        onRemove: () =>
          updateFilters({
            statuses: filters.statuses.filter((s) => s !== st),
          }),
      });
    });

    // Teacher
    if (filters.teacherId && metadata?.teachers) {
      const tea = metadata.teachers.find((t) => t.id === filters.teacherId);
      if (tea) {
        tags.push({
          key: `teacher-${tea.id}`,
          label: `GV: ${tea.name}`,
          onRemove: () => updateFilters({ teacherId: undefined }),
        });
      }
    }

    // Price
    if (
      (filters.minPrice !== undefined && filters.minPrice > 0) ||
      (filters.maxPrice !== undefined && filters.maxPrice < (metadata?.maxPrice ?? 2000000))
    ) {
      tags.push({
        key: "price-range",
        label: `Giá: ${(filters.minPrice ?? 0).toLocaleString("vi-VN")}đ - ${(
          filters.maxPrice ?? (metadata?.maxPrice || 2000000)
        ).toLocaleString("vi-VN")}đ`,
        onRemove: () =>
          updateFilters({
            minPrice: undefined,
            maxPrice: undefined,
          }),
      });
    }

    return tags;
  }, [filters, metadata, updateFilters]);

  return (
    <div className="site-container py-6 min-h-screen">
      {/* Breadcrumb */}
      <div className="mb-4">
        <Breadcrumb
          items={[
            {
              title: (
                <Link to="/" className="text-slate-500 hover:text-indigo-600 flex items-center gap-1 text-xs">
                  <HomeOutlined />
                  <span>Trang chủ</span>
                </Link>
              ),
            },
            {
              title: <span className="text-slate-800 font-semibold text-xs">Khám phá lớp học</span>,
            },
          ]}
        />
      </div>

      {/* Page Header (Title + Subtitle) */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-tight !mb-1">
          Khám phá lớp học trực tuyến
        </h1>
        <p className="text-slate-600 text-sm">
          Tìm lớp học phù hợp với mục tiêu và lịch học của bạn.
        </p>
      </div>

      {/* Error state if any */}
      {isError && (
        <div className="mb-6">
          <Alert
            type="error"
            showIcon
            message="Không thể tải danh sách lớp học"
            description={error instanceof Error ? error.message : "Đã xảy ra lỗi kết nối. Vui lòng thử lại."}
            action={
              <button
                type="button"
                onClick={() => refetch()}
                className="text-xs font-bold text-rose-700 hover:underline px-2"
              >
                Thử lại
              </button>
            }
          />
        </div>
      )}

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Filter Sidebar */}
        <div className="lg:col-span-4 xl:col-span-3 lg:sticky lg:top-24">
          <FilterSidebar
            metadata={metadata}
            filters={filters}
            onFilterChange={updateFilters}
            onResetAll={resetAllFilters}
            hasActiveFilters={hasActiveFilters}
          />
        </div>

        {/* Right Column: Search Toolbar, Class Grid, Pagination */}
        <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-5">
          <SearchToolbar
            total={discoveryData?.total || 0}
            searchValue={filters.search}
            sortValue={filters.sort}
            onSearchChange={(search) => updateFilters({ search })}
            onSortChange={(sort) => updateFilters({ sort })}
            activeFilterTags={activeTags}
          />

          <ClassGrid
            items={discoveryData?.items || []}
            isLoading={isLoading}
            onResetFilters={resetAllFilters}
          />

          {/* Pagination */}
          {discoveryData && discoveryData.total > discoveryData.pageSize && (
            <div className="flex justify-center items-center py-6 mt-2">
              <Pagination
                current={discoveryData.page}
                pageSize={discoveryData.pageSize}
                total={discoveryData.total}
                onChange={(page) => updateFilters({ page }, false)}
                showSizeChanger={false}
                className="custom-pagination"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
