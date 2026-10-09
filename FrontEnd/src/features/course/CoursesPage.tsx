import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Input,
  Select,
  Tag,
  Skeleton,
  Alert,
  Empty,
  Button,
  Pagination,
  Badge,
} from "antd";
import {
  SearchOutlined,
  BookOutlined,
  FilterOutlined,
  AppstoreOutlined,
} from "@ant-design/icons";
import { courseService } from "../../services/course.service";
import { catalogService } from "../../services/catalog.service";
import type { CourseSearchParams, GradeLevel, CourseLevel } from "../../types/catalog";
import {
  GRADE_LEVEL_LABELS,
  COURSE_LEVEL_LABELS,
  GRADE_LEVELS,
  COURSE_LEVELS,
} from "../../types/catalog";
import { ROUTES } from "../../routes/routePaths";

const PAGE_SIZE = 12;

export default function CoursesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const search = searchParams.get("search") || "";
  const categoryId = searchParams.get("categoryId") || "";
  const subjectId = searchParams.get("subjectId") || "";
  const gradeLevel = (searchParams.get("gradeLevel") || "") as GradeLevel | "";
  const level = (searchParams.get("level") || "") as CourseLevel | "";
  const page = parseInt(searchParams.get("page") || "1", 10);

  const [localSearch, setLocalSearch] = useState(search);

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const current = Object.fromEntries(searchParams.entries());
      const next = { ...current, ...updates };
      // Remove empty keys
      Object.keys(next).forEach((k) => { if (!next[k]) delete next[k]; });
      setSearchParams(next);
    },
    [searchParams, setSearchParams]
  );

  const queryParams: CourseSearchParams = {
    page,
    pageSize: PAGE_SIZE,
    ...(search && { search }),
    ...(categoryId && { categoryId }),
    ...(subjectId && { subjectId }),
    ...(gradeLevel && { gradeLevel }),
    ...(level && { level }),
  };

  const { data: coursesData, isLoading: isLoadingCourses, isError: isErrorCourses } = useQuery({
    queryKey: ["public-courses", queryParams],
    queryFn: () => courseService.searchCourses(queryParams),
    staleTime: 60_000,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["public-categories"],
    queryFn: () => catalogService.listCategories(),
    staleTime: 300_000,
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ["public-subjects", categoryId],
    queryFn: () => categoryId ? catalogService.listSubjectsByCategory(categoryId) : Promise.resolve([]),
    enabled: !!categoryId,
    staleTime: 120_000,
  });

  const handleSearch = () => {
    updateParams({ search: localSearch, page: "1" });
  };

  const handleCategoryChange = (val: string) => {
    updateParams({ categoryId: val, subjectId: "", page: "1" });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-gradient-to-br from-indigo-700 to-violet-700 text-white py-14 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <h1 className="text-4xl font-bold mb-3">Khám phá khóa học</h1>
          <p className="text-indigo-200 text-lg mb-8">Tìm kiếm hàng ngàn khóa học chất lượng trên Edunity</p>
          <div className="flex gap-2 max-w-2xl mx-auto">
            <Input
              size="large"
              prefix={<SearchOutlined className="text-gray-400" />}
              placeholder="Tìm theo tên khóa học, môn học..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              onPressEnter={handleSearch}
              className="flex-1 rounded-xl"
            />
            <Button size="large" type="primary" onClick={handleSearch} className="bg-white text-indigo-700 font-bold rounded-xl hover:bg-indigo-50">
              Tìm kiếm
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 flex flex-col lg:flex-row gap-6">
        {/* Sidebar Filters */}
        <aside className="w-full lg:w-64 shrink-0">
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-5 sticky top-4">
            <div className="flex items-center gap-2 font-bold text-gray-800 text-base">
              <FilterOutlined />
              <span>Bộ lọc</span>
            </div>

            <div>
              <div className="text-xs font-bold text-gray-400 uppercase mb-2">Danh mục</div>
              <Select
                value={categoryId || undefined}
                onChange={handleCategoryChange}
                placeholder="Tất cả danh mục"
                allowClear
                className="w-full"
                options={categories.map((c) => ({ value: c.id, label: c.name }))}
              />
            </div>

            {categoryId && (
              <div>
                <div className="text-xs font-bold text-gray-400 uppercase mb-2">Môn học</div>
                <Select
                  value={subjectId || undefined}
                  onChange={(val) => updateParams({ subjectId: val || "", page: "1" })}
                  placeholder="Tất cả môn học"
                  allowClear
                  className="w-full"
                  options={subjects.map((s) => ({ value: s.id, label: s.name }))}
                />
              </div>
            )}

            <div>
              <div className="text-xs font-bold text-gray-400 uppercase mb-2">Cấp độ</div>
              <Select
                value={level || undefined}
                onChange={(val) => updateParams({ level: val || "", page: "1" })}
                placeholder="Tất cả cấp độ"
                allowClear
                className="w-full"
                options={COURSE_LEVELS.map((l) => ({ value: l, label: COURSE_LEVEL_LABELS[l] }))}
              />
            </div>

            <div>
              <div className="text-xs font-bold text-gray-400 uppercase mb-2">Khối lớp</div>
              <Select
                value={gradeLevel || undefined}
                onChange={(val) => updateParams({ gradeLevel: val || "", page: "1" })}
                placeholder="Tất cả khối lớp"
                allowClear
                className="w-full"
                options={GRADE_LEVELS.map((g) => ({ value: g, label: GRADE_LEVEL_LABELS[g] }))}
              />
            </div>

            {(categoryId || subjectId || level || gradeLevel || search) && (
              <Button
                block
                onClick={() => {
                  setLocalSearch("");
                  setSearchParams({});
                }}
                className="text-indigo-600 border-indigo-200"
              >
                Xóa bộ lọc
              </Button>
            )}
          </div>
        </aside>

        {/* Course Grid */}
        <div className="flex-1 min-w-0">
          {/* Active filter tags */}
          <div className="flex flex-wrap items-center gap-2 mb-4 min-h-[28px]">
            {search && <Tag closable onClose={() => { setLocalSearch(""); updateParams({ search: "", page: "1" }); }} color="blue">Tìm: {search}</Tag>}
            {categoryId && <Tag closable onClose={() => handleCategoryChange("")} color="purple">{categories.find(c => c.id === categoryId)?.name}</Tag>}
            {subjectId && <Tag closable onClose={() => updateParams({ subjectId: "", page: "1" })} color="cyan">{subjects.find(s => s.id === subjectId)?.name}</Tag>}
            {level && <Tag closable onClose={() => updateParams({ level: "", page: "1" })} color="green">{COURSE_LEVEL_LABELS[level as CourseLevel]}</Tag>}
            {gradeLevel && <Tag closable onClose={() => updateParams({ gradeLevel: "", page: "1" })} color="orange">{GRADE_LEVEL_LABELS[gradeLevel as GradeLevel]}</Tag>}
            {coursesData && <span className="text-gray-500 text-sm ml-auto">{coursesData.total} khóa học</span>}
          </div>

          {isLoadingCourses && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                  <Skeleton active paragraph={{ rows: 3 }} />
                </div>
              ))}
            </div>
          )}

          {isErrorCourses && (
            <Alert
              type="error"
              message="Không thể tải danh sách khóa học"
              description="Vui lòng thử lại sau."
              showIcon
              action={
                <Button onClick={() => window.location.reload()}>Tải lại</Button>
              }
            />
          )}

          {!isLoadingCourses && !isErrorCourses && coursesData?.items.length === 0 && (
            <Empty
              image={<AppstoreOutlined className="text-5xl text-gray-300" />}
              description={
                <div>
                  <p className="font-semibold text-gray-600 mb-1">Không tìm thấy khóa học phù hợp</p>
                  <p className="text-gray-400 text-sm">Hãy thử thay đổi từ khóa hoặc bộ lọc.</p>
                </div>
              }
            />
          )}

          {!isLoadingCourses && !isErrorCourses && coursesData && coursesData.items.length > 0 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {coursesData.items.map((course) => (
                  <div
                    key={course.id}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col"
                    onClick={() => navigate(ROUTES.COURSES.DETAIL.replace(":courseId", course.id))}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && navigate(ROUTES.COURSES.DETAIL.replace(":courseId", course.id))}
                  >
                    {/* Card color band */}
                    <div className="h-2 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-t-2xl" />
                    <div className="p-5 flex flex-col flex-1">
                      <div className="flex items-start gap-2 mb-2">
                        <span className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0">
                          <BookOutlined className="text-indigo-600 text-lg" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-indigo-500 font-semibold truncate">{course.categoryName} · {course.subjectName}</p>
                          <h3 className="font-bold text-gray-900 text-sm leading-snug line-clamp-2 group-hover:text-indigo-700 transition-colors">
                            {course.title}
                          </h3>
                        </div>
                      </div>

                      {course.description && (
                        <p className="text-gray-500 text-xs line-clamp-2 mb-3">{course.description}</p>
                      )}

                      <div className="flex flex-wrap gap-1.5 mt-auto">
                        {course.level && (
                          <Tag color="blue" className="text-xs rounded-full">{COURSE_LEVEL_LABELS[course.level]}</Tag>
                        )}
                        {course.gradeLevel && (
                          <Tag color="orange" className="text-xs rounded-full">{GRADE_LEVEL_LABELS[course.gradeLevel]}</Tag>
                        )}
                        {course.openClassCount !== undefined && (
                          <Badge
                            count={course.openClassCount}
                            showZero
                            color={course.openClassCount > 0 ? "green" : "gray"}
                            overflowCount={99}
                          >
                            <span className="text-xs text-gray-400 pr-1">lớp mở</span>
                          </Badge>
                        )}
                      </div>

                      <div className="pt-3 border-t border-gray-100 flex items-center justify-between mt-3 text-xs">
                        <span className="text-gray-400">Khóa học chuẩn</span>
                        <span className="font-semibold text-indigo-600 flex items-center gap-1 group-hover:underline">
                          Xem chi tiết &rarr;
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {coursesData.totalPages > 1 && (
                <div className="flex justify-center mt-8">
                  <Pagination
                    current={page}
                    total={coursesData.total}
                    pageSize={PAGE_SIZE}
                    onChange={(p) => updateParams({ page: String(p) })}
                    showSizeChanger={false}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
