import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Row, Col, Spin, Alert } from "antd";
import { BankOutlined, AuditOutlined, ReloadOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { financeService, financeKeys } from "../../../services/finance.service";
import type { FinancePeriodType } from "../../../types/payment";
import { ROUTES } from "../../../routes/routePaths";
import AdminPageHeader from "../../../components/admin/AdminPageHeader";
import FinanceTimeFilterBar from "./components/FinanceTimeFilterBar";
import FinanceKpiGrid from "./components/FinanceKpiGrid";
import RevenueAreaChart from "./components/RevenueAreaChart";
import TransactionStatusChart from "./components/TransactionStatusChart";
import FundStructureDonutChart from "./components/FundStructureDonutChart";
import ReconciliationStatusChart from "./components/ReconciliationStatusChart";
import FinanceOperationsCard from "./components/FinanceOperationsCard";
import RecentTransactionsTable from "./components/RecentTransactionsTable";

export default function AdminFinanceOverviewPage() {
  const [activePeriod, setActivePeriod] = useState<FinancePeriodType>("7d");
  const [customRange, setCustomRange] = useState<[string | null, string | null]>([
    null,
    null,
  ]);

  const queryParams = {
    period: activePeriod,
    from: activePeriod === "custom" ? customRange[0] || undefined : undefined,
    to: activePeriod === "custom" ? customRange[1] || undefined : undefined,
  };

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: financeKeys.overview(queryParams),
    queryFn: () => financeService.getFinanceOverview(queryParams),
    refetchInterval: 30000,
  });

  const handleCustomRangeChange = (from: string | null, to: string | null) => {
    setCustomRange([from, to]);
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spin size="large" tip="Đang tải dữ liệu phân tích tài chính..." />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <Alert
          type="error"
          showIcon
          message="Không thể tải dữ liệu tài chính"
          description={
            (error as any)?.message ||
            "Đã xảy ra lỗi khi kết nối với máy chủ tài chính. Vui lòng thử lại."
          }
          action={
            <button
              onClick={() => refetch()}
              className="px-3 py-1 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 cursor-pointer"
            >
              Thử lại
            </button>
          }
        />
      </div>
    );
  }

  const kpis = data?.kpis;
  const charts = data?.charts;
  const recentTransactions = data?.recentTransactions;
  const operationsSummary = data?.operationsSummary;
  const reconciliations = data?.reconciliations;
  const periodInfo = data?.period;

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      {/* Top Header */}
      <AdminPageHeader
        eyebrow="Phân hệ Kế toán & Đối soát"
        eyebrowIcon={<BankOutlined />}
        title="Tổng quan Tài chính & Đối soát"
        description="Theo dõi dòng tiền học phí, quỹ học bổng, sổ cái thù lao và phân tích tài chính đa chiều theo thời gian thực."
        extra={
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[#D6E5E2] text-[#163B40] hover:text-[#0F766E] hover:bg-[#E5F5F1] text-xs font-bold shadow-2xs transition-all cursor-pointer"
            >
              <ReloadOutlined className={isFetching ? "animate-spin text-[#0D9488]" : "text-[#0D9488]"} />
              <span>Làm mới số liệu</span>
            </button>
            <Link
              to={ROUTES.ADMIN.RECONCILIATIONS}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs ${
                reconciliations && reconciliations.open > 0
                  ? "bg-rose-600 hover:bg-rose-700 text-white"
                  : "bg-teal-600 hover:bg-teal-700 text-white"
              }`}
            >
              <AuditOutlined />
              <span>Hàng đợi đối soát ({reconciliations?.open || 0})</span>
            </Link>
          </div>
        }
      />

      {/* Row 0: Time Range Filter Bar */}
      <FinanceTimeFilterBar
        activePeriod={activePeriod}
        onPeriodChange={setActivePeriod}
        customRange={customRange}
        onCustomRangeChange={handleCustomRangeChange}
        periodLabel={periodInfo?.label}
        isFetching={isFetching}
        onRefresh={() => refetch()}
      />

      {/* Row 1: 4 Core Financial KPI Cards */}
      <FinanceKpiGrid kpis={kpis} />

      {/* Row 2: Revenue Area Chart (Large) & Transaction Classification Chart */}
      <Row gutter={[20, 20]}>
        <Col xs={24} xl={14}>
          <RevenueAreaChart data={charts?.revenueTimeSeries} />
        </Col>
        <Col xs={24} xl={10}>
          <TransactionStatusChart
            distribution={charts?.transactionStatusDistribution}
          />
        </Col>
      </Row>

      {/* Row 3: Fund Structure Donut, Reconciliation Status & Operations Summary */}
      <Row gutter={[20, 20]}>
        <Col xs={24} lg={8}>
          <FundStructureDonutChart fundStructure={charts?.fundStructure} />
        </Col>
        <Col xs={24} lg={8}>
          <ReconciliationStatusChart
            distribution={charts?.reconciliationDistribution}
            totalOpen={reconciliations?.open || 0}
          />
        </Col>
        <Col xs={24} lg={8}>
          <FinanceOperationsCard
            operations={operationsSummary}
            teacherEarnings={data?.teacherEarnings}
          />
        </Col>
      </Row>

      {/* Row 4: Recent Transactions Table */}
      <RecentTransactionsTable transactions={recentTransactions} />
    </div>
  );
}
