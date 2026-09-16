import React from "react";
import { Button, Progress } from "antd";
import { StarFilled, CheckCircleFilled, ClockCircleOutlined, TeamOutlined } from "@ant-design/icons";

export default function FeaturedClassCard({
  badge = "Khai giảng gần nhất",
  levelBadge = "LỚP 12",
  rating = "4.98",
  title,
  teacherName,
  teacherRole,
  perks = [],
  originalPrice,
  discountPrice,
  discountPercent = "-30%",
  bgImage,
  sessionsBadge = "45 buổi Live",
  startDate = "20/09/2026",
  schedule = "Thứ 2 & Thứ 5 • 19:30",
  seatsLeft = 3,
  capacity = 12
}) {
  const percent = Math.round(((capacity - seatsLeft) / capacity) * 100);
  const nearlyFull = seatsLeft <= 3;

  return (
    <div className="bg-white rounded-xl border border-indigo-100 shadow-sm p-3 flex flex-col group h-full">
      <div className="relative h-[200px] rounded-lg overflow-hidden mb-2.5 bg-slate-800">
        <img src={bgImage} alt={title} className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition duration-500" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
        <span className="absolute top-2.5 left-2.5 bg-white/95 text-emerald-700 text-[9.5px] font-extrabold px-2 py-1 rounded-full shadow-sm">{badge}</span>
        <span className="absolute bottom-2.5 left-2.5 bg-black/55 backdrop-blur px-2 py-1 rounded text-white text-[8.5px] font-medium">{sessionsBadge}</span>
      </div>

      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="bg-indigo-50 text-indigo-700 text-[9.5px] font-bold px-1.5 py-0.5 rounded">{levelBadge}</span>
        <span className="text-slate-400 text-[9px] font-semibold flex items-center gap-1"><StarFilled className="text-amber-400" /> {rating}</span>
      </div>

      <h3 className="text-[13.5px] font-extrabold text-slate-900 leading-5 line-clamp-2 group-hover:text-indigo-600 transition">{title}</h3>

      <div className="mt-2 flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center font-bold text-indigo-700 text-[10.5px] shrink-0">VD</div>
        <div className="min-w-0"><h4 className="text-[11.5px] font-bold text-slate-800 leading-tight truncate">{teacherName}</h4><p className="text-[9.5px] text-slate-500 leading-tight mt-0.5 truncate">{teacherRole}</p></div>
      </div>

      <div className="mt-2 rounded-lg bg-slate-50 p-2 space-y-1.5 text-[9.5px] text-slate-600">
        <div className="flex items-center justify-between gap-2">
          <span className="font-extrabold text-emerald-700">Khai giảng {startDate}</span>
          <span className={`font-extrabold ${nearlyFull ? "text-rose-600" : "text-emerald-700"}`}>Còn {seatsLeft}/{capacity} chỗ</span>
        </div>
        <div className="flex items-center gap-1.5"><ClockCircleOutlined className="text-indigo-500" /><span className="font-medium">{schedule}</span></div>
        <div className="flex items-center justify-between text-[8.5px] text-slate-400"><span className="flex items-center gap-1"><TeamOutlined /> Nhóm nhỏ</span><span>{percent}% đã đăng ký</span></div>
        <Progress percent={percent} showInfo={false} size="small" strokeColor={nearlyFull ? "#f43f5e" : "#10b981"} trailColor="#e2e8f0" />
      </div>

      {perks.length > 0 && <div className="mt-2 space-y-1 text-slate-600">{perks.slice(0, 2).map((perk, i) => <div key={i} className="flex items-start gap-1.5 text-[9.5px] leading-4"><CheckCircleFilled className="text-emerald-500 shrink-0 mt-0.5" /><span className="line-clamp-1">{perk}</span></div>)}</div>}

      <div className="mt-auto pt-2.5 border-t border-slate-100 flex items-end justify-between gap-3">
        <div><div className="text-[8px] text-slate-400">Học phí</div><div className="flex items-center gap-1.5"><span className="text-[15px] font-black text-indigo-600 leading-tight">{discountPrice}</span>{discountPercent && <span className="bg-rose-50 text-rose-600 text-[8.5px] font-bold px-1.5 py-0.5 rounded">{discountPercent}</span>}</div>{originalPrice && <span className="text-[8.5px] text-slate-400 line-through">{originalPrice}</span>}</div>
        <Button type="primary" className="bg-indigo-600 hover:bg-indigo-700 font-bold text-[10.5px] px-3 h-8 rounded-md border-none shadow-sm">Xem lớp</Button>
      </div>
    </div>
  );
}
