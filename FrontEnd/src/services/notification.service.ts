import { apiClient } from "../api/apiClient";
import type {
  ApiNotification,
  NotificationItem,
  NotificationListResponse,
} from "../types/communication";
import { adaptNotification } from "../api/communicationAdapters";

export const notificationKeys = {
  all: ["notifications"] as const,
  list: (params?: { page?: number; pageSize?: number; unread?: boolean }) =>
    ["notifications", "list", params] as const,
  unreadCount: () => ["notifications", "unreadCount"] as const,
};

interface BackendNotificationPaged {
  items: ApiNotification[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  unreadCount: number;
}

export const notificationService = {
  /**
   * GET /api/me/notifications
   * Supports unread filtering & pagination. Response includes canonical unreadCount.
   */
  async getMyNotifications(params?: {
    page?: number;
    pageSize?: number;
    unread?: boolean;
  }): Promise<NotificationListResponse> {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    if (params?.unread) query.set("unread", "true");

    const endpoint = `/me/notifications${query.toString() ? `?${query.toString()}` : ""}`;
    const data = await apiClient<BackendNotificationPaged>(endpoint);

    return {
      items: (data.items || []).map(adaptNotification),
      total: data.total || 0,
      page: data.page || 1,
      pageSize: data.pageSize || 20,
      totalPages: data.totalPages || 1,
      unreadCount: typeof data.unreadCount === "number" ? data.unreadCount : 0,
    };
  },

  /**
   * POST /api/me/notifications/:id/read
   * Marks a single notification as read.
   */
  async markAsRead(notificationId: string): Promise<NotificationItem> {
    const data = await apiClient<ApiNotification>(`/me/notifications/${notificationId}/read`, {
      method: "POST",
    });
    return adaptNotification(data);
  },

  /**
   * POST /api/me/notifications/read-all
   * Marks all unread notifications of current user as read.
   */
  async markAllAsRead(): Promise<{ updated: number }> {
    return apiClient<{ updated: number }>("/me/notifications/read-all", {
      method: "POST",
    });
  },
};
