import { TESTIMONIALS } from "../../data/homeData";
import SectionHeader from "./SectionHeader";
import { StarFilled } from "@ant-design/icons";

export default function TestimonialSection() {
  return (
    <section className="home-section">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-1.5 h-4 bg-indigo-600 rounded-full"></span>
            <span className="text-[12px] font-bold tracking-wider text-indigo-700 uppercase">Cộng đồng học viên</span>
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Cảm Nhận Chân Thực Từ Học Viên Edunity</h2>
          <p className="text-sm text-slate-500 mt-1">Hơn 48.000 học sinh trên 63 tỉnh thành đã bứt phá thành tích cùng các lớp học live tương tác.</p>
        </div>

        <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-slate-100 shadow-xs">
          <div className="text-2xl font-black text-slate-900">4.9</div>
          <div>
            <div className="flex text-amber-400 text-sm">
              {[...Array(5)].map((_, i) => (
                <StarFilled key={i} />
              ))}
            </div>
            <div className="text-[12px] text-slate-400 font-medium">Dựa trên 48.240 đánh giá</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {TESTIMONIALS.map((item:any) => (
          <div key={item.id} className="bg-white rounded-2xl border border-slate-100 p-6 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex text-amber-400 text-sm">
                  {[...Array(item.rating)].map((_, i) => (
                    <StarFilled key={i} />
                  ))}
                </div>
                <span className="bg-indigo-50 text-indigo-700 text-[12px] font-bold px-2 py-0.5 rounded">
                  {item.badge}
                </span>
              </div>
              <p className="text-sm text-slate-600 italic leading-relaxed">
                "{item.comment}"
              </p>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-3">
              <img src={item.avatar} alt={item.name} className="w-10 h-10 rounded-full object-cover border border-indigo-100" />
              <div>
                <h4 className="text-sm font-bold text-slate-900 leading-tight">{item.name}</h4>
                <p className="text-[12px] text-slate-500 leading-tight mt-0.5">{item.role}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}