import React, { useState } from "react";
import { Tabs, Button, Pagination, Empty, Spin, Typography, Card, Tag } from "antd";
import {
  CheckOutlined,
  BellOutlined,
  MessageOutlined,
  StarOutlined,
  AlertOutlined,
  CheckCircleOutlined,
  TrophyOutlined,
  NotificationOutlined,
} from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { notificationService, notificationKeys } from "../../services/notification.service";
import type { NotificationItem } from "../../types/communication";
import { ROUTES } from "../../routes/routePaths";

const { Title, Text } = Typography;

function getNotificationIcon(type: string) {
  if (type.includes("MESSAGE")) {
    return <MessageOutlined className="text-blue-500 text-lg" />;
  }
  if (type.includes("REVIEW")) {
    return <StarOutlined className="text-amber-500 text-lg" />;
  }
  if (type.includes("REPORT")) {
    return <AlertOutlined className="text-rose-500 text-lg" />;
  }
  if (type.includes("ENROLLMENT") || type.includes("VERIFIED") || type.includes("APPROVED")) {
    return <CheckCircleOutlined className="text-emerald-500 text-lg" />;
  }
  if (type.includes("SCHOLARSHIP")) {
    return <TrophyOutlined className="text-indigo-500 text-lg" />;
  }
  return <NotificationOutlined className="text-slate-500 text-lg" />;
}

export const NotificationsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>("all");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const unreadOnly = activeTab === "unread";

  const { data, isLoading } = useQuery({
    queryKey: notificationKeys.list({ page, pageSize, unread: unreadOnly || undefined }),
    queryFn: () =>
      notificationService.getMyNotifications({
        page,
        pageSize,
        unread: unreadOnly ? true : undefined,
      }),
  });

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

  const handleNotificationClick = (item: NotificationItem) => {
    if (!item.isRead) {
      markReadMutation.mutate(item.id);
    }

    if (item.type.includes("MESSAGE")) {
      navigate((ROUTES as any).MESSAGES || "/messages");
    } else if (item.type.includes("ENROLLMENT")) {
      navigate((ROUTES.STUDENT as any).ENROLLMENTS || ROUTES.STUDENT.HOME);
    } else if (item.type.includes("SCHOLARSHIP")) {
      navigate((ROUTES.STUDENT as any).SCHOLARSHIPS || ROUTES.STUDENT.HOME);
    } else if (item.type.includes("REPORT")) {
      navigate("/reports");
    } else if (item.type.includes("REVIEW")) {
      navigate("/teacher/reviews");
    }
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <Title level={2} className="!mb-1 flex items-center gap-2">
            <BellOutlined className="text-indigo-600" />
            Trung tâm thông báo
          </Title>
          <Text type="secondary">
            Theo dõi tất cả cập nhật về lớp học, tin nhắn, học bổng và tài khoản của bạn.
          </Text>
        </div>

        {unreadCount > 0 && (
          <Button
            type="primary"
            icon={<CheckOutlined />}
            loading={markAllMutation.isPending}
            onClick={() => markAllMutation.mutate()}
            className="bg-indigo-600 hover:bg-indigo-700 shrink-0"
          >
            Đánh dấu tất cả đã đọc ({unreadCount})
          </Button>
        )}
      </div>

      <Card className="shadow-sm border-slate-200 rounded-xl overflow-hidden">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key);
            setPage(1);
          }}
          items={[
            {
              key: "all",
              label: (
                <span className="flex items-center gap-1.5 font-medium">
                  Tất cả
                  {total > 0 && activeTab === "all" && (
                    <Tag className="ml-1 rounded-full text-xs">{total}</Tag>
                  )}
                </span>
              ),
            },
            {
              key: "unread",
              label: (
                <span className="flex items-center gap-1.5 font-medium">
                  Chưa đọc
                  {unreadCount > 0 && (
                    <Tag color="indigo" className="ml-1 rounded-full text-xs">
                      {unreadCount}
                    </Tag>
                  )}
                </span>
              ),
            },
          ]}
        />

        {isLoading ? (
          <div className="py-16 flex justify-center items-center">
            <Spin size="large" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                unreadOnly
                  ? "Bạn không có thông báo chưa đọc nào."
                  : "Bạn chưa có thông báo nào."
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((item) => (
              <div
                key={item.id}
                onClick={() => handleNotificationClick(item)}
                className={`p-4 flex items-start gap-4 cursor-pointer transition-colors hover:bg-slate-50/80 ${
                  !item.isRead ? "bg-indigo-50/30" : "bg-white"
                }`}
              >
                <div className="p-2.5 rounded-lg bg-slate-100/80 shrink-0 mt-0.5">
                  {getNotificationIcon(item.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4
                      className={`text-sm ${
                        !item.isRead ? "font-bold text-slate-900" : "font-medium text-slate-700"
                      }`}
                    >
                      {item.title}
                    </h4>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-400">
                        {new Date(item.createdAt).toLocaleString("vi-VN")}
                      </span>
                      {!item.isRead && (
                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 shrink-0" />
                      )}
                    </div>
                  </div>

                  {item.content && (
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed whitespace-pre-line">
                      {item.content}
                    </p>
                  )}

                  <div className="mt-2 flex items-center justify-between">
                    <Tag className="text-[11px] font-normal border-0 bg-slate-100 text-slate-600">
                      {item.type}
                    </Tag>
                    {!item.isRead && (
                      <Button
                        type="text"
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          markReadMutation.mutate(item.id);
                        }}
                        className="text-xs text-indigo-600 hover:text-indigo-800 p-0 h-auto"
                      >
                        Đánh dấu đã đọc
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
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
    </div>
  );
};
