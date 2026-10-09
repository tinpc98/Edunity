import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  Input,
  Select,
  Tag,
  Skeleton,
  Alert,
  Empty,
  Button,
  Pagination,
  Card,
} from "antd";
import {
  SearchOutlined,
  BookOutlined,
  PlusOutlined,
  FileTextOutlined,
  ApartmentOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import { courseService } from "../../../services/course.service";
import { catalogService } from "../../../services/catalog.service";
import type { Course, CourseSearchParams, GradeLevel, CourseLevel } from "../../../types/catalog";
import {
  GRADE_LEVELS,
  GRADE_LEVEL_LABELS,
  COURSE_LEVELS,
  COURSE_LEVEL_LABELS,
} from "../../../types/catalog";

export default function TeacherCourseCatalogPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [selectedGrade, setSelectedGrade] = useState<GradeLevel | "">("");
  const [selectedLevel, setSelectedLevel] = useState<CourseLevel | "">("");
  const [page, setPage] = useState(1);
  const pageSize = 12;

  // Categories query
  const { data: categories = [] } = useQuery({
    queryKey: ["public-categories"],
    queryFn: () => catalogService.listCategories(),
    staleTime: 300_000,
  });

  // Subjects query
  const { data: subjects = [] } = useQuery({
    queryKey: ["public-subjects", selectedCategory],
    queryFn: () => selectedCategory ? catalogService.listSubjectsByCategory(selectedCategory) : Promise.resolve([]),
    enabled: !!selectedCategory,
    staleTime: 120_000,
  });

  // Build params
  const searchParams: CourseSearchParams = {
    page,
    pageSize,
    search: search.trim() || undefined,
    categoryId: selectedCategory || undefined,
    subjectId: selectedSubject || undefined,
    gradeLevel: selectedGrade || undefined,
    level: selectedLevel || undefined,
  };

  // Courses query
  const { data: coursesData, isLoading, isError, error } = useQuery({
    queryKey: ["teacher-catalog-courses", searchParams],
    queryFn: () => courseService.searchCourses(searchParams),
    staleTime: 60_000,
  });

  const courses = coursesData?.items || [];
  const total = coursesData?.total || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <BookOutlined className="text-brand-600" />
            Danh mục khóa học
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Tra cứu toàn bộ khóa học chuẩn trong hệ thống để mở lớp hoặc gửi đề xuất khóa học mới.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/teacher/course-proposals">
            <Button icon={<FileTextOutlined />}>
              Đề xuất của tôi
            </Button>
          </Link>
          <Link to="/teacher/course-proposals?create=true">
            <Button type="primary" icon={<PlusOutlined />} className="bg-brand-600 hover:bg-brand-700">
              Đề xuất khóa học mới
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          <Input
            placeholder="Tìm theo tên hoặc mô tả..."
            prefix={<SearchOutlined className="text-gray-400" />}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            allowClear
          />

          <Select
            placeholder="Danh mục"
            value={selectedCategory || undefined}
            onChange={(val) => {
              setSelectedCategory(val || "");
              setSelectedSubject("");
              setPage(1);
            }}
            allowClear
            showSearch
            optionFilterProp="label"
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
          />

          <Select
            placeholder="Môn học"
            value={selectedSubject || undefined}
            onChange={(val) => {
              setSelectedSubject(val || "");
              setPage(1);
            }}
            allowClear
            disabled={!selectedCategory}
            showSearch
            optionFilterProp="label"
            options={subjects.map((s) => ({ value: s.id, label: s.name }))}
          />

          <Select
            placeholder="Khối lớp"
            value={selectedGrade || undefined}
            onChange={(val) => {
              setSelectedGrade(val || "");
              setPage(1);
            }}
            allowClear
            options={GRADE_LEVELS.map((g) => ({
              value: g,
              label: GRADE_LEVEL_LABELS[g],
            }))}
          />

          <Select
            placeholder="Cấp độ"
            value={selectedLevel || undefined}
            onChange={(val) => {
              setSelectedLevel(val || "");
              setPage(1);
            }}
            allowClear
            options={COURSE_LEVELS.map((lvl) => ({
              value: lvl,
              label: COURSE_LEVEL_LABELS[lvl],
            }))}
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="rounded-xl border border-gray-200 shadow-sm">
              <Skeleton active avatar={false} paragraph={{ rows: 3 }} />
            </Card>
          ))}
        </div>
      ) : isError ? (
        <Alert
          type="error"
          message="Lỗi tải danh mục khóa học"
          description={(error as any)?.message || "Vui lòng thử lại sau."}
          showIcon
        />
      ) : courses.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Empty description="Không tìm thấy khóa học nào phù hợp. Bạn có thể đề xuất khóa học mới!" />
          <Link to="/teacher/course-proposals?create=true" className="mt-4 inline-block">
            <Button type="primary" icon={<PlusOutlined />} className="bg-brand-600">
              Đề xuất khóa học mới
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {courses.map((course: Course) => (
              <div
                key={course.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden"
              >
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Tag color="blue" className="text-xs font-medium">
                        {course.categoryName}
                      </Tag>
                      <Tag color="cyan" className="text-xs font-medium">
                        {course.subjectName}
                      </Tag>
                      {course.level && (
                        <Tag color="purple" className="text-xs font-medium">
                          {COURSE_LEVEL_LABELS[course.level]}
                        </Tag>
                      )}
                      {course.gradeLevel && (
                        <Tag color="geekblue" className="text-xs font-medium">
                          {GRADE_LEVEL_LABELS[course.gradeLevel]}
                        </Tag>
                      )}
                    </div>

                    <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2">
                      {course.title}
                    </h3>

                    {course.description && (
                      <p className="text-xs text-gray-600 line-clamp-3 mb-4 leading-relaxed">
                        {course.description}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <ApartmentOutlined />
                      {course.openClassCount !== undefined
                        ? `${course.openClassCount} lớp đang mở`
                        : "Khóa học chính thức"}
                    </span>
                  </div>
                </div>

                <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2">
                  <Link
                    to={`/courses/${course.id}`}
                    target="_blank"
                    className="text-xs font-medium text-brand-600 hover:underline flex items-center gap-1"
                  >
                    <EyeOutlined /> Xem chi tiết
                  </Link>

                  <Button
                    size="small"
                    type="primary"
                    className="bg-brand-600 hover:bg-brand-700 text-xs"
                    onClick={() => {
                      navigate(`/teacher/classes/create?courseId=${course.id}`);
                    }}
                  >
                    Tạo lớp học
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {total > pageSize && (
            <div className="flex justify-center pt-4">
              <Pagination
                current={page}
                pageSize={pageSize}
                total={total}
                onChange={(p) => setPage(p)}
                showTotal={(t) => `Tổng ${t} khóa học`}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
