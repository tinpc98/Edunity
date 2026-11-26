import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
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
  DeleteOutlined,
} from "@ant-design/icons";
import { campaignService, campaignKeys } from "../../../services/campaign.service";
import type { ScholarshipCampaign, CampaignStatus } from "../../../types/campaign";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_COLORS,
  FUNDING_STATUS_LABELS,
  FUNDING_STATUS_COLORS,
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_COLORS,
} from "../../../types/campaign";
import { formatVND } from "../../../types/payment";
import { ROUTES } from "../../../routes/routePaths";
import { AdminPageHero, AdminFilterBar, AdminFilterField, AdminTableCard } from "../../../components/admin";


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
      const missingDates = err.details?.missing as string[] | undefined;
      message.error(
        missingDates?.length
          ? "Cần cấu hình đủ lịch vận động và lịch nhận hồ sơ trước khi phát hành."
          : err.message || "Không thể phát hành chiến dịch."
      );
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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => campaignService.deleteCampaign(id),
    onSuccess: () => {
      message.success("Đã xóa chiến dịch nháp thành công.");
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
    },
    onError: (err: any) => {
      message.error(err.message || "Không thể xóa chiến dịch nháp.");
    },
  });

  const columns: ColumnsType<ScholarshipCampaign> = [
    {
      title: "Chiến dịch",
      dataIndex: "title",
      key: "title",
      width: "28%",
      render: (text: string, record) => (
        <div>
          <Link
            to={`/admin/campaigns/${record.id}`}
            className="font-bold text-slate-900 hover:text-teal-700 transition-colors line-clamp-1"
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
      width: "18%",
      render: (_, record) => {
        const percent = record.fundingProgress;
        return (
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="font-bold text-emerald-600">{formatVND(record.fundedAmount)}</span>
              <span className="font-bold text-teal-700">{percent}%</span>
            </div>
            <Progress percent={percent} showInfo={false} strokeColor="#0D9488" size="small" />
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
          <span className="font-bold text-teal-800">{record.expectedSlots} suất</span>
          <div className="text-[11px] text-slate-400">{formatVND(record.awardAmountPerStudent)}/suất</div>
        </div>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      align: "center",
      render: (status: CampaignStatus, record) => (
        <div className="flex flex-col items-center gap-1">
          <Tag color={CAMPAIGN_STATUS_COLORS[status]} className="font-semibold m-0">
            {CAMPAIGN_STATUS_LABELS[status] || status}
          </Tag>
          {status !== "DRAFT" && record.fundingStatus && (
            <Tag color={FUNDING_STATUS_COLORS[record.fundingStatus]} className="text-[11px] m-0">
              Gây quỹ: {FUNDING_STATUS_LABELS[record.fundingStatus] || record.fundingStatus}
            </Tag>
          )}
          {status !== "DRAFT" && record.applicationStatus && (
            <Tag color={APPLICATION_STATUS_COLORS[record.applicationStatus]} className="text-[11px] m-0">
              Hồ sơ: {APPLICATION_STATUS_LABELS[record.applicationStatus] || record.applicationStatus}
            </Tag>
          )}
        </div>
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
            <>
              <Popconfirm
                title="Phát hành chiến dịch?"
                description="Chiến dịch cần có lịch vận động và lịch nhận hồ sơ. Nếu còn thiếu, hệ thống sẽ mở trang chi tiết để cấu hình trước khi phát hành."
                onConfirm={() => {
                  const scheduleComplete = Boolean(record.fundingStart && record.fundingEnd && record.applicationStart && record.applicationEnd);
                  if (!scheduleComplete) {
                    navigate(`/admin/campaigns/${record.id}`);
                    return;
                  }
                  publishMutation.mutate(record.id);
                }}
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

              <Popconfirm
                title="Xóa chiến dịch nháp?"
                description="Bạn có chắc chắn muốn xóa chiến dịch nháp này không? Hành động này không thể hoàn tác."
                onConfirm={() => deleteMutation.mutate(record.id)}
                okText="Xóa"
                cancelText="Hủy"
                okButtonProps={{ danger: true }}
              >
                <Button
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  loading={deleteMutation.isPending}
                >
                  Xóa
                </Button>
              </Popconfirm>
            </>
          )}

          {record.status === "OPEN_FOR_FUNDING" && (
            <Popconfirm
              title="Đóng chiến dịch?"
              description="Hành động này sẽ đóng chính thức toàn bộ chiến dịch, bao gồm cả cổng gây quỹ và tiếp nhận hồ sơ."
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
    <div className="flex flex-col gap-5 w-full pb-10">
      <AdminPageHero
        icon={<SafetyCertificateOutlined />}
        title="Quản lý Chiến dịch Học bổng"
        crumb="Chiến dịch"
        description="Tạo lập, phát hành và giám sát tiến độ gây quỹ các chương trình học bổng trên toàn hệ thống."
        extra={
          <div className="flex items-center gap-2">
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
                className="bg-[#0D9488] hover:bg-[#0B746C] rounded-xl font-bold shadow-xs"
              >
                Tạo chiến dịch mới
              </Button>
            </Link>
          </div>
        }
      />

      {/* Main Data Table + Filter bar */}
      <AdminTableCard>
        <AdminFilterBar
          title="Bộ lọc chiến dịch"
          gridClassName="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
          onReset={() => { setStatusFilter("ALL"); setPage(1); }}
          hasFilter={statusFilter !== "ALL"}
        >
          <AdminFilterField label="Trạng thái">
            <Select
              value={statusFilter}
              onChange={(val) => {
                setStatusFilter(val);
                setPage(1);
              }}
              className="w-full rounded-xl"
              options={[
                { value: "ALL", label: "Tất cả trạng thái" },
                { value: "DRAFT", label: "Bản nháp (DRAFT)" },
                { value: "OPEN_FOR_FUNDING", label: "Đang gây quỹ (OPEN_FOR_FUNDING)" },
                { value: "CLOSED", label: "Đã đóng (CLOSED)" },
              ]}
            />
          </AdminFilterField>
        </AdminFilterBar>

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
          <div className="overflow-x-auto">
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
              className="border-t border-slate-100"
            />
          </div>
        )}
      </AdminTableCard>
    </div>
  );
}
