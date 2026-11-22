import { NEWS_LIST } from "../../../data/homeData";
import SectionHeader from "../../../components/common/SectionHeader";
import { RightOutlined } from "@ant-design/icons";

export default function NewsSection() {
  return (
    <section className="home-section">
      <SectionHeader
        categoryTag="Góc kiến thức & Tin tức"
        title="Kinh Nghiệm Học Tập & Cập Nhật Tuyển Sinh"
        subtitle="Tổng hợp cẩm nang ôn thi, chiến thuật làm bài và thông tin tuyển sinh mới nhất từ Bộ GD&ĐT."
        viewAllText="Xem tất cả bài viết"
      />

      <div className="grid grid-cols-3 gap-6">
        {NEWS_LIST.map((item:any) => (
          <div
            key={item.id}
            className="group bg-white rounded-2xl border border-[#D6E5E2] hover:border-[#0D9488] overflow-hidden shadow-xs hover:shadow-md transition duration-300 flex flex-col justify-between"
          >
            <div>
              <div className="relative h-44 bg-slate-100 overflow-hidden">
                <img src={item.image} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                <div className="absolute top-3 left-3">
                  <span className="bg-[#163B40]/80 backdrop-blur text-white text-[12px] font-bold px-2 py-0.5 rounded">
                    {item.tag}
                  </span>
                </div>
              </div>

              <div className="p-5">
                <div className="text-[12px] text-slate-400 font-medium mb-1.5">{item.date}</div>
                <h3 className="text-sm font-extrabold text-[#163B40] line-clamp-2 leading-snug group-hover:text-[#0D9488] transition">
                  {item.title}
                </h3>
                <p className="text-sm text-[#64748B] mt-2 line-clamp-2 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </div>

            <div className="px-5 pb-5 pt-0">
              <a href="#" className="text-sm font-bold text-[#0D9488] hover:text-[#0F766E] flex items-center gap-1 group/link">
                Đọc bài viết <RightOutlined className="text-[12px] group-hover/link:translate-x-0.5 transition-transform" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}