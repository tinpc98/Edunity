import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Typography, Breadcrumb, Button, Card, Row, Col, Avatar, Tag, Divider, Form, Input, message, Modal, Skeleton } from 'antd';
import { 
  CheckCircleOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
  MailOutlined,
  SolutionOutlined,
  FileSearchOutlined,
  EyeOutlined,
  CheckSquareFilled
} from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { ROUTES } from '../../../../routes/routePaths';
import { teacherVerificationService } from '../../../../services/teacherVerification.service';

const { Title, Paragraph } = Typography;

export default function TeacherVerificationDetailPage() {
  const { teacherId } = useParams();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);

  const { data: teacher, isLoading, isError } = useQuery({
    queryKey: ['admin-teacher-verification', teacherId],
    queryFn: () => teacherVerificationService.adminGetVerification(teacherId as string),
    enabled: !!teacherId,
  });

  const approveMutation = useMutation({
    mutationFn: () => teacherVerificationService.adminApproveVerification(teacherId as string),
    onSuccess: () => {
      message.success('Đã phê duyệt và cấp chứng nhận giáo viên thành công!');
      queryClient.invalidateQueries({ queryKey: ['admin-teacher-verification', teacherId] });
      setIsApproveModalOpen(false);
    },
    onError: (err: any) => {
      message.error(err.message || 'Phê duyệt thất bại.');
    }
  });

  const rejectMutation = useMutation({
    mutationFn: (values: { reviewNote: string }) => teacherVerificationService.adminRejectVerification(teacherId as string, values.reviewNote),
    onSuccess: () => {
      message.success('Đã từ chối hồ sơ xác minh.');
      queryClient.invalidateQueries({ queryKey: ['admin-teacher-verification', teacherId] });
      setIsRejectModalOpen(false);
      form.resetFields();
    },
    onError: (err: any) => {
      message.error(err.message || 'Từ chối thất bại.');
    }
  });

  if (isLoading) {
    return <div className="p-10"><Skeleton active paragraph={{ rows: 10 }} /></div>;
  }

  if (isError || !teacher) {
    return <div className="p-10 text-red-500">Không tìm thấy thông tin xác minh.</div>;
  }

  const identityDoc = teacher.documents?.find(d => d.documentType === 'IDENTITY');
  const qualificationDoc = teacher.documents?.find(d => d.documentType === 'QUALIFICATION');

  const status = teacher.verificationStatus;

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      <Breadcrumb 
        className="mb-2 text-sm font-medium"
        items={[
          { title: <a href={ROUTES.ADMIN.HOME}>Tổng quan</a> },
          { title: <a href={ROUTES.ADMIN.TEACHER_VERIFICATIONS}>Xác minh giáo viên</a> },
          { title: teacher.fullName },
        ]}
      />

      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-5">
          <Avatar size={72} className="bg-indigo-100 text-indigo-700 text-2xl font-bold">{teacher.fullName.substring(0, 2).toUpperCase()}</Avatar>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Title level={3} className="!m-0 text-gray-900">{teacher.fullName}</Title>
              {status === 'PENDING' && <Tag color="processing" className="!m-0 rounded font-bold">Chờ duyệt</Tag>}
              {status === 'VERIFIED' && <Tag color="success" className="!m-0 rounded font-bold">Đã xác minh</Tag>}
              {status === 'REJECTED' && <Tag color="error" className="!m-0 rounded font-bold">Từ chối</Tag>}
            </div>
            <div className="text-gray-500 font-medium mt-2 flex flex-wrap gap-4">
              <span className="flex items-center gap-1.5"><SolutionOutlined /> Chuyên môn: <strong className="text-gray-800">{teacher.qualificationSummary || 'Chưa cập nhật'}</strong></span>
              <span>• Mã hồ sơ: <strong>#TCH-{teacher.teacherId.substring(0, 6).toUpperCase()}</strong></span>
              {teacher.reviewedAt && (
                <span>• Ngày xét duyệt: <strong>{dayjs(teacher.reviewedAt).format('DD/MM/YYYY')}</strong></span>
              )}
            </div>
          </div>
        </div>
      </div>

      <Row gutter={[24, 24]}>
        {/* LEFT COLUMN - CONTENT */}
        <Col xs={24} lg={17} className="flex flex-col gap-6">
          
          <Card className="rounded-2xl shadow-sm border-gray-100" title={<span className="font-bold flex items-center gap-2"><UserOutlined className="text-indigo-500" /> Thông tin cá nhân & Thiết lập sư phạm</span>}>
            <Row gutter={[24, 16]}>
              <Col span={12}>
                <div className="text-gray-500 text-xs font-bold uppercase mb-1">Họ và tên</div>
                <div className="font-medium text-gray-900">{teacher.fullName}</div>
              </Col>
              <Col span={12}>
                <div className="text-gray-500 text-xs font-bold uppercase mb-1">Email liên hệ</div>
                <div className="font-medium text-gray-900 flex items-center gap-2"><MailOutlined className="text-gray-400" /> {teacher.email}</div>
              </Col>
              <Col span={24}>
                <Divider className="my-2" />
              </Col>
              <Col span={24}>
                <div className="text-gray-500 text-xs font-bold uppercase mb-1">Tiểu sử & Cam kết (Bio)</div>
                <Paragraph className="font-medium text-gray-800 bg-gray-50 p-4 rounded-xl border border-gray-100 italic">"{teacher.biography || 'Chưa cập nhật'}"</Paragraph>
              </Col>
            </Row>
          </Card>

          <Card className="rounded-2xl shadow-sm border-gray-100" title={<span className="font-bold flex items-center gap-2"><SafetyCertificateOutlined className="text-indigo-500" /> Xác minh danh tính cá nhân</span>}>
            {identityDoc ? (
              <Row gutter={[16, 16]}>
                {identityDoc.files.map((file) => (
                  <Col span={12} key={file.storageKey}>
                    <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50 relative group">
                      <div className="absolute top-2 right-2 bg-emerald-500 text-white text-xs px-2 py-0.5 rounded font-bold shadow z-10"><CheckCircleOutlined /> Đã tải lên</div>
                      <img src={file.url} alt={`CCCD ${file.side}`} className="w-full h-[220px] object-cover" />
                      <div className="p-3 bg-white border-t border-gray-100 flex justify-between items-center">
                        <span className="font-bold text-gray-800 text-sm">Mặt {file.side === 'FRONT' ? 'Trước' : file.side === 'BACK' ? 'Sau' : 'Đơn'}</span>
                        <a href={file.url} target="_blank" rel="noreferrer">
                          <Button type="text" size="small" icon={<EyeOutlined />} className="text-indigo-600">Xem lớn</Button>
                        </a>
                      </div>
                    </div>
                  </Col>
                ))}
              </Row>
            ) : (
              <div className="text-gray-500 text-center py-6">Chưa có tài liệu định danh</div>
            )}
          </Card>

          <Card className="rounded-2xl shadow-sm border-gray-100" title={<span className="font-bold flex items-center gap-2"><FileSearchOutlined className="text-indigo-500" /> Bằng cấp & Chứng chỉ Sư phạm</span>}>
            {qualificationDoc ? (
              <div className="flex flex-col gap-4">
                {qualificationDoc.files.map(file => (
                  <div key={file.storageKey} className="flex items-start gap-4 p-4 border border-gray-200 rounded-xl hover:border-indigo-300 transition-colors bg-white">
                    <div className="w-24 h-32 bg-gray-100 rounded border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center relative">
                      <img src={file.url} className="w-full h-full object-cover" alt="" />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-1">
                        <Title level={5} className="!m-0">Chứng chỉ chuyên môn</Title>
                        <a href={file.url} target="_blank" rel="noreferrer">
                          <Button type="text" className="text-indigo-600 font-medium" icon={<EyeOutlined />}>Xem chi tiết</Button>
                        </a>
                      </div>
                      <div className="text-sm text-gray-800 font-medium mb-2">Tài liệu đã được tải lên để xác minh.</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500 text-center py-6">Chưa có tài liệu chuyên môn</div>
            )}
          </Card>

        </Col>

        {/* RIGHT COLUMN - ACTIONS */}
        <Col xs={24} lg={7}>
          <div className="sticky top-6 flex flex-col gap-6">
            <Card className="rounded-2xl shadow-sm border-gray-100 border-t-4 border-t-indigo-600">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-lg"><CheckSquareFilled /></div>
                <div>
                  <Title level={5} className="!m-0 text-gray-900">Biên bản thẩm định</Title>
                  <div className="text-xs text-gray-500 mt-1">Trạng thái hiện tại: {status}</div>
                </div>
              </div>

              {teacher.reviewNote && (
                <div className="flex flex-col gap-3 bg-gray-50 p-4 rounded-xl border border-gray-100 mb-4">
                  <span className="text-sm text-gray-700 font-medium">Ghi chú của admin: {teacher.reviewNote}</span>
                </div>
              )}

              {status === 'PENDING' && (
                <div className="flex flex-col gap-3 mt-4">
                  <Button danger block className="rounded-xl h-[44px] font-semibold" onClick={() => setIsRejectModalOpen(true)}>Từ chối / Yêu cầu bổ sung</Button>
                  <Button type="primary" block className="rounded-xl h-[54px] font-bold bg-emerald-600 hover:bg-emerald-700 text-base" onClick={() => setIsApproveModalOpen(true)}>
                    Phê duyệt & Kích hoạt quyền mở lớp
                  </Button>
                </div>
              )}
            </Card>
          </div>
        </Col>
      </Row>

      <Modal
        title="Từ chối / Yêu cầu bổ sung hồ sơ"
        open={isRejectModalOpen}
        onCancel={() => !rejectMutation.isPending && setIsRejectModalOpen(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={(values) => rejectMutation.mutate(values)}>
          <Form.Item label="Lý do từ chối (Gửi cho giáo viên)" name="reviewNote" rules={[{ required: true }]}>
            <Input.TextArea rows={4} placeholder="Vui lòng cung cấp CCCD rõ nét hơn..." />
          </Form.Item>
          <div className="flex justify-end gap-3">
            <Button onClick={() => setIsRejectModalOpen(false)} disabled={rejectMutation.isPending}>Hủy</Button>
            <Button type="primary" danger htmlType="submit" loading={rejectMutation.isPending}>Gửi từ chối</Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title="Xác nhận phê duyệt"
        open={isApproveModalOpen}
        onCancel={() => !approveMutation.isPending && setIsApproveModalOpen(false)}
        onOk={() => approveMutation.mutate()}
        confirmLoading={approveMutation.isPending}
        okText="Duyệt giáo viên"
        cancelText="Hủy"
        okButtonProps={{ className: 'bg-emerald-600' }}
      >
        <div className="py-4">
          <Paragraph>
            Bạn xác nhận hồ sơ của giáo viên này hợp lệ và đồng ý cấp quyền <strong>Mở lớp học trực tuyến</strong> trên hệ thống Edunity?
          </Paragraph>
          <Paragraph className="text-gray-500 text-sm">
            Hành động này sẽ cập nhật trạng thái của giáo viên.
          </Paragraph>
        </div>
      </Modal>
    </div>
  );
}
