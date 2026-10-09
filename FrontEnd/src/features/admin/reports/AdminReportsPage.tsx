import React, { useState } from "react";
import {
  Card,
  Table,
  Tag,
  Button,
  Tabs,
  Select,
  Modal,
  Form,
  Input,
  Typography,
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
} from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { reportService, reportKeys } from "../../../services/report.service";
import {
  REPORT_TYPES,
  type ReportItem,
  type ReportStatus,
} from "../../../types/communication";

const { Title, Text } = Typography;
const { TextArea } = Input;

const STATUS_CONFIG: Record<
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

const TYPE_LABELS: Record<string, string> = {
  TEACHER_ABSENT: "Giáo viên vắng mặt",
  TEACHING_QUALITY: "Chất lượng giảng dạy",
  PAYMENT_DISPUTE: "Học phí & Thanh toán",
  INAPPROPRIATE_BEHAVIOR: "Hành vi vi phạm",
  FRAUD: "Gian lận",
  OTHER: "Vấn đề khác",
};

export const AdminReportsPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();

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
      message.success(`Đã cập nhật trạng thái khiếu nại thành ${STATUS_CONFIG[updated.status]?.label || updated.status}`);
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
            className="bg-indigo-600 shrink-0"
          />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-800 truncate">
              {record.reporter?.fullName || "Ẩn danh"}
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              {record.reporter?.role || "USER"}
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
            {TYPE_LABELS[record.type] || record.type}
          </Tag>
          {record.classSummary && (
            <div className="text-xs text-indigo-600 mt-1 flex items-center gap-1 font-medium">
              <BookOutlined /> Lớp: {record.classSummary.className}
            </div>
          )}
          {record.reportedUser && (
            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
              <UserOutlined /> Bị báo cáo: {record.reportedUser.fullName} ({record.reportedUser.role})
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
        const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.OPEN;
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
          <Space orientation="horizontal" size="small" wrap>
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
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => handleOpenActionModal(record, "RESOLVED")}
                >
                  Giải quyết
                </Button>
                <Button
                  size="small"
                  danger
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
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Title level={2} className="!mb-1 flex items-center gap-2">
          <AlertOutlined className="text-rose-600" />
          Quản lý Khiếu nại & Báo cáo
        </Title>
        <Text type="secondary">
          Tiếp nhận, xử lý khiếu nại từ học viên, giảng viên và nhà tài trợ theo quy trình minh bạch.
        </Text>
      </div>

      <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
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
              { key: "OPEN", label: "Chờ tiếp nhận (OPEN)" },
              { key: "IN_REVIEW", label: "Đang xem xét (IN_REVIEW)" },
              { key: "RESOLVED", label: "Đã giải quyết (RESOLVED)" },
              { key: "REJECTED", label: "Đã từ chối (REJECTED)" },
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
              label: TYPE_LABELS[t] || t,
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
      </Card>

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
                  color={STATUS_CONFIG[viewingReport.status]?.color}
                  icon={STATUS_CONFIG[viewingReport.status]?.icon}
                  className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                >
                  {STATUS_CONFIG[viewingReport.status]?.label}
                </Tag>
                <Tag className="rounded-md font-semibold text-xs border-0 bg-slate-200/70 text-slate-700">
                  {TYPE_LABELS[viewingReport.type] || viewingReport.type}
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
                  {viewingReport.reporter?.role}
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
                      {viewingReport.reportedUser.role}
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
                ? "bg-emerald-600 hover:bg-emerald-700"
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
