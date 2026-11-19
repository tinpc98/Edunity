import type { ReactNode } from "react";
import { Table, type TableProps } from "antd";

interface AdminDataTableProps<T> extends TableProps<T> {
  tableTitle?: ReactNode;
  totalCount?: number;
  totalCountLabel?: string;
  actions?: ReactNode;
}

export default function AdminDataTable<T extends object>({
  tableTitle,
  totalCount,
  totalCountLabel = "bản ghi",
  actions,
  className = "",
  ...tableProps
}: AdminDataTableProps<T>) {
  const hasTopBar = Boolean(tableTitle || actions || totalCount !== undefined);

  return (
    <div className={`bg-white rounded-2xl border border-[#D6E5E2] shadow-[0_2px_8px_rgba(15,118,110,0.04)] overflow-hidden ${className}`}>
      {hasTopBar && (
        <div className="p-4 sm:p-5 bg-[#F0F8F6] border-b border-[#D6E5E2] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {tableTitle && (
              <span className="font-bold text-[#163B40] text-sm sm:text-base">
                {tableTitle}
              </span>
            )}
            {totalCount !== undefined && (
              <span className="px-2.5 py-0.5 rounded-full bg-[#CCFBF1] text-[#0F766E] border border-[#99F6E4] text-xs font-bold">
                {totalCount.toLocaleString("vi-VN")} {totalCountLabel}
              </span>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}

      <div className="overflow-x-auto">
        <Table<T>
          className="admin-custom-table"
          pagination={{
            showSizeChanger: true,
            pageSizeOptions: ["10", "20", "50", "100"],
            showTotal: (total, range) => (
              <span className="text-xs text-[#64748B] font-medium">
                Hiển thị {range[0]}-{range[1]} trên tổng {total.toLocaleString("vi-VN")}
              </span>
            ),
            ...tableProps.pagination,
          }}
          {...tableProps}
        />
      </div>
    </div>
  );
}
