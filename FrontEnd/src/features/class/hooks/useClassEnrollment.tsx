import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { App as AntdApp, Button } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../../stores/auth.store";
import { enrollmentService, enrollmentKeys } from "../../../services/enrollment.service";
import { sessionKeys } from "../../../services/session.service";
import { FetchError } from "../../../api/apiClient";
import { ROUTES } from "../../../routes/routePaths";
import FreeEnrollmentModal from "../components/FreeEnrollmentModal";

export interface EnrollableClassTarget {
  id: string;
  className?: string;
  title: string;
  courseTitle?: string;
  teacherName?: string;
  scheduleText?: string;
  classType: "FREE" | "PAID" | string;
  canEnroll?: boolean;
}

export function useClassEnrollment() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { notification } = AntdApp.useApp();
  const { user, isAuthenticated } = useAuthStore();

  const [freeClassTarget, setFreeClassTarget] = useState<EnrollableClassTarget | null>(null);

  // Query existing student enrollments to derive confirmed enrollment state
  const { data: studentEnrollmentsData } = useQuery({
    queryKey: enrollmentKeys.myList(1, 100),
    queryFn: () => enrollmentService.getMyEnrollments(1, 100, "class"),
    enabled: Boolean(user?.userId && user?.role === "STUDENT"),
  });
  const studentEnrollments = studentEnrollmentsData?.items || [];

  const isEnrolled = (classId: string): boolean => {
    return Boolean(
      studentEnrollments?.some(
        (e) =>
          e.classId === classId &&
          (e.enrollmentStatus === "CONFIRMED" || e.enrollmentStatus === "COMPLETED")
      )
    );
  };

  // A PAID enrollment still holding its seat: the card offers "Tiếp tục thanh toán" instead of a new registration
  const getPendingEnrollmentId = (classId: string): string | null => {
    const pending = studentEnrollments?.find(
      (e) =>
        e.classId === classId &&
        e.enrollmentStatus === "PENDING_PAYMENT" &&
        (!e.holdExpiresAt || new Date(e.holdExpiresAt).getTime() > Date.now())
    );
    return pending ? pending.id : null;
  };

  // Seats, the student's enrollment list and their schedule all change after an enrollment
  const refreshAfterEnrollment = (classId: string) => {
    queryClient.invalidateQueries({ queryKey: enrollmentKeys.all });
    queryClient.invalidateQueries({ queryKey: enrollmentKeys.availability(classId) });
    queryClient.invalidateQueries({ queryKey: ["classDetail", classId] });
    queryClient.invalidateQueries({ queryKey: ["classDiscovery"] });
    queryClient.invalidateQueries({ queryKey: sessionKeys.all });
  };

  /**
   * The backend answers DUPLICATE_ENROLLMENT with the existing enrollment: a PENDING_PAYMENT hold is resumed
   * at checkout instead of being reported as an error. Returns true when the error was handled.
   */
  const handleDuplicateEnrollment = (error: unknown, classId: string): boolean => {
    if (!(error instanceof FetchError) || error.code !== "DUPLICATE_ENROLLMENT") return false;
    const details = (error.details || {}) as { existingEnrollmentId?: string; enrollmentStatus?: string };
    refreshAfterEnrollment(classId);
    if (details.enrollmentStatus === "PENDING_PAYMENT" && details.existingEnrollmentId) {
      notification.info({
        message: "Bạn đang có đơn đăng ký chờ thanh toán",
        description: "Chuyển tới trang thanh toán để hoàn tất đăng ký.",
        placement: "topRight",
      });
      navigate(`/checkout/${details.existingEnrollmentId}`);
      return true;
    }
    notification.info({
      message: "Đã đăng ký lớp",
      description: "Bạn đã đăng ký lớp học này trước đó. Vui lòng kiểm tra trong mục Học tập của tôi.",
      placement: "topRight",
    });
    return true;
  };

  // 2. FREE Class Enrollment Mutation -> directly CONFIRMED without Payment/Checkout
  const freeEnrollMutation = useMutation({
    mutationFn: (payload: { classId: string; studentId: string }) =>
      enrollmentService.createFreeEnrollment(payload),
    onSuccess: (enrollment) => {
      setFreeClassTarget(null);

      refreshAfterEnrollment(enrollment.classId);

      // Immediate success feedback with link to My Learning
      notification.success({
        message: "Đăng ký lớp thành công!",
        description: "Bạn đã đăng ký tham gia lớp học thành công. Lớp học đã được thêm vào mục Học tập của tôi.",
        btn: (
          <Button
            type="primary"
            size="small"
            onClick={() => navigate(ROUTES.STUDENT.HOME)}
            className="bg-indigo-600 font-semibold text-xs rounded-md"
          >
            Đến My Learning
          </Button>
        ),
        duration: 6,
        placement: "topRight",
      });
    },
    onError: (error: Error, variables) => {
      setFreeClassTarget(null);
      if (handleDuplicateEnrollment(error, variables.classId)) return;
      notification.error({
        message: "Đăng ký không thành công",
        description: error.message || "Đã xảy ra lỗi khi xác nhận đăng ký lớp học miễn phí.",
        placement: "topRight",
      });
    },
  });

  const handleEnrollClass = (target: EnrollableClassTarget) => {
    if (target.canEnroll === false) return;

    // 1. Authentication check
    if (!isAuthenticated || !user) {
      navigate(`/login?redirect=${encodeURIComponent(`/classes/${target.id}`)}`);
      return;
    }

    // 2. Role authorization check
    if (user.role !== "STUDENT") {
      notification.error({
        message: "Quyền truy cập bị từ chối",
        description: "Chỉ tài khoản học viên (Student) mới có thể đăng ký tham gia lớp học.",
        placement: "topRight",
      });
      return;
    }

    // 3. Duplicate enrollment check
    if (isEnrolled(target.id)) {
      notification.info({
        message: "Đã đăng ký lớp",
        description: "Bạn đã đăng ký lớp học này trước đó. Vui lòng kiểm tra trong mục Học tập của tôi.",
        placement: "topRight",
      });
      return;
    }

    // 4. A seat already held for this student: resume its checkout
    const pendingId = getPendingEnrollmentId(target.id);
    if (pendingId) {
      navigate(`/checkout/${pendingId}`);
      return;
    }

    // 5. Branch by classType. PAID classes are registered on the class page, the one place that offers both
    // direct payment and scholarship payment (a single registration flow instead of two diverging ones).
    if (target.classType === "FREE") {
      setFreeClassTarget(target);
    } else {
      navigate(`/classes/${target.id}`);
    }
  };

  const handleConfirmFreeEnrollment = () => {
    if (!freeClassTarget || !user) return;
    freeEnrollMutation.mutate({
      classId: freeClassTarget.id,
      studentId: user.userId,
    });
  };

  const freeEnrollModal = (
    <FreeEnrollmentModal
      open={Boolean(freeClassTarget)}
      classItem={freeClassTarget}
      loading={freeEnrollMutation.isPending}
      onConfirm={handleConfirmFreeEnrollment}
      onCancel={() => setFreeClassTarget(null)}
    />
  );

  return {
    handleEnrollClass,
    isEnrolled,
    getPendingEnrollmentId,
    isEnrolling: freeEnrollMutation.isPending,
    enrollingClassId: freeEnrollMutation.variables?.classId,
    freeEnrollModal,
  };
}
