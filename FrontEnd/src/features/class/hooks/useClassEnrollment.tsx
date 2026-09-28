import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { App as AntdApp, Button } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../../stores/auth.store";
import { enrollmentService } from "../../../services/enrollment.service";
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
  const { data: studentEnrollments } = useQuery({
    queryKey: ["studentEnrollments", user?.userId],
    queryFn: () => (user?.userId ? enrollmentService.getEnrollmentsByStudent(user.userId) : []),
    enabled: Boolean(user?.userId),
  });

  const isEnrolled = (classId: string): boolean => {
    return Boolean(
      studentEnrollments?.some(
        (e) =>
          e.classId === classId &&
          (e.enrollmentStatus === "CONFIRMED" || e.enrollmentStatus === "COMPLETED")
      )
    );
  };

  // 1. PAID Class Enrollment Mutation -> navigates to Checkout
  const paidEnrollMutation = useMutation({
    mutationFn: (payload: { classId: string; studentId: string }) =>
      enrollmentService.createOrGetPendingEnrollment(payload),
    onSuccess: (enrollment) => {
      navigate(`/checkout/${enrollment.id}`);
    },
    onError: (error: Error) => {
      notification.error({
        message: "Không thể tiếp tục đăng ký",
        description: error.message || "Đã xảy ra lỗi khi tạo đơn đăng ký.",
        placement: "topRight",
      });
    },
  });

  // 2. FREE Class Enrollment Mutation -> directly CONFIRMED without Payment/Checkout
  const freeEnrollMutation = useMutation({
    mutationFn: (payload: { classId: string; studentId: string }) =>
      enrollmentService.createFreeEnrollment(payload),
    onSuccess: (enrollment) => {
      setFreeClassTarget(null);

      // Invalidate relevant server state queries
      queryClient.invalidateQueries({ queryKey: ["studentEnrollments", user?.userId] });
      queryClient.invalidateQueries({ queryKey: ["classDetail", enrollment.classId] });
      queryClient.invalidateQueries({ queryKey: ["classDiscovery"] });

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
    onError: (error: Error) => {
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

    // 4. Branch by classType: FREE vs PAID
    if (target.classType === "FREE") {
      // Open confirmation modal (NO checkout, NO payment)
      setFreeClassTarget(target);
    } else {
      // PAID flow: create/reuse PENDING_PAYMENT -> Checkout
      paidEnrollMutation.mutate({
        classId: target.id,
        studentId: user.userId,
      });
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
    isEnrolling: paidEnrollMutation.isPending || freeEnrollMutation.isPending,
    enrollingClassId:
      paidEnrollMutation.variables?.classId || freeEnrollMutation.variables?.classId,
    freeEnrollModal,
  };
}
