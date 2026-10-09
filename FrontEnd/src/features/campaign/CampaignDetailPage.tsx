import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Typography,
  Card,
  Row,
  Col,
  Tag,
  Progress,
  Button,
  InputNumber,
  Breadcrumb,
  Alert,
  Skeleton,
  Modal,
  Descriptions,
  message,
  Divider,
} from "antd";
import {
  CalendarOutlined,
  CheckCircleOutlined,
  HeartOutlined,
  ArrowLeftOutlined,
  WalletOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";
import { campaignService, campaignKeys } from "../../services/campaign.service";
import { sponsorContributionService, contributionKeys } from "../../services/sponsorContribution.service";
import { financeKeys } from "../../services/finance.service";
import { useAuthStore } from "../../stores/auth.store";
import type { CreateContributionResponse } from "../../types/campaign";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_COLORS,
} from "../../types/campaign";
import { formatVND } from "../../types/payment";

const { Title, Text, Paragraph } = Typography;

const PRESET_AMOUNTS = [
  100_000,
  200_000,
  500_000,
  1_000_000,
  2_000_000,
  5_000_000,
];

export default function PublicCampaignDetailPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuthStore();

  const [contributionAmount, setContributionAmount] = useState<number>(500_000);
  const [pendingContribution, setPendingContribution] = useState<CreateContributionResponse | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Fetch campaign detail
  const {
    data: campaign,
    isLoading,
    isError,
  } = useQuery({
    queryKey: campaignKeys.detail(campaignId || ""),
    queryFn: () => (campaignId ? campaignService.getCampaign(campaignId) : null),
    enabled: Boolean(campaignId),
  });

  // Mutation to create contribution intent
  const createContributionMutation = useMutation({
    mutationFn: (amount: number) => {
      if (!campaignId) throw new Error("Mã chiến dịch không hợp lệ.");
      return sponsorContributionService.createContribution(campaignId, { amount });
    },
    onSuccess: (data) => {
      setPendingContribution(data);
      setIsModalOpen(true);
      message.info("Đã tạo yêu cầu tài trợ. Vui lòng hoàn tất thanh toán.");
    },
    onError: (err: any) => {
      message.error(err.message || "Không thể khởi tạo phiên tài trợ. Vui lòng thử lại.");
    },
  });

  // Mutation to confirm sandbox webhook
  const confirmWebhookMutation = useMutation({
    mutationFn: (status: "SUCCESS" | "FAILED") => {
      if (!pendingContribution?.gatewayReference) {
        throw new Error("Không tìm thấy mã đối soát thanh toán.");
      }
      return sponsorContributionService.triggerSandboxWebhook(
        pendingContribution.gatewayReference,
        status
      );
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
      queryClient.invalidateQueries({ queryKey: contributionKeys.all });
      queryClient.invalidateQueries({ queryKey: financeKeys.all });

      if (res.contributionStatus === "COMPLETED" || res.result === "CONTRIBUTION_SUCCESS") {
        message.success("Tài trợ thành công! Cảm ơn sự đóng góp quý báu của bạn.");
        setIsModalOpen(false);
        setPendingContribution(null);
      } else {
        message.error("Giao dịch tài trợ không thành công.");
      }
    },
    onError: (err: any) => {
      message.error(err.message || "Lỗi xử lý xác nhận tài trợ.");
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto py-12 px-4 space-y-6">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (isError || !campaign) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center space-y-4">
        <Alert
          type="error"
          message="Không tìm thấy chiến dịch"
          description="Chiến dịch học bổng không tồn tại hoặc chưa được công khai."
          showIcon
        />
        <Link to="/campaigns">
          <Button icon={<ArrowLeftOutlined />}>Quay lại danh sách chiến dịch</Button>
        </Link>
      </div>
    );
  }

  const isClosed = campaign.status === "CLOSED";
  const isAcceptingFunding = campaign.isAcceptingFunding;

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { title: <Link to="/">Trang chủ</Link> },
            { title: <Link to="/campaigns">Chiến dịch học bổng</Link> },
            { title: campaign.title },
          ]}
        />

        {/* Top Header Card */}
        <Card className="rounded-3xl border-slate-200/80 shadow-sm p-2 md:p-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="space-y-3 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Tag
                  color={CAMPAIGN_STATUS_COLORS[campaign.status]}
                  className="rounded-full px-3 py-1 font-semibold text-xs"
                >
                  {CAMPAIGN_STATUS_LABELS[campaign.status] || campaign.status}
                </Tag>
                {isAcceptingFunding && (
                  <Tag color="cyan" className="rounded-full px-3 py-1 font-semibold text-xs border-0">
                    Đang tiếp nhận đóng góp
                  </Tag>
                )}
              </div>

              <Title level={2} className="!mb-2 !text-slate-900 font-black tracking-tight text-2xl md:text-4xl">
                {campaign.title}
              </Title>

              <div className="flex flex-wrap items-center gap-6 text-xs text-slate-500 font-medium">
                {campaign.fundingStart && campaign.fundingEnd && (
                  <span className="flex items-center gap-1.5">
                    <CalendarOutlined className="text-indigo-500" />
                    Thời gian gây quỹ: {new Date(campaign.fundingStart).toLocaleDateString("vi-VN")} - {new Date(campaign.fundingEnd).toLocaleDateString("vi-VN")}
                  </span>
                )}
                {campaign.contributionCount > 0 && (
                  <span className="flex items-center gap-1.5 text-indigo-600 font-semibold">
                    <HeartOutlined /> {campaign.contributionCount} lượt tài trợ đã hoàn thành
                  </span>
                )}
              </div>
            </div>

            <Link to="/campaigns">
              <Button icon={<ArrowLeftOutlined />} className="rounded-xl">
                Tất cả chiến dịch
              </Button>
            </Link>
          </div>

          <Divider className="my-6" />

          {/* Funding Progress Banner */}
          <div className="space-y-3 bg-gradient-to-r from-indigo-50/70 to-blue-50/70 p-6 rounded-2xl border border-indigo-100">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <div>
                <span className="text-xs uppercase font-bold tracking-wider text-indigo-700">Tiến độ quyên góp quỹ</span>
                <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
                  {formatVND(campaign.fundedAmount)}
                  <span className="text-sm font-normal text-slate-500 ml-2">
                    / mục tiêu {formatVND(campaign.targetBudget)}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-3xl font-black text-indigo-600">{campaign.fundingProgress}%</span>
              </div>
            </div>

            <Progress
              percent={campaign.fundingProgress}
              showInfo={false}
              strokeColor={{ "0%": "#6366f1", "100%": "#2563eb" }}
              size={["100%", 12]}
            />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-indigo-100/60 text-xs">
              <div>
                <div className="text-slate-500">Đã cấp học bổng</div>
                <div className="font-bold text-slate-800 text-sm mt-0.5">{formatVND(campaign.allocatedAmount)}</div>
              </div>
              <div>
                <div className="text-slate-500">Đã giải ngân học phí</div>
                <div className="font-bold text-slate-800 text-sm mt-0.5">{formatVND(campaign.usedAmount)}</div>
              </div>
              <div>
                <div className="text-slate-500">Quỹ còn khả dụng</div>
                <div className="font-bold text-emerald-600 text-sm mt-0.5">{formatVND(campaign.availableFund)}</div>
              </div>
              <div>
                <div className="text-slate-500">Tổng suất học bổng</div>
                <div className="font-bold text-indigo-700 text-sm mt-0.5">{campaign.expectedSlots} suất</div>
              </div>
            </div>
          </div>
        </Card>

        {/* Content & Contribution Grid */}
        <Row gutter={[24, 24]}>
          {/* Left Column: Details & Criteria */}
          <Col xs={24} lg={15}>
            <div className="space-y-6">
              {/* Description */}
              <Card className="rounded-2xl border-slate-200/80 shadow-xs" title="Ý nghĩa & Mục tiêu chương trình">
                <Paragraph className="text-slate-700 leading-relaxed whitespace-pre-line text-sm">
                  {campaign.description || "Chưa có mô tả chi tiết."}
                </Paragraph>
              </Card>

              {/* Eligibility Criteria */}
              <Card className="rounded-2xl border-slate-200/80 shadow-xs" title="Tiêu chí xét duyệt học bổng">
                <Paragraph className="text-slate-700 leading-relaxed whitespace-pre-line text-sm">
                  {campaign.eligibilityCriteria || "Áp dụng theo quy chế xét duyệt học bổng chung của Edunity."}
                </Paragraph>
              </Card>

              {/* Scope details */}
              {campaign.scopeDetail && (
                <Card className="rounded-2xl border-slate-200/80 shadow-xs" title="Phạm vi môn học & Khóa học hỗ trợ">
                  <div className="space-y-4">
                    {campaign.scopeDetail.categories && campaign.scopeDetail.categories.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Danh mục:</div>
                        <div className="flex flex-wrap gap-2">
                          {campaign.scopeDetail.categories.map((c) => (
                            <Tag key={c._id} color="blue">{c.name}</Tag>
                          ))}
                        </div>
                      </div>
                    )}

                    {campaign.scopeDetail.subjects && campaign.scopeDetail.subjects.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Môn học:</div>
                        <div className="flex flex-wrap gap-2">
                          {campaign.scopeDetail.subjects.map((s) => (
                            <Tag key={s._id} color="purple">{s.name}</Tag>
                          ))}
                        </div>
                      </div>
                    )}

                    {campaign.scopeDetail.courses && campaign.scopeDetail.courses.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Khóa học cụ thể:</div>
                        <div className="flex flex-wrap gap-2">
                          {campaign.scopeDetail.courses.map((cr) => (
                            <Tag key={cr._id} color="cyan">{cr.title}</Tag>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              )}
            </div>
          </Col>

          {/* Right Column: Sponsor Contribution Box */}
          <Col xs={24} lg={9}>
            <Card className="rounded-3xl border-slate-200/80 shadow-md sticky top-6">
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 text-lg">
                    <HeartOutlined />
                  </div>
                  <div>
                    <Title level={4} className="!mb-0 !text-slate-900 font-bold">
                      Đóng góp tài trợ
                    </Title>
                    <Text type="secondary" className="text-xs">
                      Mỗi khoản tài trợ là một cánh cửa tương lai mở ra
                    </Text>
                  </div>
                </div>

                <Divider className="my-2" />

                {/* Role / Auth Check */}
                {!isAuthenticated ? (
                  <div className="space-y-4 text-center py-4">
                    <Paragraph className="text-slate-600 text-sm">
                      Bạn cần đăng nhập tài khoản <strong>Nhà tài trợ (Sponsor)</strong> để tham gia đóng góp cho chiến dịch này.
                    </Paragraph>
                    <Link to={`/login?redirect=/campaigns/${campaign.id}`}>
                      <Button type="primary" block className="h-11 rounded-xl bg-indigo-600 font-semibold">
                        Đăng nhập để tài trợ
                      </Button>
                    </Link>
                  </div>
                ) : user?.role !== "SPONSOR" ? (
                  <Alert
                    type="warning"
                    showIcon
                    message="Quyền đóng góp tài trợ"
                    description={
                      <span>
                        Tài khoản của bạn có vai trò <strong>{user?.role}</strong>. Chỉ tài khoản <strong>Nhà tài trợ (SPONSOR)</strong> mới có thể tạo giao dịch đóng góp vào quỹ.
                      </span>
                    }
                  />
                ) : !isAcceptingFunding ? (
                  <Alert
                    type="info"
                    showIcon
                    message="Tạm ngưng nhận đóng góp"
                    description={
                      isClosed
                        ? "Chiến dịch đã đóng lại sau khi hoàn thành mục tiêu gây quỹ."
                        : "Chiến dịch hiện không nằm trong khung thời gian nhận tài trợ."
                    }
                  />
                ) : (
                  /* Active Contribution Form for Sponsor */
                  <div className="space-y-5">
                    {/* Amount Presets */}
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-2 uppercase">
                        Chọn nhanh mức tài trợ:
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {PRESET_AMOUNTS.map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setContributionAmount(amt)}
                            className={`py-2 px-1 text-xs font-semibold rounded-xl border transition-all text-center cursor-pointer ${
                              contributionAmount === amt
                                ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                                : "bg-white text-slate-700 border-slate-200 hover:border-indigo-400"
                            }`}
                          >
                            {formatVND(amt)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom Amount Input */}
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1.5 uppercase">
                        Số tiền tài trợ tùy chỉnh (VNĐ):
                      </label>
                      <InputNumber
                        value={contributionAmount}
                        onChange={(val) => setContributionAmount(val || 0)}
                        min={10_000}
                        step={100_000}
                        className="w-full rounded-xl text-base font-bold text-slate-900"
                        formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                        parser={(value) => (value ? Number(value.replace(/\$\s?|(,*)/g, "")) : 0) as any}
                      />
                      <span className="text-[11px] text-slate-400 mt-1 block">
                        Tối thiểu 10,000 đ. Đơn vị tiền tệ: VNĐ
                      </span>
                    </div>

                    {/* Submit Button */}
                    <Button
                      type="primary"
                      block
                      size="large"
                      loading={createContributionMutation.isPending}
                      onClick={() => createContributionMutation.mutate(contributionAmount)}
                      disabled={contributionAmount <= 0}
                      className="h-12 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-base shadow-sm"
                    >
                      Xác nhận tài trợ ngay
                    </Button>
                  </div>
                )}

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-500 space-y-1">
                  <div className="font-semibold text-slate-700">Cam kết minh bạch:</div>
                  <div>• 100% số tiền tài trợ được chuyển thẳng vào quỹ học bổng theo đúng phạm vi.</div>
                  <div>• Báo cáo đối soát độc lập, bảo mật danh tính học sinh.</div>
                </div>
              </div>
            </Card>
          </Col>
        </Row>

        {/* Sandbox Webhook Simulation Modal */}
        <Modal
          title={
            <div className="flex items-center gap-2 text-base font-bold text-slate-800">
              <WalletOutlined className="text-indigo-600" /> Cổng thanh toán Sandbox (Mô phỏng tài trợ)
            </div>
          }
          open={isModalOpen}
          onCancel={() => setIsModalOpen(false)}
          footer={null}
        >
          {pendingContribution && (
            <div className="py-4 space-y-6">
              <Descriptions bordered size="small" column={1}>
                <Descriptions.Item label="Chiến dịch">
                  <span className="font-semibold text-slate-800">{campaign.title}</span>
                </Descriptions.Item>
                <Descriptions.Item label="Mã đối soát">
                  <span className="font-mono text-xs">{pendingContribution.gatewayReference}</span>
                </Descriptions.Item>
                <Descriptions.Item label="Số tiền">
                  <span className="font-bold text-lg text-emerald-600">
                    {formatVND(pendingContribution.amount)}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="Trạng thái">
                  <Tag color="gold">Chờ thanh toán (PENDING)</Tag>
                </Descriptions.Item>
              </Descriptions>

              <Alert
                type="info"
                message="Môi trường Sandbox Development"
                description="Hệ thống Backend cung cấp webhook mô phỏng cổng thanh toán để xác nhận giao dịch tài trợ thật và ghi nhận vào sổ cái."
              />

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button
                  type="primary"
                  block
                  icon={<CheckCircleOutlined />}
                  loading={confirmWebhookMutation.isPending}
                  onClick={() => confirmWebhookMutation.mutate("SUCCESS")}
                  className="h-11 bg-emerald-600 hover:bg-emerald-500 font-semibold rounded-xl"
                >
                  Xác nhận thành công
                </Button>

                <Button
                  danger
                  block
                  icon={<CloseCircleOutlined />}
                  loading={confirmWebhookMutation.isPending}
                  onClick={() => confirmWebhookMutation.mutate("FAILED")}
                  className="h-11 font-semibold rounded-xl"
                >
                  Mô phỏng thất bại
                </Button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
}
