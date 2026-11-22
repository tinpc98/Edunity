import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Typography,
  Card,
  Table,
  Tag,
  Button,
  Modal,
  Descriptions,
  Empty,
  Skeleton,
  Input,
  Radio,
  Tooltip,
  message,
  Alert,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  WalletOutlined,
  ReloadOutlined,
  EyeOutlined,
  SearchOutlined,
  CopyOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  UserOutlined,
  BookOutlined,
  CreditCardOutlined,
  InfoCircleOutlined,
  RollbackOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import { financeService, financeKeys } from "../../../services/finance.service";
import type { Payment, PaymentStatus } from "../../../types/payment";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  formatVND,
} from "../../../types/payment";

const { Title, Text } = Typography;

function formatDateTimeVN(dateStr?: string | null): string {
  if (!dateStr) return "---";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "---";
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getEnrollmentStatusDisplay(status?: string | null): { label: string; color: string } {
  switch (status) {
    case "CONFIRMED":
      return { label: "Đã ghi danh", color: "success" };
    case "PENDING_PAYMENT":
      return { label: "Chờ thanh toán", color: "warning" };
    case "EXPIRED":
      return { label: "Đã hết hạn giữ chỗ", color: "error" };
    case "CANCELLED":
      return { label: "Đã hủy", color: "default" };
    case "COMPLETED":
      return { label: "Đã hoàn thành", color: "processing" };
    case "FAILED":
      return { label: "Thất bại", color: "error" };
    default:
      return { label: "Không khả dụng", color: "default" };
  }
}

function getRefundStatusLabel(status?: string): string {
  switch (status) {
    case "NEEDS_REVIEW":
      return "Chờ phê duyệt hoàn tiền";
    case "IN_REVIEW":
      return "Đang thẩm định hoàn tiền";
    case "APPROVED":
      return "Đã duyệt - Chờ chuyển khoản";
    case "PENDING_BANK_TRANSFER":
      return "Đang thực hiện chuyển tiền";
    case "AWAITING_BANK_VERIFICATION":
      return "Chờ xác minh chứng từ ngân hàng";
    case "COMPLETED":
      return "Đã hoàn tiền thành công";
    case "REJECTED":
      return "Từ chối hoàn tiền";
    case "CANCELLED":
      return "Đã hủy hoàn tiền";
    default:
      return status || "Đang xử lý";
  }
}

export default function AdminPaymentsPage() {
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  // Default filter: "ALL" (Backend only returns COMPLETED and FAILED, strictly NO PENDING)
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeSearch, setActiveSearch] = useState<string>("");
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);

  const {
    data,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: financeKeys.adminPayments(page, limit, statusFilter, activeSearch),
    queryFn: () => financeService.getAdminPayments(page, limit, statusFilter, activeSearch),
  });

  const payments = data?.items || [];
  const total = data?.total || 0;

  const handleCopyOrderCode = (code: string | number) => {
    navigator.clipboard.writeText(String(code));
    message.success(`Đã sao chép mã đơn #${code}`);
  };

  const handleSearch = () => {
    setActiveSearch(searchQuery.trim());
    setPage(1);
  };

  const handleResetSearch = () => {
    setSearchQuery("");
    setActiveSearch("");
    setPage(1);
  };

  const columns: ColumnsType<Payment> = [
    {
      title: "Mã đơn",
      dataIndex: "orderCode",
      key: "orderCode",
      width: 170,
      render: (code: number | null, record) => {
        const displayCode = code ? `#${code}` : `#${record.id.slice(-8).toUpperCase()}`;
        return (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-sm font-bold text-slate-800 tracking-tight">
                {displayCode}
              </span>
              {code && (
                <Tooltip title="Sao chép mã đơn">
                  <Button
                    type="text"
                    size="small"
                    className="!p-0.5 !h-5 !w-5 text-slate-400 hover:text-teal-700"
                    icon={<CopyOutlined className="text-xs" />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyOrderCode(code);
                    }}
                  />
                </Tooltip>
              )}
            </div>
            <div className="text-[11px] font-mono text-slate-400 truncate max-w-[150px]">
              {record.gatewayReference || `ID: ${record.id.slice(-6)}`}
            </div>
          </div>
        );
      },
    },
    {
      title: "Học viên",
      key: "student",
      width: 220,
      render: (_, record) => {
        const studentName = record.studentName || "Không tìm thấy thông tin học viên";
        const email = record.studentEmail;
        const payerName = record.payerName;

        return (
          <div className="space-y-0.5">
            <div className="font-semibold text-slate-800 text-sm">
              {studentName}
            </div>
            {email && (
              <div className="text-xs text-slate-500 truncate max-w-[200px]" title={email}>
                {email}
              </div>
            )}
            {payerName ? (
              <div className="text-[11px] text-teal-700 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 inline-block" />
                Người chuyển: {payerName}
              </div>
            ) : (
              <div className="text-[11px] text-slate-400 italic">
                Chưa xác minh người chuyển khoản
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: "Lớp học",
      dataIndex: "className",
      key: "className",
      width: 240,
      render: (className: string, record) => (
        <div className="space-y-0.5">
          <div className="font-medium text-slate-800 text-sm line-clamp-1" title={className}>
            {className || "Thông tin lớp học không khả dụng"}
          </div>
          {record.teacherName ? (
            <div className="text-xs text-slate-500">
              GV: <span className="text-slate-700 font-medium">{record.teacherName}</span>
            </div>
          ) : (
            <div className="text-[11px] text-slate-400">Chưa rõ thông tin giáo viên</div>
          )}
        </div>
      ),
    },
    {
      title: "Số tiền",
      dataIndex: "amount",
      key: "amount",
      align: "right",
      width: 140,
      render: (amount: number) => (
        <div className="whitespace-nowrap font-bold text-slate-900 text-sm">
          {formatVND(amount)}
        </div>
      ),
    },
    {
      title: "Kết quả",
      dataIndex: "paymentStatus",
      key: "paymentStatus",
      align: "center",
      width: 160,
      render: (status: PaymentStatus, record) => {
        const isCompleted = status === "COMPLETED";
        const isFailed = status === "FAILED";
        const isRefunded = status === "REFUNDED";

        return (
          <div className="flex flex-col items-center gap-1">
            {isCompleted && (
              <Tag
                icon={<CheckCircleOutlined />}
                className="!m-0 !px-2.5 !py-0.5 !border-0 !rounded-full !bg-emerald-100 !text-emerald-800 font-semibold text-xs"
              >
                Thành công
              </Tag>
            )}
            {isFailed && (
              <Tag
                icon={<CloseCircleOutlined />}
                className="!m-0 !px-2.5 !py-0.5 !border-0 !rounded-full !bg-rose-100 !text-rose-800 font-semibold text-xs"
              >
                Thất bại
              </Tag>
            )}
            {isRefunded && (
              <Tag
                icon={<RollbackOutlined />}
                className="!m-0 !px-2.5 !py-0.5 !border-0 !rounded-full !bg-purple-100 !text-purple-800 font-semibold text-xs"
              >
                Đã hoàn tiền
              </Tag>
            )}
            {!isCompleted && !isFailed && !isRefunded && (
              <Tag color={PAYMENT_STATUS_COLORS[status]} className="!m-0 font-medium text-xs">
                {PAYMENT_STATUS_LABELS[status] || status}
              </Tag>
            )}

            {/* Subline notification for refund liability */}
            {record.isRefundPending && (
              <Tag className="!m-0 !mt-0.5 !px-2 !py-0 !border-0 !rounded-full !bg-amber-100 !text-amber-800 text-[10px] font-medium">
                Đang chờ hoàn tiền
              </Tag>
            )}
          </div>
        );
      },
    },
    {
      title: "Thời gian",
      key: "time",
      width: 170,
      render: (_, record) => {
        const displayTime = record.paymentStatus === "COMPLETED" && record.paidAt
          ? record.paidAt
          : record.updatedAt || record.createdAt;
        const isPaid = record.paymentStatus === "COMPLETED" && record.paidAt;

        return (
          <div className="text-xs text-slate-600 space-y-0.5">
            <div className="font-medium text-slate-800">
              {formatDateTimeVN(displayTime)}
            </div>
            <div className="text-[11px] text-slate-400">
              {isPaid ? "Thời gian thanh toán" : "Thời gian ghi nhận"}
            </div>
          </div>
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
          type="primary"
          ghost
          size="small"
          icon={<EyeOutlined />}
          className="!border-teal-600 !text-teal-700 hover:!bg-teal-50 !font-medium"
          onClick={() => setSelectedPayment(record)}
        >
          Xem chi tiết
        </Button>
      ),
    },
  ];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center">
              <WalletOutlined className="text-teal-700 text-lg" />
            </div>
            <div>
              <Title level={3} className="!mb-0 !text-slate-900 font-bold">
                Thanh toán học phí
              </Title>
              <Text type="secondary" className="text-xs">
                Giám sát & Quản lý toàn bộ giao dịch thanh toán học phí trên toàn hệ thống Edunity
              </Text>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            icon={<ReloadOutlined spin={isFetching} />}
            onClick={() => refetch()}
            disabled={isLoading}
            className="border-slate-200 hover:!border-teal-600 hover:!text-teal-700"
          >
            Làm mới
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="rounded-xl border-slate-200/80 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Result Tabs (Strictly COMPLETED & FAILED, NO PENDING) */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Kết quả:
            </span>
            <Radio.Group
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              buttonStyle="solid"
              className="payment-result-tabs"
            >
              <Radio.Button value="ALL">Tất cả kết quả</Radio.Button>
              <Radio.Button value="COMPLETED">Thành công</Radio.Button>
              <Radio.Button value="FAILED">Thất bại</Radio.Button>
            </Radio.Group>
          </div>

          {/* Search box */}
          <div className="flex items-center gap-2 max-w-md w-full">
            <Input
              placeholder="Tìm theo mã đơn (#100000009), học viên, email..."
              prefix={<SearchOutlined className="text-slate-400" />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
              className="w-full rounded-lg"
            />
            <Button
              type="primary"
              onClick={handleSearch}
              className="!bg-teal-700 hover:!bg-teal-800"
            >
              Tìm
            </Button>
            {activeSearch && (
              <Button onClick={handleResetSearch} size="middle">
                Xóa lọc
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Table Card */}
      <Card className="rounded-2xl border-slate-200/80 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton active paragraph={{ rows: 6 }} />
          </div>
        ) : payments.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Không tìm thấy bản ghi thanh toán nào phù hợp."
            className="py-12"
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
              showTotal: (t) => `Tổng cộng ${t} giao dịch đã có kết quả`,
            }}
          />
        )}
      </Card>

      {/* Redesigned Payment Detail Modal with 7 Sections */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-base font-bold text-slate-800">
            <WalletOutlined className="text-teal-700" />
            <span>
              Chi tiết thanh toán {selectedPayment?.orderCode ? `#${selectedPayment.orderCode}` : `#${selectedPayment?.id.slice(-6)}`}
            </span>
          </div>
        }
        open={Boolean(selectedPayment)}
        onCancel={() => setSelectedPayment(null)}
        width={720}
        footer={[
          <Button key="close" onClick={() => setSelectedPayment(null)}>
            Đóng
          </Button>,
        ]}
      >
        {selectedPayment && (
          <div className="py-2 space-y-6">
            {/* Section 1: Tổng quan (Số tiền, Kết quả, Mã đơn) */}
            <div className="rounded-xl bg-teal-50/70 border border-teal-200/70 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase font-semibold text-teal-800 tracking-wider">
                    Tổng số tiền thanh toán
                  </div>
                  <div className="text-2xl font-black text-teal-900 mt-0.5">
                    {formatVND(selectedPayment.amount)}
                  </div>
                </div>

                <div className="flex flex-col sm:items-end gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">Kết quả:</span>
                    {selectedPayment.paymentStatus === "COMPLETED" ? (
                      <Tag className="!m-0 !px-3 !py-0.5 !border-0 !rounded-full !bg-emerald-100 !text-emerald-800 font-bold text-xs">
                        Thành công
                      </Tag>
                    ) : selectedPayment.paymentStatus === "FAILED" ? (
                      <Tag className="!m-0 !px-3 !py-0.5 !border-0 !rounded-full !bg-rose-100 !text-rose-800 font-bold text-xs">
                        Thất bại
                      </Tag>
                    ) : (
                      <Tag color={PAYMENT_STATUS_COLORS[selectedPayment.paymentStatus]} className="!m-0 font-medium">
                        {PAYMENT_STATUS_LABELS[selectedPayment.paymentStatus] || selectedPayment.paymentStatus}
                      </Tag>
                    )}
                  </div>
                  <div className="text-xs font-mono text-slate-600">
                    Mã đơn: <span className="font-bold text-slate-800">#{selectedPayment.orderCode || "N/A"}</span>
                  </div>
                </div>
              </div>

              {selectedPayment.isRefundPending && (
                <div className="mt-3 pt-3 border-t border-teal-200/50">
                  <Alert
                    type="warning"
                    showIcon
                    message="Giao dịch đang có nghĩa vụ hoàn tiền chờ xử lý"
                    description="Thanh toán này đã được ghi nhận nhưng học sinh chưa hoàn tất ghi danh vào lớp (hoặc bị trùng/quá hạn). Hồ sơ hoàn tiền đang được theo dõi."
                    className="!py-2 !px-3 !text-xs rounded-lg"
                  />
                </div>
              )}
            </div>

            {/* Section 2: Thông tin học viên */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2 flex items-center gap-1.5">
                <UserOutlined className="text-teal-700" />
                Thông tin học viên & Người thanh toán
              </div>
              <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
                <Descriptions.Item label="Họ và tên học viên">
                  <span className="font-semibold text-slate-800">
                    {selectedPayment.studentName || "Không tìm thấy thông tin học viên"}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="Email học viên">
                  <span className="text-slate-700">{selectedPayment.studentEmail || "Chưa cập nhật"}</span>
                </Descriptions.Item>
                <Descriptions.Item label="Tài khoản hệ thống">
                  <Tag color="cyan">Học viên đăng ký</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Người thực tế chuyển khoản">
                  {selectedPayment.payerName ? (
                    <span className="font-semibold text-teal-800">
                      {selectedPayment.payerName}
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">Chưa xác minh người chuyển khoản</span>
                  )}
                </Descriptions.Item>
              </Descriptions>
            </div>

            {/* Section 3: Thông tin lớp học */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2 flex items-center gap-1.5">
                <BookOutlined className="text-teal-700" />
                Thông tin lớp học & Ghi danh
              </div>
              <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
                <Descriptions.Item label="Tên lớp học" span={2}>
                  <span className="font-semibold text-slate-800">
                    {selectedPayment.className || "Thông tin lớp học không khả dụng"}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="Giáo viên giảng dạy">
                  <span className="text-slate-700">
                    {selectedPayment.teacherName || "Chưa rõ thông tin"}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="Học phí niêm yết">
                  <span className="font-semibold text-slate-800">
                    {formatVND(selectedPayment.tuitionAmount || selectedPayment.amount)}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="Trạng thái ghi danh" span={2}>
                  {(() => {
                    const { label, color } = getEnrollmentStatusDisplay(selectedPayment.enrollmentStatus);
                    return <Tag color={color} className="font-semibold">{label}</Tag>;
                  })()}
                </Descriptions.Item>
              </Descriptions>
            </div>

            {/* Section 4: Thông tin thanh toán */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2 flex items-center gap-1.5">
                <CreditCardOutlined className="text-teal-700" />
                Thông tin kỹ thuật & Cổng thanh toán
              </div>
              <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
                <Descriptions.Item label="Mã đơn hàng">
                  <span className="font-mono font-bold text-slate-800">
                    #{selectedPayment.orderCode || "N/A"}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="Cổng thanh toán">
                  <Tag color="blue" className="font-semibold uppercase">
                    {selectedPayment.gateway}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Mã tham chiếu cổng" span={2}>
                  <span className="font-mono text-xs text-slate-700">
                    {selectedPayment.gatewayReference || "N/A"}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="Thời gian tạo">
                  {formatDateTimeVN(selectedPayment.createdAt)}
                </Descriptions.Item>
                <Descriptions.Item label="Thời gian thanh toán">
                  {selectedPayment.paidAt ? (
                    <span className="text-emerald-700 font-medium">
                      {formatDateTimeVN(selectedPayment.paidAt)}
                    </span>
                  ) : (
                    <span className="text-slate-400">Chưa thanh toán</span>
                  )}
                </Descriptions.Item>
                {selectedPayment.providerMetadata?.accountNumber && (
                  <Descriptions.Item label="Tài khoản nhận tiền" span={2}>
                    <span className="font-mono text-xs text-slate-700">
                      {selectedPayment.providerMetadata.accountNumber} ({selectedPayment.providerMetadata.bin || "VietQR"})
                    </span>
                  </Descriptions.Item>
                )}
              </Descriptions>
            </div>

            {/* Section 5: Nếu thanh toán thất bại */}
            {selectedPayment.paymentStatus === "FAILED" && (
              <div>
                <Alert
                  type="error"
                  showIcon
                  message="Giao dịch thanh toán không thành công"
                  description={
                    <div className="space-y-1 text-xs">
                      <div>
                        <strong>Lý do:</strong>{" "}
                        {selectedPayment.reconciliation?.reason === "EXPIRED_PAYMENT"
                          ? "Giao dịch đã hết hạn giữ chỗ trước khi tiền được chuyển đến tài khoản ngân hàng."
                          : selectedPayment.errorMessage || "Giao dịch bị hủy hoặc không thành công từ phía ngân hàng/người dùng."}
                      </div>
                      <div className="text-slate-500">
                        Khuyến nghị: Học viên có thể thực hiện đăng ký và thanh toán lại đơn hàng mới.
                      </div>
                    </div>
                  }
                  className="rounded-xl"
                />
              </div>
            )}

            {/* Section 6: Nếu liên quan đối soát hoặc hoàn tiền */}
            {(selectedPayment.refundCase || selectedPayment.reconciliation) && (
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-amber-800 mb-2 flex items-center gap-1.5">
                  <InfoCircleOutlined className="text-amber-700" />
                  Đối soát & Nghĩa vụ hoàn tiền
                </div>
                <div className="rounded-xl bg-amber-50/60 border border-amber-200/80 p-3.5 space-y-2">
                  {selectedPayment.refundCase && (
                    <div className="text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Trạng thái hồ sơ hoàn tiền:</span>
                        <Tag color="warning" className="font-semibold">
                          {getRefundStatusLabel(selectedPayment.refundCase.status)}
                        </Tag>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Mã hồ sơ hoàn tiền:</span>
                        <span className="font-mono font-bold text-slate-800">
                          {selectedPayment.refundCase.caseNumber}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Số tiền đề xuất hoàn:</span>
                        <span className="font-bold text-amber-900">
                          {formatVND(selectedPayment.refundCase.eligibleAmount || selectedPayment.amount)}
                        </span>
                      </div>
                      {selectedPayment.refundCase.beneficiaryBankAccount && (
                        <div className="pt-1 border-t border-amber-200/50 text-[11px] text-slate-600">
                          Tài khoản thụ hưởng:{" "}
                          <strong>{selectedPayment.refundCase.beneficiaryBankAccount.bankName}</strong> -{" "}
                          <span className="font-mono">{selectedPayment.refundCase.beneficiaryBankAccount.accountNumber}</span>{" "}
                          ({selectedPayment.refundCase.beneficiaryBankAccount.accountHolderName})
                        </div>
                      )}
                      <div className="pt-2">
                        <Link to="/admin/refunds">
                          <Button size="small" type="primary" className="!bg-amber-600 hover:!bg-amber-700 text-xs">
                            Xem tại Quản lý hoàn tiền →
                          </Button>
                        </Link>
                      </div>
                    </div>
                  )}

                  {selectedPayment.reconciliation && !selectedPayment.refundCase && (
                    <div className="text-xs text-slate-700">
                      Giao dịch có ghi nhận đối soát nội bộ: <strong>{selectedPayment.reconciliation.status}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Section 7: Kết quả ghi danh (Đánh giá độc lập) */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2 flex items-center gap-1.5">
                <CheckCircleOutlined className="text-teal-700" />
                Kết luận kết quả ghi danh
              </div>
              {selectedPayment.paymentStatus === "COMPLETED" && selectedPayment.enrollmentStatus === "CONFIRMED" ? (
                <Alert
                  type="success"
                  showIcon
                  message="Ghi danh thành công"
                  description="Học viên đã được ghi danh thành công vào lớp học. Quyền lợi học tập và truy cập khóa học đã được kích hoạt trên hệ thống."
                  className="rounded-xl !text-xs"
                />
              ) : selectedPayment.paymentStatus === "COMPLETED" && selectedPayment.enrollmentStatus !== "CONFIRMED" ? (
                <Alert
                  type="warning"
                  showIcon
                  message="Thanh toán đã nhận nhưng ghi danh chưa hoàn tất"
                  description="Thanh toán học phí đã được ghi nhận vào hệ thống nhưng thời gian giữ chỗ của đơn đăng ký đã hết hạn (hoặc đơn thanh toán bị trùng). Để đảm bảo sĩ số lớp học, hệ thống KHÔNG kích hoạt ghi danh tự động cho đơn này và đã tạo hồ sơ hoàn trả học phí cho học viên."
                  className="rounded-xl !text-xs"
                />
              ) : (
                <Alert
                  type="info"
                  showIcon
                  message="Chưa ghi danh học viên"
                  description="Giao dịch thanh toán chưa thành công hoặc đã bị hủy. Học viên chưa được ghi danh vào lớp học."
                  className="rounded-xl !text-xs"
                />
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
