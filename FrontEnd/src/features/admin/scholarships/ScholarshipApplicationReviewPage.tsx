import { useState } from 'react';
import { Typography, Breadcrumb, Button, Card, Row, Col, Avatar, Tag, Form, Input, Checkbox, message, Modal, Select } from 'antd';
import { 
  CheckCircleOutlined,
  PhoneOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  AuditOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import { ROUTES } from '../../../routes/routePaths';
import { mockAdminScholarships } from '../../../data/mockAdminScholarships';
import type { ApplicationDocument } from '../../../types/admin';

const { Title, Paragraph } = Typography;

export default function ScholarshipApplicationReviewPage() {
  const { applicationId } = useParams();
  const app = mockAdminScholarships.find((a: any) => a.id === (applicationId || "APP-2026-001")) || mockAdminScholarships[0];
  
  const [status, setStatus] = useState(app.status);
  const [isRequestInfoModalOpen, setIsRequestInfoModalOpen] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);

  const handleApprove = () => {
    message.success('Đã phê duyệt hồ sơ học bổng thành công!');
    setStatus('APPROVED');
    setIsApproveModalOpen(false);
  };

  const handleRequestInfo = () => {
    message.warning('Đã gửi yêu cầu bổ sung hồ sơ cho học sinh.');
    setStatus('NEED_MORE_INFORMATION');
    setIsRequestInfoModalOpen(false);
  };

  const handleReject = () => {
    message.error('Đã từ chối hồ sơ học bổng.');
    setStatus('REJECTED');
    setIsRejectModalOpen(false);
  };

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      <Breadcrumb 
        className="mb-2 text-sm font-medium"
        items={[
          { title: <a href={ROUTES.ADMIN.HOME}>Tổng quan</a> },
          { title: <a href={ROUTES.ADMIN.SCHOLARSHIP_APPLICATIONS}>Hồ sơ học bổng</a> },
          { title: app.id },
        ]}
      />

      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <Title level={3} className="!m-0 text-gray-900 mb-1">Xét duyệt hồ sơ học bổng – {app.studentName}</Title>
          <div className="flex items-center gap-3 mt-2">
            {status === 'SUBMITTED' && <Tag color="processing" className="!m-0 rounded font-bold">CHỜ THẨM ĐỊNH (SUBMITTED)</Tag>}
            {status === 'APPROVED' && <Tag color="success" className="!m-0 rounded font-bold">ĐÃ PHÊ DUYỆT</Tag>}
            {status === 'NEED_MORE_INFORMATION' && <Tag color="warning" className="!m-0 rounded font-bold">CẦN BỔ SUNG</Tag>}
            {status === 'REJECTED' && <Tag color="error" className="!m-0 rounded font-bold">TỪ CHỐI</Tag>}
            <span className="text-gray-500 font-medium text-sm"><ClockCircleOutlined /> Nộp ngày {app.submittedDate}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button className="rounded-lg font-medium" href={ROUTES.ADMIN.SCHOLARSHIP_APPLICATIONS}>Quay lại danh sách</Button>
        </div>
      </div>

      <Row gutter={[24, 24]}>
        {/* LEFT COLUMN - CONTENT */}
        <Col xs={24} lg={17} className="flex flex-col gap-6">
          
          <Card className="rounded-2xl shadow-sm border-gray-100">
            <div className="flex items-start gap-4 mb-6">
              <Avatar size={72} className="bg-indigo-100 text-indigo-700 text-2xl font-bold shrink-0">{app.studentName.substring(0, 2).toUpperCase()}</Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Title level={4} className="!m-0 text-gray-900">{app.studentName}</Title>
                  <Tag color="success" className="rounded-full border-0 !m-0"><CheckCircleOutlined /></Tag>
                </div>
                <div className="text-sm font-medium text-gray-500 mb-2">{app.school} • {app.grade}</div>
                <Tag color="green" className="rounded font-bold border-0 bg-emerald-100 text-emerald-700">{app.grade}</Tag>
              </div>
            </div>

            <Row gutter={[24, 16]}>
              <Col span={12}>
                <div className="flex items-center gap-2 text-gray-500 text-xs font-bold uppercase mb-1"><MailOutlined /> Email liên hệ</div>
                <div className="font-medium text-gray-900">{app.email}</div>
              </Col>
              <Col span={12}>
                <div className="flex items-center gap-2 text-gray-500 text-xs font-bold uppercase mb-1"><PhoneOutlined /> Số điện thoại</div>
                <div className="font-medium text-gray-900">{app.phone}</div>
              </Col>
            </Row>
          </Card>

          <Card className="rounded-2xl shadow-sm border-indigo-100 bg-indigo-50/30" title={<span className="font-bold flex items-center gap-2 text-indigo-900"><SafetyCertificateOutlined /> Chính sách & Định mức chiến dịch</span>} extra={<Tag color="indigo" className="font-bold border-0">ADMIN READ-ONLY</Tag>}>
            <div className="flex items-start gap-3 bg-white p-4 rounded-xl border border-indigo-100 shadow-sm mb-4">
              <div className="text-indigo-600 mt-1"><ExclamationCircleOutlined /></div>
              <div>
                <div className="font-bold text-indigo-900 mb-1">Mức hỗ trợ quy định bởi Campaign (Admin không can thiệp số tiền)</div>
                <div className="text-sm text-gray-600">Mọi khoản tài trợ được tự động ràng buộc theo điều lệ chiến dịch đã được ban hành và đóng băng kiểm toán.</div>
              </div>
            </div>

            <Row gutter={[16, 16]}>
              <Col span={8}>
                <div className="bg-white p-4 rounded-xl border border-gray-100 h-full">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">CHIẾN DỊCH XÉT DUYỆT</div>
                  <div className="font-bold text-gray-900 text-base">{app.campaignTitle}</div>
                </div>
              </Col>
              <Col span={8}>
                <div className="bg-indigo-600 p-4 rounded-xl border border-indigo-600 h-full text-white">
                  <div className="text-xs font-bold text-indigo-200 uppercase tracking-wider mb-2">ĐỊNH MỨC PHÊ DUYỆT</div>
                  <div className="font-bold text-2xl">{app.awardAmount.toLocaleString('vi-VN')}đ</div>
                  <div className="text-xs text-indigo-100">/ học kỳ (Khóa 2026 - 2027)</div>
                </div>
              </Col>
              <Col span={8}>
                <div className="bg-white p-4 rounded-xl border border-gray-100 h-full">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">QUỸ KHẢ DỤNG CHIẾN DỊCH</div>
                  <div className="font-bold text-emerald-600 text-2xl">120.000.000đ</div>
                  <div className="text-xs text-emerald-600 font-medium mt-1 flex items-center gap-1"><CheckCircleOutlined /> Đủ nguồn quỹ giải ngân</div>
                </div>
              </Col>
            </Row>
          </Card>

          <Card className="rounded-2xl shadow-sm border-gray-100" title={<span className="font-bold flex items-center gap-2"><AuditOutlined className="text-indigo-500" /> Thư xin học bổng & Động lực phấn đấu</span>}>
            <div className="flex flex-col gap-6">
              <div>
                <Title level={5} className="!text-indigo-700 !mb-2 flex items-center gap-2">1. Hoàn cảnh kinh tế gia đình</Title>
                <Paragraph className="text-gray-800 text-base leading-relaxed bg-gray-50 p-4 rounded-xl">"{app.reason} {app.familySituation}"</Paragraph>
              </div>
              <div>
                <Title level={5} className="!text-indigo-700 !mb-2 flex items-center gap-2">2. Mục tiêu học tập & Cam kết</Title>
                <Paragraph className="text-gray-800 text-base leading-relaxed bg-gray-50 p-4 rounded-xl">"{app.learningGoal} {app.additionalStatement}"</Paragraph>
              </div>
            </div>
          </Card>

          <Card className="rounded-2xl shadow-sm border-gray-100" title={<span className="font-bold flex items-center gap-2">Hồ sơ minh chứng đính kèm</span>}>
            <Row gutter={[16, 16]}>
              {app.documents.map((doc: ApplicationDocument, index: number) => (
                <Col span={12} key={doc.id}>
                  <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50 relative group">
                    {doc.verified && <div className="absolute top-2 right-2 bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded font-bold shadow-sm border border-emerald-200 z-10"><CheckCircleOutlined /> Hợp lệ</div>}
                    <img src={`https://picsum.photos/400/250?random=${index + 10}`} alt={doc.name} className="w-full h-[180px] object-cover opacity-80" />
                    <div className="p-3 bg-white border-t border-gray-100 flex flex-col gap-1">
                      <div className="font-bold text-gray-800 text-sm truncate">{doc.name}</div>
                      <div className="text-xs text-gray-500 font-medium">{doc.type === 'PROOF_OF_POVERTY' ? 'Giấy xác nhận hộ nghèo' : doc.type === 'TRANSCRIPT' ? 'Học bạ' : doc.type === 'ID_CARD' ? 'CCCD' : 'Tài liệu khác'}</div>
                    </div>
                  </div>
                </Col>
              ))}
            </Row>
          </Card>

        </Col>

        {/* RIGHT COLUMN - ACTIONS */}
        <Col xs={24} lg={7}>
          <div className="sticky top-6 flex flex-col gap-6">
            <Card className="rounded-2xl shadow-sm border-gray-100 border-t-4 border-t-indigo-600">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-lg"><CheckCircleOutlined /></div>
                <div>
                  <Title level={5} className="!m-0 text-gray-900">Thẩm định & Quyết định</Title>
                </div>
              </div>

              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">BẢNG ĐỐI CHIẾU TIÊU CHÍ (4/4)</div>
              <div className="flex flex-col gap-3 bg-gray-50 p-4 rounded-xl border border-gray-100 mb-4">
                <div className="flex gap-2">
                  <CheckCircleOutlined className="text-emerald-500 mt-1" />
                  <span className="text-sm text-gray-700 font-medium">Độ tuổi & Khối lớp hợp lệ ({app.grade})</span>
                </div>
                <div className="flex gap-2">
                  <CheckCircleOutlined className="text-emerald-500 mt-1" />
                  <span className="text-sm text-gray-700 font-medium">Thành tích học tập đạt chuẩn</span>
                </div>
                <div className="flex gap-2">
                  <CheckCircleOutlined className="text-emerald-500 mt-1" />
                  <span className="text-sm text-gray-700 font-medium">Giấy tờ định danh & học bạ đầy đủ, rõ nét</span>
                </div>
                <div className="flex gap-2">
                  <CheckCircleOutlined className="text-emerald-500 mt-1" />
                  <span className="text-sm text-gray-700 font-medium">Quỹ chiến dịch còn đủ ngân sách</span>
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="text-emerald-700 text-xs font-bold uppercase">KẾT LUẬN HỆ THỐNG</div>
                  <CheckCircleOutlined className="text-emerald-600" />
                </div>
                <div className="font-bold text-emerald-800 text-lg leading-tight mb-2">ĐỦ ĐIỀU KIỆN CẤP HỌC BỔNG</div>
                <div className="flex justify-between items-center pt-2 border-t border-emerald-200/50">
                  <span className="text-emerald-700 text-xs font-medium">Mức giải ngân tự động:</span>
                  <span className="font-bold text-emerald-700">{app.awardAmount.toLocaleString('vi-VN')}đ</span>
                </div>
              </div>

              <Form layout="vertical">
                <Form.Item label={<span className="font-bold text-gray-700">Ghi chú của Thẩm định viên</span>}>
                  <Input.TextArea rows={4} className="rounded-xl bg-gray-50 text-sm" placeholder="Ghi chú nội bộ..." defaultValue="Hồ sơ xác minh đạt chuẩn, hoàn cảnh gia đình đúng thực tế. Đề xuất phê duyệt cấp học bổng." />
                </Form.Item>
              </Form>

              <div className="flex flex-col gap-3 mt-2">
                <Button type="primary" block className="rounded-xl h-[50px] font-bold bg-emerald-600 hover:bg-emerald-700" onClick={() => setIsApproveModalOpen(true)}>
                  Phê duyệt cấp học bổng
                </Button>
                <Button block className="rounded-xl h-[44px] font-semibold bg-indigo-50 text-indigo-600 border-indigo-200" onClick={() => setIsRequestInfoModalOpen(true)}>Yêu cầu bổ sung hồ sơ</Button>
                <Button block danger className="rounded-xl h-[44px] font-semibold bg-red-50" onClick={() => setIsRejectModalOpen(true)}>Từ chối hồ sơ</Button>
              </div>
            </Card>
          </div>
        </Col>
      </Row>

      {/* MODALS */}
      <Modal
        title="Xác nhận phê duyệt hồ sơ"
        open={isApproveModalOpen}
        onCancel={() => setIsApproveModalOpen(false)}
        onOk={handleApprove}
        okText="Phê duyệt"
        cancelText="Hủy"
        okButtonProps={{ className: 'bg-emerald-600' }}
      >
        <div className="py-4">
          <Paragraph>
            Bạn xác nhận phê duyệt cấp học bổng cho học sinh <strong>{app.studentName}</strong>?
          </Paragraph>
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 my-4 flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Chiến dịch:</span>
              <span className="font-medium text-gray-900">{app.campaignTitle}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Mức hỗ trợ quy định:</span>
              <span className="font-bold text-emerald-600">{app.awardAmount.toLocaleString('vi-VN')}đ</span>
            </div>
          </div>
          <Paragraph className="text-gray-500 text-sm">
            Sau khi duyệt, hệ thống sẽ tự động cập nhật ngân sách chiến dịch và gửi thông báo tới học sinh.
          </Paragraph>
        </div>
      </Modal>

      <Modal
        title="Yêu cầu bổ sung hồ sơ"
        open={isRequestInfoModalOpen}
        onCancel={() => setIsRequestInfoModalOpen(false)}
        onOk={handleRequestInfo}
        okText="Gửi yêu cầu"
        cancelText="Hủy"
        okButtonProps={{ className: 'bg-indigo-600' }}
      >
        <div className="mb-4 text-gray-600">Học sinh cần bổ sung hoặc làm rõ các thông tin sau:</div>
        <Checkbox.Group className="flex flex-col gap-3 mb-4 w-full">
          <Checkbox value="cccd">Căn cước công dân bị mờ / không hợp lệ</Checkbox>
          <Checkbox value="transcript">Học bạ thiếu dấu mộc của nhà trường</Checkbox>
          <Checkbox value="poverty">Giấy xác nhận hộ nghèo/cận nghèo quá hạn</Checkbox>
          <Checkbox value="other">Tài liệu khác</Checkbox>
        </Checkbox.Group>
        <div className="font-semibold mb-2">Ghi chú gửi học sinh</div>
        <Input.TextArea rows={4} placeholder="Nhập yêu cầu chi tiết..." />
      </Modal>

      <Modal
        title="Từ chối hồ sơ"
        open={isRejectModalOpen}
        onCancel={() => setIsRejectModalOpen(false)}
        onOk={handleReject}
        okText="Từ chối"
        cancelText="Hủy"
        okButtonProps={{ danger: true }}
      >
        <div className="py-4 text-gray-600">
          <Paragraph>Vui lòng chọn lý do từ chối hồ sơ này (bắt buộc):</Paragraph>
          <Select 
            className="w-full mb-4" 
            placeholder="Chọn lý do từ chối..."
            options={[
              { value: 'NOT_ELIGIBLE', label: 'Không đáp ứng tiêu chí chương trình' },
              { value: 'FAKE_DOC', label: 'Giấy tờ không hợp lệ / có dấu hiệu giả mạo' },
              { value: 'FUND_EXHAUSTED', label: 'Quỹ học bổng đã hết suất' },
              { value: 'OTHER', label: 'Lý do khác' }
            ]}
          />
          <div className="font-semibold mb-2">Chi tiết lý do</div>
          <Input.TextArea rows={4} placeholder="Nhập lý do chi tiết..." />
        </div>
      </Modal>
    </div>
  );
}
