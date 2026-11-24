import { App as AntdApp, Button, Checkbox, Form, Input, Spin } from "antd";
import { CheckCircleFilled, LockOutlined, MailOutlined, UserOutlined } from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { loginUser, registerTeacher } from "../../services/auth.service";
import { useAuthStore } from "../../stores/auth.store";
import { ROUTES } from "../../routes/routePaths";
import type { TeacherRegisterRequest } from "../../types/auth";
import { getAuthErrorMessage } from "../../utils/apiErrorMap";
import { getRoleHome } from "./authRedirect";
import { useTeacherVerification } from "../../hooks/useTeacherVerification";

interface TeacherRegisterFormValues extends TeacherRegisterRequest {
  confirmPassword: string;
  agreement: boolean;
}

const benefits = [
  "Kết nối với học viên trên Edunity",
  "Chủ động xây dựng lớp học của bạn",
  "Phát triển thương hiệu chuyên môn",
];

export default function TeacherRegisterPage() {
  const [form] = Form.useForm<TeacherRegisterFormValues>();
  const { notification } = AntdApp.useApp();
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const { user, isAuthenticated } = useAuthStore();
  const { verificationStatus, isLoading: isVerificationLoading } = useTeacherVerification();

  const registerMutation = useMutation({
    mutationFn: async (values: TeacherRegisterRequest) => {
      await registerTeacher(values);
      // Step 2 uploads private documents, which requires an authenticated Teacher
      try {
        const session = await loginUser({ email: values.email, password: values.password });
        setAuth(session.user, session.accessToken, session.refreshToken, true);
        return { loggedIn: true };
      } catch {
        return { loggedIn: false };
      }
    },
    onSuccess: ({ loggedIn }, values) => {
      notification.success({
        title: "Tạo tài khoản giáo viên thành công",
        description: loggedIn
          ? "Tiếp tục điền hồ sơ giảng dạy để Edunity xét duyệt và mở quyền tạo lớp."
          : "Vui lòng đăng nhập để điền hồ sơ giảng dạy.",
        placement: "topRight",
      });
      if (loggedIn) {
        navigate(ROUTES.AUTH.TEACHER_QUALIFICATION, { replace: true });
      } else {
        navigate(`${ROUTES.AUTH.LOGIN}?redirect=${encodeURIComponent(ROUTES.AUTH.TEACHER_QUALIFICATION)}`, {
          state: { email: values.email },
        });
      }
    },
    onError: (error: unknown) => {
      if ((error as { code?: string })?.code === "DUPLICATE_EMAIL") {
        form.setFields([{ name: "email", errors: ["Email này đã được sử dụng."] }]);
      }
      notification.error({
        title: "Đăng ký thất bại",
        description: getAuthErrorMessage(error, "Đã có lỗi xảy ra. Vui lòng thử lại."),
        placement: "topRight",
      });
    },
  });

  const handleSubmit = (values: TeacherRegisterFormValues) => {
    registerMutation.mutate({
      fullName: values.fullName.trim(),
      email: values.email.trim(),
      password: values.password,
    });
  };

  if (isAuthenticated && user && !registerMutation.isPending && !registerMutation.isSuccess) {
    if (user.role !== "TEACHER") {
      return <Navigate to={getRoleHome(user.role)} replace />;
    }
    if (isVerificationLoading) {
      return (
        <main className="site-container flex min-h-[calc(100vh-72px)] items-center justify-center py-14">
          <Spin size="large" />
        </main>
      );
    }
    if (verificationStatus === "UNVERIFIED") {
      return <Navigate to={ROUTES.AUTH.TEACHER_QUALIFICATION} replace />;
    }
    if (verificationStatus === "REJECTED") {
      return <Navigate to={ROUTES.TEACHER.PROFILE} replace />;
    }
    return <Navigate to={ROUTES.TEACHER.HOME} replace />;
  }

  return (
    <main className="site-container flex min-h-[calc(100vh-72px)] items-center py-14">
      <div className="grid w-full gap-16 lg:grid-cols-[minmax(0,1fr)_460px]">
        <section className="max-w-[570px] pb-4">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.16em] text-[#0D9488]">Đồng hành cùng Edunity</p>
          <h1 className="max-w-[520px] text-4xl font-black leading-tight tracking-tight text-[#163B40] lg:text-[46px]">
            Chia sẻ kiến thức, truyền cảm hứng
          </h1>
          <p className="mt-5 max-w-[510px] text-base leading-7 text-[#64748B]">
            Trở thành giáo viên Edunity để kết nối với học viên và xây dựng hành trình giảng dạy của riêng bạn.
          </p>
          <ul className="mt-8 space-y-4">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-center gap-3 text-sm font-medium text-[#334155]">
                <CheckCircleFilled className="text-[#0D9488]" />
                {benefit}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-[#D6E5E2] bg-white p-7 shadow-[0_18px_50px_rgba(13,148,136,0.08)] lg:p-9">
          <div className="mb-7">
            <p className="mb-3 text-sm font-semibold tracking-wide text-[#0D9488]">Bước 1/2 · Tạo tài khoản</p>
            <h2 className="text-2xl font-extrabold tracking-tight text-[#163B40]">Đăng ký giáo viên</h2>
            <p className="mt-2 text-sm leading-6 text-[#64748B]">Tạo tài khoản đăng nhập. Ở bước tiếp theo bạn sẽ điền hồ sơ giảng dạy để Edunity xét duyệt.</p>
          </div>

          <Form form={form} layout="vertical" requiredMark onFinish={handleSubmit} autoComplete="on" scrollToFirstError>
            <Form.Item label="Họ và tên" name="fullName" rules={[{ required: true, whitespace: true, message: "Vui lòng nhập họ và tên." }]}>
              <Input prefix={<UserOutlined className="text-slate-400" />} placeholder="Nhập họ và tên" autoComplete="name" size="large" />
            </Form.Item>
            <Form.Item label="Email" name="email" rules={[{ required: true, whitespace: true, message: "Vui lòng nhập email." }, { type: "email", message: "Vui lòng nhập đúng định dạng email." }]}>
              <Input prefix={<MailOutlined className="text-slate-400" />} placeholder="example@email.com" autoComplete="email" size="large" />
            </Form.Item>
            <Form.Item label="Mật khẩu" name="password" rules={[{ required: true, message: "Vui lòng nhập mật khẩu." }, { min: 8, message: "Mật khẩu cần có ít nhất 8 ký tự." }]}>
              <Input.Password prefix={<LockOutlined className="text-slate-400" />} placeholder="Nhập mật khẩu" autoComplete="new-password" size="large" />
            </Form.Item>
            <Form.Item label="Xác nhận mật khẩu" name="confirmPassword" dependencies={["password"]} rules={[{ required: true, message: "Vui lòng nhập lại mật khẩu." }, ({ getFieldValue }) => ({ validator(_, value) { return !value || getFieldValue("password") === value ? Promise.resolve() : Promise.reject(new Error("Mật khẩu xác nhận không khớp.")); } })]}>
              <Input.Password prefix={<LockOutlined className="text-slate-400" />} placeholder="Nhập lại mật khẩu" autoComplete="new-password" size="large" />
            </Form.Item>
            <Form.Item name="agreement" valuePropName="checked" rules={[{ validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error("Vui lòng đồng ý với điều khoản.")) }]}>
              <Checkbox><span className="text-xs leading-5 text-[#64748B]">Tôi đồng ý với điều khoản đăng ký giáo viên của Edunity.</span></Checkbox>
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={registerMutation.isPending} disabled={registerMutation.isPending} block size="large" className="h-12 rounded-lg bg-[#0D9488] font-bold shadow-sm shadow-teal-900/10 hover:bg-[#0B746C] border-none">Tiếp tục</Button>
          </Form>

          <p className="mt-6 text-center text-sm text-[#64748B]">Bạn là học viên? <Link to={ROUTES.AUTH.REGISTER} className="font-bold text-[#0D9488] hover:text-[#0F766E]">Đăng ký tài khoản học viên</Link></p>
        </section>
      </div>
    </main>
  );
}
