import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Empty, Input, Pagination, Segmented, Skeleton, Tag, Typography } from "antd";
import {
  CalendarOutlined,
  ClockCircleOutlined,
  FileSearchOutlined,
  GiftOutlined,
  SearchOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { campaignKeys, campaignService } from "../../../services/campaign.service";
import { formatVND } from "../../../types/payment";
import { ROUTES } from "../../../routes/routePaths";
import {
  SCHOLARSHIP_APP_STATUS_COLORS,
  SCHOLARSHIP_APP_STATUS_LABELS,
} from "../../../types/scholarship";
import {
  APPLICATION_PHASE_COLORS,
  APPLICATION_PHASE_LABELS,
  daysUntil,
  formatDateVN,
  getApplicationPhase,
} from "../../../utils/campaign";
import { useMyApplicationByCampaign } from "./hooks/useMyApplications";

const { Title, Text, Paragraph } = Typography;

type StatusTab = "OPEN_FOR_FUNDING" | "CLOSED";
const PAGE_SIZE = 9;

export default function StudentScholarshipExplorePage() {
  const [statusTab, setStatusTab] = useState<StatusTab>("OPEN_FOR_FUNDING");
  const [acceptingOnly, setAcceptingOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const params = { status: statusTab, page, pageSize: PAGE_SIZE };
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: campaignKeys.list(params),
    queryFn: () => campaignService.listCampaigns(params),
  });
  const { byCampaign } = useMyApplicationByCampaign();

  // GET /api/campaigns has no keyword or phase filter: both narrow the current page only
  const visible = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return (data?.items ?? []).filter((campaign) => {
      if (acceptingOnly && !campaign.isAcceptingApplications) return false;
      if (!keyword) return true;
      return [campaign.title, campaign.description, campaign.eligibilityCriteria]
        .some((text) => text?.toLowerCase().includes(keyword));
    });
  }, [data, search, acceptingOnly]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Title level={2} className="!mb-1 !text-2xl font-black text-slate-900 tracking-tight">
            Tìm học bổng
          </Title>
          <Text className="text-xs text-slate-500">
            Khám phá các chiến dịch học bổng đang mở và nộp hồ sơ để nhận hỗ trợ học phí.
          </Text>
        </div>
        <Link to={ROUTES.STUDENT.SCHOLARSHIP_APPLICATIONS}>
          <Button icon={<FileSearchOutlined />} className="rounded-xl text-xs font-semibold h-10 px-4">
            Theo dõi hồ sơ của tôi
          </Button>
        </Link>
      </div>

      <Card className="rounded-2xl border-slate-200 shadow-2xs" styles={{ body: { padding: 16 } }}>
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <Segmented<StatusTab>
            value={statusTab}
            onChange={(value) => {
              setStatusTab(value);
              setPage(1);
            }}
            options={[
              { label: "Đang hoạt động", value: "OPEN_FOR_FUNDING" },
              { label: "Đã kết thúc", value: "CLOSED" },
            ]}
          />
          {statusTab === "OPEN_FOR_FUNDING" && (
            <Segmented<"ALL" | "ACCEPTING">
              value={acceptingOnly ? "ACCEPTING" : "ALL"}
              onChange={(value) => setAcceptingOnly(value === "ACCEPTING")}
              options={[
                { label: "Tất cả", value: "ALL" },
                { label: "Đang nhận hồ sơ", value: "ACCEPTING" },
              ]}
            />
          )}
          <Input
            allowClear
            prefix={<SearchOutlined className="text-slate-400" />}
            placeholder="Tìm theo tên, mô tả, điều kiện..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="md:ml-auto md:max-w-xs rounded-xl"
          />
        </div>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }, (_, i) => (
            <Card key={i} className="rounded-2xl">
              <Skeleton active paragraph={{ rows: 5 }} />
            </Card>
          ))}
        </div>
      ) : isError ? (
        <Alert
          type="error"
          showIcon
          message="Lỗi tải danh sách học bổng"
          description="Không thể tải danh sách chiến dịch học bổng. Vui lòng thử lại."
          action={<Button size="small" type="primary" onClick={() => refetch()}>Thử lại</Button>}
        />
      ) : visible.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-slate-200 text-center py-12">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              search || acceptingOnly
                ? "Không có chiến dịch phù hợp với bộ lọc."
                : statusTab === "CLOSED"
                ? "Chưa có chiến dịch nào kết thúc."
                : "Hiện chưa có chiến dịch học bổng nào đang hoạt động."
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {visible.map((campaign) => {
            const phase = getApplicationPhase(campaign);
            const myApp = byCampaign.get(campaign.id);
            const daysLeft = phase === "OPEN" ? daysUntil(campaign.applicationEnd) : null;
            const detailPath = `${ROUTES.STUDENT.SCHOLARSHIP_EXPLORE}/${campaign.id}`;

            return (
              <Card
                key={campaign.id}
                className={`rounded-2xl border shadow-2xs hover:shadow-md transition-all flex flex-col ${
                  phase === "OPEN" ? "border-indigo-200" : "border-slate-200"
                }`}
                styles={{ body: { display: "flex", flexDirection: "column", height: "100%" } }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg shrink-0">
                    <GiftOutlined />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Tag color={APPLICATION_PHASE_COLORS[phase]} className="!m-0 text-[11px] font-semibold border-none">
                      {APPLICATION_PHASE_LABELS[phase]}
                    </Tag>
                    {myApp && (
                      <Tag color={SCHOLARSHIP_APP_STATUS_COLORS[myApp.status]} className="!m-0 text-[10px] font-semibold">
                        Hồ sơ: {SCHOLARSHIP_APP_STATUS_LABELS[myApp.status]}
                      </Tag>
                    )}
                  </div>
                </div>

                <Link to={detailPath} className="mt-3 font-bold text-[15px] text-slate-900 hover:text-indigo-600 leading-snug line-clamp-2">
                  {campaign.title}
                </Link>
                <Paragraph className="!mt-1.5 !mb-0 text-xs text-slate-500" ellipsis={{ rows: 2 }}>
                  {campaign.description || campaign.eligibilityCriteria || "Chưa có mô tả."}
                </Paragraph>

                <div className="mt-4 rounded-xl bg-indigo-50/50 border border-indigo-100/60 p-3">
                  <div className="text-[11px] text-slate-500">Mức hỗ trợ / suất</div>
                  <div className="text-lg font-black text-indigo-700">{formatVND(campaign.awardAmountPerStudent)}</div>
                </div>

                <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <CalendarOutlined className="text-slate-400" />
                    Nhận hồ sơ: {formatDateVN(campaign.applicationStart)} – {formatDateVN(campaign.applicationEnd)}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <TeamOutlined className="text-slate-400" />
                    Chỉ tiêu: {campaign.expectedSlots} suất
                  </div>
                  {daysLeft !== null && (
                    <div className="flex items-center gap-1.5 font-semibold text-rose-600">
                      <ClockCircleOutlined />
                      {daysLeft > 0 ? `Còn ${daysLeft} ngày nhận hồ sơ` : "Hôm nay là hạn cuối"}
                    </div>
                  )}
                </div>

                <div className="mt-auto pt-4">
                  <Link to={detailPath} className="block">
                    <Button
                      block
                      type={phase === "OPEN" && !myApp ? "primary" : "default"}
                      className={`h-10 rounded-xl text-xs font-bold ${phase === "OPEN" && !myApp ? "bg-indigo-600" : ""}`}
                    >
                      {phase === "OPEN" && !myApp ? "Xem chi tiết & nộp hồ sơ" : "Xem chi tiết"}
                    </Button>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {data && data.total > PAGE_SIZE && (
        <div className="flex justify-center pt-2">
          <Pagination current={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} showSizeChanger={false} />
        </div>
      )}
    </div>
  );
}
