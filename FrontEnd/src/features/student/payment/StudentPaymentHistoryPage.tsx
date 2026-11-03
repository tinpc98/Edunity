import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Empty, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useAuthStore } from "../../../stores/auth.store";
import { gatewayPaymentService, paymentKeys } from "../../../services/gatewayPayment.service";
import { FetchError } from "../../../api/apiClient";
import type { Payment } from "../../../types/payment";
import {
  formatVND,
  PAYMENT_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
} from "../../../types/payment";

export default function StudentPaymentHistoryPage() {
  const { user } = useAuthStore();
  const userId = user?.userId;

  const {
    data: payments = [],
    error,
    isError,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: paymentKeys.myPayments(userId ?? ""),
    queryFn: () => gatewayPaymentService.getMyPayments(),
    enabled: Boolean(userId && user?.role === "STUDENT"),
  });

  const columns: ColumnsType<Payment> = [
    {
      title: "Mã giao dịch",
      dataIndex: "gatewayReference",
      key: "gatewayReference",
      width: 190,
      render: (reference: string) => (
        <span className="font-mono text-xs text-slate-600 break-all">{reference}</span>
      ),
    },
    {
      title: "Lớp học",
      dataIndex: "className",
      key: "className",
      width: 220,
      render: (className: string) => (
        <span className="font-medium text-slate-800">{className}</span>
      ),
    },
    {
      title: "Cổng thanh toán",
      dataIndex: "gateway",
      key: "gateway",
      width: 150,
      render: (gateway: string) => (
        <Tag color="blue" className="uppercase">
          {gateway}
        </Tag>
      ),
    },
    {
      title: "Số tiền",
      dataIndex: "amount",
      key: "amount",
      width: 140,
      align: "right",
      render: (amount: number) => (
        <span className="font-semibold text-slate-800">{formatVND(amount)}</span>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "paymentStatus",
      key: "paymentStatus",
      width: 140,
      render: (status: Payment["paymentStatus"]) => (
        <Tag color={PAYMENT_STATUS_COLORS[status]}>
          {PAYMENT_STATUS_LABELS[status]}
        </Tag>
      ),
    },
    {
      title: "Thời gian tạo",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 160,
      render: (createdAt: string) => (
        <div className="text-xs text-slate-600">
          <div>{dayjs(createdAt).format("DD/MM/YYYY")}</div>
          <div className="text-slate-400">{dayjs(createdAt).format("HH:mm")}</div>
        </div>
      ),
    },
    {
      title: "Thời gian thanh toán",
      dataIndex: "paidAt",
      key: "paidAt",
      width: 170,
      render: (paidAt?: string) =>
        paidAt ? (
          <div className="text-xs text-slate-600">
            <div>{dayjs(paidAt).format("DD/MM/YYYY")}</div>
            <div className="text-slate-400">{dayjs(paidAt).format("HH:mm")}</div>
          </div>
        ) : null,
    },
  ];

  if (!userId || user?.role !== "STUDENT") return null;

  const errorDescription =
    error instanceof FetchError && error.status === 403
      ? "Tài khoản hiện tại không có quyền xem lịch sử thanh toán."
      : error instanceof FetchError && error.status === 401
        ? "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại."
        : "Không thể tải lịch sử thanh toán. Vui lòng kiểm tra kết nối và thử lại.";

  return (
    <div className="max-w-[1200px] mx-auto space-y-4 sm:space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="text-[12px] font-medium text-slate-400 mb-1">
            Tài khoản / <span className="text-indigo-600">Lịch sử thanh toán</span>
          </div>
          <h1 className="text-[28px] font-bold text-slate-800 leading-tight">
            Lịch sử thanh toán
          </h1>
          <p className="text-[14px] text-slate-500 mt-0.5">
            Theo dõi các giao dịch thanh toán lớp học của bạn.
          </p>
        </div>
        <Button
          icon={<ReloadOutlined spin={isFetching} />}
          onClick={() => refetch()}
          disabled={isLoading}
        >
          Làm mới
        </Button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-5 sm:px-6 border-b border-slate-100 flex items-center gap-3">
          <h2 className="text-[15px] font-bold text-slate-800">Tất cả giao dịch</h2>
          {!isLoading && !isError && payments.length > 0 && (
            <span className="text-[12px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {payments.length}
            </span>
          )}
        </div>

        {isError ? (
          <div className="p-5 sm:p-6">
            <Alert
              type="error"
              showIcon
              message="Lỗi tải dữ liệu"
              description={errorDescription}
              action={
                <Button size="small" onClick={() => refetch()} loading={isFetching}>
                  Thử lại
                </Button>
              }
            />
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <Table<Payment>
              columns={columns}
              dataSource={payments}
              rowKey="id"
              loading={isLoading}
              scroll={{ x: 1100 }}
              pagination={{
                pageSize: 10,
                showTotal: (total) => `Tổng cộng ${total} giao dịch`,
              }}
              locale={{
                emptyText: (
                  <Empty
                    description={
                      <div className="space-y-1">
                        <p className="font-medium text-slate-600">Chưa có giao dịch nào</p>
                        <p className="text-xs text-slate-400">
                          Các giao dịch thanh toán lớp học của bạn sẽ xuất hiện tại đây.
                        </p>
                      </div>
                    }
                  />
                ),
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
