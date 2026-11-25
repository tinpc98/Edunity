import { useState, useEffect, type FormEvent } from "react";
import {
  Table,
  Button,
  Input,
  Select,
  Modal,
  Form,
  Avatar,
  Alert,
  message,
  Pagination,
} from "antd";
import {
  SearchOutlined,
  EyeOutlined,
  UserOutlined,
  StopOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  CloseOutlined,
  BookOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  LockOutlined,
  CalendarOutlined,
  MailOutlined,
  StarFilled,
  StarOutlined,
  AuditOutlined,
  IdcardOutlined,
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
import { AdminPageHero, AdminFilterBar, AdminFilterField, AdminTableCard } from "../../../components/admin";
import AdminKpiCard from "../../../components/admin/AdminKpiCard";
import AdminStatusBadge from "../../../components/admin/AdminStatusBadge";

const { Option } = Select;
const { TextArea } = Input;

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

  // Detail Modal state (Replaced Drawer with Centered Modal)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Status History pagination state
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 5;

  const handleOpenUserDetail = (userId: string) => {
    setSelectedUserId(userId);
    setHistoryPage(1);
  };

  // Status Change Modal state
  const [statusModalUser, setStatusModalUser] = useState<AdminUserListItem | AdminUserDetail | null>(null);
  const [statusForm] = Form.useForm<{ status: SettableUserStatus; reason?: string }>();

  // Keyboard navigation: Close modal when pressing Escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (selectedUserId) {
          setSelectedUserId(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedUserId]);

  // Fetch users list
  const { data, isLoading, isFetching, isError, refetch } = useQuery({
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
  const summaryQuery = useQuery({
    queryKey: adminUserKeys.summary(),
    queryFn: () => adminUserService.getSummary(),
  });
  const summary = summaryQuery.data;
  const isRefreshing = isFetching || summaryQuery.isFetching;

  // Fetch single user detail
  const {
    data: userDetail,
    isLoading: isDetailLoading,
    isFetching: isDetailFetching,
    isError: isDetailError,
    refetch: refetchUserDetail,
  } = useQuery({
    queryKey: adminUserKeys.detail(selectedUserId!),
    queryFn: () => adminUserService.getUser(selectedUserId!),
    enabled: Boolean(selectedUserId),
  });

  // Fetch status history
  const {
    data: statusHistoryData,
    isLoading: isHistoryLoading,
    isError: isHistoryError,
    refetch: refetchStatusHistory,
  } = useQuery({
    queryKey: adminUserKeys.history(selectedUserId!, { page: historyPage, pageSize: historyPageSize }),
    queryFn: () =>
      adminUserService.getUserStatusHistory(selectedUserId!, {
        page: historyPage,
        pageSize: historyPageSize,
      }),
    enabled: Boolean(selectedUserId),
  });

  // Mutation: Update status
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { status: SettableUserStatus; reason?: string } }) =>
      adminUserService.updateUserStatus(id, payload),
    onSuccess: (updatedUser) => {
      message.success(`Đã cập nhật trạng thái người dùng thành ${updatedUser.status}`);
      setStatusModalUser(null);
      statusForm.resetFields();
      queryClient.invalidateQueries({ queryKey: adminUserKeys.all });
      if (selectedUserId) {
        refetchUserDetail();
        refetchStatusHistory();
      }
    },
    onError: (err: any) => {
      message.error(err?.message || "Không thể cập nhật trạng thái người dùng");
    },
  });

  const handleSearchSubmit = (e: FormEvent) => {
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
          reason: values.status === "ACTIVE" ? undefined : values.reason?.trim(),
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
            size={40}
            className="border border-[#D6E5E2] bg-[#CCFBF1] text-[#0F766E] shrink-0 font-bold"
          />
          <div className="min-w-0">
            <div className="font-bold text-[#163B40] text-sm truncate">
              {record.fullName || "Chưa cập nhật tên"}
            </div>
            <div className="text-xs text-[#64748B] truncate">{record.email}</div>
          </div>
        </div>
      ),
    },
    {
      title: "Vai trò",
      dataIndex: "role",
      key: "role",
      width: 150,
      render: (role: UserRole, record: AdminUserListItem) => {
        let roleType: "teal" | "purple" | "warning" | "error" | "info" = "info";
        let label = "Học viên";
        if (role === "TEACHER") {
          roleType = "teal";
          label = "Giáo viên";
        } else if (role === "SPONSOR") {
          roleType = "warning";
          label = "Nhà tài trợ";
        } else if (role === "ADMIN") {
          roleType = "error";
          label = "Quản trị viên";
        }

        return (
          <div className="flex flex-col gap-1 items-start">
            <AdminStatusBadge label={label} type={roleType} />
            {role === "TEACHER" && record.verificationStatus && (
              <span className="text-[10px] font-semibold text-slate-400">
                {record.verificationStatus === "VERIFIED" ? (
                  <span className="text-emerald-600">✓ Đã xác thực</span>
                ) : (
                  <span>Chờ xác thực</span>
                )}
              </span>
            )}
          </div>
        );
      },
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 140,
      render: (status: UserStatus) => {
        let badgeType: "success" | "warning" | "error" = "success";
        let label = "Hoạt động";
        if (status === "PENDING") {
          badgeType = "warning";
          label = "Chờ kích hoạt";
        } else if (status === "SUSPENDED") {
          badgeType = "warning";
          label = "Tạm ngưng";
        } else if (status === "BANNED") {
          badgeType = "error";
          label = "Bị khóa";
        }
        return <AdminStatusBadge label={label} type={badgeType} pulse={status === "ACTIVE"} />;
      },
    },
    {
      title: "Ngày tham gia",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 130,
      render: (date: string) => (
        <span className="text-xs text-slate-600 font-medium">
          {dayjs(date).format("DD/MM/YYYY")}
        </span>
      ),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 170,
      align: "right" as const,
      render: (_: unknown, record: AdminUserListItem) => {
        const isSelf = currentAdminId && record.id === currentAdminId;
        const isAdmin = record.role === "ADMIN";

        return (
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={() => handleOpenUserDetail(record.id)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-[#0F766E] bg-[#CCFBF1] hover:bg-teal-200 transition-colors cursor-pointer"
            >
              <EyeOutlined className="text-[11px]" />
              <span>Chi tiết</span>
            </button>
            {!isAdmin && !isSelf && (
              <button
                onClick={() => handleOpenStatusModal(record)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-[#B45309] bg-[#FEF3C7] hover:bg-amber-200 transition-colors cursor-pointer"
              >
                <StopOutlined className="text-[11px]" />
                <span>Đổi quyền</span>
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-5 w-full pb-10">
      <AdminPageHero
        icon={<UserOutlined />}
        title="Quản lý người dùng"
        crumb="Người dùng"
        description="Tra cứu, phân quyền, xác thực danh tính và kiểm soát quyền truy cập người dùng toàn hệ thống."
        extra={
          <Button
            icon={<SyncOutlined spin={isRefreshing} />}
            onClick={() => queryClient.invalidateQueries({ queryKey: adminUserKeys.all })}
            disabled={isRefreshing}
            className="rounded-xl"
          >
            Làm mới
          </Button>
        }
      />

      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminKpiCard
          title="Tổng người dùng"
          value={summary?.totalUsers.toLocaleString("vi-VN") ?? "—"}
          icon={<TeamOutlined />}
          variant="teal"
        />
        <AdminKpiCard
          title="Giáo viên"
          value={summary?.teachers.toLocaleString("vi-VN") ?? "—"}
          icon={<IdcardOutlined />}
          variant="mint"
        />
        <AdminKpiCard
          title="Học viên đang hoạt động"
          value={summary?.activeStudents.toLocaleString("vi-VN") ?? "—"}
          icon={<BookOutlined />}
          variant="sky"
        />
        <AdminKpiCard
          title="Hồ sơ giáo viên chờ duyệt"
          value={summary?.verification.pending.toLocaleString("vi-VN") ?? "—"}
          icon={<AuditOutlined />}
          variant="amber"
        />
      </div>
      {summaryQuery.isError && (
        <Alert type="error" showIcon message="Không thể tải số liệu người dùng." />
      )}

      {/* Main Data Table + Filter bar */}
      <AdminTableCard>
        <form onSubmit={handleSearchSubmit}>
          <AdminFilterBar
            title="Bộ lọc người dùng"
            gridClassName="md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_200px_200px_auto_auto]"
            onReset={handleResetFilters}
            hasFilter={Boolean(search || appliedSearch || roleFilter || statusFilter)}
            summary={data ? <>Tìm thấy <span className="font-semibold text-[#0F766E]">{data.total.toLocaleString("vi-VN")}</span> người dùng</> : null}
          >
            <AdminFilterField label="Tìm kiếm">
              <Input
                placeholder="Tên hoặc email người dùng..."
                prefix={<SearchOutlined className="text-[#64748B]" />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-xl"
                allowClear
              />
            </AdminFilterField>
            <AdminFilterField label="Vai trò">
              <Select
                placeholder="Tất cả vai trò"
                value={roleFilter}
                onChange={(val) => {
                  setRoleFilter(val);
                  setPage(1);
                }}
                allowClear
              >
                <Option value="STUDENT">Học viên</Option>
                <Option value="TEACHER">Giáo viên</Option>
                <Option value="SPONSOR">Nhà tài trợ</Option>
                <Option value="ADMIN">Quản trị viên</Option>
              </Select>
            </AdminFilterField>
            <AdminFilterField label="Trạng thái">
              <Select
                placeholder="Tất cả trạng thái"
                value={statusFilter}
                onChange={(val) => {
                  setStatusFilter(val);
                  setPage(1);
                }}
                allowClear
              >
                <Option value="ACTIVE">Hoạt động</Option>
                <Option value="PENDING">Chờ kích hoạt</Option>
                <Option value="SUSPENDED">Tạm ngưng</Option>
                <Option value="BANNED">Bị khóa</Option>
              </Select>
            </AdminFilterField>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SearchOutlined />}
              className="bg-[#0F766E] hover:bg-[#0D9488] border-none font-semibold rounded-xl justify-self-start"
            >
              Tìm kiếm
            </Button>
          </AdminFilterBar>
        </form>

        {isError && (
          <Alert
            type="error"
            showIcon
            className="m-4"
            message="Không thể tải danh sách người dùng"
            description="Vui lòng thử lại. Nếu vấn đề vẫn tiếp diễn, hãy kiểm tra kết nối."
            action={
              <Button size="small" onClick={() => refetch()} loading={isFetching}>
                Thử lại
              </Button>
            }
          />
        )}

        {(!isError || data) && (
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
              showTotal: (total, range) => (
                <span className="text-xs text-slate-500">
                  Hiển thị {range[0]}-{range[1]} trên tổng {total.toLocaleString("vi-VN")} người dùng
                </span>
              ),
            }}
          />
        )}
      </AdminTableCard>

      {/* ========================================================================= */}
      {/* CRITICAL REQUIREMENT: CENTERED USER DETAIL MODAL (~820px, rounded 20px)    */}
      {/* MATCHING STITCH DESIGN: chi_ti_t_ng_i_d_ng_modal_soft_mint_teal/code.html   */}
      {/* ========================================================================= */}
      <Modal
        centered
        width={820}
        open={Boolean(selectedUserId)}
        onCancel={() => setSelectedUserId(null)}
        footer={null}
        closeIcon={null}
        destroyOnClose
        styles={{
          body: {
            padding: 0,
            overflow: "hidden",
          },
        }}
      >
        {/* 1. STICKY MODAL HEADER */}
        <div className="sticky top-0 z-20 px-6 py-4 bg-white/95 backdrop-blur-md flex items-center justify-between border-b border-[#D6E5E2]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#CCFBF1] text-[#0F766E] border border-[#99F6E4] flex items-center justify-center text-xl shadow-2xs">
              <IdcardOutlined />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-[#163B40] tracking-tight leading-none">
                  Thông tin chi tiết người dùng
                </h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#CCFBF1] text-[#0F766E] border border-[#99F6E4] text-[10px] font-bold tracking-wide">
                  <SafetyCertificateOutlined className="text-[11px]" />
                  HỒ SƠ HỆ THỐNG V3
                </span>
              </div>
              <p className="text-xs text-[#64748B] flex items-center gap-1.5 mt-1">
                <span>Hồ sơ thành viên</span>
                <span className="text-slate-300">•</span>
                <span className="text-[#0F766E] font-semibold">Hệ thống Edunity Core V3</span>
              </p>
            </div>
          </div>

          {/* Close Action with Esc Indicator */}
          <button
            onClick={() => setSelectedUserId(null)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#F0F8F6] text-[#334155] hover:bg-[#E5F5F1] hover:text-[#0F766E] transition-all cursor-pointer border border-[#D6E5E2]"
          >
            <span className="text-[10px] font-bold tracking-wider uppercase text-[#64748B]">
              Esc
            </span>
            <CloseOutlined className="text-xs" />
          </button>
        </div>

        {/* SCROLLABLE MODAL BODY */}
        <div className="max-h-[75vh] overflow-y-auto p-6 space-y-6">
          {isDetailError ? (
            <Alert
              type="error"
              showIcon
              message="Không thể tải thông tin người dùng"
              description="Vui lòng thử lại sau hoặc kiểm tra kết nối."
              action={
                <Button size="small" onClick={() => refetchUserDetail()} loading={isDetailFetching}>
                  Thử lại
                </Button>
              }
            />
          ) : isDetailLoading || !userDetail ? (
            <div className="py-16 text-center text-slate-400">
              <SyncOutlined spin className="text-2xl text-teal-600 mb-2" />
              <p className="text-sm">Đang tải hồ sơ người dùng...</p>
            </div>
          ) : (
            <>
              {/* 2. PROFILE BANNER HERO (Teal / Mint Gradient Hero) */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0F766E] via-[#115E59] to-[#134E4A] p-6 text-white shadow-md">
                {/* Subtle Mint Glow Circles */}
                <div className="absolute -right-12 -top-12 w-64 h-64 bg-teal-400/20 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute right-1/3 -bottom-8 w-48 h-48 bg-emerald-400/15 rounded-full blur-2xl pointer-events-none" />

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
                  <div className="flex items-start md:items-center gap-4">
                    {/* Avatar with Verified Badge */}
                    <div className="relative shrink-0">
                      <Avatar
                        src={userDetail.avatarUrl}
                        icon={!userDetail.avatarUrl && <UserOutlined />}
                        size={72}
                        className="rounded-2xl border-2 border-[#99F6E4] bg-teal-950/60 shadow-lg font-bold text-2xl"
                      />
                      {userDetail.status === "ACTIVE" && (
                        <div
                          className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-400 text-teal-950 flex items-center justify-center shadow-md ring-2 ring-teal-800 font-bold"
                          title="Đang hoạt động"
                        >
                          <CheckCircleOutlined className="text-xs" />
                        </div>
                      )}
                    </div>

                    {/* Name & Strategic Metadata */}
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                          {userDetail.fullName || "Chưa cập nhật họ tên"}
                        </h3>
                        <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-white font-bold text-[10px] tracking-wide uppercase backdrop-blur-md">
                          {userDetail.role}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-teal-100 flex items-center gap-1.5 font-medium">
                        <MailOutlined className="text-teal-300" />
                        <span>{userDetail.email}</span>
                      </p>
                      <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-teal-200/90 pt-0.5">
                        <span className="flex items-center gap-1">
                          <IdcardOutlined className="text-teal-300" />
                          <span>ID: {userDetail.id}</span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <CalendarOutlined className="text-teal-300" />
                          <span>Tham gia: {dayjs(userDetail.createdAt).format("DD/MM/YYYY")}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action on Banner */}
                  {userDetail.role !== "ADMIN" && userDetail.id !== currentAdminId && (
                    <div className="shrink-0 self-start md:self-center">
                      <button
                        onClick={() => handleOpenStatusModal(userDetail)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-[#0F766E] hover:bg-[#E5F5F1] font-bold text-xs shadow transition-all cursor-pointer"
                      >
                        <StopOutlined className="text-sm text-[#D97706]" />
                        <span>Đổi trạng thái</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. SECTION 1: THÔNG TIN TÀI KHOẢN & BẢO MẬT */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <LockOutlined className="text-[#0F766E] text-base" />
                    <h4 className="text-sm font-bold text-[#163B40]">
                      1. Thông tin Tài khoản & Bảo mật
                    </h4>
                  </div>
                  <span className="text-[11px] text-[#64748B] font-medium">
                    Cập nhật: {dayjs(userDetail.updatedAt).format("HH:mm DD/MM/YYYY")}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {/* Vai trò */}
                  <div className="p-3.5 rounded-xl bg-[#F0F8F6] border border-[#D6E5E2] flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">
                      Vai trò & Thẩm quyền
                    </span>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className="w-2 h-2 rounded-full bg-[#0D9488]" />
                      <span className="text-xs font-bold text-[#163B40]">
                        {userDetail.role === "ADMIN"
                          ? "Quản trị viên cấp cao"
                          : userDetail.role === "TEACHER"
                          ? "Giáo viên giảng dạy"
                          : userDetail.role === "SPONSOR"
                          ? "Nhà tài trợ quỹ"
                          : "Học viên nền tảng"}
                      </span>
                    </div>
                  </div>

                  {/* Trạng thái */}
                  <div className="p-3.5 rounded-xl bg-[#F0F8F6] border border-[#D6E5E2] flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">
                      Trạng thái vận hành
                    </span>
                    <div className="mt-2">
                      <AdminStatusBadge
                        label={
                          userDetail.status === "ACTIVE"
                            ? "Đang hoạt động"
                            : userDetail.status === "BANNED"
                            ? "Đã khóa"
                            : userDetail.status === "SUSPENDED"
                            ? "Tạm ngưng"
                            : userDetail.status
                        }
                        type={
                          userDetail.status === "ACTIVE"
                            ? "success"
                            : userDetail.status === "BANNED"
                            ? "error"
                            : "warning"
                        }
                        pulse={userDetail.status === "ACTIVE"}
                      />
                    </div>
                  </div>

                  {/* Ngày tham gia */}
                  <div className="p-3.5 rounded-xl bg-[#F0F8F6] border border-[#D6E5E2] flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">
                      Ngày gia nhập hệ thống
                    </span>
                    <p className="text-xs font-bold text-[#163B40] mt-2 flex items-center gap-1.5">
                      <CalendarOutlined className="text-[#0D9488]" />
                      {dayjs(userDetail.createdAt).format("DD/MM/YYYY HH:mm")}
                    </p>
                  </div>

                  {/* Email & 2FA */}
                  <div className="p-3.5 rounded-xl bg-[#F0F8F6] border border-[#D6E5E2] flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">
                      Bảo mật xác thực
                    </span>
                    <div className="flex items-center gap-1.5 mt-2 text-[#0F766E] font-bold text-xs">
                      <SafetyCertificateOutlined className="text-[#0D9488] text-sm" />
                      <span>Email đã định danh</span>
                    </div>
                  </div>

                  {/* Lần cập nhật cuối */}
                  <div className="p-3.5 rounded-xl bg-[#F0F8F6] border border-[#D6E5E2] flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">
                      Cập nhật lần cuối
                    </span>
                    <p className="text-xs font-bold text-[#163B40] mt-2">
                      {dayjs(userDetail.updatedAt).format("DD/MM/YYYY HH:mm")}
                    </p>
                  </div>

                  {/* Status Reason & Lock Metadata Alert (when SUSPENDED or BANNED) */}
                  {(userDetail.status === "SUSPENDED" || userDetail.status === "BANNED") && (
                    <div
                      className={`p-4 rounded-xl border flex flex-col gap-2.5 col-span-1 md:col-span-3 ${
                        userDetail.status === "BANNED"
                          ? "bg-rose-50/90 border-rose-200 text-rose-900"
                          : "bg-amber-50/90 border-amber-200 text-amber-900"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {userDetail.status === "BANNED" ? (
                            <CloseCircleOutlined className="text-rose-600 text-base" />
                          ) : (
                            <StopOutlined className="text-amber-600 text-base" />
                          )}
                          <span className="font-bold text-xs uppercase tracking-wide">
                            {userDetail.status === "BANNED"
                              ? "Tài khoản đang bị khóa (BANNED)"
                              : "Tài khoản đang tạm ngưng (SUSPENDED)"}
                          </span>
                        </div>
                        {userDetail.statusChangedAt && (
                          <span className="text-[11px] text-slate-500 font-medium">
                            Thời gian xử lý: {dayjs(userDetail.statusChangedAt).format("HH:mm DD/MM/YYYY")}
                          </span>
                        )}
                      </div>

                      <div className="bg-white/90 rounded-lg p-3 border border-dashed border-slate-200 text-xs">
                        <div className="font-semibold text-slate-700 mb-1">Lý do khóa / tạm ngưng:</div>
                        <div className="text-slate-900 font-medium whitespace-pre-wrap">
                          {userDetail.statusReason || "Chưa có thông tin lý do"}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-0.5">
                        <span>
                          Admin thực hiện:{" "}
                          <strong className="text-slate-800">
                            {userDetail.statusChangedBy?.fullName ||
                              userDetail.statusChangedBy?.email ||
                              (userDetail.statusChangedBy?.id ? `ID: ${userDetail.statusChangedBy.id}` : "Quản trị viên")}
                          </strong>
                        </span>
                        {userDetail.statusChangedBy?.email && (
                          <span className="text-slate-400">({userDetail.statusChangedBy.email})</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 4. SECTION 2: HỒ SƠ CHUYÊN MÔN / HỒ SƠ THEO VAI TRÒ */}
              {userDetail.profile && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BookOutlined className="text-[#0F766E] text-base" />
                      <h4 className="text-sm font-bold text-[#163B40]">
                        2. Hồ sơ vai trò: {userDetail.role}
                      </h4>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-[#F0F8F6] border border-[#D6E5E2] space-y-4">
                    {userDetail.role === "TEACHER" && (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Trạng thái duyệt hồ sơ
                            </span>
                            <div className="mt-1">
                              <AdminStatusBadge
                                label={userDetail.profile.verificationStatus || "CHƯA XÁC THỰC"}
                                type={
                                  userDetail.profile.verificationStatus === "VERIFIED"
                                    ? "success"
                                    : "warning"
                                }
                                pulse={userDetail.profile.verificationStatus === "VERIFIED"}
                              />
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Tóm tắt chuyên môn
                            </span>
                            <p className="text-xs font-semibold text-slate-800 mt-1">
                              {userDetail.profile.qualificationSummary || "Chưa cập nhật chuyên môn"}
                            </p>
                          </div>
                        </div>

                        {userDetail.profile.biography && (
                          <div className="p-3.5 rounded-xl bg-white border border-[#D6E5E2]">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] block mb-1">
                              Tiểu sử sư phạm
                            </span>
                            <p className="text-xs text-[#334155] leading-relaxed italic">
                              "{userDetail.profile.biography}"
                            </p>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                          <div className="p-3.5 rounded-xl bg-white border border-[#D6E5E2] flex items-center justify-between">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                                Đánh giá từ học viên
                              </span>
                              <div className="flex items-baseline gap-2 mt-1">
                                <span className="text-xl font-extrabold text-[#0F766E]">
                                  {userDetail.profile.ratingAverage?.toFixed(1) || "0.0"}
                                </span>
                                <span className="text-xs text-[#64748B]">/ 5.0</span>
                                <div className="flex items-center text-amber-500 text-xs ml-1">
                                  {[1, 2, 3, 4, 5].map((star) =>
                                    (userDetail.profile?.ratingAverage || 0) >= star ? (
                                      <StarFilled key={star} />
                                    ) : (
                                      <StarOutlined key={star} />
                                    )
                                  )}
                                </div>
                              </div>
                            </div>
                            <span className="text-[11px] text-[#64748B] font-medium">
                              {userDetail.profile.ratingCount || 0} lượt
                            </span>
                          </div>
                        </div>
                      </>
                    )}

                    {userDetail.role === "STUDENT" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Họ và tên
                          </span>
                          <p className="text-xs font-semibold text-slate-800 mt-1">
                            {userDetail.profile.fullName || "—"}
                          </p>
                        </div>
                        {userDetail.profile.dateOfBirth && (
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Ngày sinh
                            </span>
                            <p className="text-xs font-semibold text-slate-800 mt-1">
                              {dayjs(userDetail.profile.dateOfBirth).format("DD/MM/YYYY")}
                            </p>
                          </div>
                        )}
                        {userDetail.profile.bio && (
                          <div className="col-span-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Giới thiệu
                            </span>
                            <p className="text-xs text-slate-700 mt-1">
                              {userDetail.profile.bio}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {userDetail.role === "SPONSOR" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Loại nhà tài trợ
                          </span>
                          <p className="text-xs font-semibold text-slate-800 mt-1">
                            {userDetail.profile.sponsorType === "ORGANIZATION" ? "Tổ chức" : "Cá nhân"}
                          </p>
                        </div>
                        {userDetail.profile.organizationName && (
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Tên tổ chức
                            </span>
                            <p className="text-xs font-semibold text-slate-800 mt-1">
                              {userDetail.profile.organizationName}
                            </p>
                          </div>
                        )}
                        {userDetail.profile.representativeName && (
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Người đại diện
                            </span>
                            <p className="text-xs font-semibold text-slate-800 mt-1">
                              {userDetail.profile.representativeName}
                            </p>
                          </div>
                        )}
                        {userDetail.profile.description && (
                          <div className="col-span-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Mô tả tài trợ
                            </span>
                            <p className="text-xs text-slate-700 mt-1">
                              {userDetail.profile.description}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 5. SECTION 3: THỐNG KÊ HOẠT ĐỘNG & VẬN HÀNH */}
              {userDetail.activity && Object.keys(userDetail.activity).length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AuditOutlined className="text-[#0F766E] text-base" />
                      <h4 className="text-sm font-bold text-[#163B40]">
                        3. Thống kê Hoạt động & Vận hành
                      </h4>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {userDetail.activity.enrollments !== undefined && (
                      <div className="p-4 rounded-xl bg-[#F0F8F6] border border-[#D6E5E2] flex flex-col justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                          Lớp đã đăng ký
                        </span>
                        <div className="flex items-baseline gap-1 mt-2">
                          <span className="text-2xl font-extrabold text-[#0F766E]">
                            {userDetail.activity.enrollments}
                          </span>
                          <span className="text-xs text-[#64748B]">lớp</span>
                        </div>
                      </div>
                    )}

                    {userDetail.activity.scholarships !== undefined && (
                      <div className="p-4 rounded-xl bg-[#F0F8F6] border border-[#D6E5E2] flex flex-col justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                          Học bổng nhận được
                        </span>
                        <div className="flex items-baseline gap-1 mt-2">
                          <span className="text-2xl font-extrabold text-[#15803D]">
                            {userDetail.activity.scholarships}
                          </span>
                          <span className="text-xs text-[#64748B]">suất</span>
                        </div>
                      </div>
                    )}

                    {userDetail.activity.classes !== undefined && (
                      <div className="p-4 rounded-xl bg-[#F0F8F6] border border-[#D6E5E2] flex flex-col justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                          Lớp phụ trách
                        </span>
                        <div className="flex items-baseline gap-1 mt-2">
                          <span className="text-2xl font-extrabold text-[#0F766E]">
                            {userDetail.activity.classes}
                          </span>
                          <span className="text-xs text-[#64748B]">lớp</span>
                        </div>
                      </div>
                    )}

                    {userDetail.activity.students !== undefined && (
                      <div className="p-4 rounded-xl bg-[#F0F8F6] border border-[#D6E5E2] flex flex-col justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                          Học viên đào tạo
                        </span>
                        <div className="flex items-baseline gap-1 mt-2">
                          <span className="text-2xl font-extrabold text-[#0F766E]">
                            {userDetail.activity.students}
                          </span>
                          <span className="text-xs text-[#64748B]">học viên</span>
                        </div>
                      </div>
                    )}

                    {userDetail.activity.contributions !== undefined && (
                      <div className="p-4 rounded-xl bg-[#F0F8F6] border border-[#D6E5E2] flex flex-col justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                          Lượt tài trợ
                        </span>
                        <div className="flex items-baseline gap-1 mt-2">
                          <span className="text-2xl font-extrabold text-[#B45309]">
                            {userDetail.activity.contributions}
                          </span>
                          <span className="text-xs text-[#64748B]">lượt</span>
                        </div>
                      </div>
                    )}

                    {userDetail.activity.reportsAgainst !== undefined && (
                      <div className="p-4 rounded-xl bg-[#F0F8F6] border border-[#D6E5E2] flex flex-col justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                          Khiếu nại liên quan
                        </span>
                        <div className="flex items-baseline gap-1 mt-2">
                          <span
                            className={`text-2xl font-extrabold ${
                              userDetail.activity.reportsAgainst > 0
                                ? "text-[#DC2626]"
                                : "text-[#15803D]"
                            }`}
                          >
                            {userDetail.activity.reportsAgainst}
                          </span>
                          <span className="text-xs text-[#64748B]">vụ</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 5. SECTION: LỊCH SỬ THAY ĐỔI TRẠNG THÁI */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AuditOutlined className="text-[#0F766E] text-base" />
                    <h4 className="text-sm font-bold text-[#163B40]">
                      Lịch sử thay đổi trạng thái
                    </h4>
                  </div>
                  {statusHistoryData && (
                    <span className="text-[11px] text-[#64748B] font-medium">
                      Tổng cộng {statusHistoryData.total} lần cập nhật
                    </span>
                  )}
                </div>

                <div className="p-4 rounded-2xl bg-[#F0F8F6] border border-[#D6E5E2] space-y-3">
                  {isHistoryLoading ? (
                    <div className="py-6 text-center text-slate-400">
                      <SyncOutlined spin className="text-xl text-teal-600 mb-1" />
                      <p className="text-xs">Đang tải lịch sử trạng thái...</p>
                    </div>
                  ) : isHistoryError ? (
                    <Alert
                      type="error"
                      showIcon
                      message="Không thể tải lịch sử thay đổi trạng thái"
                      action={
                        <Button size="small" onClick={() => refetchStatusHistory()}>
                          Thử lại
                        </Button>
                      }
                    />
                  ) : !statusHistoryData || statusHistoryData.items.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400 bg-white rounded-xl border border-dashed border-[#D6E5E2]">
                      Chưa có lịch sử thay đổi trạng thái cho tài khoản này.
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {statusHistoryData.items.map((item) => (
                          <div
                            key={item.id}
                            className="p-3 bg-white rounded-xl border border-[#D6E5E2] shadow-2xs space-y-1.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <AdminStatusBadge
                                  label={
                                    item.fromStatus === "ACTIVE"
                                      ? "Hoạt động"
                                      : item.fromStatus === "BANNED"
                                      ? "Đã khóa"
                                      : item.fromStatus === "SUSPENDED"
                                      ? "Tạm ngưng"
                                      : item.fromStatus || "Khởi tạo"
                                  }
                                  type={
                                    item.fromStatus === "ACTIVE"
                                      ? "success"
                                      : item.fromStatus === "BANNED"
                                      ? "error"
                                      : "warning"
                                  }
                                />
                                <span className="text-xs text-slate-400 font-bold">→</span>
                                <AdminStatusBadge
                                  label={
                                    item.toStatus === "ACTIVE"
                                      ? "Hoạt động"
                                      : item.toStatus === "BANNED"
                                      ? "Đã khóa"
                                      : item.toStatus === "SUSPENDED"
                                      ? "Tạm ngưng"
                                      : item.toStatus
                                  }
                                  type={
                                    item.toStatus === "ACTIVE"
                                      ? "success"
                                      : item.toStatus === "BANNED"
                                      ? "error"
                                      : "warning"
                                  }
                                />
                              </div>
                              <span className="text-[11px] text-slate-400">
                                {dayjs(item.performedAt).format("HH:mm DD/MM/YYYY")}
                              </span>
                            </div>

                            {item.reason && (
                              <div className="text-xs text-slate-700 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                                <span className="font-semibold text-slate-500">Lý do: </span>
                                <span>{item.reason}</span>
                              </div>
                            )}

                            <div className="text-[11px] text-slate-400 flex items-center justify-between">
                              <span>
                                Người thực hiện:{" "}
                                <span className="font-medium text-slate-600">
                                  {item.performedBy?.fullName ||
                                    item.performedBy?.email ||
                                    (item.performedBy?.id ? `ID: ${item.performedBy.id}` : "Hệ thống / Admin")}
                                </span>
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {statusHistoryData.total > historyPageSize && (
                        <div className="flex justify-end pt-2">
                          <Pagination
                            size="small"
                            current={historyPage}
                            pageSize={historyPageSize}
                            total={statusHistoryData.total}
                            onChange={(p) => setHistoryPage(p)}
                            showSizeChanger={false}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* 6. MODAL STICKY FOOTER */}
        <div className="sticky bottom-0 z-20 px-6 py-3.5 bg-[#F0F8F6] border-t border-[#D6E5E2] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[#64748B] text-xs">
            <AuditOutlined className="text-[#0D9488] text-sm" />
            <span>
              Mọi thao tác đều được ghi log tự động vào{" "}
              <strong className="text-[#163B40]">Sổ cái Kiểm toán hệ thống</strong>.
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setSelectedUserId(null)}
              className="px-4 py-2 rounded-xl bg-white border border-[#D6E5E2] hover:bg-[#E5F5F1] text-[#163B40] text-xs font-bold transition-colors cursor-pointer"
            >
              Đóng (Esc)
            </button>
          </div>
        </div>
      </Modal>

      {/* Change Status Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-slate-900 font-bold">
            <StopOutlined className="text-amber-600" />
            <span>
              Thay đổi trạng thái tài khoản:{" "}
              {statusModalUser?.fullName || statusModalUser?.email || ""}
            </span>
          </div>
        }
        open={Boolean(statusModalUser)}
        onCancel={() => {
          setStatusModalUser(null);
          statusForm.resetFields();
        }}
        onOk={handleStatusSubmit}
        confirmLoading={updateStatusMutation.isPending}
        okText="Xác nhận cập nhật"
        cancelText="Hủy"
        destroyOnClose
      >
        <Form
          form={statusForm}
          layout="vertical"
          className="mt-4"
          initialValues={{
            status: statusModalUser?.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE",
          }}
        >
          <Alert
            type="info"
            showIcon
            className="mb-4 text-xs rounded-xl"
            message="Chính sách bảo mật"
            description="Khi tạm ngưng hoặc khóa tài khoản, toàn bộ phiên đăng nhập của người dùng sẽ bị hủy ngay lập tức và họ không thể truy cập hệ thống."
          />

          <Form.Item
            name="status"
            label="Trạng thái mới"
            rules={[{ required: true, message: "Vui lòng chọn trạng thái mới" }]}
          >
            <Select size="large" className="rounded-xl">
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
              const isReasonRequired =
                selectedStatus === "SUSPENDED" || selectedStatus === "BANNED";

              return (
                <Form.Item
                  name="reason"
                  label={`Lý do thay đổi trạng thái ${
                    isReasonRequired ? "(Bắt buộc)" : "(Tùy chọn)"
                  }`}
                  rules={[
                    {
                      validator: (_, value) => {
                        if (isReasonRequired && (!value || !value.trim())) {
                          return Promise.reject(
                            new Error("Vui lòng nhập lý do khi tạm ngưng hoặc khóa tài khoản")
                          );
                        }
                        if (value && value.trim().length > 500) {
                          return Promise.reject(
                            new Error("Lý do không được vượt quá 500 ký tự")
                          );
                        }
                        return Promise.resolve();
                      },
                    },
                  ]}
                >
                  <TextArea
                    rows={3}
                    placeholder="Nhập lý do chi tiết để lưu vết nhật ký quản trị..."
                    maxLength={500}
                    showCount
                    className="rounded-xl"
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
