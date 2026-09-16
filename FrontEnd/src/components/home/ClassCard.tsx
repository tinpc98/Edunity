import type { ClassItem } from "../../types/home";

import { Button } from "antd";

import {
  ClockCircleOutlined,
  TeamOutlined,
  StarFilled,
} from "@ant-design/icons";

interface ClassCardProps {
  classItem: ClassItem;
  compact?: boolean;
}

export default function ClassCard({
  classItem,
  compact = false,
}: ClassCardProps) {
  const {
    tag,
    title,
    teacher,
    rating,
    sessionsCount,
    price,
    image,
    startDate,
    schedule,
    seatsLeft,
    capacity,
  } = classItem;

  const nearlyFull = seatsLeft <= 3;
  const isFree = Number(price) === 0;

  return (
    <div className="group bg-white rounded-xl border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all duration-300 overflow-hidden flex flex-col h-full">
      <div
        className={`relative ${
          compact ? "h-[102px]" : "h-[116px]"
        } w-full overflow-hidden bg-slate-100`}
      >
        <img
          src={image}
          alt={title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />

        <span className="absolute top-2 left-2 bg-white/95 backdrop-blur text-indigo-700 text-[10px] font-bold px-1.5 py-0.5 rounded">
          {tag}
        </span>

        <span className="absolute bottom-2 right-2 bg-black/60 backdrop-blur text-white text-[9px] font-medium px-1.5 py-0.5 rounded">
          {sessionsCount}
        </span>
      </div>

      <div
        className={`${
          compact ? "p-2.5 gap-1.5" : "p-3 gap-2"
        } flex flex-col flex-1`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {isFree && (
              <span className="inline-flex items-center text-[9px] font-extrabold text-emerald-700 bg-emerald-100 px-1.5 py-1 rounded-full shrink-0">
                FREE
              </span>
            )}

            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full truncate">
              Khai giảng {startDate}
            </span>
          </div>

          <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 shrink-0">
            <StarFilled className="text-amber-400" />
            {rating.toFixed(1)}
          </div>
        </div>

        <h3 className="text-[13.5px] font-extrabold text-slate-900 line-clamp-2 leading-5 group-hover:text-indigo-600 transition-colors min-h-[40px]">
          {title}
        </h3>

        <div className="text-[10.5px] text-slate-500 truncate font-medium">
          {teacher}
        </div>

        <div className="rounded-lg bg-slate-50 px-2 py-1.5 space-y-1.5 text-[10.5px] text-slate-600">
          <div className="flex items-center gap-1.5">
            <ClockCircleOutlined className="text-indigo-500" />
            <span className="truncate font-medium">{schedule}</span>
          </div>

          <div
            className={`flex items-center gap-1.5 font-semibold ${
              nearlyFull ? "text-rose-600" : "text-emerald-700"
            }`}
          >
            <TeamOutlined />
            <span>
              {nearlyFull && seatsLeft > 0 && "Sắp đầy • "}
              Còn {seatsLeft}/{capacity} chỗ
            </span>
          </div>
        </div>

        <div className="mt-auto pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
          <div>
            {/* <div className="text-[9px] text-slate-400">Học phí</div> */}

            {isFree ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[13.5px] font-extrabold text-emerald-600">
                  0đ
                </span>

                <span className="text-[8.5px] font-extrabold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                  MIỄN PHÍ
                </span>
              </div>
            ) : (
              <span className="text-[13.5px] font-extrabold text-indigo-600">
                {price.toLocaleString("vi-VN")}đ
              </span>
            )}
          </div>

          <Button
            size="small"
            className="text-[11px] font-semibold text-indigo-600 border-indigo-200 hover:bg-indigo-50 hover:border-indigo-500 rounded-md px-2.5 h-[27px]"
          >
            Xem lớp
          </Button>
        </div>
      </div>
    </div>
  );
}