import { App as AntdApp, Button, Checkbox, Form, Input } from "antd";
import { CheckCircleFilled, LockOutlined, MailOutlined, UserOutlined } from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";

import { loginUser, registerUser } from "../../services/auth.service";
import { useAuthStore } from "../../stores/auth.store";
import { ROUTES } from "../../routes/routePaths";
import type { RegisterPayload } from "../../types/auth";
import { getAuthErrorMessage } from "../../utils/apiErrorMap";

interface RegisterFormValues {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  agreement: boolean;
}

const benefits = [
  "Học trực tiếp cùng giáo viên phù hợp",
  "Theo dõi lịch học dễ dàng",
  "Khám phá lớp học và cơ hội học bổng",
];

export default function RegisterPage() {
  const [form] = Form.useForm<RegisterFormValues>();
  const { notification: notificationApi } = AntdApp.useApp();
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const registerMutation = useMutation({
    mutationFn: async (payload: RegisterPayload) => {
      await registerUser(payload);
      // The account is ACTIVE right away: sign in with the same credentials
      try {
        const session = await loginUser({ email: payload.email, password: payload.password });
        setAuth(session.user, session.accessToken, session.refreshToken, true);
        return { loggedIn: true as const };
      } catch {
        return { loggedIn: false as const };
      }
    },
    onSuccess: ({ loggedIn }, payload) => {
      notificationApi.success({
        title: "Đăng ký thành công",
        description: loggedIn
          ? "Chào mừng bạn đến với Edunity!"
          : "Tài khoản đã được tạo. Vui lòng đăng nhập để tiếp tục.",
        placement: "topRight",
      });
      if (loggedIn) navigate(ROUTES.STUDENT.HOME, { replace: true });
      else navigate(ROUTES.AUTH.LOGIN, { state: { email: payload.email } });
    },
    onError: (error: unknown) => {
      const message = getAuthErrorMessage(error);
      if ((error as { code?: string })?.code === "DUPLICATE_EMAIL") {
        form.setFields([{ name: "email", errors: ["Email này đã được sử dụng."] }]);
      }
      notificationApi.error({
        title: "Đăng ký thất bại",
        description: message,
        placement: "topRight",
      });
    },
  });

  const handleSubmit = (values: RegisterFormValues) => {
    registerMutation.mutate({
      fullName: values.fullName.trim(),
      email: values.email.trim(),
      password: values.password,
      role: "STUDENT",
    });
  };

  return (
    <>
      <main className="site-container flex min-h-[calc(100vh-72px)] items-center py-14">
        <div className="grid w-full gap-16 lg:grid-cols-[minmax(0,1fr)_460px]">
          <section className="max-w-[570px] pb-4">
            <p className="mb-4 text-sm font-bold uppercase tracking-[0.16em] text-[#0D9488]">Cùng học, cùng tiến bộ</p>
            <h1 className="max-w-[520px] text-4xl font-black leading-tight tracking-tight text-[#163B40] lg:text-[46px]">
              Bắt đầu hành trình học tập của bạn
            </h1>
            <p className="mt-5 max-w-[510px] text-base leading-7 text-[#64748B]">
              Kết nối với giáo viên phù hợp, tham gia các lớp học trực tuyến và quản lý hành trình học tập ngay trên Edunity.
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
              <h2 className="text-2xl font-extrabold tracking-tight text-[#163B40]">Tạo tài khoản</h2>
              <p className="mt-2 text-sm leading-6 text-[#64748B]">Tham gia Edunity và bắt đầu hành trình học tập của bạn.</p>
            </div>

            <Form
              form={form}
              layout="vertical"
              requiredMark
              onFinish={handleSubmit}
              autoComplete="on"
              scrollToFirstError
            >
              <Form.Item
                label="Họ và tên"
                name="fullName"
                rules={[
                  { required: true, whitespace: true, message: "Vui lòng nhập họ và tên." },
                  { min: 2, message: "Họ và tên cần có ít nhất 2 ký tự." },
                ]}
              >
                <Input prefix={<UserOutlined className="text-slate-400" />} placeholder="Nhập họ và tên" autoComplete="name" size="large" />
              </Form.Item>

              <Form.Item
                label="Email"
                name="email"
                rules={[
                  { required: true, whitespace: true, message: "Vui lòng nhập email." },
                  { type: "email", message: "Vui lòng nhập đúng định dạng email." },
                ]}
              >
                <Input prefix={<MailOutlined className="text-slate-400" />} placeholder="example@email.com" autoComplete="email" size="large" />
              </Form.Item>

              <Form.Item
                label="Mật khẩu"
                name="password"
                extra="Mật khẩu cần có ít nhất 8 ký tự."
                rules={[{ required: true, message: "Vui lòng nhập mật khẩu." }, { min: 8, message: "Mật khẩu cần có ít nhất 8 ký tự." }]}
              >
                <Input.Password prefix={<LockOutlined className="text-slate-400" />} placeholder="Nhập mật khẩu" autoComplete="new-password" size="large" />
              </Form.Item>

              <Form.Item
                label="Xác nhận mật khẩu"
                name="confirmPassword"
                dependencies={["password"]}
                rules={[
                  { required: true, message: "Vui lòng nhập lại mật khẩu." },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue("password") === value) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error("Mật khẩu xác nhận không khớp."));
                    },
                  }),
                ]}
              >
                <Input.Password prefix={<LockOutlined className="text-slate-400" />} placeholder="Nhập lại mật khẩu" autoComplete="new-password" size="large" />
              </Form.Item>

              <Form.Item
                name="agreement"
                valuePropName="checked"
                rules={[{ validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error("Vui lòng đồng ý với điều khoản.")) }]}
              >
                <Checkbox>
                  <span className="text-xs leading-5 text-[#64748B]">
                    Tôi đồng ý với <a href="#terms" className="font-semibold text-[#0D9488] hover:text-[#0F766E]">Điều khoản sử dụng</a> và <a href="#privacy" className="font-semibold text-[#0D9488] hover:text-[#0F766E]">Chính sách bảo mật</a> của Edunity.
                  </span>
                </Checkbox>
              </Form.Item>

              <Button type="primary" htmlType="submit" loading={registerMutation.isPending} disabled={registerMutation.isPending} block size="large" className="h-12 rounded-lg bg-[#0D9488] font-bold shadow-sm shadow-teal-900/10 hover:bg-[#0B746C] border-none">
                Đăng ký
              </Button>
            </Form>

            <div className="mt-6 text-center text-sm text-[#64748B]">
              <p>
                Đã có tài khoản? <Link to={ROUTES.AUTH.LOGIN} className="font-bold text-[#0D9488] hover:text-[#0F766E]">Đăng nhập</Link>
              </p>
              <p className="mt-3 text-xs text-slate-400">
                Bạn là giáo viên? <Link to={ROUTES.AUTH.TEACHER_REGISTER} className="font-semibold text-[#0D9488] hover:text-[#0F766E]">Đăng ký trở thành giáo viên</Link>
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Bạn muốn ủng hộ học bổng? <Link to={ROUTES.AUTH.SPONSOR_REGISTER} className="font-semibold text-[#0D9488] hover:text-[#0F766E]">Đăng ký nhà tài trợ</Link>
              </p>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
