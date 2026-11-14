import { apiClient } from "../api/apiClient";
import type {
  SubmitVerificationRequest,
  TeacherVerificationStatus,
  AdminTeacherVerificationListItem,
  Paged,
} from "../types/teacherVerification";

export class TeacherVerificationService {
  async getMyVerification(): Promise<TeacherVerificationStatus> {
    return apiClient<TeacherVerificationStatus>("/teacher/verification", { method: "GET" });
  }

  async submitVerification(payload: SubmitVerificationRequest): Promise<TeacherVerificationStatus> {
    return apiClient<TeacherVerificationStatus>("/teacher/verification", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async uploadPrivateFile(purpose: string, file: File): Promise<{ storageKey: string; mimeType: string; size: number; originalName: string }> {
    const formData = new FormData();
    formData.append("purpose", purpose);
    formData.append("file", file);

    return apiClient<any>("/uploads/private", {
      method: "POST",
      body: formData,
      // Let fetch set Content-Type with the boundary
    });
  }

  async adminListVerifications(status: string = "PENDING", page: number = 1, pageSize: number = 10): Promise<Paged<AdminTeacherVerificationListItem>> {
    return apiClient<Paged<AdminTeacherVerificationListItem>>(
      `/admin/teacher-verifications?status=${status}&page=${page}&pageSize=${pageSize}`,
      { method: "GET" }
    );
  }

  async adminGetVerification(teacherId: string): Promise<TeacherVerificationStatus> {
    return apiClient<TeacherVerificationStatus>(`/admin/teacher-verifications/${teacherId}`, { method: "GET" });
  }

  async adminRevealIdentity(teacherId: string, reason: string): Promise<{ idNumber: string; address: string }> {
    return apiClient<{ idNumber: string; address: string }>(`/admin/teacher-verifications/${teacherId}/identity/reveal`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  }

  async adminApproveVerification(teacherId: string, reviewNote?: string): Promise<TeacherVerificationStatus> {
    return apiClient<TeacherVerificationStatus>(`/admin/teacher-verifications/${teacherId}/approve`, {
      method: "POST",
      body: JSON.stringify({ reviewNote: reviewNote || undefined }),
    });
  }

  async adminRejectVerification(
    teacherId: string,
    reviewNote: string,
    documents: { documentId: string; reason: string }[] = []
  ): Promise<TeacherVerificationStatus> {
    return apiClient<TeacherVerificationStatus>(`/admin/teacher-verifications/${teacherId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reviewNote, documents }),
    });
  }
}

export const teacherVerificationService = new TeacherVerificationService();
