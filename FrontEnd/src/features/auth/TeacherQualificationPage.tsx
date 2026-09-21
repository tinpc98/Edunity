import { App as AntdApp, Button, Form, Input, InputNumber, Upload } from "antd";
import type { UploadFile } from "antd";
import { FileTextOutlined, InboxOutlined } from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { submitTeacherQualification } from "../../services/auth.service";
import { useTeacherRegistrationStore } from "../../stores/teacherRegistration.store";
import { ROUTES } from "../../routes/routePaths";
import type { SubmitQualificationRequest } from "../../types/auth";

interface QualificationFormValues {
  qualificationTitle: string;
  institution: string;
  graduationYear?: number;
  documentFile: UploadFile[];
}

const allowedFileTypes = ["application/pdf", "image/jpeg", "image/png"];

export default function TeacherQualificationPage() {
  const [form] = Form.useForm<QualificationFormValues>();
  const { notification } = AntdApp.useApp();
  const registration = useTeacherRegistrationStore((state) => state.registration);
  const setQualification = useTeacherRegistrationStore((state) => state.setQualification);
  const navigate = useNavigate();

  const qualificationMutation = useMutation({
    mutationFn: (payload: SubmitQualificationRequest) => submitTeacherQualification(payload),
    onSuccess: (data) => {
      setQualification(data.document, data.verificationStatus);
      notification.success({
        title: "Hồ sơ đã được gửi",
        description: "Edunity đã nhận hồ sơ chuyên môn của bạn và sẽ tiến hành xem xét.",
        placement: "topRight",
      });
      navigate(ROUTES.AUTH.TEACHER_PENDING);
    },
    onError: (error: Error) => {
      notification.error({
        title: "Không thể gửi hồ sơ",
        description: error.message || "Đã có lỗi xảy ra. Vui lòng thử lại.",
        placement: "topRight",
      });
    },
  });

  const handleSubmit = (values: QualificationFormValues) => {
    const file = values.documentFile[0];
    if (!registration || !file) return;

    qualificationMutation.mutate({
      teacherId: registration.teacherId,
      qualificationTitle: values.qualificationTitle,
      institution: values.institution,
      graduationYear: values.graduationYear,
      documentFile: { name: file.name, type: file.type || "application/octet-stream" },
    });
  };

  if (!registration) {
    return (
      <main className="site-container flex min-h-[calc(100vh-72px)] items-center justify-center py-14">
        <section className="w-full max-w-[560px] rounded-2xl border border-slate-100 bg-white p-9 text-center shadow-[0_18px_50px_rgba(79,70,229,0.10)]">
          <FileTextOutlined className="text-4xl text-indigo-600" />
          <h1 className="mt-4 text-2xl font-extrabold text-slate-900">Bắt đầu đăng ký giáo viên</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Vui lòng hoàn tất thông tin tài khoản trước khi bổ sung hồ sơ chuyên môn.</p>
          <Link to={ROUTES.AUTH.TEACHER_REGISTER} className="mt-6 inline-block font-bold text-indigo-600 hover:text-indigo-700">Đăng ký giáo viên</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="site-container flex min-h-[calc(100vh-72px)] items-center py-14">
      <section className="mx-auto w-full max-w-[720px] rounded-2xl border border-slate-100 bg-white p-7 shadow-[0_18px_50px_rgba(79,70,229,0.10)] lg:p-9">
        <div className="mb-7">
          <p className="mb-3 text-sm font-semibold tracking-wide text-indigo-600">Bước 2/2 · Hồ sơ chuyên môn</p>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Hoàn thiện hồ sơ chuyên môn</h1>
          <p className="mt-2 max-w-[600px] text-sm leading-6 text-slate-500">Cung cấp thông tin và tài liệu cần thiết để Edunity xác minh hồ sơ giáo viên của bạn.</p>
        </div>

        <Button type="text" onClick={() => navigate(ROUTES.AUTH.TEACHER_REGISTER)} className="mb-4 px-0 font-semibold text-slate-500 hover:text-indigo-600">
          Quay lại
        </Button>

        <Form form={form} layout="vertical" requiredMark onFinish={handleSubmit} scrollToFirstError>
          <div className="grid gap-4 md:grid-cols-2">
            <Form.Item label="Tên bằng cấp / chứng chỉ" name="qualificationTitle" rules={[{ required: true, whitespace: true, message: "Vui lòng nhập tên bằng cấp hoặc chứng chỉ." }]}>
              <Input placeholder="Ví dụ: Cử nhân Sư phạm Toán" size="large" />
            </Form.Item>
            <Form.Item label="Đơn vị đào tạo" name="institution" rules={[{ required: true, whitespace: true, message: "Vui lòng nhập đơn vị đào tạo." }]}>
              <Input placeholder="Ví dụ: Đại học Sư phạm Hà Nội" size="large" />
            </Form.Item>
          </div>
          <Form.Item label="Năm tốt nghiệp" name="graduationYear" rules={[{ type: "number", min: 1900, max: new Date().getFullYear(), message: "Vui lòng nhập năm tốt nghiệp hợp lệ." }]}>
            <InputNumber className="w-full" placeholder="Ví dụ: 2020" size="large" />
          </Form.Item>
          <Form.Item
            label="Tài liệu chứng minh chuyên môn"
            name="documentFile"
            valuePropName="fileList"
            getValueFromEvent={(event) => event?.fileList}
            rules={[{ required: true, message: "Vui lòng chọn tài liệu." }]}
            extra="Mock frontend: file chưa được upload lên server. Hỗ trợ PDF, JPG, JPEG, PNG."
          >
            <Upload.Dragger
              accept=".pdf,.jpg,.jpeg,.png"
              beforeUpload={(file) => {
                if (!allowedFileTypes.includes(file.type)) {
                  notification.error({ title: "Tệp không hợp lệ", description: "Vui lòng chọn PDF, JPG, JPEG hoặc PNG.", placement: "topRight" });
                  return Upload.LIST_IGNORE;
                }
                return false;
              }}
              maxCount={1}
              listType="text"
            >
              <p className="ant-upload-drag-icon"><InboxOutlined className="text-indigo-600" /></p>
              <p className="ant-upload-text">Chọn hoặc kéo tài liệu vào đây</p>
              <p className="ant-upload-hint">Tài liệu sẽ chỉ được giữ tạm thời trong flow đăng ký này.</p>
            </Upload.Dragger>
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={qualificationMutation.isPending} disabled={qualificationMutation.isPending} block size="large" className="h-12 rounded-lg bg-indigo-600 font-bold shadow-sm shadow-indigo-200 hover:bg-indigo-700">Gửi hồ sơ xác minh</Button>
        </Form>
      </section>
    </main>
  );
}
