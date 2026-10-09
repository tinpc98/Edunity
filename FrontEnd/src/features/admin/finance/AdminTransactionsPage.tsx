import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Typography,
  Card,
  Table,
  Tag,
  Button,
  Select,
  Modal,
  Descriptions,
  Empty,
  Skeleton,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  FileTextOutlined,
  ReloadOutlined,
  EyeOutlined,
  FilterOutlined,
} from "@ant-design/icons";
import { financeService, financeKeys } from "../../../services/finance.service";
import type { Transaction, TransactionType, TransactionStatus } from "../../../types/payment";
import {
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_STATUS_COLORS,
  formatVND,
} from "../../../types/payment";

const { Title, Text } = Typography;

export default function AdminTransactionsPage() {
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const {
    data,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: financeKeys.adminTransactions(page, limit, typeFilter, statusFilter),
    queryFn: () => financeService.getAdminTransactions(page, limit, typeFilter, statusFilter),
  });

  const transactions = data?.items || [];
  const total = data?.total || 0;

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
      title: "Loại giao dịch",
      dataIndex: "transactionType",
      key: "transactionType",
      render: (type: TransactionType) => (
        <Tag color="cyan" className="font-semibold text-xs">
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
      render: (_, record) => (
        <div className="text-xs space-y-0.5 text-slate-500">
          <div>
            Từ: <span className="font-mono text-[11px] text-slate-700">{record.sourceUserId ? record.sourceUserId.slice(0, 8) + "..." : "Hệ thống"}</span>
          </div>
          {record.destinationUserId && (
            <div>
              Đến: <span className="font-mono text-[11px] text-slate-700">{record.destinationUserId.slice(0, 8)}...</span>
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Thời gian",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (date: string) => (
        <div className="text-xs text-slate-500">
          <div>{new Date(date).toLocaleDateString("vi-VN")}</div>
          <div className="text-[11px] text-slate-400">
            {new Date(date).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      ),
    },
    {
      title: "Chi tiết",
      key: "actions",
      align: "center",
      render: (_, record) => (
        <Button
          type="text"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => setSelectedTx(record)}
        >
          Xem
        </Button>
      ),
    },
  ];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Title level={3} className="!mb-1 !text-slate-900 font-bold flex items-center gap-2">
            <FileTextOutlined className="text-indigo-600" /> Sổ cái Giao dịch (Ledger)
          </Title>
          <Text type="secondary" className="text-sm">
            Hệ thống ghi nhận bút toán tài chính bất biến từ các hoạt động học phí, hoàn tiền và chi trả.
          </Text>
        </div>

        <Button
          icon={<ReloadOutlined spin={isFetching} />}
          onClick={() => refetch()}
          disabled={isLoading}
        >
          Làm mới
        </Button>
      </div>

      {/* Filters */}
      <Card className="rounded-xl border-slate-200/80 shadow-2xs">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <FilterOutlined className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-600 uppercase">Loại giao dịch:</span>
            <Select
              value={typeFilter}
              onChange={(val) => {
                setTypeFilter(val);
                setPage(1);
              }}
              style={{ width: 220 }}
              options={[
                { value: "ALL", label: "Tất cả các loại" },
                { value: "ENROLLMENT_PAYMENT", label: "Thanh toán học phí" },
                { value: "REFUND", label: "Hoàn tiền (REFUND)" },
                { value: "SCHOLARSHIP_USAGE", label: "Sử dụng học bổng" },
                { value: "SPONSOR_CONTRIBUTION", label: "Đóng góp tài trợ" },
                { value: "TEACHER_PAYOUT", label: "Rút tiền giảng viên" },
              ]}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600 uppercase">Trạng thái:</span>
            <Select
              value={statusFilter}
              onChange={(val) => {
                setStatusFilter(val);
                setPage(1);
              }}
              style={{ width: 180 }}
              options={[
                { value: "ALL", label: "Tất cả trạng thái" },
                { value: "PENDING", label: "Đang xử lý (PENDING)" },
                { value: "COMPLETED", label: "Hoàn thành (COMPLETED)" },
                { value: "FAILED", label: "Thất bại (FAILED)" },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="rounded-2xl border-slate-200/80 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton active paragraph={{ rows: 6 }} />
          </div>
        ) : transactions.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Không tìm thấy bản ghi giao dịch sổ cái nào phù hợp."
          />
        ) : (
          <Table<Transaction>
            columns={columns}
            dataSource={transactions}
            rowKey="id"
            pagination={{
              current: page,
              pageSize: limit,
              total: total,
              showSizeChanger: true,
              pageSizeOptions: ["10", "20", "50"],
              onChange: (p, ps) => {
                setPage(p);
                setLimit(ps);
              },
              showTotal: (t) => `Tổng cộng ${t} giao dịch sổ cái`,
            }}
          />
        )}
      </Card>

      {/* Transaction Detail Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-base font-bold text-slate-800">
            <FileTextOutlined className="text-indigo-600" />
            Chi tiết bút toán sổ cái
          </div>
        }
        open={Boolean(selectedTx)}
        onCancel={() => setSelectedTx(null)}
        footer={[
          <Button key="close" onClick={() => setSelectedTx(null)}>
            Đóng
          </Button>,
        ]}
      >
        {selectedTx && (
          <div className="py-2 space-y-4">
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Mã giao dịch (ID)">
                <span className="font-mono font-semibold text-xs">{selectedTx.id}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Loại giao dịch">
                <Tag color="cyan" className="font-semibold">
                  {TRANSACTION_TYPE_LABELS[selectedTx.transactionType] || selectedTx.transactionType}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Số tiền">
                <span className="font-bold text-base text-slate-900">
                  {formatVND(selectedTx.amount)}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                <Tag color={TRANSACTION_STATUS_COLORS[selectedTx.status]}>
                  {TRANSACTION_STATUS_LABELS[selectedTx.status] || selectedTx.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Source User ID">
                <span className="font-mono text-slate-600">{selectedTx.sourceUserId || "Hệ thống"}</span>
              </Descriptions.Item>
              {selectedTx.destinationUserId && (
                <Descriptions.Item label="Destination User ID">
                  <span className="font-mono text-slate-600">{selectedTx.destinationUserId}</span>
                </Descriptions.Item>
              )}
              {selectedTx.relatedEnrollmentId && (
                <Descriptions.Item label="Mã đơn ghi danh">
                  <span className="font-mono text-slate-600">{selectedTx.relatedEnrollmentId}</span>
                </Descriptions.Item>
              )}
              {selectedTx.relatedPaymentId && (
                <Descriptions.Item label="Mã thanh toán liên quan">
                  <span className="font-mono text-slate-600">{selectedTx.relatedPaymentId}</span>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Thời gian tạo">
                {new Date(selectedTx.createdAt).toLocaleString("vi-VN")}
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Modal>
    </div>
  );
}
