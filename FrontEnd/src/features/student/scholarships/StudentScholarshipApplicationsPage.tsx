import PublicStoryControl from "./components/PublicStoryControl";
import PublicConsentControl from "./components/PublicConsentControl";
import { useEffect, useMemo, useState } from "react";
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
  Checkbox,
} from "antd";
import {
  ExclamationCircleOutlined,
  UploadOutlined,
  FileSearchOutlined,
  SendOutlined,
  InboxOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import PaperDossierInstructionCard from "../../../components/scholarship/PaperDossierInstructionCard";
import DeclarePaperDispatchModal from "../../../components/scholarship/DeclarePaperDispatchModal";
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
import {
  SCHOLARSHIP_DOCUMENT_ACCEPT,
  validateScholarshipDocument,
} from "../../../utils/fileValidation";
import { useAllMyApplications } from "./hooks/useMyApplications";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const SUBMISSION_MODE_LABELS: Record<string, string> = {
  HYBRID: "Kết hợp trực tuyến và giấy (Bản cứng)",
  ONLINE: "Nộp trực tuyến",
  PAPER: "Nộp trực tiếp bản cứng",
};

const DOC_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Chờ kiểm tra", color: "orange" },
  APPROVED: { label: "Đã duyệt hợp lệ", color: "green" },
  REJECTED: { label: "Cần bổ sung / Không hợp lệ", color: "red" },
};

const RECEIPT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  RECEIVED: { label: "Đã tiếp nhận hồ sơ giấy", color: "blue" },
  IN_RECONCILIATION: { label: "Đang đối chiếu giấy tờ", color: "cyan" },
  RECONCILED: { label: "Đã đối chiếu khớp hoàn toàn", color: "green" },
  DISCREPANCY: { label: "Có sai lệch cần đối chiếu lại", color: "red" },
};

const CHECKLIST_CODE_LABELS: Record<string, string> = {
  CCCD_STUDENT: "CCCD học sinh",
  CCCD_GUARDIAN: "CCCD người giám hộ",
  TRANSCRIPT: "Bảng điểm / Học bạ",
  POVERTY_CERTIFICATE: "Giấy chứng nhận hộ nghèo / cận nghèo",
  HARDSHIP_CERTIFICATE: "Giấy xác nhận hoàn cảnh khó khăn",
  ORPHAN_CERTIFICATE: "Giấy chứng nhận mồ côi",
  DISABILITY_CERTIFICATE: "Giấy xác nhận khuyết tật / bệnh lý",
  ACADEMIC_ACHIEVEMENT: "Minh chứng thành tích học tập",
  OTHER_CERTIFICATE: "Giấy tờ minh chứng khác",
  OTHER: "Giấy tờ khác",
};
type ResubmitFormValues = {
  statement: string;
  hasPovertyCertificate?: boolean;
  submissionMode?: ScholarshipApplication["submissionMode"];
  checklistItemCode?: string;
  guardianInfo?: Partial<ScholarshipGuardianInfo>;
  applicantInfo?: {
    fullName?: string | null;
    cccd?: string;
    phone?: string | null;
    email?: string | null;
    permanentAddress?: string | null;
    permanentProvince?: string | null;
    permanentDistrict?: string | null;
    permanentCommune?: string | null;
    isDisadvantaged?: boolean;
    hardshipCategories?: ScholarshipApplication["hardshipCategories"];
  };
  schoolInfo?: Partial<ScholarshipSchoolInfo>;
  isDisadvantaged?: boolean;
  hardshipCategories?: ScholarshipApplication["hardshipCategories"];
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
    ? new Date(value).toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
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
      : app.status === "APPROVED" ||
          app.status === "DOSSIER_VERIFIED" ||
          app.status === "WITHDRAWN"
        ? "finish"
        : "process";

  return (
    <Steps
      size="small"
      current={current}
      status={status}
      items={[
        {
          title:
            app.status === "DRAFT"
              ? "Đang hoàn thiện bản nháp"
              : "Đã nộp hồ sơ",
          description: formatDateTime(
            app.status === "DRAFT"
              ? app.updatedAt || app.createdAt
              : app.submittedAt,
          ),
        },
        {
          title:
            app.status === "NEED_MORE_INFORMATION"
              ? "Cần bổ sung"
              : "Đang xét duyệt",
        },
        {
          title: resultTitle,
          description:
            app.reviewedAt && current === 2
              ? formatDateTime(app.reviewedAt)
              : undefined,
        },
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
  const [resubmitTarget, setResubmitTarget] =
    useState<ScholarshipApplication | null>(null);
  const [resubmitForm] = Form.useForm<ResubmitFormValues>();
  const resubmitIsDisadvantaged = Form.useWatch(
    "isDisadvantaged",
    resubmitForm,
  );
  const resubmitHasPovertyCertificate =
    Form.useWatch("hasPovertyCertificate", resubmitForm) === true;
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [isResubmitting, setIsResubmitting] = useState(false);
  const [isPaperDispatchModalOpen, setIsPaperDispatchModalOpen] =
    useState(false);
  const [selectedAppForPaperDispatch, setSelectedAppForPaperDispatch] =
    useState<ScholarshipApplication | null>(null);

  // The endpoint has no status filter: load all of the student's applications and filter locally
  const { data, isLoading, isError, refetch } = useAllMyApplications();
  const allItems = useMemo(() => data?.items ?? [], [data]);
  const resubmitDetailQuery = useQuery({
    queryKey: scholarshipApplicationKeys.detail(resubmitTarget?.id ?? ""),
    queryFn: () =>
      scholarshipApplicationService.getMyApplicationDetail(
        resubmitTarget?.id ?? "",
      ),
    enabled: Boolean(resubmitTarget),
    retry: false,
  });
  const expandedDetailQuery = useQuery({
    queryKey: scholarshipApplicationKeys.detail(expandedApplicationId ?? ""),
    queryFn: () =>
      scholarshipApplicationService.getMyApplicationDetail(
        expandedApplicationId ?? "",
      ),
    enabled: Boolean(expandedApplicationId),
    retry: false,
  });
  useEffect(() => {
    const app = resubmitDetailQuery.data;
    if (!app || app.id !== resubmitTarget?.id) return;
    const {
      isDisadvantaged: legacyDisadvantaged,
      hardshipCategories: legacyHardshipCategories,
      ...schoolInfo
    } = app.schoolInfo || {};
    resubmitForm.setFieldsValue({
      applicantInfo: {
        ...app.applicantInfo,
        cccd: app.studentCccd || undefined,
      },
      guardianInfo: app.guardianInfo ?? undefined,
      schoolInfo: schoolInfo ?? undefined,
      isDisadvantaged: app.isDisadvantaged ?? legacyDisadvantaged ?? false,
      hardshipCategories:
        app.hardshipCategories ?? legacyHardshipCategories ?? [],
      hasPovertyCertificate: app.hasPovertyCertificate === true,
    });
  }, [resubmitDetailQuery.data, resubmitTarget?.id, resubmitForm]);
  const resubmitChecklist =
    resubmitDetailQuery.data?.campaign?.documentChecklist ?? [];
  const requiresFullDossier = Boolean(resubmitTarget);

  const counts = useMemo(() => {
    const result = Object.fromEntries(
      STATUS_ORDER.map((status) => [status, 0]),
    ) as Record<ScholarshipApplicationStatus, number>;
    for (const app of allItems) result[app.status] += 1;
    return result;
  }, [allItems]);

  const filtered =
    statusFilter === "ALL"
      ? allItems
      : allItems.filter((app) => app.status === statusFilter);
  const pageItems = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const handleOpenResubmit = (app: ScholarshipApplication) => {
    setResubmitTarget(app);
    const {
      isDisadvantaged: legacyDisadvantaged,
      hardshipCategories: legacyHardshipCategories,
      ...schoolInfo
    } = app.schoolInfo || {};
    resubmitForm.setFieldsValue({
      statement: app.statement,
      submissionMode: "HYBRID",
      hasPovertyCertificate: app.hasPovertyCertificate === true,
      guardianInfo: app.guardianInfo ?? undefined,
      schoolInfo: schoolInfo ?? undefined,
      isDisadvantaged: app.isDisadvantaged ?? legacyDisadvantaged ?? false,
      hardshipCategories:
        app.hardshipCategories ?? legacyHardshipCategories ?? [],
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
        applicantInfo: resubmitForm.getFieldValue("applicantInfo"),
        schoolInfo: resubmitForm.getFieldValue("schoolInfo"),
        isDisadvantaged: resubmitForm.getFieldValue("isDisadvantaged") === true,
        hardshipCategories:
          resubmitForm.getFieldValue("hardshipCategories") || [],
        hasPovertyCertificate:
          resubmitForm.getFieldValue("hasPovertyCertificate") === true,
      };
    } catch {
      return; // field errors are shown inline
    }

    setIsResubmitting(true);
    try {
      if (resubmitDetailQuery.isError) {
        throw new Error(
          "Không thể tải yêu cầu hồ sơ hiện hành. Vui lòng đóng và mở lại biểu mẫu.",
        );
      }
      if (
        fileList.length > 0 &&
        resubmitChecklist.length > 0 &&
        !values.checklistItemCode
      ) {
        throw new Error(
          "Vui lòng chọn loại tài liệu cần bổ sung theo checklist của chiến dịch.",
        );
      }
      const existingPovertyCertificate = Boolean(
        resubmitDetailQuery.data?.documents?.some(
          (document) =>
            document.checklistItemCode === "POVERTY_CERTIFICATE" &&
            !["REJECTED", "SUPERSEDED", "REMOVED_BY_STUDENT"].includes(
              document.status || "",
            ),
        ),
      );
      const newlySelectedPovertyCertificate =
        values.checklistItemCode === "POVERTY_CERTIFICATE" &&
        fileList.some((item) => item.originFileObj);
      if (
        values.hasPovertyCertificate &&
        !existingPovertyCertificate &&
        !newlySelectedPovertyCertificate
      ) {
        throw new Error(
          "Bạn đã chọn có giấy chứng nhận. Vui lòng tải lên tệp PDF hoặc ảnh minh chứng giấy hộ nghèo/cận nghèo.",
        );
      }
      const uploadedFiles: {
        storageKey: string;
        mimeType?: string;
        side: "SINGLE";
      }[] = [];
      for (const item of fileList) {
        if (!item.originFileObj) continue;
        try {
          const res = await scholarshipApplicationService.uploadDocument(
            item.originFileObj,
          );
          uploadedFiles.push({
            storageKey: res.storageKey,
            mimeType: res.mimeType,
            side: "SINGLE",
          });
        } catch (err) {
          throw new Error(
            `Tải "${item.name}" thất bại: ${getFriendlyErrorMessage(err)}`,
          );
        }
      }

      const payload: ResubmitScholarshipPayload = {
        statement: values.statement.trim(),
        submissionMode: "HYBRID",
        hasPovertyCertificate: values.hasPovertyCertificate === true,
      };
      if (requiresFullDossier) {
        payload.guardianInfo = values.guardianInfo as ScholarshipGuardianInfo;
        payload.schoolInfo = values.schoolInfo as ScholarshipSchoolInfo;
        if (values.applicantInfo) {
          const { cccd, ...applicantInfo } = values.applicantInfo;
          payload.applicantInfo = {
            ...applicantInfo,
            isDisadvantaged: values.isDisadvantaged === true,
            hardshipCategories:
              values.isDisadvantaged === true
                ? values.hardshipCategories || []
                : [],
          };
          payload.studentCccd = cccd;
        }
      }
      if (uploadedFiles.length > 0) {
        payload.documents = [
          {
            ...(values.checklistItemCode
              ? { checklistItemCode: values.checklistItemCode }
              : {}),
            documentType:
              values.checklistItemCode === "CCCD_STUDENT" ||
              values.checklistItemCode === "CCCD_GUARDIAN"
                ? "IDENTITY"
                : values.checklistItemCode === "TRANSCRIPT"
                  ? "QUALIFICATION"
                  : "SCHOLARSHIP_PROOF",
            files: uploadedFiles,
          },
        ];
      }

      await scholarshipApplicationService.resubmit(resubmitTarget.id, payload);
      message.success(
        "Bổ sung hồ sơ thành công! Đơn đã được chuyển về trạng thái Chờ xét duyệt.",
      );
      setResubmitTarget(null);
      resubmitForm.resetFields();
      setFileList([]);
      queryClient.invalidateQueries({
        queryKey: scholarshipApplicationKeys.all,
      });
    } catch (err) {
      message.error(
        getFriendlyErrorMessage(
          err,
          "Bổ sung hồ sơ thất bại. Vui lòng thử lại.",
        ),
      );
    } finally {
      setIsResubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Title
            level={2}
            className="!mb-0 !text-2xl font-black text-slate-900 tracking-tight"
          >
            Hồ sơ xin học bổng
          </Title>
        </div>

        <Link to={ROUTES.STUDENT.SCHOLARSHIP_EXPLORE}>
          <Button
            type="primary"
            className="bg-teal-600 font-semibold text-xs rounded-xl h-10 px-5 shadow-2xs"
          >
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
            <Button
              size="small"
              onClick={() => {
                setStatusFilter("NEED_MORE_INFORMATION");
                setCurrentPage(1);
              }}
            >
              Xem ngay
            </Button>
          }
          className="rounded-xl"
        />
      )}

      {!isLoading && !isError && allItems.length > 0 && (
        <Segmented<StatusFilter>
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value);
            setCurrentPage(1);
          }}
          options={[
            { label: `Tất cả (${allItems.length})`, value: "ALL" },
            ...STATUS_ORDER.map((status) => ({
              label: `${SCHOLARSHIP_APP_STATUS_LABELS[status]} (${counts[status]})`,
              value: status,
            })),
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
            description={
              allItems.length === 0
                ? "Bạn chưa nộp hồ sơ xin học bổng nào."
                : "Không có hồ sơ nào ở trạng thái này."
            }
          >
            {allItems.length === 0 && (
              <Link to={ROUTES.STUDENT.SCHOLARSHIP_EXPLORE}>
                <Button
                  type="primary"
                  className="bg-teal-600 font-semibold text-xs rounded-xl h-9 px-5"
                >
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
                        className="font-bold text-base text-slate-900 hover:text-teal-600 transition-colors"
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
                        Mức học bổng:{" "}
                        <strong className="text-teal-700">
                          {formatVND(app.awardAmountPerStudent)}
                        </strong>
                      </span>
                      <span>•</span>
                      <span>
                        Mã hồ sơ:{" "}
                        <strong className="font-mono text-slate-700">
                          {app.applicationCode ||
                            `#${app.id.slice(-6).toUpperCase()}`}
                        </strong>
                      </span>
                      <span>•</span>
                      <span>
                        Hình thức:{" "}
                        <span className="font-semibold text-slate-700">
                          {SUBMISSION_MODE_LABELS[app.submissionMode || "HYBRID"] || "Kết hợp trực tuyến và giấy"}
                        </span>
                      </span>
                    </div>

                    {/* Paper Dossier Dispatch & Intake Status */}
                    {app.submissionMode !== "ONLINE" && (
                      <div className="p-3 rounded-xl bg-teal-50/50 border border-teal-100 text-xs space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-bold text-teal-900 flex items-center gap-1.5">
                            <InboxOutlined className="text-teal-600" />
                            <span>Tình trạng hồ sơ giấy (Bản cứng):</span>
                          </div>
                          <div>
                            {app.paperReceipts && app.paperReceipts.length > 0 ? (
                              <Tag color="green" className="font-bold text-xs m-0">
                                {RECEIPT_STATUS_LABELS[app.paperReceipts[0].status]?.label || "Đã tiếp nhận"}
                              </Tag>
                            ) : app.paperDispatch?.declaredSent ? (
                              <Tag color="cyan" className="font-bold text-xs m-0">
                                Đã gửi hồ sơ giấy – Chờ Edunity tiếp nhận
                              </Tag>
                            ) : (
                              <Tag color="warning" className="font-bold text-xs m-0">
                                Chưa gửi hồ sơ giấy
                              </Tag>
                            )}
                          </div>
                        </div>

                        {app.paperDispatch?.declaredSent && (
                          <div className="text-slate-600 text-[11px] space-y-1">
                            <div>Đơn vị gửi: <strong>{app.paperDispatch.carrier || "Bưu điện"}</strong> · Mã vận đơn: <strong className="font-mono">{app.paperDispatch.trackingNumber || "—"}</strong></div>
                            {app.paperDispatch.sentAt && (
                              <div>Ngày gửi: {new Date(app.paperDispatch.sentAt).toLocaleDateString("vi-VN")}</div>
                            )}
                          </div>
                        )}

                        {(!app.paperDispatch?.declaredSent && (!app.paperReceipts || app.paperReceipts.length === 0)) && (
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            <span className="text-slate-500 text-[11px]">
                              Sau khi nộp trực tuyến, bạn hãy gửi bản cứng và xác nhận thông tin gửi để Ban quản trị tiếp nhận.
                            </span>
                            <Button
                              size="small"
                              type="primary"
                              icon={<SendOutlined />}
                              onClick={() => {
                                setSelectedAppForPaperDispatch(app);
                                setIsPaperDispatchModalOpen(true);
                              }}
                              className="bg-teal-600 hover:bg-teal-700 font-bold rounded-lg text-xs"
                            >
                              Xác nhận đã gửi hồ sơ giấy (bản cứng)
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="pt-1 max-w-2xl">
                      <ApplicationProgress app={app} />
                    </div>

                    {/* Statement snippet */}
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-700">
                      <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">
                        Thư nguyện vọng:
                      </div>
                      <Paragraph
                        ellipsis={{
                          rows: 2,
                          expandable: true,
                          symbol: "Xem thêm",
                        }}
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
                        <div className="whitespace-pre-wrap">
                          {app.reviewNote}
                        </div>
                      </div>
                    )}

                    <Button
                      size="small"
                      type="link"
                      icon={<FileSearchOutlined />}
                      className="!px-0"
                      onClick={() => {
                        setExpandedApplicationId((id) =>
                          id === app.id ? undefined : app.id,
                        );
                      }}
                    >
                      {expandedApplicationId === app.id
                        ? "Ẩn chi tiết"
                        : "Xem checklist và lịch sử hồ sơ"}
                    </Button>

                    {isApproved && (
                      <div className="space-y-2">
                        <PublicStoryControl
                          applicationId={app.id}
                          publicStory={app.publicStory}
                        />
                        <PublicConsentControl
                          applicationId={app.id}
                          publicConsent={app.publicConsent}
                        />
                      </div>
                    )}

                    {expandedApplicationId === app.id && (
                      <div className="rounded-xl border border-slate-200 p-3 space-y-3">
                        {expandedDetailQuery.isLoading ? (
                          <Text type="secondary">
                            Đang tải chi tiết hồ sơ...
                          </Text>
                        ) : expandedDetailQuery.isError ? (
                          <Alert
                            type="error"
                            showIcon
                            message="Không tải được chi tiết hồ sơ"
                            description="Vui lòng thử lại."
                            action={
                              <Button
                                size="small"
                                onClick={() =>
                                  void expandedDetailQuery.refetch()
                                }
                              >
                                Thử lại
                              </Button>
                            }
                          />
                        ) : expandedDetailQuery.data?.id === app.id ? (
                          <>
                            <div className="text-xs text-slate-600">
                              Mã hồ sơ:{" "}
                              <strong className="font-mono text-slate-800">{expandedDetailQuery.data.applicationCode || "—"}</strong>{" "}
                              · Hình thức nộp:{" "}
                              <strong className="text-slate-800">
                                {SUBMISSION_MODE_LABELS[expandedDetailQuery.data.submissionMode || "HYBRID"] ||
                                  expandedDetailQuery.data.submissionMode}
                              </strong>
                            </div>
                            <PaperDossierInstructionCard
                              applicationCode={
                                expandedDetailQuery.data.applicationCode
                              }
                              compact
                            />

                            {expandedDetailQuery.data.paperDispatch
                              ?.declaredSent ? (
                              <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200 space-y-2">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <span className="font-bold text-blue-900 text-xs sm:text-sm flex items-center gap-1.5">
                                    <SendOutlined className="text-blue-600" />
                                    Trạng thái hồ sơ giấy:{" "}
                                    <Tag
                                      color="blue"
                                      className="font-semibold ml-1"
                                    >
                                      Đã gửi (chờ bưu điện)
                                    </Tag>
                                  </span>
                                  {[
                                    "SUBMITTED",
                                    "NEED_MORE_INFORMATION",
                                  ].includes(app.status) && (
                                    <Button
                                      size="small"
                                      onClick={() => {
                                        setSelectedAppForPaperDispatch(
                                          expandedDetailQuery.data || null,
                                        );
                                        setIsPaperDispatchModalOpen(true);
                                      }}
                                      className="rounded-lg text-xs"
                                    >
                                      Cập nhật thông tin gửi
                                    </Button>
                                  )}
                                </div>
                                <div className="text-xs text-blue-800">
                                  Đơn vị vận chuyển:{" "}
                                  <strong>
                                    {expandedDetailQuery.data.paperDispatch
                                      .carrier || "Bưu điện"}
                                  </strong>{" "}
                                  · Mã vận đơn:{" "}
                                  <strong className="font-mono">
                                    {expandedDetailQuery.data.paperDispatch
                                      .trackingNumber || "—"}
                                  </strong>{" "}
                                  · Gửi lúc:{" "}
                                  <strong>
                                    {formatDateTime(
                                      expandedDetailQuery.data.paperDispatch
                                        .sentAt,
                                    )}
                                  </strong>
                                </div>
                              </div>
                            ) : ["SUBMITTED", "NEED_MORE_INFORMATION"].includes(
                                app.status,
                              ) ? (
                              <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 flex items-center justify-between gap-3 flex-wrap">
                                <div>
                                  <div className="font-bold text-amber-900 text-xs sm:text-sm">
                                    Chưa xác nhận gửi hồ sơ giấy
                                  </div>
                                  <div className="text-xs text-amber-700 mt-0.5">
                                    Vui lòng gửi bản cứng qua bưu điện hoặc nộp
                                    trực tiếp và bấm xác nhận để Admin đối
                                    chiếu.
                                  </div>
                                </div>
                                <Button
                                  type="primary"
                                  icon={<SendOutlined />}
                                  onClick={() => {
                                    setSelectedAppForPaperDispatch(
                                      expandedDetailQuery.data || null,
                                    );
                                    setIsPaperDispatchModalOpen(true);
                                  }}
                                  className="bg-teal-600 hover:bg-teal-700 font-bold rounded-xl text-xs"
                                >
                                  Xác nhận đã gửi hồ sơ giấy
                                </Button>
                              </div>
                            ) : null}
                            {expandedDetailQuery.data.checklistProgress
                              ?.length ? (
                              <div className="space-y-1">
                                {expandedDetailQuery.data.checklistProgress.map(
                                  (item) => (
                                    <div
                                      key={item.code}
                                      className="flex items-center justify-between gap-2 text-xs"
                                    >
                                      <span>{item.title || item.code}</span>
                                      <Tag
                                        color={
                                          item.satisfied ? "success" : "warning"
                                        }
                                      >
                                        {item.satisfied
                                          ? "Đã đáp ứng"
                                          : "Còn thiếu"}
                                      </Tag>
                                    </div>
                                  ),
                                )}
                              </div>
                            ) : null}
                            {expandedDetailQuery.data.documents?.length ? (
                              <div className="rounded-xl border border-slate-200 p-3 space-y-2.5">
                                <div className="text-xs font-semibold text-slate-700">
                                  Tài liệu và minh chứng đã nộp trực tuyến
                                </div>
                                {expandedDetailQuery.data.documents.map(
                                  (document) => {
                                    const docStatusConfig = document.status ? DOC_STATUS_LABELS[document.status] : null;
                                    const docTitle =
                                      document.title ||
                                      CHECKLIST_CODE_LABELS[document.checklistItemCode || ""] ||
                                      document.checklistItemCode ||
                                      document.documentType ||
                                      "Tài liệu minh chứng";
                                    return (
                                      <div
                                        key={
                                          document._id ||
                                          document.id ||
                                          document.checklistItemCode
                                        }
                                        className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-slate-100 last:border-b-0 pb-1.5 last:pb-0"
                                      >
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium text-slate-800">
                                            {docTitle}
                                          </span>
                                          <Tag color={docStatusConfig?.color || "default"} className="text-[11px]">
                                            {docStatusConfig?.label || document.status || "Đang xử lý"}
                                          </Tag>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                          {document.files.map((file, index) => {
                                            if (!file.url) return null;
                                            const isImage = file.mimeType?.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/i.test(file.url || file.storageKey || "");
                                            return (
                                              <a
                                                key={file.storageKey || index}
                                                href={file.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-800 underline font-medium"
                                              >
                                                {isImage ? `Xem ảnh ${index + 1}` : `Xem tài liệu ${index + 1}`}
                                              </a>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  },
                                )}
                              </div>
                            ) : null}
                            {expandedDetailQuery.data.paperReceipts?.map(
                              (receipt) => {
                                const receiptStatusConfig = receipt.status ? RECEIPT_STATUS_LABELS[receipt.status] : null;
                                return (
                                  <div
                                    key={receipt._id || receipt.id}
                                    className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs space-y-1.5"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-semibold text-slate-800">
                                        Biên nhận hồ sơ giấy: {receipt.receiptCode}
                                      </span>
                                      <Tag color={receiptStatusConfig?.color || "default"}>
                                        {receiptStatusConfig?.label || receipt.status}
                                      </Tag>
                                    </div>
                                    <div className="text-slate-500">
                                      Thời gian tiếp nhận: {formatDateTime(receipt.receivedAt)}
                                      {receipt.receivedByName ? ` · Người tiếp nhận: ${receipt.receivedByName}` : ""}
                                    </div>
                                    {(receipt.proofPhotos?.length || receipt.proofUrl) && (
                                      <div className="flex items-center gap-2 pt-1">
                                        <span className="text-slate-600 font-medium">Ảnh minh chứng tiếp nhận:</span>
                                        {receipt.proofPhotos?.map((photo, pIdx) => {
                                          const photoUrl = typeof photo === "string" ? photo : (photo as { url?: string })?.url;
                                          if (!photoUrl) return null;
                                          return (
                                            <a key={photoUrl || pIdx} href={photoUrl} target="_blank" rel="noreferrer" className="text-teal-700 underline">
                                              Ảnh {pIdx + 1}
                                            </a>
                                          );
                                        })}
                                        {receipt.proofUrl && !receipt.proofPhotos?.length && (
                                          <a href={receipt.proofUrl} target="_blank" rel="noreferrer" className="text-teal-700 underline">
                                            Xem ảnh biên nhận
                                          </a>
                                        )}
                                      </div>
                                    )}
                                    {receipt.history?.map((event, index) => {
                                      const eventStatusConfig = event.toStatus ? RECEIPT_STATUS_LABELS[event.toStatus] : null;
                                      return (
                                        <div
                                          key={`${event.action}-${event.recordedAt}-${index}`}
                                          className="mt-1 text-slate-600"
                                        >
                                          {event.action} · {eventStatusConfig?.label || event.toStatus} ·{" "}
                                          {formatDateTime(event.recordedAt)}
                                          {event.note ? ` — ${event.note}` : ""}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              },
                            )}
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
                        <Button
                          type="primary"
                          className="bg-teal-600 text-xs font-bold rounded-xl h-10 px-5 border-none shadow-2xs"
                        >
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
                      <Link
                        to={`${ROUTES.STUDENT.SCHOLARSHIP_EXPLORE}/${app.campaignId}`}
                      >
                        <Button className="text-xs font-semibold rounded-xl h-10 px-5">
                          Xem lại chiến dịch
                        </Button>
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
        title={
          <div className="text-base font-bold text-slate-900">
            Bổ sung thông tin hồ sơ học bổng
          </div>
        }
      >
        {resubmitTarget && (
          <div className="py-2 space-y-4">
            <Alert
              type="warning"
              showIcon
              icon={<ExclamationCircleOutlined />}
              message="Yêu cầu từ Quản trị viên"
              description={
                resubmitTarget.reviewNote ||
                "Vui lòng bổ sung đầy đủ thông tin được yêu cầu."
              }
              className="rounded-xl text-xs"
            />

            {resubmitDetailQuery.isError && (
              <Alert
                type="error"
                showIcon
                message="Không tải được hồ sơ của bạn"
                description="Yêu cầu hồ sơ hiện hành không sẵn sàng; vui lòng thử lại."
                action={
                  <Button
                    size="small"
                    onClick={() => void resubmitDetailQuery.refetch()}
                  >
                    Thử lại
                  </Button>
                }
              />
            )}

            <Form form={resubmitForm} layout="vertical" className="space-y-4">
              {requiresFullDossier && (
                <>
                  <div className="font-semibold text-sm text-slate-800">
                    Thông tin người nộp
                  </div>
                  <Form.Item
                    name={["applicantInfo", "fullName"]}
                    label="Họ và tên"
                    rules={[{ required: true, min: 2, max: 120 }]}
                  >
                    <Input maxLength={120} />
                  </Form.Item>
                  <Form.Item
                    name={["applicantInfo", "cccd"]}
                    label="Số CCCD (12 số)"
                    rules={[
                      { required: true, message: "Vui lòng nhập CCCD" },
                      {
                        pattern: /^\d{12}$/,
                        message:
                          "CCCD phải gồm đúng 12 chữ số, không có khoảng trắng",
                      },
                    ]}
                  >
                    <Input inputMode="numeric" maxLength={12} />
                  </Form.Item>
                  <Form.Item
                    name={["applicantInfo", "phone"]}
                    label="Số điện thoại"
                    rules={[
                      {
                        required: true,
                        message: "Vui lòng nhập số điện thoại",
                      },
                      {
                        pattern: /^\d{10}$/,
                        message:
                          "Số điện thoại phải gồm đúng 10 chữ số, không có khoảng trắng",
                      },
                    ]}
                  >
                    <Input inputMode="numeric" maxLength={10} />
                  </Form.Item>
                  <Form.Item name={["applicantInfo", "email"]} label="Email">
                    <Input type="email" maxLength={160} />
                  </Form.Item>
                  <Form.Item
                    name={["applicantInfo", "permanentAddress"]}
                    label="Hộ khẩu thường trú"
                    rules={[{ required: true, whitespace: true }]}
                  >
                    <Input maxLength={300} />
                  </Form.Item>
                  <Form.Item
                    name={["applicantInfo", "permanentProvince"]}
                    label="Tỉnh/thành nơi thường trú"
                    rules={[{ required: true, whitespace: true }]}
                  >
                    <Input maxLength={100} />
                  </Form.Item>
                  <Form.Item
                    name={["applicantInfo", "permanentCommune"]}
                    label="Xã/phường nơi thường trú"
                    rules={[{ required: true, whitespace: true }]}
                  >
                    <Input maxLength={100} />
                  </Form.Item>
                  <div className="font-semibold text-sm text-slate-800">
                    Cập nhật thông tin người giám hộ
                  </div>
                  <Form.Item
                    name={["guardianInfo", "fullName"]}
                    label="Họ tên người giám hộ"
                    rules={[{ required: true, min: 2, max: 120 }]}
                  >
                    <Input maxLength={120} />
                  </Form.Item>
                  <Form.Item
                    name={["guardianInfo", "relationship"]}
                    label="Quan hệ với học sinh"
                    rules={[{ required: true }]}
                  >
                    <Select
                      options={[
                        { value: "FATHER", label: "Cha" },
                        { value: "MOTHER", label: "Mẹ" },
                        { value: "GRANDPARENT", label: "Ông/Bà" },
                        { value: "SIBLING", label: "Anh/Chị/Em" },
                        {
                          value: "LEGAL_GUARDIAN",
                          label: "Người giám hộ hợp pháp",
                        },
                        { value: "OTHER", label: "Khác" },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item
                    name={["guardianInfo", "phone"]}
                    label="Số điện thoại"
                    rules={[
                      { required: true },
                      {
                        pattern: /^\d{10}$/,
                        message:
                          "Số điện thoại phải gồm đúng 10 chữ số, không có khoảng trắng",
                      },
                    ]}
                  >
                    <Input
                      inputMode="numeric"
                      maxLength={10}
                      autoComplete="off"
                    />
                  </Form.Item>
                  <Form.Item
                    name={["guardianInfo", "email"]}
                    label="Email (không bắt buộc)"
                    rules={[{ type: "email" }]}
                  >
                    <Input maxLength={160} autoComplete="off" />
                  </Form.Item>
                  <Form.Item
                    name={["guardianInfo", "occupation"]}
                    label="Nghề nghiệp"
                    rules={[{ required: true, whitespace: true }]}
                  >
                    <Input maxLength={120} />
                  </Form.Item>
                  <Form.Item
                    name={["guardianInfo", "cccd"]}
                    label="Số CCCD người giám hộ (12 số)"
                    rules={[
                      { required: true },
                      {
                        pattern: /^\d{12}$/,
                        message: "CCCD phải gồm đúng 12 chữ số.",
                      },
                    ]}
                  >
                    <Input
                      inputMode="numeric"
                      maxLength={12}
                      autoComplete="off"
                    />
                  </Form.Item>
                  <Form.Item
                    name={["guardianInfo", "address"]}
                    label="Địa chỉ thường trú người giám hộ"
                    rules={[{ required: true, whitespace: true }]}
                  >
                    <Input maxLength={300} autoComplete="street-address" />
                  </Form.Item>
                  <div className="font-semibold text-sm text-slate-800">
                    Cập nhật thông tin trường học
                  </div>
                  <Form.Item
                    name={["schoolInfo", "schoolName"]}
                    label="Tên trường"
                    rules={[{ required: true, min: 2, max: 200 }]}
                  >
                    <Input maxLength={200} />
                  </Form.Item>
                  <Form.Item
                    name={["schoolInfo", "gradeLevel"]}
                    label="Cấp lớp"
                    rules={[{ required: true }]}
                  >
                    <Select
                      options={[
                        { value: "PRE_PRIMARY", label: "Mầm non" },
                        ...Array.from({ length: 12 }, (_, index) => ({
                          value: `GRADE_${index + 1}`,
                          label: `Lớp ${index + 1}`,
                        })),
                        { value: "UNIVERSITY", label: "Đại học" },
                        { value: "COLLEGE", label: "Cao đẳng" },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item
                    name={["schoolInfo", "className"]}
                    label="Lớp"
                    rules={[{ required: true, max: 50 }]}
                  >
                    <Input maxLength={50} />
                  </Form.Item>
                  <Form.Item
                    name={["schoolInfo", "academicYear"]}
                    label="Năm học"
                    rules={[{ required: true, whitespace: true }]}
                  >
                    <Input maxLength={30} />
                  </Form.Item>
                  <Form.Item
                    name={["schoolInfo", "province"]}
                    label="Tỉnh/Thành phố"
                    rules={[{ required: true, whitespace: true }]}
                  >
                    <Input maxLength={100} />
                  </Form.Item>
                  <Form.Item
                    name={["schoolInfo", "district"]}
                    label="Xã/Phường"
                    rules={[{ required: true, whitespace: true }]}
                  >
                    <Input maxLength={100} />
                  </Form.Item>
                  <Form.Item
                    name={["schoolInfo", "principalName"]}
                    label="Họ tên ban giám hiệu"
                    rules={[{ required: true, whitespace: true }]}
                  >
                    <Input maxLength={120} />
                  </Form.Item>
                  <Form.Item
                    name={["schoolInfo", "principalTitle"]}
                    label="Chức vụ"
                    rules={[{ required: true, whitespace: true }]}
                  >
                    <Input maxLength={100} />
                  </Form.Item>
                  <Form.Item
                    name={["schoolInfo", "homeroomTeacherName"]}
                    label="Họ tên giáo viên chủ nhiệm"
                    rules={[{ required: true, whitespace: true }]}
                  >
                    <Input maxLength={120} />
                  </Form.Item>
                  <Form.Item
                    name={["schoolInfo", "homeroomTeacherPhone"]}
                    label="Số điện thoại giáo viên chủ nhiệm"
                    rules={[
                      { required: true },
                      {
                        pattern: /^\d{10}$/,
                        message: "Nhập đúng 10 chữ số, không có khoảng trắng",
                      },
                    ]}
                  >
                    <Input inputMode="numeric" maxLength={10} />
                  </Form.Item>
                  <Form.Item name="isDisadvantaged" valuePropName="checked">
                    <Checkbox>Thuộc diện khó khăn</Checkbox>
                  </Form.Item>
                  {resubmitIsDisadvantaged && (
                    <Form.Item
                      name="hardshipCategories"
                      label="Diện khó khăn"
                      rules={[{ required: true, type: "array", min: 1 }]}
                    >
                      <Select
                        mode="multiple"
                        options={[
                          { value: "POOR_HOUSEHOLD", label: "Hộ nghèo" },
                          {
                            value: "NEAR_POOR_HOUSEHOLD",
                            label: "Hộ cận nghèo",
                          },
                          { value: "REMOTE_AREA", label: "Vùng sâu, vùng xa" },
                          { value: "ORPHANED", label: "Mồ côi cha mẹ" },
                        ]}
                      />
                    </Form.Item>
                  )}
                  <Form.Item
                    name="hasPovertyCertificate"
                    valuePropName="checked"
                  >
                    <Checkbox>
                      Tôi có giấy chứng nhận hộ nghèo/cận nghèo
                    </Checkbox>
                  </Form.Item>
                </>
              )}

              <Form.Item
                name="statement"
                label={
                  <span className="text-xs font-bold text-slate-700 uppercase">
                    Cập nhật thư nguyện vọng
                  </span>
                }
                rules={[
                  {
                    required: true,
                    whitespace: true,
                    message: "Vui lòng không để trống thư nguyện vọng",
                  },
                ]}
              >
                <TextArea
                  rows={4}
                  showCount
                  maxLength={3000}
                  className="rounded-xl text-sm"
                />
              </Form.Item>

              {resubmitChecklist.length > 0 && fileList.length > 0 && (
                <Form.Item
                  name="checklistItemCode"
                  label="Loại tài liệu cần bổ sung"
                  rules={[{ required: true }]}
                >
                  <Select
                    options={resubmitChecklist.map((item) => ({
                      value: item.code,
                      label: item.title,
                    }))}
                  />
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
                label={
                  <span className="text-xs font-bold text-slate-700 uppercase">
                    Tải lên tài liệu bổ sung (tùy chọn)
                  </span>
                }
                extra={
                  resubmitHasPovertyCertificate
                    ? "Bạn đã xác nhận diện hộ nghèo/cận nghèo; cần tải lên tệp PDF hoặc ảnh minh chứng nếu hồ sơ chưa có tệp này. Tối đa 10MB/tệp."
                    : "Tải lên tệp PDF hoặc ảnh minh chứng (JPG, PNG, WEBP) nếu Ban quản trị yêu cầu bổ sung giấy tờ — tối đa 10MB/tệp."
                }
              >
                <Upload
                  fileList={fileList}
                  onChange={({ fileList: fl }) => setFileList(fl)}
                  beforeUpload={(file) => {
                    const error = validateScholarshipDocument(file);
                    if (error) {
                      message.error(error);
                      return Upload.LIST_IGNORE;
                    }
                    return false;
                  }}
                  multiple
                  maxCount={5}
                  accept={SCHOLARSHIP_DOCUMENT_ACCEPT}
                  disabled={
                    isResubmitting ||
                    resubmitDetailQuery.isLoading ||
                    resubmitDetailQuery.isError
                  }
                >
                  <Button
                    icon={<UploadOutlined />}
                    className="rounded-xl text-xs font-medium"
                  >
                    Chọn tệp bổ sung
                  </Button>
                </Upload>
              </Form.Item>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <Button
                  onClick={handleCloseResubmit}
                  disabled={isResubmitting}
                  className="rounded-xl"
                >
                  Hủy
                </Button>
                <Button
                  type="primary"
                  onClick={handleResubmit}
                  loading={isResubmitting}
                  disabled={
                    isResubmitting ||
                    resubmitDetailQuery.isLoading ||
                    resubmitDetailQuery.isError
                  }
                  className="bg-amber-600 hover:bg-amber-500 rounded-xl font-semibold px-6 border-none"
                >
                  Gửi lại hồ sơ
                </Button>
              </div>
            </Form>
          </div>
        )}
      </Modal>

      {selectedAppForPaperDispatch && (
        <DeclarePaperDispatchModal
          open={isPaperDispatchModalOpen}
          onClose={() => {
            setIsPaperDispatchModalOpen(false);
            setSelectedAppForPaperDispatch(null);
          }}
          applicationId={selectedAppForPaperDispatch.id}
          applicationCode={selectedAppForPaperDispatch.applicationCode}
          initialValues={{
            carrier: selectedAppForPaperDispatch.paperDispatch?.carrier,
            trackingNumber:
              selectedAppForPaperDispatch.paperDispatch?.trackingNumber,
            sentAt: selectedAppForPaperDispatch.paperDispatch?.sentAt,
          }}
          onSuccess={() => {
            queryClient.invalidateQueries({
              queryKey: scholarshipApplicationKeys.all,
            });
          }}
        />
      )}
    </div>
  );
}
