import type {
  BackendGradeLevel,
  ClassDiscoveryItem,
  FilterMetadata,
  FilterState,
  PaginatedResult,
  SessionEntity,
} from "../types/classDiscovery";
import { classService } from "./class.service";
import { catalogService } from "./catalog.service";
import { adaptClassModelToDiscoveryItem } from "../api/classAdapters";
import { apiClient } from "../api/apiClient";
import { GRADE_LEVEL_LABELS } from "../types/catalog";
import type { ClassListFilters } from "../types/class";

export const COMMON_DISCOVERY_GRADES: BackendGradeLevel[] = [
  "GRADE_6",
  "GRADE_7",
  "GRADE_8",
  "GRADE_9",
  "GRADE_10",
  "GRADE_11",
  "GRADE_12",
];

/** Upper bound of the price slider; GET /api/catalog/filters returns the same value. */
export const DEFAULT_MAX_PRICE = 5000000;

// GET /api/classes caps pageSize at 100
const BULK_PAGE_SIZE = 100;
const MAX_BULK_PAGES = 10;

interface RawFilters {
  subjects?: Array<{ id: string; name: string; count?: number }>;
  courses?: Array<{ id: string; name?: string; title?: string; count?: number }>;
  minPrice?: number;
  maxPrice?: number;
}

/**
 * Service providing public Class Discovery backed by real Backend API.
 * Uses real endpoints:
 * - GET /api/classes
 * - GET /api/classes/:id
 * - GET /api/classes/:id/sessions
 * - GET /api/catalog/filters
 * - GET /api/teachers
 */
class ClassDiscoveryService {
  private filtersPromise: Promise<RawFilters> | null = null;

  /** /catalog/filters is small and static per session, so it is fetched once and shared. */
  private getRawFilters(): Promise<RawFilters> {
    if (!this.filtersPromise) {
      this.filtersPromise = apiClient<RawFilters>("/catalog/filters").catch((err) => {
        this.filtersPromise = null;
        throw err;
      });
    }
    return this.filtersPromise;
  }

  /** Class documents only carry subjectId: resolve the display name from the catalog. */
  private async withSubjectNames(items: ClassDiscoveryItem[]): Promise<ClassDiscoveryItem[]> {
    try {
      const raw = await this.getRawFilters();
      const names = new Map((raw.subjects || []).map((s) => [s.id, s.name]));
      return items.map((item) => ({ ...item, subjectName: names.get(item.subjectId) || item.subjectName }));
    } catch {
      return items;
    }
  }

  private toApiFilters(filters: FilterState): ClassListFilters {
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

    // The backend replaces the FREE (price = 0) condition with the price range when both are sent,
    // so a price range is only meaningful when the result is not restricted to free classes.
    const freeOnly = filters.classTypes.length === 1 && filters.classTypes[0] === "FREE";
    if (!freeOnly) {
      if (filters.minPrice !== undefined) apiFilters.minPrice = filters.minPrice;
      if (filters.maxPrice !== undefined) apiFilters.maxPrice = filters.maxPrice;
    }

    if (filters.sort === "upcoming" || filters.sort === "price_asc" || filters.sort === "price_desc") {
      apiFilters.sort = filters.sort;
    } else {
      apiFilters.sort = "createdAt";
    }

    return apiFilters;
  }

  async fetchClasses(filters: FilterState): Promise<PaginatedResult<ClassDiscoveryItem>> {
    const apiFilters = this.toApiFilters(filters);

    // Grade and time-of-day are not supported by GET /api/classes. Filtering a single page on the
    // client would break totals and pagination, so in that case all matching pages are loaded
    // and paginated locally.
    const needsClientFilter = filters.gradeLevels.length > 0 || filters.timeOfDay.length > 0;

    if (!needsClientFilter) {
      const result = await classService.getClasses(apiFilters);
      return {
        items: await this.withSubjectNames(result.items.map(adaptClassModelToDiscoveryItem)),
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      };
    }

    const all = await this.fetchAllPages(apiFilters);
    const matched = all
      .map(adaptClassModelToDiscoveryItem)
      .filter((c) => filters.gradeLevels.length === 0 || (c.gradeLevel !== null && filters.gradeLevels.includes(c.gradeLevel)))
      .filter((c) => filters.timeOfDay.length === 0 || filters.timeOfDay.includes(c.timeOfDay));

    const start = (filters.page - 1) * filters.pageSize;
    return {
      items: await this.withSubjectNames(matched.slice(start, start + filters.pageSize)),
      total: matched.length,
      page: filters.page,
      pageSize: filters.pageSize,
      totalPages: Math.max(1, Math.ceil(matched.length / filters.pageSize)),
    };
  }

  private async fetchAllPages(apiFilters: ClassListFilters) {
    const first = await classService.getClasses({ ...apiFilters, page: 1, pageSize: BULK_PAGE_SIZE });
    const lastPage = Math.min(first.totalPages, MAX_BULK_PAGES);
    if (lastPage <= 1) return first.items;

    const rest = await Promise.all(
      Array.from({ length: lastPage - 1 }, (_, i) =>
        classService.getClasses({ ...apiFilters, page: i + 2, pageSize: BULK_PAGE_SIZE })
      )
    );
    return [...first.items, ...rest.flatMap((r) => r.items)];
  }

  async fetchFilterMetadata(): Promise<FilterMetadata> {
    const grades = COMMON_DISCOVERY_GRADES.map((level) => ({
      level,
      label: GRADE_LEVEL_LABELS[level] || level,
      count: 0,
    }));

    const [rawResult, teachersResult] = await Promise.allSettled([
      this.getRawFilters(),
      // /catalog/filters returns no teachers: list the verified teachers instead
      catalogService.getTeachers(false, 100),
    ]);
    const data: RawFilters = rawResult.status === "fulfilled" ? rawResult.value : {};
    const teachers = teachersResult.status === "fulfilled" ? teachersResult.value : [];

    return {
      subjects: (data.subjects || []).map((s) => ({ id: s.id, name: s.name, count: s.count || 0 })),
      grades,
      courses: (data.courses || []).map((c) => ({ id: c.id, title: c.title || c.name || "", count: c.count || 0 })),
      teachers: teachers.map((t) => ({ id: t.id, name: t.fullName, count: 0 })),
      minPrice: data.minPrice ?? 0,
      maxPrice: data.maxPrice ?? DEFAULT_MAX_PRICE,
    };
  }

  async fetchClassById(classId: string): Promise<ClassDiscoveryItem | null> {
    try {
      const cls = await classService.getClassById(classId);
      const [item] = await this.withSubjectNames([adaptClassModelToDiscoveryItem(cls)]);
      return item;
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
