import type { ReactNode } from "react";
import { App as AntdApp, Alert, Button, Checkbox, Form, Input, InputNumber, Select, Skeleton, Upload } from "antd";
import type { UploadFile } from "antd";
import { DeleteOutlined, FileTextOutlined, IdcardOutlined, InboxOutlined, PlusOutlined, SafetyCertificateOutlined, UserOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { catalogKeys, catalogService } from "../../services/catalog.service";
import { teacherVerificationService } from "../../services/teacherVerification.service";
import { profileService } from "../../services/profile.service";
import { useAuthStore } from "../../stores/auth.store";
import { useTeacherRegistrationStore } from "../../stores/teacherRegistration.store";
import { ROUTES } from "../../routes/routePaths";
import { TEACHER_DEGREE_LABELS, type SubmitVerificationRequest, type TeacherDegree } from "../../types/teacherVerification";
import { GRADE_LEVEL_LABELS, SUPPORTED_GRADE_LEVELS, type GradeLevel } from "../../types/catalog";
import { getFriendlyErrorMessage } from "../../utils/apiErrorMap";
import { AVATAR_ACCEPT, PRIVATE_DOCUMENT_ACCEPT, validateAvatar, validatePrivateDocument } from "../../utils/fileValidation";
import { invalidateTeacherVerificationState } from "../../hooks/useTeacherVerification";
import IdentityFields from "../../components/verification/IdentityFields";
import { toIdentityPayload, type IdentityFormValues } from "../../utils/identityPayload";

interface CertificateValues {
  name: string;
  year?: number | null;
  file?: UploadFile[];
}

interface QualificationFormValues {
  avatar?: UploadFile[];
  identity: IdentityFormValues;
  identityFront: UploadFile[];
  identityBack: UploadFile[];
  degreeFile: UploadFile[];
  fullName: string;
  qualificationSummary: string;
  biography?: string;
  degree: TeacherDegree;
  major?: string;
  school?: string;
  certificates?: CertificateValues[];
  achievements?: string;
  subjects?: string[];
  otherSubjects?: string;
  gradeLevels: GradeLevel[];
  studentNote?: string;
  yearsOfExperience: number;
}

const normFileList = (event: { fileList?: UploadFile[] } | UploadFile[]) =>
  Array.isArray(event) ? event : event?.fileList ?? [];

const fileOf = (item: UploadFile): File => item.originFileObj as File;

const splitOtherSubjects = (text?: string) =>
  (text ?? "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);

function Section({ index, title, hint, children }: { index: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="flex items-center gap-3 text-lg font-extrabold text-slate-900">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">{index}</span>
        {title}
      </h2>
      {hint && <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function TeacherQualificationPage() {
  const [form] = Form.useForm<QualificationFormValues>();
  const identityFrontList = Form.useWatch("identityFront", form);
  const { notification } = AntdApp.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuthStore();
  const draft = useTeacherRegistrationStore((state) => state.draft);
  const setDraft = useTeacherRegistrationStore((state) => state.setDraft);
  const clearDraft = useTeacherRegistrationStore((state) => state.clearDraft);
  const registrationDraft = draft?.userId === user?.userId ? draft : null;

  const isTeacher = isAuthenticated && user?.role === "TEACHER";

  const { data: verification, isLoading, isError, refetch } = useQuery({
    queryKey: ["teacherVerification", user?.userId],
    queryFn: () => teacherVerificationService.getMyVerification(),
    enabled: isTeacher,
  });

  // The same subject (e.g. Toán) exists under several categories: offer each name once
  const { data: subjectOptions = [] } = useQuery({
    queryKey: catalogKeys.teachingSubjects(),
    queryFn: () => catalogService.getTeachingSubjectOptions(),
    enabled: isTeacher,
    staleTime: 10 * 60 * 1000,
  });

  const hasAvatar = Boolean(verification?.avatarUrl || user?.avatarUrl);

  const submitMutation = useMutation({
    mutationFn: async (values: QualificationFormValues) => {
      const avatarItem = values.avatar?.[0];
      if (avatarItem) await profileService.updateAvatar(fileOf(avatarItem));
      const fullName = values.fullName.trim();
      if (fullName !== verification?.fullName) await profileService.updateMyProfile({ fullName });

      const upload = async (purpose: "IDENTITY" | "QUALIFICATION", item: UploadFile, label: string) => {
        try {
          return await teacherVerificationService.uploadPrivateFile(purpose, fileOf(item));
        } catch (err) {
          throw new Error(`Tải ${label} thất bại: ${getFriendlyErrorMessage(err)}`);
        }
      };

      const front = await upload("IDENTITY", values.identityFront[0], "CCCD mặt trước");
      const back = await upload("IDENTITY", values.identityBack[0], "CCCD mặt sau");

      // The degree first, then each certificate's scan: one qualification document, as Admin reviews it
      const qualificationItems = [values.degreeFile[0], ...(values.certificates ?? []).flatMap((c) => c.file ?? [])];
      const qualifications = [];
      for (const [index, item] of qualificationItems.entries()) {
        qualifications.push(await upload("QUALIFICATION", item, index === 0 ? "bằng tốt nghiệp" : `chứng chỉ (${item.name})`));
      }

      const payload: SubmitVerificationRequest = {
        documents: [
          {
            documentType: "IDENTITY",
            files: [
              { storageKey: front.storageKey, side: "FRONT", mimeType: front.mimeType },
              { storageKey: back.storageKey, side: "BACK", mimeType: back.mimeType },
            ],
          },
          {
            documentType: "QUALIFICATION",
            files: qualifications.map((q) => ({ storageKey: q.storageKey, side: "SINGLE" as const, mimeType: q.mimeType })),
          },
        ],
        identity: toIdentityPayload(values.identity),
        teachingProfile: {
          degree: values.degree,
          major: values.major?.trim() || null,
          school: values.school?.trim() || null,
          certificates: (values.certificates ?? []).map((c) => ({ name: c.name.trim(), year: c.year ?? null })),
          achievements: values.achievements?.trim() || null,
          subjects: [...(values.subjects ?? []), ...splitOtherSubjects(values.otherSubjects)],
          gradeLevels: values.gradeLevels,
          studentNote: values.studentNote?.trim(),
          yearsOfExperience: values.yearsOfExperience,
        },
        qualificationSummary: values.qualificationSummary.trim(),
        biography: values.biography?.trim() || undefined,
      };
      return teacherVerificationService.submitVerification(payload);
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(["teacherVerification", user?.userId], data);
      await invalidateTeacherVerificationState(queryClient, user?.userId);
      clearDraft();
      notification.success({
        title: "Hồ sơ đã được gửi",
        description: "Edunity đã nhận hồ sơ giảng dạy của bạn và sẽ tiến hành xét duyệt.",
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

  const saveDraftMutation = useMutation({
    mutationFn: (values: { qualificationSummary: string; biography: string }) =>
      profileService.updateMyProfile(values),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["teacherVerification", user?.userId] }),
        queryClient.invalidateQueries({ queryKey: ["teacherProfile", user?.userId] }),
      ]);
      notification.success({
        title: "Đã lưu thông tin nháp",
        description: "Dòng giới thiệu và phần giới thiệu chi tiết đã được lưu vào hồ sơ tài khoản.",
        placement: "topRight",
      });
    },
    onError: (error: unknown) => {
      notification.error({
        title: "Không thể lưu thông tin nháp",
        description: getFriendlyErrorMessage(error, "Vui lòng thử lại."),
        placement: "topRight",
      });
    },
  });

  const saveTextDraft = () => {
    const values = form.getFieldsValue(["qualificationSummary", "biography"]);
    saveDraftMutation.mutate({
      qualificationSummary: values.qualificationSummary?.trim() || "",
      biography: values.biography?.trim() || "",
    });
  };

  const rejectInvalid = (error: string | null) => {
    if (!error) return false; // keep the file locally; it is uploaded on submit
    notification.error({ title: "Tệp không hợp lệ", description: error, placement: "topRight" });
    return Upload.LIST_IGNORE;
  };
  const beforeDocumentUpload = (file: File) => rejectInvalid(validatePrivateDocument(file));
  const beforeAvatarUpload = (file: File) => rejectInvalid(validateAvatar(file));

  if (!isTeacher) {
    return (
      <main className="site-container flex min-h-[calc(100vh-72px)] items-center justify-center py-14">
        <section className="w-full max-w-[560px] rounded-2xl border border-slate-100 bg-white p-9 text-center shadow-[0_18px_50px_rgba(79,70,229,0.10)]">
          <FileTextOutlined className="text-4xl text-indigo-600" />
          <h1 className="mt-4 text-2xl font-extrabold text-slate-900">Hồ sơ giảng dạy</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {isAuthenticated
              ? "Chỉ tài khoản giáo viên mới có thể gửi hồ sơ giảng dạy."
              : "Vui lòng đăng nhập bằng tài khoản giáo viên, hoặc tạo tài khoản mới trước khi điền hồ sơ giảng dạy."}
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

  // Step 2 onboarding is strictly for first-time UNVERIFIED submissions; REJECTED resubmissions happen on /teacher/profile
  if (verification?.verificationStatus === "REJECTED") {
    return <Navigate to={ROUTES.TEACHER.PROFILE} replace />;
  }

  return (
    <main className="site-container py-10 sm:py-14">
      <div className="mx-auto w-full max-w-[820px]">
        <div className="mb-6">
          <p className="mb-3 text-sm font-semibold tracking-wide text-indigo-600">Bước 2/2 · Hồ sơ giảng dạy</p>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Hồ sơ giảng dạy</h1>
          <p className="mt-2 max-w-[640px] text-sm leading-6 text-slate-500">
            Edunity xét duyệt hồ sơ này trước khi mở quyền tạo lớp. Ảnh CCCD và bằng cấp được lưu riêng tư, chỉ Ban quản trị xem được.
          </p>
        </div>

        {isLoading ? (
          <Skeleton active paragraph={{ rows: 12 }} />
        ) : isError ? (
          <Alert
            type="error"
            showIcon
            title="Không tải được trạng thái xác minh"
            description="Vui lòng thử lại sau ít phút."
            action={<Button size="small" onClick={() => refetch()}>Thử lại</Button>}
          />
        ) : (
          <Form
            form={form}
            layout="vertical"
            requiredMark
            onFinish={(values) => submitMutation.mutate(values)}
            onValuesChange={(_, values: Partial<QualificationFormValues>) => {
              if (!user?.userId) return;
              setDraft({
                userId: user.userId,
                fullName: user.fullName,
                email: user.email,
                qualificationSummary: values.qualificationSummary ?? registrationDraft?.qualificationSummary ?? "",
                biography: values.biography ?? registrationDraft?.biography,
              });
            }}
            scrollToFirstError
            initialValues={{
              fullName: verification?.fullName || user?.fullName,
              qualificationSummary: verification?.qualificationSummary || registrationDraft?.qualificationSummary,
              biography: verification?.biography || registrationDraft?.biography,
              certificates: [],
            }}
            className="flex flex-col gap-5"
          >
            <Section index={1} title="Ảnh đại diện & giấy tờ xác thực" hint="Ảnh đại diện hiển thị công khai trên trang giáo viên. CCCD và bằng cấp chỉ Ban quản trị xem.">
              <Form.Item
                label={<span><UserOutlined className="mr-1.5 text-indigo-600" />Ảnh đại diện</span>}
                name="avatar"
                valuePropName="fileList"
                getValueFromEvent={normFileList}
                rules={hasAvatar ? [] : [{ required: true, message: "Vui lòng chọn ảnh đại diện." }]}
                extra={hasAvatar ? "Bạn đã có ảnh đại diện. Chọn ảnh mới nếu muốn thay." : "Ảnh chân dung rõ mặt. JPG, PNG hoặc WebP, tối đa 5MB."}
              >
                <Upload accept={AVATAR_ACCEPT} beforeUpload={beforeAvatarUpload} maxCount={1} listType="picture">
                  <Button icon={<InboxOutlined />}>Chọn ảnh</Button>
                </Upload>
              </Form.Item>

              <IdentityFields frontImage={identityFrontList?.[0]?.originFileObj ?? null} />

              <div className="grid gap-4 md:grid-cols-2">
                <Form.Item
                  label={<span><IdcardOutlined className="mr-1.5 text-indigo-600" />CCCD mặt trước</span>}
                  name="identityFront"
                  valuePropName="fileList"
                  getValueFromEvent={normFileList}
                  rules={[{ required: true, message: "Vui lòng tải lên mặt trước CCCD." }]}
                >
                  <Upload accept={PRIVATE_DOCUMENT_ACCEPT} beforeUpload={beforeDocumentUpload} maxCount={1} listType="text">
                    <Button icon={<InboxOutlined />} block>Chọn ảnh mặt trước</Button>
                  </Upload>
                </Form.Item>
                <Form.Item
                  label="CCCD mặt sau"
                  name="identityBack"
                  valuePropName="fileList"
                  getValueFromEvent={normFileList}
                  rules={[{ required: true, message: "Vui lòng tải lên mặt sau CCCD." }]}
                >
                  <Upload accept={PRIVATE_DOCUMENT_ACCEPT} beforeUpload={beforeDocumentUpload} maxCount={1} listType="text">
                    <Button icon={<InboxOutlined />} block>Chọn ảnh mặt sau</Button>
                  </Upload>
                </Form.Item>
              </div>

              <Form.Item
                label={<span><SafetyCertificateOutlined className="mr-1.5 text-indigo-600" />Bằng tốt nghiệp / Thẻ sinh viên</span>}
                name="degreeFile"
                valuePropName="fileList"
                getValueFromEvent={normFileList}
                rules={[{ required: true, message: "Vui lòng tải lên bằng tốt nghiệp hoặc thẻ sinh viên." }]}
                extra="PDF, JPG, PNG hoặc WebP, tối đa 10MB."
                className="mb-0"
              >
                <Upload.Dragger accept={PRIVATE_DOCUMENT_ACCEPT} beforeUpload={beforeDocumentUpload} maxCount={1} listType="text">
                  <p className="ant-upload-drag-icon"><InboxOutlined className="text-indigo-600" /></p>
                  <p className="ant-upload-text">Chọn hoặc kéo tệp vào đây</p>
                </Upload.Dragger>
              </Form.Item>
            </Section>

            <Section index={2} title="Tên hiển thị & Giới thiệu">
              <div className="grid gap-4 md:grid-cols-2">
                <Form.Item label="Tên hiển thị trên website" name="fullName" rules={[{ required: true, whitespace: true, message: "Vui lòng nhập tên hiển thị." }, { max: 100, message: "Tối đa 100 ký tự." }]}>
                  <Input size="large" />
                </Form.Item>
                <Form.Item label="Dòng giới thiệu ngắn (chuyên môn)" name="qualificationSummary" rules={[{ required: true, whitespace: true, message: "Vui lòng nhập dòng giới thiệu ngắn." }]}>
                  <Input placeholder="VD: Luyện thi Toán THPT, 5 năm kinh nghiệm" size="large" />
                </Form.Item>
              </div>
              <Form.Item label="Giới thiệu chi tiết & phương pháp giảng dạy" name="biography" className="mb-0">
                <Input.TextArea placeholder="Giới thiệu bản thân, cách dạy, thế mạnh với từng nhóm học sinh..." rows={4} maxLength={5000} />
              </Form.Item>
            </Section>

            <Section index={3} title="Trình độ học vấn & Môn học tiếp nhận">
              <div className="grid gap-4 md:grid-cols-3">
                <Form.Item label="Học vị" name="degree" rules={[{ required: true, message: "Vui lòng chọn học vị." }]}>
                  <Select
                    size="large"
                    placeholder="Chọn học vị"
                    options={Object.entries(TEACHER_DEGREE_LABELS).map(([value, label]) => ({ value, label }))}
                  />
                </Form.Item>
                <Form.Item label="Chuyên ngành" name="major" rules={[{ max: 150, message: "Tối đa 150 ký tự." }]}>
                  <Input size="large" placeholder="VD: Sư phạm Toán" />
                </Form.Item>
                <Form.Item label="Trường đào tạo" name="school" rules={[{ max: 150, message: "Tối đa 150 ký tự." }]}>
                  <Input size="large" placeholder="VD: ĐH Sư phạm Hà Nội" />
                </Form.Item>
              </div>

              <Form.Item label="Chứng chỉ nổi bật (không bắt buộc)" className="mb-4">
                <Form.List name="certificates">
                  {(fields, { add, remove }) => (
                    <div className="flex flex-col gap-3">
                      {fields.map(({ key, name }) => (
                        <div key={key} className="rounded-xl border border-slate-200 p-3">
                          <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto]">
                            <Form.Item name={[name, "name"]} rules={[{ required: true, whitespace: true, message: "Nhập tên chứng chỉ." }, { max: 150, message: "Tối đa 150 ký tự." }]} className="mb-0">
                              <Input placeholder="Tên chứng chỉ (VD: IELTS 7.5)" aria-label="Tên chứng chỉ" />
                            </Form.Item>
                            <Form.Item name={[name, "year"]} className="mb-0">
                              <InputNumber min={1950} max={new Date().getFullYear()} placeholder="Năm" className="w-full" aria-label="Năm cấp" />
                            </Form.Item>
                            <Button icon={<DeleteOutlined />} onClick={() => remove(name)} aria-label="Xóa chứng chỉ" />
                          </div>
                          <Form.Item name={[name, "file"]} valuePropName="fileList" getValueFromEvent={normFileList} className="mb-0 mt-3">
                            <Upload accept={PRIVATE_DOCUMENT_ACCEPT} beforeUpload={beforeDocumentUpload} maxCount={1} listType="text">
                              <Button size="small" icon={<InboxOutlined />}>Tải ảnh chứng chỉ</Button>
                            </Upload>
                          </Form.Item>
                        </div>
                      ))}
                      {fields.length < 10 && (
                        <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ name: "" })} className="self-start">
                          Thêm chứng chỉ
                        </Button>
                      )}
                    </div>
                  )}
                </Form.List>
              </Form.Item>

              <Form.Item label="Thành tích giảng dạy nổi bật (không bắt buộc)" name="achievements" rules={[{ max: 2000, message: "Tối đa 2000 ký tự." }]}>
                <Input.TextArea rows={3} placeholder="VD: 15 học sinh đạt IELTS 7.0+ năm 2025, 100% học sinh lớp 9 đỗ vào trường chuyên..." />
              </Form.Item>

              <Form.Item
                label="Môn học tiếp nhận giảng dạy"
                name="subjects"
                dependencies={["otherSubjects"]}
                rules={[
                  ({ getFieldValue }) => ({
                    validator: (_, value?: string[]) =>
                      (value?.length ?? 0) + splitOtherSubjects(getFieldValue("otherSubjects")).length > 0
                        ? Promise.resolve()
                        : Promise.reject(new Error("Chọn ít nhất một môn, hoặc nhập môn khác bên dưới.")),
                  }),
                ]}
                required
                className="mb-3"
              >
                <Checkbox.Group className="grid w-full grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3 md:grid-cols-4">
                  {subjectOptions.map(({ value, label }) => (
                    <Checkbox key={value} value={value}>{label}</Checkbox>
                  ))}
                </Checkbox.Group>
              </Form.Item>
              <Form.Item name="otherSubjects" className="mb-0">
                <Input placeholder="Môn khác (nếu không có trong danh sách), cách nhau bằng dấu phẩy" aria-label="Môn khác" />
              </Form.Item>
            </Section>

            <Section index={4} title="Cấp học & Đối tượng nhận dạy">
              <Form.Item label="Cấp học bạn nhận dạy" name="gradeLevels" rules={[{ required: true, message: "Chọn ít nhất một cấp học." }]}>
                <Checkbox.Group className="flex flex-wrap gap-2">
                  {SUPPORTED_GRADE_LEVELS.map((grade) => (
                    <Checkbox key={grade} value={grade} className="rounded-full border border-slate-200 px-3 py-1">
                      {GRADE_LEVEL_LABELS[grade]}
                    </Checkbox>
                  ))}
                </Checkbox.Group>
              </Form.Item>
              <Form.Item label="Đối tượng học sinh phù hợp" name="studentNote" rules={[{ required: true, whitespace: true, message: "Vui lòng mô tả đối tượng học sinh bạn nhận dạy." }, { max: 1000, message: "Tối đa 1000 ký tự." }]}>
                <Input.TextArea rows={3} placeholder="VD: học sinh mất gốc Toán lớp 6–9, học sinh ôn thi chuyên Văn vào 10..." />
              </Form.Item>
              <Form.Item label="Số năm kinh nghiệm giảng dạy" name="yearsOfExperience" rules={[{ required: true, message: "Nhập số năm kinh nghiệm (0 nếu bạn mới bắt đầu)." }]} className="mb-0">
                <InputNumber min={0} max={60} precision={0} size="large" className="w-full sm:w-48" placeholder="0" />
              </Form.Item>
            </Section>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                htmlType="button"
                loading={saveDraftMutation.isPending}
                disabled={submitMutation.isPending}
                onClick={saveTextDraft}
                size="large"
                className="h-12 flex-1 rounded-lg font-semibold"
              >
                Lưu thông tin nháp
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={submitMutation.isPending}
                disabled={saveDraftMutation.isPending}
                size="large"
                className="h-12 flex-1 rounded-lg bg-indigo-600 font-bold shadow-sm shadow-indigo-200 hover:bg-indigo-700"
              >
                {submitMutation.isPending ? "Đang tải tài liệu & gửi hồ sơ..." : "Gửi hồ sơ xét duyệt"}
              </Button>
            </div>
            <p className="text-center text-xs text-slate-400">
              Lưu nháp chỉ giữ dòng giới thiệu và phần giới thiệu chi tiết. Bạn có thể bổ sung sau tại <Link to={ROUTES.TEACHER.PROFILE} className="font-semibold text-indigo-600">Hồ sơ giáo viên</Link>.
            </p>
          </Form>
        )}
      </div>
    </main>
  );
}
