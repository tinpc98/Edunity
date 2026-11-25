import { useState } from 'react';
import { 
  Typography, Tabs, Tag, Button, Row, Col, Card, 
  Modal, Form, Input, Skeleton, Alert, message, List, Popconfirm, Table, Progress,
  Avatar, Empty, Tooltip
} from 'antd';
import { 
  CalendarOutlined, 
  TeamOutlined, 
  ClockCircleOutlined, 
  EditOutlined, 
  StarFilled, 
  SendOutlined,
  BookOutlined,
  StopOutlined,
  PoweroffOutlined,
  UserOutlined,
  VideoCameraOutlined,
  MessageOutlined,
  PaperClipOutlined,
} from '@ant-design/icons';

import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { ROUTES } from '../../../../routes/routePaths';
import { classService, classKeys } from '../../../../services/class.service';
import { messageService } from '../../../../services/message.service';
import { sessionService, sessionKeys } from '../../../../services/session.service';
import type { UpdateClassPayload, ClassStudentRosterItem, PaymentSourceType, ScheduleEntry } from '../../../../types/class';
import { CLASS_STATUS_LABELS, CLASS_STATUS_COLORS } from '../../../../types/class';
import { deriveScheduleText } from '../../../../api/classAdapters';
import type {
  Session,
  SessionAttendanceItem 
} from '../../../../types/session';
import { 
  SESSION_STATUS_LABELS, 
  SESSION_STATUS_COLORS 
} from '../../../../types/session';
import { formatOpensAt, formatSessionTimeRange, JOIN_EARLY_MINUTES, roomOpensLater } from '../../../../api/sessionAdapters';
import { useNow } from '../../../../hooks/useNow';
import {
  getVerificationGuidanceMessage,
  useTeacherVerification,
} from '../../../../hooks/useTeacherVerification';
import { getFriendlyErrorMessage } from '../../../../utils/apiErrorMap';
import { sessionPlanNotice } from '../../../../utils/classForm';
import ClassReadinessCard from '../../../../components/common/ClassReadinessCard';
import SessionMaterials from '../../../../components/common/SessionMaterials';
import ClassConfigForm from '../components/ClassConfigForm';
import { CLASS_FORM_DEFAULTS, classFormPayload, planBlocker, useClassPlan } from '../components/classConfigFormLogic';

const { Title, Text, Paragraph } = Typography;

// Scheduling rules enforced by the backend (C02-C04), in the teacher's language
const SESSION_ERROR_MESSAGES: Record<string, string> = {
  SESSION_TIME_CONFLICT: "Thời gian buổi học bị trùng với một buổi học khác của bạn.",
  SESSION_IN_PAST: "Không thể xếp buổi học vào thời điểm đã qua.",
  RESCHEDULE_REQUIRED: "Lớp đã mở tuyển sinh: muốn đổi giờ hoặc hủy buổi học, hãy gửi yêu cầu dời lịch để quản trị viên duyệt.",
  SESSION_OUT_OF_CLASS_RANGE: "Buổi học phải nằm trong thời gian khai giảng - kết thúc của lớp.",
};
const sessionErrorMessage = (err: any, fallback: string) =>
  SESSION_ERROR_MESSAGES[err?.code] || err?.message || fallback;

export default function TeacherClassDetailPage() {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isVerified, verificationStatus } = useTeacherVerification();
  const lockTooltip = getVerificationGuidanceMessage(verificationStatus);

  const [activeTab, setActiveTab] = useState('overview');
  const now = useNow(30_000);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm] = Form.useForm();
  const [editSchedule, setEditSchedule] = useState<ScheduleEntry[]>([]);
  // The class's own sessions are rebuilt on save, so only the other classes count as clashes
  const editPlan = useClassPlan(editForm, editSchedule, classId);

  // Student roster & messaging state
  const [isOpeningChat, setIsOpeningChat] = useState<string | null>(null);

  const {
    data: students = [],
    isLoading: isLoadingStudents,
    isError: isStudentsError,
  } = useQuery({
    queryKey: classKeys.teacherStudents(classId!),
    queryFn: () => classService.getClassStudents(classId!),
    enabled: Boolean(classId && isVerified),
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
      navigate(`${ROUTES.TEACHER.MESSAGES}?id=${conv.id}`);
    } catch (err: any) {
      message.error(err?.message || "Không thể mở cuộc trò chuyện với học viên");
    } finally {
      setIsOpeningChat(null);
    }
  };

  // Session management state

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
    // Session statuses change by Start / End and the automatic end after +30 minutes
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  // Conditions still to meet, for a class that is not open yet
  const showReadiness = ['DRAFT', 'NEED_CHANGES', 'PENDING_APPROVAL'].includes(cls?.status ?? '');
  const readinessQuery = useQuery({
    queryKey: classKeys.teacherReadiness(classId!),
    queryFn: () => classService.getMyClassReadiness(classId!),
    enabled: Boolean(classId && showReadiness),
  });

  // 2. Mutation: Update Class
  const updateMutation = useMutation({
    mutationFn: (payload: UpdateClassPayload) => classService.updateClass(classId!, payload),
    onSuccess: (updated) => {
      message.success("Cập nhật thông tin lớp học thành công!");
      const notice = sessionPlanNotice(updated.sessionPlan);
      if (notice) message[notice.type](notice.text, notice.type === 'warning' ? 8 : 4);
      setIsEditModalOpen(false);
      queryClient.invalidateQueries({ queryKey: classKeys.teacherDetail(classId!) });
      queryClient.invalidateQueries({ queryKey: classKeys.teacherList() });
    },
    onError: (err: any) => {
      message.error(getFriendlyErrorMessage(err, "Không thể cập nhật lớp học."));
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
      queryClient.invalidateQueries({ queryKey: classKeys.teacherDetail(classId!) });
      message.error(getFriendlyErrorMessage(err, "Không thể gửi duyệt lớp học."));
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
      message.error(sessionErrorMessage(err, "Không thể hủy buổi học."));
    },
  });

  // Renaming a session: only its title changes, its time stays as planned
  const [renamingSession, setRenamingSession] = useState<Session | null>(null);
  const [materialsSession, setMaterialsSession] = useState<Session | null>(null);
  const [sessionTitle, setSessionTitle] = useState('');
  const renameSessionMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => sessionService.updateSession(id, { title }),
    onSuccess: () => {
      message.success("Đã đổi tên buổi học.");
      setRenamingSession(null);
      queryClient.invalidateQueries({ queryKey: classKeys.teacherDetail(classId!) });
      queryClient.invalidateQueries({ queryKey: sessionKeys.classSessions(classId!) });
    },
    onError: (err: any) => {
      message.error(sessionErrorMessage(err, "Không thể đổi tên buổi học."));
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

  const isEditable = isVerified && (cls.status === 'DRAFT' || cls.status === 'NEED_CHANGES');
  const isClassActiveForLive = isVerified && (cls.status === 'OPEN' || cls.status === 'IN_PROGRESS');
  const scheduleDisplay = cls.schedule.length ? deriveScheduleText(cls.schedule) : 'Chưa thiết lập';
  const progressPercent = cls.capacity > 0 
    ? Math.min(100, Math.round((cls.enrolledCount / cls.capacity) * 100))
    : 0;

  const handleOpenEdit = () => {
    const planned = (cls.sessions || []).filter((session) => session.status !== 'CANCELLED').length;
    editForm.setFieldsValue({
      className: cls.className,
      classType: cls.classType,
      description: cls.description,
      capacity: cls.capacity,
      price: cls.price,
      enrollmentStart: cls.enrollmentStart ? dayjs(cls.enrollmentStart) : null,
      enrollmentEnd: cls.enrollmentEnd ? dayjs(cls.enrollmentEnd) : null,
      startDate: cls.startDate ? dayjs(cls.startDate) : null,
      sessionCount: planned || CLASS_FORM_DEFAULTS.sessionCount,
    });
    setEditSchedule(cls.schedule);
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    try {
      await editForm.validateFields();
    } catch {
      message.error("Vui lòng kiểm tra lại các thông tin được đánh dấu.");
      return;
    }
    const blocker = planBlocker(editSchedule, editPlan);
    if (blocker) {
      message.error(blocker);
      return;
    }
    const payload: UpdateClassPayload = classFormPayload(editForm, editSchedule, editPlan);
    updateMutation.mutate(payload);
  };

  // Handle view attendance
  const handleViewAttendance = async (session: Session) => {
    setAttendanceSessionTitle(session.title);
    setIsAttendanceModalOpen(true);
    setIsLoadingAttendance(true);
    try {
      const list = await sessionService.getSessionAttendance(session.id);
      setAttendanceData(list);
    } catch (err: unknown) {
      message.error(getFriendlyErrorMessage(err, "Không thể tải danh sách điểm danh"));
    } finally {
      setIsLoadingAttendance(false);
    }
  };

  // ---------------- Tab 1: Overview ----------------
  const renderOverview = () => (
    <div className="flex flex-col gap-6 mt-6">
      {showReadiness && (
        <ClassReadinessCard
          readiness={readinessQuery.data}
          isFetching={readinessQuery.isFetching}
          isError={readinessQuery.isError}
          onRefresh={() => void readinessQuery.refetch()}
          showSubmitHint
        />
      )}

      {/* Overview Stats */}
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card className="rounded-2xl shadow-sm border-gray-100 bg-white">
            <div className="flex justify-between items-start mb-2">
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider">Sĩ số lớp</Text>
              <div className="w-8 h-8 rounded bg-teal-50 flex items-center justify-center text-teal-500">
                <TeamOutlined />
              </div>
            </div>
            <div className="flex items-end gap-2 mb-2">
              <Title level={2} className="!text-2xl !m-0 text-gray-900">{cls.enrolledCount}</Title>
              <span className="text-gray-500 text-lg mb-1">/ {cls.capacity}</span>
            </div>
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-teal-600 font-semibold">{progressPercent}% Đầy chỗ</span>
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
              <Title level={3} className={`!m-0 ${cls.classType === 'FREE' ? 'text-emerald-600' : 'text-teal-700'}`}>
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
              <Title level={2} className="!text-2xl !m-0 text-gray-900">{(cls.sessions || []).length}</Title>
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
              <Title level={2} className="!text-2xl !m-0 text-gray-900">{cls.ratingAverage?.toFixed(1) || '0.0'}</Title>
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
        <Title level={4} className="!text-base !mb-4">Thông tin khóa học & Giảng dạy</Title>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          <div>
            <Text className="text-gray-400 block mb-1">Khóa học chuẩn:</Text>
            <div className="font-semibold text-teal-700 text-base">{cls.courseTitle}</div>
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
  const countedSessions = sessionsList.filter((session) => session.status !== 'CANCELLED').length;
  const completedCount = sessionsList.filter((session) => session.status === 'COMPLETED').length;
  const progressOfTeaching = countedSessions ? Math.round((completedCount / countedSessions) * 100) : 0;
  // Same rule as the Backend: a scheduled session of a class that is not waiting for approval or closed
  const canRenameSessions = isVerified && !['PENDING_APPROVAL', 'REJECTED', 'COMPLETED', 'CANCELLED'].includes(cls.status);
  // Materials can be added before approval too, and after a session took place
  const canManageMaterials = isVerified && !['REJECTED', 'COMPLETED', 'CANCELLED'].includes(cls.status);

  const renderSessions = () => (
    <div className="mt-6 flex flex-col gap-6">
      {/* Teaching progress and the weekly schedule */}
      <Card className="rounded-2xl border border-gray-100 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
          <div>
            <Title level={4} className="!text-base !m-0">Tiến độ giảng dạy</Title>
            <Text className="text-gray-500 text-sm">
              <CalendarOutlined className="mr-1" />
              Lịch học: <strong className="text-gray-800">{scheduleDisplay}</strong>
              {cls.startDate && cls.endDate &&
                ` · ${new Date(cls.startDate).toLocaleDateString('vi-VN')} – ${new Date(cls.endDate).toLocaleDateString('vi-VN')}`}
            </Text>
          </div>
        </div>
        <div className="flex items-end justify-between mt-4 mb-1">
          <div>
            <span className="text-2xl font-bold text-gray-900">{completedCount}/{countedSessions}</span>
            <span className="ml-2 text-gray-500">buổi đã hoàn thành</span>
          </div>
          <span className="font-semibold text-gray-800">{progressOfTeaching}%</span>
        </div>
        <Progress percent={progressOfTeaching} showInfo={false} strokeColor="#0d9488" aria-label="Tiến độ giảng dạy" />
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div>
            <div className="text-sm text-gray-500">Đã hoàn thành</div>
            <div className="text-xl font-bold text-emerald-600">{completedCount}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Sắp diễn ra</div>
            <div className="text-xl font-bold text-gray-900">{countedSessions - completedCount}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Đã hủy</div>
            <div className="text-xl font-bold text-gray-500">{sessionsList.length - countedSessions}</div>
          </div>
        </div>
        <Text className="text-gray-500 text-sm block mt-4">
          Buổi học được tạo tự động theo lịch học. Bạn có thể đổi tên từng buổi.
          {isEditable && ' Muốn đổi ngày giờ, hãy bấm "Chỉnh sửa lớp" và cập nhật lịch học.'}
        </Text>
      </Card>

      {sessionsList.length === 0 ? (
        <Card className="rounded-2xl text-center py-16 border-dashed border-gray-300">
          <ClockCircleOutlined className="text-5xl text-gray-300 mb-4" />
          <Title level={4} className="!text-base text-gray-700 !mb-2">Chưa có buổi học nào</Title>
          <Paragraph className="text-gray-500 text-sm max-w-md mx-auto mb-6">
            Buổi học sẽ được tạo tự động khi lớp có lịch học hàng tuần, ngày khai giảng và ngày kết thúc.
            {isEditable && ' Bấm "Chỉnh sửa lớp" để bổ sung.'}
          </Paragraph>
        </Card>
      ) : (
        <List
          dataSource={sessionsList}
          renderItem={(session: Session, index: number) => {
            const isScheduled = session.status === 'SCHEDULED';
            const isInProgress = session.status === 'IN_PROGRESS';
            // WAITING = Teacher already in the room but not started; INTERRUPTED = Teacher can return and resume
            const canEnterRoom = isScheduled || isInProgress || session.status === 'WAITING' || session.status === 'INTERRUPTED';
            const isCompleted = session.status === 'COMPLETED';
            const isCancelled = session.status === 'CANCELLED';
            const opensAt = roomOpensLater(session, now);

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
                        : 'bg-teal-50 text-teal-600'
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
                          <CalendarOutlined className="text-teal-500" />
                          {session.startDatetime ? new Date(session.startDatetime).toLocaleDateString('vi-VN') : '-'}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 font-medium text-gray-700">
                          <ClockCircleOutlined className="text-teal-500" />
                          {formatSessionTimeRange(session.startDatetime, session.endDatetime)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions per session */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    {/* Join Classroom button if SCHEDULED or IN_PROGRESS */}
                    {canEnterRoom && (
                      isClassActiveForLive && !opensAt ? (
                        <Link to={`/classroom/${session.id}`}>
                          <Button
                            type="primary"
                            size="small"
                            icon={<VideoCameraOutlined />}
                            className="bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold"
                          >
                            {isInProgress ? "Vào lớp (LIVE)" : "Vào lớp"}
                          </Button>
                        </Link>
                      ) : (
                        <Tooltip
                          title={
                            !isVerified
                              ? lockTooltip
                              : !isClassActiveForLive
                              ? "Lớp học cần được Quản trị viên phê duyệt và mở hoạt động trước khi vào phòng học trực tuyến."
                              : `Phòng học mở ${JOIN_EARLY_MINUTES} phút trước giờ học.`
                          }
                        >
                          <Button
                            type="primary"
                            size="small"
                            disabled
                            icon={<VideoCameraOutlined />}
                            className="rounded-lg text-xs font-semibold"
                          >
                            {isInProgress ? "Vào lớp (LIVE)" : isClassActiveForLive && opensAt ? `Mở lúc ${formatOpensAt(opensAt)}` : "Vào lớp"}
                          </Button>
                        </Tooltip>
                      )
                    )}

                    {!isCancelled && (
                      <Button
                        size="small"
                        icon={<PaperClipOutlined />}
                        aria-label={`Tài liệu ${session.title || `buổi ${index + 1}`}`}
                        onClick={() => setMaterialsSession(session)}
                        className="rounded-lg text-xs"
                      >
                        Tài liệu ({(session.contents || []).length})
                      </Button>
                    )}

                    {canRenameSessions && isScheduled && (
                      <Button
                        size="small"
                        icon={<EditOutlined />}
                        aria-label={`Đổi tên ${session.title || `buổi ${index + 1}`}`}
                        onClick={() => {
                          setRenamingSession(session);
                          setSessionTitle(session.title || '');
                        }}
                        className="rounded-lg text-xs"
                      >
                        Đổi tên
                      </Button>
                    )}

                    {/* Attendance button if IN_PROGRESS or COMPLETED */}
                    {isVerified && (isInProgress || isCompleted) && (
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
                    {isClassActiveForLive && isInProgress && (
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

                    {/* Cancel session if SCHEDULED */}
                    {isClassActiveForLive && isScheduled && (
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
          <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-xs font-bold">
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
    <div className="flex flex-col w-full pb-10">
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
              <div className="mt-2">Lớp bị từ chối không thể chỉnh sửa hoặc gửi duyệt lại. Bạn có thể tạo một lớp mới.</div>
            </div>
          }
        />
      )}

      {/* Top Banner Alert if NEED_CHANGES */}
      {cls.status === 'NEED_CHANGES' && (
        <Alert
          type="warning"
          showIcon
          className="mb-6 rounded-xl border-amber-300 bg-amber-50"
          message={<span className="font-bold text-amber-900">Quản trị viên yêu cầu chỉnh sửa lớp</span>}
          description={
            <div className="text-amber-800 text-sm mt-1">
              <div className="whitespace-pre-line"><strong>Nội dung cần sửa:</strong> {cls.reviewNote}</div>
              <div className="mt-2">Hãy chỉnh sửa rồi bấm gửi duyệt lại.</div>
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
          <Title level={2} className="!text-2xl !m-0 mb-3 text-gray-900">{cls.className}</Title>
          <div className="flex flex-wrap items-center gap-3">
            <Tag color={cls.classType === 'PAID' ? 'cyan' : 'green'} className="!m-0 px-2.5 py-0.5 rounded font-bold">
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
              <BookOutlined /> Khóa học: <strong className="text-teal-600">{cls.courseTitle}</strong>
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Submit for approval if DRAFT or NEED_CHANGES */}
          {isEditable && (
            <Popconfirm
              title="Gửi duyệt lớp học"
              description="Admin sẽ kiểm tra học phí, quyền giảng dạy và hợp đồng trước khi mở lớp. Bạn không thể sửa lớp trong lúc chờ duyệt."
              onConfirm={() => submitMutation.mutate()}
              okText="Gửi duyệt"
              cancelText="Hủy"
              okButtonProps={{ loading: submitMutation.isPending, className: 'bg-teal-600' }}
            >
              <Button 
                type="primary" 
                
                icon={<SendOutlined />}
                loading={submitMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 rounded-xl font-bold px-6 shadow-sm border-none"
              >
                {cls.status === 'NEED_CHANGES' ? 'Gửi duyệt lại' : 'Gửi duyệt lớp'}
              </Button>
            </Popconfirm>
          )}

          {/* Edit class if DRAFT or NEED_CHANGES */}
          {isEditable && (
            <Button 
             
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
       
        className="font-medium"
        items={[
          { key: 'overview', label: `Tổng quan`, children: renderOverview() },
          { key: 'sessions', label: `Buổi học (${sessionsList.length})`, children: renderSessions() },
          { key: 'students', label: `Học viên (${students.length})`, children: renderStudents() },
        ]}
      />

      {/* Edit Class Modal: the same form as creating a class */}
      <Modal
        title="Chỉnh sửa thông tin lớp học"
        open={isEditModalOpen}
        onCancel={() => setIsEditModalOpen(false)}
        onOk={handleSaveEdit}
        confirmLoading={updateMutation.isPending}
        okText="Lưu thay đổi"
        cancelText="Hủy"
        okButtonProps={{ className: 'bg-teal-600' }}
        width={900}
        forceRender
      >
        <div className="mt-4">
          <ClassConfigForm form={editForm} schedule={editSchedule} onScheduleChange={setEditSchedule} plan={editPlan} lockClassType createdOn={cls.createdAt ? dayjs(cls.createdAt) : undefined} />
        </div>
      </Modal>

      <Modal
        title="Đổi tên buổi học"
        open={Boolean(renamingSession)}
        onCancel={() => setRenamingSession(null)}
        onOk={() => {
          const title = sessionTitle.trim();
          if (!title) {
            message.error("Tên buổi học không được để trống.");
            return;
          }
          renameSessionMutation.mutate({ id: renamingSession!.id, title });
        }}
        confirmLoading={renameSessionMutation.isPending}
        okText="Lưu"
        cancelText="Hủy"
        okButtonProps={{ className: 'bg-teal-600' }}
        destroyOnHidden
      >
        <Input
          aria-label="Tên buổi học"
          value={sessionTitle}
          maxLength={200}
          showCount
          onChange={(event) => setSessionTitle(event.target.value)}
          placeholder="VD: Buổi 1 – Đa thức và phép nhân đa thức"
          className="mt-2"
        />
      </Modal>

      <Modal
        title={`Tài liệu: ${materialsSession?.title || ''}`}
        open={Boolean(materialsSession)}
        onCancel={() => setMaterialsSession(null)}
        footer={null}
        destroyOnHidden
        width={640}
      >
        {materialsSession && <SessionMaterials sessionId={materialsSession.id} canManage={canManageMaterials} />}
      </Modal>

      {/* Attendance List Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <TeamOutlined className="text-teal-600" />
            <span>Danh sách điểm danh: {attendanceSessionTitle}</span>
          </div>
        }
        open={isAttendanceModalOpen}
        onCancel={() => setIsAttendanceModalOpen(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setIsAttendanceModalOpen(false)} className="bg-teal-600">
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
