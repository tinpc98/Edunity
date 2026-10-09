// ============================================================
// catalog.service.ts — Category + Subject API integration
// Routes: GET /categories, GET /categories/:id/subjects,
//         GET /subjects/:id (public, no auth required)
//         POST/PATCH /admin/categories, /admin/subjects (admin)
// ============================================================

import { apiClient } from "../api/apiClient";
import {
  adaptCategory,
  adaptSubject,
} from "../api/catalogAdapters";
import type {
  ApiCategory,
  ApiSubject,
  Category,
  Subject,
  CreateCategoryPayload,
  UpdateCategoryPayload,
  CreateSubjectPayload,
  UpdateSubjectPayload,
} from "../types/catalog";

class CatalogService {
  // ─── PUBLIC ────────────────────────────────────────────────

  /** GET /categories — returns ACTIVE categories (public, no auth) */
  async listCategories(): Promise<Category[]> {
    const raw = await apiClient<ApiCategory[]>("/categories");
    return (raw || []).map(adaptCategory);
  }

  /** GET /categories/:id/subjects — returns ACTIVE subjects for a category */
  async listSubjectsByCategory(categoryId: string): Promise<Subject[]> {
    const raw = await apiClient<ApiSubject[]>(`/categories/${categoryId}/subjects`);
    return (raw || []).map(adaptSubject);
  }

  /** GET /subjects/:id — returns subject detail with embedded course refs */
  async getSubject(subjectId: string): Promise<Subject> {
    const raw = await apiClient<ApiSubject>(`/subjects/${subjectId}`);
    return adaptSubject(raw);
  }

  // ─── ADMIN ─────────────────────────────────────────────────

  /** POST /admin/categories */
  async createCategory(payload: CreateCategoryPayload): Promise<Category> {
    const raw = await apiClient<ApiCategory>("/admin/categories", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return adaptCategory(raw);
  }

  /** PATCH /admin/categories/:id */
  async updateCategory(id: string, payload: UpdateCategoryPayload): Promise<Category> {
    const raw = await apiClient<ApiCategory>(`/admin/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return adaptCategory(raw);
  }

  /** POST /admin/subjects */
  async createSubject(payload: CreateSubjectPayload): Promise<Subject> {
    const raw = await apiClient<ApiSubject>("/admin/subjects", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return adaptSubject(raw);
  }

  /** PATCH /admin/subjects/:id */
  async updateSubject(id: string, payload: UpdateSubjectPayload): Promise<Subject> {
    const raw = await apiClient<ApiSubject>(`/admin/subjects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return adaptSubject(raw);
  }
}

export const catalogService = new CatalogService();
