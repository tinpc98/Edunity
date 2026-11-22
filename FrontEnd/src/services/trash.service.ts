import { apiClient } from "../api/apiClient";
import type { TrashFilterQuery, TrashListResponse, TrashItem } from "../types/trash";

function buildTrashQuery(params: TrashFilterQuery = {}): string {
  const qs = new URLSearchParams();
  if (params.type && params.type !== "ALL") qs.set("type", params.type);
  if (params.search) qs.set("search", params.search);
  if (params.startDate) qs.set("startDate", params.startDate);
  if (params.endDate) qs.set("endDate", params.endDate);
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  const str = qs.toString();
  return str ? `?${str}` : "";
}

class TrashService {
  /**
   * GET /admin/trash — List soft-deleted items across domains
   */
  async listTrash(params: TrashFilterQuery = {}): Promise<TrashListResponse> {
    const qs = buildTrashQuery(params);
    return apiClient<TrashListResponse>(`/admin/trash${qs}`);
  }

  /**
   * GET /admin/trash/:type/:id — Pre-flight restoration check and detail
   */
  async getTrashDetail(type: string, id: string): Promise<TrashItem> {
    return apiClient<TrashItem>(`/admin/trash/${type}/${id}`);
  }

  /**
   * POST /admin/trash/:type/:id/restore — Domain-aware restore execution
   */
  async restoreTrashItem(type: string, id: string): Promise<{ success: boolean; message: string }> {
    return apiClient<{ success: boolean; message: string }>(`/admin/trash/${type}/${id}/restore`, {
      method: "POST",
    });
  }

  /**
   * DELETE /admin/trash/:type/:id/permanent — Irreversible permanent deletion with dependency guards
   */
  async permanentDeleteTrashItem(
    type: string,
    id: string,
    reason?: string
  ): Promise<{ success: boolean; message: string }> {
    return apiClient<{ success: boolean; message: string }>(`/admin/trash/${type}/${id}/permanent`, {
      method: "DELETE",
      body: reason ? JSON.stringify({ reason }) : undefined,
    });
  }
}

export const trashService = new TrashService();
