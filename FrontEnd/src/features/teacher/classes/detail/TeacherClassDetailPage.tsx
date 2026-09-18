import { useState } from 'react';
import { Typography, Tabs, Breadcrumb, Tag, Button, Row, Col, Card, Avatar, Table, Progress, Modal, Form, Input, DatePicker, TimePicker, List, message } from 'antd';
import { 
  VideoCameraOutlined, 
  CalendarOutlined, 
  UserOutlined, 
  TeamOutlined, 
  ClockCircleOutlined, 
  CheckCircleOutlined,
  PlayCircleOutlined,
  EditOutlined,
  StarFilled,
  DownloadOutlined,
  PlusOutlined,
  MessageOutlined
} from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import { ROUTES } from '../../../../routes/routePaths';
import { teacherClasses, classStudents, classSessions, classReviews } from '../../../../data/mockTeacherClasses';

const { Title, Text, Paragraph } = Typography;

export default function TeacherClassDetailPage() {
  const { classId } = useParams();
  const cls = teacherClasses.find((c: any) => c.id === (classId || "CLASS_001")) || teacherClasses[0];
  
  const [activeTab, setActiveTab] = useState('overview');
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);

  const studentColumns = [
    {
      title: 'Học viên',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: any) => (
        <div className="flex items-center gap-3">
          <Avatar className="bg-indigo-100 text-indigo-700 font-bold">{text.substring(0, 2).toUpperCase()}</Avatar>
          <div>
            <div className="font-semibold text-gray-900">{text}</div>
            <div className="text-xs text-gray-500">{record.email}</div>
          </div>
        </div>
      ),
    },
    {
      title: 'Ngày tham gia',
      dataIndex: 'joinDate',
      key: 'joinDate',
    },
    {
      title: 'Chuyên cần',
      dataIndex: 'attendanceRate',
      key: 'attendanceRate',
      render: (rate: number) => (
        <div className="flex items-center gap-2">
          <Tag color={rate >= 90 ? 'success' : rate >= 70 ? 'warning' : 'error'} className="font-bold">
            {rate}%
          </Tag>
        </div>
      )
    },
    {
      title: 'Điểm bài tập',
      dataIndex: 'averageScore',
      key: 'averageScore',
      render: (score: number) => (
        <span className="font-bold text-gray-800">{score ? `${score}/10` : '-'}</span>
      )
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'CONFIRMED' ? 'blue' : 'default'}>{status}</Tag>
      )
    },
    {
      title: 'Hành động',
      key: 'action',
      render: () => <a className="text-indigo-600 font-medium hover:underline">Chi tiết</a>,
    },
  ];

  const renderOverview = () => (
    <div className="flex flex-col gap-6 mt-6">
      {/* Overview Stats */}
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-gray-100 bg-white">
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">Sĩ số lớp</Text>
              <div className="w-8 h-8 rounded bg-indigo-50 flex items-center justify-center text-indigo-500"><TeamOutlined /></div>
            </div>
            <div className="flex items-end gap-2 mb-2">
              <Title level={2} className="!m-0 text-gray-900">{cls.enrolled}</Title>
              <span className="text-gray-500 text-lg mb-1">/ {cls.capacity}</span>
            </div>
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-emerald-500">↗ {(cls.enrolled / cls.capacity * 100).toFixed(0)}% Đầy chỗ</span>
              <span className="text-gray-500">Còn {cls.capacity - cls.enrolled} chỗ</span>
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-gray-100 bg-white">
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">Tiến độ khóa</Text>
              <div className="w-8 h-8 rounded bg-emerald-50 flex items-center justify-center text-emerald-500"><CheckCircleOutlined /></div>
            </div>
            <div className="flex items-end gap-2 mb-2">
              <Title level={2} className="!m-0 text-gray-900">{cls.completedSessions}</Title>
              <span className="text-gray-500 text-lg mb-1">/ {cls.totalSessions} buổi</span>
            </div>
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-gray-500">Đã hoàn thành {((cls.completedSessions / cls.totalSessions) * 100).toFixed(0)}%</span>
              <span className="text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded">Đúng lộ trình</span>
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-gray-100 bg-white">
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">Buổi còn lại</Text>
              <div className="w-8 h-8 rounded bg-amber-50 flex items-center justify-center text-amber-500"><ClockCircleOutlined /></div>
            </div>
            <div className="flex items-end gap-2 mb-2">
              <Title level={2} className="!m-0 text-gray-900">{cls.totalSessions - cls.completedSessions}</Title>
              <span className="text-gray-500 text-lg mb-1">buổi còn lại</span>
            </div>
            <div className="flex items-center text-xs font-medium text-gray-500">
              <CalendarOutlined className="mr-1" /> Kết thúc dự kiến: 15/12/2026
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-gray-100 bg-white">
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">Đánh giá chung</Text>
              <div className="w-8 h-8 rounded bg-rose-50 flex items-center justify-center text-rose-500"><StarFilled /></div>
            </div>
            <div className="flex items-end gap-2 mb-2">
              <Title level={2} className="!m-0 text-gray-900">{cls.rating}</Title>
              <StarFilled className="text-emerald-500 text-lg mb-1" />
            </div>
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-gray-500">Dựa trên {cls.reviewCount} nhận xét</span>
              <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Rất tốt</span>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[24, 24]}>
        {/* Main Content Column */}
        <Col xs={24} lg={16} className="flex flex-col gap-6">
          {/* Next Session Card */}
          <Card className="rounded-2xl shadow-sm border border-indigo-100 overflow-hidden" bodyStyle={{ padding: 0 }}>
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
                  <Tag color="error" className="!m-0 border-0 font-bold tracking-wider">SẮP DIỄN RA</Tag>
                  <Text className="font-semibold text-gray-700 ml-2">20:00 Thứ 5, 17/09/2026</Text>
                </div>
                <Tag color="success" className="rounded-full !m-0 font-medium">18/18 học viên xác nhận</Tag>
              </div>
              
              <Text className="text-indigo-600 font-bold uppercase tracking-wider text-xs mb-1 block">KẾ HOẠCH BÀI GIẢNG TIẾP THEO</Text>
              <Title level={3} className="!mt-1 mb-3 !text-2xl">Buổi 13: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số (Dạng bài vận dụng 8.5+)</Title>
              
              <Paragraph className="text-gray-600">
                Trọng tâm: Phương pháp phân tích đồ thị chứa giá trị tuyệt đối, kỹ thuật ghép trục nhanh giải bài toán cực trị tham số trong đề thi chuẩn bộ GD&ĐT.
              </Paragraph>

              <div className="bg-gray-50 rounded-xl p-4 flex gap-4 mt-4 items-center">
                <div className="text-xs font-bold text-gray-500 w-20">TÀI LIỆU BUỔI:</div>
                <div className="flex gap-2">
                  <Button size="small" className="rounded bg-white text-indigo-600 border-indigo-200">Slides_Bai13_HamSo.pdf</Button>
                  <Button size="small" className="rounded bg-white text-indigo-600 border-indigo-200">BaiTap_RenLuyen_13.pdf</Button>
                </div>
                <Button type="text" className="text-indigo-600 ml-auto">+ Đính kèm thêm</Button>
              </div>
            </div>
            
            <div className="bg-indigo-50/50 p-4 px-6 border-t border-indigo-50 flex gap-4">
              <Button type="primary" size="large" icon={<PlayCircleOutlined />} className="bg-indigo-600 rounded-xl font-bold px-8 shadow-md">
                Vào phòng học ảo Live Studio
              </Button>
              <Button size="large" className="rounded-xl font-medium bg-white text-gray-700">Kiểm tra bảng vẽ & Micro</Button>
              <Button size="large" className="rounded-xl font-medium bg-white text-gray-700 ml-auto"><TeamOutlined /> Điểm danh trước giờ</Button>
            </div>
          </Card>

          {/* Recent Sessions List */}
          <Card className="rounded-2xl shadow-sm border-gray-100" title={<span className="font-bold flex items-center gap-2"><VideoCameraOutlined className="text-indigo-500" /> Danh sách buổi học gần đây</span>} extra={<span className="text-gray-500 text-sm">12 buổi đã xong</span>}>
            <List
              itemLayout="horizontal"
              dataSource={classSessions.filter((s: any) => s.status === 'COMPLETED')}
              renderItem={(item: any) => (
                <List.Item className="border-b last:border-0 py-4"
                  actions={[
                    <Button type="link" icon={<PlayCircleOutlined />}>Xem video Recording</Button>,
                    <Button type="text" icon={<DownloadOutlined />} className="text-gray-400" />
                  ]}
                >
                  <div className="flex gap-4 items-start w-full">
                    <div className="w-12 h-12 shrink-0 bg-gray-50 rounded-lg border border-gray-200 flex flex-col items-center justify-center">
                      <span className="text-[10px] text-gray-500 font-bold uppercase">{item.title.split(':')[0] || 'BUỔI'}</span>
                      <span className="font-bold text-gray-800 text-sm">{item.date.split('/')[0]}</span>
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-800 text-base mb-1">{item.title}</div>
                      <div className="flex gap-6 text-sm text-gray-500">
                        <span><CheckCircleOutlined className="text-emerald-500" /> Điểm danh: <strong className="text-gray-700">{item.attendanceCount}/{item.totalStudents} ({(item.attendanceCount! / item.totalStudents * 100).toFixed(0)}%)</strong></span>
                        <span><ClockCircleOutlined /> Thời lượng: {item.duration} phút</span>
                      </div>
                    </div>
                  </div>
                </List.Item>
              )}
            />
            <div className="mt-4 text-center">
              <Button type="link" onClick={() => setActiveTab('sessions')}>Xem toàn bộ {cls.totalSessions} buổi học trong tab Sessions →</Button>
            </div>
          </Card>
        </Col>

        {/* Right Sidebar */}
        <Col xs={24} lg={8} className="flex flex-col gap-6">
          <Card className="rounded-2xl shadow-sm border-gray-100 bg-white" 
            title={<span className="font-bold flex items-center gap-2 text-base"><MessageOutlined className="text-indigo-500" /> Trao đổi gần đây</span>}
            extra={<div className="w-2 h-2 rounded-full bg-rose-500"></div>}
          >
            <div className="flex flex-col gap-4">
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="flex justify-between items-center mb-2 text-xs">
                  <div className="font-bold text-gray-800 flex items-center gap-2">
                    <Avatar size="small" className="bg-indigo-600">PL</Avatar> Phương Linh
                  </div>
                  <span className="text-gray-400">10 phút trước</span>
                </div>
                <Paragraph className="text-sm text-gray-700 m-0">"Thầy ơi bài tập số 4 dạng đồ thị hàm phân thức thầy có thể chữa thêm vào đầu giờ thứ 5 không ạ?"</Paragraph>
                <div className="mt-2 flex gap-2">
                  <span className="text-xs text-indigo-600 font-medium cursor-pointer flex items-center gap-1">↳ Trả lời</span>
                  <span className="text-xs text-gray-400">• Bài tập buổi 12</span>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="flex justify-between items-center mb-2 text-xs">
                  <div className="font-bold text-gray-800 flex items-center gap-2">
                    <Avatar size="small" className="bg-emerald-600">QH</Avatar> Quốc Huy
                  </div>
                  <span className="text-gray-400">1 giờ trước</span>
                </div>
                <Paragraph className="text-sm text-gray-700 m-0">"Em đã nộp file giải bài tập tự luyện buổi 12 rồi ạ! Em có ghi chú thêm 1 cách giải bằng phương pháp tọa độ hóa."</Paragraph>
                <div className="mt-2 flex justify-between items-center">
                  <span className="text-xs text-indigo-600 font-medium cursor-pointer flex items-center gap-1"><UserOutlined /> Xem bài nộp</span>
                  <Tag color="success" className="!m-0 rounded border-0 text-[10px]">Đã chấm điểm</Tag>
                </div>
              </div>
            </div>
            <Button type="primary" block className="mt-4 bg-indigo-600 rounded-lg">Mở kênh chat nhóm của lớp</Button>
          </Card>
          
          <Card className="rounded-2xl shadow-sm border-gray-100 bg-white" title={<span className="font-bold flex items-center gap-2 text-base"><StarFilled className="text-emerald-500" /> Đánh giá mới nhất</span>}>
            <div className="mb-4">
              <div className="flex gap-1 mb-2">
                <StarFilled className="text-emerald-500" />
                <StarFilled className="text-emerald-500" />
                <StarFilled className="text-emerald-500" />
                <StarFilled className="text-emerald-500" />
                <StarFilled className="text-emerald-500" />
              </div>
              <Paragraph className="text-sm text-gray-600 italic">"{classReviews[0]?.comment}"</Paragraph>
              <div className="flex justify-between items-center mt-2">
                <span className="text-xs font-semibold">{classReviews[0]?.studentName}</span>
                <span className="text-xs text-gray-400">{classReviews[0]?.date}</span>
              </div>
            </div>
            <Button type="link" className="px-0">Xem tất cả {cls.reviewCount} đánh giá của lớp</Button>
          </Card>
        </Col>
      </Row>
    </div>
  );

  const renderStudents = () => (
    <div className="mt-6 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
      <div className="flex justify-between items-center mb-6">
        <Title level={4} className="!m-0">Danh sách học viên ({cls.enrolled})</Title>
        <div className="flex gap-3">
          <Input placeholder="Tìm học viên..." className="rounded-lg w-[250px]" />
          <Button type="primary" className="rounded-lg bg-indigo-600">Thêm học viên</Button>
        </div>
      </div>
      <Table 
        columns={studentColumns} 
        dataSource={classStudents} 
        rowKey="id" 
        pagination={false}
      />
    </div>
  );

  const renderSessions = () => (
    <div className="mt-6 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
      <div className="flex justify-between items-center mb-6">
        <div>
          <Title level={4} className="!m-0">Lộ trình buổi học ({cls.totalSessions} buổi)</Title>
          <Text className="text-gray-500">Quản lý nội dung, điểm danh và bài tập từng buổi</Text>
        </div>
        <Button 
          type="primary" 
          icon={<PlusOutlined />} 
          className="rounded-lg bg-indigo-600"
          onClick={() => setIsSessionModalOpen(true)}
        >
          Tạo buổi học
        </Button>
      </div>

      <Table 
        columns={[
          { title: 'Tên buổi học', dataIndex: 'title', key: 'title', width: '40%', render: (t) => <div className="font-medium text-gray-800">{t}</div> },
          { title: 'Ngày học', dataIndex: 'date', key: 'date' },
          { title: 'Thời gian', key: 'time', render: (_, r: any) => `${r.startTime} - ${r.endTime}` },
          { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s) => (
            <Tag color={s === 'COMPLETED' ? 'success' : s === 'IN_PROGRESS' ? 'processing' : 'default'}>
              {s === 'COMPLETED' ? 'Đã hoàn thành' : s === 'IN_PROGRESS' ? 'Đang diễn ra' : 'Sắp tới'}
            </Tag>
          )},
          { title: 'Điểm danh', key: 'attendance', render: (_, r: any) => r.attendanceCount ? `${r.attendanceCount}/${r.totalStudents}` : '-' },
          { title: 'Thao tác', key: 'action', render: () => <Button type="link">Chi tiết</Button> }
        ]} 
        dataSource={classSessions} 
        rowKey="id" 
        pagination={false}
      />
    </div>
  );

  const renderSchedule = () => (
    <div className="mt-6 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 max-w-[800px]">
      <div className="flex justify-between items-center mb-6">
        <Title level={4} className="!m-0">Lịch giảng dạy & Ca học cố định</Title>
        <Button icon={<EditOutlined />}>Chỉnh sửa</Button>
      </div>
      <div className="flex flex-col gap-4">
        <div className="border border-gray-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-lg">T3</div>
            <div>
              <div className="font-semibold text-gray-800 text-base">Thứ Ba</div>
              <div className="text-gray-500 text-sm mt-1 flex items-center gap-2">
                <ClockCircleOutlined /> 20:00 - 21:30
              </div>
            </div>
          </div>
          <Tag color="processing">Đang áp dụng</Tag>
        </div>
        <div className="border border-gray-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-lg">T5</div>
            <div>
              <div className="font-semibold text-gray-800 text-base">Thứ Năm</div>
              <div className="text-gray-500 text-sm mt-1 flex items-center gap-2">
                <ClockCircleOutlined /> 20:00 - 21:30
              </div>
            </div>
          </div>
          <Tag color="processing">Đang áp dụng</Tag>
        </div>
      </div>
    </div>
  );

  const renderReviews = () => (
    <div className="mt-6 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 max-w-[800px]">
      <Title level={4} className="mb-6">Đánh giá từ học viên</Title>
      
      <div className="flex items-center gap-8 mb-8 bg-gray-50 p-6 rounded-xl border border-gray-100">
        <div className="text-center">
          <div className="text-5xl font-bold text-gray-900 mb-2">{cls.rating}</div>
          <div className="flex gap-1 justify-center mb-1">
            <StarFilled className="text-yellow-400 text-lg" />
            <StarFilled className="text-yellow-400 text-lg" />
            <StarFilled className="text-yellow-400 text-lg" />
            <StarFilled className="text-yellow-400 text-lg" />
            <StarFilled className="text-yellow-400 text-lg" />
          </div>
          <div className="text-sm text-gray-500">{cls.reviewCount} đánh giá</div>
        </div>
        <div className="flex-1 flex flex-col gap-2">
          {[5,4,3,2,1].map(star => (
            <div key={star} className="flex items-center gap-3">
              <span className="w-4 font-medium text-gray-600 text-sm">{star}</span>
              <StarFilled className="text-gray-300 text-xs" />
              <Progress percent={star === 5 ? 85 : star === 4 ? 10 : 0} showInfo={false} strokeColor="#FBBF24" className="!m-0 max-w-[200px]" size="small" />
            </div>
          ))}
        </div>
      </div>

      <List
        dataSource={classReviews}
        renderItem={(review: any) => (
          <List.Item className="border-b last:border-0 py-6">
            <div className="w-full">
              <div className="flex justify-between items-start mb-2">
                <div className="flex gap-3">
                  <Avatar className="bg-indigo-600">{review.studentName.charAt(0)}</Avatar>
                  <div>
                    <div className="font-semibold">{review.studentName}</div>
                    <div className="text-xs text-gray-400">{review.date}</div>
                  </div>
                </div>
                <div className="flex gap-1">
                  {[...Array(5)].map((_, i) => <StarFilled key={i} className={i < review.rating ? "text-yellow-400" : "text-gray-200"} />)}
                </div>
              </div>
              <Paragraph className="mt-3 text-gray-700 bg-gray-50 p-4 rounded-lg italic">"{review.comment}"</Paragraph>
            </div>
          </List.Item>
        )}
      />
    </div>
  );

  const renderSettings = () => (
    <div className="mt-6 max-w-[600px] flex flex-col gap-6">
      <Card className="rounded-2xl shadow-sm border-gray-100" title="Cài đặt cơ bản">
        <Form layout="vertical">
          <Form.Item label="Sĩ số tối đa">
            <Input defaultValue={cls.capacity} type="number" />
          </Form.Item>
          <Form.Item label="Mô tả lớp">
            <Input.TextArea rows={4} defaultValue="Lớp học trực tiếp qua phòng học ảo Edunity Live..." />
          </Form.Item>
          <Button type="primary">Lưu thay đổi</Button>
        </Form>
      </Card>
      
      <Card className="rounded-2xl shadow-sm border-red-100 bg-red-50/30" title={<span className="text-red-600">Danger Zone</span>}>
        <div className="flex items-center justify-between py-2 border-b border-red-100 mb-2">
          <div>
            <div className="font-medium text-gray-900">Đóng tuyển sinh</div>
            <div className="text-sm text-gray-500">Học viên sẽ không thể đăng ký thêm vào lớp này</div>
          </div>
          <Button danger>Đóng tuyển sinh</Button>
        </div>
        <div className="flex items-center justify-between py-2">
          <div>
            <div className="font-medium text-gray-900">Kết thúc lớp học</div>
            <div className="text-sm text-gray-500">Đóng gói tài liệu, ghi sổ điểm và kết thúc khóa học</div>
          </div>
          <Button type="primary" danger>Kết thúc lớp</Button>
        </div>
      </Card>
    </div>
  );

  return (
    <div className="flex flex-col w-full pb-10">
      <Breadcrumb 
        className="mb-4 text-sm font-medium"
        items={[
          { title: <a href={ROUTES.TEACHER.HOME}>Tổng quan</a> },
          { title: <a href={ROUTES.TEACHER.CLASSES}>Lớp của tôi</a> },
          { title: cls.courseName },
        ]}
      />

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-6">
        <div>
          <Title level={2} className="!m-0 mb-3 text-gray-900">{cls.name}</Title>
          <div className="flex flex-wrap items-center gap-3">
            <Tag color={cls.type === 'PAID' ? 'indigo' : 'green'} className="!m-0 px-2 py-0.5 rounded font-bold">{cls.type}</Tag>
            <Tag color="success" className="!m-0 px-2 py-0.5 rounded font-medium">Đang học</Tag>
            <Tag className="!m-0 px-2 py-0.5 border-0 bg-gray-100 text-gray-600 font-medium">Khai giảng: {cls.startDate}</Tag>
          </div>
          <div className="flex flex-wrap items-center gap-6 mt-4 text-sm text-gray-600 font-medium">
            <span className="flex items-center gap-1.5"><TeamOutlined /> Sĩ số: <strong className="text-gray-900">{cls.enrolled}/{cls.capacity}</strong> học viên</span>
            <span className="text-gray-300">•</span>
            <span className="flex items-center gap-1.5"><CalendarOutlined /> Lịch học: <strong className="text-gray-900">{cls.schedule}</strong></span>
            <span className="text-gray-300">•</span>
            <span className="flex items-center gap-1.5"><VideoCameraOutlined className="text-indigo-500" /> Phòng học: <strong className="text-indigo-600 underline">Live Virtual Room #ED-102</strong></span>
          </div>
        </div>

        <div className="flex flex-col gap-3 shrink-0">
          <Button type="primary" size="large" icon={<PlayCircleOutlined />} className="bg-indigo-600 hover:bg-indigo-700 rounded-xl font-bold px-6 shadow-md shadow-indigo-200">
            Bắt đầu buổi học (Vào lớp Live)
          </Button>
          <div className="flex gap-2">
            <Button className="flex-1 rounded-xl bg-white font-medium" icon={<EditOutlined />}>Chỉnh sửa lớp</Button>
            <Button className="rounded-xl bg-white" icon={<CalendarOutlined />} />
            <Button className="rounded-xl bg-white" icon={<TeamOutlined />} />
          </div>
        </div>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        size="large"
        className="font-medium custom-tabs"
        items={[
          { key: 'overview', label: `Tổng quan`, children: renderOverview() },
          { key: 'students', label: `Học viên (${cls.enrolled})`, children: renderStudents() },
          { key: 'sessions', label: `Buổi học / Sessions (${cls.totalSessions})`, children: renderSessions() },
          { key: 'schedule', label: `Lịch học & Phòng`, children: renderSchedule() },
          { key: 'documents', label: `Tài liệu & Bài tập` },
          { key: 'reviews', label: `Đánh giá (${cls.reviewCount})`, children: renderReviews() },
          { key: 'settings', label: `Cài đặt lớp`, children: renderSettings() },
        ]}
      />

      <Modal
        title="Tạo buổi học mới"
        open={isSessionModalOpen}
        onCancel={() => setIsSessionModalOpen(false)}
        onOk={() => {
          message.success('Tạo buổi học thành công!');
          setIsSessionModalOpen(false);
        }}
        okText="Lưu"
        cancelText="Hủy"
        okButtonProps={{ className: 'bg-indigo-600' }}
      >
        <Form layout="vertical" className="mt-4">
          <Form.Item label="Tên buổi học" required>
            <Input placeholder="VD: Buổi 14: Luyện đề tổng hợp" />
          </Form.Item>
          <Form.Item label="Ngày học" required>
            <DatePicker className="w-full" format="DD/MM/YYYY" />
          </Form.Item>
          <div className="flex gap-4">
            <Form.Item label="Giờ bắt đầu" className="flex-1" required>
              <TimePicker format="HH:mm" className="w-full" />
            </Form.Item>
            <Form.Item label="Giờ kết thúc" className="flex-1" required>
              <TimePicker format="HH:mm" className="w-full" />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
