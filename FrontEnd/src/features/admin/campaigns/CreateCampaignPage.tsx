import { Typography, Breadcrumb, Button, Card, Form, Input, InputNumber, DatePicker, Select, Row, Col, message } from 'antd';
import { 
  SaveOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../routes/routePaths';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

export default function CreateCampaignPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm();

  // Watch for preview calculations
  const targetBudget = Form.useWatch('targetBudget', form) || 0;
  const awardPerStudent = Form.useWatch('awardPerStudent', form) || 0;
  const expectedSlots = awardPerStudent > 0 ? Math.floor(targetBudget / awardPerStudent) : 0;

  const handlePublish = () => {
    form.validateFields().then(() => {
      message.success('Đã tạo và kích hoạt chiến dịch học bổng thành công!');
      navigate(ROUTES.ADMIN.CAMPAIGNS);
    }).catch(() => {
      message.error('Vui lòng kiểm tra lại thông tin bắt buộc.');
    });
  };

  const handleSaveDraft = () => {
    message.info('Đã lưu nháp chiến dịch.');
    navigate(ROUTES.ADMIN.CAMPAIGNS);
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1000px] mx-auto pb-10">
      <Breadcrumb 
        className="mb-2 text-sm font-medium"
        items={[
          { title: <a href={ROUTES.ADMIN.HOME}>Tổng quan</a> },
          { title: <a href={ROUTES.ADMIN.CAMPAIGNS}>Chiến dịch</a> },
          { title: 'Tạo chiến dịch mới' },
        ]}
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
          <Title level={2} className="!m-0 text-gray-900">Tạo chiến dịch học bổng</Title>
          <Text className="text-gray-500">Thiết lập chương trình tài trợ mới và định mức học bổng</Text>
        </div>
        <div className="flex gap-3">
          <Button icon={<SaveOutlined />} className="rounded-lg h-[44px] font-medium" onClick={handleSaveDraft}>Lưu nháp</Button>
          <Button type="primary" icon={<RocketOutlined />} className="rounded-lg h-[44px] bg-indigo-600 font-medium" onClick={handlePublish}>Phát hành chiến dịch</Button>
        </div>
      </div>

      <Form form={form} layout="vertical" initialValues={{ targetBudget: 300000000, awardPerStudent: 3000000 }}>
        
        {/* SECTION A */}
        <Card className="rounded-2xl shadow-sm border-gray-100 mb-6" title="Thông tin chung">
          <Form.Item label="Tên chiến dịch" name="title" rules={[{ required: true, message: 'Vui lòng nhập tên chiến dịch' }]}>
            <Input size="large" className="rounded-lg" placeholder="VD: Tiếp sức đến trường 2026 – Nuôi dưỡng tài năng THPT" />
          </Form.Item>
          <Form.Item label="Mô tả chiến dịch" name="description" rules={[{ required: true }]}>
            <Input.TextArea rows={4} className="rounded-lg" placeholder="Nhập mục tiêu và ý nghĩa của chiến dịch..." />
          </Form.Item>
          <Form.Item label="Đối tượng & Tiêu chí xét duyệt (Điều kiện cần)" name="eligibility">
            <Select mode="tags" size="large" className="rounded-lg" placeholder="Thêm tiêu chí..." options={[
              { value: 'Hoàn cảnh khó khăn', label: 'Hoàn cảnh khó khăn' },
              { value: 'Học lực Khá/Giỏi', label: 'Học lực Khá/Giỏi' },
              { value: 'Học sinh lớp 12', label: 'Học sinh lớp 12' }
            ]} />
          </Form.Item>
        </Card>

        {/* SECTION B */}
        <Card className="rounded-2xl shadow-sm border-gray-100 mb-6" title="Ngân sách & Định mức">
          <Row gutter={24}>
            <Col xs={24} md={12}>
              <Form.Item label="Mục tiêu huy động quỹ (VNĐ)" name="targetBudget" rules={[{ required: true }]}>
                <InputNumber 
                  size="large" 
                  className="w-full rounded-lg" 
                  formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={value => value!.replace(/\$\s?|(,*)/g, '')}
                />
              </Form.Item>
              <Form.Item label="Mức học bổng cố định / Học viên (VNĐ)" name="awardPerStudent" rules={[{ required: true }]}>
                <InputNumber 
                  size="large" 
                  className="w-full rounded-lg" 
                  formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={value => value!.replace(/\$\s?|(,*)/g, '')}
                />
              </Form.Item>
            </Col>
            
            <Col xs={24} md={12}>
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6 h-full flex flex-col justify-center">
                <Text className="text-indigo-600 font-bold uppercase text-xs tracking-wider mb-2">Tạm tính phân bổ</Text>
                <div className="flex justify-between items-end mb-4 border-b border-indigo-100 pb-4">
                  <span className="text-gray-600">Tổng ngân sách:</span>
                  <span className="font-bold text-gray-900 text-lg">{targetBudget.toLocaleString('vi-VN')}đ</span>
                </div>
                <div className="flex justify-between items-end mb-4 border-b border-indigo-100 pb-4">
                  <span className="text-gray-600">Định mức / học sinh:</span>
                  <span className="font-bold text-gray-900 text-lg">÷ {awardPerStudent.toLocaleString('vi-VN')}đ</span>
                </div>
                <div className="flex justify-between items-end">
                  <span className="text-indigo-800 font-bold">Tổng suất học bổng dự kiến:</span>
                  <span className="font-bold text-indigo-700 text-3xl">{expectedSlots} <span className="text-lg">suất</span></span>
                </div>
              </div>
            </Col>
          </Row>
        </Card>

        {/* SECTION C */}
        <Card className="rounded-2xl shadow-sm border-gray-100 mb-6" title="Phạm vi áp dụng">
          <Form.Item label="Môn học được áp dụng" name="scope">
            <Select mode="multiple" size="large" className="rounded-lg" placeholder="Chọn môn học..." options={[
              { value: 'Toán học', label: 'Toán học' },
              { value: 'Vật lý', label: 'Vật lý' },
              { value: 'Hóa học', label: 'Hóa học' },
              { value: 'Tiếng Anh', label: 'Tiếng Anh' }
            ]} />
          </Form.Item>
          <Form.Item label="Giới hạn khóa học (Tùy chọn)">
            <Select mode="multiple" size="large" className="rounded-lg" placeholder="Chọn khóa học cụ thể..." />
          </Form.Item>
        </Card>

        {/* SECTION D */}
        <Card className="rounded-2xl shadow-sm border-gray-100 mb-6" title="Khung thời gian">
          <Row gutter={24}>
            <Col span={12}>
              <Form.Item label="Thời gian huy động quỹ (Sponsor)" name="fundingPeriod" rules={[{ required: true }]}>
                <RangePicker size="large" className="w-full rounded-lg" format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Thời gian nhận hồ sơ (Student)" name="appPeriod" rules={[{ required: true }]}>
                <RangePicker size="large" className="w-full rounded-lg" format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>
        </Card>

      </Form>
    </div>
  );
}
