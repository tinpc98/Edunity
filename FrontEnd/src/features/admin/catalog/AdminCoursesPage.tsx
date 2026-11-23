import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Table,
  Button,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  Space,
  Descriptions,
  Alert,
  Skeleton,
  Empty,
  Popconfirm,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  BookOutlined,
  PlusOutlined,
  EditOutlined,
  EyeOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  StopOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { courseService } from "../../../services/course.service";
import { courseCatalogService as catalogService } from "../../../services/courseCatalog.service";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";
import type {
  Course,
  CreateCoursePayload,
  UpdateCoursePayload,
  GradeLevel,
  CourseLevel,
  CourseStatus,
} from "../../../types/catalog";
import {
  GRADE_LEVELS,
  offeredGradeLevels,
  GRADE_LEVEL_LABELS,
  COURSE_LEVELS,
  COURSE_LEVEL_LABELS,
  COURSE_STATUS_LABELS,
} from "../../../types/catalog";

const { TextArea } = Input;

function renderCourseStatusTag(status: CourseStatus) {
  if (status === "ACTIVE") {
    return <Tag color="success">{COURSE_STATUS_LABELS.ACTIVE}</Tag>;
  }
  return <Tag color="default">{COURSE_STATUS_LABELS.INACTIVE}</Tag>;
}

function parseGradeParam(raw: string | null): GradeLevel | "" {
  if (raw && (GRADE_LEVELS as readonly string[]).includes(raw)) {
    return raw as GradeLevel;
  }
  return "";
}

function parseLevelParam(raw: string | null): CourseLevel | "" {
  if (raw && (COURSE_LEVELS as readonly string[]).includes(raw)) {
    return raw as CourseLevel;
  }
  return "";
}

function parseStatusParam(raw: string | null): CourseStatus | "ALL" {
  if (raw === "ACTIVE" || raw === "INACTIVE") return raw;
  return "ALL";
}

function parsePageParam(raw: string | null): number {
  if (!raw || !/^\d+$/.test(raw)) return 1;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 1;
}

export default function AdminCoursesPage() {
  const queryClient = useQueryClient();
  const [messageApi, contextHolder] = message.useMessage();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters from URL
  const courseSearch = searchParams.get("search") || "";
  const courseCatFilter = searchParams.get("categoryId") || "";
  const courseSubFilter = searchParams.get("subjectId") || "";
  const courseGradeFilter = parseGradeParam(searchParams.get("gradeLevel"));
  const courseLevelFilter = parseLevelParam(searchParams.get("level"));
  const courseStatusFilter = parseStatusParam(searchParams.get("status"));
  const coursePage = parsePageParam(searchParams.get("page"));

  const [searchDraft, setSearchDraft] = useState<string | null>(null);
  const searchInput = searchDraft ?? courseSearch;

  const updateSearchParams = useCallback(
    (updates: Record<string, string | undefined>, options?: { replace?: boolean }) => {
      const next: Record<string, string> = {};
      searchParams.forEach((val, key) => {
        if (val) next[key] = val;
      });
      Object.entries(updates).forEach(([key, val]) => {
        if (!val || (key === "page" && val === "1") || (key === "status" && val === "ALL")) {
          delete next[key];
        } else {
          next[key] = val;
        }
      });
      setSearchParams(next, options);
    },
    [searchParams, setSearchParams]
  );

  // Debounce searchDraft -> URL search param (300ms)
  useEffect(() => {
    if (searchDraft === null) return;
    const trimmedInput = searchDraft.trim();
    const trimmedUrl = courseSearch.trim();
    if (trimmedInput === trimmedUrl) return;

    const timer = window.setTimeout(() => {
      setSearchDraft(null);
      updateSearchParams(
        { search: trimmedInput || undefined, page: "1" },
        { replace: true }
      );
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchDraft, courseSearch, updateSearchParams]);

  // Modals state
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [courseForm] = Form.useForm();
  const [courseModalCategoryId, setCourseModalCategoryId] = useState<string>("");

  // Course Detail Modal state
  const [viewingCourseId, setViewingCourseId] = useState<string | null>(null);

  // Soft delete state
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [deleteReasonInput, setDeleteReasonInput] = useState<string>("");
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteErrorMsg, setDeleteErrorMsg] = useState<string | null>(null);

  // Categories query
  const { data: categories = [] } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => catalogService.listCategories(),
    staleTime: 60_000,
  });

  // Filter subjects query (based on selected category filter)
  const { data: filterSubjects = [] } = useQuery({
    queryKey: ["admin-subjects", courseCatFilter],
    queryFn: () =>
      courseCatFilter
        ? catalogService.listSubjectsByCategory(courseCatFilter)
        : Promise.resolve([]),
    enabled: !!courseCatFilter,
    staleTime: 60_000,
  });

  // Modal subjects query (based on selected category in modal)
  const { data: modalSubjects = [] } = useQuery({
    queryKey: ["modal-subjects", courseModalCategoryId],
    queryFn: () =>
      courseModalCategoryId
        ? catalogService.listSubjectsByCategory(courseModalCategoryId)
        : Promise.resolve([]),
    enabled: !!courseModalCategoryId,
    staleTime: 60_000,
  });

  // Allowed grade levels for category in modal. An older grade stays selectable on its own course.
  const allowedCourseModalGradeLevels = useMemo(() => {
    const offered = offeredGradeLevels(categories.find((c) => c.id === courseModalCategoryId));
    const current = editingCourse?.gradeLevel;
    return current && !offered.includes(current) ? [current, ...offered] : offered;
  }, [categories, courseModalCategoryId, editingCourse]);
  // Only a course saved without a grade may stay without one
  const courseGradeRequired = !editingCourse || Boolean(editingCourse.gradeLevel);

  // Main Courses query using adminListCourses (supports ACTIVE & INACTIVE & status filter)
  const {
    data: coursesData,
    isLoading: loadingCourses,
    isError: isErrorCourses,
    error: errorCourses,
    refetch: refetchCourses,
  } = useQuery({
    queryKey: [
      "admin-courses",
      coursePage,
      courseSearch.trim(),
      courseCatFilter,
      courseSubFilter,
      courseGradeFilter,
      courseLevelFilter,
      courseStatusFilter,
    ],
    queryFn: () =>
      courseService.adminListCourses({
        page: coursePage,
        pageSize: 10,
        search: courseSearch.trim() || undefined,
        categoryId: courseCatFilter || undefined,
        subjectId: courseSubFilter || undefined,
        gradeLevel: courseGradeFilter || undefined,
        level: courseLevelFilter || undefined,
        status: courseStatusFilter,
      }),
    staleTime: 60_000,
  });

  // Course Detail query using adminGetCourse (returns course regardless of ACTIVE/INACTIVE)
  const {
    data: detailCourse,
    isLoading: loadingCourseDetail,
    isError: isErrorCourseDetail,
    error: errorCourseDetail,
    refetch: refetchCourseDetail,
  } = useQuery({
    queryKey: ["admin-course-detail", viewingCourseId],
    queryFn: () => viewingCourseId ? courseService.adminGetCourse(viewingCourseId) : Promise.resolve(null),
    enabled: !!viewingCourseId,
    staleTime: 30_000,
  });

  // Save (Create/Update) mutation
  const saveCourseMutation = useMutation({
    mutationFn: async (values: any) => {
      if (editingCourse) {
        const payload: UpdateCoursePayload = {
          title: values.title.trim(),
          description: values.description?.trim() || undefined,
          learningObjectives: values.learningObjectives?.trim() || undefined,
          syllabus: values.syllabus?.trim() || undefined,
          level: values.level || undefined,
          gradeLevel: values.gradeLevel || null,
          prerequisites: values.prerequisites?.trim() || undefined,
          curriculumReference: values.curriculumReference?.trim() || undefined,
          status: values.status,
        };
        return courseService.updateCourse(editingCourse.id, payload);
      }
      const payload: CreateCoursePayload = {
        subjectId: values.subjectId,
        title: values.title.trim(),
        description: values.description?.trim() || undefined,
        learningObjectives: values.learningObjectives?.trim() || undefined,
        syllabus: values.syllabus?.trim() || undefined,
        level: values.level || undefined,
        gradeLevel: values.gradeLevel || null,
        prerequisites: values.prerequisites?.trim() || undefined,
        curriculumReference: values.curriculumReference?.trim() || undefined,
      };
      return courseService.createCourse(payload);
    },
    onSuccess: () => {
      messageApi.success(editingCourse ? "Đã cập nhật khóa học!" : "Đã tạo khóa học mới!");
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      queryClient.invalidateQueries({ queryKey: ["admin-course-detail"] });
      queryClient.invalidateQueries({ queryKey: ["public-courses"] });
      setIsCourseModalOpen(false);
      courseForm.resetFields();
    },
    onError: (err: unknown) => {
      messageApi.error(getFriendlyErrorMessage(err, "Lỗi thao tác khóa học"));
    },
  });

  // Toggle status mutation (ACTIVE <-> INACTIVE)
  const toggleCourseStatusMutation = useMutation({
    mutationFn: async ({ id, nextStatus }: { id: string; nextStatus: CourseStatus }) => {
      return courseService.updateCourse(id, { status: nextStatus });
    },
    onSuccess: (_, variables) => {
      messageApi.success(
        variables.nextStatus === "ACTIVE"
          ? "Đã kích hoạt lại khóa học thành công!"
          : "Đã tạm ngưng khóa học thành công!"
      );
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      queryClient.invalidateQueries({ queryKey: ["admin-course-detail", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["public-courses"] });
    },
    onError: (err: unknown) => {
      messageApi.error(getFriendlyErrorMessage(err, "Không thể thay đổi trạng thái khóa học"));
    },
  });

  // Delete mutation
  const deleteCourseMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      courseService.deleteCourse(id, reason),
    onSuccess: () => {
      messageApi.success("Đã chuyển khóa học vào Thùng rác thành công!");
      setIsDeleteModalOpen(false);
      setDeleteTarget(null);
      setDeleteReasonInput("");
      setDeleteErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      queryClient.invalidateQueries({ queryKey: ["public-courses"] });
      queryClient.invalidateQueries({ queryKey: ["adminTrash"] });
    },
    onError: (err: unknown) => {
      setDeleteErrorMsg(
        getFriendlyErrorMessage(err, "Không thể xóa khóa học này do có lớp học hoặc ràng buộc liên quan.")
      );
    },
  });

  const handleOpenCourseModal = (course?: Course) => {
    if (course) {
      setEditingCourse(course);
      setCourseModalCategoryId(course.categoryId);
      courseForm.setFieldsValue({
        categoryId: course.categoryId,
        subjectId: course.subjectId,
        title: course.title,
        gradeLevel: course.gradeLevel,
        level: course.level,
        description: course.description,
        learningObjectives: course.learningObjectives,
        syllabus: course.syllabus,
        prerequisites: course.prerequisites,
        curriculumReference: course.curriculumReference,
        status: course.status,
      });
    } else {
      setEditingCourse(null);
      const defaultCatId = categories.find((c) => offeredGradeLevels(c).length > 0)?.id || "";
      setCourseModalCategoryId(defaultCatId);
      courseForm.resetFields();
      courseForm.setFieldsValue({
        categoryId: defaultCatId,
        status: "ACTIVE",
      });
    }
    setIsCourseModalOpen(true);
  };

  const handleOpenDeleteModal = (course: Course) => {
    setDeleteTarget(course);
    setDeleteReasonInput("");
    setDeleteErrorMsg(null);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    deleteCourseMutation.mutate({ id: deleteTarget.id, reason: deleteReasonInput });
  };

  const handleResetFilters = () => {
    setSearchDraft(null);
    setSearchParams({});
  };

  const columns: ColumnsType<Course> = [
    {
      title: "Khóa học & Mã tham chiếu",
      dataIndex: "title",
      key: "title",
      render: (title: string, record: Course) => (
        <div>
          <div className="font-semibold text-slate-800">{title}</div>
          <div className="font-mono text-xs text-slate-500 mt-0.5">{record.slug}</div>
          {record.curriculumReference && (
            <div className="text-[11px] text-teal-700 mt-0.5 flex items-center gap-1 font-medium">
              <span>📖 Sách:</span>
              <span className="font-semibold">{record.curriculumReference}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Danh mục & Môn",
      key: "cat_sub",
      render: (_: unknown, record: Course) => (
        <div className="space-y-1">
          <Tag color="teal" className="text-xs block w-fit">
            {record.categoryName}
          </Tag>
          <Tag color="cyan" className="text-xs block w-fit">
            {record.subjectName}
          </Tag>
        </div>
      ),
    },
    {
      title: "Khối lớp & Cấp độ",
      key: "grade_level",
      render: (_: unknown, record: Course) => (
        <div className="space-y-1">
          {record.gradeLevel ? (
            <Tag color="blue" className="text-xs block w-fit">
              {GRADE_LEVEL_LABELS[record.gradeLevel] || record.gradeLevel}
            </Tag>
          ) : (
            <span className="text-slate-400 text-xs block">Không gán khối</span>
          )}
          {record.level && (
            <Tag color="purple" className="text-xs block w-fit">
              {COURSE_LEVEL_LABELS[record.level] || record.level}
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 140,
      render: (status: CourseStatus) => renderCourseStatusTag(status),
    },
    {
      title: "Ngày tạo",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 130,
      render: (date: string) => (
        <span className="text-xs text-slate-600 font-mono">
          {date ? dayjs(date).format("DD/MM/YYYY") : "—"}
        </span>
      ),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 160,
      align: "right",
      render: (_: unknown, record: Course) => (
        <Space size="small">
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setViewingCourseId(record.id)}
            title="Xem chi tiết"
          />
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenCourseModal(record)}
            title="Chỉnh sửa"
          />
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleOpenDeleteModal(record)}
            title="Chuyển vào thùng rác"
          />
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-5 p-6 bg-[#F8FAFC] min-h-screen">
      {contextHolder}

      {/* Page Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Admin</span>
            <span>›</span>
            <span className="font-semibold text-teal-700">Khóa học chuẩn</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center text-lg">
              <BookOutlined />
            </div>
            <h1 className="text-xl font-bold text-[#163B40] m-0">Quản lý Khóa học chuẩn</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1 mb-0">
            Kiểm soát nội dung, tiêu chuẩn đầu ra và thời lượng của từng khóa học chuẩn trên toàn nền tảng.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            icon={<ReloadOutlined />}
            onClick={() => refetchCourses()}
            loading={loadingCourses}
          >
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => handleOpenCourseModal()}
            className="bg-[#0F766E] hover:bg-[#0D9488] border-none font-semibold rounded-xl"
          >
            Thêm khóa học
          </Button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
          {/* Search */}
          <div className="md:col-span-2">
            <Input
              prefix={<SearchOutlined className="text-slate-400" />}
              placeholder="Tìm theo tên khóa học, slug, sách..."
              value={searchInput}
              onChange={(e) => setSearchDraft(e.target.value)}
              allowClear
            />
          </div>

          {/* Category Filter */}
          <div>
            <Select
              className="w-full"
              placeholder="Tất cả danh mục"
              allowClear
              value={courseCatFilter || undefined}
              onChange={(val) =>
                updateSearchParams({ categoryId: val, subjectId: undefined, page: "1" })
              }
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>

          {/* Subject Filter */}
          <div>
            <Select
              className="w-full"
              placeholder="Tất cả môn học"
              allowClear
              disabled={!courseCatFilter}
              value={courseSubFilter || undefined}
              onChange={(val) => updateSearchParams({ subjectId: val, page: "1" })}
              options={filterSubjects.map((s) => ({ value: s.id, label: s.name }))}
            />
          </div>

          {/* Grade Level Filter */}
          <div>
            <Select
              className="w-full"
              placeholder="Khối lớp"
              allowClear
              value={courseGradeFilter || undefined}
              onChange={(val) => updateSearchParams({ gradeLevel: val, page: "1" })}
              options={GRADE_LEVELS.map((g) => ({
                value: g,
                label: GRADE_LEVEL_LABELS[g],
              }))}
            />
          </div>

          {/* Status Filter (Supports ACTIVE, INACTIVE, ALL) */}
          <div>
            <Select
              className="w-full"
              placeholder="Trạng thái"
              value={courseStatusFilter}
              onChange={(val) => updateSearchParams({ status: val, page: "1" })}
              options={[
                { value: "ALL", label: "Tất cả trạng thái" },
                { value: "ACTIVE", label: "Hoạt động (ACTIVE)" },
                { value: "INACTIVE", label: "Tạm ngưng (INACTIVE)" },
              ]}
            />
          </div>
        </div>

        {/* Filter Summary & Reset */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
          <span className="text-slate-500">
            Hiển thị kết quả tìm kiếm với đầy đủ trạng thái <strong>ACTIVE</strong> và <strong>INACTIVE</strong>.
          </span>
          <Button size="small" onClick={handleResetFilters}>
            Xóa bộ lọc
          </Button>
        </div>
      </div>

      {/* Error state */}
      {isErrorCourses && (
        <Alert
          type="error"
          showIcon
          message="Không thể tải danh sách khóa học"
          description={getFriendlyErrorMessage(errorCourses, "Vui lòng kiểm tra lại kết nối mạng hoặc thử lại sau.")}
          action={
            <Button size="small" onClick={() => refetchCourses()}>
              Thử lại
            </Button>
          }
        />
      )}

      {/* Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loadingCourses ? (
          <div className="p-6">
            <Skeleton active paragraph={{ rows: 6 }} />
          </div>
        ) : !coursesData || coursesData.items.length === 0 ? (
          <div className="p-12 text-center">
            <Empty description="Không tìm thấy khóa học nào phù hợp với điều kiện lọc">
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => handleOpenCourseModal()}
                className="bg-[#0F766E] hover:bg-[#0D9488] border-none"
              >
                Tạo khóa học mới
              </Button>
            </Empty>
          </div>
        ) : (
          <Table<Course>
            columns={columns}
            dataSource={coursesData.items}
            rowKey="id"
            pagination={{
              current: coursesData.page,
              pageSize: coursesData.pageSize,
              total: coursesData.total,
              showTotal: (total) => `Tổng số ${total} khóa học`,
              onChange: (p) => updateSearchParams({ page: String(p) }),
            }}
          />
        )}
      </div>

      {/* Modal: Create / Edit Course */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-base font-bold text-[#163B40]">
            <BookOutlined className="text-teal-600" />
            <span>{editingCourse ? "Chỉnh sửa khóa học" : "Tạo khóa học chuẩn mới"}</span>
          </div>
        }
        open={isCourseModalOpen}
        onCancel={() => {
          if (saveCourseMutation.isPending) return;
          setIsCourseModalOpen(false);
          courseForm.resetFields();
        }}
        footer={null}
        width={700}
        destroyOnClose
      >
        <Form
          form={courseForm}
          layout="vertical"
          onFinish={(values) => saveCourseMutation.mutate(values)}
          className="mt-4"
        >
          {!editingCourse && (
            <div className="grid grid-cols-2 gap-4">
              <Form.Item
                name="categoryId"
                label="Danh mục cha"
                rules={[{ required: true, message: "Vui lòng chọn danh mục" }]}
              >
                <Select
                  options={categories.map((c) => ({ value: c.id, label: c.name, disabled: offeredGradeLevels(c).length === 0 }))}
                  onChange={(val) => {
                    setCourseModalCategoryId(val);
                    courseForm.setFieldsValue({ subjectId: undefined, gradeLevel: undefined });
                  }}
                  placeholder="Chọn danh mục"
                />
              </Form.Item>

              <Form.Item
                name="subjectId"
                label="Môn học"
                rules={[{ required: true, message: "Vui lòng chọn môn học" }]}
              >
                <Select
                  options={modalSubjects.map((s) => ({ value: s.id, label: s.name }))}
                  placeholder="Chọn môn học"
                />
              </Form.Item>
            </div>
          )}

          <Form.Item
            name="title"
            label="Tên khóa học"
            rules={[{ required: true, whitespace: true, message: "Vui lòng nhập tên khóa học" }]}
          >
            <Input placeholder="vd: Toán nâng cao lớp 10, Luyện thi IELTS 6.5+..." />
          </Form.Item>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              name="gradeLevel"
              label="Khối lớp"
              rules={[{ required: courseGradeRequired, message: "Vui lòng chọn khối lớp" }]}
              extra={editingCourse ? "Đổi khối sẽ đổi khối của mọi lớp thuộc khóa này." : undefined}
            >
              <Select
                allowClear={!courseGradeRequired}
                placeholder="Chọn khối lớp"
                options={allowedCourseModalGradeLevels.map((g) => ({
                  value: g,
                  label: GRADE_LEVEL_LABELS[g],
                }))}
              />
            </Form.Item>

            <Form.Item name="level" label="Cấp độ (tùy chọn)">
              <Select
                allowClear
                placeholder="Chọn cấp độ"
                options={COURSE_LEVELS.map((l) => ({
                  value: l,
                  label: COURSE_LEVEL_LABELS[l],
                }))}
              />
            </Form.Item>
          </div>

          <Form.Item name="curriculumReference" label="Sách / Chương trình tham chiếu">
            <Input placeholder="vd: Cánh Diều, Kết Nối Tri Thức, Cambridge..." />
          </Form.Item>

          <Form.Item name="description" label="Mô tả khóa học">
            <TextArea rows={3} placeholder="Mô tả nội dung, đối tượng phù hợp..." />
          </Form.Item>

          <Form.Item name="learningObjectives" label="Mục tiêu học tập">
            <TextArea rows={2} placeholder="Học viên sẽ đạt được những kiến thức gì..." />
          </Form.Item>

          <Form.Item name="syllabus" label="Khung giáo trình tóm tắt">
            <TextArea rows={2} placeholder="Tóm tắt các chủ đề hoặc bài học chính..." />
          </Form.Item>

          <Form.Item name="prerequisites" label="Yêu cầu tiên quyết">
            <Input placeholder="Kiến thức nền tảng học viên cần có trước..." />
          </Form.Item>

          {editingCourse && (
            <Form.Item name="status" label="Trạng thái khóa học">
              <Select
                options={[
                  { value: "ACTIVE", label: "Hoạt động (ACTIVE)" },
                  { value: "INACTIVE", label: "Tạm ngưng (INACTIVE)" },
                ]}
              />
            </Form.Item>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button
              disabled={saveCourseMutation.isPending}
              onClick={() => setIsCourseModalOpen(false)}
            >
              Hủy
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={saveCourseMutation.isPending}
              className="bg-[#0F766E] hover:bg-[#0D9488] border-none font-semibold"
            >
              {editingCourse ? "Lưu thay đổi" : "Tạo khóa học"}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Modal: View Course Detail (Full details for both ACTIVE and INACTIVE) */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-base font-bold text-[#163B40]">
            <BookOutlined className="text-teal-600" />
            <span>Chi tiết khóa học: {detailCourse?.title || ""}</span>
          </div>
        }
        open={!!viewingCourseId}
        onCancel={() => setViewingCourseId(null)}
        footer={[
          <Button key="close" onClick={() => setViewingCourseId(null)}>
            Đóng
          </Button>,
          detailCourse && (
            detailCourse.status === "ACTIVE" ? (
              <Popconfirm
                key="deactivate"
                title="Tạm ngưng khóa học này?"
                description="Các lớp học đang mở sẽ không thể tuyển sinh mới."
                onConfirm={() =>
                  toggleCourseStatusMutation.mutate({
                    id: detailCourse.id,
                    nextStatus: "INACTIVE",
                  })
                }
                okText="Tạm ngưng"
                cancelText="Hủy"
                okButtonProps={{ danger: true }}
              >
                <Button
                  danger
                  icon={<StopOutlined />}
                  loading={toggleCourseStatusMutation.isPending}
                >
                  Tạm ngưng khóa học
                </Button>
              </Popconfirm>
            ) : (
              <Popconfirm
                key="activate"
                title="Kích hoạt lại khóa học này?"
                description="Khóa học sẽ hiển thị trở lại cho giáo viên mở lớp và tuyển sinh."
                onConfirm={() =>
                  toggleCourseStatusMutation.mutate({
                    id: detailCourse.id,
                    nextStatus: "ACTIVE",
                  })
                }
                okText="Kích hoạt"
                cancelText="Hủy"
              >
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  loading={toggleCourseStatusMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  Kích hoạt lại
                </Button>
              </Popconfirm>
            )
          ),
        ]}
        width={760}
      >
        {loadingCourseDetail ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : isErrorCourseDetail ? (
          <Alert
            type="error"
            showIcon
            message="Không thể tải chi tiết khóa học"
            description={getFriendlyErrorMessage(errorCourseDetail)}
            action={
              <Button size="small" onClick={() => refetchCourseDetail()}>
                Thử lại
              </Button>
            }
          />
        ) : detailCourse ? (
          <div className="space-y-4 mt-4">
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Tên khóa học" span={2}>
                <span className="font-semibold text-slate-800">{detailCourse.title}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Đường dẫn (Slug)" span={2}>
                <span className="font-mono text-xs text-slate-600">{detailCourse.slug}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Danh mục">
                <Tag color="teal">{detailCourse.categoryName}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Môn học">
                <Tag color="cyan">{detailCourse.subjectName}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Khối lớp">
                {detailCourse.gradeLevel ? (
                  <Tag color="blue">{GRADE_LEVEL_LABELS[detailCourse.gradeLevel]}</Tag>
                ) : (
                  <span className="text-slate-400">Chưa gán</span>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Cấp độ">
                {detailCourse.level ? (
                  <Tag color="purple">{COURSE_LEVEL_LABELS[detailCourse.level]}</Tag>
                ) : (
                  <span className="text-slate-400">Không xác định</span>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Sách tham chiếu" span={2}>
                {detailCourse.curriculumReference ? (
                  <span className="font-medium text-teal-800">{detailCourse.curriculumReference}</span>
                ) : (
                  <span className="text-slate-400 italic">Không có</span>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Số lớp đang mở">
                <span className="font-semibold text-emerald-600">
                  {detailCourse.openClassCount !== undefined
                    ? `${detailCourse.openClassCount} lớp`
                    : "0 lớp"}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                {renderCourseStatusTag(detailCourse.status)}
              </Descriptions.Item>
              <Descriptions.Item label="Mô tả" span={2}>
                {detailCourse.description || <span className="text-slate-400 italic">Chưa có mô tả</span>}
              </Descriptions.Item>
              <Descriptions.Item label="Mục tiêu học tập" span={2}>
                {detailCourse.learningObjectives || <span className="text-slate-400 italic">Chưa có mục tiêu</span>}
              </Descriptions.Item>
              <Descriptions.Item label="Yêu cầu tiên quyết" span={2}>
                {detailCourse.prerequisites || <span className="text-slate-400 italic">Không có</span>}
              </Descriptions.Item>
              <Descriptions.Item label="Ngày tạo">
                <span className="font-mono text-xs text-slate-600">
                  {detailCourse.createdAt ? dayjs(detailCourse.createdAt).format("DD/MM/YYYY HH:mm:ss") : "—"}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Cập nhật gần nhất">
                <span className="font-mono text-xs text-slate-600">
                  {detailCourse.updatedAt ? dayjs(detailCourse.updatedAt).format("DD/MM/YYYY HH:mm:ss") : "—"}
                </span>
              </Descriptions.Item>
            </Descriptions>
          </div>
        ) : null}
      </Modal>

      {/* Modal: Soft Delete Confirmation */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-rose-600 font-bold">
            <DeleteOutlined />
            <span>Xác nhận chuyển khóa học vào Thùng rác</span>
          </div>
        }
        open={isDeleteModalOpen}
        onCancel={() => {
          if (deleteCourseMutation.isPending) return;
          setIsDeleteModalOpen(false);
          setDeleteTarget(null);
        }}
        footer={[
          <Button
            key="cancel"
            disabled={deleteCourseMutation.isPending}
            onClick={() => setIsDeleteModalOpen(false)}
          >
            Hủy
          </Button>,
          <Button
            key="delete"
            danger
            type="primary"
            loading={deleteCourseMutation.isPending}
            onClick={handleConfirmDelete}
          >
            Chuyển vào Thùng rác
          </Button>,
        ]}
      >
        <div className="space-y-3 py-2">
          <p className="text-xs text-slate-600">
            Bạn có chắc chắn muốn chuyển khóa học <strong>{deleteTarget?.title}</strong> vào Thùng rác không?
          </p>
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
            ⚠️ <strong>Lưu ý an toàn:</strong> Khóa học chỉ có thể xóa khi không còn lớp học nào đang mở hoặc đã thu học phí. Khóa học trong Thùng rác có thể được phục hồi lại.
          </div>
          {deleteErrorMsg && (
            <Alert
              type="error"
              showIcon
              message="Không thể xóa khóa học này"
              description={deleteErrorMsg}
            />
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Lý do xóa (tùy chọn):
            </label>
            <TextArea
              rows={2}
              value={deleteReasonInput}
              onChange={(e) => setDeleteReasonInput(e.target.value)}
              placeholder="Nhập lý do xóa khóa học này..."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
