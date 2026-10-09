// ============================================================
// course.service.ts — Course API integration
// Routes: GET /courses, GET /courses/:id (public)
//         POST /admin/courses, PATCH /admin/courses/:id (admin)
// ============================================================

import { apiClient } from "../api/apiClient";
import { adaptCourse, adaptPaged } from "../api/catalogAdapters";
import type {
  ApiCourse,
  Course,
  CourseSearchParams,
  CreateCoursePayload,
  UpdateCoursePayload,
  PagedResult,
} from "../types/catalog";

function buildCourseQuery(params: CourseSearchParams): string {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.categoryId) qs.set("categoryId", params.categoryId);
  if (params.subjectId) qs.set("subjectId", params.subjectId);
  if (params.gradeLevel) qs.set("gradeLevel", params.gradeLevel);
  if (params.level) qs.set("level", params.level);
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  const str = qs.toString();
  return str ? `?${str}` : "";
}

class CourseService {
  // ─── PUBLIC ────────────────────────────────────────────────

  /** GET /courses?search=...&categoryId=...&subjectId=...&gradeLevel=...&level=...&page=...&pageSize=... */
  async searchCourses(params: CourseSearchParams = {}): Promise<PagedResult<Course>> {
    const qs = buildCourseQuery(params);
    const raw = await apiClient<{
      items: ApiCourse[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }>(`/courses${qs}`);
    return adaptPaged(raw, adaptCourse);
  }

  /** GET /courses/:id — includes openClassCount */
  async getCourse(id: string): Promise<Course> {
    const raw = await apiClient<ApiCourse>(`/courses/${id}`);
    return adaptCourse(raw);
  }

  // ─── ADMIN ─────────────────────────────────────────────────

  /** POST /admin/courses — requires subjectId (category derived from subject) */
  async createCourse(payload: CreateCoursePayload): Promise<Course> {
    const raw = await apiClient<ApiCourse>("/admin/courses", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return adaptCourse(raw);
  }

  /** PATCH /admin/courses/:id */
  async updateCourse(id: string, payload: UpdateCoursePayload): Promise<Course> {
    const raw = await apiClient<ApiCourse>(`/admin/courses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return adaptCourse(raw);
  }
}

export const courseService = new CourseService();
