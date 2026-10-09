import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Typography,
  Card,
  Row,
  Col,
  Tag,
  Progress,
  Button,
  Input,
  Tabs,
  Empty,
  Skeleton,
  Pagination,
} from "antd";
import {
  SafetyCertificateOutlined,
  SearchOutlined,
  DollarOutlined,
  TeamOutlined,
  CalendarOutlined,
  ArrowRightOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { campaignService, campaignKeys } from "../../services/campaign.service";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_COLORS,
} from "../../types/campaign";
import { formatVND } from "../../types/payment";

const { Title, Paragraph } = Typography;

export default function CampaignsPage() {
  const [page, setPage] = useState<number>(1);
  const pageSize = 9;
  const [statusFilter, setStatusFilter] = useState<string>("OPEN_FOR_FUNDING");
  const [searchTerm, setSearchTerm] = useState<string>("");

  const {
    data,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: campaignKeys.list({ page, pageSize, status: statusFilter === "ALL" ? undefined : statusFilter }),
    queryFn: () =>
      campaignService.listCampaigns({
        page,
        pageSize,
        status: statusFilter === "ALL" ? undefined : statusFilter,
      }),
  });

  const rawItems = data?.items || [];
  const total = data?.total || 0;

  // Client-side search filtering by title/description for responsiveness
  const filteredItems = rawItems.filter((c) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      (c.description && c.description.toLowerCase().includes(q))
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Banner / Header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-900 via-indigo-800 to-blue-900 text-white p-8 md:p-12 shadow-xl">
          <div className="relative z-10 max-w-3xl space-y-4">
            <Tag color="cyan" className="px-3 py-1 font-semibold text-xs tracking-wider uppercase border-0">
              Chương trình tài trợ cộng đồng
            </Tag>
            <Title level={1} className="!text-white !mb-2 font-black tracking-tight text-3xl md:text-5xl">
              Chiến dịch Học bổng Edunity
            </Title>
            <Paragraph className="!text-indigo-100 text-base md:text-lg leading-relaxed">
              Kết nối những tấm lòng nhân ái và các nhà tài trợ hảo tâm với các học sinh có hoàn cảnh khó khăn, cùng nhau xây dựng tương lai giáo dục bình đẳng và bền vững.
            </Paragraph>
          </div>
          <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none translate-x-12 translate-y-12">
            <SafetyCertificateOutlined style={{ fontSize: "360px" }} />
          </div>
        </div>

        {/* Filter Bar */}
        <Card className="rounded-2xl border-slate-200/80 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <Tabs
              activeKey={statusFilter}
              onChange={(key) => {
                setStatusFilter(key);
                setPage(1);
              }}
              className="[&_.ant-tabs-nav]:!mb-0"
              items={[
                { key: "OPEN_FOR_FUNDING", label: "Đang gây quỹ" },
                { key: "CLOSED", label: "Đã hoàn thành" },
                { key: "ALL", label: "Tất cả chiến dịch" },
              ]}
            />

            <div className="flex items-center gap-3">
              <Input
                placeholder="Tìm kiếm chiến dịch..."
                prefix={<SearchOutlined className="text-slate-400" />}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                allowClear
                className="w-full md:w-72 rounded-xl"
              />
              <Button
                icon={<ReloadOutlined spin={isFetching} />}
                onClick={() => refetch()}
                disabled={isLoading}
                className="rounded-xl"
              >
                Làm mới
              </Button>
            </div>
          </div>
        </Card>

        {/* Campaigns Grid */}
        {isLoading ? (
          <Row gutter={[24, 24]}>
            {[1, 2, 3, 4, 5, 6].map((idx) => (
              <Col xs={24} md={12} lg={8} key={idx}>
                <Card className="rounded-2xl p-4">
                  <Skeleton active paragraph={{ rows: 5 }} />
                </Card>
              </Col>
            ))}
          </Row>
        ) : filteredItems.length === 0 ? (
          <Card className="rounded-2xl border-dashed border-slate-300 py-16 text-center">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <div className="space-y-2">
                  <p className="text-slate-600 font-medium">Không tìm thấy chiến dịch nào phù hợp.</p>
                  <p className="text-slate-400 text-xs">
                    Vui lòng thử thay đổi từ khóa tìm kiếm hoặc chọn bộ lọc trạng thái khác.
                  </p>
                </div>
              }
            />
          </Card>
        ) : (
          <Row gutter={[24, 24]}>
            {filteredItems.map((campaign) => {
              const percent = campaign.fundingProgress;
              const isClosed = campaign.status === "CLOSED";

              return (
                <Col xs={24} md={12} lg={8} key={campaign.id}>
                  <Card
                    hoverable
                    className="h-full rounded-2xl border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group"
                  >
                    <div>
                      {/* Status & Deadline Header */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <Tag
                          color={CAMPAIGN_STATUS_COLORS[campaign.status]}
                          className="rounded-full px-3 py-0.5 text-xs font-semibold"
                        >
                          {CAMPAIGN_STATUS_LABELS[campaign.status] || campaign.status}
                        </Tag>
                        {campaign.fundingEnd && (
                          <span className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
                            <CalendarOutlined /> Hạn: {new Date(campaign.fundingEnd).toLocaleDateString("vi-VN")}
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <Link to={`/campaigns/${campaign.id}`}>
                        <Title
                          level={4}
                          className="!mb-2 !text-slate-900 group-hover:!text-indigo-600 transition-colors line-clamp-2 font-bold"
                        >
                          {campaign.title}
                        </Title>
                      </Link>

                      {/* Description Excerpt */}
                      <Paragraph className="text-slate-500 text-xs line-clamp-3 mb-4 leading-relaxed">
                        {campaign.description || "Chương trình trao học bổng hỗ trợ học viên đạt thành tích tốt trong học tập."}
                      </Paragraph>

                      {/* Funding Progress Bar */}
                      <div className="space-y-1.5 mb-5 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                        <div className="flex justify-between items-baseline text-xs">
                          <span className="font-semibold text-slate-700">Tiến độ quyên góp:</span>
                          <span className="font-bold text-indigo-600">{percent}%</span>
                        </div>
                        <Progress
                          percent={percent}
                          showInfo={false}
                          strokeColor={{ "0%": "#6366f1", "100%": "#3b82f6" }}
                          size="small"
                        />
                        <div className="flex justify-between text-xs pt-1">
                          <span className="font-bold text-slate-900">{formatVND(campaign.fundedAmount)}</span>
                          <span className="text-slate-400">/ {formatVND(campaign.targetBudget)}</span>
                        </div>
                      </div>

                      {/* Metric Badges */}
                      <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                        <div className="p-2.5 rounded-lg bg-indigo-50/50 border border-indigo-100/60">
                          <div className="text-[11px] text-slate-500 flex items-center gap-1">
                            <TeamOutlined className="text-indigo-500" /> Suất học bổng
                          </div>
                          <div className="font-bold text-slate-800 mt-0.5">
                            {campaign.expectedSlots} suất
                          </div>
                        </div>

                        <div className="p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-100/60">
                          <div className="text-[11px] text-slate-500 flex items-center gap-1">
                            <DollarOutlined className="text-emerald-500" /> Định mức / suất
                          </div>
                          <div className="font-bold text-emerald-700 mt-0.5">
                            {formatVND(campaign.awardAmountPerStudent)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="pt-3 border-t border-slate-100">
                      <Link to={`/campaigns/${campaign.id}`} className="block">
                        <Button
                          type="primary"
                          block
                          icon={<ArrowRightOutlined />}
                          className={`rounded-xl font-semibold h-10 ${
                            isClosed
                              ? "bg-slate-700 hover:bg-slate-600"
                              : "bg-indigo-600 hover:bg-indigo-500"
                          }`}
                        >
                          {isClosed ? "Xem kết quả chiến dịch" : "Chi tiết & Tài trợ ngay"}
                        </Button>
                      </Link>
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>
        )}

        {/* Pagination */}
        {total > pageSize && (
          <div className="flex justify-center pt-6">
            <Pagination
              current={page}
              pageSize={pageSize}
              total={total}
              onChange={(p) => setPage(p)}
              showSizeChanger={false}
            />
          </div>
        )}
      </div>
    </div>
  );
}
