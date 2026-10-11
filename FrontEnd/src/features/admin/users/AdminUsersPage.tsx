import React, { useState } from "react";
import {
  Typography,
  Table,
  Tag,
  Button,
  Input,
  Select,
  Card,
  Space,
  Drawer,
  Modal,
  Form,
  Avatar,
  Descriptions,
  Statistic,
  Row,
  Col,
  Alert,
  message,
} from "antd";
import {
  SearchOutlined,
  EyeOutlined,
  UserOutlined,
  StopOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  ExclamationCircleOutlined,
  TeamOutlined,
  BookOutlined,
  DollarOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { adminUserService, adminUserKeys } from "../../../services/adminUser.service";
import type {
  AdminUserListItem,
  AdminUserDetail,
  UserRole,
  UserStatus,
  SettableUserStatus,
} from "../../../types/adminUser";
import { useAuthStore } from "../../../stores/auth.store";

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const ROLE_LABELS: Record<UserRole, { label: string; color: string }> = {
  STUDENT: { label: "Học viên", color: "blue" },
  TEACHER: { label: "Giáo viên", color: "purple" },
  SPONSOR: { label: "Nhà tài trợ", color: "gold" },
  ADMIN: { label: "Quản trị viên", color: "red" },
};

const STATUS_LABELS: Record<UserStatus, { label: string; color: string }> = {
  ACTIVE: { label: "Hoạt động", color: "success" },
  PENDING: { label: "Chờ kích hoạt", color: "warning" },
  SUSPENDED: { label: "Tạm ngưng", color: "orange" },
  BANNED: { label: "Bị khóa", color: "error" },
};

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { user: currentAdmin } = useAuthStore();
  const currentAdminId = currentAdmin?.userId || (currentAdmin as any)?.id;

  // Query & Filter states
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<UserStatus | undefined>(undefined);

  // Detail Drawer state
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Status Change Modal state
  const [statusModalUser, setStatusModalUser] = useState<AdminUserListItem | AdminUserDetail | null>(null);
  const [statusForm] = Form.useForm<{ status: SettableUserStatus; reason?: string }>();

  // Fetch users list
  const { data, isLoading, isFetching } = useQuery({
    queryKey: adminUserKeys.list({
      search: appliedSearch || undefined,
      role: roleFilter,
      status: statusFilter,
      page,
      pageSize,
    }),
    queryFn: () =>
      adminUserService.listUsers({
        search: appliedSearch || undefined,
        role: roleFilter,
        status: statusFilter,
        page,
        pageSize,
      }),
  });

  // Fetch single user detail
  const { data: userDetail, isLoading: isDetailLoading } = useQuery({
    queryKey: adminUserKeys.detail(selectedUserId!),
    queryFn: () => adminUserService.getUser(selectedUserId!),
    enabled: Boolean(selectedUserId),
  });

  // Mutation: Update status
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { status: SettableUserStatus; reason?: string } }) =>
      adminUserService.updateUserStatus(id, payload),
    onSuccess: (updatedUser) => {
      message.success(`Đã cập nhật trạng thái người dùng thành ${STATUS_LABELS[updatedUser.status]?.label || updatedUser.status}`);
      setStatusModalUser(null);
      statusForm.resetFields();
      queryClient.invalidateQueries({ queryKey: adminUserKeys.all });
    },
    onError: (err: any) => {
      message.error(err?.message || "Không thể cập nhật trạng thái người dùng");
    },
  });

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedSearch(search);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearch("");
    setAppliedSearch("");
    setRoleFilter(undefined);
    setStatusFilter(undefined);
    setPage(1);
  };

  const handleOpenStatusModal = (user: AdminUserListItem | AdminUserDetail) => {
    setStatusModalUser(user);
    statusForm.resetFields();
  };

  const handleStatusSubmit = async () => {
    if (!statusModalUser) return;
    try {
      const values = await statusForm.validateFields();
      updateStatusMutation.mutate({
        id: statusModalUser.id,
        payload: {
          status: values.status,
          reason: values.status === "ACTIVE" ? undefined : values.reason,
        },
      });
    } catch {
      // Form validation error
    }
  };

  const columns = [
    {
      title: "Người dùng",
      key: "user",
      render: (_: unknown, record: AdminUserListItem) => (
        <div className="flex items-center gap-3">
          <Avatar
            src={record.avatarUrl}
            icon={!record.avatarUrl && <UserOutlined />}
            size={42}
            className="border border-slate-200 shrink-0"
          />
          <div className="min-w-0">
            <div className="font-semibold text-slate-800 text-sm truncate">
              {record.fullName || "Chưa cập nhật tên"}
            </div>
            <div className="text-xs text-slate-500 truncate">{record.email}</div>
          </div>
        </div>
      ),
    },
    {
      title: "Vai trò",
      dataIndex: "role",
      key: "role",
      width: 140,
      render: (role: UserRole, record: AdminUserListItem) => (
        <Space direction="vertical" size={2}>
          <Tag color={ROLE_LABELS[role]?.color || "default"} className="font-medium m-0">
            {ROLE_LABELS[role]?.label || role}
          </Tag>
          {role === "TEACHER" && record.verificationStatus && (
            <span className="text-[11px] text-slate-400">
              {record.verificationStatus === "VERIFIED" ? (
                <span className="text-emerald-600 font-medium">✓ Đã duyệt hồ sơ</span>
              ) : (
                <span>Chờ xác thực</span>
              )}
            </span>
          )}
        </Space>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 130,
      render: (status: UserStatus) => (
        <Tag color={STATUS_LABELS[status]?.color || "default"} className="font-medium">
          {STATUS_LABELS[status]?.label || status}
        </Tag>
      ),
    },
    {
      title: "Ngày tham gia",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 140,
      render: (date: string) => (
        <span className="text-xs text-slate-600">{dayjs(date).format("DD/MM/YYYY")}</span>
      ),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 180,
      render: (_: unknown, record: AdminUserListItem) => {
        const isSelf = currentAdminId && record.id === currentAdminId;
        const isAdmin = record.role === "ADMIN";

        return (
          <Space orientation="horizontal" size="small">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => setSelectedUserId(record.id)}
              className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
            >
              Chi tiết
            </Button>
            {!isAdmin && !isSelf && (
              <Button
                type="text"
                size="small"
                icon={<StopOutlined />}
                onClick={() => handleOpenStatusModal(record)}
                className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
              >
                Đổi trạng thái
              </Button>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col w-full pb-10 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <Title level={3} className="!mb-1 !font-bold text-slate-900">
            Quản lý người dùng
          </Title>
          <Text className="text-slate-500 text-sm">
            Xem danh sách tất cả tài khoản trong hệ thống và kiểm soát trạng thái hoạt động
          </Text>
        </div>
        <div className="flex items-center gap-3">
          <Button
            icon={<SyncOutlined spin={isFetching} />}
            onClick={() => queryClient.invalidateQueries({ queryKey: adminUserKeys.all })}
            disabled={isFetching}
          >
            Làm mới
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="rounded-2xl shadow-sm border-slate-200/80 mb-6 bg-white">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <Input
            placeholder="Tìm theo tên hoặc email..."
            prefix={<SearchOutlined className="text-slate-400" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded-xl h-10"
            allowClear
          />
          <Select
            placeholder="Vai trò"
            value={roleFilter}
            onChange={(val) => {
              setRoleFilter(val);
              setPage(1);
            }}
            allowClear
            className="w-full md:w-44 h-10"
          >
            <Option value="STUDENT">Học viên</Option>
            <Option value="TEACHER">Giáo viên</Option>
            <Option value="SPONSOR">Nhà tài trợ</Option>
            <Option value="ADMIN">Quản trị viên</Option>
          </Select>
          <Select
            placeholder="Trạng thái"
            value={statusFilter}
            onChange={(val) => {
              setStatusFilter(val);
              setPage(1);
            }}
            allowClear
            className="w-full md:w-44 h-10"
          >
            <Option value="ACTIVE">Hoạt động</Option>
            <Option value="PENDING">Chờ kích hoạt</Option>
            <Option value="SUSPENDED">Tạm ngưng</Option>
            <Option value="BANNED">Bị khóa</Option>
          </Select>
          <Button type="primary" htmlType="submit" className="rounded-xl h-10 bg-indigo-600 hover:bg-indigo-700 px-6 font-medium">
            Tìm kiếm
          </Button>
          {(appliedSearch || roleFilter || statusFilter) && (
            <Button onClick={handleResetFilters} className="rounded-xl h-10">
              Đặt lại
            </Button>
          )}
        </form>
      </Card>

      {/* Table */}
      <Card className="rounded-2xl shadow-sm border-slate-200/80 bg-white overflow-hidden p-0">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data?.items || []}
          loading={isLoading}
          pagination={{
            current: page,
            pageSize,
            total: data?.total || 0,
            showSizeChanger: true,
            pageSizeOptions: ["10", "20", "50"],
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
            showTotal: (total) => `Tổng cộng ${total} người dùng`,
          }}
          scroll={{ x: 800 }}
        />
      </Card>

      {/* User Detail Drawer */}
      <Drawer
        title="Thông tin chi tiết người dùng"
        open={Boolean(selectedUserId)}
        onClose={() => setSelectedUserId(null)}
        width={560}
      >
        {isDetailLoading || !userDetail ? (
          <div className="py-12 text-center text-slate-400">Đang tải thông tin...</div>
        ) : (
          <div className="space-y-6">
            {/* Header info */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
              <Avatar
                src={userDetail.avatarUrl}
                icon={!userDetail.avatarUrl && <UserOutlined />}
                size={64}
                className="border border-slate-200 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <h4 className="text-base font-bold text-slate-900 truncate mb-1">
                  {userDetail.fullName || "Chưa cập nhật tên"}
                </h4>
                <div className="text-sm text-slate-500 mb-2 truncate">{userDetail.email}</div>
                <Space>
                  <Tag color={ROLE_LABELS[userDetail.role]?.color || "default"}>
                    {ROLE_LABELS[userDetail.role]?.label || userDetail.role}
                  </Tag>
                  <Tag color={STATUS_LABELS[userDetail.status]?.color || "default"}>
                    {STATUS_LABELS[userDetail.status]?.label || userDetail.status}
                  </Tag>
                </Space>
              </div>
            </div>

            {/* Quick Actions */}
            {userDetail.role !== "ADMIN" && userDetail.id !== currentAdminId && (
              <div className="flex justify-end">
                <Button
                  type="primary"
                  ghost
                  icon={<StopOutlined />}
                  onClick={() => handleOpenStatusModal(userDetail)}
                  className="rounded-lg"
                >
                  Thay đổi trạng thái
                </Button>
              </div>
            )}

            {/* Account Details */}
            <Descriptions title="Tài khoản" bordered size="small" column={1}>
              <Descriptions.Item label="Mã người dùng (ID)">
                <Text copyable className="text-xs font-mono">{userDetail.id}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Email">{userDetail.email}</Descriptions.Item>
              <Descriptions.Item label="Vai trò">
                <Tag color={ROLE_LABELS[userDetail.role]?.color}>
                  {ROLE_LABELS[userDetail.role]?.label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                <Tag color={STATUS_LABELS[userDetail.status]?.color}>
                  {STATUS_LABELS[userDetail.status]?.label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Ngày tạo">
                {dayjs(userDetail.createdAt).format("DD/MM/YYYY HH:mm:ss")}
              </Descriptions.Item>
              <Descriptions.Item label="Cập nhật lần cuối">
                {dayjs(userDetail.updatedAt).format("DD/MM/YYYY HH:mm:ss")}
              </Descriptions.Item>
            </Descriptions>

            {/* Role-Specific Profile */}
            {userDetail.profile && (
              <Descriptions title={`Hồ sơ ${ROLE_LABELS[userDetail.role]?.label}`} bordered size="small" column={1}>
                {userDetail.role === "STUDENT" && (
                  <>
                    <Descriptions.Item label="Họ và tên">
                      {userDetail.profile.fullName || "—"}
                    </Descriptions.Item>
                    {userDetail.profile.dateOfBirth && (
                      <Descriptions.Item label="Ngày sinh">
                        {dayjs(userDetail.profile.dateOfBirth).format("DD/MM/YYYY")}
                      </Descriptions.Item>
                    )}
                    {userDetail.profile.bio && (
                      <Descriptions.Item label="Giới thiệu">
                        {userDetail.profile.bio}
                      </Descriptions.Item>
                    )}
                  </>
                )}

                {userDetail.role === "TEACHER" && (
                  <>
                    <Descriptions.Item label="Họ và tên">
                      {userDetail.profile.fullName || "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Trạng thái duyệt hồ sơ">
                      <Tag color={userDetail.profile.verificationStatus === "VERIFIED" ? "success" : "default"}>
                        {userDetail.profile.verificationStatus || "CHƯA XÁC THỰC"}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="Tóm tắt chuyên môn">
                      {userDetail.profile.qualificationSummary || "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Tiểu sử">
                      {userDetail.profile.biography || "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Đánh giá">
                      ⭐ {userDetail.profile.ratingAverage?.toFixed(1) || "0.0"} ({userDetail.profile.ratingCount || 0} lượt)
                    </Descriptions.Item>
                  </>
                )}

                {userDetail.role === "SPONSOR" && (
                  <>
                    <Descriptions.Item label="Loại nhà tài trợ">
                      <Tag color="cyan">
                        {userDetail.profile.sponsorType === "ORGANIZATION" ? "Tổ chức" : "Cá nhân"}
                      </Tag>
                    </Descriptions.Item>
                    {userDetail.profile.organizationName && (
                      <Descriptions.Item label="Tên tổ chức">
                        {userDetail.profile.organizationName}
                      </Descriptions.Item>
                    )}
                    <Descriptions.Item label="Người đại diện">
                      {userDetail.profile.representativeName || "—"}
                    </Descriptions.Item>
                    {userDetail.profile.description && (
                      <Descriptions.Item label="Mô tả">
                        {userDetail.profile.description}
                      </Descriptions.Item>
                    )}
                  </>
                )}
              </Descriptions>
            )}

            {/* Activity Statistics (Directly from backend activity object) */}
            {userDetail.activity && Object.keys(userDetail.activity).length > 0 && (
              <div>
                <h4 className="text-sm font-bold text-slate-800 mb-3">Thống kê hoạt động</h4>
                <Row gutter={[12, 12]}>
                  {userDetail.activity.enrollments !== undefined && (
                    <Col span={12}>
                      <Card size="small" className="rounded-xl border-slate-200 bg-slate-50/50">
                        <Statistic
                          title="Lớp đã đăng ký"
                          value={userDetail.activity.enrollments}
                          prefix={<BookOutlined className="text-blue-500" />}
                        />
                      </Card>
                    </Col>
                  )}
                  {userDetail.activity.scholarships !== undefined && (
                    <Col span={12}>
                      <Card size="small" className="rounded-xl border-slate-200 bg-slate-50/50">
                        <Statistic
                          title="Học bổng nhận được"
                          value={userDetail.activity.scholarships}
                          prefix={<SafetyCertificateOutlined className="text-emerald-500" />}
                        />
                      </Card>
                    </Col>
                  )}
                  {userDetail.activity.classes !== undefined && (
                    <Col span={12}>
                      <Card size="small" className="rounded-xl border-slate-200 bg-slate-50/50">
                        <Statistic
                          title="Lớp đã tạo"
                          value={userDetail.activity.classes}
                          prefix={<BookOutlined className="text-purple-500" />}
                        />
                      </Card>
                    </Col>
                  )}
                  {userDetail.activity.students !== undefined && (
                    <Col span={12}>
                      <Card size="small" className="rounded-xl border-slate-200 bg-slate-50/50">
                        <Statistic
                          title="Học viên đã dạy"
                          value={userDetail.activity.students}
                          prefix={<TeamOutlined className="text-indigo-500" />}
                        />
                      </Card>
                    </Col>
                  )}
                  {userDetail.activity.contributions !== undefined && (
                    <Col span={12}>
                      <Card size="small" className="rounded-xl border-slate-200 bg-slate-50/50">
                        <Statistic
                          title="Lượt tài trợ hoàn tất"
                          value={userDetail.activity.contributions}
                          prefix={<DollarOutlined className="text-amber-500" />}
                        />
                      </Card>
                    </Col>
                  )}
                  {userDetail.activity.reportsAgainst !== undefined && (
                    <Col span={12}>
                      <Card size="small" className="rounded-xl border-slate-200 bg-slate-50/50">
                        <Statistic
                          title="Khiếu nại liên quan"
                          value={userDetail.activity.reportsAgainst}
                          valueStyle={{ color: userDetail.activity.reportsAgainst > 0 ? "#ef4444" : undefined }}
                          prefix={<ExclamationCircleOutlined className="text-rose-500" />}
                        />
                      </Card>
                    </Col>
                  )}
                </Row>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Change Status Modal */}
      <Modal
        title={`Thay đổi trạng thái tài khoản: ${statusModalUser?.fullName || statusModalUser?.email || ""}`}
        open={Boolean(statusModalUser)}
        onCancel={() => {
          setStatusModalUser(null);
          statusForm.resetFields();
        }}
        onOk={handleStatusSubmit}
        confirmLoading={updateStatusMutation.isPending}
        okText="Xác nhận cập nhật"
        cancelText="Đóng"
        destroyOnClose
      >
        <Form
          form={statusForm}
          layout="vertical"
          className="mt-4"
          initialValues={{ status: statusModalUser?.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" }}
        >
          <Alert
            type="info"
            showIcon
            className="mb-4 text-xs"
            message="Chính sách bảo mật"
            description="Khi tạm ngưng hoặc khóa tài khoản, toàn bộ phiên đăng nhập của người dùng sẽ bị hủy ngay lập tức và họ không thể truy cập hệ thống."
          />

          <Form.Item
            name="status"
            label="Trạng thái mới"
            rules={[{ required: true, message: "Vui lòng chọn trạng thái mới" }]}
          >
            <Select size="large">
              <Option value="ACTIVE" disabled={statusModalUser?.status === "ACTIVE"}>
                <CheckCircleOutlined className="text-emerald-500 mr-2" />
                Hoạt động (Kích hoạt lại)
              </Option>
              <Option value="SUSPENDED" disabled={statusModalUser?.status === "SUSPENDED"}>
                <StopOutlined className="text-amber-500 mr-2" />
                Tạm ngưng (Tạm khóa phiên)
              </Option>
              <Option value="BANNED" disabled={statusModalUser?.status === "BANNED"}>
                <CloseCircleOutlined className="text-rose-500 mr-2" />
                Bị khóa (Cấm tài khoản)
              </Option>
            </Select>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.status !== cur.status}
          >
            {({ getFieldValue }) => {
              const selectedStatus = getFieldValue("status");
              const isReasonRequired = selectedStatus === "SUSPENDED" || selectedStatus === "BANNED";

              return (
                <Form.Item
                  name="reason"
                  label={`Lý do thay đổi trạng thái ${isReasonRequired ? "(Bắt buộc)" : "(Tùy chọn)"}`}
                  rules={[
                    {
                      required: isReasonRequired,
                      message: "Vui lòng nhập lý do khi tạm ngưng hoặc khóa tài khoản",
                    },
                  ]}
                >
                  <TextArea
                    rows={3}
                    placeholder="Nhập lý do chi tiết để lưu vết nhật ký quản trị..."
                    maxLength={500}
                    showCount
                  />
                </Form.Item>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
