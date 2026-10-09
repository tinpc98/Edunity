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
} from 'antd';
import { 
  CheckCircleOutlined,
  PhoneOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  AuditOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ROUTES } from '../../../routes/routePaths';
import {
  scholarshipApplicationService,
  scholarshipApplicationKeys,
} from '../../../services/scholarshipApplication.service';
import {
  SCHOLARSHIP_APP_STATUS_LABELS,
  SCHOLARSHIP_APP_STATUS_COLORS,
} from '../../../types/scholarship';
import { formatVND } from '../../../types/payment';

const { Title, Paragraph, Text } = Typography;
const { TextArea } = Input;

export default function ScholarshipApplicationReviewPage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isRequestInfoModalOpen, setIsRequestInfoModalOpen] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);

  const [approveForm] = Form.useForm();
  const [requestInfoForm] = Form.useForm();
  const [rejectForm] = Form.useForm();

  // Fetch application detail from real API
  const { data: app, isLoading, isError } = useQuery({
    queryKey: scholarshipApplicationKeys.detail(applicationId || ''),
    queryFn: () => (applicationId ? scholarshipApplicationService.adminGetApplication(applicationId) : null),
    enabled: Boolean(applicationId),
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
      message.error(err.message || 'Phê duyệt thất bại. Vui lòng thử lại.');
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
      message.error(err.message || 'Không thể gửi yêu cầu bổ sung.');
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
      message.error(err.message || 'Từ chối hồ sơ thất bại.');
    },
  });

  const handleApproveSubmit = async () => {
    const values = await approveForm.validateFields();
    approveMutation.mutate(values.reviewNote);
  };

  const handleRequestInfoSubmit = async () => {
    const values = await requestInfoForm.validateFields();
    requestInfoMutation.mutate(values.reviewNote);
  };

  const handleRejectSubmit = async () => {
    const values = await rejectForm.validateFields();
    rejectMutation.mutate(values.reviewNote);
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

  const isReviewable = app.status === 'SUBMITTED';
  const studentDisplayName = app.student?.fullName || app.studentName || app.studentEmail || 'Học viên';

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      <Breadcrumb 
        className="mb-2 text-sm font-medium"
        items={[
          { title: <Link to={ROUTES.ADMIN.HOME}>Tổng quan</Link> },
          { title: <Link to={ROUTES.ADMIN.SCHOLARSHIP_APPLICATIONS}>Hồ sơ học bổng</Link> },
          { title: app.id },
        ]}
      />

      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <Title level={3} className="!m-0 text-gray-900 mb-1">
            Xét duyệt hồ sơ học bổng – {studentDisplayName}
          </Title>
          <div className="flex items-center gap-3 mt-2">
            <Tag 
              color={SCHOLARSHIP_APP_STATUS_COLORS[app.status]} 
              className="!m-0 rounded font-bold uppercase"
            >
              {SCHOLARSHIP_APP_STATUS_LABELS[app.status]}
            </Tag>
            <span className="text-gray-500 font-medium text-xs flex items-center gap-1">
              <ClockCircleOutlined /> Nộp ngày {new Date(app.submittedAt).toLocaleDateString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}
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

      <Row gutter={[24, 24]}>
        {/* LEFT COLUMN - CONTENT */}
        <Col xs={24} lg={16} className="flex flex-col gap-6">
          {/* Student Profile Card */}
          <Card className="rounded-2xl shadow-sm border-gray-100">
            <div className="flex items-start gap-4 mb-6">
              <Avatar size={64} className="bg-indigo-100 text-indigo-700 text-2xl font-bold shrink-0">
                {studentDisplayName.substring(0, 2).toUpperCase()}
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Title level={4} className="!m-0 text-gray-900">{studentDisplayName}</Title>
                  <Tag color="cyan" className="rounded-full border-0 !m-0 text-xs">Học sinh</Tag>
                </div>
                <div className="text-xs text-gray-500 font-medium">
                  {app.student?.school ? `${app.student.school} • ` : ''}
                  {app.student?.grade ? `Khối ${app.student.grade}` : 'Thông tin hồ sơ'}
                </div>
              </div>
            </div>

            <Row gutter={[24, 16]}>
              <Col span={12}>
                <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase mb-1">
                  <MailOutlined /> Email liên hệ
                </div>
                <div className="font-medium text-gray-900 text-sm">{app.student?.email || app.studentEmail || '—'}</div>
              </Col>
              <Col span={12}>
                <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase mb-1">
                  <PhoneOutlined /> Số điện thoại
                </div>
                <div className="font-medium text-gray-900 text-sm">{app.student?.phoneNumber || '—'}</div>
              </Col>
            </Row>
          </Card>

          {/* Campaign Policy Card */}
          <Card 
            className="rounded-2xl shadow-sm border-indigo-100 bg-indigo-50/20" 
            title={
              <span className="font-bold flex items-center gap-2 text-indigo-900">
                <SafetyCertificateOutlined /> Chính sách & Định mức chiến dịch
              </span>
            } 
            extra={<Tag color="indigo" className="font-bold border-0">ADMIN READ-ONLY (BR-37)</Tag>}
          >
            <div className="flex items-start gap-3 bg-white p-4 rounded-xl border border-indigo-100 shadow-2xs mb-4">
              <div className="text-indigo-600 mt-0.5"><ExclamationCircleOutlined /></div>
              <div className="text-xs text-gray-600">
                <strong className="text-indigo-900 block mb-0.5">Mức tài trợ được quy định bởi Campaign</strong>
                Số tiền học bổng cấp phát được tự động cố định theo quy chuẩn của chiến dịch. Admin chỉ thẩm định tính hợp lệ của hồ sơ, không thể tùy tiện nhập số tiền.
              </div>
            </div>

            <Row gutter={[16, 16]}>
              <Col span={12}>
                <div className="bg-white p-4 rounded-xl border border-gray-100 h-full">
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">CHIẾN DỊCH</div>
                  <div className="font-bold text-gray-900 text-base">{app.campaignTitle || app.campaign?.title}</div>
                </div>
              </Col>
              <Col span={12}>
                <div className="bg-indigo-600 p-4 rounded-xl border border-indigo-600 h-full text-white">
                  <div className="text-xs font-bold text-indigo-200 uppercase tracking-wider mb-1">ĐỊNH MỨC PHÊ DUYỆT</div>
                  <div className="font-black text-2xl">{formatVND(app.awardAmountPerStudent)}</div>
                  <div className="text-xs text-indigo-100 mt-1">Cấp tự động khi duyệt thành công</div>
                </div>
              </Col>
            </Row>
          </Card>

          {/* Statement Card */}
          <Card 
            className="rounded-2xl shadow-sm border-gray-100" 
            title={
              <span className="font-bold flex items-center gap-2">
                <AuditOutlined className="text-indigo-600" /> Thư nguyện vọng & Hoàn cảnh học sinh
              </span>
            }
          >
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-gray-800 text-sm whitespace-pre-wrap leading-relaxed">
              {app.statement || 'Không có nội dung thư nguyện vọng.'}
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
                  <div key={doc._id || docIdx} className="space-y-2">
                    <div className="text-xs font-bold text-gray-700 uppercase">
                      Tài liệu #{docIdx + 1}: {doc.documentType || 'SCHOLARSHIP_PROOF'}
                    </div>
                    <Row gutter={[16, 16]}>
                      {doc.files.map((file, fileIdx) => {
                        const isPdf = file.mimeType?.includes('pdf') || file.storageKey.endsWith('.pdf');
                        return (
                          <Col span={12} sm={8} key={file.storageKey || fileIdx}>
                            <div className="border border-gray-200 rounded-xl p-3 bg-gray-50 hover:border-indigo-300 transition-all flex flex-col justify-between gap-3 h-full">
                              <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 text-base">
                                  {isPdf ? <FilePdfOutlined /> : <FileImageOutlined />}
                                </div>
                                <div className="overflow-hidden">
                                  <div className="text-xs font-semibold text-gray-800 truncate" title={file.storageKey}>
                                    {file.side}
                                  </div>
                                  <div className="text-[10px] text-gray-400 truncate">
                                    {file.mimeType || 'Tệp đính kèm'}
                                  </div>
                                </div>
                              </div>

                              {file.signedUrl ? (
                                <a 
                                  href={file.signedUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="w-full"
                                >
                                  <Button 
                                    size="small" 
                                    icon={<DownloadOutlined />} 
                                    className="w-full rounded-lg text-xs font-semibold text-indigo-600 border-indigo-200 bg-white hover:bg-indigo-50"
                                  >
                                    Xem tài liệu
                                  </Button>
                                </a>
                              ) : (
                                <Button size="small" disabled className="w-full rounded-lg text-xs">
                                  Chưa có URL xem
                                </Button>
                              )}
                            </div>
                          </Col>
                        );
                      })}
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
            <Card className="rounded-2xl shadow-sm border-gray-100 border-t-4 border-t-indigo-600">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-lg">
                  <CheckCircleOutlined />
                </div>
                <div>
                  <Title level={5} className="!m-0 text-gray-900">Thẩm định & Quyết định</Title>
                  <Text className="text-xs text-gray-500">Quyết định phê duyệt hồ sơ ứng tuyển</Text>
                </div>
              </div>

              {/* Status info if already processed */}
              {!isReviewable && (
                <div className="mb-4">
                  <Alert
                    type={app.status === 'APPROVED' ? 'success' : app.status === 'REJECTED' ? 'error' : 'warning'}
                    showIcon
                    message={`Hồ sơ ở trạng thái: ${SCHOLARSHIP_APP_STATUS_LABELS[app.status]}`}
                    description={
                      app.reviewNote ? (
                        <div className="mt-1 text-xs">
                          <strong>Ghi chú:</strong> {app.reviewNote}
                        </div>
                      ) : null
                    }
                    className="rounded-xl text-xs"
                  />
                </div>
              )}

              {/* Action buttons */}
              {isReviewable && (
                <div className="flex flex-col gap-3">
                  <Button 
                    type="primary" 
                    block 
                    className="rounded-xl h-[48px] font-bold bg-emerald-600 hover:bg-emerald-700 shadow-xs" 
                    onClick={() => setIsApproveModalOpen(true)}
                  >
                    Phê duyệt cấp học bổng
                  </Button>
                  <Button 
                    block 
                    className="rounded-xl h-[44px] font-semibold bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100" 
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
                  <div>Mã: {app.scholarship.id}</div>
                  <div>Hạn dùng: {new Date(app.scholarship.expiresAt).toLocaleDateString('vi-VN')}</div>
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
              <span className="font-bold text-emerald-600 text-sm">{formatVND(app.awardAmountPerStudent)}</span>
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
                className="bg-indigo-600 hover:bg-indigo-700 font-semibold"
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
    </div>
  );
}
