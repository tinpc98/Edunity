import { useState } from "react";
import { useHoldCountdown } from "../../../hooks/useHoldCountdown";
import { Link, useNavigate } from "react-router-dom";
import { Button, Progress, Alert, Popconfirm, message } from "antd";
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  LoginOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import EnrollmentConfirmModal from "./EnrollmentConfirmModal";
import type { ClassDiscoveryItem } from "../../../types/classDiscovery";
import { enrollmentService, enrollmentKeys } from "../../../services/enrollment.service";
import { classKeys } from "../../../services/class.service";
import { useAuthStore } from "../../../stores/auth.store";
import { ROUTES } from "../../../routes/routePaths";
import { formatScheduleEntries } from "../../../api/classAdapters";

interface ClassRegistrationCardProps {
  item: ClassDiscoveryItem;
  /** Planned session count; undefined while sessions are still loading */
  sessionCount?: number;
}


export default function ClassRegistrationCard({ item, sessionCount }: ClassRegistrationCardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuthStore();

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

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

  // 6. Cancel Enrollment Mutation
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

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm flex flex-col gap-5">
      {/* Price Section */}
      <div>
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
          Học phí trọn gói
        </div>
        <div
          className={`text-3xl font-black tracking-tight ${
            isFree ? "text-emerald-600" : "text-indigo-600"
          }`}
        >
          {item.formattedPrice}
        </div>
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
          strokeColor={isFree ? "#059669" : "#4f46e5"}
          trailColor="#f1f5f9"
          className="!m-0"
        />
      </div>

      {/* Status Banner when user is already enrolled or holding a seat */}
      {isConfirmed && (
        <Alert
          type="success"
          showIcon
          icon={<CheckCircleOutlined className="text-emerald-600" />}
          message="Bạn đã đăng ký lớp học này"
          description="Lớp học đã có trong mục Lớp học của tôi. Bạn có thể xem tài liệu và lịch học."
          className="rounded-xl text-xs"
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
                Chỗ ngồi của bạn đang được hệ thống giữ tạm thời.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Link to={ROUTES.STUDENT.ENROLLMENTS}>
                  <Button size="small" type="primary" className="bg-amber-600 text-xs font-semibold">
                    Xem đơn đăng ký
                  </Button>
                </Link>
                <Popconfirm
                  title="Hủy giữ chỗ?"
                  description="Bạn có chắc muốn hủy đơn này và nhường chỗ cho người khác?"
                  okText="Hủy chỗ"
                  cancelText="Không"
                  okButtonProps={{ danger: true, loading: cancelEnrollMutation.isPending }}
                  onConfirm={() => cancelEnrollMutation.mutate(activeEnrollment.id)}
                >
                  <Button size="small" danger className="text-xs">
                    Hủy giữ chỗ
                  </Button>
                </Popconfirm>
              </div>
            </div>
          }
          className="rounded-xl text-xs bg-amber-50/70 border-amber-200"
        />
      )}

      {/* Primary Action Buttons */}
      {isConfirmed ? (
        <Button
          type="primary"
          size="large"
          onClick={() => navigate(ROUTES.STUDENT.HOME)}
          icon={<ArrowRightOutlined />}
          className="font-bold text-sm h-12 rounded-xl w-full bg-emerald-600 hover:bg-emerald-700 border-none shadow-xs"
        >
          Vào lớp học của tôi
        </Button>
      ) : isPending ? (
        <Link to={ROUTES.STUDENT.ENROLLMENTS} className="w-full">
          <Button
            size="large"
            className="font-bold text-sm h-12 rounded-xl w-full border-amber-500 text-amber-700 bg-amber-50/40 hover:bg-amber-100"
          >
            Quản lý đơn giữ chỗ
          </Button>
        </Link>
      ) : !isAuthenticated ? (
        <Button
          type="primary"
          size="large"
          onClick={() => navigate(`/login?redirect=${encodeURIComponent(`/classes/${item.id}`)}`)}
          icon={<LoginOutlined />}
          className="font-bold text-sm h-12 rounded-xl w-full bg-indigo-600 hover:bg-indigo-700 border-none shadow-xs"
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
          onClick={() => setConfirmModalOpen(true)}
          className={`font-bold text-sm h-12 rounded-xl w-full border-none shadow-xs ${
            isFree
              ? "bg-emerald-600 hover:bg-emerald-700"
              : "bg-indigo-600 hover:bg-indigo-700"
          }`}
        >
          {isFree ? "Đăng ký học ngay (Miễn phí)" : "Đăng ký giữ chỗ"}
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
          className="text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors"
        >
          ← Quay lại danh sách lớp học
        </Link>
      </div>

      <EnrollmentConfirmModal item={item} open={confirmModalOpen} onClose={() => setConfirmModalOpen(false)} />
    </div>
  );
}
