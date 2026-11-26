import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Row,
  Col,
  Button,
  Tag,
  Progress,
  Skeleton,
  Table,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  HeartOutlined,
  DollarOutlined,
  SafetyCertificateOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { sponsorContributionService, contributionKeys } from "../../../services/sponsorContribution.service";
import { campaignService, campaignKeys } from "../../../services/campaign.service";
import { useAuthStore } from "../../../stores/auth.store";
import { formatVND } from "../../../types/payment";
import {
  type SponsorContribution,
} from "../../../types/campaign";
import { ROUTES } from "../../../routes/routePaths";
import {
  AdminPageHero,
  AdminKpiCard,
  AdminTableCard,
} from "../../../components/admin";

const VIETNAMESE_STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Chờ thanh toán", color: "orange" },
  PROCESSING: { label: "Đang xử lý", color: "processing" },
  COMPLETED: { label: "Thành công", color: "success" },
  RECONCILIATION_REQUIRED: { label: "Chờ đối soát", color: "warning" },
  FAILED: { label: "Đã hủy", color: "default" },
  REFUNDED: { label: "Đã hoàn tiền", color: "purple" },
};

export default function SponsorHomePage() {
  const { user } = useAuthStore();

  const { data: myContributionsData, isLoading: isLoadingContributions } = useQuery({
    queryKey: contributionKeys.myList({ page: 1, pageSize: 20 }),
    queryFn: () => sponsorContributionService.getMyContributions({ page: 1, pageSize: 20 }),
  });

  const { data: campaignsData, isLoading: isLoadingCampaigns } = useQuery({
    queryKey: campaignKeys.list({ page: 1, pageSize: 4, status: "OPEN_FOR_FUNDING" }),
    queryFn: () => campaignService.listCampaigns({ page: 1, pageSize: 4, status: "OPEN_FOR_FUNDING" }),
  });

  const allContributions = myContributionsData?.items || [];
  const totalContributed = myContributionsData?.totalContributed || 0;
  const recentContributions = allContributions.slice(0, 5);
  const openCampaigns = campaignsData?.items || [];

  // Metrics derived from actual backend contributions data
  const completedContributions = allContributions.filter(
    (c) => c.contributionStatus === "COMPLETED"
  );
  const pendingContributions = allContributions.filter(
    (c) => c.contributionStatus === "PENDING"
  );
  const uniqueCampaigns = new Set(
    allContributions.map((c) => c.campaignId).filter(Boolean)
  );

  const recentColumns: ColumnsType<SponsorContribution> = [
    {
      title: "Mã giao dịch",
      dataIndex: "paymentReference",
      key: "paymentReference",
      width: 140,
      render: (ref: string, record) => (
        <span className="font-mono text-xs font-semibold text-slate-700">
          {ref || (record.orderCode ? `CONTRIB-${record.orderCode}` : `#${record.id.slice(-6)}`)}
        </span>
      ),
    },
    {
      title: "Chiến dịch",
      dataIndex: "campaignTitle",
      key: "campaignTitle",
      render: (title: string, record) => (
        <Link
          to={`/campaigns/${record.campaignId}`}
          className="font-medium text-slate-800 hover:text-teal-700 text-xs line-clamp-1"
        >
          {title || "Chiến dịch học bổng"}
        </Link>
      ),
    },
    {
      title: "Số tiền",
      dataIndex: "amount",
      key: "amount",
      align: "right",
      render: (val: number) => (
        <span className="font-bold text-teal-700 text-xs">{formatVND(val)}</span>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "contributionStatus",
      key: "contributionStatus",
      align: "center",
      render: (status: string) => {
        const conf = VIETNAMESE_STATUS_MAP[status] || { label: status, color: "default" };
        return (
          <Tag color={conf.color} className="text-[10px] font-semibold m-0">
            {conf.label}
          </Tag>
        );
      },
    },
    {
      title: "Thời gian",
      dataIndex: "contributedAt",
      key: "contributedAt",
      align: "right",
      render: (dateStr: string) => (
        <span className="text-[11px] text-slate-500">
          {dateStr ? new Date(dateStr).toLocaleDateString("vi-VN") : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      {/* AdminPageHero */}
      <AdminPageHero
        icon={<HeartOutlined />}
        title={`Xin chào, ${user?.fullName || "Quý Nhà tài trợ"}!`}
        crumb="Tổng quan"
        description="Theo dõi toàn diện các khoản đóng góp và đồng hành cùng các chiến dịch học bổng Edunity trên toàn quốc."
        extra={
          <Link to={ROUTES.CAMPAIGNS}>
            <Button
              type="primary"
              size="large"
              icon={<HeartOutlined />}
              className="bg-[#0D9488] hover:bg-[#0B746C] rounded-xl font-bold shadow-xs h-11 px-5"
            >
              Tài trợ chiến dịch mới
            </Button>
          </Link>
        }
      />

      {/* 4 Standardized Admin KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminKpiCard
          title="Tổng tiền đã tài trợ"
          value={formatVND(totalContributed)}
          icon={<DollarOutlined />}
          variant="teal"
        />
        <AdminKpiCard
          title="Lượt tài trợ thành công"
          value={`${completedContributions.length} lượt`}
          icon={<CheckCircleOutlined />}
          variant="mint"
        />
        <AdminKpiCard
          title="Chiến dịch đã đóng góp"
          value={`${uniqueCampaigns.size} chiến dịch`}
          icon={<SafetyCertificateOutlined />}
          variant="sky"
        />
        <AdminKpiCard
          title="Đang xử lý / Chờ đối soát"
          value={`${pendingContributions.length} giao dịch`}
          icon={<ClockCircleOutlined />}
          variant="amber"
        />
      </div>

      {/* Main Content Grid */}
      <Row gutter={[20, 20]}>
        {/* Left: Recent Contributions Table */}
        <Col xs={24} lg={13}>
          <AdminTableCard>
            <div className="p-4 sm:px-6 border-b border-[#D6E5E2] bg-[#F5FAF9] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HeartOutlined className="text-[#0D9488]" />
                <span className="font-bold text-[#163B40] text-sm">Giao dịch tài trợ gần đây</span>
              </div>
              <Link
                to={ROUTES.SPONSOR.CONTRIBUTIONS}
                className="text-xs text-[#0D9488] hover:text-[#0B746C] font-semibold"
              >
                Xem tất cả
              </Link>
            </div>

            {isLoadingContributions ? (
              <div className="p-6">
                <Skeleton active paragraph={{ rows: 5 }} />
              </div>
            ) : recentContributions.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-xs">
                Bạn chưa có giao dịch tài trợ nào được ghi nhận.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table<SponsorContribution>
                  columns={recentColumns}
                  dataSource={recentContributions}
                  rowKey="id"
                  pagination={false}
                  size="small"
                />
              </div>
            )}
          </AdminTableCard>
        </Col>

        {/* Right: Active Campaigns */}
        <Col xs={24} lg={11}>
          <AdminTableCard>
            <div className="p-4 sm:px-6 border-b border-[#D6E5E2] bg-[#F5FAF9] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SafetyCertificateOutlined className="text-[#0D9488]" />
                <span className="font-bold text-[#163B40] text-sm">Chiến dịch đang gây quỹ</span>
              </div>
              <Link
                to={ROUTES.CAMPAIGNS}
                className="text-xs text-[#0D9488] hover:text-[#0B746C] font-semibold"
              >
                Khám phá thêm
              </Link>
            </div>

            {isLoadingCampaigns ? (
              <div className="p-6">
                <Skeleton active paragraph={{ rows: 5 }} />
              </div>
            ) : openCampaigns.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-xs">
                Hiện không có chiến dịch nào đang mở gây quỹ.
              </div>
            ) : (
              <div className="p-4 space-y-3.5">
                {openCampaigns.map((camp) => (
                  <div
                    key={camp.id}
                    className="p-3.5 rounded-xl border border-[#D6E5E2] bg-white hover:border-[#0D9488] transition-all space-y-2 shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        to={`/campaigns/${camp.id}`}
                        className="font-bold text-slate-900 hover:text-teal-700 text-sm line-clamp-1"
                      >
                        {camp.title}
                      </Link>
                      <span className="font-bold text-[#0D9488] text-xs shrink-0">
                        {camp.fundingProgress}%
                      </span>
                    </div>

                    <Progress
                      percent={camp.fundingProgress}
                      showInfo={false}
                      size="small"
                      strokeColor="#0D9488"
                    />

                    <div className="flex justify-between items-center text-xs pt-0.5">
                      <span className="text-slate-500">
                        Đã góp: <strong className="text-teal-800">{formatVND(camp.fundedAmount)}</strong> / {formatVND(camp.targetBudget)}
                      </span>
                      <Link to={`/campaigns/${camp.id}`}>
                        <Button
                          type="link"
                          size="small"
                          className="text-xs p-0 text-[#0D9488] hover:text-[#0B746C] font-bold"
                        >
                          Tài trợ <ArrowRightOutlined />
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AdminTableCard>
        </Col>
      </Row>
    </div>
  );
}
