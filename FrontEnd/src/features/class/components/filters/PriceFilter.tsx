import { Slider } from "antd";

interface PriceFilterProps {
  minLimit?: number;
  maxLimit?: number;
  minPrice?: number;
  maxPrice?: number;
  onChange: (range: [number, number]) => void;
}

export default function PriceFilter({
  minLimit = 0,
  maxLimit = 2000000,
  minPrice,
  maxPrice,
  onChange,
}: PriceFilterProps) {
  const currentMin = minPrice !== undefined ? minPrice : minLimit;
  const currentMax = maxPrice !== undefined ? maxPrice : maxLimit;

  const formatPriceShort = (val: number) => {
    if (val === 0) return "0đ";
    if (val >= 1000000) {
      return `${(val / 1000000).toFixed(1).replace(".0", "")}tr`;
    }
    return `${(val / 1000).toFixed(0)}k`;
  };

  return (
    <div className="flex flex-col gap-3 px-1 pt-1">
      <Slider
        range
        min={minLimit}
        max={maxLimit}
        step={50000}
        value={[currentMin, currentMax]}
        onChange={(val) => {
          if (Array.isArray(val) && val.length === 2) {
            onChange([val[0], val[1]]);
          }
        }}
        tooltip={{
          formatter: (value) => (value !== undefined ? `${value.toLocaleString("vi-VN")}đ` : ""),
        }}
      />

      <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
        <div>
          <span className="text-[10px] text-slate-400 block">Từ</span>
          <span className="font-bold text-slate-800">{formatPriceShort(currentMin)}</span>
        </div>
        <span className="text-slate-300">—</span>
        <div className="text-right">
          <span className="text-[10px] text-slate-400 block">Đến</span>
          <span className="font-bold text-indigo-700">{formatPriceShort(currentMax)}</span>
        </div>
      </div>
    </div>
  );
}
