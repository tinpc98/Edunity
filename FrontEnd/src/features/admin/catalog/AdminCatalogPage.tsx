import { Navigate } from "react-router-dom";

/**
 * Legacy AdminCatalogPage.
 * Per TASK ADMIN-CATALOG-FIX-01, the catalog has been split into 3 independent pages:
 * - /admin/categories -> AdminCategoriesPage
 * - /admin/subjects -> AdminSubjectsPage
 * - /admin/courses -> AdminCoursesPage
 *
 * This redirect component safely handles any legacy references without creating redirect loops.
 */
export default function AdminCatalogPage() {
  return <Navigate to="/admin/categories" replace />;
}
