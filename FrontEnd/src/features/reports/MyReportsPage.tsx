import React, { useState } from "react";
import {
  Card,
  Button,
  Tag,
  Pagination,
  Empty,
  Spin,
  Typography,
} from "antd";
import {
  AlertOutlined,
  PlusOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  BookOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { reportService, reportKeys } from "../../services/report.service";
import type { ReportStatus } from "../../types/communication";
import { CreateReportModal } from "./components/CreateReportModal";

const { Title, Text } = Typography;

const STATUS_CONFIG: Record<
  ReportStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  OPEN: {
    label: "Chờ tiếp nhận",
    color: "gold",
    icon: <ClockCircleOutlined />,
  },
  IN_REVIEW: {
    label: "Đang xem xét",
    color: "processing",
    icon: <SyncOutlined spin />,
  },
  RESOLVED: {
    label: "Đã giải quyết",
    color: "success",
    icon: <CheckCircleOutlined />,
  },
  REJECTED: {
    label: "Đã từ chối",
    color: "error",
    icon: <CloseCircleOutlined />,
  },
};

const TYPE_LABELS: Record<string, string> = {
  TEACHER_ABSENT: "Giáo viên vắng mặt",
  TEACHING_QUALITY: "Chất lượng giảng dạy",
  PAYMENT_DISPUTE: "Học phí & Thanh toán",
  INAPPROPRIATE_BEHAVIOR: "Hành vi vi phạm",
  FRAUD: "Gian lận",
  OTHER: "Vấn đề khác",
};

export const MyReportsPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: reportKeys.myReports({ page, pageSize }),
    queryFn: () => reportService.getMyReports({ page, pageSize }),
  });

  const items = data?.items || [];
  const total = data?.total || 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <Title level={2} className="!mb-1 flex items-center gap-2">
            <AlertOutlined className="text-rose-600" />
            Khiếu nại & Báo cáo của tôi
          </Title>
          <Text type="secondary">
            Theo dõi tiến độ xử lý khiếu nại và phản hồi từ Ban Quản Trị Edunity.
          </Text>
        </div>

        <Button
          type="primary"
          danger
          icon={<PlusOutlined />}
          onClick={() => setIsModalOpen(true)}
          className="rounded-xl h-10 px-5 font-semibold shrink-0"
        >
          Gửi khiếu nại mới
        </Button>
      </div>

      <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex justify-center items-center">
            <Spin size="large" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Bạn chưa gửi khiếu nại hoặc báo cáo nào."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((item) => {
              const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.OPEN;
              return (
                <div key={item.id} className="p-5 hover:bg-slate-50/50 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Tag
                        color={statusCfg.color}
                        icon={statusCfg.icon}
                        className="font-semibold text-xs py-0.5 px-2.5 rounded-full"
                      >
                        {statusCfg.label}
                      </Tag>
                      <Tag className="text-xs bg-slate-100 border-0 text-slate-700">
                        {TYPE_LABELS[item.type] || item.type}
                      </Tag>
                      {item.classSummary && (
                        <span className="text-xs text-indigo-600 flex items-center gap-1 font-medium">
                          <BookOutlined /> Lớp: {item.classSummary.className}
                        </span>
                      )}
                      {item.reportedUser && (
                        <span className="text-xs text-slate-600 flex items-center gap-1">
                          <UserOutlined /> Đối tượng: {item.reportedUser.fullName}
                        </span>
                      )}
                    </div>

                    <span className="text-xs text-slate-400">
                      {new Date(item.createdAt).toLocaleString("vi-VN")}
                    </span>
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 mt-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                      Nội dung bạn gửi:
                    </p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {item.description}
                    </p>
                  </div>

                  {/* Resolution note from admin */}
                  {item.reviewNote && (
                    <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200 mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                          <CheckCircleOutlined /> Phản hồi từ Ban Quản Trị:
                        </span>
                        {item.reviewedAt && (
                          <span className="text-[11px] text-emerald-600">
                            {new Date(item.reviewedAt).toLocaleDateString("vi-VN")}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-emerald-900 whitespace-pre-wrap leading-relaxed">
                        {item.reviewNote}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {total > pageSize && (
          <div className="p-4 border-t border-slate-100 flex justify-end">
            <Pagination
              current={page}
              pageSize={pageSize}
              total={total}
              onChange={(p, ps) => {
                setPage(p);
                setPageSize(ps);
              }}
              showSizeChanger
              pageSizeOptions={["10", "20", "50"]}
            />
          </div>
        )}
      </Card>

      <CreateReportModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};
