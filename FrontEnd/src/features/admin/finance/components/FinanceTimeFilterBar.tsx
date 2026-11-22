import { useState } from "react";
import { Modal, DatePicker } from "antd";
import {
  CalendarOutlined,
  ReloadOutlined,
  FilterOutlined,
  ClockCircleOutlined,
  CheckOutlined,
} from "@ant-design/icons";
import type { FinancePeriodType } from "../../../../types/payment";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";

interface FinanceTimeFilterBarProps {
  activePeriod: FinancePeriodType;
  onPeriodChange: (period: FinancePeriodType) => void;
  customRange: [string | null, string | null];
  onCustomRangeChange: (from: string | null, to: string | null) => void;
  periodLabel?: string;
  isFetching?: boolean;
  onRefresh: () => void;
}

const PERIOD_OPTIONS: Array<{ key: FinancePeriodType; label: string }> = [
  { key: "today", label: "Hôm nay" },
  { key: "yesterday", label: "Hôm qua" },
  { key: "3d", label: "3 ngày" },
  { key: "7d", label: "7 ngày" },
  { key: "30d", label: "30 ngày" },
  { key: "custom", label: "Tùy chọn" },
];

export default function FinanceTimeFilterBar({
  activePeriod,
  onPeriodChange,
  customRange,
  onCustomRangeChange,
  periodLabel,
  isFetching,
  onRefresh,
}: FinanceTimeFilterBarProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [tempDates, setTempDates] = useState<[Dayjs | null, Dayjs | null]>([
    customRange[0] ? dayjs(customRange[0]) : null,
    customRange[1] ? dayjs(customRange[1]) : null,
  ]);

  const handlePeriodClick = (key: FinancePeriodType) => {
    if (key === "custom") {
      setTempDates([
        customRange[0] ? dayjs(customRange[0]) : dayjs().subtract(6, "day"),
        customRange[1] ? dayjs(customRange[1]) : dayjs(),
      ]);
      setModalOpen(true);
    } else {
      onPeriodChange(key);
    }
  };

  const handleApplyCustom = () => {
    if (tempDates && tempDates[0] && tempDates[1]) {
      const fromStr = tempDates[0].format("YYYY-MM-DD");
      const toStr = tempDates[1].format("YYYY-MM-DD");
      onCustomRangeChange(fromStr, toStr);
      onPeriodChange("custom");
    }
    setModalOpen(false);
  };

  return (
    <>
      <div className="w-full bg-white rounded-2xl border border-[#D6E5E2] p-3.5 sm:p-4 shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3 transition-all">
        {/* Left: Quick Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-[#64748B] flex items-center gap-1.5 mr-1">
            <FilterOutlined className="text-[#0D9488]" />
            <span>Kỳ báo cáo:</span>
          </span>
          {PERIOD_OPTIONS.map((opt) => {
            const isActive = activePeriod === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => handlePeriodClick(opt.key)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? "bg-[#0D9488] text-white shadow-2xs border border-[#0D9488]"
                    : "bg-[#F0F8F6] text-[#163B40] border border-[#D6E5E2] hover:bg-[#E5F5F1] hover:border-[#99F6E4]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Right: Active Period Badge & Refresh Button */}
        <div className="flex items-center justify-between w-full md:w-auto gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-[#F0F8F6]">
          {periodLabel && (
            <span className="text-xs font-bold text-[#0F766E] bg-[#CCFBF1] px-3 py-1 rounded-xl border border-[#99F6E4] flex items-center gap-1.5 shadow-2xs">
              <CalendarOutlined className="text-[#0D9488]" />
              <span>{periodLabel}</span>
            </span>
          )}

          <button
            type="button"
            onClick={onRefresh}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#D6E5E2] text-[#163B40] hover:text-[#0F766E] hover:bg-[#E5F5F1] text-xs font-bold shadow-2xs transition-all cursor-pointer"
            title="Làm mới dữ liệu"
          >
            <ReloadOutlined className={isFetching ? "animate-spin text-[#0D9488]" : "text-[#0D9488]"} />
            <span className="hidden sm:inline">Làm mới</span>
          </button>

          <span className="text-[11px] text-[#64748B] hidden lg:inline-flex items-center gap-1 font-medium">
            <ClockCircleOutlined className="text-[10px]" />
            <span>Giờ VN (UTC+7)</span>
          </span>
        </div>
      </div>

      {/* Modal Chọn Khoảng Ngày Tùy Chọn */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-sm font-extrabold text-[#163B40]">
            <CalendarOutlined className="text-[#0D9488]" />
            <span>Tùy chọn khoảng ngày báo cáo</span>
          </div>
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={420}
        centered
        className="rounded-2xl overflow-hidden"
      >
        <div className="py-4 space-y-4">
          <p className="text-xs text-[#64748B] leading-relaxed">
            Chọn ngày bắt đầu và ngày kết thúc để lọc toàn bộ số liệu, biểu đồ và giao dịch theo khung thời gian mong muốn.
          </p>

          <div className="w-full">
            <DatePicker.RangePicker
              value={tempDates}
              onChange={(dates) => setTempDates(dates as [Dayjs | null, Dayjs | null])}
              format="DD/MM/YYYY"
              placeholder={["Từ ngày", "Đến ngày"]}
              className="w-full rounded-xl border-[#D6E5E2] py-2 text-xs"
              allowClear={false}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F1F5F9]">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-[#D6E5E2] text-xs font-semibold text-[#64748B] hover:bg-[#F8FAFC] cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleApplyCustom}
              disabled={!tempDates || !tempDates[0] || !tempDates[1]}
              className="px-4 py-2 rounded-xl bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckOutlined />
              <span>Áp dụng</span>
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
