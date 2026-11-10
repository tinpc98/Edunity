import React, { useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
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
  Skeleton,
} from "antd";
import {
  FileTextOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  FilterOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { courseProposalService } from "../../../services/courseProposal.service";
import { courseCatalogService as catalogService } from "../../../services/courseCatalog.service";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";
import type {
  CourseProposal,
  ProposalStatus,
  ApproveProposalPayload,
  ReviewProposalPayload,
  GradeLevel,
} from "../../../types/catalog";
import {
  GRADE_LEVELS,
  GRADE_LEVEL_LABELS,
  COURSE_LEVEL_LABELS,
  PROPOSAL_STATUSES,
} from "../../../types/catalog";

const { TextArea } = Input;

const STATUS_CONFIG: Record<ProposalStatus, { color: string; label: string; icon: React.ReactNode }> = {
  PENDING_REVIEW: { color: "orange", label: "Chờ duyệt", icon: <ClockCircleOutlined /> },
  NEED_CHANGES: { color: "gold", label: "Yêu cầu chỉnh sửa", icon: <ExclamationCircleOutlined /> },
  APPROVED: { color: "success", label: "Đã duyệt", icon: <CheckCircleOutlined /> },
  REJECTED: { color: "error", label: "Từ chối", icon: <CloseCircleOutlined /> },
};

type ReviewActionType = "approve" | "reject" | "request-changes";

interface ReviewFormValues {
  gradeLevel: GradeLevel;
  reviewNote?: string;
}

export default function AdminCourseProposalsPage() {
  const queryClient = useQueryClient();
  const [messageApi, contextHolder] = message.useMessage();
  const [searchParams, setSearchParams] = useSearchParams();

  // Derive URL search params (CUR-04-FE-06)
  const rawStatus = searchParams.get("status");
  const statusFilter: ProposalStatus | "" =
    rawStatus === "ALL"
      ? ""
      : rawStatus && (PROPOSAL_STATUSES as readonly string[]).includes(rawStatus)
      ? (rawStatus as ProposalStatus)
      : "PENDING_REVIEW";

  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const pageSize = 10;

  const updateSearchParams = useCallback(
    (
      updates: Record<string, string | undefined>,
      options?: { replace?: boolean }
    ) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(updates).forEach(([key, value]) => {
            if (!value || (key === "page" && value === "1")) {
              next.delete(key);
            } else {
              next.set(key, value);
            }
          });
          return next;
        },
        options
      );
    },
    [setSearchParams]
  );

  // Selected proposal for detail view or review action
  const [selectedProposal, setSelectedProposal] = useState<CourseProposal | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Review action modal state
  const [actionType, setActionType] = useState<ReviewActionType | null>(null);
  const [reviewForm] = Form.useForm();

  // Query proposals
  const {
    data: proposalsData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-course-proposals", statusFilter, page],
    queryFn: () =>
      courseProposalService.adminListProposals({
        status: statusFilter || undefined,
        page,
        pageSize,
      }),
    staleTime: 30_000,
  });

  // Categories for gradeLevel filtering (BR-45)
  const { data: categories = [] } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => catalogService.listCategories(),
    staleTime: 60_000,
  });

  // Query single proposal detail when Detail Modal is open (CUR-04-FE-04)
  const {
    data: proposalDetailData,
    isLoading: loadingProposalDetail,
    isError: isErrorProposalDetail,
    error: errorProposalDetail,
    refetch: refetchProposalDetail,
  } = useQuery({
    queryKey: ["admin-course-proposal-detail", selectedProposal?.id],
    queryFn: () => courseProposalService.adminGetProposal(selectedProposal!.id),
    enabled: isDetailModalOpen && !!selectedProposal?.id,
    staleTime: 15_000,
  });

  const activeProposal = proposalDetailData || selectedProposal;

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ApproveProposalPayload }) =>
      courseProposalService.approveProposal(id, payload),
    onSuccess: (data) => {
      messageApi.success(`Đã phê duyệt đề xuất! Khóa học "${data.course?.title || ""}" đã được đưa vào danh mục.`);
      queryClient.invalidateQueries({ queryKey: ["admin-course-proposals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-course-proposal-detail"] });
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      queryClient.invalidateQueries({ queryKey: ["public-courses"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-catalog-courses"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-proposals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      setActionType(null);
      setIsDetailModalOpen(false);
      reviewForm.resetFields();
    },
    onError: (err: unknown) => {
      messageApi.error(getFriendlyErrorMessage(err, "Lỗi khi phê duyệt đề xuất."));
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReviewProposalPayload }) =>
      courseProposalService.rejectProposal(id, payload),
    onSuccess: () => {
      messageApi.success("Đã từ chối đề xuất khóa học.");
      queryClient.invalidateQueries({ queryKey: ["admin-course-proposals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-course-proposal-detail"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-proposals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      setActionType(null);
      setIsDetailModalOpen(false);
      reviewForm.resetFields();
    },
    onError: (err: unknown) => {
      messageApi.error(getFriendlyErrorMessage(err, "Lỗi khi từ chối đề xuất."));
    },
  });

  // Request changes mutation
  const requestChangesMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReviewProposalPayload }) =>
      courseProposalService.requestProposalChanges(id, payload),
    onSuccess: () => {
      messageApi.success("Đã yêu cầu giáo viên cập nhật lại đề xuất.");
      queryClient.invalidateQueries({ queryKey: ["admin-course-proposals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-course-proposal-detail"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-proposals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      setActionType(null);
      setIsDetailModalOpen(false);
      reviewForm.resetFields();
    },
    onError: (err: unknown) => {
      messageApi.error(getFriendlyErrorMessage(err, "Lỗi khi yêu cầu chỉnh sửa."));
    },
  });

  const handleOpenReview = (proposal: CourseProposal, type: ReviewActionType) => {
    setSelectedProposal(proposal);
    setActionType(type);
    reviewForm.resetFields();
    if (type === "approve") {
      const cat = categories.find((c) => c.id === proposal.categoryId);
      const allowedGrades =
        cat && cat.allowedGradeLevels !== null ? cat.allowedGradeLevels : GRADE_LEVELS;
      const validGradeLevel =
        proposal.gradeLevel && (allowedGrades as readonly string[]).includes(proposal.gradeLevel)
          ? proposal.gradeLevel
          : undefined;
      reviewForm.setFieldsValue({
        gradeLevel: validGradeLevel,
        reviewNote: "",
      });
    }
  };

  const selectedProposalCategory = categories.find(
    (c) => c.id === selectedProposal?.categoryId
  );
  const allowedProposalGradeLevels: readonly GradeLevel[] = selectedProposalCategory
    ? selectedProposalCategory.allowedGradeLevels === null
      ? GRADE_LEVELS
      : selectedProposalCategory.allowedGradeLevels
    : GRADE_LEVELS;

  const handleExecuteAction = (values: ReviewFormValues) => {
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
              updateSearchParams({
                status: val === "" ? "ALL" : val,
                page: "1",
              });
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
        {isError ? (
          <div className="p-6">
            <Alert
              type="error"
              showIcon
              message="Không thể tải danh sách đề xuất khóa học"
              description={getFriendlyErrorMessage(
                error,
                "Đã xảy ra lỗi khi tải danh sách đề xuất. Vui lòng thử lại."
              )}
              action={
                <Button
                  size="small"
                  danger
                  icon={<ReloadOutlined />}
                  onClick={() => refetch()}
                >
                  Thử lại
                </Button>
              }
            />
          </div>
        ) : (
        <Table
          dataSource={proposalsData?.items || []}
          rowKey="id"
          loading={isLoading}
          pagination={{
            current: page,
            pageSize,
            total: proposalsData?.total || 0,
            onChange: (p) => updateSearchParams({ page: String(p) }),
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
              render: (_: unknown, record: CourseProposal) => (
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
              render: (_: unknown, record: CourseProposal) => (
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
              render: (_: unknown, record: CourseProposal) => (
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
        )}
      </div>

      {/* ================================================= */}
      {/* MODAL: DETAIL VIEW */}
      {/* ================================================= */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <FileTextOutlined className="text-brand-600" />
            <span>Chi tiết đề xuất: {activeProposal?.title || ""}</span>
          </div>
        }
        open={isDetailModalOpen}
        onCancel={() => !isSubmitting && setIsDetailModalOpen(false)}
        closable={!isSubmitting}
        maskClosable={!isSubmitting}
        width={750}
        footer={[
          <Button
            key="close"
            disabled={isSubmitting}
            onClick={() => setIsDetailModalOpen(false)}
          >
            Đóng
          </Button>,
          ...(activeProposal?.status === "PENDING_REVIEW" &&
          !loadingProposalDetail &&
          !isErrorProposalDetail
            ? [
                <Button
                  key="reject"
                  danger
                  disabled={isSubmitting}
                  onClick={() => handleOpenReview(activeProposal, "reject")}
                >
                  Từ chối
                </Button>,
                <Button
                  key="request-changes"
                  disabled={isSubmitting}
                  className="text-amber-600 border-amber-300 hover:border-amber-500"
                  onClick={() => handleOpenReview(activeProposal, "request-changes")}
                >
                  Yêu cầu sửa
                </Button>,
                <Button
                  key="approve"
                  type="primary"
                  disabled={isSubmitting}
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => handleOpenReview(activeProposal, "approve")}
                >
                  Duyệt
                </Button>,
              ]
            : []),
        ]}
      >
        {loadingProposalDetail ? (
          <div className="py-4">
            <Skeleton active paragraph={{ rows: 6 }} />
          </div>
        ) : isErrorProposalDetail || !activeProposal ? (
          <div className="py-4">
            <Alert
              type="error"
              showIcon
              message="Không thể tải chi tiết đề xuất khóa học"
              description={getFriendlyErrorMessage(
                errorProposalDetail,
                "Đã xảy ra lỗi khi tải thông tin đề xuất. Vui lòng thử lại."
              )}
              action={
                <Button
                  size="small"
                  danger
                  icon={<ReloadOutlined />}
                  onClick={() => refetchProposalDetail()}
                >
                  Thử lại
                </Button>
              }
            />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Tên đề xuất" span={2}>
                <span className="font-semibold">{activeProposal.title}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Giáo viên">
                {activeProposal.teacherName || activeProposal.teacherEmail}
              </Descriptions.Item>
              <Descriptions.Item label="Email">
                {activeProposal.teacherEmail}
              </Descriptions.Item>
              <Descriptions.Item label="Danh mục">
                <Tag color="blue">{activeProposal.categoryName}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Môn học">
                <Tag color="cyan">{activeProposal.subjectName}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Khối lớp">
                {activeProposal.gradeLevel
                  ? GRADE_LEVEL_LABELS[activeProposal.gradeLevel]
                  : "Chưa gán"}
              </Descriptions.Item>
              <Descriptions.Item label="Cấp độ">
                {activeProposal.level
                  ? COURSE_LEVEL_LABELS[activeProposal.level]
                  : "Không xác định"}
              </Descriptions.Item>
              <Descriptions.Item label="Thời lượng dự kiến">
                {activeProposal.estimatedDuration || "Chưa xác định"}
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                <Tag color={STATUS_CONFIG[activeProposal.status]?.color}>
                  {STATUS_CONFIG[activeProposal.status]?.label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Ngày gửi">
                {dayjs(activeProposal.createdAt).format("DD/MM/YYYY HH:mm")}
              </Descriptions.Item>
              <Descriptions.Item label="Cập nhật lần cuối">
                {dayjs(activeProposal.updatedAt).format("DD/MM/YYYY HH:mm")}
              </Descriptions.Item>
              {activeProposal.reviewedAt && (
                <Descriptions.Item label="Thời điểm xét duyệt" span={2}>
                  {dayjs(activeProposal.reviewedAt).format("DD/MM/YYYY HH:mm")}
                </Descriptions.Item>
              )}
              {activeProposal.status === "APPROVED" && activeProposal.approvedCourseId && (
                <Descriptions.Item label="Mã khóa học đã tạo (Course ID)" span={2}>
                  <span className="font-mono text-xs text-emerald-700">
                    {activeProposal.approvedCourseId}
                  </span>
                </Descriptions.Item>
              )}
            </Descriptions>

            <div className="space-y-3 text-sm">
              <div>
                <h4 className="font-semibold text-gray-800">Mô tả khóa học:</h4>
                <p className="text-gray-600 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg border border-gray-100 mt-1">
                  {activeProposal.description}
                </p>
              </div>

              {activeProposal.learningObjectives && (
                <div>
                  <h4 className="font-semibold text-gray-800">Mục tiêu học tập:</h4>
                  <p className="text-gray-600 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg border border-gray-100 mt-1">
                    {activeProposal.learningObjectives}
                  </p>
                </div>
              )}

              {activeProposal.syllabus && (
                <div>
                  <h4 className="font-semibold text-gray-800">Khung chương trình (Syllabus):</h4>
                  <p className="text-gray-600 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg border border-gray-100 mt-1 max-h-80 overflow-y-auto">
                    {activeProposal.syllabus}
                  </p>
                </div>
              )}

              {activeProposal.prerequisites && (
                <div>
                  <h4 className="font-semibold text-gray-800">Yêu cầu tiên quyết:</h4>
                  <p className="text-gray-600 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg border border-gray-100 mt-1">
                    {activeProposal.prerequisites}
                  </p>
                </div>
              )}

              {activeProposal.reviewNote && (
                <div>
                  <h4 className="font-semibold text-amber-700">Ghi chú phản hồi trước đó:</h4>
                  <Alert
                    type="warning"
                    message={activeProposal.reviewNote}
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
        onCancel={() => !isSubmitting && setActionType(null)}
        closable={!isSubmitting}
        maskClosable={!isSubmitting}
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
                  disabled={allowedProposalGradeLevels.length === 0}
                  placeholder={
                    allowedProposalGradeLevels.length === 0
                      ? "Danh mục này không áp dụng khối lớp"
                      : "Chọn khối lớp phù hợp"
                  }
                  options={allowedProposalGradeLevels.map((g) => ({
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
                rules={[{ required: true, whitespace: true, message: "Vui lòng nhập ghi chú yêu cầu chỉnh sửa" }]}
              >
                <TextArea
                  rows={3}
                  placeholder="Ghi rõ các điểm cần bổ sung (ví dụ: syllabus chi tiết hơn, mục tiêu học tập...)"
                />
              </Form.Item>
            </>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button disabled={isSubmitting} onClick={() => setActionType(null)}>
              Hủy
            </Button>
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
