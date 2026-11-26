import CampaignStoriesSection from "./CampaignStoriesSection";
import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Empty,
  Modal,
  Select,
  Table,
  Tag,
  Pagination,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  DollarOutlined,
  FundProjectionScreenOutlined,
  HeartOutlined,
  ReloadOutlined,
  QrcodeOutlined,
  EyeInvisibleOutlined,
  GlobalOutlined,
  FileTextOutlined,
  PrinterOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useAuthStore } from "../../../stores/auth.store";
import {
  sponsorContributionKeys,
  sponsorContributionService,
} from "../../../services/sponsorContribution.service";
import { campaignKeys, campaignService } from "../../../services/campaign.service";
import { usePaymentPolling } from "../../../hooks/usePaymentPolling";
import {
  PaymentQrPanel,
  PaymentInstructions,
  PaymentResult,
} from "../../../components/payment";
import type {
  ContributionStatus,
  SponsorContribution,
} from "../../../types/campaign";
import { formatVND } from "../../../types/payment";
import { ROUTES } from "../../../routes/routePaths";
import {
  AdminPageHero,
  AdminKpiCard,
  AdminTableCard,
  AdminFilterBar,
  AdminFilterField,
} from "../../../components/admin";

// Comprehensive Vietnamese status mapping with Edunity design tokens
const VIETNAMESE_CONTRIBUTION_STATUS: Record<
  string,
  { label: string; color: string }
> = {
  PENDING: { label: "Chờ thanh toán", color: "orange" },
  PROCESSING: { label: "Đang xử lý thanh toán", color: "processing" },
  COMPLETED: { label: "Thành công", color: "success" },
  RECONCILIATION_REQUIRED: { label: "Chờ đối soát", color: "warning" },
  FAILED: { label: "Đã hủy", color: "default" },
  CANCELLED: { label: "Đã hủy", color: "default" },
  REFUNDED: { label: "Đã hoàn tiền", color: "purple" },
};

export default function SponsorContributionsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [campaignFilter, setCampaignFilter] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Impact report modal state
  const [selectedCampaignForImpact, setSelectedCampaignForImpact] = useState<{
    id: string;
    title: string;
  } | null>(null);

  // Receipt modal state
  const [selectedReceipt, setSelectedReceipt] = useState<SponsorContribution | null>(null);

  // Active QR modal state for resuming a PENDING contribution
  const [activePendingContribution, setActivePendingContribution] =
    useState<SponsorContribution | null>(null);

  const isSponsor = Boolean(user?.userId && user.role === "SPONSOR");

  // 1. Fetch sponsor contributions
  const {
    data: contributionsData,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: sponsorContributionKeys.myList({
      status: statusFilter,
      campaignId: campaignFilter,
      page,
      pageSize,
    }),
    queryFn: () =>
      sponsorContributionService.getMyContributions({
        status: statusFilter,
        campaignId: campaignFilter,
        page,
        pageSize,
      }),
    enabled: isSponsor,
  });

  // 2. Fetch campaigns list for filter dropdown
  const { data: campaignsData } = useQuery({
    queryKey: campaignKeys.list({ page: 1, pageSize: 50 }),
    queryFn: () => campaignService.listCampaigns({ page: 1, pageSize: 50 }),
    enabled: isSponsor,
  });

  // 3. Fetch impact report when modal is opened
  const {
    data: impactData,
    isLoading: isImpactLoading,
    isError: isImpactError,
    error: impactError,
  } = useQuery({
    queryKey: sponsorContributionKeys.impact(selectedCampaignForImpact?.id ?? ""),
    queryFn: () =>
      sponsorContributionService.getCampaignImpact(selectedCampaignForImpact!.id),
    enabled: Boolean(selectedCampaignForImpact?.id),
    retry: false,
  });

  // 4. Poll selected PENDING contribution when QR modal is open
  const {
    payment: polledPayment,
    uiState: polledUiState,
    isPolling,
    isFetching: isPollingFetching,
    refetch: refetchActivePayment,
  } = usePaymentPolling({
    paymentId: activePendingContribution?.paymentId || activePendingContribution?.id || null,
    enabled: Boolean(activePendingContribution),
  });

  useEffect(() => {
    if (
      polledUiState === "COMPLETED" ||
      polledUiState === "RECONCILIATION_REQUIRED" ||
      polledUiState === "FAILED"
    ) {
      queryClient.invalidateQueries({ queryKey: sponsorContributionKeys.all });
      refetch();
    }
  }, [polledUiState, queryClient, refetch]);

  const activeModalData = useMemo(() => {
    if (!activePendingContribution) return null;
    if (polledPayment) {
      return {
        ...activePendingContribution,
        ...polledPayment,
        qrCode: polledPayment.qrCode || activePendingContribution.qrCode || null,
        checkoutUrl:
          polledPayment.checkoutUrl || activePendingContribution.checkoutUrl || null,
        orderCode: polledPayment.orderCode ?? activePendingContribution.orderCode ?? null,
      };
    }
    return activePendingContribution;
  }, [activePendingContribution, polledPayment]);

  const items = contributionsData?.items ?? [];
  const total = contributionsData?.total ?? 0;
  const totalContributed = contributionsData?.totalContributed ?? 0;

  const pendingCount = items.filter(
    (c) => c.contributionStatus === "PENDING"
  ).length;

  const handleResetFilters = () => {
    setStatusFilter(undefined);
    setCampaignFilter(undefined);
    setPage(1);
  };

  const columns: ColumnsType<SponsorContribution> = [
    {
      title: "Mã giao dịch / OrderCode",
      dataIndex: "paymentReference",
      key: "paymentReference",
      width: 200,
      render: (ref: string | null, record) => (
        <div className="space-y-0.5">
          <div className="font-mono text-xs font-bold text-slate-800 break-all">
            {ref || (record.orderCode ? `CONTRIB-${record.orderCode}` : `ID-${record.id.slice(-8)}`)}
          </div>
          {record.orderCode != null && (
            <div className="font-mono text-[11px] text-teal-700 font-semibold">
              Mã cổng: #{record.orderCode}
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Chiến dịch học bổng",
      dataIndex: "campaignTitle",
      key: "campaignTitle",
      width: 260,
      render: (title: string | undefined, record) => (
        <div className="min-w-0">
          <Link
            to={`/campaigns/${record.campaignId}`}
            className="font-bold text-slate-900 hover:text-teal-700 transition-colors line-clamp-2 text-xs"
            title={title || "Chiến dịch học bổng"}
          >
            {title || `Chiến dịch #${record.campaignId.slice(-6)}`}
          </Link>
        </div>
      ),
    },
    {
      title: "Chế độ hiển thị",
      dataIndex: "isAnonymous",
      key: "isAnonymous",
      width: 140,
      render: (isAnonymous: boolean | undefined, record) =>
        isAnonymous ? (
          <Tag icon={<EyeInvisibleOutlined />} className="text-[11px] font-medium m-0">
            Ẩn danh
          </Tag>
        ) : (
          <Tag color="cyan" icon={<GlobalOutlined />} className="text-[11px] font-medium m-0">
            {record.donorDisplayName || "Công khai"}
          </Tag>
        ),
    },
    {
      title: "Số tiền đóng góp",
      dataIndex: "amount",
      key: "amount",
      width: 160,
      align: "right",
      render: (amount: number) => (
        <span className="font-bold text-teal-800 text-sm">{formatVND(amount)}</span>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "contributionStatus",
      key: "contributionStatus",
      width: 150,
      align: "center",
      render: (status: ContributionStatus) => {
        const conf = VIETNAMESE_CONTRIBUTION_STATUS[status] || {
          label: status,
          color: "default",
        };
        return <Tag color={conf.color} className="font-semibold text-xs m-0">{conf.label}</Tag>;
      },
    },
    {
      title: "Thời gian",
      dataIndex: "contributedAt",
      key: "contributedAt",
      width: 150,
      render: (date: string) => (
        <div className="text-xs text-slate-600">
          <div className="font-medium">{dayjs(date).format("DD/MM/YYYY")}</div>
          <div className="text-slate-400 text-[11px]">{dayjs(date).format("HH:mm")}</div>
        </div>
      ),
    },
    {
      title: "Thao tác",
      key: "action",
      width: 200,
      align: "right",
      render: (_, record) => {
        const isPendingAndActive =
          record.contributionStatus === "PENDING" &&
          (!record.expiredAt || new Date(record.expiredAt).getTime() > Date.now());

        return (
          <div className="flex items-center justify-end gap-1.5 flex-wrap">
            {isPendingAndActive && (
              <Button
                size="small"
                type="primary"
                icon={<QrcodeOutlined />}
                onClick={() => setActivePendingContribution(record)}
                className="bg-[#0D9488] hover:bg-[#0B746C] border-none text-xs font-semibold rounded-lg"
                data-testid={`resume-donation-qr-${record.id}`}
              >
                Mở QR
              </Button>
            )}
            {record.contributionStatus === "COMPLETED" && (
              <>
                <Button
                  size="small"
                  icon={<FileTextOutlined />}
                  onClick={() => setSelectedReceipt(record)}
                  className="rounded-lg text-xs font-medium"
                  title="Xem biên nhận đóng góp điện tử"
                >
                  Biên nhận
                </Button>
                <Button
                  size="small"
                  type="link"
                  icon={<FundProjectionScreenOutlined />}
                  onClick={() =>
                    setSelectedCampaignForImpact({
                      id: record.campaignId,
                      title: record.campaignTitle || "Chiến dịch học bổng",
                    })
                  }
                  className="text-teal-700 hover:text-teal-800 p-0 text-xs font-semibold"
                >
                  Tác động
                </Button>
              </>
            )}
            {!isPendingAndActive && record.contributionStatus !== "COMPLETED" && (
              <span className="text-slate-400 text-xs">—</span>
            )}
          </div>
        );
      },
    },
  ];

  if (!isSponsor) return null;

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      {/* 1. AdminPageHero */}
      <AdminPageHero
        icon={<HeartOutlined />}
        title="Lịch sử đóng góp học bổng"
        crumb="Lịch sử tài trợ"
        description="Theo dõi toàn bộ các khoản quyên góp VietQR, xem biên nhận điện tử và theo dõi báo cáo tác động chi tiết."
        extra={
          <div className="flex items-center gap-2">
            <Button
              icon={<ReloadOutlined spin={isFetching} />}
              onClick={() => refetch()}
              disabled={isLoading}
              className="rounded-xl"
            >
              Làm mới
            </Button>
            <Link to={ROUTES.CAMPAIGNS}>
              <Button
                type="primary"
                icon={<HeartOutlined />}
                className="bg-[#0D9488] hover:bg-[#0B746C] rounded-xl font-bold shadow-xs"
              >
                Tài trợ chiến dịch mới
              </Button>
            </Link>
          </div>
        }
      />

      {/* 2. Admin KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <AdminKpiCard
          title="Tổng giá trị đã đóng góp (Thành công)"
          value={formatVND(totalContributed)}
          icon={<DollarOutlined />}
          variant="teal"
          onClick={() => { setStatusFilter("COMPLETED"); setPage(1); }}
        />
        <AdminKpiCard
          title="Tổng số lượt đóng góp"
          value={`${total} lượt`}
          icon={<HeartOutlined />}
          variant="mint"
          onClick={() => { setStatusFilter(undefined); setPage(1); }}
        />
        <AdminKpiCard
          title="Đang chờ thanh toán"
          value={`${pendingCount} giao dịch`}
          icon={<ClockCircleOutlined />}
          variant="amber"
          onClick={() => { setStatusFilter("PENDING"); setPage(1); }}
        />
      </div>

      {/* 3. Main Data Table + Filter Bar */}
      <AdminTableCard>
        <AdminFilterBar
          title="Bộ lọc lịch sử đóng góp"
          gridClassName="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
          onReset={handleResetFilters}
          hasFilter={Boolean(statusFilter || campaignFilter)}
        >
          <AdminFilterField label="Trạng thái giao dịch">
            <Select
              allowClear
              placeholder="Tất cả trạng thái"
              className="w-full rounded-xl"
              value={statusFilter}
              onChange={(val) => {
                setStatusFilter(val);
                setPage(1);
              }}
              options={[
                { value: "COMPLETED", label: "Thành công (COMPLETED)" },
                { value: "PENDING", label: "Chờ thanh toán (PENDING)" },
                { value: "RECONCILIATION_REQUIRED", label: "Chờ đối soát (RECONCILIATION_REQUIRED)" },
                { value: "FAILED", label: "Đã hủy (FAILED)" },
                { value: "REFUNDED", label: "Đã hoàn tiền (REFUNDED)" },
              ]}
            />
          </AdminFilterField>

          <AdminFilterField label="Chiến dịch thụ hưởng">
            <Select
              allowClear
              placeholder="Tất cả chiến dịch"
              className="w-full rounded-xl"
              value={campaignFilter}
              onChange={(val) => {
                setCampaignFilter(val);
                setPage(1);
              }}
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
              }
              options={(campaignsData?.items ?? []).map((c) => ({
                value: c.id,
                label: c.title,
              }))}
            />
          </AdminFilterField>
        </AdminFilterBar>

        {isError ? (
          <div className="p-6">
            <Alert
              type="error"
              showIcon
              message="Không thể tải lịch sử đóng góp"
              description={(error as Error)?.message || "Vui lòng thử lại sau."}
              action={
                <Button size="small" onClick={() => refetch()}>
                  Thử lại
                </Button>
              }
            />
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <Table<SponsorContribution>
              columns={columns}
              dataSource={items}
              rowKey="id"
              loading={isLoading}
              pagination={false}
              className="border-t border-slate-100"
              locale={{
                emptyText: (
                  <Empty
                    description={
                      <div className="space-y-2 py-6">
                        <p className="font-medium text-slate-600">
                          Chưa có khoản đóng góp nào phù hợp với bộ lọc.
                        </p>
                        <p className="text-xs text-slate-400">
                          Khám phá các chiến dịch học bổng để bắt đầu đồng hành cùng học sinh nghèo.
                        </p>
                        <Link to={ROUTES.CAMPAIGNS}>
                          <Button type="primary" size="small" className="bg-[#0D9488] hover:bg-[#0B746C] mt-1 font-bold rounded-lg">
                            Khám phá chiến dịch
                          </Button>
                        </Link>
                      </div>
                    }
                  />
                ),
              }}
            />
          </div>
        )}

        {/* Standardized Admin Pagination Footer */}
        {total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-slate-100">
            <span className="text-xs text-slate-500 font-medium">
              Hiển thị {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} trong tổng số {total} giao dịch
            </span>
            <Pagination
              current={page}
              pageSize={pageSize}
              total={total}
              onChange={(nextPage, nextSize) => {
                setPage(nextPage);
                setPageSize(nextSize);
              }}
              showSizeChanger
              pageSizeOptions={["10", "20", "50"]}
              size="small"
            />
          </div>
        )}
      </AdminTableCard>

      {/* Modal: View Active PENDING Donation QR */}
      <Modal
        open={Boolean(activePendingContribution)}
        onCancel={() => setActivePendingContribution(null)}
        footer={null}
        width={600}
        destroyOnClose
        title="Thanh toán khoản tài trợ đang chờ (VietQR)"
      >
        {activeModalData && (
          <div className="space-y-4 pt-2">
            {polledUiState === "COMPLETED" ||
            polledUiState === "RECONCILIATION_REQUIRED" ? (
              <PaymentResult
                payment={{
                  ...(activeModalData as any),
                  purpose: "DONATION",
                }}
                uiState={polledUiState}
                purpose="DONATION"
                campaignTitle={activeModalData.campaignTitle || undefined}
                onPrimaryAction={() => setActivePendingContribution(null)}
                primaryActionLabel="Đóng cửa sổ"
              />
            ) : (
              <>
                <PaymentQrPanel
                  purpose="DONATION"
                  uiState={polledUiState}
                  amount={activeModalData.amount}
                  qrCode={activeModalData.qrCode}
                  checkoutUrl={activeModalData.checkoutUrl}
                  orderCode={activeModalData.orderCode}
                  gatewayReference={activeModalData.paymentReference}
                  provider={activeModalData.provider}
                  gateway={activeModalData.gateway}
                  expiredAt={activeModalData.expiredAt}
                  isAnonymous={activeModalData.isAnonymous}
                  donorDisplayName={activeModalData.donorDisplayName}
                  title={activeModalData.campaignTitle || "Tài trợ chiến dịch học bổng"}
                  isPolling={isPolling}
                  isRefreshing={isPollingFetching}
                  onManualRefresh={() => refetchActivePayment()}
                  onExpire={() => refetchActivePayment()}
                />
                <PaymentInstructions purpose="DONATION" />
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Modal: Electronic Receipt (Biên nhận đóng góp điện tử) */}
      <Modal
        open={Boolean(selectedReceipt)}
        onCancel={() => setSelectedReceipt(null)}
        footer={[
          <Button key="print" icon={<PrinterOutlined />} onClick={() => window.print()} className="rounded-xl">
            In biên nhận
          </Button>,
          <Button key="close" type="primary" onClick={() => setSelectedReceipt(null)} className="bg-[#0D9488] hover:bg-[#0B746C] rounded-xl font-bold">
            Đóng
          </Button>,
        ]}
        width={560}
        title={
          <div className="flex items-center gap-2 text-base font-bold text-[#163B40]">
            <CheckCircleFilled className="text-teal-600" />
            <span>Biên nhận Đóng góp Học bổng Điện tử</span>
          </div>
        }
      >
        {selectedReceipt && (
          <div className="py-3 space-y-4">
            <div className="border border-[#D6E5E2] rounded-2xl p-5 bg-[#F5FAF9] space-y-3">
              <div className="text-center pb-3 border-b border-[#D6E5E2]">
                <div className="text-[11px] font-bold uppercase tracking-wider text-teal-700">
                  HỆ THỐNG GIÁO DỤC TRỰC TUYẾN EDUNITY
                </div>
                <div className="text-lg font-black text-[#163B40] mt-1">
                  XÁC NHẬN TÀI TRỢ QUỸ HỌC BỔNG
                </div>
                <div className="text-xs font-mono text-slate-500 mt-0.5">
                  Mã biên nhận: REC-{(selectedReceipt.orderCode || selectedReceipt.id).toString().slice(-8).toUpperCase()}
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">Nhà tài trợ:</span>
                  <span className="font-bold text-slate-800">
                    {selectedReceipt.isAnonymous
                      ? "Nhà tài trợ ẩn danh"
                      : selectedReceipt.donorDisplayName || user?.fullName || "Quý Nhà tài trợ"}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">Chiến dịch thụ hưởng:</span>
                  <span className="font-bold text-slate-800 text-right max-w-[280px]">
                    {selectedReceipt.campaignTitle || "Chiến dịch học bổng"}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">Mã tham chiếu / OrderCode:</span>
                  <span className="font-mono font-bold text-slate-700">
                    {selectedReceipt.paymentReference || `CONTRIB-${selectedReceipt.orderCode}`}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">Số tiền đóng góp:</span>
                  <span className="font-extrabold text-base text-teal-700">
                    {formatVND(selectedReceipt.amount)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">Thời gian ghi nhận:</span>
                  <span className="font-medium text-slate-700">
                    {dayjs(selectedReceipt.contributedAt).format("DD/MM/YYYY HH:mm:ss")}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500 font-medium">Kênh tiếp nhận:</span>
                  <span className="font-semibold text-teal-800">
                    Cổng thanh toán PayOS (VietQR)
                  </span>
                </div>
              </div>

              <div className="pt-2 text-center text-[11px] text-teal-800 font-medium bg-teal-50 border border-teal-200 rounded-xl py-2">
                ✓ Khoản tài trợ đã được ghi nhận vào tài khoản quỹ chiến dịch độc lập của Edunity.
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Impact Report Modal (FR-SPO-07..10, NFR-04) */}
      <Modal
        open={Boolean(selectedCampaignForImpact)}
        onCancel={() => setSelectedCampaignForImpact(null)}
        footer={[
          <Button key="close" onClick={() => setSelectedCampaignForImpact(null)} className="rounded-xl">
            Đóng
          </Button>,
        ]}
        width={680}
        title={
          <div>
            <div className="text-xs font-semibold text-teal-700 uppercase">
              Báo cáo tác động chiến dịch
            </div>
            <div className="text-base font-bold text-[#163B40]">
              {selectedCampaignForImpact?.title}
            </div>
          </div>
        }
      >
        {isImpactLoading ? (
          <div className="py-8 text-center text-slate-500">
            Đang tổng hợp báo cáo tác động...
          </div>
        ) : isImpactError ? (
          <Alert
            type="warning"
            showIcon
            message="Không thể hiển thị báo cáo tác động"
            description={
              (impactError as Error)?.message ||
              "Báo cáo tác động chỉ khả dụng cho các chiến dịch bạn đã đóng góp thành công."
            }
          />
        ) : impactData ? (
          <div className="space-y-5 pt-2">
            {/* My Contribution Summary */}
            <div className="bg-[#F0F8F6] border border-[#D6E5E2] rounded-xl p-4">
              <div className="text-xs font-semibold text-teal-700 uppercase mb-2">
                Đóng góp của bạn trong chiến dịch này
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-slate-500">Tổng đóng góp</div>
                  <div className="text-lg font-bold text-teal-700">
                    {formatVND(impactData.myContribution.total)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Số lượt tài trợ</div>
                  <div className="text-lg font-bold text-slate-800">
                    {impactData.myContribution.count} lượt
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Tỷ trọng trong quỹ</div>
                  <div className="text-lg font-bold text-teal-700">
                    {impactData.myContribution.shareOfFund}%
                  </div>
                </div>
              </div>
            </div>

            {/* Fund Usage Summary */}
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase mb-2">
                Tình hình sử dụng quỹ chiến dịch
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card size="small" className="rounded-xl bg-slate-50 border-slate-100">
                  <div className="text-xs text-slate-500">Tổng quỹ huy động</div>
                  <div className="font-bold text-slate-800 mt-1">
                    {formatVND(impactData.fundUsage.fundedAmount)}
                  </div>
                </Card>
                <Card size="small" className="rounded-xl bg-slate-50 border-slate-100">
                  <div className="text-xs text-slate-500">Đã phân bổ học bổng</div>
                  <div className="font-bold text-teal-700 mt-1">
                    {formatVND(impactData.fundUsage.allocatedAmount)}
                  </div>
                </Card>
                <Card size="small" className="rounded-xl bg-slate-50 border-slate-100">
                  <div className="text-xs text-slate-500">Đã giải ngân học phí</div>
                  <div className="font-bold text-emerald-600 mt-1">
                    {formatVND(impactData.fundUsage.usedAmount)} (
                    {impactData.fundUsage.usedPercent}%)
                  </div>
                </Card>
                <Card size="small" className="rounded-xl bg-slate-50 border-slate-100">
                  <div className="text-xs text-slate-500">Quỹ chưa phân bổ</div>
                  <div className="font-bold text-slate-700 mt-1">
                    {formatVND(impactData.fundUsage.unallocatedAmount)}
                  </div>
                </Card>
              </div>
            </div>

            {/* Impact Metrics (Aggregated only - NFR-04 privacy compliant) */}
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase mb-2">
                Tác động cộng đồng (Số liệu tổng hợp ẩn danh)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card size="small" className="rounded-xl border-slate-200">
                  <div className="text-xs text-slate-500">Học viên nhận học bổng</div>
                  <div className="text-xl font-bold text-slate-800 mt-1">
                    {impactData.impact.sponsoredStudentCount}
                  </div>
                </Card>
                <Card size="small" className="rounded-xl border-slate-200">
                  <div className="text-xs text-slate-500">Học viên đã sử dụng</div>
                  <div className="text-xl font-bold text-emerald-600 mt-1">
                    {impactData.impact.studentsUsingScholarshipCount}
                  </div>
                </Card>
                <Card size="small" className="rounded-xl border-slate-200">
                  <div className="text-xs text-slate-500">Lượt ghi danh được tài trợ</div>
                  <div className="text-xl font-bold text-teal-700 mt-1">
                    {impactData.impact.enrollmentsFundedCount}
                  </div>
                </Card>
                <Card size="small" className="rounded-xl border-slate-200">
                  <div className="text-xs text-slate-500">Lớp học được hỗ trợ</div>
                  <div className="text-xl font-bold text-slate-800 mt-1">
                    {impactData.impact.classesSupportedCount}
                  </div>
                </Card>
              </div>
              <div className="text-xs text-slate-400 mt-2">
                * Để bảo vệ quyền riêng tư của học viên (NFR-04), báo cáo chỉ hiển thị số liệu thống kê tổng hợp.
              </div>
            </div>
            {selectedCampaignForImpact?.id && <CampaignStoriesSection campaignId={selectedCampaignForImpact.id} />}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
