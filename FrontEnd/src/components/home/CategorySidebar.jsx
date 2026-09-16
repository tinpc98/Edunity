import React from "react";
import { RightOutlined, AppstoreOutlined } from "@ant-design/icons";

export default function CategorySidebar({ categories, activeCategoryId, onSelectCategory }) {
  return (
    <aside className="w-[248px] h-full bg-white rounded-[18px] border border-slate-100 shadow-sm p-3 flex flex-col shrink-0">
      <div>
        <div className="px-3 py-2 flex items-center gap-2 text-[13px] font-black tracking-wide text-indigo-900 uppercase">
          <AppstoreOutlined className="text-indigo-600 text-sm" />
          <span>CÁC KHÓA HỌC</span>
        </div>

        <div className="mt-1.5 space-y-1">
          {categories.map((cat) => {
            const isActive = activeCategoryId === cat.id;
            return (
              <div
                key={cat.id}
                onMouseEnter={() => onSelectCategory(cat.id)}
                className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all text-[13px] font-semibold ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                    : "text-slate-700 hover:bg-indigo-50 hover:text-indigo-600"
                }`}
              >
                <span className="leading-5 whitespace-normal">{cat.title}</span>

                <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                  {cat.badge && (
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                        isActive
                          ? "bg-white/20 text-white"
                          : cat.badgeColor === "red"
                          ? "bg-rose-50 text-rose-600"
                          : cat.badgeColor === "orange"
                          ? "bg-amber-50 text-amber-600"
                          : "bg-indigo-50 text-indigo-600"
                      }`}
                    >
                      {cat.badge}
                    </span>
                  )}
                  <RightOutlined className={`text-[9px] ${isActive ? "text-white" : "text-slate-400"}`} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </aside>
  );
}
