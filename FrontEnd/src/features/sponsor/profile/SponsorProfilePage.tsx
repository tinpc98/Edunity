import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  App as AntdApp,
  Avatar,
  Button,
  Form,
  Input,
  Radio,
  Upload,
  Skeleton,
  Card,
  Modal,
  Tag,
  Descriptions,
} from "antd";
import {
  CameraOutlined,
  EditOutlined,
  LockOutlined,
  SaveOutlined,
  CloseOutlined,
  UserOutlined,
  BankOutlined,
} from "@ant-design/icons";
import type { UploadProps } from "antd";
import dayjs from "dayjs";
import { profileService } from "../../../services/profile.service";
import { useAuthStore } from "../../../stores/auth.store";
import type { SponsorProfile, UpdateSponsorProfilePayload } from "../../../types/profile";

const { TextArea } = Input;

export default function SponsorProfilePage() {
  const { user, updateUser } = useAuthStore();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [form] = Form.useForm();

  // Password change state
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [passwordForm] = Form.useForm();

  const { data: profileData, isLoading, isError, refetch } = useQuery({
    queryKey: ["sponsorProfile", user?.userId],
    queryFn: () => {
      if (!user) throw new Error("No user");
      return profileService.getMyProfile();
    },
    enabled: !!user,
  });

  const profile = profileData as SponsorProfile;

  useEffect(() => {
    if (profile) {
      form.setFieldsValue({
        sponsorType: profile.sponsorType || "INDIVIDUAL",
        representativeName: profile.representativeName || profile.fullName || "",
        organizationName: profile.organizationName || "",
        description: profile.description || "",
      });
    }
  }, [profile, form]);

  const updateProfileMutation = useMutation({
    mutationFn: (payload: UpdateSponsorProfilePayload) => {
      if (!user) throw new Error("No user");
      return profileService.updateMyProfile(payload);
    },
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(["sponsorProfile", user?.userId], updatedProfile);
      updateUser({
        fullName: updatedProfile.fullName,
        avatarUrl: updatedProfile.avatarUrl,
      });
      setIsEditing(false);
      message.success("Cập nhật thông tin hồ sơ thành công!");
    },
    onError: (err: any) => {
      message.error(err?.message || "Có lỗi xảy ra khi cập nhật hồ sơ. Vui lòng thử lại.");
    },
  });

  const updateAvatarMutation = useMutation({
    mutationFn: (file: File) => {
      if (!user) throw new Error("No user");
      return profileService.updateAvatar(file);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["sponsorProfile", user?.userId], (old: any) => ({
        ...old,
        avatarUrl: data.avatarUrl,
      }));
      updateUser({ avatarUrl: data.avatarUrl });
      message.success("Cập nhật ảnh đại diện thành công!");
    },
    onError: (err: any) => {
      message.error(err?.message || "Không thể tải lên ảnh đại diện. Vui lòng thử lại.");
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (payload: { currentPassword?: string; newPassword?: string }) => {
      return profileService.changePassword(payload);
    },
    onSuccess: () => {
      message.success("Đổi mật khẩu thành công!");
      setIsPasswordModalVisible(false);
      passwordForm.resetFields();
    },
    onError: (err: any) => {
      message.error(err?.message || "Mật khẩu hiện tại không chính xác.");
    },
  });

  const handleUploadAvatar: UploadProps["beforeUpload"] = (file) => {
    const isImage = file.type.startsWith("image/");
    if (!isImage) {
      message.error("Chỉ chấp nhận tệp hình ảnh (JPG, PNG, WebP)!");
      return Upload.LIST_IGNORE;
    }
    const isLt5M = file.size / 1024 / 1024 < 5;
    if (!isLt5M) {
      message.error("Kích thước ảnh phải nhỏ hơn 5MB!");
      return Upload.LIST_IGNORE;
    }
    updateAvatarMutation.mutate(file);
    return false; // prevent default upload
  };

  const handleSaveProfile = async () => {
    try {
      const values = await form.validateFields();
      const payload: UpdateSponsorProfilePayload = {
        sponsorType: values.sponsorType,
        representativeName: values.representativeName,
        fullName: values.representativeName,
        organizationName: values.sponsorType === "ORGANIZATION" ? values.organizationName : undefined,
        description: values.description || undefined,
      };
      updateProfileMutation.mutate(payload);
    } catch {
      // Form validation error
    }
  };

  const handleChangePassword = async () => {
    try {
      const values = await passwordForm.validateFields();
      changePasswordMutation.mutate({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
    } catch {
      // Form validation error
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <Skeleton active avatar paragraph={{ rows: 6 }} />
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="max-w-4xl mx-auto py-8 text-center">
        <p className="text-rose-500 mb-4">Không thể tải thông tin hồ sơ</p>
        <Button onClick={() => refetch()}>Thử lại</Button>
      </div>
    );
  }

  const isOrg = profile.sponsorType === "ORGANIZATION";

  return (
    <div className="max-w-4xl mx-auto pb-12">
      {/* Header Banner & Avatar Card */}
      <Card className="rounded-2xl border-slate-200/80 shadow-sm overflow-hidden mb-6 bg-white p-0">
        <div className="h-32 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 relative" />
        <div className="px-6 pb-6 pt-0 relative flex flex-col md:flex-row md:items-end justify-between gap-4 -mt-14">
          <div className="flex flex-col md:flex-row items-center md:items-end gap-5">
            <div className="relative group">
              <Avatar
                src={profile.avatarUrl}
                icon={!profile.avatarUrl && <UserOutlined />}
                size={110}
                className="border-4 border-white shadow-md bg-white text-slate-300 text-4xl shrink-0"
              />
              <Upload
                beforeUpload={handleUploadAvatar}
                showUploadList={false}
                accept="image/*"
                disabled={updateAvatarMutation.isPending}
              >
                <div
                  className="absolute inset-0 rounded-full bg-black/40 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer border-4 border-transparent"
                  title="Thay đổi ảnh đại diện"
                >
                  <CameraOutlined className="text-xl mb-1" />
                  <span className="text-[10px] font-medium">Đổi ảnh</span>
                </div>
              </Upload>
            </div>

            <div className="text-center md:text-left">
              <div className="flex items-center gap-2 justify-center md:justify-start">
                <h2 className="text-2xl font-bold text-slate-900 mb-0">
                  {profile.fullName || profile.representativeName || "Nhà tài trợ"}
                </h2>
                <Tag color={isOrg ? "cyan" : "gold"} className="font-semibold m-0">
                  {isOrg ? <><BankOutlined className="mr-1" /> Tổ chức</> : <><UserOutlined className="mr-1" /> Cá nhân</>}
                </Tag>
              </div>
              <p className="text-slate-500 text-sm mt-1 mb-0">{profile.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-center md:self-end">
            {!isEditing ? (
              <>
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={() => setIsEditing(true)}
                  className="rounded-xl bg-amber-600 hover:bg-amber-700"
                >
                  Chỉnh sửa hồ sơ
                </Button>
                <Button
                  icon={<LockOutlined />}
                  onClick={() => setIsPasswordModalVisible(true)}
                  className="rounded-xl"
                >
                  Đổi mật khẩu
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={handleSaveProfile}
                  loading={updateProfileMutation.isPending}
                  className="rounded-xl bg-amber-600 hover:bg-amber-700"
                >
                  Lưu thay đổi
                </Button>
                <Button
                  icon={<CloseOutlined />}
                  onClick={() => {
                    setIsEditing(false);
                    form.resetFields();
                  }}
                  className="rounded-xl"
                >
                  Hủy
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Main Content Card */}
      <Card className="rounded-2xl border-slate-200/80 shadow-sm bg-white p-6">
        {!isEditing ? (
          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">
              Thông tin nhà tài trợ
            </h3>
            <Descriptions bordered column={1} size="middle" className="rounded-xl overflow-hidden">
              <Descriptions.Item label="Hình thức tài trợ">
                <Tag color={isOrg ? "cyan" : "gold"} className="text-sm px-2.5 py-0.5">
                  {isOrg ? "Tổ chức / Doanh nghiệp" : "Cá nhân tài trợ"}
                </Tag>
              </Descriptions.Item>
              {isOrg && (
                <Descriptions.Item label="Tên tổ chức / Doanh nghiệp">
                  <span className="font-medium text-slate-800">
                    {profile.organizationName || "Chưa cập nhật"}
                  </span>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Người đại diện">
                <span className="font-medium text-slate-800">
                  {profile.representativeName || profile.fullName || "—"}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Email tài khoản">
                <span className="text-slate-600">{profile.email}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Giới thiệu / Thông điệp">
                <div className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {profile.description || (
                    <span className="text-slate-400 italic">Chưa có phần giới thiệu.</span>
                  )}
                </div>
              </Descriptions.Item>
              <Descriptions.Item label="Ngày gia nhập">
                <span className="text-slate-600">
                  {dayjs(profile.createdAt).format("DD/MM/YYYY")}
                </span>
              </Descriptions.Item>
            </Descriptions>
          </div>
        ) : (
          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">
              Cập nhật thông tin hồ sơ
            </h3>
            <Form form={form} layout="vertical" initialValues={form.getFieldsValue()}>
              <Form.Item
                name="sponsorType"
                label="Loại hình tài trợ"
                rules={[{ required: true, message: "Vui lòng chọn loại hình tài trợ" }]}
              >
                <Radio.Group buttonStyle="solid" size="large">
                  <Radio.Button value="INDIVIDUAL">
                    <UserOutlined className="mr-1" /> Cá nhân
                  </Radio.Button>
                  <Radio.Button value="ORGANIZATION">
                    <BankOutlined className="mr-1" /> Tổ chức / Doanh nghiệp
                  </Radio.Button>
                </Radio.Group>
              </Form.Item>

              <Form.Item
                noStyle
                shouldUpdate={(prev, cur) => prev.sponsorType !== cur.sponsorType}
              >
                {({ getFieldValue }) => {
                  const currentType = getFieldValue("sponsorType");
                  return currentType === "ORGANIZATION" ? (
                    <Form.Item
                      name="organizationName"
                      label="Tên tổ chức / Quỹ / Doanh nghiệp"
                      rules={[
                        { required: true, message: "Vui lòng nhập tên tổ chức" },
                        { max: 200, message: "Tên tổ chức không quá 200 ký tự" },
                      ]}
                    >
                      <Input size="large" placeholder="Ví dụ: Quỹ Khuyến học Tương Lai" />
                    </Form.Item>
                  ) : null;
                }}
              </Form.Item>

              <Form.Item
                name="representativeName"
                label="Họ và tên người đại diện"
                rules={[
                  { required: true, message: "Vui lòng nhập tên người đại diện" },
                  { max: 120, message: "Tên không quá 120 ký tự" },
                ]}
              >
                <Input size="large" placeholder="Nhập họ và tên đầy đủ" />
              </Form.Item>

              <Form.Item
                name="description"
                label="Giới thiệu / Thông điệp tài trợ"
                rules={[{ max: 5000, message: "Mô tả tối đa 5000 ký tự" }]}
              >
                <TextArea
                  rows={4}
                  placeholder="Chia sẻ lý do bạn đồng hành cùng Edunity và thông điệp gửi tới các bạn học viên..."
                  showCount
                  maxLength={5000}
                />
              </Form.Item>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button onClick={() => setIsEditing(false)} className="rounded-xl">
                  Hủy
                </Button>
                <Button
                  type="primary"
                  onClick={handleSaveProfile}
                  loading={updateProfileMutation.isPending}
                  className="rounded-xl bg-amber-600 hover:bg-amber-700"
                >
                  Lưu thay đổi
                </Button>
              </div>
            </Form>
          </div>
        )}
      </Card>

      {/* Change Password Modal */}
      <Modal
        title="Đổi mật khẩu"
        open={isPasswordModalVisible}
        onCancel={() => {
          setIsPasswordModalVisible(false);
          passwordForm.resetFields();
        }}
        onOk={handleChangePassword}
        confirmLoading={changePasswordMutation.isPending}
        okText="Đổi mật khẩu"
        cancelText="Hủy"
        destroyOnClose
      >
        <Form form={passwordForm} layout="vertical" className="mt-4">
          <Form.Item
            name="currentPassword"
            label="Mật khẩu hiện tại"
            rules={[{ required: true, message: "Vui lòng nhập mật khẩu hiện tại" }]}
          >
            <Input.Password size="large" placeholder="Nhập mật khẩu hiện tại" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="Mật khẩu mới"
            rules={[
              { required: true, message: "Vui lòng nhập mật khẩu mới" },
              { min: 6, message: "Mật khẩu phải có ít nhất 6 ký tự" },
            ]}
          >
            <Input.Password size="large" placeholder="Tối thiểu 6 ký tự" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="Xác nhận mật khẩu mới"
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
            <Input.Password size="large" placeholder="Nhập lại mật khẩu mới" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
