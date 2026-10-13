import { Alert, Button, Skeleton, Tag } from "antd";
import { CheckCircleFilled, ClockCircleOutlined, CloseCircleFilled, ExclamationCircleFilled } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { teacherVerificationService } from "../../services/teacherVerification.service";
import { useAuthStore } from "../../stores/auth.store";
import { ROUTES } from "../../routes/routePaths";
import type { VerificationStatus } from "../../types/teacherVerification";

const STATUS_VIEW: Record<VerificationStatus, { title: string; description: string; tag: string; color: string; icon: React.ReactNode }> = {
  PENDING: {
    title: "Hồ sơ đang chờ xét duyệt",
    description: "Hồ sơ chuyên môn của bạn đã được gửi thành công. Edunity sẽ xem xét thông tin trước khi kích hoạt quyền mở lớp giảng dạy.",
    tag: "Chờ xét duyệt",
    color: "processing",
    icon: <ClockCircleOutlined className="text-5xl text-indigo-500" />,
  },
  VERIFIED: {
    title: "Hồ sơ đã được xác minh",
    description: "Chúc mừng! Bạn đã có thể tạo và mở lớp học trên Edunity.",
    tag: "Đã xác minh",
    color: "success",
    icon: <CheckCircleFilled className="text-5xl text-emerald-500" />,
  },
  REJECTED: {
    title: "Hồ sơ chưa được duyệt",
    description: "Vui lòng xem lý do bên dưới, bổ sung giấy tờ và gửi lại hồ sơ.",
    tag: "Bị từ chối",
    color: "error",
    icon: <CloseCircleFilled className="text-5xl text-rose-500" />,
  },
  UNVERIFIED: {
    title: "Bạn chưa gửi hồ sơ xác minh",
    description: "Bổ sung giấy tờ định danh và bằng cấp để Edunity xác minh tài khoản giáo viên của bạn.",
    tag: "Chưa xác minh",
    color: "default",
    icon: <ExclamationCircleFilled className="text-5xl text-amber-500" />,
  },
};

export default function TeacherPendingPage() {
  const { user, isAuthenticated } = useAuthStore();
  const isTeacher = isAuthenticated && user?.role === "TEACHER";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["teacherVerification", user?.userId],
    queryFn: () => teacherVerificationService.getMyVerification(),
    enabled: isTeacher,
  });

  const status: VerificationStatus = data?.verificationStatus ?? "PENDING";
  const view = STATUS_VIEW[status];

  return (
    <main className="site-container flex min-h-[calc(100vh-72px)] items-center justify-center py-14">
      <section className="w-full max-w-[620px] rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-[0_18px_50px_rgba(79,70,229,0.10)] lg:p-10">
        {!isTeacher ? (
          <>
            <ClockCircleOutlined className="text-5xl text-indigo-500" />
            <h1 className="mt-6 text-3xl font-black tracking-tight text-slate-900">Theo dõi hồ sơ giáo viên</h1>
            <p className="mx-auto mt-4 max-w-[500px] text-sm leading-7 text-slate-600">Đăng nhập bằng tài khoản giáo viên để xem trạng thái xét duyệt hồ sơ của bạn.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to={ROUTES.HOME}><Button>Về trang chủ</Button></Link>
              <Link to={`${ROUTES.AUTH.LOGIN}?redirect=${encodeURIComponent(ROUTES.AUTH.TEACHER_PENDING)}`}>
                <Button type="primary" className="bg-indigo-600">Đăng nhập</Button>
              </Link>
            </div>
          </>
        ) : isLoading ? (
          <Skeleton active paragraph={{ rows: 5 }} />
        ) : isError ? (
          <Alert type="error" showIcon message="Không tải được trạng thái hồ sơ" description="Vui lòng thử lại sau ít phút." />
        ) : (
          <>
            {view.icon}
            <p className="mt-6 text-sm font-bold uppercase tracking-[0.16em] text-indigo-600">Hồ sơ giáo viên</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">{view.title}</h1>
            <p className="mx-auto mt-4 max-w-[500px] text-sm leading-7 text-slate-600">{view.description}</p>
            <Tag color={view.color} className="mt-6 px-3 py-1 text-sm font-bold">{view.tag}</Tag>

            <div className="mt-7 rounded-xl bg-slate-50 p-4 text-left text-sm text-slate-600 space-y-2">
              <p><span className="font-semibold text-slate-800">Giáo viên:</span> {data?.fullName}</p>
              <p><span className="font-semibold text-slate-800">Email:</span> {data?.email}</p>
              {data?.qualificationSummary && <p><span className="font-semibold text-slate-800">Chuyên môn:</span> {data.qualificationSummary}</p>}
              <p><span className="font-semibold text-slate-800">Tài liệu đã gửi:</span> {data?.documents?.length ?? 0} bộ hồ sơ</p>
              {status === "REJECTED" && data?.reviewNote && (
                <p className="text-rose-600"><span className="font-semibold">Lý do từ chối:</span> {data.reviewNote}</p>
              )}
            </div>

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to={ROUTES.HOME}><Button>Về trang chủ</Button></Link>
              {status === "REJECTED" || status === "UNVERIFIED" ? (
                <Link to={ROUTES.AUTH.TEACHER_QUALIFICATION}><Button type="primary" className="bg-indigo-600">Bổ sung hồ sơ</Button></Link>
              ) : (
                <Link to={ROUTES.TEACHER.HOME}><Button type="primary" className="bg-indigo-600">Vào trang giáo viên</Button></Link>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
