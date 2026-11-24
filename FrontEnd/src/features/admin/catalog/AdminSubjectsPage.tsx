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
  ReadOutlined,
  PlusOutlined,
  EditOutlined,
  EyeOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { AdminPageHero, AdminFilterBar, AdminFilterField, AdminTableCard } from "../../../components/admin";
import dayjs from "dayjs";
import { courseCatalogService as catalogService } from "../../../services/courseCatalog.service";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";
import type {
  Subject,
  CreateSubjectPayload,
  UpdateSubjectPayload,
} from "../../../types/catalog";
import { GRADE_LEVEL_LABELS } from "../../../types/catalog";

const { TextArea } = Input;

export default function AdminSubjectsPage() {
  const queryClient = useQueryClient();
  const [messageApi, contextHolder] = message.useMessage();

  // Modals state
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [viewingSubjectId, setViewingSubjectId] = useState<string | null>(null);
  const [subjectForm] = Form.useForm();

  // Category filter state
  const [selectedCatFilter, setSelectedCatFilter] = useState<string>("");

  // Soft delete state
  const [deleteTarget, setDeleteTarget] = useState<Subject | null>(null);
  const [deleteReasonInput, setDeleteReasonInput] = useState<string>("");
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteErrorMsg, setDeleteErrorMsg] = useState<string | null>(null);

  // Categories query (for filter & creation)
  const { data: categories = [], isLoading: loadingCategories } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => catalogService.listCategories(),
    staleTime: 60_000,
  });

  const activeCategoryIdForSubjects = selectedCatFilter || (categories[0]?.id ?? "");

  // Subjects query
  const {
    data: subjects = [],
    isLoading: loadingSubjects,
    isError: isErrorSubjects,
    error: errorSubjects,
    refetch: refetchSubjects,
  } = useQuery({
    queryKey: ["admin-subjects", activeCategoryIdForSubjects],
    queryFn: () =>
      activeCategoryIdForSubjects
        ? catalogService.listSubjectsByCategory(activeCategoryIdForSubjects)
        : Promise.resolve([]),
    enabled: !!activeCategoryIdForSubjects,
    staleTime: 60_000,
  });

  // Client-side filters within the selected category
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const hasFilter = keyword.trim() !== "" || statusFilter !== "ALL";
  const filteredSubjects = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return subjects.filter((s) => {
      if (statusFilter === "ACTIVE" && s.status !== "ACTIVE") return false;
      if (statusFilter === "INACTIVE" && s.status === "ACTIVE") return false;
      return !q || [s.name, s.slug, s.description].some((v) => v?.toLowerCase().includes(q));
    });
  }, [subjects, keyword, statusFilter]);
  const resetFilters = () => {
    setKeyword("");
    setStatusFilter("ALL");
  };

  // Subject detail query (for viewing modal)
  const { data: viewingSubject, isLoading: loadingSubjectDetail } = useQuery({
    queryKey: ["admin-subject-detail", viewingSubjectId],
    queryFn: () => viewingSubjectId ? catalogService.getSubject(viewingSubjectId) : Promise.resolve(null),
    enabled: !!viewingSubjectId,
  });

  // Save (Create/Update) mutation
  const saveSubjectMutation = useMutation({
    mutationFn: async (values: CreateSubjectPayload | UpdateSubjectPayload) => {
      if (editingSubject) {
        return catalogService.updateSubject(editingSubject.id, values as UpdateSubjectPayload);
      }
      return catalogService.createSubject(values as CreateSubjectPayload);
    },
    onSuccess: () => {
      messageApi.success(editingSubject ? "Đã cập nhật môn học!" : "Đã tạo môn học mới!");
      queryClient.invalidateQueries({ queryKey: ["admin-subjects"] });
      queryClient.invalidateQueries({ queryKey: ["public-subjects"] });
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      setIsSubjectModalOpen(false);
      subjectForm.resetFields();
    },
    onError: (err: unknown) => {
      messageApi.error(getFriendlyErrorMessage(err, "Lỗi thao tác môn học"));
    },
  });

  // Delete mutation
  const deleteSubjectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      catalogService.deleteSubject(id, reason),
    onSuccess: () => {
      messageApi.success("Đã chuyển môn học vào Thùng rác thành công!");
      setIsDeleteModalOpen(false);
      setDeleteTarget(null);
      setDeleteReasonInput("");
      setDeleteErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: ["admin-subjects"] });
      queryClient.invalidateQueries({ queryKey: ["public-subjects"] });
      queryClient.invalidateQueries({ queryKey: ["adminTrash"] });
    },
    onError: (err: unknown) => {
      const msg = getFriendlyErrorMessage(err, "Không thể xóa môn học này do có ràng buộc dữ liệu.");
      setDeleteErrorMsg(msg);
    },
  });

  const handleOpenSubjectModal = (sub?: Subject) => {
    if (sub) {
      setEditingSubject(sub);
      subjectForm.setFieldsValue({
        categoryId: sub.categoryId,
        name: sub.name,
        description: sub.description,
        status: sub.status,
      });
    } else {
      setEditingSubject(null);
      subjectForm.resetFields();
      subjectForm.setFieldsValue({
        categoryId: activeCategoryIdForSubjects,
        status: "ACTIVE",
      });
    }
    setIsSubjectModalOpen(true);
  };

  const handleOpenDeleteModal = (sub: Subject) => {
    setDeleteTarget(sub);
    setDeleteReasonInput("");
    setDeleteErrorMsg(null);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    deleteSubjectMutation.mutate({ id: deleteTarget.id, reason: deleteReasonInput });
  };

  const currentCategory = categories.find((c) => c.id === activeCategoryIdForSubjects);

  const columns: ColumnsType<Subject> = [
    {
      title: "Tên môn học",
      dataIndex: "name",
      key: "name",
      sorter: (a, b) => a.name.localeCompare(b.name, "vi"),
      render: (name: string, record: Subject) => (
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 shrink-0 rounded-lg bg-[#E5F5F1] text-[#0F766E] flex items-center justify-center">
            <ReadOutlined />
          </div>
          <div className="min-w-0 break-words">
            <div className="font-semibold text-[#163B40]">{name}</div>
            <div className="font-mono text-xs text-slate-500 mt-0.5 break-all">{record.slug}</div>
          </div>
        </div>
      ),
    },
    {
      title: "Thuộc danh mục",
      dataIndex: "categoryName",
      key: "categoryName",
      render: (catName: string) => (
        <Tag color="teal" className="text-xs">
          {catName || currentCategory?.name || "Danh mục"}
        </Tag>
      ),
    },
    {
      title: "Mô tả",
      dataIndex: "description",
      key: "description",
      render: (desc: string) => desc ? <span className="break-words">{desc}</span> : <span className="text-slate-400 italic">Chưa có mô tả</span>,
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
      render: (_: unknown, record: Subject) => (
        <Space size="small">
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setViewingSubjectId(record.id)}
            title="Xem chi tiết"
          />
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenSubjectModal(record)}
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
        icon={<ReadOutlined />}
        title="Quản lý môn học"
        crumb="Môn học"
        description="Thiết lập danh mục các môn học trực thuộc từng chuyên ngành đào tạo."
        extra={
          <>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => refetchSubjects()}
            loading={loadingSubjects}
            className="rounded-xl"
          >
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => handleOpenSubjectModal()}
            disabled={categories.length === 0}
            className="bg-[#0F766E] hover:bg-[#0D9488] border-none font-semibold rounded-xl"
          >
            Thêm môn học
          </Button>
          </>
        }
      />

      {/* Error state */}
      {isErrorSubjects && (
        <Alert
          type="error"
          showIcon
          message="Không thể tải danh sách môn học"
          description={getFriendlyErrorMessage(errorSubjects, "Vui lòng kiểm tra lại kết nối mạng hoặc thử lại sau.")}
          action={
            <Button size="small" onClick={() => refetchSubjects()}>
              Thử lại
            </Button>
          }
        />
      )}

      {/* Data Table + Filter bar */}
      <AdminTableCard>
        <AdminFilterBar
          title="Bộ lọc môn học"
          gridClassName="md:grid-cols-2 xl:grid-cols-[260px_minmax(0,1fr)_220px_auto]"
          onReset={resetFilters}
          hasFilter={hasFilter}
          summary={
            hasFilter && !loadingSubjects ? (
              <>
                Tìm thấy <span className="font-semibold text-[#0F766E]">{filteredSubjects.length}</span> /{" "}
                {subjects.length} môn học
              </>
            ) : null
          }
        >
          <AdminFilterField label="Danh mục đào tạo">
            <Select
              loading={loadingCategories}
              value={activeCategoryIdForSubjects || undefined}
              onChange={(val) => setSelectedCatFilter(val)}
              placeholder="Chọn danh mục"
              options={categories.map((c) => ({
                value: c.id,
                label: `${c.name}${c.status === "ACTIVE" ? "" : " (Tạm ngưng)"}`,
              }))}
            />
          </AdminFilterField>
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
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "ALL", label: "Tất cả trạng thái" },
                { value: "ACTIVE", label: "Hoạt động" },
                { value: "INACTIVE", label: "Tạm ngưng" },
              ]}
            />
          </AdminFilterField>
        </AdminFilterBar>
        {loadingSubjects ? (
          <div className="p-6">
            <Skeleton active paragraph={{ rows: 6 }} />
          </div>
        ) : subjects.length === 0 ? (
          <div className="p-12 text-center">
            <Empty description={`Chưa có môn học nào thuộc danh mục "${currentCategory?.name || "này"}"`}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => handleOpenSubjectModal()}
                disabled={categories.length === 0}
                className="bg-[#0F766E] hover:bg-[#0D9488] border-none"
              >
                Thêm môn học đầu tiên
              </Button>
            </Empty>
          </div>
        ) : filteredSubjects.length === 0 ? (
          <div className="p-12 text-center">
            <Empty description="Không có môn học nào khớp bộ lọc">
              <Button onClick={resetFilters}>Xóa bộ lọc</Button>
            </Empty>
          </div>
        ) : (
          <Table<Subject>
            columns={columns}
            dataSource={filteredSubjects}
            rowKey="id"
            tableLayout="fixed"
            pagination={{
              pageSize: 10,
              showTotal: (total) => `Tổng số ${total} môn học`,
              showSizeChanger: true,
              pageSizeOptions: ["10", "20", "50"],
            }}
          />
        )}
      </AdminTableCard>

      {/* Modal: Create / Edit Subject */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-base font-bold text-[#163B40]">
            <ReadOutlined className="text-teal-600" />
            <span>{editingSubject ? "Chỉnh sửa môn học" : "Tạo môn học mới"}</span>
          </div>
        }
        open={isSubjectModalOpen}
        onCancel={() => {
          if (saveSubjectMutation.isPending) return;
          setIsSubjectModalOpen(false);
          subjectForm.resetFields();
        }}
        footer={null}
        destroyOnClose
      >
        <Form
          form={subjectForm}
          layout="vertical"
          onFinish={(values) => saveSubjectMutation.mutate(values)}
          className="mt-4"
        >
          <Form.Item
            name="categoryId"
            label="Danh mục cha"
            rules={[{ required: true, message: "Vui lòng chọn danh mục cha" }]}
          >
            <Select
              disabled={!!editingSubject}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="Chọn danh mục"
            />
          </Form.Item>

          <Form.Item
            name="name"
            label="Tên môn học"
            rules={[{ required: true, whitespace: true, message: "Vui lòng nhập tên môn học" }]}
          >
            <Input placeholder="vd: Toán Đại số & Giải tích, Tiếng Anh Giao tiếp..." />
          </Form.Item>

          <Form.Item name="description" label="Mô tả">
            <TextArea rows={3} placeholder="Mô tả nội dung, mục tiêu của môn học..." />
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
              disabled={saveSubjectMutation.isPending}
              onClick={() => setIsSubjectModalOpen(false)}
            >
              Hủy
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={saveSubjectMutation.isPending}
              className="bg-[#0F766E] hover:bg-[#0D9488] border-none font-semibold"
            >
              {editingSubject ? "Lưu thay đổi" : "Tạo mới"}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Modal: View Subject Detail */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-base font-bold text-[#163B40]">
            <ReadOutlined className="text-teal-600" />
            <span>Chi tiết môn học: {viewingSubject?.name}</span>
          </div>
        }
        open={!!viewingSubjectId}
        onCancel={() => setViewingSubjectId(null)}
        footer={[
          <Button key="close" onClick={() => setViewingSubjectId(null)}>
            Đóng
          </Button>,
        ]}
        width={680}
      >
        {loadingSubjectDetail ? (
          <Skeleton active paragraph={{ rows: 5 }} />
        ) : viewingSubject ? (
          <div className="space-y-4 mt-4">
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Tên môn học">
                <span className="font-semibold text-slate-800">{viewingSubject.name}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Đường dẫn (Slug)">
                <span className="font-mono text-xs text-slate-600">{viewingSubject.slug}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Danh mục trực thuộc">
                <Tag color="teal">{viewingSubject.categoryName || currentCategory?.name}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Mô tả">
                {viewingSubject.description || <span className="text-slate-400 italic">Chưa có mô tả</span>}
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                {viewingSubject.status === "ACTIVE" ? (
                  <Tag color="success">Hoạt động</Tag>
                ) : (
                  <Tag color="default">Tạm ngưng</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Ngày tạo">
                <span className="font-mono text-xs text-slate-600">
                  {viewingSubject.createdAt ? dayjs(viewingSubject.createdAt).format("DD/MM/YYYY HH:mm:ss") : "—"}
                </span>
              </Descriptions.Item>
            </Descriptions>

            {/* Embedded Courses inside this subject */}
            <div>
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Các khóa học chuẩn trực thuộc ({viewingSubject.courses?.length || 0}):
              </div>
              {viewingSubject.courses && viewingSubject.courses.length > 0 ? (
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {viewingSubject.courses.map((c) => (
                    <div key={c.id} className="p-2.5 px-3 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-slate-800">{c.title}</span>
                        <span className="font-mono text-[11px] text-slate-400 ml-2">({c.slug})</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {c.level && <Tag color="purple" className="text-[10px]">{c.level}</Tag>}
                        {c.gradeLevel && <Tag color="blue" className="text-[10px]">{GRADE_LEVEL_LABELS[c.gradeLevel]}</Tag>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-500 italic">
                  Chưa có khóa học nào trực thuộc môn học này.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Modal: Soft Delete Confirmation */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-rose-600 font-bold">
            <DeleteOutlined />
            <span>Xác nhận chuyển môn học vào Thùng rác</span>
          </div>
        }
        open={isDeleteModalOpen}
        onCancel={() => {
          if (deleteSubjectMutation.isPending) return;
          setIsDeleteModalOpen(false);
          setDeleteTarget(null);
        }}
        footer={[
          <Button
            key="cancel"
            disabled={deleteSubjectMutation.isPending}
            onClick={() => setIsDeleteModalOpen(false)}
          >
            Hủy
          </Button>,
          <Button
            key="delete"
            danger
            type="primary"
            loading={deleteSubjectMutation.isPending}
            onClick={handleConfirmDelete}
          >
            Chuyển vào Thùng rác
          </Button>,
        ]}
      >
        <div className="space-y-3 py-2">
          <p className="text-xs text-slate-600">
            Bạn có chắc chắn muốn chuyển môn học <strong>{deleteTarget?.name}</strong> vào Thùng rác không?
          </p>
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
            ⚠️ <strong>Lưu ý:</strong> Môn học chỉ có thể xóa khi không còn khóa học hoặc lớp học liên quan đang mở. Dữ liệu có thể được khôi phục lại từ Thùng rác.
          </div>
          {deleteErrorMsg && (
            <Alert
              type="error"
              showIcon
              message="Không thể xóa môn học này"
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
              placeholder="Nhập lý do xóa môn học này..."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
