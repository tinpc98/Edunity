import { apiClient } from "../api/apiClient";
import type {
  AdminUserListParams,
  AdminUserListResponse,
  AdminUserDetail,
  UpdateUserStatusPayload,
  AdminUserListItem,
} from "../types/adminUser";

export const adminUserKeys = {
  all: ["admin", "users"] as const,
  list: (params?: AdminUserListParams) => ["admin", "users", "list", params] as const,
  detail: (id: string) => ["admin", "users", "detail", id] as const,
};

export class AdminUserService {
  async listUsers(params: AdminUserListParams = {}): Promise<AdminUserListResponse> {
    const searchParams = new URLSearchParams();
    if (params.search?.trim()) searchParams.set("search", params.search.trim());
    if (params.role) searchParams.set("role", params.role);
    if (params.status) searchParams.set("status", params.status);
    if (params.page) searchParams.set("page", String(params.page));
    if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));

    const query = searchParams.toString();
    const endpoint = `/admin/users${query ? `?${query}` : ""}`;
    return apiClient<AdminUserListResponse>(endpoint, { method: "GET" });
  }

  async getUser(id: string): Promise<AdminUserDetail> {
    return apiClient<AdminUserDetail>(`/admin/users/${id}`, { method: "GET" });
  }

  async updateUserStatus(id: string, payload: UpdateUserStatusPayload): Promise<AdminUserListItem> {
    return apiClient<AdminUserListItem>(`/admin/users/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }
}

export const adminUserService = new AdminUserService();
