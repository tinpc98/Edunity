import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Typography,
  Card,
  Table,
  Tag,
  Button,
  Empty,
  Skeleton,
  Modal,
  Descriptions,
  Space,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  WalletOutlined,
  ArrowRightOutlined,
  EyeOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { paymentService, paymentKeys } from "../../../services/payment.service";
import type { Payment } from "../../../types/payment";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  formatVND,
} from "../../../types/payment";
import { ROUTES } from "../../../routes/routePaths";

const { Title, Text } = Typography;

export default function StudentPaymentsPage() {
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);

  const {
    data: payments = [],
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: paymentKeys.myPayments(),
    queryFn: () => paymentService.getMyPayments(),
  });

  const columns: ColumnsType<Payment> = [
    {
      title: "Mã giao dịch",
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
      render: (status: Payment["paymentStatus"]) => (
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
      title: "Thao tác",
      key: "actions",
      align: "right",
      render: (_, record) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setSelectedPayment(record)}
          >
            Chi tiết
          </Button>
          {record.paymentStatus === "PENDING" && record.enrollmentId && (
            <Link to={`/checkout/${record.enrollmentId}`}>
              <Button
                type="primary"
                size="small"
                className="bg-indigo-600 hover:bg-indigo-500"
                icon={<ArrowRightOutlined />}
              >
                Thanh toán
              </Button>
            </Link>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Title level={3} className="!mb-1 !text-slate-900 font-bold flex items-center gap-2">
            <WalletOutlined className="text-indigo-600" /> Lịch sử thanh toán
          </Title>
          <Text type="secondary" className="text-sm">
            Theo dõi các khoản thanh toán học phí và giao dịch ghi danh trực tuyến.
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

      {/* Content */}
      <Card className="rounded-2xl border-slate-200/80 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton active paragraph={{ rows: 6 }} />
          </div>
        ) : payments.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div className="space-y-2 py-4">
                <p className="text-slate-600 font-medium">Bạn chưa có lịch sử thanh toán nào.</p>
                <p className="text-slate-400 text-xs">
                  Khi bạn đăng ký khóa học có học phí, các phiên giao dịch sẽ được ghi nhận tại đây.
                </p>
                <Link to={ROUTES.CLASSES}>
                  <Button type="primary" className="bg-indigo-600 hover:bg-indigo-500 mt-2">
                    Khám phá lớp học ngay
                  </Button>
                </Link>
              </div>
            }
          />
        ) : (
          <Table<Payment>
            columns={columns}
            dataSource={payments}
            rowKey="id"
            pagination={{
              pageSize: 10,
              showTotal: (total) => `Tổng cộng ${total} giao dịch`,
            }}
          />
        )}
      </Card>

      {/* Payment Detail Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-base font-bold text-slate-800">
            <WalletOutlined className="text-indigo-600" />
            Chi tiết thanh toán
          </div>
        }
        open={Boolean(selectedPayment)}
        onCancel={() => setSelectedPayment(null)}
        footer={[
          <Button key="close" onClick={() => setSelectedPayment(null)}>
            Đóng
          </Button>,
          selectedPayment?.paymentStatus === "PENDING" && selectedPayment?.enrollmentId && (
            <Link key="checkout" to={`/checkout/${selectedPayment.enrollmentId}`}>
              <Button type="primary" className="bg-indigo-600 hover:bg-indigo-500">
                Tiếp tục thanh toán
              </Button>
            </Link>
          ),
        ]}
      >
        {selectedPayment && (
          <div className="py-2 space-y-4">
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Mã giao dịch">
                <span className="font-mono font-semibold">{selectedPayment.gatewayReference}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Mã đơn ghi danh">
                <span className="font-mono text-slate-600">{selectedPayment.enrollmentId}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Khóa / Lớp học">
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
