import { apiClient } from "../api/apiClient";
import type {
  ApiReport,
  ReportItem,
  ReportListResponse,
  CreateReportPayload,
  AdminUpdateReportPayload,
} from "../types/communication";
import { adaptReport } from "../api/communicationAdapters";

export const reportKeys = {
  all: ["reports"] as const,
  myReports: (params?: { page?: number; pageSize?: number }) =>
    ["reports", "my", params] as const,
  adminList: (params?: { status?: string; type?: string; page?: number; pageSize?: number }) =>
    ["reports", "admin", params] as const,
  detail: (id: string) => ["reports", "detail", id] as const,
};

interface BackendReportPaged {
  items: ApiReport[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const reportService = {
  /**
   * POST /api/reports
   * Student, Teacher, or Sponsor files a complaint/report.
   */
  async createReport(payload: CreateReportPayload): Promise<ReportItem> {
    const data = await apiClient<ApiReport>("/reports", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return adaptReport(data);
  },

  /**
   * GET /api/me/reports
   * User lists their submitted reports.
   */
  async getMyReports(params?: {
    page?: number;
    pageSize?: number;
  }): Promise<ReportListResponse> {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));

    const endpoint = `/me/reports${query.toString() ? `?${query.toString()}` : ""}`;
    const data = await apiClient<BackendReportPaged>(endpoint);

    return {
      items: (data.items || []).map(adaptReport),
      total: data.total || 0,
      page: data.page || 1,
      pageSize: data.pageSize || 20,
      totalPages: data.totalPages || 1,
    };
  },

  /**
   * GET /api/admin/reports
   * Admin lists all complaints with status and type filters.
   */
  async adminListReports(params?: {
    status?: string;
    type?: string;
    page?: number;
    pageSize?: number;
  }): Promise<ReportListResponse> {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.type) query.set("type", params.type);
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));

    const endpoint = `/admin/reports${query.toString() ? `?${query.toString()}` : ""}`;
    const data = await apiClient<BackendReportPaged>(endpoint);

    return {
      items: (data.items || []).map(adaptReport),
      total: data.total || 0,
      page: data.page || 1,
      pageSize: data.pageSize || 20,
      totalPages: data.totalPages || 1,
    };
  },

  /**
   * GET /api/admin/reports/:id
   * Admin retrieves single report detail.
   */
  async adminGetReport(reportId: string): Promise<ReportItem> {
    const data = await apiClient<ApiReport>(`/admin/reports/${reportId}`);
    return adaptReport(data);
  },

  /**
   * PATCH /api/admin/reports/:id
   * Admin transitions report status: OPEN -> IN_REVIEW -> RESOLVED | REJECTED.
   */
  async adminUpdateReport(
    reportId: string,
    payload: AdminUpdateReportPayload
  ): Promise<ReportItem> {
    const data = await apiClient<ApiReport>(`/admin/reports/${reportId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return adaptReport(data);
  },
};
