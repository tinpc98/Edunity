import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Progress, Alert, Popconfirm, Modal, message } from "antd";
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  ArrowRightOutlined,
  LoginOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClassDiscoveryItem } from "../../../types/classDiscovery";
import type { CreatePaymentResponse } from "../../../types/payment";
import { useAuthStore } from "../../../stores/auth.store";
import { enrollmentService, enrollmentKeys } from "../../../services/enrollment.service";
import { classKeys } from "../../../services/class.service";
import { gatewayPaymentService } from "../../../services/gatewayPayment.service";
import { useHoldCountdown } from "../../../hooks/useHoldCountdown";
import { ROUTES } from "../../../routes/routePaths";
import DirectTuitionPaymentModal from "./DirectTuitionPaymentModal";
import { formatScheduleEntries } from "../../../api/classAdapters";
import { checkScheduleConflicts, type ScheduleConflict } from "../../../utils/scheduleConflict";

interface ClassRegistrationCardProps {
  item: ClassDiscoveryItem;
  /** Planned session count; undefined while sessions are still loading */
  sessionCount?: number;
}

export default function ClassRegistrationCard({ item, sessionCount }: ClassRegistrationCardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuthStore();

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentIntent, setPaymentIntent] = useState<CreatePaymentResponse | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  // Schedule conflict modal state
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [detectedConflicts, setDetectedConflicts] = useState<ScheduleConflict[]>([]);

  // 1. Fetch real class availability
  const { data: availability } = useQuery({
    queryKey: enrollmentKeys.availability(item.id),
    queryFn: () => enrollmentService.getClassAvailability(item.id),
    enabled: Boolean(item.id),
    staleTime: 1000 * 15,
  });

  // 2. Query student's active enrollments if authenticated as STUDENT
  const isStudent = isAuthenticated && user?.role === "STUDENT";
  const { data: enrollmentsData } = useQuery({
    queryKey: enrollmentKeys.myList(1, 100),
    queryFn: () => enrollmentService.getMyEnrollments(1, 100, "class"),
    enabled: isStudent,
  });

  const myEnrollments = enrollmentsData?.items || [];
  const activeEnrollment = myEnrollments.find(
    (e) =>
      e.classId === item.id &&
      ["PENDING_PAYMENT", "CONFIRMED", "COMPLETED"].includes(e.enrollmentStatus)
  );

  // 3. Countdown timer for PENDING_PAYMENT hold
  const { formatted: countdownText, isExpired: holdExpired } = useHoldCountdown(
    activeEnrollment?.enrollmentStatus === "PENDING_PAYMENT" ? activeEnrollment.holdExpiresAt : null,
    () => {
      // Invalidate queries upon countdown zero to reflect server-side expiry
      queryClient.invalidateQueries({ queryKey: enrollmentKeys.availability(item.id) });
      queryClient.invalidateQueries({ queryKey: enrollmentKeys.myList(1, 100) });
    }
  );

  // 4. Cancel Enrollment Mutation
  const cancelEnrollMutation = useMutation({
    mutationFn: (enrollmentId: string) => enrollmentService.cancelEnrollment(enrollmentId),
    onSuccess: () => {
      message.success("Đã hủy giữ chỗ thành công.");
      queryClient.invalidateQueries({ queryKey: enrollmentKeys.availability(item.id) });
      queryClient.invalidateQueries({ queryKey: classKeys.availability(item.id) });
      queryClient.invalidateQueries({ queryKey: enrollmentKeys.myList(1, 100) });
    },
    onError: (err: any) => {
      message.error(err.message || "Không thể hủy đơn đăng ký.");
    },
  });

  const isFree = item.classType === "FREE";
  const scheduleLines = formatScheduleEntries(item.schedule);
  const capacity = availability ? availability.capacity : item.capacity;
  const enrolledCount = availability ? availability.enrolledCount : item.enrolledCount;
  const seatsLeft = availability ? availability.remaining : item.seatsLeft;
  const isFull = seatsLeft <= 0;
  const enrollmentOpen = availability ? availability.enrollmentOpen : item.canEnroll;

  const capacityPercent = Math.min(
    100,
    Math.round((enrolledCount / (capacity || 1)) * 100)
  );

  const isConfirmed =
    activeEnrollment &&
    (activeEnrollment.enrollmentStatus === "CONFIRMED" ||
      activeEnrollment.enrollmentStatus === "COMPLETED");

  const isPending =
    activeEnrollment &&
    activeEnrollment.enrollmentStatus === "PENDING_PAYMENT" &&
    !holdExpired;

  const isExpiredState =
    (activeEnrollment && activeEnrollment.enrollmentStatus === "EXPIRED") ||
    (activeEnrollment?.enrollmentStatus === "PENDING_PAYMENT" && holdExpired);

  const targetClassRoute = ROUTES.STUDENT.CLASS_SESSIONS.replace(":classId", item.id);

  // Core execution: creates reservation & payment intent
  const executeRegistration = async () => {
    // FREE class -> enrolls immediately without payment
    if (isFree) {
      try {
        setIsRegistering(true);
        await enrollmentService.createEnrollment(item.id);
        message.success("Đăng ký lớp học thành công! Bạn có thể vào học ngay.");
        queryClient.invalidateQueries({ queryKey: enrollmentKeys.all });
        queryClient.invalidateQueries({ queryKey: enrollmentKeys.availability(item.id) });
        queryClient.invalidateQueries({ queryKey: ["classDetail", item.id] });
        queryClient.invalidateQueries({ queryKey: ["classDiscovery"] });
        navigate(targetClassRoute);
      } catch (err: any) {
        message.error(err?.message || "Không thể đăng ký lớp học.");
      } finally {
        setIsRegistering(false);
      }
      return;
    }

    // PAID class -> reserve seat + create tuition payment intent
    try {
      setIsRegistering(true);
      let targetEnrollmentId = activeEnrollment && !holdExpired ? activeEnrollment.id : null;

      if (!targetEnrollmentId) {
        try {
          const newEnrollment = await enrollmentService.createEnrollment(item.id);
          targetEnrollmentId = newEnrollment.id;
        } catch (enrollErr: any) {
          if (enrollErr?.code === "DUPLICATE_ENROLLMENT" && enrollErr?.details?.existingEnrollmentId) {
            targetEnrollmentId = enrollErr.details.existingEnrollmentId;
          } else {
            throw enrollErr;
          }
        }
      }

      if (!targetEnrollmentId) {
        throw new Error("Không thể khởi tạo hoặc tìm thấy đơn đăng ký lớp học.");
      }

      // Automatically create payment intent for tuition
      const intent = await gatewayPaymentService.createPayment(targetEnrollmentId);

      // Invalidate queries to update reservation count & state
      queryClient.invalidateQueries({ queryKey: enrollmentKeys.availability(item.id) });
      queryClient.invalidateQueries({ queryKey: enrollmentKeys.myList(1, 100) });

      // Open Direct VietQR Payment Modal
      setPaymentIntent(intent);
      setPaymentModalOpen(true);
    } catch (err: any) {
      if (err?.code === "PAYMENT_PROVIDER_DISABLED" || err?.status === 503) {
        message.error(
          "Cổng thanh toán thật payOS hiện chưa được kích hoạt hoặc đang bảo trì. Vui lòng liên hệ quản trị viên hoặc quay lại sau."
        );
      } else {
        message.error(err?.message || "Không thể khởi tạo thanh toán.");
      }
    } finally {
      setIsRegistering(false);
    }
  };

  // Pre-check for schedule conflicts before creating reservation
  const handleInitiateRegistration = () => {
    // 1. Unauthenticated check -> redirect to login with return path
    if (!isAuthenticated || !user) {
      navigate(`/login?redirect=${encodeURIComponent(`/classes/${item.id}`)}`);
      return;
    }

    // 2. Role check -> must be STUDENT
    if (user.role !== "STUDENT") {
      message.error("Chỉ tài khoản học viên (Student) mới có thể đăng ký lớp học.");
      return;
    }

    // 3. Schedule conflict check if registering a new class
    if (!isPending) {
      const conflicts = checkScheduleConflicts(item, myEnrollments);
      if (conflicts.length > 0) {
        setDetectedConflicts(conflicts);
        setConflictModalOpen(true);
        return;
      }
    }

    executeRegistration();
  };

  return (
    <div className="bg-white rounded-2xl border border-[#D6E5E2] p-6 shadow-xs flex flex-col gap-5">
      {/* Price Section */}
      <div>
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
          Học phí lớp học
        </div>
        <div className="text-3xl font-black tracking-tight text-[#0D9488]">
          {item.formattedPrice}
        </div>
        {item.pricingPolicySnapshot && (
          <div className="mt-2 rounded-lg bg-[#F5FAF9] border border-[#D6E5E2]/60 p-3 text-xs text-[#334155]">
            <div className="font-semibold text-[#163B40]">Khung chính sách lúc tạo lớp</div>
            <div className="mt-1">
              {item.pricingPolicySnapshot.minPrice != null && item.pricingPolicySnapshot.maxPrice != null
                ? `${Number(item.pricingPolicySnapshot.minPrice).toLocaleString("vi-VN")}đ – ${Number(item.pricingPolicySnapshot.maxPrice).toLocaleString("vi-VN")}đ`
                : "Không có giới hạn giá trong bản lưu"}
              {item.pricingPolicySnapshot.minSessions != null && item.pricingPolicySnapshot.maxSessions != null
                ? ` · ${item.pricingPolicySnapshot.minSessions}–${item.pricingPolicySnapshot.maxSessions} buổi`
                : ""}
            </div>
            {item.pricingPolicySnapshot.version != null && (
              <div className="mt-1 text-[11px] text-slate-500">
                Policy {item.pricingPolicySnapshot.policyKey || ""} v{item.pricingPolicySnapshot.version}
              </div>
            )}
            <div className="mt-1 text-[11px]">
              Mức học phí trên là giá của lớp; phần trích theo từng học viên hoặc ngoại lệ không được API pricing hiện tại cung cấp.
            </div>
          </div>
        )}
      </div>

      {/* Capacity & Progress */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-700">
            Còn {seatsLeft}/{capacity} chỗ
          </span>
          {seatsLeft <= 3 && seatsLeft > 0 && (
            <span className="text-[11px] font-semibold text-amber-600">Sắp hết chỗ</span>
          )}
        </div>
        <Progress
          percent={capacityPercent}
          showInfo={false}
          size={["100%", 5]}
          strokeColor="#0D9488"
          trailColor="#CCFBF1"
          className="!m-0"
        />
      </div>

      {/* Status Banner when user is already enrolled or holding a seat */}
      {isConfirmed && (
        <Alert
          type="success"
          showIcon
          icon={<CheckCircleOutlined className="text-emerald-600" />}
          message="Bạn đã đăng ký thành công lớp học này"
          description="Lớp học đã có trong mục Lớp học của tôi. Bạn có thể vào học và xem lịch học chi tiết."
          className="rounded-xl text-xs bg-emerald-50/80 border-emerald-200"
        />
      )}

      {isPending && (
        <Alert
          type="warning"
          showIcon
          icon={<ClockCircleOutlined className="text-amber-600" />}
          message={`Đang giữ chỗ · Còn lại ${countdownText}`}
          description={
            <div className="space-y-2 mt-1">
              <p className="text-xs text-amber-900">
                Chỗ ngồi của bạn đang được hệ thống giữ tạm thời. Vui lòng hoàn tất thanh toán trước khi hết hạn.
              </p>
              <div className="flex items-center justify-between pt-1 text-xs">
                <Link
                  to={ROUTES.STUDENT.ENROLLMENTS}
                  className="font-semibold text-[#0D9488] hover:underline"
                >
                  Xem đơn đăng ký
                </Link>
                <Popconfirm
                  title="Hủy giữ chỗ?"
                  description="Bạn có chắc muốn hủy đơn này và nhường chỗ cho học viên khác?"
                  okText="Hủy chỗ"
                  cancelText="Không"
                  okButtonProps={{ danger: true, loading: cancelEnrollMutation.isPending }}
                  onConfirm={() => cancelEnrollMutation.mutate(activeEnrollment.id)}
                >
                  <button
                    type="button"
                    className="text-slate-400 hover:text-rose-600 transition-colors text-xs underline cursor-pointer bg-transparent border-none p-0"
                  >
                    Hủy giữ chỗ
                  </button>
                </Popconfirm>
              </div>
            </div>
          }
          className="rounded-xl text-xs bg-amber-50/70 border-amber-200"
        />
      )}

      {isExpiredState && (
        <Alert
          type="info"
          showIcon
          message="Đơn đăng ký đã hết hạn"
          description="Thời gian giữ chỗ trước đó đã kết thúc. Bạn có thể đăng ký lại nếu lớp học còn chỗ."
          className="rounded-xl text-xs bg-slate-50 border-slate-200 text-slate-700"
        />
      )}

      {/* Primary Action Buttons */}
      {isConfirmed ? (
        <Button
          type="primary"
          size="large"
          onClick={() => navigate(targetClassRoute)}
          icon={<ArrowRightOutlined />}
          className="font-bold text-sm h-12 rounded-xl w-full bg-[#0D9488] hover:bg-[#0B746C] border-none shadow-xs"
        >
          Vào lớp học của tôi
        </Button>
      ) : isPending ? (
        <div className="flex flex-col gap-2 w-full">
          <Button
            type="primary"
            size="large"
            loading={isRegistering}
            onClick={executeRegistration}
            className="font-bold text-sm h-12 rounded-xl w-full bg-[#0D9488] hover:bg-[#0B746C] border-none shadow-xs"
          >
            Tiếp tục thanh toán
          </Button>
        </div>
      ) : !isAuthenticated ? (
        <Button
          type="primary"
          size="large"
          onClick={() => navigate(`/login?redirect=${encodeURIComponent(`/classes/${item.id}`)}`)}
          icon={<LoginOutlined />}
          className="font-bold text-sm h-12 rounded-xl w-full bg-[#0D9488] hover:bg-[#0B746C] border-none shadow-xs"
        >
          Đăng nhập để đăng ký
        </Button>
      ) : user?.role !== "STUDENT" ? (
        <Button
          size="large"
          disabled
          className="font-medium text-xs h-12 rounded-xl w-full bg-slate-100 text-slate-400"
        >
          Chỉ dành cho tài khoản học viên (Student)
        </Button>
      ) : isFull ? (
        <Button
          size="large"
          disabled
          className="font-medium text-sm h-12 rounded-xl w-full bg-slate-100 text-slate-400"
        >
          Lớp đã đủ chỗ
        </Button>
      ) : !enrollmentOpen ? (
        <Button
          size="large"
          disabled
          className="font-medium text-sm h-12 rounded-xl w-full bg-slate-100 text-slate-400"
        >
          Chưa mở tuyển sinh
        </Button>
      ) : (
        <Button
          type="primary"
          size="large"
          loading={isRegistering}
          onClick={handleInitiateRegistration}
          className="font-bold text-sm h-12 rounded-xl w-full border-none shadow-xs bg-[#0D9488] hover:bg-[#0B746C]"
        >
          {isFree ? "Đăng ký học ngay (Miễn phí)" : isExpiredState ? "Đăng ký lại" : "Đăng ký ngay"}
        </Button>
      )}

      {/* Divider */}
      <div className="h-px bg-slate-100" />

      {/* Schedule & Information Details */}
      <div className="flex flex-col gap-3.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-400 font-medium">Khai giảng</span>
          <span className="font-semibold text-slate-800">{item.startDate}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-400 font-medium">Kết thúc</span>
          <span className="font-semibold text-slate-800">
            {item.formattedEndDate || "Đang cập nhật"}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-400 font-medium">Số buổi</span>
          <span className="font-semibold text-slate-800">
            {sessionCount === undefined ? "…" : sessionCount > 0 ? `${sessionCount} buổi` : "Đang cập nhật"}
          </span>
        </div>

        <div className="flex items-start justify-between gap-3">
          <span className="text-slate-400 font-medium shrink-0">Lịch học</span>
          <div className="text-right">
            {scheduleLines.length > 0 ? (
              scheduleLines.map((line) => (
                <div key={line} className="font-semibold text-slate-800 [&:not(:first-child)]:mt-0.5">
                  {line}
                </div>
              ))
            ) : (
              <div className="font-semibold text-slate-800">Đang cập nhật</div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-400 font-medium">Sĩ số tối đa</span>
          <span className="font-semibold text-slate-800">{capacity} học viên</span>
        </div>
      </div>

      {/* Back Link */}
      <div className="text-center pt-2 border-t border-slate-100">
        <Link
          to="/classes"
          className="text-xs font-semibold text-slate-500 hover:text-[#0D9488] transition-colors"
        >
          ← Quay lại danh sách lớp học
        </Link>
      </div>

      {/* Schedule Conflict Warning Modal */}
      <Modal
        open={conflictModalOpen}
        onCancel={() => setConflictModalOpen(false)}
        footer={null}
        centered
        width={480}
        title={
          <div className="flex items-center gap-2 text-amber-600 font-bold text-base">
            <WarningOutlined className="text-lg" />
            <span>Lịch học bị trùng</span>
          </div>
        }
      >
        <div className="space-y-4 py-2">
          <p className="text-xs text-slate-600 leading-relaxed m-0">
            Lớp học này có thời gian học trùng với một lớp bạn đã đăng ký. Bạn vẫn có thể đăng ký, nhưng có thể không tham gia được đầy đủ các buổi học. Bạn có muốn tiếp tục đăng ký không?
          </p>

          <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3.5 space-y-2 text-xs">
            <div className="font-bold text-amber-900 text-xs uppercase tracking-wider">
              Chi tiết lịch trùng:
            </div>
            {detectedConflicts.map((c, idx) => (
              <div
                key={idx}
                className="bg-white/90 p-2.5 rounded-lg border border-amber-200/60 text-slate-800 space-y-0.5"
              >
                <div className="font-semibold text-slate-900">
                  {c.conflictingClassName}
                </div>
                <div className="text-[11px] text-amber-800 font-medium">
                  {c.dayLabel}: Lớp mới ({c.targetTime}) trùng với lớp đã đăng ký ({c.existingTime})
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <Button
              size="middle"
              onClick={() => setConflictModalOpen(false)}
              className="rounded-xl text-xs font-semibold"
            >
              Hủy
            </Button>
            <Button
              type="primary"
              size="middle"
              onClick={() => {
                setConflictModalOpen(false);
                executeRegistration();
              }}
              className="rounded-xl text-xs font-bold bg-[#0D9488] hover:bg-[#0B746C] border-none"
            >
              Vẫn đăng ký
            </Button>
          </div>
        </div>
      </Modal>

      {/* Direct Tuition VietQR Modal */}
      <DirectTuitionPaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        item={item}
        paymentIntent={paymentIntent}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: enrollmentKeys.all });
          queryClient.invalidateQueries({ queryKey: enrollmentKeys.availability(item.id) });
          queryClient.invalidateQueries({ queryKey: classKeys.all });
        }}
      />
    </div>
  );
}
