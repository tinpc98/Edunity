import { apiClient } from "../api/apiClient";
import type {
  ApiSession,
  Session,
  CreateSessionPayload,
  CreateSessionsBulkPayload,
  UpdateSessionPayload,
  PlannedSession,
  SessionAttendanceItem,
  JoinSessionResponse,
  SessionLiveStatusResponse,
  SubmitIncidentReportPayload,
  RequestReschedulePayload,
} from "../types/session";
import { adaptSession, adaptSessions } from "../api/sessionAdapters";

export const sessionKeys = {
  all: ["sessions"] as const,
  classSessions: (classId: string) => ["sessions", "class", classId] as const,
  teacherPlanned: (classId: string) => ["sessions", "teacher", "planned", classId] as const,
  attendance: (sessionId: string) => ["sessions", "attendance", sessionId] as const,
  liveStatus: (sessionId: string) => ["sessions", "liveStatus", sessionId] as const,
  teacherDiscipline: () => ["sessions", "teacher", "discipline"] as const,
  adminSmartClassroom: (status?: string) => ["sessions", "admin", "smartClassroom", status || "ALL"] as const,
  studentMySessions: (from?: string, to?: string) => ["sessions", "student", "me", { from, to }] as const,
};

export const sessionService = {
  /**
   * Public/Class: Retrieve all sessions of an open/in-progress class.
   * GET /api/classes/:id/sessions
   */
  async getClassSessions(classId: string): Promise<Session[]> {
    const data = await apiClient<ApiSession[]>(`/classes/${classId}/sessions`);
    return adaptSessions(data);
  },

  /**
   * Teacher: Create a single session in an owned class.
   * POST /api/teacher/classes/:classId/sessions
   */
  async createSession(classId: string, payload: CreateSessionPayload): Promise<Session> {
    const data = await apiClient<ApiSession>(`/teacher/classes/${classId}/sessions`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return adaptSession(data);
  },

  /**
   * Teacher: Bulk create sessions in an owned class.
   * POST /api/teacher/classes/:classId/sessions with { sessions: [...] }
   */
  async createSessionsBulk(classId: string, payload: CreateSessionsBulkPayload): Promise<Session[]> {
    const data = await apiClient<ApiSession[]>(`/teacher/classes/${classId}/sessions`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return adaptSessions(data);
  },

  /**
   * Teacher: Update a SCHEDULED session.
   * PATCH /api/teacher/sessions/:id
   */
  async updateSession(sessionId: string, payload: UpdateSessionPayload): Promise<Session> {
    const data = await apiClient<ApiSession>(`/teacher/sessions/${sessionId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return adaptSession(data);
  },

  /**
   * Teacher: Delete a planned session (only allowed while Class is DRAFT or REJECTED).
   * DELETE /api/teacher/sessions/:id
   */
  async deleteSession(sessionId: string): Promise<{ deleted: boolean }> {
    return apiClient<{ deleted: boolean }>(`/teacher/sessions/${sessionId}`, {
      method: "DELETE",
    });
  },

  /**
   * Teacher: Cancel a SCHEDULED session.
   * PATCH /api/teacher/sessions/:id with { status: "CANCELLED" }
   */
  async cancelSession(sessionId: string): Promise<Session> {
    return this.updateSession(sessionId, { status: "CANCELLED" });
  },

  /**
   * Teacher: End an IN_PROGRESS session (marks as COMPLETED).
   * POST /api/teacher/sessions/:id/end
   */
  async endSession(sessionId: string): Promise<Session> {
    const data = await apiClient<ApiSession>(`/teacher/sessions/${sessionId}/end`, {
      method: "POST",
    });
    return adaptSession(data);
  },

  /**
   * Teacher: Derive planned session occurrences from class startDate, endDate and schedule.
   * GET /api/teacher/classes/:id/planned-sessions
   */
  async getPlannedSessions(classId: string): Promise<PlannedSession[]> {
    return apiClient<PlannedSession[]>(`/teacher/classes/${classId}/planned-sessions`);
  },

  /**
   * Teacher: Retrieve attendance list of a session.
   * GET /api/teacher/sessions/:id/attendance
   */
  async getSessionAttendance(sessionId: string): Promise<SessionAttendanceItem[]> {
    return apiClient<SessionAttendanceItem[]>(`/teacher/sessions/${sessionId}/attendance`);
  },

  /**
   * Student: Retrieve upcoming/recent sessions for confirmed enrollments.
   * GET /api/me/sessions?from=...&to=...
   */
  async getMySessions(from?: string, to?: string): Promise<Session[]> {
    const query = new URLSearchParams();
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    const qs = query.toString();
    const endpoint = qs ? `/me/sessions?${qs}` : `/me/sessions`;
    const data = await apiClient<ApiSession[]>(endpoint);
    return adaptSessions(data);
  },

  /**
   * Student or Teacher: Join the embedded classroom for a session.
   * POST /api/sessions/:id/join
   */
  async joinSession(sessionId: string): Promise<JoinSessionResponse> {
    return apiClient<JoinSessionResponse>(`/sessions/${sessionId}/join`, {
      method: "POST",
    });
  },

  /**
   * Smart Classroom Live Status & Attendance Progress (TIN-05D)
   * GET /api/sessions/:id/live-status
   */
  async getSessionLiveStatus(sessionId: string): Promise<SessionLiveStatusResponse> {
    return apiClient<SessionLiveStatusResponse>(`/sessions/${sessionId}/live-status`);
  },

  async connectSessionPresence(sessionId: string, connectionSessionId: string): Promise<any> {
    return apiClient<any>(`/sessions/${sessionId}/presence/connect`, {
      method: "POST",
      body: JSON.stringify({ connectionSessionId }),
    });
  },

  async leaveSessionPresence(sessionId: string, connectionSessionId?: string): Promise<any> {
    return apiClient<any>(`/sessions/${sessionId}/presence/leave`, {
      method: "POST",
      body: JSON.stringify({ connectionSessionId }),
    });
  },

  /**
   * Teacher Incident Reporting, Appeals, Rescheduling & Discipline Overview (TIN-05E)
   */
  async submitIncidentReport(sessionId: string, payload: SubmitIncidentReportPayload): Promise<any> {
    return apiClient<any>(`/teacher/sessions/${sessionId}/incident-reports`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async submitIncidentAppeal(reportId: string, payload: { reason: string; evidenceFiles?: string[] }): Promise<any> {
    return apiClient<any>(`/teacher/incident-reports/${reportId}/appeal`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async requestSessionReschedule(sessionId: string, payload: RequestReschedulePayload): Promise<any> {
    return apiClient<any>(`/teacher/sessions/${sessionId}/reschedule-requests`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async getTeacherDisciplineOverview(): Promise<any> {
    return apiClient<any>(`/teacher/discipline-overview`);
  },

  async respondToRescheduleAsStudent(
    requestId: string,
    payload: { status: "ACCEPTED" | "CANNOT_ATTEND"; note?: string }
  ): Promise<any> {
    return apiClient<any>(`/student/reschedule-requests/${requestId}/respond`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async getAdminSmartClassroomOverview(status?: string): Promise<any> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    return apiClient<any>(`/admin/smart-classroom/overview${qs}`);
  },

  async reviewIncidentReport(
    reportId: string,
    payload: { decision: "APPROVED" | "REJECTED" | "NEEDS_MORE_EVIDENCE"; note?: string; approveReschedule?: boolean }
  ): Promise<any> {
    return apiClient<any>(`/admin/incident-reports/${reportId}/review`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async reviewTeacherViolation(
    violationId: string,
    payload: { reviewStatus: "CONFIRMED" | "WAIVED" | "DOWNGRADED"; note?: string; newSeverity?: string }
  ): Promise<any> {
    return apiClient<any>(`/admin/teacher-violations/${violationId}/review`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async reviewDisciplineCase(
    caseId: string,
    payload: { status: "RESOLVED_APPROVED" | "RESOLVED_WAIVED" | "NEEDS_POLICY_CONFIGURATION"; note?: string }
  ): Promise<any> {
    return apiClient<any>(`/admin/discipline-cases/${caseId}/review`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async reviewRescheduleRequest(
    requestId: string,
    payload: { decision: "APPROVED" | "REJECTED"; note?: string }
  ): Promise<any> {
    return apiClient<any>(`/admin/reschedule-requests/${requestId}/review`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async reviewRefundCase(
    refundReviewId: string,
    payload: { status: "APPROVED_FOR_PAYMENT_TEAM" | "RESCHEDULED_WAIVED" | "REJECTED"; note?: string }
  ): Promise<any> {
    return apiClient<any>(`/admin/session-refund-reviews/${refundReviewId}/review`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};
