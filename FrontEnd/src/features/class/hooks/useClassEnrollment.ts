import { useNavigate } from "react-router-dom";
import { App as AntdApp } from "antd";
import { useMutation } from "@tanstack/react-query";
import { useAuthStore } from "../../../stores/auth.store";
import { enrollmentService } from "../../../services/enrollment.service";

export interface EnrollableClassTarget {
  id: string;
  classType: "FREE" | "PAID" | string;
  canEnroll?: boolean;
}

export function useClassEnrollment() {
  const navigate = useNavigate();
  const { notification } = AntdApp.useApp();
  const { user, isAuthenticated } = useAuthStore();

  const enrollMutation = useMutation({
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

  const handleEnrollClass = (target: EnrollableClassTarget) => {
    if (target.canEnroll === false) return;

    // 1. FREE class handling - explicitly separate from paid checkout
    if (target.classType === "FREE") {
      notification.info({
        message: "Thông báo đăng ký lớp",
        description: "Luồng đăng ký lớp miễn phí sẽ được xử lý riêng.",
        placement: "topRight",
      });
      return;
    }

    // 2. Authentication check
    if (!isAuthenticated || !user) {
      navigate(`/login?redirect=${encodeURIComponent(`/classes/${target.id}`)}`);
      return;
    }

    // 3. Role authorization check
    if (user.role !== "STUDENT") {
      notification.error({
        message: "Quyền truy cập bị từ chối",
        description: "Chỉ tài khoản học viên (Student) mới có thể đăng ký tham gia lớp học.",
        placement: "topRight",
      });
      return;
    }

    // 4. Create or reuse Enrollment -> Navigate to Checkout
    enrollMutation.mutate({
      classId: target.id,
      studentId: user.userId,
    });
  };

  return {
    handleEnrollClass,
    isEnrolling: enrollMutation.isPending,
    enrollingClassId: enrollMutation.variables?.classId,
  };
}
