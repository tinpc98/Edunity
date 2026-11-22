import { Button } from "antd";
import { StarFilled, ThunderboltFilled } from "@ant-design/icons";
import type { Category } from "../../../types/home";
import CategorySidebar from "./CategorySidebar";
import CategoryMegaMenu from "./CategoryMegaMenu";
import { useHomeStore } from "../../../stores/useHomeStore";
import { HERO_BANNER_URL } from "../../../data/homeData";
import { useHomeCategories } from "../hooks/useHomeData";

export default function HeroSection() {
  const activeCategoryId = useHomeStore((state) => state.activeCategoryId);
  const setActiveCategoryId = useHomeStore((state) => state.setActiveCategoryId);
  const clearActiveCategory = useHomeStore((state) => state.clearActiveCategory);
  const { data: categories = [], isLoading: isCategoriesLoading } = useHomeCategories();
  const currentCategory = categories.find((category: Category) => category.id === activeCategoryId);

  return (
    <section className="relative pt-5" onMouseLeave={clearActiveCategory}>
      <div className="flex gap-4 items-stretch h-[clamp(430px,54vh,485px)]">
        <CategorySidebar
          categories={categories}
          isLoading={isCategoriesLoading}
          activeCategoryId={activeCategoryId}
          onSelectCategory={setActiveCategoryId}
        />

        <div className="flex-1 relative min-w-0 h-full">
          <div className="relative h-full rounded-[20px] overflow-hidden bg-slate-900 shadow-md">
            <img src={HERO_BANNER_URL} alt="Edunity Live Classroom" className="w-full h-full object-cover opacity-90" />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-900/45 to-transparent flex items-center px-8 py-6">
              <div className="max-w-[560px] text-white space-y-4">
                <div className="inline-flex items-center gap-2 bg-[#0D9488] text-white text-[10px] font-extrabold px-3 py-1.5 rounded-full uppercase tracking-wide shadow-sm">
                  <ThunderboltFilled className="text-amber-300" /> Khai Giảng Học Kỳ II & Lớp Live Tương Tác 2 Chiều
                </div>
                <h1 className="text-[31px] font-black leading-[1.16] tracking-tight">Học Trực Tiếp Cùng Giáo Viên Phù Hợp Với Bạn</h1>
                <p className="text-sm text-slate-100 leading-6 max-w-[520px]">Tìm lớp học live phù hợp, trao đổi trực tiếp với giáo viên qua micro và bảng số, được giải đáp ngay trong buổi học.</p>
                <div className="flex items-center gap-2.5 pt-1">
                  <a href="/classes">
                    <Button type="primary" className="bg-[#0D9488] hover:bg-[#0B746C] font-bold text-[13px] h-10 px-5 rounded-lg border-none shadow-md shadow-teal-950/20">Khám phá lớp học</Button>
                  </a>
                  <a href="/classes">
                    <Button className="bg-white/15 hover:bg-white/25 text-white font-bold text-[13px] h-10 px-4 rounded-lg border-white/30 backdrop-blur">Xem tất cả lớp</Button>
                  </a>
                </div>
              </div>
            </div>
            <div className="absolute top-4 right-4">
              <span className="bg-[#163B40]/80 backdrop-blur text-white text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-teal-500/30">
                <StarFilled className="text-amber-400" /> 4.9/5 • 45.000+ học sinh yêu thích
              </span>
            </div>
          </div>

          {currentCategory && (
            <div className="absolute z-30 top-4 left-4">
              <CategoryMegaMenu category={currentCategory} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
