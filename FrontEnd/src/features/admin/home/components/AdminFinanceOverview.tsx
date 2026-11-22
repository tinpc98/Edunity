import { useState } from "react";
import { Row, Col, Skeleton, Alert, Button, Modal, DatePicker, Empty } from "antd";
import {
  CalendarOutlined,
  LineChartOutlined,
  FilterOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import type { AdminDashboardFinance } from "../../../../types/adminDashboard";
import type { FinancePeriodType } from "../../../../types/payment";
import { financeService, financeKeys } from "../../../../services/finance.service";
import { formatVND } from "../../../../types/payment";
import AdminSectionCard from "../../../../components/admin/AdminSectionCard";

interface AdminFinanceOverviewProps {
  finance?: AdminDashboardFinance;
}

const PERIOD_OPTIONS: Array<{ key: FinancePeriodType; label: string }> = [
  { key: "yesterday", label: "Hôm qua" },
  { key: "3d", label: "3 ngày" },
  { key: "7d", label: "7 ngày" },
  { key: "30d", label: "1 tháng" },
  { key: "custom", label: "Tùy chọn" },
];

export default function AdminFinanceOverview({ finance: initialFinance }: AdminFinanceOverviewProps) {
  const [activePeriod, setActivePeriod] = useState<FinancePeriodType>("7d");
  const [customRange, setCustomRange] = useState<[string | null, string | null]>([null, null]);
  const [modalOpen, setModalOpen] = useState(false);
  const [tempDates, setTempDates] = useState<[Dayjs | null, Dayjs | null]>([null, null]);

  const queryParams = {
    period: activePeriod,
    from: activePeriod === "custom" ? customRange[0] || undefined : undefined,
    to: activePeriod === "custom" ? customRange[1] || undefined : undefined,
  };

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: financeKeys.overview(queryParams),
    queryFn: () => financeService.getFinanceOverview(queryParams),
    staleTime: 30000,
  });

  const handlePeriodClick = (key: FinancePeriodType) => {
    if (key === "custom") {
      setTempDates([
        customRange[0] ? dayjs(customRange[0]) : dayjs().subtract(7, "day"),
        customRange[1] ? dayjs(customRange[1]) : dayjs(),
      ]);
      setModalOpen(true);
    } else {
      setActivePeriod(key);
    }
  };

  const handleApplyCustom = () => {
    if (tempDates && tempDates[0] && tempDates[1]) {
      if (tempDates[0].isAfter(tempDates[1])) {
        Modal.error({
          title: "Khoảng ngày không hợp lệ",
          content: "Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.",
        });
        return;
      }
      const fromStr = tempDates[0].format("YYYY-MM-DD");
      const toStr = tempDates[1].format("YYYY-MM-DD");
      setCustomRange([fromStr, toStr]);
      setActivePeriod("custom");
    }
    setModalOpen(false);
  };

  // Extract metrics from live backend data or fallback to initial props
  const periodLabel = data?.period?.label || "7 ngày gần nhất";
  const revenueTimeSeries = data?.charts?.revenueTimeSeries || [];
  const maxRevenue = Math.max(
    ...revenueTimeSeries.map((pt) => pt.total),
    initialFinance?.monthly ? Math.max(...initialFinance.monthly.map((m) => m.revenue), 1000000) : 1000000
  );

  const tuitionInflowVal = data?.kpis?.tuitionRevenue?.value
    ? parseFloat(data.kpis.tuitionRevenue.value)
    : (data?.revenue?.confirmedTuitionRevenue ? parseFloat(data.revenue.confirmedTuitionRevenue) : (initialFinance?.revenueThisMonth ? initialFinance.revenueThisMonth * 0.8 : 0));

  const totalInflowVal = data?.kpis?.tuitionRevenue?.value && data?.kpis?.donationRevenue?.value
    ? parseFloat(data.kpis.tuitionRevenue.value) + parseFloat(data.kpis.donationRevenue.value)
    : (initialFinance?.revenueThisMonth || 0);

  const teacherPayoutsVal = data?.kpis?.teacherPaidOut?.value
    ? parseFloat(data.kpis.teacherPaidOut.value)
    : (initialFinance?.commission || 0);

  const completedRefundsVal = data?.revenue?.completedRefunds
    ? parseFloat(data.revenue.completedRefunds)
    : (data?.kpis?.refundLiability?.value ? parseFloat(data.kpis.refundLiability.value) : 0);

  return (
    <>
      <AdminSectionCard
        title="Tổng quan tài chính & Đối soát"
        subtitle="Dòng tiền, học phí, hoa hồng và chi trả theo thời gian thực"
        icon={<LineChartOutlined />}
        extra={
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-lg bg-[#CCFBF1] border border-[#99F6E4] font-bold text-[#0F766E] text-xs flex items-center gap-1.5">
              <CalendarOutlined className="text-[#0D9488]" />
              <span>{periodLabel}</span>
            </span>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-1.5 rounded-lg border border-[#D6E5E2] hover:bg-[#E5F5F1] text-[#0F766E] transition-colors cursor-pointer disabled:opacity-50"
              title="Làm mới số liệu"
            >
              <ReloadOutlined className={isFetching ? "animate-spin" : ""} />
            </button>
          </div>
        }
      >
        {/* Filter Bar with Period Pills */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-4 mb-4 border-b border-[#D6E5E2]/60">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-[#64748B] flex items-center gap-1.5 mr-1">
              <FilterOutlined className="text-[#0D9488]" />
              <span>Lọc theo:</span>
            </span>
            {PERIOD_OPTIONS.map((opt) => {
              const isActive = activePeriod === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => handlePeriodClick(opt.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
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

          <span className="text-[11px] font-semibold text-[#0F766E] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#0D9488] animate-pulse" />
            <span>Đồng bộ tự động từ sổ cái tài chính</span>
          </span>
        </div>

        {/* Content Body with Loading & Error States */}
        {isLoading ? (
          <div className="py-8 space-y-4">
            <Skeleton active paragraph={{ rows: 2 }} />
            <Skeleton.Node active style={{ width: "100%", height: 160, borderRadius: 16 }} />
          </div>
        ) : isError ? (
          <div className="py-4">
            <Alert
              type="error"
              showIcon
              message="Không thể tải dữ liệu tài chính theo bộ lọc"
              description={(error as Error)?.message || "Vui lòng kiểm tra lại kết nối mạng hoặc thử lại sau."}
              action={
                <Button size="small" danger onClick={() => refetch()}>
                  Thử lại
                </Button>
              }
            />
          </div>
        ) : (
          <>
            {/* 4 Summary KPI Cards */}
            <Row gutter={[12, 12]} className="mb-6">
              <Col xs={12} sm={6}>
                <div className="p-3.5 rounded-xl bg-[#F0F8F6] border border-[#D6E5E2] flex flex-col justify-center h-full">
                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                    Doanh thu kỳ này
                  </span>
                  <div className="font-extrabold text-[#163B40] text-sm sm:text-base mt-1 whitespace-nowrap">
                    {formatVND(totalInflowVal)}
                  </div>
                </div>
              </Col>
              <Col xs={12} sm={6}>
                <div className="p-3.5 rounded-xl bg-[#CCFBF1] border border-[#99F6E4] flex flex-col justify-center h-full">
                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#0F766E]">
                    Thu học phí xác nhận
                  </span>
                  <div className="font-extrabold text-[#0F766E] text-sm sm:text-base mt-1 whitespace-nowrap">
                    {formatVND(tuitionInflowVal)}
                  </div>
                </div>
              </Col>
              <Col xs={12} sm={6}>
                <div className="p-3.5 rounded-xl bg-[#DCFCE7] border border-[#BBF7D0] flex flex-col justify-center h-full">
                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#15803D]">
                    Chi trả giáo viên
                  </span>
                  <div className="font-extrabold text-[#15803D] text-sm sm:text-base mt-1 whitespace-nowrap">
                    {formatVND(teacherPayoutsVal)}
                  </div>
                </div>
              </Col>
              <Col xs={12} sm={6}>
                <div className="p-3.5 rounded-xl bg-[#FEE2E2] border border-[#FECACA] flex flex-col justify-center h-full">
                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#DC2626]">
                    Hoàn tiền đã xử lý
                  </span>
                  <div className="font-extrabold text-[#DC2626] text-sm sm:text-base mt-1 whitespace-nowrap">
                    {formatVND(completedRefundsVal)}
                  </div>
                </div>
              </Col>
            </Row>

            {/* Time-Series Chart */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-[#163B40]">
                  Biểu đồ dòng tiền thu theo thời gian ({periodLabel})
                </span>
                <span className="text-[10px] text-[#64748B] font-medium">
                  Đơn vị: VNĐ
                </span>
              </div>

              {revenueTimeSeries.length === 0 ? (
                <div className="w-full bg-[#F5FAF9] rounded-2xl p-8 border border-[#D6E5E2] flex items-center justify-center">
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="Không có dữ liệu giao dịch trong khoảng thời gian đã chọn"
                  />
                </div>
              ) : (
                <div className="w-full bg-[#F5FAF9] rounded-2xl p-4 border border-[#D6E5E2]">
                  <div className="h-44 w-full flex items-end justify-between gap-1.5 sm:gap-4 pt-4 px-1 sm:px-2">
                    {revenueTimeSeries.map((point, idx) => {
                      const heightPercent = `${Math.min(
                        Math.max((point.total / (maxRevenue || 1)) * 100, 6),
                        100
                      )}%`;
                      const revenueInK = point.total >= 1000000
                        ? `${(point.total / 1000000).toFixed(1)}M`
                        : point.total > 0
                        ? `${(point.total / 1000).toFixed(0)}k`
                        : "0";

                      const isLast = idx === revenueTimeSeries.length - 1;

                      return (
                        <div
                          key={point.key || idx}
                          className="flex-1 flex flex-col items-center gap-1.5 group h-full justify-end cursor-pointer"
                          title={`${point.label}: ${formatVND(point.total)} (Học phí: ${formatVND(point.tuition)}, Tài trợ: ${formatVND(point.donation)})`}
                        >
                          <span
                            className={`text-[9px] sm:text-[10px] font-bold transition-opacity whitespace-nowrap ${
                              isLast
                                ? "text-[#0F766E]"
                                : "text-[#64748B] opacity-0 group-hover:opacity-100"
                            }`}
                          >
                            {revenueInK}
                          </span>
                          <div
                            className={`w-full max-w-[36px] rounded-t-lg transition-all duration-300 ${
                              isLast
                                ? "bg-[#0D9488] shadow-md shadow-teal-700/30 relative"
                                : "bg-[#5EEAD4] hover:bg-[#14B8A6]"
                            }`}
                            style={{ height: heightPercent }}
                          >
                            {isLast && (
                              <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#0F766E] rounded-full border-2 border-white shadow-xs" />
                            )}
                          </div>
                          <span
                            className={`text-[9px] sm:text-[10px] truncate max-w-[48px] ${
                              isLast
                                ? "text-[#163B40] font-extrabold"
                                : "text-[#64748B] font-medium"
                            }`}
                          >
                            {point.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </AdminSectionCard>

      {/* Modal for Custom Date Range */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-sm font-bold text-[#163B40]">
            <CalendarOutlined className="text-[#0D9488]" />
            <span>Chọn khoảng ngày tùy chọn</span>
          </div>
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleApplyCustom}
        okText="Áp dụng bộ lọc"
        cancelText="Hủy bỏ"
        okButtonProps={{ className: "bg-[#0D9488] hover:bg-[#0B746C] font-semibold" }}
      >
        <div className="py-4 space-y-3">
          <p className="text-xs text-[#64748B]">
            Chọn ngày bắt đầu và kết thúc để xem báo cáo tài chính trong khung thời gian cụ thể (Múi giờ Việt Nam GMT+7).
          </p>
          <DatePicker.RangePicker
            className="w-full h-10 rounded-xl border-[#D6E5E2]"
            format="DD/MM/YYYY"
            value={tempDates}
            onChange={(dates) => {
              if (dates) {
                setTempDates([dates[0], dates[1]]);
              } else {
                setTempDates([null, null]);
              }
            }}
            disabledDate={(current) => current && current.isAfter(dayjs())}
          />
        </div>
      </Modal>
    </>
  );
}
