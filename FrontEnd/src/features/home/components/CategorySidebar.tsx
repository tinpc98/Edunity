import { Link } from "react-router-dom";
import { Skeleton } from "antd";
import type { Category } from "../../../types/home";
import { RightOutlined, AppstoreOutlined } from "@ant-design/icons";

interface CategorySidebarProps {
  categories: Category[];
  isLoading?: boolean;
  activeCategoryId: string | null;
  onSelectCategory: (categoryId: string) => void;
}

export default function CategorySidebar({ categories, isLoading = false, activeCategoryId, onSelectCategory }: CategorySidebarProps) {
  return (
    <aside className="w-[248px] h-full bg-white rounded-[18px] border border-[#D6E5E2] shadow-xs p-3 flex flex-col shrink-0">
      <div className="min-h-0 flex flex-col">
        <div className="px-3 py-2 flex items-center gap-2 text-[13px] font-black tracking-wide text-[#163B40] uppercase">
          <AppstoreOutlined className="text-[#0D9488] text-sm" />
          <span>CÁC KHÓA HỌC</span>
        </div>

        <div className="mt-1.5 space-y-1 overflow-y-auto">
          {isLoading && (
            <div className="px-3 py-2">
              <Skeleton active title={false} paragraph={{ rows: 6 }} />
            </div>
          )}

          {!isLoading && categories.length === 0 && (
            <p className="px-3 py-2 text-[12px] text-slate-400">Chưa có danh mục khóa học.</p>
          )}

          {categories.map((cat) => {
            const isActive = activeCategoryId === cat.id;
            return (
              <Link
                key={cat.id}
                to={`/courses?categoryId=${cat.id}`}
                onMouseEnter={() => onSelectCategory(cat.id)}
                className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all text-[13px] font-semibold ${
                  isActive
                    ? "bg-[#0D9488] text-white shadow-xs hover:text-white"
                    : "text-[#334155] hover:bg-[#CCFBF1]/50 hover:text-[#0F766E]"
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
                          : "bg-[#CCFBF1] text-[#0F766E]"
                      }`}
                    >
                      {cat.badge}
                    </span>
                  )}
                  <RightOutlined className={`text-[9px] ${isActive ? "text-white" : "text-slate-400"}`} />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

    </aside>
  );
}
