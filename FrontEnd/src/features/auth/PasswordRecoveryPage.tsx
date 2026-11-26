import { useEffect, useState } from "react";
import { Alert, Button, Form, Input } from "antd";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FetchError } from "../../api/apiClient";
import { ROUTES } from "../../routes/routePaths";
import { requestPasswordReset, resetPassword } from "../../services/auth.service";
import { useAuthStore } from "../../stores/auth.store";

const errorText = (error: unknown) => {
  if (error instanceof FetchError) {
    if (error.code === "INVALID_PASSWORD_RESET") return "Liên kết đã hết hạn hoặc đã được sử dụng. Hãy yêu cầu một liên kết mới.";
    if (error.code === "PASSWORD_RESET_UNAVAILABLE") return "Dịch vụ gửi email đang tạm gián đoạn. Vui lòng thử lại sau.";
    if (error.status === 429) return "Bạn đã gửi quá nhiều yêu cầu. Vui lòng đợi một lúc rồi thử lại.";
  }
  return "Không thể xử lý yêu cầu. Vui lòng thử lại.";
};

export default function PasswordRecoveryPage({ reset = false }: { reset?: boolean }) {
  return (
    <main className="site-container flex min-h-[65vh] justify-center px-4 py-16">
      <section className="w-full max-w-md self-start rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="mb-5 text-2xl font-bold text-[#163B40]">{reset ? "Đặt lại mật khẩu" : "Khôi phục mật khẩu"}</h1>
        {reset ? <ResetForm /> : <RequestForm />}
        <Link to={ROUTES.AUTH.LOGIN} className="mt-5 inline-block font-semibold text-teal-700">
          Quay lại đăng nhập
        </Link>
      </section>
    </main>
  );
}

function RequestForm() {
  const request = useMutation({ mutationFn: requestPasswordReset });
  if (request.isSuccess) {
    return (
      <>
        <Alert showIcon type="success" title="Hãy kiểm tra email"
          description="Nếu email đã đăng ký, Edunity sẽ gửi liên kết đặt lại mật khẩu. Liên kết có hiệu lực 30 phút." />
        <Button type="link" onClick={() => request.reset()} className="mt-2 px-0">Yêu cầu liên kết khác</Button>
      </>
    );
  }
  return (
    <Form layout="vertical" onFinish={({ email }: { email: string }) => request.mutate(email.trim())}>
      {request.isError && <Alert showIcon type="error" title={errorText(request.error)} className="mb-4" />}
      <Form.Item name="email" label="Email đã đăng ký" rules={[{ required: true, type: "email", message: "Nhập email hợp lệ." }]}>
        <Input type="email" autoComplete="email" maxLength={254} />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={request.isPending} block>Gửi liên kết đặt lại</Button>
    </Form>
  );
}

function ResetForm() {
  const [token] = useState(() => window.location.hash.slice(1));
  const validLink = /^[A-Za-z0-9_-]{43}$/.test(token);
  const logout = useAuthStore((state) => state.logout);
  const reset = useMutation({
    mutationFn: (password: string) => resetPassword(token, password),
    onSuccess: () => logout(),
  });

  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
  }, []);

  if (reset.isSuccess) {
    return <Alert showIcon type="success" title="Đã đặt mật khẩu mới" description="Bạn có thể đăng nhập lại bằng mật khẩu vừa đặt." />;
  }
  if (!validLink || (reset.error instanceof FetchError && reset.error.code === "INVALID_PASSWORD_RESET")) {
    return (
      <Alert showIcon type="warning" title="Liên kết đặt lại mật khẩu không còn dùng được."
        description={<Link to={ROUTES.AUTH.FORGOT_PASSWORD}>Yêu cầu liên kết mới</Link>} />
    );
  }
  return (
    <Form layout="vertical" onFinish={({ password }: { password: string }) => reset.mutate(password)}>
      {reset.isError && <Alert showIcon type="error" title={errorText(reset.error)} className="mb-4" />}
      <Form.Item name="password" label="Mật khẩu mới" rules={[
        { required: true, min: 8, max: 128, message: "Nhập mật khẩu từ 8 đến 128 ký tự." },
      ]}>
        <Input.Password autoComplete="new-password" maxLength={128} />
      </Form.Item>
      <Form.Item name="confirmPassword" label="Nhập lại mật khẩu" dependencies={["password"]} rules={[
        { required: true, message: "Nhập lại mật khẩu mới." },
        ({ getFieldValue }) => ({
          validator: (_, value) => !value || value === getFieldValue("password")
            ? Promise.resolve()
            : Promise.reject(new Error("Mật khẩu nhập lại chưa khớp.")),
        }),
      ]}>
        <Input.Password autoComplete="new-password" maxLength={128} />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={reset.isPending} block>Lưu mật khẩu mới</Button>
    </Form>
  );
}
