import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table,
  Button,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  Space,
  Descriptions,
  Alert,
  Skeleton,
  Empty,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  FolderOutlined,
  PlusOutlined,
  EditOutlined,
  EyeOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { courseCatalogService as catalogService } from "../../../services/courseCatalog.service";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";
import type {
  Category,
  CreateCategoryPayload,
  UpdateCategoryPayload,
} from "../../../types/catalog";
import { GRADE_LEVEL_LABELS, SUPPORTED_GRADE_LEVELS } from "../../../types/catalog";
import { AdminPageHero, AdminFilterBar, AdminFilterField, AdminTableCard } from "../../../components/admin";

const { TextArea } = Input;

type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

export default function AdminCategoriesPage() {
  const queryClient = useQueryClient();
  const [messageApi, contextHolder] = message.useMessage();

  // Modals state
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [viewingCategory, setViewingCategory] = useState<Category | null>(null);
  const [categoryForm] = Form.useForm();

  // Soft delete state
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleteReasonInput, setDeleteReasonInput] = useState<string>("");
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteErrorMsg, setDeleteErrorMsg] = useState<string | null>(null);

  // Categories query
  const {
    data: categories = [],
    isLoading: loadingCategories,
    isError: isErrorCategories,
    error: errorCategories,
    refetch: refetchCategories,
  } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => catalogService.listCategories(),
    staleTime: 60_000,
  });

  // Filters (client-side: listCategories returns the full list)
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [gradeFilter, setGradeFilter] = useState<string | undefined>();
  const hasFilter = keyword.trim() !== "" || statusFilter !== "ALL" || !!gradeFilter;

  const statusCounts = useMemo(
    () => ({
      ALL: categories.length,
      ACTIVE: categories.filter((c) => c.status === "ACTIVE").length,
      INACTIVE: categories.filter((c) => c.status !== "ACTIVE").length,
    }),
    [categories]
  );

  const filteredCategories = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return categories.filter((c) => {
      if (statusFilter === "ACTIVE" && c.status !== "ACTIVE") return false;
      if (statusFilter === "INACTIVE" && c.status === "ACTIVE") return false;
      // null/empty allowedGradeLevels means the category applies to every grade
      if (gradeFilter && c.allowedGradeLevels?.length && !c.allowedGradeLevels.includes(gradeFilter as never)) return false;
      if (!q) return true;
      return [c.name, c.slug, c.description].some((v) => v?.toLowerCase().includes(q));
    });
  }, [categories, keyword, statusFilter, gradeFilter]);

  const resetFilters = () => {
    setKeyword("");
    setStatusFilter("ALL");
    setGradeFilter(undefined);
  };

  // Save (Create/Update) mutation
  const saveCategoryMutation = useMutation({
    mutationFn: async (values: CreateCategoryPayload | UpdateCategoryPayload) => {
      if (editingCategory) {
        return catalogService.updateCategory(editingCategory.id, values as UpdateCategoryPayload);
      }
      return catalogService.createCategory(values as CreateCategoryPayload);
    },
    onSuccess: () => {
      messageApi.success(editingCategory ? "Đã cập nhật danh mục!" : "Đã tạo danh mục mới!");
      queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
      queryClient.invalidateQueries({ queryKey: ["public-categories"] });
      queryClient.invalidateQueries({ queryKey: ["catalog", "categories"] });
      setIsCategoryModalOpen(false);
      categoryForm.resetFields();
    },
    onError: (err: unknown) => {
      messageApi.error(getFriendlyErrorMessage(err, "Lỗi thao tác danh mục"));
    },
  });

  // Delete mutation
  const deleteCategoryMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      catalogService.deleteCategory(id, reason),
    onSuccess: () => {
      messageApi.success("Đã chuyển danh mục vào Thùng rác thành công!");
      setIsDeleteModalOpen(false);
      setDeleteTarget(null);
      setDeleteReasonInput("");
      setDeleteErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
      queryClient.invalidateQueries({ queryKey: ["public-categories"] });
      queryClient.invalidateQueries({ queryKey: ["adminTrash"] });
    },
    onError: (err: unknown) => {
      const msg = getFriendlyErrorMessage(err, "Không thể xóa danh mục này do có ràng buộc dữ liệu.");
      setDeleteErrorMsg(msg);
    },
  });

  const handleOpenCategoryModal = (cat?: Category) => {
    if (cat) {
      setEditingCategory(cat);
      categoryForm.setFieldsValue({
        name: cat.name,
        description: cat.description,
        status: cat.status,
      });
    } else {
      setEditingCategory(null);
      categoryForm.resetFields();
      categoryForm.setFieldsValue({ status: "ACTIVE" });
    }
    setIsCategoryModalOpen(true);
  };

  const handleOpenDeleteModal = (cat: Category) => {
    setDeleteTarget(cat);
    setDeleteReasonInput("");
    setDeleteErrorMsg(null);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    deleteCategoryMutation.mutate({ id: deleteTarget.id, reason: deleteReasonInput });
  };

  const columns: ColumnsType<Category> = [
    {
      title: "Tên danh mục",
      dataIndex: "name",
      key: "name",
      sorter: (a, b) => a.name.localeCompare(b.name, "vi"),
      render: (name: string, record: Category) => (
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 shrink-0 rounded-lg bg-[#E5F5F1] text-[#0F766E] flex items-center justify-center">
            <FolderOutlined />
          </div>
          <div className="min-w-0 break-words">
            <div className="font-semibold text-[#163B40]">{name}</div>
            <div className="font-mono text-xs text-slate-500 mt-0.5 break-all">{record.slug}</div>
          </div>
        </div>
      ),
    },
    {
      title: "Mô tả",
      dataIndex: "description",
      key: "description",
      render: (desc: string) => desc ? <span className="break-words">{desc}</span> : <span className="text-slate-400 italic">Chưa có mô tả</span>,
    },
    {
      title: "Khối lớp áp dụng",
      dataIndex: "allowedGradeLevels",
      key: "allowedGradeLevels",
      render: (grades?: string[]) => {
        if (!grades || grades.length === 0) {
          return <span className="text-slate-400 text-xs">Mặc định (Tất cả)</span>;
        }
        return (
          <div className="flex flex-wrap gap-1 max-w-xs">
            {grades.slice(0, 3).map((g) => (
              <Tag key={g} color="blue" className="text-[11px]">
                {GRADE_LEVEL_LABELS[g as keyof typeof GRADE_LEVEL_LABELS] || g}
              </Tag>
            ))}
            {grades.length > 3 && (
              <Tag className="text-[11px]">+{grades.length - 3}</Tag>
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
      render: (status: string) =>
        status === "ACTIVE" ? (
          <Tag color="success">Hoạt động</Tag>
        ) : (
          <Tag color="default">Tạm ngưng</Tag>
        ),
    },
    {
      title: "Ngày tạo",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 130,
      sorter: (a, b) => dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf(),
      render: (date: string) => (
        <span className="text-xs text-slate-600 font-mono">
          {date ? dayjs(date).format("DD/MM/YYYY") : "—"}
        </span>
      ),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 160,
      align: "right",
      render: (_: unknown, record: Category) => (
        <Space size="small">
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setViewingCategory(record)}
            title="Xem chi tiết"
          />
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenCategoryModal(record)}
            title="Chỉnh sửa"
          />
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleOpenDeleteModal(record)}
            title="Chuyển vào thùng rác"
          />
        </Space>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 w-full">
      {contextHolder}

      <AdminPageHero
        icon={<FolderOutlined />}
        title="Quản lý danh mục đào tạo"
        crumb="Danh mục"
        description="Phân loại cấp bậc học và các nhóm chương trình đào tạo trên toàn hệ thống."
        extra={
          <>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => refetchCategories()}
            loading={loadingCategories}
            className="rounded-xl"
          >
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => handleOpenCategoryModal()}
            className="bg-[#0F766E] hover:bg-[#0D9488] border-none font-semibold rounded-xl"
          >
            Thêm danh mục
          </Button>
          </>
        }
      />

      {/* Error state */}
      {isErrorCategories && (
        <Alert
          type="error"
          showIcon
          message="Không thể tải danh sách danh mục"
          description={getFriendlyErrorMessage(errorCategories, "Vui lòng kiểm tra lại kết nối mạng hoặc thử lại sau.")}
          action={
            <Button size="small" onClick={() => refetchCategories()}>
              Thử lại
            </Button>
          }
        />
      )}

      {/* Data Table + Filter bar */}
      <AdminTableCard>
        <AdminFilterBar
          title="Bộ lọc danh mục"
          onReset={resetFilters}
          hasFilter={hasFilter}
          summary={
            hasFilter && !loadingCategories ? (
              <>
                Tìm thấy <span className="font-semibold text-[#0F766E]">{filteredCategories.length}</span> /{" "}
                {categories.length} danh mục
              </>
            ) : null
          }
        >
            <AdminFilterField label="Tìm kiếm">
              <Input
                allowClear
                prefix={<SearchOutlined className="text-[#64748B]" />}
                placeholder="Tên, slug hoặc mô tả..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="rounded-xl"
              />
            </AdminFilterField>
            <AdminFilterField label="Trạng thái">
              <Select<StatusFilter>
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: "ALL", label: `Tất cả (${statusCounts.ALL})` },
                  { value: "ACTIVE", label: `Hoạt động (${statusCounts.ACTIVE})` },
                  { value: "INACTIVE", label: `Tạm ngưng (${statusCounts.INACTIVE})` },
                ]}
              />
            </AdminFilterField>
            <AdminFilterField label="Khối lớp áp dụng">
              <Select
                allowClear
                placeholder="Tất cả khối lớp"
                value={gradeFilter}
                onChange={setGradeFilter}
                options={SUPPORTED_GRADE_LEVELS.map((g) => ({ value: g, label: GRADE_LEVEL_LABELS[g] || g }))}
              />
            </AdminFilterField>
        </AdminFilterBar>
        {loadingCategories ? (
          <div className="p-6">
            <Skeleton active paragraph={{ rows: 6 }} />
          </div>
        ) : categories.length === 0 ? (
          <div className="p-12 text-center">
            <Empty description="Chưa có danh mục nào trong hệ thống">
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => handleOpenCategoryModal()}
                className="bg-[#0F766E] hover:bg-[#0D9488] border-none"
              >
                Tạo danh mục đầu tiên
              </Button>
            </Empty>
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="p-12 text-center">
            <Empty description="Không có danh mục nào khớp bộ lọc">
              <Button onClick={resetFilters}>Xóa bộ lọc</Button>
            </Empty>
          </div>
        ) : (
          <Table<Category>
            columns={columns}
            dataSource={filteredCategories}
            rowKey="id"
            tableLayout="fixed"
            pagination={{
              pageSize: 10,
              showTotal: (total) => `Tổng số ${total} danh mục`,
              showSizeChanger: true,
              pageSizeOptions: ["10", "20", "50"],
            }}
          />
        )}
      </AdminTableCard>

      {/* Modal: Create / Edit Category */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-base font-bold text-[#163B40]">
            <FolderOutlined className="text-teal-600" />
            <span>{editingCategory ? "Chỉnh sửa danh mục" : "Tạo danh mục mới"}</span>
          </div>
        }
        open={isCategoryModalOpen}
        onCancel={() => {
          if (saveCategoryMutation.isPending) return;
          setIsCategoryModalOpen(false);
          categoryForm.resetFields();
        }}
        footer={null}
        destroyOnClose
      >
        <Form
          form={categoryForm}
          layout="vertical"
          onFinish={(values) => saveCategoryMutation.mutate(values)}
          className="mt-4"
        >
          <Form.Item
            name="name"
            label="Tên danh mục"
            rules={[{ required: true, whitespace: true, message: "Vui lòng nhập tên danh mục" }]}
          >
            <Input placeholder="vd: Khoa học Tự nhiên, Ngoại ngữ..." />
          </Form.Item>

          <Form.Item name="description" label="Mô tả">
            <TextArea rows={3} placeholder="Mô tả ngắn gọn về nhóm danh mục này..." />
          </Form.Item>

          <Form.Item name="status" label="Trạng thái" initialValue="ACTIVE">
            <Select
              options={[
                { value: "ACTIVE", label: "Hoạt động (ACTIVE)" },
                { value: "INACTIVE", label: "Tạm ngưng (INACTIVE)" },
              ]}
            />
          </Form.Item>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button
              disabled={saveCategoryMutation.isPending}
              onClick={() => setIsCategoryModalOpen(false)}
            >
              Hủy
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={saveCategoryMutation.isPending}
              className="bg-[#0F766E] hover:bg-[#0D9488] border-none font-semibold"
            >
              {editingCategory ? "Lưu thay đổi" : "Tạo mới"}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Modal: View Category Detail */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-base font-bold text-[#163B40]">
            <FolderOutlined className="text-teal-600" />
            <span>Chi tiết danh mục: {viewingCategory?.name}</span>
          </div>
        }
        open={!!viewingCategory}
        onCancel={() => setViewingCategory(null)}
        footer={[
          <Button key="close" onClick={() => setViewingCategory(null)}>
            Đóng
          </Button>,
        ]}
      >
        {viewingCategory && (
          <Descriptions bordered size="small" column={1} className="mt-4">
            <Descriptions.Item label="Tên danh mục">
              <span className="font-semibold text-slate-800">{viewingCategory.name}</span>
            </Descriptions.Item>
            <Descriptions.Item label="Đường dẫn (Slug)">
              <span className="font-mono text-xs text-slate-600">{viewingCategory.slug}</span>
            </Descriptions.Item>
            <Descriptions.Item label="Mô tả">
              {viewingCategory.description || <span className="text-slate-400 italic">Chưa có mô tả</span>}
            </Descriptions.Item>
            <Descriptions.Item label="Trạng thái">
              {viewingCategory.status === "ACTIVE" ? (
                <Tag color="success">Hoạt động</Tag>
              ) : (
                <Tag color="default">Tạm ngưng</Tag>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Ngày tạo">
              <span className="font-mono text-xs text-slate-600">
                {viewingCategory.createdAt ? dayjs(viewingCategory.createdAt).format("DD/MM/YYYY HH:mm:ss") : "—"}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="Cập nhật gần nhất">
              <span className="font-mono text-xs text-slate-600">
                {viewingCategory.updatedAt ? dayjs(viewingCategory.updatedAt).format("DD/MM/YYYY HH:mm:ss") : "—"}
              </span>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      {/* Modal: Soft Delete Confirmation */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-rose-600 font-bold">
            <DeleteOutlined />
            <span>Xác nhận chuyển danh mục vào Thùng rác</span>
          </div>
        }
        open={isDeleteModalOpen}
        onCancel={() => {
          if (deleteCategoryMutation.isPending) return;
          setIsDeleteModalOpen(false);
          setDeleteTarget(null);
        }}
        footer={[
          <Button
            key="cancel"
            disabled={deleteCategoryMutation.isPending}
            onClick={() => setIsDeleteModalOpen(false)}
          >
            Hủy
          </Button>,
          <Button
            key="delete"
            danger
            type="primary"
            loading={deleteCategoryMutation.isPending}
            onClick={handleConfirmDelete}
          >
            Chuyển vào Thùng rác
          </Button>,
        ]}
      >
        <div className="space-y-3 py-2">
          <p className="text-xs text-slate-600">
            Bạn có chắc chắn muốn chuyển danh mục <strong>{deleteTarget?.name}</strong> vào Thùng rác không?
          </p>
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
            ⚠️ <strong>Lưu ý:</strong> Danh mục chỉ có thể xóa khi không còn môn học hoặc khóa học liên quan đang hoạt động. Dữ liệu có thể được khôi phục lại từ Thùng rác.
          </div>
          {deleteErrorMsg && (
            <Alert
              type="error"
              showIcon
              message="Không thể xóa danh mục này"
              description={deleteErrorMsg}
            />
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Lý do xóa (tùy chọn):
            </label>
            <TextArea
              rows={2}
              value={deleteReasonInput}
              onChange={(e) => setDeleteReasonInput(e.target.value)}
              placeholder="Nhập lý do xóa danh mục này..."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
