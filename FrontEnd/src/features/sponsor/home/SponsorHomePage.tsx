import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Typography,
  Card,
  Row,
  Col,
  Statistic,
  Button,
  Tag,
  Progress,
  Skeleton,
} from "antd";
import {
  HeartOutlined,
  DollarOutlined,
  SafetyCertificateOutlined,
  ArrowRightOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import { sponsorContributionService, contributionKeys } from "../../../services/sponsorContribution.service";
import { campaignService, campaignKeys } from "../../../services/campaign.service";
import { useAuthStore } from "../../../stores/auth.store";
import { formatVND } from "../../../types/payment";
import {
  CONTRIBUTION_STATUS_LABELS,
  CONTRIBUTION_STATUS_COLORS,
} from "../../../types/campaign";
import { ROUTES } from "../../../routes/routePaths";

const { Title, Paragraph } = Typography;

export default function SponsorHomePage() {
  const { user } = useAuthStore();

  const { data: myContributionsData, isLoading: isLoadingContributions } = useQuery({
    queryKey: contributionKeys.myList({ page: 1, pageSize: 5 }),
    queryFn: () => sponsorContributionService.getMyContributions({ page: 1, pageSize: 5 }),
  });

  const { data: campaignsData, isLoading: isLoadingCampaigns } = useQuery({
    queryKey: campaignKeys.list({ page: 1, pageSize: 3, status: "OPEN_FOR_FUNDING" }),
    queryFn: () => campaignService.listCampaigns({ page: 1, pageSize: 3, status: "OPEN_FOR_FUNDING" }),
  });

  const totalContributed = myContributionsData?.totalContributed || 0;
  const totalContributionsCount = myContributionsData?.total || 0;
  const recentContributions = myContributionsData?.items || [];
  const openCampaigns = campaignsData?.items || [];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Welcome Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-indigo-900 via-indigo-800 to-blue-900 text-white p-8 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <Tag color="cyan" className="font-semibold uppercase text-xs border-0 px-3 py-0.5">
            Cổng Thông tin Nhà Tài Trợ
          </Tag>
          <Title level={2} className="!text-white !mb-1 font-black tracking-tight text-2xl md:text-3xl">
            Xin chào, {user?.fullName || "Quý Nhà tài trợ"}!
          </Title>
          <Paragraph className="!text-indigo-100 text-sm leading-relaxed !mb-0">
            Cảm ơn sự đồng hành và đóng góp quý báu của bạn trong việc nâng bước học sinh, sinh viên hiếu học trên khắp cả nước.
          </Paragraph>
        </div>

        <Link to="/campaigns">
          <Button
            type="primary"
            size="large"
            icon={<HeartOutlined />}
            className="bg-white text-indigo-900 hover:!bg-indigo-50 font-bold rounded-xl border-0 h-12 px-6"
          >
            Tài trợ chiến dịch mới
          </Button>
        </Link>
      </div>

      {/* Metrics Row */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card className="rounded-2xl border-slate-200/80 shadow-xs bg-emerald-50/40 border-emerald-200">
            <Statistic
              title={<span className="text-xs font-semibold text-emerald-800 uppercase">Tổng tiền đã đóng góp</span>}
              value={totalContributed}
              formatter={(val) => formatVND(Number(val))}
              prefix={<DollarOutlined className="text-emerald-600 text-xl mr-2" />}
              valueStyle={{ color: "#059669", fontWeight: "bold" }}
            />
            <div className="mt-2 text-xs text-emerald-600/80">
              Đã ghi nhận thành công vào các quỹ học bổng
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={8}>
          <Card className="rounded-2xl border-slate-200/80 shadow-xs">
            <Statistic
              title={<span className="text-xs font-semibold text-slate-500 uppercase">Lượt tài trợ</span>}
              value={totalContributionsCount}
              prefix={<HeartOutlined className="text-indigo-500 text-xl mr-2" />}
              valueStyle={{ color: "#1e293b", fontWeight: "bold" }}
            />
            <div className="mt-2 text-xs text-slate-400">
              Số lần tham gia đóng góp chiến dịch
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={8}>
          <Card className="rounded-2xl border-slate-200/80 shadow-xs">
            <Statistic
              title={<span className="text-xs font-semibold text-slate-500 uppercase">Chiến dịch đang mở</span>}
              value={campaignsData?.total || 0}
              prefix={<SafetyCertificateOutlined className="text-blue-500 text-xl mr-2" />}
              valueStyle={{ color: "#1e293b", fontWeight: "bold" }}
            />
            <div className="mt-2 text-xs text-slate-400">
              Chương trình đang tiếp nhận nguồn tài trợ mới
            </div>
          </Card>
        </Col>
      </Row>

      {/* Main Content Grid */}
      <Row gutter={[24, 24]}>
        {/* Left: Recent Contributions */}
        <Col xs={24} lg={12}>
          <Card
            className="rounded-2xl border-slate-200/80 shadow-xs h-full"
            title={
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">Giao dịch tài trợ gần đây</span>
                <Link to={(ROUTES.SPONSOR as any).CONTRIBUTIONS || ROUTES.SPONSOR.HOME} className="text-xs text-indigo-600 font-semibold">
                  Xem tất cả
                </Link>
              </div>
            }
          >
            {isLoadingContributions ? (
              <Skeleton active paragraph={{ rows: 4 }} />
            ) : recentContributions.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                Bạn chưa thực hiện khoản tài trợ nào.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentContributions.map((item) => (
                  <div key={item.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-800 text-sm line-clamp-1">
                        {item.campaignTitle || "Chiến dịch học bổng"}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <CalendarOutlined /> {new Date(item.contributedAt).toLocaleDateString("vi-VN")}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-emerald-600 text-sm">
                        {formatVND(item.amount)}
                      </div>
                      <Tag color={CONTRIBUTION_STATUS_COLORS[item.contributionStatus]} className="mt-0.5 text-[10px]">
                        {CONTRIBUTION_STATUS_LABELS[item.contributionStatus] || item.contributionStatus}
                      </Tag>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>

        {/* Right: Active Campaigns */}
        <Col xs={24} lg={12}>
          <Card
            className="rounded-2xl border-slate-200/80 shadow-xs h-full"
            title={
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">Chiến dịch đang gây quỹ</span>
                <Link to="/campaigns" className="text-xs text-indigo-600 font-semibold">
                  Khám phá thêm
                </Link>
              </div>
            }
          >
            {isLoadingCampaigns ? (
              <Skeleton active paragraph={{ rows: 4 }} />
            ) : openCampaigns.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                Hiện tại không có chiến dịch nào đang mở.
              </div>
            ) : (
              <div className="space-y-4">
                {openCampaigns.map((camp) => (
                  <div key={camp.id} className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        to={`/campaigns/${camp.id}`}
                        className="font-semibold text-slate-900 hover:text-indigo-600 text-sm line-clamp-1"
                      >
                        {camp.title}
                      </Link>
                      <span className="font-bold text-indigo-600 text-xs shrink-0">
                        {camp.fundingProgress}%
                      </span>
                    </div>

                    <Progress
                      percent={camp.fundingProgress}
                      showInfo={false}
                      size="small"
                      strokeColor="#4f46e5"
                    />

                    <div className="flex justify-between items-center text-xs pt-1">
                      <span className="text-slate-500">
                        Đã góp: <strong className="text-slate-800">{formatVND(camp.fundedAmount)}</strong>
                      </span>
                      <Link to={`/campaigns/${camp.id}`}>
                        <Button type="link" size="small" className="text-xs p-0 text-indigo-600">
                          Tài trợ <ArrowRightOutlined />
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
