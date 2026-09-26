import type { ReactNode } from "react";
import { DownOutlined, UpOutlined } from "@ant-design/icons";

interface FilterSectionProps {
  id: string;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  activeCount?: number;
  children: ReactNode;
}

export default function FilterSection({
  id,
  title,
  isOpen,
  onToggle,
  activeCount = 0,
  children,
}: FilterSectionProps) {
  return (
    <div className="border-b border-slate-200/80 last:border-b-0 py-3.5">
      <button
        type="button"
        id={`filter-header-${id}`}
        aria-controls={`filter-content-${id}`}
        aria-expanded={isOpen}
        onClick={onToggle}
        className="w-full flex items-center justify-between py-1 text-left cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
      >
        <span className="text-[13px] font-bold tracking-wide uppercase text-slate-800 group-hover:text-indigo-600 transition-colors flex items-center gap-2">
          {title}
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[11px] font-semibold text-white bg-indigo-600 rounded-full">
              {activeCount}
            </span>
          )}
        </span>
        <span className="text-slate-400 group-hover:text-indigo-600 text-xs transition-colors">
          {isOpen ? <UpOutlined /> : <DownOutlined />}
        </span>
      </button>

      {isOpen && (
        <div
          id={`filter-content-${id}`}
          aria-labelledby={`filter-header-${id}`}
          className="pt-3 pb-1 transition-all duration-200"
        >
          {children}
        </div>
      )}
    </div>
  );
}
