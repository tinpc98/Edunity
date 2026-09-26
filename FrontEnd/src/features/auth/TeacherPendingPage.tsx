import { Button, Tag } from "antd";
import { CheckCircleFilled, ClockCircleOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useTeacherRegistrationStore } from "../../stores/teacherRegistration.store";
import { ROUTES } from "../../routes/routePaths";

export default function TeacherPendingPage() {
  const registration = useTeacherRegistrationStore((state) => state.registration);
  const qualification = useTeacherRegistrationStore((state) => state.qualification);
  const verificationStatus = useTeacherRegistrationStore((state) => state.verificationStatus);

  return (
    <main className="site-container flex min-h-[calc(100vh-72px)] items-center justify-center py-14">
      <section className="w-full max-w-[620px] rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-[0_18px_50px_rgba(79,70,229,0.10)] lg:p-10">
        <CheckCircleFilled className="text-5xl text-emerald-500" />
        <p className="mt-6 text-sm font-bold uppercase tracking-[0.16em] text-indigo-600">Hồ sơ giáo viên</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">Hồ sơ đang chờ xét duyệt</h1>
        <p className="mx-auto mt-4 max-w-[500px] text-sm leading-7 text-slate-600">Hồ sơ chuyên môn của bạn đã được gửi thành công. Edunity sẽ xem xét thông tin trước khi kích hoạt quyền giảng dạy.</p>
        <Tag icon={<ClockCircleOutlined />} color="processing" className="mt-6 px-3 py-1 text-sm font-bold">{verificationStatus ?? "PENDING"}</Tag>

        {registration && qualification && (
          <div className="mt-7 rounded-xl bg-slate-50 p-4 text-left text-sm text-slate-600">
            <p><span className="font-semibold text-slate-800">Giáo viên:</span> {registration.fullName}</p>
            <p className="mt-2"><span className="font-semibold text-slate-800">Tài liệu:</span> {qualification.fileName}</p>
          </div>
        )}

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to={ROUTES.HOME}><Button>Về trang chủ</Button></Link>
          <Link to={ROUTES.AUTH.LOGIN}><Button type="primary" className="bg-indigo-600">Đăng nhập</Button></Link>
        </div>
      </section>
    </main>
  );
}
