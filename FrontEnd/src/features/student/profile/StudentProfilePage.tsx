import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { App as AntdApp, Avatar, Button, Form, Input, DatePicker, Upload, Skeleton, Alert } from "antd";
import {
  CameraOutlined,
  EditOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  UploadOutlined,
  UserOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { UploadProps } from "antd";
import { profileService } from "../../../services/profile.service";
import { useAuthStore } from "../../../stores/auth.store";
import type { StudentProfile, UpdateStudentProfilePayload } from "../../../types/profile";

export default function StudentProfilePage() {
  const { user, updateUser } = useAuthStore();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [form] = Form.useForm();

  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ["studentProfile", user?.userId],
    queryFn: () => {
      if (!user) throw new Error("No user");
      return profileService.getStudentProfile(user);
    },
    enabled: !!user,
  });

  const updateProfileMutation = useMutation({
    mutationFn: (payload: UpdateStudentProfilePayload) => {
      if (!user) throw new Error("No user");
      return profileService.updateStudentProfile(user.userId, payload);
    },
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(["studentProfile", user?.userId], updatedProfile);
      updateUser({ fullName: updatedProfile.fullName });
      setIsEditing(false);
      message.success("Cập nhật thông tin thành công!");
    },
    onError: () => {
      message.error("Có lỗi xảy ra khi cập nhật thông tin. Vui lòng thử lại.");
    },
  });

  const updateAvatarMutation = useMutation({
    mutationFn: (file: File) => {
      if (!user) throw new Error("No user");
      return profileService.updateAvatar(user.userId, file);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["studentProfile", user?.userId], (old: StudentProfile | undefined) => {
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

  useEffect(() => {
    if (profile && isEditing) {
      form.setFieldsValue({
        fullName: profile.fullName,
        dateOfBirth: profile.dateOfBirth ? dayjs(profile.dateOfBirth) : undefined,
        bio: profile.bio || "",
      });
    }
  }, [profile, isEditing, form]);

  if (!user) return null;

  const handleEditClick = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    form.resetFields();
  };

  const handleSave = async (values: any) => {
    const payload: UpdateStudentProfilePayload = {
      fullName: values.fullName,
      dateOfBirth: values.dateOfBirth ? values.dateOfBirth.toISOString() : undefined,
      bio: values.bio,
    };
    updateProfileMutation.mutate(payload);
  };

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

  if (isLoading) {
    return (
      <div className="max-w-[1040px] mx-auto space-y-4">
        <Skeleton active avatar paragraph={{ rows: 2 }} />
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <Alert
        message="Không thể tải thông tin hồ sơ"
        description="Vui lòng thử lại sau."
        type="error"
        showIcon
      />
    );
  }

  return (
    <div className="max-w-[1040px] mx-auto space-y-4 sm:space-y-5">
      {/* Breadcrumb & Header */}
      <div>
        <div className="text-[12px] font-medium text-slate-400 mb-1">
          Tài khoản / <span className="text-indigo-600">Hồ sơ cá nhân</span>
        </div>
        <h1 className="text-[28px] font-bold text-slate-800 leading-tight">Hồ sơ cá nhân</h1>
        <p className="text-[14px] text-slate-500 mt-0.5">Quản lý thông tin cá nhân của bạn</p>
      </div>

      {/* Profile Overview Card */}
      <div className="bg-white rounded-2xl p-5 sm:px-6 border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar
              size={64}
              src={profile.avatarUrl}
              icon={<UserOutlined />}
              className="border-2 border-white shadow-sm flex items-center justify-center text-2xl font-bold text-white bg-indigo-600"
            >
              {!profile.avatarUrl && profile.fullName ? profile.fullName.charAt(0).toUpperCase() : null}
            </Avatar>
            <Upload {...uploadProps}>
              <button
                type="button"
                className="absolute bottom-0 right-0 h-7 w-7 bg-white rounded-full border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 hover:text-indigo-600 hover:border-indigo-200 transition-colors cursor-pointer"
                disabled={updateAvatarMutation.isPending}
              >
                <CameraOutlined className="text-xs" />
              </button>
            </Upload>
          </div>
          <div className="flex flex-col justify-center">
            <h2 className="text-[18px] font-bold text-slate-800 leading-tight mb-1">
              {profile.fullName}
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-slate-500">{profile.email}</span>
              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 text-[10px] font-bold tracking-wider">
                HỌC VIÊN
              </span>
            </div>
          </div>
        </div>
        <Upload {...uploadProps}>
          <Button
            icon={<UploadOutlined />}
            loading={updateAvatarMutation.isPending}
            className="text-indigo-600 border-indigo-100 hover:bg-indigo-50 font-medium rounded-xl h-[38px] px-4"
          >
            Đổi ảnh đại diện
          </Button>
        </Upload>
      </div>

      {/* Personal Information Card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
        <div className="p-5 sm:px-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-[18px] font-bold text-slate-800">Thông tin cá nhân</h3>
            <p className="text-[13px] text-slate-500 mt-0.5">Cập nhật thông tin hồ sơ của bạn</p>
          </div>
          {!isEditing && (
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={handleEditClick}
              className="bg-indigo-600 hover:bg-indigo-500 rounded-xl font-medium h-[38px] px-4 shadow-sm"
            >
              Chỉnh sửa
            </Button>
          )}
        </div>

        <div className="p-5 sm:px-6 flex-1">
          {!isEditing ? (
            // VIEW MODE
            <div className="flex flex-col gap-[14px]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-indigo-50/50 rounded-xl p-3.5 h-[66px] flex flex-col justify-center">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                    Họ và tên
                  </div>
                  <div className="text-[14px] font-semibold text-slate-800 leading-tight">
                    {profile.fullName}
                  </div>
                </div>
                <div className="bg-indigo-50/50 rounded-xl p-3.5 h-[66px] flex flex-col justify-center">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Email
                    </div>
                    <div className="flex items-center gap-1 bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-emerald-100/50">
                      <LockOutlined className="text-[9px]" />
                      <span>Hệ thống quản lý</span>
                    </div>
                  </div>
                  <div className="text-[14px] font-semibold text-slate-800 leading-tight">
                    {profile.email}
                  </div>
                </div>
              </div>

              <div className="bg-indigo-50/50 rounded-xl p-3.5 h-[64px] flex flex-col justify-center">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                  Ngày sinh
                </div>
                <div className={`text-[14px] leading-tight ${profile.dateOfBirth ? "font-semibold text-slate-800" : "font-medium text-slate-400 italic"}`}>
                  {profile.dateOfBirth ? dayjs(profile.dateOfBirth).format("DD/MM/YYYY") : "Chưa cập nhật"}
                </div>
              </div>

              <div className="bg-indigo-50/50 rounded-xl p-3.5 min-h-[76px] flex flex-col justify-start">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Giới thiệu bản thân
                </div>
                <div className={`text-[14px] leading-relaxed ${profile.bio ? "font-medium text-slate-700" : "font-medium text-slate-400 italic"}`}>
                  {profile.bio || "Chưa có giới thiệu"}
                </div>
              </div>
            </div>
          ) : (
            // EDIT MODE
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSave}
              className="space-y-1"
              requiredMark={false}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5">
                <Form.Item
                  label={<span className="text-xs font-semibold text-slate-600">Họ và tên</span>}
                  name="fullName"
                  rules={[{ required: true, message: "Vui lòng nhập họ và tên" }]}
                >
                  <Input size="large" className="rounded-xl bg-slate-50 border-slate-200 hover:border-indigo-400 focus:border-indigo-500 text-sm font-medium" />
                </Form.Item>
                <Form.Item
                  label={<span className="text-xs font-semibold text-slate-600">Email</span>}
                >
                  <Input
                    size="large"
                    value={profile.email}
                    disabled
                    suffix={
                      <div className="flex items-center text-slate-400 text-xs gap-1">
                        <LockOutlined />
                        <span className="hidden sm:inline">Không thể sửa</span>
                      </div>
                    }
                    className="rounded-xl bg-slate-100/70 border-slate-200 text-sm font-medium text-slate-500 cursor-not-allowed"
                  />
                </Form.Item>
              </div>

              <Form.Item
                label={<span className="text-xs font-semibold text-slate-600">Ngày sinh</span>}
                name="dateOfBirth"
              >
                <DatePicker
                  size="large"
                  format="DD/MM/YYYY"
                  placeholder="Chọn ngày sinh"
                  className="w-full rounded-xl bg-slate-50 border-slate-200 hover:border-indigo-400 focus:border-indigo-500 text-sm font-medium"
                />
              </Form.Item>

              <Form.Item
                label={<span className="text-xs font-semibold text-slate-600">Giới thiệu bản thân</span>}
                name="bio"
              >
                <Input.TextArea
                  rows={4}
                  placeholder="Viết vài dòng giới thiệu về bạn..."
                  className="rounded-xl bg-slate-50 border-slate-200 hover:border-indigo-400 focus:border-indigo-500 text-sm font-medium resize-none p-3 leading-relaxed"
                />
              </Form.Item>

              <div className="flex items-center justify-end gap-3 pt-4">
                <Button
                  onClick={handleCancelEdit}
                  disabled={updateProfileMutation.isPending}
                  className="h-10 px-5 rounded-xl text-sm font-semibold text-slate-600 hover:text-slate-800 border-slate-200 hover:bg-slate-50"
                >
                  Hủy
                </Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={updateProfileMutation.isPending}
                  className="h-10 px-6 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 shadow-sm"
                >
                  Lưu thay đổi
                </Button>
              </div>
            </Form>
          )}
        </div>

        {/* Profile Footer */}
        <div className="px-5 py-3.5 sm:px-6 bg-slate-50/50 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-[12px] text-slate-500">
          <div className="flex items-center gap-2">
            <SafetyCertificateOutlined className="text-indigo-500" />
            <span>Thông tin hồ sơ của bạn được quản lý bởi Edunity.</span>
          </div>
          {profile.updatedAt && (
            <div className="font-medium">
              Lần cập nhật gần nhất: {dayjs(profile.updatedAt).format("DD/MM/YYYY")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
