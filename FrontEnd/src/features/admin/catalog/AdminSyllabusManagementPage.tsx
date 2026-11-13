import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App as AntdApp,
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  EditOutlined,
  PlusOutlined,
  SnippetsOutlined,
} from "@ant-design/icons";
import { courseService } from "../../../services/course.service";
import { courseSyllabusService } from "../../../services/courseSyllabus.service";
import type { Course } from "../../../types/catalog";
import type {
  CurriculumUnit,
  CurriculumUnitPayload,
  SyllabusVersion,
  SyllabusVersionStatus,
} from "../../../types/courseGovernance";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";

const VERSION_STATUS: Record<SyllabusVersionStatus, { label: string; color: string }> = {
  DRAFT: { label: "Bản nháp", color: "gold" },
  PUBLISHED: { label: "Đã công bố", color: "success" },
  ARCHIVED: { label: "Đã lưu trữ", color: "default" },
};

interface VersionFormValues {
  title: string;
  summary?: string;
  cloneFromVersionId?: string;
}

interface UnitFormValues extends Omit<CurriculumUnitPayload, "topics"> {
  topicsText?: string;
}

export default function AdminSyllabusManagementPage() {
  const queryClient = useQueryClient();
  const { message } = AntdApp.useApp();
  const [courseId, setCourseId] = useState<string>();
  const [versionId, setVersionId] = useState<string>();
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [editingVersion, setEditingVersion] = useState<SyllabusVersion | null>(null);
  const [unitModalOpen, setUnitModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<CurriculumUnit | null>(null);
  const [versionForm] = Form.useForm<VersionFormValues>();
  const [unitForm] = Form.useForm<UnitFormValues>();

  const coursesQuery = useQuery({
    queryKey: ["admin-syllabus-courses"],
    queryFn: () => courseService.searchCourses({ page: 1, pageSize: 100 }),
  });
  const courses = coursesQuery.data?.items ?? [];
  const selectedCourse = courses.find((course) => course.id === courseId);

  const versionsQuery = useQuery({
    queryKey: ["admin-syllabus-versions", courseId],
    queryFn: () => courseSyllabusService.listVersions(courseId!),
    enabled: Boolean(courseId),
  });
  const versions = useMemo(() => versionsQuery.data?.versions ?? [], [versionsQuery.data?.versions]);
  const publishedVersionId = versionsQuery.data?.publishedSyllabusVersionId;
  const selectedVersionId = versions.some((version) => version.id === versionId)
    ? versionId
    : publishedVersionId || versions[0]?.id;
  const detailQuery = useQuery({
    queryKey: ["admin-syllabus-version-detail", courseId, selectedVersionId],
    queryFn: () => courseSyllabusService.getVersion(courseId!, selectedVersionId!),
    enabled: Boolean(courseId && selectedVersionId),
  });
  const selectedVersion = detailQuery.data;
  const units = useMemo(
    () => [...(selectedVersion?.units ?? [])].sort((a, b) => a.unitOrder - b.unitOrder),
    [selectedVersion?.units]
  );
  const refreshVersionData = async (targetCourseId = courseId) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-syllabus-versions", targetCourseId] }),
      queryClient.invalidateQueries({ queryKey: ["admin-syllabus-version-detail", targetCourseId] }),
      queryClient.invalidateQueries({ queryKey: ["public-course-syllabus", targetCourseId] }),
      queryClient.invalidateQueries({ queryKey: ["public-course", targetCourseId] }),
    ]);
  };

  const createVersionMutation = useMutation({
    mutationFn: (values: VersionFormValues) => {
      if (!courseId) throw new Error("Chọn khóa học trước khi tạo phiên bản.");
      const payload = {
        title: values.title.trim(),
        summary: values.summary?.trim() || "",
        ...(values.cloneFromVersionId ? { cloneFromVersionId: values.cloneFromVersionId } : {}),
      };
      return courseSyllabusService.createVersion(courseId, payload);
    },
    onSuccess: async (created) => {
      message.success(`Đã tạo bản nháp giáo trình v${created.versionNumber}.`);
      setVersionModalOpen(false);
      setVersionId(created.id);
      versionForm.resetFields();
      await refreshVersionData();
    },
    onError: (error: unknown) =>
      message.error(getFriendlyErrorMessage(error, "Không thể tạo bản nháp giáo trình.")),
  });

  const updateVersionMutation = useMutation({
    mutationFn: (values: VersionFormValues) => {
      if (!courseId || !editingVersion) throw new Error("Không tìm thấy phiên bản cần cập nhật.");
      return courseSyllabusService.updateVersion(courseId, editingVersion.id, {
        title: values.title.trim(),
        summary: values.summary?.trim() || "",
      });
    },
    onSuccess: async () => {
      message.success("Đã cập nhật thông tin phiên bản.");
      setVersionModalOpen(false);
      setEditingVersion(null);
      await refreshVersionData();
    },
    onError: (error: unknown) =>
      message.error(getFriendlyErrorMessage(error, "Không thể cập nhật phiên bản.")),
  });

  const saveUnitMutation = useMutation({
    mutationFn: (values: UnitFormValues) => {
      if (!courseId || !selectedVersion) throw new Error("Chọn một phiên bản giáo trình.");
      const payload: CurriculumUnitPayload = {
        title: values.title.trim(),
        description: values.description?.trim() || "",
        learningObjectives: values.learningObjectives?.trim() || "",
        durationMinutes: values.durationMinutes ?? null,
        topics: values.topicsText?.split(/\r?\n|,/).map((topic) => topic.trim()).filter(Boolean) ?? [],
      };
      return editingUnit
        ? courseSyllabusService.updateUnit(courseId, selectedVersion.id, editingUnit.id, payload)
        : courseSyllabusService.addUnit(courseId, selectedVersion.id, payload);
    },
    onSuccess: async () => {
      message.success(editingUnit ? "Đã cập nhật nội dung bài học." : "Đã thêm bài học.");
      setUnitModalOpen(false);
      setEditingUnit(null);
      unitForm.resetFields();
      await refreshVersionData();
    },
    onError: (error: unknown) =>
      message.error(getFriendlyErrorMessage(error, "Không thể lưu bài học.")),
  });

  const deleteUnitMutation = useMutation({
    mutationFn: (unit: CurriculumUnit) => {
      if (!courseId || !selectedVersion) throw new Error("Chọn một phiên bản giáo trình.");
      return courseSyllabusService.deleteUnit(courseId, selectedVersion.id, unit.id);
    },
    onSuccess: async () => {
      message.success("Đã xóa bài học khỏi bản nháp.");
      await refreshVersionData();
    },
    onError: (error: unknown) =>
      message.error(getFriendlyErrorMessage(error, "Không thể xóa bài học.")),
  });

  const reorderMutation = useMutation({
    mutationFn: (nextUnits: CurriculumUnit[]) => {
      if (!courseId || !selectedVersion) throw new Error("Chọn một phiên bản giáo trình.");
      return courseSyllabusService.reorderUnits(
        courseId,
        selectedVersion.id,
        nextUnits.map((unit) => unit.id)
      );
    },
    onSuccess: async () => refreshVersionData(),
    onError: (error: unknown) =>
      message.error(getFriendlyErrorMessage(error, "Không thể sắp xếp bài học.")),
  });

  const publishMutation = useMutation({
    mutationFn: (version: SyllabusVersion) => {
      if (!courseId) throw new Error("Chọn khóa học trước khi công bố.");
      return courseSyllabusService.publishVersion(courseId, version.id);
    },
    onSuccess: async () => {
      message.success("Đã công bố phiên bản giáo trình. Phiên bản đã công bố trước đó được lưu trữ.");
      await refreshVersionData();
    },
    onError: (error: unknown) =>
      message.error(getFriendlyErrorMessage(error, "Không thể công bố phiên bản giáo trình.")),
  });

  const archiveMutation = useMutation({
    mutationFn: (version: SyllabusVersion) => {
      if (!courseId) throw new Error("Chọn khóa học trước khi lưu trữ.");
      return courseSyllabusService.archiveVersion(courseId, version.id);
    },
    onSuccess: async () => {
      message.success("Đã lưu trữ phiên bản giáo trình.");
      await refreshVersionData();
    },
    onError: (error: unknown) =>
      message.error(getFriendlyErrorMessage(error, "Không thể lưu trữ phiên bản.")),
  });

  const openCreateVersion = () => {
    setEditingVersion(null);
    const published = versions.find((version) => version.id === publishedVersionId);
    versionForm.setFieldsValue({
      title: "",
      summary: published?.summary || "",
      cloneFromVersionId: published?.id,
    });
    setVersionModalOpen(true);
  };

  const openEditVersion = (version: SyllabusVersion) => {
    setEditingVersion(version);
    versionForm.setFieldsValue({ title: version.title, summary: version.summary });
    setVersionModalOpen(true);
  };

  const openUnitModal = (unit?: CurriculumUnit) => {
    setEditingUnit(unit ?? null);
    unitForm.setFieldsValue(
      unit
        ? {
            title: unit.title,
            description: unit.description,
            learningObjectives: unit.learningObjectives,
            durationMinutes: unit.durationMinutes ?? undefined,
            topicsText: unit.topics.join("\n"),
          }
        : { durationMinutes: undefined, topicsText: "" }
    );
    setUnitModalOpen(true);
  };

  const moveUnit = (unit: CurriculumUnit, offset: -1 | 1) => {
    const from = units.findIndex((item) => item.id === unit.id);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= units.length) return;
    const reordered = [...units];
    [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
    reorderMutation.mutate(reordered);
  };

  const columns: ColumnsType<CurriculumUnit> = [
    { title: "Thứ tự", dataIndex: "unitOrder", width: 80 },
    {
      title: "Bài học",
      dataIndex: "title",
      render: (title: string, unit) => (
        <div>
          <div className="font-semibold">{title}</div>
          {unit.description && <div className="text-xs text-slate-500">{unit.description}</div>}
        </div>
      ),
    },
    {
      title: "Mục tiêu / chủ đề",
      render: (_, unit) => (
        <div className="max-w-sm text-xs text-slate-600">
          {unit.learningObjectives && <div>{unit.learningObjectives}</div>}
          {unit.topics.length > 0 && <div className="mt-1">{unit.topics.join(" · ")}</div>}
        </div>
      ),
    },
    {
      title: "Thời lượng",
      dataIndex: "durationMinutes",
      width: 110,
      render: (duration: number | null) => duration == null ? "—" : `${duration} phút`,
    },
    {
      title: "Thao tác",
      width: 190,
      render: (_, unit, index) => (
        <Space>
          <Tooltip title="Di chuyển lên">
            <Button
              size="small"
              icon={<ArrowUpOutlined />}
              disabled={selectedVersion?.status !== "DRAFT" || index === 0 || reorderMutation.isPending}
              onClick={() => moveUnit(unit, -1)}
            />
          </Tooltip>
          <Tooltip title="Di chuyển xuống">
            <Button
              size="small"
              icon={<ArrowDownOutlined />}
              disabled={selectedVersion?.status !== "DRAFT" || index === units.length - 1 || reorderMutation.isPending}
              onClick={() => moveUnit(unit, 1)}
            />
          </Tooltip>
          <Button
            size="small"
            icon={<EditOutlined />}
            disabled={selectedVersion?.status !== "DRAFT"}
            onClick={() => openUnitModal(unit)}
          >
            Sửa
          </Button>
          <Popconfirm
            title="Xóa bài học khỏi bản nháp?"
            description="Bài học chỉ bị xóa mềm trong phiên bản nháp này."
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true, loading: deleteUnitMutation.isPending }}
            onConfirm={() => deleteUnitMutation.mutate(unit)}
          >
            <Button size="small" danger disabled={selectedVersion?.status !== "DRAFT"}>
              Xóa
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <Alert
        type="info"
        showIcon
        message="Quản lý syllabus có version thật từ Backend"
        description="Chỉ bản nháp có thể sửa. Công bố sẽ lưu trữ phiên bản đã công bố trước đó; lịch sử không bị ghi đè. Danh sách khóa học hiện dùng API công khai nên chỉ trả khóa ACTIVE."
      />

      {coursesQuery.isError && (
        <Alert
          type="error"
          showIcon
          message="Không tải được danh sách khóa học"
          description={getFriendlyErrorMessage(coursesQuery.error)}
          action={<Button size="small" onClick={() => coursesQuery.refetch()}>Thử lại</Button>}
        />
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 md:flex-row md:items-end">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-semibold text-slate-600">Khóa học</label>
          <Select
            showSearch
            optionFilterProp="label"
            loading={coursesQuery.isLoading}
            value={courseId}
            onChange={(value) => {
              setCourseId(value);
              setVersionId(undefined);
            }}
            options={courses.map((course: Course) => ({
              value: course.id,
              label: `${course.title} · ${course.categoryName} / ${course.subjectName}`,
            }))}
            placeholder="Chọn khóa học ACTIVE"
            className="w-full"
          />
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={!courseId}
          onClick={openCreateVersion}
          className="bg-brand-600"
        >
          Tạo bản nháp
        </Button>
      </div>

      {courseId && (
        <div className="grid gap-4 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,2fr)]">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-800">
              <SnippetsOutlined /> Lịch sử phiên bản
            </h3>
            {versionsQuery.isLoading ? (
              <Skeleton active paragraph={{ rows: 4 }} />
            ) : versionsQuery.isError ? (
              <Alert
                type="error"
                showIcon
                message="Không tải được lịch sử syllabus"
                description={getFriendlyErrorMessage(versionsQuery.error)}
                action={<Button size="small" onClick={() => versionsQuery.refetch()}>Thử lại</Button>}
              />
            ) : versions.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có phiên bản syllabus." />
            ) : (
              <div className="space-y-2">
                {versions.map((version) => (
                  <button
                    key={version.id}
                    type="button"
                    onClick={() => setVersionId(version.id)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      version.id === selectedVersionId
                        ? "border-indigo-300 bg-indigo-50"
                        : "border-slate-100 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-slate-800">
                        v{version.versionNumber} · {version.title}
                      </span>
                      <Tag color={VERSION_STATUS[version.status].color}>
                        {VERSION_STATUS[version.status].label}
                      </Tag>
                    </div>
                    {version.id === publishedVersionId && (
                      <div className="mt-1 text-xs font-medium text-emerald-700">Phiên bản đang công bố</div>
                    )}
                    <div className="mt-1 text-[11px] text-slate-500">
                      Cập nhật {new Date(version.updatedAt).toLocaleString("vi-VN")}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
            {detailQuery.isLoading ? (
              <Skeleton active paragraph={{ rows: 6 }} />
            ) : detailQuery.isError ? (
              <Alert
                type="error"
                showIcon
                message="Không tải được nội dung phiên bản"
                description={getFriendlyErrorMessage(detailQuery.error)}
                action={<Button size="small" onClick={() => detailQuery.refetch()}>Thử lại</Button>}
              />
            ) : selectedVersion ? (
              <>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="m-0 text-lg font-bold text-slate-900">
                        v{selectedVersion.versionNumber} · {selectedVersion.title}
                      </h3>
                      <Tag color={VERSION_STATUS[selectedVersion.status].color}>
                        {VERSION_STATUS[selectedVersion.status].label}
                      </Tag>
                    </div>
                    <p className="mb-0 mt-1 text-xs text-slate-500">
                      {selectedVersion.summary || "Chưa có tóm tắt."}
                      {selectedVersion.publishedAt
                        ? ` · Công bố ${new Date(selectedVersion.publishedAt).toLocaleString("vi-VN")}`
                        : ""}
                    </p>
                  </div>
                  <Space wrap>
                    {selectedVersion.status === "DRAFT" && (
                      <>
                        <Button icon={<EditOutlined />} onClick={() => openEditVersion(selectedVersion)}>
                          Sửa thông tin
                        </Button>
                        <Button
                          type="primary"
                          disabled={units.length === 0}
                          loading={publishMutation.isPending}
                          onClick={() => publishMutation.mutate(selectedVersion)}
                          className="bg-emerald-600"
                        >
                          Công bố
                        </Button>
                        <Popconfirm
                          title="Lưu trữ bản nháp này?"
                          description="Phiên bản sẽ được giữ trong lịch sử và không thể sửa."
                          okText="Lưu trữ"
                          cancelText="Hủy"
                          onConfirm={() => archiveMutation.mutate(selectedVersion)}
                        >
                          <Button danger loading={archiveMutation.isPending}>Lưu trữ</Button>
                        </Popconfirm>
                      </>
                    )}
                    {selectedVersion.status === "PUBLISHED" && (
                      <Popconfirm
                        title="Lưu trữ phiên bản đang công bố?"
                        description="Thao tác này sẽ ngừng phiên bản hiện hành. Chỉ tiếp tục khi đã có phương án thay thế."
                        okText="Lưu trữ"
                        cancelText="Hủy"
                        okButtonProps={{ danger: true, loading: archiveMutation.isPending }}
                        onConfirm={() => archiveMutation.mutate(selectedVersion)}
                      >
                        <Button danger loading={archiveMutation.isPending}>Lưu trữ</Button>
                      </Popconfirm>
                    )}
                  </Space>
                </div>

                {selectedCourse && (
                  <div className="mb-3 text-xs text-slate-500">
                    {selectedCourse.title} · {selectedCourse.categoryName} / {selectedCourse.subjectName}
                  </div>
                )}
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="m-0 font-semibold text-slate-800">Các bài học ({units.length})</h4>
                  <Button
                    icon={<PlusOutlined />}
                    disabled={selectedVersion.status !== "DRAFT"}
                    onClick={() => openUnitModal()}
                  >
                    Thêm bài học
                  </Button>
                </div>
                <Table<CurriculumUnit>
                  rowKey="id"
                  size="small"
                  columns={columns}
                  dataSource={units}
                  pagination={false}
                  locale={{ emptyText: "Bản nháp chưa có bài học; cần ít nhất một bài học để công bố." }}
                />
              </>
            ) : (
              <Empty description="Chọn một phiên bản syllabus để xem nội dung." />
            )}
          </section>
        </div>
      )}

      <Modal
        title={editingVersion ? "Sửa thông tin bản nháp" : "Tạo bản nháp syllabus"}
        open={versionModalOpen}
        onCancel={() => {
          setVersionModalOpen(false);
          setEditingVersion(null);
        }}
        onOk={() => versionForm.submit()}
        confirmLoading={createVersionMutation.isPending || updateVersionMutation.isPending}
        okText={editingVersion ? "Lưu" : "Tạo bản nháp"}
        cancelText="Hủy"
        destroyOnHidden
      >
        <Form
          form={versionForm}
          layout="vertical"
          onFinish={(values) =>
            editingVersion ? updateVersionMutation.mutate(values) : createVersionMutation.mutate(values)
          }
        >
          <Form.Item
            name="title"
            label="Tên phiên bản"
            rules={[{ required: true, whitespace: true, message: "Nhập tên phiên bản." }]}
          >
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="summary" label="Tóm tắt">
            <Input.TextArea rows={3} maxLength={3000} />
          </Form.Item>
          {!editingVersion && (
            <Form.Item name="cloneFromVersionId" label="Sao chép nội dung từ phiên bản">
              <Select
                allowClear
                placeholder="Tạo syllabus trống"
                options={versions.map((version) => ({
                  value: version.id,
                  label: `v${version.versionNumber} · ${version.title} (${VERSION_STATUS[version.status].label})`,
                }))}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title={editingUnit ? "Sửa bài học" : "Thêm bài học"}
        open={unitModalOpen}
        onCancel={() => {
          setUnitModalOpen(false);
          setEditingUnit(null);
        }}
        onOk={() => unitForm.submit()}
        confirmLoading={saveUnitMutation.isPending}
        okText="Lưu"
        cancelText="Hủy"
        destroyOnHidden
      >
        <Form form={unitForm} layout="vertical" onFinish={(values) => saveUnitMutation.mutate(values)}>
          <Form.Item
            name="title"
            label="Tên bài học"
            rules={[{ required: true, whitespace: true, message: "Nhập tên bài học." }]}
          >
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={2} maxLength={3000} />
          </Form.Item>
          <Form.Item name="learningObjectives" label="Mục tiêu học tập">
            <Input.TextArea rows={2} maxLength={3000} />
          </Form.Item>
          <Form.Item name="durationMinutes" label="Thời lượng (phút)">
            <InputNumber min={0} precision={0} className="w-full" />
          </Form.Item>
          <Form.Item name="topicsText" label="Chủ đề (mỗi dòng hoặc dấu phẩy là một chủ đề)">
            <Input.TextArea rows={3} maxLength={3000} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
