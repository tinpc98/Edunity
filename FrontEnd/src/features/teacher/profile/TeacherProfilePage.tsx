import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { App as AntdApp, Avatar, Button, Form, Input, Upload, Skeleton, Alert, Modal, Tag } from "antd";
import {
  CameraOutlined,
  EditOutlined,
  UploadOutlined,
  UserOutlined,
  InboxOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  ClockCircleFilled,
  InfoCircleFilled,
  DeleteOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  FileOutlined,
  StarFilled,
} from "@ant-design/icons";
import type { UploadProps } from "antd";
import { profileService } from "../../../services/profile.service";
import { teacherVerificationService } from "../../../services/teacherVerification.service";
import { useAuthStore } from "../../../stores/auth.store";
import type { TeacherProfile, UpdateTeacherProfilePayload } from "../../../types/profile";
import type { SubmitVerificationRequest } from "../../../types/teacherVerification";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";

const ALLOWED_AVATAR_MIMES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_AVATAR_EXTS = [".jpg", ".jpeg", ".png", ".webp"];
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_DOC_MIMES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const ALLOWED_DOC_EXTS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
const MAX_DOC_SIZE = 10 * 1024 * 1024; // 10 MB

export default function TeacherProfilePage() {
  const { user, updateUser } = useAuthStore();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [form] = Form.useForm();

  // Verification Modal State
  const [isVerificationModalVisible, setIsVerificationModalVisible] = useState(false);
  const [verificationForm] = Form.useForm();
  const [identityFrontFile, setIdentityFrontFile] = useState<File | null>(null);
  const [identityBackFile, setIdentityBackFile] = useState<File | null>(null);
  const [qualificationFiles, setQualificationFiles] = useState<File[]>([]);

  // Password Modal State
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [passwordForm] = Form.useForm();

  const { data: profileData, isPending: isPendingProfile, isError: isErrorProfile, error: errorProfile } = useQuery({
    queryKey: ["teacherProfile", user?.userId],
    queryFn: () => profileService.getMyProfile(),
    enabled: !!user,
  });

  const { data: verificationStatus, isPending: isPendingVerification } = useQuery({
    queryKey: ["teacherVerification", user?.userId],
    queryFn: () => teacherVerificationService.getMyVerification(),
    enabled: !!user,
  });

  const profile = profileData as TeacherProfile;

  // Profile Update Mutation
  const updateProfileMutation = useMutation({
    mutationFn: (payload: UpdateTeacherProfilePayload) => profileService.updateMyProfile(payload),
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(["teacherProfile", user?.userId], updatedProfile);
      queryClient.invalidateQueries({ queryKey: ["teacherProfile"] });
      updateUser({ fullName: updatedProfile.fullName });
      setIsEditing(false);
      message.success("Cập nhật thông tin thành công!");
    },
    onError: (err: any) => {
      message.error(getFriendlyErrorMessage(err, "Có lỗi xảy ra khi cập nhật thông tin. Vui lòng thử lại."));
    },
  });

  // Avatar Update Mutation
  const updateAvatarMutation = useMutation({
    mutationFn: (file: File) => profileService.updateAvatar(file),
    onSuccess: (data) => {
      queryClient.setQueryData(["teacherProfile", user?.userId], (old: TeacherProfile | undefined) => {
        if (!old) return old;
        return { ...old, avatarUrl: data.avatarUrl };
      });
      queryClient.invalidateQueries({ queryKey: ["teacherProfile"] });
      updateUser({ avatarUrl: data.avatarUrl });
      message.success("Cập nhật ảnh đại diện thành công!");
    },
    onError: (err: any) => {
      message.error(getFriendlyErrorMessage(err, "Có lỗi xảy ra khi cập nhật ảnh đại diện."));
    },
  });

  // Verification Submit Mutation
  const submitVerificationMutation = useMutation({
    mutationFn: async (values: { qualificationSummary?: string; biography?: string }) => {
      if (!identityFrontFile) {
        throw new Error("Vui lòng tải lên tài liệu định danh (mặt trước hoặc hộ chiếu).");
      }
      if (qualificationFiles.length === 0) {
        throw new Error("Vui lòng tải lên ít nhất một bằng cấp hoặc chứng chỉ chuyên môn.");
      }

      // 1. Upload Front Identity
      let frontKey: string;
      let frontMime: string;
      try {
        const res = await teacherVerificationService.uploadPrivateFile("IDENTITY", identityFrontFile);
        frontKey = res.storageKey;
        frontMime = res.mimeType;
      } catch (err) {
        throw new Error(`Tải tệp định danh mặt trước thất bại: ${getFriendlyErrorMessage(err)}`);
      }

      // 2. Upload Back Identity (if provided)
      let backKey: string | undefined;
      let backMime: string | undefined;
      if (identityBackFile) {
        try {
          const res = await teacherVerificationService.uploadPrivateFile("IDENTITY", identityBackFile);
          backKey = res.storageKey;
          backMime = res.mimeType;
        } catch (err) {
          throw new Error(`Tải tệp định danh mặt sau thất bại: ${getFriendlyErrorMessage(err)}`);
        }
      }

      // 3. Upload Qualification files
      const qualKeyList: { storageKey: string; mimeType: string }[] = [];
      for (let i = 0; i < qualificationFiles.length; i++) {
        const qFile = qualificationFiles[i];
        try {
          const res = await teacherVerificationService.uploadPrivateFile("QUALIFICATION", qFile);
          qualKeyList.push({ storageKey: res.storageKey, mimeType: res.mimeType });
        } catch (err) {
          throw new Error(`Tải chứng chỉ #${i + 1} (${qFile.name}) thất bại: ${getFriendlyErrorMessage(err)}`);
        }
      }

      // 4. Construct verification request payload
      const identityFilesList = backKey
        ? [
            { storageKey: frontKey, side: "FRONT" as const, mimeType: frontMime },
            { storageKey: backKey, side: "BACK" as const, mimeType: backMime },
          ]
        : [{ storageKey: frontKey, side: "SINGLE" as const, mimeType: frontMime }];

      const payload: SubmitVerificationRequest = {
        documents: [
          {
            documentType: "IDENTITY",
            files: identityFilesList,
          },
          {
            documentType: "QUALIFICATION",
            files: qualKeyList.map((k) => ({ storageKey: k.storageKey, side: "SINGLE" as const, mimeType: k.mimeType })),
          },
        ],
        qualificationSummary: values.qualificationSummary?.trim() || undefined,
        biography: values.biography?.trim() || undefined,
      };

      return teacherVerificationService.submitVerification(payload);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["teacherVerification", user?.userId], data);
      queryClient.invalidateQueries({ queryKey: ["teacherVerification"] });
      queryClient.invalidateQueries({ queryKey: ["teacherProfile"] });
      setIsVerificationModalVisible(false);
      setIdentityFrontFile(null);
      setIdentityBackFile(null);
      setQualificationFiles([]);
      verificationForm.resetFields();
      message.success("Đã gửi hồ sơ xác minh thành công! Vui lòng chờ quản trị viên phê duyệt.");
    },
    onError: (err: any) => {
      message.error(getFriendlyErrorMessage(err, "Gửi hồ sơ xác minh thất bại."));
    },
  });

  // Password Change Mutation
  const changePasswordMutation = useMutation({
    mutationFn: (values: any) =>
      profileService.changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword }),
    onSuccess: () => {
      message.success("Đổi mật khẩu thành công!");
      setIsPasswordModalVisible(false);
      passwordForm.resetFields();
    },
    onError: (error: any) => {
      message.error(getFriendlyErrorMessage(error, "Đổi mật khẩu thất bại."));
    },
  });

  useEffect(() => {
    if (profile && isEditing) {
      form.setFieldsValue({
        fullName: profile.fullName,
        biography: profile.biography || "",
        qualificationSummary: profile.qualificationSummary || "",
      });
    }
  }, [profile, isEditing, form]);

  if (!user) return null;

  if (isPendingProfile || isPendingVerification) {
    return (
      <div className="max-w-[1040px] mx-auto space-y-4">
        <Skeleton active avatar paragraph={{ rows: 2 }} />
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  if (isErrorProfile || !profile) {
    return (
      <Alert
        title="Lỗi tải thông tin"
        message={getFriendlyErrorMessage(errorProfile, "Không thể tải thông tin hồ sơ giáo viên")}
        type="error"
        showIcon
      />
    );
  }

  // Pre-validate Avatar
  const avatarUploadProps: UploadProps = {
    accept: ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp",
    beforeUpload: (file) => {
      const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
      const isAllowedType = ALLOWED_AVATAR_MIMES.includes(file.type) || ALLOWED_AVATAR_EXTS.includes(ext);

      if (!isAllowedType) {
        message.error("Định dạng tệp không được hỗ trợ. Chỉ chấp nhận tệp JPG, PNG hoặc WebP.");
        return Upload.LIST_IGNORE;
      }

      if (file.size > MAX_AVATAR_SIZE) {
        message.error("Kích thước tệp quá lớn. Vui lòng chọn ảnh đại diện tối đa 5MB.");
        return Upload.LIST_IGNORE;
      }

      updateAvatarMutation.mutate(file);
      return false;
    },
    showUploadList: false,
  };

  // Pre-validate Private Documents
  const validatePrivateDocFile = (file: File): boolean => {
    const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
    const isAllowed = ALLOWED_DOC_MIMES.includes(file.type) || ALLOWED_DOC_EXTS.includes(ext);
    if (!isAllowed) {
      message.error(`Tệp "${file.name}" không hợp lệ. Chỉ chấp nhận định dạng PDF, JPG, PNG hoặc WebP.`);
      return false;
    }
    if (file.size > MAX_DOC_SIZE) {
      message.error(`Tệp "${file.name}" quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Giới hạn tối đa là 10MB.`);
      return false;
    }
    return true;
  };

  const getFileIcon = (file: File) => {
    const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
    if (file.type === "application/pdf" || ext === ".pdf") {
      return <FilePdfOutlined className="text-rose-500 text-lg" />;
    }
    if (file.type.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
      return <FileImageOutlined className="text-indigo-500 text-lg" />;
    }
    return <FileOutlined className="text-slate-400 text-lg" />;
  };

  const renderVerificationStatus = () => {
    const status = verificationStatus?.verificationStatus || profile.verificationStatus || "UNVERIFIED";

    if (status === "VERIFIED") {
      return (
        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200 flex items-start gap-3">
          <CheckCircleFilled className="text-emerald-500 text-xl mt-0.5" />
          <div className="flex-1">
            <h4 className="text-emerald-800 font-bold m-0 text-base">Hồ sơ đã được xác minh</h4>
            <p className="text-emerald-700 text-sm mt-1 mb-0">
              Hồ sơ của bạn đã được quản trị viên phê duyệt. Bạn có đầy đủ quyền tạo lớp học và bắt đầu giảng dạy trên hệ thống Edunity.
            </p>
          </div>
        </div>
      );
    }

    if (status === "PENDING") {
      return (
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 flex items-start gap-3">
          <ClockCircleFilled className="text-amber-500 text-xl mt-0.5" />
          <div className="flex-1">
            <h4 className="text-amber-800 font-bold m-0 text-base">Hồ sơ đang chờ duyệt</h4>
            <p className="text-amber-700 text-sm mt-1 mb-0">
              Edunity đang xem xét hồ sơ của bạn. Quá trình xét duyệt diễn ra trong 1-3 ngày làm việc. Bạn không cần gửi lại hồ sơ trong thời gian này.
            </p>
          </div>
        </div>
      );
    }

    if (status === "REJECTED") {
      return (
        <div className="bg-rose-50 rounded-xl p-4 border border-rose-200 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <CloseCircleFilled className="text-rose-500 text-xl mt-0.5" />
            <div className="flex-1">
              <h4 className="text-rose-800 font-bold m-0 text-base">Hồ sơ bị từ chối</h4>
              <p className="text-rose-700 text-sm mt-1 mb-0">
                Hồ sơ xác minh của bạn chưa đạt yêu cầu. Vui lòng kiểm tra lại thông tin và giấy tờ đính kèm.
              </p>
              {verificationStatus?.reviewNote && (
                <div className="mt-2.5 p-3 bg-white rounded-lg border border-rose-200 text-rose-800 text-sm font-medium">
                  <strong>Lý do từ chối:</strong> {verificationStatus.reviewNote}
                </div>
              )}
            </div>
          </div>
          <Button
            type="primary"
            danger
            onClick={() => {
              verificationForm.setFieldsValue({
                qualificationSummary: profile.qualificationSummary || "",
                biography: profile.biography || "",
              });
              setIsVerificationModalVisible(true);
            }}
            className="self-start mt-1"
          >
            Cập nhật và nộp lại hồ sơ
          </Button>
        </div>
      );
    }

    return (
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <InfoCircleFilled className="text-indigo-500 text-xl mt-0.5" />
          <div>
            <h4 className="text-slate-800 font-bold m-0 text-base">Chưa xác minh hồ sơ</h4>
            <p className="text-slate-500 text-sm mt-1 mb-0">
              Bạn cần gửi hồ sơ xác minh danh tính và bằng cấp chuyên môn để có thể mở lớp giảng dạy.
            </p>
          </div>
        </div>
        <Button
          type="primary"
          onClick={() => {
            verificationForm.setFieldsValue({
              qualificationSummary: profile.qualificationSummary || "",
              biography: profile.biography || "",
            });
            setIsVerificationModalVisible(true);
          }}
          className="bg-indigo-600 hover:bg-indigo-700 font-semibold shrink-0"
        >
          Nộp hồ sơ xác minh
        </Button>
      </div>
    );
  };

  return (
    <div className="max-w-[1040px] mx-auto space-y-5">
      <div>
        <div className="text-[12px] font-medium text-slate-400 mb-1">
          Tài khoản / <span className="text-indigo-600">Hồ sơ giáo viên</span>
        </div>
        <h1 className="text-[28px] font-bold text-slate-800 leading-tight">Hồ sơ giáo viên</h1>
      </div>

      {/* Verification Status Banner */}
      <div className="bg-white rounded-2xl p-5 sm:px-6 border border-slate-100 shadow-sm flex flex-col gap-4">
        <h3 className="text-[17px] font-bold text-slate-800 m-0">Trạng thái xác minh giảng viên</h3>
        {renderVerificationStatus()}
      </div>

      {/* Profile Header & Avatar Card */}
      <div className="bg-white rounded-2xl p-5 sm:px-6 border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar size={72} src={profile.avatarUrl} icon={<UserOutlined />} className="bg-indigo-600 text-2xl font-bold" />
            <Upload {...avatarUploadProps}>
              <button
                type="button"
                className="absolute bottom-0 right-0 h-7 w-7 bg-white rounded-full border border-slate-200 flex items-center justify-center text-slate-600 hover:text-indigo-600 cursor-pointer shadow-xs"
                title="Thay đổi ảnh đại diện"
              >
                <CameraOutlined className="text-xs" />
              </button>
            </Upload>
          </div>
          <div>
            <h2 className="text-[20px] font-bold text-slate-800 leading-tight mb-1">{profile.fullName}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-slate-500">{profile.email}</span>
              <Tag color="indigo" className="m-0 font-bold text-[11px]">GIÁO VIÊN</Tag>
              {profile.ratingAverage !== undefined && profile.ratingAverage > 0 && (
                <Tag color="warning" icon={<StarFilled className="text-amber-500" />} className="m-0 font-semibold text-[11px]">
                  {profile.ratingAverage.toFixed(1)} ({profile.ratingCount || 0} đánh giá)
                </Tag>
              )}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Chấp nhận JPG, PNG hoặc WebP • Tối đa 5 MB
            </div>
          </div>
        </div>
        <Upload {...avatarUploadProps}>
          <Button icon={<UploadOutlined />} loading={updateAvatarMutation.isPending} className="font-medium">
            Đổi ảnh đại diện
          </Button>
        </Upload>
      </div>

      {/* Professional Information Card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
        <div className="p-5 sm:px-6 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-[17px] font-bold text-slate-800 m-0">Thông tin chuyên môn & Giới thiệu</h3>
          {!isEditing && (
            <div className="flex gap-2">
              <Button onClick={() => setIsPasswordModalVisible(true)}>Đổi mật khẩu</Button>
              <Button icon={<EditOutlined />} type="primary" ghost onClick={() => setIsEditing(true)}>
                Chỉnh sửa
              </Button>
            </div>
          )}
        </div>
        <div className="p-5 sm:px-6">
          {!isEditing ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4 flex flex-col justify-center border border-slate-100">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Họ và tên</div>
                  <div className="text-[15px] font-semibold text-slate-800">{profile.fullName}</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 flex flex-col justify-center border border-slate-100">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Email đăng ký (Cố định)</div>
                  <div className="text-[15px] font-semibold text-slate-800">{profile.email}</div>
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 flex flex-col justify-center border border-slate-100">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Tóm tắt chuyên môn</div>
                <div className="text-[14px] font-medium text-slate-800">{profile.qualificationSummary || "Chưa cập nhật"}</div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 flex flex-col justify-center border border-slate-100">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Tiểu sử & Giới thiệu bản thân</div>
                <div className="text-[14px] font-normal text-slate-700 whitespace-pre-wrap leading-relaxed">{profile.biography || "Chưa cập nhật"}</div>
              </div>
            </div>
          ) : (
            <Form form={form} layout="vertical" onFinish={(values) => updateProfileMutation.mutate(values)}>
              <Form.Item
                label={<span className="font-semibold text-slate-700">Họ và tên</span>}
                name="fullName"
                rules={[
                  { required: true, message: "Họ và tên không được để trống" },
                  { max: 120, message: "Họ và tên tối đa 120 ký tự" },
                ]}
              >
                <Input size="large" placeholder="Nhập họ và tên đầy đủ" />
              </Form.Item>
              <Form.Item
                label={<span className="font-semibold text-slate-700">Tóm tắt chuyên môn</span>}
                name="qualificationSummary"
                rules={[{ max: 2000, message: "Tóm tắt chuyên môn tối đa 2000 ký tự" }]}
              >
                <Input size="large" placeholder="Ví dụ: Thạc sĩ Toán học - Đại học Sư phạm, 8 năm kinh nghiệm giảng dạy" />
              </Form.Item>
              <Form.Item
                label={<span className="font-semibold text-slate-700">Tiểu sử & Giới thiệu bản thân</span>}
                name="biography"
                rules={[{ max: 5000, message: "Tiểu sử tối đa 5000 ký tự" }]}
              >
                <Input.TextArea rows={4} placeholder="Chia sẻ về phương pháp giảng dạy, kinh nghiệm và cam kết với học viên..." />
              </Form.Item>
              <div className="flex justify-end gap-3 pt-2">
                <Button onClick={() => setIsEditing(false)} disabled={updateProfileMutation.isPending}>
                  Hủy
                </Button>
                <Button type="primary" htmlType="submit" loading={updateProfileMutation.isPending} className="bg-indigo-600">
                  Lưu thay đổi
                </Button>
              </div>
            </Form>
          )}
        </div>
      </div>

      {/* Verification Submission Modal */}
      <Modal
        title={<span className="font-bold text-lg text-slate-800">Nộp hồ sơ xác minh giảng viên</span>}
        open={isVerificationModalVisible}
        onCancel={() => !submitVerificationMutation.isPending && setIsVerificationModalVisible(false)}
        footer={null}
        width={680}
        maskClosable={false}
      >
        <Alert
          message="Yêu cầu tài liệu bắt buộc"
          description="Hồ sơ xác minh bao gồm: (1) Giấy tờ định danh cá nhân (CMND/CCCD hoặc Hộ chiếu) và (2) Bằng cấp/Chứng chỉ chuyên môn. Định dạng hỗ trợ: PDF, JPG, PNG, WebP (Tối đa 10MB mỗi tệp)."
          type="info"
          showIcon
          className="mb-5"
        />

        <Form
          form={verificationForm}
          layout="vertical"
          onFinish={(values) => submitVerificationMutation.mutate(values)}
        >
          {/* Section 1: Identity Documents */}
          <div className="mb-5 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <h4 className="font-bold text-slate-800 mb-1 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs">1</span>
              Giấy tờ định danh cá nhân (CMND / CCCD / Hộ chiếu) *
            </h4>
            <p className="text-xs text-slate-500 mb-3">
              Tải lên mặt trước (bắt buộc) và mặt sau (dành cho CCCD).
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Front Side */}
              <div data-testid="upload-id-front" className="border border-slate-200 rounded-lg p-3 bg-white flex flex-col justify-between">
                <div className="text-xs font-semibold text-slate-700 mb-2">Mặt trước (Bắt buộc)</div>
                {identityFrontFile ? (
                  <div className="flex items-center justify-between p-2 rounded bg-indigo-50/50 border border-indigo-100">
                    <div className="flex items-center gap-2 overflow-hidden">
                      {getFileIcon(identityFrontFile)}
                      <div className="overflow-hidden">
                        <div className="text-xs font-medium text-slate-800 truncate" title={identityFrontFile.name}>
                          {identityFrontFile.name}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {(identityFrontFile.size / 1024 / 1024).toFixed(2)} MB
                        </div>
                      </div>
                    </div>
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => setIdentityFrontFile(null)}
                      title="Xóa tệp"
                    />
                  </div>
                ) : (
                  <Upload
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    beforeUpload={(file) => {
                      if (validatePrivateDocFile(file)) setIdentityFrontFile(file);
                      return false;
                    }}
                    showUploadList={false}
                    maxCount={1}
                  >
                    <Button icon={<UploadOutlined />} size="small" className="w-full text-xs">
                      Chọn tệp mặt trước
                    </Button>
                  </Upload>
                )}
              </div>

              {/* Back Side */}
              <div data-testid="upload-id-back" className="border border-slate-200 rounded-lg p-3 bg-white flex flex-col justify-between">
                <div className="text-xs font-semibold text-slate-700 mb-2">Mặt sau (Tùy chọn)</div>
                {identityBackFile ? (
                  <div className="flex items-center justify-between p-2 rounded bg-indigo-50/50 border border-indigo-100">
                    <div className="flex items-center gap-2 overflow-hidden">
                      {getFileIcon(identityBackFile)}
                      <div className="overflow-hidden">
                        <div className="text-xs font-medium text-slate-800 truncate" title={identityBackFile.name}>
                          {identityBackFile.name}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {(identityBackFile.size / 1024 / 1024).toFixed(2)} MB
                        </div>
                      </div>
                    </div>
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => setIdentityBackFile(null)}
                      title="Xóa tệp"
                    />
                  </div>
                ) : (
                  <Upload
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    beforeUpload={(file) => {
                      if (validatePrivateDocFile(file)) setIdentityBackFile(file);
                      return false;
                    }}
                    showUploadList={false}
                    maxCount={1}
                  >
                    <Button icon={<UploadOutlined />} size="small" className="w-full text-xs">
                      Chọn tệp mặt sau
                    </Button>
                  </Upload>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Qualification Documents */}
          <div data-testid="upload-qual" className="mb-5 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <h4 className="font-bold text-slate-800 mb-1 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs">2</span>
              Bằng cấp / Chứng chỉ chuyên môn (Tối đa 3 tệp) *
            </h4>
            <p className="text-xs text-slate-500 mb-3">
              Bằng tốt nghiệp đại học, chứng chỉ sư phạm hoặc chứng chỉ chuyên môn liên quan.
            </p>

            <Upload.Dragger
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              beforeUpload={(file) => {
                if (qualificationFiles.length >= 3) {
                  message.warning("Bạn chỉ có thể tải lên tối đa 3 tài liệu chứng chỉ.");
                  return false;
                }
                if (validatePrivateDocFile(file)) {
                  setQualificationFiles((prev) => {
                    if (prev.some((f) => f.name === file.name && f.size === file.size)) return prev;
                    return [...prev, file];
                  });
                }
                return false;
              }}
              showUploadList={false}
              multiple
              disabled={qualificationFiles.length >= 3}
            >
              <p className="ant-upload-drag-icon !mb-1 text-indigo-500"><InboxOutlined /></p>
              <p className="ant-upload-text text-xs font-semibold text-slate-700">
                Kéo thả hoặc nhấn để chọn tệp bằng cấp (PDF, JPG, PNG, WebP)
              </p>
              <p className="ant-upload-hint text-[11px] text-slate-400">
                Tối đa 3 tệp, dung lượng tối đa 10MB/tệp
              </p>
            </Upload.Dragger>

            {qualificationFiles.length > 0 && (
              <div className="mt-3 space-y-2">
                {qualificationFiles.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-slate-200"
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      {getFileIcon(file)}
                      <div className="overflow-hidden">
                        <div className="text-xs font-semibold text-slate-800 truncate" title={file.name}>
                          {file.name}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </div>
                      </div>
                    </div>
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => setQualificationFiles((prev) => prev.filter((_, i) => i !== idx))}
                      title="Xóa tệp"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 3: Profile details */}
          <Form.Item
            label={<span className="font-semibold text-slate-700">Tóm tắt chuyên môn cập nhật (Tùy chọn)</span>}
            name="qualificationSummary"
            rules={[{ max: 2000, message: "Tối đa 2000 ký tự" }]}
          >
            <Input placeholder="Ví dụ: Giảng viên chuyên ngành CNTT, 5 năm kinh nghiệm" />
          </Form.Item>

          <Form.Item
            label={<span className="font-semibold text-slate-700">Tiểu sử & Cam kết giảng dạy (Tùy chọn)</span>}
            name="biography"
            rules={[{ max: 5000, message: "Tối đa 5000 ký tự" }]}
          >
            <Input.TextArea rows={3} placeholder="Mô tả kinh nghiệm và cam kết chất lượng..." />
          </Form.Item>

          <div className="flex justify-end gap-3 mt-6 pt-3 border-t border-slate-100">
            <Button
              onClick={() => setIsVerificationModalVisible(false)}
              disabled={submitVerificationMutation.isPending}
            >
              Hủy
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={submitVerificationMutation.isPending}
              disabled={!identityFrontFile || qualificationFiles.length === 0}
              className="bg-indigo-600 hover:bg-indigo-700 font-semibold"
            >
              {submitVerificationMutation.isPending ? "Đang tải tệp & gửi hồ sơ..." : "Gửi hồ sơ xác minh"}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        title={<span className="font-bold text-lg text-slate-800">Đổi mật khẩu tài khoản</span>}
        open={isPasswordModalVisible}
        onCancel={() => !changePasswordMutation.isPending && setIsPasswordModalVisible(false)}
        footer={null}
      >
        <Form form={passwordForm} layout="vertical" onFinish={(values) => changePasswordMutation.mutate(values)}>
          <Form.Item
            label={<span className="font-medium text-slate-700">Mật khẩu hiện tại</span>}
            name="currentPassword"
            rules={[{ required: true, message: "Vui lòng nhập mật khẩu hiện tại" }]}
          >
            <Input.Password size="large" />
          </Form.Item>
          <Form.Item
            label={<span className="font-medium text-slate-700">Mật khẩu mới</span>}
            name="newPassword"
            rules={[
              { required: true, message: "Vui lòng nhập mật khẩu mới" },
              { min: 8, message: "Mật khẩu phải có ít nhất 8 ký tự" },
            ]}
          >
            <Input.Password size="large" />
          </Form.Item>
          <Form.Item
            label={<span className="font-medium text-slate-700">Xác nhận mật khẩu mới</span>}
            name="confirmPassword"
            dependencies={["newPassword"]}
            rules={[
              { required: true, message: "Vui lòng xác nhận mật khẩu mới" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("newPassword") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error("Mật khẩu xác nhận không khớp!"));
                },
              }),
            ]}
          >
            <Input.Password size="large" />
          </Form.Item>
          <div className="flex justify-end gap-3 mt-5">
            <Button onClick={() => setIsPasswordModalVisible(false)} disabled={changePasswordMutation.isPending}>
              Hủy
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={changePasswordMutation.isPending}
              className="bg-indigo-600"
            >
              Đổi mật khẩu
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
