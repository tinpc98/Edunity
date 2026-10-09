import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Typography,
  Card,
  Table,
  Tag,
  Button,
  Select,
  Row,
  Col,
  Statistic,
  Modal,
  Descriptions,
  Empty,
  Skeleton,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  HeartOutlined,
  DollarOutlined,
  ReloadOutlined,
  EyeOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { sponsorContributionService, contributionKeys } from "../../../services/sponsorContribution.service";
import { campaignKeys } from "../../../services/campaign.service";
import { financeKeys } from "../../../services/finance.service";
import type { SponsorContribution, ContributionStatus } from "../../../types/campaign";
import {
  CONTRIBUTION_STATUS_LABELS,
  CONTRIBUTION_STATUS_COLORS,
} from "../../../types/campaign";
import { formatVND } from "../../../types/payment";

const { Title, Text } = Typography;

export default function SponsorContributionsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selectedContribution, setSelectedContribution] = useState<SponsorContribution | null>(null);
  const [impactModalCampaignId, setImpactModalCampaignId] = useState<string | null>(null);

  const {
    data,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: contributionKeys.myList({ page, pageSize, status: statusFilter === "ALL" ? undefined : statusFilter }),
    queryFn: () =>
      sponsorContributionService.getMyContributions({
        page,
        pageSize,
        status: statusFilter === "ALL" ? undefined : statusFilter,
      }),
  });

  // Query impact report when modal is open
  const { data: impactData, isLoading: isLoadingImpact } = useQuery({
    queryKey: contributionKeys.impact(impactModalCampaignId || ""),
    queryFn: () => (impactModalCampaignId ? sponsorContributionService.getCampaignImpact(impactModalCampaignId) : null),
    enabled: Boolean(impactModalCampaignId),
  });

  const contributions = data?.items || [];
  const total = data?.total || 0;
  const totalContributed = data?.totalContributed || 0;

  // Sandbox webhook trigger for PENDING contribution
  const confirmWebhookMutation = useMutation({
    mutationFn: (args: { reference: string; status: "SUCCESS" | "FAILED" }) =>
      sponsorContributionService.triggerSandboxWebhook(args.reference, args.status),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: contributionKeys.all });
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
      queryClient.invalidateQueries({ queryKey: financeKeys.all });
      setSelectedContribution(null);

      if (res.contributionStatus === "COMPLETED" || res.result === "CONTRIBUTION_SUCCESS") {
        message.success("Xác nhận tài trợ thành công! Quỹ đã được ghi nhận.");
      } else {
        message.error("Giao dịch tài trợ không thành công.");
      }
    },
    onError: (err: any) => {
      message.error(err.message || "Lỗi xử lý xác nhận.");
    },
  });

  const columns: ColumnsType<SponsorContribution> = [
    {
      title: "Chiến dịch học bổng",
      dataIndex: "campaignTitle",
      key: "campaignTitle",
      render: (title: string, record) => (
        <div>
          <Link
            to={`/campaigns/${record.campaignId}`}
            className="font-semibold text-slate-800 hover:text-indigo-600 transition-colors line-clamp-1"
          >
            {title || "Chiến dịch học bổng"}
          </Link>
          <div className="font-mono text-[11px] text-slate-400">
            Mã: #{record.paymentReference || record.id.slice(-6)}
          </div>
        </div>
      ),
    },
    {
      title: "Số tiền tài trợ",
      dataIndex: "amount",
      key: "amount",
      align: "right",
      render: (amount: number) => (
        <span className="font-bold text-emerald-600 text-sm">
          {formatVND(amount)}
        </span>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "contributionStatus",
      key: "contributionStatus",
      align: "center",
      render: (status: ContributionStatus) => (
        <Tag color={CONTRIBUTION_STATUS_COLORS[status]} className="font-medium">
          {CONTRIBUTION_STATUS_LABELS[status] || status}
        </Tag>
      ),
    },
    {
      title: "Thời gian",
      dataIndex: "contributedAt",
      key: "contributedAt",
      render: (date: string) => (
        <div className="text-xs text-slate-500">
          <div>{new Date(date).toLocaleDateString("vi-VN")}</div>
          <div className="text-[11px] text-slate-400">
            {new Date(date).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      ),
    },
    {
      title: "Thao tác",
      key: "actions",
      align: "right",
      render: (_, record) => (
        <div className="flex items-center justify-end gap-2">
          {record.contributionStatus === "PENDING" && (
            <Button
              type="primary"
              size="small"
              className="bg-indigo-600 hover:bg-indigo-500 text-xs"
              onClick={() => setSelectedContribution(record)}
            >
              Thanh toán
            </Button>
          )}

          {record.contributionStatus === "COMPLETED" && (
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => setImpactModalCampaignId(record.campaignId)}
            >
              Tác động
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Title level={3} className="!mb-1 !text-slate-900 font-bold flex items-center gap-2">
            <HeartOutlined className="text-rose-500" /> Lịch sử Đóng góp & Tài trợ
          </Title>
          <Text type="secondary" className="text-sm">
            Theo dõi tất cả các khoản tài trợ học bổng và báo cáo tác động xã hội thực tế.
          </Text>
        </div>

        <div className="flex items-center gap-3">
          <Link to="/campaigns">
            <Button type="primary" icon={<ArrowRightOutlined />} className="bg-indigo-600 hover:bg-indigo-500 rounded-xl">
              Khám phá chiến dịch
            </Button>
          </Link>
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

      {/* Summary Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12}>
          <Card className="rounded-2xl border-slate-200/80 shadow-xs bg-emerald-50/40 border-emerald-200">
            <Statistic
              title={<span className="text-xs font-semibold text-emerald-800 uppercase">Tổng số tiền đã đóng góp</span>}
              value={totalContributed}
              formatter={(val) => formatVND(Number(val))}
              prefix={<DollarOutlined className="text-emerald-600 text-xl mr-2" />}
              valueStyle={{ color: "#059669", fontWeight: "bold" }}
            />
            <div className="mt-2 text-xs text-emerald-600/80">
              Tổng số tiền từ tất cả các lần tài trợ thành công (COMPLETED)
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12}>
          <Card className="rounded-2xl border-slate-200/80 shadow-xs">
            <Statistic
              title={<span className="text-xs font-semibold text-slate-500 uppercase">Tổng số lượt tài trợ</span>}
              value={total}
              prefix={<HeartOutlined className="text-indigo-500 text-xl mr-2" />}
              valueStyle={{ color: "#1e293b", fontWeight: "bold" }}
            />
            <div className="mt-2 text-xs text-slate-400">
              Số giao dịch tài trợ đã được khởi tạo trên nền tảng
            </div>
          </Card>
        </Col>
      </Row>

      {/* Filter Bar */}
      <Card className="rounded-xl border-slate-200/80 shadow-2xs">
        <div className="flex items-center gap-4">
          <span className="text-xs font-semibold text-slate-600 uppercase">Trạng thái:</span>
          <Select
            value={statusFilter}
            onChange={(val) => {
              setStatusFilter(val);
              setPage(1);
            }}
            style={{ width: 200 }}
            options={[
              { value: "ALL", label: "Tất cả trạng thái" },
              { value: "PENDING", label: "Chờ thanh toán (PENDING)" },
              { value: "COMPLETED", label: "Hoàn thành (COMPLETED)" },
              { value: "FAILED", label: "Thất bại (FAILED)" },
            ]}
          />
        </div>
      </Card>

      {/* Table */}
      <Card className="rounded-2xl border-slate-200/80 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton active paragraph={{ rows: 6 }} />
          </div>
        ) : contributions.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div className="space-y-2 py-4">
                <p className="text-slate-600 font-medium">Bạn chưa có giao dịch tài trợ nào.</p>
                <p className="text-slate-400 text-xs">
                  Hãy chung tay cùng Edunity để trao học bổng cho các học sinh có hoàn cảnh khó khăn.
                </p>
                <Link to="/campaigns">
                  <Button type="primary" className="bg-indigo-600 hover:bg-indigo-500 mt-2">
                    Khám phá chiến dịch ngay
                  </Button>
                </Link>
              </div>
            }
          />
        ) : (
          <Table<SponsorContribution>
            columns={columns}
            dataSource={contributions}
            rowKey="id"
            pagination={{
              current: page,
              pageSize: pageSize,
              total: total,
              showSizeChanger: true,
              pageSizeOptions: ["10", "20", "50"],
              onChange: (p, ps) => {
                setPage(p);
                setPageSize(ps);
              },
              showTotal: (t) => `Tổng cộng ${t} giao dịch tài trợ`,
            }}
          />
        )}
      </Card>

      {/* Pending Payment Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-base font-bold text-slate-800">
            <WalletOutlined className="text-indigo-600" /> Thanh toán tài trợ
          </div>
        }
        open={Boolean(selectedContribution)}
        onCancel={() => setSelectedContribution(null)}
        footer={null}
      >
        {selectedContribution && (
          <div className="py-2 space-y-5">
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Chiến dịch">
                <span className="font-semibold">{selectedContribution.campaignTitle}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Mã đối soát">
                <span className="font-mono text-xs">{selectedContribution.paymentReference}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Số tiền">
                <span className="font-bold text-emerald-600 text-lg">
                  {formatVND(selectedContribution.amount)}
                </span>
              </Descriptions.Item>
            </Descriptions>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                type="primary"
                block
                icon={<CheckCircleOutlined />}
                loading={confirmWebhookMutation.isPending}
                onClick={() =>
                  confirmWebhookMutation.mutate({
                    reference: selectedContribution.paymentReference || "",
                    status: "SUCCESS",
                  })
                }
                className="h-11 bg-emerald-600 hover:bg-emerald-500 font-semibold rounded-xl"
              >
                Xác nhận thành công
              </Button>

              <Button
                danger
                block
                icon={<CloseCircleOutlined />}
                loading={confirmWebhookMutation.isPending}
                onClick={() =>
                  confirmWebhookMutation.mutate({
                    reference: selectedContribution.paymentReference || "",
                    status: "FAILED",
                  })
                }
                className="h-11 font-semibold rounded-xl"
              >
                Mô phỏng thất bại
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Impact Report Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-base font-bold text-slate-800">
            <HeartOutlined className="text-rose-500" /> Báo cáo tác động học bổng
          </div>
        }
        open={Boolean(impactModalCampaignId)}
        onCancel={() => setImpactModalCampaignId(null)}
        footer={[
          <Button key="close" onClick={() => setImpactModalCampaignId(null)}>
            Đóng
          </Button>,
        ]}
        width={650}
      >
        {isLoadingImpact ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : impactData ? (
          <div className="py-3 space-y-5">
            <div className="p-4 bg-indigo-50/70 rounded-2xl border border-indigo-100">
              <div className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">
                Đóng góp của bạn cho chiến dịch
              </div>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {formatVND(impactData.myContribution.total)}
                <span className="text-xs font-normal text-slate-500 ml-2">
                  (Chiếm {impactData.myContribution.shareOfFund}% tổng quỹ chiến dịch)
                </span>
              </div>
            </div>

            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Học sinh nhận học bổng" span={1}>
                <span className="font-bold text-indigo-600">
                  {impactData.impact.sponsoredStudentCount} học sinh
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Đang theo học" span={1}>
                <span className="font-bold text-emerald-600">
                  {impactData.impact.studentsUsingScholarshipCount} học sinh
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Lượt đăng ký được tài trợ" span={1}>
                <span className="font-bold text-slate-800">
                  {impactData.impact.enrollmentsFundedCount} lượt
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Lớp học được hỗ trợ" span={1}>
                <span className="font-bold text-slate-800">
                  {impactData.impact.classesSupportedCount} lớp
                </span>
              </Descriptions.Item>
            </Descriptions>

            <div className="text-xs text-slate-400 bg-slate-50 p-3 rounded-xl border border-slate-100">
              * Báo cáo tác động tổng hợp số liệu giải ngân và số lượng học viên được hỗ trợ học tập theo thời gian thực mà không công khai danh tính cá nhân của học sinh nhằm bảo vệ quyền riêng tư.
            </div>
          </div>
        ) : (
          <Empty description="Không tìm thấy báo cáo tác động cho chiến dịch này." />
        )}
      </Modal>
    </div>
  );
}
