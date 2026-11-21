import { RightOutlined } from "@ant-design/icons";

interface SectionHeaderProps {
  categoryTag?: string;
  title: string;
  subtitle?: string;
  filterButtons?: string[];
  activeFilter?: string;
  onFilterChange?: (filter: string) => void;
  viewAllLink?: string;
  viewAllText?: string;
}

export default function SectionHeader({ categoryTag, title, subtitle, filterButtons = [], activeFilter, onFilterChange, viewAllLink = "#", viewAllText = "Xem tất cả" }: SectionHeaderProps) {
  return (
    <div className="mb-5 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
      <div className="max-w-[560px]">
        {categoryTag && (
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-1.5 h-4 bg-[#0D9488] rounded-full" />
            <span className="text-[11px] font-bold tracking-wider text-[#0F766E] uppercase">{categoryTag}</span>
          </div>
        )}
        <h2 className="text-[24px] font-extrabold text-[#163B40] tracking-tight leading-tight">{title}</h2>
        {subtitle && <p className="text-[12px] text-[#64748B] mt-1 leading-5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3 flex-wrap justify-end">
        {filterButtons.length > 0 && (
          <div className="flex items-center gap-1 bg-[#F0FDFA] border border-[#D6E5E2] p-1 rounded-lg flex-wrap">
            {filterButtons.map((btn) => {
              const isActive = activeFilter === btn;
              return (
                <button
                  key={btn}
                  onClick={() => onFilterChange && onFilterChange(btn)}
                  className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition ${
                    isActive ? "bg-[#0D9488] text-white shadow-xs" : "text-[#334155] hover:text-[#0D9488] hover:bg-[#CCFBF1]/60"
                  }`}
                >
                  {btn}
                </button>
              );
            })}
          </div>
        )}

        {viewAllText && (
          <a href={viewAllLink} className="text-[12px] font-bold text-[#0D9488] hover:text-[#0F766E] flex items-center gap-1 whitespace-nowrap group">
            {viewAllText} <RightOutlined className="text-[10px] group-hover:translate-x-0.5 transition-transform" />
          </a>
        )}
      </div>
    </div>
  );
}
