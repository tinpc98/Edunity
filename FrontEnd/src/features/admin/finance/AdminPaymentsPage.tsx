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
  WalletOutlined,
  ReloadOutlined,
  EyeOutlined,
  FilterOutlined,
} from "@ant-design/icons";
import { financeService, financeKeys } from "../../../services/finance.service";
import type { Payment, PaymentStatus } from "../../../types/payment";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  formatVND,
} from "../../../types/payment";

const { Title, Text } = Typography;

export default function AdminPaymentsPage() {
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);

  const {
    data,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: financeKeys.adminPayments(page, limit, statusFilter),
    queryFn: () => financeService.getAdminPayments(page, limit, statusFilter),
  });

  const payments = data?.items || [];
  const total = data?.total || 0;

  const columns: ColumnsType<Payment> = [
    {
      title: "Mã giao dịch / Gateway Ref",
      dataIndex: "gatewayReference",
      key: "gatewayReference",
      render: (ref: string, record) => (
        <div>
          <span className="font-mono text-xs font-semibold text-slate-800">
            {ref || record.id.slice(-8).toUpperCase()}
          </span>
          <div className="text-[11px] text-slate-400">ID: {record.id.slice(-6)}</div>
        </div>
      ),
    },
    {
      title: "Người thanh toán",
      dataIndex: "payerUserId",
      key: "payerUserId",
      render: (payer: string) => (
        <span className="font-mono text-xs text-slate-600">
          {typeof payer === "string" ? `${payer.slice(0, 8)}...` : JSON.stringify(payer)}
        </span>
      ),
    },
    {
      title: "Lớp học",
      dataIndex: "className",
      key: "className",
      render: (className: string) => (
        <span className="font-medium text-slate-800 text-sm">
          {className || "Khóa học trực tuyến"}
        </span>
      ),
    },
    {
      title: "Cổng thanh toán",
      dataIndex: "gateway",
      key: "gateway",
      render: (gateway: string) => (
        <Tag color="blue" className="text-xs font-semibold uppercase">
          {gateway || "SANDBOX"}
        </Tag>
      ),
    },
    {
      title: "Số tiền",
      dataIndex: "amount",
      key: "amount",
      align: "right",
      render: (amount: number) => (
        <span className="font-bold text-slate-900 text-sm">
          {formatVND(amount)}
        </span>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "paymentStatus",
      key: "paymentStatus",
      align: "center",
      render: (status: PaymentStatus) => (
        <Tag color={PAYMENT_STATUS_COLORS[status]} className="font-medium">
          {PAYMENT_STATUS_LABELS[status] || status}
        </Tag>
      ),
    },
    {
      title: "Thời gian",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (date: string, record) => (
        <div className="text-xs text-slate-500">
          <div>{new Date(date).toLocaleDateString("vi-VN")}</div>
          <div className="text-[11px] text-slate-400">
            {new Date(date).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
          </div>
          {record.paidAt && (
            <div className="text-[10px] text-emerald-600 font-medium">
              Đã trả: {new Date(record.paidAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
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
          onClick={() => setSelectedPayment(record)}
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
            <WalletOutlined className="text-indigo-600" /> Giám sát Thanh toán (Admin)
          </Title>
          <Text type="secondary" className="text-sm">
            Quản lý toàn bộ giao dịch thanh toán học phí trên toàn hệ thống Edunity.
          </Text>
        </div>

        <div className="flex items-center gap-3">
          <Button
            icon={<ReloadOutlined spin={isFetching} />}
            onClick={() => refetch()}
            disabled={isLoading}
          >
            Làm mới
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="rounded-xl border-slate-200/80 shadow-2xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <FilterOutlined className="text-slate-400" />
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
                { value: "PENDING", label: "Chờ thanh toán (PENDING)" },
                { value: "COMPLETED", label: "Thành công (COMPLETED)" },
                { value: "FAILED", label: "Thất bại (FAILED)" },
                { value: "REFUNDED", label: "Đã hoàn tiền (REFUNDED)" },
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
        ) : payments.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Không tìm thấy bản ghi thanh toán nào phù hợp."
          />
        ) : (
          <Table<Payment>
            columns={columns}
            dataSource={payments}
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
              showTotal: (t) => `Tổng cộng ${t} giao dịch`,
            }}
          />
        )}
      </Card>

      {/* Payment Detail Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-base font-bold text-slate-800">
            <WalletOutlined className="text-indigo-600" />
            Chi tiết thanh toán #{selectedPayment?.id.slice(-6)}
          </div>
        }
        open={Boolean(selectedPayment)}
        onCancel={() => setSelectedPayment(null)}
        footer={[
          <Button key="close" onClick={() => setSelectedPayment(null)}>
            Đóng
          </Button>,
        ]}
      >
        {selectedPayment && (
          <div className="py-2 space-y-4">
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Payment ID">
                <span className="font-mono font-semibold text-xs">{selectedPayment.id}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Gateway Reference">
                <span className="font-mono text-slate-800">{selectedPayment.gatewayReference}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Enrollment ID">
                <span className="font-mono text-slate-600">{selectedPayment.enrollmentId}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Payer User ID">
                <span className="font-mono text-slate-600">{selectedPayment.payerUserId}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Lớp học">
                <span className="font-medium text-slate-800">
                  {selectedPayment.className || "Khóa học trực tuyến"}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Cổng thanh toán">
                <Tag color="blue" className="uppercase font-semibold">
                  {selectedPayment.gateway}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Số tiền">
                <span className="font-bold text-base text-slate-900">
                  {formatVND(selectedPayment.amount)}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                <Tag color={PAYMENT_STATUS_COLORS[selectedPayment.paymentStatus]}>
                  {PAYMENT_STATUS_LABELS[selectedPayment.paymentStatus] || selectedPayment.paymentStatus}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Thời gian tạo">
                {new Date(selectedPayment.createdAt).toLocaleString("vi-VN")}
              </Descriptions.Item>
              {selectedPayment.paidAt && (
                <Descriptions.Item label="Thời gian thanh toán">
                  {new Date(selectedPayment.paidAt).toLocaleString("vi-VN")}
                </Descriptions.Item>
              )}
            </Descriptions>
          </div>
        )}
      </Modal>
    </div>
  );
}
