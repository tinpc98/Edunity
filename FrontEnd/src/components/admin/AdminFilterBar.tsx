import type { ReactNode } from "react";
import { Button, ConfigProvider } from "antd";
import { FilterOutlined } from "@ant-design/icons";

interface AdminFilterBarProps {
  title?: string;
  children: ReactNode;
  /** Shows the "Xóa bộ lọc" button; enabled only while a filter is applied. */
  onReset?: () => void;
  hasFilter?: boolean;
  /** e.g. "Tìm thấy 3 / 10 danh mục" — shown under the fields. */
  summary?: ReactNode;
  /** Tailwind grid-cols classes from md up (mobile is always 1 column). */
  gridClassName?: string;
}

/** Filter header placed at the top of a table card (style of AdminCategoriesPage). */
export function AdminFilterBar({
  title = "Bộ lọc",
  children,
  onReset,
  hasFilter = false,
  summary,
  gridClassName = "md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_220px_auto]",
}: AdminFilterBarProps) {
  return (
    // Same height for inputs, selects and buttons in the bar (admin Button theme is 38px)
    <ConfigProvider theme={{ components: { Select: { controlHeight: 38 }, Input: { controlHeight: 38 } } }}>
      <div className="p-4 sm:p-5 border-b border-[#D6E5E2] bg-[#F5FAF9] flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#163B40]">
          <FilterOutlined className="text-[#0D9488]" />
          {title}
        </div>
        <div className={`grid grid-cols-1 ${gridClassName} gap-3 items-end`}>
          {children}
          {onReset && (
            <Button onClick={onReset} disabled={!hasFilter} className="rounded-xl justify-self-start">
              Xóa bộ lọc
            </Button>
          )}
        </div>
        {summary && <div className="text-xs text-[#64748B]">{summary}</div>}
      </div>
    </ConfigProvider>
  );
}

export function AdminFilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <label className="text-xs font-medium text-[#64748B]">{label}</label>
      {children}
    </div>
  );
}

/** White card wrapping filter bar + table. */
export function AdminTableCard({ children }: { children: ReactNode }) {
  return <div className="bg-white rounded-2xl border border-[#D6E5E2] shadow-sm overflow-hidden">{children}</div>;
}
