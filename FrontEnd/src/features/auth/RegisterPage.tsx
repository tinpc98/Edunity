import { App as AntdApp, Button, Checkbox, Form, Input } from "antd";
import { CheckCircleFilled, LockOutlined, MailOutlined, UserOutlined } from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { DuplicateEmailError } from "../../data/auth.mock";
import { registerUser } from "../../services/auth.service";
import { ROUTES } from "../../routes/routePaths";
import type { RegisterPayload } from "../../types/auth";

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

  const registerMutation = useMutation({
    mutationFn: (payload: RegisterPayload) => registerUser(payload),
    onSuccess: () => {
      notificationApi.success({
        title: "Đăng ký thành công",
        description: "Tài khoản của bạn đã được tạo thành công.",
        placement: "topRight",
      });
      navigate(ROUTES.AUTH.LOGIN);
    },
    onError: (error: Error) => {
      if (error instanceof DuplicateEmailError) {
        form.setFields([{ name: "email", errors: ["Email này đã được sử dụng."] }]);
      }
      notificationApi.error({
        title: "Đăng ký thất bại",
        description: error.message || "Đã xảy ra lỗi. Vui lòng thử lại.",
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
            {/* <div className="mb-8 flex items-center gap-3">
              <img src={LOGO_URL} alt="Edunity" className="h-10 w-auto object-contain" />
              <div>
                <p className="text-xl font-black leading-none tracking-tight text-indigo-950">Edunity</p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-indigo-600">Học Trực Tuyến Live</p>
              </div>
            </div> */}

            <p className="mb-4 text-sm font-bold uppercase tracking-[0.16em] text-indigo-600">Cùng học, cùng tiến bộ</p>
            <h1 className="max-w-[520px] text-4xl font-black leading-tight tracking-tight text-slate-900 lg:text-[46px]">
              Bắt đầu hành trình học tập của bạn
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
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Tạo tài khoản</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Tham gia Edunity và bắt đầu hành trình học tập của bạn.</p>
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
                  <span className="text-xs leading-5 text-slate-600">
                    Tôi đồng ý với <a href="#terms" className="font-semibold text-indigo-600 hover:text-indigo-700">Điều khoản sử dụng</a> và <a href="#privacy" className="font-semibold text-indigo-600 hover:text-indigo-700">Chính sách bảo mật</a> của Edunity.
                  </span>
                </Checkbox>
              </Form.Item>

              <Button type="primary" htmlType="submit" loading={registerMutation.isPending} disabled={registerMutation.isPending} block size="large" className="h-12 rounded-lg bg-indigo-600 font-bold shadow-sm shadow-indigo-200 hover:bg-indigo-700">
                Đăng ký
              </Button>
            </Form>

            <div className="mt-6 text-center text-sm text-slate-500">
              <p>
                Đã có tài khoản? <Link to={ROUTES.AUTH.LOGIN} className="font-bold text-indigo-600 hover:text-indigo-700">Đăng nhập</Link>
              </p>
              <p className="mt-3 text-xs text-slate-400">
                Bạn là giáo viên? <Link to={ROUTES.AUTH.TEACHER_REGISTER} className="font-semibold text-indigo-600 hover:text-indigo-700">Đăng ký trở thành giáo viên</Link>
              </p>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
