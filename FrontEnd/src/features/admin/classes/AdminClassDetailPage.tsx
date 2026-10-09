import { useState } from 'react';
import { 
  Typography, Breadcrumb, Tag, Button, Row, Col, Card, 
  Modal, Input, Skeleton, Alert, message, List
} from 'antd';
import { 
  CheckCircleOutlined, 
  CloseCircleOutlined
} from '@ant-design/icons';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ROUTES } from '../../../routes/routePaths';
import { classService, classKeys } from '../../../services/class.service';
import { CLASS_STATUS_LABELS, CLASS_STATUS_COLORS } from '../../../types/class';
import { deriveScheduleText } from '../../../api/classAdapters';

const { Title, Text, Paragraph } = Typography;

export default function AdminClassDetailPage() {
  const { classId } = useParams<{ classId: string }>();
  const queryClient = useQueryClient();

  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [approveNote, setApproveNote] = useState('');
  const [rejectNote, setRejectNote] = useState('');

  // 1. Fetch Class Detail for Review (Backend: GET /api/admin/classes/:id)
  const { 
    data: cls, 
    isLoading, 
    isError, 
    error 
  } = useQuery({
    queryKey: classKeys.adminDetail(classId!),
    queryFn: () => classService.getClassForReview(classId!),
    enabled: Boolean(classId),
    staleTime: 1000 * 30,
  });

  // 2. Approve Mutation (Backend: POST /api/admin/classes/:id/approve)
  const approveMutation = useMutation({
    mutationFn: (note?: string) => 
      classService.approveClass(classId!, { reviewNote: note || undefined }),
    onSuccess: () => {
      message.success("Phê duyệt lớp học thành công! Lớp đã chuyển sang trạng thái OPEN.");
      setIsApproveModalOpen(false);
      queryClient.invalidateQueries({ queryKey: classKeys.adminDetail(classId!) });
      queryClient.invalidateQueries({ queryKey: classKeys.adminPending() });
      queryClient.invalidateQueries({ queryKey: classKeys.all });
    },
    onError: (err: any) => {
      message.error(err?.message || "Không thể phê duyệt lớp học.");
    },
  });

  // 3. Reject Mutation (Backend: POST /api/admin/classes/:id/reject)
  const rejectMutation = useMutation({
    mutationFn: (note: string) => 
      classService.rejectClass(classId!, { reviewNote: note }),
    onSuccess: () => {
      message.success("Đã từ chối lớp học.");
      setIsRejectModalOpen(false);
      queryClient.invalidateQueries({ queryKey: classKeys.adminDetail(classId!) });
      queryClient.invalidateQueries({ queryKey: classKeys.adminPending() });
      queryClient.invalidateQueries({ queryKey: classKeys.all });
    },
    onError: (err: any) => {
      message.error(err?.message || "Không thể từ chối lớp học.");
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
          message="Không tìm thấy hồ sơ lớp học"
          description={(error as any)?.message || "Lớp học không tồn tại hoặc đã bị xóa."}
          action={
            <Link to={(ROUTES.ADMIN as any).CLASSES || ROUTES.ADMIN.HOME}>
              <Button type="primary">Quay lại danh sách</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const isPending = cls.status === 'PENDING_APPROVAL';
  const scheduleDisplay = deriveScheduleText(cls.schedule);

  const handleApprove = () => {
    approveMutation.mutate(approveNote);
  };

  const handleReject = () => {
    if (!rejectNote.trim()) {
      message.warning("Vui lòng nhập lý do từ chối để giáo viên có thể chỉnh sửa.");
      return;
    }
    rejectMutation.mutate(rejectNote);
  };

  return (
    <div className="flex flex-col gap-6 w-full pb-10 max-w-[1200px] mx-auto">
      {/* Breadcrumb */}
      <Breadcrumb
        className="text-sm font-medium"
        items={[
          { title: <Link to={ROUTES.ADMIN.HOME}>Tổng quan</Link> },
          { title: <Link to={(ROUTES.ADMIN as any).CLASSES || ROUTES.ADMIN.HOME}>Quản lý Lớp học</Link> },
          { title: cls.className },
        ]}
      />

      {/* Header and Action Bar */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <Tag color={CLASS_STATUS_COLORS[cls.status]} className="font-bold text-sm px-3 py-0.5 rounded">
              {CLASS_STATUS_LABELS[cls.status] || cls.status}
            </Tag>
            <Tag color={cls.classType === 'PAID' ? 'indigo' : 'green'} className="font-bold text-sm px-3 py-0.5 rounded">
              {cls.classType}
            </Tag>
          </div>
          <Title level={2} className="!m-0 text-gray-900">{cls.className}</Title>
          <Text className="text-gray-500 text-sm mt-1 block">
            ID: <span className="font-mono text-gray-700">{cls.id}</span>
          </Text>
        </div>

        {/* Review Actions */}
        <div className="flex items-center gap-3 shrink-0">
          {isPending ? (
            <>
              <Button 
                danger 
                size="large"
                icon={<CloseCircleOutlined />}
                className="rounded-xl font-semibold"
                onClick={() => setIsRejectModalOpen(true)}
              >
                Từ chối lớp
              </Button>
              <Button 
                type="primary" 
                size="large"
                icon={<CheckCircleOutlined />}
                className="bg-emerald-600 hover:bg-emerald-700 rounded-xl font-semibold border-none"
                onClick={() => setIsApproveModalOpen(true)}
              >
                Phê duyệt mở lớp
              </Button>
            </>
          ) : (
            <Tag className="py-1 px-3 text-sm font-medium">
              Lớp đã được xử lý ({CLASS_STATUS_LABELS[cls.status]})
            </Tag>
          )}
        </div>
      </div>

      {/* Rejection / Approval History Alert if available */}
      {cls.reviewNote && (
        <Alert
          type={cls.status === 'REJECTED' ? 'error' : 'info'}
          showIcon
          className="rounded-xl border"
          message={<span className="font-bold">Ghi chú duyệt của Quản trị viên</span>}
          description={
            <div className="text-sm mt-1">
              <p className="!m-0">{cls.reviewNote}</p>
              {cls.reviewedAt && (
                <span className="text-xs text-gray-500 block mt-1">
                  Thời gian: {new Date(cls.reviewedAt).toLocaleString('vi-VN')}
                </span>
              )}
            </div>
          }
        />
      )}

      {/* 2-Column Info Grid */}
      <Row gutter={[24, 24]}>
        {/* Left Column: Class Info & Sessions */}
        <Col xs={24} lg={15}>
          <div className="flex flex-col gap-6">
            {/* Class Details Card */}
            <Card className="rounded-2xl shadow-sm border-gray-100 p-2" title="Chi tiết Lớp học">
              <Row gutter={[20, 20]} className="text-sm">
                <Col span={12}>
                  <Text className="text-gray-400 block mb-0.5">Loại hình & Giá:</Text>
                  <div className="font-bold text-gray-900 text-base">
                    {cls.formattedPrice}
                  </div>
                </Col>
                <Col span={12}>
                  <Text className="text-gray-400 block mb-0.5">Sĩ số tối đa:</Text>
                  <div className="font-semibold text-gray-800 text-base">
                    {cls.capacity} học viên
                  </div>
                </Col>
                <Col span={12}>
                  <Text className="text-gray-400 block mb-0.5">Ngày khai giảng:</Text>
                  <div className="font-semibold text-gray-800">
                    {cls.startDate ? new Date(cls.startDate).toLocaleDateString('vi-VN') : 'Chưa đặt'}
                  </div>
                </Col>
                <Col span={12}>
                  <Text className="text-gray-400 block mb-0.5">Ngày kết thúc:</Text>
                  <div className="font-semibold text-gray-800">
                    {cls.endDate ? new Date(cls.endDate).toLocaleDateString('vi-VN') : 'Chưa đặt'}
                  </div>
                </Col>
                <Col span={24}>
                  <Text className="text-gray-400 block mb-0.5">Lịch học hàng tuần:</Text>
                  <div className="font-semibold text-indigo-700">
                    {scheduleDisplay}
                  </div>
                </Col>
                {cls.description && (
                  <Col span={24}>
                    <Text className="text-gray-400 block mb-1">Mô tả lớp học:</Text>
                    <Paragraph className="text-gray-700 whitespace-pre-line leading-relaxed !m-0 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      {cls.description}
                    </Paragraph>
                  </Col>
                )}
              </Row>
            </Card>

            {/* Sessions Plan Card */}
            <Card className="rounded-2xl shadow-sm border-gray-100 p-2" title={`Kế hoạch Buổi học (${cls.sessions?.length || 0} buổi)`}>
              {(!cls.sessions || cls.sessions.length === 0) ? (
                <div className="py-6 text-center text-gray-400 text-sm">
                  Chưa có danh sách buổi học cụ thể.
                </div>
              ) : (
                <List
                  dataSource={cls.sessions}
                  renderItem={(session: any, index: number) => (
                    <div key={session._id || index} className="p-3 border-b last:border-0 flex justify-between items-center text-sm">
                      <div>
                        <span className="font-semibold text-gray-800">Buổi {index + 1}: {session.title || session.className || 'Buổi học'}</span>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {session.startDatetime ? new Date(session.startDatetime).toLocaleString('vi-VN') : '-'}
                        </div>
                      </div>
                      <Tag color="blue">{session.status || 'SCHEDULED'}</Tag>
                    </div>
                  )}
                />
              )}
            </Card>
          </div>
        </Col>

        {/* Right Column: Teacher Info & Course Relation */}
        <Col xs={24} lg={9}>
          <div className="flex flex-col gap-6">
            {/* Course Relation Card */}
            <Card className="rounded-2xl shadow-sm border-gray-100 p-2" title="Khóa học liên kết (Course)">
              <div className="flex flex-col gap-2.5 text-sm">
                <div>
                  <Text className="text-gray-400 block mb-0.5">Tiêu đề khóa học:</Text>
                  <div className="font-bold text-indigo-700 text-base">{cls.courseTitle}</div>
                </div>
                {cls.course?.subjectName && (
                  <div>
                    <Text className="text-gray-400 block mb-0.5">Môn học:</Text>
                    <div className="font-medium text-gray-800">{cls.course.subjectName}</div>
                  </div>
                )}
                {cls.course?.categoryName && (
                  <div>
                    <Text className="text-gray-400 block mb-0.5">Danh mục:</Text>
                    <div className="font-medium text-gray-800">{cls.course.categoryName}</div>
                  </div>
                )}
                {cls.course?.gradeLevel && (
                  <div>
                    <Text className="text-gray-400 block mb-0.5">Khối lớp:</Text>
                    <div className="font-medium text-gray-800">{cls.course.gradeLevel}</div>
                  </div>
                )}
              </div>
            </Card>

            {/* Teacher Relation Card */}
            <Card className="rounded-2xl shadow-sm border-gray-100 p-2" title="Thông tin Giảng viên (Teacher)">
              <div className="flex flex-col gap-3 text-sm">
                <div>
                  <Text className="text-gray-400 block mb-0.5">Họ và tên:</Text>
                  <div className="font-bold text-gray-900 text-base">
                    {cls.teacher?.fullName || cls.teacherName || 'Giảng viên'}
                  </div>
                </div>
                {cls.teacher?.email && (
                  <div>
                    <Text className="text-gray-400 block mb-0.5">Email:</Text>
                    <div className="font-mono text-gray-700 text-xs">{cls.teacher.email}</div>
                  </div>
                )}
                <div>
                  <Text className="text-gray-400 block mb-0.5">Xác minh giáo viên:</Text>
                  <Tag color="success" className="font-bold">
                    {cls.teacher?.verificationStatus || 'VERIFIED'}
                  </Tag>
                </div>
                {cls.teacher?.qualificationSummary && (
                  <div>
                    <Text className="text-gray-400 block mb-0.5">Trình độ chuyên môn:</Text>
                    <div className="text-gray-700 text-xs">{cls.teacher.qualificationSummary}</div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </Col>
      </Row>

      {/* Modal: Phê duyệt */}
      <Modal
        title="Xác nhận phê duyệt mở lớp"
        open={isApproveModalOpen}
        onCancel={() => setIsApproveModalOpen(false)}
        onOk={handleApprove}
        confirmLoading={approveMutation.isPending}
        okText="Phê duyệt ngay"
        cancelText="Hủy"
        okButtonProps={{ className: 'bg-emerald-600 hover:bg-emerald-700' }}
      >
        <p className="text-sm text-gray-600 mt-2">
          Lớp học sẽ chuyển sang trạng thái <strong>OPEN</strong> và được hiển thị công khai trên cổng tuyển sinh cho học viên.
        </p>
        <div className="mt-4">
          <label className="text-xs text-gray-500 font-medium block mb-1">Ghi chú xét duyệt (tùy chọn):</label>
          <Input.TextArea
            rows={3}
            placeholder="Nhập ghi chú cho giáo viên..."
            value={approveNote}
            onChange={(e) => setApproveNote(e.target.value)}
          />
        </div>
      </Modal>

      {/* Modal: Từ chối */}
      <Modal
        title="Từ chối mở lớp học"
        open={isRejectModalOpen}
        onCancel={() => setIsRejectModalOpen(false)}
        onOk={handleReject}
        confirmLoading={rejectMutation.isPending}
        okText="Từ chối hồ sơ"
        cancelText="Hủy"
        okButtonProps={{ danger: true }}
      >
        <p className="text-sm text-gray-600 mt-2">
          Vui lòng nêu rõ lý do từ chối để giáo viên có thể bổ sung thông tin hoặc điều chỉnh trước khi gửi duyệt lại.
        </p>
        <div className="mt-4">
          <label className="text-xs text-rose-600 font-semibold block mb-1">Lý do từ chối (bắt buộc):</label>
          <Input.TextArea
            rows={4}
            placeholder="VD: Cần bổ sung thêm thông tin về giáo trình hoặc điều chỉnh thời gian học..."
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}
