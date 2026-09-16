import React from "react";
import { RightOutlined } from "@ant-design/icons";

export default function SectionHeader({ categoryTag, title, subtitle, filterButtons = [], activeFilter, onFilterChange, viewAllLink = "#", viewAllText = "Xem tất cả" }) {
  return (
    <div className="mb-5 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
      <div className="max-w-[560px]">
        {categoryTag && (
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-1 h-4 bg-indigo-600 rounded-full" />
            <span className="text-[10px] font-bold tracking-wider text-indigo-700 uppercase">{categoryTag}</span>
          </div>
        )}
        <h2 className="text-[24px] font-extrabold text-slate-900 tracking-tight leading-tight">{title}</h2>
        {subtitle && <p className="text-[11.5px] text-slate-500 mt-1 leading-5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3 flex-wrap justify-end">
        {filterButtons.length > 0 && (
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg flex-wrap">
            {filterButtons.map((btn) => {
              const isActive = activeFilter === btn;
              return (
                <button
                  key={btn}
                  onClick={() => onFilterChange && onFilterChange(btn)}
                  className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-md transition ${
                    isActive ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 hover:text-indigo-600"
                  }`}
                >
                  {btn}
                </button>
              );
            })}
          </div>
        )}

        {viewAllText && (
          <a href={viewAllLink} className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 whitespace-nowrap">
            {viewAllText} <RightOutlined className="text-[9px]" />
          </a>
        )}
      </div>
    </div>
  );
}
