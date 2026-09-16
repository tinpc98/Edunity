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
            className="group bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-xs hover:shadow-md transition duration-300 flex flex-col justify-between"
          >
            <div>
              <div className="relative h-44 bg-slate-100 overflow-hidden">
                <img src={item.image} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                <div className="absolute top-3 left-3">
                  <span className="bg-slate-900/80 backdrop-blur text-white text-[12px] font-bold px-2 py-0.5 rounded">
                    {item.tag}
                  </span>
                </div>
              </div>

              <div className="p-5">
                <div className="text-[12px] text-slate-400 font-medium mb-1.5">{item.date}</div>
                <h3 className="text-sm font-extrabold text-slate-900 line-clamp-2 leading-snug group-hover:text-indigo-600 transition">
                  {item.title}
                </h3>
                <p className="text-sm text-slate-500 mt-2 line-clamp-2 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </div>

            <div className="px-5 pb-5 pt-0">
              <a href="#" className="text-sm font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                Đọc bài viết <RightOutlined className="text-[12px]" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}