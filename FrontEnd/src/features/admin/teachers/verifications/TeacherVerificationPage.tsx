import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Avatar, Alert, Button, Empty, Select, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  MinusCircleOutlined,
  ReloadOutlined,
  FolderOpenOutlined,
  IdcardOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import { Link, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import { ROUTES } from "../../../../routes/routePaths";
import { teacherVerificationService } from "../../../../services/teacherVerification.service";
import type {
  AdminTeacherVerificationListItem,
  VerificationStatus,
} from "../../../../types/teacherVerification";
import { getFriendlyErrorMessage } from "../../../../utils/apiErrorMap";
import { AdminPageHero, AdminFilterBar, AdminTableCard } from "../../../../components/admin";
import AdminKpiCard from "../../../../components/admin/AdminKpiCard";
import AdminStatusBadge from "../../../../components/admin/AdminStatusBadge";

const VALID_STATUSES: readonly VerificationStatus[] = [
  "PENDING",
  "VERIFIED",
  "REJECTED",
  "UNVERIFIED",
];

const STATUS_FILTERS: ReadonlyArray<{
  value: VerificationStatus;
  label: string;
  icon: typeof ClockCircleOutlined;
}> = [
  { value: "PENDING", label: "Chờ duyệt", icon: ClockCircleOutlined },
  { value: "VERIFIED", label: "Đã xác minh", icon: CheckCircleOutlined },
  { value: "REJECTED", label: "Từ chối", icon: CloseCircleOutlined },
  { value: "UNVERIFIED", label: "Chưa gửi", icon: MinusCircleOutlined },
];

const EMPTY_MESSAGES: Record<VerificationStatus, string> = {
  PENDING: "Hiện không có hồ sơ giáo viên nào đang chờ duyệt.",
  VERIFIED: "Chưa có hồ sơ giáo viên nào đã được xác minh.",
  REJECTED: "Không có hồ sơ giáo viên nào bị từ chối.",
  UNVERIFIED: "Không có tài khoản giáo viên nào ở trạng thái chưa gửi hồ sơ.",
};

const DEFAULT_STATUS: VerificationStatus = "PENDING";
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

function parseStatusParam(raw: string | null): VerificationStatus {
  if (raw && (VALID_STATUSES as readonly string[]).includes(raw)) {
    return raw as VerificationStatus;
  }
  return DEFAULT_STATUS;
}

function parsePageParam(raw: string | null): number {
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_PAGE;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : DEFAULT_PAGE;
}

function parsePageSizeParam(raw: string | null): number {
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_PAGE_SIZE;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_PAGE_SIZE) {
    return DEFAULT_PAGE_SIZE;
  }
  return parsed;
}

export default function TeacherVerificationPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const rawStatus = searchParams.get("status");
  const rawPage = searchParams.get("page");
  const rawPageSize = searchParams.get("pageSize");

  const activeStatus = parseStatusParam(rawStatus);
  const currentPage = parsePageParam(rawPage);
  const currentPageSize = parsePageSizeParam(rawPageSize);

  useEffect(() => {
    const canonicalPage = String(currentPage);
    const canonicalPageSize = String(currentPageSize);
    const keys = Array.from(searchParams.keys());
    const hasOnlyKnownKeys =
      keys.length === 3 &&
      keys.every((key) => key === "status" || key === "page" || key === "pageSize");

    if (
      !hasOnlyKnownKeys ||
      rawStatus !== activeStatus ||
      rawPage !== canonicalPage ||
      rawPageSize !== canonicalPageSize
    ) {
      setSearchParams(
        {
          status: activeStatus,
          page: canonicalPage,
          pageSize: canonicalPageSize,
        },
        { replace: true }
      );
    }
  }, [
    activeStatus,
    currentPage,
    currentPageSize,
    rawStatus,
    rawPage,
    rawPageSize,
    searchParams,
    setSearchParams,
  ]);

  const {
    data: pagedVerifications,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-teacher-verifications", activeStatus, currentPage, currentPageSize],
    queryFn: () =>
      teacherVerificationService.adminListVerifications(
        activeStatus,
        currentPage,
        currentPageSize
      ),
  });

  useEffect(() => {
    if (!isLoading && !isFetching && !isError && pagedVerifications && currentPage > 1) {
      const maxPage = Math.max(1, pagedVerifications.totalPages);
      if (currentPage > maxPage) {
        setSearchParams(
          {
            status: activeStatus,
            page: String(maxPage),
            pageSize: String(currentPageSize),
          },
          { replace: true }
        );
      }
    }
  }, [
    activeStatus,
    currentPage,
    currentPageSize,
    isError,
    isFetching,
    isLoading,
    pagedVerifications,
    setSearchParams,
  ]);

  const handleStatusChange = (nextStatus: VerificationStatus) => {
    if (nextStatus === activeStatus && currentPage === DEFAULT_PAGE) return;
    setSearchParams({
      status: nextStatus,
      page: String(DEFAULT_PAGE),
      pageSize: String(currentPageSize),
    });
  };

  const handlePaginationChange = (nextPage: number, nextPageSize: number) => {
    const normalizedPageSize =
      nextPageSize >= 1 && nextPageSize <= MAX_PAGE_SIZE ? nextPageSize : DEFAULT_PAGE_SIZE;
    const targetPage =
      normalizedPageSize !== currentPageSize ? DEFAULT_PAGE : Math.max(1, nextPage);

    if (targetPage === currentPage && normalizedPageSize === currentPageSize) return;

    setSearchParams({
      status: activeStatus,
      page: String(targetPage),
      pageSize: String(normalizedPageSize),
    });
  };

  const columns: ColumnsType<AdminTeacherVerificationListItem> = [
    {
      title: "Giáo viên",
      dataIndex: "fullName",
      key: "fullName",
      width: 260,
      render: (text: string, record: AdminTeacherVerificationListItem) => {
        const displayName = text?.trim() || record.email || "Giáo viên";
        const initials = displayName.substring(0, 2).toUpperCase();
        const detailPath = ROUTES.ADMIN.TEACHER_VERIFICATION_DETAIL.replace(
          ":teacherId",
          record.teacherId
        );

        return (
          <div className="flex items-center gap-3">
            <Avatar className="bg-teal-50 text-teal-800 border border-teal-200 font-bold shrink-0">
              {initials}
            </Avatar>
            <div className="min-w-0">
              <Link
                to={detailPath}
                className="font-bold text-slate-900 hover:text-teal-700 transition-colors block truncate text-sm"
              >
                {displayName}
              </Link>
              <div className="text-xs text-slate-500 truncate">{record.email}</div>
            </div>
          </div>
        );
      },
    },
    {
      title: "Chuyên môn",
      dataIndex: "qualificationSummary",
      key: "qualificationSummary",
      width: 240,
      render: (text?: string) =>
        text ? (
          <span
            className="inline-block px-2.5 py-0.5 rounded-lg bg-[#F0F8F6] border border-[#D6E5E2] text-[#163B40] text-xs font-semibold max-w-[220px] truncate"
            title={text}
          >
            {text}
          </span>
        ) : (
          <span className="text-slate-400 text-xs">Không có</span>
        ),
    },
    {
      title: "Trạng thái",
      dataIndex: "verificationStatus",
      key: "verificationStatus",
      width: 150,
      render: (status: VerificationStatus) => {
        let badgeType: "success" | "warning" | "error" | "neutral" = "neutral";
        let label: string = status;
        if (status === "VERIFIED") {
          badgeType = "success";
          label = "Đã xác minh";
        } else if (status === "PENDING") {
          badgeType = "warning";
          label = "Chờ duyệt";
        } else if (status === "REJECTED") {
          badgeType = "error";
          label = "Từ chối";
        } else if (status === "UNVERIFIED") {
          badgeType = "neutral";
          label = "Chưa gửi";
        }
        return <AdminStatusBadge label={label} type={badgeType} pulse={status === "PENDING"} />;
      },
    },
    {
      title: "Cập nhật",
      dataIndex: "updatedAt",
      key: "updatedAt",
      width: 140,
      render: (date?: string) =>
        date ? (
          <span className="text-xs text-slate-500">
            {dayjs(date).format("DD/MM/YYYY")}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 140,
      align: "right" as const,
      render: (_: unknown, record: AdminTeacherVerificationListItem) => {
        const detailPath = ROUTES.ADMIN.TEACHER_VERIFICATION_DETAIL.replace(
          ":teacherId",
          record.teacherId
        );
        return (
          <Link
            to={detailPath}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-teal-800 bg-teal-50 hover:bg-teal-600 hover:text-white transition-all cursor-pointer shadow-2xs"
          >
            <span>Thẩm định</span>
            <ArrowRightOutlined className="text-[10px]" />
          </Link>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-5 w-full pb-10">
      <AdminPageHero
        icon={<IdcardOutlined />}
        title="Xác minh giáo viên"
        crumb="Giáo viên"
        description="Kiểm tra hồ sơ pháp lý, bằng cấp học thuật và phê duyệt năng lực sư phạm của đối tác giảng dạy."
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching} className="rounded-xl">
            Làm mới
          </Button>
        }
      />

      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminKpiCard
          title="Tổng hồ sơ"
          value={pagedVerifications?.total ? pagedVerifications.total.toLocaleString("vi-VN") : "—"}
          icon={<FolderOpenOutlined />}
          trend="+48 hồ sơ"
          trendDirection="up"
          trendSubtext="tháng này"
          variant="teal"
        />
        <AdminKpiCard
          title="Đã xác minh"
          value="1.420"
          icon={<CheckCircleOutlined />}
          trend="93.7%"
          trendDirection="up"
          trendSubtext="đạt chuẩn"
          variant="mint"
        />
        <AdminKpiCard
          title="Chờ duyệt gấp"
          value={activeStatus === "PENDING" && pagedVerifications ? pagedVerifications.total : "32"}
          icon={<ClockCircleOutlined />}
          trend="Ưu tiên 48h"
          trendDirection="neutral"
          variant="amber"
        />
        <AdminKpiCard
          title="Từ chối / Bổ sung"
          value="63"
          icon={<CloseCircleOutlined />}
          trend="4.1%"
          trendDirection="down"
          trendSubtext="tỷ lệ từ chối"
          variant="rose"
        />
      </div>

      {/* Main Table */}
      {isError ? (
        <Alert
          type="error"
          showIcon
          className="rounded-2xl"
          message="Không thể tải danh sách hồ sơ giáo viên"
          description={getFriendlyErrorMessage(error, "Đã xảy ra lỗi kết nối.")}
          action={
            <button
              onClick={() => refetch()}
              className="px-3 py-1 rounded-lg bg-rose-600 text-white text-xs font-semibold"
            >
              Thử lại
            </button>
          }
        />
      ) : (
        <AdminTableCard>
        <AdminFilterBar
          title="Bộ lọc hồ sơ"
          gridClassName="sm:grid-cols-[260px_auto]"
          hasFilter={activeStatus !== DEFAULT_STATUS}
          onReset={() => handleStatusChange(DEFAULT_STATUS)}
          summary={pagedVerifications ? <>Có <span className="font-semibold text-[#0F766E]">{pagedVerifications.total}</span> hồ sơ</> : null}
        >
          <Select
            aria-label="Lọc theo trạng thái"
            className="w-full"
            value={activeStatus}
            onChange={handleStatusChange}
            options={STATUS_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
          />
        </AdminFilterBar>
        <Table<AdminTeacherVerificationListItem>
          rowKey="teacherId"
          columns={columns}
          dataSource={pagedVerifications?.items || []}
          loading={isLoading}
          pagination={{
            current: currentPage,
            pageSize: currentPageSize,
            total: pagedVerifications?.total || 0,
            onChange: handlePaginationChange,
            showSizeChanger: true,
            showTotal: (total) => `Tổng số ${total} hồ sơ`,
          }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={EMPTY_MESSAGES[activeStatus]}
              />
            ),
          }}
        />
        </AdminTableCard>
      )}
    </div>
  );
}
