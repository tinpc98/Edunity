import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Tabs,
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
import {
  FolderOutlined,
  ReadOutlined,
  BookOutlined,
  PlusOutlined,
  EditOutlined,
  EyeOutlined,
  SearchOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  StopOutlined,
  FileTextOutlined,
  DollarOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { courseCatalogService as catalogService } from "../../../services/courseCatalog.service";
import { courseService } from "../../../services/course.service";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";
import type {
  Category,
  Subject,
  Course,
  CreateCategoryPayload,
  UpdateCategoryPayload,
  CreateSubjectPayload,
  UpdateSubjectPayload,
  CreateCoursePayload,
  UpdateCoursePayload,
  GradeLevel,
  CourseLevel,
  CatalogStatus,
  CourseStatus,
} from "../../../types/catalog";
import {
  GRADE_LEVELS,
  GRADE_LEVEL_LABELS,
  COURSE_LEVELS,
  COURSE_LEVEL_LABELS,
  COURSE_STATUS_LABELS,
} from "../../../types/catalog";
import AdminSyllabusManagementPage from "./AdminSyllabusManagementPage";
import AdminPricingPoliciesPage from "./AdminPricingPoliciesPage";

const { TextArea } = Input;

function renderCourseStatusTag(status: CourseStatus) {
  if (status === "DRAFT") {
    return <Tag color="gold">{COURSE_STATUS_LABELS.DRAFT}</Tag>;
  }
  if (status === "ACTIVE") {
    return <Tag color="success">{COURSE_STATUS_LABELS.ACTIVE}</Tag>;
  }
  return <Tag color="default">{COURSE_STATUS_LABELS.INACTIVE}</Tag>;
}

const VALID_TABS = ["categories", "subjects", "courses", "syllabus", "pricing"] as const;
type CatalogTab = (typeof VALID_TABS)[number];

function parseTabParam(raw: string | null): CatalogTab {
  if (raw && (VALID_TABS as readonly string[]).includes(raw)) {
    return raw as CatalogTab;
  }
  return "categories";
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

function parsePageParam(raw: string | null): number {
  if (!raw || !/^\d+$/.test(raw)) return 1;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 1;
}

export default function AdminCatalogPage() {
  const queryClient = useQueryClient();
  const [messageApi, contextHolder] = message.useMessage();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = parseTabParam(searchParams.get("tab"));
  const courseSearch = searchParams.get("search") || "";
  const courseCatFilter = searchParams.get("categoryId") || "";
  const courseSubFilter = searchParams.get("subjectId") || "";
  const courseGradeFilter = parseGradeParam(searchParams.get("gradeLevel"));
  const courseLevelFilter = parseLevelParam(searchParams.get("level"));
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
        if (!val || (key === "tab" && val === "categories") || (key === "page" && val === "1")) {
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

  // ==========================================
  // TAB 1: CATEGORIES
  // ==========================================
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm] = Form.useForm();

  const {
    data: categories = [],
    isLoading: loadingCategories,
    isError: isErrorCategories,
    error: errorCategories,
    refetch: refetchCategories,
  } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => catalogService.listCategories(),
    staleTime: 60_000,
  });

  const saveCategoryMutation = useMutation({
    mutationFn: async (values: CreateCategoryPayload | UpdateCategoryPayload) => {
      if (editingCategory) {
        return catalogService.updateCategory(editingCategory.id, values as UpdateCategoryPayload);
      }
      return catalogService.createCategory(values as CreateCategoryPayload);
    },
    onSuccess: () => {
      messageApi.success(editingCategory ? "Đã cập nhật danh mục!" : "Đã tạo danh mục mới!");
      queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
      queryClient.invalidateQueries({ queryKey: ["public-categories"] });
      queryClient.invalidateQueries({ queryKey: ["catalog", "categories"] });
      queryClient.invalidateQueries({ queryKey: ["admin-subjects"] });
      queryClient.invalidateQueries({ queryKey: ["public-subjects"] });
      queryClient.invalidateQueries({ queryKey: ["modal-subjects"] });
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      queryClient.invalidateQueries({ queryKey: ["admin-course-detail"] });
      queryClient.invalidateQueries({ queryKey: ["public-courses"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-catalog-courses"] });
      queryClient.invalidateQueries({ queryKey: ["admin-course-proposals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-course-proposal-detail"] });
      setIsCategoryModalOpen(false);
      categoryForm.resetFields();
    },
    onError: (err: unknown) => {
      messageApi.error(getFriendlyErrorMessage(err, "Lỗi thao tác danh mục"));
    },
  });

  const handleOpenCategoryModal = (cat?: Category) => {
    if (cat) {
      setEditingCategory(cat);
      categoryForm.setFieldsValue({
        name: cat.name,
        description: cat.description,
        status: cat.status,
      });
    } else {
      setEditingCategory(null);
      categoryForm.resetFields();
      categoryForm.setFieldsValue({ status: "ACTIVE" });
    }
    setIsCategoryModalOpen(true);
  };

  // ==========================================
  // TAB 2: SUBJECTS
  // ==========================================
  const [selectedCatFilter, setSelectedCatFilter] = useState<string>("");
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subjectForm] = Form.useForm();

  // If a category is selected in filter, load subjects for it, otherwise default to first category if available
  const activeCategoryIdForSubjects = selectedCatFilter || (categories[0]?.id ?? "");

  const {
    data: subjects = [],
    isLoading: loadingSubjects,
    isError: isErrorSubjects,
    error: errorSubjects,
    refetch: refetchSubjects,
  } = useQuery({
    queryKey: ["admin-subjects", activeCategoryIdForSubjects],
    queryFn: () => activeCategoryIdForSubjects ? catalogService.listSubjectsByCategory(activeCategoryIdForSubjects) : Promise.resolve([]),
    enabled: !!activeCategoryIdForSubjects,
    staleTime: 60_000,
  });

  const saveSubjectMutation = useMutation({
    mutationFn: async (values: CreateSubjectPayload | UpdateSubjectPayload) => {
      if (editingSubject) {
        return catalogService.updateSubject(editingSubject.id, values as UpdateSubjectPayload);
      }
      return catalogService.createSubject(values as CreateSubjectPayload);
    },
    onSuccess: () => {
      messageApi.success(editingSubject ? "Đã cập nhật môn học!" : "Đã tạo môn học mới!");
      queryClient.invalidateQueries({ queryKey: ["admin-subjects"] });
      queryClient.invalidateQueries({ queryKey: ["public-subjects"] });
      queryClient.invalidateQueries({ queryKey: ["modal-subjects"] });
      queryClient.invalidateQueries({ queryKey: ["catalog", "categories"] });
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      queryClient.invalidateQueries({ queryKey: ["admin-course-detail"] });
      queryClient.invalidateQueries({ queryKey: ["public-courses"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-catalog-courses"] });
      queryClient.invalidateQueries({ queryKey: ["admin-course-proposals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-course-proposal-detail"] });
      setIsSubjectModalOpen(false);
      subjectForm.resetFields();
    },
    onError: (err: unknown) => {
      messageApi.error(getFriendlyErrorMessage(err, "Lỗi thao tác môn học"));
    },
  });

  const handleOpenSubjectModal = (sub?: Subject) => {
    if (sub) {
      setEditingSubject(sub);
      subjectForm.setFieldsValue({
        categoryId: sub.categoryId,
        name: sub.name,
        description: sub.description,
        status: sub.status,
      });
    } else {
      setEditingSubject(null);
      subjectForm.resetFields();
      subjectForm.setFieldsValue({
        categoryId: activeCategoryIdForSubjects,
        status: "ACTIVE",
      });
    }
    setIsSubjectModalOpen(true);
  };

  // ==========================================
  // TAB 3: COURSES
  // ==========================================
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [courseForm] = Form.useForm();
  const [courseModalCategoryId, setCourseModalCategoryId] = useState<string>("");

  // Course Detail Modal state (CUR-04-FE-02)
  const [viewingCourseId, setViewingCourseId] = useState<string | null>(null);
  const [viewingCoursePreview, setViewingCoursePreview] = useState<Course | null>(null);

  const {
    data: detailCourse,
    isLoading: loadingCourseDetail,
    isError: isErrorCourseDetail,
    error: errorCourseDetail,
    refetch: refetchCourseDetail,
  } = useQuery({
    queryKey: ["admin-course-detail", viewingCourseId],
    queryFn: () => courseService.getCourse(viewingCourseId!),
    enabled: !!viewingCourseId,
    staleTime: 30_000,
  });

  const { data: filterSubjects = [] } = useQuery({
    queryKey: ["admin-subjects", courseCatFilter],
    queryFn: () =>
      courseCatFilter
        ? catalogService.listSubjectsByCategory(courseCatFilter)
        : Promise.resolve([]),
    enabled: !!courseCatFilter,
    staleTime: 60_000,
  });

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
    ],
    queryFn: () =>
      courseService.searchCourses({
        page: coursePage,
        pageSize: 10,
        search: courseSearch.trim() || undefined,
        categoryId: courseCatFilter || undefined,
        subjectId: courseSubFilter || undefined,
        gradeLevel: courseGradeFilter || undefined,
        level: courseLevelFilter || undefined,
      }),
    staleTime: 60_000,
  });

  const { data: modalSubjects = [] } = useQuery({
    queryKey: ["modal-subjects", courseModalCategoryId],
    queryFn: () => courseModalCategoryId ? catalogService.listSubjectsByCategory(courseModalCategoryId) : Promise.resolve([]),
    enabled: !!courseModalCategoryId,
    staleTime: 120_000,
  });

  const saveCourseMutation = useMutation({
    mutationFn: async (
      values: (CreateCoursePayload | UpdateCoursePayload) & { categoryId?: string }
    ) => {
      const { categoryId: _ignoredCategoryId, ...rest } = values;
      if (editingCourse) {
        return courseService.updateCourse(editingCourse.id, rest as UpdateCoursePayload);
      }
      // Creating a new Course defaults to DRAFT and must never send ACTIVE
      const createPayload: CreateCoursePayload = {
        ...(rest as CreateCoursePayload),
        status: "DRAFT",
      };
      return courseService.createCourse(createPayload);
    },
    onSuccess: (savedCourse) => {
      messageApi.success(
        editingCourse
          ? "Đã cập nhật khóa học!"
          : `Đã tạo khóa học mới (${COURSE_STATUS_LABELS[savedCourse.status] || savedCourse.status})!`
      );
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      queryClient.invalidateQueries({ queryKey: ["admin-course-detail"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-catalog-courses"] });
      queryClient.invalidateQueries({ queryKey: ["courses", "active"] });
      queryClient.invalidateQueries({ queryKey: ["public-courses"] });
      queryClient.invalidateQueries({ queryKey: ["public-course"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      setIsCourseModalOpen(false);
      courseForm.resetFields();
    },
    onError: (err: unknown) => {
      messageApi.error(getFriendlyErrorMessage(err, "Lỗi thao tác khóa học"));
    },
  });

  const toggleCourseStatusMutation = useMutation({
    mutationFn: async ({
      courseId,
      nextStatus,
    }: {
      courseId: string;
      nextStatus: "ACTIVE" | "INACTIVE";
    }) => {
      return courseService.updateCourse(courseId, { status: nextStatus });
    },
    onSuccess: (updatedCourse, variables) => {
      messageApi.success(
        variables.nextStatus === "ACTIVE"
          ? `Đã kích hoạt khóa học "${updatedCourse.title}". Giáo viên hiện có thể chọn khóa học này để mở lớp.`
          : `Đã ngừng hoạt động khóa học "${updatedCourse.title}". Giáo viên sẽ không thể dùng khóa học này để tạo lớp mới.`
      );
      if (viewingCoursePreview?.id === updatedCourse.id) {
        setViewingCoursePreview((prev) =>
          prev ? { ...prev, status: updatedCourse.status, updatedAt: updatedCourse.updatedAt } : prev
        );
      }
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      queryClient.invalidateQueries({ queryKey: ["admin-course-detail"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-catalog-courses"] });
      queryClient.invalidateQueries({ queryKey: ["courses", "active"] });
      queryClient.invalidateQueries({ queryKey: ["public-courses"] });
      queryClient.invalidateQueries({ queryKey: ["public-course"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (err: unknown) => {
      messageApi.error(
        getFriendlyErrorMessage(err, "Không thể thay đổi trạng thái khóa học.")
      );
    },
  });

  const handleOpenCourseModal = (c?: Course) => {
    if (c) {
      const cat = categories.find((item) => item.id === c.categoryId);
      const allowedGrades =
        cat && cat.allowedGradeLevels !== null ? cat.allowedGradeLevels : GRADE_LEVELS;
      const validGradeLevel =
        c.gradeLevel && (allowedGrades as readonly string[]).includes(c.gradeLevel)
          ? c.gradeLevel
          : undefined;

      setEditingCourse(c);
      setCourseModalCategoryId(c.categoryId);
      courseForm.setFieldsValue({
        categoryId: c.categoryId,
        subjectId: c.subjectId,
        title: c.title,
        level: c.level,
        gradeLevel: validGradeLevel,
        status: c.status,
        description: c.description,
        learningObjectives: c.learningObjectives,
        syllabus: c.syllabus,
        prerequisites: c.prerequisites,
      });
    } else {
      setEditingCourse(null);
      setCourseModalCategoryId(categories[0]?.id || "");
      courseForm.resetFields();
      courseForm.setFieldsValue({
        categoryId: categories[0]?.id || "",
      });
    }
    setIsCourseModalOpen(true);
  };

  const selectedCourseModalCategory = categories.find((c) => c.id === courseModalCategoryId);
  const allowedCourseModalGradeLevels: readonly GradeLevel[] = selectedCourseModalCategory
    ? selectedCourseModalCategory.allowedGradeLevels === null
      ? GRADE_LEVELS
      : selectedCourseModalCategory.allowedGradeLevels
    : GRADE_LEVELS;

  return (
    <div className="space-y-6">
      {contextHolder}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <BookOutlined className="text-brand-600" />
            Quản lý Danh mục & Khóa học
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Quản trị các Danh mục (Category), Môn học (Subject), và Khóa học chuẩn (Course) trong hệ thống.
          </p>
        </div>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={(nextTab) => updateSearchParams({ tab: nextTab })}
        items={[
          // ===============================
          // TAB 1: CATEGORIES
          // ===============================
          {
            key: "categories",
            label: (
              <span className="flex items-center gap-2 font-medium">
                <FolderOutlined /> Danh mục ({categories.length})
              </span>
            ),
            children: (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-xs text-gray-500">
                    Phân loại cao nhất (vd: Cấp 1, Cấp 2, Cấp 3, Đại học, Lập trình...)
                  </p>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    className="bg-brand-600"
                    onClick={() => handleOpenCategoryModal()}
                  >
                    Thêm danh mục
                  </Button>
                </div>

                {isErrorCategories ? (
                  <Alert
                    type="error"
                    showIcon
                    message="Không thể tải danh sách danh mục"
                    description={getFriendlyErrorMessage(
                      errorCategories,
                      "Đã xảy ra lỗi khi tải danh sách danh mục. Vui lòng thử lại."
                    )}
                    action={
                      <Button
                        size="small"
                        danger
                        icon={<ReloadOutlined />}
                        onClick={() => refetchCategories()}
                      >
                        Thử lại
                      </Button>
                    }
                  />
                ) : (
                  <Table
                    dataSource={categories}
                    rowKey="id"
                    loading={loadingCategories}
                    pagination={{ pageSize: 15 }}
                    columns={[
                    {
                      title: "Tên danh mục",
                      dataIndex: "name",
                      key: "name",
                      render: (name: string, record: Category) => (
                        <div>
                          <div className="font-semibold text-gray-900">{name}</div>
                          <div className="text-xs text-gray-400 font-mono">slug: {record.slug}</div>
                        </div>
                      ),
                    },
                    {
                      title: "Mô tả",
                      dataIndex: "description",
                      key: "description",
                      render: (desc: string) => desc || <span className="text-gray-300 italic">Chưa có</span>,
                    },
                    {
                      title: "Khối lớp áp dụng",
                      dataIndex: "allowedGradeLevels",
                      key: "allowedGradeLevels",
                      render: (grades: GradeLevel[] | null) => {
                        if (!grades || grades.length === 0) {
                          return <Tag color="default">Không giới hạn</Tag>;
                        }
                        return (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {grades.map((g) => (
                              <Tag key={g} color="blue" className="text-[10px]">
                                {GRADE_LEVEL_LABELS[g] || g}
                              </Tag>
                            ))}
                          </div>
                        );
                      },
                    },
                    {
                      title: "Trạng thái",
                      dataIndex: "status",
                      key: "status",
                      render: (st: CatalogStatus) => (
                        <Tag color={st === "ACTIVE" ? "success" : "default"}>
                          {st === "ACTIVE" ? "Hoạt động" : "Tạm ngưng"}
                        </Tag>
                      ),
                    },
                    {
                      title: "Thao tác",
                      key: "action",
                      align: "right",
                      render: (_: unknown, record: Category) => (
                        <Button
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => handleOpenCategoryModal(record)}
                        >
                          Sửa
                        </Button>
                      ),
                    },
                  ]}
                />
                )}
              </div>
            ),
          },

          // ===============================
          // TAB 2: SUBJECTS
          // ===============================
          {
            key: "subjects",
            label: (
              <span className="flex items-center gap-2 font-medium">
                <ReadOutlined /> Môn học
              </span>
            ),
            children: (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row justify-between gap-3 items-start sm:items-center">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 font-medium">Chọn Danh mục:</span>
                    <Select
                      className="w-64"
                      value={activeCategoryIdForSubjects}
                      onChange={(val) => setSelectedCatFilter(val)}
                      options={categories.map((c) => ({ value: c.id, label: c.name }))}
                    />
                  </div>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    className="bg-brand-600"
                    disabled={!activeCategoryIdForSubjects}
                    onClick={() => handleOpenSubjectModal()}
                  >
                    Thêm môn học
                  </Button>
                </div>

                {isErrorCategories || isErrorSubjects ? (
                  <Alert
                    type="error"
                    showIcon
                    message="Không thể tải danh sách môn học"
                    description={getFriendlyErrorMessage(
                      errorSubjects || errorCategories,
                      "Đã xảy ra lỗi khi tải danh sách môn học. Vui lòng thử lại."
                    )}
                    action={
                      <Button
                        size="small"
                        danger
                        icon={<ReloadOutlined />}
                        onClick={() => {
                          if (isErrorCategories) refetchCategories();
                          if (activeCategoryIdForSubjects) refetchSubjects();
                        }}
                      >
                        Thử lại
                      </Button>
                    }
                  />
                ) : (
                  <Table
                    dataSource={subjects}
                    rowKey="id"
                    loading={loadingSubjects}
                    pagination={{ pageSize: 15 }}
                    columns={[
                    {
                      title: "Tên môn học",
                      dataIndex: "name",
                      key: "name",
                      render: (name: string, record: Subject) => (
                        <div>
                          <div className="font-semibold text-gray-900">{name}</div>
                          <div className="text-xs text-gray-400 font-mono">slug: {record.slug}</div>
                        </div>
                      ),
                    },
                    {
                      title: "Danh mục",
                      dataIndex: "categoryName",
                      key: "categoryName",
                      render: (cn: string) => <Tag color="blue">{cn}</Tag>,
                    },
                    {
                      title: "Mô tả",
                      dataIndex: "description",
                      key: "description",
                      render: (desc: string) => desc || <span className="text-gray-300 italic">Chưa có</span>,
                    },
                    {
                      title: "Trạng thái",
                      dataIndex: "status",
                      key: "status",
                      render: (st: CatalogStatus) => (
                        <Tag color={st === "ACTIVE" ? "success" : "default"}>
                          {st === "ACTIVE" ? "Hoạt động" : "Tạm ngưng"}
                        </Tag>
                      ),
                    },
                    {
                      title: "Thao tác",
                      key: "action",
                      align: "right",
                      render: (_: unknown, record: Subject) => (
                        <Button
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => handleOpenSubjectModal(record)}
                        >
                          Sửa
                        </Button>
                      ),
                    },
                  ]}
                />
                )}
              </div>
            ),
          },

          // ===============================
          // TAB 3: COURSES
          // ===============================
          {
            key: "courses",
            label: (
              <span className="flex items-center gap-2 font-medium">
                <BookOutlined /> Khóa học
              </span>
            ),
            children: (
              <div className="space-y-4">
                {/* Search & filters */}
                <div className="bg-white p-3 rounded-xl border border-gray-200 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    <Input
                      placeholder="Tìm tên hoặc mô tả..."
                      prefix={<SearchOutlined className="text-gray-400" />}
                      value={searchInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) {
                          setSearchDraft(null);
                          updateSearchParams(
                            { search: undefined, page: "1" },
                            { replace: true }
                          );
                        } else {
                          setSearchDraft(val);
                        }
                      }}
                      allowClear
                    />
                    <Select
                      placeholder="Lọc danh mục"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      value={courseCatFilter || undefined}
                      onChange={(val) => {
                        updateSearchParams({
                          categoryId: val || undefined,
                          subjectId: undefined,
                          page: "1",
                        });
                      }}
                      options={categories.map((c) => ({ value: c.id, label: c.name }))}
                    />
                    <Select
                      placeholder={
                        courseCatFilter ? "Lọc môn học" : "Chọn danh mục trước"
                      }
                      allowClear
                      disabled={!courseCatFilter}
                      showSearch
                      optionFilterProp="label"
                      value={courseSubFilter || undefined}
                      onChange={(val) => {
                        updateSearchParams({
                          subjectId: val || undefined,
                          page: "1",
                        });
                      }}
                      options={filterSubjects.map((s) => ({
                        value: s.id,
                        label: s.name,
                      }))}
                    />
                    <Select
                      placeholder="Lọc khối lớp"
                      allowClear
                      value={courseGradeFilter || undefined}
                      onChange={(val) => {
                        updateSearchParams({
                          gradeLevel: val || undefined,
                          page: "1",
                        });
                      }}
                      options={GRADE_LEVELS.map((g) => ({
                        value: g,
                        label: GRADE_LEVEL_LABELS[g],
                      }))}
                    />
                    <Select
                      placeholder="Lọc cấp độ"
                      allowClear
                      value={courseLevelFilter || undefined}
                      onChange={(val) => {
                        updateSearchParams({
                          level: val || undefined,
                          page: "1",
                        });
                      }}
                      options={COURSE_LEVELS.map((l) => ({
                        value: l,
                        label: COURSE_LEVEL_LABELS[l],
                      }))}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div>
                      {(courseSearch ||
                        courseCatFilter ||
                        courseSubFilter ||
                        courseGradeFilter ||
                        courseLevelFilter) && (
                        <Button
                          size="small"
                          onClick={() => {
                            setSearchDraft(null);
                            updateSearchParams({
                              search: undefined,
                              categoryId: undefined,
                              subjectId: undefined,
                              gradeLevel: undefined,
                              level: undefined,
                              page: "1",
                            });
                          }}
                        >
                          Xóa bộ lọc
                        </Button>
                      )}
                    </div>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      className="bg-brand-600"
                      onClick={() => handleOpenCourseModal()}
                    >
                      Tạo khóa học
                    </Button>
                  </div>
                </div>

                {isErrorCourses ? (
                  <Alert
                    type="error"
                    showIcon
                    message="Không thể tải danh sách khóa học"
                    description={getFriendlyErrorMessage(
                      errorCourses,
                      "Đã xảy ra lỗi khi tải danh sách khóa học. Vui lòng thử lại."
                    )}
                    action={
                      <Button
                        size="small"
                        danger
                        icon={<ReloadOutlined />}
                        onClick={() => refetchCourses()}
                      >
                        Thử lại
                      </Button>
                    }
                  />
                ) : (
                  <Table
                    dataSource={coursesData?.items || []}
                    rowKey="id"
                    loading={loadingCourses}
                    pagination={{
                      current: coursePage,
                      pageSize: 10,
                      total: coursesData?.total || 0,
                      onChange: (p) => updateSearchParams({ page: String(p) }),
                      showTotal: (total) => `Tổng ${total} khóa học`,
                    }}
                  columns={[
                    {
                      title: "Khóa học",
                      dataIndex: "title",
                      key: "title",
                      render: (title: string, record: Course) => (
                        <div>
                          <div className="font-semibold text-gray-900">{title}</div>
                          <div className="text-xs text-gray-400 font-mono">slug: {record.slug}</div>
                        </div>
                      ),
                    },
                    {
                      title: "Danh mục / Môn",
                      key: "cat_sub",
                      render: (_: unknown, record: Course) => (
                        <div className="space-y-1">
                          <Tag color="blue">{record.categoryName}</Tag>
                          <Tag color="cyan">{record.subjectName}</Tag>
                        </div>
                      ),
                    },
                    {
                      title: "Khối lớp & Cấp độ",
                      key: "level_grade",
                      render: (_: unknown, record: Course) => (
                        <div className="space-y-1">
                          {record.gradeLevel ? (
                            <Tag color="geekblue">{GRADE_LEVEL_LABELS[record.gradeLevel]}</Tag>
                          ) : (
                            <Tag color="default">Chưa gán khối</Tag>
                          )}
                          {record.level && (
                            <Tag color="purple">{COURSE_LEVEL_LABELS[record.level]}</Tag>
                          )}
                        </div>
                      ),
                    },
                    {
                      title: "Trạng thái",
                      dataIndex: "status",
                      key: "status",
                      render: (st: CourseStatus) => renderCourseStatusTag(st),
                    },
                    {
                      title: "Thao tác",
                      key: "action",
                      align: "right",
                      render: (_: unknown, record: Course) => {
                        const isTogglingThis =
                          toggleCourseStatusMutation.isPending &&
                          toggleCourseStatusMutation.variables?.courseId === record.id;
                        return (
                          <Space>
                            <Button
                              size="small"
                              icon={<EyeOutlined />}
                              disabled={toggleCourseStatusMutation.isPending}
                              onClick={() => {
                                setViewingCoursePreview(record);
                                setViewingCourseId(record.id);
                              }}
                            >
                              Xem
                            </Button>
                            <Button
                              size="small"
                              icon={<EditOutlined />}
                              disabled={toggleCourseStatusMutation.isPending}
                              onClick={() => handleOpenCourseModal(record)}
                            >
                              Sửa
                            </Button>
                            {record.status === "ACTIVE" ? (
                              <Popconfirm
                                title="Ngừng hoạt động khóa học này?"
                                description="Giáo viên sẽ không thể chọn khóa học này để tạo lớp mới. Các lớp học đã được tạo trước đó vẫn hoạt động bình thường."
                                okText="Ngừng hoạt động"
                                cancelText="Hủy"
                                okButtonProps={{
                                  danger: true,
                                  loading: isTogglingThis,
                                }}
                                onConfirm={() =>
                                  toggleCourseStatusMutation.mutate({
                                    courseId: record.id,
                                    nextStatus: "INACTIVE",
                                  })
                                }
                              >
                                <Button
                                  size="small"
                                  danger
                                  icon={<StopOutlined />}
                                  loading={isTogglingThis}
                                  disabled={
                                    toggleCourseStatusMutation.isPending && !isTogglingThis
                                  }
                                >
                                  Ngừng hoạt động
                                </Button>
                              </Popconfirm>
                            ) : (
                              <Popconfirm
                                title="Kích hoạt khóa học này?"
                                description="Sau khi kích hoạt (ACTIVE), Giáo viên có thể lựa chọn khóa học này để mở lớp học mới."
                                okText="Kích hoạt"
                                cancelText="Hủy"
                                okButtonProps={{
                                  loading: isTogglingThis,
                                  className: "bg-emerald-600",
                                }}
                                onConfirm={() =>
                                  toggleCourseStatusMutation.mutate({
                                    courseId: record.id,
                                    nextStatus: "ACTIVE",
                                  })
                                }
                              >
                                <Button
                                  size="small"
                                  type="primary"
                                  icon={<CheckCircleOutlined />}
                                  loading={isTogglingThis}
                                  disabled={
                                    toggleCourseStatusMutation.isPending && !isTogglingThis
                                  }
                                  className="bg-emerald-600 hover:bg-emerald-700"
                                >
                                  Kích hoạt
                                </Button>
                              </Popconfirm>
                            )}
                          </Space>
                        );
                      },
                    },
                  ]}
                />
                )}
              </div>
            ),
          },

          {
            key: "syllabus",
            label: (
              <span className="flex items-center gap-2 font-medium">
                <FileTextOutlined /> Giáo trình / phiên bản
              </span>
            ),
            children: <AdminSyllabusManagementPage />,
          },
          {
            key: "pricing",
            label: (
              <span className="flex items-center gap-2 font-medium">
                <DollarOutlined /> Chính sách giá
              </span>
            ),
            children: <AdminPricingPoliciesPage />,
          },
        ]}
      />

      {/* ================================================= */}
      {/* MODAL: CATEGORY CREATE / EDIT */}
      {/* ================================================= */}
      <Modal
        title={editingCategory ? "Chỉnh sửa Danh mục" : "Tạo Danh mục mới"}
        open={isCategoryModalOpen}
        onCancel={() => !saveCategoryMutation.isPending && setIsCategoryModalOpen(false)}
        closable={!saveCategoryMutation.isPending}
        maskClosable={!saveCategoryMutation.isPending}
        footer={null}
        destroyOnClose
      >
        <Form
          form={categoryForm}
          layout="vertical"
          onFinish={(values) => saveCategoryMutation.mutate(values)}
          className="mt-4"
        >
          <Form.Item
            name="name"
            label="Tên danh mục"
            rules={[{ required: true, whitespace: true, message: "Vui lòng nhập tên danh mục" }]}
          >
            <Input placeholder="vd: Giáo dục phổ thông, Ngoại ngữ..." />
          </Form.Item>

          <Form.Item name="description" label="Mô tả">
            <TextArea rows={3} placeholder="Mô tả danh mục..." />
          </Form.Item>

          {editingCategory && (
            <Form.Item name="status" label="Trạng thái">
              <Select
                options={[
                  { value: "ACTIVE", label: "Hoạt động" },
                  { value: "INACTIVE", label: "Tạm ngưng" },
                ]}
              />
            </Form.Item>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button
              disabled={saveCategoryMutation.isPending}
              onClick={() => setIsCategoryModalOpen(false)}
            >
              Hủy
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={saveCategoryMutation.isPending}
              className="bg-brand-600"
            >
              Lưu danh mục
            </Button>
          </div>
        </Form>
      </Modal>

      {/* ================================================= */}
      {/* MODAL: SUBJECT CREATE / EDIT */}
      {/* ================================================= */}
      <Modal
        title={editingSubject ? "Chỉnh sửa Môn học" : "Tạo Môn học mới"}
        open={isSubjectModalOpen}
        onCancel={() => !saveSubjectMutation.isPending && setIsSubjectModalOpen(false)}
        closable={!saveSubjectMutation.isPending}
        maskClosable={!saveSubjectMutation.isPending}
        footer={null}
        destroyOnClose
      >
        <Form
          form={subjectForm}
          layout="vertical"
          onFinish={(values) => saveSubjectMutation.mutate(values)}
          className="mt-4"
        >
          {!editingSubject && (
            <Form.Item
              name="categoryId"
              label="Thuộc Danh mục"
              rules={[{ required: true, message: "Vui lòng chọn danh mục" }]}
            >
              <Select
                options={categories.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="Chọn danh mục"
              />
            </Form.Item>
          )}

          <Form.Item
            name="name"
            label="Tên môn học"
            rules={[{ required: true, whitespace: true, message: "Vui lòng nhập tên môn học" }]}
          >
            <Input placeholder="vd: Toán học, Tiếng Anh, Vật lý..." />
          </Form.Item>

          <Form.Item name="description" label="Mô tả">
            <TextArea rows={3} placeholder="Mô tả môn học..." />
          </Form.Item>

          {editingSubject && (
            <Form.Item name="status" label="Trạng thái">
              <Select
                options={[
                  { value: "ACTIVE", label: "Hoạt động" },
                  { value: "INACTIVE", label: "Tạm ngưng" },
                ]}
              />
            </Form.Item>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button
              disabled={saveSubjectMutation.isPending}
              onClick={() => setIsSubjectModalOpen(false)}
            >
              Hủy
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={saveSubjectMutation.isPending}
              className="bg-brand-600"
            >
              Lưu môn học
            </Button>
          </div>
        </Form>
      </Modal>

      {/* ================================================= */}
      {/* MODAL: COURSE CREATE / EDIT */}
      {/* ================================================= */}
      <Modal
        title={editingCourse ? "Chỉnh sửa Khóa học" : "Tạo Khóa học mới"}
        open={isCourseModalOpen}
        onCancel={() => !saveCourseMutation.isPending && setIsCourseModalOpen(false)}
        closable={!saveCourseMutation.isPending}
        maskClosable={!saveCourseMutation.isPending}
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
                label="Danh mục"
                rules={[{ required: true, message: "Vui lòng chọn danh mục" }]}
              >
                <Select
                  options={categories.map((c) => ({ value: c.id, label: c.name }))}
                  onChange={(catId) => {
                    setCourseModalCategoryId(catId);
                    const nextCat = categories.find((c) => c.id === catId);
                    const currentGrade = courseForm.getFieldValue("gradeLevel") as GradeLevel | undefined;
                    const nextAllowed =
                      nextCat && nextCat.allowedGradeLevels !== null
                        ? nextCat.allowedGradeLevels
                        : GRADE_LEVELS;
                    const shouldResetGrade =
                      currentGrade && !(nextAllowed as readonly string[]).includes(currentGrade);
                    courseForm.setFieldsValue({
                      subjectId: undefined,
                      ...(shouldResetGrade ? { gradeLevel: undefined } : {}),
                    });
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
            <Input placeholder="vd: Toán nâng cao lớp 10, Luyện thi IELTS..." />
          </Form.Item>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="gradeLevel" label="Khối lớp (tùy chọn)">
              <Select
                allowClear
                disabled={allowedCourseModalGradeLevels.length === 0}
                placeholder={
                  allowedCourseModalGradeLevels.length === 0
                    ? "Danh mục này không áp dụng khối lớp"
                    : "Chọn khối lớp"
                }
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

          <Form.Item name="description" label="Mô tả khóa học">
            <TextArea rows={3} placeholder="Mô tả nội dung, đối tượng phù hợp..." />
          </Form.Item>

          <Form.Item name="learningObjectives" label="Mục tiêu học tập">
            <TextArea rows={2} placeholder="Học viên sẽ đạt được những kiến thức gì..." />
          </Form.Item>

          <Form.Item name="syllabus" label="Khung giáo trình (Syllabus)">
            <TextArea rows={3} placeholder="Tóm tắt các chủ đề hoặc bài học..." />
          </Form.Item>

          <Form.Item name="prerequisites" label="Yêu cầu tiên quyết">
            <Input placeholder="Kiến thức nền tảng cần có..." />
          </Form.Item>

          {editingCourse ? (
            <Form.Item name="status" label="Trạng thái">
              <Select
                options={[
                  ...(editingCourse.status === "DRAFT"
                    ? [{ value: "DRAFT", label: "Bản nháp (DRAFT)" }]
                    : []),
                  { value: "ACTIVE", label: "Hoạt động (ACTIVE)" },
                  { value: "INACTIVE", label: "Tạm ngưng (INACTIVE)" },
                ]}
              />
            </Form.Item>
          ) : (
            <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
              Khóa học mới do Quản trị viên tạo sẽ có trạng thái mặc định là{" "}
              <strong>Bản nháp (DRAFT)</strong>. Sau khi tạo và kiểm tra nội dung, bạn có thể nhấn{" "}
              <strong>Kích hoạt</strong> để Giáo viên chọn mở lớp.
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t">
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
              className="bg-brand-600"
            >
              Lưu khóa học
            </Button>
          </div>
        </Form>
      </Modal>

      {/* ================================================= */}
      {/* MODAL: COURSE / SYLLABUS DETAIL VIEW (CUR-04-FE-02) */}
      {/* ================================================= */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <BookOutlined className="text-brand-600" />
            <span>
              Chi tiết khóa học:{" "}
              {detailCourse?.title || viewingCoursePreview?.title || ""}
            </span>
          </div>
        }
        open={!!viewingCourseId}
        onCancel={() => {
          if (toggleCourseStatusMutation.isPending) return;
          setViewingCourseId(null);
          setViewingCoursePreview(null);
        }}
        closable={!toggleCourseStatusMutation.isPending}
        maskClosable={!toggleCourseStatusMutation.isPending}
        width={760}
        footer={[
          <Button
            key="close"
            disabled={toggleCourseStatusMutation.isPending}
            onClick={() => {
              setViewingCourseId(null);
              setViewingCoursePreview(null);
            }}
          >
            Đóng
          </Button>,
          detailCourse &&
            (detailCourse.status === "ACTIVE" ? (
              <Popconfirm
                key="deactivate"
                title="Ngừng hoạt động khóa học này?"
                description="Giáo viên sẽ không thể chọn khóa học này để tạo lớp mới. Các lớp học đã được tạo trước đó vẫn hoạt động bình thường."
                okText="Ngừng hoạt động"
                cancelText="Hủy"
                okButtonProps={{
                  danger: true,
                  loading: toggleCourseStatusMutation.isPending,
                }}
                onConfirm={() =>
                  toggleCourseStatusMutation.mutate({
                    courseId: detailCourse.id,
                    nextStatus: "INACTIVE",
                  })
                }
              >
                <Button
                  danger
                  icon={<StopOutlined />}
                  loading={toggleCourseStatusMutation.isPending}
                >
                  Ngừng hoạt động
                </Button>
              </Popconfirm>
            ) : (
              <Popconfirm
                key="activate"
                title="Kích hoạt khóa học này?"
                description="Sau khi kích hoạt (ACTIVE), Giáo viên có thể lựa chọn khóa học này để mở lớp học mới."
                okText="Kích hoạt"
                cancelText="Hủy"
                okButtonProps={{
                  loading: toggleCourseStatusMutation.isPending,
                  className: "bg-emerald-600",
                }}
                onConfirm={() =>
                  toggleCourseStatusMutation.mutate({
                    courseId: detailCourse.id,
                    nextStatus: "ACTIVE",
                  })
                }
              >
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  loading={toggleCourseStatusMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  Kích hoạt
                </Button>
              </Popconfirm>
            )),
          detailCourse && (
            <Button
              key="edit"
              type="primary"
              icon={<EditOutlined />}
              disabled={toggleCourseStatusMutation.isPending}
              className="bg-brand-600"
              onClick={() => {
                const targetCourse = detailCourse;
                setViewingCourseId(null);
                setViewingCoursePreview(null);
                handleOpenCourseModal(targetCourse);
              }}
            >
              Chỉnh sửa khóa học
            </Button>
          ),
        ]}
      >
        {loadingCourseDetail ? (
          <div className="py-4">
            <Skeleton active paragraph={{ rows: 6 }} />
          </div>
        ) : !detailCourse ? (
          <div className="py-4">
            <Alert
              type="error"
              showIcon
              message="Không thể tải chi tiết khóa học"
              description={getFriendlyErrorMessage(
                errorCourseDetail,
                "Đã xảy ra lỗi khi tải thông tin khóa học. Vui lòng thử lại."
              )}
              action={
                <Button
                  size="small"
                  danger
                  icon={<ReloadOutlined />}
                  onClick={() => refetchCourseDetail()}
                >
                  Thử lại
                </Button>
              }
            />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {isErrorCourseDetail && (
              <Alert
                type="warning"
                showIcon
                message="Đang hiển thị thông tin khóa học từ danh sách hiện tại"
                description="API chi tiết khóa học hiện chỉ trả dữ liệu cho khóa học đang ACTIVE. Các thông tin bên dưới được lấy từ dữ liệu danh sách."
              />
            )}
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Tên khóa học" span={2}>
                <span className="font-semibold text-gray-900">{detailCourse.title}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Đường dẫn tĩnh (Slug)" span={2}>
                <span className="font-mono text-xs text-gray-600">{detailCourse.slug}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Danh mục">
                <Tag color="blue">{detailCourse.categoryName}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Môn học">
                <Tag color="cyan">{detailCourse.subjectName}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Khối lớp">
                {detailCourse.gradeLevel ? (
                  <Tag color="geekblue">{GRADE_LEVEL_LABELS[detailCourse.gradeLevel]}</Tag>
                ) : (
                  <span className="text-gray-400">Chưa gán</span>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Cấp độ">
                {detailCourse.level ? (
                  <Tag color="purple">{COURSE_LEVEL_LABELS[detailCourse.level]}</Tag>
                ) : (
                  <span className="text-gray-400">Không xác định</span>
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
              {detailCourse.sourceProposalId && (
                <Descriptions.Item label="Mã đề xuất gốc (Proposal ID)" span={2}>
                  <span className="font-mono text-xs text-indigo-600">
                    {detailCourse.sourceProposalId}
                  </span>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Ngày tạo">
                {dayjs(detailCourse.createdAt).format("DD/MM/YYYY HH:mm")}
              </Descriptions.Item>
              <Descriptions.Item label="Cập nhật lần cuối">
                {dayjs(detailCourse.updatedAt).format("DD/MM/YYYY HH:mm")}
              </Descriptions.Item>
            </Descriptions>

            {!detailCourse.description &&
            !detailCourse.learningObjectives &&
            !detailCourse.syllabus &&
            !detailCourse.prerequisites ? (
              <div className="py-6 bg-gray-50 rounded-xl border border-gray-100">
                <Empty description="Chưa có nội dung chi tiết (mô tả, mục tiêu, khung giáo trình) cho khóa học này." />
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                {detailCourse.description && (
                  <div>
                    <h4 className="font-semibold text-gray-800">Mô tả khóa học:</h4>
                    <div className="text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 p-3.5 rounded-xl border border-gray-100 mt-1">
                      {detailCourse.description}
                    </div>
                  </div>
                )}

                {detailCourse.learningObjectives && (
                  <div>
                    <h4 className="font-semibold text-gray-800">Mục tiêu học tập:</h4>
                    <div className="text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 p-3.5 rounded-xl border border-gray-100 mt-1">
                      {detailCourse.learningObjectives}
                    </div>
                  </div>
                )}

                {detailCourse.syllabus && (
                  <div>
                    <h4 className="font-semibold text-gray-800">
                      Khung giáo trình (Syllabus):
                    </h4>
                    <div className="text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 p-4 rounded-xl border border-gray-100 mt-1 max-h-80 overflow-y-auto">
                      {detailCourse.syllabus}
                    </div>
                  </div>
                )}

                {detailCourse.prerequisites && (
                  <div>
                    <h4 className="font-semibold text-gray-800">Yêu cầu tiên quyết:</h4>
                    <div className="text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 p-3.5 rounded-xl border border-gray-100 mt-1">
                      {detailCourse.prerequisites}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
