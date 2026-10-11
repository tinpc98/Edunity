import { useState } from 'react';
import { 
  Typography, Tabs, Breadcrumb, Tag, Button, Row, Col, Card, 
  Modal, Form, Input, InputNumber, DatePicker, Skeleton, Alert, message, List, Popconfirm, Table,
  Avatar, Empty
} from 'antd';
import { 
  CalendarOutlined, 
  TeamOutlined, 
  ClockCircleOutlined, 
  EditOutlined, 
  StarFilled, 
  SendOutlined,
  BookOutlined,
  PlusOutlined,
  DeleteOutlined,
  StopOutlined,
  PoweroffOutlined,
  UserOutlined,
  VideoCameraOutlined,
  MessageOutlined
} from '@ant-design/icons';

import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { ROUTES } from '../../../../routes/routePaths';
import { classService, classKeys } from '../../../../services/class.service';
import { messageService } from '../../../../services/message.service';
import { sessionService, sessionKeys } from '../../../../services/session.service';
import type { UpdateClassPayload, ClassStudentRosterItem, PaymentSourceType } from '../../../../types/class';
import { CLASS_STATUS_LABELS, CLASS_STATUS_COLORS } from '../../../../types/class';
import { deriveScheduleText } from '../../../../api/classAdapters';
import type { 
  CreateSessionPayload, 
  UpdateSessionPayload, 
  Session, 
  SessionAttendanceItem 
} from '../../../../types/session';
import { 
  SESSION_STATUS_LABELS, 
  SESSION_STATUS_COLORS 
} from '../../../../types/session';
import { formatSessionTimeRange } from '../../../../api/sessionAdapters';

const { Title, Text, Paragraph } = Typography;

export default function TeacherClassDetailPage() {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('overview');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm] = Form.useForm();

  // Student roster & messaging state
  const [isOpeningChat, setIsOpeningChat] = useState<string | null>(null);

  const {
    data: students = [],
    isLoading: isLoadingStudents,
    isError: isStudentsError,
  } = useQuery({
    queryKey: classKeys.teacherStudents(classId!),
    queryFn: () => classService.getClassStudents(classId!),
    enabled: Boolean(classId),
  });

  const handleMessageStudent = async (studentId: string | null) => {
    if (!studentId) {
      message.warning("Không thể trò chuyện với học viên này do thiếu thông tin tài khoản");
      return;
    }
    setIsOpeningChat(studentId);
    try {
      const conv = await messageService.openConversation({
        participantId: studentId,
        classId,
      });
      navigate(`/messages?id=${conv.id}`);
    } catch (err: any) {
      message.error(err?.message || "Không thể mở cuộc trò chuyện với học viên");
    } finally {
      setIsOpeningChat(null);
    }
  };

  // Session management state
  const [isCreateSessionModalOpen, setIsCreateSessionModalOpen] = useState(false);
  const [isEditSessionModalOpen, setIsEditSessionModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [createSessionForm] = Form.useForm();
  const [editSessionForm] = Form.useForm();

  // Attendance state
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [attendanceData, setAttendanceData] = useState<SessionAttendanceItem[]>([]);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);
  const [attendanceSessionTitle, setAttendanceSessionTitle] = useState('');

  // 1. Fetch Class Detail via React Query
  const { 
    data: cls, 
    isLoading, 
    isError, 
    error
  } = useQuery({
    queryKey: classKeys.teacherDetail(classId!),
    queryFn: () => classService.getMyClass(classId!),
    enabled: Boolean(classId),
    staleTime: 1000 * 30,
  });

  // 2. Mutation: Update Class
  const updateMutation = useMutation({
    mutationFn: (payload: UpdateClassPayload) => classService.updateClass(classId!, payload),
    onSuccess: () => {
      message.success("Cập nhật thông tin lớp học thành công!");
      setIsEditModalOpen(false);
      queryClient.invalidateQueries({ queryKey: classKeys.teacherDetail(classId!) });
      queryClient.invalidateQueries({ queryKey: classKeys.teacherList() });
    },
    onError: (err: any) => {
      message.error(err?.message || "Không thể cập nhật lớp học.");
    },
  });

  // 3. Mutation: Submit Class for Approval
  const submitMutation = useMutation({
    mutationFn: () => classService.submitClass(classId!),
    onSuccess: () => {
      message.success("Đã gửi lớp học cho Quản trị viên duyệt!");
      queryClient.invalidateQueries({ queryKey: classKeys.teacherDetail(classId!) });
      queryClient.invalidateQueries({ queryKey: classKeys.teacherList() });
    },
    onError: (err: any) => {
      message.error(err?.message || "Không thể gửi duyệt lớp học.");
    },
  });

  // 4. Mutation: Create Session
  const createSessionMutation = useMutation({
    mutationFn: (payload: CreateSessionPayload) => sessionService.createSession(classId!, payload),
    onSuccess: () => {
      message.success("Tạo buổi học thành công!");
      setIsCreateSessionModalOpen(false);
      createSessionForm.resetFields();
      queryClient.invalidateQueries({ queryKey: classKeys.teacherDetail(classId!) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.classSessions(classId!) });
    },
    onError: (err: any) => {
      message.error(err?.message || "Không thể tạo buổi học.");
    },
  });

  // 5. Mutation: Auto-plan Sessions from schedule
  const autoPlanMutation = useMutation({
    mutationFn: async () => {
      const planned = await sessionService.getPlannedSessions(classId!);
      if (!planned || planned.length === 0) {
        throw new Error("Không có buổi học nào được tính toán từ lịch khai giảng và ca học.");
      }
      const bulkPayload = {
        sessions: planned.map((p) => ({
          title: `Buổi ${p.index}: ${cls?.className || 'Buổi học'}`,
          startDatetime: p.startDatetime,
          endDatetime: p.endDatetime,
        })),
      };
      return await sessionService.createSessionsBulk(classId!, bulkPayload);
    },
    onSuccess: (res) => {
      message.success(`Đã tự động khởi tạo ${res.length} buổi học theo lịch cố định!`);
      queryClient.invalidateQueries({ queryKey: classKeys.teacherDetail(classId!) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.classSessions(classId!) });
    },
    onError: (err: any) => {
      message.error(err?.message || "Không thể lập lịch tự động.");
    },
  });

  // 6. Mutation: Update Session
  const updateSessionMutation = useMutation({
    mutationFn: ({ sessionId, payload }: { sessionId: string; payload: UpdateSessionPayload }) => 
      sessionService.updateSession(sessionId, payload),
    onSuccess: () => {
      message.success("Cập nhật buổi học thành công!");
      setIsEditSessionModalOpen(false);
      setEditingSession(null);
      queryClient.invalidateQueries({ queryKey: classKeys.teacherDetail(classId!) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.classSessions(classId!) });
    },
    onError: (err: any) => {
      message.error(err?.message || "Không thể cập nhật buổi học.");
    },
  });

  // 7. Mutation: Cancel Session
  const cancelSessionMutation = useMutation({
    mutationFn: (sessionId: string) => sessionService.cancelSession(sessionId),
    onSuccess: () => {
      message.success("Đã hủy buổi học!");
      queryClient.invalidateQueries({ queryKey: classKeys.teacherDetail(classId!) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.classSessions(classId!) });
    },
    onError: (err: any) => {
      message.error(err?.message || "Không thể hủy buổi học.");
    },
  });

  // 8. Mutation: Delete Session (DRAFT/REJECTED only)
  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId: string) => sessionService.deleteSession(sessionId),
    onSuccess: () => {
      message.success("Đã xóa buổi học!");
      queryClient.invalidateQueries({ queryKey: classKeys.teacherDetail(classId!) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.classSessions(classId!) });
    },
    onError: (err: any) => {
      message.error(err?.message || "Không thể xóa buổi học.");
    },
  });

  // 9. Mutation: End Session (IN_PROGRESS only)
  const endSessionMutation = useMutation({
    mutationFn: (sessionId: string) => sessionService.endSession(sessionId),
    onSuccess: () => {
      message.success("Đã kết thúc buổi học và hoàn tất điểm danh!");
      queryClient.invalidateQueries({ queryKey: classKeys.teacherDetail(classId!) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.classSessions(classId!) });
    },
    onError: (err: any) => {
      message.error(err?.message || "Không thể kết thúc buổi học.");
    },
  });

  if (isLoading) {
    return (
      <div className="site-container py-10 min-h-screen">
        <Skeleton active paragraph={{ rows: 10 }} />
      </div>
    );
  }

  if (isError || !cls) {
    return (
      <div className="site-container py-10 min-h-screen">
        <Alert
          type="error"
          showIcon
          message="Không tìm thấy lớp học"
          description={(error as any)?.message || "Lớp học không tồn tại hoặc bạn không có quyền truy cập."}
          action={
            <Link to={ROUTES.TEACHER.CLASSES}>
              <Button type="primary">Quay lại danh sách lớp</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const isEditable = cls.status === 'DRAFT' || cls.status === 'REJECTED';
  const isClassClosed = cls.status === 'COMPLETED' || cls.status === 'CANCELLED';
  const scheduleDisplay = deriveScheduleText(cls.schedule);
  const progressPercent = cls.capacity > 0 
    ? Math.min(100, Math.round((cls.enrolledCount / cls.capacity) * 100))
    : 0;

  const handleOpenEdit = () => {
    editForm.setFieldsValue({
      className: cls.className,
      description: cls.description,
      capacity: cls.capacity,
      price: cls.price,
      startDate: cls.startDate ? dayjs(cls.startDate) : null,
      endDate: cls.endDate ? dayjs(cls.endDate) : null,
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    try {
      const values = await editForm.validateFields();
      const payload: UpdateClassPayload = {
        className: values.className,
        description: values.description,
        capacity: Number(values.capacity),
        price: cls.classType === 'FREE' ? 0 : Number(values.price || 0),
        startDate: values.startDate ? values.startDate.toISOString() : null,
        endDate: values.endDate ? values.endDate.toISOString() : null,
      };
      updateMutation.mutate(payload);
    } catch {
      // Form validation error
    }
  };

  // Handle open create session
  const handleOpenCreateSession = () => {
    createSessionForm.resetFields();
    // Pre-fill default times if class has startDate
    if (cls.startDate) {
      const defaultStart = dayjs(cls.startDate).hour(19).minute(0);
      const defaultEnd = dayjs(cls.startDate).hour(20).minute(30);
      createSessionForm.setFieldsValue({
        title: `Buổi ${((cls.sessions || []).length) + 1}`,
        startDatetime: defaultStart,
        endDatetime: defaultEnd,
      });
    }
    setIsCreateSessionModalOpen(true);
  };

  const handleSaveCreateSession = async () => {
    try {
      const values = await createSessionForm.validateFields();
      const payload: CreateSessionPayload = {
        title: values.title,
        description: values.description || undefined,
        startDatetime: values.startDatetime.toISOString(),
        endDatetime: values.endDatetime.toISOString(),
      };
      createSessionMutation.mutate(payload);
    } catch {
      // Form validation error
    }
  };

  // Handle open edit session
  const handleOpenEditSession = (session: Session) => {
    setEditingSession(session);
    editSessionForm.setFieldsValue({
      title: session.title,
      description: session.description,
      startDatetime: dayjs(session.startDatetime),
      endDatetime: dayjs(session.endDatetime),
    });
    setIsEditSessionModalOpen(true);
  };

  const handleSaveEditSession = async () => {
    if (!editingSession) return;
    try {
      const values = await editSessionForm.validateFields();
      const payload: UpdateSessionPayload = {
        title: values.title,
        description: values.description || undefined,
        startDatetime: values.startDatetime.toISOString(),
        endDatetime: values.endDatetime.toISOString(),
      };
      updateSessionMutation.mutate({ sessionId: editingSession.id, payload });
    } catch {
      // Form validation error
    }
  };

  // Handle view attendance
  const handleViewAttendance = async (session: Session) => {
    setAttendanceSessionTitle(session.title);
    setIsAttendanceModalOpen(true);
    setIsLoadingAttendance(true);
    try {
      const list = await sessionService.getSessionAttendance(session.id);
      setAttendanceData(list);
    } catch (err: any) {
      message.error(err?.message || "Không thể tải danh sách điểm danh");
    } finally {
      setIsLoadingAttendance(false);
    }
  };

  // ---------------- Tab 1: Overview ----------------
  const renderOverview = () => (
    <div className="flex flex-col gap-6 mt-6">
      {/* Overview Stats */}
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-gray-100 bg-white">
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">Sĩ số lớp</Text>
              <div className="w-8 h-8 rounded bg-indigo-50 flex items-center justify-center text-indigo-500">
                <TeamOutlined />
              </div>
            </div>
            <div className="flex items-end gap-2 mb-2">
              <Title level={2} className="!m-0 text-gray-900">{cls.enrolledCount}</Title>
              <span className="text-gray-500 text-lg mb-1">/ {cls.capacity}</span>
            </div>
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-indigo-600 font-semibold">{progressPercent}% Đầy chỗ</span>
              <span className="text-gray-500">Còn {cls.seatsLeft} chỗ</span>
            </div>
          </Card>
        </Col>

        <Col xs={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-gray-100 bg-white">
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">Loại hình</Text>
              <div className="w-8 h-8 rounded bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold text-xs">
                {cls.classType}
              </div>
            </div>
            <div className="flex items-end gap-2 mb-2">
              <Title level={3} className={`!m-0 ${cls.classType === 'FREE' ? 'text-emerald-600' : 'text-indigo-700'}`}>
                {cls.formattedPrice}
              </Title>
            </div>
            <div className="text-xs text-gray-500 font-medium">
              {cls.classType === 'FREE' ? 'Lớp học cộng đồng miễn phí' : 'Học phí trọn khóa'}
            </div>
          </Card>
        </Col>

        <Col xs={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-gray-100 bg-white">
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">Số buổi học</Text>
              <div className="w-8 h-8 rounded bg-amber-50 flex items-center justify-center text-amber-500">
                <ClockCircleOutlined />
              </div>
            </div>
            <div className="flex items-end gap-2 mb-2">
              <Title level={2} className="!m-0 text-gray-900">{(cls.sessions || []).length}</Title>
              <span className="text-gray-500 text-lg mb-1">buổi</span>
            </div>
            <div className="text-xs text-gray-500 font-medium">
              Đã lên lịch trong hệ thống
            </div>
          </Card>
        </Col>

        <Col xs={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-gray-100 bg-white">
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">Đánh giá trung bình</Text>
              <div className="w-8 h-8 rounded bg-rose-50 flex items-center justify-center text-rose-500">
                <StarFilled />
              </div>
            </div>
            <div className="flex items-end gap-2 mb-2">
              <Title level={2} className="!m-0 text-gray-900">{cls.ratingAverage?.toFixed(1) || '0.0'}</Title>
              <StarFilled className="text-amber-400 text-lg mb-1" />
            </div>
            <div className="text-xs text-gray-500 font-medium">
              {cls.ratingCount || 0} lượt đánh giá từ học viên
            </div>
          </Card>
        </Col>
      </Row>

      {/* Main Details Card */}
      <Card className="rounded-2xl shadow-sm border-gray-100">
        <Title level={4} className="!mb-4">Thông tin khóa học & Giảng dạy</Title>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          <div>
            <Text className="text-gray-400 block mb-1">Khóa học chuẩn:</Text>
            <div className="font-semibold text-indigo-700 text-base">{cls.courseTitle}</div>
          </div>
          <div>
            <Text className="text-gray-400 block mb-1">Lịch học cố định:</Text>
            <div className="font-semibold text-gray-800">{scheduleDisplay}</div>
          </div>
          <div>
            <Text className="text-gray-400 block mb-1">Thời gian khai giảng:</Text>
            <div className="font-semibold text-gray-800">
              {cls.startDate ? new Date(cls.startDate).toLocaleDateString('vi-VN') : 'Chưa đặt'}
            </div>
          </div>
          <div>
            <Text className="text-gray-400 block mb-1">Thời gian kết thúc:</Text>
            <div className="font-semibold text-gray-800">
              {cls.endDate ? new Date(cls.endDate).toLocaleDateString('vi-VN') : 'Chưa đặt'}
            </div>
          </div>
        </div>

        {cls.description && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <Text className="text-gray-400 block mb-2 font-medium">Mô tả chi tiết lớp học:</Text>
            <Paragraph className="text-gray-700 leading-relaxed whitespace-pre-line !m-0">
              {cls.description}
            </Paragraph>
          </div>
        )}
      </Card>
    </div>
  );

  // ---------------- Tab 2: Sessions List ----------------
  const sessionsList = (cls.sessions || []) as Session[];

  const renderSessions = () => (
    <div className="mt-6 flex flex-col gap-6">
      {/* Session Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-2xs">
        <div>
          <Title level={4} className="!m-0">Danh sách buổi học ({sessionsList.length})</Title>
          <Text className="text-gray-500 text-xs">
            Quản lý kế hoạch buổi học, ca học trực tuyến và theo dõi trạng thái điểm danh
          </Text>
        </div>
        <div className="flex items-center gap-3">
          {/* Auto Plan Button */}
          {cls.schedule && cls.schedule.length > 0 && cls.startDate && cls.endDate && !isClassClosed && (
            <Popconfirm
              title="Lập lịch tự động"
              description="Hệ thống sẽ tạo danh sách buổi học tự động dựa trên ngày khai giảng, ngày kết thúc và các ca học cố định. Bạn có muốn tiếp tục?"
              onConfirm={() => autoPlanMutation.mutate()}
              okText="Đồng ý tạo"
              cancelText="Hủy"
              okButtonProps={{ loading: autoPlanMutation.isPending, className: 'bg-indigo-600' }}
            >
              <Button 
                icon={<CalendarOutlined />}
                loading={autoPlanMutation.isPending}
                className="rounded-xl font-medium"
              >
                Lập lịch tự động
              </Button>
            </Popconfirm>
          )}

          {/* Add Session Button */}
          {!isClassClosed && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenCreateSession}
              className="bg-indigo-600 hover:bg-indigo-700 rounded-xl font-bold px-5"
            >
              Thêm buổi học
            </Button>
          )}
        </div>
      </div>

      {sessionsList.length === 0 ? (
        <Card className="rounded-2xl text-center py-16 border-dashed border-gray-300">
          <ClockCircleOutlined className="text-5xl text-gray-300 mb-4" />
          <Title level={4} className="text-gray-700 !mb-2">Chưa có buổi học nào được tạo</Title>
          <Paragraph className="text-gray-400 text-sm max-w-md mx-auto mb-6">
            Lớp học cần có ít nhất một buổi học hợp lệ trước khi gửi phê duyệt tới Quản trị viên.
          </Paragraph>
          {!isClassClosed && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              size="large"
              onClick={handleOpenCreateSession}
              className="bg-indigo-600 hover:bg-indigo-700 rounded-xl font-medium"
            >
              Tạo buổi học đầu tiên
            </Button>
          )}
        </Card>
      ) : (
        <List
          dataSource={sessionsList}
          renderItem={(session: Session, index: number) => {
            const isScheduled = session.status === 'SCHEDULED';
            const isInProgress = session.status === 'IN_PROGRESS';
            const isCompleted = session.status === 'COMPLETED';
            const isCancelled = session.status === 'CANCELLED';

            return (
              <Card 
                key={session.id || index} 
                className={`rounded-2xl border transition-all mb-3.5 shadow-2xs hover:shadow-xs ${
                  isInProgress ? 'border-amber-300 bg-amber-50/20' : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-base shrink-0 ${
                      isInProgress 
                        ? 'bg-amber-100 text-amber-700' 
                        : isCompleted 
                        ? 'bg-emerald-100 text-emerald-700' 
                        : isCancelled 
                        ? 'bg-gray-100 text-gray-400' 
                        : 'bg-indigo-50 text-indigo-600'
                    }`}>
                      {index + 1}
                    </div>

                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <Title level={5} className="!m-0 text-gray-900 font-semibold">
                          {session.title || `Buổi học ${index + 1}`}
                        </Title>
                        <Tag color={SESSION_STATUS_COLORS[session.status]} className="font-bold rounded-md">
                          {SESSION_STATUS_LABELS[session.status] || session.status}
                        </Tag>
                      </div>

                      {session.description && (
                        <Text className="text-gray-500 text-xs block mt-1 line-clamp-2">
                          {session.description}
                        </Text>
                      )}

                      <div className="flex items-center gap-4 text-xs text-gray-500 mt-2 flex-wrap">
                        <span className="flex items-center gap-1 font-medium text-gray-700">
                          <CalendarOutlined className="text-indigo-500" />
                          {session.startDatetime ? new Date(session.startDatetime).toLocaleDateString('vi-VN') : '-'}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 font-medium text-gray-700">
                          <ClockCircleOutlined className="text-indigo-500" />
                          {formatSessionTimeRange(session.startDatetime, session.endDatetime)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions per session */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    {/* Join Classroom button if SCHEDULED or IN_PROGRESS */}
                    {(isScheduled || isInProgress) && (
                      <Link to={`/classroom/${session.id}`}>
                        <Button
                          type="primary"
                          size="small"
                          icon={<VideoCameraOutlined />}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold"
                        >
                          {isInProgress ? "Vào lớp (LIVE)" : "Vào lớp"}
                        </Button>
                      </Link>
                    )}

                    {/* Attendance button if IN_PROGRESS or COMPLETED */}
                    {(isInProgress || isCompleted) && (
                      <Button
                        size="small"
                        icon={<TeamOutlined />}
                        onClick={() => handleViewAttendance(session)}
                        className="rounded-lg text-xs"
                      >
                        Điểm danh
                      </Button>
                    )}


                    {/* End session button if IN_PROGRESS */}
                    {isInProgress && (
                      <Popconfirm
                        title="Kết thúc buổi học"
                        description="Hệ thống sẽ chuyển trạng thái buổi học sang Hoàn thành (COMPLETED) và chốt danh sách điểm danh. Bạn có chắc chắn?"
                        onConfirm={() => endSessionMutation.mutate(session.id)}
                        okText="Kết thúc"
                        cancelText="Hủy"
                        okButtonProps={{ loading: endSessionMutation.isPending, danger: true }}
                      >
                        <Button
                          size="small"
                          danger
                          icon={<PoweroffOutlined />}
                          loading={endSessionMutation.isPending}
                          className="rounded-lg text-xs font-semibold"
                        >
                          Kết thúc buổi
                        </Button>
                      </Popconfirm>
                    )}

                    {/* Edit button if SCHEDULED */}
                    {isScheduled && (
                      <Button
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleOpenEditSession(session)}
                        className="rounded-lg text-xs"
                      >
                        Sửa
                      </Button>
                    )}

                    {/* Cancel session if SCHEDULED */}
                    {isScheduled && (
                      <Popconfirm
                        title="Hủy buổi học"
                        description="Bạn có chắc chắn muốn hủy buổi học này không? Học viên sẽ thấy trạng thái Đã hủy."
                        onConfirm={() => cancelSessionMutation.mutate(session.id)}
                        okText="Hủy buổi"
                        cancelText="Đóng"
                        okButtonProps={{ loading: cancelSessionMutation.isPending, danger: true }}
                      >
                        <Button
                          size="small"
                          danger
                          icon={<StopOutlined />}
                          loading={cancelSessionMutation.isPending}
                          className="rounded-lg text-xs"
                        >
                          Hủy
                        </Button>
                      </Popconfirm>
                    )}

                    {/* Delete session if DRAFT or REJECTED */}
                    {isScheduled && isEditable && (
                      <Popconfirm
                        title="Xóa buổi học"
                        description="Buổi học sẽ bị xóa hoàn toàn khỏi kế hoạch giảng dạy. Thao tác này không thể hoàn tác."
                        onConfirm={() => deleteSessionMutation.mutate(session.id)}
                        okText="Xóa"
                        cancelText="Đóng"
                        okButtonProps={{ loading: deleteSessionMutation.isPending, danger: true }}
                      >
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          loading={deleteSessionMutation.isPending}
                          className="rounded-lg text-xs"
                        />
                      </Popconfirm>
                    )}
                  </div>
                </div>
              </Card>
            );
          }}
        />
      )}
    </div>
  );

  // ---------------- Tab 3: Students Roster ----------------
  const getPaymentSourceTag = (source: PaymentSourceType) => {
    switch (source) {
      case "FREE":
        return <Tag color="default">Miễn phí</Tag>;
      case "DIRECT_PAYMENT":
        return <Tag color="blue">Tự thanh toán</Tag>;
      case "SCHOLARSHIP":
        return <Tag color="green">Học bổng</Tag>;
      case "MIXED":
        return <Tag color="purple">Hỗn hợp</Tag>;
      default:
        return <Tag>{source}</Tag>;
    }
  };

  const getEnrollmentStatusTag = (status: string) => {
    switch (status) {
      case "CONFIRMED":
        return <Tag color="success">Đã xác nhận</Tag>;
      case "COMPLETED":
        return <Tag color="purple">Đã hoàn thành</Tag>;
      case "PENDING":
        return <Tag color="warning">Chờ xử lý</Tag>;
      case "CANCELLED":
        return <Tag color="default">Đã hủy</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  const studentColumns = [
    {
      title: "Học viên",
      key: "student",
      render: (_: unknown, record: ClassStudentRosterItem) => (
        <div className="flex items-center gap-3">
          <Avatar
            src={record.avatarUrl}
            icon={!record.avatarUrl && <UserOutlined />}
            size={40}
            className="border border-slate-200 shrink-0"
          />
          <div className="min-w-0">
            <div className="font-semibold text-slate-800 text-sm truncate">
              {record.fullName || "Học viên"}
            </div>
            <div className="text-xs text-slate-400 truncate">{record.email || "—"}</div>
          </div>
        </div>
      ),
    },
    {
      title: "Trạng thái đăng ký",
      dataIndex: "enrollmentStatus",
      key: "enrollmentStatus",
      render: (status: string) => getEnrollmentStatusTag(status),
    },
    {
      title: "Nguồn thanh toán",
      dataIndex: "paymentSource",
      key: "paymentSource",
      render: (source: PaymentSourceType) => getPaymentSourceTag(source),
    },
    {
      title: "Ngày tham gia",
      dataIndex: "enrolledAt",
      key: "enrolledAt",
      render: (date: string) => (
        <span className="text-xs text-slate-600">
          {date ? dayjs(date).format("DD/MM/YYYY HH:mm") : "—"}
        </span>
      ),
    },
    {
      title: "Thao tác",
      key: "actions",
      render: (_: unknown, record: ClassStudentRosterItem) => (
        <Button
          type="primary"
          ghost
          size="small"
          icon={<MessageOutlined />}
          loading={isOpeningChat === record.studentId}
          disabled={!record.studentId}
          onClick={() => handleMessageStudent(record.studentId)}
          className="rounded-lg text-xs"
        >
          Nhắn tin
        </Button>
      ),
    },
  ];

  const renderStudents = () => (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Text className="font-semibold text-slate-800 text-base">Danh sách học viên</Text>
          <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">
            {students.length} học viên
          </span>
        </div>
      </div>

      {isStudentsError ? (
        <Alert
          type="error"
          message="Không thể tải danh sách học viên"
          description="Đã xảy ra lỗi khi tải danh sách học viên của lớp học. Vui lòng kiểm tra quyền truy cập hoặc thử lại sau."
          className="rounded-xl"
        />
      ) : students.length === 0 && !isLoadingStudents ? (
        <Card className="rounded-2xl border-slate-200 text-center py-12 bg-white">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span className="text-slate-500 font-medium">
                Chưa có học viên đăng ký lớp này.
              </span>
            }
          />
        </Card>
      ) : (
        <Card className="rounded-2xl border-slate-200 bg-white overflow-hidden p-0 shadow-sm">
          <Table
            rowKey="enrollmentId"
            columns={studentColumns}
            dataSource={students}
            loading={isLoadingStudents}
            pagination={{ pageSize: 10, showTotal: (t) => `Tổng số ${t} học viên` }}
            scroll={{ x: 700 }}
          />
        </Card>
      )}
    </div>
  );

  return (
    <div className="flex flex-col w-full pb-10 max-w-[1200px] mx-auto">
      <Breadcrumb 
        className="mb-4 text-sm font-medium"
        items={[
          { title: <Link to={ROUTES.TEACHER.HOME}>Tổng quan</Link> },
          { title: <Link to={ROUTES.TEACHER.CLASSES}>Lớp của tôi</Link> },
          { title: cls.className },
        ]}
      />

      {/* Top Banner Alert if REJECTED */}
      {cls.status === 'REJECTED' && (
        <Alert
          type="error"
          showIcon
          className="mb-6 rounded-xl border-rose-300 bg-rose-50"
          message={<span className="font-bold text-rose-900">Lớp học bị từ chối xét duyệt</span>}
          description={
            <div className="text-rose-800 text-sm mt-1">
              <div><strong>Lý do từ chối:</strong> {cls.reviewNote || "Cần bổ sung thêm thông tin theo yêu cầu của Quản trị viên."}</div>
              <div className="mt-2">Bạn có thể chỉnh sửa lại thông tin và gửi duyệt lại cho Quản trị viên.</div>
            </div>
          }
        />
      )}

      {/* Top Banner Alert if PENDING_APPROVAL */}
      {cls.status === 'PENDING_APPROVAL' && (
        <Alert
          type="warning"
          showIcon
          className="mb-6 rounded-xl border-amber-300 bg-amber-50"
          message={<span className="font-bold text-amber-900">Lớp học đang chờ Ban quản trị duyệt</span>}
          description="Hồ sơ lớp học đã được gửi tới Ban quản trị. Sau khi được duyệt, lớp sẽ tự động mở tuyển sinh công khai."
        />
      )}

      {/* Header Info & Actions */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-6">
        <div>
          <Title level={2} className="!m-0 mb-3 text-gray-900">{cls.className}</Title>
          <div className="flex flex-wrap items-center gap-3">
            <Tag color={cls.classType === 'PAID' ? 'indigo' : 'green'} className="!m-0 px-2.5 py-0.5 rounded font-bold">
              {cls.classType}
            </Tag>
            <Tag color={CLASS_STATUS_COLORS[cls.status]} className="!m-0 px-2.5 py-0.5 rounded font-bold">
              {CLASS_STATUS_LABELS[cls.status] || cls.status}
            </Tag>
            {cls.startDate && (
              <Tag className="!m-0 px-2.5 py-0.5 border-0 bg-gray-100 text-gray-600 font-medium">
                Khai giảng: {new Date(cls.startDate).toLocaleDateString('vi-VN')}
              </Tag>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-6 mt-4 text-sm text-gray-600 font-medium">
            <span className="flex items-center gap-1.5">
              <TeamOutlined /> Sĩ số: <strong className="text-gray-900">{cls.enrolledCount}/{cls.capacity}</strong> học viên
            </span>
            <span className="text-gray-300">•</span>
            <span className="flex items-center gap-1.5">
              <CalendarOutlined /> Lịch học: <strong className="text-gray-900">{scheduleDisplay}</strong>
            </span>
            <span className="text-gray-300">•</span>
            <span className="flex items-center gap-1.5">
              <BookOutlined /> Khóa học: <strong className="text-indigo-600">{cls.courseTitle}</strong>
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Submit for approval if DRAFT or REJECTED */}
          {isEditable && (
            <Popconfirm
              title="Gửi duyệt lớp học"
              description="Bạn có chắc chắn muốn gửi lớp học này để Quản trị viên phê duyệt không?"
              onConfirm={() => submitMutation.mutate()}
              okText="Gửi duyệt"
              cancelText="Hủy"
              okButtonProps={{ loading: submitMutation.isPending, className: 'bg-indigo-600' }}
            >
              <Button 
                type="primary" 
                size="large" 
                icon={<SendOutlined />}
                loading={submitMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 rounded-xl font-bold px-6 shadow-sm border-none"
              >
                Gửi duyệt lớp
              </Button>
            </Popconfirm>
          )}

          {/* Edit class if DRAFT or REJECTED */}
          {isEditable && (
            <Button 
              size="large"
              icon={<EditOutlined />} 
              onClick={handleOpenEdit}
              className="rounded-xl font-medium"
            >
              Chỉnh sửa lớp
            </Button>
          )}
        </div>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        size="large"
        className="font-medium"
        items={[
          { key: 'overview', label: `Tổng quan`, children: renderOverview() },
          { key: 'sessions', label: `Buổi học (${sessionsList.length})`, children: renderSessions() },
          { key: 'students', label: `Học viên (${students.length})`, children: renderStudents() },
        ]}
      />

      {/* Edit Class Modal */}
      <Modal
        title="Chỉnh sửa thông tin lớp học"
        open={isEditModalOpen}
        onCancel={() => setIsEditModalOpen(false)}
        onOk={handleSaveEdit}
        confirmLoading={updateMutation.isPending}
        okText="Lưu thay đổi"
        cancelText="Hủy"
        okButtonProps={{ className: 'bg-indigo-600' }}
        width={600}
      >
        <Form layout="vertical" form={editForm} className="mt-4">
          <Form.Item 
            label="Tên lớp học" 
            name="className" 
            rules={[{ required: true, message: 'Vui lòng nhập tên lớp học' }]}
          >
            <Input size="large" />
          </Form.Item>

          <Row gutter={16}>
            {cls.classType === 'PAID' && (
              <Col span={12}>
                <Form.Item 
                  label="Học phí (VNĐ)" 
                  name="price" 
                  rules={[
                    { required: true, message: 'Vui lòng nhập học phí' },
                    { type: 'number', min: 1000, message: 'Học phí phải > 0' }
                  ]}
                >
                  <InputNumber 
                    size="large" 
                    className="w-full" 
                    formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={value => Number(value!.replace(/\$\s?|(,*)/g, ''))}
                  />
                </Form.Item>
              </Col>
            )}
            <Col span={cls.classType === 'PAID' ? 12 : 24}>
              <Form.Item 
                label="Sĩ số tối đa" 
                name="capacity" 
                rules={[
                  { required: true, message: 'Vui lòng nhập sĩ số' },
                  { type: 'number', min: 1, message: 'Sĩ số phải >= 1' }
                ]}
              >
                <InputNumber size="large" className="w-full" min={1} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Ngày khai giảng" name="startDate">
                <DatePicker size="large" className="w-full" format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Ngày kết thúc" name="endDate">
                <DatePicker size="large" className="w-full" format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Mô tả lớp học" name="description">
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Create Session Modal */}
      <Modal
        title="Thêm buổi học mới"
        open={isCreateSessionModalOpen}
        onCancel={() => setIsCreateSessionModalOpen(false)}
        onOk={handleSaveCreateSession}
        confirmLoading={createSessionMutation.isPending}
        okText="Tạo buổi học"
        cancelText="Hủy"
        okButtonProps={{ className: 'bg-indigo-600' }}
        width={560}
      >
        <Form layout="vertical" form={createSessionForm} className="mt-4">
          <Form.Item
            label="Tiêu đề buổi học"
            name="title"
            rules={[{ required: true, message: 'Vui lòng nhập tiêu đề buổi học' }]}
          >
            <Input size="large" placeholder="VD: Buổi 1: Giới thiệu nhập môn" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Bắt đầu lúc"
                name="startDatetime"
                rules={[{ required: true, message: 'Vui lòng chọn thời gian bắt đầu' }]}
              >
                <DatePicker 
                  showTime 
                  format="DD/MM/YYYY HH:mm" 
                  size="large" 
                  className="w-full"
                  placeholder="Chọn thời điểm"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Kết thúc lúc"
                name="endDatetime"
                rules={[
                  { required: true, message: 'Vui lòng chọn thời gian kết thúc' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      const start = getFieldValue('startDatetime');
                      if (!value || !start || value.isAfter(start)) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error('Thời gian kết thúc phải sau thời gian bắt đầu'));
                    },
                  }),
                ]}
              >
                <DatePicker 
                  showTime 
                  format="DD/MM/YYYY HH:mm" 
                  size="large" 
                  className="w-full"
                  placeholder="Chọn thời điểm"
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Mô tả nội dung buổi học" name="description">
            <Input.TextArea rows={3} placeholder="Nội dung chính hoặc yêu cầu chuẩn bị cho học viên..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Session Modal */}
      <Modal
        title="Chỉnh sửa buổi học"
        open={isEditSessionModalOpen}
        onCancel={() => {
          setIsEditSessionModalOpen(false);
          setEditingSession(null);
        }}
        onOk={handleSaveEditSession}
        confirmLoading={updateSessionMutation.isPending}
        okText="Lưu thay đổi"
        cancelText="Hủy"
        okButtonProps={{ className: 'bg-indigo-600' }}
        width={560}
      >
        <Form layout="vertical" form={editSessionForm} className="mt-4">
          <Form.Item
            label="Tiêu đề buổi học"
            name="title"
            rules={[{ required: true, message: 'Vui lòng nhập tiêu đề buổi học' }]}
          >
            <Input size="large" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Bắt đầu lúc"
                name="startDatetime"
                rules={[{ required: true, message: 'Vui lòng chọn thời gian bắt đầu' }]}
              >
                <DatePicker showTime format="DD/MM/YYYY HH:mm" size="large" className="w-full" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Kết thúc lúc"
                name="endDatetime"
                rules={[
                  { required: true, message: 'Vui lòng chọn thời gian kết thúc' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      const start = getFieldValue('startDatetime');
                      if (!value || !start || value.isAfter(start)) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error('Thời gian kết thúc phải sau thời gian bắt đầu'));
                    },
                  }),
                ]}
              >
                <DatePicker showTime format="DD/MM/YYYY HH:mm" size="large" className="w-full" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Mô tả nội dung buổi học" name="description">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Attendance List Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <TeamOutlined className="text-indigo-600" />
            <span>Danh sách điểm danh: {attendanceSessionTitle}</span>
          </div>
        }
        open={isAttendanceModalOpen}
        onCancel={() => setIsAttendanceModalOpen(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setIsAttendanceModalOpen(false)} className="bg-indigo-600">
            Đóng
          </Button>
        ]}
        width={650}
      >
        <div className="py-2">
          {isLoadingAttendance ? (
            <Skeleton active paragraph={{ rows: 4 }} />
          ) : attendanceData.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <UserOutlined className="text-3xl text-gray-300 mb-2 block" />
              Chưa có dữ liệu điểm danh cho buổi học này.
            </div>
          ) : (
            <Table
              dataSource={attendanceData}
              rowKey="_id"
              pagination={false}
              size="small"
              columns={[
                {
                  title: 'Học viên',
                  key: 'student',
                  render: (_, record) => (
                    <div>
                      <div className="font-semibold text-gray-900">
                        {record.studentId?.studentProfile?.fullName || 'Học viên'}
                      </div>
                      <div className="text-xs text-gray-400">{record.studentId?.email}</div>
                    </div>
                  ),
                },
                {
                  title: 'Trạng thái',
                  dataIndex: 'attendanceStatus',
                  key: 'status',
                  render: (st: string) => {
                    const color = st === 'PRESENT' ? 'green' : st === 'LATE' ? 'gold' : 'red';
                    const text = st === 'PRESENT' ? 'Có mặt' : st === 'LATE' ? 'Đi muộn' : 'Vắng mặt';
                    return <Tag color={color} className="font-bold">{text}</Tag>;
                  },
                },
                {
                  title: 'Thời gian tham gia',
                  dataIndex: 'joinedAt',
                  key: 'joinedAt',
                  render: (d: string) => d ? new Date(d).toLocaleTimeString('vi-VN') : '-',
                },
              ]}
            />
          )}
        </div>
      </Modal>
    </div>
  );
}
