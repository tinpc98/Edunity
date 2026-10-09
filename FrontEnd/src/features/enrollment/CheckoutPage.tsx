import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Breadcrumb, Button, Alert, Tag, Skeleton, message, Popconfirm } from "antd";
import {
  HomeOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  UserOutlined,
  BookOutlined,
  WarningOutlined,
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  BarcodeOutlined,
  GiftOutlined,
} from "@ant-design/icons";
import { enrollmentService, enrollmentKeys } from "../../services/enrollment.service";
import { gatewayPaymentService as paymentService, paymentKeys } from "../../services/gatewayPayment.service";
import { classKeys } from "../../services/class.service";
import { sessionKeys } from "../../services/session.service";
import { financeKeys } from "../../services/finance.service";
import { useClassDetailQuery } from "../class/hooks/useClassDiscovery";
import { useAuthStore } from "../../stores/auth.store";
import { ROUTES } from "../../routes/routePaths";
import type { CreatePaymentResponse } from "../../types/payment";

export default function CheckoutPage() {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [paymentData, setPaymentData] = useState<CreatePaymentResponse | null>(null);

  // 1. Fetch Enrollment from real backend
  const {
    data: enrollment,
    isLoading: isLoadingEnrollment,
    refetch: refetchEnrollment,
  } = useQuery({
    queryKey: enrollmentKeys.detail(enrollmentId || ""),
    queryFn: () => (enrollmentId ? enrollmentService.getEnrollmentById(enrollmentId) : null),
    enabled: Boolean(enrollmentId),
  });

  // 2. Fetch Class Details based on enrollment.classId
  const { data: classItem, isLoading: isLoadingClass } = useClassDetailQuery(
    enrollment?.classId
  );

  // 3. Create or retrieve existing PENDING payment from real backend
  const createPaymentMutation = useMutation({
    mutationFn: (id: string) => paymentService.createPayment(id),
    onSuccess: (data) => {
      setPaymentData(data);
    },
    onError: (err: any) => {
      message.error(err.message || "Không thể khởi tạo phiên thanh toán.");
    },
  });

  useEffect(() => {
    if (enrollment && enrollment.enrollmentStatus === "PENDING_PAYMENT" && !paymentData) {
      createPaymentMutation.mutate(enrollment.id);
    }
  }, [enrollment?.id, enrollment?.enrollmentStatus]);

  // 4. Countdown timer derived strictly from persisted holdExpiresAt
  const [now, setNow] = useState(() => Date.now());
  const effectiveHoldExpiresAt = paymentData?.holdExpiresAt || enrollment?.holdExpiresAt;

  useEffect(() => {
    if (!effectiveHoldExpiresAt) return;

    const targetTime = new Date(effectiveHoldExpiresAt).getTime();
    const interval = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (targetTime <= current) {
        clearInterval(interval);
        refetchEnrollment();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [effectiveHoldExpiresAt, refetchEnrollment]);

  const secondsRemaining = effectiveHoldExpiresAt
    ? Math.max(0, Math.floor((new Date(effectiveHoldExpiresAt).getTime() - now) / 1000))
    : null;

  // Handle redirect if enrollment is already confirmed
  useEffect(() => {
    if (
      enrollment &&
      (enrollment.enrollmentStatus === "CONFIRMED" || enrollment.enrollmentStatus === "COMPLETED")
    ) {
      navigate(`/checkout/${enrollment.id}/success`, { replace: true });
    }
  }, [enrollment?.enrollmentStatus, enrollment?.id, navigate]);

  // 5. Trigger Sandbox Webhook (SUCCESS simulation)
  const successWebhookMutation = useMutation({
    mutationFn: () => {
      if (!paymentData?.gatewayReference) {
        throw new Error("Không tìm thấy mã tham chiếu thanh toán.");
      }
      return paymentService.triggerSandboxWebhook(paymentData.gatewayReference, "SUCCESS");
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: enrollmentKeys.all });
      queryClient.invalidateQueries({ queryKey: paymentKeys.all });
      queryClient.invalidateQueries({ queryKey: classKeys.all });
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      queryClient.invalidateQueries({ queryKey: financeKeys.all });

      if (res.result === "PAYMENT_SUCCESS" || res.paymentStatus === "COMPLETED") {
        message.success("Thanh toán thành công! Ghi danh đã được xác nhận.");
        navigate(`/checkout/${enrollmentId}/success`);
      } else if (res.result === "LATE_PAYMENT_REFUND_REQUIRED") {
        message.warning("Đơn giữ chỗ đã hết hạn trước khi thanh toán. Hệ thống đã tạo yêu cầu hoàn tiền (REFUND).");
        refetchEnrollment();
      } else {
        message.info(`Kết quả thanh toán: ${res.result}`);
        refetchEnrollment();
      }
    },
    onError: (err: any) => {
      message.error(err.message || "Xử lý thanh toán thất bại.");
    },
  });

  // 6. Trigger Sandbox Webhook (FAILED simulation)
  const failWebhookMutation = useMutation({
    mutationFn: () => {
      if (!paymentData?.gatewayReference) {
        throw new Error("Không tìm thấy mã tham chiếu thanh toán.");
      }
      return paymentService.triggerSandboxWebhook(paymentData.gatewayReference, "FAILED");
    },
    onSuccess: () => {
      message.error("Mô phỏng thanh toán thất bại.");
      queryClient.invalidateQueries({ queryKey: paymentKeys.all });
      refetchEnrollment();
    },
    onError: (err: any) => {
      message.error(err.message || "Lỗi mô phỏng thanh toán.");
    },
  });

  const isExpired =
    secondsRemaining !== null &&
    (secondsRemaining <= 0 || enrollment?.enrollmentStatus === "EXPIRED");

  const formattedCountdown =
    secondsRemaining !== null && secondsRemaining > 0
      ? `${String(Math.floor(secondsRemaining / 60)).padStart(2, "0")}:${String(
          secondsRemaining % 60
        ).padStart(2, "0")}`
      : "00:00";

  if (isLoadingEnrollment || isLoadingClass || createPaymentMutation.isPending) {
    return (
      <div className="site-container py-12 min-h-screen">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (!enrollment || !classItem) {
    return (
      <div className="site-container py-12 min-h-screen">
        <Alert
          type="error"
          showIcon
          message="Không tìm thấy thông tin đơn đăng ký"
          description="Đơn đăng ký không tồn tại hoặc đã bị xóa."
          action={
            <Link to={ROUTES.CLASSES}>
              <Button type="primary" size="small">
                Khám phá lớp học
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const formattedTuition = `${enrollment.tuitionAmount.toLocaleString("vi-VN")} đ`;

  return (
    <div className="site-container py-8 min-h-[calc(100vh-140px)] max-w-5xl">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Breadcrumb
          items={[
            {
              title: (
                <Link to={ROUTES.HOME} className="text-slate-500 hover:text-indigo-600 flex items-center gap-1 text-xs">
                  <HomeOutlined />
                  <span>Trang chủ</span>
                </Link>
              ),
            },
            {
              title: (
                <Link to={ROUTES.CLASSES} className="text-slate-500 hover:text-indigo-600 text-xs">
                  Khám phá lớp học
                </Link>
              ),
            },
            {
              title: (
                <Link
                  to={`/classes/${classItem.id}`}
                  className="text-slate-500 hover:text-indigo-600 text-xs truncate max-w-xs"
                >
                  {classItem.title}
                </Link>
              ),
            },
            {
              title: <span className="text-slate-800 font-semibold text-xs">Thanh toán</span>,
            },
          ]}
        />
      </div>

      <div className="text-center mb-8">
        <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-1">
          Hoàn tất đơn đăng ký
        </p>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900">
          THANH TOÁN HỌC PHÍ
        </h1>
      </div>

      {/* Main 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: Class information & Payment details */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-7 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">
                THÔNG TIN LỚP HỌC
              </h2>
              <Tag color="indigo" className="font-semibold text-xs border-none px-2.5 py-0.5">
                {classItem.gradeLabel}
              </Tag>
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold text-slate-400 mb-1">Tên lớp học</div>
                <div className="text-lg font-bold text-slate-900 leading-snug">
                  {classItem.title}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-400 mb-1">Khóa học liên kết</div>
                <div className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <BookOutlined className="text-indigo-600" />
                  <span>{classItem.courseTitle}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="text-xs text-slate-400 font-medium mb-1">Giảng viên</div>
                  <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    <UserOutlined className="text-indigo-600" />
                    <span>{classItem.teacherName}</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="text-xs text-slate-400 font-medium mb-1">Ngày khai giảng</div>
                  <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    <CalendarOutlined className="text-indigo-600" />
                    <span>{classItem.startDate}</span>
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-xs text-slate-400 font-medium mb-1">Lịch học hàng tuần</div>
                <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <ClockCircleOutlined className="text-indigo-600" />
                  <span>{classItem.scheduleText}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Gateway Box */}
          {paymentData && !isExpired && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">
                  CỔNG THANH TOÁN (GATEWAY)
                </h3>
                <Tag color="cyan" className="font-semibold text-xs border-none">
                  SANDBOX
                </Tag>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Mã tham chiếu thanh toán:</span>
                  <span className="font-mono font-bold text-slate-800 text-sm">
                    {paymentData.gatewayReference}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Phương thức:</span>
                  <span className="font-semibold text-slate-700">Mô phỏng Chuyển khoản / PayOS</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Người nộp:</span>
                  <span className="font-semibold text-slate-700">{user?.fullName || "Học viên"}</span>
                </div>
              </div>

              <Alert
                type="info"
                showIcon
                icon={<BarcodeOutlined />}
                message="Môi trường Sandbox tích hợp"
                description="Trong môi trường thử nghiệm, bạn có thể sử dụng các nút bên dưới để mô phỏng sự kiện Webhook từ cổng thanh toán gửi về Backend Edunity."
                className="rounded-xl text-xs"
              />
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Payment summary & Actions */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-7 shadow-xs flex flex-col gap-6">
          <div className="pb-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">
              TÓM TẮT THANH TOÁN
            </h2>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between text-slate-600">
              <span>Học phí khóa học</span>
              <span className="font-semibold text-slate-800">{formattedTuition}</span>
            </div>

            {paymentData && paymentData.amount < enrollment.tuitionAmount && (
              <div className="flex items-center justify-between text-emerald-600">
                <span className="flex items-center gap-1.5 font-medium text-xs">
                  <GiftOutlined /> Học bổng tài trợ:
                </span>
                <span className="font-bold">
                  - {(enrollment.tuitionAmount - paymentData.amount).toLocaleString("vi-VN")} đ
                </span>
              </div>
            )}

            <div className="h-px bg-slate-100 my-2" />

            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 text-base">
                {paymentData && paymentData.amount < enrollment.tuitionAmount
                  ? "Học viên đồng chi trả (Co-pay):"
                  : "Tổng cần thanh toán:"}
              </span>
              <span className="font-black text-2xl text-indigo-600">
                {(paymentData ? paymentData.amount : enrollment.tuitionAmount).toLocaleString("vi-VN")} đ
              </span>
            </div>

            {paymentData && paymentData.amount < enrollment.tuitionAmount && (
              <div className="text-right">
                <Tag color="warning" className="text-[10px] font-bold border-none">
                  ĐỒNG CHI TRẢ (MIXED PAYMENT)
                </Tag>
              </div>
            )}
          </div>

          {/* Seat Hold Countdown */}
          <div className="rounded-xl p-4 bg-amber-50/70 border border-amber-200/70 text-center">
            {isExpired ? (
              <div className="text-amber-800 space-y-1">
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-amber-700">
                  <WarningOutlined />
                  <span>Thời gian giữ chỗ đã hết</span>
                </div>
                <p className="text-[11px] text-amber-600">
                  Chỗ tạm giữ cho đơn này đã hết hạn. Vui lòng quay lại thông tin lớp học để đăng ký lại.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-xs text-slate-600">
                  Còn <strong className="text-base font-extrabold text-amber-600 font-mono">{formattedCountdown}</strong>
                </div>
                <div className="text-xs text-slate-500 font-medium">để hoàn tất giao dịch</div>
              </div>
            )}
          </div>

          {/* Action CTA Buttons */}
          <div className="space-y-3">
            {isExpired ? (
              <Link to={`/classes/${classItem.id}`} className="block">
                <Button
                  size="large"
                  icon={<ArrowLeftOutlined />}
                  className="w-full h-12 rounded-xl font-bold text-sm"
                >
                  Quay lại thông tin lớp học
                </Button>
              </Link>
            ) : (
              <>
                <Button
                  type="primary"
                  size="large"
                  loading={successWebhookMutation.isPending}
                  disabled={successWebhookMutation.isPending || !paymentData}
                  onClick={() => successWebhookMutation.mutate()}
                  icon={<CheckCircleOutlined />}
                  className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-bold text-sm shadow-xs border-none"
                >
                  Xác nhận thanh toán thành công (Sandbox)
                </Button>

                <Popconfirm
                  title="Mô phỏng thanh toán thất bại?"
                  description="Bạn có muốn mô phỏng trường hợp giao dịch bị từ chối/hủy?"
                  okText="Mô phỏng thất bại"
                  cancelText="Hủy"
                  okButtonProps={{ danger: true, loading: failWebhookMutation.isPending }}
                  onConfirm={() => failWebhookMutation.mutate()}
                >
                  <Button
                    size="large"
                    danger
                    loading={failWebhookMutation.isPending}
                    disabled={failWebhookMutation.isPending || !paymentData}
                    icon={<CloseCircleOutlined />}
                    className="w-full h-11 rounded-xl font-semibold text-xs"
                  >
                    Mô phỏng thanh toán thất bại
                  </Button>
                </Popconfirm>
              </>
            )}

            <div className="text-center pt-2">
              <Link
                to={ROUTES.STUDENT.ENROLLMENTS}
                className="text-xs font-semibold text-slate-400 hover:text-slate-600"
              >
                ← Quay lại danh sách đơn đăng ký
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
