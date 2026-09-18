import { useState } from 'react';
import { 
  Typography, Steps, Button, Card, Form, Input, InputNumber, 
  Select, DatePicker, Radio, message, Breadcrumb, Tag, Row, Col, Divider
} from 'antd';
import { 
  BookOutlined, 
  SettingOutlined, 
  CalendarOutlined, 
  CheckCircleOutlined,
  SearchOutlined,
  PlusOutlined,
  DeleteOutlined,
  VideoCameraOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../../routes/routePaths';
import { mockCourseCatalog } from '../../../../data/mockTeacherClasses';

const { Title, Text, Paragraph } = Typography;

export default function CreateTeacherClassPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [form] = Form.useForm();
  
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  
  const handleNext = () => {
    if (currentStep === 0 && !selectedCourse) {
      message.error("Vui lòng chọn một khóa học");
      return;
    }
    
    if (currentStep === 1) {
      form.validateFields().then(() => {
        setCurrentStep((prev: number) => prev + 1);
      }).catch(err => {
        console.log("Form validation failed:", err);
      });
      return;
    }
    
    setCurrentStep((prev: number) => prev + 1);
  };

  const handlePrev = () => {
    setCurrentStep((prev: number) => prev - 1);
  };

  const handleCreate = () => {
    message.success("Đã khởi tạo lớp học thành công!");
    navigate(ROUTES.TEACHER.CLASSES);
  };

  const courseObj = mockCourseCatalog.find((c: any) => c.id === selectedCourse);

  // Form values watch
  const isFree = Form.useWatch('isFree', form) === true;

  const renderStep0 = () => (
    <div className="flex flex-col md:flex-row gap-6 mt-6">
      <div className="flex-1">
        <div className="bg-emerald-50 text-emerald-700 px-4 py-3 rounded-xl mb-6 flex items-start gap-3">
          <CheckCircleOutlined className="mt-1" />
          <div>
            <div className="font-bold">Chọn khóa học chuẩn từ Edunity</div>
            <div className="text-sm">Giáo viên khởi tạo lớp dựa trên khung học liệu và giáo trình đã qua kiểm duyệt sư phạm.</div>
          </div>
        </div>
        
        <div className="flex gap-3 mb-6">
          <Input placeholder="Tìm khóa học..." prefix={<SearchOutlined />} className="rounded-lg" size="large" />
          <Select defaultValue="all" className="w-[150px]" size="large" options={[{value: 'all', label: 'Tất cả'}]} />
        </div>
        
        <div className="flex flex-col gap-4">
          {mockCourseCatalog.map((course: any) => (
            <div 
              key={course.id}
              onClick={() => setSelectedCourse(course.id)}
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedCourse === course.id ? 'border-indigo-600 bg-indigo-50/50' : 'border-gray-200 hover:border-indigo-300'}`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 pr-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">{course.grade.toUpperCase()}</span>
                    <span className="text-xs font-medium text-gray-500">• {course.totalLessons} bài giảng mẫu</span>
                  </div>
                  <Title level={5} className="!m-0 !mb-1">{course.title}</Title>
                  <Text className="text-gray-500 text-sm">{course.description}</Text>
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedCourse === course.id ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300'}`}>
                  {selectedCourse === course.id && <CheckCircleOutlined />}
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-6 bg-gray-50 p-4 rounded-xl border border-gray-100 flex justify-between items-center">
          <div>
            <div className="font-medium">Không tìm thấy môn học/giáo trình phù hợp?</div>
            <div className="text-sm text-gray-500">Gửi đề xuất để ban hội đồng sư phạm Edunity thẩm định.</div>
          </div>
          <Button>Đề xuất khóa học mới</Button>
        </div>
      </div>
      
      <div className="w-full md:w-[350px]">
        {/* Preview Panel - only show if selected */}
        <Card className="rounded-2xl border border-indigo-100 shadow-sm sticky top-6 overflow-hidden" bodyStyle={{ padding: 0 }}>
          <div className="bg-indigo-50/50 p-4 border-b border-indigo-50 flex justify-between items-center">
            <span className="font-semibold text-indigo-900">Bản xem trước lớp học</span>
            <Tag color="indigo" className="!m-0">Live Preview</Tag>
          </div>
          <div className="p-5">
            <div className="w-full h-[180px] bg-indigo-100 rounded-xl mb-4 relative overflow-hidden">
              {courseObj && <img src={`https://picsum.photos/seed/${courseObj.id}/400/300`} className="w-full h-full object-cover" alt="" />}
            </div>
            <Title level={5}>{courseObj ? courseObj.title : 'Vui lòng chọn khóa học'}</Title>
            
            <Divider className="my-4" />
            
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Khóa chuẩn:</span>
                <span className="font-medium text-right max-w-[150px]">{courseObj ? courseObj.grade : '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Sĩ số tối đa:</span>
                <span className="font-medium">20 học viên</span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );

  const renderStep1 = () => (
    <div className="mt-8 max-w-[800px] mx-auto">
      <Card className="rounded-2xl shadow-sm border-gray-100" bodyStyle={{ padding: '32px' }}>
        <Title level={4} className="!mb-6">Thông tin & Cấu hình lớp học</Title>
        
        <Form layout="vertical" form={form} initialValues={{ isFree: false, capacity: 20 }}>
          <Form.Item label="Tên lớp học công khai" name="name" rules={[{ required: true, message: 'Vui lòng nhập tên lớp học' }]}>
            <Input size="large" className="rounded-lg" placeholder="VD: Toán 12 - Chinh phục 8+ Nâng cao (Kỳ Mùa Thu 2026)" />
          </Form.Item>
          
          <Form.Item label="Loại hình lớp học" name="isFree">
            <Radio.Group className="w-full">
              <Row gutter={16}>
                <Col span={12}>
                  <Radio.Button value={false} className="w-full h-auto py-3 px-4 rounded-xl text-left border-2 data-[state=checked]:border-indigo-600 data-[state=checked]:bg-indigo-50 !border-l-2 !border-r-2 !border-t-2 !border-b-2 [&.ant-radio-button-wrapper-checked]:border-indigo-600 [&.ant-radio-button-wrapper-checked]:bg-indigo-50">
                    <div className="font-semibold text-gray-800 mb-1 flex items-center gap-2">Lớp có thu phí (PAID)</div>
                    <div className="text-xs text-gray-500 font-normal leading-tight">Học viên thanh toán học phí qua cổng Edunity Pay an toàn.</div>
                  </Radio.Button>
                </Col>
                <Col span={12}>
                  <Radio.Button value={true} className="w-full h-auto py-3 px-4 rounded-xl text-left border-2 data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-50 !border-l-2 !border-r-2 !border-t-2 !border-b-2 [&.ant-radio-button-wrapper-checked]:border-emerald-600 [&.ant-radio-button-wrapper-checked]:bg-emerald-50">
                    <div className="font-semibold text-gray-800 mb-1 flex items-center gap-2">Lớp cộng đồng (FREE)</div>
                    <div className="text-xs text-gray-500 font-normal leading-tight">Lớp phi lợi nhuận, chia sẻ phương pháp học tập miễn phí.</div>
                  </Radio.Button>
                </Col>
              </Row>
            </Radio.Group>
          </Form.Item>

          <Row gutter={24}>
            {!isFree && (
              <Col span={12}>
                <Form.Item label="Học phí trọn khóa / học viên" name="price" rules={[{ required: true, message: 'Vui lòng nhập học phí' }]}>
                  <InputNumber 
                    size="large" 
                    className="w-full rounded-lg" 
                    formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={value => value!.replace(/\$\s?|(,*)/g, '')}
                    addonAfter="VNĐ"
                  />
                </Form.Item>
              </Col>
            )}
            <Col span={isFree ? 24 : 12}>
              <Form.Item label="Sĩ số tối đa" name="capacity" rules={[{ required: true }]}>
                <InputNumber size="large" className="w-full rounded-lg" addonAfter="Học viên" />
              </Form.Item>
            </Col>
          </Row>
          
          <Row gutter={24}>
            <Col span={8}>
              <Form.Item label="Hạn chót đăng ký" name="enrollmentDeadline" rules={[{ required: true }]}>
                <DatePicker size="large" className="w-full rounded-lg" format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Ngày khai giảng" name="startDate" rules={[{ required: true }]}>
                <DatePicker size="large" className="w-full rounded-lg" format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Kết thúc dự kiến" name="endDate">
                <DatePicker size="large" className="w-full rounded-lg" format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Mô tả lớp học & Cam kết đầu ra" name="description" rules={[{ required: true }]}>
            <Input.TextArea rows={4} className="rounded-lg" placeholder="Nhập mô tả chi tiết lớp học..." />
          </Form.Item>
        </Form>
      </Card>
    </div>
  );

  const renderStep2 = () => (
    <div className="mt-8 max-w-[800px] mx-auto">
      <Card className="rounded-2xl shadow-sm border-gray-100" bodyStyle={{ padding: '32px' }}>
        <div className="flex justify-between items-center mb-6">
          <div>
            <Title level={4} className="!m-0">Lịch giảng dạy & Ca học cố định</Title>
            <Text className="text-gray-500">Hệ thống sẽ tự động tạo chuỗi phòng học Edunity Live Studio và nhắc nhở học viên qua email/app trước mỗi buổi 30 phút.</Text>
          </div>
          <Tag color="indigo" className="font-medium rounded-full px-3 py-1">2 buổi / tuần</Tag>
        </div>

        <div className="flex flex-col gap-4 mb-6">
          <div className="border border-gray-200 rounded-xl p-4 flex items-center justify-between bg-white hover:border-indigo-300 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-lg">T3</div>
              <div>
                <div className="font-semibold text-gray-800 text-base">Ca học Thứ Ba hàng tuần <Tag className="ml-2 !border-0 bg-gray-100 text-gray-600">90 phút</Tag></div>
                <div className="text-gray-500 text-sm mt-1 flex items-center gap-2">
                  <VideoCameraOutlined /> 20:00 - 21:30 • Live Studio 01 (HD 1080p, bảng vẽ tương tác)
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="text" className="text-gray-500"><SettingOutlined /></Button>
              <Button type="text" danger><DeleteOutlined /></Button>
            </div>
          </div>
          
          <div className="border border-gray-200 rounded-xl p-4 flex items-center justify-between bg-white hover:border-indigo-300 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-lg">T5</div>
              <div>
                <div className="font-semibold text-gray-800 text-base">Ca học Thứ Năm hàng tuần <Tag className="ml-2 !border-0 bg-gray-100 text-gray-600">90 phút</Tag></div>
                <div className="text-gray-500 text-sm mt-1 flex items-center gap-2">
                  <VideoCameraOutlined /> 20:00 - 21:30 • Live Studio 01 (HD 1080p, bảng vẽ tương tác)
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="text" className="text-gray-500"><SettingOutlined /></Button>
              <Button type="text" danger><DeleteOutlined /></Button>
            </div>
          </div>
        </div>

        <Button type="dashed" block size="large" icon={<PlusOutlined />} className="rounded-xl border-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-medium h-[50px]">
          + Thêm ca học trong tuần
        </Button>
      </Card>
    </div>
  );

  const renderStep3 = () => (
    <div className="mt-8 max-w-[800px] mx-auto text-center">
      <div className="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center text-4xl mx-auto mb-6">
        <CheckCircleOutlined />
      </div>
      <Title level={3}>Xác nhận & Đăng ký mở lớp</Title>
      <Paragraph className="text-gray-500 max-w-[500px] mx-auto text-base">
        Lớp học <strong className="text-gray-800">{form.getFieldValue('name') || (courseObj ? courseObj.title : 'Đang tải...')}</strong> đã sẵn sàng để được khởi tạo trên hệ thống Edunity.
      </Paragraph>
      
      <Card className="rounded-2xl shadow-sm border-gray-100 text-left mt-8 bg-gray-50/50" bodyStyle={{ padding: '24px' }}>
        <Row gutter={[24, 24]}>
          <Col span={12}>
            <div className="text-sm text-gray-500 mb-1">Loại hình</div>
            <div className="font-medium text-gray-800">{form.getFieldValue('isFree') ? 'Lớp cộng đồng (Miễn phí)' : 'Lớp thu phí'}</div>
          </Col>
          <Col span={12}>
            <div className="text-sm text-gray-500 mb-1">Khóa chuẩn</div>
            <div className="font-medium text-gray-800">{courseObj?.title}</div>
          </Col>
          <Col span={12}>
            <div className="text-sm text-gray-500 mb-1">Lịch học</div>
            <div className="font-medium text-gray-800">T3, T5 (20:00 - 21:30)</div>
          </Col>
          <Col span={12}>
            <div className="text-sm text-gray-500 mb-1">Sĩ số tối đa</div>
            <div className="font-medium text-gray-800">{form.getFieldValue('capacity')} học viên</div>
          </Col>
        </Row>
      </Card>
    </div>
  );

  const stepItems = [
    { title: 'Chọn khóa chuẩn', icon: <BookOutlined /> },
    { title: 'Thông tin lớp', icon: <SettingOutlined /> },
    { title: 'Lịch giảng dạy', icon: <CalendarOutlined /> },
    { title: 'Xác nhận', icon: <CheckCircleOutlined /> },
  ];

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1200px] mx-auto pb-10">
      <Breadcrumb 
        className="mb-2 text-sm"
        items={[
          { title: <a href={ROUTES.TEACHER.HOME}>Tổng quan</a> },
          { title: <a href={ROUTES.TEACHER.CLASSES}>Lớp của tôi</a> },
          { title: 'Tạo lớp học mới' },
        ]}
      />
      
      <div>
        <div className="flex items-center gap-2 mb-1 text-indigo-700 font-bold uppercase tracking-wider text-xs">
          <SettingOutlined /> KHỞI TẠO LỚP GIẢNG DẠY MỚI
        </div>
        <Title level={2} className="!m-0 text-gray-900">Tạo lớp học mới</Title>
        <Text className="text-gray-500">Thiết lập và mở lớp học trực tuyến từ danh mục khóa học chuẩn hóa của Edunity</Text>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mt-4">
        <Steps 
          current={currentStep} 
          items={stepItems} 
          className="max-w-[800px] mx-auto mb-8 font-medium"
        />

        {currentStep === 0 && renderStep0()}
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
      </div>

      {/* Footer Navigation */}
      <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-gray-100 sticky bottom-4">
        <Button 
          type="text" 
          onClick={currentStep === 0 ? () => navigate(ROUTES.TEACHER.CLASSES) : handlePrev}
          className="text-gray-600 font-medium px-6 h-[44px]"
        >
          {currentStep === 0 ? 'Hủy & Quay lại' : 'Quay lại bước trước'}
        </Button>
        <div className="flex gap-3">
          <Button className="h-[44px] px-6 rounded-xl bg-gray-100 border-0 font-medium">Lưu nháp</Button>
          {currentStep < stepItems.length - 1 ? (
            <Button type="primary" onClick={handleNext} className="h-[44px] px-8 rounded-xl bg-indigo-600 font-medium">
              Tiếp tục
            </Button>
          ) : (
            <Button type="primary" onClick={handleCreate} className="h-[44px] px-8 rounded-xl bg-indigo-600 font-medium">
              Xác nhận & Đăng ký mở lớp
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
