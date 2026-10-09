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
import { catalogService } from "../../../services/catalog.service";
import type {
  CourseProposal,
  ProposalStatus,
  CreateProposalPayload,
  UpdateProposalPayload,
  GradeLevel,
} from "../../../types/catalog";
import {
  GRADE_LEVELS,
  GRADE_LEVEL_LABELS,
  COURSE_LEVELS,
  COURSE_LEVEL_LABELS,
} from "../../../types/catalog";

const { TextArea } = Input;

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

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mode, setMode] = useState<FormMode>("create");
  const [editingProposal, setEditingProposal] = useState<CourseProposal | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [form] = Form.useForm();

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
    onError: (err: any) => {
      messageApi.error(err.message || "Gửi đề xuất thất bại.");
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
    onError: (err: any) => {
      messageApi.error(err.message || "Cập nhật thất bại.");
    },
  });

  const openCreate = () => {
    setMode("create");
    setEditingProposal(null);
    setSelectedCategoryId("");
    form.resetFields();
    setIsModalOpen(true);
  };

  const openEdit = (proposal: CourseProposal) => {
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
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (values: any) => {
    if (mode === "create") {
      createMutation.mutate(values as CreateProposalPayload);
    } else if (editingProposal) {
      updateMutation.mutate({ id: editingProposal.id, payload: values });
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
      render: (note: string | null) =>
        note ? <span className="text-gray-600 text-sm">{note}</span> : <span className="text-gray-300 text-sm">—</span>,
    },
    {
      title: "Ngày gửi",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 120,
      render: (date: string) => <span className="text-gray-500 text-sm">{dayjs(date).format("DD/MM/YYYY")}</span>,
    },
    {
      title: "Hành động",
      key: "actions",
      width: 100,
      render: (_: any, record: CourseProposal) =>
        ["PENDING_REVIEW", "NEED_CHANGES"].includes(record.status) ? (
          <Tooltip title="Chỉnh sửa và gửi lại">
            <Button
              icon={<EditOutlined />}
              size="small"
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
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={openCreate}
          className="bg-indigo-600 rounded-xl font-semibold h-[42px]"
        >
          Đề xuất mới
        </Button>
      </div>

      {/* Info banner */}
      <Alert
        type="info"
        showIcon
        message="Lưu ý về quy trình đề xuất"
        description={
          <ul className="list-disc ml-4 text-sm text-gray-600 space-y-1 mt-1">
            <li>Đề xuất cần đợi Admin xem xét (thường 1-3 ngày làm việc).</li>
            <li>Khi được duyệt, khóa học sẽ được tự động thêm vào danh mục.</li>
            <li>Bạn có thể chỉnh sửa khi ở trạng thái <strong>Chờ duyệt</strong> hoặc <strong>Cần chỉnh sửa</strong>.</li>
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
                  <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} className="bg-indigo-600">
                    Tạo đề xuất đầu tiên
                  </Button>
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
