import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Pagination,
  Select,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  App as AntdApp,
} from "antd";
import {
  ApartmentOutlined,
  BookOutlined,
  EyeOutlined,
  FileTextOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { courseService } from "../../../services/course.service";
import { teacherSubjectAuthorizationService } from "../../../services/teacherSubjectAuthorization.service";
import { courseCatalogService as catalogService } from "../../../services/courseCatalog.service";
import type { Course } from "../../../types/catalog";
import {
  GRADE_LEVELS,
  GRADE_LEVEL_LABELS,
  COURSE_LEVELS,
  COURSE_LEVEL_LABELS,
} from "../../../types/catalog";
import type {
  CreateTeacherSubjectAuthorizationPayload,
  TeacherSubjectAuthorization,
  TeacherSubjectAuthorizationStatus,
} from "../../../types/teacherSubjectAuthorization";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";
import {
  getVerificationGuidanceMessage,
  useTeacherVerification,
} from "../../../hooks/useTeacherVerification";
import { isCourseAuthorizedForTeacher } from "../../../utils/teacherCourseAuthorization";
import { useAuthStore } from "../../../stores/auth.store";

const AUTH_STATUS: Record<
  TeacherSubjectAuthorizationStatus,
  { label: string; color: string }
> = {
  PENDING: { label: "Đã đăng ký · Chờ duyệt", color: "processing" },
  APPROVED: { label: "Đã được duyệt", color: "success" },
  SUSPENDED: { label: "Chưa được phép · Đã đình chỉ", color: "error" },
};

type AuthorizationFormValues = CreateTeacherSubjectAuthorizationPayload;

export default function TeacherCourseCatalogPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = AntdApp.useApp();
  const { user } = useAuthStore();
  const { isVerified, verificationStatus, isTeacher } = useTeacherVerification();
  const lockTooltip = getVerificationGuidanceMessage(verificationStatus);
  const [search, setSearch] = useState("");
  const [selectedAuthorizationId, setSelectedAuthorizationId] = useState("");
  const [page, setPage] = useState(1);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestForm] = Form.useForm<AuthorizationFormValues>();
  const pageSize = 12;

  const categoriesQuery = useQuery({
    queryKey: ["public-categories"],
    queryFn: () => catalogService.listCategories(),
    staleTime: 300_000,
  });
  const categories = categoriesQuery.data ?? [];
  const requestCategoryId = Form.useWatch("categoryId", requestForm);
  const subjectsQuery = useQuery({
    queryKey: ["public-subjects", requestCategoryId],
    queryFn: () =>
      requestCategoryId
        ? catalogService.listSubjectsByCategory(requestCategoryId)
        : Promise.resolve([]),
    enabled: Boolean(requestCategoryId),
    staleTime: 120_000,
  });
  const authorizationsQuery = useQuery({
    queryKey: ["teacher-subject-authorizations", user?.userId],
    queryFn: () => teacherSubjectAuthorizationService.listAllMyAuthorizations(),
    enabled: isTeacher,
    staleTime: 30_000,
  });
  const authorizations = authorizationsQuery.data ?? [];
  const approvedAuthorizations = authorizations.filter((item) => item.status === "APPROVED");
  const selectedAuthorization =
    approvedAuthorizations.find((item) => item.id === selectedAuthorizationId) ??
    approvedAuthorizations[0];

  const coursesQuery = useQuery({
    queryKey: [
      "teacher-catalog-courses",
      selectedAuthorization?.id,
      search.trim(),
    ],
    queryFn: async () => {
      if (!selectedAuthorization) return [] as Course[];
      const baseParams = {
        subjectId: selectedAuthorization.subjectId,
        level: selectedAuthorization.level,
        search: search.trim() || undefined,
        page: 1,
        pageSize: 100,
      };
      const firstPage = await courseService.searchCourses(baseParams);
      if (firstPage.totalPages <= 1) return firstPage.items;
      const rest = await Promise.all(
        Array.from({ length: firstPage.totalPages - 1 }, (_, index) =>
          courseService.searchCourses({ ...baseParams, page: index + 2 })
        )
      );
      return [firstPage, ...rest].flatMap((result) => result.items);
    },
    enabled: Boolean(selectedAuthorization),
    staleTime: 60_000,
  });

  const courses = (coursesQuery.data ?? []).filter(
    (course) =>
      course.status === "ACTIVE" &&
      selectedAuthorization != null &&
      isCourseAuthorizedForTeacher(course, [selectedAuthorization])
  );
  const total = courses.length;
  const visibleCourses = courses.slice((page - 1) * pageSize, page * pageSize);

  const requestMutation = useMutation({
    mutationFn: (values: AuthorizationFormValues) =>
      teacherSubjectAuthorizationService.requestAuthorization({
        ...values,
        requestNote: values.requestNote?.trim() || undefined,
      }),
    onSuccess: async () => {
      message.success("Đã gửi yêu cầu đăng ký môn giảng dạy.");
      setRequestModalOpen(false);
      requestForm.resetFields();
      await queryClient.invalidateQueries({
        queryKey: ["teacher-subject-authorizations", user?.userId],
      });
    },
    onError: (error: unknown) =>
      message.error(getFriendlyErrorMessage(error, "Không thể gửi yêu cầu đăng ký môn.")),
  });
  const requestCategory = categories.find((category) => category.id === requestCategoryId);
  const requestGradeLevels = requestCategory?.allowedGradeLevels ?? GRADE_LEVELS;

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
            Chỉ hiển thị Course ACTIVE nằm trong phạm vi môn, khối và cấp độ đã được Admin duyệt.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Tooltip title={!isVerified ? lockTooltip : undefined}>
            <Button
              icon={<FileTextOutlined />}
              disabled={!isVerified}
              onClick={() => isVerified && navigate("/teacher/course-proposals")}
            >
              Đề xuất của tôi
            </Button>
          </Tooltip>
          <Tooltip title={!isVerified ? lockTooltip : undefined}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!isVerified}
              onClick={() => isVerified && navigate("/teacher/course-proposals?create=true")}
              className="bg-brand-600 hover:bg-brand-700"
            >
              Đề xuất khóa học mới
            </Button>
          </Tooltip>
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-base font-bold text-gray-900">Quyền giảng dạy theo môn</h2>
            <p className="mb-0 mt-1 text-xs text-gray-500">
              Yêu cầu đang chờ hoặc bị đình chỉ không cấp quyền tạo lớp.
            </p>
          </div>
          <Button
            icon={<PlusOutlined />}
            onClick={() => setRequestModalOpen(true)}
            disabled={!isTeacher}
          >
            Đăng ký môn giảng dạy
          </Button>
        </div>

        {!isTeacher ? (
          <Alert type="error" showIcon message="Danh mục này chỉ dành cho tài khoản giáo viên." />
        ) : authorizationsQuery.isLoading ? (
          <Skeleton active paragraph={{ rows: 2 }} />
        ) : authorizationsQuery.isError ? (
          <Alert
            type="error"
            showIcon
            message="Không tải được quyền giảng dạy"
            description={getFriendlyErrorMessage(
              authorizationsQuery.error,
              "Danh mục bị khóa an toàn khi không xác định được môn đã được duyệt."
            )}
            action={
              <Button size="small" onClick={() => authorizationsQuery.refetch()}>
                Thử lại
              </Button>
            }
          />
        ) : authorizations.length ? (
          <Space wrap>
            {authorizations.map((authorization: TeacherSubjectAuthorization) => (
              <Tag
                key={authorization.id}
                color={AUTH_STATUS[authorization.status].color}
                className="!m-0 px-2 py-1"
              >
                {authorization.categoryName} · {authorization.subjectName}
                {authorization.gradeLevel ? ` · ${GRADE_LEVEL_LABELS[authorization.gradeLevel]}` : ""}
                {` · ${COURSE_LEVEL_LABELS[authorization.level]} · ${AUTH_STATUS[authorization.status].label}`}
                {authorization.reviewNote ? ` · ${authorization.reviewNote}` : ""}
              </Tag>
            ))}
          </Space>
        ) : (
          <Alert
            type="info"
            showIcon
            message="Chưa có yêu cầu quyền giảng dạy"
            description="Đăng ký môn, khối và cấp độ cần giảng dạy. Course chỉ xuất hiện sau khi Admin duyệt phạm vi đó."
          />
        )}
      </section>

      {/* Filter toolbar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_2fr]">
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
            placeholder="Chọn môn / khối / cấp độ đã được duyệt"
            value={selectedAuthorization?.id}
            onChange={(val) => {
              setSelectedAuthorizationId(val || "");
              setPage(1);
            }}
            showSearch
            optionFilterProp="label"
            disabled={!approvedAuthorizations.length}
            options={approvedAuthorizations.map((authorization) => ({
              value: authorization.id,
              label: `${authorization.categoryName} · ${authorization.subjectName}${authorization.gradeLevel ? ` · ${GRADE_LEVEL_LABELS[authorization.gradeLevel]}` : ""} · ${COURSE_LEVEL_LABELS[authorization.level]}`,
            }))}
          />
        </div>
      </div>

      {/* Content */}
      {!isTeacher ? (
        <Alert type="error" showIcon message="Vui lòng đăng nhập bằng tài khoản giáo viên." />
      ) : authorizationsQuery.isLoading ? (
        <Card><Skeleton active paragraph={{ rows: 4 }} /></Card>
      ) : authorizationsQuery.isError ? null : coursesQuery.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="rounded-xl border border-gray-200 shadow-sm">
              <Skeleton active avatar={false} paragraph={{ rows: 3 }} />
            </Card>
          ))}
        </div>
      ) : coursesQuery.isError ? (
        <Alert
          type="error"
          message="Lỗi tải danh mục khóa học"
          description="Vui lòng thử tải lại các khóa học trong phạm vi môn đã được duyệt."
          showIcon
          action={<Button size="small" onClick={() => coursesQuery.refetch()}>Thử lại</Button>}
        />
      ) : !selectedAuthorization ? (
        <Empty description="Chưa có phạm vi giảng dạy được duyệt. Đăng ký môn để Admin xem xét." />
      ) : total === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Empty
            description="Không có Course ACTIVE khớp chính xác với môn, khối và cấp độ được duyệt."
          />
          <div className="mt-4 inline-block">
            <Tooltip title={!isVerified ? lockTooltip : undefined}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                disabled={!isVerified}
                onClick={() => isVerified && navigate("/teacher/course-proposals?create=true")}
                className="bg-brand-600"
              >
                Đề xuất khóa học mới
              </Button>
            </Tooltip>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {visibleCourses.map((course: Course) => (
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

                  <Tooltip title={!isVerified ? lockTooltip : undefined}>
                    <Button
                      size="small"
                      type="primary"
                      disabled={!isVerified}
                      className="bg-brand-600 hover:bg-brand-700 text-xs"
                      onClick={() => {
                        if (isVerified) {
                          navigate(`/teacher/classes/create?courseId=${course.id}`);
                        }
                      }}
                    >
                      Tạo lớp học
                    </Button>
                  </Tooltip>
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

      <Modal
        title="Đăng ký quyền giảng dạy theo môn"
        open={requestModalOpen}
        onCancel={() => !requestMutation.isPending && setRequestModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        {categoriesQuery.isError ? (
          <Alert
            type="error"
            showIcon
            message="Không tải được danh mục"
            action={<Button size="small" onClick={() => categoriesQuery.refetch()}>Thử lại</Button>}
          />
        ) : (
          <Form
            form={requestForm}
            layout="vertical"
            onFinish={(values) => requestMutation.mutate(values)}
            onValuesChange={(changed) => {
              if ("categoryId" in changed) requestForm.setFieldValue("subjectId", undefined);
            }}
          >
            <Form.Item
              name="categoryId"
              label="Danh mục"
              rules={[{ required: true, message: "Chọn danh mục." }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                loading={categoriesQuery.isLoading}
                options={categories.map((category) => ({ value: category.id, label: category.name }))}
              />
            </Form.Item>
            <Form.Item
              name="subjectId"
              label="Môn học"
              rules={[{ required: true, message: "Chọn môn học." }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                loading={subjectsQuery.isLoading}
                disabled={!requestCategoryId}
                options={(subjectsQuery.data ?? []).map((subject) => ({
                  value: subject.id,
                  label: subject.name,
                }))}
              />
            </Form.Item>
            {subjectsQuery.isError && (
              <Alert
                type="error"
                showIcon
                className="mb-4"
                message="Không tải được môn học"
                description={getFriendlyErrorMessage(subjectsQuery.error)}
                action={<Button size="small" onClick={() => subjectsQuery.refetch()}>Thử lại</Button>}
              />
            )}
            <Form.Item
              name="gradeLevel"
              label="Khối lớp"
              rules={
                requestCategory?.allowedGradeLevels
                  ? [{ required: true, message: "Chọn khối lớp theo phạm vi của danh mục." }]
                  : []
              }
            >
              <Select
                allowClear
                options={requestGradeLevels.map((grade) => ({
                  value: grade,
                  label: GRADE_LEVEL_LABELS[grade],
                }))}
              />
            </Form.Item>
            <Form.Item
              name="level"
              label="Cấp độ"
              rules={[{ required: true, message: "Chọn cấp độ." }]}
            >
              <Select
                options={COURSE_LEVELS.map((level) => ({
                  value: level,
                  label: COURSE_LEVEL_LABELS[level],
                }))}
              />
            </Form.Item>
            <Form.Item name="requestNote" label="Ghi chú (không bắt buộc)">
              <Input.TextArea rows={3} maxLength={1000} />
            </Form.Item>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setRequestModalOpen(false)} disabled={requestMutation.isPending}>
                Hủy
              </Button>
              <Button type="primary" htmlType="submit" loading={requestMutation.isPending}>
                Gửi yêu cầu
              </Button>
            </div>
          </Form>
        )}
      </Modal>
    </div>
  );
}
