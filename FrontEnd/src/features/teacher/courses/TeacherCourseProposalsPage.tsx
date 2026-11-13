import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Table,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  Alert,
  Empty,
  Skeleton,
  message,
  Tooltip,
  InputNumber,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  BookOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { courseProposalService } from "../../../services/courseProposal.service";
import { courseCatalogService as catalogService } from "../../../services/courseCatalog.service";
import type {
  CourseProposal,
  ProposalStatus,
  CreateProposalPayload,
  UpdateProposalPayload,
  GradeLevel,
  ProposalPricingExpectation,
  ProposalSyllabusUnit,
} from "../../../types/catalog";
import {
  GRADE_LEVELS,
  GRADE_LEVEL_LABELS,
  COURSE_LEVELS,
  COURSE_LEVEL_LABELS,
} from "../../../types/catalog";
import {
  getVerificationGuidanceMessage,
  useTeacherVerification,
} from "../../../hooks/useTeacherVerification";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";

const { TextArea } = Input;

interface ProposalFormValues extends Omit<CreateProposalPayload, "syllabusDraft" | "pricingExpectation"> {
  syllabusDraft?: {
    summary?: string;
    units?: Array<Omit<ProposalSyllabusUnit, "unitOrder" | "topics"> & { topicsText?: string }>;
  };
  pricingExpectation?: ProposalPricingExpectation;
}

function toProposalPayload(values: ProposalFormValues): CreateProposalPayload {
  const units = values.syllabusDraft?.units
    ?.filter((unit) => unit.title.trim())
    .map((unit, index) => ({
      unitOrder: index + 1,
      title: unit.title.trim(),
      description: unit.description?.trim() || "",
      learningObjectives: unit.learningObjectives?.trim() || "",
      durationMinutes: unit.durationMinutes ?? null,
      topics: unit.topicsText?.split(/\r?\n|,/).map((topic) => topic.trim()).filter(Boolean) ?? [],
    }));
  const expectation = values.pricingExpectation;
  return {
    ...values,
    syllabusDraft: values.syllabusDraft
      ? { summary: values.syllabusDraft.summary?.trim() || "", units: units || [] }
      : undefined,
    pricingExpectation: expectation
      ? {
          ...expectation,
          notes: expectation.notes?.trim() || "",
        }
      : undefined,
  };
}

const STATUS_CONFIG: Record<ProposalStatus, { color: string; label: string; icon: React.ReactNode }> = {
  PENDING_REVIEW: { color: "orange", label: "Chờ duyệt", icon: <ClockCircleOutlined /> },
  NEED_CHANGES: { color: "gold", label: "Cần chỉnh sửa", icon: <ExclamationCircleOutlined /> },
  APPROVED: { color: "success", label: "Đã duyệt", icon: <CheckCircleOutlined /> },
  REJECTED: { color: "error", label: "Bị từ chối", icon: <CloseCircleOutlined /> },
};

type FormMode = "create" | "edit";

export default function TeacherCourseProposalsPage() {
  const queryClient = useQueryClient();
  const [messageApi, contextHolder] = message.useMessage();
  const { isVerified, verificationStatus } = useTeacherVerification();
  const lockTooltip = getVerificationGuidanceMessage(verificationStatus);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mode, setMode] = useState<FormMode>("create");
  const [editingProposal, setEditingProposal] = useState<CourseProposal | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [form] = Form.useForm<ProposalFormValues>();

  // List proposals
  const { data: proposalsData, isLoading, isError } = useQuery({
    queryKey: ["teacher-proposals"],
    queryFn: () => courseProposalService.listMyProposals({ pageSize: 50 }),
    staleTime: 30_000,
  });

  // Categories for dropdown
  const { data: categories = [] } = useQuery({
    queryKey: ["public-categories"],
    queryFn: () => catalogService.listCategories(),
    staleTime: 300_000,
  });

  // Subjects for selected category
  const { data: subjects = [] } = useQuery({
    queryKey: ["public-subjects", selectedCategoryId],
    queryFn: () => selectedCategoryId ? catalogService.listSubjectsByCategory(selectedCategoryId) : Promise.resolve([]),
    enabled: !!selectedCategoryId,
    staleTime: 120_000,
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateProposalPayload) => courseProposalService.createProposal(payload),
    onSuccess: () => {
      messageApi.success("Đã gửi đề xuất khóa học thành công!");
      queryClient.invalidateQueries({ queryKey: ["teacher-proposals"] });
      setIsModalOpen(false);
      form.resetFields();
    },
    onError: (err: unknown) => {
      messageApi.error(getFriendlyErrorMessage(err, "Gửi đề xuất thất bại."));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateProposalPayload }) =>
      courseProposalService.updateMyProposal(id, payload),
    onSuccess: () => {
      messageApi.success("Đã cập nhật và gửi lại đề xuất!");
      queryClient.invalidateQueries({ queryKey: ["teacher-proposals"] });
      setIsModalOpen(false);
      form.resetFields();
    },
    onError: (err: unknown) => {
      messageApi.error(getFriendlyErrorMessage(err, "Cập nhật thất bại."));
    },
  });

  const openCreate = () => {
    if (!isVerified) {
      messageApi.warning(lockTooltip);
      return;
    }
    setMode("create");
    setEditingProposal(null);
    setSelectedCategoryId("");
    form.resetFields();
    setIsModalOpen(true);
  };

  const openEdit = (proposal: CourseProposal) => {
    if (!isVerified) {
      messageApi.warning(lockTooltip);
      return;
    }
    if (!["PENDING_REVIEW", "NEED_CHANGES"].includes(proposal.status)) {
      messageApi.warning("Đề xuất này không thể chỉnh sửa.");
      return;
    }
    setMode("edit");
    setEditingProposal(proposal);
    setSelectedCategoryId(proposal.categoryId);
    form.setFieldsValue({
      categoryId: proposal.categoryId,
      subjectId: proposal.subjectId,
      title: proposal.title,
      description: proposal.description,
      learningObjectives: proposal.learningObjectives,
      syllabus: proposal.syllabus,
      level: proposal.level,
      gradeLevel: proposal.gradeLevel,
      prerequisites: proposal.prerequisites,
      estimatedDuration: proposal.estimatedDuration,
      syllabusDraft: proposal.syllabusDraft
        ? {
            summary: proposal.syllabusDraft.summary,
            units: proposal.syllabusDraft.units?.map((unit) => ({
              ...unit,
              topicsText: unit.topics?.join("\n") || "",
            })),
          }
        : undefined,
      pricingExpectation: proposal.pricingExpectation,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (values: ProposalFormValues) => {
    const payload = toProposalPayload(values);
    if (mode === "create") {
      createMutation.mutate(payload);
    } else if (editingProposal) {
      updateMutation.mutate({ id: editingProposal.id, payload: payload as UpdateProposalPayload });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const columns = [
    {
      title: "Tên khóa học đề xuất",
      dataIndex: "title",
      key: "title",
      render: (text: string, record: CourseProposal) => (
        <div>
          <div className="font-semibold text-gray-900">{text}</div>
          <div className="text-xs text-gray-400">{record.categoryName} · {record.subjectName}</div>
        </div>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 150,
      render: (status: ProposalStatus) => {
        const cfg = STATUS_CONFIG[status];
        return (
          <Tag icon={cfg.icon} color={cfg.color} className="font-medium">
            {cfg.label}
          </Tag>
        );
      },
    },
    {
      title: "Ghi chú Admin",
      dataIndex: "reviewNote",
      key: "reviewNote",
      render: (note: string | null, record: CourseProposal) => (
        <div className="space-y-1">
          {note ? (
            <span className="text-gray-600 text-sm">{note}</span>
          ) : (
            <span className="text-gray-300 text-sm">Chưa có ghi chú</span>
          )}
          {record.revisionHistory?.length ? (
            <div className="text-xs text-slate-400">
              {record.revisionHistory.length} cập nhật phản hồi/gửi lại
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: "Ngày gửi",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 120,
      render: (date: string) => <span className="text-gray-500 text-sm">{dayjs(date).format("DD/MM/YYYY")}</span>,
    },
    {
      title: "Phản hồi gần nhất",
      dataIndex: "reviewedAt",
      key: "reviewedAt",
      width: 150,
      render: (date: string | null | undefined, record: CourseProposal) =>
        date ? (
          <div className="text-xs">
            <div>{dayjs(date).format("DD/MM/YYYY")}</div>
            <div className="text-slate-500">Lần nộp {record.revisionNumber || 1}</div>
          </div>
        ) : <span className="text-slate-400">Chưa có</span>,
    },
    {
      title: "Hành động",
      key: "actions",
      width: 100,
      render: (_: any, record: CourseProposal) =>
        ["PENDING_REVIEW", "NEED_CHANGES"].includes(record.status) ? (
          <Tooltip title={!isVerified ? lockTooltip : "Chỉnh sửa và gửi lại"}>
            <Button
              icon={<EditOutlined />}
              size="small"
              disabled={!isVerified}
              onClick={() => openEdit(record)}
            />
          </Tooltip>
        ) : null,
    },
  ];

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);

  return (
    <div className="max-w-[1200px] mx-auto space-y-5 sm:space-y-6">
      {contextHolder}

      <div className="flex items-center justify-between">
        <div>
          <div className="text-[12px] font-medium text-slate-400 mb-1">
            Giáo viên / <span className="text-indigo-600">Đề xuất khóa học</span>
          </div>
          <h1 className="text-[28px] font-bold text-slate-800 leading-tight">Đề xuất khóa học</h1>
          <p className="text-slate-500 text-sm mt-1">Gửi đề xuất khóa học để Admin xem xét và thêm vào danh mục.</p>
        </div>
        <Tooltip title={!isVerified ? lockTooltip : undefined}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!isVerified}
            onClick={openCreate}
            className="bg-indigo-600 rounded-xl font-semibold h-[42px]"
          >
            Đề xuất mới
          </Button>
        </Tooltip>
      </div>

      {/* Info banner */}
      <Alert
        type="info"
        showIcon
        message="Lưu ý về quy trình đề xuất"
        description={
          <ul className="list-disc ml-4 text-sm text-gray-600 space-y-1 mt-1">
            <li>Đề xuất cần đợi Admin xem xét (thường 1-3 ngày làm việc).</li>
            <li>Phản hồi và ghi chú của Admin sẽ hiển thị trong trạng thái đề xuất.</li>
            <li>Bạn có thể chỉnh sửa khi ở trạng thái <strong>Chờ duyệt</strong> hoặc <strong>Cần chỉnh sửa</strong>.</li>
            <li>Quy tắc trạng thái Course khi duyệt đang chờ BA/PO xác nhận.</li>
          </ul>
        }
        className="rounded-xl"
      />

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {isLoading && <div className="p-8"><Skeleton active paragraph={{ rows: 4 }} /></div>}

        {isError && (
          <div className="p-8">
            <Alert type="error" message="Không thể tải danh sách đề xuất" showIcon />
          </div>
        )}

        {!isLoading && !isError && proposalsData?.items.length === 0 && (
          <div className="py-16">
            <Empty
              image={<BookOutlined className="text-5xl text-gray-300" />}
              description={
                <div>
                  <p className="font-semibold text-gray-600 mb-2">Chưa có đề xuất nào</p>
                  <Tooltip title={!isVerified ? lockTooltip : undefined}>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      disabled={!isVerified}
                      onClick={openCreate}
                      className="bg-indigo-600"
                    >
                      Tạo đề xuất đầu tiên
                    </Button>
                  </Tooltip>
                </div>
              }
            />
          </div>
        )}

        {!isLoading && !isError && (proposalsData?.items.length ?? 0) > 0 && (
          <Table
            columns={columns}
            dataSource={proposalsData?.items || []}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            className="rounded-2xl"
          />
        )}
      </div>

      {/* Create/Edit Modal */}
      <Modal
        title={mode === "create" ? "Tạo đề xuất khóa học mới" : "Chỉnh sửa đề xuất"}
        open={isModalOpen}
        onCancel={() => !isPending && setIsModalOpen(false)}
        footer={null}
        width={700}
        maskClosable={false}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <Form.Item label="Danh mục" name="categoryId" rules={[{ required: true, message: "Chọn danh mục" }]}>
              <Select
                placeholder="Chọn danh mục"
                options={categories.map((c) => ({ value: c.id, label: c.name }))}
                onChange={(val) => {
                  setSelectedCategoryId(val);
                  form.setFieldValue("subjectId", undefined);
                  form.setFieldValue("gradeLevel", undefined);
                }}
              />
            </Form.Item>

            <Form.Item label="Môn học" name="subjectId" rules={[{ required: true, message: "Chọn môn học" }]}>
              <Select
                placeholder={selectedCategoryId ? "Chọn môn học" : "Chọn danh mục trước"}
                disabled={!selectedCategoryId}
                options={subjects.map((s) => ({ value: s.id, label: s.name }))}
              />
            </Form.Item>
          </div>

          <Form.Item label="Tên khóa học đề xuất" name="title" rules={[{ required: true, message: "Nhập tên khóa học" }]}>
            <Input placeholder="VD: Toán Đại số Lớp 10 nâng cao" />
          </Form.Item>

          <Form.Item label="Mô tả khóa học" name="description" rules={[{ required: true, message: "Nhập mô tả" }]}>
            <TextArea rows={3} placeholder="Mô tả tổng quan về khóa học..." />
          </Form.Item>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <Form.Item label="Cấp độ" name="level">
              <Select
                placeholder="Chọn cấp độ (tùy chọn)"
                allowClear
                options={COURSE_LEVELS.map((l) => ({ value: l, label: COURSE_LEVEL_LABELS[l] }))}
              />
            </Form.Item>

            <Form.Item label="Khối lớp" name="gradeLevel">
              <Select
                placeholder="Chọn khối lớp (tùy chọn)"
                allowClear
                options={(selectedCategory?.allowedGradeLevels || GRADE_LEVELS).map((g) => ({
                  value: g,
                  label: GRADE_LEVEL_LABELS[g as GradeLevel],
                }))}
              />
            </Form.Item>
          </div>

          <Form.Item label="Mục tiêu học tập" name="learningObjectives">
            <TextArea rows={2} placeholder="Học viên sẽ đạt được gì sau khóa học..." />
          </Form.Item>

          <Form.Item label="Đề cương (syllabus)" name="syllabus">
            <TextArea rows={2} placeholder="Danh sách các chủ đề/bài học..." />
          </Form.Item>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-1 font-semibold text-slate-800">Đề cương có cấu trúc (tùy chọn)</div>
            <p className="mb-3 text-xs text-slate-500">
              Nếu được duyệt, nội dung cấu trúc này có thể được chuyển thành syllabus version đầu tiên.
            </p>
            <Form.Item name={["syllabusDraft", "summary"]} label="Tóm tắt đề cương">
              <TextArea rows={2} maxLength={2000} />
            </Form.Item>
            <Form.List name={["syllabusDraft", "units"]}>
              {(fields, { add, remove }) => (
                <div className="space-y-3">
                  {fields.map((field, index) => (
                    <div key={field.key} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-600">Bài học {index + 1}</span>
                        <Button size="small" danger onClick={() => remove(field.name)}>Xóa</Button>
                      </div>
                      <Form.Item
                        {...field}
                        name={[field.name, "title"]}
                        label="Tên bài học"
                        rules={[{ required: true, whitespace: true, message: "Nhập tên bài học." }]}
                      >
                        <Input maxLength={200} />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, "description"]} label="Mô tả">
                        <Input />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, "learningObjectives"]} label="Mục tiêu">
                        <Input />
                      </Form.Item>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Form.Item {...field} name={[field.name, "durationMinutes"]} label="Thời lượng (phút)">
                          <InputNumber min={0} precision={0} className="w-full" />
                        </Form.Item>
                        <Form.Item {...field} name={[field.name, "topicsText"]} label="Chủ đề (phân cách bằng dấu phẩy)">
                          <Input />
                        </Form.Item>
                      </div>
                    </div>
                  ))}
                  <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add()}>
                    Thêm bài học
                  </Button>
                </div>
              )}
            </Form.List>
          </div>

          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="mb-1 font-semibold text-amber-900">Đề xuất học phí (chỉ tham khảo)</div>
            <p className="mb-3 text-xs text-amber-800">
              Đây không phải giá được duyệt hay cam kết học phí. Admin xử lý theo chính sách giá hiện hành.
            </p>
            <div className="grid gap-x-4 md:grid-cols-2">
              <Form.Item name={["pricingExpectation", "suggestedClassType"]} label="Loại lớp đề xuất">
                <Select
                  allowClear
                  options={[
                    { value: "FREE", label: "Miễn phí" },
                    { value: "PAID", label: "Có học phí" },
                  ]}
                />
              </Form.Item>
              <Form.Item name={["pricingExpectation", "estimatedSessions"]} label="Số buổi dự kiến">
                <InputNumber min={1} precision={0} className="w-full" />
              </Form.Item>
              <Form.Item name={["pricingExpectation", "suggestedMinPrice"]} label="Mức giá tham khảo từ (đ)">
                <InputNumber min={0} precision={0} className="w-full" />
              </Form.Item>
              <Form.Item name={["pricingExpectation", "suggestedMaxPrice"]} label="Mức giá tham khảo đến (đ)">
                <InputNumber min={0} precision={0} className="w-full" />
              </Form.Item>
            </div>
            <Form.Item name={["pricingExpectation", "notes"]} label="Ghi chú về đề xuất giá" className="!mb-0">
              <TextArea rows={2} maxLength={1000} />
            </Form.Item>
          </div>

          <Form.Item label="Điều kiện tiên quyết" name="prerequisites">
            <TextArea rows={2} placeholder="Kiến thức/kỹ năng cần có trước..." />
          </Form.Item>

          <Form.Item label="Thời lượng ước tính" name="estimatedDuration">
            <Input placeholder="VD: 40 buổi, 3 tháng..." />
          </Form.Item>

          <div className="flex justify-end gap-3 mt-2">
            <Button onClick={() => setIsModalOpen(false)} disabled={isPending}>Hủy</Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={isPending}
              className="bg-indigo-600"
            >
              {mode === "create" ? "Gửi đề xuất" : "Cập nhật và gửi lại"}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
