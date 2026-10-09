import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { App as AntdApp, Avatar, Button, Form, Input, Upload, Skeleton, Alert, Modal } from "antd";
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
} from "@ant-design/icons";
import type { UploadProps } from "antd";
import { profileService } from "../../../services/profile.service";
import { teacherVerificationService } from "../../../services/teacherVerification.service";
import { useAuthStore } from "../../../stores/auth.store";
import type { TeacherProfile, UpdateTeacherProfilePayload } from "../../../types/profile";
import type { SubmitVerificationRequest, SubmitVerificationDocument } from "../../../types/teacherVerification";

export default function TeacherProfilePage() {
  const { user, updateUser } = useAuthStore();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [form] = Form.useForm();
  
  // Verification State
  const [isVerificationModalVisible, setIsVerificationModalVisible] = useState(false);
  const [verificationForm] = Form.useForm();
  const [identityFiles, setIdentityFiles] = useState<any[]>([]);
  const [qualificationFiles, setQualificationFiles] = useState<any[]>([]);

  // Password state
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

  const updateProfileMutation = useMutation({
    mutationFn: (payload: UpdateTeacherProfilePayload) => profileService.updateMyProfile(payload),
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(["teacherProfile", user?.userId], updatedProfile);
      updateUser({ fullName: updatedProfile.fullName });
      setIsEditing(false);
      message.success("Cập nhật thông tin thành công!");
    },
    onError: () => {
      message.error("Có lỗi xảy ra khi cập nhật thông tin. Vui lòng thử lại.");
    },
  });

  const updateAvatarMutation = useMutation({
    mutationFn: (file: File) => profileService.updateAvatar(file),
    onSuccess: (data) => {
      queryClient.setQueryData(["teacherProfile", user?.userId], (old: TeacherProfile | undefined) => {
        if (!old) return old;
        return { ...old, avatarUrl: data.avatarUrl };
      });
      updateUser({ avatarUrl: data.avatarUrl });
      message.success("Cập nhật ảnh đại diện thành công!");
    },
    onError: () => {
      message.error("Có lỗi xảy ra khi cập nhật ảnh đại diện.");
    },
  });

  const submitVerificationMutation = useMutation({
    mutationFn: async () => {
      if (identityFiles.length === 0 || qualificationFiles.length === 0) {
        throw new Error("Vui lòng tải lên đủ tài liệu định danh và chuyên môn.");
      }
      
      const uploadFile = async (file: File, purpose: string) => {
        const res = await teacherVerificationService.uploadPrivateFile(purpose, file);
        return res.storageKey;
      };

      const idStorageKeys = await Promise.all(identityFiles.map(f => uploadFile(f.originFileObj || f, "IDENTITY")));
      const qualStorageKeys = await Promise.all(qualificationFiles.map(f => uploadFile(f.originFileObj || f, "QUALIFICATION")));

      const documents: SubmitVerificationDocument[] = [
        {
          documentType: "IDENTITY",
          files: idStorageKeys.map((key, idx) => ({ storageKey: key, side: idStorageKeys.length > 1 ? (idx === 0 ? "FRONT" : "BACK") : "SINGLE" })),
        },
        {
          documentType: "QUALIFICATION",
          files: qualStorageKeys.map(key => ({ storageKey: key, side: "SINGLE" })),
        },
      ];

      const payload: SubmitVerificationRequest = {
        documents,
      };

      return teacherVerificationService.submitVerification(payload);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["teacherVerification", user?.userId], data);
      setIsVerificationModalVisible(false);
      setIdentityFiles([]);
      setQualificationFiles([]);
      verificationForm.resetFields();
      message.success("Đã gửi hồ sơ xác minh thành công!");
    },
    onError: (err: any) => {
      message.error(err.message || "Gửi hồ sơ thất bại.");
    }
  });

  const changePasswordMutation = useMutation({
    mutationFn: (values: any) => profileService.changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword }),
    onSuccess: () => {
      message.success("Đổi mật khẩu thành công!");
      setIsPasswordModalVisible(false);
      passwordForm.resetFields();
    },
    onError: (error: any) => {
      message.error(error.message || "Đổi mật khẩu thất bại.");
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
    console.error("Profile Error:", isErrorProfile, "error:", errorProfile, "profile:", profile);
    return (
      <Alert title="Lỗi" message="Không thể tải thông tin hồ sơ" type="error" showIcon />
    );
  }

  const uploadProps: UploadProps = {
    beforeUpload: (file) => {
      const isImage = file.type.startsWith("image/");
      if (!isImage) {
        message.error("Bạn chỉ có thể tải lên file hình ảnh!");
        return Upload.LIST_IGNORE;
      }
      updateAvatarMutation.mutate(file);
      return false;
    },
    showUploadList: false,
  };

  const renderVerificationStatus = () => {
    const status = verificationStatus?.verificationStatus || "UNVERIFIED";
    if (status === "VERIFIED") {
      return (
        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100 flex items-start gap-3">
          <CheckCircleFilled className="text-emerald-500 text-xl mt-0.5" />
          <div>
            <h4 className="text-emerald-800 font-bold m-0">Hồ sơ đã được xác minh</h4>
            <p className="text-emerald-600 text-sm mt-1 mb-0">Bạn đã có thể tạo lớp học và bắt đầu giảng dạy trên hệ thống.</p>
          </div>
        </div>
      );
    }
    if (status === "PENDING") {
      return (
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 flex items-start gap-3">
          <ClockCircleFilled className="text-amber-500 text-xl mt-0.5" />
          <div>
            <h4 className="text-amber-800 font-bold m-0">Hồ sơ đang chờ duyệt</h4>
            <p className="text-amber-600 text-sm mt-1 mb-0">Edunity đang xem xét hồ sơ của bạn. Quá trình này có thể mất từ 1-3 ngày làm việc.</p>
          </div>
        </div>
      );
    }
    if (status === "REJECTED") {
      return (
        <div className="bg-rose-50 rounded-xl p-4 border border-rose-100 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <CloseCircleFilled className="text-rose-500 text-xl mt-0.5" />
            <div>
              <h4 className="text-rose-800 font-bold m-0">Hồ sơ bị từ chối</h4>
              <p className="text-rose-600 text-sm mt-1 mb-0">Hồ sơ của bạn không hợp lệ hoặc thiếu thông tin.</p>
              {verificationStatus?.reviewNote && (
                <div className="mt-2 p-3 bg-white rounded border border-rose-100 text-rose-700 text-sm font-medium">
                  Lý do: {verificationStatus.reviewNote}
                </div>
              )}
            </div>
          </div>
          <Button onClick={() => setIsVerificationModalVisible(true)} className="self-start mt-2">
            Cập nhật và gửi lại
          </Button>
        </div>
      );
    }
    
    return (
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <InfoCircleFilled className="text-slate-400 text-xl mt-0.5" />
          <div>
            <h4 className="text-slate-700 font-bold m-0">Chưa xác minh hồ sơ</h4>
            <p className="text-slate-500 text-sm mt-1 mb-0">Bạn cần xác minh danh tính và chuyên môn để có thể tạo lớp học.</p>
          </div>
        </div>
        <Button type="primary" onClick={() => setIsVerificationModalVisible(true)} className="bg-indigo-600">
          Xác minh ngay
        </Button>
      </div>
    );
  };

  return (
    <div className="max-w-[1040px] mx-auto space-y-4 sm:space-y-5">
      <div>
        <div className="text-[12px] font-medium text-slate-400 mb-1">
          Tài khoản / <span className="text-indigo-600">Hồ sơ giáo viên</span>
        </div>
        <h1 className="text-[28px] font-bold text-slate-800 leading-tight">Hồ sơ giáo viên</h1>
      </div>

      <div className="bg-white rounded-2xl p-5 sm:px-6 border border-slate-100 shadow-sm flex flex-col gap-5">
        <h3 className="text-[18px] font-bold text-slate-800 m-0">Trạng thái xác minh</h3>
        {renderVerificationStatus()}
      </div>

      <div className="bg-white rounded-2xl p-5 sm:px-6 border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar size={64} src={profile.avatarUrl} icon={<UserOutlined />} className="bg-indigo-600 text-2xl font-bold" />
            <Upload {...uploadProps}>
              <button type="button" className="absolute bottom-0 right-0 h-7 w-7 bg-white rounded-full border border-slate-200 flex items-center justify-center text-slate-600 hover:text-indigo-600">
                <CameraOutlined className="text-xs" />
              </button>
            </Upload>
          </div>
          <div>
            <h2 className="text-[18px] font-bold text-slate-800 leading-tight mb-1">{profile.fullName}</h2>
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-slate-500">{profile.email}</span>
              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 text-[10px] font-bold">GIÁO VIÊN</span>
            </div>
          </div>
        </div>
        <Upload {...uploadProps}>
          <Button icon={<UploadOutlined />} loading={updateAvatarMutation.isPending}>Đổi ảnh đại diện</Button>
        </Upload>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
        <div className="p-5 sm:px-6 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-[18px] font-bold text-slate-800 m-0">Thông tin chuyên môn</h3>
          {!isEditing && (
            <div className="flex gap-2">
              <Button onClick={() => setIsPasswordModalVisible(true)}>Đổi mật khẩu</Button>
              <Button icon={<EditOutlined />} onClick={() => setIsEditing(true)}>Chỉnh sửa</Button>
            </div>
          )}
        </div>
        <div className="p-5 sm:px-6">
          {!isEditing ? (
            <div className="flex flex-col gap-[14px]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-indigo-50/50 rounded-xl p-3.5 flex flex-col justify-center">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Họ và tên</div>
                  <div className="text-[14px] font-semibold text-slate-800">{profile.fullName}</div>
                </div>
                <div className="bg-indigo-50/50 rounded-xl p-3.5 flex flex-col justify-center">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Email</div>
                  <div className="text-[14px] font-semibold text-slate-800">{profile.email}</div>
                </div>
              </div>
              <div className="bg-indigo-50/50 rounded-xl p-3.5 flex flex-col justify-center">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Tóm tắt chuyên môn</div>
                <div className="text-[14px] font-semibold text-slate-800">{profile.qualificationSummary || "Chưa cập nhật"}</div>
              </div>
              <div className="bg-indigo-50/50 rounded-xl p-3.5 flex flex-col justify-center">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Giới thiệu bản thân</div>
                <div className="text-[14px] font-medium text-slate-700 whitespace-pre-wrap">{profile.biography || "Chưa cập nhật"}</div>
              </div>
            </div>
          ) : (
            <Form form={form} layout="vertical" onFinish={(values) => updateProfileMutation.mutate(values)}>
              <Form.Item label="Họ và tên" name="fullName" rules={[{ required: true }]}>
                <Input size="large" />
              </Form.Item>
              <Form.Item label="Tóm tắt chuyên môn" name="qualificationSummary">
                <Input size="large" />
              </Form.Item>
              <Form.Item label="Giới thiệu bản thân" name="biography">
                <Input.TextArea rows={4} />
              </Form.Item>
              <div className="flex justify-end gap-3 pt-2">
                <Button onClick={() => setIsEditing(false)}>Hủy</Button>
                <Button type="primary" htmlType="submit" loading={updateProfileMutation.isPending} className="bg-indigo-600">Lưu thay đổi</Button>
              </div>
            </Form>
          )}
        </div>
      </div>

      <Modal
        title="Gửi hồ sơ xác minh"
        open={isVerificationModalVisible}
        onCancel={() => !submitVerificationMutation.isPending && setIsVerificationModalVisible(false)}
        footer={null}
        width={600}
        maskClosable={false}
      >
        <Alert message="Lưu ý: Bạn phải tải lên đủ CMND/CCCD (hai mặt hoặc một mặt) và Bằng cấp/Chứng chỉ chuyên môn." type="info" showIcon className="mb-4" />
        <Form form={verificationForm} layout="vertical" onFinish={() => submitVerificationMutation.mutate()}>
          <Form.Item label="Tài liệu định danh (CMND/CCCD/Passport)" required>
            <Upload.Dragger
              accept=".pdf,.jpg,.jpeg,.png"
              beforeUpload={(file) => {
                setIdentityFiles(prev => [...prev, file]);
                return false;
              }}
              onRemove={(file) => setIdentityFiles(prev => prev.filter(f => f.uid !== file.uid))}
              fileList={identityFiles}
              maxCount={2}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">Kéo thả hoặc nhấn để chọn file (tối đa 2 file)</p>
            </Upload.Dragger>
          </Form.Item>

          <Form.Item label="Bằng cấp / Chứng chỉ chuyên môn" required>
            <Upload.Dragger
              accept=".pdf,.jpg,.jpeg,.png"
              beforeUpload={(file) => {
                setQualificationFiles(prev => [...prev, file]);
                return false;
              }}
              onRemove={(file) => setQualificationFiles(prev => prev.filter(f => f.uid !== file.uid))}
              fileList={qualificationFiles}
              maxCount={1}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">Kéo thả hoặc nhấn để chọn file (tối đa 1 file)</p>
            </Upload.Dragger>
          </Form.Item>

          <div className="flex justify-end gap-3 mt-6">
            <Button onClick={() => setIsVerificationModalVisible(false)} disabled={submitVerificationMutation.isPending}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={submitVerificationMutation.isPending} className="bg-indigo-600">Gửi hồ sơ</Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title="Đổi mật khẩu"
        open={isPasswordModalVisible}
        onCancel={() => !changePasswordMutation.isPending && setIsPasswordModalVisible(false)}
        footer={null}
      >
        <Form form={passwordForm} layout="vertical" onFinish={(values) => changePasswordMutation.mutate(values)}>
          <Form.Item label="Mật khẩu hiện tại" name="currentPassword" rules={[{ required: true, message: 'Vui lòng nhập mật khẩu hiện tại' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item label="Mật khẩu mới" name="newPassword" rules={[{ required: true, message: 'Vui lòng nhập mật khẩu mới' }, { min: 8, message: 'Mật khẩu phải có ít nhất 8 ký tự' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item label="Xác nhận mật khẩu mới" name="confirmPassword" dependencies={['newPassword']} rules={[
            { required: true, message: 'Vui lòng xác nhận mật khẩu mới' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('newPassword') === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('Mật khẩu xác nhận không khớp!'));
              },
            }),
          ]}>
            <Input.Password />
          </Form.Item>
          <div className="flex justify-end gap-3 mt-4">
            <Button onClick={() => setIsPasswordModalVisible(false)} disabled={changePasswordMutation.isPending}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={changePasswordMutation.isPending}>Đổi mật khẩu</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
