import { apiClient } from "../api/apiClient";

/**
 * Public catalog API (no auth required).
 * - GET /api/teachers?featured=&limit=
 * - GET /api/catalog/categories
 */

export interface PublicTeacherListItem {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  biography: string | null;
  qualificationSummary: string | null;
  ratingAverage: number;
  ratingCount: number;
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
  teachers: (featured: boolean, limit: number) => ["catalog", "teachers", featured, limit] as const,
  categories: () => ["catalog", "categories"] as const,
};

class CatalogService {
  async getTeachers(featured?: boolean, limit: number = 6): Promise<PublicTeacherListItem[]> {
    const query = new URLSearchParams({ limit: String(limit) });
    if (featured) query.set("featured", "true");

    const data = await apiClient<Array<Partial<PublicTeacherListItem> & { id: string }>>(`/teachers?${query}`);
    return (Array.isArray(data) ? data : []).map((teacher) => ({
      id: teacher.id,
      fullName: teacher.fullName || "Giáo viên Edunity",
      avatarUrl: teacher.avatarUrl || null,
      biography: teacher.biography || null,
      qualificationSummary: teacher.qualificationSummary || null,
      ratingAverage: Number(teacher.ratingAverage ?? 0),
      ratingCount: Number(teacher.ratingCount ?? 0),
    }));
  }

  async getCategories(): Promise<PublicCategory[]> {
    const data = await apiClient<PublicCategory[]>("/catalog/categories");
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
