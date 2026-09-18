import { useState } from 'react';
import { Typography, Breadcrumb, Button, Card, Row, Col, Avatar, Tag, Divider, Form, Input, Checkbox, message, Modal } from 'antd';
import { 
  CheckCircleOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
  PhoneOutlined,
  MailOutlined,
  BankOutlined,
  SolutionOutlined,
  FileSearchOutlined,
  EyeOutlined,
  CheckSquareFilled
} from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import { ROUTES } from '../../../../routes/routePaths';
import { mockAdminTeacherVerifications } from '../../../../data/mockAdminTeacherVerification';

const { Title, Paragraph } = Typography;

export default function TeacherVerificationDetailPage() {
  const { teacherId } = useParams();
  const teacher = mockAdminTeacherVerifications.find((t: any) => t.id === (teacherId || "TEACHER_001")) || mockAdminTeacherVerifications[0];
  
  const [status, setStatus] = useState(teacher.status);
  const [isRequestInfoModalOpen, setIsRequestInfoModalOpen] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);

  const handleApprove = () => {
    message.success('Đã phê duyệt và cấp chứng nhận giáo viên thành công!');
    setStatus('VERIFIED');
    setIsApproveModalOpen(false);
  };

  const handleRequestInfo = () => {
    message.warning('Đã gửi yêu cầu bổ sung thông tin cho giáo viên.');
    setStatus('NEEDS_INFO');
    setIsRequestInfoModalOpen(false);
  };

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      <Breadcrumb 
        className="mb-2 text-sm font-medium"
        items={[
          { title: <a href={ROUTES.ADMIN.HOME}>Tổng quan</a> },
          { title: <a href={ROUTES.ADMIN.TEACHER_VERIFICATIONS}>Xác minh giáo viên</a> },
          { title: teacher.name },
        ]}
      />

      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-5">
          <Avatar size={72} className="bg-indigo-100 text-indigo-700 text-2xl font-bold">{teacher.name.substring(0, 2).toUpperCase()}</Avatar>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Title level={3} className="!m-0 text-gray-900">{teacher.name}</Title>
              {status === 'PENDING' && <Tag color="processing" className="!m-0 rounded font-bold">Chờ duyệt</Tag>}
              {status === 'VERIFIED' && <Tag color="success" className="!m-0 rounded font-bold">Đã xác minh</Tag>}
              {status === 'NEEDS_INFO' && <Tag color="warning" className="!m-0 rounded font-bold">Cần bổ sung</Tag>}
              {status === 'REJECTED' && <Tag color="error" className="!m-0 rounded font-bold">Từ chối</Tag>}
            </div>
            <div className="text-gray-500 font-medium mt-2 flex flex-wrap gap-4">
              <span className="flex items-center gap-1.5"><SolutionOutlined /> Chuyên môn: <strong className="text-gray-800">{teacher.specialization}</strong></span>
              <span className="flex items-center gap-1.5"><BankOutlined /> Đơn vị: <strong className="text-gray-800">{teacher.workplace}</strong></span>
              <span>• Mã hồ sơ: <strong>#TCH-{teacher.id.split('_')[1]}</strong></span>
              <span>• Nộp lúc: <strong>{teacher.dateSubmitted}</strong></span>
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
                <div className="font-medium text-gray-900">{teacher.name}</div>
              </Col>
              <Col span={12}>
                <div className="text-gray-500 text-xs font-bold uppercase mb-1">Căn cước công dân</div>
                <div className="font-medium text-gray-900">001092000092</div>
              </Col>
              <Col span={12}>
                <div className="text-gray-500 text-xs font-bold uppercase mb-1">Email liên hệ</div>
                <div className="font-medium text-gray-900 flex items-center gap-2"><MailOutlined className="text-gray-400" /> {teacher.email}</div>
              </Col>
              <Col span={12}>
                <div className="text-gray-500 text-xs font-bold uppercase mb-1">Số điện thoại</div>
                <div className="font-medium text-gray-900 flex items-center gap-2"><PhoneOutlined className="text-gray-400" /> {teacher.phone}</div>
              </Col>
              <Col span={24}>
                <Divider className="my-2" />
              </Col>
              <Col span={24}>
                <div className="text-gray-500 text-xs font-bold uppercase mb-1">Kinh nghiệm giảng dạy</div>
                <Paragraph className="font-medium text-gray-800">{teacher.experience}</Paragraph>
              </Col>
              <Col span={24}>
                <div className="text-gray-500 text-xs font-bold uppercase mb-1">Tiểu sử & Cam kết (Bio)</div>
                <Paragraph className="font-medium text-gray-800 bg-gray-50 p-4 rounded-xl border border-gray-100 italic">"{teacher.bio}"</Paragraph>
              </Col>
            </Row>
          </Card>

          <Card className="rounded-2xl shadow-sm border-gray-100" title={<span className="font-bold flex items-center gap-2"><SafetyCertificateOutlined className="text-indigo-500" /> Xác minh danh tính cá nhân (MicroChip)</span>} extra={<Tag color="success" className="!m-0 font-bold border-0"><CheckCircleOutlined /> Khớp dữ liệu quốc gia (99.9% AI check)</Tag>}>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50 relative group cursor-pointer">
                  <div className="absolute top-2 right-2 bg-emerald-500 text-white text-xs px-2 py-0.5 rounded font-bold shadow z-10"><CheckCircleOutlined /> Hợp lệ</div>
                  <img src="https://picsum.photos/400/250?random=1" alt="CCCD Mặt trước" className="w-full h-[180px] object-cover opacity-80" />
                  <div className="p-3 bg-white border-t border-gray-100 flex justify-between items-center">
                    <span className="font-bold text-gray-800 text-sm">CCCD_MatTruoc.jpg</span>
                    <Button type="text" size="small" icon={<EyeOutlined />} className="text-indigo-600">Xem</Button>
                  </div>
                </div>
              </Col>
              <Col span={12}>
                <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50 relative group cursor-pointer">
                  <div className="absolute top-2 right-2 bg-emerald-500 text-white text-xs px-2 py-0.5 rounded font-bold shadow z-10"><CheckCircleOutlined /> Hợp lệ</div>
                  <img src="https://picsum.photos/400/250?random=2" alt="CCCD Mặt sau" className="w-full h-[180px] object-cover opacity-80" />
                  <div className="p-3 bg-white border-t border-gray-100 flex justify-between items-center">
                    <span className="font-bold text-gray-800 text-sm">CCCD_MatSau.jpg</span>
                    <Button type="text" size="small" icon={<EyeOutlined />} className="text-indigo-600">Xem</Button>
                  </div>
                </div>
              </Col>
            </Row>
          </Card>

          <Card className="rounded-2xl shadow-sm border-gray-100" title={<span className="font-bold flex items-center gap-2"><FileSearchOutlined className="text-indigo-500" /> Bằng cấp & Chứng chỉ Sư phạm</span>} extra={<span className="text-sm font-medium text-gray-500">2 tài liệu</span>}>
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-4 p-4 border border-gray-200 rounded-xl hover:border-indigo-300 transition-colors bg-white">
                <div className="w-20 h-24 bg-gray-100 rounded border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center relative">
                  <img src="https://picsum.photos/200/300?random=3" className="w-full h-full object-cover opacity-50" alt="" />
                  <Tag color="blue" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 !m-0 border-0 font-bold">PDF</Tag>
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start mb-1">
                    <Title level={5} className="!m-0">Bằng Thạc sĩ Sư phạm Toán học</Title>
                    <Button type="text" className="text-indigo-600 font-medium" icon={<EyeOutlined />}>Tra cứu</Button>
                  </div>
                  <Tag color="cyan" className="font-medium mb-2 border-0">Khóa Cử nhân, Văn bằng</Tag>
                  <div className="text-sm text-gray-800 font-medium mb-2">Trường Đại học Sư phạm Hà Nội</div>
                  <Row gutter={[16, 16]} className="text-xs text-gray-500">
                    <Col span={8}>
                      <div>Số hiệu:</div>
                      <div className="font-bold text-gray-800">MS-SP-2021-0089</div>
                    </Col>
                    <Col span={8}>
                      <div>Xếp loại:</div>
                      <div className="font-bold text-emerald-600">Giỏi</div>
                    </Col>
                    <Col span={8}>
                      <div>Năm tốt nghiệp:</div>
                      <div className="font-bold text-gray-800">2021</div>
                    </Col>
                  </Row>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 border border-gray-200 rounded-xl hover:border-indigo-300 transition-colors bg-white">
                <div className="w-20 h-24 bg-gray-100 rounded border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center relative">
                  <img src="https://picsum.photos/200/300?random=4" className="w-full h-full object-cover opacity-50" alt="" />
                  <Tag color="blue" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 !m-0 border-0 font-bold">PDF</Tag>
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start mb-1">
                    <Title level={5} className="!m-0">Chứng chỉ Bồi dưỡng nghiệp vụ giảng dạy trực tuyến & STEM</Title>
                    <Button type="text" className="text-indigo-600 font-medium" icon={<EyeOutlined />}>Tra cứu</Button>
                  </div>
                  <Tag color="cyan" className="font-medium mb-2 border-0">Chứng chỉ bồi dưỡng</Tag>
                  <div className="text-sm text-gray-800 font-medium mb-2">Tổ chức Giáo dục Đổi mới Sáng tạo Quốc tế</div>
                  <Row gutter={[16, 16]} className="text-xs text-gray-500">
                    <Col span={8}>
                      <div>Mã chứng chỉ:</div>
                      <div className="font-bold text-gray-800">STEM-9941</div>
                    </Col>
                    <Col span={8}>
                      <div>Thời lượng học:</div>
                      <div className="font-bold text-gray-800">120 Giờ</div>
                    </Col>
                    <Col span={8}>
                      <div>Hiệu lực:</div>
                      <div className="font-bold text-emerald-600">2024 - 2027</div>
                    </Col>
                  </Row>
                </div>
              </div>
            </div>
          </Card>

        </Col>

        {/* RIGHT COLUMN - ACTIONS */}
        <Col xs={24} lg={7}>
          <div className="sticky top-6 flex flex-col gap-6">
            <Card className="rounded-2xl shadow-sm border-gray-100 border-t-4 border-t-indigo-600">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-lg"><CheckSquareFilled /></div>
                <div>
                  <Title level={5} className="!m-0 text-gray-900">Biên bản thẩm định & Quyết định kích hoạt</Title>
                  <div className="text-xs text-gray-500 mt-1">Thẩm định viên: Nguyễn Minh Admin</div>
                </div>
              </div>

              <div className="flex flex-col gap-3 bg-gray-50 p-4 rounded-xl border border-gray-100 mb-4">
                <div className="flex gap-2">
                  <CheckCircleOutlined className="text-indigo-600 mt-1" />
                  <span className="text-sm text-gray-700 font-medium">Xác thực OTP & Số điện thoại là bước chính qua SMS. <a href="#">Xem lịch sử</a></span>
                </div>
                <div className="flex gap-2">
                  <CheckCircleOutlined className="text-indigo-600 mt-1" />
                  <span className="text-sm text-gray-700 font-medium">Căn cước công dân hợp lệ, ảnh quét 2 mặt sắc nét, không tẩy xóa.</span>
                </div>
                <div className="flex gap-2">
                  <CheckCircleOutlined className="text-indigo-600 mt-1" />
                  <span className="text-sm text-gray-700 font-medium">Văn bằng Sư phạm chính quy (Đã xác minh qua CSDL Sinh Sự phạm HN).</span>
                </div>
                <div className="flex gap-2">
                  <CheckCircleOutlined className="text-indigo-600 mt-1" />
                  <span className="text-sm text-gray-700 font-medium">Kinh nghiệm giảng dạy &gt; 3 năm, đạt tiêu chuẩn xếp hạng Giáo viên Năng cốt.</span>
                </div>
              </div>

              <Form layout="vertical">
                <Form.Item label={<span className="font-bold text-gray-700">Ghi chú thẩm định viên & Điều khoản bổ sung</span>} extra="Hiển thị trong email thông báo kết quả">
                  <Input.TextArea rows={4} className="rounded-xl bg-gray-50 text-sm" placeholder="Hồ sơ đầy đủ, bằng cấp hợp lệ..." defaultValue="Hồ sơ đầy đủ, văn bằng ThS Sư phạm Toán chính quy xác minh tốt qua cổng tra cứu văn bằng. Đủ điều kiện kích hoạt mở lớp Toán 12 và luyện thi THPT Quốc gia đợt tuyển sinh Khóa K26." />
                </Form.Item>
              </Form>

              <div className="flex flex-col gap-3 mt-4">
                <Button block danger className="rounded-xl h-[44px] font-semibold">Từ chối</Button>
                <Button block className="rounded-xl h-[44px] font-semibold bg-orange-50 text-orange-600 border-orange-200" onClick={() => setIsRequestInfoModalOpen(true)}>Yêu cầu bổ sung</Button>
                <Button type="primary" block className="rounded-xl h-[54px] font-bold bg-emerald-600 hover:bg-emerald-700 text-base" onClick={() => setIsApproveModalOpen(true)}>
                  Phê duyệt & Kích hoạt quyền mở lớp
                </Button>
                <div className="text-xs text-gray-500 text-center mt-2 flex items-center justify-center gap-1">
                  <CheckCircleOutlined className="text-emerald-500" /> Sau khi duyệt, giáo viên sẽ nhận email & SMS kích hoạt ngay lập tức.
                </div>
              </div>
            </Card>
          </div>
        </Col>
      </Row>

      <Modal
        title="Yêu cầu bổ sung hồ sơ"
        open={isRequestInfoModalOpen}
        onCancel={() => setIsRequestInfoModalOpen(false)}
        onOk={handleRequestInfo}
        okText="Gửi yêu cầu"
        cancelText="Hủy"
        okButtonProps={{ className: 'bg-orange-500' }}
      >
        <div className="mb-4 text-gray-600">Chọn các mục giáo viên cần cung cấp thêm hoặc làm rõ:</div>
        <Checkbox.Group className="flex flex-col gap-3 mb-4 w-full">
          <Checkbox value="cccd">Ảnh chụp CCCD bị mờ, lóa sáng</Checkbox>
          <Checkbox value="degree">Bằng cấp chưa rõ thông tin / Cần bản scan gốc</Checkbox>
          <Checkbox value="cert">Chứng chỉ nghiệp vụ hết hạn</Checkbox>
          <Checkbox value="bio">Thông tin kinh nghiệm chưa chi tiết</Checkbox>
          <Checkbox value="other">Khác</Checkbox>
        </Checkbox.Group>
        <div className="font-semibold mb-2">Ghi chú chi tiết (Sẽ gửi qua email)</div>
        <Input.TextArea rows={4} placeholder="Nhập ghi chú yêu cầu giáo viên cập nhật..." />
      </Modal>

      <Modal
        title="Xác nhận phê duyệt"
        open={isApproveModalOpen}
        onCancel={() => setIsApproveModalOpen(false)}
        onOk={handleApprove}
        okText="Duyệt giáo viên"
        cancelText="Hủy"
        okButtonProps={{ className: 'bg-emerald-600' }}
      >
        <div className="py-4">
          <div className="flex items-center gap-4 mb-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
            <Avatar size="large" className="bg-indigo-600 font-bold">{teacher.name.substring(0,2).toUpperCase()}</Avatar>
            <div>
              <div className="font-bold text-gray-900">{teacher.name}</div>
              <div className="text-sm text-gray-500">{teacher.specialization}</div>
            </div>
          </div>
          <Paragraph>
            Bạn xác nhận hồ sơ của giáo viên này hợp lệ và đồng ý cấp quyền <strong>Mở lớp học trực tuyến</strong> trên hệ thống Edunity?
          </Paragraph>
          <Paragraph className="text-gray-500 text-sm">
            Hành động này sẽ gửi một email tự động thông báo kết quả đến <strong className="text-gray-800">{teacher.email}</strong>.
          </Paragraph>
        </div>
      </Modal>
    </div>
  );
}
