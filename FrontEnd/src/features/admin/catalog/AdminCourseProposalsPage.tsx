import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table,
  Button,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  message,
  Space,
  Descriptions,
  Alert,
} from "antd";
import {
  FileTextOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  FilterOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { courseProposalService } from "../../../services/courseProposal.service";
import type {
  CourseProposal,
  ProposalStatus,
  ApproveProposalPayload,
  ReviewProposalPayload,
} from "../../../types/catalog";
import {
  GRADE_LEVELS,
  GRADE_LEVEL_LABELS,
  COURSE_LEVEL_LABELS,
} from "../../../types/catalog";

const { TextArea } = Input;

const STATUS_CONFIG: Record<ProposalStatus, { color: string; label: string; icon: React.ReactNode }> = {
  PENDING_REVIEW: { color: "orange", label: "Chờ duyệt", icon: <ClockCircleOutlined /> },
  NEED_CHANGES: { color: "gold", label: "Yêu cầu chỉnh sửa", icon: <ExclamationCircleOutlined /> },
  APPROVED: { color: "success", label: "Đã duyệt", icon: <CheckCircleOutlined /> },
  REJECTED: { color: "error", label: "Từ chối", icon: <CloseCircleOutlined /> },
};

type ReviewActionType = "approve" | "reject" | "request-changes";

export default function AdminCourseProposalsPage() {
  const queryClient = useQueryClient();
  const [messageApi, contextHolder] = message.useMessage();

  const [statusFilter, setStatusFilter] = useState<ProposalStatus | "">("PENDING_REVIEW");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Selected proposal for detail view or review action
  const [selectedProposal, setSelectedProposal] = useState<CourseProposal | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Review action modal state
  const [actionType, setActionType] = useState<ReviewActionType | null>(null);
  const [reviewForm] = Form.useForm();

  // Query proposals
  const { data: proposalsData, isLoading, refetch } = useQuery({
    queryKey: ["admin-course-proposals", statusFilter, page],
    queryFn: () =>
      courseProposalService.adminListProposals({
        status: statusFilter || undefined,
        page,
        pageSize,
      }),
    staleTime: 30_000,
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ApproveProposalPayload }) =>
      courseProposalService.approveProposal(id, payload),
    onSuccess: (data) => {
      messageApi.success(`Đã phê duyệt đề xuất! Khóa học "${data.course?.title || ""}" đã được đưa vào danh mục.`);
      queryClient.invalidateQueries({ queryKey: ["admin-course-proposals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      queryClient.invalidateQueries({ queryKey: ["public-courses"] });
      setActionType(null);
      setIsDetailModalOpen(false);
      reviewForm.resetFields();
    },
    onError: (err: any) => {
      messageApi.error(err.message || "Lỗi khi phê duyệt đề xuất.");
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReviewProposalPayload }) =>
      courseProposalService.rejectProposal(id, payload),
    onSuccess: () => {
      messageApi.success("Đã từ chối đề xuất khóa học.");
      queryClient.invalidateQueries({ queryKey: ["admin-course-proposals"] });
      setActionType(null);
      setIsDetailModalOpen(false);
      reviewForm.resetFields();
    },
    onError: (err: any) => {
      messageApi.error(err.message || "Lỗi khi từ chối đề xuất.");
    },
  });

  // Request changes mutation
  const requestChangesMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReviewProposalPayload }) =>
      courseProposalService.requestProposalChanges(id, payload),
    onSuccess: () => {
      messageApi.success("Đã yêu cầu giáo viên cập nhật lại đề xuất.");
      queryClient.invalidateQueries({ queryKey: ["admin-course-proposals"] });
      setActionType(null);
      setIsDetailModalOpen(false);
      reviewForm.resetFields();
    },
    onError: (err: any) => {
      messageApi.error(err.message || "Lỗi khi yêu cầu chỉnh sửa.");
    },
  });

  const handleOpenReview = (proposal: CourseProposal, type: ReviewActionType) => {
    setSelectedProposal(proposal);
    setActionType(type);
    reviewForm.resetFields();
    if (type === "approve") {
      reviewForm.setFieldsValue({
        gradeLevel: proposal.gradeLevel || undefined,
        reviewNote: "",
      });
    }
  };

  const handleExecuteAction = (values: any) => {
    if (!selectedProposal || !actionType) return;
    if (actionType === "approve") {
      approveMutation.mutate({
        id: selectedProposal.id,
        payload: {
          gradeLevel: values.gradeLevel,
          reviewNote: values.reviewNote?.trim() || undefined,
        },
      });
    } else if (actionType === "reject") {
      rejectMutation.mutate({
        id: selectedProposal.id,
        payload: {
          reviewNote: values.reviewNote?.trim() || undefined,
        },
      });
    } else if (actionType === "request-changes") {
      requestChangesMutation.mutate({
        id: selectedProposal.id,
        payload: {
          reviewNote: values.reviewNote?.trim(),
        },
      });
    }
  };

  const isSubmitting =
    approveMutation.isPending || rejectMutation.isPending || requestChangesMutation.isPending;

  return (
    <div className="space-y-6">
      {contextHolder}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <FileTextOutlined className="text-brand-600" />
            Xét duyệt Đề xuất Khóa học
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Kiểm tra và duyệt các đề xuất khóa học mới do giáo viên gửi lên trước khi đưa vào catalog chính thức.
          </p>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FilterOutlined className="text-gray-400" />
          <span className="text-xs font-semibold text-gray-600">Trạng thái:</span>
          <Select
            value={statusFilter}
            onChange={(val) => {
              setStatusFilter(val);
              setPage(1);
            }}
            className="w-52"
            options={[
              { value: "", label: "Tất cả trạng thái" },
              { value: "PENDING_REVIEW", label: "Chờ duyệt (Pending)" },
              { value: "NEED_CHANGES", label: "Yêu cầu chỉnh sửa" },
              { value: "APPROVED", label: "Đã duyệt (Approved)" },
              { value: "REJECTED", label: "Đã từ chối (Rejected)" },
            ]}
          />
        </div>

        <Button onClick={() => refetch()} size="small">
          Làm mới
        </Button>
      </div>

      {/* Proposals Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <Table
          dataSource={proposalsData?.items || []}
          rowKey="id"
          loading={isLoading}
          pagination={{
            current: page,
            pageSize,
            total: proposalsData?.total || 0,
            onChange: (p) => setPage(p),
            showTotal: (total) => `Tổng ${total} đề xuất`,
          }}
          columns={[
            {
              title: "Khóa học đề xuất",
              dataIndex: "title",
              key: "title",
              render: (title: string, record: CourseProposal) => (
                <div>
                  <div className="font-semibold text-gray-900">{title}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                    <span>{record.categoryName}</span>
                    <span>•</span>
                    <span>{record.subjectName}</span>
                  </div>
                </div>
              ),
            },
            {
              title: "Giáo viên gửi",
              key: "teacher",
              render: (_: any, record: CourseProposal) => (
                <div>
                  <div className="text-sm font-medium text-gray-800">
                    {record.teacherName || "Chưa cập nhật tên"}
                  </div>
                  <div className="text-xs text-gray-400">{record.teacherEmail}</div>
                </div>
              ),
            },
            {
              title: "Khối lớp & Cấp độ",
              key: "grade_level",
              render: (_: any, record: CourseProposal) => (
                <div className="space-y-1">
                  {record.gradeLevel ? (
                    <Tag color="blue">{GRADE_LEVEL_LABELS[record.gradeLevel]}</Tag>
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
              render: (status: ProposalStatus) => {
                const conf = STATUS_CONFIG[status];
                return (
                  <Tag color={conf?.color} icon={conf?.icon}>
                    {conf?.label || status}
                  </Tag>
                );
              },
            },
            {
              title: "Ngày gửi",
              dataIndex: "createdAt",
              key: "createdAt",
              render: (d: string) => dayjs(d).format("DD/MM/YYYY HH:mm"),
            },
            {
              title: "Thao tác",
              key: "action",
              align: "right",
              render: (_: any, record: CourseProposal) => (
                <Space>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => {
                      setSelectedProposal(record);
                      setIsDetailModalOpen(true);
                    }}
                  >
                    Xem
                  </Button>

                  {record.status === "PENDING_REVIEW" && (
                    <>
                      <Button
                        size="small"
                        type="primary"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => handleOpenReview(record, "approve")}
                      >
                        Duyệt
                      </Button>
                      <Button
                        size="small"
                        className="text-amber-600 border-amber-300 hover:border-amber-500"
                        onClick={() => handleOpenReview(record, "request-changes")}
                      >
                        Yêu cầu sửa
                      </Button>
                      <Button
                        size="small"
                        danger
                        onClick={() => handleOpenReview(record, "reject")}
                      >
                        Từ chối
                      </Button>
                    </>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </div>

      {/* ================================================= */}
      {/* MODAL: DETAIL VIEW */}
      {/* ================================================= */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <FileTextOutlined className="text-brand-600" />
            <span>Chi tiết đề xuất: {selectedProposal?.title}</span>
          </div>
        }
        open={isDetailModalOpen}
        onCancel={() => setIsDetailModalOpen(false)}
        width={750}
        footer={[
          <Button key="close" onClick={() => setIsDetailModalOpen(false)}>
            Đóng
          </Button>,
          selectedProposal?.status === "PENDING_REVIEW" && (
            <Button
              key="action"
              type="primary"
              className="bg-brand-600"
              onClick={() => {
                if (selectedProposal) handleOpenReview(selectedProposal, "approve");
              }}
            >
              Tiến hành xét duyệt
            </Button>
          ),
        ]}
      >
        {selectedProposal && (
          <div className="space-y-4 py-2">
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Tên đề xuất" span={2}>
                <span className="font-semibold">{selectedProposal.title}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Giáo viên">
                {selectedProposal.teacherName || selectedProposal.teacherEmail}
              </Descriptions.Item>
              <Descriptions.Item label="Email">
                {selectedProposal.teacherEmail}
              </Descriptions.Item>
              <Descriptions.Item label="Danh mục">
                <Tag color="blue">{selectedProposal.categoryName}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Môn học">
                <Tag color="cyan">{selectedProposal.subjectName}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Khối lớp">
                {selectedProposal.gradeLevel
                  ? GRADE_LEVEL_LABELS[selectedProposal.gradeLevel]
                  : "Chưa gán"}
              </Descriptions.Item>
              <Descriptions.Item label="Cấp độ">
                {selectedProposal.level
                  ? COURSE_LEVEL_LABELS[selectedProposal.level]
                  : "Không xác định"}
              </Descriptions.Item>
              <Descriptions.Item label="Thời lượng dự kiến">
                {selectedProposal.estimatedDuration || "Chưa xác định"}
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                <Tag color={STATUS_CONFIG[selectedProposal.status]?.color}>
                  {STATUS_CONFIG[selectedProposal.status]?.label}
                </Tag>
              </Descriptions.Item>
            </Descriptions>

            <div className="space-y-3 text-sm">
              <div>
                <h4 className="font-semibold text-gray-800">Mô tả khóa học:</h4>
                <p className="text-gray-600 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg border border-gray-100 mt-1">
                  {selectedProposal.description}
                </p>
              </div>

              {selectedProposal.learningObjectives && (
                <div>
                  <h4 className="font-semibold text-gray-800">Mục tiêu học tập:</h4>
                  <p className="text-gray-600 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg border border-gray-100 mt-1">
                    {selectedProposal.learningObjectives}
                  </p>
                </div>
              )}

              {selectedProposal.syllabus && (
                <div>
                  <h4 className="font-semibold text-gray-800">Khung chương trình (Syllabus):</h4>
                  <p className="text-gray-600 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg border border-gray-100 mt-1">
                    {selectedProposal.syllabus}
                  </p>
                </div>
              )}

              {selectedProposal.prerequisites && (
                <div>
                  <h4 className="font-semibold text-gray-800">Yêu cầu tiên quyết:</h4>
                  <p className="text-gray-600 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg border border-gray-100 mt-1">
                    {selectedProposal.prerequisites}
                  </p>
                </div>
              )}

              {selectedProposal.reviewNote && (
                <div>
                  <h4 className="font-semibold text-amber-700">Ghi chú phản hồi trước đó:</h4>
                  <Alert
                    type="warning"
                    message={selectedProposal.reviewNote}
                    className="mt-1"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ================================================= */}
      {/* MODAL: REVIEW ACTION (APPROVE / REJECT / NEED_CHANGES) */}
      {/* ================================================= */}
      <Modal
        title={
          actionType === "approve"
            ? "Phê duyệt đề xuất khóa học"
            : actionType === "reject"
            ? "Từ chối đề xuất khóa học"
            : "Yêu cầu giáo viên chỉnh sửa đề xuất"
        }
        open={!!actionType}
        onCancel={() => setActionType(null)}
        footer={null}
        destroyOnClose
      >
        <Form
          form={reviewForm}
          layout="vertical"
          onFinish={handleExecuteAction}
          className="mt-4"
        >
          {actionType === "approve" && (
            <>
              <Alert
                type="info"
                message="Tự động thêm vào Catalog"
                description="Khi bạn phê duyệt, Backend sẽ tự động khởi tạo một Khóa học chính thức (Course) trong danh mục tương ứng để giáo viên có thể mở lớp."
                showIcon
                className="mb-4"
              />

              <Form.Item
                name="gradeLevel"
                label="Xác nhận Khối lớp áp dụng (Admin có thể điều chỉnh)"
              >
                <Select
                  allowClear
                  placeholder="Chọn khối lớp phù hợp"
                  options={GRADE_LEVELS.map((g) => ({
                    value: g,
                    label: GRADE_LEVEL_LABELS[g],
                  }))}
                />
              </Form.Item>

              <Form.Item name="reviewNote" label="Ghi chú cho giáo viên (tùy chọn)">
                <TextArea rows={3} placeholder="Nội dung lời nhắn đến giáo viên..." />
              </Form.Item>
            </>
          )}

          {actionType === "reject" && (
            <>
              <Alert
                type="error"
                message="Lưu ý khi từ chối"
                description="Đề xuất sẽ chuyển sang trạng thái REJECTED và không thể chỉnh sửa lại."
                showIcon
                className="mb-4"
              />

              <Form.Item name="reviewNote" label="Lý do từ chối (tùy chọn)">
                <TextArea
                  rows={3}
                  placeholder="Nêu rõ lý do để giáo viên nắm được thông tin..."
                />
              </Form.Item>
            </>
          )}

          {actionType === "request-changes" && (
            <>
              <Alert
                type="warning"
                message="Yêu cầu bổ sung thông tin"
                description="Giáo viên sẽ nhận được thông báo kèm ghi chú bên dưới để chỉnh sửa và gửi lại đề xuất."
                showIcon
                className="mb-4"
              />

              <Form.Item
                name="reviewNote"
                label="Nội dung cần chỉnh sửa (Bắt buộc)"
                rules={[{ required: true, message: "Vui lòng nhập ghi chú yêu cầu chỉnh sửa" }]}
              >
                <TextArea
                  rows={3}
                  placeholder="Ghi rõ các điểm cần bổ sung (ví dụ: syllabus chi tiết hơn, mục tiêu học tập...)"
                />
              </Form.Item>
            </>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button onClick={() => setActionType(null)}>Hủy</Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={isSubmitting}
              className={
                actionType === "approve"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : actionType === "reject"
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-amber-600 hover:bg-amber-700"
              }
            >
              {actionType === "approve"
                ? "Xác nhận Phê duyệt"
                : actionType === "reject"
                ? "Xác nhận Từ chối"
                : "Gửi yêu cầu chỉnh sửa"}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
