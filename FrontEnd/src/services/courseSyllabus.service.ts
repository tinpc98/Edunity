import { apiClient } from "../api/apiClient";
import type {
  CreateSyllabusVersionPayload,
  CurriculumUnit,
  CurriculumUnitPayload,
  SyllabusVersion,
  SyllabusVersionList,
  UpdateSyllabusVersionPayload,
} from "../types/courseGovernance";

interface ApiEntity {
  id?: string;
  _id?: string;
}

interface ApiCurriculumUnit extends ApiEntity {
  unitOrder: number;
  title: string;
  description?: string;
  learningObjectives?: string;
  durationMinutes?: number | null;
  topics?: string[];
}

interface ApiSyllabusVersion extends ApiEntity {
  courseId: string;
  versionNumber: number;
  title: string;
  summary?: string;
  status: SyllabusVersion["status"];
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
  archivedAt?: string | null;
  units?: ApiCurriculumUnit[];
}

function requireId(entity: ApiEntity, label: string): string {
  const id = entity.id || entity._id;
  if (!id) throw new Error(`The API returned a ${label} without an id.`);
  return id;
}

function adaptUnit(raw: ApiCurriculumUnit): CurriculumUnit {
  return {
    id: requireId(raw, "curriculum unit"),
    unitOrder: raw.unitOrder,
    title: raw.title,
    description: raw.description || "",
    learningObjectives: raw.learningObjectives || "",
    durationMinutes: raw.durationMinutes ?? null,
    topics: raw.topics || [],
  };
}

function adaptVersion(raw: ApiSyllabusVersion): SyllabusVersion {
  return {
    id: requireId(raw, "syllabus version"),
    courseId: raw.courseId,
    versionNumber: raw.versionNumber,
    title: raw.title,
    summary: raw.summary || "",
    status: raw.status,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    publishedAt: raw.publishedAt,
    archivedAt: raw.archivedAt,
    units: raw.units?.map(adaptUnit),
  };
}

export interface PublishedSyllabus {
  courseId: string;
  courseTitle: string;
  source: "VERSIONED" | "LEGACY" | "NONE";
  version: Pick<SyllabusVersion, "id" | "versionNumber" | "title" | "status" | "publishedAt"> | null;
  units: CurriculumUnit[];
  legacySyllabus: string | null;
}

class CourseSyllabusService {
  async listVersions(courseId: string): Promise<SyllabusVersionList> {
    const raw = await apiClient<{
      courseId: string;
      courseTitle: string;
      publishedSyllabusVersionId: string | null;
      versions: ApiSyllabusVersion[];
    }>(`/admin/courses/${courseId}/syllabus-versions`);
    return {
      ...raw,
      versions: raw.versions.map(adaptVersion),
    };
  }

  async getVersion(courseId: string, versionId: string): Promise<SyllabusVersion> {
    const raw = await apiClient<ApiSyllabusVersion>(
      `/admin/courses/${courseId}/syllabus-versions/${versionId}`
    );
    return adaptVersion(raw);
  }

  async createVersion(courseId: string, payload: CreateSyllabusVersionPayload): Promise<SyllabusVersion> {
    const raw = await apiClient<ApiSyllabusVersion>(`/admin/courses/${courseId}/syllabus-versions`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return adaptVersion(raw);
  }

  async updateVersion(
    courseId: string,
    versionId: string,
    payload: UpdateSyllabusVersionPayload
  ): Promise<SyllabusVersion> {
    const raw = await apiClient<ApiSyllabusVersion>(
      `/admin/courses/${courseId}/syllabus-versions/${versionId}`,
      { method: "PATCH", body: JSON.stringify(payload) }
    );
    return adaptVersion(raw);
  }

  async addUnit(courseId: string, versionId: string, payload: CurriculumUnitPayload): Promise<CurriculumUnit> {
    const raw = await apiClient<ApiCurriculumUnit>(
      `/admin/courses/${courseId}/syllabus-versions/${versionId}/units`,
      { method: "POST", body: JSON.stringify(payload) }
    );
    return adaptUnit(raw);
  }

  async updateUnit(
    courseId: string,
    versionId: string,
    unitId: string,
    payload: Partial<CurriculumUnitPayload>
  ): Promise<CurriculumUnit> {
    const raw = await apiClient<ApiCurriculumUnit>(
      `/admin/courses/${courseId}/syllabus-versions/${versionId}/units/${unitId}`,
      { method: "PATCH", body: JSON.stringify(payload) }
    );
    return adaptUnit(raw);
  }

  async deleteUnit(courseId: string, versionId: string, unitId: string): Promise<void> {
    await apiClient(`/admin/courses/${courseId}/syllabus-versions/${versionId}/units/${unitId}`, {
      method: "DELETE",
    });
  }

  async reorderUnits(courseId: string, versionId: string, unitIds: string[]): Promise<CurriculumUnit[]> {
    const raw = await apiClient<ApiCurriculumUnit[]>(
      `/admin/courses/${courseId}/syllabus-versions/${versionId}/units/reorder`,
      { method: "PUT", body: JSON.stringify({ unitIds }) }
    );
    return raw.map(adaptUnit);
  }

  async publishVersion(courseId: string, versionId: string): Promise<unknown> {
    return apiClient(`/admin/courses/${courseId}/syllabus-versions/${versionId}/publish`, {
      method: "POST",
    });
  }

  async archiveVersion(courseId: string, versionId: string): Promise<unknown> {
    return apiClient(`/admin/courses/${courseId}/syllabus-versions/${versionId}/archive`, {
      method: "POST",
    });
  }

  async getPublishedSyllabus(courseId: string): Promise<PublishedSyllabus> {
    const raw = await apiClient<{
      courseId: string;
      courseTitle: string;
      source: PublishedSyllabus["source"];
      version: (ApiSyllabusVersion & ApiEntity) | null;
      units: ApiCurriculumUnit[];
      legacySyllabus: string | null;
    }>(`/courses/${courseId}/syllabus`);
    return {
      courseId: raw.courseId,
      courseTitle: raw.courseTitle,
      source: raw.source,
      version: raw.version
        ? {
            id: requireId(raw.version, "published syllabus version"),
            versionNumber: raw.version.versionNumber,
            title: raw.version.title,
            status: raw.version.status,
            publishedAt: raw.version.publishedAt,
          }
        : null,
      units: raw.units.map(adaptUnit),
      legacySyllabus: raw.legacySyllabus,
    };
  }
}

export const courseSyllabusService = new CourseSyllabusService();
