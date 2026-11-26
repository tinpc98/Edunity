import { apiClient } from "../api/apiClient";
import type {
  ApiClass,
  ClassModel,
  ClassReadiness,
  ClassAvailability,
  CreateClassPayload,
  UpdateClassPayload,
  ReviewClassPayload,
  ClassListFilters,
  PaginatedClasses,
  ClassStudentRosterItem,
  ClassStatus,
  ClassType,
} from "../types/class";
import {
  adaptClassFromApi,
  adaptClassListFromApi,
  adaptClassAvailability,
} from "../api/classAdapters";

/** Sessions of a class being prepared are rebuilt from its schedule after each save (Backend sessionPlan). */
export interface SessionPlanResult {
  generatedCount: number;
  error?: { code: string; message: string };
}
export type ClassWithSessionPlan = ClassModel & { sessionPlan?: SessionPlanResult };

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
  adminList: (filters: AdminClassListParams) => ["classes", "admin", "list", filters] as const,
  adminDetail: (id: string) => ["classes", "admin", "detail", id] as const,
  // Nested under each detail key, so invalidating the detail refreshes its readiness too
  teacherReadiness: (id: string) => ["classes", "teacher", "detail", id, "readiness"] as const,
  adminReadiness: (id: string) => ["classes", "admin", "detail", id, "readiness"] as const,
};

interface AdminClassListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: ClassStatus;
  classType?: ClassType;
}

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

  async createClass(payload: CreateClassPayload): Promise<ClassWithSessionPlan> {
    const data = await apiClient<ApiClass & { sessionPlan?: SessionPlanResult }>("/teacher/classes", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { ...adaptClassFromApi(data), sessionPlan: data.sessionPlan };
  },

  async updateClass(classId: string, payload: UpdateClassPayload): Promise<ClassWithSessionPlan> {
    const data = await apiClient<ApiClass & { sessionPlan?: SessionPlanResult }>(`/teacher/classes/${classId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return { ...adaptClassFromApi(data), sessionPlan: data.sessionPlan };
  },

  async submitClass(classId: string): Promise<ClassModel> {
    const data = await apiClient<ApiClass>(`/teacher/classes/${classId}/submit`, {
      method: "POST",
    });
    return adaptClassFromApi(data);
  },

  async getMyClassReadiness(classId: string): Promise<ClassReadiness> {
    return apiClient<ClassReadiness>(`/teacher/classes/${classId}/readiness`);
  },

  async getClassStudents(classId: string, status?: string): Promise<ClassStudentRosterItem[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    return apiClient<ClassStudentRosterItem[]>(`/teacher/classes/${classId}/students${qs}`);
  },

  // ---------------- ADMIN API ----------------
  async listAdminClasses(params: AdminClassListParams): Promise<PaginatedClasses> {
    const data = await apiClient<{
      items: ApiClass[];
      total: number;
      page: number;
      pageSize: number;
      totalPages?: number;
    }>(`/admin/classes${buildQueryString(params)}`);
    return adaptClassListFromApi(data);
  },

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

  async getClassReadiness(classId: string): Promise<ClassReadiness> {
    return apiClient<ClassReadiness>(`/admin/classes/${classId}/readiness`);
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

  async requestChanges(classId: string, payload: { reviewNote: string }): Promise<ClassModel> {
    const data = await apiClient<ApiClass>(`/admin/classes/${classId}/request-changes`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return adaptClassFromApi(data);
  },

  async deleteClass(classId: string, reason?: string): Promise<{ success: boolean; message: string }> {
    return apiClient<{ success: boolean; message: string }>(`/admin/classes/${classId}`, {
      method: "DELETE",
      body: JSON.stringify({ reason }),
    });
  },

  async restoreClass(classId: string): Promise<ClassModel> {
    const data = await apiClient<ApiClass>(`/admin/classes/${classId}/restore`, {
      method: "POST",
    });
    return adaptClassFromApi(data);
  },
};
