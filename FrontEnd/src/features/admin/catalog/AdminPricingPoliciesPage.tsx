import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App as AntdApp,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { coursePricingPolicyService } from "../../../services/coursePricingPolicy.service";
import { courseCatalogService } from "../../../services/courseCatalog.service";
import { courseService } from "../../../services/course.service";
import type {
  Course,
  CourseLevel,
  GradeLevel,
} from "../../../types/catalog";
import {
  COURSE_LEVELS,
  COURSE_LEVEL_LABELS,
  GRADE_LEVELS,
  GRADE_LEVEL_LABELS,
} from "../../../types/catalog";
import type {
  PricingPolicy,
  PricingPolicyClassType,
  PricingPolicyPayload,
  PricingPolicyScope,
  PricingPolicyStatus,
} from "../../../types/courseGovernance";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";

const POLICY_STATUS: Record<PricingPolicyStatus, { label: string; color: string }> = {
  DRAFT: { label: "Bản nháp", color: "gold" },
  ACTIVE: { label: "Đang áp dụng", color: "success" },
  SUPERSEDED: { label: "Đã thay thế", color: "default" },
  ROLLED_BACK: { label: "Đã rollback", color: "orange" },
  ARCHIVED: { label: "Đã lưu trữ", color: "default" },
};
const EMPTY_COURSES: Course[] = [];

const SCOPE_LABEL: Record<PricingPolicyScope, string> = {
  GLOBAL: "Toàn hệ thống",
  CATEGORY: "Danh mục",
  SUBJECT: "Môn học",
  COURSE: "Khóa học",
};

const CLASS_TYPE_LABEL: Record<PricingPolicyClassType, string> = {
  ALL: "Tất cả",
  FREE: "Miễn phí",
  PAID: "Có học phí",
};

interface PolicyFormValues {
  name: string;
  description?: string;
  scopeType: PricingPolicyScope;
  categoryId?: string;
  subjectId?: string;
  courseId?: string;
  gradeLevel?: GradeLevel | null;
  level?: CourseLevel | null;
  classType: PricingPolicyClassType;
  allowFree?: boolean;
  minPrice: number;
  maxPrice: number;
  minSessions: number;
  maxSessions: number;
  effectiveFrom?: Dayjs;
  effectiveTo?: Dayjs | null;
  changeReason?: string;
}

function makePayload(values: PolicyFormValues, status: "DRAFT"): PricingPolicyPayload {
  const classType = values.classType || "ALL";
  const isFree = classType === "FREE";
  return {
    name: values.name.trim(),
    description: values.description?.trim() || "",
    scopeType: values.scopeType,
    ...(values.scopeType === "CATEGORY" && values.categoryId ? { categoryId: values.categoryId } : {}),
    ...(values.scopeType === "SUBJECT" && values.subjectId ? { subjectId: values.subjectId } : {}),
    ...(values.scopeType === "COURSE" && values.courseId ? { courseId: values.courseId } : {}),
    gradeLevel: values.gradeLevel || null,
    level: values.level || null,
    classType,
    allowFree: isFree ? true : classType === "PAID" ? false : values.allowFree ?? true,
    minPrice: isFree ? 0 : Number(values.minPrice),
    maxPrice: isFree ? 0 : Number(values.maxPrice),
    minSessions: Number(values.minSessions),
    maxSessions: Number(values.maxSessions),
    effectiveFrom: values.effectiveFrom?.toISOString(),
    effectiveTo: values.effectiveTo?.toISOString() || null,
    status,
    changeReason: values.changeReason?.trim() || "",
  };
}

function formatPrice(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString("vi-VN")}đ` : value;
}

export default function AdminPricingPoliciesPage() {
  const queryClient = useQueryClient();
  const { message } = AntdApp.useApp();
  const [scopeFilter, setScopeFilter] = useState<PricingPolicyScope>();
  const [statusFilter, setStatusFilter] = useState<PricingPolicyStatus>();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [basePolicy, setBasePolicy] = useState<PricingPolicy | null>(null);
  const [form] = Form.useForm<PolicyFormValues>();
  const scopeType = Form.useWatch("scopeType", form) ?? "GLOBAL";
  const classType = Form.useWatch("classType", form) ?? "ALL";
  const categoryId = Form.useWatch("categoryId", form);

  const categoriesQuery = useQuery({
    queryKey: ["admin-pricing-policy-categories"],
    queryFn: () => courseCatalogService.listCategories(),
  });
  const subjectsQuery = useQuery({
    queryKey: ["admin-pricing-policy-subjects", categoryId],
    queryFn: () => categoryId ? courseCatalogService.listSubjectsByCategory(categoryId) : Promise.resolve([]),
    enabled: Boolean(categoryId),
  });
  const coursesQuery = useQuery({
    queryKey: ["admin-pricing-policy-courses"],
    queryFn: () => courseService.searchCourses({ page: 1, pageSize: 100 }),
  });
  const policyQuery = useQuery({
    queryKey: ["admin-pricing-policies", scopeFilter, statusFilter, page],
    queryFn: () =>
      coursePricingPolicyService.list({
        page,
        pageSize: 10,
        scopeType: scopeFilter,
        status: statusFilter,
      }),
  });
  const policies = policyQuery.data?.items ?? [];
  const courses = coursesQuery.data?.items ?? EMPTY_COURSES;
  const activeCategory = categoriesQuery.data?.find((category) => category.id === categoryId);
  const allowedGrades: readonly GradeLevel[] = activeCategory?.allowedGradeLevels ?? GRADE_LEVELS;

  const invalidatePolicies = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-pricing-policies"] });
  };

  const createMutation = useMutation({
    mutationFn: (values: PolicyFormValues) => {
      const payload = makePayload(values, "DRAFT");
      return basePolicy
        ? coursePricingPolicyService.createVersion(basePolicy.id, payload)
        : coursePricingPolicyService.create(payload);
    },
    onSuccess: async (created) => {
      message.success(`Đã tạo bản nháp chính sách giá v${created.version}. Kiểm tra rồi kích hoạt để áp dụng.`);
      setModalOpen(false);
      setBasePolicy(null);
      form.resetFields();
      await invalidatePolicies();
    },
    onError: (error: unknown) =>
      message.error(getFriendlyErrorMessage(error, "Không thể tạo phiên bản chính sách giá.")),
  });

  const activateMutation = useMutation({
    mutationFn: (policy: PricingPolicy) => coursePricingPolicyService.activate(policy.id, policy.effectiveFrom),
    onSuccess: async () => {
      message.success("Đã kích hoạt chính sách. Phiên bản cùng policy key trước đó được Backend xử lý theo quy tắc hiệu lực.");
      await invalidatePolicies();
    },
    onError: (error: unknown) =>
      message.error(getFriendlyErrorMessage(error, "Không thể kích hoạt chính sách.")),
  });

  const openNewPolicy = () => {
    setBasePolicy(null);
    form.resetFields();
    form.setFieldsValue({
      scopeType: "GLOBAL",
      classType: "ALL",
      allowFree: true,
      minPrice: 0,
      maxPrice: 0,
      minSessions: 1,
      maxSessions: 1,
      effectiveFrom: dayjs(),
      changeReason: "",
    });
    setModalOpen(true);
  };

  const openNewVersion = (policy: PricingPolicy) => {
    setBasePolicy(policy);
    form.setFieldsValue({
      name: policy.name,
      description: policy.description,
      scopeType: policy.scopeType,
      categoryId: policy.categoryId || undefined,
      subjectId: policy.subjectId || undefined,
      courseId: policy.courseId || undefined,
      gradeLevel: policy.gradeLevel,
      level: policy.level,
      classType: policy.classType,
      allowFree: policy.allowFree,
      minPrice: Number(policy.minPrice),
      maxPrice: Number(policy.maxPrice),
      minSessions: policy.minSessions,
      maxSessions: policy.maxSessions,
      effectiveFrom: dayjs(),
      effectiveTo: policy.effectiveTo ? dayjs(policy.effectiveTo) : null,
      changeReason: `Cập nhật từ v${policy.version}`,
    });
    setModalOpen(true);
  };

  const courseLabels = useMemo(() => new Map(courses.map((course: Course) => [course.id, course.title])), [courses]);
  const categoryLabels = useMemo(
    () => new Map((categoriesQuery.data ?? []).map((category) => [category.id, category.name])),
    [categoriesQuery.data]
  );
  const subjectLabels = useMemo(
    () => new Map((subjectsQuery.data ?? []).map((subject) => [subject.id, subject.name])),
    [subjectsQuery.data]
  );

  const getScopeName = (policy: PricingPolicy) => {
    if (policy.scopeType === "COURSE") return courseLabels.get(policy.courseId || "") || policy.courseId;
    if (policy.scopeType === "SUBJECT") return subjectLabels.get(policy.subjectId || "") || policy.subjectId;
    if (policy.scopeType === "CATEGORY") return categoryLabels.get(policy.categoryId || "") || policy.categoryId;
    return "Toàn hệ thống";
  };

  const columns: ColumnsType<PricingPolicy> = [
    {
      title: "Chính sách",
      render: (_, policy) => (
        <div>
          <div className="font-semibold">{policy.name}</div>
          <div className="font-mono text-[11px] text-slate-500">{policy.policyKey} · v{policy.version}</div>
          {policy.changeReason && <div className="mt-1 text-xs text-slate-500">{policy.changeReason}</div>}
        </div>
      ),
    },
    {
      title: "Phạm vi",
      render: (_, policy) => (
        <div>
          <Tag color="blue">{SCOPE_LABEL[policy.scopeType]}</Tag>
          <div className="mt-1 text-xs text-slate-600">{getScopeName(policy)}</div>
          <div className="text-[11px] text-slate-500">
            {[policy.gradeLevel && GRADE_LEVEL_LABELS[policy.gradeLevel], policy.level && COURSE_LEVEL_LABELS[policy.level]]
              .filter(Boolean)
              .join(" · ") || "Mọi khối / cấp độ"}
          </div>
        </div>
      ),
    },
    {
      title: "Đối tượng / mức",
      render: (_, policy) => (
        <div className="text-xs">
          <div>{CLASS_TYPE_LABEL[policy.classType]}{policy.allowFree && policy.classType === "ALL" ? " · Cho phép miễn phí" : ""}</div>
          <div className="mt-1 font-semibold">{formatPrice(policy.minPrice)} – {formatPrice(policy.maxPrice)}</div>
          <div className="text-slate-500">{policy.minSessions}–{policy.maxSessions} buổi</div>
        </div>
      ),
    },
    {
      title: "Hiệu lực",
      render: (_, policy) => (
        <div className="text-xs">
          <div>{new Date(policy.effectiveFrom).toLocaleDateString("vi-VN")}</div>
          <div className="text-slate-500">
            {policy.effectiveTo ? `đến ${new Date(policy.effectiveTo).toLocaleDateString("vi-VN")}` : "không đặt ngày kết thúc"}
          </div>
        </div>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      render: (status: PricingPolicyStatus) => (
        <Tag color={POLICY_STATUS[status].color}>{POLICY_STATUS[status].label}</Tag>
      ),
    },
    {
      title: "Thao tác",
      width: 230,
      render: (_, policy) => (
        <Space wrap>
          {policy.status === "DRAFT" && (
            <Popconfirm
              title="Kích hoạt phiên bản chính sách này?"
              description="Backend sẽ thay thế phiên bản cũ cùng policy key theo thời điểm hiệu lực."
              okText="Kích hoạt"
              cancelText="Hủy"
              onConfirm={() => activateMutation.mutate(policy)}
            >
              <Button size="small" type="primary" loading={activateMutation.isPending} className="bg-emerald-600">
                Kích hoạt
              </Button>
            </Popconfirm>
          )}
          <Button size="small" onClick={() => openNewVersion(policy)}>
            Tạo phiên bản mới
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <Alert
        type="warning"
        showIcon
        message="Chính sách áp dụng khung giá và số buổi, không tự tính giá lớp"
        description="Giao diện chỉ gửi các giá trị cấu hình mà Backend hỗ trợ. Giá cuối cùng của từng Class vẫn do luồng tạo Class và xác thực Backend quyết định; không có quy tắc hiển thị giá theo từng học viên hay ngoại lệ công khai trong API hiện tại."
      />

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Phạm vi</label>
            <Select
              allowClear
              value={scopeFilter}
              onChange={(value) => {
                setScopeFilter(value);
                setPage(1);
              }}
              options={Object.entries(SCOPE_LABEL).map(([value, label]) => ({ value, label }))}
              placeholder="Tất cả phạm vi"
              className="w-52"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Trạng thái</label>
            <Select
              allowClear
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value);
                setPage(1);
              }}
              options={Object.entries(POLICY_STATUS).map(([value, status]) => ({
                value,
                label: status.label,
              }))}
              placeholder="Tất cả trạng thái"
              className="w-52"
            />
          </div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNewPolicy} className="bg-brand-600">
          Tạo chính sách
        </Button>
      </div>

      {categoriesQuery.isError || coursesQuery.isError ? (
        <Alert
          type="warning"
          showIcon
          message="Một số tên phạm vi có thể không hiển thị"
          description="Không thể tải toàn bộ danh mục/khóa học tham referencia. ID của policy vẫn được hiển thị."
          action={<Button size="small" icon={<ReloadOutlined />} onClick={() => {
            void categoriesQuery.refetch();
            void coursesQuery.refetch();
          }}>Thử lại</Button>}
        />
      ) : null}

      {policyQuery.isError ? (
        <Alert
          type="error"
          showIcon
          message="Không tải được chính sách giá"
          description={getFriendlyErrorMessage(policyQuery.error)}
          action={<Button size="small" onClick={() => policyQuery.refetch()}>Thử lại</Button>}
        />
      ) : (
        <Table<PricingPolicy>
          rowKey="id"
          columns={columns}
          dataSource={policies}
          loading={policyQuery.isLoading}
          pagination={{
            current: page,
            pageSize: policyQuery.data?.pageSize ?? 10,
            total: policyQuery.data?.total ?? 0,
            onChange: setPage,
            showTotal: (total) => `Tổng ${total} phiên bản`,
          }}
          locale={{ emptyText: "Chưa có chính sách giá phù hợp." }}
          scroll={{ x: 1000 }}
        />
      )}

      <Modal
        title={basePolicy ? `Tạo phiên bản mới từ ${basePolicy.policyKey} v${basePolicy.version}` : "Tạo chính sách giá"}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setBasePolicy(null);
        }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
        okText="Tạo bản nháp"
        cancelText="Hủy"
        width={760}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => createMutation.mutate(values)}
          onValuesChange={(changed) => {
            if (changed.scopeType) {
              form.setFieldsValue({ categoryId: undefined, subjectId: undefined, courseId: undefined });
            }
            if (changed.categoryId) form.setFieldValue("subjectId", undefined);
            if (changed.classType === "FREE") form.setFieldsValue({ minPrice: 0, maxPrice: 0 });
          }}
        >
          <div className="grid gap-x-4 md:grid-cols-2">
            <Form.Item
              name="name"
              label="Tên chính sách"
              rules={[{ required: true, whitespace: true, message: "Nhập tên chính sách." }]}
            >
              <Input maxLength={160} />
            </Form.Item>
            <Form.Item name="scopeType" label="Phạm vi" rules={[{ required: true }]}>
              <Select options={Object.entries(SCOPE_LABEL).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </div>

          {(scopeType === "CATEGORY" || scopeType === "SUBJECT" || scopeType === "COURSE") && (
            <div className="grid gap-x-4 md:grid-cols-2">
              {(scopeType === "CATEGORY" || scopeType === "SUBJECT") && (
                <Form.Item
                  name="categoryId"
                  label="Danh mục"
                  rules={[{ required: true, message: "Chọn danh mục." }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    loading={categoriesQuery.isLoading}
                    options={(categoriesQuery.data ?? []).map((category) => ({
                      value: category.id,
                      label: category.name,
                    }))}
                  />
                </Form.Item>
              )}
              {scopeType === "SUBJECT" && (
                <Form.Item name="subjectId" label="Môn học" rules={[{ required: true, message: "Chọn môn học." }]}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    loading={subjectsQuery.isLoading}
                    disabled={!categoryId}
                    options={(subjectsQuery.data ?? []).map((subject) => ({
                      value: subject.id,
                      label: subject.name,
                    }))}
                  />
                </Form.Item>
              )}
              {scopeType === "COURSE" && (
                <Form.Item name="courseId" label="Khóa học" rules={[{ required: true, message: "Chọn khóa học." }]}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    loading={coursesQuery.isLoading}
                    options={courses.map((course: Course) => ({
                      value: course.id,
                      label: `${course.title} · ${course.subjectName}`,
                    }))}
                    placeholder="Khóa học ACTIVE"
                  />
                </Form.Item>
              )}
            </div>
          )}

          <div className="grid gap-x-4 md:grid-cols-2">
            <Form.Item name="gradeLevel" label="Khối lớp (tùy chọn)">
              <Select
                allowClear
                options={allowedGrades.map((grade) => ({ value: grade, label: GRADE_LEVEL_LABELS[grade] }))}
              />
            </Form.Item>
            <Form.Item name="level" label="Cấp độ (tùy chọn)">
              <Select
                allowClear
                options={COURSE_LEVELS.map((level) => ({ value: level, label: COURSE_LEVEL_LABELS[level] }))}
              />
            </Form.Item>
          </div>

          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={2} maxLength={3000} />
          </Form.Item>

          <div className="grid gap-x-4 md:grid-cols-2">
            <Form.Item name="classType" label="Loại lớp" rules={[{ required: true }]}>
              <Select options={Object.entries(CLASS_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
            {classType === "ALL" && (
              <Form.Item name="allowFree" label="Cho phép lớp miễn phí" valuePropName="checked">
                <Switch />
              </Form.Item>
            )}
          </div>

          <div className="grid gap-x-4 md:grid-cols-2">
            <Form.Item name="minPrice" label="Giá thấp nhất" rules={[{ required: true }]}>
              <InputNumber min={0} precision={0} disabled={classType === "FREE"} className="w-full" />
            </Form.Item>
            <Form.Item name="maxPrice" label="Giá cao nhất" rules={[{ required: true }]}>
              <InputNumber min={0} precision={0} disabled={classType === "FREE"} className="w-full" />
            </Form.Item>
            <Form.Item name="minSessions" label="Số buổi tối thiểu" rules={[{ required: true }]}>
              <InputNumber min={1} precision={0} className="w-full" />
            </Form.Item>
            <Form.Item name="maxSessions" label="Số buổi tối đa" rules={[{ required: true }]}>
              <InputNumber min={1} precision={0} className="w-full" />
            </Form.Item>
          </div>

          <div className="grid gap-x-4 md:grid-cols-2">
            <Form.Item name="effectiveFrom" label="Bắt đầu hiệu lực">
              <DatePicker showTime format="DD/MM/YYYY HH:mm" className="w-full" />
            </Form.Item>
            <Form.Item name="effectiveTo" label="Kết thúc hiệu lực">
              <DatePicker showTime format="DD/MM/YYYY HH:mm" className="w-full" />
            </Form.Item>
          </div>

          <Form.Item name="changeReason" label="Lý do thay đổi">
            <Input.TextArea rows={2} maxLength={1000} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
