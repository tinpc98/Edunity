import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, Skeleton, Tag } from "antd";
import { CheckCircleFilled, BookOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { enrollmentService } from "../../services/enrollment.service";
import { useClassDetailQuery } from "../class/hooks/useClassDiscovery";
import { ROUTES } from "../../routes/routePaths";

export default function PaymentSuccessPage() {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();

  const { data: enrollment, isLoading: isLoadingEnrollment } = useQuery({
    queryKey: ["enrollment", enrollmentId],
    queryFn: () => (enrollmentId ? enrollmentService.getEnrollmentById(enrollmentId) : null),
    enabled: Boolean(enrollmentId),
  });

  const { data: classItem, isLoading: isLoadingClass } = useClassDetailQuery(
    enrollment?.classId
  );

  if (isLoadingEnrollment || isLoadingClass) {
    return (
      <div className="site-container py-16 min-h-[60vh] flex items-center justify-center">
        <Skeleton active paragraph={{ rows: 4 }} className="max-w-md" />
      </div>
    );
  }

  const formattedAmount = enrollment
    ? `${enrollment.tuitionAmount.toLocaleString("vi-VN")}đ`
    : "";

  return (
    <div className="site-container py-12 min-h-[calc(100vh-140px)] flex items-center justify-center">
      <div className="bg-white rounded-3xl border border-slate-200/80 p-8 sm:p-12 shadow-sm max-w-lg w-full text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-5 text-3xl">
          <CheckCircleFilled />
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mb-2">
          Thanh toán thành công
        </h1>
        <p className="text-sm text-slate-500 mb-6">
          Bạn đã đăng ký lớp học thành công.
        </p>

        {classItem && (
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 text-left mb-8 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400">Lớp học</span>
              <Tag color="green" className="font-semibold text-[11px] border-none">
                ĐÃ XÁC NHẬN
              </Tag>
            </div>
            <div className="text-base font-bold text-slate-900">
              {classItem.title}
            </div>
            <div className="text-xs text-slate-600 flex items-center gap-2">
              <BookOutlined className="text-indigo-600" />
              <span>{classItem.courseTitle}</span>
            </div>
            <div className="pt-3 border-t border-slate-200/70 flex items-center justify-between text-xs">
              <span className="text-slate-500">Số tiền đã thanh toán:</span>
              <span className="font-bold text-slate-900 text-sm">{formattedAmount}</span>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <Link to={ROUTES.STUDENT.HOME} className="block">
            <Button
              type="primary"
              size="large"
              icon={<ArrowRightOutlined />}
              className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold text-sm shadow-xs"
            >
              Đến Học tập của tôi
            </Button>
          </Link>

          {classItem && (
            <Link to={`/classes/${classItem.id}`} className="block">
              <Button
                size="large"
                className="w-full h-12 rounded-xl font-semibold text-sm text-slate-600 border-slate-200"
              >
                Xem lại lớp học
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
