import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Typography,
  Card,
  Table,
  Tag,
  Button,
  Select,
  Input,
  Space,
  Modal,
  Descriptions,
  Badge,
  Switch,
  Alert,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ReloadOutlined,
  EyeOutlined,
  SearchOutlined,
  CloudSyncOutlined,
} from "@ant-design/icons";
import { financeService, financeKeys } from "../../../services/finance.service";
import type { BankTransferEventItem } from "../../../types/payment";
import { formatVND } from "../../../types/payment";

const { Title, Text } = Typography;

export default function AdminBankEventsPage() {
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(15);
  const [channelKey, setChannelKey] = useState<string>("ALL");
  const [eventStatus, setEventStatus] = useState<string>("ALL");
  const [dispatchStatus, setDispatchStatus] = useState<string>("ALL");
  const [isExhausted, setIsExhausted] = useState<boolean>(false);
  const [orderCode, setOrderCode] = useState<string>("");
  const [searchCodeInput, setSearchCodeInput] = useState<string>("");
  const [selectedEvent, setSelectedEvent] = useState<BankTransferEventItem | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: financeKeys.adminBankEvents({
      page,
      limit,
      channelKey,
      eventStatus,
      dispatchStatus,
      isExhausted,
      orderCode,
    }),
    queryFn: () =>
      financeService.getAdminBankEvents({
        page,
        limit,
        channelKey,
        eventStatus,
        dispatchStatus,
        isExhausted,
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
    setEventStatus("ALL");
    setDispatchStatus("ALL");
    setIsExhausted(false);
    setOrderCode("");
    setSearchCodeInput("");
    setPage(1);
  };

  const columns: ColumnsType<BankTransferEventItem> = [
    {
      title: "Mã đơn (OrderCode)",
      dataIndex: "orderCode",
      key: "orderCode",
      render: (code: number) => <span className="font-mono font-bold text-blue-600">{code}</span>,
    },
    {
      title: "Kênh thanh toán",
      dataIndex: "channelKey",
      key: "channelKey",
      render: (channel: string) => (
        <Tag color={channel === "TUITION" ? "blue" : "green"} className="font-semibold">
          {channel === "TUITION" ? "Học phí" : "Tài trợ MTQ"}
        </Tag>
      ),
    },
    {
      title: "Mã GD Ngân hàng",
      dataIndex: "providerReference",
      key: "providerReference",
      render: (ref: string) => <span className="font-mono text-xs">{ref}</span>,
    },
    {
      title: "Số tiền",
      dataIndex: "amount",
      key: "amount",
      align: "right",
      render: (amount: number | string) => (
        <span className="font-semibold text-slate-800">{formatVND(amount)}</span>
      ),
    },
    {
      title: "Trạng thái Webhook",
      dataIndex: "eventStatus",
      key: "eventStatus",
      render: (status: string) => {
        let color = "default";
        if (status === "VERIFIED" || status === "DISPATCHED") color = "green";
        else if (status.includes("MISMATCH") || status === "DISPATCH_FAILED") color = "red";
        else if (status === "READY_FOR_DISPATCH") color = "blue";
        else if (status === "LATE_SUCCESS_AFTER_FAILED" || status === "NEEDS_REVIEW") color = "gold";
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: "Tiến trình Dispatch",
      dataIndex: "dispatchStatus",
      key: "dispatchStatus",
      render: (status: string, record) => {
        let color = "default";
        if (status === "DISPATCHED") color = "green";
        else if (status === "PENDING_DISPATCH") color = "gold";
        else if (status === "DISPATCHING") color = "processing";
        else if (status === "DISPATCH_FAILED") color = "red";
        else if (status === "RECONCILIATION_REQUIRED") color = "volcano";

        const isRetrying = record.dispatchAttempts > 0 && status !== "DISPATCHED";
        const isExhaustedRecord = record.dispatchAttempts >= 5;

        return (
          <Space orientation="vertical" size={2}>
            <Tag color={color}>{status}</Tag>
            {isRetrying && (
              <Badge
                count={`Thử: ${record.dispatchAttempts}/5`}
                style={{ backgroundColor: isExhaustedRecord ? "#f5222d" : "#faad14" }}
              />
            )}
          </Space>
        );
      },
    },
    {
      title: "Thời gian nhận",
      dataIndex: "receivedAt",
      key: "receivedAt",
      render: (d: string) => <span className="text-xs text-slate-500">{new Date(d).toLocaleString("vi-VN")}</span>,
    },
    {
      title: "Thao tác",
      key: "actions",
      align: "center",
      render: (_, record) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => setSelectedEvent(record)}
        >
          Chi tiết
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Title level={2} className="!mb-1 font-bold text-slate-800">
            Giám sát Webhooks & Outbox Recovery
          </Title>
          <Text type="secondary">
            Lịch sử toàn bộ sự kiện webhook chuyển khoản ngân hàng và tiến trình tự động hạch toán
          </Text>
        </div>
        <Button icon={<ReloadOutlined spin={isFetching} />} onClick={() => refetch()} loading={isFetching}>
          Làm mới
        </Button>
      </div>

      {/* Filter Bar */}
      <Card bordered={false} className="shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 items-end">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Mã đơn (OrderCode):</label>
            <Input
              placeholder="Nhập mã order..."
              value={searchCodeInput}
              onChange={(e) => setSearchCodeInput(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Kênh thanh toán:</label>
            <Select
              className="w-full"
              value={channelKey}
              onChange={(v) => { setChannelKey(v); setPage(1); }}
              options={[
                { label: "Tất cả kênh", value: "ALL" },
                { label: "Học phí (TUITION)", value: "TUITION" },
                { label: "Tài trợ MTQ (DONATION)", value: "DONATION" },
              ]}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Trạng thái sự kiện:</label>
            <Select
              className="w-full"
              value={eventStatus}
              onChange={(v) => { setEventStatus(v); setPage(1); }}
              options={[
                { label: "Tất cả trạng thái", value: "ALL" },
                { label: "VERIFIED", value: "VERIFIED" },
                { label: "READY_FOR_DISPATCH", value: "READY_FOR_DISPATCH" },
                { label: "DISPATCHED", value: "DISPATCHED" },
                { label: "DISPATCH_FAILED", value: "DISPATCH_FAILED" },
                { label: "LATE_SUCCESS_AFTER_FAILED", value: "LATE_SUCCESS_AFTER_FAILED" },
                { label: "NEEDS_REVIEW", value: "NEEDS_REVIEW" },
              ]}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Tiến trình Dispatch:</label>
            <Select
              className="w-full"
              value={dispatchStatus}
              onChange={(v) => { setDispatchStatus(v); setPage(1); }}
              options={[
                { label: "Tất cả", value: "ALL" },
                { label: "PENDING_DISPATCH", value: "PENDING_DISPATCH" },
                { label: "DISPATCHING", value: "DISPATCHING" },
                { label: "DISPATCHED", value: "DISPATCHED" },
                { label: "DISPATCH_FAILED", value: "DISPATCH_FAILED" },
                { label: "RECONCILIATION_REQUIRED", value: "RECONCILIATION_REQUIRED" },
              ]}
            />
          </div>

          <div className="flex flex-col justify-end">
            <label className="text-xs font-semibold text-slate-600 block mb-2">Vượt ngưỡng retry (&ge; 5):</label>
            <Switch
              checked={isExhausted}
              onChange={(checked) => { setIsExhausted(checked); setPage(1); }}
              checkedChildren="Chỉ lỗi"
              unCheckedChildren="Tất cả"
            />
          </div>

          <div className="flex gap-2">
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} className="flex-1">
              Lọc
            </Button>
            <Button onClick={handleReset}>Đặt lại</Button>
          </div>
        </div>
      </Card>

      {/* Events Table */}
      <Card bordered={false} className="shadow-sm">
        <Table
          rowKey="_id"
          columns={columns}
          dataSource={events}
          loading={isLoading}
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
            showTotal: (t) => `Tổng cộng ${t} sự kiện webhook`,
          }}
        />
      </Card>

      {/* Detail Modal */}
      <Modal
        title={
          <Space>
            <CloudSyncOutlined className="text-blue-600" />
            <span>Chi tiết Sự kiện Webhook #{selectedEvent?.orderCode}</span>
          </Space>
        }
        open={Boolean(selectedEvent)}
        onCancel={() => setSelectedEvent(null)}
        footer={[
          <Button key="close" onClick={() => setSelectedEvent(null)}>
            Đóng
          </Button>,
        ]}
        width={750}
      >
        {selectedEvent && (
          <div className="space-y-4 pt-2">
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="Event ID">{selectedEvent._id}</Descriptions.Item>
              <Descriptions.Item label="Cổng thanh toán">{selectedEvent.provider}</Descriptions.Item>
              <Descriptions.Item label="Kênh tiếp nhận">{selectedEvent.channelKey}</Descriptions.Item>
              <Descriptions.Item label="Mục đích">{selectedEvent.purpose}</Descriptions.Item>
              <Descriptions.Item label="Mã giao dịch ngân hàng">{selectedEvent.providerReference}</Descriptions.Item>
              <Descriptions.Item label="Số tiền">{formatVND(selectedEvent.amount)}</Descriptions.Item>
              <Descriptions.Item label="Trạng thái sự kiện">
                <Tag color="blue">{selectedEvent.eventStatus}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái Dispatch">
                <Tag color={selectedEvent.dispatchStatus === "DISPATCHED" ? "green" : "gold"}>
                  {selectedEvent.dispatchStatus}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Số lần thử hạch toán">
                {selectedEvent.dispatchAttempts} / 5
              </Descriptions.Item>
              <Descriptions.Item label="Thời gian nhận">
                {new Date(selectedEvent.receivedAt).toLocaleString("vi-VN")}
              </Descriptions.Item>
              <Descriptions.Item label="Thời gian Dispatch" span={2}>
                {selectedEvent.dispatchedAt
                  ? new Date(selectedEvent.dispatchedAt).toLocaleString("vi-VN")
                  : "Chưa hoàn tất"}
              </Descriptions.Item>
            </Descriptions>

            {selectedEvent.lastDispatchError && (
              <Alert
                message="Lỗi hạch toán gần nhất"
                description={<pre className="text-xs text-red-700 whitespace-pre-wrap">{selectedEvent.lastDispatchError}</pre>}
                type="error"
                showIcon
              />
            )}

            {selectedEvent.metadata && (
              <div>
                <Text strong className="text-xs text-slate-700 block mb-1">
                  Metadata đã chuẩn hóa (Đã ẩn thông tin nhạy cảm / khóa bí mật):
                </Text>
                <pre className="rounded bg-slate-900 p-3 text-xs text-emerald-400 overflow-x-auto max-h-48">
                  {JSON.stringify(selectedEvent.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
