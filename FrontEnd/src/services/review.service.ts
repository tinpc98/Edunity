import { apiClient } from "../api/apiClient";
import type {
  ApiReview,
  ReviewItem,
  ReviewListResponse,
  CreateReviewPayload,
} from "../types/communication";
import { adaptReview } from "../api/communicationAdapters";

export const reviewKeys = {
  all: ["reviews"] as const,
  byClass: (classId: string, params?: { page?: number; pageSize?: number }) =>
    ["reviews", "class", classId, params] as const,
  byTeacher: (teacherId: string, params?: { page?: number; pageSize?: number }) =>
    ["reviews", "teacher", teacherId, params] as const,
};

interface BackendReviewPaged {
  items: ApiReview[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  ratingAverage?: number;
  ratingCount?: number;
}

export const reviewService = {
  /**
   * POST /api/classes/:id/reviews
   * Student submits review for a class they attended.
   */
  async createReview(classId: string, payload: CreateReviewPayload): Promise<ReviewItem> {
    const data = await apiClient<ApiReview>(`/classes/${classId}/reviews`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return adaptReview(data);
  },

  /**
   * GET /api/classes/:id/reviews
   * Public: List reviews for a specific class with canonical ratingAverage and ratingCount.
   */
  async getClassReviews(
    classId: string,
    params?: { page?: number; pageSize?: number }
  ): Promise<ReviewListResponse> {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));

    const endpoint = `/classes/${classId}/reviews${query.toString() ? `?${query.toString()}` : ""}`;
    const data = await apiClient<BackendReviewPaged>(endpoint);

    return {
      items: (data.items || []).map(adaptReview),
      total: data.total || 0,
      page: data.page || 1,
      pageSize: data.pageSize || 10,
      totalPages: data.totalPages || 1,
      ratingAverage: typeof data.ratingAverage === "number" ? data.ratingAverage : 0,
      ratingCount: typeof data.ratingCount === "number" ? data.ratingCount : 0,
    };
  },

  /**
   * GET /api/teachers/:id/reviews
   * Public: List reviews for a specific teacher with canonical ratingAverage and ratingCount.
   */
  async getTeacherReviews(
    teacherId: string,
    params?: { page?: number; pageSize?: number }
  ): Promise<ReviewListResponse> {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));

    const endpoint = `/teachers/${teacherId}/reviews${query.toString() ? `?${query.toString()}` : ""}`;
    const data = await apiClient<BackendReviewPaged>(endpoint);

    return {
      items: (data.items || []).map(adaptReview),
      total: data.total || 0,
      page: data.page || 1,
      pageSize: data.pageSize || 10,
      totalPages: data.totalPages || 1,
      ratingAverage: typeof data.ratingAverage === "number" ? data.ratingAverage : 0,
      ratingCount: typeof data.ratingCount === "number" ? data.ratingCount : 0,
    };
  },
};
