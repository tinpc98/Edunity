import { useQuery } from "@tanstack/react-query";
import { Table, Tag, Alert } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { paymentService } from "../../../services/payment.service";
import { useAuthStore } from "../../../stores/auth.store";

export interface StudentPaymentHistoryItem {
  id: string;
  enrollmentId: string;
  payerUserId: string;
  gateway: string;
  gatewayReference: string;
  amount: number;
  paymentStatus: "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";
  paidAt?: string;
  createdAt: string;
  updatedAt?: string;
  errorMessage?: string;
  className: string;
  enrollmentStatus: string;
}

const renderStatus = (status: StudentPaymentHistoryItem["paymentStatus"]) => {
  switch (status) {
    case "COMPLETED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-100">
          Thành công
        </span>
      );
    case "PENDING":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-600 border border-amber-100">
          Đang xử lý
        </span>
      );
    case "FAILED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-600 border border-rose-100">
          Thất bại
        </span>
      );
    case "REFUNDED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
          Đã hoàn tiền
        </span>
      );
    default:
      return <Tag>{status}</Tag>;
  }
};

export default function StudentPaymentHistoryPage() {
  const { user } = useAuthStore();

  const { data: payments = [], isLoading, isError } = useQuery({
    queryKey: ["studentPayments", user?.userId],
    queryFn: () => {
      if (!user) throw new Error("No user");
      return paymentService.getMyPayments(user.userId);
    },
    enabled: !!user,
  });

  const columns: ColumnsType<StudentPaymentHistoryItem> = [
    {
      title: <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Lớp học</span>,
      dataIndex: "className",
      key: "className",
      width: "32%",
      render: (text: string) => (
        <div className="text-[13px] font-semibold text-slate-800 leading-tight max-w-[280px]">
          {text}
        </div>
      ),
    },
    {
      title: <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Mã giao dịch</span>,
      dataIndex: "gatewayReference",
      key: "gatewayReference",
      width: "18%",
      render: (text: string) => (
        <div className="text-[12px] text-slate-500 font-mono tracking-tight truncate">
          {text}
        </div>
      ),
    },
    {
      title: <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Số tiền</span>,
      dataIndex: "amount",
      key: "amount",
      width: "15%",
      render: (val: number | string) => {
        const num = typeof val === "string" ? parseFloat(val) : val;
        return (
          <div className="text-[13px] font-semibold text-slate-800">
            {num.toLocaleString("vi-VN")} ₫
          </div>
        );
      },
    },
    {
      title: <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Thời gian</span>,
      dataIndex: "createdAt",
      key: "createdAt",
      width: "19%",
      render: (val: string) => (
        <div className="flex flex-col text-[12px] text-slate-600">
          <span className="font-medium text-slate-700">{dayjs(val).format("DD/MM/YYYY")}</span>
          <span className="text-slate-400">{dayjs(val).format("HH:mm")}</span>
        </div>
      ),
    },
    {
      title: <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Trạng thái</span>,
      dataIndex: "paymentStatus",
      key: "paymentStatus",
      width: "16%",
      render: (status: StudentPaymentHistoryItem["paymentStatus"]) => renderStatus(status),
    },
  ];

  if (!user) return null;

  if (isError) {
    return (
      <div className="max-w-[1040px] mx-auto">
        <Alert message="Lỗi tải dữ liệu" description="Vui lòng thử lại sau" type="error" />
      </div>
    );
  }

  return (
    <div className="max-w-[1040px] mx-auto space-y-4 sm:space-y-5">
      {/* Header */}
      <div>
        <div className="text-[12px] font-medium text-slate-400 mb-1">
          Tài khoản / <span className="text-indigo-600">Lịch sử thanh toán</span>
        </div>
        <h1 className="text-[28px] font-bold text-slate-800 leading-tight">Lịch sử thanh toán</h1>
        <p className="text-[14px] text-slate-500 mt-0.5">Theo dõi các giao dịch thanh toán lớp học của bạn.</p>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
        <div className="p-5 sm:px-6 border-b border-slate-100 flex items-center gap-3">
          <h2 className="text-[15px] font-bold text-slate-800">Tất cả giao dịch</h2>
          {!isLoading && payments.length > 0 && (
            <span className="text-[12px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {payments.length}
            </span>
          )}
        </div>
        
        <div className="w-full overflow-x-auto">
          <Table
            columns={columns}
            dataSource={payments}
            rowKey="id"
            loading={isLoading}
            pagination={false}
            className="min-w-[800px]"
            locale={{
              emptyText: (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M19 5H5C3.89543 5 3 5.89543 3 7V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V7C21 5.89543 20.1046 5 19 5Z" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M3 7L12 13L21 7" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <h3 className="text-[15px] font-bold text-slate-700 mb-1">Chưa có giao dịch nào</h3>
                  <p className="text-[13px] text-slate-500 max-w-sm">Những giao dịch thanh toán lớp học của bạn sẽ xuất hiện tại đây.</p>
                </div>
              )
            }}
            components={{
              header: {
                cell: (props: any) => (
                  <th {...props} className={`${props.className} bg-slate-50/50 border-b border-slate-100 px-4 py-3`} />
                )
              },
              body: {
                cell: (props: any) => (
                  <td {...props} className={`${props.className} border-b border-slate-50 px-4 py-4`} />
                )
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
