import { MOCK_TEACHERS } from "../data/mockClassDiscovery";

export interface PublicTeacherListItem {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  biography: string | null;
  qualificationSummary: string | null;
  ratingAverage: number;
  ratingCount: number;
}

class CatalogService {
  async getTeachers(featured?: boolean, limit: number = 6): Promise<PublicTeacherListItem[]> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    
    // Map from MOCK_TEACHERS to simulate GET /api/teachers response
    let teachers: PublicTeacherListItem[] = MOCK_TEACHERS.map((t, index) => ({
      id: t.id,
      fullName: t.name,
      avatarUrl: t.avatar || null,
      biography: t.biography || null,
      qualificationSummary: t.qualificationSummary || t.title || null,
      // Simulate ratings based on id/index for deterministic mock
      ratingAverage: 4.5 + (index % 5) * 0.1,
      ratingCount: 15 + index * 12,
    }));

    if (featured) {
      teachers.sort((a, b) => b.ratingAverage - a.ratingAverage);
    }
    
    return teachers.slice(0, limit);
  }
}

export const catalogService = new CatalogService();
