import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App as AntdApp, Button, Descriptions, Form, Input, Modal, Radio, Space, Tag } from "antd";
import { SolutionOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import AdminDataTable from "../../../../components/admin/AdminDataTable";
import AdminPageHeader from "../../../../components/admin/AdminPageHeader";
import { FetchError } from "../../../../api/apiClient";
import { classKeys } from "../../../../services/class.service";
import { teacherSubjectAuthorizationService } from "../../../../services/teacherSubjectAuthorization.service";
import { COURSE_LEVEL_LABELS, GRADE_LEVEL_LABELS } from "../../../../types/catalog";
import type {
  AdminSubjectAuthorization,
  TeacherSubjectAuthorizationStatus,
} from "../../../../types/teacherSubjectAuthorization";
import { getFriendlyErrorMessage } from "../../../../utils/apiErrorMap";

const QUERY_KEY = "admin-subject-authorizations";
const PAGE_SIZE = 20;

const STATUS: Record<TeacherSubjectAuthorizationStatus, { label: string; color: string }> = {
  PENDING: { label: "Chờ duyệt", color: "gold" },
  APPROVED: { label: "Đã duyệt", color: "success" },
  SUSPENDED: { label: "Đình chỉ", color: "error" },
};
const FILTERS = ["PENDING", "APPROVED", "SUSPENDED", "ALL"] as const;

// The screen is out of date: close the dialog and show the current list
const STALE_CODES = [
  "SUBJECT_AUTHORIZATION_CONFLICT",
  "SUBJECT_AUTHORIZATION_ALREADY_APPROVED",
  "SUBJECT_AUTHORIZATION_ALREADY_SUSPENDED",
  "SUBJECT_AUTHORIZATION_NOT_FOUND",
];

type Action = { item: AdminSubjectAuthorization; next: "APPROVED" | "SUSPENDED" };

const gradeText = (item: AdminSubjectAuthorization) =>
  item.gradeLevel ? GRADE_LEVEL_LABELS[item.gradeLevel] : "Không chọn khối";

export default function AdminSubjectAuthorizationsPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const status = FILTERS.find((filter) => filter === params.get("status")) ?? "PENDING";
  const page = Math.max(1, Math.floor(Number(params.get("page"))) || 1);
  const [action, setAction] = useState<Action | null>(null);
  const [form] = Form.useForm<{ reason: string }>();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [QUERY_KEY, status, page],
    queryFn: () => teacherSubjectAuthorizationService.adminList(status, page, PAGE_SIZE),
  });

  // Reviewing the last request of a page removes that page
  const lastPage = data ? Math.max(1, data.totalPages) : undefined;
  useEffect(() => {
    if (lastPage && page > lastPage) setParams({ status, page: String(lastPage) }, { replace: true });
  }, [lastPage, page, status, setParams]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    void queryClient.invalidateQueries({ queryKey: [...classKeys.all, "admin"] }); // class approval conditions
  };

  const review = useMutation({
    mutationFn: async ({ item, next, reason }: Action & { reason?: string }) => {
      // shortcut: re-reading narrows but does not close the race between two Admins (approve also lifts a
      // suspension), send the expected status once the API accepts one.
      const current = await teacherSubjectAuthorizationService.adminGet(item._id);
      if (current.status !== item.status) {
        throw new FetchError({ status: 409, code: "SUBJECT_AUTHORIZATION_CONFLICT", message: "Status changed" });
      }
      return next === "APPROVED"
        ? teacherSubjectAuthorizationService.adminApprove(item._id)
        : teacherSubjectAuthorizationService.adminSuspend(item._id, reason ?? "");
    },
    onSuccess: (_, { next }) => {
      message.success(next === "APPROVED" ? "Đã duyệt quyền giảng dạy." : "Đã đình chỉ quyền giảng dạy.");
      setAction(null);
      refresh();
    },
    onError: (err: unknown) => {
      message.error(getFriendlyErrorMessage(err, "Không cập nhật được quyền giảng dạy."));
      if (!STALE_CODES.includes((err as { code?: string }).code ?? "")) return;
      setAction(null);
      refresh();
    },
  });

  const suspending = action?.next === "SUSPENDED";

  return (
    <div className="w-full pb-10">
      <AdminPageHeader
        eyebrow="Quản lý giáo viên"
        eyebrowIcon={<SolutionOutlined />}
        title="Duyệt quyền giảng dạy"
        description="Lớp chỉ mở được khi quyền đã duyệt khớp đúng môn, khối lớp và cấp độ của khóa học."
      />

      <div className="mb-4 overflow-x-auto pb-1">
        <Radio.Group
          aria-label="Lọc theo trạng thái"
          className="whitespace-nowrap"
          optionType="button"
          buttonStyle="solid"
          value={status}
          options={FILTERS.map((value) => ({ value, label: value === "ALL" ? "Tất cả" : STATUS[value].label }))}
          onChange={(event) => setParams({ status: event.target.value })}
        />
      </div>

      {isError ? (
        <Alert
          type="error"
          showIcon
          title="Không tải được danh sách quyền giảng dạy"
          description={getFriendlyErrorMessage(error)}
          action={<Button onClick={() => refetch()}>Thử lại</Button>}
        />
      ) : (
        <AdminDataTable<AdminSubjectAuthorization>
          tableTitle="Yêu cầu quyền giảng dạy"
          totalCount={data?.total}
          totalCountLabel="yêu cầu"
          rowKey="_id"
          loading={isLoading}
          dataSource={data?.items}
          scroll={{ x: 920 }}
          locale={{ emptyText: "Không có yêu cầu nào trong mục này." }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: data?.total,
            showSizeChanger: false,
            onChange: (next) => setParams({ status, page: String(next) }),
          }}
          columns={[
            {
              title: "Giáo viên",
              render: (_, item) => (
                <>
                  <div className="font-semibold">{item.teacher?.fullName || "—"}</div>
                  <div className="text-xs text-slate-500">{item.teacher?.email}</div>
                </>
              ),
            },
            {
              title: "Môn học",
              render: (_, item) => (
                <>
                  <div className="font-semibold">{item.subjectName}</div>
                  <div className="text-xs text-slate-500">{item.categoryName}</div>
                </>
              ),
            },
            { title: "Khối lớp", render: (_, item) => gradeText(item) },
            { title: "Cấp độ", render: (_, item) => COURSE_LEVEL_LABELS[item.level] },
            { title: "Gửi lúc", render: (_, item) => dayjs(item.requestedAt).format("DD/MM/YYYY HH:mm") },
            {
              title: "Trạng thái",
              render: (_, item) => <Tag color={STATUS[item.status].color}>{STATUS[item.status].label}</Tag>,
            },
            {
              title: "Thao tác",
              render: (_, item) => (
                <Space>
                  {item.status !== "APPROVED" && (
                    <Button type="primary" size="small" onClick={() => setAction({ item, next: "APPROVED" })}>
                      {item.status === "SUSPENDED" ? "Mở lại" : "Duyệt"}
                    </Button>
                  )}
                  {item.status !== "SUSPENDED" && (
                    <Button danger size="small" onClick={() => setAction({ item, next: "SUSPENDED" })}>
                      Đình chỉ
                    </Button>
                  )}
                </Space>
              ),
            },
          ]}
        />
      )}

      <Modal
        title={suspending ? "Đình chỉ quyền giảng dạy" : "Xác nhận duyệt quyền giảng dạy"}
        open={Boolean(action)}
        okText={suspending ? "Xác nhận đình chỉ" : "Xác nhận duyệt"}
        cancelText="Hủy"
        okButtonProps={{ danger: suspending }}
        confirmLoading={review.isPending}
        onCancel={() => !review.isPending && setAction(null)}
        onOk={() => (suspending ? form.submit() : action && review.mutate(action))}
        destroyOnHidden
      >
        {action && (
          <div className="flex flex-col gap-3">
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Giáo viên">{action.item.teacher?.fullName || "—"}</Descriptions.Item>
              <Descriptions.Item label="Danh mục">{action.item.categoryName}</Descriptions.Item>
              <Descriptions.Item label="Môn học">{action.item.subjectName}</Descriptions.Item>
              <Descriptions.Item label="Khối lớp">{gradeText(action.item)}</Descriptions.Item>
              <Descriptions.Item label="Cấp độ">{COURSE_LEVEL_LABELS[action.item.level]}</Descriptions.Item>
              {action.item.requestNote && (
                <Descriptions.Item label="Ghi chú">{action.item.requestNote}</Descriptions.Item>
              )}
              {action.item.status === "SUSPENDED" && action.item.suspensionReason && (
                <Descriptions.Item label="Lý do đình chỉ">{action.item.suspensionReason}</Descriptions.Item>
              )}
            </Descriptions>

            {!suspending && !action.item.gradeLevel && (
              <Alert
                type="warning"
                showIcon
                title="Yêu cầu này không chọn khối, nên chỉ dùng được cho khóa học không gắn khối."
              />
            )}
            {!suspending && action.item.teacher?.verificationStatus !== "VERIFIED" && (
              <Alert type="warning" showIcon title="Giáo viên chưa được xác minh. Duyệt quyền vẫn chưa đủ để mở lớp." />
            )}
            {suspending && (
              <>
                <Alert
                  type="warning"
                  showIcon
                  title="Giáo viên không thể tự đăng ký lại, chỉ Admin mở lại được. Lớp chưa mở cần quyền này sẽ không phê duyệt được."
                />
                <Form
                  form={form}
                  layout="vertical"
                  preserve={false}
                  onFinish={({ reason }) => review.mutate({ ...action, reason })}
                >
                  <Form.Item
                    name="reason"
                    label="Lý do (gửi cho giáo viên)"
                    rules={[{ required: true, whitespace: true, message: "Vui lòng nhập lý do đình chỉ." }]}
                  >
                    <Input.TextArea rows={3} maxLength={1000} />
                  </Form.Item>
                </Form>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
