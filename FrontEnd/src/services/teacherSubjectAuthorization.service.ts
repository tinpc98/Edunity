import { apiClient } from "../api/apiClient";
import type { PagedResult } from "../types/catalog";
import type {
  AdminSubjectAuthorization,
  CreateTeacherSubjectAuthorizationPayload,
  TeacherSubjectAuthorization,
  TeacherSubjectAuthorizationPage,
  TeacherSubjectAuthorizationStatus,
} from "../types/teacherSubjectAuthorization";

const PAGE_SIZE = 100;

type ApiTeacherSubjectAuthorization = Omit<TeacherSubjectAuthorization, "id"> & {
  id?: string;
  _id?: string;
};

class TeacherSubjectAuthorizationService {
  async listMyAuthorizations(page = 1): Promise<TeacherSubjectAuthorizationPage> {
    const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    const result = await apiClient<Omit<TeacherSubjectAuthorizationPage, "items"> & {
      items: ApiTeacherSubjectAuthorization[];
    }>(
      `/teacher/subject-authorizations?${query.toString()}`
    );
    return {
      ...result,
      items: result.items.map(({ id, _id, ...item }) => {
        const resolvedId = id || _id;
        if (!resolvedId) throw new Error("The subject authorization API returned an item without an id.");
        return { ...item, id: resolvedId };
      }),
    };
  }

  async listAllMyAuthorizations(): Promise<TeacherSubjectAuthorization[]> {
    const firstPage = await this.listMyAuthorizations();
    const remainingPages = await Promise.all(
      Array.from({ length: Math.max(0, firstPage.totalPages - 1) }, (_, index) =>
        this.listMyAuthorizations(index + 2)
      )
    );
    return [firstPage, ...remainingPages].flatMap((page) => page.items);
  }

  async requestAuthorization(
    payload: CreateTeacherSubjectAuthorizationPayload
  ): Promise<TeacherSubjectAuthorization> {
    const result = await apiClient<ApiTeacherSubjectAuthorization>("/teacher/subject-authorizations", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const id = result.id || result._id;
    if (!id) throw new Error("The subject authorization API returned an item without an id.");
    return { ...result, id };
  }

  adminList(status: TeacherSubjectAuthorizationStatus | "ALL", page: number, pageSize: number) {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (status !== "ALL") query.set("status", status);
    return apiClient<PagedResult<AdminSubjectAuthorization>>(`/admin/subject-authorizations?${query.toString()}`);
  }

  adminGet(id: string) {
    return apiClient<AdminSubjectAuthorization>(`/admin/subject-authorizations/${id}`);
  }

  adminApprove(id: string) {
    return apiClient<AdminSubjectAuthorization>(`/admin/subject-authorizations/${id}/approve`, {
      method: "POST",
      body: "{}",
    });
  }

  adminSuspend(id: string, reason: string) {
    return apiClient<AdminSubjectAuthorization>(`/admin/subject-authorizations/${id}/suspend`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  }
}

export const teacherSubjectAuthorizationService = new TeacherSubjectAuthorizationService();
