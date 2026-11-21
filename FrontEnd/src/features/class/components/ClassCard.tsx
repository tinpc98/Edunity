import { useNavigate } from "react-router-dom";
import { Button } from "antd";
import {
  ClockCircleOutlined,
  TeamOutlined,
  StarFilled,
  CalendarOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import type { ClassDiscoveryItem } from "../../../types/classDiscovery";
import { useClassEnrollment } from "../hooks/useClassEnrollment";

interface ClassCardProps {
  item: ClassDiscoveryItem;
}

export default function ClassCard({ item }: ClassCardProps) {
  const navigate = useNavigate();
  const {
    handleEnrollClass,
    isEnrolling,
    enrollingClassId,
    isEnrolled,
    getPendingEnrollmentId,
    freeEnrollModal,
    paidEnrollModal,
  } = useClassEnrollment();

  const {
    id,
    className,
    title,
    courseTitle,
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
    handleEnrollClass(item);
  };

  const handleViewDetail = () => {
    navigate(`/classes/${id}`);
  };

  return (
    <div
      onClick={handleViewDetail}
      className="group bg-white rounded-xl border border-[#D6E5E2] hover:border-[#0D9488] hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col h-full cursor-pointer"
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
        <span className="absolute top-2.5 left-2.5 bg-white/95 backdrop-blur text-[#0F766E] text-[11px] font-bold px-2 py-0.5 rounded shadow-xs">
          {gradeLabel}
        </span>

        {/* Free Badge if applicable */}
        {isFree && (
          <span className="absolute top-2.5 right-2.5 bg-[#0D9488]/95 backdrop-blur text-white text-[10px] font-extrabold px-2 py-0.5 rounded shadow-sm tracking-wider">
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
                className="w-5 h-5 rounded-full object-cover border border-[#D6E5E2]"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-[#CCFBF1] text-[#0F766E] flex items-center justify-center text-[10px] font-bold">
                {teacherName.charAt(0)}
              </div>
            )}
            <span className="text-xs text-[#334155] font-medium truncate">
              {teacherName}
            </span>
          </div>

          <div className="flex items-center gap-1 text-xs font-semibold text-slate-500 shrink-0">
            <StarFilled className="text-amber-400 text-xs" />
            <span>{ratingAverage.toFixed(1)}</span>
            <span className="text-[10px] text-slate-400">({ratingCount})</span>
          </div>
        </div>

        {/* Primary Title: Class Name */}
        <h3
          title={className || title}
          className="text-[14px] font-bold text-[#163B40] line-clamp-2 leading-snug group-hover:text-[#0D9488] transition-colors min-h-[40px] !m-0"
        >
          {className || title}
        </h3>

        {/* Secondary Context: Course Relationship */}
        <div className="flex items-center gap-1.5 text-[11.5px] text-[#64748B] min-h-[18px]">
          <span className="text-slate-400 shrink-0 font-normal">Thuộc khóa:</span>
          <span className="font-medium text-[#334155] truncate" title={courseTitle}>
            {courseTitle}
          </span>
        </div>

        {/* Schedule & Capacity Badges */}
        <div className="rounded-lg bg-[#F5FAF9] p-2 space-y-1 text-[11px] text-[#334155] border border-[#D6E5E2]/50">
          <div className="flex items-center gap-1.5">
            <ClockCircleOutlined className="text-[#0D9488] shrink-0" />
            <span className="truncate">{scheduleText}</span>
          </div>

          <div
            className={`flex items-center gap-1.5 font-semibold ${isFull
                ? "text-rose-600"
                : nearlyFull
                  ? "text-amber-600"
                  : "text-[#0F766E]"
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
        <div className="mt-auto pt-2.5 border-t border-[#D6E5E2]/60">
          {/* Price */}
          <div className="mb-2.5">
            <div className="text-[10px] text-slate-400">
              Học phí trọn gói
            </div>

            <div
              className={`text-base font-extrabold ${isFree ? "text-[#0D9488]" : "text-[#0D9488]"
                }`}
            >
              {formattedPrice}
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center gap-2">
            <Button
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleViewDetail();
              }}
              className="flex-1 text-xs font-semibold text-[#334155] hover:text-[#0D9488] hover:border-[#0D9488] rounded h-8"
            >
              Chi tiết
            </Button>

            {isEnrolled(id) ? (
              <Button
                size="small"
                disabled
                className="flex-1 text-xs font-semibold rounded h-8 bg-[#CCFBF1] text-[#0F766E] border-[#99F6E4]"
              >
                Đã đăng ký
              </Button>
            ) : getPendingEnrollmentId(id) ? (
              <Button
                type="primary"
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/checkout/${getPendingEnrollmentId(id)}`);
                }}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-xs font-semibold rounded h-8 shadow-sm border-none"
              >
                Tiếp tục thanh toán
              </Button>
            ) : canEnroll ? (
              <Button
                type="primary"
                size="small"
                loading={isEnrolling && enrollingClassId === id}
                disabled={isEnrolling}
                onClick={handleRegister}
                className="flex-1 bg-[#0D9488] hover:bg-[#0B746C] text-xs font-semibold rounded h-8 shadow-sm border-none inline-flex items-center justify-center gap-1"
              >
                <CheckCircleOutlined className="text-[11px]" />
                Đăng ký ngay
              </Button>
            ) : (
              <Button
                size="small"
                disabled
                className="flex-1 text-xs font-medium rounded h-8 bg-slate-100 text-slate-400 border-slate-200"
              >
                {isFull
                  ? "Đã đủ chỗ"
                  : status === "COMPLETED"
                    ? "Đã kết thúc"
                    : "Đóng đăng ký"}
              </Button>
            )}
          </div>
        </div>
      </div>
      {/* Modals render in a portal, but React still bubbles their clicks to this card, which opens the class page */}
      <div onClick={(e) => e.stopPropagation()}>
        {freeEnrollModal}
        {paidEnrollModal}
      </div>
    </div>
  );
}
