import { useState, useId } from "react";
import { AreaChartOutlined } from "@ant-design/icons";
import type { RevenueTimeSeriesPoint } from "../../../../types/payment";
import { formatVND } from "../../../../types/payment";

interface RevenueAreaChartProps {
  data?: RevenueTimeSeriesPoint[];
}

type SeriesMode = "all" | "tuition" | "donation";

export default function RevenueAreaChart({ data = [] }: RevenueAreaChartProps) {
  const [mode, setMode] = useState<SeriesMode>("all");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const chartId = useId().replace(/:/g, "_");

  const points = data;
  const hasData = points.length > 0 && points.some((p) => p.total > 0);

  // SVG coordinate dimensions
  const width = 800;
  const height = 290;
  const paddingLeft = 70;
  const paddingRight = 25;
  const paddingTop = 25;
  const paddingBottom = 45;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Max value calculation
  const values = points.map((p) => {
    if (mode === "tuition") return p.tuition;
    if (mode === "donation") return p.donation;
    return p.total;
  });
  const maxVal = Math.max(...values, 10000);

  // Helper coordinate mapper
  const getX = (index: number) => {
    if (points.length <= 1) return paddingLeft + chartWidth / 2;
    return paddingLeft + (index / (points.length - 1)) * chartWidth;
  };

  const getY = (val: number) => {
    return paddingTop + chartHeight - (val / maxVal) * chartHeight;
  };

  // Build SVG smooth path
  const buildPath = (getVal: (p: RevenueTimeSeriesPoint) => number) => {
    if (points.length === 0) return { line: "", area: "" };

    const coords = points.map((p, idx) => ({
      x: getX(idx),
      y: getY(getVal(p)),
    }));

    let linePath = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const cur = coords[i];
      const cx1 = prev.x + (cur.x - prev.x) / 3;
      const cy1 = prev.y;
      const cx2 = prev.x + ((cur.x - prev.x) * 2) / 3;
      const cy2 = cur.y;
      linePath += ` C ${cx1} ${cy1}, ${cx2} ${cy2}, ${cur.x} ${cur.y}`;
    }

    const first = coords[0];
    const last = coords[coords.length - 1];
    const areaPath = `${linePath} L ${last.x} ${paddingTop + chartHeight} L ${first.x} ${paddingTop + chartHeight} Z`;

    return { line: linePath, area: areaPath };
  };

  const tuitionPaths = buildPath((p) => p.tuition);
  const donationPaths = buildPath((p) => p.donation);
  const totalPaths = buildPath((p) => p.total);

  // Y-axis grid ticks (4 intervals)
  const yTicks = [0, maxVal * 0.33, maxVal * 0.66, maxVal];

  // Tooltip position calculation with safe clamping
  const activePoint = hoveredIndex !== null ? points[hoveredIndex] : null;
  const rawX = hoveredIndex !== null ? getX(hoveredIndex) : 0;
  const rawY = activePoint
    ? getY(mode === "tuition" ? activePoint.tuition : mode === "donation" ? activePoint.donation : activePoint.total)
    : 0;

  const leftPercent = Math.min(Math.max((rawX / width) * 100, 16), 84);
  const isHighPoint = rawY < 90;

  return (
    <div className="bg-white rounded-2xl border border-[#D6E5E2] p-5 shadow-2xs flex flex-col justify-between h-full">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-[#CCFBF1] flex items-center justify-center text-[#0D9488] text-base">
              <AreaChartOutlined />
            </span>
            <span className="font-extrabold text-[#163B40] text-sm sm:text-base">
              Doanh thu theo thời gian
            </span>
          </div>
          <span className="text-xs text-[#64748B] block mt-0.5">
            Biến động dòng tiền thực tế ghi nhận theo chu kỳ lọc
          </span>
        </div>

        {/* Series Selector Buttons */}
        <div className="flex items-center gap-1 bg-[#F0F8F6] p-1 rounded-xl border border-[#D6E5E2] self-stretch sm:self-auto">
          <button
            type="button"
            onClick={() => setMode("all")}
            className={`flex-1 sm:flex-none px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              mode === "all"
                ? "bg-[#0D9488] text-white shadow-2xs"
                : "text-[#64748B] hover:text-[#163B40]"
            }`}
          >
            Tất cả nguồn
          </button>
          <button
            type="button"
            onClick={() => setMode("tuition")}
            className={`flex-1 sm:flex-none px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              mode === "tuition"
                ? "bg-[#0F766E] text-white shadow-2xs"
                : "text-[#64748B] hover:text-[#163B40]"
            }`}
          >
            Học phí
          </button>
          <button
            type="button"
            onClick={() => setMode("donation")}
            className={`flex-1 sm:flex-none px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              mode === "donation"
                ? "bg-[#14B8A6] text-white shadow-2xs"
                : "text-[#64748B] hover:text-[#163B40]"
            }`}
          >
            Tài trợ
          </button>
        </div>
      </div>

      {/* SVG Chart Canvas */}
      {!hasData ? (
        <div className="h-64 flex flex-col items-center justify-center rounded-2xl bg-[#F8FAFC] border border-dashed border-[#D6E5E2] text-center p-6 my-2">
          <div className="w-12 h-12 rounded-2xl bg-[#CCFBF1] flex items-center justify-center text-[#0D9488] text-2xl mb-3 shadow-2xs">
            <AreaChartOutlined />
          </div>
          <span className="font-extrabold text-sm text-[#163B40]">
            Chưa có dữ liệu trong khoảng thời gian đã chọn
          </span>
          <span className="text-xs text-[#64748B] mt-1 max-w-sm">
            Chưa ghi nhận dòng tiền phát sinh trong kỳ này. Thử chọn 30 ngày để xem biểu đồ biến động doanh thu.
          </span>
        </div>
      ) : (
        <div className="relative w-full">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto max-h-[300px] select-none"
          >
            <defs>
              <linearGradient id={`grad_tuition_${chartId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0D9488" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#0D9488" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id={`grad_donation_${chartId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#14B8A6" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#14B8A6" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id={`grad_total_${chartId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0F766E" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#0F766E" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Gridlines & Y-ticks */}
            {yTicks.map((tickVal, i) => {
              const y = getY(tickVal);
              return (
                <g key={i}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={width - paddingRight}
                    y2={y}
                    stroke="#E2E8F0"
                    strokeDasharray={i === 0 ? "none" : "3 3"}
                    strokeWidth="1"
                  />
                  <text
                    x={paddingLeft - 10}
                    y={y + 4}
                    textAnchor="end"
                    fontSize="11"
                    fill="#94A3B8"
                    fontWeight="600"
                    fontFamily="monospace"
                  >
                    {tickVal >= 1000000
                      ? `${(tickVal / 1000000).toFixed(1)}M`
                      : tickVal >= 1000
                      ? `${Math.round(tickVal / 1000)}K`
                      : tickVal}
                  </text>
                </g>
              );
            })}

            {/* Areas & Lines according to selected mode */}
            {mode === "all" && (
              <>
                <path d={totalPaths.area} fill={`url(#grad_total_${chartId})`} />
                <path d={totalPaths.line} fill="none" stroke="#0F766E" strokeWidth="2.5" />
              </>
            )}

            {(mode === "tuition" || mode === "all") && mode !== "all" && (
              <>
                <path d={tuitionPaths.area} fill={`url(#grad_tuition_${chartId})`} />
                <path d={tuitionPaths.line} fill="none" stroke="#0D9488" strokeWidth="2.5" />
              </>
            )}

            {(mode === "donation" || mode === "all") && mode !== "all" && (
              <>
                <path d={donationPaths.area} fill={`url(#grad_donation_${chartId})`} />
                <path d={donationPaths.line} fill="none" stroke="#14B8A6" strokeWidth="2.5" />
              </>
            )}

            {/* Interactive Points & X-ticks */}
            {points.map((p, idx) => {
              const x = getX(idx);
              const val =
                mode === "tuition" ? p.tuition : mode === "donation" ? p.donation : p.total;
              const y = getY(val);
              const isHovered = hoveredIndex === idx;

              // Display every nth label if many points
              const showLabel =
                points.length <= 10 ||
                idx % Math.ceil(points.length / 8) === 0 ||
                idx === points.length - 1;

              return (
                <g key={idx}>
                  {/* Vertical guide line on hover */}
                  {isHovered && (
                    <line
                      x1={x}
                      y1={paddingTop}
                      x2={x}
                      y2={paddingTop + chartHeight}
                      stroke="#0D9488"
                      strokeWidth="1.5"
                      strokeDasharray="2 2"
                    />
                  )}

                  {/* Dot */}
                  <circle
                    cx={x}
                    cy={y}
                    r={isHovered ? 5.5 : val > 0 ? 3.5 : 2}
                    fill={isHovered ? "#0D9488" : "#FFFFFF"}
                    stroke="#0D9488"
                    strokeWidth="2"
                    className="transition-all cursor-pointer"
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  />

                  {/* Invisible hit target for hover */}
                  <rect
                    x={x - 18}
                    y={paddingTop}
                    width={36}
                    height={chartHeight}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  />

                  {/* X-axis label */}
                  {showLabel && (
                    <text
                      x={x}
                      y={height - 14}
                      textAnchor="middle"
                      fontSize="11"
                      fill={isHovered ? "#0D9488" : "#64748B"}
                      fontWeight={isHovered ? "bold" : "500"}
                    >
                      {p.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Hover Tooltip Overlay with safe edge clamping */}
          {hoveredIndex !== null && points[hoveredIndex] && (
            <div
              className={`absolute z-30 pointer-events-none bg-[#163B40] text-white p-3 rounded-2xl shadow-xl border border-teal-700/60 text-xs flex flex-col gap-1.5 min-w-[150px] transition-transform duration-150 ${
                isHighPoint
                  ? "transform -translate-x-1/2 translate-y-3"
                  : "transform -translate-x-1/2 -translate-y-full -translate-y-3"
              }`}
              style={{
                left: `${leftPercent}%`,
                top: `${(rawY / height) * 100}%`,
              }}
            >
              <span className="font-bold text-[#99F6E4] border-b border-teal-700/60 pb-1 flex items-center justify-between">
                <span>{points[hoveredIndex].label}</span>
                <span className="text-[10px] text-teal-300 font-normal">Chi tiết</span>
              </span>
              <div className="flex justify-between items-center gap-2 text-[11px]">
                <span className="text-teal-200">Học phí:</span>
                <span className="font-mono font-bold">
                  {formatVND(points[hoveredIndex].tuition)}
                </span>
              </div>
              <div className="flex justify-between items-center gap-2 text-[11px]">
                <span className="text-emerald-200">Tài trợ:</span>
                <span className="font-mono font-bold">
                  {formatVND(points[hoveredIndex].donation)}
                </span>
              </div>
              <div className="flex justify-between items-center gap-2 pt-1 border-t border-teal-700/60 font-bold text-white">
                <span>Tổng cộng:</span>
                <span className="font-mono text-[#99F6E4] font-bold">
                  {formatVND(points[hoveredIndex].total)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Legend Footer */}
      <div className="flex items-center justify-center gap-6 mt-3 pt-3 border-t border-[#F0F8F6] text-xs">
        <span className="flex items-center gap-1.5 text-[#163B40] font-semibold">
          <span className="w-3 h-3 rounded-md bg-[#0D9488]" />
          <span>Học phí khóa học</span>
        </span>
        <span className="flex items-center gap-1.5 text-[#163B40] font-semibold">
          <span className="w-3 h-3 rounded-md bg-[#14B8A6]" />
          <span>Quỹ tài trợ học bổng</span>
        </span>
      </div>
    </div>
  );
}
