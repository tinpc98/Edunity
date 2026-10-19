import { App as AntdApp, Alert, Button, Form, Input, Skeleton, Upload } from "antd";
import type { UploadFile } from "antd";
import { FileTextOutlined, IdcardOutlined, InboxOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { teacherVerificationService } from "../../services/teacherVerification.service";
import { useAuthStore } from "../../stores/auth.store";
import { useTeacherRegistrationStore } from "../../stores/teacherRegistration.store";
import { ROUTES } from "../../routes/routePaths";
import type { SubmitVerificationRequest } from "../../types/teacherVerification";
import { getFriendlyErrorMessage } from "../../utils/apiErrorMap";
import { PRIVATE_DOCUMENT_ACCEPT, validatePrivateDocument } from "../../utils/fileValidation";

interface QualificationFormValues {
  qualificationSummary: string;
  biography?: string;
  identityFront: UploadFile[];
  identityBack?: UploadFile[];
  qualificationFiles: UploadFile[];
}

const normFileList = (event: { fileList?: UploadFile[] } | UploadFile[]) =>
  Array.isArray(event) ? event : event?.fileList ?? [];

const fileOf = (item: UploadFile): File => item.originFileObj as File;

export default function TeacherQualificationPage() {
  const [form] = Form.useForm<QualificationFormValues>();
  const { notification } = AntdApp.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuthStore();
  const draft = useTeacherRegistrationStore((state) => state.draft);
  const clearDraft = useTeacherRegistrationStore((state) => state.clearDraft);

  const isTeacher = isAuthenticated && user?.role === "TEACHER";

  const { data: verification, isLoading, isError, refetch } = useQuery({
    queryKey: ["teacherVerification", user?.userId],
    queryFn: () => teacherVerificationService.getMyVerification(),
    enabled: isTeacher,
  });

  const submitMutation = useMutation({
    mutationFn: async (values: QualificationFormValues) => {
      const upload = async (purpose: "IDENTITY" | "QUALIFICATION", item: UploadFile, label: string) => {
        try {
          return await teacherVerificationService.uploadPrivateFile(purpose, fileOf(item));
        } catch (err) {
          throw new Error(`Tải ${label} thất bại: ${getFriendlyErrorMessage(err)}`);
        }
      };

      const front = await upload("IDENTITY", values.identityFront[0], "giấy tờ định danh mặt trước");
      const backItem = values.identityBack?.[0];
      const back = backItem ? await upload("IDENTITY", backItem, "giấy tờ định danh mặt sau") : null;

      const qualifications = [];
      for (const [index, item] of values.qualificationFiles.entries()) {
        qualifications.push(await upload("QUALIFICATION", item, `bằng cấp #${index + 1} (${item.name})`));
      }

      const payload: SubmitVerificationRequest = {
        documents: [
          {
            documentType: "IDENTITY",
            files: back
              ? [
                  { storageKey: front.storageKey, side: "FRONT", mimeType: front.mimeType },
                  { storageKey: back.storageKey, side: "BACK", mimeType: back.mimeType },
                ]
              : [{ storageKey: front.storageKey, side: "SINGLE", mimeType: front.mimeType }],
          },
          {
            documentType: "QUALIFICATION",
            files: qualifications.map((q) => ({ storageKey: q.storageKey, side: "SINGLE" as const, mimeType: q.mimeType })),
          },
        ],
        qualificationSummary: values.qualificationSummary.trim(),
        biography: values.biography?.trim() || undefined,
      };
      return teacherVerificationService.submitVerification(payload);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["teacherVerification", user?.userId], data);
      clearDraft();
      notification.success({
        title: "Hồ sơ đã được gửi",
        description: "Edunity đã nhận hồ sơ chuyên môn của bạn và sẽ tiến hành xét duyệt.",
        placement: "topRight",
      });
      navigate(ROUTES.AUTH.TEACHER_PENDING, { replace: true });
    },
    onError: (error: unknown) => {
      notification.error({
        title: "Không thể gửi hồ sơ",
        description: getFriendlyErrorMessage(error, "Đã có lỗi xảy ra. Vui lòng thử lại."),
        placement: "topRight",
      });
    },
  });

  const beforeUpload = (file: File) => {
    const error = validatePrivateDocument(file);
    if (error) {
      notification.error({ title: "Tệp không hợp lệ", description: error, placement: "topRight" });
      return Upload.LIST_IGNORE;
    }
    return false; // keep the file locally; it is uploaded on submit
  };

  if (!isTeacher) {
    return (
      <main className="site-container flex min-h-[calc(100vh-72px)] items-center justify-center py-14">
        <section className="w-full max-w-[560px] rounded-2xl border border-slate-100 bg-white p-9 text-center shadow-[0_18px_50px_rgba(79,70,229,0.10)]">
          <FileTextOutlined className="text-4xl text-indigo-600" />
          <h1 className="mt-4 text-2xl font-extrabold text-slate-900">Bổ sung hồ sơ giáo viên</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {isAuthenticated
              ? "Chỉ tài khoản giáo viên mới có thể gửi hồ sơ xác minh chuyên môn."
              : "Vui lòng đăng nhập bằng tài khoản giáo viên, hoặc tạo tài khoản mới trước khi bổ sung hồ sơ chuyên môn."}
          </p>
          {!isAuthenticated && (
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to={`${ROUTES.AUTH.LOGIN}?redirect=${encodeURIComponent(ROUTES.AUTH.TEACHER_QUALIFICATION)}`}>
                <Button type="primary" className="bg-indigo-600">Đăng nhập</Button>
              </Link>
              <Link to={ROUTES.AUTH.TEACHER_REGISTER}><Button>Đăng ký giáo viên</Button></Link>
            </div>
          )}
        </section>
      </main>
    );
  }

  if (verification && (verification.verificationStatus === "PENDING" || verification.verificationStatus === "VERIFIED")) {
    return <Navigate to={ROUTES.AUTH.TEACHER_PENDING} replace />;
  }

  return (
    <main className="site-container flex min-h-[calc(100vh-72px)] items-center py-14">
      <section className="mx-auto w-full max-w-[720px] rounded-2xl border border-slate-100 bg-white p-7 shadow-[0_18px_50px_rgba(79,70,229,0.10)] lg:p-9">
        <div className="mb-7">
          <p className="mb-3 text-sm font-semibold tracking-wide text-indigo-600">Bước 2/2 · Hồ sơ chuyên môn</p>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Hoàn thiện hồ sơ chuyên môn</h1>
          <p className="mt-2 max-w-[600px] text-sm leading-6 text-slate-500">Cung cấp giấy tờ định danh và bằng cấp để Edunity xác minh hồ sơ giáo viên của bạn. Tài liệu được lưu trữ riêng tư, chỉ Ban quản trị xem được.</p>
        </div>

        {isLoading ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : isError ? (
          <Alert
            type="error"
            showIcon
            message="Không tải được trạng thái xác minh"
            description="Vui lòng thử lại sau ít phút."
            action={<Button size="small" onClick={() => refetch()}>Thử lại</Button>}
          />
        ) : (
          <>
            {verification?.verificationStatus === "REJECTED" && (
              <Alert
                type="warning"
                showIcon
                className="mb-6"
                message="Hồ sơ trước đó chưa được duyệt"
                description={verification.reviewNote ? `Lý do: ${verification.reviewNote}. Vui lòng bổ sung và gửi lại.` : "Vui lòng bổ sung và gửi lại hồ sơ."}
              />
            )}

            <Form
              form={form}
              layout="vertical"
              requiredMark
              onFinish={(values) => submitMutation.mutate(values)}
              scrollToFirstError
              initialValues={{
                qualificationSummary: verification?.qualificationSummary || draft?.qualificationSummary,
                biography: verification?.biography || draft?.biography,
              }}
            >
              <Form.Item label="Tóm tắt chuyên môn" name="qualificationSummary" rules={[{ required: true, whitespace: true, message: "Vui lòng nhập tóm tắt chuyên môn." }]}>
                <Input placeholder="Ví dụ: Cử nhân Sư phạm Toán - ĐH Sư phạm Hà Nội, 5 năm kinh nghiệm" size="large" />
              </Form.Item>
              <Form.Item label="Giới thiệu bản thân" name="biography">
                <Input.TextArea placeholder="Chia sẻ ngắn gọn về kinh nghiệm giảng dạy của bạn" rows={3} />
              </Form.Item>

              <div className="grid gap-4 md:grid-cols-2">
                <Form.Item
                  label={<span><IdcardOutlined className="mr-1.5 text-indigo-600" />CCCD / Hộ chiếu (mặt trước)</span>}
                  name="identityFront"
                  valuePropName="fileList"
                  getValueFromEvent={normFileList}
                  rules={[{ required: true, message: "Vui lòng tải lên giấy tờ định danh." }]}
                >
                  <Upload accept={PRIVATE_DOCUMENT_ACCEPT} beforeUpload={beforeUpload} maxCount={1} listType="text">
                    <Button icon={<InboxOutlined />} block>Chọn tệp mặt trước</Button>
                  </Upload>
                </Form.Item>
                <Form.Item
                  label="CCCD (mặt sau)"
                  name="identityBack"
                  valuePropName="fileList"
                  getValueFromEvent={normFileList}
                  extra="Không bắt buộc nếu dùng hộ chiếu."
                >
                  <Upload accept={PRIVATE_DOCUMENT_ACCEPT} beforeUpload={beforeUpload} maxCount={1} listType="text">
                    <Button icon={<InboxOutlined />} block>Chọn tệp mặt sau</Button>
                  </Upload>
                </Form.Item>
              </div>

              <Form.Item
                label={<span><SafetyCertificateOutlined className="mr-1.5 text-indigo-600" />Bằng cấp / chứng chỉ chuyên môn</span>}
                name="qualificationFiles"
                valuePropName="fileList"
                getValueFromEvent={normFileList}
                rules={[{ required: true, message: "Vui lòng tải lên ít nhất một bằng cấp hoặc chứng chỉ." }]}
                extra="Hỗ trợ PDF, JPG, PNG, WebP (tối đa 10MB/tệp, tối đa 5 tệp)."
              >
                <Upload.Dragger accept={PRIVATE_DOCUMENT_ACCEPT} beforeUpload={beforeUpload} multiple maxCount={5} listType="text">
                  <p className="ant-upload-drag-icon"><InboxOutlined className="text-indigo-600" /></p>
                  <p className="ant-upload-text">Chọn hoặc kéo tài liệu vào đây</p>
                  <p className="ant-upload-hint">Bằng tốt nghiệp, chứng chỉ sư phạm, IELTS...</p>
                </Upload.Dragger>
              </Form.Item>

              <Button type="primary" htmlType="submit" loading={submitMutation.isPending} block size="large" className="h-12 rounded-lg bg-indigo-600 font-bold shadow-sm shadow-indigo-200 hover:bg-indigo-700">
                {submitMutation.isPending ? "Đang tải tài liệu & gửi hồ sơ..." : "Gửi hồ sơ xác minh"}
              </Button>
              <p className="mt-4 text-center text-xs text-slate-400">
                Bạn có thể bổ sung sau tại <Link to={ROUTES.TEACHER.PROFILE} className="font-semibold text-indigo-600">Hồ sơ giáo viên</Link>.
              </p>
            </Form>
          </>
        )}
      </section>
    </main>
  );
}
