import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Tabs,
  Table,
  Button,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  message,
} from "antd";
import {
  FolderOutlined,
  ReadOutlined,
  BookOutlined,
  PlusOutlined,
  EditOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { catalogService } from "../../../services/catalog.service";
import { courseService } from "../../../services/course.service";
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
  CatalogStatus,
} from "../../../types/catalog";
import {
  GRADE_LEVELS,
  GRADE_LEVEL_LABELS,
  COURSE_LEVELS,
  COURSE_LEVEL_LABELS,
} from "../../../types/catalog";

const { TextArea } = Input;

export default function AdminCatalogPage() {
  const queryClient = useQueryClient();
  const [messageApi, contextHolder] = message.useMessage();

  const [activeTab, setActiveTab] = useState("categories");

  // ==========================================
  // TAB 1: CATEGORIES
  // ==========================================
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm] = Form.useForm();

  const { data: categories = [], isLoading: loadingCategories } = useQuery({
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
      setIsCategoryModalOpen(false);
      categoryForm.resetFields();
    },
    onError: (err: any) => {
      messageApi.error(err.message || "Lỗi thao tác danh mục");
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

  const { data: subjects = [], isLoading: loadingSubjects } = useQuery({
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
      setIsSubjectModalOpen(false);
      subjectForm.resetFields();
    },
    onError: (err: any) => {
      messageApi.error(err.message || "Lỗi thao tác môn học");
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
  const [courseSearch, setCourseSearch] = useState("");
  const [courseCatFilter, setCourseCatFilter] = useState<string>("");
  const [courseGradeFilter, setCourseGradeFilter] = useState<GradeLevel | "">("");
  const [coursePage, setCoursePage] = useState(1);
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [courseForm] = Form.useForm();
  const [courseModalCategoryId, setCourseModalCategoryId] = useState<string>("");

  const { data: coursesData, isLoading: loadingCourses } = useQuery({
    queryKey: ["admin-courses", coursePage, courseSearch, courseCatFilter, courseGradeFilter],
    queryFn: () => courseService.searchCourses({
      page: coursePage,
      pageSize: 10,
      search: courseSearch.trim() || undefined,
      categoryId: courseCatFilter || undefined,
      gradeLevel: courseGradeFilter || undefined,
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
    mutationFn: async (values: CreateCoursePayload | UpdateCoursePayload) => {
      if (editingCourse) {
        return courseService.updateCourse(editingCourse.id, values as UpdateCoursePayload);
      }
      return courseService.createCourse(values as CreateCoursePayload);
    },
    onSuccess: () => {
      messageApi.success(editingCourse ? "Đã cập nhật khóa học!" : "Đã tạo khóa học mới!");
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-catalog-courses"] });
      queryClient.invalidateQueries({ queryKey: ["public-courses"] });
      setIsCourseModalOpen(false);
      courseForm.resetFields();
    },
    onError: (err: any) => {
      messageApi.error(err.message || "Lỗi thao tác khóa học");
    },
  });

  const handleOpenCourseModal = (c?: Course) => {
    if (c) {
      setEditingCourse(c);
      setCourseModalCategoryId(c.categoryId);
      courseForm.setFieldsValue({
        categoryId: c.categoryId,
        subjectId: c.subjectId,
        title: c.title,
        level: c.level,
        gradeLevel: c.gradeLevel,
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
        status: "ACTIVE",
      });
    }
    setIsCourseModalOpen(true);
  };

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
        onChange={setActiveTab}
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
                      render: (_: any, record: Category) => (
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
                      render: (_: any, record: Subject) => (
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
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 bg-white p-3 rounded-xl border border-gray-200">
                  <Input
                    placeholder="Tìm tên hoặc mô tả..."
                    prefix={<SearchOutlined className="text-gray-400" />}
                    value={courseSearch}
                    onChange={(e) => {
                      setCourseSearch(e.target.value);
                      setCoursePage(1);
                    }}
                    allowClear
                  />
                  <Select
                    placeholder="Lọc danh mục"
                    allowClear
                    value={courseCatFilter || undefined}
                    onChange={(val) => {
                      setCourseCatFilter(val || "");
                      setCoursePage(1);
                    }}
                    options={categories.map((c) => ({ value: c.id, label: c.name }))}
                  />
                  <Select
                    placeholder="Lọc khối lớp"
                    allowClear
                    value={courseGradeFilter || undefined}
                    onChange={(val) => {
                      setCourseGradeFilter(val || "");
                      setCoursePage(1);
                    }}
                    options={GRADE_LEVELS.map((g) => ({
                      value: g,
                      label: GRADE_LEVEL_LABELS[g],
                    }))}
                  />
                  <div />
                  <div className="flex justify-end">
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

                <Table
                  dataSource={coursesData?.items || []}
                  rowKey="id"
                  loading={loadingCourses}
                  pagination={{
                    current: coursePage,
                    pageSize: 10,
                    total: coursesData?.total || 0,
                    onChange: (p) => setCoursePage(p),
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
                      render: (_: any, record: Course) => (
                        <div className="space-y-1">
                          <Tag color="blue">{record.categoryName}</Tag>
                          <Tag color="cyan">{record.subjectName}</Tag>
                        </div>
                      ),
                    },
                    {
                      title: "Khối lớp & Cấp độ",
                      key: "level_grade",
                      render: (_: any, record: Course) => (
                        <div className="space-y-1">
                          {record.gradeLevel && (
                            <Tag color="geekblue">{GRADE_LEVEL_LABELS[record.gradeLevel]}</Tag>
                          )}
                          {record.level && (
                            <Tag color="purple">{COURSE_LEVEL_LABELS[record.level]}</Tag>
                          )}
                        </div>
                      ),
                    },
                    {
                      title: "Lớp mở",
                      dataIndex: "openClassCount",
                      key: "openClassCount",
                      render: (cnt: number | undefined) => cnt !== undefined ? `${cnt} lớp` : "—",
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
                      render: (_: any, record: Course) => (
                        <Button
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => handleOpenCourseModal(record)}
                        >
                          Sửa
                        </Button>
                      ),
                    },
                  ]}
                />
              </div>
            ),
          },
        ]}
      />

      {/* ================================================= */}
      {/* MODAL: CATEGORY CREATE / EDIT */}
      {/* ================================================= */}
      <Modal
        title={editingCategory ? "Chỉnh sửa Danh mục" : "Tạo Danh mục mới"}
        open={isCategoryModalOpen}
        onCancel={() => setIsCategoryModalOpen(false)}
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
            rules={[{ required: true, message: "Vui lòng nhập tên danh mục" }]}
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
            <Button onClick={() => setIsCategoryModalOpen(false)}>Hủy</Button>
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
        onCancel={() => setIsSubjectModalOpen(false)}
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
            rules={[{ required: true, message: "Vui lòng nhập tên môn học" }]}
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
            <Button onClick={() => setIsSubjectModalOpen(false)}>Hủy</Button>
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
        onCancel={() => setIsCourseModalOpen(false)}
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
                    courseForm.setFieldsValue({ subjectId: undefined });
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
            rules={[{ required: true, message: "Vui lòng nhập tên khóa học" }]}
          >
            <Input placeholder="vd: Toán nâng cao lớp 10, Luyện thi IELTS..." />
          </Form.Item>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="gradeLevel" label="Khối lớp (tùy chọn)">
              <Select
                allowClear
                placeholder="Chọn khối lớp"
                options={GRADE_LEVELS.map((g) => ({
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

          {editingCourse && (
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
            <Button onClick={() => setIsCourseModalOpen(false)}>Hủy</Button>
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
    </div>
  );
}
