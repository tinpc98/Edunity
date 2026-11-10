import { App as AntdApp, Alert, Button, Checkbox, Form, Input, Radio } from "antd";
import {
  BankOutlined,
  CheckCircleFilled,
  LockOutlined,
  MailOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { loginUser, registerSponsor } from "../../services/auth.service";
import { useAuthStore } from "../../stores/auth.store";
import { ROUTES } from "../../routes/routePaths";
import type { SponsorRegisterRequest, SponsorType } from "../../types/auth";
import { getAuthErrorMessage } from "../../utils/apiErrorMap";
import { getRoleHome, getSafeRedirect, resolvePostLoginPath } from "./authRedirect";

interface SponsorRegisterFormValues {
  sponsorType: SponsorType;
  organizationName?: string;
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  agreement: boolean;
}

const benefits = [
  "Ủng hộ trực tiếp vào quỹ học bổng của từng chiến dịch",
  "Theo dõi lịch sử đóng góp và báo cáo sử dụng quỹ",
  "Thông tin học sinh được bảo mật, chỉ công bố khi được đồng ý",
];

/** Keeps ?redirect= when moving between the auth pages. */
const withRedirect = (path: string, redirect: string | null) =>
  redirect ? `${path}?redirect=${encodeURIComponent(redirect)}` : path;

export default function SponsorRegisterPage() {
  const [form] = Form.useForm<SponsorRegisterFormValues>();
  const { notification: notificationApi } = AntdApp.useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectUrl = getSafeRedirect(searchParams.get("redirect"));
  const setAuth = useAuthStore((state) => state.setAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);

  const sponsorType = Form.useWatch("sponsorType", form) ?? "INDIVIDUAL";
  const isOrganization = sponsorType === "ORGANIZATION";

  const registerMutation = useMutation({
    mutationFn: async (payload: SponsorRegisterRequest) => {
      await registerSponsor(payload);
      // The account is ACTIVE right away: sign in with the same credentials
      try {
        const session = await loginUser({ email: payload.email, password: payload.password });
        setAuth(session.user, session.accessToken, session.refreshToken, true);
        return { path: await resolvePostLoginPath(session.user.role, redirectUrl) };
      } catch {
        return { path: null };
      }
    },
    onSuccess: ({ path }, payload) => {
      notificationApi.success({
        title: "Đăng ký thành công",
        description: path
          ? "Cảm ơn bạn đã đồng hành cùng Edunity!"
          : "Tài khoản đã được tạo. Vui lòng đăng nhập để tiếp tục.",
        placement: "topRight",
      });
      if (path) navigate(path, { replace: true });
      else navigate(withRedirect(ROUTES.AUTH.LOGIN, redirectUrl), { state: { email: payload.email } });
    },
    onError: (error: unknown) => {
      if ((error as { code?: string })?.code === "DUPLICATE_EMAIL") {
        form.setFields([{ name: "email", errors: ["Email này đã được sử dụng."] }]);
      }
      notificationApi.error({
        title: "Đăng ký thất bại",
        description: getAuthErrorMessage(error),
        placement: "topRight",
      });
    },
  });

  // Already signed in as a Sponsor: nothing to register, continue to the requested page
  if (isAuthenticated && user && user.role === "SPONSOR" && !registerMutation.isPending && !registerMutation.isSuccess) {
    return <Navigate to={redirectUrl ?? getRoleHome(user.role)} replace />;
  }

  const signedInAsOtherRole = isAuthenticated && user && user.role !== "SPONSOR" && !registerMutation.isSuccess;

  const handleSubmit = (values: SponsorRegisterFormValues) => {
    registerMutation.mutate({
      sponsorType: values.sponsorType,
      organizationName: values.sponsorType === "ORGANIZATION" ? values.organizationName?.trim() : undefined,
      fullName: values.fullName.trim(),
      email: values.email.trim(),
      password: values.password,
    });
  };

  return (
    <main className="site-container flex min-h-[calc(100vh-72px)] items-center py-14">
      <div className="grid w-full gap-16 lg:grid-cols-[minmax(0,1fr)_460px]">
        <section className="max-w-[570px] pb-4">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.16em] text-indigo-600">Chung tay vì học sinh</p>
          <h1 className="max-w-[520px] text-4xl font-black leading-tight tracking-tight text-slate-900 lg:text-[46px]">
            Trở thành nhà tài trợ của Edunity
          </h1>
          <p className="mt-5 max-w-[510px] text-base leading-7 text-slate-600">
            Mỗi khoản đóng góp giúp một học sinh có hoàn cảnh khó khăn tiếp tục được học cùng giáo viên phù hợp.
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
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Tạo tài khoản nhà tài trợ</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {redirectUrl
                ? "Sau khi đăng ký, bạn sẽ được đưa trở lại trang đang xem để tiếp tục ủng hộ."
                : "Đăng ký để ủng hộ các chiến dịch học bổng trên Edunity."}
            </p>
          </div>

          {signedInAsOtherRole && (
            <Alert
              type="warning"
              showIcon
              className="!mb-6 rounded-xl"
              title="Bạn đang đăng nhập bằng tài khoản khác"
              description="Tài khoản hiện tại không phải nhà tài trợ. Hãy đăng xuất trước khi tạo tài khoản nhà tài trợ mới."
            />
          )}

          <Form
            form={form}
            layout="vertical"
            requiredMark
            onFinish={handleSubmit}
            autoComplete="on"
            scrollToFirstError
            initialValues={{ sponsorType: "INDIVIDUAL" }}
            disabled={Boolean(signedInAsOtherRole)}
          >
            <Form.Item label="Hình thức tài trợ" name="sponsorType">
              <Radio.Group optionType="button" buttonStyle="solid" className="w-full [&_.ant-radio-button-wrapper]:w-1/2 [&_.ant-radio-button-wrapper]:text-center">
                <Radio.Button value="INDIVIDUAL">Cá nhân</Radio.Button>
                <Radio.Button value="ORGANIZATION">Tổ chức / Doanh nghiệp</Radio.Button>
              </Radio.Group>
            </Form.Item>

            {isOrganization && (
              <Form.Item
                label="Tên tổ chức / doanh nghiệp"
                name="organizationName"
                rules={[
                  { required: true, whitespace: true, message: "Vui lòng nhập tên tổ chức." },
                  { min: 2, message: "Tên tổ chức cần có ít nhất 2 ký tự." },
                ]}
              >
                <Input prefix={<BankOutlined className="text-slate-400" />} placeholder="Nhập tên tổ chức" autoComplete="organization" size="large" />
              </Form.Item>
            )}

            <Form.Item
              label={isOrganization ? "Họ và tên người đại diện" : "Họ và tên"}
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
                    if (!value || getFieldValue("password") === value) return Promise.resolve();
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
              rules={[{ validator: (_, value) => (value ? Promise.resolve() : Promise.reject(new Error("Vui lòng đồng ý với điều khoản."))) }]}
            >
              <Checkbox>
                <span className="text-xs leading-5 text-slate-600">
                  Tôi đồng ý với <a href="#terms" className="font-semibold text-indigo-600 hover:text-indigo-700">Điều khoản sử dụng</a> và <a href="#privacy" className="font-semibold text-indigo-600 hover:text-indigo-700">Chính sách bảo mật</a> của Edunity.
                </span>
              </Checkbox>
            </Form.Item>

            <Button type="primary" htmlType="submit" loading={registerMutation.isPending} disabled={registerMutation.isPending || Boolean(signedInAsOtherRole)} block size="large" className="h-12 rounded-lg bg-indigo-600 font-bold shadow-sm shadow-indigo-200 hover:bg-indigo-700">
              Đăng ký nhà tài trợ
            </Button>
          </Form>

          <div className="mt-6 text-center text-sm text-slate-500">
            <p>
              Đã có tài khoản? <Link to={withRedirect(ROUTES.AUTH.LOGIN, redirectUrl)} className="font-bold text-indigo-600 hover:text-indigo-700">Đăng nhập</Link>
            </p>
            <p className="mt-3 text-xs text-slate-400">
              Bạn là học viên? <Link to={ROUTES.AUTH.REGISTER} className="font-semibold text-indigo-600 hover:text-indigo-700">Đăng ký tài khoản học viên</Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
