import { Link } from "react-router-dom";
import type { Category } from "../../../types/home";
import { ArrowRightOutlined, CheckCircleOutlined } from "@ant-design/icons";

interface CategoryMegaMenuProps {
  category: Category | undefined;
}

export default function CategoryMegaMenu({ category }: CategoryMegaMenuProps) {
  if (!category) return null;

  const columnCount = Math.min(Math.max(category.groups.length, 1), 3);

  return (
    <div className="w-max max-w-[820px] bg-white rounded-[16px] border border-slate-200 shadow-[0_16px_44px_rgba(15,23,42,0.16)] p-4">
      <div className="flex items-center justify-between gap-6 pb-3 mb-3 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
          <h3 className="text-[13px] font-extrabold text-slate-900 uppercase tracking-[0.02em] whitespace-nowrap">
            {category.title}
          </h3>
        </div>
      </div>

      {category.groups.length === 0 ? (
        <p className="text-[12px] text-slate-400 min-w-[240px]">Danh mục này chưa có môn học.</p>
      ) : (
        <div
          className="grid gap-3 items-start"
          style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(210px, 245px))` }}
        >
          {category.groups.map((group, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-xl border self-start ${
                group.isHighlight ? "bg-indigo-50/70 border-indigo-200" : "bg-slate-50 border-slate-100"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className={`text-[10px] font-extrabold tracking-[0.06em] ${group.isHighlight ? "text-indigo-700" : "text-slate-600"}`}>
                  {group.name}
                </span>
              </div>

              <ul className="grid grid-cols-1 gap-0.5 text-[12px] font-medium">
                {group.subjects.map((sub) => (
                  <li key={sub.id}>
                    <Link
                      to={`/classes?subjectId=${sub.id}`}
                      className="block px-2 py-1.5 rounded-md transition-colors whitespace-normal text-slate-700 hover:text-indigo-600 hover:bg-white"
                    >
                      {sub.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-6 text-[10px] text-slate-500">
        <span className="flex items-center gap-1.5 text-emerald-700 font-medium whitespace-nowrap">
          <CheckCircleOutlined />
          Cam kết đổi giáo viên nếu không phù hợp trong 3 buổi đầu
        </span>
        <Link
          to={`/courses?categoryId=${category.id}`}
          className="font-bold text-indigo-600 hover:text-indigo-800 whitespace-nowrap inline-flex items-center gap-1"
        >
          Xem khóa học <ArrowRightOutlined className="text-[9px]" />
        </Link>
      </div>
    </div>
  );
}
