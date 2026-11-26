import { formatSubjectLabel } from "../../../utils/subjectLabel";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App as AntdApp, Button, Form, Input, Modal, Select, Skeleton, Space, Tag } from "antd";
import { DownOutlined, PlusOutlined, UpOutlined } from "@ant-design/icons";
import { teacherSubjectAuthorizationService } from "../../../services/teacherSubjectAuthorization.service";
import { courseCatalogService as catalogService } from "../../../services/courseCatalog.service";
import { GRADE_LEVEL_LABELS, COURSE_LEVELS, COURSE_LEVEL_LABELS, offeredGradeLevels, isForeignLanguageCategory } from "../../../types/catalog";
import type {
  CreateTeacherSubjectAuthorizationPayload,
  TeacherSubjectAuthorization,
  TeacherSubjectAuthorizationStatus,
} from "../../../types/teacherSubjectAuthorization";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";
import { useTeacherVerification } from "../../../hooks/useTeacherVerification";
import { useAuthStore } from "../../../stores/auth.store";

const AUTH_STATUS: Record<TeacherSubjectAuthorizationStatus, { label: string; color: string }> = {
  PENDING: { label: "Đã đăng ký · Chờ duyệt", color: "processing" },
  APPROVED: { label: "Đã được duyệt", color: "success" },
  SUSPENDED: { label: "Chưa được phép · Đã đình chỉ", color: "error" },
};

type AuthorizationFormValues = CreateTeacherSubjectAuthorizationPayload;

/** TEA-07: subjects/grades/levels the teacher may open classes for, each approved by an Admin (moved from the former course catalog page). */
export default function TeacherSubjectAuthorizationCard() {
  const queryClient = useQueryClient();
  const { message } = AntdApp.useApp();
  const { user } = useAuthStore();
  const { isTeacher } = useTeacherVerification();
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [showAllAuthorizations, setShowAllAuthorizations] = useState(false);
  const [requestForm] = Form.useForm<AuthorizationFormValues>();

  const categoriesQuery = useQuery({
    queryKey: ["public-categories"],
    queryFn: () => catalogService.listCategories(),
    staleTime: 300_000,
  });
  const categories = categoriesQuery.data ?? [];
  const requestCategoryId = Form.useWatch("categoryId", requestForm);
  const subjectsQuery = useQuery({
    queryKey: ["public-subjects", requestCategoryId],
    queryFn: () => (requestCategoryId ? catalogService.listSubjectsByCategory(requestCategoryId) : Promise.resolve([])),
    enabled: Boolean(requestCategoryId),
    staleTime: 120_000,
  });
  const authorizationsQuery = useQuery({
    queryKey: ["teacher-subject-authorizations", user?.userId],
    queryFn: () => teacherSubjectAuthorizationService.listAllMyAuthorizations(),
    enabled: isTeacher,
  });
  const authorizations = authorizationsQuery.data ?? [];

  const requestMutation = useMutation({
    mutationFn: (values: AuthorizationFormValues) =>
      teacherSubjectAuthorizationService.requestAuthorization({
        ...values,
        requestNote: values.requestNote?.trim() || undefined,
      }),
    onSuccess: async () => {
      message.success("Đã gửi yêu cầu đăng ký môn giảng dạy.");
      setRequestModalOpen(false);
      requestForm.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["teacher-subject-authorizations", user?.userId] });
    },
    onError: (error: unknown) => message.error(getFriendlyErrorMessage(error, "Không thể gửi yêu cầu đăng ký môn.")),
  });
  const requestCategory = categories.find((category) => category.id === requestCategoryId);
  const isLanguageRequest = isForeignLanguageCategory(requestCategory);
  const requestGradeLevels = offeredGradeLevels(requestCategory);

  return (
    <div className="bg-white rounded-2xl p-5 sm:px-6 border border-slate-100 shadow-sm flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[17px] font-bold text-slate-800 m-0">Quyền giảng dạy theo môn</h3>
          <p className="mb-0 mt-1 text-xs text-slate-500">
            Bạn vẫn có thể tạo và gửi duyệt lớp khi chưa có quyền. Lớp chỉ được mở tuyển sinh khi môn, khối và cấp độ đã được Admin duyệt.
          </p>
        </div>
        <Button icon={<PlusOutlined />} onClick={() => setRequestModalOpen(true)} disabled={!isTeacher}>
          Đăng ký môn giảng dạy
        </Button>
      </div>

      {authorizationsQuery.isLoading ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : authorizationsQuery.isError ? (
        <Alert
          type="error"
          showIcon
          message="Không tải được quyền giảng dạy"
          description={getFriendlyErrorMessage(authorizationsQuery.error)}
          action={<Button size="small" onClick={() => authorizationsQuery.refetch()}>Thử lại</Button>}
        />
      ) : authorizations.length ? (
        <div className="flex flex-col gap-3">
          <Space wrap>
            {(showAllAuthorizations ? authorizations : authorizations.slice(0, 4)).map(
              (authorization: TeacherSubjectAuthorization) => (
                <Tag key={authorization.id} color={AUTH_STATUS[authorization.status].color} className="!m-0 px-2 py-1">
                  {authorization.categoryName} · {formatSubjectLabel(authorization.subjectName, undefined, authorization.categoryName)}
                  {authorization.gradeLevel ? ` · ${GRADE_LEVEL_LABELS[authorization.gradeLevel]}` : " · Không theo khối"}
                  {authorization.level ? ` · ${COURSE_LEVEL_LABELS[authorization.level]}` : ""}
                  {` · ${AUTH_STATUS[authorization.status].label}`}
                  {authorization.reviewNote ? ` · ${authorization.reviewNote}` : ""}
                </Tag>
              )
            )}
          </Space>
          {authorizations.length > 4 && (
            <div>
              <Button
                type="link"
                size="small"
                icon={showAllAuthorizations ? <UpOutlined /> : <DownOutlined />}
                onClick={() => setShowAllAuthorizations((prev) => !prev)}
                className="!px-0 text-xs font-semibold text-teal-700 hover:text-teal-800"
              >
                {showAllAuthorizations
                  ? "Thu gọn"
                  : `Xem tất cả (${authorizations.length} quyền giảng dạy)`}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <Alert
          type="info"
          showIcon
          message="Chưa có yêu cầu quyền giảng dạy"
          description="Đăng ký môn, khối và cấp độ cần giảng dạy để Admin xem xét."
        />
      )}

      <Modal
        title="Đăng ký quyền giảng dạy theo môn"
        open={requestModalOpen}
        onCancel={() => !requestMutation.isPending && setRequestModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        {categoriesQuery.isError ? (
          <Alert
            type="error"
            showIcon
            message="Không tải được danh mục"
            action={<Button size="small" onClick={() => categoriesQuery.refetch()}>Thử lại</Button>}
          />
        ) : (
          <Form
            form={requestForm}
            layout="vertical"
            onFinish={(values) => requestMutation.mutate(values)}
            onValuesChange={(changed) => {
              if ("categoryId" in changed) requestForm.setFieldsValue({ subjectId: undefined, gradeLevel: undefined });
            }}
          >
            <Form.Item name="categoryId" label="Danh mục" rules={[{ required: true, message: "Chọn danh mục." }]}>
              <Select
                showSearch
                optionFilterProp="label"
                loading={categoriesQuery.isLoading}
                options={categories
                  .filter((category) => offeredGradeLevels(category).length > 0)
                  .map((category) => ({ value: category.id, label: category.name }))}
              />
            </Form.Item>
            <Form.Item name="subjectId" label="Môn học" rules={[{ required: true, message: "Chọn môn học." }]}>
              <Select
                showSearch
                optionFilterProp="label"
                loading={subjectsQuery.isLoading}
                disabled={!requestCategoryId}
                options={(subjectsQuery.data ?? []).map((subject) => ({ value: subject.id, label: formatSubjectLabel(subject.name, subject.slug) }))}
              />
            </Form.Item>
            {subjectsQuery.isError && (
              <Alert
                type="error"
                showIcon
                className="mb-4"
                message="Không tải được môn học"
                description={getFriendlyErrorMessage(subjectsQuery.error)}
                action={<Button size="small" onClick={() => subjectsQuery.refetch()}>Thử lại</Button>}
              />
            )}
            <Form.Item
              name="gradeLevel"
              label={isLanguageRequest ? "Khối lớp (tùy chọn)" : "Khối lớp"}
              rules={[{ required: !isLanguageRequest, message: "Chọn khối lớp cụ thể cho môn học." }]}
            >
              <Select
                disabled={!requestCategoryId}
                allowClear={isLanguageRequest}
                placeholder={isLanguageRequest ? "Không theo khối" : requestCategoryId ? "Chọn khối lớp" : "Chọn danh mục trước"}
                options={requestGradeLevels.map((grade) => ({ value: grade, label: GRADE_LEVEL_LABELS[grade] }))}
              />
            </Form.Item>
            <Form.Item name="level" label="Cấp độ" rules={[{ required: true, message: "Chọn cấp độ." }]}>
              <Select options={COURSE_LEVELS.map((level) => ({ value: level, label: COURSE_LEVEL_LABELS[level] }))} />
            </Form.Item>
            <Form.Item name="requestNote" label="Ghi chú (không bắt buộc)">
              <Input.TextArea rows={3} maxLength={1000} />
            </Form.Item>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setRequestModalOpen(false)} disabled={requestMutation.isPending}>
                Hủy
              </Button>
              <Button type="primary" htmlType="submit" loading={requestMutation.isPending}>
                Gửi yêu cầu
              </Button>
            </div>
          </Form>
        )}
      </Modal>
    </div>
  );
}
