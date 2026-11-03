import { ROUTES } from "../../routes/routePaths";
import { teacherVerificationService } from "../../services/teacherVerification.service";
import type { UserRole } from "../../types/auth";

export function getRoleHome(role: UserRole): string {
  if (role === "TEACHER") return ROUTES.TEACHER.HOME;
  if (role === "ADMIN") return ROUTES.ADMIN.HOME;
  if (role === "SPONSOR") return ROUTES.SPONSOR.HOME;
  return ROUTES.STUDENT.HOME;
}

/** Only same-origin relative paths are accepted, so `?redirect=` cannot send users to another site. */
export function getSafeRedirect(redirect: string | null): string | null {
  if (!redirect || !redirect.startsWith("/") || redirect.startsWith("//")) return null;
  return redirect;
}

/** Areas a role may land on after login through `?redirect=` (public pages are always allowed). */
const ROLE_PREFIXES: Record<UserRole, string> = {
  STUDENT: "/student",
  TEACHER: "/teacher",
  ADMIN: "/admin",
  SPONSOR: "/sponsor",
};

function isRedirectAllowed(path: string, role: UserRole): boolean {
  const otherAreas = Object.entries(ROLE_PREFIXES).filter(([r]) => r !== role).map(([, prefix]) => prefix);
  return !otherAreas.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Where to go right after a successful login:
 * - TEACHER + UNVERIFIED -> registration step 2 (/register/teacher/qualification)
 * - TEACHER + REJECTED   -> teacher profile (/teacher/profile) to review reason & resubmit
 * - TEACHER + PENDING / VERIFIED (or fallback on error) -> teacher dashboard (/teacher)
 */
export async function resolvePostLoginPath(role: UserRole, redirect: string | null): Promise<string> {
  const safe = getSafeRedirect(redirect);
  if (safe && isRedirectAllowed(safe, role)) return safe;

  if (role === "TEACHER") {
    try {
      const verification = await teacherVerificationService.getMyVerification();
      if (verification.verificationStatus === "UNVERIFIED") return ROUTES.AUTH.TEACHER_QUALIFICATION;
      if (verification.verificationStatus === "REJECTED") return ROUTES.TEACHER.PROFILE;
    } catch {
      // Verification status is optional for routing: fall back to the dashboard
    }
  }
  return getRoleHome(role);
}
