import { useNavigate } from "react-router-dom";
import { Button } from "antd";
import {
  ClockCircleOutlined,
  TeamOutlined,
  StarFilled,
  CalendarOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import type { ClassDiscoveryItem } from "../types/classDiscovery";

interface ClassCardProps {
  item: ClassDiscoveryItem;
}

export default function ClassCard({ item }: ClassCardProps) {
  const navigate = useNavigate();

  const {
    id,
    title,
    teacherName,
    teacherAvatar,
    gradeLabel,
    coverImage,
    classType,
    formattedPrice,
    seatsLeft,
    capacity,
    isFull,
    canEnroll,
    startDate,
    scheduleText,
    ratingAverage,
    ratingCount,
    status,
  } = item;

  const isFree = classType === "FREE";
  const nearlyFull = seatsLeft > 0 && seatsLeft <= 3;

  const handleRegister = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEnroll) return;
    navigate(`/enrollment/${id}`);
  };

  const handleViewDetail = () => {
    navigate(`/classes/${id}`);
  };

  return (
    <div
      onClick={handleViewDetail}
      className="group bg-white rounded-xl border border-slate-200/80 hover:border-indigo-300 hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col h-full cursor-pointer"
    >
      {/* Thumbnail Banner */}
      <div className="relative h-36 w-full overflow-hidden bg-slate-100 shrink-0">
        <img
          src={coverImage}
          alt={title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />

        {/* Grade Badge */}
        <span className="absolute top-2.5 left-2.5 bg-white/95 backdrop-blur text-indigo-700 text-[11px] font-bold px-2 py-0.5 rounded shadow-sm">
          {gradeLabel}
        </span>

        {/* Free Badge if applicable */}
        {isFree && (
          <span className="absolute top-2.5 right-2.5 bg-emerald-600/95 backdrop-blur text-white text-[10px] font-extrabold px-2 py-0.5 rounded shadow-sm tracking-wider">
            FREE
          </span>
        )}

        {/* Start Date Tag */}
        <span className="absolute bottom-2 left-2.5 bg-black/60 backdrop-blur text-white text-[10px] font-medium px-2 py-0.5 rounded flex items-center gap-1">
          <CalendarOutlined className="text-[10px]" />
          Khai giảng {startDate}
        </span>
      </div>

      {/* Content Body */}
      <div className="p-3.5 flex flex-col flex-1 gap-2">
        {/* Rating & Teacher Row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {teacherAvatar ? (
              <img
                src={teacherAvatar}
                alt={teacherName}
                className="w-5 h-5 rounded-full object-cover border border-slate-200"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">
                {teacherName.charAt(0)}
              </div>
            )}
            <span className="text-xs text-slate-600 font-medium truncate">
              {teacherName}
            </span>
          </div>

          <div className="flex items-center gap-1 text-xs font-semibold text-slate-500 shrink-0">
            <StarFilled className="text-amber-400 text-xs" />
            <span>{ratingAverage.toFixed(1)}</span>
            <span className="text-[10px] text-slate-400">({ratingCount})</span>
          </div>
        </div>

        {/* Class Title */}
        <h3 className="text-[13.5px] font-bold text-slate-900 line-clamp-2 leading-snug group-hover:text-indigo-600 transition-colors min-h-[38px] !m-0">
          {title}
        </h3>

        {/* Schedule & Capacity Badges */}
        <div className="rounded-lg bg-slate-50 p-2 space-y-1 text-[11px] text-slate-600 border border-slate-100">
          <div className="flex items-center gap-1.5">
            <ClockCircleOutlined className="text-indigo-500 shrink-0" />
            <span className="truncate">{scheduleText}</span>
          </div>

          <div
            className={`flex items-center gap-1.5 font-semibold ${
              isFull
                ? "text-rose-600"
                : nearlyFull
                ? "text-amber-600"
                : "text-emerald-700"
            }`}
          >
            <TeamOutlined className="shrink-0" />
            {isFull ? (
              <span>Đã đủ chỗ ({capacity}/{capacity})</span>
            ) : (
              <span>
                {nearlyFull && "Sắp hết chỗ • "}
                Còn {seatsLeft}/{capacity} chỗ
              </span>
            )}
          </div>
        </div>

        {/* Price & Actions Row */}
        <div className="mt-auto pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
          {/* Price */}
          <div>
            <div className="text-[10px] text-slate-400">Học phí trọn gói</div>
            <div
              className={`text-base font-extrabold ${
                isFree ? "text-emerald-600" : "text-indigo-700"
              }`}
            >
              {formattedPrice}
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleViewDetail();
              }}
              className="text-xs font-semibold text-slate-600 hover:text-indigo-600 hover:border-indigo-400 rounded h-7 px-2.5"
            >
              Chi tiết
            </Button>

            {canEnroll ? (
              <Button
                type="primary"
                size="small"
                onClick={handleRegister}
                className="bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold rounded h-7 px-3 shadow-sm border-none inline-flex items-center gap-1"
              >
                <CheckCircleOutlined className="text-[11px]" />
                Đăng ký ngay
              </Button>
            ) : (
              <Button
                size="small"
                disabled
                className="text-xs font-medium rounded h-7 px-2.5 bg-slate-100 text-slate-400 border-slate-200"
              >
                {isFull ? "Đã đủ chỗ" : status === "COMPLETED" ? "Đã kết thúc" : "Đóng đăng ký"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
