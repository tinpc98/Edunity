import { useRef, useState } from 'react';
import { 
  Typography, Steps, Button, Card, Form, Input, InputNumber, 
  DatePicker, Radio, message, Breadcrumb, Tag, Row, Col, Divider, Spin, Alert, Select
} from 'antd';
import { 
  BookOutlined, 
  SettingOutlined, 
  CalendarOutlined, 
  CheckCircleOutlined, 
  SearchOutlined, 
  ReloadOutlined,
} from '@ant-design/icons';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ROUTES } from '../../../../routes/routePaths';
import { courseService } from '../../../../services/course.service';
import { classService, classKeys } from '../../../../services/class.service';
import { TeacherVerificationGateCard } from '../../../../components/guards/RequireVerifiedTeacher';
import { useTeacherVerification } from '../../../../hooks/useTeacherVerification';
import { getFriendlyErrorMessage } from '../../../../utils/apiErrorMap';
import {
  CLASS_PRICE_HINT,
  MIN_CLASS_PRICE,
  classPriceRule,
  hasInvalidSlot,
  INVALID_SLOT_MESSAGE,
  notBeforeField,
  parsePrice,
} from '../../../../utils/classForm';
import PriceInput from '../../../../components/common/PriceInput';
import { COURSE_LEVEL_LABELS, GRADE_LEVEL_LABELS, SUPPORTED_GRADE_LEVELS } from '../../../../types/catalog';
import type { Course, GradeLevel } from '../../../../types/catalog';
import { formatDayOfWeek } from '../../../../types/class';
import type { ScheduleEntry, CreateClassPayload } from '../../../../types/class';
import ScheduleEditor from '../components/ScheduleEditor';

const { Title, Text, Paragraph } = Typography;

const isOffered = (course: Course) =>
  course.status === 'ACTIVE' && SUPPORTED_GRADE_LEVELS.some((grade) => grade === course.gradeLevel);

export default function CreateTeacherClassPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(0);
  const [form] = Form.useForm();
  
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(() => searchParams.get('courseId'));
  const [courseSearch, setCourseSearch] = useState<string>('');
  const [gradeFilter, setGradeFilter] = useState<GradeLevel>();
  const [subjectFilter, setSubjectFilter] = useState<string>();

  // Schedule list
  const [scheduleList, setScheduleList] = useState<ScheduleEntry[]>([]);
  // A ref, not state: it must hold between two clicks of the same render and across validation's await
  const isSavingRef = useRef(false);
  const suggestedNameRef = useRef('');

  // 1. Fail-closed Teacher Verification Gate
  const {
    verification,
    isVerified,
    isLoading: isVerificationLoading,
    isError: isVerificationError,
    error: verificationError,
    refetch: refetchVerification,
  } = useTeacherVerification();

  // 2. Every ACTIVE course of an offered grade can be drafted on; teaching authorization is checked when Admin approves.
  // All of them are loaded at once, so both filters always know their options.
  const {
    data: coursesData,
    isPending: isCoursesLoading, // not isLoading: a query paused offline would render as an empty catalog
    isError: isCoursesError,
    error: coursesError,
    refetch: refetchCourses,
  } = useQuery({
    queryKey: ["courses", "active", "class-creation"],
    queryFn: async () => {
      const params = { pageSize: 100, page: 1 };
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
    enabled: isVerified,
    staleTime: 1000 * 60 * 2,
  });

  const courses: Course[] = (coursesData?.items || []).filter(isOffered);
  const matchedCourseInList = courses.find((c) => c.id === selectedCourseId);

  const coursesOfGrade = courses.filter((course) => !gradeFilter || course.gradeLevel === gradeFilter);
  // Each subject names the grades it can be taught at
  const subjectOptions = [...new Map(coursesOfGrade.map((course) => [course.subjectId, course.subjectName ?? '']))]
    .map(([id, name]) => {
      const grades = SUPPORTED_GRADE_LEVELS.filter((grade) =>
        coursesOfGrade.some((course) => course.subjectId === id && course.gradeLevel === grade)
      );
      return { value: id, label: `${name} (${grades.map((grade) => GRADE_LEVEL_LABELS[grade]).join(', ')})` };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  const keyword = courseSearch.trim().toLocaleLowerCase('vi');
  const visibleCourses = coursesOfGrade.filter(
    (course) =>
      (!subjectFilter || course.subjectId === subjectFilter) &&
      [course.title, course.subjectName, course.description, course.curriculumReference]
        .join(' ')
        .toLocaleLowerCase('vi')
        .includes(keyword)
  );

  const changeGradeFilter = (grade?: GradeLevel) => {
    setGradeFilter(grade);
    if (grade && !courses.some((course) => course.subjectId === subjectFilter && course.gradeLevel === grade)) {
      setSubjectFilter(undefined);
    }
  };

  // A URL-provided course must pass the same status and grade check.
  const {
    data: fetchedSelectedCourse,
    isLoading: isVerifyingSelectedCourse,
    isError: isSelectedCourseError,
  } = useQuery({
    queryKey: ["teacher-selected-course", selectedCourseId],
    queryFn: () => courseService.getCourse(selectedCourseId!),
    enabled:
      isVerified &&
      Boolean(selectedCourseId) &&
      !isCoursesLoading &&
      !matchedCourseInList,
    retry: false,
    staleTime: 60_000,
  });

  const selectedCourse: Course | undefined =
    matchedCourseInList || (fetchedSelectedCourse && isOffered(fetchedSelectedCourse) ? fetchedSelectedCourse : undefined);

  const isCheckingSelectedCourse =
    Boolean(selectedCourseId) && !matchedCourseInList && (isCoursesLoading || isVerifyingSelectedCourse);

  const isInvalidSelectedCourse =
    Boolean(selectedCourseId) &&
    !matchedCourseInList &&
    !isCoursesLoading &&
    !isVerifyingSelectedCourse &&
    (isSelectedCourseError || !selectedCourse);

  // Form watches
  const classType = Form.useWatch('classType', form) || 'PAID';
  const isFree = classType === 'FREE';

  // Mutation
  const createClassMutation = useMutation({
    mutationFn: (payload: CreateClassPayload) => classService.createClass(payload),
    onSuccess: (created) => {
      message.success("Đã lưu bản nháp lớp học. Bạn có thể hoàn thiện rồi gửi duyệt.");
      queryClient.invalidateQueries({ queryKey: classKeys.teacherList() });
      navigate(ROUTES.TEACHER.CLASS_DETAIL.replace(":classId", created.id));
    },
    onError: (err: unknown) => {
      isSavingRef.current = false;
      message.error(getFriendlyErrorMessage(err, "Không thể tạo lớp học. Vui lòng kiểm tra lại thông tin."));
    },
  });

  const ensureCourseSelected = () => {
    if (isCheckingSelectedCourse) {
      message.info("Đang kiểm tra trạng thái khóa học đã chọn, vui lòng đợi...");
      return false;
    }
    if (!selectedCourse) {
      message.warning(
        isInvalidSelectedCourse
          ? "Khóa học đã chọn không còn hoạt động hoặc ngoài phạm vi Lớp 6–12 và Ôn thi đại học. Vui lòng chọn khóa học khác."
          : "Vui lòng chọn một khóa học chuẩn."
      );
      return false;
    }
    if (!selectedCourse.level) {
      message.warning("Khóa học này chưa có cấp độ nên chưa thể tạo lớp. Vui lòng chọn khóa khác hoặc liên hệ quản trị viên.");
      return false;
    }
    return true;
  };

  const handleNext = async () => {
    if (currentStep === 0) {
      if (ensureCourseSelected()) setCurrentStep(1);
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
      if (hasInvalidSlot(scheduleList)) {
        message.error(INVALID_SLOT_MESSAGE);
        return;
      }
      setCurrentStep(3);
    }
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  };

  const buildPayload = (): CreateClassPayload => {
    const values = form.getFieldsValue();
    return {
      courseId: selectedCourseId!,
      className: values.className,
      description: values.description || undefined,
      classType: values.classType || 'PAID',
      price: values.classType === 'FREE' ? 0 : parsePrice(values.price),
      capacity: Number(values.capacity || 20),
      enrollmentStart: values.enrollmentStart ? values.enrollmentStart.toISOString() : null,
      enrollmentEnd: values.enrollmentEnd ? values.enrollmentEnd.toISOString() : null,
      startDate: values.startDate ? values.startDate.toISOString() : null,
      endDate: values.endDate ? values.endDate.toISOString() : null,
      schedule: scheduleList.length ? scheduleList : undefined,
    };
  };

  // Saves from any step: only what was typed has to be valid, the rest can be completed on the class page
  const handleSaveDraft = async () => {
    if (isSavingRef.current || !ensureCourseSelected()) return;
    if (hasInvalidSlot(scheduleList)) {
      setCurrentStep(2);
      message.error(INVALID_SLOT_MESSAGE);
      return;
    }

    isSavingRef.current = true;
    try {
      await form.validateFields();
    } catch {
      isSavingRef.current = false;
      setCurrentStep(1);
      message.error("Vui lòng kiểm tra lại các thông tin được đánh dấu.");
      return;
    }
    createClassMutation.mutate(buildPayload());
  };

  // ---------------- Render Step 0: Chọn khóa chuẩn ----------------
  const renderStep0 = () => (
    <div className="flex flex-col lg:flex-row gap-6 mt-6">
      <div className="flex-1 min-w-0">
        <div className="bg-emerald-50 text-emerald-800 px-4 py-3 rounded-xl mb-6 flex items-start gap-3 border border-emerald-100">
          <CheckCircleOutlined className="mt-1 text-emerald-600 text-base" />
          <div>
            <div className="font-bold">Chọn khóa học chuẩn từ Edunity</div>
            <div className="text-sm">
              Giáo viên khởi tạo lớp dựa trên khung học liệu và giáo trình đã qua kiểm duyệt sư phạm, dành cho Lớp 6–12 và Ôn thi đại học.
            </div>
          </div>
        </div>

        {isInvalidSelectedCourse && (
          <Alert
            type="warning"
            showIcon
            className="mb-6 rounded-xl"
            message="Course từ đường dẫn không khả dụng"
            description="Khóa học không tồn tại, đã tạm ngưng, ngoài phạm vi Lớp 6–12 và Ôn thi đại học hoặc chưa tải được. Hãy chọn khóa học khác trong danh sách."
            action={
              <Button size="small" onClick={() => setSelectedCourseId(null)}>
                Chọn lại
              </Button>
            }
          />
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-3">
          <Select<GradeLevel>
            aria-label="Lọc theo lớp"
            placeholder="Tất cả các lớp"
            size="large"
            className="w-full"
            allowClear
            value={gradeFilter}
            onChange={changeGradeFilter}
            options={SUPPORTED_GRADE_LEVELS.map((grade) => ({ value: grade, label: GRADE_LEVEL_LABELS[grade] }))}
          />
          <Select<string>
            aria-label="Lọc theo môn học"
            placeholder="Tất cả môn học"
            size="large"
            className="w-full"
            allowClear
            showSearch
            optionFilterProp="label"
            value={subjectFilter}
            onChange={setSubjectFilter}
            options={subjectOptions}
          />
        </div>
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

        {isCoursesLoading ? (
          <div className="py-12 text-center">
            <Spin tip="Đang tải danh sách khóa học..." />
          </div>
        ) : isCoursesError ? (
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
        ) : visibleCourses.length === 0 ? (
          <div className="p-8 text-center bg-gray-50 rounded-xl border border-gray-200">
            <Text className="text-gray-500">
              Chưa có khóa học nào phù hợp. Hãy đổi bộ lọc hoặc{' '}
              <Link to={ROUTES.TEACHER.COURSE_PROPOSALS}>đề xuất khóa học mới</Link>.
            </Text>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5 max-h-[500px] overflow-y-auto pr-1">
            {visibleCourses.map((course) => {
              const isSelected = selectedCourse?.id === course.id;
              return (
                <div 
                  key={course.id}
                  onClick={() => {
                    setSelectedCourseId(course.id);
                    // Follow the course only while the name is still the one suggested for the previous course
                    const name = form.getFieldValue('className');
                    if (!name || name === suggestedNameRef.current) {
                      suggestedNameRef.current = `Lớp ${course.title}`;
                      form.setFieldsValue({ className: suggestedNameRef.current });
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
                            {GRADE_LEVEL_LABELS[course.gradeLevel]}
                          </span>
                        )}
                        {course.subjectName && (
                          <span className="text-xs font-medium text-gray-500">
                            • {course.subjectName}
                          </span>
                        )}
                        <span className="text-xs font-medium text-gray-500">
                          • {course.level ? COURSE_LEVEL_LABELS[course.level] : 'Chưa có cấp độ'}
                        </span>
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
      <div className="w-full lg:w-[350px]">
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
                <span className="font-semibold text-gray-800">
                  {selectedCourse?.gradeLevel ? GRADE_LEVEL_LABELS[selectedCourse.gradeLevel] : '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 font-medium">Cấp độ:</span>
                <span className="font-semibold text-gray-800">
                  {selectedCourse?.level ? COURSE_LEVEL_LABELS[selectedCourse.level] : '-'}
                </span>
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
            price: MIN_CLASS_PRICE
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
            <Radio.Group className="w-full">
              <Row gutter={16}>
                <Col span={12}>
                  <Radio.Button 
                    value="PAID" 
                    className="w-full h-auto py-3 px-4 rounded-xl text-left border-2 [&.ant-radio-button-wrapper-checked]:border-indigo-600 [&.ant-radio-button-wrapper-checked]:bg-indigo-50"
                  >
                    <div className="font-semibold text-gray-800 mb-1">Lớp có thu phí (PAID)</div>
                    <div className="text-xs text-gray-500 font-normal leading-tight">
                      Học viên đóng học phí để ghi danh.
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
              <Col xs={24} sm={12}>
                <Form.Item 
                  label="Học phí trọn khóa (VNĐ)" 
                  name="price" 
                  required
                  extra={CLASS_PRICE_HINT}
                  rules={[classPriceRule]}
                >
                  <PriceInput size="large" className="w-full rounded-lg" />
                </Form.Item>
              </Col>
            )}
            <Col xs={24} sm={isFree ? 24 : 12}>
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
            <Col xs={24} sm={12} md={6}>
              <Form.Item label="Mở tuyển sinh từ" name="enrollmentStart">
                <DatePicker size="large" className="w-full rounded-lg" format="DD/MM/YYYY" placeholder="Chọn ngày" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item
                label="Hạn chót tuyển sinh"
                name="enrollmentEnd"
                dependencies={['enrollmentStart']}
                rules={[notBeforeField('enrollmentStart', 'Không được trước ngày mở tuyển sinh')]}
              >
                <DatePicker size="large" className="w-full rounded-lg" format="DD/MM/YYYY" placeholder="Chọn ngày" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item label="Ngày khai giảng" name="startDate" extra="Phải sau hôm nay khi gửi duyệt">
                <DatePicker size="large" className="w-full rounded-lg" format="DD/MM/YYYY" placeholder="Chọn ngày" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item
                label="Ngày kết thúc"
                name="endDate"
                dependencies={['startDate']}
                rules={[notBeforeField('startDate', 'Không được trước ngày khai giảng')]}
              >
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

        <ScheduleEditor value={scheduleList} onChange={setScheduleList} />
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
                  <span className="text-indigo-600 font-bold">{parsePrice(values.price).toLocaleString('vi-VN')} VNĐ/học viên</span>
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
                {scheduleList.length === 0 && 'Chưa thiết lập'}
                {scheduleList.map((s, idx) => (
                  <Tag key={idx} color="blue">
                    {formatDayOfWeek(s.dayOfWeek)}: {s.startTime} - {s.endTime}
                  </Tag>
                ))}
              </div>
            </Col>
          </Row>
        </Card>

        <Alert
          type="info"
          showIcon
          className="mt-4 rounded-xl text-left"
          message="Sau khi lưu nháp"
          description="Để gửi duyệt, lớp cần đủ thông tin, học phí hợp lệ, lịch học và buổi học. Quyền giảng dạy và hợp đồng không chặn việc gửi duyệt; Admin kiểm tra hai điều kiện này trước khi mở lớp."
        />
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
        <div className="flex flex-wrap justify-end gap-3">
          {currentStep < stepItems.length - 1 ? (
            <>
              <Button
                onClick={handleSaveDraft}
                loading={createClassMutation.isPending}
                disabled={!selectedCourse}
                className="h-[44px] px-6 rounded-xl font-medium"
              >
                Lưu nháp
              </Button>
              <Button
                type="primary"
                onClick={handleNext}
                loading={currentStep === 0 && isCheckingSelectedCourse}
                disabled={
                  createClassMutation.isPending ||
                  (currentStep === 0 && (isCheckingSelectedCourse || isInvalidSelectedCourse))
                }
                className="h-[44px] px-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-medium"
              >
                Tiếp tục
              </Button>
            </>
          ) : (
            <Button 
              type="primary" 
              onClick={handleSaveDraft}
              loading={createClassMutation.isPending}
              className="h-[44px] px-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-medium"
            >
              Xác nhận & Lưu bản nháp
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
