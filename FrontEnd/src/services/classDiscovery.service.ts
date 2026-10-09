import type {
  ClassDiscoveryItem,
  FilterMetadata,
  FilterState,
  PaginatedResult,
  SessionEntity,
} from "../types/classDiscovery";
import { classService } from "./class.service";
import { adaptClassModelToDiscoveryItem } from "../api/classAdapters";
import { apiClient } from "../api/apiClient";
import { COMMON_DISCOVERY_GRADES, GRADE_LEVEL_LABELS } from "../data/mockClassDiscovery";
import type { ClassListFilters } from "../types/class";

/**
 * Service providing public Class Discovery backed by real Backend API.
 * Uses real endpoints:
 * - GET /api/classes
 * - GET /api/classes/:id
 * - GET /api/classes/:id/sessions
 * - GET /api/catalog/filters
 */
class ClassDiscoveryService {
  async fetchClasses(filters: FilterState): Promise<PaginatedResult<ClassDiscoveryItem>> {
    const apiFilters: ClassListFilters = {
      page: filters.page,
      pageSize: filters.pageSize,
    };

    if (filters.search && filters.search.trim() !== "") {
      apiFilters.search = filters.search.trim();
    }
    if (filters.subjectId && filters.subjectId !== "ALL") {
      apiFilters.subjectId = filters.subjectId;
    }
    if (filters.courseId && filters.courseId !== "ALL") {
      apiFilters.courseId = filters.courseId;
    }
    if (filters.teacherId && filters.teacherId !== "ALL") {
      apiFilters.teacherId = filters.teacherId;
    }
    if (filters.classTypes && filters.classTypes.length > 0) {
      apiFilters.classTypes = filters.classTypes.join(",");
    }
    if (filters.statuses && filters.statuses.length > 0) {
      apiFilters.statuses = filters.statuses.join(",");
    }
    if (filters.minPrice !== undefined) {
      apiFilters.minPrice = filters.minPrice;
    }
    if (filters.maxPrice !== undefined) {
      apiFilters.maxPrice = filters.maxPrice;
    }

    if (filters.sort === "upcoming") {
      apiFilters.sort = "upcoming";
    } else if (filters.sort === "price_asc") {
      apiFilters.sort = "price_asc";
    } else if (filters.sort === "price_desc") {
      apiFilters.sort = "price_desc";
    } else {
      apiFilters.sort = "createdAt";
    }

    const result = await classService.getClasses(apiFilters);

    let items = result.items.map(adaptClassModelToDiscoveryItem);

    // If gradeLevels filter is provided in frontend UI, filter client-side if backend does not filter
    if (filters.gradeLevels && filters.gradeLevels.length > 0) {
      items = items.filter(
        (c) => c.gradeLevel !== null && filters.gradeLevels.includes(c.gradeLevel)
      );
    }

    // If timeOfDay filter is provided in frontend UI, filter client-side
    if (filters.timeOfDay && filters.timeOfDay.length > 0) {
      items = items.filter((c) => filters.timeOfDay.includes(c.timeOfDay));
    }

    return {
      items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    };
  }

  async fetchFilterMetadata(): Promise<FilterMetadata> {
    try {
      const data = await apiClient<{
        subjects?: Array<{ id: string; name: string; count?: number }>;
        courses?: Array<{ id: string; name?: string; title?: string; count?: number }>;
        teachers?: Array<{ id: string; name: string; count?: number }>;
        minPrice?: number;
        maxPrice?: number;
      }>("/catalog/filters");

      const subjects = (data?.subjects || []).map((s) => ({
        id: s.id,
        name: s.name,
        count: s.count || 0,
      }));

      const courses = (data?.courses || []).map((c) => ({
        id: c.id,
        title: c.title || c.name || "",
        count: c.count || 0,
      }));

      const teachers = (data?.teachers || []).map((t) => ({
        id: t.id,
        name: t.name,
        count: t.count || 0,
      }));

      const grades = COMMON_DISCOVERY_GRADES.map((level) => ({
        level,
        label: GRADE_LEVEL_LABELS[level] || level,
        count: 0,
      }));

      return {
        subjects,
        grades,
        courses,
        teachers,
        minPrice: data?.minPrice ?? 0,
        maxPrice: data?.maxPrice ?? 5000000,
      };
    } catch {
      // Fallback empty structure
      return {
        subjects: [],
        grades: COMMON_DISCOVERY_GRADES.map((level) => ({
          level,
          label: GRADE_LEVEL_LABELS[level] || level,
          count: 0,
        })),
        courses: [],
        teachers: [],
        minPrice: 0,
        maxPrice: 5000000,
      };
    }
  }

  async fetchClassById(classId: string): Promise<ClassDiscoveryItem | null> {
    try {
      const cls = await classService.getClassById(classId);
      return adaptClassModelToDiscoveryItem(cls);
    } catch (err: any) {
      if (err?.status === 404) return null;
      throw err;
    }
  }

  async fetchSessionsByClassId(classId: string): Promise<SessionEntity[]> {
    try {
      const sessions = await apiClient<SessionEntity[]>(`/classes/${classId}/sessions`);
      if (!Array.isArray(sessions)) return [];
      return [...sessions].sort(
        (a, b) => new Date(a.startDatetime).getTime() - new Date(b.startDatetime).getTime()
      );
    } catch {
      return [];
    }
  }
}

export const classDiscoveryService = new ClassDiscoveryService();
