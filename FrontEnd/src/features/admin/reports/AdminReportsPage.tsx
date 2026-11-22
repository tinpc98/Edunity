import React, { useState } from "react";
import {
  Table,
  Tag,
  Button,
  Tabs,
  Select,
  Modal,
  Form,
  Input,
  Space,
  Avatar,
  App as AntdApp,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  AlertOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  UserOutlined,
  BookOutlined,
  EyeOutlined,
  CalendarOutlined,
  DollarOutlined,
} from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { reportService, reportKeys } from "../../../services/report.service";
import { sessionService, sessionKeys } from "../../../services/session.service";
import {
  REPORT_TYPES,
  type ReportItem,
  type ReportStatus,
} from "../../../types/communication";
import AdminPageHeader from "../../../components/admin/AdminPageHeader";
import AdminSectionCard from "../../../components/admin/AdminSectionCard";

const { TextArea } = Input;

// ==========================================
// Vietnamese Localization Mappings
// ==========================================

const ROLE_LABELS: Record<string, string> = {
  STUDENT: "Học viên",
  TEACHER: "Giáo viên",
  ADMIN: "Quản trị viên",
  SPONSOR: "Nhà tài trợ",
  USER: "Người dùng",
};

const COMPLAINT_STATUS_CONFIG: Record<
  ReportStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  OPEN: {
    label: "Chờ tiếp nhận",
    color: "gold",
    icon: <ClockCircleOutlined />,
  },
  IN_REVIEW: {
    label: "Đang xem xét",
    color: "processing",
    icon: <SyncOutlined spin />,
  },
  RESOLVED: {
    label: "Đã giải quyết",
    color: "success",
    icon: <CheckCircleOutlined />,
  },
  REJECTED: {
    label: "Đã từ chối",
    color: "error",
    icon: <CloseCircleOutlined />,
  },
};

const COMPLAINT_TYPE_LABELS: Record<string, string> = {
  TEACHER_ABSENT: "Giáo viên vắng mặt",
  TEACHING_QUALITY: "Chất lượng giảng dạy",
  PAYMENT_DISPUTE: "Học phí & Thanh toán",
  INAPPROPRIATE_BEHAVIOR: "Hành vi vi phạm",
  FRAUD: "Gian lận",
  OTHER: "Vấn đề khác",
};

const INCIDENT_TYPE_LABELS: Record<string, string> = {
  INTERNET_FAILURE: "Sự cố kết nối Internet",
  DEVICE_FAILURE: "Sự cố thiết bị",
  POWER_OUTAGE: "Sự cố mất điện",
  HEALTH_ISSUE: "Vấn đề sức khỏe",
  PERSONAL_EMERGENCY: "Việc khẩn cấp cá nhân",
  PLATFORM_FAILURE: "Sự cố nền tảng hệ thống",
  OTHER: "Sự cố khác",
};

const INCIDENT_REQUESTED_ACTION_LABELS: Record<string, string> = {
  EXCUSE_LATE: "Xin miễn trừ vào muộn",
  CANCEL_SESSION: "Xin hủy buổi học",
  RESCHEDULE_SESSION: "Xin dời lịch / dạy bù",
  EXCUSE_INTERRUPTION: "Xin miễn trừ gián đoạn",
};

const INCIDENT_REVIEW_STATUS_CONFIG: Record<
  string,
  { label: string; color: string }
> = {
  PENDING: { label: "Chờ xét duyệt", color: "gold" },
  APPROVED: { label: "Đã chấp thuận", color: "success" },
  REJECTED: { label: "Đã từ chối", color: "error" },
  NEEDS_MORE_EVIDENCE: { label: "Cần thêm minh chứng", color: "warning" },
};

const RESCHEDULE_STATUS_CONFIG: Record<
  string,
  { label: string; color: string }
> = {
  PENDING_ADMIN_APPROVAL: { label: "Chờ Admin duyệt", color: "gold" },
  APPROVED: { label: "Đã chấp thuận", color: "success" },
  REJECTED: { label: "Đã từ chối", color: "error" },
  CANCELLED: { label: "Đã hủy", color: "default" },
};

const REFUND_REVIEW_REASON_LABELS: Record<string, string> = {
  TEACHER_NO_SHOW: "Giáo viên vắng mặt",
  UNEXCUSED_TEACHER_CANCELLATION: "Tự ý hủy buổi không phép",
  INCIDENT_CANCELLED_NO_MAKEUP: "Hủy do sự cố, không học bù",
  RESCHEDULE_DECLINED_BY_STUDENT: "Học viên từ chối lịch học bù",
  TEACHER_LEFT_EARLY: "Giáo viên rời lớp sớm",
};

const REFUND_REVIEW_STATUS_CONFIG: Record<
  string,
  { label: string; color: string }
> = {
  NEEDS_FINANCIAL_REVIEW: { label: "Cần rà soát tài chính", color: "gold" },
  APPROVED_FOR_PAYMENT_TEAM: { label: "Đã chuyển kiểm tra tài chính", color: "blue" },
  RESCHEDULED_WAIVED: { label: "Đã học bù (Miễn hoàn)", color: "cyan" },
  REJECTED: { label: "Đã từ chối", color: "error" },
};

export const AdminReportsPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();

  const [mainSection, setMainSection] = useState<string>("REPORTS");
  const [activeTab, setActiveTab] = useState<string>("ALL");
  const [selectedType, setSelectedType] = useState<string | undefined>(undefined);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Modal states for action / review
  const [viewingReport, setViewingReport] = useState<ReportItem | null>(null);
  const [actionModal, setActionModal] = useState<{
    open: boolean;
    report: ReportItem | null;
    targetStatus: ReportStatus;
  }>({
    open: false,
    report: null,
    targetStatus: "RESOLVED",
  });

  const [actionForm] = Form.useForm();

  // Fetch reports list
  const statusParam = activeTab === "ALL" ? undefined : activeTab;
  const { data, isLoading } = useQuery({
    queryKey: reportKeys.adminList({
      status: statusParam,
      type: selectedType,
      page,
      pageSize,
    }),
    queryFn: () =>
      reportService.adminListReports({
        status: statusParam,
        type: selectedType,
        page,
        pageSize,
      }),
  });

  // Fetch Smart Classroom & Teacher Incident / Discipline / Reschedule / Refund Overview
  const { data: smartOverview, isLoading: isLoadingSmart } = useQuery({
    queryKey: sessionKeys.adminSmartClassroom(),
    queryFn: () => sessionService.getAdminSmartClassroomOverview(),
    enabled: mainSection === "SMART_CLASSROOM",
  });

  const reviewIncidentMutation = useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: "APPROVED" | "REJECTED"; note: string }) =>
      sessionService.reviewIncidentReport(id, { decision, note, approveReschedule: decision === "APPROVED" }),
    onSuccess: () => {
      message.success("Đã cập nhật quyết định xét duyệt báo cáo sự cố giáo viên!");
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
    onError: (err: any) => message.error(err?.message || "Lỗi khi duyệt báo cáo sự cố"),
  });

  const reviewRescheduleMutation = useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: "APPROVED" | "REJECTED"; note: string }) =>
      sessionService.reviewRescheduleRequest(id, { decision, note }),
    onSuccess: () => {
      message.success("Đã xử lý yêu cầu xếp lịch dạy bù!");
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
    onError: (err: any) => message.error(err?.message || "Lỗi khi duyệt lịch dạy bù"),
  });

  const reviewRefundMutation = useMutation({
    mutationFn: ({
      id,
      status,
      note,
    }: {
      id: string;
      status: "APPROVED_FOR_PAYMENT_TEAM" | "RESCHEDULED_WAIVED" | "REJECTED";
      note: string;
    }) => sessionService.reviewRefundCase(id, { status, note }),
    onSuccess: () => {
      message.success("Đã cập nhật hồ sơ rà soát học phí buổi học!");
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
    onError: (err: any) => message.error(err?.message || "Lỗi khi xử lý rà soát hoàn phí"),
  });

  const items = data?.items || [];
  const total = data?.total || 0;

  // Mutation: Update status
  const updateStatusMutation = useMutation({
    mutationFn: ({
      reportId,
      status,
      reviewNote,
    }: {
      reportId: string;
      status: ReportStatus;
      reviewNote?: string;
    }) => reportService.adminUpdateReport(reportId, { status, reviewNote }),
    onSuccess: (updated) => {
      message.success(`Đã cập nhật trạng thái khiếu nại thành ${COMPLAINT_STATUS_CONFIG[updated.status]?.label || updated.status}`);
      queryClient.invalidateQueries({ queryKey: reportKeys.all });
      setActionModal({ open: false, report: null, targetStatus: "RESOLVED" });
      actionForm.resetFields();
      if (viewingReport && viewingReport.id === updated.id) {
        setViewingReport(updated);
      }
    },
    onError: (err: any) => {
      message.error(err.message || "Cập nhật trạng thái thất bại.");
    },
  });

  const handleTakeInReview = (report: ReportItem) => {
    updateStatusMutation.mutate({
      reportId: report.id,
      status: "IN_REVIEW",
    });
  };

  const handleOpenActionModal = (report: ReportItem, targetStatus: ReportStatus) => {
    setActionModal({
      open: true,
      report,
      targetStatus,
    });
    actionForm.resetFields();
  };

  const handleActionSubmit = async () => {
    try {
      const values = await actionForm.validateFields();
      if (!actionModal.report) return;

      updateStatusMutation.mutate({
        reportId: actionModal.report.id,
        status: actionModal.targetStatus,
        reviewNote: values.reviewNote.trim(),
      });
    } catch {
      // Form validation failed
    }
  };

  const columns: ColumnsType<ReportItem> = [
    {
      title: "Mã / Ngày tạo",
      dataIndex: "id",
      key: "id",
      width: 130,
      render: (id: string, record) => (
        <div>
          <span className="font-mono text-xs font-semibold text-slate-800">
            #{id.slice(-6)}
          </span>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {new Date(record.createdAt).toLocaleDateString("vi-VN")}
          </div>
        </div>
      ),
    },
    {
      title: "Người gửi",
      key: "reporter",
      width: 170,
      render: (_, record) => (
        <div className="flex items-center gap-2">
          <Avatar
            src={record.reporter?.avatarUrl}
            icon={<UserOutlined />}
            size="small"
            className="bg-teal-600 shrink-0"
          />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-800 truncate">
              {record.reporter?.fullName || "Ẩn danh"}
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              {ROLE_LABELS[record.reporter?.role || ""] || record.reporter?.role || "Người dùng"}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Loại khiếu nại / Đối tượng",
      key: "target",
      render: (_, record) => (
        <div>
          <Tag className="text-xs font-semibold rounded-md border-0 bg-slate-100 text-slate-700">
            {COMPLAINT_TYPE_LABELS[record.type] || record.type}
          </Tag>
          {record.classSummary && (
            <div className="text-xs text-teal-700 mt-1 flex items-center gap-1 font-medium">
              <BookOutlined /> Lớp: {record.classSummary.className}
            </div>
          )}
          {record.reportedUser && (
            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
              <UserOutlined /> Bị báo cáo: {record.reportedUser.fullName} ({ROLE_LABELS[record.reportedUser.role] || record.reportedUser.role})
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Nội dung",
      dataIndex: "description",
      key: "description",
      ellipsis: true,
      render: (desc: string) => (
        <span className="text-xs text-slate-600 line-clamp-2">{desc}</span>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 140,
      render: (status: ReportStatus) => {
        const cfg = COMPLAINT_STATUS_CONFIG[status] || COMPLAINT_STATUS_CONFIG.OPEN;
        return (
          <Tag color={cfg.color} icon={cfg.icon} className="rounded-full px-2.5 py-0.5 text-xs font-semibold">
            {cfg.label}
          </Tag>
        );
      },
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 180,
      render: (_, record) => {
        const isFinal = record.status === "RESOLVED" || record.status === "REJECTED";
        return (
          <Space size="small" wrap>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => setViewingReport(record)}
            >
              Chi tiết
            </Button>

            {!isFinal && record.status === "OPEN" && (
              <Button
                size="small"
                type="dashed"
                onClick={() => handleTakeInReview(record)}
                loading={updateStatusMutation.isPending}
              >
                Tiếp nhận
              </Button>
            )}

            {!isFinal && (
              <>
                <Button
                  size="small"
                  type="primary"
                  className="!bg-emerald-600 hover:!bg-emerald-700 text-xs"
                  onClick={() => handleOpenActionModal(record, "RESOLVED")}
                >
                  Giải quyết
                </Button>
                <Button
                  size="small"
                  danger
                  className="text-xs"
                  onClick={() => handleOpenActionModal(record, "REJECTED")}
                >
                  Từ chối
                </Button>
              </>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Page Header */}
      <AdminPageHeader
        eyebrow="VẬN HÀNH & KHIẾU NẠI"
        eyebrowIcon={<AlertOutlined />}
        title="Quản lý khiếu nại và sự cố lớp học"
        description="Tiếp nhận phản ánh, xử lý sự cố giảng dạy và theo dõi các yêu cầu liên quan đến lớp học."
      />

      {/* Main Navigation Tabs */}
      <div className="bg-white px-4 pt-2 rounded-2xl border border-[#D6E5E2] shadow-[0_2px_8px_rgba(15,118,110,0.04)]">
        <Tabs
          activeKey={mainSection}
          onChange={setMainSection}
          items={[
            { key: "REPORTS", label: "Khiếu nại người dùng" },
            { key: "SMART_CLASSROOM", label: "Sự cố giảng dạy và kỷ luật" },
          ]}
          className="admin-complaints-tabs mb-0"
        />
      </div>

      {mainSection === "SMART_CLASSROOM" ? (
        <div className="space-y-6">
          {/* 1. Incident Reports */}
          <AdminSectionCard
            title="Báo cáo sự cố từ Giáo viên"
            subtitle="Xem xét các sự cố kết nối, kỹ thuật và đơn xin miễn trừ của giáo viên."
            icon={<AlertOutlined className="text-amber-600" />}
            extra={
              <span className="text-xs font-semibold text-slate-500">
                Tổng: <strong className="text-teal-700">{smartOverview?.incidents?.items?.length || 0}</strong> sự cố
              </span>
            }
          >
            <Table
              loading={isLoadingSmart}
              dataSource={smartOverview?.incidents?.items || []}
              rowKey="_id"
              pagination={{ pageSize: 5, showSizeChanger: false }}
              columns={[
                {
                  title: "Giáo viên",
                  key: "teacher",
                  render: (_, r: any) => (
                    <div>
                      <div className="font-semibold text-xs text-slate-800">
                        {r.teacherId?.teacherProfile?.fullName || "Giáo viên"}
                      </div>
                      <div className="text-[11px] text-slate-400">{r.teacherId?.email}</div>
                    </div>
                  ),
                },
                {
                  title: "Buổi học / Vấn đề",
                  key: "session",
                  render: (_, r: any) => (
                    <div className="space-y-1">
                      <div className="font-semibold text-xs text-teal-700">
                        {r.sessionId?.title || "Buổi học"}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Tag color="orange" className="text-[10px] m-0">
                          {INCIDENT_TYPE_LABELS[r.incidentType] || r.incidentType}
                        </Tag>
                        <Tag color="blue" className="text-[10px] m-0">
                          {INCIDENT_REQUESTED_ACTION_LABELS[r.requestedAction] || r.requestedAction}
                        </Tag>
                      </div>
                    </div>
                  ),
                },
                {
                  title: "Mô tả & Minh chứng",
                  key: "desc",
                  render: (_, r: any) => (
                    <div className="text-xs space-y-1">
                      <div className="text-slate-700">{r.description}</div>
                      {Array.isArray(r.evidenceFiles) && r.evidenceFiles.length > 0 && (
                        <div className="space-x-2">
                          {r.evidenceFiles.map((f: any, idx: number) =>
                            f.url ? (
                              <a
                                key={idx}
                                href={f.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-teal-700 hover:underline font-medium"
                              >
                                Minh chứng #{idx + 1}
                              </a>
                            ) : null
                          )}
                        </div>
                      )}
                    </div>
                  ),
                },
                {
                  title: "Trạng thái",
                  dataIndex: "reviewStatus",
                  key: "reviewStatus",
                  render: (st: string) => {
                    const cfg = INCIDENT_REVIEW_STATUS_CONFIG[st] || { label: st, color: "default" };
                    return (
                      <Tag color={cfg.color} className="font-semibold text-xs whitespace-nowrap">
                        {cfg.label}
                      </Tag>
                    );
                  },
                },
                {
                  title: "Xét duyệt",
                  key: "action",
                  render: (_, r: any) =>
                    r.reviewStatus === "PENDING" ? (
                      <Space size="small">
                        <Button
                          size="small"
                          type="primary"
                          className="!bg-emerald-600 hover:!bg-emerald-700 text-xs"
                          loading={reviewIncidentMutation.isPending}
                          onClick={() =>
                            reviewIncidentMutation.mutate({
                              id: r._id,
                              decision: "APPROVED",
                              note: "Admin chấp thuận báo cáo sự cố và miễn trừ vi phạm",
                            })
                          }
                        >
                          Chấp thuận
                        </Button>
                        <Button
                          size="small"
                          danger
                          className="text-xs"
                          loading={reviewIncidentMutation.isPending}
                          onClick={() =>
                            reviewIncidentMutation.mutate({
                              id: r._id,
                              decision: "REJECTED",
                              note: "Minh chứng sự cố không hợp lệ",
                            })
                          }
                        >
                          Từ chối
                        </Button>
                      </Space>
                    ) : (
                      <span className="text-xs text-slate-400">Đã duyệt</span>
                    ),
                },
              ]}
            />
          </AdminSectionCard>

          {/* 2. Reschedule Requests */}
          <AdminSectionCard
            title="Yêu cầu xếp lịch dạy bù"
            subtitle="Phê duyệt thời gian tổ chức buổi học bù sau khi xảy ra sự cố."
            icon={<CalendarOutlined className="text-teal-700" />}
            extra={
              <span className="text-xs font-semibold text-slate-500">
                Tổng: <strong className="text-teal-700">{smartOverview?.rescheduleRequests?.length || 0}</strong> yêu cầu
              </span>
            }
          >
            <Table
              loading={isLoadingSmart}
              dataSource={smartOverview?.rescheduleRequests || []}
              rowKey="_id"
              pagination={{ pageSize: 5, showSizeChanger: false }}
              columns={[
                {
                  title: "Buổi học gốc",
                  key: "orig",
                  render: (_, r: any) => (
                    <div className="text-xs font-semibold text-slate-800">
                      {r.originalSessionId?.title || "Buổi học gốc"}
                    </div>
                  ),
                },
                {
                  title: "Lịch dạy bù đề xuất",
                  key: "proposed",
                  render: (_, r: any) => (
                    <div className="text-xs space-y-0.5">
                      <div className="font-semibold text-teal-700">
                        {new Date(r.proposedStartDatetime).toLocaleString("vi-VN")}
                      </div>
                      <div className="text-slate-500">Lý do: {r.reason}</div>
                    </div>
                  ),
                },
                {
                  title: "Trạng thái",
                  dataIndex: "status",
                  key: "status",
                  render: (st: string) => {
                    const cfg = RESCHEDULE_STATUS_CONFIG[st] || { label: st, color: "default" };
                    return (
                      <Tag color={cfg.color} className="font-semibold text-xs whitespace-nowrap">
                        {cfg.label}
                      </Tag>
                    );
                  },
                },
                {
                  title: "Thao tác",
                  key: "act",
                  render: (_, r: any) =>
                    r.status === "PENDING_ADMIN_APPROVAL" ? (
                      <Space size="small">
                        <Button
                          size="small"
                          type="primary"
                          className="!bg-[#0D9488] hover:!bg-[#0F766E] text-xs"
                          loading={reviewRescheduleMutation.isPending}
                          onClick={() =>
                            reviewRescheduleMutation.mutate({
                              id: r._id,
                              decision: "APPROVED",
                              note: "Admin phê duyệt tạo buổi học bù",
                            })
                          }
                        >
                          Phê duyệt lịch bù
                        </Button>
                        <Button
                          size="small"
                          danger
                          className="text-xs"
                          loading={reviewRescheduleMutation.isPending}
                          onClick={() =>
                            reviewRescheduleMutation.mutate({
                              id: r._id,
                              decision: "REJECTED",
                              note: "Từ chối lịch dạy bù",
                            })
                          }
                        >
                          Từ chối
                        </Button>
                      </Space>
                    ) : (
                      <span className="text-xs text-slate-400">Đã xử lý</span>
                    ),
                },
              ]}
            />
          </AdminSectionCard>

          {/* 3. Refund & Financial Review Cases */}
          <AdminSectionCard
            title="Rà soát học phí và thù lao"
            subtitle="Phối hợp rà soát nghĩa vụ hoàn học phí cho học viên và đối soát thù lao giáo viên."
            icon={<DollarOutlined className="text-emerald-600" />}
            extra={
              <span className="text-xs font-semibold text-slate-500">
                Tổng: <strong className="text-teal-700">{smartOverview?.refundReviews?.length || 0}</strong> hồ sơ
              </span>
            }
          >
            <Table
              loading={isLoadingSmart}
              dataSource={smartOverview?.refundReviews || []}
              rowKey="_id"
              pagination={{ pageSize: 5, showSizeChanger: false }}
              columns={[
                {
                  title: "Buổi học / Vấn đề",
                  key: "reason",
                  render: (_, r: any) => (
                    <div className="text-xs space-y-1">
                      <div className="font-semibold text-slate-800">
                        {r.sessionId?.title || "Buổi học"}
                      </div>
                      <Tag color="volcano" className="m-0 text-[10px]">
                        {REFUND_REVIEW_REASON_LABELS[r.triggerReason] || r.triggerReason}
                      </Tag>
                    </div>
                  ),
                },
                {
                  title: "Học viên",
                  key: "stu",
                  render: (_, r: any) => (
                    <div className="text-xs font-medium text-slate-700">
                      {r.studentId?.studentProfile?.fullName || r.studentId?.email || "Học viên"}
                    </div>
                  ),
                },
                {
                  title: "Tình trạng xử lý",
                  dataIndex: "status",
                  key: "status",
                  render: (st: string) => {
                    const cfg = REFUND_REVIEW_STATUS_CONFIG[st] || { label: st, color: "gold" };
                    return (
                      <Tag color={cfg.color} className="font-semibold text-xs whitespace-nowrap">
                        {cfg.label}
                      </Tag>
                    );
                  },
                },
                {
                  title: "Thao tác",
                  key: "act",
                  render: (_, r: any) =>
                    r.status === "NEEDS_FINANCIAL_REVIEW" ? (
                      <Space size="small">
                        <Button
                          size="small"
                          type="primary"
                          className="!bg-[#0D9488] hover:!bg-[#0F766E] text-xs"
                          onClick={() =>
                            reviewRefundMutation.mutate({
                              id: r._id,
                              status: "APPROVED_FOR_PAYMENT_TEAM",
                              note: "Chuyển bộ phận tài chính rà soát hoàn phí / đối soát",
                            })
                          }
                        >
                          Chuyển kiểm tra tài chính
                        </Button>
                        <Button
                          size="small"
                          className="text-xs border-[#D6E5E2] text-slate-700 hover:text-teal-700"
                          onClick={() =>
                            reviewRefundMutation.mutate({
                              id: r._id,
                              status: "RESCHEDULED_WAIVED",
                              note: "Đã bố trí học bù thành công",
                            })
                          }
                        >
                          Xác nhận đã học bù
                        </Button>
                      </Space>
                    ) : (
                      <span className="text-xs text-slate-400">Đã xử lý</span>
                    ),
                },
              ]}
            />
          </AdminSectionCard>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#D6E5E2] shadow-[0_2px_8px_rgba(15,118,110,0.04)] overflow-hidden">
          {/* Filters */}
          <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <Tabs
              activeKey={activeTab}
              onChange={(k) => {
                setActiveTab(k);
                setPage(1);
              }}
              items={[
                { key: "ALL", label: "Tất cả" },
                { key: "OPEN", label: "Chờ tiếp nhận" },
                { key: "IN_REVIEW", label: "Đang xem xét" },
                { key: "RESOLVED", label: "Đã giải quyết" },
                { key: "REJECTED", label: "Đã từ chối" },
              ]}
              className="mb-0"
            />

            <Select
              allowClear
              placeholder="Lọc theo loại khiếu nại"
              value={selectedType}
              onChange={(val) => {
                setSelectedType(val);
                setPage(1);
              }}
              options={REPORT_TYPES.map((t) => ({
                value: t,
                label: COMPLAINT_TYPE_LABELS[t] || t,
              }))}
              className="w-full md:w-64"
            />
          </div>

          {/* Table */}
          <Table
            columns={columns}
            dataSource={items}
            rowKey="id"
            loading={isLoading}
            pagination={{
              current: page,
              pageSize,
              total,
              onChange: (p, ps) => {
                setPage(p);
                setPageSize(ps);
              },
              showSizeChanger: true,
            }}
            className="admin-reports-table"
          />
        </div>
      )}

      {/* Detail Modal */}
      {viewingReport && (
        <Modal
          open={Boolean(viewingReport)}
          onCancel={() => setViewingReport(null)}
          title={
            <div className="flex items-center gap-2 font-bold text-slate-800">
              <AlertOutlined className="text-rose-600" />
              <span>Chi tiết khiếu nại #{viewingReport.id.slice(-6)}</span>
            </div>
          }
          footer={[
            <Button key="close" onClick={() => setViewingReport(null)}>
              Đóng
            </Button>,
          ]}
          width={650}
          centered
        >
          <div className="py-2 space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <div className="flex items-center gap-2">
                <Tag
                  color={COMPLAINT_STATUS_CONFIG[viewingReport.status]?.color}
                  icon={COMPLAINT_STATUS_CONFIG[viewingReport.status]?.icon}
                  className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                >
                  {COMPLAINT_STATUS_CONFIG[viewingReport.status]?.label}
                </Tag>
                <Tag className="rounded-md font-semibold text-xs border-0 bg-slate-200/70 text-slate-700">
                  {COMPLAINT_TYPE_LABELS[viewingReport.type] || viewingReport.type}
                </Tag>
              </div>
              <span className="text-xs text-slate-400">
                {new Date(viewingReport.createdAt).toLocaleString("vi-VN")}
              </span>
            </div>

            {/* Reporter info */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50/60 rounded-xl border border-slate-100">
                <span className="font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Người khiếu nại
                </span>
                <div className="font-bold text-slate-800 text-sm">
                  {viewingReport.reporter?.fullName || "Ẩn danh"}
                </div>
                <div className="text-slate-500">{viewingReport.reporter?.email}</div>
                <Tag color="blue" className="mt-1 text-[10px]">
                  {ROLE_LABELS[viewingReport.reporter?.role || ""] || viewingReport.reporter?.role}
                </Tag>
              </div>

              <div className="p-3 bg-slate-50/60 rounded-xl border border-slate-100">
                <span className="font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Đối tượng bị khiếu nại
                </span>
                {viewingReport.reportedUser ? (
                  <>
                    <div className="font-bold text-slate-800 text-sm">
                      {viewingReport.reportedUser.fullName}
                    </div>
                    <div className="text-slate-500">{viewingReport.reportedUser.email}</div>
                    <Tag color="volcano" className="mt-1 text-[10px]">
                      {ROLE_LABELS[viewingReport.reportedUser.role] || viewingReport.reportedUser.role}
                    </Tag>
                  </>
                ) : viewingReport.classSummary ? (
                  <>
                    <div className="font-bold text-slate-800 text-sm">
                      Lớp: {viewingReport.classSummary.className}
                    </div>
                    {viewingReport.classSummary.teacherName && (
                      <div className="text-slate-500">GV: {viewingReport.classSummary.teacherName}</div>
                    )}
                  </>
                ) : (
                  <span className="text-slate-400">Không có thông tin đối tượng</span>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                Nội dung mô tả từ người khiếu nại:
              </span>
              <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed mb-0">
                {viewingReport.description}
              </p>
            </div>

            {/* Resolution note */}
            {viewingReport.reviewNote && (
              <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                    <CheckCircleOutlined /> Kết quả xử lý của Ban Quản Trị:
                  </span>
                  {viewingReport.handledBy && (
                    <span className="text-xs text-emerald-700">
                      Xử lý bởi: {viewingReport.handledBy.fullName}
                    </span>
                  )}
                </div>
                <p className="text-sm text-emerald-950 whitespace-pre-wrap leading-relaxed mb-0">
                  {viewingReport.reviewNote}
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Action (Resolve / Reject) Modal */}
      <Modal
        open={actionModal.open}
        onCancel={() => {
          setActionModal({ open: false, report: null, targetStatus: "RESOLVED" });
          actionForm.resetFields();
        }}
        title={
          actionModal.targetStatus === "RESOLVED" ? (
            <div className="flex items-center gap-2 text-emerald-600 font-bold">
              <CheckCircleOutlined />
              <span>Giải quyết khiếu nại #{actionModal.report?.id.slice(-6)}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-rose-600 font-bold">
              <CloseCircleOutlined />
              <span>Từ chối khiếu nại #{actionModal.report?.id.slice(-6)}</span>
            </div>
          )
        }
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setActionModal({ open: false, report: null, targetStatus: "RESOLVED" });
              actionForm.resetFields();
            }}
            disabled={updateStatusMutation.isPending}
          >
            Hủy
          </Button>,
          <Button
            key="submit"
            type="primary"
            danger={actionModal.targetStatus === "REJECTED"}
            className={
              actionModal.targetStatus === "RESOLVED"
                ? "!bg-emerald-600 hover:!bg-emerald-700"
                : undefined
            }
            onClick={handleActionSubmit}
            loading={updateStatusMutation.isPending}
          >
            Xác nhận {actionModal.targetStatus === "RESOLVED" ? "giải quyết" : "từ chối"}
          </Button>,
        ]}
        centered
        destroyOnClose
      >
        <div className="py-2">
          <p className="text-sm text-slate-600 mb-4">
            {actionModal.targetStatus === "RESOLVED"
              ? "Vui lòng nhập ghi chú kết quả giải quyết. Người khiếu nại sẽ nhận được thông báo này."
              : "Vui lòng nhập lý do từ chối khiếu nại. Người khiếu nại sẽ nhận được thông báo này."}
          </p>

          <Form form={actionForm} layout="vertical">
            <Form.Item
              name="reviewNote"
              label={<span className="font-semibold text-sm">Ghi chú xử lý (bắt buộc)</span>}
              rules={[
                { required: true, message: "Vui lòng nhập ghi chú xử lý" },
                { min: 5, message: "Ghi chú phải có ít nhất 5 ký tự" },
              ]}
            >
              <TextArea
                rows={4}
                placeholder={
                  actionModal.targetStatus === "RESOLVED"
                    ? "Ví dụ: Đã nhắc nhở giáo viên, sắp xếp buổi học bù và hoàn tiền một phần nếu có..."
                    : "Ví dụ: Sau khi xác minh, thông tin khiếu nại không chính xác hoặc không đủ căn cứ..."
                }
                maxLength={2000}
                showCount
                className="rounded-xl border-slate-200"
              />
            </Form.Item>
          </Form>
        </div>
      </Modal>
    </div>
  );
};
