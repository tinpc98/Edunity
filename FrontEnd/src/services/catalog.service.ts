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

export interface PublicSubject {
  id: string;
  name: string;
  slug: string;
}

export interface PublicCategory {
  id: string;
  name: string;
  slug: string;
  subjects: PublicSubject[];
}

export const catalogKeys = {
  teachers: (params?: { featured?: boolean; limit?: number }) =>
    ["catalog", "teachers", params] as const,
  teacherDetail: (id: string) => ["catalog", "teachers", "detail", id] as const,
  categories: () => ["catalog", "categories"] as const,
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

  /** GET /api/catalog/categories — active categories with their active subjects. */
  async getCategories(): Promise<PublicCategory[]> {
    const data = await apiClient<PublicCategory[]>("/catalog/categories", { method: "GET" });
    return (Array.isArray(data) ? data : []).map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      subjects: (category.subjects || []).map((subject) => ({
        id: subject.id,
        name: subject.name,
        slug: subject.slug,
      })),
    }));
  }
}

export const catalogService = new CatalogService();
