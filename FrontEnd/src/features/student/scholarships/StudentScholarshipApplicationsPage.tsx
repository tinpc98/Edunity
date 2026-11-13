import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  App as AntdApp,
  Typography,
  Card,
  Tag,
  Button,
  Modal,
  Form,
  Input,
  Upload,
  Skeleton,
  Empty,
  Pagination,
  Alert,
  Segmented,
  Steps,
  Select,
} from "antd";
import { ExclamationCircleOutlined, UploadOutlined, FileSearchOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import type { UploadFile } from "antd/es/upload/interface";
import {
  scholarshipApplicationService,
  scholarshipApplicationKeys,
} from "../../../services/scholarshipApplication.service";
import type {
  ResubmitScholarshipPayload,
  ScholarshipApplication,
  ScholarshipApplicationStatus,
  ScholarshipGuardianInfo,
  ScholarshipSchoolInfo,
} from "../../../types/scholarship";
import {
  SCHOLARSHIP_APP_STATUS_LABELS,
  SCHOLARSHIP_APP_STATUS_COLORS,
} from "../../../types/scholarship";
import { formatVND } from "../../../types/payment";
import { ROUTES } from "../../../routes/routePaths";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";
import { PRIVATE_DOCUMENT_ACCEPT, validatePrivateDocument } from "../../../utils/fileValidation";
import { useAllMyApplications } from "./hooks/useMyApplications";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
type ResubmitFormValues = {
  statement: string;
  submissionMode?: ScholarshipApplication["submissionMode"];
  checklistItemCode?: string;
  guardianInfo?: Partial<ScholarshipGuardianInfo>;
  schoolInfo?: Partial<ScholarshipSchoolInfo>;
};

type StatusFilter = "ALL" | ScholarshipApplicationStatus;
const STATUS_ORDER: ScholarshipApplicationStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "NEED_MORE_INFORMATION",
  "DOSSIER_VERIFIED",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
];
const PAGE_SIZE = 10;

const formatDateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" })
    : "";

/** Submitted → Under review → Result, mapped from the 4 backend statuses. */
function ApplicationProgress({ app }: { app: ScholarshipApplication }) {
  const resultTitle =
    app.status === "APPROVED"
      ? "Được cấp học bổng"
      : app.status === "REJECTED"
        ? "Không được duyệt"
        : app.status === "DOSSIER_VERIFIED"
          ? "Đã xác minh hồ sơ"
          : app.status === "WITHDRAWN"
            ? "Đã rút hồ sơ"
            : "Kết quả";

  const current =
    app.status === "DRAFT"
      ? 0
      : app.status === "SUBMITTED" || app.status === "NEED_MORE_INFORMATION"
        ? 1
        : 2;
  const status =
    app.status === "REJECTED"
      ? "error"
      : app.status === "APPROVED" || app.status === "DOSSIER_VERIFIED" || app.status === "WITHDRAWN"
        ? "finish"
        : "process";

  return (
    <Steps
      size="small"
      current={current}
      status={status}
      items={[
        {
          title: app.status === "DRAFT" ? "Đang hoàn thiện bản nháp" : "Đã nộp hồ sơ",
          description: formatDateTime(app.status === "DRAFT" ? app.updatedAt || app.createdAt : app.submittedAt),
        },
        { title: app.status === "NEED_MORE_INFORMATION" ? "Cần bổ sung" : "Đang xét duyệt" },
        { title: resultTitle, description: app.reviewedAt && current === 2 ? formatDateTime(app.reviewedAt) : undefined },
      ]}
    />
  );
}

export default function StudentScholarshipApplicationsPage() {
  const queryClient = useQueryClient();
  const { message } = AntdApp.useApp();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedApplicationId, setExpandedApplicationId] = useState<string>();

  // Selected application for resubmission
  const [resubmitTarget, setResubmitTarget] = useState<ScholarshipApplication | null>(null);
  const [resubmitForm] = Form.useForm<ResubmitFormValues>();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [isResubmitting, setIsResubmitting] = useState(false);

  // The endpoint has no status filter: load all of the student's applications and filter locally
  const { data, isLoading, isError, refetch } = useAllMyApplications();
  const allItems = useMemo(() => data?.items ?? [], [data]);
  const resubmitDetailQuery = useQuery({
    queryKey: scholarshipApplicationKeys.detail(resubmitTarget?.id ?? ""),
    queryFn: () => scholarshipApplicationService.getMyApplicationDetail(resubmitTarget?.id ?? ""),
    enabled: Boolean(resubmitTarget),
    retry: false,
  });
  const expandedDetailQuery = useQuery({
    queryKey: scholarshipApplicationKeys.detail(expandedApplicationId ?? ""),
    queryFn: () => scholarshipApplicationService.getMyApplicationDetail(expandedApplicationId ?? ""),
    enabled: Boolean(expandedApplicationId),
    retry: false,
  });
  const resubmitChecklist = resubmitDetailQuery.data?.campaign?.documentChecklist ?? [];
  const requiresFullDossier = Boolean(
    resubmitTarget &&
      (resubmitTarget.guardianInfo ||
        resubmitTarget.schoolInfo ||
        (resubmitTarget.submissionMode ?? "ONLINE") !== "ONLINE" ||
        resubmitChecklist.length > 0 ||
        resubmitDetailQuery.data?.campaign?.dossierPolicy?.requireGuardianInfo ||
        resubmitDetailQuery.data?.campaign?.dossierPolicy?.requireSchoolInfo),
  );

  const counts = useMemo(() => {
    const result = Object.fromEntries(STATUS_ORDER.map((status) => [status, 0])) as Record<ScholarshipApplicationStatus, number>;
    for (const app of allItems) result[app.status] += 1;
    return result;
  }, [allItems]);

  const filtered = statusFilter === "ALL" ? allItems : allItems.filter((app) => app.status === statusFilter);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleOpenResubmit = (app: ScholarshipApplication) => {
    setResubmitTarget(app);
    resubmitForm.setFieldsValue({
      statement: app.statement,
      submissionMode: app.submissionMode ?? "ONLINE",
      guardianInfo: app.guardianInfo ?? undefined,
      schoolInfo: app.schoolInfo ?? undefined,
    });
    setFileList([]);
  };

  const handleCloseResubmit = () => {
    if (isResubmitting) return;
    setResubmitTarget(null);
    resubmitForm.resetFields();
    setFileList([]);
  };

  const handleResubmit = async () => {
    if (!resubmitTarget) return;

    let values: ResubmitFormValues;
    try {
      const validatedValues = await resubmitForm.validateFields();
      values = {
        ...validatedValues,
        guardianInfo: resubmitForm.getFieldValue("guardianInfo"),
        schoolInfo: resubmitForm.getFieldValue("schoolInfo"),
      };
    } catch {
      return; // field errors are shown inline
    }

    setIsResubmitting(true);
    try {
      if (resubmitDetailQuery.isError) {
        throw new Error("Không thể tải yêu cầu hồ sơ hiện hành. Vui lòng đóng và mở lại biểu mẫu.");
      }
      if (fileList.length > 0 && resubmitChecklist.length > 0 && !values.checklistItemCode) {
        throw new Error("Vui lòng chọn loại tài liệu cần bổ sung theo checklist của chiến dịch.");
      }
      const uploadedFiles: { storageKey: string; mimeType?: string; side: "SINGLE" }[] = [];
      for (const item of fileList) {
        if (!item.originFileObj) continue;
        try {
          const res = await scholarshipApplicationService.uploadDocument(item.originFileObj);
          uploadedFiles.push({ storageKey: res.storageKey, mimeType: res.mimeType, side: "SINGLE" });
        } catch (err) {
          throw new Error(`Tải "${item.name}" thất bại: ${getFriendlyErrorMessage(err)}`);
        }
      }

      const payload: ResubmitScholarshipPayload = {
        statement: values.statement.trim(),
        ...(values.submissionMode ? { submissionMode: values.submissionMode } : {}),
      };
      if (requiresFullDossier) {
        payload.guardianInfo = values.guardianInfo as ScholarshipGuardianInfo;
        payload.schoolInfo = values.schoolInfo as ScholarshipSchoolInfo;
      }
      if (uploadedFiles.length > 0) {
        payload.documents = [{
          ...(values.checklistItemCode ? { checklistItemCode: values.checklistItemCode } : {}),
          documentType: "SCHOLARSHIP_PROOF",
          files: uploadedFiles,
        }];
      }

      await scholarshipApplicationService.resubmit(resubmitTarget.id, payload);
      message.success("Bổ sung hồ sơ thành công! Đơn đã được chuyển về trạng thái Chờ xét duyệt.");
      setResubmitTarget(null);
      resubmitForm.resetFields();
      setFileList([]);
      queryClient.invalidateQueries({ queryKey: scholarshipApplicationKeys.all });
    } catch (err) {
      message.error(getFriendlyErrorMessage(err, "Bổ sung hồ sơ thất bại. Vui lòng thử lại."));
    } finally {
      setIsResubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Title level={2} className="!mb-1 !text-2xl font-black text-slate-900 tracking-tight">
            Hồ sơ xin học bổng
          </Title>
          <Text className="text-xs text-slate-500">
            Theo dõi tiến độ xét duyệt và bổ sung thông tin hồ sơ học bổng theo yêu cầu.
          </Text>
        </div>

        <Link to={ROUTES.STUDENT.SCHOLARSHIP_EXPLORE}>
          <Button type="primary" className="bg-indigo-600 font-semibold text-xs rounded-xl h-10 px-5 shadow-2xs">
            Tìm học bổng để ứng tuyển
          </Button>
        </Link>
      </div>

      {counts.NEED_MORE_INFORMATION > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`Bạn có ${counts.NEED_MORE_INFORMATION} hồ sơ cần bổ sung thông tin`}
          description="Vui lòng bổ sung theo yêu cầu của Ban quản trị để hồ sơ tiếp tục được xét duyệt."
          action={
            <Button size="small" onClick={() => { setStatusFilter("NEED_MORE_INFORMATION"); setCurrentPage(1); }}>
              Xem ngay
            </Button>
          }
          className="rounded-xl"
        />
      )}

      {!isLoading && !isError && allItems.length > 0 && (
        <Segmented<StatusFilter>
          value={statusFilter}
          onChange={(value) => { setStatusFilter(value); setCurrentPage(1); }}
          options={[
            { label: `Tất cả (${allItems.length})`, value: "ALL" },
            ...STATUS_ORDER.map((status) => ({ label: `${SCHOLARSHIP_APP_STATUS_LABELS[status]} (${counts[status]})`, value: status })),
          ]}
        />
      )}

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton active paragraph={{ rows: 3 }} />
          <Skeleton active paragraph={{ rows: 3 }} />
        </div>
      ) : isError ? (
        <Alert
          type="error"
          showIcon
          message="Lỗi tải danh sách hồ sơ"
          description="Không thể tải danh sách hồ sơ học bổng. Vui lòng thử lại."
          action={
            <Button size="small" type="primary" onClick={() => refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-slate-200 text-center py-12">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={allItems.length === 0 ? "Bạn chưa nộp hồ sơ xin học bổng nào." : "Không có hồ sơ nào ở trạng thái này."}
          >
            {allItems.length === 0 && (
              <Link to={ROUTES.STUDENT.SCHOLARSHIP_EXPLORE}>
                <Button type="primary" className="bg-indigo-600 font-semibold text-xs rounded-xl h-9 px-5">
                  Tìm kiếm chiến dịch để ứng tuyển
                </Button>
              </Link>
            )}
          </Empty>
        </Card>
      ) : (
        <div className="space-y-4">
          {pageItems.map((app) => {
            const isNeedMoreInfo = app.status === "NEED_MORE_INFORMATION";
            const isApproved = app.status === "APPROVED";
            const isRejected = app.status === "REJECTED";
            const isDraft = app.status === "DRAFT";

            return (
              <Card
                key={app.id}
                className={`rounded-2xl border transition-all shadow-2xs ${
                  isNeedMoreInfo
                    ? "border-amber-300 bg-amber-50/20"
                    : isApproved
                    ? "border-emerald-200 bg-emerald-50/10"
                    : isRejected
                    ? "border-rose-200 bg-rose-50/10"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  {/* Left: Application Details */}
                  <div className="space-y-3 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`${ROUTES.STUDENT.SCHOLARSHIP_EXPLORE}/${app.campaignId}`}
                        className="font-bold text-base text-slate-900 hover:text-indigo-600 transition-colors"
                      >
                        {app.campaignTitle || "Chiến dịch học bổng"}
                      </Link>

                      <Tag
                        color={SCHOLARSHIP_APP_STATUS_COLORS[app.status]}
                        className="text-[11px] font-semibold border-none"
                      >
                        {SCHOLARSHIP_APP_STATUS_LABELS[app.status]}
                      </Tag>
                    </div>

                    <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span>
                        Mức học bổng định mức:{" "}
                        <strong className="text-indigo-700">{formatVND(app.awardAmountPerStudent)}</strong>
                      </span>
                      <span>•</span>
                      <span>Mã hồ sơ: {app.applicationCode || `#${app.id.slice(-6).toUpperCase()}`}</span>
                    </div>

                    <div className="pt-1 max-w-2xl">
                      <ApplicationProgress app={app} />
                    </div>

                    {/* Statement snippet */}
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-700">
                      <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">Thư nguyện vọng:</div>
                      <Paragraph
                        ellipsis={{ rows: 2, expandable: true, symbol: "Xem thêm" }}
                        className="!mb-0 whitespace-pre-wrap"
                      >
                        {app.statement}
                      </Paragraph>
                    </div>

                    {/* Review Note if any */}
                    {app.reviewNote && (
                      <div
                        className={`p-3 rounded-xl text-xs border ${
                          isNeedMoreInfo
                            ? "bg-amber-100/60 border-amber-300 text-amber-900"
                            : isRejected
                            ? "bg-rose-100/60 border-rose-200 text-rose-900"
                            : "bg-emerald-100/60 border-emerald-200 text-emerald-900"
                        }`}
                      >
                        <div className="font-bold text-[11px] uppercase mb-0.5">
                          {isNeedMoreInfo
                            ? "Yêu cầu bổ sung từ Quản trị viên:"
                            : isRejected
                              ? "Lý do từ chối:"
                              : app.status === "APPROVED"
                                ? "Ghi chú phê duyệt:"
                                : "Phản hồi từ Quản trị viên:"}
                        </div>
                        <div className="whitespace-pre-wrap">{app.reviewNote}</div>
                      </div>
                    )}

                    <Button
                      size="small"
                      type="link"
                      icon={<FileSearchOutlined />}
                      className="!px-0"
                      onClick={() => setExpandedApplicationId((id) => id === app.id ? undefined : app.id)}
                    >
                      {expandedApplicationId === app.id ? "Ẩn chi tiết" : "Xem checklist và lịch sử hồ sơ"}
                    </Button>

                    {expandedApplicationId === app.id && (
                      <div className="rounded-xl border border-slate-200 p-3 space-y-3">
                        {expandedDetailQuery.isLoading ? (
                          <Text type="secondary">Đang tải chi tiết hồ sơ...</Text>
                        ) : expandedDetailQuery.isError ? (
                          <Alert type="error" showIcon message="Không tải được chi tiết hồ sơ" description="Vui lòng thử lại." action={<Button size="small" onClick={() => void expandedDetailQuery.refetch()}>Thử lại</Button>} />
                        ) : expandedDetailQuery.data?.id === app.id ? (
                          <>
                            <div className="text-xs text-slate-500">
                              Mã hồ sơ: {expandedDetailQuery.data.applicationCode || "—"} · Hình thức: {expandedDetailQuery.data.submissionMode || "ONLINE"}
                            </div>
                            {expandedDetailQuery.data.checklistProgress?.length ? (
                              <div className="space-y-1">
                                {expandedDetailQuery.data.checklistProgress.map((item) => (
                                  <div key={item.code} className="flex items-center justify-between gap-2 text-xs">
                                    <span>{item.title || item.code}</span>
                                    <Tag color={item.satisfied ? "success" : "warning"}>{item.satisfied ? "Đã đáp ứng" : "Còn thiếu"}</Tag>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            {expandedDetailQuery.data.paperReceipts?.map((receipt) => (
                              <div key={receipt._id || receipt.id} className="rounded-lg bg-slate-50 p-2 text-xs">
                                <div className="font-semibold">Biên nhận {receipt.receiptCode} · {receipt.status}</div>
                                <div className="text-slate-500">Tiếp nhận: {formatDateTime(receipt.receivedAt)}</div>
                                {receipt.history?.map((event, index) => (
                                  <div key={`${event.action}-${event.recordedAt}-${index}`} className="mt-1 text-slate-600">
                                    {event.action} · {event.toStatus} · {formatDateTime(event.recordedAt)}
                                    {event.note ? ` — ${event.note}` : ""}
                                  </div>
                                ))}
                              </div>
                            ))}
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {isDraft && (
                      <Link
                        to={`${ROUTES.STUDENT.SCHOLARSHIP_EXPLORE}/${app.campaignId}?draftId=${encodeURIComponent(app.id)}`}
                      >
                        <Button type="primary" className="bg-indigo-600 text-xs font-bold rounded-xl h-10 px-5 border-none shadow-2xs">
                          Tiếp tục hoàn thiện
                        </Button>
                      </Link>
                    )}
                    {isNeedMoreInfo && (
                      <Button
                        type="primary"
                        onClick={() => handleOpenResubmit(app)}
                        className="bg-amber-600 hover:bg-amber-500 text-xs font-bold rounded-xl h-10 px-5 border-none shadow-2xs"
                      >
                        Bổ sung hồ sơ & Gửi lại
                      </Button>
                    )}

                    {isApproved && (
                      <Link to={ROUTES.STUDENT.SCHOLARSHIPS}>
                        <Button
                          type="primary"
                          className="bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold rounded-xl h-10 px-5 border-none shadow-2xs"
                        >
                          Xem học bổng đã cấp
                        </Button>
                      </Link>
                    )}

                    {isRejected && (
                      <Link to={`${ROUTES.STUDENT.SCHOLARSHIP_EXPLORE}/${app.campaignId}`}>
                        <Button className="text-xs font-semibold rounded-xl h-10 px-5">Xem lại chiến dịch</Button>
                      </Link>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}

          {filtered.length > PAGE_SIZE && (
            <div className="flex justify-center pt-4">
              <Pagination
                current={currentPage}
                total={filtered.length}
                pageSize={PAGE_SIZE}
                onChange={(page) => setCurrentPage(page)}
                showSizeChanger={false}
              />
            </div>
          )}
        </div>
      )}

      {/* Resubmit Modal */}
      <Modal
        open={Boolean(resubmitTarget)}
        onCancel={handleCloseResubmit}
        footer={null}
        width={600}
        destroyOnHidden
        maskClosable={!isResubmitting}
        title={<div className="text-base font-bold text-slate-900">Bổ sung thông tin hồ sơ học bổng</div>}
      >
        {resubmitTarget && (
          <div className="py-2 space-y-4">
            <Alert
              type="warning"
              showIcon
              icon={<ExclamationCircleOutlined />}
              message="Yêu cầu từ Quản trị viên"
              description={resubmitTarget.reviewNote || "Vui lòng bổ sung đầy đủ thông tin được yêu cầu."}
              className="rounded-xl text-xs"
            />

            {resubmitDetailQuery.isError && (
              <Alert type="error" showIcon message="Không tải được hồ sơ của bạn" description="Yêu cầu hồ sơ hiện hành không sẵn sàng; vui lòng thử lại." action={<Button size="small" onClick={() => void resubmitDetailQuery.refetch()}>Thử lại</Button>} />
            )}

            <Form form={resubmitForm} layout="vertical" className="space-y-4">
              {requiresFullDossier && (
                <>
                  <div className="font-semibold text-sm text-slate-800">Cập nhật thông tin người giám hộ</div>
                  <Form.Item name={["guardianInfo", "fullName"]} label="Họ tên người giám hộ" rules={[{ required: true, min: 2, max: 120 }]}>
                    <Input maxLength={120} />
                  </Form.Item>
                  <Form.Item name={["guardianInfo", "relationship"]} label="Quan hệ với học sinh" rules={[{ required: true }]}>
                    <Select options={[
                      { value: "FATHER", label: "Cha" }, { value: "MOTHER", label: "Mẹ" },
                      { value: "GRANDPARENT", label: "Ông/Bà" }, { value: "SIBLING", label: "Anh/Chị/Em" },
                      { value: "LEGAL_GUARDIAN", label: "Người giám hộ hợp pháp" }, { value: "OTHER", label: "Khác" },
                    ]} />
                  </Form.Item>
                  <Form.Item name={["guardianInfo", "phone"]} label="Số điện thoại" rules={[{ required: true, min: 8, max: 20 }]}>
                    <Input inputMode="tel" maxLength={20} autoComplete="off" />
                  </Form.Item>
                  <Form.Item name={["guardianInfo", "email"]} label="Email (không bắt buộc)" rules={[{ type: "email" }]}>
                    <Input maxLength={160} autoComplete="off" />
                  </Form.Item>
                  <div className="font-semibold text-sm text-slate-800">Cập nhật thông tin trường học</div>
                  <Form.Item name={["schoolInfo", "schoolName"]} label="Tên trường" rules={[{ required: true, min: 2, max: 200 }]}>
                    <Input maxLength={200} />
                  </Form.Item>
                  <Form.Item name={["schoolInfo", "gradeLevel"]} label="Cấp lớp" rules={[{ required: true }]}>
                    <Select options={[
                      { value: "PRE_PRIMARY", label: "Mầm non" },
                      ...Array.from({ length: 12 }, (_, index) => ({ value: `GRADE_${index + 1}`, label: `Lớp ${index + 1}` })),
                      { value: "UNIVERSITY", label: "Đại học" }, { value: "COLLEGE", label: "Cao đẳng" },
                    ]} />
                  </Form.Item>
                  <Form.Item name={["schoolInfo", "className"]} label="Lớp" rules={[{ required: true, max: 50 }]}>
                    <Input maxLength={50} />
                  </Form.Item>
                </>
              )}

              <Form.Item
                name="statement"
                label={<span className="text-xs font-bold text-slate-700 uppercase">Cập nhật thư nguyện vọng</span>}
                rules={[{ required: true, whitespace: true, message: "Vui lòng không để trống thư nguyện vọng" }]}
              >
                <TextArea rows={4} showCount maxLength={3000} className="rounded-xl text-sm" />
              </Form.Item>

              {resubmitChecklist.length > 0 && fileList.length > 0 && (
                <Form.Item name="checklistItemCode" label="Loại tài liệu cần bổ sung" rules={[{ required: true }]}>
                  <Select options={resubmitChecklist.map((item) => ({ value: item.code, label: item.title }))} />
                </Form.Item>
              )}

              {resubmitDetailQuery.data?.documents?.length ? (
                <Alert
                  type="info"
                  showIcon
                  message={`Hồ sơ hiện có ${resubmitDetailQuery.data.documents.length} nhóm tài liệu`}
                  description="Tải lên tài liệu mới theo yêu cầu của Admin; tài liệu cũ vẫn được giữ nguyên."
                />
              ) : null}

              <Form.Item
                label={<span className="text-xs font-bold text-slate-700 uppercase">Tải lên tài liệu bổ sung (tùy chọn)</span>}
                extra="Tải lên tệp mới nếu Ban quản trị yêu cầu bổ sung giấy tờ, chứng từ. PDF, JPG, PNG, WebP — tối đa 10MB/tệp."
              >
                <Upload
                  fileList={fileList}
                  onChange={({ fileList: fl }) => setFileList(fl)}
                  beforeUpload={(file) => {
                    const error = validatePrivateDocument(file);
                    if (error) {
                      message.error(error);
                      return Upload.LIST_IGNORE;
                    }
                    return false;
                  }}
                  multiple
                  maxCount={5}
                  accept={PRIVATE_DOCUMENT_ACCEPT}
                  disabled={isResubmitting || resubmitDetailQuery.isLoading || resubmitDetailQuery.isError}
                >
                  <Button icon={<UploadOutlined />} className="rounded-xl text-xs font-medium">
                    Chọn tệp bổ sung
                  </Button>
                </Upload>
              </Form.Item>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <Button onClick={handleCloseResubmit} disabled={isResubmitting} className="rounded-xl">
                  Hủy
                </Button>
                <Button
                  type="primary"
                  onClick={handleResubmit}
                  loading={isResubmitting}
                  disabled={isResubmitting || resubmitDetailQuery.isLoading || resubmitDetailQuery.isError}
                  className="bg-amber-600 hover:bg-amber-500 rounded-xl font-semibold px-6 border-none"
                >
                  Gửi lại hồ sơ
                </Button>
              </div>
            </Form>
          </div>
        )}
      </Modal>
    </div>
  );
}
