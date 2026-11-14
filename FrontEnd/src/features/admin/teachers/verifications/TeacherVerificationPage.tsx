import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Typography, Button, Tag, Table, Avatar, Alert, Empty } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  MinusCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { Link, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { ROUTES } from '../../../../routes/routePaths';
import { teacherVerificationService } from '../../../../services/teacherVerification.service';
import type {
  AdminTeacherVerificationListItem,
  VerificationStatus,
} from '../../../../types/teacherVerification';
import { getFriendlyErrorMessage } from '../../../../utils/apiErrorMap';

const { Title, Text } = Typography;

const VALID_STATUSES: readonly VerificationStatus[] = [
  'PENDING',
  'VERIFIED',
  'REJECTED',
  'UNVERIFIED',
];

const STATUS_FILTERS: ReadonlyArray<{ value: VerificationStatus; label: string }> = [
  { value: 'PENDING', label: 'Chờ duyệt' },
  { value: 'VERIFIED', label: 'Đã xác minh' },
  { value: 'REJECTED', label: 'Từ chối' },
  { value: 'UNVERIFIED', label: 'Chưa gửi' },
];

const EMPTY_MESSAGES: Record<VerificationStatus, string> = {
  PENDING: 'Hiện không có hồ sơ giáo viên nào đang chờ duyệt.',
  VERIFIED: 'Chưa có hồ sơ giáo viên nào đã được xác minh.',
  REJECTED: 'Không có hồ sơ giáo viên nào bị từ chối.',
  UNVERIFIED: 'Không có tài khoản giáo viên nào ở trạng thái chưa gửi hồ sơ.',
};

const DEFAULT_STATUS: VerificationStatus = 'PENDING';
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

  const rawStatus = searchParams.get('status');
  const rawPage = searchParams.get('page');
  const rawPageSize = searchParams.get('pageSize');

  const activeStatus = parseStatusParam(rawStatus);
  const currentPage = parsePageParam(rawPage);
  const currentPageSize = parsePageSizeParam(rawPageSize);

  useEffect(() => {
    const canonicalPage = String(currentPage);
    const canonicalPageSize = String(currentPageSize);
    const keys = Array.from(searchParams.keys());
    const hasOnlyKnownKeys =
      keys.length === 3 &&
      keys.every((key) => key === 'status' || key === 'page' || key === 'pageSize');

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
    queryKey: ['admin-teacher-verifications', activeStatus, currentPage, currentPageSize],
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

  const getStatusTag = (status: VerificationStatus) => {
    switch (status) {
      case 'VERIFIED':
        return (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            Đã xác minh
          </Tag>
        );
      case 'PENDING':
        return (
          <Tag color="processing" icon={<ClockCircleOutlined />}>
            Chờ duyệt
          </Tag>
        );
      case 'UNVERIFIED':
        return (
          <Tag color="default" icon={<MinusCircleOutlined />}>
            Chưa gửi
          </Tag>
        );
      case 'REJECTED':
        return (
          <Tag color="error" icon={<CloseCircleOutlined />}>
            Từ chối
          </Tag>
        );
      default:
        return <Tag>{status}</Tag>;
    }
  };

  const columns: ColumnsType<AdminTeacherVerificationListItem> = [
    {
      title: 'Giáo viên',
      dataIndex: 'fullName',
      key: 'fullName',
      width: 260,
      render: (text: string, record: AdminTeacherVerificationListItem) => {
        const displayName = text?.trim() || record.email || 'Giáo viên';
        const initials = displayName.substring(0, 2).toUpperCase();
        const detailPath = ROUTES.ADMIN.TEACHER_VERIFICATION_DETAIL.replace(
          ':teacherId',
          record.teacherId
        );

        return (
          <div className="flex items-center gap-3">
            <Avatar className="bg-indigo-100 text-indigo-700 font-bold shrink-0">
              {initials}
            </Avatar>
            <div className="min-w-0">
              <Link
                to={detailPath}
                className="font-semibold text-gray-900 hover:text-indigo-600 transition-colors block truncate"
              >
                {displayName}
              </Link>
              <div className="text-xs text-gray-500 truncate">{record.email}</div>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Chuyên môn',
      dataIndex: 'qualificationSummary',
      key: 'qualificationSummary',
      width: 240,
      render: (text?: string) =>
        text ? (
          <Tag
            className="border-0 bg-gray-100 font-medium text-gray-700 max-w-[220px] truncate align-bottom"
            title={text}
          >
            {text}
          </Tag>
        ) : (
          <span className="text-gray-400">Không có</span>
        ),
    },
    {
      title: 'Ngày cập nhật',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 160,
      render: (date: string) => (date ? dayjs(date).format('DD/MM/YYYY HH:mm') : '—'),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'verificationStatus',
      key: 'verificationStatus',
      width: 150,
      render: (status: VerificationStatus, record: AdminTeacherVerificationListItem) =>
        record.isReverification ? <Tag color="processing">Tái xác minh</Tag> : getStatusTag(status),
    },
    {
      title: 'Hành động',
      key: 'action',
      width: 140,
      render: (_: unknown, record: AdminTeacherVerificationListItem) => {
        const detailPath = ROUTES.ADMIN.TEACHER_VERIFICATION_DETAIL.replace(
          ':teacherId',
          record.teacherId
        );
        return (
          <Link
            to={detailPath}
            className="inline-flex items-center justify-center h-8 px-3.5 rounded-lg border border-indigo-600 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-700 font-medium text-sm transition-colors whitespace-nowrap"
          >
            Xem hồ sơ
          </Link>
        );
      },
    },
  ];

  const totalCount = pagedVerifications?.total ?? 0;
  const items = pagedVerifications?.items ?? [];

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
          <Title level={2} className="!m-0 text-gray-900">
            Xác minh giáo viên
          </Title>
          <Text className="text-gray-500">
            Kiểm tra hồ sơ và xác minh năng lực sư phạm trước khi cho phép giáo viên mở lớp trên
            Edunity
          </Text>
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex gap-3 overflow-x-auto pb-1 md:pb-0 hide-scrollbar flex-1">
          {STATUS_FILTERS.map((filter) => {
            const isActive = activeStatus === filter.value;
            return (
              <Button
                key={filter.value}
                type={isActive ? 'primary' : 'default'}
                onClick={() => handleStatusChange(filter.value)}
                className={
                  isActive
                    ? 'bg-indigo-600 rounded-full'
                    : 'rounded-full border-0 bg-gray-50 text-gray-600 font-medium hover:text-indigo-600'
                }
              >
                {filter.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <Title level={4} className="!m-0 text-gray-800">
            Danh sách hàng đợi ({totalCount})
          </Title>
          <Button
            type="text"
            icon={<ReloadOutlined spin={isFetching} />}
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-indigo-600 font-medium"
          >
            Làm mới
          </Button>
        </div>

        {isError && (
          <Alert
            type="error"
            showIcon
            className="mb-4"
            message="Không thể tải danh sách xác minh."
            description={getFriendlyErrorMessage(
              error,
              'Đã xảy ra lỗi khi tải danh sách hồ sơ giáo viên. Vui lòng thử lại.'
            )}
            action={
              <Button
                size="small"
                type="primary"
                danger
                icon={<ReloadOutlined />}
                onClick={() => refetch()}
              >
                Thử lại
              </Button>
            }
          />
        )}

        <Table<AdminTeacherVerificationListItem>
          columns={columns}
          dataSource={items}
          rowKey="teacherId"
          loading={isLoading || isFetching}
          scroll={{ x: 800 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  isError ? 'Không thể tải dữ liệu hồ sơ.' : EMPTY_MESSAGES[activeStatus]
                }
              />
            ),
          }}
          pagination={{
            current: currentPage,
            pageSize: currentPageSize,
            total: totalCount,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (total) => `Tổng cộng ${total} hồ sơ`,
            onChange: handlePaginationChange,
          }}
        />
      </div>
    </div>
  );
}
