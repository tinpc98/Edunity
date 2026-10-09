// ============================================================
// courseProposal.service.ts — Teacher + Admin proposal API
// Routes:
//  POST   /teacher/course-proposals
//  GET    /teacher/course-proposals?status=...&page=...
//  PATCH  /teacher/course-proposals/:id
//  GET    /admin/course-proposals?status=...&page=...
//  GET    /admin/course-proposals/:id
//  POST   /admin/course-proposals/:id/approve
//  POST   /admin/course-proposals/:id/reject
//  POST   /admin/course-proposals/:id/request-changes
// ============================================================

import { apiClient } from "../api/apiClient";
import { adaptProposal, adaptPaged } from "../api/catalogAdapters";
import type {
  ApiCourseProposal,
  ApiCourse,
  CourseProposal,
  Course,
  CreateProposalPayload,
  UpdateProposalPayload,
  ProposalListParams,
  ApproveProposalPayload,
  ReviewProposalPayload,
  PagedResult,
} from "../types/catalog";
import { adaptCourse } from "../api/catalogAdapters";

function buildProposalQuery(params: ProposalListParams): string {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  const str = qs.toString();
  return str ? `?${str}` : "";
}

class CourseProposalService {
  // ─── TEACHER ───────────────────────────────────────────────

  /** POST /teacher/course-proposals */
  async createProposal(payload: CreateProposalPayload): Promise<CourseProposal> {
    const raw = await apiClient<ApiCourseProposal>("/teacher/course-proposals", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return adaptProposal(raw);
  }

  /** GET /teacher/course-proposals?status=...&page=...&pageSize=... */
  async listMyProposals(params: ProposalListParams = {}): Promise<PagedResult<CourseProposal>> {
    const qs = buildProposalQuery(params);
    const raw = await apiClient<{
      items: ApiCourseProposal[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }>(`/teacher/course-proposals${qs}`);
    return adaptPaged(raw, adaptProposal);
  }

  /**
   * PATCH /teacher/course-proposals/:id
   * Only allowed when status is PENDING_REVIEW or NEED_CHANGES.
   * Re-submits with status reset to PENDING_REVIEW.
   */
  async updateMyProposal(id: string, payload: UpdateProposalPayload): Promise<CourseProposal> {
    const raw = await apiClient<ApiCourseProposal>(`/teacher/course-proposals/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return adaptProposal(raw);
  }

  // ─── ADMIN ─────────────────────────────────────────────────

  /** GET /admin/course-proposals?status=...&page=...&pageSize=... */
  async adminListProposals(params: ProposalListParams = {}): Promise<PagedResult<CourseProposal>> {
    const qs = buildProposalQuery(params);
    const raw = await apiClient<{
      items: ApiCourseProposal[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }>(`/admin/course-proposals${qs}`);
    return adaptPaged(raw, adaptProposal);
  }

  /** GET /admin/course-proposals/:id */
  async adminGetProposal(id: string): Promise<CourseProposal> {
    const raw = await apiClient<ApiCourseProposal>(`/admin/course-proposals/${id}`);
    return adaptProposal(raw);
  }

  /**
   * POST /admin/course-proposals/:id/approve
   * Backend AUTOMATICALLY creates a Course in the catalog.
   * Returns { proposal, course }.
   */
  async approveProposal(
    id: string,
    payload: ApproveProposalPayload = {}
  ): Promise<{ proposal: CourseProposal; course: Course }> {
    const raw = await apiClient<{ proposal: ApiCourseProposal; course: ApiCourse }>(
      `/admin/course-proposals/${id}/approve`,
      { method: "POST", body: JSON.stringify(payload) }
    );
    return {
      proposal: adaptProposal(raw.proposal),
      course: adaptCourse(raw.course),
    };
  }

  /**
   * POST /admin/course-proposals/:id/reject
   * reviewNote is optional (but recommended for teacher UX).
   */
  async rejectProposal(id: string, payload: ReviewProposalPayload): Promise<CourseProposal> {
    const raw = await apiClient<ApiCourseProposal>(`/admin/course-proposals/${id}/reject`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return adaptProposal(raw);
  }

  /**
   * POST /admin/course-proposals/:id/request-changes
   * reviewNote is REQUIRED by Backend when status = NEED_CHANGES.
   */
  async requestChanges(id: string, payload: ReviewProposalPayload): Promise<CourseProposal> {
    const raw = await apiClient<ApiCourseProposal>(
      `/admin/course-proposals/${id}/request-changes`,
      { method: "POST", body: JSON.stringify(payload) }
    );
    return adaptProposal(raw);
  }

  async requestProposalChanges(id: string, payload: ReviewProposalPayload): Promise<CourseProposal> {
    return this.requestChanges(id, payload);
  }
}

export const courseProposalService = new CourseProposalService();
