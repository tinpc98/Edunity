import { apiClient } from "../api/apiClient";
import type { ApiClass } from "../types/class";

export interface PublicTeacherListItem {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  biography: string | null;
  qualificationSummary: string | null;
  ratingAverage: number;
  ratingCount: number;
}

export interface PublicTeacherDetail extends PublicTeacherListItem {
  classes: ApiClass[];
}

export const catalogKeys = {
  teachers: (params?: { featured?: boolean; limit?: number }) =>
    ["catalog", "teachers", params] as const,
  teacherDetail: (id: string) => ["catalog", "teachers", "detail", id] as const,
};

class CatalogService {
  async getTeachers(featured?: boolean, limit: number = 24): Promise<PublicTeacherListItem[]> {
    const query = new URLSearchParams();
    if (featured !== undefined) query.set("featured", String(featured));
    if (limit) query.set("limit", String(limit));

    const endpoint = `/teachers${query.toString() ? `?${query.toString()}` : ""}`;
    return apiClient<PublicTeacherListItem[]>(endpoint, { method: "GET" });
  }

  async getTeacherById(id: string): Promise<PublicTeacherDetail> {
    return apiClient<PublicTeacherDetail>(`/teachers/${id}`, { method: "GET" });
  }
}

export const catalogService = new CatalogService();
