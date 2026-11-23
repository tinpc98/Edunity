import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  Table,
  Tag,
  Button,
  Input,
  Tabs,
  Modal,
  Alert,
  Descriptions,
  message,
  Tooltip,
} from "antd";
import {
  DeleteOutlined,
  SearchOutlined,
  UndoOutlined,
  EyeOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  StopOutlined,
  FolderOutlined,
  ReadOutlined,
  BookOutlined,
  CommentOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import AdminPageHeader from "../../../components/admin/AdminPageHeader";
import { trashService } from "../../../services/trash.service";
import type { TrashItem, TrashType } from "../../../types/trash";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";

const TYPE_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  CATEGORY: { label: "Danh mục", color: "cyan", icon: <FolderOutlined /> },
  SUBJECT: { label: "Môn học", color: "blue", icon: <ReadOutlined /> },
  COURSE: { label: "Khóa học", color: "purple", icon: <BookOutlined /> },
  CLASS: { label: "Lớp học", color: "orange", icon: <BookOutlined /> },
  REVIEW: { label: "Đánh giá", color: "green", icon: <CommentOutlined /> },
};

export default function AdminTrashPage() {
  const queryClient = useQueryClient();

  // Filters state
  const [selectedType, setSelectedType] = useState<TrashType>("ALL");
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Detail Modal state
  const [detailItem, setDetailItem] = useState<TrashItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);

  // Restore Confirmation Modal state
  const [restoreTarget, setRestoreTarget] = useState<TrashItem | null>(null);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState<boolean>(false);

  // Permanent Delete Confirmation Modal state
  const [permanentTarget, setPermanentTarget] = useState<TrashItem | null>(null);
  const [isPermanentModalOpen, setIsPermanentModalOpen] = useState<boolean>(false);
  const [permanentConfirmText, setPermanentConfirmText] = useState<string>("");
  const [permanentReason, setPermanentReason] = useState<string>("");
  const [preflightLoading, setPreflightLoading] = useState<boolean>(false);

  // Query trash items
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["adminTrash", selectedType, searchKeyword, currentPage, pageSize],
    queryFn: () =>
      trashService.listTrash({
        type: selectedType,
        search: searchKeyword.trim() || undefined,
        page: currentPage,
        pageSize,
      }),
  });

  // Restore mutation
  const restoreMutation = useMutation({
    mutationFn: ({ type, id }: { type: string; id: string }) =>
      trashService.restoreTrashItem(type, id),
    onSuccess: () => {
      message.success("Khôi phục dữ liệu thành công!");
      setIsRestoreModalOpen(false);
      setIsDetailModalOpen(false);
      setRestoreTarget(null);
      queryClient.invalidateQueries({ queryKey: ["adminTrash"] });
      // Invalidate related catalog / class queries
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["adminPendingClasses"] });
    },
    onError: (err: unknown) => {
      const msg = getFriendlyErrorMessage(err, "Không thể khôi phục bản ghi này");
      message.error(msg);
    },
  });

  // Permanent delete mutation
  const permanentMutation = useMutation({
    mutationFn: ({
      type,
      id,
      reason,
    }: {
      type: string;
      id: string;
      reason?: string;
    }) => trashService.permanentDeleteTrashItem(type, id, reason),
    onSuccess: () => {
      message.success("Xóa vĩnh viễn dữ liệu thành công!");
      setIsPermanentModalOpen(false);
      setIsDetailModalOpen(false);
      setPermanentTarget(null);
      setPermanentConfirmText("");
      setPermanentReason("");
      queryClient.invalidateQueries({ queryKey: ["adminTrash"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["adminPendingClasses"] });
    },
    onError: (err: unknown) => {
      const msg = getFriendlyErrorMessage(err, "Không thể xóa vĩnh viễn bản ghi này");
      message.error(msg);
    },
  });

  // Open detail with pre-flight check
  const handleOpenDetail = async (record: TrashItem) => {
    setDetailLoading(true);
    setIsDetailModalOpen(true);
    try {
      const fullDetail = await trashService.getTrashDetail(record.type, record.id);
      setDetailItem(fullDetail);
    } catch {
      setDetailItem(record);
    } finally {
      setDetailLoading(false);
    }
  };

  // Open restore confirmation
  const handleOpenRestoreConfirm = async (record: TrashItem) => {
    try {
      const preflight = await trashService.getTrashDetail(record.type, record.id);
      setRestoreTarget(preflight);
    } catch {
      setRestoreTarget(record);
    }
    setIsRestoreModalOpen(true);
  };

  // Open permanent delete confirmation
  const handleOpenPermanentConfirm = async (record: TrashItem) => {
    setPermanentTarget(record);
    setPermanentConfirmText("");
    setPermanentReason("");
    setIsPermanentModalOpen(true);
    setPreflightLoading(true);
    try {
      const preflight = await trashService.getTrashDetail(record.type, record.id);
      setPermanentTarget(preflight);
    } catch {
      setPermanentTarget(record);
    } finally {
      setPreflightLoading(false);
    }
  };

  const columns = [
    {
      title: "Tên bản ghi",
      key: "title",
      render: (_: any, record: TrashItem) => (
        <div className="space-y-0.5 max-w-md">
          <div className="font-bold text-sm text-[#163B40] leading-snug">
            {/* The type tab already says it; "Tất cả" still needs to tell rows apart */}
            {selectedType === "ALL" && (
              <Tag color={TYPE_CONFIG[record.type]?.color} className="mr-2 text-[11px] font-semibold">
                {TYPE_CONFIG[record.type]?.label || record.type}
              </Tag>
            )}
            {record.title}
          </div>
          <div className="text-xs text-slate-500 font-mono">
            {record.codeOrSlug}
            {record.parentInfo && (
              <span className="text-teal-700 ml-2 font-sans font-medium">
                • {record.parentInfo}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      title: "Ngày xóa",
      dataIndex: "deletedAt",
      key: "deletedAt",
      width: 160,
      render: (val: string) => (
        <span className="text-xs text-slate-600 font-medium">
          {val ? dayjs(val).format("DD/MM/YYYY HH:mm") : "—"}
        </span>
      ),
    },
    {
      title: "Người xóa",
      dataIndex: "deletedBy",
      key: "deletedBy",
      width: 170,
      render: (actor: TrashItem["deletedBy"]) => (
        <div className="text-xs">
          <span className="font-semibold text-slate-800">
            {actor?.fullName || "Quản trị viên"}
          </span>
          {actor?.email && (
            <div className="text-[11px] text-slate-500 truncate max-w-[150px]">{actor.email}</div>
          )}
        </div>
      ),
    },
    {
      title: "Lý do xóa",
      dataIndex: "deleteReason",
      key: "deleteReason",
      render: (reason: string) => (
        <div className="text-xs text-slate-600 line-clamp-2 italic">
          {reason || <span className="text-slate-400">Chưa ghi nhận lý do</span>}
        </div>
      ),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 230,
      align: "center" as const,
      render: (_: any, record: TrashItem) => (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <Tooltip title="Xem chi tiết và kiểm tra liên kết">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleOpenDetail(record)}
              className="border-[#D6E5E2] text-slate-700 hover:text-[#0D9488] hover:border-[#0D9488] rounded-lg text-xs"
            >
              Chi tiết
            </Button>
          </Tooltip>
          <Tooltip title="Khôi phục về trạng thái hoạt động">
            <Button
              type="primary"
              size="small"
              icon={<UndoOutlined />}
              onClick={() => handleOpenRestoreConfirm(record)}
              className="bg-[#0D9488] hover:bg-[#0B746C] text-white border-none font-medium rounded-lg text-xs"
            >
              Khôi phục
            </Button>
          </Tooltip>
          <Tooltip
            title={
              record.canPermanentDelete === false
                ? record.permanentDeleteBlockReason || "Không đủ điều kiện xóa vĩnh viễn do còn dữ liệu phụ thuộc"
                : "Xóa vĩnh viễn dữ liệu khỏi hệ thống"
            }
          >
            <Button
              danger
              size="small"
              icon={<DeleteOutlined />}
              disabled={record.canPermanentDelete === false}
              onClick={() => handleOpenPermanentConfirm(record)}
              className="font-medium rounded-lg text-xs"
            >
              Xóa vĩnh viễn
            </Button>
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      {/* Header */}
      <AdminPageHeader
        eyebrow="Vận hành hệ thống"
        eyebrowIcon={<DeleteOutlined />}
        title="Thùng rác"
        description="Quản lý, khôi phục hoặc xóa vĩnh viễn các dữ liệu đã được chuyển vào Thùng rác."
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
        <Tabs
          activeKey={selectedType}
          onChange={(key) => {
            setSelectedType(key as TrashType);
            setCurrentPage(1);
          }}
          className="font-medium"
          items={[
            { key: "ALL", label: "Tất cả", icon: <DeleteOutlined /> },
            ...Object.entries(TYPE_CONFIG).map(([key, config]) => ({
              key,
              label: config.label,
              icon: config.icon,
            })),
          ]}
        />

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5 pb-4 border-b border-[#F0FDFA]">
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <Input
              placeholder="Tìm theo tên bản ghi, slug, mã..."
              prefix={<SearchOutlined className="text-[#0D9488] mr-1" />}
              value={searchKeyword}
              onChange={(e) => {
                setSearchKeyword(e.target.value);
                setCurrentPage(1);
              }}
              allowClear
              className="w-full sm:w-[320px] h-10 rounded-xl border-[#D6E5E2]"
            />
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Số bản ghi:{" "}
            <strong className="text-[#0D9488] text-sm font-bold">{data?.total ?? 0}</strong>
          </div>
        </div>

        {/* Table with custom empty states */}
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data?.items || []}
          loading={isLoading}
          locale={{
            emptyText: isError ? (
              <div className="py-12 text-center">
                <ExclamationCircleOutlined className="text-3xl text-red-500 mb-2" />
                <div className="font-bold text-slate-800 text-base">Không thể tải dữ liệu Thùng rác</div>
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
            ) : searchKeyword.trim() || selectedType !== "ALL" ? (
              <div className="py-12 text-center">
                <SearchOutlined className="text-3xl text-slate-400 mb-2" />
                <div className="font-bold text-slate-800 text-base">Không tìm thấy dữ liệu phù hợp</div>
                <div className="text-xs text-slate-500 mt-1">
                  Không có bản ghi nào khớp với điều kiện tìm kiếm hoặc bộ lọc.
                </div>
              </div>
            ) : (
              <div className="py-12 text-center">
                <DeleteOutlined className="text-3xl text-slate-300 mb-2" />
                <div className="font-bold text-slate-800 text-base">Thùng rác hiện trống</div>
                <div className="text-xs text-slate-500 mt-1">Chưa có dữ liệu nào được xóa mềm.</div>
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
            showTotal: (total) => `Tổng số ${total} bản ghi trong Thùng rác`,
          }}
          className="overflow-x-auto"
        />
      </Card>

      {/* Detail Modal with Pre-flight Check */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-[#163B40] font-bold text-base">
            <EyeOutlined className="text-[#0D9488]" />
            <span>Chi tiết bản ghi trong Thùng rác</span>
          </div>
        }
        open={isDetailModalOpen}
        onCancel={() => setIsDetailModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setIsDetailModalOpen(false)}>
            Đóng
          </Button>,
          detailItem?.canRestore !== false && (
            <Button
              key="restore"
              type="primary"
              icon={<UndoOutlined />}
              onClick={() => {
                if (detailItem) {
                  setRestoreTarget(detailItem);
                  setIsRestoreModalOpen(true);
                }
              }}
              className="bg-[#0D9488] hover:bg-[#0B746C] text-white"
            >
              Khôi phục ngay
            </Button>
          ),
          detailItem?.canPermanentDelete !== false && (
            <Button
              key="permanent"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                if (detailItem) {
                  handleOpenPermanentConfirm(detailItem);
                }
              }}
            >
              Xóa vĩnh viễn
            </Button>
          ),
        ]}
        width={650}
      >
        {detailLoading ? (
          <div className="py-8 text-center text-slate-500">Đang tải chi tiết...</div>
        ) : detailItem ? (
          <div className="space-y-4 pt-2">
            {/* Restoration status */}
            {detailItem.canRestore === false ? (
              <Alert
                type="error"
                showIcon
                icon={<StopOutlined />}
                message="Chưa đủ điều kiện khôi phục"
                description={detailItem.restoreBlockReason}
                className="rounded-xl border-red-200"
              />
            ) : (
              <Alert
                type="success"
                showIcon
                icon={<CheckCircleOutlined />}
                message="Sẵn sàng khôi phục"
                description="Bản ghi đủ điều kiện khôi phục an toàn. Dữ liệu cha và mã định danh đều hợp lệ."
                className="rounded-xl border-emerald-200"
              />
            )}

            {/* Permanent deletion status */}
            {detailItem.canPermanentDelete === false ? (
              <Alert
                type="warning"
                showIcon
                message="Chưa đủ điều kiện xóa vĩnh viễn"
                description={detailItem.permanentDeleteBlockReason}
                className="rounded-xl border-amber-200 bg-amber-50 text-amber-900"
              />
            ) : (
              <Alert
                type="info"
                showIcon
                message="Có thể xóa vĩnh viễn"
                description="Bản ghi không còn bất kỳ dữ liệu liên kết hoặc nghĩa vụ tài chính nào. Đủ điều kiện xóa vĩnh viễn nếu được phê duyệt."
                className="rounded-xl border-[#CCFBF1] bg-[#F0FDFA] text-slate-700"
              />
            )}

            <Descriptions bordered size="small" column={1} className="mt-2">
              <Descriptions.Item label="Loại dữ liệu">
                <Tag
                  color={TYPE_CONFIG[detailItem.type]?.color}
                  className="font-bold uppercase"
                >
                  {TYPE_CONFIG[detailItem.type]?.label || detailItem.type}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Tên bản ghi">
                <strong className="text-[#163B40]">{detailItem.title}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="Mã / Slug">
                <span className="font-mono text-xs">{detailItem.codeOrSlug}</span>
              </Descriptions.Item>
              {detailItem.parentInfo && (
                <Descriptions.Item label="Dữ liệu liên kết">
                  {detailItem.parentInfo}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Trạng thái trước xóa">
                <Tag>{detailItem.originalStatus || "ACTIVE"}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Thời gian xóa">
                {detailItem.deletedAt
                  ? dayjs(detailItem.deletedAt).format("DD/MM/YYYY HH:mm:ss")
                  : "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Người thực hiện xóa">
                <div>
                  <div className="font-semibold text-slate-800">
                    {detailItem.deletedBy?.fullName || "Quản trị viên"}
                  </div>
                  {detailItem.deletedBy?.email && (
                    <div className="text-xs text-slate-500">
                      {detailItem.deletedBy.email}
                    </div>
                  )}
                </div>
              </Descriptions.Item>
              <Descriptions.Item label="Lý do xóa mềm">
                <span className="italic text-slate-700">
                  {detailItem.deleteReason || "Chưa có lý do ghi nhận"}
                </span>
              </Descriptions.Item>
            </Descriptions>
          </div>
        ) : null}
      </Modal>

      {/* Restore Confirmation Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-[#0D9488] font-bold text-base">
            <ExclamationCircleOutlined />
            <span>Xác nhận khôi phục dữ liệu</span>
          </div>
        }
        open={isRestoreModalOpen}
        onCancel={() => {
          setIsRestoreModalOpen(false);
          setRestoreTarget(null);
        }}
        confirmLoading={restoreMutation.isPending}
        okText="Khôi phục"
        cancelText="Hủy"
        okButtonProps={{
          disabled: restoreTarget?.canRestore === false,
          className: "bg-[#0D9488] hover:bg-[#0B746C] text-white",
        }}
        onOk={() => {
          if (restoreTarget) {
            restoreMutation.mutate({ type: restoreTarget.type, id: restoreTarget.id });
          }
        }}
        width={500}
      >
        {restoreTarget && (
          <div className="space-y-3 pt-2">
            <p className="text-sm text-slate-700 leading-relaxed">
              Bạn có chắc chắn muốn khôi phục mục{" "}
              <strong className="text-[#163B40]">&ldquo;{restoreTarget.title}&rdquo;</strong>{" "}
              thuộc loại{" "}
              <Tag color={TYPE_CONFIG[restoreTarget.type]?.color} className="font-bold">
                {TYPE_CONFIG[restoreTarget.type]?.label || restoreTarget.type}
              </Tag>{" "}
              không?
            </p>

            {restoreTarget.canRestore === false ? (
              <Alert
                type="error"
                showIcon
                message="Xung đột điều kiện khôi phục"
                description={restoreTarget.restoreBlockReason}
                className="rounded-xl border-red-200"
              />
            ) : (
              <Alert
                type="info"
                showIcon
                message="Chính sách khôi phục an toàn"
                description="Bản ghi sẽ được chuyển trạng thái sang KHÔNG HOẠT ĐỘNG (INACTIVE) hoặc BẢN NHÁP (DRAFT) để Quản trị viên kiểm tra và chủ động kích hoạt lại khi sẵn sàng."
                className="rounded-xl border-[#CCFBF1] bg-[#F0FDFA] text-xs text-slate-700"
              />
            )}
          </div>
        )}
      </Modal>

      {/* Permanent Delete Confirmation Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-red-600 font-bold text-base">
            <DeleteOutlined />
            <span>Xóa vĩnh viễn dữ liệu?</span>
          </div>
        }
        open={isPermanentModalOpen}
        onCancel={() => {
          setIsPermanentModalOpen(false);
          setPermanentTarget(null);
          setPermanentConfirmText("");
          setPermanentReason("");
        }}
        confirmLoading={permanentMutation.isPending}
        okText="Xóa vĩnh viễn"
        cancelText="Hủy"
        okButtonProps={{
          danger: true,
          type: "primary",
          disabled:
            preflightLoading ||
            permanentTarget?.canPermanentDelete === false ||
            permanentConfirmText.trim() !== "XÓA VĨNH VIỄN",
        }}
        onOk={() => {
          if (permanentTarget) {
            permanentMutation.mutate({
              type: permanentTarget.type,
              id: permanentTarget.id,
              reason: permanentReason.trim() || undefined,
            });
          }
        }}
        width={560}
      >
        {permanentTarget && (
          <div className="space-y-4 pt-2">
            <Alert
              type="error"
              showIcon
              icon={<ExclamationCircleOutlined />}
              message="Cảnh báo: Hành động này không thể hoàn tác!"
              description="Dữ liệu sau khi xóa vĩnh viễn sẽ bị loại bỏ hoàn toàn khỏi cơ sở dữ liệu và không thể khôi phục từ Thùng rác."
              className="rounded-xl border-red-200 bg-red-50 text-xs text-red-900"
            />

            {permanentTarget.canPermanentDelete === false && (
              <Alert
                type="warning"
                showIcon
                message="Không thể xóa vĩnh viễn do ràng buộc dữ liệu"
                description={
                  permanentTarget.permanentDeleteBlockReason ||
                  "Dữ liệu đang có liên kết phụ thuộc với các thực thể khác trong hệ thống."
                }
                className="rounded-xl border-amber-200 bg-amber-50 text-xs text-amber-900"
              />
            )}

            <Descriptions bordered size="small" column={1} className="mt-2">
              <Descriptions.Item label="Loại dữ liệu">
                <Tag
                  color={TYPE_CONFIG[permanentTarget.type]?.color}
                  className="font-bold uppercase"
                >
                  {TYPE_CONFIG[permanentTarget.type]?.label || permanentTarget.type}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Tên bản ghi">
                <strong className="text-[#163B40]">{permanentTarget.title}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="Mã / Slug">
                <span className="font-mono text-xs">{permanentTarget.codeOrSlug}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Ngày xóa mềm">
                {permanentTarget.deletedAt
                  ? dayjs(permanentTarget.deletedAt).format("DD/MM/YYYY HH:mm")
                  : "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Người đã xóa">
                {permanentTarget.deletedBy?.fullName || "Quản trị viên"}
              </Descriptions.Item>
              {permanentTarget.deleteReason && (
                <Descriptions.Item label="Lý do xóa mềm">
                  <span className="italic text-slate-700">{permanentTarget.deleteReason}</span>
                </Descriptions.Item>
              )}
            </Descriptions>

            {permanentTarget.canPermanentDelete !== false && (
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="text-xs text-slate-700 leading-relaxed">
                  Để xác nhận, vui lòng nhập chính xác chuỗi ký tự{" "}
                  <strong className="text-red-600 font-mono font-bold">XÓA VĨNH VIỄN</strong> vào
                  ô bên dưới:
                </div>
                <Input
                  placeholder="Nhập XÓA VĨNH VIỄN để xác nhận"
                  value={permanentConfirmText}
                  onChange={(e) => setPermanentConfirmText(e.target.value)}
                  className="rounded-xl border-red-300 font-bold text-red-700 h-10"
                />
                <div>
                  <div className="text-xs text-slate-600 mb-1">
                    Lý do xóa vĩnh viễn (ghi nhận kiểm toán):
                  </div>
                  <Input.TextArea
                    placeholder="Nhập lý do xóa vĩnh viễn bản ghi này..."
                    rows={2}
                    value={permanentReason}
                    onChange={(e) => setPermanentReason(e.target.value)}
                    className="rounded-xl border-[#D6E5E2] text-xs"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
