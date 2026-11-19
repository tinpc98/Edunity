import { useQuery } from "@tanstack/react-query";
import {
  Row,
  Col,
  Alert,
  Spin,
} from "antd";
import {
  DollarCircleOutlined,
  HeartOutlined,
  WarningOutlined,
  SyncOutlined,
  ClockCircleOutlined,
  ArrowRightOutlined,
  ReloadOutlined,
  LockOutlined,
  AuditOutlined,
  BankOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import { financeService, financeKeys } from "../../../services/finance.service";
import { formatVND } from "../../../types/payment";
import { ROUTES } from "../../../routes/routePaths";
import AdminPageHeader from "../../../components/admin/AdminPageHeader";
import AdminKpiCard from "../../../components/admin/AdminKpiCard";
import AdminSectionCard from "../../../components/admin/AdminSectionCard";
import AdminStatusBadge from "../../../components/admin/AdminStatusBadge";

export default function AdminFinanceOverviewPage() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: financeKeys.overview(),
    queryFn: () => financeService.getFinanceOverview(),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spin size="large" tip="Đang tải dữ liệu tài chính tổng quan..." />
      </div>
    );
  }

  const revenue = data?.revenue;
  const teacherEarnings = data?.teacherEarnings;
  const reconciliations = data?.reconciliations;
  const outboxWorker = data?.outboxWorker;

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      {/* Top Header */}
      <AdminPageHeader
        eyebrow="Phân hệ Kế toán & Đối soát"
        eyebrowIcon={<BankOutlined />}
        title="Tổng quan Tài chính & Đối soát"
        description="Theo dõi sổ cái tài chính, nguồn thu học phí, quỹ học bổng và worker phục hồi giao dịch theo thời gian thực."
        extra={
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[#D6E5E2] text-[#163B40] hover:text-[#0F766E] hover:bg-[#E5F5F1] text-xs font-bold shadow-2xs transition-all cursor-pointer"
            >
              <ReloadOutlined className={isFetching ? "animate-spin" : ""} />
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

      {/* Safety Policy Alert Banner */}
      <Alert
        message={<span className="font-bold text-teal-900 text-xs sm:text-sm">Nguyên tắc an toàn sổ cái tài chính (FIN-16, BR-34)</span>}
        description={
          <div className="space-y-1.5 text-xs text-slate-600 mt-1">
            <div>
              <strong className="text-teal-800">RECEIPT ≠ REVENUE:</strong> Khoản thu học phí tạm giữ do đến muộn (UNAPPLIED_TUITION_RECEIPT) là nợ phải trả, không được tính vào doanh thu khả dụng.
            </div>
            <div>
              <strong className="text-teal-800">TÁCH BIỆT NGUỒN TIỀN:</strong> Quỹ tài trợ học bổng (DONATION) tách biệt tuyệt đối với tiền học phí (TUITION).
            </div>
            <div>
              <strong className="text-teal-800">THÙ LAO GIẢNG VIÊN:</strong> Thu nhập PENDING chỉ được giải ngân sau khi lớp học kết thúc (COMPLETED). Thao tác hoàn tiền thật được bảo lưu theo quy chuẩn an toàn.
            </div>
          </div>
        }
        type="info"
        showIcon
        className="rounded-2xl border-teal-200 bg-teal-50/60 shadow-2xs"
      />

      {/* Row 1: 4 Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <AdminKpiCard
          title="Doanh thu Học phí"
          value={formatVND(revenue?.confirmedTuitionRevenue || "0")}
          icon={<DollarCircleOutlined />}
          trend="Đã xác thực"
          trendDirection="up"
          trendSubtext="ENROLLMENT_PAYMENT"
          variant="teal"
        />
        <AdminKpiCard
          title="Quỹ Tài trợ Học bổng"
          value={formatVND(revenue?.confirmedDonationRevenue || "0")}
          icon={<HeartOutlined />}
          trend="Tách biệt nguồn thu"
          trendDirection="up"
          trendSubtext="DONATION Quỹ MTQ"
          variant="mint"
        />
        <AdminKpiCard
          title="Khoản thu tạm giữ (Nợ phải trả)"
          value={formatVND(revenue?.unappliedLateReceipts || "0")}
          icon={<WarningOutlined />}
          trend="Nợ phải trả"
          trendDirection="neutral"
          trendSubtext="Đến muộn / Chờ đối soát"
          variant="amber"
        />
        <AdminKpiCard
          title="Nghĩa vụ Hoàn tiền (Pending)"
          value={formatVND(revenue?.pendingRefundLiability || "0")}
          icon={<ClockCircleOutlined />}
          trend={`Đã hoàn tất: ${formatVND(revenue?.completedRefunds || "0")}`}
          trendDirection="down"
          variant="rose"
        />
      </div>

      {/* Row 2: Deep Dive Cards (3-column layout) */}
      <Row gutter={[20, 20]}>
        {/* Card: Teacher Earnings Ledger */}
        <Col xs={24} lg={8}>
          <AdminSectionCard
            title="Sổ cái Thù lao Giảng viên"
            icon={<LockOutlined />}
            extra={
              <Link
                to={ROUTES.ADMIN.PAYOUTS}
                className="text-xs font-bold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1"
              >
                <span>Xem yêu cầu rút</span>
                <ArrowRightOutlined className="text-[10px]" />
              </Link>
            }
            className="h-full"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#D6E5E2] pb-2.5">
                <span className="text-xs text-[#64748B] font-semibold">Tạm giữ (PENDING):</span>
                <span className="text-sm font-extrabold text-[#B45309] font-mono">
                  {formatVND(teacherEarnings?.pending || "0")}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-[#D6E5E2] pb-2.5">
                <span className="text-xs text-[#64748B] font-semibold">Khả dụng rút (AVAILABLE):</span>
                <span className="text-sm font-extrabold text-[#15803D] font-mono">
                  {formatVND(teacherEarnings?.available || "0")}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-[#D6E5E2] pb-2.5">
                <span className="text-xs text-[#64748B] font-semibold">Đã giải ngân (PAID_OUT):</span>
                <span className="text-sm font-extrabold text-[#163B40] font-mono">
                  {formatVND(teacherEarnings?.paidOut || "0")}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#F0F8F6] border border-[#D6E5E2] text-xs text-[#64748B] italic leading-relaxed">
                {teacherEarnings?.note || "Thù lao giảng viên chỉ chuyển sang AVAILABLE khi lớp học hoàn thành."}
              </div>
            </div>
          </AdminSectionCard>
        </Col>

        {/* Card: Financial Outbox Worker */}
        <Col xs={24} lg={8}>
          <AdminSectionCard
            title="Financial Outbox Worker"
            icon={<SyncOutlined spin={Boolean(outboxWorker?.isRunning)} />}
            badge={
              <AdminStatusBadge
                label={outboxWorker?.isRunning ? "ĐANG CHẠY" : "DỪNG / IDLE"}
                type={outboxWorker?.isRunning ? "success" : "neutral"}
                pulse={Boolean(outboxWorker?.isRunning)}
              />
            }
            extra={
              <Link
                to={ROUTES.ADMIN.BANK_EVENTS}
                className="text-xs font-bold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1"
              >
                <span>Webhooks</span>
                <ArrowRightOutlined className="text-[10px]" />
              </Link>
            }
            className="h-full"
          >
            <div className="space-y-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Chu kỳ quét:</span>
                <span className="font-bold text-slate-800">
                  {Math.round((outboxWorker?.intervalMs || 30000) / 1000)} giây
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Batch size:</span>
                <span className="font-bold text-slate-800">
                  {outboxWorker?.batchSize || 25} sự kiện/tick
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Tổng sự kiện đã hạch toán:</span>
                <span className="font-bold text-teal-800 font-mono">
                  {outboxWorker?.totalDispatched || 0}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Backlog đang chờ:</span>
                <AdminStatusBadge
                  label={`${outboxWorker?.backlogCount || 0} sự kiện`}
                  type={outboxWorker?.backlogCount ? "warning" : "success"}
                />
              </div>
              <div className="flex items-center justify-between border-t border-[#D6E5E2] pt-2.5 text-xs">
                <span className="text-slate-500">Vượt ngưỡng retry (Exhausted &ge; 5):</span>
                <AdminStatusBadge
                  label={`${outboxWorker?.exhaustedCount || 0} sự kiện`}
                  type={outboxWorker?.exhaustedCount ? "error" : "neutral"}
                />
              </div>
            </div>
          </AdminSectionCard>
        </Col>

        {/* Card: Reconciliations Summary */}
        <Col xs={24} lg={8}>
          <AdminSectionCard
            title={`Hàng đợi Đối soát (${reconciliations?.total || 0})`}
            icon={<AuditOutlined />}
            extra={
              <Link
                to={ROUTES.ADMIN.RECONCILIATIONS}
                className="text-xs font-bold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1"
              >
                <span>Mở hàng đợi</span>
                <ArrowRightOutlined className="text-[10px]" />
              </Link>
            }
            className="h-full"
          >
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Cần kiểm tra (NEEDS_REVIEW):</span>
                <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                  {reconciliations?.byStatus?.needsReview || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Đang xử lý (IN_REVIEW):</span>
                <span className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-bold">
                  {reconciliations?.byStatus?.inReview || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Đã chấp thuận (RESOLVED_APPROVED):</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                  {reconciliations?.byStatus?.resolvedApproved || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Đã hoàn tiền (RESOLVED_REFUNDED):</span>
                <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 font-bold">
                  {reconciliations?.byStatus?.resolvedRefunded || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Đã bỏ qua (RESOLVED_IGNORED):</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-semibold">
                  {reconciliations?.byStatus?.resolvedIgnored || 0}
                </span>
              </div>
            </div>
          </AdminSectionCard>
        </Col>
      </Row>

      {/* Row 3: Navigation Shortcuts */}
      <AdminSectionCard title="Lối tắt Quản trị Tài chính & Đối soát" icon={<BankOutlined />}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Link to={ROUTES.ADMIN.TRANSACTIONS} className="block group h-full">
              <div className="rounded-xl border border-[#D6E5E2] p-4.5 bg-[#F0F8F6] hover:bg-[#E5F5F1] hover:border-[#99F6E4] transition-all h-full">
                <div className="font-bold text-[#163B40] group-hover:text-[#0F766E] text-sm">
                  Sổ cái Giao dịch (Ledger)
                </div>
                <div className="text-xs text-[#64748B] mt-1 leading-relaxed font-medium">
                  Tra cứu giao dịch, lọc theo loại, ngày tháng và kiểm tra tính toàn vẹn dòng tiền
                </div>
              </div>
            </Link>
          </Col>
          <Col xs={24} sm={8}>
            <Link to={ROUTES.ADMIN.RECONCILIATIONS} className="block group h-full">
              <div className="rounded-xl border border-[#D6E5E2] p-4.5 bg-[#F0F8F6] hover:bg-[#FEF3C7] hover:border-[#FDE68A] transition-all h-full">
                <div className="font-bold text-[#163B40] group-hover:text-[#B45309] text-sm">
                  Hàng đợi Đối soát & Bất thường
                </div>
                <div className="text-xs text-[#64748B] mt-1 leading-relaxed font-medium">
                  Tiếp nhận sự vụ, phân công Admin và thêm ghi chú giải quyết bất thường
                </div>
              </div>
            </Link>
          </Col>
          <Col xs={24} sm={8}>
            <Link to={ROUTES.ADMIN.BANK_EVENTS} className="block group h-full">
              <div className="rounded-xl border border-[#D6E5E2] p-4.5 bg-[#F0F8F6] hover:bg-[#E5F5F1] hover:border-[#99F6E4] transition-all h-full">
                <div className="font-bold text-[#163B40] group-hover:text-[#0F766E] text-sm">
                  Cổng thanh toán & Webhook Outbox
                </div>
                <div className="text-xs text-[#64748B] mt-1 leading-relaxed font-medium">
                  Giám sát Webhook payOS 2 kênh và quá trình phục hồi outbox tự động
                </div>
              </div>
            </Link>
          </Col>
        </Row>
      </AdminSectionCard>
    </div>
  );
}
