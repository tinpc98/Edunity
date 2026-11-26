import { useState } from 'react';
import { 
  Typography, 
  Breadcrumb, 
  Button, 
  Card, 
  Row, 
  Col, 
  Avatar, 
  Tag, 
  Form, 
  Input, 
  message, 
  Modal, 
  Skeleton, 
  Alert,
  Select,
  Switch,
  Divider,
  Steps,
} from 'antd';
import { 
  CheckCircleOutlined,
  CloseCircleOutlined,
  PhoneOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  AuditOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  InboxOutlined,
  UserOutlined,
  LinkOutlined,
  FileDoneOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ROUTES } from '../../../routes/routePaths';
import {
  scholarshipApplicationService,
  scholarshipApplicationKeys,
} from '../../../services/scholarshipApplication.service';
import type { PaperDossierReceipt } from '../../../types/scholarship';
import {
  SCHOLARSHIP_APP_STATUS_LABELS,
  SCHOLARSHIP_APP_STATUS_COLORS,
} from '../../../types/scholarship';
import { formatVND } from '../../../types/payment';
import PrivateDocumentCard from '../../../components/common/PrivateDocumentCard';
import { getFriendlyErrorMessage } from '../../../utils/apiErrorMap';
import { IntakePaperDossierModal } from './components/IntakePaperDossierModal';

const { Title, Paragraph, Text } = Typography;
const { TextArea } = Input;

export const GUARDIAN_RELATIONSHIP_LABELS: Record<string, string> = {
  FATHER: 'Cha / Bố',
  MOTHER: 'Mẹ',
  GUARDIAN: 'Người giám hộ hợp pháp',
  LEGAL_GUARDIAN: 'Người giám hộ hợp pháp',
  GRANDPARENT: 'Ông / Bà',
  SIBLING: 'Anh / Chị / Em',
  OTHER: 'Khác',
};

export const GRADE_LEVEL_LABELS: Record<string, string> = {
  GRADE_1: 'Lớp 1',
  GRADE_2: 'Lớp 2',
  GRADE_3: 'Lớp 3',
  GRADE_4: 'Lớp 4',
  GRADE_5: 'Lớp 5',
  GRADE_6: 'Lớp 6',
  GRADE_7: 'Lớp 7',
  GRADE_8: 'Lớp 8',
  GRADE_9: 'Lớp 9',
  GRADE_10: 'Lớp 10',
  GRADE_11: 'Lớp 11',
  GRADE_12: 'Lớp 12',
  UNIVERSITY: 'Đại học / Cao đẳng / Học nghề',
};

export const SCORE_STATUS_CONFIG: Record<string, { label: string; color: string; desc: string }> = {
  UNSCORED: { label: 'Chưa chấm điểm', color: 'default', desc: 'Hồ sơ chưa được hệ thống hoặc admin chấm điểm ưu tiên.' },
  AUTOMATIC: { label: 'Điểm tự động', color: 'processing', desc: 'Điểm ưu tiên được tính tự động từ thông tin khai báo của học sinh.' },
  VERIFIED: { label: 'Điểm đã xác minh', color: 'success', desc: 'Điểm ưu tiên dựa trên các minh chứng bắt buộc đã được Admin kiểm tra duyệt hợp lệ.' },
  ADJUSTED: { label: 'Điểm điều chỉnh', color: 'purple', desc: 'Điểm ưu tiên đã qua bước sơ duyệt (screening) và được Admin điều chỉnh/xác nhận.' },
  OFFICIAL: { label: 'Điểm chính thức', color: 'gold', desc: 'Điểm ưu tiên chính thức khi quyết định phê duyệt cấp học bổng được ban hành.' },
};

export default function ScholarshipApplicationReviewPage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isIntakeModalOpen, setIsIntakeModalOpen] = useState(false);
  const [isRequestInfoModalOpen, setIsRequestInfoModalOpen] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [isScreenModalOpen, setIsScreenModalOpen] = useState(false);
  const [isAssignVerifierModalOpen, setIsAssignVerifierModalOpen] = useState(false);
  const [isReconcileModalOpen, setIsReconcileModalOpen] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<PaperDossierReceipt | null>(null);

  const [approveForm] = Form.useForm();
  const [requestInfoForm] = Form.useForm();
  const [rejectForm] = Form.useForm();
  const [screenForm] = Form.useForm();
  const [assignVerifierForm] = Form.useForm();
  const [reconcileForm] = Form.useForm();
  const [linkForm] = Form.useForm();

  // Fetch application detail from real API
  const { data: app, isLoading, isError } = useQuery({
    queryKey: scholarshipApplicationKeys.detail(applicationId || ''),
    queryFn: () => (applicationId ? scholarshipApplicationService.adminGetApplication(applicationId) : null),
    enabled: Boolean(applicationId),
  });

  // Fetch verifiers list for assignment
  const { data: verifiersList } = useQuery({
    queryKey: ['adminVerifiers'],
    queryFn: () => scholarshipApplicationService.adminListVerifiers(),
    enabled: isAssignVerifierModalOpen,
  });

  // Approve Mutation
  const approveMutation = useMutation({
    mutationFn: (reviewNote?: string) => {
      if (!applicationId) throw new Error('ID không hợp lệ');
      return scholarshipApplicationService.adminApprove(applicationId, { reviewNote });
    },
    onSuccess: () => {
      message.success('Đã phê duyệt hồ sơ học bổng thành công! Học bổng đã được cấp phát.');
      setIsApproveModalOpen(false);
      approveForm.resetFields();
      queryClient.invalidateQueries({ queryKey: scholarshipApplicationKeys.all });
    },
    onError: (err: any) => {
      message.error(getFriendlyErrorMessage(err, 'Phê duyệt thất bại. Vui lòng kiểm tra phân tách trách nhiệm hoặc trạng thái xác minh.'));
    },
  });

  // Screening Mutation (Layer 1 + Layer 2)
  const screenMutation = useMutation({
    mutationFn: (values: { layer1Passed: boolean; notes?: string }) => {
      if (!applicationId) throw new Error('ID không hợp lệ');
      return scholarshipApplicationService.adminScreenApplication(applicationId, values);
    },
    onSuccess: () => {
      message.success('Đã hoàn tất sơ duyệt hồ sơ.');
      setIsScreenModalOpen(false);
      screenForm.resetFields();
      queryClient.invalidateQueries({ queryKey: scholarshipApplicationKeys.all });
    },
    onError: (err: any) => {
      message.error(getFriendlyErrorMessage(err, 'Sơ duyệt thất bại.'));
    },
  });

  // Assign Verifier Mutation
  const assignVerifierMutation = useMutation({
    mutationFn: (values: { verifierId: string; note?: string }) => {
      if (!applicationId) throw new Error('ID không hợp lệ');
      return scholarshipApplicationService.adminAssignVerifier(applicationId, values);
    },
    onSuccess: () => {
      message.success('Đã phân công Người xác minh độc lập thành công.');
      setIsAssignVerifierModalOpen(false);
      assignVerifierForm.resetFields();
      queryClient.invalidateQueries({ queryKey: scholarshipApplicationKeys.all });
    },
    onError: (err: any) => {
      message.error(getFriendlyErrorMessage(err, 'Phân công xác minh thất bại.'));
    },
  });

  // Reconcile Paper Dossier Receipt Mutation
  const reconcileMutation = useMutation({
    mutationFn: (values: {
      status: 'IN_RECONCILIATION' | 'DISCREPANCY' | 'RECONCILED';
      reconciliationNote?: string;
      discrepancyReason?: string;
    }) => {
      if (!selectedReceipt?._id && !selectedReceipt?.id) throw new Error('Biên nhận không hợp lệ');
      const receiptId = (selectedReceipt._id || selectedReceipt.id)!;
      return scholarshipApplicationService.adminReconcilePaperDossier(receiptId, values);
    },
    onSuccess: () => {
      message.success('Đã cập nhật trạng thái đối chiếu hồ sơ giấy.');
      setIsReconcileModalOpen(false);
      reconcileForm.resetFields();
      setSelectedReceipt(null);
      queryClient.invalidateQueries({ queryKey: scholarshipApplicationKeys.all });
    },
    onError: (err: any) => {
      message.error(getFriendlyErrorMessage(err, 'Đối chiếu thất bại.'));
    },
  });

  // Link Paper Receipt to Application Mutation
  const linkReceiptMutation = useMutation({
    mutationFn: (receiptIdOrCode: string) => {
      return scholarshipApplicationService.adminLinkPaperDossier(receiptIdOrCode, {
        applicationId: applicationId,
        applicationCode: app?.applicationCode || undefined,
      });
    },
    onSuccess: () => {
      message.success('Đã liên kết biên nhận giấy với hồ sơ thành công.');
      setIsLinkModalOpen(false);
      linkForm.resetFields();
      queryClient.invalidateQueries({ queryKey: scholarshipApplicationKeys.all });
    },
    onError: (err: any) => {
      message.error(getFriendlyErrorMessage(err, 'Liên kết biên nhận thất bại. Kiểm tra mã biên nhận.'));
    },
  });

  // Request Information Mutation
  const requestInfoMutation = useMutation({
    mutationFn: (reviewNote: string) => {
      if (!applicationId) throw new Error('ID không hợp lệ');
      return scholarshipApplicationService.adminRequestInformation(applicationId, reviewNote);
    },
    onSuccess: () => {
      message.warning('Đã gửi yêu cầu bổ sung hồ sơ tới học sinh.');
      setIsRequestInfoModalOpen(false);
      requestInfoForm.resetFields();
      queryClient.invalidateQueries({ queryKey: scholarshipApplicationKeys.all });
    },
    onError: (err: any) => {
      message.error(getFriendlyErrorMessage(err, 'Không thể gửi yêu cầu bổ sung.'));
    },
  });

  // Reject Mutation
  const rejectMutation = useMutation({
    mutationFn: (reviewNote?: string) => {
      if (!applicationId) throw new Error('ID không hợp lệ');
      return scholarshipApplicationService.adminReject(applicationId, { reviewNote });
    },
    onSuccess: () => {
      message.error('Đã từ chối hồ sơ học bổng.');
      setIsRejectModalOpen(false);
      rejectForm.resetFields();
      queryClient.invalidateQueries({ queryKey: scholarshipApplicationKeys.all });
    },
    onError: (err: any) => {
      message.error(getFriendlyErrorMessage(err, 'Từ chối hồ sơ thất bại.'));
    },
  });

  const handleApproveSubmit = async () => {
    const values = await approveForm.validateFields();
    approveMutation.mutate(values.reviewNote);
  };

  const handleScreenSubmit = async () => {
    const values = await screenForm.validateFields();
    screenMutation.mutate(values);
  };

  const handleAssignVerifierSubmit = async () => {
    const values = await assignVerifierForm.validateFields();
    assignVerifierMutation.mutate(values);
  };

  const handleReconcileSubmit = async () => {
    const values = await reconcileForm.validateFields();
    reconcileMutation.mutate(values);
  };

  const handleLinkReceiptSubmit = async () => {
    const values = await linkForm.validateFields();
    linkReceiptMutation.mutate(values.receiptIdOrCode);
  };

  const handleRequestInfoSubmit = async () => {
    const values = await requestInfoForm.validateFields();
    requestInfoMutation.mutate(values.reviewNote);
  };

  const handleRejectSubmit = async () => {
    const values = await rejectForm.validateFields();
    rejectMutation.mutate(values.reviewNote);
  };

  const [reviewingDocId, setReviewingDocId] = useState<string | null>(null);

  const handleReviewDocument = async (documentId: string, status: 'APPROVED' | 'REJECTED', reviewNote?: string) => {
    if (!applicationId) return;
    try {
      setReviewingDocId(documentId);
      await scholarshipApplicationService.adminReviewDocument(applicationId, documentId, {
        status,
        reviewNote: reviewNote || (status === 'APPROVED' ? 'Minh chứng hợp lệ' : 'Minh chứng không hợp lệ'),
      });
      message.success(status === 'APPROVED' ? 'Đã xác nhận minh chứng hợp lệ' : 'Đã từ chối minh chứng');
      queryClient.invalidateQueries({ queryKey: scholarshipApplicationKeys.detail(applicationId) });
      queryClient.invalidateQueries({ queryKey: scholarshipApplicationKeys.adminList() });
    } catch (err: any) {
      message.error(err.message || 'Thao tác kiểm tra minh chứng thất bại');
    } finally {
      setReviewingDocId(null);
    }
  };

  const handlePromptRejectDocument = (documentId: string) => {
    let noteValue = '';
    Modal.confirm({
      title: 'Từ chối minh chứng',
      content: (
        <div className="mt-2">
          <Input.TextArea
            rows={3}
            placeholder="Nhập lý do từ chối minh chứng (bắt buộc)..."
            onChange={(e) => { noteValue = e.target.value; }}
          />
        </div>
      ),
      okText: 'Xác nhận từ chối',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: () => {
        if (!noteValue.trim()) {
          message.warning('Vui lòng nhập lý do từ chối');
          return Promise.reject();
        }
        return handleReviewDocument(documentId, 'REJECTED', noteValue.trim());
      },
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (isError || !app) {
    return (
      <div className="p-6">
        <Alert
          type="error"
          showIcon
          message="Không tìm thấy hồ sơ"
          description="Hồ sơ không tồn tại hoặc bạn không có quyền truy cập."
          action={
            <Button onClick={() => navigate(ROUTES.ADMIN.SCHOLARSHIP_APPLICATIONS)}>
              Quay lại danh sách
            </Button>
          }
        />
      </div>
    );
  }

  // Theo nghiệp vụ mới: Mọi Admin đang hoạt động đều có quyền phê duyệt hồ sơ đủ điều kiện
  const isDossierVerified = app.status === 'DOSSIER_VERIFIED';
  const isSubmitted = app.status === 'SUBMITTED';

  // Kiểm tra minh chứng bắt buộc theo đúng quy tắc "Đủ hồ sơ"
  const checklist = app.campaign?.documentChecklist || [];
  const mandatoryCodes = new Set(
    checklist
      .filter((item) => item.required !== false)
      .map((item) => String(item.code).toUpperCase())
  );

  const hasPendingOrMissingMandatory =
    mandatoryCodes.size > 0 &&
    Array.from(mandatoryCodes).some((code) => {
      const docsForCode = (app.documents || []).filter(
        (d) => d.checklistItemCode && String(d.checklistItemCode).toUpperCase() === code
      );
      return !docsForCode.some((d) => d.status === 'APPROVED');
    });

  const isPaperRequired =
    app.submissionMode === 'HYBRID' ||
    app.submissionMode === 'PAPER' ||
    (app.campaign?.documentChecklist || []).some(
      (it) => it.required && ['PAPER', 'BOTH'].includes(it.acceptedMode),
    );
  const validPaperReceipt = (app.paperReceipts || []).find(
    (r) =>
      (r.status === 'RECEIVED' || r.status === 'RECONCILED') &&
      Boolean(r.proofStorageKey || (Array.isArray(r.proofPhotos) && r.proofPhotos.length > 0) || r.proofUrl),
  );
  const paperDossierReady = !isPaperRequired || Boolean(validPaperReceipt);

  const canApprove =
    (isDossierVerified || isSubmitted) &&
    !hasPendingOrMissingMandatory &&
    paperDossierReady &&
    app.screeningResult?.layer1Passed !== false;
  const studentDisplayName = app.applicantInfo?.fullName || app.student?.fullName || app.studentName || app.studentEmail || 'Học viên';
  const activePriorityCriteria = (app.campaign?.priorityCriteria || []).filter((criterion) => criterion.enabled !== false);

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      <Breadcrumb 
        className="mb-2 text-sm font-medium"
        items={[
          { title: <Link to={ROUTES.ADMIN.HOME}>Tổng quan</Link> },
          { title: <Link to={ROUTES.ADMIN.SCHOLARSHIP_APPLICATIONS}>Hồ sơ học bổng</Link> },
          { title: app.applicationCode || app.id },
        ]}
      />

      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <Title level={3} className="!m-0 text-gray-900 mb-1">
            Xét duyệt hồ sơ học bổng – {studentDisplayName}
          </Title>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <Tag 
              color={SCHOLARSHIP_APP_STATUS_COLORS[app.status]} 
              className="!m-0 rounded font-bold uppercase"
            >
              {SCHOLARSHIP_APP_STATUS_LABELS[app.status]}
            </Tag>
            {app.applicationCode && (
              <Tag color="blue" className="!m-0 rounded font-semibold">
                Mã hồ sơ: {app.applicationCode}
              </Tag>
            )}
            <Tag color="cyan" className="!m-0 rounded font-semibold">
              Hình thức: {app.submissionMode || 'ONLINE'}
            </Tag>
            <span className="text-gray-500 font-medium text-xs flex items-center gap-1">
              <ClockCircleOutlined /> Nộp ngày {app.submittedAt ? new Date(app.submittedAt).toLocaleDateString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              }) : "—"}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            className="rounded-lg font-medium" 
            onClick={() => navigate(ROUTES.ADMIN.SCHOLARSHIP_APPLICATIONS)}
          >
            Quay lại danh sách
          </Button>
        </div>
      </div>

      {/* Workflow Steps Card */}
      <Card className="rounded-2xl shadow-sm border-gray-100 bg-white">
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
          Quy trình Thẩm định 4 Mắt (Intake → Screening → Verification → Approval)
        </div>
        <Steps
          size="small"
          current={
            app.status === 'APPROVED' ? 4 :
            app.status === 'DOSSIER_VERIFIED' ? 3 :
            app.assignedVerifierId ? 2 :
            app.screenedBy ? 1 : 0
          }
          items={[
            {
              title: 'Tiếp nhận (Intake)',
              description: app.intakeAdminId ? `Admin #${String(app.intakeAdminId).slice(-4)}` : 'Hệ thống',
            },
            {
              title: 'Sơ duyệt (Screening)',
              description: app.screenedBy ? `Điểm ƯT: ${app.screeningResult?.layer2Score ?? '—'}` : 'Chờ sơ duyệt',
            },
            {
              title: 'Xác minh (Verifier)',
              description: app.assignedVerifierId 
                ? (app.verifierResult?.verifiedBy ? 'Xác minh đạt' : 'Đang xác minh')
                : 'Chưa phân công',
            },
            {
              title: 'Phê duyệt cấp (Approver)',
              description: app.reviewedBy ? `Admin #${String(app.reviewedBy).slice(-4)}` : 'Chờ quyết định',
            },
          ]}
        />
      </Card>

      <Row gutter={[24, 24]}>
        {/* LEFT COLUMN - CONTENT & PAPER DOSSIER */}
        <Col xs={24} lg={16} className="flex flex-col gap-6">
          {/* Student Profile Card */}
          <Card className="rounded-2xl shadow-sm border-gray-100">
            <div className="flex items-start gap-4 mb-6">
              <Avatar size={64} className="bg-teal-50 text-teal-800 border-2 border-teal-200 text-2xl font-bold shrink-0">
                {studentDisplayName.substring(0, 2).toUpperCase()}
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Title level={4} className="!m-0 text-gray-900">{studentDisplayName}</Title>
                  <Tag color="cyan" className="rounded-full border-0 !m-0 text-xs">Học sinh</Tag>
                </div>
                <div className="text-xs text-gray-500 font-medium">
                  {app.schoolInfo?.schoolName ? `${app.schoolInfo.schoolName} • ` : app.student?.school ? `${app.student.school} • ` : ''}
                  {app.schoolInfo?.gradeLevel ? `${GRADE_LEVEL_LABELS[app.schoolInfo.gradeLevel] || `Khối ${app.schoolInfo.gradeLevel}`} • ` : app.student?.grade ? `${GRADE_LEVEL_LABELS[app.student.grade] || `Khối ${app.student.grade}`} • ` : ''}
                  {app.schoolInfo?.province ? `${app.schoolInfo.province}` : ''}
                </div>
              </div>
            </div>

            <Row gutter={[24, 16]}>
              {app.applicantInfo?.fullName && (
                <Col span={12}>
                  <div className="text-gray-400 text-xs font-bold uppercase mb-1">Người nộp hồ sơ</div>
                  <div className="font-medium text-gray-900 text-sm">{app.applicantInfo.fullName}</div>
                </Col>
              )}
              {app.studentCccd && (
                <Col span={12}>
                  <div className="text-gray-400 text-xs font-bold uppercase mb-1">CCCD người nộp</div>
                  <div className="font-medium text-gray-900 text-sm font-mono">{app.studentCccd}</div>
                </Col>
              )}
              <Col span={12}>
                <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase mb-1">
                  <MailOutlined /> Email người nộp
                </div>
                <div className="font-medium text-gray-900 text-sm">{app.applicantInfo?.email || app.student?.email || app.studentEmail || '—'}</div>
              </Col>
              <Col span={12}>
                <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase mb-1">
                  <PhoneOutlined /> Số điện thoại người nộp
                </div>
                <div className="font-medium text-gray-900 text-sm">{app.applicantInfo?.phone || app.student?.phoneNumber || '—'}</div>
              </Col>
              {app.applicantInfo?.permanentAddress && (
                <Col span={24}>
                  <div className="text-gray-400 text-xs font-bold uppercase mb-1">Hộ khẩu thường trú</div>
                  <div className="font-medium text-gray-900 text-sm">{app.applicantInfo.permanentAddress}</div>
                </Col>
              )}
              {app.guardianInfo && (
                <>
                  <Col span={12}>
                    <div className="text-gray-400 text-xs font-bold uppercase mb-1">
                      Phụ huynh / Người giám hộ
                    </div>
                    <div className="font-medium text-gray-900 text-sm">
                      {app.guardianInfo.fullName || '—'}{' '}
                      <span className="text-gray-500 font-normal">
                        ({GUARDIAN_RELATIONSHIP_LABELS[app.guardianInfo.relationship] || app.guardianInfo.relationship || 'Người giám hộ'})
                      </span>
                    </div>
                  </Col>
                  <Col span={12}>
                    <div className="text-gray-400 text-xs font-bold uppercase mb-1">
                      CCCD Phụ huynh
                    </div>
                    <div className="font-medium text-gray-900 text-sm font-mono">
                      {app.guardianInfo.cccd ||
                        (app.guardianInfo.nationalIdLast4
                          ? `••••••••${app.guardianInfo.nationalIdLast4}`
                          : '—')}
                    </div>
                  </Col>
                </>
              )}
            </Row>
            {app.schoolInfo && (
              <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-400">Năm học:</span> <strong>{app.schoolInfo.academicYear || '—'}</strong></div>
                <div><span className="text-slate-400">Địa chỉ trường:</span> <strong>{[app.schoolInfo.district, app.schoolInfo.province].filter(Boolean).join(', ') || '—'}</strong></div>
                <div><span className="text-slate-400">Ban giám hiệu:</span> <strong>{app.schoolInfo.principalName || '—'} {app.schoolInfo.principalTitle ? `(${app.schoolInfo.principalTitle})` : ''}</strong></div>
                <div><span className="text-slate-400">Giáo viên chủ nhiệm:</span> <strong>{app.schoolInfo.homeroomTeacherName || '—'} · {app.schoolInfo.homeroomTeacherPhone || '—'}</strong></div>
                {app.isDisadvantaged && (
                  <div className="sm:col-span-2"><span className="text-slate-400">Diện khó khăn:</span> <strong>{(app.hardshipCategories || []).map((item) => ({ POOR_HOUSEHOLD: 'Hộ nghèo', NEAR_POOR_HOUSEHOLD: 'Hộ cận nghèo', REMOTE_AREA: 'Vùng sâu, vùng xa', ORPHANED: 'Mồ côi cha mẹ' }[item] || item)).join(', ')}</strong></div>
                )}
              </div>
            )}
          </Card>

          {/* Card Tiếp nhận và đối chiếu hồ sơ */}
          <Card
            className="rounded-2xl shadow-sm border-gray-100"
            title={
              <span className="font-bold flex items-center gap-2 text-slate-800">
                <InboxOutlined className="text-teal-700 text-lg" /> Tiếp nhận và đối chiếu hồ sơ
              </span>
            }
            extra={
              <div className="flex items-center gap-2">
                <Button
                  type="primary"
                  size="small"
                  icon={<InboxOutlined />}
                  onClick={() => setIsIntakeModalOpen(true)}
                  className="rounded-lg text-xs font-semibold bg-teal-700 hover:bg-teal-800"
                >
                  Tiếp nhận hồ sơ giấy
                </Button>
                <Button
                  size="small"
                  icon={<LinkOutlined />}
                  onClick={() => setIsLinkModalOpen(true)}
                  className="rounded-lg text-xs font-semibold"
                >
                  Liên kết mã biên nhận
                </Button>
              </div>
            }
          >
            {/* Hai cột trạng thái song song */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              {/* Cột 1: Trạng thái hồ sơ trực tuyến */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Trạng thái hồ sơ trực tuyến
                </div>
                <div className="flex items-center gap-2">
                  {hasPendingOrMissingMandatory ? (
                    <Tag color="volcano" className="font-bold text-xs uppercase px-2 py-0.5 rounded-md !m-0">
                      Chờ kiểm tra / Cần bổ sung
                    </Tag>
                  ) : (
                    <Tag color="green" icon={<CheckCircleOutlined />} className="font-bold text-xs uppercase px-2 py-0.5 rounded-md !m-0">
                      Đủ minh chứng hợp lệ
                    </Tag>
                  )}
                </div>
                <div className="text-xs text-slate-500">
                  {hasPendingOrMissingMandatory
                    ? 'Còn minh chứng bắt buộc chưa được duyệt hợp lệ hoặc chưa tải lên.'
                    : 'Tất cả minh chứng bắt buộc đã được Admin kiểm tra và duyệt hợp lệ.'}
                </div>
              </div>

              {/* Cột 2: Trạng thái hồ sơ giấy */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Trạng thái hồ sơ giấy (Bản cứng)
                </div>
                <div className="flex items-center gap-2">
                  {(() => {
                    const latestReceipt = app.paperReceipts && app.paperReceipts.length > 0 ? app.paperReceipts[0] : null;
                    if (latestReceipt?.status === 'RECONCILED') {
                      return <Tag color="green" icon={<CheckCircleOutlined />} className="font-bold text-xs uppercase px-2 py-0.5 rounded-md !m-0">Đã đối chiếu khớp hoàn toàn</Tag>;
                    }
                    if (latestReceipt?.status === 'DISCREPANCY') {
                      return <Tag color="red" icon={<CloseCircleOutlined />} className="font-bold text-xs uppercase px-2 py-0.5 rounded-md !m-0">Có sai lệch hồ sơ giấy</Tag>;
                    }
                    if (latestReceipt?.status === 'RECEIVED' || latestReceipt?.status === 'IN_RECONCILIATION') {
                      return <Tag color="blue" icon={<InboxOutlined />} className="font-bold text-xs uppercase px-2 py-0.5 rounded-md !m-0">Đã tiếp nhận hồ sơ giấy</Tag>;
                    }
                    if (app.paperDispatch?.declaredSent) {
                      return <Tag color="cyan" icon={<ClockCircleOutlined />} className="font-bold text-xs uppercase px-2 py-0.5 rounded-md !m-0">Đã gửi (Chờ bưu điện)</Tag>;
                    }
                    if (isPaperRequired) {
                      return <Tag color="default" className="font-bold text-xs uppercase px-2 py-0.5 rounded-md !m-0">Chưa gửi hồ sơ giấy</Tag>;
                    }
                    return <Tag color="default" className="text-xs !m-0">Không bắt buộc (Nộp trực tuyến)</Tag>;
                  })()}
                </div>
                <div className="text-xs text-slate-500">
                  {(() => {
                    const latestReceipt = app.paperReceipts && app.paperReceipts.length > 0 ? app.paperReceipts[0] : null;
                    if (latestReceipt?.status === 'RECONCILED') {
                      return `Đã đối chiếu khớp ${latestReceipt.reconciledItems?.length || 0} mục giấy tờ bàn giao.`;
                    }
                    if (latestReceipt?.status === 'DISCREPANCY') {
                      return latestReceipt.discrepancyReason || 'Phát hiện sai lệch giữa hồ sơ bản cứng và hồ sơ trực tuyến.';
                    }
                    if (latestReceipt?.status === 'RECEIVED' || latestReceipt?.status === 'IN_RECONCILIATION') {
                      return 'Admin đã ghi nhận bưu phẩm vào kho. Cần đối chiếu bản cứng trước khi phê duyệt.';
                    }
                    if (app.paperDispatch?.declaredSent) {
                      return `Học sinh đã gửi qua ${app.paperDispatch.carrier || 'đơn vị vận chuyển'} (${app.paperDispatch.trackingNumber ? `Mã VĐ: ${app.paperDispatch.trackingNumber}` : 'không có mã'}). Đang chờ nhận bì thư.`;
                    }
                    if (isPaperRequired) {
                      return 'Hồ sơ kết hợp/giấy bắt buộc phải có biên nhận tiếp nhận hồ sơ giấy kèm ảnh chụp bưu phẩm.';
                    }
                    return 'Hồ sơ đăng ký theo hình thức trực tuyến hoàn toàn.';
                  })()}
                </div>
              </div>
            </div>

            {/* Thông tin khai báo gửi từ học sinh */}
            {app.paperDispatch?.declaredSent && (
              <div className="mb-5 p-4 rounded-xl border border-cyan-200 bg-cyan-50/40 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">Học sinh khai báo gửi hồ sơ</span>
                    <Tag color="cyan" className="font-semibold text-xs !m-0">
                      {app.paperDispatch.carrier || 'Đơn vị vận chuyển'}
                    </Tag>
                  </div>
                  {app.paperDispatch.sentAt && (
                    <span className="text-xs text-slate-500">
                      Gửi ngày: {new Date(app.paperDispatch.sentAt).toLocaleDateString('vi-VN')}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                  <div><strong>Mã vận đơn:</strong> {app.paperDispatch.trackingNumber || 'Không có'}</div>
                  {app.paperDispatch.proofUrl && (
                    <a href={app.paperDispatch.proofUrl} target="_blank" rel="noreferrer">
                      <Button size="small" type="link" icon={<LinkOutlined />} className="p-0 h-auto text-xs text-cyan-700">
                        Xem ảnh vận đơn / bưu phẩm học sinh gửi
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Danh sách biên nhận hồ sơ giấy của Admin */}
            <div className="space-y-4">
              <div className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between">
                <span>Biên nhận tiếp nhận tại văn phòng ({app.paperReceipts?.length || 0})</span>
              </div>

              {!app.paperReceipts || app.paperReceipts.length === 0 ? (
                <div className="text-xs text-slate-400 text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  Chưa có biên nhận hồ sơ giấy nào được ghi nhận cho hồ sơ này.
                  <div className="mt-2 text-slate-500">
                    Khi bưu phẩm tới văn phòng, vui lòng bấm nút "Tiếp nhận hồ sơ giấy" ở góc trên để lập biên nhận và tải ảnh minh chứng tiếp nhận.
                  </div>
                </div>
              ) : (
                app.paperReceipts.map((receipt, idx) => (
                  <div key={receipt._id || receipt.id || idx} className="p-4 rounded-xl border border-slate-200 bg-white space-y-3 shadow-2xs">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{receipt.receiptCode}</span>
                        <Tag color={receipt.status === 'RECONCILED' ? 'green' : receipt.status === 'DISCREPANCY' ? 'red' : 'blue'}>
                          {receipt.status === 'RECONCILED' ? 'ĐÃ ĐỐI CHIẾU KHỚP' : receipt.status === 'DISCREPANCY' ? 'CÓ SAI LỆCH' : 'ĐÃ TIẾP NHẬN'}
                        </Tag>
                      </div>
                      <div className="text-xs text-slate-500">
                        Tiếp nhận ngày {receipt.receivedAt ? new Date(receipt.receivedAt).toLocaleDateString('vi-VN') : '—'}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <div>
                        <strong>Hình thức / Đơn vị:</strong> {receipt.postalInfo?.carrierName || 'Trực tiếp'}
                      </div>
                      <div>
                        <strong>Mã vận đơn:</strong> {receipt.postalInfo?.trackingNumber || 'Không có'}
                      </div>
                      <div>
                        <strong>Người gửi:</strong> {receipt.postalInfo?.senderName || '—'} {receipt.postalInfo?.senderPhone ? `(${receipt.postalInfo.senderPhone})` : ''}
                      </div>
                      <div>
                        <strong>Người tiếp nhận:</strong> {receipt.receivedByName || (typeof receipt.receivedBy === 'object' ? receipt.receivedBy?.email : receipt.receivedBy) || 'Admin'}
                      </div>
                    </div>

                    {/* Ảnh minh chứng tiếp nhận */}
                    <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 flex items-center justify-between flex-wrap gap-2">
                      <div className="text-xs">
                        <strong className="text-slate-700">Ảnh minh chứng tiếp nhận:</strong>
                      </div>
                      {receipt.proofUrl ? (
                        <a href={receipt.proofUrl} target="_blank" rel="noreferrer">
                          <Button size="small" icon={<EyeOutlined />} className="text-xs font-semibold text-teal-700 border-teal-300 bg-teal-50 hover:bg-teal-100">
                            Xem ảnh chụp bưu phẩm ({receipt.receiptCode})
                          </Button>
                        </a>
                      ) : (
                        <Tag color="warning" className="text-xs !m-0">
                          Chưa có ảnh chụp bưu phẩm tiếp nhận
                        </Tag>
                      )}
                    </div>

                    {/* Danh sách giấy tờ đối chiếu nếu có */}
                    {receipt.reconciledItems && receipt.reconciledItems.length > 0 && (
                      <div className="text-xs text-slate-600 space-y-1">
                        <div className="font-semibold text-slate-700">Giấy tờ bản cứng đã đối chiếu:</div>
                        <div className="flex flex-wrap gap-1.5">
                          {receipt.reconciledItems.map((item, itemIdx) => (
                            <Tag key={item.checklistItemCode || itemIdx} color="cyan" className="text-[11px] !m-0">
                              ✓ {item.documentTitle || item.checklistItemCode}
                            </Tag>
                          ))}
                        </div>
                      </div>
                    )}

                    {receipt.reconciliationNote && (
                      <div className="text-xs text-slate-600 italic">
                        <strong>Ghi chú:</strong> {receipt.reconciliationNote}
                      </div>
                    )}

                    <div className="flex justify-end pt-1">
                      <Button
                        size="small"
                        icon={<FileDoneOutlined />}
                        onClick={() => {
                          setSelectedReceipt(receipt);
                          reconcileForm.setFieldsValue({
                            status: receipt.status === 'RECEIVED' ? 'RECONCILED' : receipt.status,
                            reconciliationNote: receipt.reconciliationNote || '',
                          });
                          setIsReconcileModalOpen(true);
                        }}
                        className="rounded-lg text-xs font-semibold text-teal-700 border-teal-200 hover:bg-teal-50"
                      >
                        Đối chiếu biên nhận này
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Campaign Policy Card */}
          <Card 
            className="rounded-2xl shadow-xs border-teal-200 bg-teal-50/20" 
            title={
              <span className="font-bold flex items-center gap-2 text-teal-950">
                <SafetyCertificateOutlined className="text-teal-700" /> Chính sách & Định mức chiến dịch
              </span>
            } 
            extra={<Tag color="cyan" className="font-bold border-0">CHUẨN 2.000.000 Đ/SUẤT</Tag>}
          >
            <div className="flex items-start gap-3 bg-white p-4 rounded-xl border border-teal-100 shadow-2xs mb-4">
              <div className="text-teal-700 mt-0.5"><ExclamationCircleOutlined /></div>
              <div className="text-xs text-slate-600">
                <strong className="text-teal-950 block mb-0.5">Mức tài trợ được kiểm soát tự động theo chiến dịch</strong>
                Mỗi suất học bổng có định mức quy chuẩn 2.000.000 VNĐ. Hệ thống kiểm soát kiểm tra số dư quỹ thực nhận khả dụng (sau khi trừ hoàn tiền và suất đã cấp) trước khi phê duyệt.
              </div>
            </div>

            <Row gutter={[16, 16]}>
              <Col span={12}>
                <div className="bg-white p-4 rounded-xl border border-[#D6E5E2] h-full shadow-[0_2px_8px_rgba(15,118,110,0.04)]">
                  <div className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-1">CHIẾN DỊCH</div>
                  <div className="font-extrabold text-[#163B40] text-base">{app.campaignTitle || app.campaign?.title}</div>
                </div>
              </Col>
              <Col span={12}>
                <div className="bg-[#0F766E] p-4 rounded-xl border border-[#0F766E] h-full text-white shadow-xs">
                  <div className="text-xs font-bold text-teal-100 uppercase tracking-wider mb-1">ĐỊNH MỨC PHÊ DUYỆT</div>
                  <div className="font-black text-2xl">{formatVND(app.awardAmountPerStudent || 2000000)}</div>
                  <div className="text-xs text-teal-200 mt-1">Cấp tự động khi duyệt thành công</div>
                </div>
              </Col>
            </Row>
          </Card>

          {/* Statement Card */}
          <Card 
            className="rounded-2xl shadow-sm border-gray-100" 
            title={
              <span className="font-bold flex items-center gap-2">
                <AuditOutlined className="text-teal-700" /> Thư nguyện vọng & Hoàn cảnh học sinh (Tùy chọn)
              </span>
            }
          >
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-gray-800 text-sm whitespace-pre-wrap leading-relaxed">
              {app.statement || 'Học sinh không cung cấp thư nguyện vọng tự do (Tiêu chuẩn thẩm định dựa trên hồ sơ minh chứng và xác minh thực tế).'}
            </div>
          </Card>

          {/* Documents Card */}
          <Card 
            className="rounded-2xl shadow-sm border-gray-100" 
            title={<span className="font-bold flex items-center gap-2">Hồ sơ minh chứng đính kèm ({app.documents?.length || 0})</span>}
          >
            {!app.documents || app.documents.length === 0 ? (
              <div className="text-xs text-gray-400 text-center py-4">Không có tệp đính kèm nào.</div>
            ) : (
              <div className="space-y-4">
                {app.documents.map((doc, docIdx) => (
                  <div key={doc._id || docIdx} className="space-y-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                          Tài liệu #{docIdx + 1}: {doc.checklistItemCode || doc.documentType || 'SCHOLARSHIP_PROOF'}
                        </span>
                        {doc.status === 'APPROVED' && (
                          <Tag color="success" icon={<CheckCircleOutlined />}>Đã duyệt hợp lệ</Tag>
                        )}
                        {doc.status === 'REJECTED' && (
                          <Tag color="error" icon={<CloseCircleOutlined />}>
                            Từ chối{doc.reviewNote ? `: ${doc.reviewNote}` : ''}
                          </Tag>
                        )}
                        {(!doc.status || doc.status === 'PENDING') && (
                          <Tag color="warning" icon={<ClockCircleOutlined />}>Chờ kiểm tra</Tag>
                        )}
                      </div>

                      {/* Admin review document action buttons */}
                      {(isSubmitted || isDossierVerified || app.status === 'NEED_MORE_INFORMATION') && (
                        <div className="flex items-center gap-2">
                          {doc.status !== 'APPROVED' && (
                            <Button
                              size="small"
                              type="primary"
                              ghost
                              loading={reviewingDocId === doc._id}
                              onClick={() => handleReviewDocument(String(doc._id || docIdx), 'APPROVED')}
                              className="text-xs font-semibold text-emerald-700 border-emerald-400 hover:bg-emerald-50"
                            >
                              Xác nhận hợp lệ
                            </Button>
                          )}
                          {doc.status !== 'REJECTED' && (
                            <Button
                              size="small"
                              danger
                              ghost
                              loading={reviewingDocId === doc._id}
                              onClick={() => handlePromptRejectDocument(String(doc._id || docIdx))}
                              className="text-xs font-semibold"
                            >
                              Từ chối
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    <Row gutter={[16, 16]}>
                      {doc.files.map((file, fileIdx) => (
                        <Col span={24} sm={12} md={8} key={file.storageKey || fileIdx}>
                          <PrivateDocumentCard
                            file={file}
                            title={`Minh chứng #${fileIdx + 1} (${file.side || 'bản chụp'})`}
                            documentType={doc.documentType || 'SCHOLARSHIP_PROOF'}
                          />
                        </Col>
                      ))}
                    </Row>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>

        {/* RIGHT COLUMN - DECISION PANEL */}
        <Col xs={24} lg={8}>
          <div className="sticky top-6 flex flex-col gap-6">
            {/* Priority Score & Criteria Details */}
            <Card
              className="rounded-2xl shadow-xs border-teal-200 bg-white"
              title={
                <div className="flex items-center justify-between w-full text-slate-800">
                  <span className="flex items-center gap-2 font-bold text-sm">
                    <SafetyCertificateOutlined className="text-teal-700" /> Điểm ưu tiên xét duyệt
                  </span>
                  {(() => {
                    const statusKey =
                      app.screeningResult?.scoreStatus ||
                      (app.status === 'APPROVED'
                        ? 'OFFICIAL'
                        : app.status === 'DOSSIER_VERIFIED'
                        ? 'VERIFIED'
                        : app.screeningResult?.layer2Score != null
                        ? 'AUTOMATIC'
                        : 'UNSCORED');
                    const config = SCORE_STATUS_CONFIG[statusKey] || SCORE_STATUS_CONFIG.UNSCORED;
                    return (
                      <Tag color={config.color} className="font-extrabold text-xs uppercase px-2.5 py-0.5 rounded-full !m-0">
                        {config.label}
                      </Tag>
                    );
                  })()}
                </div>
              }
            >
              <div className="space-y-4">
                {/* Header score & status description */}
                <div className="flex items-center justify-between bg-teal-50/50 p-3 rounded-xl border border-teal-100">
                  <div>
                    <div className="text-xs text-slate-500 font-medium">Tổng điểm ưu tiên:</div>
                    <div className="text-2xl font-black text-teal-800">
                      {app.screeningResult?.layer2Score != null ? `${app.screeningResult.layer2Score} điểm` : '0 điểm'}
                    </div>
                  </div>
                  {(() => {
                    const statusKey =
                      app.screeningResult?.scoreStatus ||
                      (app.status === 'APPROVED'
                        ? 'OFFICIAL'
                        : app.status === 'DOSSIER_VERIFIED'
                        ? 'VERIFIED'
                        : app.screeningResult?.layer2Score != null
                        ? 'AUTOMATIC'
                        : 'UNSCORED');
                    const config = SCORE_STATUS_CONFIG[statusKey] || SCORE_STATUS_CONFIG.UNSCORED;
                    return (
                      <div className="text-right text-[11px] text-slate-500 max-w-[140px] leading-tight">
                        {config.desc}
                      </div>
                    );
                  })()}
                </div>

                {/* Criteria breakdown */}
                {app.screeningResult?.priorityCriteria && app.screeningResult.priorityCriteria.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                      Tiêu chí ưu tiên thỏa mãn:
                    </div>
                    <div className="space-y-1.5">
                      {app.screeningResult.priorityCriteria.map((crit, idx) => (
                        <div
                          key={crit.code || idx}
                          className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs"
                        >
                          <span className="font-medium text-slate-700">{crit.label}</span>
                          <span className="font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
                            +{crit.points} điểm
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl border border-slate-100">
                    Không có tiêu chí ưu tiên nào khớp với hồ sơ (hoặc chưa khai báo minh chứng ưu tiên).
                  </div>
                )}
              </div>
            </Card>

            <Card className="rounded-2xl shadow-[0_2px_8px_rgba(15,118,110,0.04)] border-[#D6E5E2] border-t-4 border-t-[#0D9488]">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-700 font-bold text-lg">
                  <CheckCircleOutlined />
                </div>
                <div>
                  <Title level={5} className="!m-0 text-gray-900">Thẩm định & Quyết định</Title>
                  <Text className="text-xs text-gray-500">Phân tách thẩm định và phê duyệt</Text>
                </div>
              </div>

              {/* Status info if already processed */}
              {app.status === 'APPROVED' && (
                <div className="mb-4">
                  <Alert
                    type="success"
                    showIcon
                    message="Hồ sơ đã được phê duyệt"
                    description={
                      <div className="mt-1 text-xs space-y-1">
                        {app.scholarship && (
                          <div>
                            <strong>Mã học bổng:</strong> {app.scholarship.code || app.scholarship.id}
                          </div>
                        )}
                        {app.reviewNote && <div><strong>Ghi chú:</strong> {app.reviewNote}</div>}
                      </div>
                    }
                    className="rounded-xl text-xs"
                  />
                </div>
              )}

              {app.status === 'REJECTED' && (
                <div className="mb-4">
                  <Alert
                    type="error"
                    showIcon
                    message="Hồ sơ đã bị từ chối"
                    description={app.reviewNote ? <div><strong>Lý do:</strong> {app.reviewNote}</div> : null}
                    className="rounded-xl text-xs"
                  />
                </div>
              )}

              {/* Screening & Assignment Actions */}
              <div className="space-y-3 mb-4">
                <Button
                  block
                  icon={<AuditOutlined />}
                  onClick={() => {
                    screenForm.setFieldsValue({
                      layer1Passed: app.screeningResult?.layer1Passed ?? false,
                      notes: app.screeningResult?.notes ?? '',
                    });
                    setIsScreenModalOpen(true);
                  }}
                  className="rounded-xl h-[40px] font-semibold text-slate-700 border-slate-200 hover:bg-slate-50"
                >
                  {app.screenedBy ? 'Cập nhật Sơ duyệt (Screening)' : 'Sơ duyệt hồ sơ (Screening)'}
                </Button>

                <Button
                  block
                  icon={<UserOutlined />}
                  onClick={() => {
                    assignVerifierForm.setFieldsValue({
                      verifierId: app.assignedVerifierId ? String(app.assignedVerifierId) : undefined,
                    });
                    setIsAssignVerifierModalOpen(true);
                  }}
                  className="rounded-xl h-[40px] font-semibold text-slate-700 border-slate-200 hover:bg-slate-50"
                >
                  {app.assignedVerifierId ? 'Đổi Người xác minh độc lập' : 'Phân công Người xác minh độc lập'}
                </Button>
              </div>

              <Divider className="my-2" />

              {/* Action buttons */}
              {(isSubmitted || isDossierVerified) && (
                <div className="flex flex-col gap-3">
                  <Button 
                    type="primary" 
                    block 
                    disabled={!canApprove}
                    className={`rounded-xl h-[48px] font-bold shadow-xs ${
                      canApprove ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                    }`} 
                    onClick={() => setIsApproveModalOpen(true)}
                  >
                    Phê duyệt cấp học bổng
                  </Button>
                  {!canApprove && (isSubmitted || isDossierVerified) && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-tight space-y-1.5">
                      <div className="font-bold flex items-center gap-1 text-amber-800">
                        <ExclamationCircleOutlined /> Điều kiện chưa thỏa mãn để phê duyệt:
                      </div>
                      <ul className="list-disc pl-4 space-y-1 !m-0 text-amber-800">
                        {hasPendingOrMissingMandatory && (
                          <li>Cần kiểm tra và bấm "Xác nhận hợp lệ" cho tất cả minh chứng bắt buộc bên trái.</li>
                        )}
                        {isPaperRequired && !validPaperReceipt && (
                          <li>Hồ sơ nộp theo hình thức nộp giấy/kết hợp bắt buộc phải có biên nhận tiếp nhận hồ sơ giấy (Đã tiếp nhận hoặc Đã đối chiếu khớp) và có ảnh minh chứng tiếp nhận.</li>
                        )}
                        {app.screeningResult?.layer1Passed === false && (
                          <li>Hồ sơ không đạt điều kiện tiên quyết ở bước sơ duyệt.</li>
                        )}
                      </ul>
                    </div>
                  )}

                  <Button 
                    block 
                    className="rounded-xl h-[44px] font-semibold bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100" 
                    onClick={() => setIsRequestInfoModalOpen(true)}
                  >
                    Yêu cầu bổ sung hồ sơ
                  </Button>
                  <Button 
                    block 
                    danger 
                    className="rounded-xl h-[44px] font-semibold bg-rose-50 hover:bg-rose-100" 
                    onClick={() => setIsRejectModalOpen(true)}
                  >
                    Từ chối hồ sơ
                  </Button>
                </div>
              )}

              {app.status === 'NEED_MORE_INFORMATION' && (
                <div className="flex flex-col gap-3">
                  <Text className="text-xs text-gray-500">
                    Đang chờ học sinh bổ sung tài liệu. Bạn vẫn có thể từ chối hồ sơ nếu cần:
                  </Text>
                  <Button 
                    block 
                    danger 
                    className="rounded-xl h-[44px] font-semibold bg-rose-50 hover:bg-rose-100" 
                    onClick={() => setIsRejectModalOpen(true)}
                  >
                    Từ chối hồ sơ
                  </Button>
                </div>
              )}

              {app.status === 'APPROVED' && app.scholarship && (
                <div className="mt-2 p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-800 space-y-1">
                  <div className="font-bold">Đã sinh bản ghi Học bổng:</div>
                  <div>Mã: {app.scholarship.code || app.scholarship.id}</div>
                  <div>Hạn dùng: {app.scholarship.expiresAt ? new Date(app.scholarship.expiresAt).toLocaleDateString('vi-VN') : 'Không thời hạn'}</div>
                  <div>Số dư: {formatVND(app.scholarship.remainingAmount)}</div>
                </div>
              )}
            </Card>
          </div>
        </Col>
      </Row>

      {/* APPROVE MODAL */}
      <Modal
        title="Xác nhận phê duyệt cấp học bổng"
        open={isApproveModalOpen}
        onCancel={() => setIsApproveModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <div className="py-2 space-y-4">
          <Paragraph className="text-sm text-gray-700">
            Bạn xác nhận phê duyệt hồ sơ học bổng cho học sinh <strong>{studentDisplayName}</strong>?
          </Paragraph>
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500">Chiến dịch:</span>
              <span className="font-semibold text-gray-900">{app.campaignTitle || app.campaign?.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Định mức cấp tự động:</span>
              <span className="font-bold text-emerald-600 text-sm">{formatVND(app.awardAmountPerStudent || app.campaign?.awardAmountPerStudent || 0)}</span>
            </div>
          </div>

          <Form form={approveForm} layout="vertical">
            <Form.Item name="reviewNote" label={<span className="text-xs font-bold text-gray-700">Ghi chú phê duyệt (tùy chọn)</span>}>
              <TextArea rows={3} placeholder="Nhập ghi chú khen thưởng hoặc nhắn gửi tới học sinh..." className="rounded-xl text-sm" />
            </Form.Item>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button onClick={() => setIsApproveModalOpen(false)}>Hủy</Button>
              <Button 
                type="primary" 
                onClick={handleApproveSubmit} 
                loading={approveMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 font-semibold"
              >
                Xác nhận phê duyệt
              </Button>
            </div>
          </Form>
        </div>
      </Modal>

      {/* SCREENING MODAL (Layer 1 + Layer 2) */}
      <Modal
        title="Sơ duyệt hồ sơ học bổng (Admin Screening)"
        open={isScreenModalOpen}
        onCancel={() => setIsScreenModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <div className="py-2 space-y-4">
            <Paragraph className="text-xs text-gray-600">
              Sơ duyệt kiểm tra điều kiện bắt buộc. Điểm ưu tiên được tính theo phiên bản tiêu chí đã cấu hình cho chiến dịch; điểm chỉ dùng để xếp hạng hỗ trợ.
            </Paragraph>

          {activePriorityCriteria.length > 0 ? (
            <Alert
              type="info"
              showIcon
              message={`Tiêu chí chiến dịch · phiên bản ${app.campaign?.priorityPolicyVersion || 0}`}
              description={activePriorityCriteria.map((criterion) => `${criterion.label}: ${criterion.points} điểm`).join(" · ")}
            />
          ) : (
            <Alert type="warning" showIcon message="Chiến dịch chưa cấu hình tiêu chí điểm ưu tiên" description="Hồ sơ vẫn được xét thủ công theo điều kiện bắt buộc và kết quả xác minh; hệ thống không tự gán điểm mẫu." />
          )}

          <Form form={screenForm} layout="vertical">
            <Form.Item
              name="layer1Passed"
              label={<span className="text-xs font-bold text-gray-700">Đạt tiêu chuẩn bắt buộc Layer 1 (Căn cước, độ tuổi, học bạ)</span>}
              valuePropName="checked"
              initialValue={false}
            >
              <Switch checkedChildren="Đạt" unCheckedChildren="Không đạt" />
            </Form.Item>

            <Form.Item
              name="notes"
              label={<span className="text-xs font-bold text-gray-700">Ghi chú sơ duyệt</span>}
            >
              <TextArea rows={3} placeholder="Nhận xét tóm tắt về hồ sơ..." className="rounded-xl text-sm" />
            </Form.Item>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button onClick={() => setIsScreenModalOpen(false)}>Hủy</Button>
              <Button 
                type="primary" 
                onClick={handleScreenSubmit} 
                loading={screenMutation.isPending}
                className="bg-teal-600 hover:bg-teal-700 font-semibold"
              >
                Lưu kết quả sơ duyệt
              </Button>
            </div>
          </Form>
        </div>
      </Modal>

      {/* ASSIGN VERIFIER MODAL */}
      <Modal
        title="Phân công Người xác minh độc lập (Field Verifier)"
        open={isAssignVerifierModalOpen}
        onCancel={() => setIsAssignVerifierModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <div className="py-2 space-y-4">
          <Paragraph className="text-xs text-gray-600">
            Chọn Người xác minh (Role: VERIFIER) phụ trách liên hệ địa phương, kiểm tra thực địa hoặc phỏng vấn gia đình học sinh.
          </Paragraph>

          <Form form={assignVerifierForm} layout="vertical">
            <Form.Item
              name="verifierId"
              label={<span className="text-xs font-bold text-gray-700">Người xác minh <span className="text-rose-500">*</span></span>}
              rules={[{ required: true, message: 'Vui lòng chọn người xác minh' }]}
            >
              <Select
                placeholder="Chọn người xác minh..."
                className="rounded-xl"
                options={(verifiersList || []).map((v: any) => ({
                  value: v.id || v._id,
                  label: `${v.fullName || v.email} (${v.email})`,
                }))}
              />
            </Form.Item>

            <Form.Item
              name="note"
              label={<span className="text-xs font-bold text-gray-700">Chỉ dẫn xác minh (tùy chọn)</span>}
            >
              <TextArea rows={3} placeholder="Ví dụ: Cần kiểm tra kỹ xác nhận hoàn cảnh khó khăn tại UBND xã..." className="rounded-xl text-sm" />
            </Form.Item>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button onClick={() => setIsAssignVerifierModalOpen(false)}>Hủy</Button>
              <Button 
                type="primary" 
                onClick={handleAssignVerifierSubmit} 
                loading={assignVerifierMutation.isPending}
                className="bg-teal-600 hover:bg-teal-700 font-semibold"
              >
                Xác nhận phân công
              </Button>
            </div>
          </Form>
        </div>
      </Modal>

      {/* RECONCILE PAPER DOSSIER MODAL */}
      <Modal
        title={`Đối chiếu biên nhận giấy: ${selectedReceipt?.receiptCode || ''}`}
        open={isReconcileModalOpen}
        onCancel={() => {
          setIsReconcileModalOpen(false);
          setSelectedReceipt(null);
        }}
        footer={null}
        destroyOnClose
      >
        <div className="py-2 space-y-4">
          <Form form={reconcileForm} layout="vertical">
            <Form.Item
              name="status"
              label={<span className="text-xs font-bold text-gray-700">Trạng thái đối chiếu <span className="text-rose-500">*</span></span>}
              rules={[{ required: true, message: 'Vui lòng chọn trạng thái' }]}
            >
              <Select
                options={[
                  { value: 'IN_RECONCILIATION', label: 'Đang đối chiếu (In Reconciliation)' },
                  { value: 'RECONCILED', label: 'Khớp hoàn toàn (Reconciled)' },
                  { value: 'DISCREPANCY', label: 'Có sai lệch / Thiếu hồ sơ (Discrepancy)' },
                ]}
              />
            </Form.Item>

            <Form.Item
              name="reconciliationNote"
              label={<span className="text-xs font-bold text-gray-700">Ghi chú đối chiếu</span>}
            >
              <TextArea rows={3} placeholder="Ghi chú về tình trạng tài liệu giấy, con dấu..." className="rounded-xl text-sm" />
            </Form.Item>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button onClick={() => setIsReconcileModalOpen(false)}>Hủy</Button>
              <Button 
                type="primary" 
                onClick={handleReconcileSubmit} 
                loading={reconcileMutation.isPending}
                className="bg-teal-600 hover:bg-teal-700 font-semibold"
              >
                Lưu kết quả đối chiếu
              </Button>
            </div>
          </Form>
        </div>
      </Modal>

      {/* LINK RECEIPT MODAL */}
      <Modal
        title="Liên kết biên nhận hồ sơ giấy"
        open={isLinkModalOpen}
        onCancel={() => setIsLinkModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <div className="py-2 space-y-4">
          <Paragraph className="text-xs text-gray-600">
            Nhập Mã biên nhận hồ sơ giấy (VD: RCP-YYYY-XXXX) hoặc ID biên nhận đã tiếp nhận trước đó để gắn vào hồ sơ điện tử này.
          </Paragraph>

          <Form form={linkForm} layout="vertical">
            <Form.Item
              name="receiptIdOrCode"
              label={<span className="text-xs font-bold text-gray-700">Mã biên nhận hoặc ID <span className="text-rose-500">*</span></span>}
              rules={[{ required: true, message: 'Vui lòng nhập mã biên nhận' }]}
            >
              <Input placeholder="VD: RCP-2026-0001" className="rounded-xl font-mono uppercase" />
            </Form.Item>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button onClick={() => setIsLinkModalOpen(false)}>Hủy</Button>
              <Button 
                type="primary" 
                onClick={handleLinkReceiptSubmit} 
                loading={linkReceiptMutation.isPending}
                className="bg-teal-600 hover:bg-teal-700 font-semibold"
              >
                Liên kết ngay
              </Button>
            </div>
          </Form>
        </div>
      </Modal>

      {/* REQUEST INFO MODAL */}
      <Modal
        title="Yêu cầu bổ sung hồ sơ học bổng"
        open={isRequestInfoModalOpen}
        onCancel={() => setIsRequestInfoModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <div className="py-2 space-y-4">
          <Paragraph className="text-xs text-gray-600">
            Học sinh sẽ nhận được thông báo kèm ghi chú yêu cầu này để bổ sung tài liệu và gửi lại hồ sơ.
          </Paragraph>

          <Form form={requestInfoForm} layout="vertical">
            <Form.Item 
              name="reviewNote" 
              label={<span className="text-xs font-bold text-gray-700">Nội dung yêu cầu bổ sung <span className="text-rose-500">*</span></span>}
              rules={[{ required: true, message: 'Vui lòng nhập chi tiết thông tin hoặc giấy tờ cần bổ sung' }]}
            >
              <TextArea rows={4} placeholder="Ví dụ: Căn cước công dân bị mờ; vui lòng bổ sung giấy xác nhận hộ nghèo có dấu mộc mới nhất..." className="rounded-xl text-sm" />
            </Form.Item>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button onClick={() => setIsRequestInfoModalOpen(false)}>Hủy</Button>
              <Button 
                type="primary" 
                onClick={handleRequestInfoSubmit} 
                loading={requestInfoMutation.isPending}
                className="bg-teal-600 hover:bg-teal-700 font-semibold"
              >
                Gửi yêu cầu
              </Button>
            </div>
          </Form>
        </div>
      </Modal>

      {/* REJECT MODAL */}
      <Modal
        title="Từ chối hồ sơ học bổng"
        open={isRejectModalOpen}
        onCancel={() => setIsRejectModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <div className="py-2 space-y-4">
          <Paragraph className="text-xs text-gray-600">
            Vui lòng nhập lý do từ chối để học sinh nắm rõ thông tin.
          </Paragraph>

          <Form form={rejectForm} layout="vertical">
            <Form.Item 
              name="reviewNote" 
              label={<span className="text-xs font-bold text-gray-700">Lý do từ chối</span>}
            >
              <TextArea rows={4} placeholder="Ví dụ: Hồ sơ chưa đạt tiêu chí hoàn cảnh khó khăn của chiến dịch..." className="rounded-xl text-sm" />
            </Form.Item>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button onClick={() => setIsRejectModalOpen(false)}>Hủy</Button>
              <Button 
                type="primary" 
                danger
                onClick={handleRejectSubmit} 
                loading={rejectMutation.isPending}
                className="font-semibold"
              >
                Xác nhận từ chối
              </Button>
            </div>
          </Form>
        </div>
      </Modal>

      {/* INTAKE PAPER DOSSIER MODAL */}
      <IntakePaperDossierModal
        open={isIntakeModalOpen}
        onClose={() => setIsIntakeModalOpen(false)}
        application={app as any}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: scholarshipApplicationKeys.detail(applicationId || '') });
          queryClient.invalidateQueries({ queryKey: scholarshipApplicationKeys.adminList() });
        }}
      />
    </div>
  );
}
