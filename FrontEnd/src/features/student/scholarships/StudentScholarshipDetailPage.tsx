import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Alert, Breadcrumb, Button, Card, Progress, Skeleton, Steps, Tag, Typography } from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileProtectOutlined,
  GiftOutlined,
  InfoCircleOutlined,
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
import ApplyScholarshipModal from "../../campaign/components/ApplyScholarshipModal";
import { useMyApplicationByCampaign } from "./hooks/useMyApplications";

const { Title, Paragraph } = Typography;

const REQUIRED_DOCUMENTS = [
  "Thư nguyện vọng: hoàn cảnh gia đình, động lực và mục tiêu học tập (tối thiểu 30 ký tự).",
  "Giấy tờ chứng minh hoàn cảnh (giấy xác nhận hộ nghèo/cận nghèo, xác nhận của địa phương...).",
  "Giấy tờ chứng minh thành tích học tập nếu có (bảng điểm, giấy khen...).",
  "Định dạng PDF, JPG, PNG hoặc WebP, tối đa 10MB mỗi tệp.",
];

function getStepStatus(start?: string | null, end?: string | null): "finish" | "process" | "wait" {
  const now = new Date();
  if (end && new Date(end) < now) return "finish";
  if (start && new Date(start) <= now) return "process";
  return "wait";
}

export default function StudentScholarshipDetailPage() {
  const { campaignId = "" } = useParams<{ campaignId: string }>();
  const [isApplyOpen, setIsApplyOpen] = useState(false);

  const { data: campaign, isLoading, isError, error, refetch } = useQuery({
    queryKey: campaignKeys.detail(campaignId),
    queryFn: () => campaignService.getCampaign(campaignId),
    enabled: Boolean(campaignId),
  });
  const { byCampaign, isLoading: isAppsLoading } = useMyApplicationByCampaign();

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto">
        <Skeleton active paragraph={{ rows: 12 }} />
      </div>
    );
  }

  if (isError || !campaign) {
    const notFound = (error as { status?: number } | null)?.status === 404;
    return (
      <div className="max-w-6xl mx-auto">
        <Alert
          type={notFound ? "warning" : "error"}
          showIcon
          message={notFound ? "Không tìm thấy chiến dịch học bổng" : "Lỗi tải chiến dịch học bổng"}
          description={notFound ? "Chiến dịch không tồn tại hoặc chưa được công bố." : "Vui lòng thử lại sau ít phút."}
          action={
            notFound ? (
              <Link to={ROUTES.STUDENT.SCHOLARSHIP_EXPLORE}><Button size="small" type="primary">Quay lại danh sách</Button></Link>
            ) : (
              <Button size="small" type="primary" onClick={() => refetch()}>Thử lại</Button>
            )
          }
        />
      </div>
    );
  }

  const phase = getApplicationPhase(campaign);
  const myApp = byCampaign.get(campaign.id);
  // A rejected application does not block a new one (backend BR-29)
  const blockingApp = myApp && myApp.status !== "REJECTED" ? myApp : undefined;
  const canApply = phase === "OPEN" && !blockingApp && !isAppsLoading;
  const daysLeft = phase === "OPEN" ? daysUntil(campaign.applicationEnd) : null;
  const remainingSlots = Math.max(0, campaign.expectedSlots - campaign.awardedScholarshipCount);

  const timeline = [
    { title: "Gây quỹ", start: campaign.fundingStart, end: campaign.fundingEnd },
    { title: "Nhận hồ sơ", start: campaign.applicationStart, end: campaign.applicationEnd },
  ];
  const scope = campaign.scopeDetail;
  const hasScope = Boolean(scope && ((scope.categories?.length ?? 0) + (scope.subjects?.length ?? 0) + (scope.courses?.length ?? 0) > 0));

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <Breadcrumb
        items={[
          { title: <Link to={ROUTES.STUDENT.SCHOLARSHIP_EXPLORE} className="text-xs">Tìm học bổng</Link> },
          { title: <span className="text-xs font-semibold text-slate-800">{campaign.title}</span> },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-6">
          <Card className="rounded-2xl border-slate-200 shadow-2xs">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Tag color={APPLICATION_PHASE_COLORS[phase]} className="font-semibold border-none">
                {APPLICATION_PHASE_LABELS[phase]}
              </Tag>
              {daysLeft !== null && (
                <Tag icon={<ClockCircleOutlined />} color="volcano" className="font-semibold border-none">
                  {daysLeft > 0 ? `Còn ${daysLeft} ngày nhận hồ sơ` : "Hôm nay là hạn cuối"}
                </Tag>
              )}
            </div>
            <Title level={2} className="!mb-2 !text-2xl font-black text-slate-900 tracking-tight">
              {campaign.title}
            </Title>
            <Paragraph className="!mb-0 text-sm text-slate-600 whitespace-pre-line">
              {campaign.description || "Chiến dịch chưa có mô tả chi tiết."}
            </Paragraph>
          </Card>

          <Card
            className="rounded-2xl border-slate-200 shadow-2xs"
            title={<span className="text-sm font-bold"><CheckCircleOutlined className="text-emerald-600 mr-2" />Điều kiện xét duyệt</span>}
          >
            <Paragraph className="!mb-0 text-sm text-slate-700 whitespace-pre-line">
              {campaign.eligibilityCriteria || "Chiến dịch chưa công bố điều kiện cụ thể. Vui lòng mô tả rõ hoàn cảnh trong thư nguyện vọng."}
            </Paragraph>
          </Card>

          <Card
            className="rounded-2xl border-slate-200 shadow-2xs"
            title={<span className="text-sm font-bold"><InfoCircleOutlined className="text-indigo-600 mr-2" />Phạm vi áp dụng học bổng</span>}
          >
            {hasScope ? (
              <div className="space-y-3 text-sm">
                {(scope?.categories?.length ?? 0) > 0 && (
                  <div><span className="text-slate-500 mr-2">Danh mục:</span>{scope!.categories!.map((c) => <Tag key={c._id} color="purple">{c.name}</Tag>)}</div>
                )}
                {(scope?.subjects?.length ?? 0) > 0 && (
                  <div><span className="text-slate-500 mr-2">Môn học:</span>{scope!.subjects!.map((s) => <Tag key={s._id} color="blue">{s.name}</Tag>)}</div>
                )}
                {(scope?.courses?.length ?? 0) > 0 && (
                  <div><span className="text-slate-500 mr-2">Khóa học:</span>{scope!.courses!.map((c) => <Tag key={c._id} color="cyan">{c.title}</Tag>)}</div>
                )}
                <p className="text-xs text-slate-400 !mb-0">Học bổng chỉ dùng để thanh toán học phí cho các lớp thuộc phạm vi trên.</p>
              </div>
            ) : (
              <p className="text-sm text-slate-600 !mb-0">Áp dụng cho tất cả lớp học trên Edunity.</p>
            )}
          </Card>

          <Card className="rounded-2xl border-slate-200 shadow-2xs" title={<span className="text-sm font-bold">Mốc thời gian</span>}>
            <Steps
              direction="vertical"
              size="small"
              items={timeline.map((step) => ({
                title: step.title,
                description: `${formatDateVN(step.start)} – ${formatDateVN(step.end)}`,
                status: getStepStatus(step.start, step.end),
              }))}
            />
          </Card>

          <Card
            className="rounded-2xl border-slate-200 shadow-2xs"
            title={<span className="text-sm font-bold"><FileProtectOutlined className="text-indigo-600 mr-2" />Hồ sơ cần chuẩn bị</span>}
          >
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-slate-700 !mb-0">
              {REQUIRED_DOCUMENTS.map((doc) => <li key={doc}>{doc}</li>)}
            </ul>
          </Card>
        </div>

        <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-4">
          <Card className="rounded-2xl border-indigo-200 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl"><GiftOutlined /></div>
              <div>
                <div className="text-xs text-slate-500">Mức hỗ trợ / suất</div>
                <div className="text-2xl font-black text-indigo-700">{formatVND(campaign.awardAmountPerStudent)}</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-slate-50 p-2.5">
                <div className="text-base font-extrabold text-slate-800">{campaign.expectedSlots}</div>
                <div className="text-[11px] text-slate-500">Chỉ tiêu</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5">
                <div className="text-base font-extrabold text-emerald-700">{remainingSlots}</div>
                <div className="text-[11px] text-slate-500">Suất còn lại (dự kiến)</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex justify-between text-xs text-slate-500"><span>Tiến độ gây quỹ</span><b className="text-indigo-600">{campaign.fundingProgress}%</b></div>
              <Progress percent={campaign.fundingProgress} showInfo={false} strokeColor="#4f46e5" size="small" />
              <div className="text-[11px] text-slate-400">Đã gây quỹ {formatVND(campaign.fundedAmount)} / {formatVND(campaign.targetBudget)}</div>
            </div>

            <div className="mt-5">
              {blockingApp ? (
                <div className="space-y-3">
                  <Alert
                    type={blockingApp.status === "APPROVED" ? "success" : blockingApp.status === "NEED_MORE_INFORMATION" ? "warning" : "info"}
                    showIcon
                    className="rounded-xl text-xs"
                    message={
                      <span>
                        Hồ sơ của bạn: <Tag color={SCHOLARSHIP_APP_STATUS_COLORS[blockingApp.status]} className="ml-1">{SCHOLARSHIP_APP_STATUS_LABELS[blockingApp.status]}</Tag>
                      </span>
                    }
                    description={`Nộp ngày ${formatDateVN(blockingApp.submittedAt)}`}
                  />
                  <Link to={ROUTES.STUDENT.SCHOLARSHIP_APPLICATIONS} className="block">
                    <Button block className="h-10 rounded-xl font-semibold">
                      {blockingApp.status === "NEED_MORE_INFORMATION" ? "Bổ sung hồ sơ" : "Theo dõi hồ sơ"}
                    </Button>
                  </Link>
                </div>
              ) : (
                <>
                  {myApp?.status === "REJECTED" && phase === "OPEN" && (
                    <p className="text-xs text-slate-500 mb-2">Hồ sơ trước của bạn chưa được duyệt — bạn có thể nộp lại hồ sơ mới.</p>
                  )}
                  <Button
                    type="primary"
                    block
                    disabled={!canApply}
                    loading={isAppsLoading}
                    onClick={() => setIsApplyOpen(true)}
                    className="h-11 rounded-xl bg-indigo-600 font-bold"
                  >
                    {phase === "OPEN" ? "Nộp hồ sơ xin học bổng" : APPLICATION_PHASE_LABELS[phase]}
                  </Button>
                  {phase === "UPCOMING" && (
                    <p className="text-xs text-slate-500 mt-2 text-center">Mở nhận hồ sơ từ {formatDateVN(campaign.applicationStart)}.</p>
                  )}
                </>
              )}
            </div>
          </Card>
        </div>
      </div>

      <ApplyScholarshipModal open={isApplyOpen} onClose={() => setIsApplyOpen(false)} campaign={campaign} />
    </div>
  );
}
