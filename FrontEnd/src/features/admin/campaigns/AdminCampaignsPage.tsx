import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Typography,
  Card,
  Table,
  Tag,
  Progress,
  Button,
  Select,
  Popconfirm,
  message,
  Skeleton,
  Empty,
  Space,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
  SafetyCertificateOutlined,
  RocketOutlined,
} from "@ant-design/icons";
import { campaignService, campaignKeys } from "../../../services/campaign.service";
import type { ScholarshipCampaign, CampaignStatus } from "../../../types/campaign";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_COLORS,
} from "../../../types/campaign";
import { formatVND } from "../../../types/payment";
import { ROUTES } from "../../../routes/routePaths";

const { Title, Text } = Typography;

export default function AdminCampaignsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const {
    data,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: campaignKeys.adminList({ page, pageSize, status: statusFilter === "ALL" ? undefined : statusFilter }),
    queryFn: () =>
      campaignService.adminListCampaigns({
        page,
        pageSize,
        status: statusFilter === "ALL" ? undefined : statusFilter,
      }),
  });

  const campaigns = data?.items || [];
  const total = data?.total || 0;

  // Mutations for Publish / Close
  const publishMutation = useMutation({
    mutationFn: (id: string) => campaignService.publishCampaign(id),
    onSuccess: () => {
      message.success("Đã phát hành chiến dịch sang trạng thái Đang gây quỹ (OPEN_FOR_FUNDING).");
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

  const columns: ColumnsType<ScholarshipCampaign> = [
    {
      title: "Chiến dịch",
      dataIndex: "title",
      key: "title",
      width: "30%",
      render: (text: string, record) => (
        <div>
          <Link
            to={`/admin/campaigns/${record.id}`}
            className="font-bold text-slate-900 hover:text-indigo-600 transition-colors line-clamp-1"
          >
            {text}
          </Link>
          <div className="font-mono text-[11px] text-slate-400">
            ID: #{record.id.slice(-6).toUpperCase()}
          </div>
        </div>
      ),
    },
    {
      title: "Ngân sách mục tiêu",
      dataIndex: "targetBudget",
      key: "targetBudget",
      align: "right",
      render: (amount: number) => (
        <span className="font-semibold text-slate-800 text-sm">
          {formatVND(amount)}
        </span>
      ),
    },
    {
      title: "Đã huy động",
      key: "fundedAmount",
      width: "20%",
      render: (_, record) => {
        const percent = record.fundingProgress;
        return (
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="font-bold text-emerald-600">{formatVND(record.fundedAmount)}</span>
              <span className="font-bold text-indigo-600">{percent}%</span>
            </div>
            <Progress percent={percent} showInfo={false} strokeColor="#4f46e5" size="small" />
          </div>
        );
      },
    },
    {
      title: "Suất học bổng",
      key: "slots",
      align: "center",
      render: (_, record) => (
        <div className="text-xs">
          <span className="font-bold text-indigo-700">{record.expectedSlots} suất</span>
          <div className="text-[11px] text-slate-400">{formatVND(record.awardAmountPerStudent)}/suất</div>
        </div>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      align: "center",
      render: (status: CampaignStatus) => (
        <Tag color={CAMPAIGN_STATUS_COLORS[status]} className="font-semibold">
          {CAMPAIGN_STATUS_LABELS[status] || status}
        </Tag>
      ),
    },
    {
      title: "Thao tác",
      key: "action",
      align: "right",
      render: (_, record) => (
        <Space size="small">
          <Button
            type="primary"
            ghost
            size="small"
            onClick={() => navigate(`/admin/campaigns/${record.id}`)}
          >
            Quản lý
          </Button>

          {record.status === "DRAFT" && (
            <Popconfirm
              title="Phát hành chiến dịch?"
              description="Chiến dịch sẽ được chuyển sang trạng thái OPEN_FOR_FUNDING và công khai để nhận tài trợ."
              onConfirm={() => publishMutation.mutate(record.id)}
              okText="Phát hành"
              cancelText="Hủy"
            >
              <Button
                type="primary"
                size="small"
                icon={<RocketOutlined />}
                loading={publishMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-500 border-none"
              >
                Phát hành
              </Button>
            </Popconfirm>
          )}

          {record.status === "OPEN_FOR_FUNDING" && (
            <Popconfirm
              title="Đóng chiến dịch?"
              description="Chiến dịch sẽ ngừng tiếp nhận tài trợ từ các nhà hảo tâm."
              onConfirm={() => closeMutation.mutate(record.id)}
              okText="Đóng"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
            >
              <Button
                danger
                size="small"
                icon={<StopOutlined />}
                loading={closeMutation.isPending}
              >
                Đóng
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Title level={3} className="!mb-1 !text-slate-900 font-bold flex items-center gap-2">
            <SafetyCertificateOutlined className="text-indigo-600" /> Quản lý Chiến dịch Học bổng
          </Title>
          <Text type="secondary" className="text-sm">
            Tạo lập, phát hành và giám sát tiến độ gây quỹ các chương trình học bổng trên toàn hệ thống.
          </Text>
        </div>

        <div className="flex items-center gap-3">
          <Button
            icon={<ReloadOutlined spin={isFetching} />}
            onClick={() => refetch()}
            disabled={isLoading}
            className="rounded-xl"
          >
            Làm mới
          </Button>
          <Link to={ROUTES.ADMIN.CREATE_CAMPAIGN}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              className="bg-indigo-600 hover:bg-indigo-500 rounded-xl font-semibold shadow-xs"
            >
              Tạo chiến dịch mới
            </Button>
          </Link>
        </div>
      </div>

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
            style={{ width: 220 }}
            options={[
              { value: "ALL", label: "Tất cả trạng thái" },
              { value: "DRAFT", label: "Bản nháp (DRAFT)" },
              { value: "OPEN_FOR_FUNDING", label: "Đang gây quỹ (OPEN_FOR_FUNDING)" },
              { value: "CLOSED", label: "Đã đóng (CLOSED)" },
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
        ) : campaigns.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Chưa có chiến dịch nào phù hợp với bộ lọc."
          />
        ) : (
          <Table<ScholarshipCampaign>
            columns={columns}
            dataSource={campaigns}
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
              showTotal: (t) => `Tổng cộng ${t} chiến dịch`,
            }}
          />
        )}
      </Card>
    </div>
  );
}
