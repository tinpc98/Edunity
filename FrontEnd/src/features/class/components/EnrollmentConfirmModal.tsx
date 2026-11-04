import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Tag, Alert, Modal, message, Radio, Select } from "antd";
import { ClockCircleOutlined, CheckCircleOutlined, UserOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ClassDiscoveryItem } from "../../../types/classDiscovery";
import { enrollmentService, enrollmentKeys } from "../../../services/enrollment.service";
import { scholarshipService, scholarshipKeys } from "../../../services/scholarship.service";
import { classKeys } from "../../../services/class.service";
import { sessionKeys } from "../../../services/session.service";
import { useAuthStore } from "../../../stores/auth.store";
import { ROUTES } from "../../../routes/routePaths";
import type { Enrollment } from "../../../types/enrollment";
import { formatVND } from "../../../types/payment";

interface EnrollmentConfirmModalProps {
  item: ClassDiscoveryItem;
  open: boolean;
  onClose: () => void;
}

/**
 * Enrollment confirmation with the payment choice (scholarship or direct payment), shared by the class page and the
 * "Đăng ký ngay" button of the class cards. FREE: confirmed at once. PAID: seat hold, then checkout or scholarship.
 */
export default function EnrollmentConfirmModal({ item, open, onClose }: EnrollmentConfirmModalProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isStudent = user?.role === "STUDENT";
  const isFree = item.classType === "FREE";
  const [successModalData, setSuccessModalData] = useState<Enrollment | null>(null);

  // 4. Query student's active scholarships
  const { data: myScholarships = [] } = useQuery({
    queryKey: scholarshipKeys.myList(),
    queryFn: () => scholarshipService.getMyScholarships(),
    enabled: isStudent,
  });

  const usableScholarships = myScholarships.filter((s) => s.isUsable);
  // Defaults to the scholarship when one is usable; DIRECT is forced when none is. Derived, not synced by an effect.
  const [chosenPayment, setPaymentChoice] = useState<"SCHOLARSHIP" | "DIRECT" | null>(null);
  const paymentChoice: "SCHOLARSHIP" | "DIRECT" =
    usableScholarships.length === 0 ? "DIRECT" : chosenPayment ?? "SCHOLARSHIP";
  const [selectedScholarshipId, setSelectedScholarshipId] = useState<string>("");
  const [isProcessingEnrollment, setIsProcessingEnrollment] = useState(false);

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
      // Seat counts on the class cards and on the class page
      queryClient.invalidateQueries({ queryKey: ["classDiscovery"] });
      queryClient.invalidateQueries({ queryKey: ["classDetail", item.id] });

      // If free class: confirmed immediately
      if (isFree || newEnrollment.enrollmentStatus === "CONFIRMED") {
        onClose();
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

        onClose();
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
      onClose();
      message.success("Giữ chỗ thành công! Chỗ ngồi được giữ trong 15 phút.");
      navigate(`/checkout/${newEnrollment.id}`);
    } catch (err: any) {
      onClose();
      message.error(err.message || "Không thể thực hiện đăng ký.");
      queryClient.invalidateQueries({ queryKey: enrollmentKeys.availability(item.id) });
      queryClient.invalidateQueries({ queryKey: enrollmentKeys.myList(1, 100) });
    } finally {
      setIsProcessingEnrollment(false);
    }
  };

  return (
    <>
    {/* Confirm Enrollment Modal */}
    <Modal
      open={open}
      onCancel={() => !isProcessingEnrollment && onClose()}
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
                          value={selectedScholarship?.id}
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
            onClick={() => onClose()}
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
    </>
  );
}
