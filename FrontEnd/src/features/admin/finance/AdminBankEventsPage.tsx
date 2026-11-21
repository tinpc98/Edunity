import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
  Alert,
  Tooltip,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ReloadOutlined,
  EyeOutlined,
  SearchOutlined,
  CloudSyncOutlined,
  CopyOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { financeService, financeKeys } from "../../../services/finance.service";
import type { BankTransferEventItem } from "../../../types/payment";
import { formatVND } from "../../../types/payment";
import { ROUTES } from "../../../routes/routePaths";

const { Title, Text } = Typography;

// Business explanations for issues detected in bank events
const EVENT_ISSUE_EXPLANATIONS: Record<string, { title: string; desc: string }> = {
  UNMATCHED: {
    title: "Không tìm thấy đơn thanh toán phù hợp",
    desc: "Hệ thống chưa tìm được đơn thanh toán tương ứng với thông tin được tiếp nhận. Cần kiểm tra mã đơn và dữ liệu giao dịch trước khi xử lý.",
  },
  ACCOUNT_MISMATCH: {
    title: "Thông tin tài khoản nhận tiền chưa khớp",
    desc: "Tài khoản nhận tiền thực tế chưa khớp với tài khoản thụ hưởng quy định của hệ thống.",
  },
  AMOUNT_MISMATCH: {
    title: "Số tiền giao dịch không khớp",
    desc: "Số tiền chuyển khoản thực tế không khớp với số tiền cần thanh toán của đơn hàng.",
  },
  REFERENCE_COLLISION: {
    title: "Mã tham chiếu giao dịch đang bị trùng",
    desc: "Mã tham chiếu ngân hàng này đã từng được ghi nhận trên một đơn hàng khác trước đó.",
  },
  EXPIRED_PAYMENT: {
    title: "Thanh toán liên quan đến đơn đã hết thời hạn",
    desc: "Giao dịch thanh toán được ghi nhận sau khi thời hạn giữ chỗ của đơn hàng đã kết thúc.",
  },
  LATE_SUCCESS_AFTER_FAILED: {
    title: "Giao dịch thành công sau khi đơn đã hủy",
    desc: "Ngân hàng báo thanh toán thành công sau khi đơn hàng đã bị đánh dấu thất bại hoặc hủy.",
  },
  CURRENCY_MISMATCH: {
    title: "Loại tiền tệ không khớp",
    desc: "Loại tiền tệ nhận được khác với loại tiền quy định của đơn hàng.",
  },
  LINK_MISMATCH: {
    title: "Liên kết thanh toán không hợp lệ",
    desc: "Mã liên kết thanh toán không trùng khớp với phiên khởi tạo của đơn hàng.",
  },
  DUPLICATE: {
    title: "Giao dịch trùng lặp",
    desc: "Hệ thống phát hiện giao dịch trùng lặp đã được tiếp nhận trước đó.",
  },
  NEEDS_REVIEW: {
    title: "Cần kiểm tra đối soát",
    desc: "Giao dịch có dấu hiệu bất thường cần quản trị viên kiểm tra và xác nhận thủ công.",
  },
  DISPATCH_FAILED: {
    title: "Xử lý tự động chưa thành công",
    desc: "Quá trình tự động ghi nhận thanh toán gặp sự cố kỹ thuật, đang chờ thử lại hoặc cần can thiệp.",
  },
};

interface BusinessStatusConfig {
  label: string;
  color: string;
  icon?: any;
  desc: string;
}

// Single streamlined business status mapper
function getBankEventBusinessStatus(
  eventStatus: string,
  dispatchStatus: string
): BusinessStatusConfig {
  if (dispatchStatus === "DISPATCHED") {
    return {
      label: "Đã chuyển xử lý",
      color: "green",
      icon: <CheckCircleOutlined />,
      desc: "Sự kiện thanh toán đã được tiếp nhận và chuyển đến hệ thống xử lý ghi nhận doanh thu / cập nhật đơn hàng thành công.",
    };
  }

  if (
    dispatchStatus === "RECONCILIATION_REQUIRED" ||
    eventStatus === "NEEDS_REVIEW" ||
    eventStatus === "UNMATCHED" ||
    eventStatus === "ACCOUNT_MISMATCH" ||
    eventStatus === "AMOUNT_MISMATCH" ||
    eventStatus === "REFERENCE_COLLISION" ||
    eventStatus === "EXPIRED_PAYMENT" ||
    eventStatus === "DUPLICATE"
  ) {
    return {
      label: "Cần đối soát",
      color: "volcano",
      icon: <ExclamationCircleOutlined />,
      desc: "Hệ thống chưa thể tự động xử lý sự kiện này vì thông tin giao dịch chưa khớp hoặc phát hiện bất thường. Sự vụ cần được quản trị viên kiểm tra và xác nhận thủ công.",
    };
  }

  if (dispatchStatus === "PENDING_DISPATCH" || dispatchStatus === "DISPATCHING") {
    return {
      label: "Đang xử lý",
      color: "blue",
      icon: <ClockCircleOutlined />,
      desc: "Sự kiện đang nằm trong hàng đợi xử lý tự động của hệ thống.",
    };
  }

  if (dispatchStatus === "DISPATCH_FAILED" || eventStatus === "DISPATCH_FAILED") {
    return {
      label: "Xử lý chưa thành công",
      color: "red",
      icon: <ExclamationCircleOutlined />,
      desc: "Quá trình tự động ghi nhận thanh toán gặp sự cố kỹ thuật, đang chờ thử lại hoặc cần can thiệp.",
    };
  }

  if (eventStatus === "VERIFIED" || eventStatus === "READY_FOR_DISPATCH") {
    return {
      label: "Chờ kiểm tra",
      color: "gold",
      icon: <ClockCircleOutlined />,
      desc: "Giao dịch đã xác thực chữ ký số từ ngân hàng, đang chờ chuyển tiếp xử lý.",
    };
  }

  return {
    label: "Chờ xử lý",
    color: "default",
    icon: <ClockCircleOutlined />,
    desc: "Sự kiện đang được tiếp nhận và xử lý.",
  };
}

export default function AdminBankEventsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(15);
  const [channelKey, setChannelKey] = useState<string>("ALL");
  const [businessStatus, setBusinessStatus] = useState<string>("ALL");
  const [orderCode, setOrderCode] = useState<string>("");
  const [searchCodeInput, setSearchCodeInput] = useState<string>("");
  const [selectedEvent, setSelectedEvent] = useState<BankTransferEventItem | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: financeKeys.adminBankEvents({
      page,
      limit,
      channelKey,
      status: businessStatus,
      orderCode,
    }),
    queryFn: () =>
      financeService.getAdminBankEvents({
        page,
        limit,
        channelKey,
        status: businessStatus,
        orderCode,
      }),
  });

  const events = data?.items || [];
  const total = data?.total || 0;

  const handleSearch = () => {
    setOrderCode(searchCodeInput.trim());
    setPage(1);
  };

  const handleReset = () => {
    setChannelKey("ALL");
    setBusinessStatus("ALL");
    setOrderCode("");
    setSearchCodeInput("");
    setPage(1);
  };

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    message.success(`Đã sao chép ${label}: ${text}`);
  };

  // 6 streamlined columns: Mã đơn, Loại thanh toán, Số tiền, Tình trạng, Thời gian, Chi tiết
  const columns: ColumnsType<BankTransferEventItem> = [
    {
      title: "Mã đơn",
      dataIndex: "orderCode",
      key: "orderCode",
      width: 150,
      render: (code: number) => (
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          {code ? (
            <span className="font-mono font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
              #{code}
            </span>
          ) : (
            <span className="text-slate-400 italic text-xs">Chưa xác định</span>
          )}
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
      title: "Loại thanh toán",
      dataIndex: "channelKey",
      key: "channelKey",
      width: 160,
      render: (channel: string) => (
        <Tag color={channel === "TUITION" ? "blue" : "green"} className="font-semibold whitespace-nowrap">
          {channel === "TUITION" ? "Học phí" : "Tài trợ học bổng"}
        </Tag>
      ),
    },
    {
      title: "Số tiền",
      dataIndex: "amount",
      key: "amount",
      align: "right",
      width: 160,
      render: (amount: number | string) => (
        <span className="font-bold text-slate-800 whitespace-nowrap">{formatVND(amount)}</span>
      ),
    },
    {
      title: "Tình trạng",
      key: "status",
      align: "center",
      width: 180,
      render: (_, record) => {
        const config = getBankEventBusinessStatus(record.eventStatus, record.dispatchStatus);
        return (
          <Tag color={config.color} icon={config.icon} className="font-medium whitespace-nowrap text-xs">
            {config.label}
          </Tag>
        );
      },
    },
    {
      title: "Thời gian",
      dataIndex: "receivedAt",
      key: "receivedAt",
      width: 170,
      render: (d: string) => {
        const dateObj = new Date(d);
        const day = String(dateObj.getDate()).padStart(2, "0");
        const month = String(dateObj.getMonth() + 1).padStart(2, "0");
        const year = dateObj.getFullYear();
        const hours = String(dateObj.getHours()).padStart(2, "0");
        const minutes = String(dateObj.getMinutes()).padStart(2, "0");
        return (
          <span className="text-xs text-slate-500 whitespace-nowrap">
            {`${day}/${month}/${year}, ${hours}:${minutes}`}
          </span>
        );
      },
    },
    {
      title: "Chi tiết",
      key: "actions",
      align: "center",
      width: 110,
      render: (_, record) => (
        <Button
          type="text"
          size="small"
          icon={<EyeOutlined />}
          className="text-teal-700 hover:text-teal-900 hover:bg-teal-50 font-medium"
          onClick={() => setSelectedEvent(record)}
        >
          Chi tiết
        </Button>
      ),
    },
  ];

  // Derive issue and status configs for selected record
  const selectedStatusConfig = selectedEvent
    ? getBankEventBusinessStatus(selectedEvent.eventStatus, selectedEvent.dispatchStatus)
    : null;

  const isReconRequired =
    selectedEvent?.dispatchStatus === "RECONCILIATION_REQUIRED" ||
    selectedEvent?.eventStatus === "NEEDS_REVIEW" ||
    selectedEvent?.eventStatus === "UNMATCHED" ||
    selectedEvent?.eventStatus === "ACCOUNT_MISMATCH" ||
    selectedEvent?.eventStatus === "AMOUNT_MISMATCH" ||
    selectedEvent?.eventStatus === "REFERENCE_COLLISION" ||
    selectedEvent?.eventStatus === "EXPIRED_PAYMENT" ||
    selectedEvent?.eventStatus === "DUPLICATE";

  const issueKey = selectedEvent?.eventStatus;
  const issueConfig = issueKey && EVENT_ISSUE_EXPLANATIONS[issueKey]
    ? EVENT_ISSUE_EXPLANATIONS[issueKey]
    : isReconRequired
    ? {
        title: "Giao dịch cần kiểm tra xác minh",
        desc: "Hệ thống phát hiện thông tin giao dịch cần được quản trị viên kiểm tra đối soát thủ công.",
      }
    : null;

  return (
    <div className="space-y-6 p-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Title level={2} className="!mb-1 font-bold text-slate-800">
            Theo dõi xử lý thanh toán
          </Title>
          <Text type="secondary" className="text-slate-500 text-sm">
            Theo dõi các giao dịch được hệ thống tiếp nhận, xử lý thành công hoặc cần kiểm tra.
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

      {/* Streamlined Filter Bar */}
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
              className="rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Loại thanh toán:</label>
            <Select
              className="w-full text-sm"
              value={channelKey}
              onChange={(v) => {
                setChannelKey(v);
                setPage(1);
              }}
              options={[
                { label: "Tất cả loại", value: "ALL" },
                { label: "Học phí", value: "TUITION" },
                { label: "Tài trợ học bổng", value: "DONATION" },
              ]}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Tình trạng xử lý:</label>
            <Select
              className="w-full text-sm"
              value={businessStatus}
              onChange={(v) => {
                setBusinessStatus(v);
                setPage(1);
              }}
              options={[
                { label: "Tất cả tình trạng", value: "ALL" },
                { label: "Đã chuyển xử lý", value: "DISPATCHED" },
                { label: "Cần đối soát", value: "RECONCILIATION_REQUIRED" },
                { label: "Đang xử lý", value: "PROCESSING" },
                { label: "Xử lý chưa thành công", value: "FAILED" },
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
              Lọc
            </Button>
            <Button onClick={handleReset} className="rounded-lg text-slate-600 border-slate-300 hover:text-teal-700">
              Đặt lại
            </Button>
          </div>
        </div>
      </Card>

      {/* Events Table (6 columns) */}
      <Card bordered={false} className="shadow-sm rounded-xl border border-slate-200/80 overflow-hidden">
        <Table
          rowKey="_id"
          columns={columns}
          dataSource={events}
          loading={isLoading}
          scroll={{ x: 930 }}
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
            showTotal: (t) => `Tổng cộng ${t} giao dịch`,
          }}
        />
      </Card>

      {/* Detail Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-slate-800">
            <CloudSyncOutlined className="text-teal-600" />
            <span className="font-bold text-base">
              Chi tiết xử lý thanh toán {selectedEvent?.orderCode ? `#${selectedEvent.orderCode}` : ""}
            </span>
          </div>
        }
        open={Boolean(selectedEvent)}
        onCancel={() => setSelectedEvent(null)}
        footer={[
          <Button key="close" onClick={() => setSelectedEvent(null)}>
            Đóng
          </Button>,
        ]}
        width={720}
      >
        {selectedEvent && selectedStatusConfig && (
          <div className="space-y-5 pt-2 max-h-[75vh] overflow-y-auto pr-1">
            {/* Section 1: Tổng quan */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[11px] font-semibold text-slate-500 uppercase block">
                  Mã đơn
                </span>
                <span className="text-base font-bold font-mono text-teal-700">
                  {selectedEvent.orderCode ? `#${selectedEvent.orderCode}` : "Chưa xác định"}
                </span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[11px] font-semibold text-slate-500 uppercase block">
                  Loại thanh toán
                </span>
                <span className="text-sm font-semibold text-slate-800 block mt-0.5">
                  {selectedEvent.channelKey === "TUITION" ? "Học phí" : "Tài trợ học bổng"}
                </span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[11px] font-semibold text-slate-500 uppercase block">
                  Số tiền
                </span>
                <span className="text-base font-bold text-slate-800">
                  {formatVND(selectedEvent.amount)}
                </span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[11px] font-semibold text-slate-500 uppercase block">
                  Tình trạng
                </span>
                <Tag
                  color={selectedStatusConfig.color}
                  icon={selectedStatusConfig.icon}
                  className="font-semibold text-xs mt-0.5"
                >
                  {selectedStatusConfig.label}
                </Tag>
              </div>
            </div>

            {/* Section 2: Vấn đề phát hiện (nếu có bất thường hoặc cần đối soát) */}
            <div>
              <div className="text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                Vấn đề phát hiện
              </div>
              {issueConfig ? (
                <Alert
                  message={<span className="font-semibold text-slate-800">{issueConfig.title}</span>}
                  description={
                    <div className="space-y-1">
                      <div>{issueConfig.desc}</div>
                      {selectedEvent.normalizedError && (
                        <div className="text-xs text-amber-800 mt-1 italic">
                          Chi tiết: {selectedEvent.normalizedError}
                        </div>
                      )}
                    </div>
                  }
                  type="warning"
                  showIcon
                  className="bg-amber-50/80 border-amber-200 text-slate-700"
                />
              ) : selectedEvent.dispatchStatus === "DISPATCHED" ? (
                <Alert
                  message={<span className="font-semibold text-emerald-900">Giao dịch hợp lệ</span>}
                  description="Hệ thống đã tiếp nhận và chuyển tiếp xử lý ghi nhận doanh thu / cập nhật đơn hàng thành công."
                  type="success"
                  showIcon
                  className="bg-emerald-50 border-emerald-200 text-slate-700"
                />
              ) : (
                <Alert
                  message={<span className="font-semibold text-slate-800">Đang theo dõi xử lý</span>}
                  description="Giao dịch đang được hệ thống xử lý tuần tự theo quy trình kiểm tra."
                  type="info"
                  showIcon
                  className="bg-blue-50 border-blue-200"
                />
              )}
            </div>

            {/* Section 3: Thông tin thanh toán */}
            <div>
              <div className="text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                Thông tin thanh toán
              </div>
              <Descriptions bordered column={2} size="small">
                <Descriptions.Item label="Đơn vị thanh toán">
                  <span className="font-medium text-slate-800">{selectedEvent.provider}</span>
                </Descriptions.Item>
                <Descriptions.Item label="Loại thanh toán">
                  <Tag color={selectedEvent.channelKey === "TUITION" ? "blue" : "green"}>
                    {selectedEvent.channelKey === "TUITION" ? "Học phí" : "Tài trợ học bổng"}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Mã đơn thanh toán">
                  <span className="font-mono font-bold text-teal-700">
                    {selectedEvent.orderCode ? `#${selectedEvent.orderCode}` : "Chưa xác định"}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="Mã giao dịch ngân hàng">
                  {selectedEvent.providerReference ? (
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-slate-800">
                        {selectedEvent.providerReference}
                      </span>
                      <Button
                        type="link"
                        size="small"
                        icon={<CopyOutlined />}
                        className="p-0 text-teal-600"
                        onClick={() =>
                          copyToClipboard(selectedEvent.providerReference, "mã ngân hàng")
                        }
                      >
                        Sao chép
                      </Button>
                    </div>
                  ) : (
                    <span className="text-slate-400 italic">Không có</span>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="Số tiền tiếp nhận">
                  <span className="font-bold text-slate-800">{formatVND(selectedEvent.amount)}</span>
                </Descriptions.Item>
                <Descriptions.Item label="Thời điểm tiếp nhận">
                  {new Date(selectedEvent.receivedAt).toLocaleString("vi-VN")}
                </Descriptions.Item>
                <Descriptions.Item label="Xác thực nguồn tin" span={2}>
                  <Tag color="green" icon={<CheckCircleOutlined />}>
                    Đã xác thực chữ ký số từ ngân hàng
                  </Tag>
                </Descriptions.Item>

                {/* Counter account information if available in metadata */}
                {selectedEvent.metadata?.counterAccountName && (
                  <Descriptions.Item label="Người nộp tiền">
                    <span className="font-medium text-slate-800">
                      {selectedEvent.metadata.counterAccountName}
                    </span>
                  </Descriptions.Item>
                )}
                {selectedEvent.metadata?.counterAccountNumber && (
                  <Descriptions.Item label="Số tài khoản nộp">
                    <span className="font-mono text-xs text-slate-700">
                      {selectedEvent.metadata.counterAccountNumber}
                      {selectedEvent.metadata.counterAccountBankId &&
                        ` (${selectedEvent.metadata.counterAccountBankId})`}
                    </span>
                  </Descriptions.Item>
                )}
                {selectedEvent.metadata?.description && (
                  <Descriptions.Item label="Nội dung chuyển khoản" span={2}>
                    <span className="text-xs text-slate-700 font-mono">
                      {selectedEvent.metadata.description}
                    </span>
                  </Descriptions.Item>
                )}
              </Descriptions>
            </div>

            {/* Section 4: Tình trạng xử lý */}
            <div>
              <div className="text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                Tình trạng xử lý
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                <div className="flex items-center gap-2">
                  <Tag color={selectedStatusConfig.color} icon={selectedStatusConfig.icon} className="font-semibold text-xs">
                    {selectedStatusConfig.label}
                  </Tag>
                  {selectedEvent.dispatchedAt && (
                    <span className="text-xs text-slate-500">
                      (Hoàn tất: {new Date(selectedEvent.dispatchedAt).toLocaleString("vi-VN")})
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-600">{selectedStatusConfig.desc}</div>
              </div>
            </div>

            {/* Section 5: Hướng xử lý tiếp theo */}
            <div>
              <div className="text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                Hướng xử lý tiếp theo
              </div>
              {isReconRequired ? (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg space-y-2.5">
                  <div className="text-xs text-slate-700">
                    Kiểm tra và xử lý thông tin giao dịch trong{" "}
                    <span className="font-semibold text-slate-800">Hàng đợi đối soát</span> để kết luận
                    hợp lệ hoặc hoàn tiền.
                  </div>

                  {selectedEvent.reconciliation ? (
                    <div className="flex items-center justify-between p-2.5 bg-white border border-amber-200 rounded-lg text-xs">
                      <div>
                        <span className="font-semibold text-slate-800 block">
                          Đã có hồ sơ đối soát liên kết #{selectedEvent.orderCode || "Sự vụ"}
                        </span>
                        <span className="text-slate-500 text-[11px]">
                          Trạng thái hồ sơ:{" "}
                          <Tag color="gold" className="text-[11px] ml-1">
                            {selectedEvent.reconciliation.status === "NEEDS_REVIEW"
                              ? "Cần kiểm tra"
                              : selectedEvent.reconciliation.status === "IN_REVIEW"
                              ? "Đang xử lý"
                              : selectedEvent.reconciliation.status === "RESOLVED_APPROVED"
                              ? "Đã duyệt ghi danh"
                              : selectedEvent.reconciliation.status === "RESOLVED_REFUNDED"
                              ? "Đã lập hồ sơ hoàn tiền"
                              : "Đã đóng"}
                          </Tag>
                        </span>
                      </div>
                      <Button
                        type="primary"
                        size="small"
                        icon={<ArrowRightOutlined />}
                        className="bg-teal-600 hover:bg-teal-700 border-teal-600 text-xs font-medium"
                        onClick={() => {
                          setSelectedEvent(null);
                          navigate(`${ROUTES.ADMIN.RECONCILIATIONS}?orderCode=${selectedEvent.orderCode}`);
                        }}
                      >
                        Xem hồ sơ đối soát
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-2.5 bg-white border border-amber-200 rounded-lg text-xs">
                      <span className="text-slate-500 italic">
                        Chưa có hồ sơ đối soát trực tiếp. Quản trị viên có thể tra cứu tại Hàng đợi đối soát.
                      </span>
                      <Button
                        type="default"
                        size="small"
                        icon={<ArrowRightOutlined />}
                        className="text-xs text-teal-700 border-teal-600 hover:bg-teal-50"
                        onClick={() => {
                          setSelectedEvent(null);
                          navigate(ROUTES.ADMIN.RECONCILIATIONS);
                        }}
                      >
                        Đến Hàng đợi đối soát
                      </Button>
                    </div>
                  )}
                </div>
              ) : selectedEvent.dispatchStatus === "DISPATCHED" ? (
                <div className="flex items-center justify-between p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs">
                  <div className="text-slate-700">
                    Giao dịch đã được chuyển xử lý thành công. Quản trị viên có thể kiểm tra kết quả tại
                    Lịch sử giao dịch hoặc Quản lý thanh toán.
                  </div>
                  {selectedEvent.orderCode && (
                    <Button
                      type="link"
                      size="small"
                      icon={<ArrowRightOutlined />}
                      className="text-teal-700 font-medium p-0 ml-2 whitespace-nowrap"
                      onClick={() => {
                        setSelectedEvent(null);
                        navigate(`${ROUTES.ADMIN.TRANSACTIONS}?orderCode=${selectedEvent.orderCode}`);
                      }}
                    >
                      Xem lịch sử giao dịch
                    </Button>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
                  Hệ thống đang tiến hành các bước kiểm tra tự động. Vui lòng làm mới sau ít phút để cập nhật tiến trình.
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
