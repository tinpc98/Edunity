import { apiClient } from "../api/apiClient";
import type {
  ApiSession,
  Session,
  CreateSessionPayload,
  CreateSessionsBulkPayload,
  UpdateSessionPayload,
  PlannedSession,
  SessionAttendanceItem,
} from "../types/session";
import { adaptSession, adaptSessions } from "../api/sessionAdapters";

export const sessionKeys = {
  all: ["sessions"] as const,
  classSessions: (classId: string) => ["sessions", "class", classId] as const,
  teacherPlanned: (classId: string) => ["sessions", "teacher", "planned", classId] as const,
  attendance: (sessionId: string) => ["sessions", "attendance", sessionId] as const,
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
};
