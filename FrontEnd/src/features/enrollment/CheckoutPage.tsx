import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Breadcrumb, Button, Alert, Tag, Skeleton, App as AntdApp, Radio } from "antd";
import {
  HomeOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  UserOutlined,
  BookOutlined,
  WarningOutlined,
  ArrowLeftOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { enrollmentService } from "../../services/enrollment.service";
import { paymentService, PaymentError, type MockPaymentScenario } from "../../services/payment.service";
import { useClassDetailQuery } from "../class/hooks/useClassDiscovery";
import { useAuthStore } from "../../stores/auth.store";

export default function CheckoutPage() {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { notification } = AntdApp.useApp();
  const { user } = useAuthStore();

  const [scenario, setScenario] = useState<MockPaymentScenario>(() => paymentService.getMockScenario());

  // 1. Fetch Enrollment
  const {
    data: enrollment,
    isLoading: isLoadingEnrollment,
    refetch: refetchEnrollment,
  } = useQuery({
    queryKey: ["enrollment", enrollmentId],
    queryFn: () => (enrollmentId ? enrollmentService.getEnrollmentById(enrollmentId) : null),
    enabled: Boolean(enrollmentId),
  });

  // 2. Fetch Class Details based on enrollment.classId
  const { data: classItem, isLoading: isLoadingClass } = useClassDetailQuery(
    enrollment?.classId
  );

  // 3. Countdown timer derived strictly from persisted holdExpiresAt
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enrollment?.holdExpiresAt) return;

    const targetTime = new Date(enrollment.holdExpiresAt).getTime();
    const interval = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (targetTime <= current) {
        clearInterval(interval);
        refetchEnrollment();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [enrollment?.holdExpiresAt, refetchEnrollment]);

  const secondsRemaining = enrollment?.holdExpiresAt
    ? Math.max(0, Math.floor((new Date(enrollment.holdExpiresAt).getTime() - now) / 1000))
    : null;

  // Handle redirect if enrollment is already confirmed
  useEffect(() => {
    if (enrollment && (enrollment.enrollmentStatus === "CONFIRMED" || enrollment.enrollmentStatus === "COMPLETED")) {
      navigate(`/checkout/${enrollment.id}/success`, { replace: true });
    }
  }, [enrollment, navigate]);

  // Payment mutation
  const paymentMutation = useMutation({
    mutationFn: () => {
      if (!enrollmentId || !user) {
        throw new Error("Thông tin người dùng hoặc đơn đăng ký không hợp lệ.");
      }
      return paymentService.createPaymentAttempt({
        enrollmentId,
        payerUserId: user.userId,
      });
    },
    onSuccess: (result) => {
      notification.success({
        message: "Thanh toán thành công",
        description: "Bạn đã đăng ký lớp học thành công.",
        placement: "topRight",
      });
      queryClient.invalidateQueries({ queryKey: ["enrollment", enrollmentId] });
      queryClient.invalidateQueries({ queryKey: ["classDetail", enrollment?.classId] });
      navigate(`/checkout/${result.enrollment.id}/success`);
    },
    onError: (error: Error | PaymentError) => {
      notification.error({
        message: "Thanh toán không thành công",
        description: error.message || "Thanh toán chưa thành công. Vui lòng thử lại.",
        placement: "topRight",
      });
    },
  });

  const handleScenarioChange = (newScenario: MockPaymentScenario) => {
    setScenario(newScenario);
    paymentService.setMockScenario(newScenario);
  };

  const isExpired =
    secondsRemaining !== null &&
    (secondsRemaining <= 0 || enrollment?.enrollmentStatus === "EXPIRED");

  const formattedCountdown =
    secondsRemaining !== null && secondsRemaining > 0
      ? `${String(Math.floor(secondsRemaining / 60)).padStart(2, "0")}:${String(
          secondsRemaining % 60
        ).padStart(2, "0")}`
      : "00:00";

  if (isLoadingEnrollment || isLoadingClass) {
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
            <Link to="/classes">
              <Button type="primary" size="small">
                Khám phá lớp học
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const formattedTuition = `${enrollment.tuitionAmount.toLocaleString("vi-VN")}đ`;

  return (
    <div className="site-container py-8 min-h-[calc(100vh-140px)] max-w-5xl">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Breadcrumb
          items={[
            {
              title: (
                <Link to="/" className="text-slate-500 hover:text-indigo-600 flex items-center gap-1 text-xs">
                  <HomeOutlined />
                  <span>Trang chủ</span>
                </Link>
              ),
            },
            {
              title: (
                <Link to="/classes" className="text-slate-500 hover:text-indigo-600 text-xs">
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
          THANH TOÁN
        </h1>
      </div>

      {/* Main 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: Class information */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-7 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
            <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">
              THÔNG TIN LỚP HỌC
            </h2>
            <Tag color="indigo" className="font-semibold text-xs border-none px-2.5 py-0.5">
              {classItem.gradeLabel}
            </Tag>
          </div>

          <div className="space-y-5">
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

        {/* RIGHT COLUMN: Payment summary */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-7 shadow-xs flex flex-col gap-6">
          <div className="pb-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">
              TÓM TẮT THANH TOÁN
            </h2>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between text-slate-600">
              <span>Học phí</span>
              <span className="font-semibold text-slate-800">{formattedTuition}</span>
            </div>

            <div className="h-px bg-slate-100 my-2" />

            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 text-base">Tổng cộng</span>
              <span className="font-black text-2xl text-indigo-600">{formattedTuition}</span>
            </div>
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
                <div className="text-xs text-slate-500 font-medium">để hoàn tất đăng ký</div>
              </div>
            )}
          </div>

          {/* Error Banner when mutation fails */}
          {paymentMutation.isError && !isExpired && (
            <Alert
              type="error"
              showIcon
              message="Thanh toán chưa thành công"
              description="Hệ thống chưa thể xử lý giao dịch. Bạn có thể nhấn 'Thử thanh toán lại' để thực hiện lại giao dịch cho đơn đăng ký này."
              className="rounded-xl text-xs"
            />
          )}

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
            ) : paymentMutation.isError ? (
              <Button
                type="primary"
                size="large"
                danger
                loading={paymentMutation.isPending}
                disabled={paymentMutation.isPending}
                onClick={() => paymentMutation.mutate()}
                icon={<ReloadOutlined />}
                className="w-full h-12 rounded-xl font-bold text-sm shadow-xs"
              >
                Thử thanh toán lại
              </Button>
            ) : (
              <Button
                type="primary"
                size="large"
                loading={paymentMutation.isPending}
                disabled={paymentMutation.isPending}
                onClick={() => paymentMutation.mutate()}
                className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold text-sm shadow-xs"
              >
                Thanh toán ngay
              </Button>
            )}

            <div className="text-center pt-2">
              <Link
                to={`/classes/${classItem.id}`}
                className="text-xs font-semibold text-slate-400 hover:text-slate-600"
              >
                Hủy và quay lại lớp học
              </Link>
            </div>
          </div>

          {/* Deterministic Dev Scenario Toggle */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2">
              <span className="font-semibold uppercase tracking-wider">Kịch bản Test (Mock)</span>
            </div>
            <Radio.Group
              size="small"
              value={scenario}
              onChange={(e) => handleScenarioChange(e.target.value)}
              className="w-full grid grid-cols-2 text-center"
            >
              <Radio.Button value="SUCCESS" className="text-xs">
                ✓ Thành công
              </Radio.Button>
              <Radio.Button value="FAILED" className="text-xs">
                ✗ Thất bại
              </Radio.Button>
            </Radio.Group>
          </div>
        </div>
      </div>
    </div>
  );
}
