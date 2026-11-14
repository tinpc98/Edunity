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
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  DollarOutlined,
  FilterOutlined,
  FundProjectionScreenOutlined,
  HeartOutlined,
  ReloadOutlined,
  QrcodeOutlined,
  EyeInvisibleOutlined,
  GlobalOutlined,
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
import {
  CONTRIBUTION_STATUS_COLORS,
  CONTRIBUTION_STATUS_LABELS,
} from "../../../types/campaign";
import { formatVND } from "../../../types/payment";
import { ROUTES } from "../../../routes/routePaths";

const { Title, Text } = Typography;

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

  const columns: ColumnsType<SponsorContribution> = [
    {
      title: "Mã tham chiếu / OrderCode",
      dataIndex: "paymentReference",
      key: "paymentReference",
      width: 190,
      render: (ref: string | null, record) => (
        <div className="space-y-0.5">
          <div className="font-mono text-xs text-slate-700 break-all">
            {ref || `ID-${record.id.slice(-8)}`}
          </div>
          {record.orderCode != null && (
            <div className="font-mono text-[11px] text-indigo-600 font-semibold">
              orderCode: {record.orderCode}
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Chiến dịch học bổng",
      dataIndex: "campaignTitle",
      key: "campaignTitle",
      width: 240,
      render: (title: string | undefined, record) => (
        <div>
          <Link
            to={`/campaigns/${record.campaignId}`}
            className="font-semibold text-slate-800 hover:text-emerald-600 transition-colors"
          >
            {title || `Chiến dịch #${record.campaignId.slice(-6)}`}
          </Link>
          {record.campaignStatus && (
            <div className="text-xs text-slate-400 mt-0.5">
              Trạng thái quỹ: {record.campaignStatus}
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Chế độ hiển thị",
      dataIndex: "isAnonymous",
      key: "isAnonymous",
      width: 150,
      render: (isAnonymous: boolean | undefined, record) =>
        isAnonymous ? (
          <Tag icon={<EyeInvisibleOutlined />} className="text-xs font-medium">
            Ẩn danh
          </Tag>
        ) : (
          <Tag color="cyan" icon={<GlobalOutlined />} className="text-xs font-medium">
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
        <span className="font-bold text-slate-800">{formatVND(amount)}</span>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "contributionStatus",
      key: "contributionStatus",
      width: 150,
      render: (status: ContributionStatus) => (
        <Tag color={CONTRIBUTION_STATUS_COLORS[status]}>
          {CONTRIBUTION_STATUS_LABELS[status] || status}
        </Tag>
      ),
    },
    {
      title: "Thời gian",
      dataIndex: "contributedAt",
      key: "contributedAt",
      width: 150,
      render: (date: string) => (
        <div className="text-xs text-slate-600">
          <div>{dayjs(date).format("DD/MM/YYYY")}</div>
          <div className="text-slate-400">{dayjs(date).format("HH:mm")}</div>
        </div>
      ),
    },
    {
      title: "Thao tác",
      key: "action",
      width: 190,
      align: "right",
      render: (_, record) => {
        const isPendingAndActive =
          record.contributionStatus === "PENDING" &&
          (!record.expiredAt || new Date(record.expiredAt).getTime() > Date.now());

        return (
          <div className="flex items-center justify-end gap-2">
            {isPendingAndActive && (
              <Button
                size="small"
                type="primary"
                icon={<QrcodeOutlined />}
                onClick={() => setActivePendingContribution(record)}
                className="bg-indigo-600 border-none text-xs font-semibold rounded-lg"
                data-testid={`resume-donation-qr-${record.id}`}
              >
                Mở mã QR
              </Button>
            )}
            {record.contributionStatus === "COMPLETED" && (
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
              >
                Xem tác động
              </Button>
            )}
            {!isPendingAndActive && record.contributionStatus !== "COMPLETED" && (
              <Text type="secondary" className="text-xs">
                —
              </Text>
            )}
          </div>
        );
      },
    },
  ];

  if (!isSponsor) return null;

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">
            Nhà tài trợ / Lịch sử đóng góp
          </div>
          <Title level={2} className="!mb-1 !text-slate-800">
            Lịch sử đóng góp học bổng
          </Title>
          <Text type="secondary">
            Theo dõi các giao dịch tài trợ VietQR và xem báo cáo tác động đối với các chiến dịch đã đóng góp.
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <Link to={ROUTES.CAMPAIGNS}>
            <Button type="primary" icon={<HeartOutlined />} className="bg-emerald-600">
              Tài trợ chiến dịch mới
            </Button>
          </Link>
          <Button
            icon={<ReloadOutlined spin={isFetching} />}
            onClick={() => refetch()}
            disabled={isLoading}
          >
            Làm mới
          </Button>
        </div>
      </div>

      {/* Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="rounded-2xl border-slate-100 shadow-sm">
          <Statistic
            title={
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Tổng giá trị đã đóng góp (Hoàn thành)
              </span>
            }
            value={totalContributed}
            formatter={(val) => (
              <span className="text-2xl font-bold text-emerald-600">
                {formatVND(Number(val))}
              </span>
            )}
            prefix={<DollarOutlined className="text-emerald-500 mr-1" />}
          />
        </Card>
        <Card className="rounded-2xl border-slate-100 shadow-sm">
          <Statistic
            title={
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Tổng số giao dịch ghi nhận
              </span>
            }
            value={total}
            suffix="lượt đóng góp"
            valueStyle={{ fontWeight: 700, color: "#1e293b" }}
          />
        </Card>
      </div>

      {/* Filters & Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 sm:px-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <FilterOutlined className="text-slate-400" />
            <span className="font-bold text-slate-800 text-sm">Danh sách giao dịch</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              allowClear
              placeholder="Lọc theo trạng thái"
              style={{ width: 170 }}
              value={statusFilter}
              onChange={(val) => {
                setStatusFilter(val);
                setPage(1);
              }}
              options={[
                { value: "COMPLETED", label: "Hoàn thành" },
                { value: "PENDING", label: "Chờ thanh toán" },
                { value: "FAILED", label: "Thất bại" },
              ]}
            />
            <Select
              allowClear
              placeholder="Lọc theo chiến dịch"
              style={{ width: 240 }}
              value={campaignFilter}
              onChange={(val) => {
                setCampaignFilter(val);
                setPage(1);
              }}
              options={(campaignsData?.items ?? []).map((c) => ({
                value: c.id,
                label: c.title,
              }))}
            />
          </div>
        </div>

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
              scroll={{ x: 1080 }}
              pagination={{
                current: page,
                pageSize,
                total,
                showSizeChanger: true,
                onChange: (nextPage, nextSize) => {
                  setPage(nextPage);
                  setPageSize(nextSize);
                },
                showTotal: (t) => `Tổng cộng ${t} giao dịch`,
              }}
              locale={{
                emptyText: (
                  <Empty
                    description={
                      <div className="space-y-2">
                        <p className="font-medium text-slate-600">
                          Chưa có khoản đóng góp nào
                        </p>
                        <p className="text-xs text-slate-400">
                          Hãy khám phá các chiến dịch học bổng đang gây quỹ để bắt đầu đồng hành cùng học viên.
                        </p>
                        <Link to={ROUTES.CAMPAIGNS}>
                          <Button type="primary" size="small" className="bg-emerald-600 mt-1">
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
      </div>

      {/* Modal to resume / view active PENDING Donation QR */}
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
                primaryActionLabel="Đóng biên nhận"
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

      {/* Impact Report Modal (FR-SPO-07..10, NFR-04) */}
      <Modal
        open={Boolean(selectedCampaignForImpact)}
        onCancel={() => setSelectedCampaignForImpact(null)}
        footer={[
          <Button key="close" onClick={() => setSelectedCampaignForImpact(null)}>
            Đóng
          </Button>,
        ]}
        width={680}
        title={
          <div>
            <div className="text-xs font-semibold text-emerald-600 uppercase">
              Báo cáo tác động chiến dịch
            </div>
            <div className="text-base font-bold text-slate-800">
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
            <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-4">
              <div className="text-xs font-semibold text-emerald-700 uppercase mb-2">
                Đóng góp của bạn trong chiến dịch này
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-slate-500">Tổng đóng góp</div>
                  <div className="text-lg font-bold text-emerald-700">
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
                  <div className="text-lg font-bold text-emerald-700">
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
                  <div className="font-bold text-indigo-600 mt-1">
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
                  <div className="text-xl font-bold text-indigo-600 mt-1">
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
