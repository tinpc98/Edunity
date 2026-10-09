import React, { useState } from "react";
import { Popover, Badge, Button, Empty, Spin, Typography } from "antd";
import {
  BellOutlined,
  CheckOutlined,
  MessageOutlined,
  StarOutlined,
  AlertOutlined,
  CheckCircleOutlined,
  TrophyOutlined,
  NotificationOutlined,
} from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { notificationService, notificationKeys } from "../../../services/notification.service";
import type { NotificationItem } from "../../../types/communication";
import { ROUTES } from "../../../routes/routePaths";

const { Text } = Typography;

function getNotificationIcon(type: string) {
  if (type.includes("MESSAGE")) {
    return <MessageOutlined className="text-blue-500 text-base" />;
  }
  if (type.includes("REVIEW")) {
    return <StarOutlined className="text-amber-500 text-base" />;
  }
  if (type.includes("REPORT")) {
    return <AlertOutlined className="text-rose-500 text-base" />;
  }
  if (type.includes("ENROLLMENT") || type.includes("VERIFIED") || type.includes("APPROVED")) {
    return <CheckCircleOutlined className="text-emerald-500 text-base" />;
  }
  if (type.includes("SCHOLARSHIP")) {
    return <TrophyOutlined className="text-indigo-500 text-base" />;
  }
  return <NotificationOutlined className="text-slate-500 text-base" />;
}

function formatTime(isoString: string) {
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
    return date.toLocaleDateString("vi-VN");
  } catch {
    return "";
  }
}

export const NotificationPopover: React.FC = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch recent notifications with polling (every 15 seconds)
  const { data, isLoading } = useQuery({
    queryKey: notificationKeys.list({ page: 1, pageSize: 8 }),
    queryFn: () => notificationService.getMyNotifications({ page: 1, pageSize: 8 }),
    refetchInterval: 15000,
  });

  const unreadCount = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  // Mutation: Mark one as read
  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationService.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });

  // Mutation: Mark all as read
  const markAllMutation = useMutation({
    mutationFn: () => notificationService.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });

  const handleItemClick = (item: NotificationItem) => {
    if (!item.isRead) {
      markReadMutation.mutate(item.id);
    }
    setOpen(false);

    // Safe route navigation based on notification type
    if (item.type.includes("MESSAGE")) {
      navigate(ROUTES.MESSAGES);
    } else if (item.type.includes("ENROLLMENT")) {
      navigate(ROUTES.STUDENT.ENROLLMENTS);
    } else if (item.type.includes("SCHOLARSHIP")) {
      navigate(ROUTES.STUDENT.SCHOLARSHIPS);
    } else if (item.type.includes("REPORT")) {
      navigate("/reports");
    } else if (item.type.includes("REVIEW")) {
      navigate("/teacher/reviews");
    } else {
      navigate("/notifications");
    }
  };

  const content = (
    <div className="w-[360px] max-w-[90vw] -m-3">
      {/* Header */}
      <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-lg">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-slate-800">Thông báo</span>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 text-[11px] font-bold bg-indigo-100 text-indigo-700 rounded-full">
              {unreadCount} mới
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <Button
            type="link"
            size="small"
            icon={<CheckOutlined className="text-xs" />}
            loading={markAllMutation.isPending}
            onClick={() => markAllMutation.mutate()}
            className="text-xs text-indigo-600 hover:text-indigo-700 p-0 h-auto"
          >
            Đọc tất cả
          </Button>
        )}
      </div>

      {/* Body */}
      <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-50">
        {isLoading ? (
          <div className="py-8 flex justify-center items-center">
            <Spin size="small" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có thông báo nào" />
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              onClick={() => handleItemClick(item)}
              className={`p-3 flex gap-3 cursor-pointer transition-colors hover:bg-slate-50 ${
                !item.isRead ? "bg-indigo-50/40" : "bg-white"
              }`}
            >
              <div className="mt-0.5 shrink-0">{getNotificationIcon(item.type)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <Text
                    strong={!item.isRead}
                    className={`text-xs block truncate ${!item.isRead ? "text-slate-900" : "text-slate-700"}`}
                  >
                    {item.title}
                  </Text>
                  {!item.isRead && (
                    <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
                  )}
                </div>
                {item.content && (
                  <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-snug">
                    {item.content}
                  </p>
                )}
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {formatTime(item.createdAt)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-2.5 border-t border-slate-100 text-center bg-slate-50/30 rounded-b-lg">
        <Button
          type="link"
          size="small"
          onClick={() => {
            setOpen(false);
            navigate("/notifications");
          }}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
        >
          Xem tất cả thông báo
        </Button>
      </div>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      overlayClassName="notification-popover"
    >
      <Badge count={unreadCount} overflowCount={99} offset={[-2, 4]} size="small">
        <Button
          type="text"
          shape="circle"
          icon={<BellOutlined className="text-base text-slate-600" />}
          className="hover:bg-slate-100 flex items-center justify-center h-9 w-9"
        />
      </Badge>
    </Popover>
  );
};
