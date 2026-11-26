import { useEffect, useState } from "react";
import {
  App as AntdApp,
  Modal,
  Form,
  Input,
  Button,
  Upload,
  Alert,
  Typography,
  Select,
  Steps,
  Tag,
  Checkbox,
  Progress,
} from "antd";
import {
  UploadOutlined,
  CheckCircleOutlined,
  SafetyCertificateOutlined,
  StarOutlined,
  FilePdfOutlined,
  FileImageOutlined,
} from "@ant-design/icons";
import PaperDossierInstructionCard from "../../../components/scholarship/PaperDossierInstructionCard";
import type { UploadFile } from "antd/es/upload/interface";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  scholarshipApplicationKeys,
  scholarshipApplicationService,
} from "../../../services/scholarshipApplication.service";
import {
  campaignKeys,
  campaignService,
} from "../../../services/campaign.service";
import type { ScholarshipCampaign } from "../../../types/campaign";
import type {
  CreateScholarshipDossierPayload,
  DossierSubmissionMode,
  ScholarshipApplication,
  ScholarshipHardshipCategory,
  ScholarshipGuardianInfo,
  ScholarshipSchoolInfo,
} from "../../../types/scholarship";
import {
  SCHOLARSHIP_APP_STATUS_LABELS,
  SCHOLARSHIP_APP_STATUS_COLORS,
} from "../../../types/scholarship";
import { formatVND } from "../../../types/payment";
import { Link, useNavigate } from "react-router-dom";
import { ROUTES } from "../../../routes/routePaths";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";
import {
  SCHOLARSHIP_DOCUMENT_ACCEPT,
  validateScholarshipDocument,
} from "../../../utils/fileValidation";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const MAX_FILES_WITHOUT_CHECKLIST = 5;

interface ScholarshipDossierForm {
  statement?: string;
  hasPovertyCertificate?: boolean;
  hasHardshipCert?: boolean;
  hasOrphanCert?: boolean;
  hasDisabilityCert?: boolean;
  hasAchievementCert?: boolean;
  hasOtherCert?: boolean;
  isDisadvantaged?: boolean;
  hardshipCategories?: ScholarshipHardshipCategory[];
  submissionMode?: DossierSubmissionMode;
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
    hardshipCategories?: ScholarshipHardshipCategory[];
  };
  schoolInfo?: Partial<ScholarshipSchoolInfo>;
}

interface ApplyScholarshipModalProps {
  open: boolean;
  onClose: () => void;
  campaign: ScholarshipCampaign;
  draftId?: string;
  onSuccess?: () => void;
}

function isGroupEmpty(value?: object): boolean {
  return (
    !value ||
    Object.values(value).every(
      (item) => item === undefined || item === null || item === "",
    )
  );
}

function completeDraftGroup<T extends object>(
  value: Partial<T> | undefined,
  requiredKeys: (keyof T)[],
  label: string,
): T | undefined {
  if (isGroupEmpty(value)) return undefined;
  if (
    !requiredKeys.every((key) =>
      String(
        (value as Record<keyof T, unknown> | undefined)?.[key] ?? "",
      ).trim(),
    )
  ) {
    throw new Error(
      `Vui lòng hoàn tất các trường bắt buộc trong nhóm ${label} trước khi lưu nháp.`,
    );
  }
  return value as T;
}

export default function ApplyScholarshipModal({
  open,
  onClose,
  campaign,
  draftId,
  onSuccess,
}: ApplyScholarshipModalProps) {
  const [form] = Form.useForm<ScholarshipDossierForm>();
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [fileLists, setFileLists] = useState<Record<string, UploadFile[]>>({});
  const [removedDocumentIds, setRemovedDocumentIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [submittedAppId, setSubmittedAppId] = useState<string | null>(null);
  const [submittedAppCode, setSubmittedAppCode] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [savedDraftId, setSavedDraftId] = useState(draftId);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState("");
  const [previewTitle, setPreviewTitle] = useState("");
  const [uploadPercent, setUploadPercent] = useState<number>(0);

  const handlePreviewFile = async (file: UploadFile) => {
    let src = file.url;
    if (!src && file.originFileObj) {
      src = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file.originFileObj as Blob);
        reader.onload = () => resolve(reader.result as string);
      });
    }
    if (src) {
      setPreviewImage(src);
      setPreviewTitle(file.name || "Xem trước tài liệu");
      setPreviewOpen(true);
    }
  };

  const myAppsQuery = useQuery({
    queryKey: scholarshipApplicationKeys.all,
    queryFn: () => scholarshipApplicationService.getMyApplications(1, 100),
    enabled: open,
    retry: false,
  });
  const existingApp = myAppsQuery.data?.items?.find(
    (app) => String(app.campaignId) === String(campaign.id),
  );

  useEffect(() => {
    if (existingApp && existingApp.status === "DRAFT" && !savedDraftId) {
      setSavedDraftId(existingApp.id);
    }
  }, [existingApp, savedDraftId]);

  const checklistQuery = useQuery({
    queryKey: campaignKeys.checklist(campaign.id),
    queryFn: () => campaignService.getCampaignChecklist(campaign.id),
    enabled: open,
    retry: false,
  });
  const draftQuery = useQuery({
    queryKey: scholarshipApplicationKeys.detail(savedDraftId || ""),
    queryFn: () =>
      scholarshipApplicationService.getMyApplicationDetail(savedDraftId || ""),
    enabled: open && Boolean(savedDraftId),
    retry: false,
  });

  const checklist = checklistQuery.data?.documentChecklist ?? [];
  const isDisadvantaged = Form.useWatch("isDisadvantaged", form);
  const hasPovertyCertificate =
    Form.useWatch("hasPovertyCertificate", form) === true;
  const hasHardshipCert = Form.useWatch("hasHardshipCert", form) === true;
  const hasOrphanCert = Form.useWatch("hasOrphanCert", form) === true;
  const hasDisabilityCert = Form.useWatch("hasDisabilityCert", form) === true;
  const hasAchievementCert = Form.useWatch("hasAchievementCert", form) === true;
  const hasOtherCert = Form.useWatch("hasOtherCert", form) === true;
  const existingDocuments = (draftQuery.data?.documents ?? []).filter(
    (document) =>
      !removedDocumentIds.includes(document._id || document.id || "") &&
      !["SUPERSEDED", "REMOVED_BY_STUDENT"].includes(document.status || ""),
  );

  useEffect(() => {
    const app = draftQuery.data;
    if (!app || app.id !== savedDraftId) return;
    const {
      isDisadvantaged: legacyDisadvantaged,
      hardshipCategories: legacyHardshipCategories,
      ...schoolInfo
    } = app.schoolInfo || {};
    form.setFieldsValue({
      statement: app.statement,
      hasPovertyCertificate: app.hasPovertyCertificate === true,
      isDisadvantaged: app.isDisadvantaged ?? legacyDisadvantaged ?? false,
      hardshipCategories:
        app.hardshipCategories ?? legacyHardshipCategories ?? [],
      submissionMode: "HYBRID",
      guardianInfo: app.guardianInfo ?? undefined,
      applicantInfo: {
        ...app.applicantInfo,
        cccd: app.studentCccd || undefined,
      },
      schoolInfo: schoolInfo ?? undefined,
    });
  }, [draftQuery.data, form, savedDraftId]);

  const handleModalClose = () => {
    if (isSubmitting) return;
    setSubmittedAppId(null);
    setCurrentStep(0);
    setSavedDraftId(undefined);
    form.resetFields();
    setFileLists({});
    setRemovedDocumentIds([]);
    onClose();
  };

  const buildPayload = async (
    saveAsDraft: boolean,
  ): Promise<CreateScholarshipDossierPayload> => {
    const values = form.getFieldsValue(true) as ScholarshipDossierForm;
    const rawGuardianInfo = saveAsDraft
      ? completeDraftGroup<ScholarshipGuardianInfo>(
          values.guardianInfo,
          ["fullName", "relationship", "phone"],
          "người giám hộ",
        )
      : (values.guardianInfo as ScholarshipGuardianInfo);
    const guardianInfo = rawGuardianInfo;
    const schoolInfo = saveAsDraft
      ? completeDraftGroup<ScholarshipSchoolInfo>(
          values.schoolInfo,
          [
            "schoolName",
            "gradeLevel",
            "className",
            "academicYear",
            "province",
            "district",
            "principalName",
            "principalTitle",
            "homeroomTeacherName",
            "homeroomTeacherPhone",
          ],
          "trường học",
        )
      : (values.schoolInfo as ScholarshipSchoolInfo);

    const documents: NonNullable<CreateScholarshipDossierPayload["documents"]> =
      [];
    const uploadEntries = Object.entries(fileLists).flatMap(([code, list]) =>
      list.filter((file) => file.originFileObj).map((file) => ({ code, file })),
    );
    for (const [index, item] of uploadEntries.entries()) {
      if (!item.file.originFileObj) continue;
      const currentPct = Math.round(((index) / uploadEntries.length) * 100);
      setUploadPercent(currentPct);
      setProgressText(
        `Đang tải tài liệu ${index + 1}/${uploadEntries.length}...`,
      );
      const uploaded = await scholarshipApplicationService.uploadDocument(
        item.file.originFileObj,
      );
      setUploadPercent(Math.round(((index + 1) / uploadEntries.length) * 100));
      documents.push({
        ...(item.code !== "__GENERAL__"
          ? { checklistItemCode: item.code }
          : {}),
        title: item.file.name,
        documentType:
          item.code === "CCCD_STUDENT" || item.code === "CCCD_GUARDIAN"
            ? "IDENTITY"
            : item.code === "TRANSCRIPT"
              ? "QUALIFICATION"
              : "SCHOLARSHIP_PROOF",
        files: [
          {
            storageKey: uploaded.storageKey,
            mimeType: uploaded.mimeType,
            side: "SINGLE",
          },
        ],
      });
    }

    const hardshipCats =
      values.isDisadvantaged === true ? values.hardshipCategories || [] : [];
    const isPoverty =
      hasPovertyCertificate ||
      hardshipCats.includes("POOR_HOUSEHOLD") ||
      hardshipCats.includes("NEAR_POOR_HOUSEHOLD");

    const payload: CreateScholarshipDossierPayload = {
      saveAsDraft,
      submissionMode: "HYBRID",
      hasPovertyCertificate: isPoverty,
    };
    if (values.statement !== undefined)
      payload.statement = values.statement.trim();
    if (guardianInfo)
      payload.guardianInfo = guardianInfo as ScholarshipGuardianInfo;
    if (values.applicantInfo) {
      const { cccd, ...applicantInfo } = values.applicantInfo;
      payload.applicantInfo = {
        ...applicantInfo,
        isDisadvantaged: values.isDisadvantaged === true,
        hardshipCategories: hardshipCats,
      };
      payload.studentCccd = cccd || "";
    }
    if (schoolInfo) payload.schoolInfo = schoolInfo as ScholarshipSchoolInfo;
    if (documents.length > 0) payload.documents = documents;
    return payload;
  };

  const persistDraft = async (
    saveAsDraft: boolean,
  ): Promise<ScholarshipApplication> => {
    const payload = await buildPayload(saveAsDraft);
    if (savedDraftId) {
      return scholarshipApplicationService.updateDossier(savedDraftId, {
        statement: payload.statement,
        submissionMode: payload.submissionMode,
        hasPovertyCertificate: payload.hasPovertyCertificate,
        guardianInfo: payload.guardianInfo,
        applicantInfo: payload.applicantInfo,
        studentCccd: payload.studentCccd,
        schoolInfo: payload.schoolInfo,
        documents: payload.documents,
        removeDocumentIds: removedDocumentIds,
      });
    }
    return scholarshipApplicationService.createDossier(campaign.id, payload);
  };

  const handleSaveDraft = async () => {
    if (checklistQuery.isError || !checklistQuery.data) return;
    setIsSubmitting(true);
    try {
      const draft = await persistDraft(true);
      setSavedDraftId(draft.id);
      setFileLists({});
      setRemovedDocumentIds([]);
      message.success("Đã lưu hồ sơ nháp. Bạn có thể tiếp tục hoàn thiện sau.");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: scholarshipApplicationKeys.all,
        }),
        queryClient.invalidateQueries({
          queryKey: scholarshipApplicationKeys.detail(draft.id),
        }),
      ]);
      onSuccess?.();
    } catch (err: unknown) {
      const anyErr = err as {
        code?: string;
        response?: { data?: { error?: string } };
      };
      if (
        anyErr?.code === "DUPLICATE_APPLICATION" ||
        anyErr?.response?.data?.error === "DUPLICATE_APPLICATION"
      ) {
        await queryClient.invalidateQueries({
          queryKey: scholarshipApplicationKeys.all,
        });
        message.warning(
          "Bạn đã có hồ sơ cho chiến dịch này. Đang chuyển hướng...",
        );
        handleModalClose();
        navigate(ROUTES.STUDENT.SCHOLARSHIP_APPLICATIONS);
        return;
      }
      message.error(getFriendlyErrorMessage(err, "Không thể lưu hồ sơ nháp."));
    } finally {
      setIsSubmitting(false);
      setProgressText(null);
    }
  };

  const handleSubmit = async () => {
    if (
      !checklistQuery.data ||
      checklistQuery.isError ||
      (savedDraftId && (draftQuery.isError || !draftQuery.data))
    )
      return;
    try {
      await form.validateFields();
    } catch {
      setCurrentStep(0);
      return;
    }

    setIsSubmitting(true);
    try {
      setProgressText("Đang gửi hồ sơ...");
      let result: ScholarshipApplication;
      if (
        !savedDraftId &&
        checklistQuery.data.dossierPolicy.allowDraftSave === false
      ) {
        const payload = await buildPayload(false);
        result = await scholarshipApplicationService.createDossier(
          campaign.id,
          payload,
        );
      } else {
        const draft = await persistDraft(true);
        setSavedDraftId(draft.id);
        setFileLists({});
        setRemovedDocumentIds([]);
        await queryClient.invalidateQueries({
          queryKey: scholarshipApplicationKeys.detail(draft.id),
        });
        result = await scholarshipApplicationService.submitDossier(draft.id);
      }
      message.success("Nộp hồ sơ xin học bổng thành công!");
      setSubmittedAppId(result.id);
      setSubmittedAppCode(result.applicationCode || null);
      form.resetFields();
      await queryClient.invalidateQueries({
        queryKey: scholarshipApplicationKeys.all,
      });
      onSuccess?.();
    } catch (err: unknown) {
      const anyErr = err as {
        code?: string;
        response?: { data?: { error?: string } };
      };
      if (
        anyErr?.code === "DUPLICATE_APPLICATION" ||
        anyErr?.response?.data?.error === "DUPLICATE_APPLICATION"
      ) {
        await queryClient.invalidateQueries({
          queryKey: scholarshipApplicationKeys.all,
        });
        message.warning(
          "Bạn đã có hồ sơ cho chiến dịch này. Đang chuyển hướng...",
        );
        handleModalClose();
        navigate(ROUTES.STUDENT.SCHOLARSHIP_APPLICATIONS);
        return;
      }
      message.error(
        getFriendlyErrorMessage(
          err,
          "Nộp hồ sơ thất bại. Bản nháp vẫn được giữ để bạn thử lại.",
        ),
      );
    } finally {
      setIsSubmitting(false);
      setProgressText(null);
    }
  };

  const handleStepForward = async () => {
    const fields =
      currentStep === 0
        ? [
            ["guardianInfo", "fullName"],
            ["guardianInfo", "relationship"],
            ["guardianInfo", "phone"],
            ["applicantInfo", "cccd"],
            ["applicantInfo", "phone"],
            ["schoolInfo", "schoolName"],
            ["schoolInfo", "gradeLevel"],
            ["schoolInfo", "className"],
            ["schoolInfo", "academicYear"],
            ["schoolInfo", "province"],
            ["schoolInfo", "district"],
            ["schoolInfo", "principalName"],
            ["schoolInfo", "principalTitle"],
            ["schoolInfo", "homeroomTeacherName"],
            ["schoolInfo", "homeroomTeacherPhone"],
            ...(isDisadvantaged ? [["hardshipCategories"]] : []),
          ]
        : [["submissionMode"]];
    try {
      await form.validateFields(fields);
      setCurrentStep((step) => Math.min(step + 1, 2));
    } catch {
      return;
    }
  };

  const renderUpload = (
    code: string,
    title: string,
    description?: string,
    maxFiles = MAX_FILES_WITHOUT_CHECKLIST,
  ) => (
    <Form.Item
      key={code}
      label={
        <span className="font-semibold">
          {title}
          {(checklist.find((item) => item.code === code)?.required ??
            ["CCCD_STUDENT", "CCCD_GUARDIAN", "TRANSCRIPT"].includes(code)) && (
            <span className="text-rose-500"> *</span>
          )}
        </span>
      }
      extra={
        description || `Chấp nhận PDF hoặc ảnh (JPG, PNG, WEBP); tối đa 10MB/tệp, tối đa ${maxFiles} tệp.`
      }
    >
      <Upload
        fileList={fileLists[code] ?? []}
        listType="picture"
        onPreview={handlePreviewFile}
        onChange={({ fileList: next }) =>
          setFileLists((current) => ({
            ...current,
            [code]: next.slice(-maxFiles),
          }))
        }
        beforeUpload={(file) => {
          const error = validateScholarshipDocument(file);
          if (error) {
            message.error(error);
            return Upload.LIST_IGNORE;
          }
          return false;
        }}
        multiple
        maxCount={maxFiles}
        accept={SCHOLARSHIP_DOCUMENT_ACCEPT}
        disabled={isSubmitting}
      >
        <Button icon={<UploadOutlined />} className="rounded-xl text-xs">
          Chọn tệp ảnh / PDF
        </Button>
      </Upload>
    </Form.Item>
  );

  return (
    <Modal
      open={open}
      onCancel={handleModalClose}
      footer={null}
      width={760}
      destroyOnHidden
      centered
      maskClosable={!isSubmitting}
      closable={!isSubmitting}
      className="rounded-3xl overflow-hidden"
    >
      {submittedAppId ? (
        <div className="py-6 text-center space-y-4 max-h-[80vh] overflow-y-auto px-1">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-3xl mx-auto">
            <CheckCircleOutlined />
          </div>
          <div>
            <Title level={4} className="!mb-1 text-slate-900 font-bold">
              Nộp hồ sơ thành công!
            </Title>
            <Paragraph className="text-slate-600 text-sm max-w-md mx-auto">
              Hồ sơ cho chiến dịch <strong>{campaign.title}</strong> đã được gửi
              để xét duyệt.
            </Paragraph>
          </div>

          <div className="text-left my-4">
            <PaperDossierInstructionCard applicationCode={submittedAppCode} />
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <Button onClick={handleModalClose} className="rounded-xl">
              Đóng
            </Button>
            <Link to={ROUTES.STUDENT.SCHOLARSHIP_APPLICATIONS}>
              <Button
                type="primary"
                className="bg-teal-600 hover:bg-teal-700 rounded-xl font-bold"
              >
                Theo dõi hồ sơ của tôi
              </Button>
            </Link>
          </div>
        </div>
      ) : existingApp && existingApp.status !== "DRAFT" ? (
        <div className="py-6 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center text-3xl mx-auto">
            <CheckCircleOutlined />
          </div>
          <div>
            <div className="text-xs font-bold text-teal-600 uppercase tracking-wider mb-1">
              Thông báo hồ sơ
            </div>
            <Title level={4} className="!mb-1 text-slate-900 font-bold">
              Bạn đã có hồ sơ cho chiến dịch này
            </Title>
            <Paragraph className="text-slate-600 text-sm max-w-md mx-auto">
              Theo quy chế học bổng, mỗi học sinh chỉ có một hồ sơ cho mỗi chiến
              dịch (áp dụng cho mọi trạng thái, bao gồm cả hồ sơ đã rút hoặc đã
              từ chối).
            </Paragraph>
          </div>

          <div className="max-w-md mx-auto p-4 rounded-2xl border border-slate-200 bg-slate-50 text-left space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Mã hồ sơ:</span>
              <span className="font-semibold text-slate-800">
                {existingApp.applicationCode || existingApp.id}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Trạng thái hiện tại:</span>
              <Tag color={SCHOLARSHIP_APP_STATUS_COLORS[existingApp.status]}>
                {SCHOLARSHIP_APP_STATUS_LABELS[existingApp.status]}
              </Tag>
            </div>
            {existingApp.status === "NEED_MORE_INFORMATION" && (
              <Alert
                type="warning"
                showIcon
                className="text-xs mt-2"
                message="Hồ sơ cần bổ sung thông tin"
                description="Hồ sơ của bạn đang cần bổ sung thông tin hoặc tài liệu theo yêu cầu thẩm định. Vui lòng cập nhật trực tiếp trên hồ sơ này."
              />
            )}
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <Button onClick={handleModalClose} className="rounded-xl">
              Đóng
            </Button>
            <Button
              type="primary"
              className="bg-[#0D9488] rounded-xl border-none"
              onClick={() => {
                handleModalClose();
                navigate(ROUTES.STUDENT.SCHOLARSHIP_APPLICATIONS);
              }}
            >
              Xem danh sách hồ sơ của tôi
            </Button>
          </div>
        </div>
      ) : (
        <div className="py-2 space-y-5">
          <div>
            <div className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1">
              {savedDraftId ? "Tiếp tục hồ sơ học bổng" : "Ứng tuyển học bổng"}
            </div>
            <Title level={4} className="!mb-1 text-slate-900 font-black">
              {campaign.title}
            </Title>
            <Text type="secondary" className="text-xs">
              Mức học bổng định mức:{" "}
              <strong className="text-indigo-600">
                {formatVND(campaign.awardAmountPerStudent)}
              </strong>{" "}
              / suất
            </Text>
            <Text type="secondary" className="text-xs block mt-1">
              Số tiền này được ghi vào số dư tài khoản học sinh để thanh toán
              mọi khóa học EDUNITY. Phần chưa dùng vẫn còn và không hết hạn.
            </Text>
          </div>

          {checklistQuery.isError ? (
            <Alert
              type="error"
              showIcon
              message="Không tải được yêu cầu hồ sơ của chiến dịch"
              description="Không thể xác định danh mục và chính sách hồ sơ hiện hành. Vui lòng thử lại trước khi lưu hoặc nộp."
              action={
                <Button
                  size="small"
                  onClick={() => void checklistQuery.refetch()}
                >
                  Thử lại
                </Button>
              }
            />
          ) : draftQuery.isError ? (
            <Alert
              type="error"
              showIcon
              message="Không tải được bản nháp"
              description="Bạn không thể truy cập hồ sơ này hoặc hồ sơ không còn tồn tại."
            />
          ) : null}

          <Steps
            current={currentStep}
            size="small"
            items={[
              { title: "Thông tin hồ sơ" },
              { title: "Nộp hồ sơ trực tuyến" },
              { title: "Kiểm tra và nộp hồ sơ" },
            ]}
          />

          {draftQuery.isLoading ? (
            <Alert type="info" showIcon message="Đang tải bản nháp đã lưu..." />
          ) : (
            <Form
              form={form}
              layout="vertical"
              initialValues={{ submissionMode: "HYBRID" }}
              preserve
              onFinish={handleSubmit}
            >
              {currentStep === 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                  <div className="md:col-span-2 text-sm font-bold text-slate-800 mb-2">
                    Thông tin cá nhân người nộp
                  </div>
                  <Form.Item
                    name={["applicantInfo", "fullName"]}
                    label="Họ và tên"
                    rules={[{ required: true, min: 2, max: 120 }]}
                  >
                    <Input maxLength={120} autoComplete="name" />
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
                    <Input
                      inputMode="numeric"
                      maxLength={12}
                      autoComplete="off"
                    />
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
                    <Input
                      inputMode="numeric"
                      maxLength={10}
                      autoComplete="tel"
                    />
                  </Form.Item>
                  <Form.Item name={["applicantInfo", "email"]} label="Email">
                    <Input type="email" maxLength={160} autoComplete="email" />
                  </Form.Item>
                  <Form.Item
                    name={["applicantInfo", "permanentAddress"]}
                    label="Hộ khẩu thường trú"
                    className="md:col-span-2"
                    rules={[
                      {
                        required: true,
                        whitespace: true,
                        message: "Vui lòng nhập địa chỉ thường trú",
                      },
                    ]}
                  >
                    <Input maxLength={300} autoComplete="street-address" />
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
                  <div className="md:col-span-2 text-sm font-bold text-slate-800 mb-2">
                    Thông tin người giám hộ
                  </div>
                  <Form.Item
                    name={["guardianInfo", "fullName"]}
                    label="Họ tên người giám hộ"
                    rules={[{ required: true, min: 2, max: 120 }]}
                  >
                    <Input maxLength={120} autoComplete="off" />
                  </Form.Item>
                  <Form.Item
                    name={["guardianInfo", "relationship"]}
                    label="Quan hệ với học sinh"
                    rules={[{ required: true }]}
                  >
                    <Select
                      options={[
                        ["FATHER", "Cha"],
                        ["MOTHER", "Mẹ"],
                        ["GRANDPARENT", "Ông/Bà"],
                        ["SIBLING", "Anh/Chị/Em"],
                        ["LEGAL_GUARDIAN", "Người giám hộ hợp pháp"],
                        ["OTHER", "Khác"],
                      ].map(([value, label]) => ({ value, label }))}
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
                      autoComplete="off"
                      inputMode="numeric"
                      maxLength={10}
                    />
                  </Form.Item>
                  <Form.Item
                    name={["guardianInfo", "email"]}
                    label="Email (không bắt buộc)"
                    rules={[{ type: "email" }]}
                  >
                    <Input autoComplete="off" maxLength={160} />
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
                      {
                        required: true,
                        message: "Vui lòng nhập CCCD người giám hộ",
                      },
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
                      placeholder="Ví dụ: 001202012345"
                    />
                  </Form.Item>
                  <Form.Item
                    name={["guardianInfo", "address"]}
                    label="Địa chỉ thường trú người giám hộ"
                    className="md:col-span-2"
                    rules={[{ required: true, whitespace: true }]}
                  >
                    <Input maxLength={300} autoComplete="street-address" />
                  </Form.Item>
                  <div className="md:col-span-2 text-sm font-bold text-slate-800 mb-2 mt-2">
                    Thông tin trường học
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
                    name={["schoolInfo", "studentCode"]}
                    label="Mã học sinh (không bắt buộc)"
                  >
                    <Input maxLength={50} />
                  </Form.Item>
                  <Form.Item
                    name={["schoolInfo", "academicYear"]}
                    label="Năm học"
                    rules={[
                      {
                        required: true,
                        whitespace: true,
                        message: "Vui lòng nhập năm học",
                      },
                    ]}
                  >
                    <Input maxLength={30} placeholder="Ví dụ: 2026-2027" />
                  </Form.Item>
                  <Form.Item
                    name={["schoolInfo", "province"]}
                    label="Tỉnh/Thành phố"
                    rules={[
                      {
                        required: true,
                        whitespace: true,
                        message: "Vui lòng nhập tỉnh/thành phố",
                      },
                    ]}
                  >
                    <Input maxLength={100} />
                  </Form.Item>
                  <Form.Item
                    name={["schoolInfo", "district"]}
                    label="Xã/Phường"
                    rules={[
                      {
                        required: true,
                        whitespace: true,
                        message: "Vui lòng nhập xã/phường",
                      },
                    ]}
                  >
                    <Input maxLength={100} />
                  </Form.Item>
                  <Form.Item
                    name={["schoolInfo", "principalName"]}
                    label="Họ tên ban giám hiệu"
                    rules={[
                      {
                        required: true,
                        whitespace: true,
                        message: "Vui lòng nhập họ tên ban giám hiệu",
                      },
                    ]}
                  >
                    <Input maxLength={120} />
                  </Form.Item>
                  <Form.Item
                    name={["schoolInfo", "principalTitle"]}
                    label="Chức vụ"
                    rules={[
                      {
                        required: true,
                        whitespace: true,
                        message: "Vui lòng nhập chức vụ",
                      },
                    ]}
                  >
                    <Input maxLength={100} />
                  </Form.Item>
                  <Form.Item
                    name={["schoolInfo", "homeroomTeacherName"]}
                    label="Họ tên giáo viên chủ nhiệm"
                    rules={[
                      {
                        required: true,
                        whitespace: true,
                        message: "Vui lòng nhập họ tên giáo viên chủ nhiệm",
                      },
                    ]}
                  >
                    <Input maxLength={120} />
                  </Form.Item>
                  <Form.Item
                    name={["schoolInfo", "homeroomTeacherPhone"]}
                    label="Số điện thoại giáo viên chủ nhiệm"
                    rules={[
                      {
                        required: true,
                        message:
                          "Vui lòng nhập số điện thoại giáo viên chủ nhiệm",
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
                  <Form.Item
                    name="isDisadvantaged"
                    valuePropName="checked"
                    className="md:col-span-2 mb-1"
                  >
                    <Checkbox>Thuộc diện khó khăn</Checkbox>
                  </Form.Item>
                  {isDisadvantaged && (
                    <Form.Item
                      name="hardshipCategories"
                      label="Diện khó khăn"
                      className="md:col-span-2"
                      rules={[
                        {
                          validator: (_, value) =>
                            value?.length
                              ? Promise.resolve()
                              : Promise.reject(
                                  new Error(
                                    "Vui lòng chọn ít nhất một diện khó khăn",
                                  ),
                                ),
                        },
                      ]}
                    >
                      <Select
                        mode="multiple"
                        placeholder="Chọn một hoặc nhiều diện"
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
                </div>
              )}

              {currentStep === 1 && (
                <div className="space-y-4">
                  <Form.Item name="submissionMode" initialValue="HYBRID" hidden>
                    <Input />
                  </Form.Item>
                  <Alert
                    type="info"
                    showIcon
                    message="Bước 2: Nộp hồ sơ trực tuyến"
                    description="Tải lên bản điện tử (bản scan PDF hoặc file ảnh chụp rõ nét) của các giấy tờ bắt buộc và minh chứng đối tượng ưu tiên. Sau khi hoàn tất đăng ký trực tuyến, bạn sẽ chuẩn bị hồ sơ giấy (bản sao công chứng) theo hướng dẫn để gửi về trung tâm tiếp nhận."
                  />
                  <Form.Item
                    name="statement"
                    label="Nguyện vọng / Thông tin thêm (tùy chọn)"
                    extra="Bạn có thể ghi nguyện vọng học tập hoặc thông tin khác muốn gửi hội đồng xét duyệt."
                    rules={[{ max: 3000 }]}
                  >
                    <TextArea
                      rows={3}
                      showCount
                      maxLength={3000}
                      placeholder="Nguyện vọng học tập hoặc thông tin thêm (nếu có)..."
                    />
                  </Form.Item>

                  <div className="space-y-4">
                    <div className="border-b border-slate-200 pb-2">
                      <div className="font-bold text-slate-900 text-sm sm:text-base">
                        Minh chứng hoàn cảnh và đối tượng ưu tiên
                      </div>
                      <Text type="secondary" className="text-xs block mt-0.5">
                        Đính kèm các giấy tờ bắt buộc và tích chọn các minh
                        chứng hoàn cảnh phù hợp để hội đồng đối chiếu và cộng
                        điểm ưu tiên.
                      </Text>
                    </div>

                    {/* Khối 1: Giấy tờ bắt buộc */}
                    <div className="space-y-3">
                      <div className="font-bold text-xs uppercase tracking-wide text-teal-800 flex items-center gap-1.5">
                        <SafetyCertificateOutlined className="text-teal-600" />
                        1. Giấy tờ bắt buộc (Phải nộp để được xét duyệt)
                      </div>
                      <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/50">
                        {renderUpload(
                          "CCCD_STUDENT",
                          "CCCD / Định danh học sinh",
                          "Bản scan PDF hoặc ảnh rõ nét 2 mặt từ giấy tờ công chứng.",
                          1,
                        )}
                      </div>
                      <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/50">
                        {renderUpload(
                          "CCCD_GUARDIAN",
                          "CCCD / Định danh người giám hộ",
                          "Bản scan PDF hoặc ảnh rõ nét 2 mặt từ giấy tờ công chứng.",
                          1,
                        )}
                      </div>
                      <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/50">
                        {renderUpload(
                          "TRANSCRIPT",
                          "Bảng điểm / Học bạ gần nhất",
                          "Bản scan PDF hoặc ảnh chụp học bạ / bảng điểm có xác nhận của nhà trường.",
                          5,
                        )}
                      </div>
                    </div>

                    {/* Khối 2: Giấy tờ theo hoàn cảnh */}
                    <div className="space-y-3 pt-2">
                      <div className="font-bold text-xs uppercase tracking-wide text-indigo-800 flex items-center gap-1.5">
                        <StarOutlined className="text-indigo-600" />
                        2. Giấy tờ theo hoàn cảnh & Đối tượng ưu tiên (Tùy chọn)
                      </div>

                      {/* Hộ nghèo / cận nghèo */}
                      <div className="rounded-xl border border-slate-200 p-3">
                        <Form.Item
                          name="hasPovertyCertificate"
                          valuePropName="checked"
                          className="!mb-1"
                        >
                          <Checkbox className="font-medium text-xs sm:text-sm">
                            Giấy chứng nhận hộ nghèo / cận nghèo (hoặc xác nhận
                            của địa phương)
                          </Checkbox>
                        </Form.Item>
                        {hasPovertyCertificate &&
                          renderUpload(
                            "POVERTY_CERTIFICATE",
                            "Minh chứng hộ nghèo / cận nghèo",
                            "Tải bản scan PDF hoặc ảnh chụp giấy chứng nhận.",
                            3,
                          )}
                      </div>

                      {/* Hoàn cảnh khó khăn */}
                      <div className="rounded-xl border border-slate-200 p-3">
                        <Form.Item
                          name="hasHardshipCert"
                          valuePropName="checked"
                          className="!mb-1"
                        >
                          <Checkbox className="font-medium text-xs sm:text-sm">
                            Giấy xác nhận hoàn cảnh khó khăn / gia đình chính
                            sách
                          </Checkbox>
                        </Form.Item>
                        {hasHardshipCert &&
                          renderUpload(
                            "HARDSHIP_CERTIFICATE",
                            "Minh chứng hoàn cảnh khó khăn / chính sách",
                            "Tải bản xác nhận của chính quyền địa phương hoặc cơ quan có thẩm quyền.",
                            3,
                          )}
                      </div>

                      {/* Mồ côi */}
                      <div className="rounded-xl border border-slate-200 p-3">
                        <Form.Item
                          name="hasOrphanCert"
                          valuePropName="checked"
                          className="!mb-1"
                        >
                          <Checkbox className="font-medium text-xs sm:text-sm">
                            Giấy chứng nhận mồ côi (cha, mẹ hoặc cả hai)
                          </Checkbox>
                        </Form.Item>
                        {hasOrphanCert &&
                          renderUpload(
                            "ORPHAN_CERTIFICATE",
                            "Minh chứng mồ côi",
                            "Tải trích lục khai tử hoặc quyết định hưởng trợ cấp xã hội.",
                            3,
                          )}
                      </div>

                      {/* Khuyết tật / bệnh hiểm nghèo */}
                      <div className="rounded-xl border border-slate-200 p-3">
                        <Form.Item
                          name="hasDisabilityCert"
                          valuePropName="checked"
                          className="!mb-1"
                        >
                          <Checkbox className="font-medium text-xs sm:text-sm">
                            Giấy xác nhận khuyết tật / bệnh hiểm nghèo (nếu có)
                          </Checkbox>
                        </Form.Item>
                        {hasDisabilityCert &&
                          renderUpload(
                            "DISABILITY_CERTIFICATE",
                            "Minh chứng khuyết tật / bệnh án",
                            "Tải giấy xác nhận mức độ khuyết tật hoặc tóm tắt hồ sơ bệnh án.",
                            3,
                          )}
                      </div>

                      {/* Thành tích học tập */}
                      <div className="rounded-xl border border-slate-200 p-3">
                        <Form.Item
                          name="hasAchievementCert"
                          valuePropName="checked"
                          className="!mb-1"
                        >
                          <Checkbox className="font-medium text-xs sm:text-sm">
                            Giấy tờ minh chứng thành tích học tập / giải thưởng
                            (nếu có)
                          </Checkbox>
                        </Form.Item>
                        {hasAchievementCert &&
                          renderUpload(
                            "ACADEMIC_ACHIEVEMENT",
                            "Minh chứng thành tích / giải thưởng",
                            "Tải giấy khen học sinh giỏi, chứng nhận đạt giải các kỳ thi...",
                            5,
                          )}
                      </div>

                      {/* Giấy tờ khác */}
                      <div className="rounded-xl border border-slate-200 p-3">
                        <Form.Item
                          name="hasOtherCert"
                          valuePropName="checked"
                          className="!mb-1"
                        >
                          <Checkbox className="font-medium text-xs sm:text-sm">
                            Giấy tờ minh chứng khác
                          </Checkbox>
                        </Form.Item>
                        {hasOtherCert && (
                          <div className="space-y-2 mt-2">
                            <Form.Item
                              name="otherCertTitle"
                              label={
                                <span className="text-xs font-semibold text-slate-700">
                                  Tên loại giấy tờ khác:
                                </span>
                              }
                            >
                              <Input
                                placeholder="Ví dụ: Giấy xác nhận con thương binh, con liệt sĩ..."
                                className="rounded-xl"
                                maxLength={150}
                              />
                            </Form.Item>
                            {renderUpload(
                              "OTHER_CERTIFICATE",
                              "Tệp minh chứng khác",
                              "Tải tệp đính kèm tương ứng.",
                              5,
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {existingDocuments.length > 0 && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
                        <div className="text-sm font-semibold text-emerald-800">
                          Tài liệu đã lưu · có thể xem hoặc thay tệp
                        </div>
                        {existingDocuments.map((doc) => {
                          const documentId = doc._id || doc.id;
                          return (
                            <div
                              key={documentId || doc.checklistItemCode}
                              className="rounded-lg bg-white border border-emerald-100 p-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium">
                                  {doc.title ||
                                    doc.checklistItemCode ||
                                    doc.documentType}
                                </span>
                                {documentId && savedDraftId && (
                                  <Button
                                    size="small"
                                    danger
                                    type="link"
                                    onClick={() =>
                                      setRemovedDocumentIds((current) => [
                                        ...new Set([...current, documentId]),
                                      ])
                                    }
                                  >
                                    Gỡ để tải lại
                                  </Button>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                                {doc.files.map((file, index) => {
                                  const isPdf =
                                    file.mimeType === "application/pdf" ||
                                    (Boolean(file.storageKey) &&
                                      file.storageKey.toLowerCase().endsWith(".pdf"));
                                  return file.url ? (
                                    isPdf ? (
                                      <a
                                        key={file.storageKey || index}
                                        href={file.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs text-teal-700 underline inline-flex items-center gap-1 hover:text-teal-800"
                                      >
                                        <FilePdfOutlined /> Xem PDF {index + 1}
                                      </a>
                                    ) : (
                                      <Button
                                        key={file.storageKey || index}
                                        type="link"
                                        size="small"
                                        icon={<FileImageOutlined />}
                                        onClick={() => {
                                          setPreviewImage(file.url || "");
                                          setPreviewTitle(
                                            doc.title || `Minh chứng ${index + 1}`,
                                          );
                                          setPreviewOpen(true);
                                        }}
                                        className="text-xs text-teal-700 p-0 h-auto inline-flex items-center gap-1 hover:text-teal-800"
                                      >
                                        Xem ảnh {index + 1}
                                      </Button>
                                    )
                                  ) : (
                                    <span
                                      key={file.storageKey || index}
                                      className="text-xs text-slate-400"
                                    >
                                      Tệp {index + 1} chưa có liên kết xem
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-4">
                  <Alert
                    type="warning"
                    showIcon
                    message="Kiểm tra thông tin trước khi nộp"
                    description="Sau khi nộp, hồ sơ sẽ chuyển sang chờ xét duyệt. Bạn có thể bổ sung khi Admin gửi yêu cầu."
                  />
                  <div className="rounded-xl border border-slate-200 p-4 space-y-3 text-sm">
                    <div>
                      <strong>Người nộp:</strong>{" "}
                      {form.getFieldValue(["applicantInfo", "fullName"]) || "—"}{" "}
                      · CCCD{" "}
                      {form.getFieldValue(["applicantInfo", "cccd"]) || "—"} ·{" "}
                      {form.getFieldValue(["applicantInfo", "phone"]) || "—"}
                    </div>
                    <div>
                      <strong>Email / Hộ khẩu:</strong>{" "}
                      {form.getFieldValue(["applicantInfo", "email"]) || "—"} ·{" "}
                      {form.getFieldValue([
                        "applicantInfo",
                        "permanentAddress",
                      ]) || "—"}
                    </div>
                    <div>
                      <strong>Người giám hộ:</strong>{" "}
                      {form.getFieldValue(["guardianInfo", "fullName"]) || "—"}
                    </div>
                    <div>
                      <strong>Trường/Lớp:</strong>{" "}
                      {form.getFieldValue(["schoolInfo", "schoolName"]) || "—"}{" "}
                      / {form.getFieldValue(["schoolInfo", "className"])} · Năm
                      học{" "}
                      {form.getFieldValue(["schoolInfo", "academicYear"]) ||
                        "—"}
                    </div>
                    <div>
                      <strong>Địa bàn trường:</strong>{" "}
                      {[
                        form.getFieldValue(["schoolInfo", "district"]),
                        form.getFieldValue(["schoolInfo", "province"]),
                      ]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </div>
                    <div>
                      <strong>Ban giám hiệu:</strong>{" "}
                      {form.getFieldValue(["schoolInfo", "principalName"]) ||
                        "—"}{" "}
                      ·{" "}
                      {form.getFieldValue(["schoolInfo", "principalTitle"]) ||
                        "—"}
                    </div>
                    <div>
                      <strong>Giáo viên chủ nhiệm:</strong>{" "}
                      {form.getFieldValue([
                        "schoolInfo",
                        "homeroomTeacherName",
                      ]) || "—"}{" "}
                      ·{" "}
                      {form.getFieldValue([
                        "schoolInfo",
                        "homeroomTeacherPhone",
                      ]) || "—"}
                    </div>
                    {form.getFieldValue("isDisadvantaged") && (
                      <div>
                        <strong>Diện khó khăn:</strong>{" "}
                        {(form.getFieldValue("hardshipCategories") || [])
                          .map(
                            (item: string) =>
                              ({
                                POOR_HOUSEHOLD: "Hộ nghèo",
                                NEAR_POOR_HOUSEHOLD: "Hộ cận nghèo",
                                REMOTE_AREA: "Vùng sâu, vùng xa",
                                ORPHANED: "Mồ côi cha mẹ",
                              })[item] || item,
                          )
                          .join(", ")}
                      </div>
                    )}
                    <div>
                      <strong>Hình thức:</strong> Hồ sơ giấy kết hợp trực tuyến
                    </div>
                    <div>
                      <strong>Thư nguyện vọng:</strong>
                      <p className="whitespace-pre-wrap text-slate-600">
                        {form.getFieldValue("statement") || "—"}
                      </p>
                    </div>
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div className="font-semibold text-slate-800">
                        Minh chứng đính kèm ({existingDocuments.length} tài liệu đã lưu,{" "}
                        {Object.values(fileLists).reduce(
                          (sum, list) => sum + list.length,
                          0,
                        )}{" "}
                        tệp mới):
                      </div>
                      {existingDocuments.length === 0 &&
                      Object.values(fileLists).every((l) => l.length === 0) ? (
                        <div className="text-xs text-slate-400 italic">
                          Chưa có tài liệu minh chứng nào được tải lên
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {existingDocuments.map((doc, idx) => (
                            <div
                              key={doc._id || doc.id || idx}
                              className="text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                            >
                              <span className="font-medium text-slate-700">
                                {doc.title || doc.checklistItemCode || `Tài liệu ${idx + 1}`}{" "}
                                <Tag color="green" className="text-[10px] ml-1">Đã lưu</Tag>
                              </span>
                              <div className="flex flex-wrap gap-2">
                                {doc.files.map((f, fIdx) => {
                                  const isPdf =
                                    f.mimeType === "application/pdf" ||
                                    (Boolean(f.storageKey) &&
                                      f.storageKey.toLowerCase().endsWith(".pdf"));
                                  return f.url ? (
                                    isPdf ? (
                                      <a
                                        key={f.storageKey || fIdx}
                                        href={f.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-teal-700 underline inline-flex items-center gap-1 font-medium hover:text-teal-800"
                                      >
                                        <FilePdfOutlined /> Xem PDF {fIdx + 1}
                                      </a>
                                    ) : (
                                      <Button
                                        key={f.storageKey || fIdx}
                                        type="link"
                                        size="small"
                                        icon={<FileImageOutlined />}
                                        onClick={() => {
                                          setPreviewImage(f.url || "");
                                          setPreviewTitle(
                                            doc.title || `Minh chứng ${fIdx + 1}`,
                                          );
                                          setPreviewOpen(true);
                                        }}
                                        className="text-teal-700 p-0 h-auto inline-flex items-center gap-1 font-medium hover:text-teal-800"
                                      >
                                        Xem ảnh {fIdx + 1}
                                      </Button>
                                    )
                                  ) : null;
                                })}
                              </div>
                            </div>
                          ))}
                          {Object.entries(fileLists).flatMap(([code, list]) =>
                            list.map((file, fIdx) => {
                              const isPdf =
                                file.name.toLowerCase().endsWith(".pdf") ||
                                file.type === "application/pdf";
                              return (
                                <div
                                  key={`${code}-${file.uid || fIdx}`}
                                  className="text-xs bg-teal-50/50 p-2.5 rounded-lg border border-teal-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                                >
                                  <span className="font-medium text-slate-800">
                                    {file.name}{" "}
                                    <Tag color="blue" className="text-[10px] ml-1">Tệp mới</Tag>
                                  </span>
                                  <Button
                                    type="link"
                                    size="small"
                                    icon={isPdf ? <FilePdfOutlined /> : <FileImageOutlined />}
                                    onClick={() => void handlePreviewFile(file)}
                                    className="text-teal-700 p-0 h-auto inline-flex items-center gap-1 font-medium hover:text-teal-800"
                                  >
                                    {isPdf ? "Xem PDF" : "Xem ảnh"}
                                  </Button>
                                </div>
                              );
                            }),
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 mt-4">
                <div className="text-xs text-slate-500 flex items-center gap-2">
                  {progressText && (
                    <>
                      <span className="animate-pulse">{progressText}</span>
                      {uploadPercent > 0 && (
                        <Progress
                          percent={uploadPercent}
                          size="small"
                          className="w-24 m-0"
                          showInfo={false}
                        />
                      )}
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleModalClose} disabled={isSubmitting}>
                    Đóng
                  </Button>
                  {currentStep > 0 && (
                    <Button
                      onClick={() => setCurrentStep((step) => step - 1)}
                      disabled={isSubmitting}
                    >
                      Quay lại
                    </Button>
                  )}
                  {checklistQuery.data?.dossierPolicy.allowDraftSave !==
                    false && (
                    <Button
                      onClick={() => void handleSaveDraft()}
                      loading={isSubmitting}
                      disabled={
                        checklistQuery.isLoading ||
                        Boolean(draftId && draftQuery.isLoading)
                      }
                    >
                      Lưu nháp
                    </Button>
                  )}
                  {currentStep < 2 ? (
                    <Button
                      type="primary"
                      onClick={() => void handleStepForward()}
                      disabled={
                        checklistQuery.isLoading || checklistQuery.isError
                      }
                    >
                      Tiếp tục
                    </Button>
                  ) : (
                    <Button
                      type="primary"
                      onClick={() => void handleSubmit()}
                      loading={isSubmitting}
                      disabled={
                        checklistQuery.isLoading ||
                        checklistQuery.isError ||
                        draftQuery.isLoading ||
                        draftQuery.isError
                      }
                      className="bg-indigo-600"
                    >
                      Nộp hồ sơ
                    </Button>
                  )}
                </div>
              </div>
            </Form>
          )}
        </div>
      )}

      {/* Image / PDF Preview Modal */}
      <Modal
        open={previewOpen}
        title={
          <span className="font-semibold text-slate-800">
            {previewTitle || "Xem trước tài liệu"}
          </span>
        }
        footer={null}
        onCancel={() => setPreviewOpen(false)}
        width={720}
        destroyOnClose
      >
        <div className="flex justify-center p-2">
          {previewImage.startsWith("data:application/pdf") ||
          previewTitle.toLowerCase().endsWith(".pdf") ? (
            <iframe
              src={previewImage}
              title={previewTitle}
              className="w-full h-[600px] border-0 rounded-lg"
            />
          ) : (
            <img
              alt={previewTitle}
              style={{
                maxWidth: "100%",
                maxHeight: "70vh",
                objectFit: "contain",
              }}
              src={previewImage}
              className="rounded-lg shadow-sm"
            />
          )}
        </div>
      </Modal>
    </Modal>
  );
}
