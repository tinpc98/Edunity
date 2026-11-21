import { UnorderedListOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import type { RecentFinanceTransaction } from "../../../../types/payment";
import { ROUTES } from "../../../../routes/routePaths";

interface RecentTransactionsTableProps {
  transactions?: RecentFinanceTransaction[];
}

export default function RecentTransactionsTable({
  transactions = [],
}: RecentTransactionsTableProps) {
  return (
    <div className="bg-white rounded-2xl border border-[#D6E5E2] p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-[#CCFBF1] flex items-center justify-center text-[#0D9488]">
              <UnorderedListOutlined />
            </span>
            <span className="font-extrabold text-[#163B40] text-sm sm:text-base">
              Giao dịch gần đây
            </span>
          </div>
          <span className="text-xs text-[#64748B] block mt-0.5">
            Nhật ký các bút toán thu chi mới nhất trong sổ giao dịch tài chính
          </span>
        </div>

        <Link
          to={ROUTES.ADMIN.TRANSACTIONS}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F0F8F6] hover:bg-[#E5F5F1] text-[#0F766E] border border-[#D6E5E2] text-xs font-bold transition-all shadow-2xs"
        >
          <span>Xem tất cả giao dịch</span>
          <ArrowRightOutlined className="text-[10px]" />
        </Link>
      </div>

      {/* Table */}
      {transactions.length === 0 ? (
        <div className="py-12 text-center text-xs text-[#64748B] bg-[#F5FAF9] rounded-xl border border-dashed border-[#D6E5E2]">
          Chưa có giao dịch phát sinh trong kỳ này
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#E2E8F0] text-[#64748B] font-bold">
                <th className="py-2.5 px-3">Mã GD</th>
                <th className="py-2.5 px-3">Loại giao dịch</th>
                <th className="py-2.5 px-3">Đối tượng</th>
                <th className="py-2.5 px-3 text-right">Số tiền</th>
                <th className="py-2.5 px-3">Thời gian</th>
                <th className="py-2.5 px-3 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {transactions.map((tx) => {
                return (
                  <tr
                    key={tx.id}
                    className="hover:bg-[#F8FAFC] transition-colors font-medium text-[#163B40]"
                  >
                    <td className="py-3 px-3 font-mono text-[11px] font-bold text-[#0F766E]">
                      {tx.code}
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-lg bg-[#F0F8F6] border border-[#D6E5E2] font-semibold text-[11px] text-[#163B40]">
                        {tx.type}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-[#64748B] truncate max-w-[140px]">
                      {tx.actorName || "—"}
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-mono font-bold text-xs ${
                        tx.isCredit ? "text-[#15803D]" : "text-[#DC2626]"
                      }`}
                    >
                      {tx.formattedAmount}
                    </td>
                    <td className="py-3 px-3 text-[#64748B] text-[11px] whitespace-nowrap">
                      {tx.formattedDate}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          tx.statusType === "success"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : tx.statusType === "warning"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : tx.statusType === "error"
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : "bg-slate-50 text-slate-600 border-slate-200"
                        }`}
                      >
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
