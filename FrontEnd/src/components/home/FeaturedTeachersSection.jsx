import React from "react";
import { Button, Tag } from "antd";
import { CheckCircleFilled, StarFilled, ArrowRightOutlined } from "@ant-design/icons";
import { FEATURED_TEACHERS } from "../../data/homeData";

export default function FeaturedTeachersSection() {
  return (
    <section className="home-section section-soft">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5"><span className="w-1 h-5 bg-cyan-600 rounded-full" /><span className="text-[10px] font-bold tracking-wider text-cyan-700 uppercase">Học trực tiếp cùng chuyên gia</span></div>
          <h2 className="text-[25px] font-extrabold text-slate-900 tracking-tight">Giáo viên nổi bật</h2>
          <p className="text-[12px] text-slate-500 mt-1">Kết nối với những giáo viên uy tín, có lớp live đang mở đăng ký trên Edunity.</p>
        </div>
        <a href="#" className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">Xem tất cả giáo viên <ArrowRightOutlined /></a>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {FEATURED_TEACHERS.map((teacher, index) => (
          <article key={teacher.id} className="bg-white border border-slate-100 rounded-2xl p-5 text-center shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all min-h-[300px] flex flex-col">
            <div className={`mx-auto w-[92px] h-[92px] rounded-full p-[3px] ${index % 2 === 0 ? "bg-indigo-500" : "bg-cyan-500"} relative`}>
              <img src={teacher.avatar} alt={teacher.name} className="w-full h-full rounded-full object-cover border-[3px] border-white" />
              <span className="absolute -right-1 bottom-1 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow"><CheckCircleFilled className="text-indigo-600 text-[18px]" /></span>
            </div>
            <div className="mt-2.5"><Tag color="geekblue" className="m-0 text-[9px] rounded-full"><CheckCircleFilled /> Đã xác minh</Tag></div>
            <h3 className="mt-2.5 text-[14px] font-extrabold text-slate-800">{teacher.name}</h3>
            <div className="text-[10px] font-bold text-indigo-600 mt-0.5">{teacher.specialty}</div>
            <p className="text-[10px] text-slate-500 leading-4 mt-2 line-clamp-2 min-h-[32px]">{teacher.bio}</p>

            <div className="mt-3 grid grid-cols-3 rounded-xl bg-slate-50 overflow-hidden divide-x divide-slate-100 py-2.5">
              <div><div className="text-[11.5px] font-extrabold text-slate-700">{teacher.students}</div><div className="text-[8.5px] text-slate-400">Học sinh</div></div>
              <div><div className="text-[11.5px] font-extrabold text-amber-500">{teacher.rating} <StarFilled className="text-[9px]" /></div><div className="text-[8.5px] text-slate-400">Đánh giá</div></div>
              <div><div className="text-[11.5px] font-extrabold text-cyan-700">{teacher.openClasses} lớp</div><div className="text-[8.5px] text-slate-400">Đang mở</div></div>
            </div>

            <Button block className="mt-auto h-9 rounded-lg border-none bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10.5px]">Xem hồ sơ <ArrowRightOutlined /></Button>
          </article>
        ))}
      </div>
    </section>
  );
}
