import { apiClient } from "../api/apiClient";
import type {
  ApiClass,
  ClassModel,
  ClassAvailability,
  CreateClassPayload,
  UpdateClassPayload,
  ReviewClassPayload,
  ClassListFilters,
  PaginatedClasses,
  ClassStudentRosterItem,
} from "../types/class";
import {
  adaptClassFromApi,
  adaptClassListFromApi,
  adaptClassAvailability,
} from "../api/classAdapters";

export const classKeys = {
  all: ["classes"] as const,
  publicList: (filters?: Record<string, any>) => ["classes", "public", filters] as const,
  detail: (id: string) => ["classes", "detail", id] as const,
  availability: (id: string) => ["classes", "availability", id] as const,
  courseClasses: (courseId: string, params?: Record<string, any>) =>
    ["classes", "course", courseId, params] as const,
  teacherList: (filters?: Record<string, any>) => ["classes", "teacher", filters] as const,
  teacherDetail: (id: string) => ["classes", "teacher", "detail", id] as const,
  teacherStudents: (id: string, status?: string) => ["classes", "teacher", "students", id, status] as const,
  adminPending: (filters?: Record<string, any>) => ["classes", "admin", "pending", filters] as const,
  adminDetail: (id: string) => ["classes", "admin", "detail", id] as const,
};

function buildQueryString(params: Record<string, any>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  const str = query.toString();
  return str ? `?${str}` : "";
}

export const classService = {
  // ---------------- PUBLIC API ----------------
  async getClasses(filters: ClassListFilters = {}): Promise<PaginatedClasses> {
    const qs = buildQueryString(filters);
    const data = await apiClient<{
      items: ApiClass[];
      total: number;
      page: number;
      pageSize: number;
      totalPages?: number;
    }>(`/classes${qs}`);
    return adaptClassListFromApi(data);
  },

  async getClassById(classId: string): Promise<ClassModel> {
    const data = await apiClient<ApiClass>(`/classes/${classId}`);
    return adaptClassFromApi(data);
  },

  async getClassAvailability(classId: string): Promise<ClassAvailability> {
    const data = await apiClient<any>(`/classes/${classId}/availability`);
    return adaptClassAvailability(data);
  },

  async getCourseClasses(
    courseId: string,
    params: { page?: number; pageSize?: number } = {}
  ): Promise<PaginatedClasses> {
    const qs = buildQueryString(params);
    const data = await apiClient<{
      items: ApiClass[];
      total: number;
      page: number;
      pageSize: number;
      totalPages?: number;
    }>(`/courses/${courseId}/classes${qs}`);
    return adaptClassListFromApi(data);
  },

  // ---------------- TEACHER API ----------------
  async listMyClasses(
    params: { status?: string; page?: number; pageSize?: number } = {}
  ): Promise<PaginatedClasses> {
    const qs = buildQueryString(params);
    const data = await apiClient<{
      items: ApiClass[];
      total: number;
      page: number;
      pageSize: number;
      totalPages?: number;
    }>(`/teacher/classes${qs}`);
    return adaptClassListFromApi(data);
  },

  async getMyClass(classId: string): Promise<ClassModel> {
    const data = await apiClient<ApiClass>(`/teacher/classes/${classId}`);
    return adaptClassFromApi(data);
  },

  async createClass(payload: CreateClassPayload): Promise<ClassModel> {
    const data = await apiClient<ApiClass>("/teacher/classes", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return adaptClassFromApi(data);
  },

  async updateClass(classId: string, payload: UpdateClassPayload): Promise<ClassModel> {
    const data = await apiClient<ApiClass>(`/teacher/classes/${classId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return adaptClassFromApi(data);
  },

  async submitClass(classId: string): Promise<ClassModel> {
    const data = await apiClient<ApiClass>(`/teacher/classes/${classId}/submit`, {
      method: "POST",
    });
    return adaptClassFromApi(data);
  },

  async getClassStudents(classId: string, status?: string): Promise<ClassStudentRosterItem[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    return apiClient<ClassStudentRosterItem[]>(`/teacher/classes/${classId}/students${qs}`);
  },

  // ---------------- ADMIN API ----------------
  async listPendingClasses(
    params: { page?: number; pageSize?: number } = {}
  ): Promise<PaginatedClasses> {
    const qs = buildQueryString(params);
    const data = await apiClient<{
      items: ApiClass[];
      total: number;
      page: number;
      pageSize: number;
      totalPages?: number;
    }>(`/admin/classes/pending${qs}`);
    return adaptClassListFromApi(data);
  },

  async getClassForReview(classId: string): Promise<ClassModel> {
    const data = await apiClient<ApiClass>(`/admin/classes/${classId}`);
    return adaptClassFromApi(data);
  },

  async approveClass(classId: string, payload: ReviewClassPayload = {}): Promise<ClassModel> {
    const data = await apiClient<ApiClass>(`/admin/classes/${classId}/approve`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return adaptClassFromApi(data);
  },

  async rejectClass(classId: string, payload: ReviewClassPayload = {}): Promise<ClassModel> {
    const data = await apiClient<ApiClass>(`/admin/classes/${classId}/reject`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return adaptClassFromApi(data);
  },
};
