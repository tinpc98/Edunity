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
  Modal,
  Descriptions,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  FileTextOutlined,
  ReloadOutlined,
  EyeOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { financeService, financeKeys } from "../../../services/finance.service";
import type { Transaction, TransactionType, TransactionStatus } from "../../../types/payment";
import {
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPE_COLORS,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_STATUS_COLORS,
  formatVND,
} from "../../../types/payment";

const { Title, Text } = Typography;

export default function AdminTransactionsPage() {
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(15);
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [orderCode, setOrderCode] = useState<string>("");
  const [orderCodeInput, setOrderCodeInput] = useState<string>("");
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const {
    data,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: financeKeys.adminTransactions({
      page,
      limit,
      type: typeFilter,
      status: statusFilter,
      orderCode,
    }),
    queryFn: () =>
      financeService.getAdminTransactions({
        page,
        limit,
        type: typeFilter,
        status: statusFilter,
        orderCode,
      }),
  });

  const transactions = data?.items || [];
  const total = data?.total || 0;

  const handleSearch = () => {
    setOrderCode(orderCodeInput.trim());
    setPage(1);
  };

  const handleReset = () => {
    setTypeFilter("ALL");
    setStatusFilter("ALL");
    setOrderCode("");
    setOrderCodeInput("");
    setPage(1);
  };

  const columns: ColumnsType<Transaction> = [
    {
      title: "Mã giao dịch (Ledger)",
      dataIndex: "id",
      key: "id",
      render: (id: string) => (
        <span className="font-mono text-xs font-semibold text-slate-800">
          {id}
        </span>
      ),
    },
    {
      title: "Mã đơn (OrderCode)",
      dataIndex: "orderCode",
      key: "orderCode",
      render: (code: number | null) => (
        <span className="font-mono text-xs font-bold text-blue-600">
          {code || "—"}
        </span>
      ),
    },
    {
      title: "Loại giao dịch",
      dataIndex: "transactionType",
      key: "transactionType",
      render: (type: TransactionType) => (
        <Tag color={TRANSACTION_TYPE_COLORS[type] || "blue"} className="font-semibold text-xs">
          {TRANSACTION_TYPE_LABELS[type] || type}
        </Tag>
      ),
    },
    {
      title: "Số tiền",
      dataIndex: "amount",
      key: "amount",
      align: "right",
      render: (amount: number, record) => {
        const isNegative = record.transactionType === "REFUND" || record.transactionType === "TEACHER_PAYOUT";
        return (
          <span className={`font-bold text-sm ${isNegative ? "text-rose-600" : "text-emerald-600"}`}>
            {isNegative ? "- " : "+ "}
            {formatVND(amount)}
          </span>
        );
      },
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      align: "center",
      render: (status: TransactionStatus) => (
        <Tag color={TRANSACTION_STATUS_COLORS[status]} className="font-medium">
          {TRANSACTION_STATUS_LABELS[status] || status}
        </Tag>
      ),
    },
    {
      title: "Nguồn / Đích",
      key: "users",
      render: (_, record) => {
        const sourceName = record.sourceUser?.fullName || record.sourceUser?.email || (record.sourceUserId ? record.sourceUserId.slice(0, 8) + "..." : "Hệ thống");
        const destName = record.destinationUser?.fullName || record.destinationUser?.email || (record.destinationUserId ? record.destinationUserId.slice(0, 8) + "..." : null);
        return (
          <div className="text-xs space-y-0.5 text-slate-500">
            <div>
              Từ: <span className="font-medium text-slate-700">{sourceName}</span>
            </div>
            {destName && (
              <div>
                Đến: <span className="font-medium text-slate-700">{destName}</span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: "Thời gian",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (date: string) => (
        <span className="text-xs text-slate-500">
          {new Date(date).toLocaleString("vi-VN")}
        </span>
      ),
    },
    {
      title: "Chi tiết",
      key: "actions",
      align: "center",
      render: (_, record) => (
        <Button
          type="text"
          icon={<EyeOutlined />}
          size="small"
          onClick={() => setSelectedTx(record)}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Title level={2} className="!mb-1 font-bold text-slate-800">
            Sổ cái Giao dịch Tài chính
          </Title>
          <Text type="secondary">
            Bản ghi bất biến (Append-only Ledger) ghi nhận toàn bộ luồng tiền học phí, tài trợ, hoàn tiền và thù lao
          </Text>
        </div>
        <Button
          icon={<ReloadOutlined spin={isFetching} />}
          onClick={() => refetch()}
          loading={isFetching}
        >
          Làm mới
        </Button>
      </div>

      {/* Filters */}
      <Card bordered={false} className="shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4 items-end">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Mã đơn (OrderCode):</label>
            <Input
              placeholder="Nhập orderCode..."
              value={orderCodeInput}
              onChange={(e) => setOrderCodeInput(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Loại giao dịch:</label>
            <Select
              className="w-full"
              value={typeFilter}
              onChange={(val) => {
                setTypeFilter(val);
                setPage(1);
              }}
              options={[
                { label: "Tất cả loại giao dịch", value: "ALL" },
                { label: "Thanh toán học phí (ENROLLMENT_PAYMENT)", value: "ENROLLMENT_PAYMENT" },
                { label: "Khoản thu tạm giữ (UNAPPLIED_TUITION_RECEIPT)", value: "UNAPPLIED_TUITION_RECEIPT" },
                { label: "Đóng góp tài trợ MTQ (SPONSOR_CONTRIBUTION)", value: "SPONSOR_CONTRIBUTION" },
                { label: "Sử dụng học bổng (SCHOLARSHIP_USAGE)", value: "SCHOLARSHIP_USAGE" },
                { label: "Rút tiền giảng viên (TEACHER_PAYOUT)", value: "TEACHER_PAYOUT" },
                { label: "Hoàn tiền (REFUND)", value: "REFUND" },
              ]}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Trạng thái:</label>
            <Select
              className="w-full"
              value={statusFilter}
              onChange={(val) => {
                setStatusFilter(val);
                setPage(1);
              }}
              options={[
                { label: "Tất cả trạng thái", value: "ALL" },
                { label: "Hoàn thành (COMPLETED)", value: "COMPLETED" },
                { label: "Đang xử lý (PENDING)", value: "PENDING" },
                { label: "Thất bại (FAILED)", value: "FAILED" },
              ]}
            />
          </div>

          <div className="flex gap-2">
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} className="flex-1">
              Tìm kiếm
            </Button>
            <Button onClick={handleReset}>Đặt lại</Button>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card bordered={false} className="shadow-sm">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={transactions}
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
            showTotal: (t) => `Tổng cộng ${t} bút toán sổ cái`,
          }}
        />
      </Card>

      {/* Detail Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-slate-800">
            <FileTextOutlined className="text-blue-600" />
            <span>Chi tiết bút toán Sổ cái #{selectedTx?.id}</span>
          </div>
        }
        open={Boolean(selectedTx)}
        onCancel={() => setSelectedTx(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setSelectedTx(null)}>
            Đóng
          </Button>,
        ]}
        width={650}
      >
        {selectedTx && (
          <div className="space-y-4 pt-2">
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="Mã bút toán Ledger">{selectedTx.id}</Descriptions.Item>
              <Descriptions.Item label="Loại giao dịch">
                <Tag color={TRANSACTION_TYPE_COLORS[selectedTx.transactionType] || "blue"}>
                  {TRANSACTION_TYPE_LABELS[selectedTx.transactionType] || selectedTx.transactionType}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Mã đơn hàng (OrderCode)">
                {selectedTx.orderCode ? (
                  <span className="font-mono font-bold text-blue-600">{selectedTx.orderCode}</span>
                ) : (
                  "N/A"
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Số tiền">
                <span className="font-bold text-slate-800">{formatVND(selectedTx.amount)}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                <Tag color={TRANSACTION_STATUS_COLORS[selectedTx.status]}>
                  {TRANSACTION_STATUS_LABELS[selectedTx.status] || selectedTx.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Người nguồn (Source)">
                {selectedTx.sourceUser?.fullName || selectedTx.sourceUser?.email || selectedTx.sourceUserId}
              </Descriptions.Item>
              <Descriptions.Item label="Người thụ hưởng (Destination)">
                {selectedTx.destinationUser?.fullName || selectedTx.destinationUser?.email || selectedTx.destinationUserId || "Hệ thống"}
              </Descriptions.Item>
              <Descriptions.Item label="Thời gian ghi sổ">
                {new Date(selectedTx.createdAt).toLocaleString("vi-VN")}
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Modal>
    </div>
  );
}
