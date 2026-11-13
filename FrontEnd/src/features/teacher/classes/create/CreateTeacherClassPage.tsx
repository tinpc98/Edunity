import { useState } from 'react';
import { 
  Typography, Steps, Button, Card, Form, Input, InputNumber, 
  Select, DatePicker, Radio, message, Breadcrumb, Tag, Row, Col, Divider, Spin, TimePicker, Alert
} from 'antd';
import { 
  BookOutlined, 
  SettingOutlined, 
  CalendarOutlined, 
  CheckCircleOutlined, 
  SearchOutlined, 
  PlusOutlined, 
  DeleteOutlined, 
  ReloadOutlined,
} from '@ant-design/icons';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { ROUTES } from '../../../../routes/routePaths';
import { courseService } from '../../../../services/course.service';
import { classService, classKeys } from '../../../../services/class.service';
import { teacherSubjectAuthorizationService } from '../../../../services/teacherSubjectAuthorization.service';
import { TeacherVerificationGateCard } from '../../../../components/guards/RequireVerifiedTeacher';
import { useTeacherVerification } from '../../../../hooks/useTeacherVerification';
import { getFriendlyErrorMessage } from '../../../../utils/apiErrorMap';
import type { Course } from '../../../../types/catalog';
import type { TeacherSubjectAuthorization } from '../../../../types/teacherSubjectAuthorization';
import type { ScheduleEntry, CreateClassPayload } from '../../../../types/class';
import { isCourseAuthorizedForTeacher } from '../../../../utils/teacherCourseAuthorization';
import { useAuthStore } from '../../../../stores/auth.store';

const { Title, Text, Paragraph } = Typography;

export default function CreateTeacherClassPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [currentStep, setCurrentStep] = useState(0);
  const [form] = Form.useForm();
  
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(() => searchParams.get('courseId'));
  const [courseSearch, setCourseSearch] = useState<string>('');

  // Schedule list
  const [scheduleList, setScheduleList] = useState<ScheduleEntry[]>([
    { dayOfWeek: 2, startTime: "19:00", endTime: "20:30" },
    { dayOfWeek: 4, startTime: "19:00", endTime: "20:30" },
  ]);

  // 1. Fail-closed Teacher Verification Gate
  const {
    verification,
    isVerified,
    isLoading: isVerificationLoading,
    isError: isVerificationError,
    error: verificationError,
    refetch: refetchVerification,
  } = useTeacherVerification();

  const authorizationsQuery = useQuery({
    queryKey: ["teacher-subject-authorizations", user?.userId],
    queryFn: () => teacherSubjectAuthorizationService.listAllMyAuthorizations(),
    enabled: isVerified,
    staleTime: 30_000,
  });
  const approvedAuthorizations = (authorizationsQuery.data ?? []).filter(
    (authorization: TeacherSubjectAuthorization) => authorization.status === "APPROVED"
  );

  // 2. Courses are available only after exact subject/grade/level authorization is confirmed.
  const {
    data: coursesData,
    isLoading: isCoursesLoading,
    isError: isCoursesError,
    error: coursesError,
    refetch: refetchCourses,
  } = useQuery({
    queryKey: ["courses", "active", courseSearch, "teacher-authorized"],
    queryFn: async () => {
      const params = { search: courseSearch || undefined, pageSize: 100, page: 1 };
      const firstPage = await courseService.searchCourses(params);
      if (firstPage.totalPages <= 1) return firstPage;
      const remainingPages = await Promise.all(
        Array.from({ length: firstPage.totalPages - 1 }, (_, index) =>
          courseService.searchCourses({ ...params, page: index + 2 })
        )
      );
      return {
        ...firstPage,
        items: [firstPage, ...remainingPages].flatMap((page) => page.items),
      };
    },
    enabled: isVerified && authorizationsQuery.isSuccess,
    staleTime: 1000 * 60 * 2,
  });

  // Only ACTIVE courses matching an approved Teacher authorization may be selected.
  const courses: Course[] = (coursesData?.items || []).filter(
    (course) =>
      course.status === "ACTIVE" &&
      isCourseAuthorizedForTeacher(course, approvedAuthorizations)
  );
  const matchedCourseInList = courses.find((c) => c.id === selectedCourseId);

  // A URL-provided course must pass the same active status and authorization checks.
  const {
    data: fetchedSelectedCourse,
    isLoading: isVerifyingSelectedCourse,
    isError: isSelectedCourseError,
  } = useQuery({
    queryKey: ["teacher-selected-course", selectedCourseId],
    queryFn: () => courseService.getCourse(selectedCourseId!),
    enabled:
      isVerified &&
      authorizationsQuery.isSuccess &&
      Boolean(selectedCourseId) &&
      !isCoursesLoading &&
      !matchedCourseInList,
    retry: false,
    staleTime: 60_000,
  });

  const selectedCourse: Course | undefined =
    matchedCourseInList ||
    (fetchedSelectedCourse?.status === "ACTIVE" &&
    isCourseAuthorizedForTeacher(fetchedSelectedCourse, approvedAuthorizations)
      ? fetchedSelectedCourse
      : undefined);

  const isCheckingSelectedCourse =
    Boolean(selectedCourseId) &&
    !matchedCourseInList &&
    (authorizationsQuery.isLoading || isCoursesLoading || isVerifyingSelectedCourse);

  const isInvalidSelectedCourse =
    Boolean(selectedCourseId) &&
    !matchedCourseInList &&
    authorizationsQuery.isSuccess &&
    !isCoursesLoading &&
    !isVerifyingSelectedCourse &&
    (isSelectedCourseError ||
      !fetchedSelectedCourse ||
    fetchedSelectedCourse.status !== "ACTIVE" ||
    !isCourseAuthorizedForTeacher(fetchedSelectedCourse, approvedAuthorizations));

  // Form watches
  const classType = Form.useWatch('classType', form) || 'PAID';
  const isFree = classType === 'FREE';

  // Mutation
  const createClassMutation = useMutation({
    mutationFn: (payload: CreateClassPayload) => classService.createClass(payload),
    onSuccess: (created) => {
      message.success("Khởi tạo lớp học thành công!");
      queryClient.invalidateQueries({ queryKey: classKeys.teacherList() });
      navigate(ROUTES.TEACHER.CLASS_DETAIL.replace(":classId", created.id));
    },
    onError: (err: unknown) => {
      message.error(getFriendlyErrorMessage(err, "Không thể tạo lớp học. Vui lòng kiểm tra lại thông tin."));
    },
  });

  const handleNext = async () => {
    if (currentStep === 0) {
      if (isCheckingSelectedCourse) {
        message.info("Đang kiểm tra trạng thái khóa học đã chọn, vui lòng đợi...");
        return;
      }
      if (authorizationsQuery.isError) {
        message.error("Không xác định được quyền giảng dạy. Vui lòng tải lại trước khi chọn Course.");
        return;
      }
      if (!selectedCourseId || !selectedCourse || selectedCourse.status !== "ACTIVE") {
        message.warning(
          isInvalidSelectedCourse
            ? "Course không ACTIVE hoặc không thuộc phạm vi môn, khối và cấp độ đã được duyệt."
            : approvedAuthorizations.length
              ? "Vui lòng chọn Course ACTIVE thuộc phạm vi giảng dạy được duyệt."
              : "Bạn chưa có quyền giảng dạy được duyệt. Hãy đăng ký môn trong Danh mục khóa học."
        );
        return;
      }
      setCurrentStep(1);
      return;
    }

    if (currentStep === 1) {
      try {
        await form.validateFields();
        setCurrentStep(2);
      } catch (err) {
        console.log("Validation failed:", err);
      }
      return;
    }

    if (currentStep === 2) {
      // Validate schedule
      for (const entry of scheduleList) {
        if (!entry.startTime || !entry.endTime || entry.startTime >= entry.endTime) {
          message.error("Giờ bắt đầu phải trước giờ kết thúc cho tất cả ca học.");
          return;
        }
      }
      setCurrentStep(3);
    }
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  };

  const handleAddScheduleEntry = () => {
    setScheduleList([
      ...scheduleList,
      { dayOfWeek: 1, startTime: "18:00", endTime: "19:30" },
    ]);
  };

  const handleRemoveScheduleEntry = (index: number) => {
    setScheduleList(scheduleList.filter((_, i) => i !== index));
  };

  const handleUpdateSchedule = (
    index: number,
    field: keyof ScheduleEntry,
    value: ScheduleEntry[keyof ScheduleEntry]
  ) => {
    const updated = [...scheduleList];
    updated[index] = { ...updated[index], [field]: value };
    setScheduleList(updated);
  };

  const buildPayload = (): CreateClassPayload => {
    const values = form.getFieldsValue();
    return {
      courseId: selectedCourseId!,
      className: values.className,
      description: values.description || undefined,
      classType: values.classType || 'PAID',
      price: (values.classType === 'FREE') ? 0 : Number(values.price ?? 500000),
      capacity: Number(values.capacity || 20),
      enrollmentStart: values.enrollmentStart ? values.enrollmentStart.toISOString() : null,
      enrollmentEnd: values.enrollmentEnd ? values.enrollmentEnd.toISOString() : null,
      startDate: values.startDate ? values.startDate.toISOString() : null,
      endDate: values.endDate ? values.endDate.toISOString() : null,
      schedule: scheduleList.length ? scheduleList : undefined,
    };
  };

  const handleSubmit = () => {
    const payload = buildPayload();
    createClassMutation.mutate(payload);
  };

  // ---------------- Render Step 0: Chọn khóa chuẩn ----------------
  const renderStep0 = () => (
    <div className="flex flex-col md:flex-row gap-6 mt-6">
      <div className="flex-1">
        <div className="bg-emerald-50 text-emerald-800 px-4 py-3 rounded-xl mb-6 flex items-start gap-3 border border-emerald-100">
          <CheckCircleOutlined className="mt-1 text-emerald-600 text-base" />
          <div>
            <div className="font-bold">Chọn khóa học chuẩn từ Edunity</div>
            <div className="text-sm">
              Giáo viên khởi tạo lớp dựa trên khung học liệu và giáo trình đã qua kiểm duyệt sư phạm.
            </div>
          </div>
        </div>

        {authorizationsQuery.isError ? (
          <Alert
            type="error"
            showIcon
            className="mb-6 rounded-xl"
            message="Không thể kiểm tra quyền giảng dạy"
            description="Không thể xác nhận môn, khối và cấp độ đã được duyệt. Không thể tiếp tục chọn Course cho đến khi tải được dữ liệu quyền."
            action={<Button size="small" onClick={() => authorizationsQuery.refetch()}>Thử lại</Button>}
          />
        ) : !authorizationsQuery.isLoading && approvedAuthorizations.length === 0 ? (
          <Alert
            type="warning"
            showIcon
            className="mb-6 rounded-xl"
            message="Chưa có quyền giảng dạy được duyệt"
            description="Đăng ký môn và phạm vi giảng dạy trong Danh mục khóa học. Chỉ Course thuộc phạm vi được Admin duyệt mới có thể dùng để tạo lớp."
            action={<Button size="small" onClick={() => navigate("/teacher/courses")}>Mở Danh mục khóa học</Button>}
          />
        ) : null}

        {isInvalidSelectedCourse && (
          <Alert
            type="warning"
            showIcon
            className="mb-6 rounded-xl"
            message="Course từ đường dẫn không khả dụng"
            description="Course không ACTIVE hoặc không thuộc chính xác môn, khối và cấp độ đã được duyệt. Hãy chọn Course hợp lệ trong danh sách."
            action={
              <Button size="small" onClick={() => setSelectedCourseId(null)}>
                Chọn lại
              </Button>
            }
          />
        )}

        <div className="flex gap-3 mb-6">
          <Input 
            placeholder="Tìm khóa học theo tên hoặc chủ đề..." 
            prefix={<SearchOutlined className="text-gray-400" />} 
            className="rounded-lg" 
            size="large" 
            value={courseSearch}
            onChange={(e) => setCourseSearch(e.target.value)}
            allowClear
          />
        </div>

        {authorizationsQuery.isLoading || isCoursesLoading ? (
          <div className="py-12 text-center">
            <Spin tip="Đang tải danh sách khóa học..." />
          </div>
        ) : authorizationsQuery.isError ? null : isCoursesError ? (
          <Alert
            type="error"
            showIcon
            className="rounded-xl"
            message="Không thể tải danh sách khóa học"
            description={getFriendlyErrorMessage(
              coursesError,
              "Đã xảy ra lỗi khi tải danh sách khóa học chuẩn. Vui lòng thử lại."
            )}
            action={
              <Button
                size="small"
                danger
                icon={<ReloadOutlined />}
                onClick={() => refetchCourses()}
              >
                Thử lại
              </Button>
            }
          />
        ) : approvedAuthorizations.length === 0 ? null : courses.length === 0 ? (
          <div className="p-8 text-center bg-gray-50 rounded-xl border border-gray-200">
            <Text className="text-gray-500">Không tìm thấy khóa học đang hoạt động nào phù hợp.</Text>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5 max-h-[500px] overflow-y-auto pr-1">
            {courses.map((course) => {
              const isSelected = selectedCourse?.id === course.id;
              return (
                <div 
                  key={course.id}
                  onClick={() => {
                    setSelectedCourseId(course.id);
                    if (!form.getFieldValue('className')) {
                      form.setFieldsValue({ className: `Lớp ${course.title}` });
                    }
                  }}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    isSelected 
                      ? 'border-indigo-600 bg-indigo-50/50 shadow-xs' 
                      : 'border-gray-200 hover:border-indigo-300 bg-white'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 pr-4">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        {course.gradeLevel && (
                          <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
                            {course.gradeLevel}
                          </span>
                        )}
                        {course.subjectName && (
                          <span className="text-xs font-medium text-gray-500">
                            • {course.subjectName}
                          </span>
                        )}
                      </div>
                      <Title level={5} className="!m-0 !mb-1 text-gray-900">{course.title}</Title>
                      {course.description && (
                        <Text className="text-gray-500 text-xs line-clamp-2">{course.description}</Text>
                      )}
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      isSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300'
                    }`}>
                      {isSelected && <CheckCircleOutlined className="text-xs" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview Column */}
      <div className="w-full md:w-[350px]">
        <Card className="rounded-2xl border border-indigo-100 shadow-sm sticky top-6 overflow-hidden" bodyStyle={{ padding: 0 }}>
          <div className="bg-indigo-50/60 p-4 border-b border-indigo-100 flex justify-between items-center">
            <span className="font-semibold text-indigo-900">Khóa học đã chọn</span>
            <Tag color="indigo" className="!m-0">Phase 4</Tag>
          </div>
          <div className="p-5">
            <div className="w-full h-[150px] bg-slate-100 rounded-xl mb-4 relative overflow-hidden flex items-center justify-center">
              <BookOutlined className="text-4xl text-indigo-300" />
            </div>
            <Title level={5} className="!m-0 !mb-2">
              {selectedCourse ? selectedCourse.title : 'Chưa chọn khóa học'}
            </Title>
            <Divider className="my-3" />
            <div className="flex flex-col gap-2.5 text-xs text-gray-600">
              <div className="flex justify-between">
                <span className="text-gray-400 font-medium">Môn học:</span>
                <span className="font-semibold text-gray-800">{selectedCourse?.subjectName || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 font-medium">Danh mục:</span>
                <span className="font-semibold text-gray-800">{selectedCourse?.categoryName || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 font-medium">Khối lớp:</span>
                <span className="font-semibold text-gray-800">{selectedCourse?.gradeLevel || '-'}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );

  // ---------------- Render Step 1: Thông tin & Cấu hình ----------------
  const renderStep1 = () => (
    <div className="mt-6 max-w-[800px] mx-auto">
      <Card className="rounded-2xl shadow-sm border-gray-100 p-6">
        <Title level={4} className="!mb-6">Cấu hình thông tin lớp học</Title>
        
        <Form 
          layout="vertical" 
          form={form} 
          preserve={true}
          initialValues={{ 
            classType: 'PAID', 
            capacity: 20,
            price: 500000 
          }}
        >
          <Form.Item 
            label="Tên lớp học công khai" 
            name="className" 
            rules={[{ required: true, message: 'Vui lòng nhập tên lớp học' }]}
          >
            <Input size="large" className="rounded-lg" placeholder="VD: Lớp Ôn thi môn Toán 12 Nâng cao" />
          </Form.Item>
          
          <Form.Item label="Loại hình lớp học" name="classType" rules={[{ required: true }]}>
            <Radio.Group 
              className="w-full"
              onChange={(e) => {
                if (e.target.value === 'FREE') {
                  form.setFieldsValue({ price: 0 });
                } else if (!form.getFieldValue('price')) {
                  form.setFieldsValue({ price: 500000 });
                }
              }}
            >
              <Row gutter={16}>
                <Col span={12}>
                  <Radio.Button 
                    value="PAID" 
                    className="w-full h-auto py-3 px-4 rounded-xl text-left border-2 [&.ant-radio-button-wrapper-checked]:border-indigo-600 [&.ant-radio-button-wrapper-checked]:bg-indigo-50"
                  >
                    <div className="font-semibold text-gray-800 mb-1">Lớp có thu phí (PAID)</div>
                    <div className="text-xs text-gray-500 font-normal leading-tight">
                      Học viên đóng học phí để ghi danh. Giá &gt; 0 VNĐ.
                    </div>
                  </Radio.Button>
                </Col>
                <Col span={12}>
                  <Radio.Button 
                    value="FREE" 
                    className="w-full h-auto py-3 px-4 rounded-xl text-left border-2 [&.ant-radio-button-wrapper-checked]:border-emerald-600 [&.ant-radio-button-wrapper-checked]:bg-emerald-50"
                  >
                    <div className="font-semibold text-gray-800 mb-1">Lớp cộng đồng (FREE)</div>
                    <div className="text-xs text-gray-500 font-normal leading-tight">
                      Lớp phi lợi nhuận, miễn phí 100%. Giá = 0 VNĐ.
                    </div>
                  </Radio.Button>
                </Col>
              </Row>
            </Radio.Group>
          </Form.Item>

          <Row gutter={24}>
            {!isFree && (
              <Col span={12}>
                <Form.Item 
                  label="Học phí trọn khóa (VNĐ)" 
                  name="price" 
                  rules={[
                    { required: true, message: 'Vui lòng nhập học phí' },
                    { type: 'number', min: 1000, message: 'Học phí lớp PAID phải lớn hơn 0' }
                  ]}
                >
                  <InputNumber 
                    size="large" 
                    className="w-full rounded-lg" 
                    formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={value => Number(value!.replace(/\$\s?|(,*)/g, ''))}
                    addonAfter="VNĐ"
                  />
                </Form.Item>
              </Col>
            )}
            <Col span={isFree ? 24 : 12}>
              <Form.Item 
                label="Sĩ số tối đa (học viên)" 
                name="capacity" 
                rules={[
                  { required: true, message: 'Vui lòng nhập sĩ số' },
                  { type: 'number', min: 1, message: 'Sĩ số phải >= 1' }
                ]}
              >
                <InputNumber size="large" className="w-full rounded-lg" addonAfter="Học viên" min={1} />
              </Form.Item>
            </Col>
          </Row>
          
          <Row gutter={24}>
            <Col span={6}>
              <Form.Item label="Mở tuyển sinh từ" name="enrollmentStart">
                <DatePicker size="large" className="w-full rounded-lg" format="DD/MM/YYYY" placeholder="Chọn ngày" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="Hạn chót tuyển sinh" name="enrollmentEnd">
                <DatePicker size="large" className="w-full rounded-lg" format="DD/MM/YYYY" placeholder="Chọn ngày" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="Ngày khai giảng" name="startDate">
                <DatePicker size="large" className="w-full rounded-lg" format="DD/MM/YYYY" placeholder="Chọn ngày" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="Ngày kết thúc" name="endDate">
                <DatePicker size="large" className="w-full rounded-lg" format="DD/MM/YYYY" placeholder="Chọn ngày" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Mô tả lớp học & Mục tiêu đào tạo" name="description">
            <Input.TextArea rows={4} className="rounded-lg" placeholder="Mô tả chi tiết nội dung, cam kết đầu ra của lớp học..." />
          </Form.Item>
        </Form>
      </Card>
    </div>
  );

  // ---------------- Render Step 2: Lịch giảng dạy ----------------
  const dayOptions = [
    { value: 1, label: "Thứ 2" },
    { value: 2, label: "Thứ 3" },
    { value: 3, label: "Thứ 4" },
    { value: 4, label: "Thứ 5" },
    { value: 5, label: "Thứ 6" },
    { value: 6, label: "Thứ 7" },
    { value: 0, label: "Chủ nhật" },
  ];

  const renderStep2 = () => (
    <div className="mt-6 max-w-[800px] mx-auto">
      <Card className="rounded-2xl shadow-sm border-gray-100 p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <Title level={4} className="!m-0">Lịch giảng dạy & Ca học hàng tuần</Title>
            <Text className="text-gray-500 text-sm">
              Thiết lập các ca học định kỳ trong tuần để học viên theo dõi lịch học.
            </Text>
          </div>
          <Tag color="indigo" className="font-semibold rounded-full px-3 py-1">
            {scheduleList.length} ca / tuần
          </Tag>
        </div>

        <div className="flex flex-col gap-3.5 mb-6">
          {scheduleList.map((entry, index) => (
            <div 
              key={index}
              className="border border-gray-200 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 bg-white hover:border-indigo-200 transition-colors"
            >
              <div className="flex items-center gap-3 w-full md:w-auto">
                <span className="font-semibold text-gray-700 text-sm whitespace-nowrap">Ca {index + 1}:</span>
                <Select
                  value={entry.dayOfWeek}
                  onChange={(val) => handleUpdateSchedule(index, 'dayOfWeek', val)}
                  options={dayOptions}
                  className="w-[120px]"
                />
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">Từ</span>
                <TimePicker
                  value={entry.startTime ? dayjs(entry.startTime, "HH:mm") : null}
                  format="HH:mm"
                  minuteStep={5}
                  onChange={(_, str) => handleUpdateSchedule(index, 'startTime', str || '')}
                  className="w-[100px]"
                />
                <span className="text-xs text-gray-500">đến</span>
                <TimePicker
                  value={entry.endTime ? dayjs(entry.endTime, "HH:mm") : null}
                  format="HH:mm"
                  minuteStep={5}
                  onChange={(_, str) => handleUpdateSchedule(index, 'endTime', str || '')}
                  className="w-[100px]"
                />
              </div>

              <Button 
                type="text" 
                danger 
                icon={<DeleteOutlined />} 
                onClick={() => handleRemoveScheduleEntry(index)}
                disabled={scheduleList.length <= 1}
              >
                Xóa
              </Button>
            </div>
          ))}
        </div>

        <Button 
          type="dashed" 
          block 
          size="large" 
          icon={<PlusOutlined />} 
          onClick={handleAddScheduleEntry}
          className="rounded-xl border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-medium h-[46px]"
        >
          Thêm ca học trong tuần
        </Button>
      </Card>
    </div>
  );

  // ---------------- Render Step 3: Xác nhận ----------------
  const renderStep3 = () => {
    const values = form.getFieldsValue();
    return (
      <div className="mt-6 max-w-[800px] mx-auto text-center">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
          <CheckCircleOutlined />
        </div>
        <Title level={3} className="!m-0 !mb-2">Xác nhận thông tin lớp học</Title>
        <Paragraph className="text-gray-500 max-w-[500px] mx-auto text-sm">
          Lớp học sẽ được khởi tạo ở trạng thái <strong>Bản nháp (DRAFT)</strong> trên hệ thống Edunity.
        </Paragraph>
        
        <Card className="rounded-2xl shadow-sm border-gray-100 text-left mt-6 bg-slate-50/60 p-6">
          <Row gutter={[24, 20]}>
            <Col span={12}>
              <div className="text-xs text-gray-400 font-medium mb-0.5">Tên lớp học</div>
              <div className="font-semibold text-gray-900 text-base">{values.className || '-'}</div>
            </Col>
            <Col span={12}>
              <div className="text-xs text-gray-400 font-medium mb-0.5">Khóa học chuẩn</div>
              <div className="font-semibold text-indigo-700 text-base">{selectedCourse?.title || '-'}</div>
            </Col>
            <Col span={12}>
              <div className="text-xs text-gray-400 font-medium mb-0.5">Loại hình & Học phí</div>
              <div className="font-semibold text-gray-900">
                {values.classType === 'FREE' ? (
                  <Tag color="green">Miễn phí (FREE)</Tag>
                ) : (
                  <span className="text-indigo-600 font-bold">{Number(values.price || 0).toLocaleString('vi-VN')} VNĐ</span>
                )}
              </div>
            </Col>
            <Col span={12}>
              <div className="text-xs text-gray-400 font-medium mb-0.5">Sĩ số tối đa</div>
              <div className="font-semibold text-gray-900">{values.capacity} học viên</div>
            </Col>
            <Col span={24}>
              <div className="text-xs text-gray-400 font-medium mb-0.5">Lịch học hàng tuần ({scheduleList.length} ca)</div>
              <div className="text-sm text-gray-700">
                {scheduleList.map((s, idx) => (
                  <Tag key={idx} color="blue">
                    {dayOptions.find(d => d.value === s.dayOfWeek)?.label}: {s.startTime} - {s.endTime}
                  </Tag>
                ))}
              </div>
            </Col>
          </Row>
        </Card>
      </div>
    );
  };

  const stepItems = [
    { title: 'Chọn khóa chuẩn', icon: <BookOutlined /> },
    { title: 'Cấu hình lớp', icon: <SettingOutlined /> },
    { title: 'Lịch giảng dạy', icon: <CalendarOutlined /> },
    { title: 'Xác nhận', icon: <CheckCircleOutlined /> },
  ];

  // ---------------- Fail-closed Verified Gate Blocking ----------------
  if (!isVerified) {
    return (
      <div className="site-container py-6 min-h-[500px] max-w-[800px] mx-auto">
        <Breadcrumb 
          className="mb-4 text-sm"
          items={[
            { title: <Link to={ROUTES.TEACHER.HOME}>Tổng quan</Link> },
            { title: 'Tạo lớp học mới' },
          ]}
        />
        <TeacherVerificationGateCard
          verification={verification}
          isLoading={isVerificationLoading}
          isError={isVerificationError}
          error={verificationError}
          onRetry={() => {
            void refetchVerification();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1200px] mx-auto pb-10">
      <Breadcrumb 
        className="mb-2 text-sm"
        items={[
          { title: <Link to={ROUTES.TEACHER.HOME}>Tổng quan</Link> },
          { title: <Link to={ROUTES.TEACHER.CLASSES}>Lớp của tôi</Link> },
          { title: 'Tạo lớp học mới' },
        ]}
      />
      
      <div>
        <div className="flex items-center gap-2 mb-1 text-indigo-700 font-bold uppercase tracking-wider text-xs">
          <SettingOutlined /> KHỞI TẠO LỚP GIẢNG DẠY
        </div>
        <Title level={2} className="!m-0 text-gray-900">Tạo lớp học mới</Title>
        <Text className="text-gray-500">
          Thiết lập và mở lớp học trực tuyến từ danh mục khóa học chuẩn hóa của Edunity
        </Text>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mt-4">
        <Steps 
          current={currentStep} 
          items={stepItems} 
          className="max-w-[800px] mx-auto mb-8 font-medium"
        />

        <div className={currentStep === 0 ? "block" : "hidden"}>{renderStep0()}</div>
        <div className={currentStep === 1 ? "block" : "hidden"}>{renderStep1()}</div>
        <div className={currentStep === 2 ? "block" : "hidden"}>{renderStep2()}</div>
        <div className={currentStep === 3 ? "block" : "hidden"}>{renderStep3()}</div>
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
          {currentStep < stepItems.length - 1 ? (
            <Button 
              type="primary" 
              onClick={handleNext} 
              loading={currentStep === 0 && isCheckingSelectedCourse}
              disabled={
                currentStep === 0 &&
                (isCheckingSelectedCourse ||
                  isInvalidSelectedCourse ||
                  authorizationsQuery.isLoading ||
                  authorizationsQuery.isError ||
                  (authorizationsQuery.isSuccess && approvedAuthorizations.length === 0))
              }
              className="h-[44px] px-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-medium"
            >
              Tiếp tục
            </Button>
          ) : (
            <Button 
              type="primary" 
              onClick={handleSubmit} 
              loading={createClassMutation.isPending}
              className="h-[44px] px-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-medium"
            >
              Xác nhận & Khởi tạo lớp học
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
