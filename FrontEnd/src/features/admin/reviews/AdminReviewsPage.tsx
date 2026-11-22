import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  Table,
  Tag,
  Button,
  Input,
  Select,
  Modal,
  Alert,
  Descriptions,
  message,
  Tooltip,
  Rate,
  Avatar,
} from "antd";
import {
  CommentOutlined,
  SearchOutlined,
  EyeOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  DeleteOutlined,
  EyeInvisibleOutlined,
  UserOutlined,
  BookOutlined,
  StarFilled,
  WarningOutlined,
  CheckCircleOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import AdminPageHeader from "../../../components/admin/AdminPageHeader";
import { reviewService } from "../../../services/review.service";
import type { AdminReviewItem, AdminReviewDetail } from "../../../types/communication";

export default function AdminReviewsPage() {
  const queryClient = useQueryClient();

  // Filter state
  const [statusFilter, setStatusFilter] = useState<"ALL" | "VISIBLE" | "HIDDEN" | "REPORTED">("ALL");
  const [ratingFilter, setRatingFilter] = useState<number | undefined>(undefined);
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Detail Modal state
  const [detailItem, setDetailItem] = useState<AdminReviewDetail | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);

  // Hide Modal state
  const [hideTarget, setHideTarget] = useState<AdminReviewItem | null>(null);
  const [isHideModalOpen, setIsHideModalOpen] = useState<boolean>(false);
  const [hideReason, setHideReason] = useState<string>("");

  // Unhide Modal state
  const [unhideTarget, setUnhideTarget] = useState<AdminReviewItem | null>(null);
  const [isUnhideModalOpen, setIsUnhideModalOpen] = useState<boolean>(false);

  // Soft Delete Modal state
  const [deleteTarget, setDeleteTarget] = useState<AdminReviewItem | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [deleteReason, setDeleteReason] = useState<string>("");

  // Query reviews
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["adminReviews", statusFilter, ratingFilter, searchKeyword, currentPage, pageSize],
    queryFn: () =>
      reviewService.adminListReviews({
        status: statusFilter,
        rating: ratingFilter,
        search: searchKeyword.trim() || undefined,
        page: currentPage,
        pageSize,
      }),
  });

  // Hide mutation
  const hideMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      reviewService.hideReview(id, reason),
    onSuccess: () => {
      message.success("Đã ẩn đánh giá khỏi trang công khai thành công!");
      setIsHideModalOpen(false);
      setIsDetailModalOpen(false);
      setHideTarget(null);
      setHideReason("");
      queryClient.invalidateQueries({ queryKey: ["adminReviews"] });
    },
    onError: (err: any) => {
      message.error(err?.message || "Không thể ẩn đánh giá này");
    },
  });

  // Unhide mutation
  const unhideMutation = useMutation({
    mutationFn: (id: string) => reviewService.unhideReview(id),
    onSuccess: () => {
      message.success("Đã hiển thị lại đánh giá công khai thành công!");
      setIsUnhideModalOpen(false);
      setIsDetailModalOpen(false);
      setUnhideTarget(null);
      queryClient.invalidateQueries({ queryKey: ["adminReviews"] });
    },
    onError: (err: any) => {
      message.error(err?.message || "Không thể hiển thị lại đánh giá này");
    },
  });

  // Soft delete mutation
  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      reviewService.deleteReview(id, reason),
    onSuccess: () => {
      message.success("Đã chuyển đánh giá vào Thùng rác thành công!");
      setIsDeleteModalOpen(false);
      setIsDetailModalOpen(false);
      setDeleteTarget(null);
      setDeleteReason("");
      queryClient.invalidateQueries({ queryKey: ["adminReviews"] });
      queryClient.invalidateQueries({ queryKey: ["adminTrash"] });
    },
    onError: (err: any) => {
      message.error(err?.message || "Không thể chuyển vào Thùng rác");
    },
  });

  // Open detail
  const handleOpenDetail = async (record: AdminReviewItem) => {
    setDetailLoading(true);
    setIsDetailModalOpen(true);
    try {
      const fullDetail = await reviewService.adminGetReviewDetail(record.id);
      setDetailItem(fullDetail);
    } catch {
      setDetailItem(record as unknown as AdminReviewDetail);
    } finally {
      setDetailLoading(false);
    }
  };

  const columns = [
    {
      title: "Học viên",
      key: "student",
      width: 200,
      render: (_: any, record: AdminReviewItem) => (
        <div className="flex items-center gap-2.5">
          <Avatar
            src={record.student?.avatarUrl}
            icon={<UserOutlined />}
            className="bg-[#0D9488] shrink-0"
            size="small"
          />
          <div className="truncate">
            <div className="font-semibold text-xs text-[#163B40] truncate">
              {record.student?.fullName || "Học viên"}
            </div>
            {record.student?.email && (
              <div className="text-[11px] text-slate-500 truncate">{record.student.email}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      title: "Lớp học / Giảng viên",
      key: "class",
      width: 220,
      render: (_: any, record: AdminReviewItem) => (
        <div className="space-y-0.5">
          <div className="text-xs font-semibold text-teal-800 flex items-center gap-1">
            <BookOutlined className="text-[11px]" />
            <span className="truncate">{record.class?.className || "Lớp học"}</span>
          </div>
          <div className="text-[11px] text-slate-500">
            GV: <span className="font-medium text-slate-700">{record.teacher?.fullName || "Chưa rõ"}</span>
          </div>
        </div>
      ),
    },
    {
      title: "Nội dung bình luận",
      key: "comment",
      render: (_: any, record: AdminReviewItem) => (
        <div className="space-y-1 max-w-md">
          <div className="text-xs text-slate-700 line-clamp-2">
            {record.comment ? (
              record.comment
            ) : (
              <span className="text-slate-400 italic">Không có bình luận chữ, chỉ chấm sao</span>
            )}
          </div>
          {record.hasReports && (
            <div className="flex items-center gap-1 text-[11px] text-red-600 font-semibold">
              <WarningOutlined />
              <span>Có {record.reportsCount} báo cáo vi phạm</span>
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Đánh giá",
      dataIndex: "rating",
      key: "rating",
      width: 100,
      align: "center" as const,
      render: (rating: number) => (
        <Tag color="gold" className="font-bold flex items-center justify-center gap-1 w-14 mx-auto">
          <StarFilled className="text-amber-500 text-xs" />
          <span>{rating}/5</span>
        </Tag>
      ),
    },
    {
      title: "Trạng thái",
      key: "status",
      width: 130,
      align: "center" as const,
      render: (_: any, record: AdminReviewItem) => {
        if (record.isDeleted) {
          return (
            <Tag color="red" className="font-semibold text-xs">
              Thùng rác
            </Tag>
          );
        }
        if (record.isHidden) {
          return (
            <Tooltip title={record.hideReason ? `Lý do: ${record.hideReason}` : "Đang bị ẩn"}>
              <Tag color="orange" icon={<EyeInvisibleOutlined />} className="font-semibold text-xs">
                Đã ẩn
              </Tag>
            </Tooltip>
          );
        }
        return (
          <Tag color="cyan" icon={<CheckCircleOutlined />} className="font-semibold text-xs">
            Hiển thị
          </Tag>
        );
      },
    },
    {
      title: "Ngày đăng",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 140,
      render: (val: string) => (
        <span className="text-xs text-slate-500">
          {val ? dayjs(val).format("DD/MM/YYYY HH:mm") : "—"}
        </span>
      ),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 190,
      align: "center" as const,
      render: (_: any, record: AdminReviewItem) => (
        <div className="flex items-center justify-center gap-1">
          <Tooltip title="Xem chi tiết & lịch sử kiểm duyệt">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleOpenDetail(record)}
              className="border-[#D6E5E2] text-slate-700 hover:text-[#0D9488] hover:border-[#0D9488] rounded-lg text-xs"
            >
              Chi tiết
            </Button>
          </Tooltip>

          {!record.isDeleted && (
            <>
              {record.isHidden ? (
                <Tooltip title="Hiển thị lại công khai">
                  <Button
                    type="primary"
                    size="small"
                    onClick={() => {
                      setUnhideTarget(record);
                      setIsUnhideModalOpen(true);
                    }}
                    className="bg-[#0D9488] hover:bg-[#0B746C] text-white rounded-lg text-xs font-medium"
                  >
                    Hiện lại
                  </Button>
                </Tooltip>
              ) : (
                <Tooltip title="Ẩn khỏi trang công khai">
                  <Button
                    size="small"
                    onClick={() => {
                      setHideTarget(record);
                      setHideReason("");
                      setIsHideModalOpen(true);
                    }}
                    className="border-amber-400 text-amber-700 hover:bg-amber-50 rounded-lg text-xs font-medium"
                  >
                    Ẩn
                  </Button>
                </Tooltip>
              )}

              <Tooltip title="Chuyển vào Thùng rác">
                <Button
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => {
                    setDeleteTarget(record);
                    setDeleteReason("");
                    setIsDeleteModalOpen(true);
                  }}
                  className="rounded-lg text-xs"
                />
              </Tooltip>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      {/* Header */}
      <AdminPageHeader
        eyebrow="Vận hành lớp học"
        eyebrowIcon={<CommentOutlined />}
        title="Quản lý đánh giá và bình luận"
        description="Kiểm duyệt, ẩn hoặc khôi phục các đánh giá và bình luận của học viên đối với lớp học và giảng viên."
        extra={
          <Button
            icon={<ReloadOutlined spin={isFetching} />}
            onClick={() => refetch()}
            className="border-[#D6E5E2] text-[#0F766E] hover:border-[#0D9488] font-medium rounded-xl h-10"
          >
            Làm mới
          </Button>
        }
      />

      {/* Main Filter & Table Card */}
      <Card className="rounded-2xl shadow-xs border-[#D6E5E2] p-2 bg-white">
        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5 pb-4 border-b border-[#F0FDFA]">
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {/* Status Filter */}
            <Select
              value={statusFilter}
              onChange={(val) => {
                setStatusFilter(val);
                setCurrentPage(1);
              }}
              className="w-full sm:w-[180px] h-10 font-semibold"
              options={[
                { value: "ALL", label: "Tất cả trạng thái" },
                { value: "VISIBLE", label: "🟢 Đang hiển thị" },
                { value: "HIDDEN", label: "🟡 Đã ẩn" },
                { value: "REPORTED", label: "🔴 Bị báo cáo vi phạm" },
              ]}
            />

            {/* Rating Filter */}
            <Select
              value={ratingFilter}
              onChange={(val) => {
                setRatingFilter(val);
                setCurrentPage(1);
              }}
              allowClear
              placeholder="Lọc theo số sao"
              className="w-full sm:w-[150px] h-10"
              options={[
                { value: 5, label: "⭐⭐⭐⭐⭐ (5 sao)" },
                { value: 4, label: "⭐⭐⭐⭐ (4 sao)" },
                { value: 3, label: "⭐⭐⭐ (3 sao)" },
                { value: 2, label: "⭐⭐ (2 sao)" },
                { value: 1, label: "⭐ (1 sao)" },
              ]}
            />

            {/* Keyword Search */}
            <Input
              placeholder="Tìm theo nội dung bình luận..."
              prefix={<SearchOutlined className="text-[#0D9488] mr-1" />}
              value={searchKeyword}
              onChange={(e) => {
                setSearchKeyword(e.target.value);
                setCurrentPage(1);
              }}
              allowClear
              className="w-full sm:w-[280px] h-10 rounded-xl border-[#D6E5E2]"
            />
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Tổng số đánh giá:{" "}
            <strong className="text-[#0D9488] text-sm font-bold">{data?.total ?? 0}</strong>
          </div>
        </div>

        {/* Table */}
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data?.items || []}
          loading={isLoading}
          locale={{
            emptyText: isError ? (
              <div className="py-12 text-center">
                <ExclamationCircleOutlined className="text-3xl text-red-500 mb-2" />
                <div className="font-bold text-slate-800 text-base">Không thể tải danh sách đánh giá</div>
                <div className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Đã xảy ra lỗi khi kết nối máy chủ. Vui lòng thử lại sau.
                </div>
                <Button
                  type="primary"
                  size="small"
                  onClick={() => refetch()}
                  className="mt-4 bg-[#0D9488] hover:bg-[#0B746C] text-white rounded-lg"
                >
                  Thử lại
                </Button>
              </div>
            ) : searchKeyword.trim() || statusFilter !== "ALL" || ratingFilter ? (
              <div className="py-12 text-center">
                <SearchOutlined className="text-3xl text-slate-400 mb-2" />
                <div className="font-bold text-slate-800 text-base">Không tìm thấy đánh giá phù hợp</div>
                <div className="text-xs text-slate-500 mt-1">
                  Không có bản ghi nào khớp với điều kiện tìm kiếm hoặc bộ lọc.
                </div>
              </div>
            ) : (
              <div className="py-12 text-center">
                <CommentOutlined className="text-3xl text-slate-300 mb-2" />
                <div className="font-bold text-slate-800 text-base">Chưa có đánh giá nào</div>
                <div className="text-xs text-slate-500 mt-1">Chưa có học viên nào gửi đánh giá hoặc bình luận.</div>
              </div>
            ),
          }}
          pagination={{
            current: currentPage,
            pageSize,
            total: data?.total || 0,
            onChange: (p, ps) => {
              setCurrentPage(p);
              if (ps) setPageSize(ps);
            },
            showTotal: (total) => `Tổng số ${total} đánh giá`,
          }}
          className="overflow-x-auto"
        />
      </Card>

      {/* Detail Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-[#163B40] font-bold text-base">
            <EyeOutlined className="text-[#0D9488]" />
            <span>Chi tiết đánh giá & kiểm duyệt</span>
          </div>
        }
        open={isDetailModalOpen}
        onCancel={() => setIsDetailModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setIsDetailModalOpen(false)}>
            Đóng
          </Button>,
          detailItem && !detailItem.isDeleted && detailItem.isHidden && (
            <Button
              key="unhide"
              type="primary"
              onClick={() => {
                setUnhideTarget(detailItem);
                setIsUnhideModalOpen(true);
              }}
              className="bg-[#0D9488] hover:bg-[#0B746C] text-white"
            >
              Hiện lại công khai
            </Button>
          ),
          detailItem && !detailItem.isDeleted && !detailItem.isHidden && (
            <Button
              key="hide"
              onClick={() => {
                setHideTarget(detailItem);
                setHideReason("");
                setIsHideModalOpen(true);
              }}
              className="border-amber-400 text-amber-700 hover:bg-amber-50"
            >
              Ẩn bình luận
            </Button>
          ),
          detailItem && !detailItem.isDeleted && (
            <Button
              key="delete"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                setDeleteTarget(detailItem);
                setDeleteReason("");
                setIsDeleteModalOpen(true);
              }}
            >
              Chuyển vào Thùng rác
            </Button>
          ),
        ]}
        width={680}
      >
        {detailLoading ? (
          <div className="py-8 text-center text-slate-500">Đang tải chi tiết...</div>
        ) : detailItem ? (
          <div className="space-y-4 pt-2">
            {/* Status alerts */}
            {detailItem.isDeleted ? (
              <Alert
                type="error"
                showIcon
                message="Đánh giá đang nằm trong Thùng rác (Xóa mềm)"
                description={`Xóa bởi: ${detailItem.deletedBy?.fullName || "Quản trị viên"}. Lý do: ${detailItem.deleteReason || "Chưa có lý do"}`}
                className="rounded-xl border-red-200"
              />
            ) : detailItem.isHidden ? (
              <Alert
                type="warning"
                showIcon
                icon={<EyeInvisibleOutlined />}
                message="Đánh giá này đang bị Ẩn khỏi trang công khai"
                description={`Người ẩn: ${detailItem.hiddenBy?.fullName || "Quản trị viên"} lúc ${detailItem.hiddenAt ? dayjs(detailItem.hiddenAt).format("DD/MM/YYYY HH:mm") : "—"}. Lý do: ${detailItem.hideReason || "Nội dung không phù hợp"}`}
                className="rounded-xl border-amber-200 bg-amber-50 text-amber-900"
              />
            ) : (
              <Alert
                type="success"
                showIcon
                icon={<CheckCircleOutlined />}
                message="Đang hiển thị công khai"
                description="Học viên và công chúng có thể nhìn thấy đánh giá này trên trang chi tiết lớp học và giảng viên."
                className="rounded-xl border-emerald-200"
              />
            )}

            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Người đánh giá">
                <div className="flex items-center gap-2">
                  <Avatar src={detailItem.student?.avatarUrl} icon={<UserOutlined />} size="small" />
                  <div>
                    <strong className="text-slate-800">{detailItem.student?.fullName || "Học viên"}</strong>
                    {detailItem.student?.email && (
                      <span className="text-slate-500 text-xs ml-2">({detailItem.student.email})</span>
                    )}
                  </div>
                </div>
              </Descriptions.Item>
              <Descriptions.Item label="Lớp học">
                <span className="font-semibold text-teal-800">{detailItem.class?.className || "Lớp học"}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Giảng viên">
                <span>{detailItem.teacher?.fullName || "Giảng viên"}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Số sao đánh giá">
                <div className="flex items-center gap-2">
                  <Rate disabled value={detailItem.rating} className="text-amber-500 text-sm" />
                  <span className="font-bold text-xs text-slate-700">({detailItem.rating}/5 sao)</span>
                </div>
              </Descriptions.Item>
              <Descriptions.Item label="Nội dung bình luận">
                <div className="p-2.5 bg-slate-50 rounded-lg text-slate-800 text-sm whitespace-pre-wrap leading-relaxed border border-slate-200">
                  {detailItem.comment || <span className="text-slate-400 italic">Không có bình luận chữ</span>}
                </div>
              </Descriptions.Item>
              <Descriptions.Item label="Thời gian đăng">
                {detailItem.createdAt ? dayjs(detailItem.createdAt).format("DD/MM/YYYY HH:mm:ss") : "—"}
              </Descriptions.Item>
            </Descriptions>

            {/* Reports list */}
            {detailItem.reports && detailItem.reports.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="text-xs font-bold text-red-600 flex items-center gap-1.5">
                  <WarningOutlined />
                  <span>Danh sách báo cáo vi phạm ({detailItem.reports.length})</span>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {detailItem.reports.map((rep) => (
                    <div key={rep.id} className="p-2 rounded-lg bg-red-50 border border-red-200 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-red-800">{rep.type}</span>
                        <Tag color={rep.status === "OPEN" ? "red" : "default"}>{rep.status}</Tag>
                      </div>
                      <div className="text-slate-700">{rep.description}</div>
                      <div className="text-[11px] text-slate-500">
                        Bởi: {rep.reporter?.fullName || rep.reporter?.email || "Người dùng"} • {dayjs(rep.createdAt).format("DD/MM/YYYY HH:mm")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Audit log history */}
            {detailItem.auditLogs && detailItem.auditLogs.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="text-xs font-bold text-[#163B40] flex items-center gap-1.5">
                  <HistoryOutlined />
                  <span>Lịch sử kiểm duyệt (Nhật ký quản trị)</span>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {detailItem.auditLogs.map((log) => (
                    <div key={log.id} className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-center justify-between">
                      <div>
                        <Tag color="blue" className="font-mono">{log.action}</Tag>
                        <span className="text-slate-600 ml-1">bởi {log.adminEmail}</span>
                      </div>
                      <span className="text-slate-400 text-[11px]">{dayjs(log.createdAt).format("DD/MM/YYYY HH:mm:ss")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      {/* Hide Confirmation Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-amber-700 font-bold text-base">
            <EyeInvisibleOutlined />
            <span>Xác nhận ẩn bình luận</span>
          </div>
        }
        open={isHideModalOpen}
        onCancel={() => {
          setIsHideModalOpen(false);
          setHideTarget(null);
          setHideReason("");
        }}
        confirmLoading={hideMutation.isPending}
        okText="Xác nhận ẩn"
        cancelText="Hủy"
        okButtonProps={{ className: "bg-amber-600 hover:bg-amber-700 text-white" }}
        onOk={() => {
          if (hideTarget) {
            hideMutation.mutate({ id: hideTarget.id, reason: hideReason.trim() || undefined });
          }
        }}
        width={480}
      >
        {hideTarget && (
          <div className="space-y-3 pt-2">
            <p className="text-sm text-slate-700 leading-relaxed">
              Bạn có chắc chắn muốn ẩn bình luận của học viên{" "}
              <strong className="text-[#163B40]">{hideTarget.student?.fullName || "Học viên"}</strong>{" "}
              khỏi trang công khai không?
            </p>
            <Alert
              type="info"
              showIcon
              message="Tự động tính lại điểm đánh giá"
              description="Nội dung sẽ không xuất hiện công khai. Điểm đánh giá trung bình của lớp và giảng viên sẽ được tự động cập nhật trừ bớt đánh giá này."
              className="rounded-xl border-amber-200 bg-amber-50 text-xs text-amber-900"
            />
            <div>
              <div className="text-xs text-slate-700 mb-1 font-medium">Lý do ẩn (ghi nhận kiểm duyệt):</div>
              <Input.TextArea
                placeholder="Nhập lý do ẩn bình luận (ví dụ: chứa nội dung quấy rối, ngôn từ không phù hợp...)"
                rows={2}
                value={hideReason}
                onChange={(e) => setHideReason(e.target.value)}
                className="rounded-xl border-[#D6E5E2] text-xs"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Unhide Confirmation Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-[#0D9488] font-bold text-base">
            <CheckCircleOutlined />
            <span>Xác nhận hiển thị lại bình luận</span>
          </div>
        }
        open={isUnhideModalOpen}
        onCancel={() => {
          setIsUnhideModalOpen(false);
          setUnhideTarget(null);
        }}
        confirmLoading={unhideMutation.isPending}
        okText="Hiển thị lại"
        cancelText="Hủy"
        okButtonProps={{ className: "bg-[#0D9488] hover:bg-[#0B746C] text-white" }}
        onOk={() => {
          if (unhideTarget) {
            unhideMutation.mutate(unhideTarget.id);
          }
        }}
        width={480}
      >
        {unhideTarget && (
          <div className="space-y-3 pt-2">
            <p className="text-sm text-slate-700 leading-relaxed">
              Khôi phục trạng thái hiển thị công khai cho đánh giá của học viên{" "}
              <strong className="text-[#163B40]">{unhideTarget.student?.fullName || "Học viên"}</strong>?
            </p>
            <Alert
              type="info"
              showIcon
              message="Khôi phục điểm số công khai"
              description="Bình luận sẽ xuất hiện trở lại trên trang chi tiết lớp học và hồ sơ giảng viên. Điểm số sẽ được cộng dồn lại vào số liệu thống kê."
              className="rounded-xl border-[#CCFBF1] bg-[#F0FDFA] text-xs text-slate-700"
            />
          </div>
        )}
      </Modal>

      {/* Soft Delete Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-red-600 font-bold text-base">
            <DeleteOutlined />
            <span>Chuyển đánh giá vào Thùng rác</span>
          </div>
        }
        open={isDeleteModalOpen}
        onCancel={() => {
          setIsDeleteModalOpen(false);
          setDeleteTarget(null);
          setDeleteReason("");
        }}
        confirmLoading={deleteMutation.isPending}
        okText="Chuyển vào Thùng rác"
        cancelText="Hủy"
        okButtonProps={{ danger: true, type: "primary" }}
        onOk={() => {
          if (deleteTarget) {
            deleteMutation.mutate({ id: deleteTarget.id, reason: deleteReason.trim() || undefined });
          }
        }}
        width={480}
      >
        {deleteTarget && (
          <div className="space-y-3 pt-2">
            <p className="text-sm text-slate-700 leading-relaxed">
              Bạn có chắc chắn muốn xóa mềm đánh giá của{" "}
              <strong className="text-[#163B40]">{deleteTarget.student?.fullName || "Học viên"}</strong>{" "}
              vào Thùng rác không?
            </p>
            <Alert
              type="warning"
              showIcon
              message="Chính sách Xóa mềm an toàn"
              description="Đánh giá sẽ được chuyển vào Thùng rác hệ thống và có thể khôi phục bất cứ lúc nào từ Admin -> Thùng rác."
              className="rounded-xl border-amber-200 bg-amber-50 text-xs text-amber-900"
            />
            <div>
              <div className="text-xs text-slate-700 mb-1 font-medium">Lý do xóa mềm:</div>
              <Input.TextArea
                placeholder="Nhập lý do xóa đánh giá này..."
                rows={2}
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className="rounded-xl border-[#D6E5E2] text-xs"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
