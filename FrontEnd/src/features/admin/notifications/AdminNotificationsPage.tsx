import { useState, useMemo } from "react";
import {
  Tabs,
  Button,
  Pagination,
  Empty,
  Spin,
  Typography,
  Tag,
  Select,
  Alert,
  Tooltip,
} from "antd";
import {
  CheckOutlined,
  BellOutlined,
  SyncOutlined,
  MessageOutlined,
  StarOutlined,
  AlertOutlined,
  CheckCircleOutlined,
  TrophyOutlined,
  NotificationOutlined,
  DollarOutlined,
  RightOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { notificationService, notificationKeys } from "../../../services/notification.service";
import type { NotificationItem } from "../../../types/communication";
import { useAuthStore } from "../../../stores/auth.store";
import { getNotificationRoute, getNotificationLabel } from "../../notifications/notificationRoute";
import AdminPageHeader from "../../../components/admin/AdminPageHeader";
import AdminSectionCard from "../../../components/admin/AdminSectionCard";

const { Text, Paragraph } = Typography;

function getNotificationCategory(type?: string): "FINANCE" | "TEACHER" | "CLASS" | "SCHOLARSHIP" | "SYSTEM" {
  const t = type || "";
  if (
    t.includes("PAYMENT") ||
    t.includes("PAYOUT") ||
    t.includes("REFUND") ||
    t.includes("CONTRIBUTION") ||
    t.includes("RECONCIL")
  ) {
    return "FINANCE";
  }
  if (
    t.includes("TEACHER") ||
    t.includes("DISCIPLINE") ||
    t.includes("INCIDENT") ||
    t.includes("WARNING") ||
    t.includes("VIOLATION")
  ) {
    return "TEACHER";
  }
  if (
    t.includes("CLASS") ||
    t.includes("COURSE") ||
    t.includes("SESSION") ||
    t.includes("RECORDING")
  ) {
    return "CLASS";
  }
  if (t.includes("SCHOLARSHIP")) {
    return "SCHOLARSHIP";
  }
  return "SYSTEM";
}

function getNotificationIcon(type?: string) {
  const category = getNotificationCategory(type);
  switch (category) {
    case "FINANCE":
      return <DollarOutlined className="text-amber-500 text-base" />;
    case "TEACHER":
      return <AlertOutlined className="text-rose-500 text-base" />;
    case "CLASS":
      return <CheckCircleOutlined className="text-teal-600 text-base" />;
    case "SCHOLARSHIP":
      return <TrophyOutlined className="text-purple-500 text-base" />;
    default:
      if (type?.includes("MESSAGE")) {
        return <MessageOutlined className="text-blue-500 text-base" />;
      }
      if (type?.includes("REVIEW")) {
        return <StarOutlined className="text-amber-500 text-base" />;
      }
      return <NotificationOutlined className="text-slate-500 text-base" />;
  }
}

function formatNotificationTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return "Vừa xong";
    if (diffMins < 60) return `${diffMins} phút trước`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} giờ trước`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return date.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function AdminNotificationsPage() {
  const [activeTab, setActiveTab] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(15);

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const unreadParam = activeTab === "unread" ? true : undefined;

  // Fetch notifications with automatic background invalidation support
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: notificationKeys.list({ page, pageSize, unread: unreadParam }),
    queryFn: () =>
      notificationService.getMyNotifications({
        page,
        pageSize,
        unread: unreadParam,
      }),
  });

  const rawItems = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const unreadCount = data?.unreadCount ?? 0;
  const readCount = Math.max(0, total - unreadCount);

  // Mutations
  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationService.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => notificationService.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });

  // Client-side category filtering
  const filteredItems = useMemo(() => {
    let items = rawItems;
    if (activeTab === "read") {
      items = items.filter((item) => item.isRead);
    }
    if (categoryFilter !== "ALL") {
      items = items.filter((item) => getNotificationCategory(item.type) === categoryFilter);
    }
    return items;
  }, [rawItems, activeTab, categoryFilter]);

  const handleNotificationClick = (item: NotificationItem) => {
    if (!item.isRead) {
      markReadMutation.mutate(item.id);
    }

    const targetRoute = getNotificationRoute(item.type, user?.role || "ADMIN");
    if (targetRoute && targetRoute !== "/admin/notifications") {
      navigate(targetRoute);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      {/* Mint/Teal Page Header */}
      <AdminPageHeader
        eyebrow="QUẢN TRỊ VIÊN"
        eyebrowIcon={<BellOutlined />}
        title="Thông báo"
        description="Cập nhật các hoạt động và yêu cầu cần theo dõi trong hệ thống."
        extra={
          <div className="flex items-center gap-2.5">
            <Button
              icon={<SyncOutlined spin={isFetching} />}
              onClick={() => refetch()}
              loading={isLoading}
              className="rounded-xl border-[#D6E5E2] text-[#0F766E] hover:border-[#0D9488]"
            >
              Làm mới
            </Button>
            {unreadCount > 0 && (
              <Button
                type="primary"
                icon={<CheckOutlined />}
                loading={markAllMutation.isPending}
                onClick={() => markAllMutation.mutate()}
                className="rounded-xl bg-[#0D9488] hover:bg-[#0F766E] border-none font-medium shadow-sm"
              >
                Đánh dấu tất cả đã đọc ({unreadCount})
              </Button>
            )}
          </div>
        }
      />

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-[#D6E5E2] shadow-[0_1px_6px_rgba(13,148,136,0.04)]">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tổng số thông báo</p>
          <p className="text-2xl font-bold text-[#163B40] mt-1">{total}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-[#D6E5E2] shadow-[0_1px_6px_rgba(13,148,136,0.04)]">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Chưa đọc</p>
          <p className="text-2xl font-bold text-[#0D9488] mt-1">{unreadCount}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-[#D6E5E2] shadow-[0_1px_6px_rgba(13,148,136,0.04)]">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Đã đọc</p>
          <p className="text-2xl font-bold text-slate-600 mt-1">{readCount}</p>
        </div>
      </div>

      {/* Main Notification Card with Filters and List */}
      <AdminSectionCard>
        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E2E8F0]">
          <Tabs
            activeKey={activeTab}
            onChange={(key) => {
              setActiveTab(key);
              setPage(1);
            }}
            className="admin-notification-tabs"
            items={[
              {
                key: "all",
                label: (
                  <span className="flex items-center gap-1.5 font-medium text-xs sm:text-sm">
                    Tất cả
                    {total > 0 && <Tag className="ml-1 rounded-full text-[11px] font-bold border-none bg-slate-100">{total}</Tag>}
                  </span>
                ),
              },
              {
                key: "unread",
                label: (
                  <span className="flex items-center gap-1.5 font-medium text-xs sm:text-sm">
                    Chưa đọc
                    {unreadCount > 0 && (
                      <Tag className="ml-1 rounded-full text-[11px] font-bold border-none bg-teal-100 text-teal-800">
                        {unreadCount}
                      </Tag>
                    )}
                  </span>
                ),
              },
              {
                key: "read",
                label: (
                  <span className="flex items-center gap-1.5 font-medium text-xs sm:text-sm">
                    Đã đọc
                    {readCount > 0 && (
                      <Tag className="ml-1 rounded-full text-[11px] font-bold border-none bg-slate-100 text-slate-600">
                        {readCount}
                      </Tag>
                    )}
                  </span>
                ),
              },
            ]}
          />

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Text strong className="text-xs text-slate-600 whitespace-nowrap">Danh mục:</Text>
            <Select
              value={categoryFilter}
              onChange={(val) => {
                setCategoryFilter(val);
                setPage(1);
              }}
              style={{ width: 190 }}
              className="rounded-xl text-xs"
            >
              <Select.Option value="ALL">Tất cả danh mục</Select.Option>
              <Select.Option value="FINANCE">Tài chính & Hoàn tiền</Select.Option>
              <Select.Option value="TEACHER">Giáo viên & Kỷ luật</Select.Option>
              <Select.Option value="CLASS">Lớp học & Khóa học</Select.Option>
              <Select.Option value="SCHOLARSHIP">Học bổng</Select.Option>
              <Select.Option value="SYSTEM">Hệ thống & Khác</Select.Option>
            </Select>
          </div>
        </div>

        {/* Content Body */}
        {isLoading ? (
          <div className="py-20 flex flex-col justify-center items-center gap-3">
            <Spin size="large" />
            <Text type="secondary" className="text-xs">Đang tải thông báo hệ thống...</Text>
          </div>
        ) : isError ? (
          <div className="py-12">
            <Alert
              type="error"
              showIcon
              message="Không thể tải thông báo"
              description="Hệ thống gặp sự cố khi đồng bộ danh sách thông báo. Vui lòng bấm thử lại."
              action={
                <Button size="small" danger onClick={() => refetch()}>
                  Thử lại
                </Button>
              }
            />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-16 text-center">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                activeTab === "unread"
                  ? "Bạn đã xem tất cả thông báo."
                  : categoryFilter !== "ALL"
                  ? "Không có thông báo nào trong danh mục này."
                  : "Bạn chưa có thông báo nào."
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-[#F1F5F9]">
            {filteredItems.map((item) => {
              const label = getNotificationLabel(item.type);
              const targetRoute = getNotificationRoute(item.type, user?.role || "ADMIN");
              const hasDeepLink = targetRoute && targetRoute !== "/admin/notifications";

              return (
                <div
                  key={item.id}
                  onClick={() => handleNotificationClick(item)}
                  className={`p-4 flex items-start gap-3.5 cursor-pointer transition-all duration-150 rounded-xl hover:bg-[#F0FDFA] group ${
                    !item.isRead ? "bg-[#F8FCFB] font-medium" : "bg-white"
                  }`}
                >
                  {/* Category icon */}
                  <div className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${!item.isRead ? "bg-teal-50 border border-teal-100" : "bg-slate-50 border border-slate-100"}`}>
                    {getNotificationIcon(item.type)}
                  </div>

                  {/* Notification Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Tag
                        color={!item.isRead ? "cyan" : "default"}
                        className="text-[10px] font-bold rounded-md px-1.5 py-0 border-none m-0 uppercase tracking-wider"
                      >
                        {label}
                      </Tag>
                      <span className="text-[11px] text-slate-400">
                        {formatNotificationTime(item.createdAt)}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between gap-2">
                      <Text
                        strong={!item.isRead}
                        className={`text-sm block ${!item.isRead ? "text-[#163B40] font-bold" : "text-slate-700"}`}
                      >
                        {item.title}
                      </Text>
                      {!item.isRead && (
                        <span className="w-2.5 h-2.5 rounded-full bg-[#0D9488] shrink-0 inline-block shadow-sm ring-2 ring-teal-100" />
                      )}
                    </div>

                    {item.content && (
                      <Paragraph
                        className="text-xs text-slate-600 mt-1 mb-0 leading-relaxed max-w-4xl"
                        ellipsis={{ rows: 2, expandable: false }}
                      >
                        {item.content}
                      </Paragraph>
                    )}

                    {/* Action pill / link */}
                    {hasDeepLink && (
                      <div className="mt-2.5 flex items-center gap-1 text-xs text-[#0F766E] font-semibold group-hover:text-[#0D9488]">
                        <span>Xem chi tiết nghiệp vụ</span>
                        <RightOutlined className="text-[10px] transition-transform group-hover:translate-x-0.5" />
                      </div>
                    )}
                  </div>

                  {/* Mark single as read button on hover */}
                  {!item.isRead && (
                    <Tooltip title="Đánh dấu đã đọc">
                      <Button
                        type="text"
                        size="small"
                        icon={<EyeOutlined />}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-[#0D9488]"
                        onClick={(e) => {
                          e.stopPropagation();
                          markReadMutation.mutate(item.id);
                        }}
                      />
                    </Tooltip>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {total > pageSize && (
          <div className="flex justify-center pt-6 mt-4 border-t border-[#E2E8F0]">
            <Pagination
              current={page}
              pageSize={pageSize}
              total={total}
              onChange={(p, ps) => {
                setPage(p);
                setPageSize(ps);
              }}
              showSizeChanger
              pageSizeOptions={["10", "15", "20", "50"]}
              showTotal={(tot) => `Tổng cộng ${tot} thông báo`}
            />
          </div>
        )}
      </AdminSectionCard>
    </div>
  );
}
