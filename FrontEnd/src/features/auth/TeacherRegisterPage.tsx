import { App as AntdApp, Button, Checkbox, Form, Input, Spin } from "antd";
import { CheckCircleFilled, LockOutlined, MailOutlined, UserOutlined } from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { loginUser, registerTeacher } from "../../services/auth.service";
import { profileService } from "../../services/profile.service";
import { useAuthStore } from "../../stores/auth.store";
import { useTeacherRegistrationStore } from "../../stores/teacherRegistration.store";
import { ROUTES } from "../../routes/routePaths";
import type { TeacherRegisterRequest } from "../../types/auth";
import { getAuthErrorMessage, getFriendlyErrorMessage } from "../../utils/apiErrorMap";
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
  const setDraft = useTeacherRegistrationStore((state) => state.setDraft);
  const { verificationStatus, isLoading: isVerificationLoading } = useTeacherVerification();

  const registerMutation = useMutation({
    mutationFn: async (values: TeacherRegisterRequest) => {
      const account = await registerTeacher(values);
      setDraft({
        userId: account.userId,
        fullName: account.fullName,
        email: account.email,
        qualificationSummary: values.qualificationSummary,
        biography: values.biography,
      });
      // Step 2 uploads private documents, which requires an authenticated Teacher
      let session: Awaited<ReturnType<typeof loginUser>>;
      try {
        session = await loginUser({ email: values.email, password: values.password });
      } catch {
        return { loggedIn: false as const, draftSaveError: null };
      }

      setAuth(session.user, session.accessToken, session.refreshToken, true);
      try {
        await profileService.updateMyProfile({
          qualificationSummary: values.qualificationSummary.trim(),
          biography: values.biography?.trim() || "",
        });
        return { loggedIn: true as const, draftSaveError: null };
      } catch (error) {
        return {
          loggedIn: true as const,
          draftSaveError: getFriendlyErrorMessage(error, "Không thể lưu thông tin hồ sơ."),
        };
      }
    },
    onSuccess: ({ loggedIn, draftSaveError }, values) => {
      if (draftSaveError) {
        notification.warning({
          title: "Thông tin nháp chưa được lưu trên máy chủ",
          description: draftSaveError,
          placement: "topRight",
        });
      }
      notification.success({
        title: "Tạo tài khoản giáo viên thành công",
        description: loggedIn
          ? draftSaveError
            ? "Tiếp tục bổ sung giấy tờ; bạn có thể lưu lại thông tin hồ sơ ở bước tiếp theo."
            : "Thông tin chuyên môn đã được lưu. Tiếp tục bổ sung giấy tờ để xác minh hồ sơ."
          : "Vui lòng đăng nhập để bổ sung hồ sơ xác minh.",
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
      qualificationSummary: values.qualificationSummary.trim(),
      biography: values.biography?.trim(),
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
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.16em] text-indigo-600">Đồng hành cùng Edunity</p>
          <h1 className="max-w-[520px] text-4xl font-black leading-tight tracking-tight text-slate-900 lg:text-[46px]">
            Chia sẻ kiến thức, truyền cảm hứng
          </h1>
          <p className="mt-5 max-w-[510px] text-base leading-7 text-slate-600">
            Trở thành giáo viên Edunity để kết nối với học viên và xây dựng hành trình giảng dạy của riêng bạn.
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
            <p className="mb-3 text-sm font-semibold tracking-wide text-indigo-600">Bước 1/2 · Thông tin giáo viên</p>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Đăng ký giáo viên</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Tạo hồ sơ giảng dạy và bắt đầu chia sẻ chuyên môn của bạn.</p>
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
            <Form.Item label="Tóm tắt chuyên môn" name="qualificationSummary" rules={[{ required: true, whitespace: true, message: "Vui lòng nhập tóm tắt chuyên môn." }]}>
              <Input placeholder="Ví dụ: Cử nhân Sư phạm Toán" size="large" />
            </Form.Item>
            <Form.Item label="Giới thiệu bản thân" name="biography">
              <Input.TextArea placeholder="Chia sẻ ngắn gọn về kinh nghiệm giảng dạy của bạn" rows={3} />
            </Form.Item>
            <Form.Item name="agreement" valuePropName="checked" rules={[{ validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error("Vui lòng đồng ý với điều khoản.")) }]}>
              <Checkbox><span className="text-xs leading-5 text-slate-600">Tôi đồng ý với điều khoản đăng ký giáo viên của Edunity.</span></Checkbox>
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={registerMutation.isPending} disabled={registerMutation.isPending} block size="large" className="h-12 rounded-lg bg-indigo-600 font-bold shadow-sm shadow-indigo-200 hover:bg-indigo-700">Tiếp tục</Button>
          </Form>

          <p className="mt-6 text-center text-sm text-slate-500">Bạn là học viên? <Link to={ROUTES.AUTH.REGISTER} className="font-bold text-indigo-600 hover:text-indigo-700">Đăng ký tài khoản học viên</Link></p>
        </section>
      </div>
    </main>
  );
}
