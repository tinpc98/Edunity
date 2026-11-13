import { useEffect, useMemo, useState } from "react";
import { App as AntdApp, Modal, Form, Input, Button, Upload, Alert, Typography, Select, Steps, Tag } from "antd";
import { UploadOutlined, CheckCircleOutlined, InfoCircleOutlined } from "@ant-design/icons";
import type { UploadFile } from "antd/es/upload/interface";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  scholarshipApplicationKeys,
  scholarshipApplicationService,
} from "../../../services/scholarshipApplication.service";
import { campaignKeys, campaignService } from "../../../services/campaign.service";
import type { ScholarshipCampaign } from "../../../types/campaign";
import type {
  CreateScholarshipDossierPayload,
  DossierSubmissionMode,
  ScholarshipApplication,
  ScholarshipChecklistItem,
  ScholarshipGuardianInfo,
  ScholarshipSchoolInfo,
} from "../../../types/scholarship";
import { formatVND } from "../../../types/payment";
import { Link } from "react-router-dom";
import { ROUTES } from "../../../routes/routePaths";
import { getFriendlyErrorMessage } from "../../../utils/apiErrorMap";
import { PRIVATE_DOCUMENT_ACCEPT, validatePrivateDocument } from "../../../utils/fileValidation";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const MAX_FILES_WITHOUT_CHECKLIST = 5;

interface ScholarshipDossierForm {
  statement?: string;
  submissionMode?: DossierSubmissionMode;
  guardianInfo?: Partial<ScholarshipGuardianInfo>;
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
  return !value || Object.values(value).every((item) => item === undefined || item === null || item === "");
}

function completeDraftGroup<T extends object>(
  value: Partial<T> | undefined,
  requiredKeys: (keyof T)[],
  label: string,
): T | undefined {
  if (isGroupEmpty(value)) return undefined;
  if (!requiredKeys.every((key) => String((value as Record<keyof T, unknown> | undefined)?.[key] ?? "").trim())) {
    throw new Error(`Vui lòng hoàn tất các trường bắt buộc trong nhóm ${label} trước khi lưu nháp.`);
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
  const queryClient = useQueryClient();
  const [fileLists, setFileLists] = useState<Record<string, UploadFile[]>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [submittedAppId, setSubmittedAppId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [savedDraftId, setSavedDraftId] = useState(draftId);

  const checklistQuery = useQuery({
    queryKey: campaignKeys.checklist(campaign.id),
    queryFn: () => campaignService.getCampaignChecklist(campaign.id),
    enabled: open,
    retry: false,
  });
  const draftQuery = useQuery({
    queryKey: scholarshipApplicationKeys.detail(savedDraftId || ""),
    queryFn: () => scholarshipApplicationService.getMyApplicationDetail(savedDraftId || ""),
    enabled: open && Boolean(savedDraftId),
    retry: false,
  });

  const checklist = checklistQuery.data?.documentChecklist ?? [];
  const modeOptions: { value: DossierSubmissionMode; label: string }[] = useMemo(
    () =>
      checklistQuery.data?.dossierPolicy.allowPaperDossier === false
        ? [{ value: "ONLINE", label: "Nộp tài liệu trực tuyến" }]
        : [
            { value: "ONLINE", label: "Nộp tài liệu trực tuyến" },
            { value: "PAPER", label: "Nộp hồ sơ giấy" },
            { value: "HYBRID", label: "Kết hợp trực tuyến và hồ sơ giấy" },
          ],
    [checklistQuery.data?.dossierPolicy.allowPaperDossier],
  );
  const currentMode = Form.useWatch("submissionMode", form) ?? "ONLINE";
  const existingDocuments = draftQuery.data?.documents ?? [];

  useEffect(() => {
    const app = draftQuery.data;
    if (!app || app.id !== savedDraftId) return;
    form.setFieldsValue({
      statement: app.statement,
      submissionMode: app.submissionMode ?? "ONLINE",
      guardianInfo: app.guardianInfo ?? undefined,
      schoolInfo: app.schoolInfo ?? undefined,
    });
  }, [draftQuery.data, form, savedDraftId]);

  const handleModalClose = () => {
    if (isSubmitting) return;
    setSubmittedAppId(null);
    setCurrentStep(0);
    setSavedDraftId(undefined);
    form.resetFields();
    setFileLists({});
    onClose();
  };

  const buildPayload = async (saveAsDraft: boolean): Promise<CreateScholarshipDossierPayload> => {
    const values = form.getFieldsValue(true) as ScholarshipDossierForm;
    const guardianInfo = saveAsDraft
      ? completeDraftGroup<ScholarshipGuardianInfo>(
          values.guardianInfo,
          ["fullName", "relationship", "phone"],
          "người giám hộ",
        )
      : values.guardianInfo as ScholarshipGuardianInfo;
    const schoolInfo = saveAsDraft
      ? completeDraftGroup<ScholarshipSchoolInfo>(
          values.schoolInfo,
          ["schoolName", "gradeLevel", "className"],
          "trường học",
        )
      : values.schoolInfo as ScholarshipSchoolInfo;

    const documents: NonNullable<CreateScholarshipDossierPayload["documents"]> = [];
    const uploadEntries = Object.entries(fileLists).flatMap(([code, list]) =>
      list.filter((file) => file.originFileObj).map((file) => ({ code, file })),
    );
    for (const [index, item] of uploadEntries.entries()) {
      if (!item.file.originFileObj) continue;
      setProgressText(`Đang tải tài liệu ${index + 1}/${uploadEntries.length}...`);
      const uploaded = await scholarshipApplicationService.uploadDocument(item.file.originFileObj);
      documents.push({
        ...(item.code !== "__GENERAL__" ? { checklistItemCode: item.code } : {}),
        title: item.file.name,
        documentType: "SCHOLARSHIP_PROOF",
        files: [{ storageKey: uploaded.storageKey, mimeType: uploaded.mimeType, side: "SINGLE" }],
      });
    }

    const payload: CreateScholarshipDossierPayload = {
      saveAsDraft,
      submissionMode: values.submissionMode ?? "ONLINE",
    };
    if (values.statement !== undefined) payload.statement = values.statement.trim();
    if (guardianInfo) payload.guardianInfo = guardianInfo as ScholarshipGuardianInfo;
    if (schoolInfo) payload.schoolInfo = schoolInfo as ScholarshipSchoolInfo;
    if (documents.length > 0) payload.documents = documents;
    return payload;
  };

  const persistDraft = async (saveAsDraft: boolean): Promise<ScholarshipApplication> => {
    const payload = await buildPayload(saveAsDraft);
    if (savedDraftId) {
      return scholarshipApplicationService.updateDossier(savedDraftId, {
        statement: payload.statement,
        submissionMode: payload.submissionMode,
        guardianInfo: payload.guardianInfo,
        schoolInfo: payload.schoolInfo,
        documents: payload.documents,
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
      message.success("Đã lưu hồ sơ nháp. Bạn có thể tiếp tục hoàn thiện sau.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: scholarshipApplicationKeys.all }),
        queryClient.invalidateQueries({ queryKey: scholarshipApplicationKeys.detail(draft.id) }),
      ]);
      onSuccess?.();
    } catch (err) {
      message.error(getFriendlyErrorMessage(err, "Không thể lưu hồ sơ nháp."));
    } finally {
      setIsSubmitting(false);
      setProgressText(null);
    }
  };

  const handleSubmit = async () => {
    if (!checklistQuery.data || checklistQuery.isError || (savedDraftId && (draftQuery.isError || !draftQuery.data))) return;
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
      if (!savedDraftId && checklistQuery.data.dossierPolicy.allowDraftSave === false) {
        const payload = await buildPayload(false);
        result = await scholarshipApplicationService.createDossier(campaign.id, payload);
      } else {
        const draft = await persistDraft(true);
        setSavedDraftId(draft.id);
        setFileLists({});
        await queryClient.invalidateQueries({ queryKey: scholarshipApplicationKeys.detail(draft.id) });
        result = await scholarshipApplicationService.submitDossier(draft.id);
      }
      message.success("Nộp hồ sơ xin học bổng thành công!");
      setSubmittedAppId(result.id);
      form.resetFields();
      await queryClient.invalidateQueries({ queryKey: scholarshipApplicationKeys.all });
      onSuccess?.();
    } catch (err) {
      message.error(getFriendlyErrorMessage(err, "Nộp hồ sơ thất bại. Bản nháp vẫn được giữ để bạn thử lại."));
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
            ["schoolInfo", "schoolName"],
            ["schoolInfo", "gradeLevel"],
            ["schoolInfo", "className"],
          ]
        : [["statement"], ["submissionMode"]];
    try {
      await form.validateFields(fields);
      setCurrentStep((step) => Math.min(step + 1, 2));
    } catch {
      return;
    }
  };

  const renderUpload = (code: string, title: string, description?: string, maxFiles = MAX_FILES_WITHOUT_CHECKLIST) => (
    <Form.Item
      key={code}
      label={<span className="font-semibold">{title}{checklist.find((item) => item.code === code)?.required && <span className="text-rose-500"> *</span>}</span>}
      extra={description || `PDF, JPG, PNG, WebP; tối đa 10MB/tệp, tối đa ${maxFiles} tệp.`}
    >
      <Upload
        fileList={fileLists[code] ?? []}
        onChange={({ fileList: next }) => setFileLists((current) => ({ ...current, [code]: next.slice(-maxFiles) }))}
        beforeUpload={(file) => {
          const error = validatePrivateDocument(file);
          if (error) {
            message.error(error);
            return Upload.LIST_IGNORE;
          }
          return false;
        }}
        multiple
        maxCount={maxFiles}
        accept={PRIVATE_DOCUMENT_ACCEPT}
        disabled={isSubmitting}
      >
        <Button icon={<UploadOutlined />} className="rounded-xl text-xs">Chọn tệp</Button>
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
        <div className="py-6 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-3xl mx-auto">
            <CheckCircleOutlined />
          </div>
          <div>
            <Title level={4} className="!mb-1 text-slate-900 font-bold">Nộp hồ sơ thành công!</Title>
            <Paragraph className="text-slate-600 text-sm max-w-md mx-auto">
              Hồ sơ cho chiến dịch <strong>{campaign.title}</strong> đã được gửi để xét duyệt.
            </Paragraph>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button onClick={handleModalClose} className="rounded-xl">Đóng</Button>
            <Link to={ROUTES.STUDENT.SCHOLARSHIP_APPLICATIONS}>
              <Button type="primary" className="bg-indigo-600 rounded-xl">Theo dõi hồ sơ của tôi</Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="py-2 space-y-5">
          <div>
            <div className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1">
              {savedDraftId ? "Tiếp tục hồ sơ học bổng" : "Ứng tuyển học bổng"}
            </div>
            <Title level={4} className="!mb-1 text-slate-900 font-black">{campaign.title}</Title>
            <Text type="secondary" className="text-xs">
              Mức học bổng định mức: <strong className="text-indigo-600">{formatVND(campaign.awardAmountPerStudent)}</strong> / suất
            </Text>
          </div>

          <Alert
            type="info"
            showIcon
            icon={<InfoCircleOutlined />}
            message="Thông tin hồ sơ được lưu an toàn trên hệ thống"
            description="Tệp minh chứng được tải lên kho riêng tư của hệ thống; trình duyệt không lưu bản nháp hoặc tài liệu trong localStorage/sessionStorage."
            className="rounded-xl"
          />

          {checklistQuery.isError ? (
            <Alert
              type="error"
              showIcon
              message="Không tải được yêu cầu hồ sơ của chiến dịch"
              description="Không thể xác định danh mục và chính sách hồ sơ hiện hành. Vui lòng thử lại trước khi lưu hoặc nộp."
              action={<Button size="small" onClick={() => void checklistQuery.refetch()}>Thử lại</Button>}
            />
          ) : draftQuery.isError ? (
            <Alert type="error" showIcon message="Không tải được bản nháp" description="Bạn không thể truy cập hồ sơ này hoặc hồ sơ không còn tồn tại." />
          ) : null}

          <Steps
            current={currentStep}
            size="small"
            items={[{ title: "Thông tin hồ sơ" }, { title: "Thư nguyện vọng & minh chứng" }, { title: "Kiểm tra và nộp" }]}
          />

          {draftQuery.isLoading ? (
            <Alert type="info" showIcon message="Đang tải bản nháp đã lưu..." />
          ) : (
            <Form
              form={form}
              layout="vertical"
              initialValues={{ submissionMode: "ONLINE" }}
              preserve
              onFinish={handleSubmit}
            >
              {currentStep === 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                  <div className="md:col-span-2 text-sm font-bold text-slate-800 mb-2">Thông tin người giám hộ</div>
                  <Form.Item name={["guardianInfo", "fullName"]} label="Họ tên người giám hộ" rules={[{ required: true, min: 2, max: 120 }]}>
                    <Input maxLength={120} autoComplete="off" />
                  </Form.Item>
                  <Form.Item name={["guardianInfo", "relationship"]} label="Quan hệ với học sinh" rules={[{ required: true }]}>
                    <Select
                      options={[
                        ["FATHER", "Cha"], ["MOTHER", "Mẹ"], ["GRANDPARENT", "Ông/Bà"],
                        ["SIBLING", "Anh/Chị/Em"], ["LEGAL_GUARDIAN", "Người giám hộ hợp pháp"], ["OTHER", "Khác"],
                      ].map(([value, label]) => ({ value, label }))}
                    />
                  </Form.Item>
                  <Form.Item name={["guardianInfo", "phone"]} label="Số điện thoại" rules={[{ required: true, min: 8, max: 20 }]}>
                    <Input autoComplete="off" inputMode="tel" maxLength={20} />
                  </Form.Item>
                  <Form.Item name={["guardianInfo", "email"]} label="Email (không bắt buộc)" rules={[{ type: "email" }]}>
                    <Input autoComplete="off" maxLength={160} />
                  </Form.Item>
                  <Form.Item name={["guardianInfo", "occupation"]} label="Nghề nghiệp (không bắt buộc)">
                    <Input maxLength={120} />
                  </Form.Item>
                  <Form.Item name={["guardianInfo", "nationalIdLast4"]} label="4 số cuối giấy tờ (không bắt buộc)" rules={[{ pattern: /^\d{4}$/, message: "Nhập đúng 4 chữ số." }]}>
                    <Input inputMode="numeric" maxLength={4} autoComplete="off" />
                  </Form.Item>
                  <Form.Item name={["guardianInfo", "householdCircumstance"]} label="Hoàn cảnh gia đình (không bắt buộc)" className="md:col-span-2">
                    <TextArea rows={2} maxLength={1000} />
                  </Form.Item>

                  <div className="md:col-span-2 text-sm font-bold text-slate-800 mb-2 mt-2">Thông tin trường học</div>
                  <Form.Item name={["schoolInfo", "schoolName"]} label="Tên trường" rules={[{ required: true, min: 2, max: 200 }]}>
                    <Input maxLength={200} />
                  </Form.Item>
                  <Form.Item name={["schoolInfo", "gradeLevel"]} label="Cấp lớp" rules={[{ required: true }]}>
                    <Select
                      options={[
                        { value: "PRE_PRIMARY", label: "Mầm non" },
                        ...Array.from({ length: 12 }, (_, index) => ({ value: `GRADE_${index + 1}`, label: `Lớp ${index + 1}` })),
                        { value: "UNIVERSITY", label: "Đại học" },
                        { value: "COLLEGE", label: "Cao đẳng" },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name={["schoolInfo", "className"]} label="Lớp" rules={[{ required: true, max: 50 }]}>
                    <Input maxLength={50} />
                  </Form.Item>
                  <Form.Item name={["schoolInfo", "studentCode"]} label="Mã học sinh (không bắt buộc)">
                    <Input maxLength={50} />
                  </Form.Item>
                  <Form.Item name={["schoolInfo", "academicYear"]} label="Năm học (không bắt buộc)">
                    <Input maxLength={30} placeholder="Ví dụ: 2026-2027" />
                  </Form.Item>
                  <Form.Item name={["schoolInfo", "province"]} label="Tỉnh/Thành phố (không bắt buộc)">
                    <Input maxLength={100} />
                  </Form.Item>
                </div>
              )}

              {currentStep === 1 && (
                <div className="space-y-4">
                  <Form.Item name="submissionMode" label="Hình thức nộp hồ sơ" rules={[{ required: true }]}>
                    <Select options={modeOptions} />
                  </Form.Item>
                  {currentMode !== "ONLINE" && (
                    <Alert
                      type="info"
                      showIcon
                      message="Hồ sơ giấy cần được Admin tiếp nhận và đối chiếu"
                      description="Hãy lưu bản nháp sau khi tạo hồ sơ để Admin liên kết biên nhận. Các mục giấy bắt buộc phải được đối chiếu trước khi hồ sơ có thể gửi hoàn chỉnh."
                    />
                  )}
                  <Form.Item
                    name="statement"
                    label="Hoàn cảnh, thành tích và mục tiêu học tập"
                    rules={[{ required: true, whitespace: true }, { min: 30, message: "Vui lòng viết tối thiểu 30 ký tự." }, { max: 3000 }]}
                  >
                    <TextArea rows={5} showCount maxLength={3000} placeholder="Trình bày hoàn cảnh, thành tích học tập và mục tiêu khi nhận học bổng..." />
                  </Form.Item>

                  <div className="space-y-2">
                    <div className="font-semibold text-sm">Tài liệu minh chứng</div>
                    {checklist.length > 0 ? checklist.map((item: ScholarshipChecklistItem) => (
                      <div key={item.code} className="rounded-xl border border-slate-200 p-3">
                        <div className="font-medium text-sm">{item.title} <Tag>{item.acceptedMode}</Tag></div>
                        {item.description && <div className="text-xs text-slate-500 mb-2">{item.description}</div>}
                        {(currentMode === "ONLINE" || currentMode === "HYBRID") && ["ONLINE", "EITHER", "BOTH"].includes(item.acceptedMode) &&
                          renderUpload(item.code, item.title, item.description, item.maxFiles)}
                      </div>
                    )) : (currentMode === "ONLINE" || currentMode === "HYBRID") && renderUpload("__GENERAL__", "Tài liệu minh chứng")}
                    {existingDocuments.length > 0 && (
                      <Alert
                        type="success"
                        showIcon
                        message={`Đã lưu ${existingDocuments.length} nhóm tài liệu`}
                        description={existingDocuments.map((doc) => `${doc.title || doc.checklistItemCode || doc.documentType} (${doc.files.length} tệp)`).join(" · ")}
                      />
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
                    <div><strong>Người giám hộ:</strong> {form.getFieldValue(["guardianInfo", "fullName"]) || "—"}</div>
                    <div><strong>Trường/Lớp:</strong> {form.getFieldValue(["schoolInfo", "schoolName"]) || "—"} / {form.getFieldValue(["schoolInfo", "className"]) || "—"}</div>
                    <div><strong>Hình thức:</strong> {modeOptions.find((option) => option.value === currentMode)?.label}</div>
                    <div><strong>Thư nguyện vọng:</strong><p className="whitespace-pre-wrap text-slate-600">{form.getFieldValue("statement") || "—"}</p></div>
                    <div><strong>Tài liệu đã lưu:</strong> {existingDocuments.length} nhóm; <strong>tệp mới:</strong> {Object.values(fileLists).reduce((sum, list) => sum + list.length, 0)}</div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100 mt-4">
                <div className="text-xs text-slate-500">{progressText}</div>
                <div className="flex gap-2">
                  <Button onClick={handleModalClose} disabled={isSubmitting}>Đóng</Button>
                  {currentStep > 0 && <Button onClick={() => setCurrentStep((step) => step - 1)} disabled={isSubmitting}>Quay lại</Button>}
                  {checklistQuery.data?.dossierPolicy.allowDraftSave !== false && (
                    <Button onClick={() => void handleSaveDraft()} loading={isSubmitting} disabled={checklistQuery.isLoading || Boolean(draftId && draftQuery.isLoading)}>
                      Lưu nháp
                    </Button>
                  )}
                  {currentStep < 2 ? (
                    <Button type="primary" onClick={() => void handleStepForward()} disabled={checklistQuery.isLoading || checklistQuery.isError}>
                      Tiếp tục
                    </Button>
                  ) : (
                    <Button
                      type="primary"
                      onClick={() => void handleSubmit()}
                      loading={isSubmitting}
                      disabled={checklistQuery.isLoading || checklistQuery.isError || draftQuery.isLoading || draftQuery.isError}
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
    </Modal>
  );
}
