import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Typography,
  Breadcrumb,
  Button,
  Card,
  Row,
  Col,
  Tag,
  Progress,
  Tabs,
  Table,
  Avatar,
  Skeleton,
  Alert,
  Popconfirm,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  RocketOutlined,
  StopOutlined,
  ArrowLeftOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { campaignService, campaignKeys } from "../../../services/campaign.service";
import type {
  SponsorContribution,
  ContributionStatus,
} from "../../../types/campaign";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_COLORS,
  CONTRIBUTION_STATUS_LABELS,
  CONTRIBUTION_STATUS_COLORS,
} from "../../../types/campaign";
import { formatVND } from "../../../types/payment";
import { ROUTES } from "../../../routes/routePaths";

const { Title, Paragraph } = Typography;

export default function CampaignDetailPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");

  const [contribPage, setContribPage] = useState<number>(1);
  const [contribPageSize, setContribPageSize] = useState<number>(10);

  // Fetch campaign details
  const {
    data: campaign,
    isLoading: isLoadingCampaign,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: campaignKeys.adminDetail(campaignId || ""),
    queryFn: () => (campaignId ? campaignService.adminGetCampaign(campaignId) : null),
    enabled: Boolean(campaignId),
  });

  // Fetch campaign contributions
  const {
    data: contributionsData,
    isLoading: isLoadingContributions,
  } = useQuery({
    queryKey: campaignKeys.adminContributions(campaignId || "", { page: contribPage, pageSize: contribPageSize }),
    queryFn: () =>
      campaignId
        ? campaignService.adminListContributions(campaignId, {
            page: contribPage,
            pageSize: contribPageSize,
          })
        : null,
    enabled: Boolean(campaignId),
  });

  // Publish / Close mutations
  const publishMutation = useMutation({
    mutationFn: (id: string) => campaignService.publishCampaign(id),
    onSuccess: () => {
      message.success("Đã phát hành chiến dịch sang trạng thái OPEN_FOR_FUNDING.");
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
    },
    onError: (err: any) => {
      message.error(err.message || "Không thể phát hành chiến dịch.");
    },
  });

  const closeMutation = useMutation({
    mutationFn: (id: string) => campaignService.closeCampaign(id),
    onSuccess: () => {
      message.success("Đã đóng chiến dịch (CLOSED).");
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
    },
    onError: (err: any) => {
      message.error(err.message || "Không thể đóng chiến dịch.");
    },
  });

  if (isLoadingCampaign) {
    return (
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (isError || !campaign) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center space-y-4">
        <Alert
          type="error"
          message="Không tìm thấy chiến dịch"
          description="Chiến dịch học bổng không tồn tại trên hệ thống."
          showIcon
        />
        <Link to={ROUTES.ADMIN.CAMPAIGNS}>
          <Button icon={<ArrowLeftOutlined />}>Quay lại danh sách chiến dịch</Button>
        </Link>
      </div>
    );
  }

  const contributions = contributionsData?.items || [];
  const totalContributions = contributionsData?.total || 0;

  const sponsorColumns: ColumnsType<SponsorContribution> = [
    {
      title: "Nhà tài trợ",
      dataIndex: "sponsorEmail",
      key: "sponsorEmail",
      render: (email: string, record) => (
        <div className="flex items-center gap-3">
          <Avatar className="bg-indigo-100 text-indigo-700 font-bold">
            {(email || record.sponsorId || "SP").substring(0, 2).toUpperCase()}
          </Avatar>
          <div>
            <div className="font-semibold text-slate-800 text-sm">
              {email || "Nhà tài trợ"}
            </div>
            <div className="font-mono text-[11px] text-slate-400">
              ID: {record.sponsorId.slice(0, 8)}...
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Số tiền tài trợ",
      dataIndex: "amount",
      key: "amount",
      align: "right",
      render: (val: number) => (
        <span className="font-bold text-emerald-600 text-sm">{formatVND(val)}</span>
      ),
    },
    {
      title: "Mã đối soát",
      dataIndex: "paymentReference",
      key: "paymentReference",
      render: (ref: string) => (
        <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
          {ref || "-"}
        </span>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "contributionStatus",
      key: "contributionStatus",
      align: "center",
      render: (status: ContributionStatus) => (
        <Tag color={CONTRIBUTION_STATUS_COLORS[status] || "default"} className="font-medium">
          {CONTRIBUTION_STATUS_LABELS[status] || status}
        </Tag>
      ),
    },
    {
      title: "Thời gian",
      dataIndex: "contributedAt",
      key: "contributedAt",
      render: (date: string) => (
        <span className="text-xs text-slate-500">
          {new Date(date).toLocaleString("vi-VN")}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto p-4 md:p-8">
      <Breadcrumb
        className="mb-2 text-sm font-medium"
        items={[
          { title: <Link to={ROUTES.ADMIN.HOME}>Tổng quan</Link> },
          { title: <Link to={ROUTES.ADMIN.CAMPAIGNS}>Chiến dịch</Link> },
          { title: campaign.title },
        ]}
      />

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Tag color={CAMPAIGN_STATUS_COLORS[campaign.status]} className="font-semibold text-xs px-2.5 py-0.5 rounded-full">
              {CAMPAIGN_STATUS_LABELS[campaign.status] || campaign.status}
            </Tag>
            <span className="text-xs text-slate-400 font-mono">ID: #{campaign.id}</span>
          </div>
          <Title level={2} className="!m-0 text-slate-900 font-bold">
            {campaign.title}
          </Title>
        </div>

        <div className="flex items-center gap-3">
          <Button
            icon={<ReloadOutlined spin={isFetching} />}
            onClick={() => refetch()}
            className="rounded-xl"
          >
            Làm mới
          </Button>

          {campaign.status === "DRAFT" && (
            <Popconfirm
              title="Phát hành chiến dịch?"
              description="Chiến dịch sẽ được chuyển sang trạng thái OPEN_FOR_FUNDING và công khai để nhận tài trợ."
              onConfirm={() => publishMutation.mutate(campaign.id)}
              okText="Phát hành"
              cancelText="Hủy"
            >
              <Button
                type="primary"
                icon={<RocketOutlined />}
                loading={publishMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-500 rounded-xl font-semibold shadow-xs"
              >
                Phát hành chiến dịch
              </Button>
            </Popconfirm>
          )}

          {campaign.status === "OPEN_FOR_FUNDING" && (
            <Popconfirm
              title="Đóng chiến dịch?"
              description="Chiến dịch sẽ ngừng tiếp nhận tài trợ từ các nhà hảo tâm."
              onConfirm={() => closeMutation.mutate(campaign.id)}
              okText="Đóng"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
            >
              <Button
                danger
                icon={<StopOutlined />}
                loading={closeMutation.isPending}
                className="rounded-xl font-semibold shadow-xs"
              >
                Đóng chiến dịch
              </Button>
            </Popconfirm>
          )}
        </div>
      </div>

      {/* Statistics Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="rounded-2xl border-slate-200/80 shadow-xs">
            <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Mục tiêu ngân sách</div>
            <div className="text-xl font-black text-slate-900">{formatVND(campaign.targetBudget)}</div>
            <div className="text-xs text-slate-400 mt-2">Định mức: {formatVND(campaign.awardAmountPerStudent)}/học viên</div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card className="rounded-2xl border-slate-200/80 shadow-xs bg-indigo-50/40 border-indigo-200">
            <div className="text-xs text-indigo-700 uppercase font-bold tracking-wider mb-1">Đã huy động được</div>
            <div className="text-xl font-black text-indigo-600">{formatVND(campaign.fundedAmount)}</div>
            <div className="text-xs text-indigo-500 mt-2">Đạt {campaign.fundingProgress}% mục tiêu</div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card className="rounded-2xl border-slate-200/80 shadow-xs">
            <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Đã cấp học bổng</div>
            <div className="text-xl font-black text-slate-900">{formatVND(campaign.allocatedAmount)}</div>
            <div className="text-xs text-slate-400 mt-2">Đã giải ngân học phí: {formatVND(campaign.usedAmount)}</div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card className="rounded-2xl border-slate-200/80 shadow-xs bg-emerald-50/40 border-emerald-200">
            <div className="text-xs text-emerald-800 uppercase font-bold tracking-wider mb-1">Quỹ còn khả dụng</div>
            <div className="text-xl font-black text-emerald-600">{formatVND(campaign.availableFund)}</div>
            <div className="text-xs text-emerald-600/80 mt-2">Quy mô: {campaign.expectedSlots} suất học bổng</div>
          </Card>
        </Col>
      </Row>

      {/* Tabs */}
      <Card className="rounded-2xl border-slate-200/80 shadow-xs">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: "overview",
              label: "Tổng quan & Tiến độ",
              children: (
                <div className="space-y-6 pt-2">
                  <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="flex justify-between items-center text-sm font-semibold text-slate-700">
                      <span>Tiến độ huy động quỹ</span>
                      <span className="text-indigo-600 font-bold">{campaign.fundingProgress}%</span>
                    </div>
                    <Progress
                      percent={campaign.fundingProgress}
                      showInfo={false}
                      strokeColor={{ "0%": "#6366f1", "100%": "#3b82f6" }}
                      size={["100%", 10]}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                          Mô tả chiến dịch
                        </div>
                        <Paragraph className="text-slate-700 text-sm whitespace-pre-line leading-relaxed">
                          {campaign.description || "Chưa có mô tả chi tiết."}
                        </Paragraph>
                      </div>

                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                          Tiêu chí xét duyệt (Điều kiện cần)
                        </div>
                        <Paragraph className="text-slate-700 text-sm whitespace-pre-line leading-relaxed">
                          {campaign.eligibilityCriteria || "Không có tiêu chí đặc biệt."}
                        </Paragraph>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3 text-xs">
                        <div className="font-bold text-slate-700 uppercase">Khung thời gian hoạt động</div>
                        <div>
                          <span className="text-slate-500">Thời gian nhận tài trợ (Sponsor):</span>
                          <div className="font-semibold text-slate-800 mt-0.5">
                            {campaign.fundingStart ? new Date(campaign.fundingStart).toLocaleDateString("vi-VN") : "Chưa đặt"} - {campaign.fundingEnd ? new Date(campaign.fundingEnd).toLocaleDateString("vi-VN") : "Chưa đặt"}
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-500">Thời gian nhận hồ sơ (Student):</span>
                          <div className="font-semibold text-slate-800 mt-0.5">
                            {campaign.applicationStart ? new Date(campaign.applicationStart).toLocaleDateString("vi-VN") : "Chưa đặt"} - {campaign.applicationEnd ? new Date(campaign.applicationEnd).toLocaleDateString("vi-VN") : "Chưa đặt"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ),
            },
            {
              key: "contributions",
              label: `Danh sách tài trợ (${campaign.contributionCount || totalContributions})`,
              children: (
                <div className="pt-2">
                  <Table<SponsorContribution>
                    columns={sponsorColumns}
                    dataSource={contributions}
                    rowKey="id"
                    loading={isLoadingContributions}
                    pagination={{
                      current: contribPage,
                      pageSize: contribPageSize,
                      total: totalContributions,
                      showSizeChanger: true,
                      pageSizeOptions: ["10", "20", "50"],
                      onChange: (p, ps) => {
                        setContribPage(p);
                        setContribPageSize(ps);
                      },
                      showTotal: (t) => `Tổng cộng ${t} giao dịch tài trợ`,
                    }}
                  />
                </div>
              ),
            },
            {
              key: "applications",
              label: "Hồ sơ ứng tuyển học bổng",
              children: (
                <div className="py-8 text-center space-y-2">
                  <Alert
                    type="info"
                    message="Tính năng Xét duyệt Hồ sơ Học bổng (Phase 9)"
                    description="Quản lý tiếp nhận đơn đăng ký học bổng của học sinh, thẩm định hồ sơ và cấp mã học bổng sẽ được tích hợp chuyên sâu trong Phase 9."
                    showIcon
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
