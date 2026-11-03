import { useQuery, type QueryClient } from "@tanstack/react-query";
import { teacherVerificationService } from "../services/teacherVerification.service";
import { useAuthStore } from "../stores/auth.store";
import type { TeacherVerificationStatus, VerificationStatus } from "../types/teacherVerification";

export const teacherVerificationKeys = {
  all: ["teacherVerification"] as const,
  my: (userId?: string) => ["teacherVerification", userId] as const,
};

export const VERIFICATION_REQUIRED_MESSAGE =
  "Bạn cần được xác minh hồ sơ giảng viên trước khi sử dụng chức năng này.";

export function getVerificationGuidanceMessage(status?: VerificationStatus): string {
  switch (status) {
    case "REJECTED":
      return "Hồ sơ của bạn chưa được duyệt. Vui lòng xem lý do và cập nhật hồ sơ xác minh.";
    case "PENDING":
      return "Hồ sơ của bạn đang chờ xét duyệt. Bạn sẽ được mở các chức năng giảng dạy sau khi được xác minh.";
    case "UNVERIFIED":
      return "Bạn cần hoàn thiện hồ sơ xác minh để sử dụng các chức năng giảng dạy.";
    default:
      return VERIFICATION_REQUIRED_MESSAGE;
  }
}

/**
 * Invalidates all query keys holding Teacher verification/profile state across
 * Dashboard, Profile, Onboarding, Sidebar, and Route Guards so UI updates without F5.
 */
export async function invalidateTeacherVerificationState(
  queryClient: QueryClient,
  userId?: string
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: teacherVerificationKeys.all }),
    ...(userId ? [queryClient.invalidateQueries({ queryKey: teacherVerificationKeys.my(userId) })] : []),
    queryClient.invalidateQueries({ queryKey: ["teacherProfile"] }),
    queryClient.invalidateQueries({ queryKey: ["teacher-dashboard-profile"] }),
    queryClient.invalidateQueries({ queryKey: ["myProfile"] }),
  ]);
}

export interface UseTeacherVerificationResult {
  verification: TeacherVerificationStatus | undefined;
  verificationStatus: VerificationStatus | undefined;
  isVerified: boolean;
  isTeacher: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
}

/**
 * Single source-of-truth hook for Teacher verification state on the Frontend.
 * Fail-closed: `isVerified` is strictly false while loading, on API error, or when status !== "VERIFIED".
 */
export function useTeacherVerification(): UseTeacherVerificationResult {
  const { user, isAuthenticated } = useAuthStore();
  const isTeacher = Boolean(isAuthenticated && user?.userId && user.role === "TEACHER");

  const query = useQuery({
    queryKey: teacherVerificationKeys.my(user?.userId),
    queryFn: () => teacherVerificationService.getMyVerification(),
    enabled: isTeacher,
    staleTime: 30_000,
  });

  const verificationStatus: VerificationStatus | undefined =
    !query.isLoading && !query.isError ? query.data?.verificationStatus : undefined;

  const isVerified = Boolean(
    isTeacher &&
      !query.isLoading &&
      !query.isError &&
      query.data?.verificationStatus === "VERIFIED"
  );

  return {
    verification: query.data,
    verificationStatus,
    isVerified,
    isTeacher,
    isLoading: isTeacher ? query.isLoading : false,
    isError: isTeacher ? query.isError : false,
    error: query.error,
    refetch: query.refetch,
  };
}
