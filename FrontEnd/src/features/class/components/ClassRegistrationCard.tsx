import { Link } from "react-router-dom";
import { Button, Progress } from "antd";
import { ArrowRightOutlined } from "@ant-design/icons";
import type { ClassDiscoveryItem } from "../../../types/classDiscovery";
import { useClassEnrollment } from "../hooks/useClassEnrollment";

interface ClassRegistrationCardProps {
  item: ClassDiscoveryItem;
}

export default function ClassRegistrationCard({ item }: ClassRegistrationCardProps) {
  const { handleEnrollClass, isEnrolling, isEnrolled, freeEnrollModal } = useClassEnrollment();

  const isFree = item.classType === "FREE";
  const capacityPercent = Math.min(
    100,
    Math.round((item.enrolledCount / (item.capacity || 1)) * 100)
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm flex flex-col gap-5">
      {/* Price Section */}
      <div>
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
          Học phí trọn gói
        </div>
        <div
          className={`text-3xl font-black tracking-tight ${
            isFree ? "text-emerald-600" : "text-indigo-600"
          }`}
        >
          {item.formattedPrice}
        </div>
      </div>

      {/* Capacity & Progress */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-700">
            Còn {item.seatsLeft}/{item.capacity} chỗ
          </span>
          {item.seatsLeft <= 3 && item.seatsLeft > 0 && (
            <span className="text-[11px] font-semibold text-amber-600">Sắp hết chỗ</span>
          )}
        </div>
        <Progress
          percent={capacityPercent}
          showInfo={false}
          size={["100%", 5]}
          strokeColor="#4f46e5"
          trailColor="#f1f5f9"
          className="!m-0"
        />
      </div>

      {/* Primary CTA Button */}
      {isEnrolled(item.id) ? (
        <Button
          size="large"
          disabled
          className="font-bold text-sm h-12 rounded-xl w-full bg-emerald-50 text-emerald-700 border-emerald-200"
        >
          Đã đăng ký lớp học này
        </Button>
      ) : item.canEnroll ? (
        <Button
          type="primary"
          size="large"
          loading={isEnrolling}
          disabled={isEnrolling}
          onClick={() => handleEnrollClass(item)}
          className="bg-indigo-600 hover:bg-indigo-700 font-bold text-sm h-12 rounded-xl shadow-xs border-none w-full flex items-center justify-center gap-2"
        >
          <span>Đăng ký lớp ngay</span>
          <ArrowRightOutlined className="text-xs" />
        </Button>
      ) : (
        <Button
          size="large"
          disabled
          className="font-medium text-sm h-12 rounded-xl w-full bg-slate-100 text-slate-400"
        >
          {item.isFull ? "Lớp đã đủ chỗ" : "Đã đóng đăng ký"}
        </Button>
      )}

      {/* Divider */}
      <div className="h-px bg-slate-100" />

      {/* Schedule & Information Details */}
      <div className="flex flex-col gap-3.5 text-xs">
        {/* Khai giảng */}
        <div className="flex items-center justify-between">
          <span className="text-slate-400 font-medium">Khai giảng</span>
          <span className="font-semibold text-slate-800">{item.startDate}</span>
        </div>

        {/* Kết thúc */}
        <div className="flex items-center justify-between">
          <span className="text-slate-400 font-medium">Kết thúc</span>
          <span className="font-semibold text-slate-800">
            {item.formattedEndDate || "20/12/2026"}
          </span>
        </div>

        {/* Lịch học */}
        <div className="flex items-start justify-between">
          <span className="text-slate-400 font-medium">Lịch học</span>
          <div className="text-right">
            <div className="font-semibold text-slate-800">
              {item.scheduleDays || "Thứ 7 & Chủ nhật"}
            </div>
            <div className="text-slate-500 font-medium mt-0.5">
              {item.scheduleTime || "08:30 – 10:30"}
            </div>
          </div>
        </div>

        {/* Sĩ số tối đa */}
        <div className="flex items-center justify-between">
          <span className="text-slate-400 font-medium">Sĩ số tối đa</span>
          <span className="font-semibold text-slate-800">{item.capacity} học viên</span>
        </div>
      </div>

      {/* Back Link */}
      <div className="text-center pt-2 border-t border-slate-100">
        <Link
          to="/classes"
          className="text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors"
        >
          ← Quay lại danh sách lớp học
        </Link>
      </div>
      {freeEnrollModal}
    </div>
  );
}
