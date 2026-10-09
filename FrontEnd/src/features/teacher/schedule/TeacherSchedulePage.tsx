import { useState, useMemo } from 'react';
import { 
  Typography, Card, Row, Col, Tag, Button, Select, Radio, 
  Skeleton, Breadcrumb 
} from 'antd';
import { 
  CalendarOutlined, 
  ClockCircleOutlined, 
  BookOutlined, 
  ArrowRightOutlined
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import { ROUTES } from '../../../routes/routePaths';
import { classService, classKeys } from '../../../services/class.service';
import type { Session, ScheduleItem } from '../../../types/session';
import { SESSION_STATUS_LABELS, SESSION_STATUS_COLORS } from '../../../types/session';
import { deriveScheduleItemsFromSessions, formatSessionTimeRange } from '../../../api/sessionAdapters';

dayjs.extend(isBetween);

const { Title, Text } = Typography;

type TimeFilter = 'TODAY' | 'WEEK' | 'ALL';

export default function TeacherSchedulePage() {
  const navigate = useNavigate();

  const [timeFilter, setTimeFilter] = useState<TimeFilter>('ALL');
  const [selectedClassId, setSelectedClassId] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // 1. Fetch all teacher's classes
  const { 
    data: classesData, 
    isLoading: isLoadingClasses 
  } = useQuery({
    queryKey: classKeys.teacherList({ pageSize: 50 }),
    queryFn: () => classService.listMyClasses({ pageSize: 50 }),
  });

  const teacherClasses = classesData?.items || [];

  // 2. Query sessions for each class in parallel to derive the schedule read model
  const { 
    data: allSessions = [], 
    isLoading: isLoadingSessions 
  } = useQuery<Session[]>({
    queryKey: ['teacherScheduleSessions', teacherClasses.map((c) => c.id).join(',')],
    queryFn: async () => {
      if (teacherClasses.length === 0) return [];
      
      const classDetails = await Promise.all(
        teacherClasses.map(async (cls) => {
          try {
            const detail = await classService.getMyClass(cls.id);
            return (detail.sessions || []) as Session[];
          } catch {
            return [] as Session[];
          }
        })
      );
      
      const flattened = classDetails.flat();
      return flattened.sort(
        (a, b) => new Date(a.startDatetime).getTime() - new Date(b.startDatetime).getTime()
      );
    },
    enabled: teacherClasses.length > 0,
  });

  // 3. Derive ScheduleItems
  const scheduleItems = useMemo<ScheduleItem[]>(() => {
    return deriveScheduleItemsFromSessions(allSessions, 'TEACHER');
  }, [allSessions]);

  // 4. Apply Filters
  const filteredSchedule = useMemo(() => {
    const today = dayjs();
    const startOfWeek = today.startOf('week');
    const endOfWeek = today.endOf('week');

    return scheduleItems.filter((item) => {
      // Class filter
      if (selectedClassId !== 'ALL' && item.classId !== selectedClassId) {
        return false;
      }

      // Status filter
      if (selectedStatus !== 'ALL' && item.status !== selectedStatus) {
        return false;
      }

      // Time filter
      const itemDate = dayjs(item.startDatetime);
      if (timeFilter === 'TODAY') {
        return itemDate.isSame(today, 'day');
      }
      if (timeFilter === 'WEEK') {
        return itemDate.isBetween(startOfWeek, endOfWeek, 'day', '[]');
      }

      return true;
    });
  }, [scheduleItems, selectedClassId, selectedStatus, timeFilter]);

  // Stats
  const stats = useMemo(() => {
    const today = dayjs();
    const todayCount = scheduleItems.filter((s) => dayjs(s.startDatetime).isSame(today, 'day')).length;
    const inProgressCount = scheduleItems.filter((s) => s.status === 'IN_PROGRESS').length;
    const scheduledCount = scheduleItems.filter((s) => s.status === 'SCHEDULED').length;
    const completedCount = scheduleItems.filter((s) => s.status === 'COMPLETED').length;

    return { todayCount, inProgressCount, scheduledCount, completedCount };
  }, [scheduleItems]);

  const isLoading = isLoadingClasses || (teacherClasses.length > 0 && isLoadingSessions);

  return (
    <div className="flex flex-col w-full pb-10 max-w-[1200px] mx-auto">
      <Breadcrumb 
        className="mb-4 text-sm font-medium"
        items={[
          { title: <Link to={ROUTES.TEACHER.HOME}>Tổng quan</Link> },
          { title: 'Lịch giảng dạy' },
        ]}
      />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <Title level={2} className="!m-0 text-gray-900">Lịch giảng dạy</Title>
          <Text className="text-gray-500 text-sm">
            Tổng hợp và theo dõi toàn bộ ca học trực tuyến thuộc các lớp học của bạn
          </Text>
        </div>
        <Link to={ROUTES.TEACHER.CLASSES}>
          <Button icon={<BookOutlined />} className="rounded-xl font-medium">
            Quản lý lớp học
          </Button>
        </Link>
      </div>

      {/* Overview Cards */}
      <Row gutter={[16, 16]} className="mb-6">
        <Col xs={12} sm={6}>
          <Card className="rounded-2xl border-gray-100 shadow-2xs bg-white">
            <Text className="text-gray-400 text-xs font-bold uppercase tracking-wider block mb-1">
              Hôm nay
            </Text>
            <Title level={2} className="!m-0 text-indigo-600">{stats.todayCount}</Title>
            <Text className="text-gray-500 text-xs font-medium">ca học trong ngày</Text>
          </Card>
        </Col>

        <Col xs={12} sm={6}>
          <Card className="rounded-2xl border-gray-100 shadow-2xs bg-white">
            <Text className="text-gray-400 text-xs font-bold uppercase tracking-wider block mb-1">
              Đang diễn ra
            </Text>
            <Title level={2} className="!m-0 text-amber-500">{stats.inProgressCount}</Title>
            <Text className="text-gray-500 text-xs font-medium">buổi học LIVE</Text>
          </Card>
        </Col>

        <Col xs={12} sm={6}>
          <Card className="rounded-2xl border-gray-100 shadow-2xs bg-white">
            <Text className="text-gray-400 text-xs font-bold uppercase tracking-wider block mb-1">
              Sắp diễn ra
            </Text>
            <Title level={2} className="!m-0 text-blue-600">{stats.scheduledCount}</Title>
            <Text className="text-gray-500 text-xs font-medium">ca học đã lên lịch</Text>
          </Card>
        </Col>

        <Col xs={12} sm={6}>
          <Card className="rounded-2xl border-gray-100 shadow-2xs bg-white">
            <Text className="text-gray-400 text-xs font-bold uppercase tracking-wider block mb-1">
              Đã hoàn thành
            </Text>
            <Title level={2} className="!m-0 text-emerald-600">{stats.completedCount}</Title>
            <Text className="text-gray-500 text-xs font-medium">buổi học đã xong</Text>
          </Card>
        </Col>
      </Row>

      {/* Filter Bar */}
      <Card className="rounded-2xl border-gray-100 shadow-2xs bg-white mb-6 p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Radio.Group 
              value={timeFilter} 
              onChange={(e) => setTimeFilter(e.target.value)}
              buttonStyle="solid"
            >
              <Radio.Button value="ALL">Tất cả ({scheduleItems.length})</Radio.Button>
              <Radio.Button value="TODAY">Hôm nay</Radio.Button>
              <Radio.Button value="WEEK">Tuần này</Radio.Button>
            </Radio.Group>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Filter by class */}
            <Select
              value={selectedClassId}
              onChange={setSelectedClassId}
              className="w-56"
              options={[
                { value: 'ALL', label: 'Tất cả lớp học' },
                ...teacherClasses.map((c) => ({ value: c.id, label: c.className })),
              ]}
            />

            {/* Filter by status */}
            <Select
              value={selectedStatus}
              onChange={setSelectedStatus}
              className="w-44"
              options={[
                { value: 'ALL', label: 'Tất cả trạng thái' },
                { value: 'SCHEDULED', label: 'Đã lên lịch' },
                { value: 'IN_PROGRESS', label: 'Đang diễn ra' },
                { value: 'COMPLETED', label: 'Đã hoàn thành' },
                { value: 'CANCELLED', label: 'Đã hủy' },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Schedule Content */}
      {isLoading ? (
        <Card className="rounded-2xl p-6 shadow-2xs">
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      ) : filteredSchedule.length === 0 ? (
        <Card className="rounded-2xl text-center py-16 shadow-2xs border-dashed border-gray-300">
          <CalendarOutlined className="text-5xl text-gray-300 mb-3" />
          <Title level={4} className="text-gray-700 !mb-1">Không có ca học nào phù hợp</Title>
          <Text className="text-gray-400 text-sm block mb-6">
            {teacherClasses.length === 0 
              ? 'Bạn chưa khởi tạo lớp học nào trên hệ thống.' 
              : 'Không tìm thấy ca học nào thỏa mãn bộ lọc hiện tại.'}
          </Text>
          <Link to={ROUTES.TEACHER.CLASSES}>
            <Button type="primary" className="bg-indigo-600 rounded-xl">
              Đến danh sách lớp học
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="flex flex-col gap-3.5">
          {filteredSchedule.map((item) => {
            const isToday = dayjs(item.startDatetime).isSame(dayjs(), 'day');
            const isInProgress = item.status === 'IN_PROGRESS';

            return (
              <Card 
                key={item.id} 
                className={`rounded-2xl border transition-all hover:shadow-xs shadow-2xs ${
                  isInProgress 
                    ? 'border-amber-300 bg-amber-50/20' 
                    : isToday 
                    ? 'border-indigo-200 bg-indigo-50/10' 
                    : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-700 flex flex-col items-center justify-center shrink-0 border border-indigo-100">
                      <span className="text-[10px] font-bold uppercase tracking-wider">
                        {dayjs(item.startDatetime).format('ddd')}
                      </span>
                      <span className="text-xl font-bold leading-tight">
                        {dayjs(item.startDatetime).format('DD')}
                      </span>
                      <span className="text-[10px] font-medium text-gray-400">
                        {dayjs(item.startDatetime).format('MM/YYYY')}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Tag color="indigo" className="font-semibold text-xs rounded-md">
                          {item.className}
                        </Tag>
                        <Tag color={SESSION_STATUS_COLORS[item.status]} className="font-bold text-xs rounded-md">
                          {SESSION_STATUS_LABELS[item.status] || item.status}
                        </Tag>
                        {isToday && (
                          <Tag color="magenta" className="font-bold text-xs rounded-md">
                            Hôm nay
                          </Tag>
                        )}
                      </div>

                      <Title level={5} className="!m-0 text-gray-900 font-bold">
                        {item.title}
                      </Title>

                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-2 font-medium">
                        <span className="flex items-center gap-1.5 text-gray-700">
                          <ClockCircleOutlined className="text-indigo-500" />
                          {formatSessionTimeRange(item.startDatetime, item.endDatetime)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="self-end md:self-center shrink-0">
                    <Button 
                      type="default" 
                      onClick={() => navigate(ROUTES.TEACHER.CLASS_DETAIL.replace(':classId', item.classId))}
                      className="rounded-xl font-medium text-xs flex items-center gap-1.5 hover:border-indigo-500 hover:text-indigo-600"
                    >
                      <span>Xem lớp học</span>
                      <ArrowRightOutlined />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
