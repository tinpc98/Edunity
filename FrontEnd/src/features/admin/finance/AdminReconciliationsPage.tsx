import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Typography,
  Card,
  Table,
  Tag,
  Button,
  Select,
  Input,
  Modal,
  Descriptions,
  Timeline,
  Alert,
  Tooltip,
  Badge,
  Tabs,
  Collapse,
  Radio,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  AuditOutlined,
  ReloadOutlined,
  EyeOutlined,
  UserSwitchOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  ArrowRightOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { financeService, financeKeys } from "../../../services/finance.service";
import type { PaymentReconciliationItem } from "../../../types/payment";
import { formatVND } from "../../../types/payment";
import { ROUTES } from "../../../routes/routePaths";

const { Title, Text } = Typography;
const { TextArea } = Input;

// Business explanations for reconciliation reasons
const REASON_EXPLANATIONS: Record<string, { label: string; desc: string; color: string }> = {
  ACCOUNT_MISMATCH: {
    label: "Tài khoản nhận tiền không khớp",
    desc: "Hệ thống phát hiện thông tin tài khoản nhận tiền chưa khớp với dữ liệu giao dịch cần xác minh.",
    color: "volcano",
  },
  EXPIRED_PAYMENT: {
    label: "Thanh toán sau khi đơn hết hạn",
    desc: "Khoản tiền được chuyển tới sau khi thời gian giữ chỗ của đơn hàng đã hết hiệu lực.",
    color: "orange",
  },
  LATE_PAYMENT_REVIEW: {
    label: "Thanh toán đến muộn",
    desc: "Học viên hoàn tất chuyển khoản muộn hơn thời gian quy định của hệ thống.",
    color: "gold",
  },
  AMOUNT_MISMATCH: {
    label: "Sai lệch số tiền thanh toán",
    desc: "Số tiền chuyển khoản thực tế không khớp với số tiền cần thanh toán của đơn hàng.",
    color: "red",
  },
  UNMATCHED: {
    label: "Không tìm thấy đơn thanh toán",
    desc: "Nội dung chuyển khoản hoặc mã giao dịch không khớp với bất kỳ đơn đăng ký nào trên hệ thống.",
    color: "red",
  },
  LATE_SUCCESS_AFTER_FAILED: {
    label: "Thành công sau khi hủy đơn",
    desc: "Giao dịch ghi nhận thành công từ ngân hàng sau khi đơn hàng đã bị đánh dấu thất bại hoặc hủy.",
    color: "gold",
  },
  PURPOSE_CHANNEL_MISMATCH: {
    label: "Sai kênh tiếp nhận thanh toán",
    desc: "Khoản thanh toán được gửi vào sai kênh quy định (ví dụ nhầm lẫn giữa Học phí và Tài trợ).",
    color: "volcano",
  },
  REFERENCE_COLLISION: {
    label: "Trùng lặp mã tham chiếu ngân hàng",
    desc: "Mã giao dịch ngân hàng đã từng được sử dụng trên một đơn hàng khác trước đó.",
    color: "red",
  },
  CAMPAIGN_NOT_ACCEPTING_FUNDING: {
    label: "Chiến dịch đã đóng tài trợ",
    desc: "Khoản tiền chuyển tới chiến dịch học bổng đã kết thúc hoặc không còn tiếp nhận đóng góp.",
    color: "orange",
  },
  NEEDS_REVIEW: {
    label: "Cần kiểm tra xác minh",
    desc: "Giao dịch bất thường cần quản trị viên kiểm tra và xác nhận thủ công.",
    color: "gold",
  },
};

const RECON_STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  NEEDS_REVIEW: { label: "Cần kiểm tra", color: "gold", icon: <ClockCircleOutlined /> },
  IN_REVIEW: { label: "Đang xử lý", color: "blue", icon: <ClockCircleOutlined /> },
  RESOLVED_APPROVED: { label: "Đã duyệt ghi danh", color: "green", icon: <CheckCircleOutlined /> },
  RESOLVED_REFUNDED: { label: "Đã lập hồ sơ hoàn tiền", color: "purple", icon: <CheckCircleOutlined /> },
  RESOLVED_IGNORED: { label: "Đã đóng", color: "default", icon: <CloseCircleOutlined /> },
};

const AUDIT_ACTION_MAP: Record<string, { title: string; color: string }> = {
  WEBHOOK_RECONCILIATION_OPENED: {
    title: "Phát hiện giao dịch cần kiểm tra",
    color: "orange",
  },
  RECONCILIATION_RESOLVED: {
    title: "Đã hoàn tất đối soát",
    color: "green",
  },
  ASSIGNED: {
    title: "Đã phân công người xử lý",
    color: "blue",
  },
  IN_REVIEW: {
    title: "Bắt đầu kiểm tra giao dịch",
    color: "blue",
  },
  NOTE_ADDED: {
    title: "Đã bổ sung ghi chú xử lý",
    color: "cyan",
  },
  POST_RESOLVED_NOTE: {
    title: "Bổ sung ghi chú sau khi giải quyết",
    color: "purple",
  },
  REFUND_REQUIRED: {
    title: "Phát sinh yêu cầu hoàn tiền",
    color: "volcano",
  },
  REFUND_RESOLVED: {
    title: "Đã hoàn tất xử lý hoàn tiền",
    color: "purple",
  },
  DUPLICATE_SURPLUS_CLASSIFIED: {
    title: "Phát hiện khoản nộp thừa trùng lặp chuyển hoàn tiền",
    color: "volcano",
  },
  REFERENCE_COLLISION_DETECTED: {
    title: "Phát hiện trùng lặp mã tham chiếu giao dịch",
    color: "red",
  },
};

const formatAuditNote = (noteText?: string): string => {
  if (!noteText) return "";
  if (noteText.includes("Receiver bank account does not match verified channel account")) {
    return "Tài khoản thụ hưởng nhận tiền thực tế không khớp với tài khoản quy định của kênh giao dịch.";
  }
  if (noteText.includes("No Payment or SponsorContribution found for orderCode")) {
    return "Không tìm thấy đơn thanh toán hoặc khoản tài trợ tương ứng với mã đơn.";
  }
  if (noteText.includes("Duplicate payment surplus classified for refund")) {
    return "Khoản thanh toán thừa trùng lặp đã được phân loại chuyển sang quy trình hoàn tiền cho học viên.";
  }
  if (noteText.includes("Enrollment recovered and confirmed legitimately")) {
    return "Giao dịch đã được xác minh thành công và kích hoạt ghi danh hợp lệ.";
  }
  if (noteText.startsWith("Assigned to")) {
    return noteText.replace(/^Assigned to /, "Đã phân công cho ");
  }
  return noteText;
};

const getAdminDisplayName = (admin: any): string => {
  if (!admin) return "";
  if (typeof admin === "string") return admin;
  if (admin.studentProfile?.fullName) return admin.studentProfile.fullName;
  if (admin.teacherProfile?.fullName) return admin.teacherProfile.fullName;
  if (admin.fullName) return admin.fullName;
  return admin.email || "";
};

export default function AdminReconciliationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<string>("NEEDS_REVIEW");
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(15);
  const [reason, setReason] = useState<string>("ALL");
  const [channelKey, setChannelKey] = useState<string>("ALL");
  const [orderCode, setOrderCode] = useState<string>("");
  const [searchCodeInput, setSearchCodeInput] = useState<string>("");

  const [selectedRecord, setSelectedRecord] = useState<PaymentReconciliationItem | null>(null);
  const [assignModalVisible, setAssignModalVisible] = useState<boolean>(false);
  const [assigneeInput, setAssigneeInput] = useState<string>("me");
  const [assignNote, setAssignNote] = useState<string>("");

  const [resolveModalVisible, setResolveModalVisible] = useState<boolean>(false);
  const [resolutionOutcome, setResolutionOutcome] = useState<
    "RESOLVED_APPROVED" | "RESOLVED_REFUNDED" | "RESOLVED_IGNORED"
  >("RESOLVED_APPROVED");
  const [resolutionNote, setResolutionNote] = useState<string>("");

  const [newNoteContent, setNewNoteContent] = useState<string>("");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: financeKeys.adminReconciliations({
      page,
      limit,
      tab: activeTab,
      reason,
      channelKey,
      orderCode,
    }),
    queryFn: () =>
      financeService.getAdminReconciliations({
        page,
        limit,
        tab: activeTab,
        reason,
        channelKey,
        orderCode,
      }),
  });

  const reconciliations = data?.items || [];
  const total = data?.total || 0;
  const tabCounts = data?.tabCounts;

  const assignMutation = useMutation({
    mutationFn: ({ id, assignedTo, note }: { id: string; assignedTo: string; note: string }) =>
      financeService.assignReconciliation(id, { assignedTo, note }),
    onSuccess: (updated) => {
      message.success("Đã tiếp nhận xử lý sự vụ thành công!");
      queryClient.invalidateQueries({ queryKey: financeKeys.all });
      setAssignModalVisible(false);
      setAssignNote("");
      if (selectedRecord && selectedRecord._id === updated._id) {
        setSelectedRecord(updated);
      }
    },
    onError: (err: any) => {
      message.error(err?.message || "Không thể tiếp nhận sự vụ");
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      financeService.addReconciliationNote(id, { note, action: "NOTE_ADDED" }),
    onSuccess: (updated) => {
      message.success("Đã thêm ghi chú xử lý thành công!");
      queryClient.invalidateQueries({ queryKey: financeKeys.all });
      setNewNoteContent("");
      if (selectedRecord && selectedRecord._id === updated._id) {
        setSelectedRecord(updated);
      }
    },
    onError: (err: any) => {
      message.error(err?.message || "Không thể thêm ghi chú");
    },
  });

  const resolveMutation = useMutation({
    mutationFn: ({
      id,
      outcome,
      note,
    }: {
      id: string;
      outcome: "RESOLVED_APPROVED" | "RESOLVED_REFUNDED" | "RESOLVED_IGNORED";
      note: string;
    }) => financeService.resolveReconciliation(id, { outcome, note }),
    onSuccess: (updated) => {
      message.success("Đã hoàn tất đối soát sự vụ thành công!");
      queryClient.invalidateQueries({ queryKey: financeKeys.all });
      setResolveModalVisible(false);
      setResolutionNote("");
      if (selectedRecord && selectedRecord._id === updated._id) {
        setSelectedRecord(updated);
      }
    },
    onError: (err: any) => {
      message.error(err?.message || "Không thể hoàn tất đối soát");
    },
  });

  const handleSearch = () => {
    setOrderCode(searchCodeInput.trim());
    setPage(1);
  };

  const handleReset = () => {
    setReason("ALL");
    setChannelKey("ALL");
    setOrderCode("");
    setSearchCodeInput("");
    setPage(1);
  };

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    setPage(1);
  };

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    message.success(`Đã sao chép ${label}: ${text}`);
  };

  const isResolved =
    selectedRecord?.status === "RESOLVED_APPROVED" ||
    selectedRecord?.status === "RESOLVED_REFUNDED" ||
    selectedRecord?.status === "RESOLVED_IGNORED";

  // 7 streamlined columns: Mã đơn, Vấn đề phát sinh, Số tiền, Trạng thái, Người phụ trách, Thời gian, Thao tác
  const columns: ColumnsType<PaymentReconciliationItem> = [
    {
      title: "Mã đơn",
      dataIndex: "orderCode",
      key: "orderCode",
      width: 140,
      render: (code: number | null) => (
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="font-mono font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
            {code ? `#${code}` : "N/A"}
          </span>
          {code && (
            <Tooltip title="Sao chép mã đơn">
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined className="text-slate-400 hover:text-teal-600 text-xs" />}
                className="!h-5 !w-5 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  copyToClipboard(String(code), "mã đơn");
                }}
              />
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      title: "Vấn đề phát sinh",
      dataIndex: "reason",
      key: "reason",
      width: 230,
      render: (r: string) => {
        const config = REASON_EXPLANATIONS[r] || { label: r, color: "volcano" };
        return (
          <Tag color={config.color} className="font-semibold whitespace-nowrap text-xs">
            {config.label}
          </Tag>
        );
      },
    },
    {
      title: "Số tiền",
      dataIndex: "receivedAmount",
      key: "receivedAmount",
      align: "right",
      width: 150,
      render: (amount: number | string) => (
        <span className="font-bold text-slate-800 whitespace-nowrap">{formatVND(amount)}</span>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      align: "center",
      width: 170,
      render: (st: string) => {
        const config = RECON_STATUS_CONFIG[st] || { label: st, color: "default", icon: null };
        return (
          <Tag color={config.color} icon={config.icon} className="font-medium whitespace-nowrap">
            {config.label}
          </Tag>
        );
      },
    },
    {
      title: "Người phụ trách",
      dataIndex: "assignedTo",
      key: "assignedTo",
      width: 180,
      render: (admin: any) => {
        if (!admin) {
          return <span className="text-slate-400 italic text-xs whitespace-nowrap">Chưa có người xử lý</span>;
        }
        const name = getAdminDisplayName(admin);
        const email = admin.email || "";
        return (
          <Tooltip title={email}>
            <span className="text-xs font-semibold text-slate-700 whitespace-nowrap hover:text-teal-700">
              {name}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: "Thời gian",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 150,
      render: (d: string) => {
        const dateObj = new Date(d);
        const day = String(dateObj.getDate()).padStart(2, "0");
        const month = String(dateObj.getMonth() + 1).padStart(2, "0");
        const year = dateObj.getFullYear();
        const hours = String(dateObj.getHours()).padStart(2, "0");
        const minutes = String(dateObj.getMinutes()).padStart(2, "0");
        return (
          <span className="text-xs text-slate-500 whitespace-nowrap">
            {`${day}/${month}/${year} ${hours}:${minutes}`}
          </span>
        );
      },
    },
    {
      title: "Thao tác",
      key: "actions",
      align: "center",
      width: 100,
      render: (_, record) => (
        <Button
          type="text"
          icon={<EyeOutlined />}
          size="small"
          className="text-teal-700 hover:text-teal-900 hover:bg-teal-50 font-medium"
          onClick={() => setSelectedRecord(record)}
        >
          Chi tiết
        </Button>
      ),
    },
  ];

  const tabItems = [
    {
      key: "NEEDS_REVIEW",
      label: (
        <span className="flex items-center gap-2">
          <span>Cần xử lý</span>
          <Badge
            count={tabCounts?.needsReview ?? 0}
            style={{ backgroundColor: "#D97706" }}
          />
        </span>
      ),
    },
    {
      key: "IN_REVIEW",
      label: (
        <span className="flex items-center gap-2">
          <span>Đang xử lý</span>
          <Badge
            count={tabCounts?.inReview ?? 0}
            style={{ backgroundColor: "#2563EB" }}
          />
        </span>
      ),
    },
    {
      key: "RESOLVED",
      label: (
        <span className="flex items-center gap-2">
          <span>Đã giải quyết</span>
          <Badge
            count={tabCounts?.resolved ?? 0}
            style={{ backgroundColor: "#059669" }}
          />
        </span>
      ),
    },
    {
      key: "ALL",
      label: (
        <span className="flex items-center gap-2">
          <span>Tất cả</span>
          <Badge
            count={tabCounts?.all ?? total}
            style={{ backgroundColor: "#64748B" }}
          />
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Title level={2} className="!mb-1 font-bold text-slate-800">
            Hàng đợi đối soát
          </Title>
          <Text type="secondary" className="text-slate-500 text-sm">
            Kiểm tra và xử lý các giao dịch thanh toán cần xác minh.
          </Text>
        </div>
        <Button
          icon={<ReloadOutlined spin={isFetching} />}
          onClick={() => refetch()}
          loading={isFetching}
          className="border-slate-300 text-slate-700 hover:text-teal-700 hover:border-teal-600 rounded-lg"
        >
          Làm mới
        </Button>
      </div>

      {/* Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={tabItems}
        type="card"
        className="custom-finance-tabs font-medium"
      />

      {/* Filter Bar */}
      <Card bordered={false} className="shadow-sm rounded-xl border border-slate-200/80">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4 items-end">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Mã đơn:</label>
            <Input
              placeholder="Nhập mã đơn cần tìm..."
              value={searchCodeInput}
              onChange={(e) => setSearchCodeInput(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
              className="rounded-lg"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Vấn đề phát sinh:</label>
            <Select
              className="w-full rounded-lg"
              value={reason}
              onChange={(v) => {
                setReason(v);
                setPage(1);
              }}
              options={[
                { label: "Tất cả vấn đề", value: "ALL" },
                { label: "Tài khoản nhận không khớp", value: "ACCOUNT_MISMATCH" },
                { label: "Thanh toán khi đơn hết hạn", value: "EXPIRED_PAYMENT" },
                { label: "Thanh toán đến muộn", value: "LATE_PAYMENT_REVIEW" },
                { label: "Sai lệch số tiền", value: "AMOUNT_MISMATCH" },
                { label: "Không khớp đơn", value: "UNMATCHED" },
                { label: "Thành công sau khi hủy", value: "LATE_SUCCESS_AFTER_FAILED" },
              ]}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Kênh thanh toán:</label>
            <Select
              className="w-full rounded-lg"
              value={channelKey}
              onChange={(v) => {
                setChannelKey(v);
                setPage(1);
              }}
              options={[
                { label: "Tất cả kênh", value: "ALL" },
                { label: "Học phí", value: "TUITION" },
                { label: "Tài trợ", value: "DONATION" },
              ]}
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={handleSearch}
              className="flex-1 bg-teal-600 hover:bg-teal-700 border-teal-600 rounded-lg font-medium"
            >
              Tìm kiếm
            </Button>
            <Button onClick={handleReset} className="rounded-lg">
              Đặt lại
            </Button>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card bordered={false} className="shadow-sm rounded-xl border border-slate-200/80 overflow-hidden">
        <Table
          rowKey="_id"
          columns={columns}
          dataSource={reconciliations}
          loading={isLoading}
          scroll={{ x: 1040 }}
          pagination={{
            current: page,
            pageSize: limit,
            total,
            showSizeChanger: true,
            pageSizeOptions: ["10", "15", "30", "50"],
            onChange: (p, l) => {
              setPage(p);
              setLimit(l);
            },
            showTotal: (t) => `Tổng cộng ${t} sự vụ đối soát`,
          }}
        />
      </Card>

      {/* Detail Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-slate-800">
            <AuditOutlined className="text-teal-600" />
            <span className="font-bold text-base">
              Chi tiết đối soát {selectedRecord?.orderCode ? `#${selectedRecord.orderCode}` : ""}
            </span>
          </div>
        }
        open={Boolean(selectedRecord) && !assignModalVisible}
        onCancel={() => setSelectedRecord(null)}
        footer={[
          !isResolved && selectedRecord?.status === "IN_REVIEW" && (
            <Button
              key="resolve-btn"
              type="primary"
              className="bg-emerald-600 hover:bg-emerald-700 border-emerald-600 font-semibold"
              icon={<CheckCircleOutlined />}
              onClick={() => {
                if (!selectedRecord?.paymentId && !selectedRecord?.contributionId) {
                  setResolutionOutcome("RESOLVED_IGNORED");
                } else {
                  setResolutionOutcome("RESOLVED_APPROVED");
                }
                setResolutionNote("");
                setResolveModalVisible(true);
              }}
            >
              Hoàn tất xử lý
            </Button>
          ),
          !isResolved && selectedRecord?.status === "NEEDS_REVIEW" && (
            <Button
              key="accept-btn"
              type="primary"
              className="bg-teal-600 hover:bg-teal-700 border-teal-600 font-medium"
              loading={assignMutation.isPending}
              onClick={() => {
                if (!selectedRecord) return;
                assignMutation.mutate({
                  id: selectedRecord._id,
                  assignedTo: "me",
                  note: "Admin bắt đầu tiếp nhận xử lý sự vụ.",
                });
              }}
            >
              Bắt đầu xử lý
            </Button>
          ),
          !isResolved && (
            <Button
              key="reassign-btn"
              icon={<UserSwitchOutlined />}
              onClick={() => {
                setAssigneeInput("me");
                setAssignModalVisible(true);
              }}
            >
              Chuyển người phụ trách
            </Button>
          ),
          <Button key="close-btn" onClick={() => setSelectedRecord(null)}>
            Đóng
          </Button>,
        ]}
        width={780}
      >
        {selectedRecord && (
          <div className="space-y-5 pt-2 max-h-[75vh] overflow-y-auto pr-1">
            {/* Section A: Tổng quan KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[11px] font-semibold text-slate-500 uppercase block">
                  Mã đơn thanh toán
                </span>
                <span className="text-base font-bold font-mono text-teal-700">
                  {selectedRecord.orderCode ? `#${selectedRecord.orderCode}` : "N/A"}
                </span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[11px] font-semibold text-slate-500 uppercase block">
                  Số tiền thực nhận
                </span>
                <span className="text-base font-bold text-slate-800">
                  {formatVND(selectedRecord.receivedAmount)}
                </span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[11px] font-semibold text-slate-500 uppercase block">
                  Trạng thái
                </span>
                <Tag
                  color={RECON_STATUS_CONFIG[selectedRecord.status]?.color || "default"}
                  className="font-semibold text-xs mt-0.5"
                >
                  {RECON_STATUS_CONFIG[selectedRecord.status]?.label || selectedRecord.status}
                </Tag>
              </div>
            </div>

            {/* Section B: Vấn đề phát sinh */}
            <div>
              <div className="text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                Vấn đề phát sinh
              </div>
              <Alert
                message={
                  <span className="font-semibold text-slate-800">
                    {REASON_EXPLANATIONS[selectedRecord.reason]?.label || selectedRecord.reason}
                  </span>
                }
                description={
                  REASON_EXPLANATIONS[selectedRecord.reason]?.desc ||
                  "Giao dịch cần được quản trị viên kiểm tra và xác minh đối soát."
                }
                type="warning"
                showIcon
                className="bg-amber-50/80 border-amber-200 text-slate-700"
              />
            </div>

            {/* Section C: Thông tin giao dịch & Ngân hàng */}
            <div>
              <div className="text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                Thông tin giao dịch
              </div>
              <Descriptions bordered column={2} size="small">
                <Descriptions.Item label="Mã đơn thanh toán">
                  <span className="font-mono font-bold text-teal-700">
                    {selectedRecord.orderCode ? `#${selectedRecord.orderCode}` : "N/A"}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="Kênh thanh toán">
                  <Tag color={selectedRecord.channelKey === "TUITION" ? "blue" : "green"}>
                    {selectedRecord.channelKey === "TUITION" ? "Học phí" : "Tài trợ"}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Số tiền cần thanh toán">
                  <span className="font-medium text-slate-700">
                    {selectedRecord.expectedAmount
                      ? formatVND(selectedRecord.expectedAmount)
                      : formatVND(selectedRecord.receivedAmount)}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="Số tiền thực nhận">
                  <span className="font-bold text-emerald-700">
                    {formatVND(selectedRecord.receivedAmount)}
                  </span>
                </Descriptions.Item>
                {selectedRecord.enrollmentId?.classId && (
                  <Descriptions.Item label="Lớp học liên quan" span={2}>
                    <span className="font-medium text-slate-800">
                      {selectedRecord.enrollmentId.classId.className ||
                        selectedRecord.enrollmentId.classId.title}
                    </span>
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="Bằng chứng ngân hàng" span={2}>
                  {selectedRecord.eventId?.providerReference ? (
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-slate-800">
                        {selectedRecord.eventId.providerReference} (Ngân hàng đã ghi nhận thanh toán)
                      </span>
                      <Button
                        type="link"
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() =>
                          copyToClipboard(selectedRecord.eventId.providerReference, "mã ngân hàng")
                        }
                      >
                        Sao chép
                      </Button>
                    </div>
                  ) : (
                    <span className="text-slate-400 italic text-xs">Chưa có mã giao dịch ngân hàng</span>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="Người phụ trách">
                  {selectedRecord.assignedTo ? (
                    <span className="font-medium text-slate-800">
                      {getAdminDisplayName(selectedRecord.assignedTo)} ({selectedRecord.assignedTo.email})
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">Chưa có người xử lý</span>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="Thời gian ghi nhận">
                  {new Date(selectedRecord.createdAt).toLocaleString("vi-VN")}
                </Descriptions.Item>
              </Descriptions>
            </div>

            {/* Section D: Kết quả xử lý */}
            <div>
              <div className="text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                Kết quả xử lý
              </div>
              {selectedRecord.status === "RESOLVED_APPROVED" && (
                <Alert
                  message="Giao dịch đã được xác minh hợp lệ"
                  description="Học viên đã được xác nhận ghi danh vào lớp học tương ứng và sự vụ đối soát đã được giải quyết dứt điểm."
                  type="success"
                  showIcon
                  className="bg-emerald-50 border-emerald-200"
                />
              )}
              {selectedRecord.status === "RESOLVED_REFUNDED" && (
                <div className="space-y-2">
                  <Alert
                    message="Đã xác định khoản cần hoàn"
                    description="Yêu cầu hoàn tiền đã được chuyển sang bộ phận hoàn tiền và kế toán. Lưu ý: Tiền chưa tự động xuất quỹ ngân hàng cho đến khi kế toán xác nhận ủy nhiệm chi thực tế."
                    type="info"
                    showIcon
                    className="bg-purple-50 border-purple-200 text-purple-900"
                  />
                  {selectedRecord.refundCase && (
                    <div className="flex items-center justify-between p-2.5 bg-purple-50/50 border border-purple-200 rounded-lg text-xs">
                      <span className="font-semibold text-purple-800">
                        Hồ sơ hoàn tiền: #{selectedRecord.refundCase.caseNumber}
                      </span>
                      <Button
                        type="link"
                        size="small"
                        icon={<ArrowRightOutlined />}
                        className="text-purple-700 font-medium p-0"
                        onClick={() => {
                          setSelectedRecord(null);
                          navigate(ROUTES.ADMIN.REFUNDS);
                        }}
                      >
                        Xem yêu cầu hoàn tiền
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {selectedRecord.status === "RESOLVED_IGNORED" && (
                <Alert
                  message="Đã đóng hồ sơ đối soát"
                  description="Sự vụ đã được đánh dấu bỏ qua hoặc đóng sau khi kiểm tra không cần xử lý thêm."
                  type="info"
                  showIcon
                />
              )}
              {selectedRecord.status === "NEEDS_REVIEW" && (
                <div className="space-y-2">
                  <Alert
                    message="Chưa có kết luận"
                    description="Hồ sơ đang chờ Quản trị viên tiếp nhận và tiến hành đối soát."
                    type="warning"
                    showIcon
                    className="bg-amber-50 border-amber-200"
                  />
                  {selectedRecord.refundCase && (
                    <div className="flex items-center justify-between p-2.5 bg-purple-50/50 border border-purple-200 rounded-lg text-xs">
                      <div>
                        <span className="font-semibold text-purple-800 block">
                          Đã liên kết hồ sơ hoàn tiền #{selectedRecord.refundCase.caseNumber}
                        </span>
                        <span className="text-slate-500 text-[11px]">
                          Khoản tiền nộp thừa đang chờ kế toán thực hiện hoàn tiền.
                        </span>
                      </div>
                      <Button
                        type="link"
                        size="small"
                        icon={<ArrowRightOutlined />}
                        className="text-purple-700 font-medium p-0"
                        onClick={() => {
                          setSelectedRecord(null);
                          navigate(ROUTES.ADMIN.REFUNDS);
                        }}
                      >
                        Xem yêu cầu hoàn tiền
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {selectedRecord.status === "IN_REVIEW" && (
                <Alert
                  message="Đang tiến hành đối soát"
                  description="Quản trị viên đang liên hệ học viên hoặc kiểm tra dữ liệu ngân hàng để giải quyết sự vụ."
                  type="info"
                  showIcon
                  className="bg-blue-50 border-blue-200"
                />
              )}
            </div>

            {/* Section E: Ghi chú xử lý (Collapsible) */}
            <Collapse
              defaultActiveKey={[]}
              className="bg-slate-50/70 border-slate-200 rounded-lg"
              items={[
                {
                  key: "notes",
                  label: (
                    <span className="font-semibold text-xs text-slate-700">
                      Ghi chú xử lý (
                      {selectedRecord.auditReferences?.filter((a) =>
                        ["NOTE_ADDED", "POST_RESOLVED_NOTE"].includes(a.action || "")
                      ).length || 0}
                      )
                    </span>
                  ),
                  children: (
                    <div className="space-y-3">
                      <div className="text-[11px] text-slate-500 italic">
                        Ghi chú là thông tin hỗ trợ kiểm toán nội bộ, không thay đổi trạng thái tài chính
                        của đơn hàng.
                      </div>

                      {/* Add note form */}
                      <div className="space-y-2">
                        <TextArea
                          rows={2}
                          value={newNoteContent}
                          onChange={(e) => setNewNoteContent(e.target.value)}
                          placeholder="Nhập ghi chú điều tra hoặc trao đổi với học viên/ngân hàng..."
                          className="text-xs rounded-lg"
                        />
                        <div className="text-right">
                          <Button
                            type="primary"
                            size="small"
                            icon={<PlusOutlined />}
                            onClick={() => {
                              if (!newNoteContent.trim()) {
                                message.warning("Vui lòng nhập nội dung ghi chú");
                                return;
                              }
                              addNoteMutation.mutate({
                                id: selectedRecord._id,
                                note: newNoteContent,
                              });
                            }}
                            loading={addNoteMutation.isPending}
                            className="bg-teal-600 hover:bg-teal-700 border-teal-600 font-medium text-xs rounded"
                          >
                            Lưu ghi chú
                          </Button>
                        </div>
                      </div>

                      {/* Existing notes */}
                      <div className="space-y-2 pt-2 border-t border-slate-200">
                        {selectedRecord.auditReferences &&
                        selectedRecord.auditReferences.some((a) =>
                          ["NOTE_ADDED", "POST_RESOLVED_NOTE"].includes(a.action || "")
                        ) ? (
                          selectedRecord.auditReferences
                            .filter((a) =>
                              ["NOTE_ADDED", "POST_RESOLVED_NOTE"].includes(a.action || "")
                            )
                            .map((noteItem, idx) => (
                              <div
                                key={idx}
                                className="p-2 bg-white rounded border border-slate-200 text-xs text-slate-700"
                              >
                                <div className="text-[10px] text-slate-400 mb-0.5">
                                  {noteItem.timestamp
                                    ? new Date(noteItem.timestamp).toLocaleString("vi-VN")
                                    : "N/A"}
                                </div>
                                <div className="whitespace-pre-wrap">{noteItem.note}</div>
                              </div>
                            ))
                        ) : (
                          <div className="text-xs text-slate-400 italic">Chưa có ghi chú nào</div>
                        )}
                      </div>
                    </div>
                  ),
                },
              ]}
            />

            {/* Section F: Lịch sử xử lý (Vietnamese Timeline) */}
            <div>
              <div className="text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">
                Lịch sử xử lý
              </div>
              {selectedRecord.auditReferences && selectedRecord.auditReferences.length > 0 ? (
                <Timeline
                  className="mt-3"
                  items={selectedRecord.auditReferences.map((ref, idx) => {
                    const actionConfig = AUDIT_ACTION_MAP[ref.action || ""] || {
                      title: ref.action || "SỰ VỤ",
                      color: "blue",
                    };
                    return {
                      key: idx,
                      color: actionConfig.color,
                      children: (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-slate-800">
                              {actionConfig.title}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {ref.timestamp
                                ? new Date(ref.timestamp).toLocaleString("vi-VN")
                                : "N/A"}
                            </span>
                          </div>
                          <div className="text-xs text-slate-600 whitespace-pre-wrap">
                            {formatAuditNote(ref.note)}
                          </div>
                        </div>
                      ),
                    };
                  })}
                />
              ) : (
                <div className="text-xs text-slate-400 italic">Chưa có bản ghi lịch sử nào</div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Assign Modal */}
      <Modal
        title="Chuyển người phụ trách xử lý đối soát"
        open={assignModalVisible}
        onCancel={() => setAssignModalVisible(false)}
        onOk={() => {
          if (!selectedRecord) return;
          assignMutation.mutate({
            id: selectedRecord._id,
            assignedTo: assigneeInput,
            note: assignNote,
          });
        }}
        confirmLoading={assignMutation.isPending}
        okText="Xác nhận phân công"
        cancelText="Hủy"
      >
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">
              Người tiếp nhận phụ trách:
            </label>
            <Select
              className="w-full"
              value={assigneeInput}
              onChange={setAssigneeInput}
              options={[{ label: "Chính tôi (Tiếp nhận sự vụ)", value: "me" }]}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">
              Ghi chú tiếp nhận / bàn giao:
            </label>
            <TextArea
              rows={3}
              value={assignNote}
              onChange={(e) => setAssignNote(e.target.value)}
              placeholder="Nhập ghi chú về kế hoạch xử lý hoặc lý do chuyển giao..."
            />
          </div>
        </div>
      </Modal>

      {/* Resolution Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-slate-800">
            <CheckCircleOutlined className="text-emerald-600" />
            <span className="font-bold text-base">
              Hoàn tất đối soát {selectedRecord?.orderCode ? `#${selectedRecord.orderCode}` : ""}
            </span>
          </div>
        }
        open={resolveModalVisible}
        onCancel={() => setResolveModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setResolveModalVisible(false)}>
            Hủy
          </Button>,
          <Button
            key="submit"
            type="primary"
            className="bg-emerald-600 hover:bg-emerald-700 border-emerald-600 font-semibold"
            loading={resolveMutation.isPending}
            disabled={
              !resolutionNote.trim() ||
              (resolutionOutcome === "RESOLVED_APPROVED" &&
                ((!selectedRecord?.paymentId && !selectedRecord?.contributionId) ||
                  selectedRecord?.reason === "REFERENCE_COLLISION"))
            }
            onClick={() => {
              if (!selectedRecord) return;
              if (!resolutionNote.trim()) {
                message.warning("Vui lòng nhập ghi chú kết quả xử lý");
                return;
              }
              resolveMutation.mutate({
                id: selectedRecord._id,
                outcome: resolutionOutcome,
                note: resolutionNote.trim(),
              });
            }}
          >
            Xác nhận kết thúc đối soát
          </Button>,
        ]}
        width={620}
      >
        {selectedRecord && (
          <div className="space-y-4 pt-2">
            {/* Case summary */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Mã đơn thanh toán:</span>
                <span className="font-mono font-bold text-teal-700">
                  {selectedRecord.orderCode ? `#${selectedRecord.orderCode}` : "N/A"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Vấn đề phát sinh:</span>
                <Tag color={REASON_EXPLANATIONS[selectedRecord.reason]?.color || "volcano"} className="text-xs">
                  {REASON_EXPLANATIONS[selectedRecord.reason]?.label || selectedRecord.reason}
                </Tag>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Số tiền thực nhận:</span>
                <span className="font-bold text-emerald-700">{formatVND(selectedRecord.receivedAmount)}</span>
              </div>
              {selectedRecord.expectedAmount && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Số tiền cần thanh toán:</span>
                  <span className="font-medium text-slate-700">{formatVND(selectedRecord.expectedAmount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Người phụ trách:</span>
                <span className="font-medium text-slate-700">
                  {selectedRecord.assignedTo ? getAdminDisplayName(selectedRecord.assignedTo) : "Chưa có"}
                </span>
              </div>
            </div>

            {/* Outcome Selection */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-2 uppercase tracking-wide">
                Chọn kết luận đối soát:
              </label>
              <Radio.Group
                value={resolutionOutcome}
                onChange={(e) => setResolutionOutcome(e.target.value)}
                className="w-full space-y-2.5"
              >
                <div
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    resolutionOutcome === "RESOLVED_APPROVED"
                      ? "border-emerald-500 bg-emerald-50/50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                  onClick={() => setResolutionOutcome("RESOLVED_APPROVED")}
                >
                  <Radio value="RESOLVED_APPROVED" className="font-semibold text-xs text-slate-800">
                    Giao dịch hợp lệ
                  </Radio>
                  <div className="text-[11px] text-slate-500 ml-6 mt-0.5">
                    Xác nhận học viên đã thanh toán đúng, hệ thống sẽ kích hoạt ghi danh và cập nhật số lượng lớp học.
                  </div>
                </div>

                <div
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    resolutionOutcome === "RESOLVED_REFUNDED"
                      ? "border-purple-500 bg-purple-50/50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                  onClick={() => setResolutionOutcome("RESOLVED_REFUNDED")}
                >
                  <Radio value="RESOLVED_REFUNDED" className="font-semibold text-xs text-slate-800">
                    Chuyển xử lý hoàn tiền
                  </Radio>
                  <div className="text-[11px] text-slate-500 ml-6 mt-0.5">
                    Tạo hồ sơ hoàn tiền cần xử lý, ghi nhận công nợ trả lại học viên. Quỹ ngân hàng chưa bị trừ cho đến khi kế toán thực hiện lệnh chuyển khoản.
                  </div>
                </div>

                <div
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    resolutionOutcome === "RESOLVED_IGNORED"
                      ? "border-slate-400 bg-slate-100/70"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                  onClick={() => setResolutionOutcome("RESOLVED_IGNORED")}
                >
                  <Radio value="RESOLVED_IGNORED" className="font-semibold text-xs text-slate-800">
                    Giao dịch không hợp lệ / Bỏ qua
                  </Radio>
                  <div className="text-[11px] text-slate-500 ml-6 mt-0.5">
                    Đóng hồ sơ đối soát (giao dịch rác, trùng lặp tham chiếu hoặc không phát sinh số dư tiền thực tế).
                  </div>
                </div>
              </Radio.Group>
            </div>

            {/* Dynamic Warnings per Outcome */}
            {resolutionOutcome === "RESOLVED_APPROVED" &&
              (!selectedRecord.paymentId && !selectedRecord.contributionId ? (
                <Alert
                  type="error"
                  showIcon
                  message="Không thể duyệt hợp lệ cho sự vụ này"
                  description="Giao dịch chưa xác định được đơn thanh toán hoặc tài khoản học viên (UNMATCHED). Không thể kích hoạt ghi danh khi không có đơn hàng."
                  className="text-xs"
                />
              ) : selectedRecord.reason === "REFERENCE_COLLISION" ? (
                <Alert
                  type="error"
                  showIcon
                  message="Không thể duyệt hợp lệ do trùng mã tham chiếu"
                  description="Giao dịch đang có cảnh báo trùng lặp mã tham chiếu ngân hàng (REFERENCE_COLLISION). Vui lòng chọn Hoàn tiền hoặc Bỏ qua."
                  className="text-xs"
                />
              ) : (
                <Alert
                  type="info"
                  showIcon
                  message="Xác nhận ghi danh hợp lệ"
                  description="Khi xác nhận, đơn thanh toán sẽ chuyển sang COMPLETED và học viên được chính thức ghi danh vào lớp."
                  className="text-xs bg-emerald-50 border-emerald-200 text-emerald-900"
                />
              ))}

            {resolutionOutcome === "RESOLVED_REFUNDED" && (
              <Alert
                type="info"
                showIcon
                message="Lưu ý quy trình hoàn tiền"
                description="Hệ thống sẽ tạo một Hồ sơ hoàn tiền (Refund Case) ở trạng thái Cần xem xét. Tiền trong tài khoản ngân hàng chưa bị xuất quỹ cho đến khi kế toán thực hiện ủy nhiệm chi thực tế."
                className="text-xs bg-purple-50 border-purple-200 text-purple-900"
              />
            )}

            {resolutionOutcome === "RESOLVED_IGNORED" && (
              <Alert
                type="warning"
                showIcon
                message="Đóng sự vụ không xử lý tài chính"
                description="Sự vụ sẽ được lưu trữ vào lịch sử với trạng thái Đã đóng. Không có thay đổi tài chính nào được thực hiện."
                className="text-xs bg-amber-50 border-amber-200"
              />
            )}

            {/* Resolution Note */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Ghi chú kết quả xử lý <span className="text-red-500">*</span>:
              </label>
              <TextArea
                rows={3}
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder="Nhập căn cứ hoặc quyết định xử lý đối soát (bắt buộc để đảm bảo tính minh bạch kiểm toán)..."
                className="text-xs rounded-lg"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
