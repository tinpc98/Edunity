import { Link } from "react-router-dom";

import {
  StarFilled,
  CheckCircleFilled,
  ClockCircleOutlined,
  TeamOutlined,
} from "@ant-design/icons";

interface FeaturedClassCardProps {
  badge?: string;
  levelBadge?: string;
  rating?: string;
  title: string;
  teacherName: string;
  teacherRole: string;
  perks?: string[];
  originalPrice?: string;
  discountPrice: string;
  discountPercent?: string;
  bgImage: string;
  sessionsBadge?: string;
  startDate?: string;
  schedule?: string;
  seatsLeft?: number;
  capacity?: number;
  teacherInitials?: string;
  to: string;
}

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
  capacity = 12,
  teacherInitials = "GV",
  to,
}: FeaturedClassCardProps) {
  const nearlyFull = seatsLeft <= 3;

  return (
    <div className="bg-white rounded-xl border border-[#D6E5E2] hover:border-[#0D9488] shadow-xs hover:shadow-md transition-all duration-300 p-3 flex flex-col group h-full">
      {/* Image */}
      <div className="relative h-[200px] rounded-lg overflow-hidden mb-2.5 bg-slate-800">
        <img
          src={bgImage}
          alt={title}
          className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition duration-500"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />

        <span className="absolute top-2.5 left-2.5 bg-white/95 text-[#0F766E] text-[11px] font-extrabold px-2.5 py-1 rounded-full shadow-sm">
          {badge}
        </span>

        <span className="absolute bottom-2.5 left-2.5 bg-black/55 backdrop-blur px-2.5 py-1 rounded text-white text-[10px] font-medium">
          {sessionsBadge}
        </span>
      </div>

      {/* Level + Rating */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="bg-[#CCFBF1] text-[#0F766E] text-[11px] font-bold px-2 py-1 rounded">
          {levelBadge}
        </span>

        <span className="text-slate-500 text-[11px] font-semibold flex items-center gap-1">
          <StarFilled className="text-amber-400" />
          {rating}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-[16px] font-extrabold text-[#163B40] leading-[1.45] line-clamp-2 group-hover:text-[#0D9488] transition">
        {title}
      </h3>

      {/* Teacher */}
      <div className="mt-2 flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-full bg-[#CCFBF1] flex items-center justify-center font-bold text-[#0F766E] text-[11px] shrink-0">
          {teacherInitials}
        </div>

        <div className="min-w-0">
          <h4 className="text-[13px] font-bold text-[#163B40] leading-tight truncate">
            {teacherName}
          </h4>

          <p className="text-[11px] text-[#64748B] leading-tight mt-0.5 truncate">
            {teacherRole}
          </p>
        </div>
      </div>

      {/* Live class info */}
      <div className="mt-2 rounded-lg bg-[#F5FAF9] p-2.5 space-y-2 text-[11.5px] text-[#334155] border border-[#D6E5E2]/40">
        <div className="flex items-center justify-between gap-2">
          <span className="font-extrabold text-[#0F766E]">
            Khai giảng {startDate}
          </span>

          <span
            className={`font-extrabold ${
              nearlyFull ? "text-rose-600" : "text-[#0F766E]"
            }`}
          >
            {nearlyFull && seatsLeft > 0 && "Sắp đầy • "}
            Còn {seatsLeft}/{capacity} chỗ
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <ClockCircleOutlined className="text-[#0D9488]" />

          <span className="font-medium">{schedule}</span>
        </div>

        <div className="flex items-center gap-1.5 text-[10.5px] text-slate-400">
          <TeamOutlined />
          <span>Nhóm học live sĩ số nhỏ</span>
        </div>
      </div>

      {/* Perks */}
      {perks.length > 0 && (
        <div className="mt-2 space-y-1.5 text-slate-600">
          {perks.slice(0, 2).map((perk, i) => (
            <div
              key={i}
              className="flex items-start gap-1.5 text-[11px] leading-4"
            >
              <CheckCircleFilled className="text-[#0D9488] shrink-0 mt-0.5" />

              <span className="line-clamp-1">{perk}</span>
            </div>
          ))}
        </div>
      )}

      {/* Price + CTA */}
      <div className="mt-auto pt-2.5 border-t border-[#D6E5E2]/70 flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-[17px] font-black text-[#0D9488] leading-tight">
              {discountPrice}
            </span>

            {discountPercent && (
              <span className="bg-rose-50 text-rose-600 text-[9.5px] font-bold px-1.5 py-0.5 rounded">
                {discountPercent}
              </span>
            )}
          </div>

          {originalPrice && (
            <span className="text-[9.5px] text-slate-400 line-through">
              {originalPrice}
            </span>
          )}
        </div>

        <Link
          to={to}
          className="inline-flex items-center bg-[#0D9488] hover:bg-[#0B746C] text-white hover:text-white font-bold text-[12px] px-3.5 h-8 rounded-md shadow-xs transition-colors"
        >
          Xem lớp
        </Link>
      </div>
    </div>
  );
}