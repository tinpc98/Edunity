import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Typography, Breadcrumb, Button, Card, Row, Col, Avatar, Divider, Form, Input, message, Modal, Skeleton, Alert, Descriptions, Tag } from 'antd';
import { 
  SafetyCertificateOutlined,
  UserOutlined,
  MailOutlined,
  SolutionOutlined,
  FileSearchOutlined,
  CheckSquareFilled,
  LeftOutlined
} from '@ant-design/icons';
import { useParams, Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { ROUTES } from '../../../../routes/routePaths';
import { teacherVerificationService } from '../../../../services/teacherVerification.service';
import { catalogKeys, catalogService } from '../../../../services/catalog.service';
import PrivateDocumentCard from '../../../../components/common/PrivateDocumentCard';
import { getFriendlyErrorMessage } from '../../../../utils/apiErrorMap';
import { TEACHER_DEGREE_LABELS, type VerificationStatus } from '../../../../types/teacherVerification';
import { GRADE_LEVEL_LABELS } from '../../../../types/catalog';
import VerificationHistoryCard from './components/VerificationHistoryCard';
import TeacherContractsCard from './components/TeacherContractsCard';
import TeacherIdentityCard from './components/TeacherIdentityCard';
import { groupVerificationSubmissions } from '../../../../utils/verificationSubmissions';
import AdminStatusBadge from '../../../../components/admin/AdminStatusBadge';

const { Title, Paragraph } = Typography;

const STATUS_LABELS: Record<VerificationStatus, string> = {
  UNVERIFIED: 'Chưa nộp hồ sơ',
  PENDING: 'Chờ duyệt',
  VERIFIED: 'Đã xác minh',
  REJECTED: 'Từ chối',
};

export default function TeacherVerificationDetailPage() {
  const { teacherId } = useParams();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [approveForm] = Form.useForm<{ reviewNote?: string }>();
  
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);

  const { data: teacher, isLoading, isError } = useQuery({
    queryKey: ['admin-teacher-verification', teacherId],
    queryFn: () => teacherVerificationService.adminGetVerification(teacherId as string),
    enabled: !!teacherId,
  });
  const { data: teachingSubjectOptions = [] } = useQuery({
    queryKey: catalogKeys.teachingSubjects(),
    queryFn: () => catalogService.getTeachingSubjectOptions(),
    enabled: Boolean(teacher?.teachingProfile),
  });

  const approveMutation = useMutation({
    mutationFn: (reviewNote?: string) => teacherVerificationService.adminApproveVerification(teacherId as string, reviewNote),
    onSuccess: () => {
      message.success('Đã phê duyệt và cấp chứng nhận giáo viên thành công!');
      queryClient.invalidateQueries({ queryKey: ['admin-teacher-verification', teacherId] });
      queryClient.invalidateQueries({ queryKey: ['admin-teacher-verifications'] });
      setIsApproveModalOpen(false);
    },
    onError: (err: any) => {
      message.error(getFriendlyErrorMessage(err, 'Phê duyệt thất bại.'));
    }
  });

  const rejectMutation = useMutation({
    mutationFn: (values: { reviewNote: string; reasons?: Record<string, string | undefined> }) =>
      teacherVerificationService.adminRejectVerification(
        teacherId as string,
        values.reviewNote,
        Object.entries(values.reasons ?? {})
          .filter(([, reason]) => reason?.trim())
          .map(([documentId, reason]) => ({ documentId, reason: (reason as string).trim() }))
      ),
    onSuccess: () => {
      message.success('Đã từ chối hồ sơ xác minh.');
      queryClient.invalidateQueries({ queryKey: ['admin-teacher-verification', teacherId] });
      queryClient.invalidateQueries({ queryKey: ['admin-teacher-verifications'] });
      setIsRejectModalOpen(false);
      form.resetFields();
    },
    onError: (err: any) => {
      message.error(getFriendlyErrorMessage(err, 'Từ chối thất bại.'));
    }
  });

  if (isLoading) {
    return <div className="p-10"><Skeleton active paragraph={{ rows: 10 }} /></div>;
  }

  if (isError || !teacher) {
    return (
      <div className="p-8">
        <Alert
          type="error"
          showIcon
          message="Không tìm thấy thông tin xác minh"
          description="Hồ sơ giáo viên không tồn tại hoặc đã bị gỡ khỏi hệ thống."
        />
      </div>
    );
  }

  const submissions = groupVerificationSubmissions(teacher.documents ?? []);
  const latestDocuments = submissions[0]?.documents ?? [];
  const identityDoc = latestDocuments.find(d => d.documentType === 'IDENTITY');
  const qualificationDoc = latestDocuments.find(d => d.documentType === 'QUALIFICATION');

  const status = teacher.verificationStatus;
  const isReverification = teacher.reverificationStatus === 'PENDING';
  const awaitingReview = status === 'PENDING' || isReverification;
  const pendingDocuments = submissions[0]?.status === 'PENDING' ? latestDocuments : [];
  const ocrMismatch = pendingDocuments.some((d) => d.ocr?.status === 'MISMATCHED');
  const previousSubmission = awaitingReview && submissions.length > 1 ? submissions[1] : undefined;

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center justify-between">
        <Breadcrumb 
          className="text-xs font-semibold"
          items={[
            { title: <Link to={ROUTES.ADMIN.HOME} className="text-slate-500 hover:text-teal-700">Tổng quan</Link> },
            { title: <Link to={ROUTES.ADMIN.TEACHER_VERIFICATIONS} className="text-slate-500 hover:text-teal-700">Xác minh giáo viên</Link> },
            { title: <span className="text-slate-800">{teacher.fullName}</span> },
          ]}
        />
        <Link
          to={ROUTES.ADMIN.TEACHER_VERIFICATIONS}
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-teal-700 transition-colors"
        >
          <LeftOutlined className="text-[10px]" />
          <span>Quay lại danh sách</span>
        </Link>
      </div>

      {/* Hero Dossier Card */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-5 bg-white p-6 rounded-2xl shadow-[0_2px_8px_rgba(15,118,110,0.04)] border border-[#D6E5E2]">
        <div className="flex items-center gap-5">
          <Avatar
            size={72}
            className="bg-teal-50 text-teal-800 border-2 border-teal-200 text-2xl font-bold shrink-0 shadow-2xs"
          >
            {teacher.fullName.substring(0, 2).toUpperCase()}
          </Avatar>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-none">
                {teacher.fullName}
              </h2>
              <AdminStatusBadge
                label={STATUS_LABELS[status] ?? status}
                type={status === 'VERIFIED' ? 'success' : status === 'PENDING' ? 'warning' : 'error'}
                pulse={status === 'PENDING'}
              />
            </div>
            <div className="text-xs text-slate-500 font-medium flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
              <span className="flex items-center gap-1.5 text-slate-700 font-semibold">
                <SolutionOutlined className="text-teal-600" />
                <span>Chuyên môn: {teacher.qualificationSummary || 'Chưa cập nhật'}</span>
              </span>
              <span>•</span>
              <span className="font-mono text-slate-500">
                #TCH-{teacher.teacherId.substring(0, 6).toUpperCase()}
              </span>
              {teacher.reviewedAt && (
                <>
                  <span>•</span>
                  <span>Ngày xét duyệt: {dayjs(teacher.reviewedAt).format('DD/MM/YYYY')}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <Row gutter={[24, 24]}>
        {/* LEFT COLUMN - CONTENT */}
        <Col xs={24} lg={16} className="flex flex-col gap-6">
          <Card
            className="rounded-2xl shadow-[0_2px_8px_rgba(15,118,110,0.04)] border-[#D6E5E2]"
            title={<span className="font-bold flex items-center gap-2"><UserOutlined className="text-[#0F766E]" /> Thông tin cá nhân & Thiết lập sư phạm</span>}
          >
            <Row gutter={[24, 16]}>
              <Col span={12}>
                <div className="text-[#64748B] text-[10px] font-bold uppercase tracking-wider mb-1">Họ và tên</div>
                <div className="font-bold text-[#163B40] text-sm">{teacher.fullName}</div>
              </Col>
              <Col span={12}>
                <div className="text-[#64748B] text-[10px] font-bold uppercase tracking-wider mb-1">Email liên hệ</div>
                <div className="font-bold text-[#163B40] text-sm flex items-center gap-2">
                  <MailOutlined className="text-[#0D9488]" /> {teacher.email}
                </div>
              </Col>
              <Col span={24}>
                <Divider className="my-2 border-[#D6E5E2]" />
              </Col>
              <Col span={24}>
                <div className="text-[#64748B] text-[10px] font-bold uppercase tracking-wider mb-1">Tiểu sử & Cam kết sư phạm</div>
                <Paragraph className="font-medium text-[#334155] bg-[#F0F8F6] p-4 rounded-xl border border-[#D6E5E2] italic text-xs leading-relaxed m-0">
                  "{teacher.biography || 'Chưa cập nhật tiểu sử'}"
                </Paragraph>
              </Col>
            </Row>
          </Card>

          {teacher.teachingProfile && (
            <Card
              className="rounded-2xl shadow-[0_2px_8px_rgba(15,118,110,0.04)] border-[#D6E5E2]"
              title={<span className="font-bold flex items-center gap-2"><SolutionOutlined className="text-[#0F766E]" /> Hồ sơ giảng dạy</span>}
            >
              <Descriptions column={{ xs: 1, sm: 2 }} size="small" colon={false} styles={{ label: { color: '#64748B', fontSize: 12 } }}>
                <Descriptions.Item label="Học vị">{TEACHER_DEGREE_LABELS[teacher.teachingProfile.degree] ?? teacher.teachingProfile.degree}</Descriptions.Item>
                <Descriptions.Item label="Kinh nghiệm">{teacher.teachingProfile.yearsOfExperience} năm</Descriptions.Item>
                <Descriptions.Item label="Chuyên ngành">{teacher.teachingProfile.major || '—'}</Descriptions.Item>
                <Descriptions.Item label="Trường">{teacher.teachingProfile.school || '—'}</Descriptions.Item>
                <Descriptions.Item label="Môn nhận dạy" span="filled">
                  <div className="flex flex-wrap gap-1">{teacher.teachingProfile.subjects.map((name) => (
                    <Tag key={name}>{teachingSubjectOptions.find(({ value }) => value === name)?.label ?? name}</Tag>
                  ))}</div>
                </Descriptions.Item>
                <Descriptions.Item label="Cấp học" span="filled">
                  <div className="flex flex-wrap gap-1">{teacher.teachingProfile.gradeLevels.map((g) => <Tag key={g} color="cyan">{GRADE_LEVEL_LABELS[g] ?? g}</Tag>)}</div>
                </Descriptions.Item>
                <Descriptions.Item label="Chứng chỉ" span="filled">
                  {teacher.teachingProfile.certificates.length
                    ? teacher.teachingProfile.certificates.map((c) => `${c.name}${c.year ? ` (${c.year})` : ''}`).join(' · ')
                    : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Thành tích" span="filled">{teacher.teachingProfile.achievements || '—'}</Descriptions.Item>
                <Descriptions.Item label="Đối tượng" span="filled">{teacher.teachingProfile.studentNote || <span className="text-slate-400 italic">Chưa khai báo (hồ sơ nộp trước khi mục này bắt buộc)</span>}</Descriptions.Item>
              </Descriptions>
            </Card>
          )}

          {teacherId && <TeacherIdentityCard teacherId={teacherId} identity={teacher.identity} ocr={identityDoc?.ocr} />}

          <Card
            className="rounded-2xl shadow-[0_2px_8px_rgba(15,118,110,0.04)] border-[#D6E5E2]"
            title={<span className="font-bold flex items-center gap-2"><SafetyCertificateOutlined className="text-[#0F766E]" /> Xác minh danh tính cá nhân</span>}
          >
            {identityDoc && identityDoc.files && identityDoc.files.length > 0 ? (
              <Row gutter={[16, 16]}>
                {identityDoc.files.map((file) => (
                  <Col span={24} sm={12} key={file.storageKey}>
                    <PrivateDocumentCard
                      file={file}
                      title={`Mặt ${file.side === 'FRONT' ? 'Trước' : file.side === 'BACK' ? 'Sau' : 'Đơn'}`}
                      documentType="Định danh"
                    />
                  </Col>
                ))}
              </Row>
            ) : (
              <div className="text-slate-400 text-center py-6 text-xs">Chưa có tài liệu định danh</div>
            )}
          </Card>

          <Card
            className="rounded-2xl shadow-[0_2px_8px_rgba(15,118,110,0.04)] border-[#D6E5E2]"
            title={<span className="font-bold flex items-center gap-2"><FileSearchOutlined className="text-[#0F766E]" /> Bằng cấp & Chứng chỉ Sư phạm</span>}
          >
            {qualificationDoc && qualificationDoc.files && qualificationDoc.files.length > 0 ? (
              <Row gutter={[16, 16]}>
                {qualificationDoc.files.map((file) => (
                  <Col span={24} sm={12} key={file.storageKey}>
                    <PrivateDocumentCard
                      file={file}
                      title="Chứng chỉ chuyên môn"
                      documentType="Bằng cấp / Chứng chỉ"
                    />
                  </Col>
                ))}
              </Row>
            ) : (
              <div className="text-slate-400 text-center py-6 text-xs">Chưa có tài liệu chuyên môn</div>
            )}
          </Card>

          <VerificationHistoryCard submissions={submissions} />

          {teacherId && <TeacherContractsCard teacherId={teacherId} isVerified={status === 'VERIFIED'} />}
        </Col>

        {/* RIGHT COLUMN - ACTIONS */}
        <Col xs={24} lg={8}>
          <div className="sticky top-20 flex flex-col gap-6">
            <Card className="rounded-2xl shadow-[0_2px_8px_rgba(15,118,110,0.04)] border-[#D6E5E2] border-t-4 border-t-[#0D9488]">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#CCFBF1] flex items-center justify-center text-[#0F766E] font-bold text-lg shrink-0">
                  <CheckSquareFilled />
                </div>
                <div>
                  <Title level={5} className="!m-0 text-[#163B40] font-bold">Biên bản thẩm định</Title>
                  <div className="text-xs text-[#64748B] mt-0.5">Trạng thái: {STATUS_LABELS[status] ?? status}</div>
                </div>
              </div>

              {previousSubmission && (
                <Alert
                  type="warning"
                  showIcon
                  className="!mb-4 rounded-xl text-xs"
                  title={`Hồ sơ nộp lại (lần ${submissions.length})`}
                  description={
                    previousSubmission.reviewNote
                      ? `Lý do từ chối lần trước: ${previousSubmission.reviewNote}`
                      : 'Xem chi tiết các lần nộp trước ở mục Lịch sử nộp & xét duyệt.'
                  }
                />
              )}

              {teacher.reviewNote && (
                <div className="flex flex-col gap-1 bg-[#F0F8F6] p-3.5 rounded-xl border border-[#D6E5E2] mb-4 text-xs">
                  <span className="text-[#64748B] font-bold uppercase text-[10px]">Ghi chú của admin</span>
                  <span className="text-[#163B40] font-semibold">{teacher.reviewNote}</span>
                </div>
              )}

              {awaitingReview && (
                <div className="flex flex-col gap-3 mt-4">
                  <Button
                    danger
                    block
                    className="rounded-xl h-[42px] font-semibold"
                    onClick={() => setIsRejectModalOpen(true)}
                  >
                    Từ chối hồ sơ
                  </Button>
                  <button
                    onClick={() => setIsApproveModalOpen(true)}
                    className="w-full h-[48px] rounded-xl bg-[#0D9488] hover:bg-[#0B746C] text-white font-bold text-sm shadow-xs transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>Phê duyệt & Kích hoạt quyền mở lớp</span>
                  </button>
                </div>
              )}
            </Card>
          </div>
        </Col>
      </Row>

      {/* Reject Modal */}
      <Modal
        title="Từ chối hồ sơ xác minh"
        open={isRejectModalOpen}
        onCancel={() => !rejectMutation.isPending && setIsRejectModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Paragraph className="text-slate-500 text-xs mb-4">
          Giáo viên sẽ nhận được lý do chung và chi tiết từng tài liệu để nộp bổ sung.
        </Paragraph>
        <Form form={form} layout="vertical" onFinish={(values) => rejectMutation.mutate(values)}>
          <Form.Item
            label="Lý do từ chối (Gửi cho giáo viên)"
            name="reviewNote"
            rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập lý do từ chối.' }]}
          >
            <Input.TextArea rows={4} placeholder="Nêu rõ lý do từ chối..." className="rounded-xl" />
          </Form.Item>
          {pendingDocuments.filter((d) => d._id).map((d) => (
            <Form.Item
              key={d._id}
              name={['reasons', d._id as string]}
              label={d.documentType === 'IDENTITY' ? 'Giấy tờ định danh cần sửa' : 'Bằng cấp / chứng chỉ cần sửa'}
            >
              <Input placeholder="Ví dụ: Ảnh mặt trước bị mờ hoặc loá" maxLength={1000} className="rounded-xl" />
            </Form.Item>
          ))}
          <div className="flex justify-end gap-2.5 pt-2">
            <Button onClick={() => setIsRejectModalOpen(false)} disabled={rejectMutation.isPending} className="rounded-xl">
              Hủy
            </Button>
            <Button type="primary" danger htmlType="submit" loading={rejectMutation.isPending} className="rounded-xl">
              Gửi từ chối
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Approve Modal */}
      <Modal
        title="Xác nhận phê duyệt hồ sơ"
        open={isApproveModalOpen}
        onCancel={() => !approveMutation.isPending && setIsApproveModalOpen(false)}
        onOk={() => approveForm.submit()}
        confirmLoading={approveMutation.isPending}
        okText="Duyệt giáo viên"
        cancelText="Hủy"
        okButtonProps={{ className: 'bg-teal-600 hover:bg-teal-700' }}
        destroyOnClose
      >
        <div className="py-2">
          <Paragraph className="text-slate-700 text-sm">
            Bạn xác nhận hồ sơ của giáo viên này hợp lệ và đồng ý cấp quyền <strong>Mở lớp học trực tuyến</strong> trên hệ thống Edunity?
          </Paragraph>
          {ocrMismatch && (
            <Alert
              type="warning"
              showIcon
              className="!mb-3 text-xs"
              message="Kết quả OCR không khớp với thông tin giáo viên khai báo. Hãy ghi rõ lý do vẫn phê duyệt."
            />
          )}
          <Form form={approveForm} layout="vertical" onFinish={({ reviewNote }) => approveMutation.mutate(reviewNote)}>
            <Form.Item
              name="reviewNote"
              label="Ghi chú phê duyệt (Tùy chọn)"
              rules={ocrMismatch ? [{ required: true, whitespace: true, message: 'Bắt buộc khi OCR không khớp.' }] : []}
            >
              <Input.TextArea rows={2} maxLength={2000} className="rounded-xl" placeholder="Nhập ghi chú lưu hồ sơ..." />
            </Form.Item>
          </Form>
        </div>
      </Modal>
    </div>
  );
}
