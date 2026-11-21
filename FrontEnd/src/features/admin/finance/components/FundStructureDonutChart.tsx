import { PieChartOutlined } from "@ant-design/icons";
import type { FundStructureDonut } from "../../../../types/payment";
import { formatVND } from "../../../../types/payment";

interface FundStructureDonutChartProps {
  fundStructure?: FundStructureDonut;
}

export default function FundStructureDonutChart({
  fundStructure,
}: FundStructureDonutChartProps) {
  const tuition = fundStructure?.tuition || 0;
  const donation = fundStructure?.donation || 0;
  const other = fundStructure?.other || 0;
  const total = fundStructure?.total || 0;

  const tuitionPct = fundStructure?.tuitionPercent || 0;
  const donationPct = fundStructure?.donationPercent || 0;
  const otherPct = fundStructure?.otherPercent || 0;

  const hasData = total > 0;

  // SVG Donut calculation
  const size = 180;
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const tuitionOffset = 0;
  const tuitionStroke = (tuitionPct / 100) * circumference;

  const donationOffset = circumference - tuitionStroke;
  const donationStroke = (donationPct / 100) * circumference;

  const otherOffset = circumference - tuitionStroke - donationStroke;
  const otherStroke = (otherPct / 100) * circumference;

  return (
    <div className="bg-white rounded-2xl border border-[#D6E5E2] p-4 sm:p-5 shadow-2xs flex flex-col justify-between h-full">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-8 h-8 rounded-xl bg-[#CCFBF1] flex items-center justify-center text-[#0D9488]">
            <PieChartOutlined />
          </span>
          <span className="font-extrabold text-[#163B40] text-sm sm:text-base">
            Cơ cấu nguồn tiền
          </span>
        </div>
        <span className="text-xs text-[#64748B] block">
          Tỷ trọng dòng tiền thực tế ghi nhận trong kỳ
        </span>
      </div>

      {/* Donut Body */}
      {!hasData ? (
        <div className="h-52 flex flex-col items-center justify-center rounded-xl bg-[#F5FAF9] border border-dashed border-[#D6E5E2] text-[#64748B] text-xs my-4">
          <PieChartOutlined className="text-3xl text-[#99F6E4] mb-2" />
          <span className="font-semibold">Chưa có dòng tiền ghi nhận trong kỳ</span>
        </div>
      ) : (
        <div className="relative flex items-center justify-center my-4">
          <svg width={size} height={size} className="transform -rotate-90">
            {/* Background Circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="transparent"
              stroke="#F1F5F9"
              strokeWidth={strokeWidth}
            />

            {/* Tuition Segment */}
            {tuitionPct > 0 && (
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                stroke="#0D9488"
                strokeWidth={strokeWidth}
                strokeDasharray={`${tuitionStroke} ${circumference}`}
                strokeDashoffset={tuitionOffset}
                className="transition-all duration-500"
              />
            )}

            {/* Donation Segment */}
            {donationPct > 0 && (
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                stroke="#14B8A6"
                strokeWidth={strokeWidth}
                strokeDasharray={`${donationStroke} ${circumference}`}
                strokeDashoffset={donationOffset}
                className="transition-all duration-500"
              />
            )}

            {/* Other / Unapplied Segment */}
            {otherPct > 0 && (
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                stroke="#F59E0B"
                strokeWidth={strokeWidth}
                strokeDasharray={`${otherStroke} ${circumference}`}
                strokeDashoffset={otherOffset}
                className="transition-all duration-500"
              />
            )}
          </svg>

          {/* Center Summary Label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
              Dòng tiền vào
            </span>
            <span className="text-sm font-extrabold text-[#163B40] font-mono mt-0.5 truncate max-w-[110px]">
              {formatVND(total)}
            </span>
          </div>
        </div>
      )}

      {/* Legend & Breakdown */}
      <div className="space-y-2 pt-3 border-t border-[#F0F8F6] text-xs">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-semibold text-[#163B40]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0D9488]" />
            <span>Học phí khóa học</span>
          </span>
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#0D9488] font-mono">{tuitionPct}%</span>
            <span className="text-[#64748B] font-mono text-[11px]">
              ({formatVND(tuition)})
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-semibold text-[#163B40]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#14B8A6]" />
            <span>Quỹ tài trợ học bổng</span>
          </span>
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#14B8A6] font-mono">{donationPct}%</span>
            <span className="text-[#64748B] font-mono text-[11px]">
              ({formatVND(donation)})
            </span>
          </div>
        </div>

        {otherPct > 0 && (
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-semibold text-[#163B40]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
              <span>Khoản thu tạm giữ</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#F59E0B] font-mono">{otherPct}%</span>
              <span className="text-[#64748B] font-mono text-[11px]">
                ({formatVND(other)})
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
