import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Progress, Tag, Alert, Modal, Popconfirm, message, Radio, Select } from "antd";
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
import { scholarshipService, scholarshipKeys } from "../../../services/scholarship.service";
import { classKeys } from "../../../services/class.service";
import { sessionKeys } from "../../../services/session.service";
import { useAuthStore } from "../../../stores/auth.store";
import { ROUTES } from "../../../routes/routePaths";
import type { Enrollment } from "../../../types/enrollment";
import { formatVND } from "../../../types/payment";

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

  // 4. Query student's active scholarships
  const { data: myScholarships = [] } = useQuery({
    queryKey: scholarshipKeys.myList(),
    queryFn: () => scholarshipService.getMyScholarships(),
    enabled: isStudent,
  });

  const usableScholarships = myScholarships.filter((s) => s.isUsable);
  const [paymentChoice, setPaymentChoice] = useState<"SCHOLARSHIP" | "DIRECT">("DIRECT");
  const [selectedScholarshipId, setSelectedScholarshipId] = useState<string>("");
  const [isProcessingEnrollment, setIsProcessingEnrollment] = useState(false);

  useEffect(() => {
    if (usableScholarships.length > 0) {
      setPaymentChoice("SCHOLARSHIP");
      if (!selectedScholarshipId) {
        setSelectedScholarshipId(usableScholarships[0].id);
      }
    } else {
      setPaymentChoice("DIRECT");
    }
  }, [usableScholarships.length]);

  const selectedScholarship = usableScholarships.find((s) => s.id === selectedScholarshipId) || usableScholarships[0];
  const appliedScholarshipAmount = selectedScholarship ? Math.min(selectedScholarship.remainingAmount, item.price) : 0;
  const copayAmount = Math.max(0, item.price - appliedScholarshipAmount);

  // 5. Unified enrollment handler
  const handleConfirmEnrollment = async () => {
    try {
      setIsProcessingEnrollment(true);
      const newEnrollment = await enrollmentService.createEnrollment(item.id);

      queryClient.invalidateQueries({ queryKey: enrollmentKeys.availability(item.id) });
      queryClient.invalidateQueries({ queryKey: classKeys.availability(item.id) });
      queryClient.invalidateQueries({ queryKey: enrollmentKeys.myList(1, 100) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });

      // If free class: confirmed immediately
      if (isFree || newEnrollment.enrollmentStatus === "CONFIRMED") {
        setConfirmModalOpen(false);
        setSuccessModalData(newEnrollment);
        message.success("Đăng ký lớp học thành công! Bạn có thể vào học ngay.");
        return;
      }

      // If user chose scholarship
      if (paymentChoice === "SCHOLARSHIP" && selectedScholarship) {
        const payRes = await scholarshipService.payWithScholarship(
          newEnrollment.id,
          selectedScholarship.id
        );

        setConfirmModalOpen(false);
        queryClient.invalidateQueries({ queryKey: scholarshipKeys.all });
        queryClient.invalidateQueries({ queryKey: enrollmentKeys.all });

        if (payRes.enrollmentStatus === "CONFIRMED") {
          message.success("Học bổng đã chi trả toàn bộ học phí! Đăng ký hoàn tất.");
          setSuccessModalData({
            ...newEnrollment,
            enrollmentStatus: "CONFIRMED",
            paymentSource: "SCHOLARSHIP",
          });
        } else if (payRes.paymentSource === "MIXED") {
          message.info(
            `Đã áp dụng học bổng ${formatVND(payRes.scholarshipAmount)}. Vui lòng thanh toán phần đồng chi trả.`
          );
          navigate(`/checkout/${newEnrollment.id}`);
        }
        return;
      }

      // Direct payment
      setConfirmModalOpen(false);
      message.success("Giữ chỗ thành công! Chỗ ngồi được giữ trong 15 phút.");
      navigate(`/checkout/${newEnrollment.id}`);
    } catch (err: any) {
      setConfirmModalOpen(false);
      message.error(err.message || "Không thể thực hiện đăng ký.");
      refetchAvailability();
      refetchEnrollments();
    } finally {
      setIsProcessingEnrollment(false);
    }
  };

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
          loading={isProcessingEnrollment}
          disabled={isProcessingEnrollment}
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
        onCancel={() => !isProcessingEnrollment && setConfirmModalOpen(false)}
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
          ) : usableScholarships.length > 0 ? (
            <div className="space-y-3 pt-1">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Phương thức đăng ký & thanh toán:
              </div>
              <Radio.Group
                value={paymentChoice}
                onChange={(e) => setPaymentChoice(e.target.value)}
                className="w-full flex flex-col gap-2"
              >
                <div
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    paymentChoice === "SCHOLARSHIP"
                      ? "border-indigo-500 bg-indigo-50/40"
                      : "border-slate-200 bg-white"
                  }`}
                  onClick={() => setPaymentChoice("SCHOLARSHIP")}
                >
                  <Radio value="SCHOLARSHIP" className="font-semibold text-xs text-indigo-900">
                    Sử dụng học bổng ({usableScholarships.length} học bổng khả dụng)
                  </Radio>

                  {paymentChoice === "SCHOLARSHIP" && (
                    <div className="mt-3 pl-6 space-y-2 text-xs">
                      {usableScholarships.length > 1 && (
                        <div>
                          <label className="text-[11px] text-slate-500 block mb-1">
                            Chọn học bổng áp dụng:
                          </label>
                          <Select
                            className="w-full"
                            value={selectedScholarshipId}
                            onChange={(val) => setSelectedScholarshipId(val)}
                            options={usableScholarships.map((s) => ({
                              value: s.id,
                              label: `${s.campaignTitle} (Dư: ${formatVND(s.remainingAmount)})`,
                            }))}
                          />
                        </div>
                      )}

                      {selectedScholarship && (
                        <div className="p-3 bg-white rounded-lg border border-indigo-100 space-y-1.5">
                          <div className="flex justify-between text-slate-600">
                            <span>Số dư học bổng:</span>
                            <span className="font-semibold text-slate-800">
                              {formatVND(selectedScholarship.remainingAmount)}
                            </span>
                          </div>
                          <div className="flex justify-between text-emerald-600">
                            <span>Học bổng khấu trừ:</span>
                            <span className="font-bold">
                              - {formatVND(appliedScholarshipAmount)}
                            </span>
                          </div>
                          <div className="flex justify-between pt-1 border-t border-slate-100">
                            <span className="font-bold text-slate-800">Cần thanh toán (Co-pay):</span>
                            <span className={`font-black text-sm ${copayAmount > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                              {formatVND(copayAmount)}
                            </span>
                          </div>
                          <div className="pt-1">
                            {copayAmount === 0 ? (
                              <Tag color="success" className="font-bold border-none text-[10px]">
                                TÀI TRỢ 100% (FULL SCHOLARSHIP) - MIỄN HỌC PHÍ
                              </Tag>
                            ) : (
                              <Tag color="warning" className="font-bold border-none text-[10px]">
                                ĐỒNG CHI TRẢ (MIXED CO-PAY) - THANH TOÁN {formatVND(copayAmount)}
                              </Tag>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    paymentChoice === "DIRECT"
                      ? "border-indigo-500 bg-indigo-50/40"
                      : "border-slate-200 bg-white"
                  }`}
                  onClick={() => setPaymentChoice("DIRECT")}
                >
                  <Radio value="DIRECT" className="font-semibold text-xs text-slate-800">
                    Thanh toán trực tiếp toàn bộ học phí ({item.formattedPrice})
                  </Radio>
                </div>
              </Radio.Group>
            </div>
          ) : (
            <Alert
              type="info"
              showIcon
              message="Chính sách giữ chỗ (Seat Hold)"
              description="Sau khi xác nhận, hệ thống sẽ tạm giữ chỗ cho bạn trong 15 phút để bạn tiến hành thanh toán học phí."
              className="text-xs rounded-xl"
            />
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <Button
              onClick={() => setConfirmModalOpen(false)}
              disabled={isProcessingEnrollment}
              className="text-xs font-semibold h-9 px-4 rounded-lg"
            >
              Hủy
            </Button>
            <Button
              type="primary"
              loading={isProcessingEnrollment}
              disabled={isProcessingEnrollment}
              onClick={handleConfirmEnrollment}
              className={`text-xs font-semibold h-9 px-5 rounded-lg border-none ${
                isFree || (paymentChoice === "SCHOLARSHIP" && copayAmount === 0)
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {isFree
                ? "Xác nhận đăng ký ngay"
                : paymentChoice === "SCHOLARSHIP"
                ? copayAmount === 0
                  ? "Xác nhận & Dùng học bổng 100%"
                  : "Xác nhận & Thanh toán phần thiếu"
                : "Xác nhận giữ chỗ"}
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
