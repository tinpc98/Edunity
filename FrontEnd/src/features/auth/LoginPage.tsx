import { App as AntdApp, Button, Checkbox, Form, Input } from "antd";
import { CheckCircleFilled, LockOutlined, MailOutlined } from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { loginUser } from "../../services/auth.service";
import { useAuthStore } from "../../stores/auth.store";
import { ROUTES } from "../../routes/routePaths";
import type { LoginPayload } from "../../types/auth";
import { getAuthErrorMessage } from "../../utils/apiErrorMap";
import { getRoleHome, getSafeRedirect, resolvePostLoginPath } from "./authRedirect";

interface LoginFormValues {
  email: string;
  password: string;
  rememberMe: boolean;
}

const benefits = [
  "Học trực tiếp cùng giáo viên phù hợp",
  "Theo dõi lịch học dễ dàng",
  "Khám phá lớp học và cơ hội học bổng",
];

export default function LoginPage() {
  const [form] = Form.useForm<LoginFormValues>();
  const { notification: notificationApi } = AntdApp.useApp();
  const setAuth = useAuthStore((state) => state.setAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const redirectUrl = searchParams.get("redirect");

  const prefilledEmail = (location.state as { email?: string } | null)?.email;

  const loginMutation = useMutation({
    mutationFn: async (payload: LoginPayload) => {
      const data = await loginUser(payload);
      setAuth(data.user, data.accessToken, data.refreshToken);
      return { data, path: await resolvePostLoginPath(data.user.role, redirectUrl) };
    },
    onSuccess: ({ data, path }) => {
      notificationApi.success({
        title: "Đăng nhập thành công",
        description: `Chào mừng ${data.user.fullName} quay trở lại Edunity.`,
        placement: "topRight",
      });
      navigate(path, { replace: true });
    },
    onError: (error: unknown) => {
      notificationApi.error({
        title: "Đăng nhập thất bại",
        description: getAuthErrorMessage(error),
        placement: "topRight",
      });
    },
  });

  // Already signed in (e.g. back button after login): leave the login page
  if (isAuthenticated && user && !loginMutation.isPending && !loginMutation.isSuccess) {
    return <Navigate to={getSafeRedirect(redirectUrl) ?? getRoleHome(user.role)} replace />;
  }

  const handleSubmit = (values: LoginFormValues) => {
    loginMutation.mutate({
      email: values.email.trim(),
      password: values.password,
      rememberMe: values.rememberMe,
    });
  };

  return (
    <>
      <main className="site-container flex min-h-[calc(100vh-72px)] items-center py-14">
        <div className="grid w-full gap-16 lg:grid-cols-[minmax(0,1fr)_460px]">
          <section className="max-w-[570px] pb-4">
            <p className="mb-4 text-sm font-bold uppercase tracking-[0.16em] text-indigo-600">Cùng học, cùng tiến bộ</p>
            <h1 className="max-w-[520px] text-4xl font-black leading-tight tracking-tight text-slate-900 lg:text-[46px]">
              Tiếp tục hành trình học tập của bạn
            </h1>
            <p className="mt-5 max-w-[510px] text-base leading-7 text-slate-600">
              Kết nối với giáo viên phù hợp, tham gia các lớp học trực tuyến và quản lý hành trình học tập ngay trên Edunity.
            </p>

            <ul className="mt-8 space-y-4">
              {benefits.map((benefit) => (
                <li key={benefit} className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <CheckCircleFilled className="text-indigo-600" />
                  {benefit}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-7 shadow-[0_18px_50px_rgba(79,70,229,0.10)] lg:p-9">
            <div className="mb-7">
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Đăng nhập</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Chào mừng bạn quay trở lại Edunity.</p>
            </div>

            <Form
              form={form}
              layout="vertical"
              requiredMark
              onFinish={handleSubmit}
              initialValues={{ rememberMe: false, email: prefilledEmail }}
              autoComplete="off"
              scrollToFirstError
            >
              <Form.Item
                label="Email"
                name="email"
                rules={[
                  { required: true, whitespace: true, message: "Vui lòng nhập email." },
                  { type: "email", message: "Vui lòng nhập đúng định dạng email." },
                ]}
              >
                <Input prefix={<MailOutlined className="text-slate-400" />} placeholder="example@email.com" autoComplete="username" size="large" />
              </Form.Item>

              <Form.Item
                label="Mật khẩu"
                name="password"
                rules={[{ required: true, message: "Vui lòng nhập mật khẩu." }]}
              >
                <Input.Password prefix={<LockOutlined className="text-slate-400" />} placeholder="Nhập mật khẩu" autoComplete="current-password" size="large" />
              </Form.Item>

              <div className="mb-6 flex items-center justify-between gap-4">
                <Form.Item name="rememberMe" valuePropName="checked" noStyle>
                  <Checkbox>Ghi nhớ đăng nhập</Checkbox>
                </Form.Item>
                <a href="#forgot-password" className="shrink-0 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
                  Quên mật khẩu?
                </a>
              </div>

              <Button type="primary" htmlType="submit" loading={loginMutation.isPending} disabled={loginMutation.isPending} block size="large" className="h-12 rounded-lg bg-indigo-600 font-bold shadow-sm shadow-indigo-200 hover:bg-indigo-700">
                Đăng nhập
              </Button>
            </Form>

            <div className="mt-6 text-center text-sm text-slate-500">
              <p>
                Chưa có tài khoản? <Link to={ROUTES.AUTH.REGISTER} className="font-bold text-indigo-600 hover:text-indigo-700">Đăng ký ngay</Link>
              </p>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
