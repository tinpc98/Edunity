import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Progress, Tag, Alert, Modal, Popconfirm, message } from "antd";
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  LoginOutlined,
  ArrowRightOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClassDiscoveryItem } from "../../../types/classDiscovery";
import { enrollmentService, enrollmentKeys } from "../../../services/enrollment.service";
import { classKeys } from "../../../services/class.service";
import { sessionKeys } from "../../../services/session.service";
import { useAuthStore } from "../../../stores/auth.store";
import { ROUTES } from "../../../routes/routePaths";
import type { Enrollment } from "../../../types/enrollment";

interface ClassRegistrationCardProps {
  item: ClassDiscoveryItem;
}

function useHoldCountdown(holdExpiresAt: string | null | undefined, onExpire?: () => void) {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    if (!holdExpiresAt) {
      setTimeLeft(0);
      return;
    }
    const target = new Date(holdExpiresAt).getTime();
    const update = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((target - now) / 1000));
      setTimeLeft(diff);
      if (diff <= 0 && onExpire) {
        onExpire();
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [holdExpiresAt]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const isExpired = Boolean(holdExpiresAt && timeLeft <= 0);

  return { timeLeft, formatted, isExpired };
}

export default function ClassRegistrationCard({ item }: ClassRegistrationCardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuthStore();

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [successModalData, setSuccessModalData] = useState<Enrollment | null>(null);

  // 1. Fetch real class availability
  const { data: availability, refetch: refetchAvailability } = useQuery({
    queryKey: enrollmentKeys.availability(item.id),
    queryFn: () => enrollmentService.getClassAvailability(item.id),
    enabled: Boolean(item.id),
    staleTime: 1000 * 15,
  });

  // 2. Query student's active enrollments if authenticated as STUDENT
  const isStudent = isAuthenticated && user?.role === "STUDENT";
  const { data: enrollmentsData, refetch: refetchEnrollments } = useQuery({
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

  // 4. Create Enrollment Mutation
  const createEnrollMutation = useMutation({
    mutationFn: () => enrollmentService.createEnrollment(item.id),
    onSuccess: (newEnrollment) => {
      setConfirmModalOpen(false);
      // Invalidate all affected queries
      queryClient.invalidateQueries({ queryKey: enrollmentKeys.availability(item.id) });
      queryClient.invalidateQueries({ queryKey: classKeys.availability(item.id) });
      queryClient.invalidateQueries({ queryKey: enrollmentKeys.myList(1, 100) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });

      setSuccessModalData(newEnrollment);

      if (newEnrollment.enrollmentStatus === "CONFIRMED") {
        message.success("Đăng ký lớp học thành công! Bạn có thể vào học ngay.");
      } else {
        message.success("Giữ chỗ thành công! Chỗ ngồi được giữ trong 15 phút.");
      }
    },
    onError: (err: any) => {
      setConfirmModalOpen(false);
      const msg = err.message || "Không thể thực hiện đăng ký.";
      message.error(msg);
      // Refetch availability in case class was filled by another student
      refetchAvailability();
      refetchEnrollments();
    },
  });

  // 5. Cancel Enrollment Mutation
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
          loading={createEnrollMutation.isPending}
          disabled={createEnrollMutation.isPending}
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
            {item.formattedEndDate || "20/12/2026"}
          </span>
        </div>

        <div className="flex items-start justify-between">
          <span className="text-slate-400 font-medium">Lịch học</span>
          <div className="text-right">
            <div className="font-semibold text-slate-800">
              {item.scheduleDays || "Theo lịch lớp"}
            </div>
            <div className="text-slate-500 font-medium mt-0.5">
              {item.scheduleTime || "08:30 – 10:30"}
            </div>
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

      {/* Confirm Enrollment Modal */}
      <Modal
        open={confirmModalOpen}
        onCancel={() => !createEnrollMutation.isPending && setConfirmModalOpen(false)}
        footer={null}
        centered
        width={460}
        title={
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100 font-bold text-slate-900">
            <span>Xác nhận đăng ký lớp học</span>
            {isFree ? (
              <Tag color="green" className="font-bold border-none">MIỄN PHÍ</Tag>
            ) : (
              <Tag color="gold" className="font-bold border-none">CÓ HỌC PHÍ</Tag>
            )}
          </div>
        }
      >
        <div className="pt-3 space-y-4">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-2 text-xs">
            <div className="text-sm font-bold text-slate-900">{item.title}</div>
            <div className="text-slate-600 flex items-center gap-2">
              <UserOutlined className="text-indigo-600" />
              <span>Giáo viên: <strong>{item.teacherName}</strong></span>
            </div>
            <div className="text-slate-600 flex items-center gap-2">
              <ClockCircleOutlined className="text-indigo-600" />
              <span>Lịch học: <strong>{item.scheduleDays} · {item.scheduleTime}</strong></span>
            </div>
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
              <span className="text-slate-500 font-medium">Học phí:</span>
              <span className={`font-black text-sm ${isFree ? "text-emerald-600" : "text-indigo-600"}`}>
                {item.formattedPrice}
              </span>
            </div>
          </div>

          {isFree ? (
            <p className="text-xs text-slate-600 text-center">
              Lớp học này hoàn toàn miễn phí. Khi xác nhận, bạn sẽ được ghi danh chính thức ngay lập tức.
            </p>
          ) : (
            <Alert
              type="info"
              showIcon
              message="Chính sách giữ chỗ (Seat Hold)"
              description="Sau khi xác nhận, hệ thống sẽ tạm giữ chỗ cho bạn trong 15 phút. Luồng thanh toán chính thức sẽ được kích hoạt tại Phase 7."
              className="text-xs rounded-xl"
            />
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <Button
              onClick={() => setConfirmModalOpen(false)}
              disabled={createEnrollMutation.isPending}
              className="text-xs font-semibold h-9 px-4 rounded-lg"
            >
              Hủy
            </Button>
            <Button
              type="primary"
              loading={createEnrollMutation.isPending}
              disabled={createEnrollMutation.isPending}
              onClick={() => createEnrollMutation.mutate()}
              className={`text-xs font-semibold h-9 px-5 rounded-lg border-none ${
                isFree ? "bg-emerald-600 hover:bg-emerald-700" : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {isFree ? "Xác nhận đăng ký ngay" : "Xác nhận giữ chỗ"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Success Modal */}
      <Modal
        open={Boolean(successModalData)}
        onCancel={() => setSuccessModalData(null)}
        footer={null}
        centered
        width={460}
      >
        <div className="py-4 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-2xl">
            <CheckCircleOutlined />
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-900">
              {successModalData?.enrollmentStatus === "CONFIRMED"
                ? "Đăng ký thành công!"
                : "Đã giữ chỗ thành công!"}
            </h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              {successModalData?.enrollmentStatus === "CONFIRMED"
                ? "Bạn đã chính thức trở thành học viên của lớp học. Lớp đã được thêm vào Học tập của tôi."
                : "Hệ thống đã giữ chỗ thành công cho bạn trong vòng 15 phút. Bạn có thể kiểm tra trong mục Đơn đăng ký."}
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              onClick={() => setSuccessModalData(null)}
              className="text-xs font-semibold h-9 rounded-lg"
            >
              Đóng
            </Button>
            <Button
              type="primary"
              onClick={() => {
                setSuccessModalData(null);
                navigate(
                  successModalData?.enrollmentStatus === "CONFIRMED"
                    ? ROUTES.STUDENT.HOME
                    : ROUTES.STUDENT.ENROLLMENTS
                );
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold h-9 px-5 rounded-lg border-none"
            >
              {successModalData?.enrollmentStatus === "CONFIRMED"
                ? "Đến Lớp học của tôi"
                : "Xem Đơn đăng ký"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
