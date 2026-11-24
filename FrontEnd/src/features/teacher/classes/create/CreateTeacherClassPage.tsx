import { useRef, useState } from 'react';
import { 
  Typography, Steps, Button, Card, Form, Input,
  message, Tag, Row, Col, Divider, Spin, Alert, Select
} from 'antd';
import { 
  BookOutlined, 
  CalendarOutlined, 
  CheckCircleOutlined, 
  SearchOutlined, 
  ReloadOutlined,
  FileProtectOutlined,
} from '@ant-design/icons';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ROUTES } from '../../../../routes/routePaths';
import { courseService } from '../../../../services/course.service';
import { teacherContractService } from '../../../../services/teacherContract.service';
import { teacherSubjectAuthorizationService } from '../../../../services/teacherSubjectAuthorization.service';
import { classService, classKeys } from '../../../../services/class.service';
import { TeacherVerificationGateCard } from '../../../../components/guards/RequireVerifiedTeacher';
import { useTeacherVerification } from '../../../../hooks/useTeacherVerification';
import { getFriendlyErrorMessage } from '../../../../utils/apiErrorMap';
import { parsePrice, sessionPlanNotice } from '../../../../utils/classForm';
import { GRADE_LEVEL_LABELS, SUPPORTED_GRADE_LEVELS } from '../../../../types/catalog';
import type { Course, GradeLevel } from '../../../../types/catalog';
import { formatDayOfWeek } from '../../../../types/class';
import type { ScheduleEntry, CreateClassPayload } from '../../../../types/class';
import ClassConfigForm, { classFormPayload, planBlocker, useClassPlan } from '../components/ClassConfigForm';

const { Title, Text, Paragraph } = Typography;

const isOffered = (course: Course) =>
  course.status === 'ACTIVE' && SUPPORTED_GRADE_LEVELS.some((grade) => grade === course.gradeLevel);

const sameName = (a?: string | null, b?: string | null) =>
  (a ?? '').trim().toLocaleLowerCase('vi') === (b ?? '').trim().toLocaleLowerCase('vi');

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

  // 1b. A class can only be created under a signed, current teaching contract (enforced by the Backend too)
  const contractsQuery = useQuery({
    queryKey: ["teacher-contracts"],
    queryFn: teacherContractService.listMine,
    enabled: isVerified,
  });
  const nowMs = Date.now();
  const hasSignedContract = (contractsQuery.data ?? []).some(
    (contract) =>
      contract.status === 'ACTIVE' &&
      new Date(contract.effectiveFrom).getTime() <= nowMs &&
      new Date(contract.expiresAt).getTime() > nowMs
  );
  const contractAwaitingSignature = (contractsQuery.data ?? []).some((contract) => contract.status === 'PENDING_SIGNATURE');

  // 1c. Teaching authorizations granted by Admin (older accounts have no teaching profile, only these)
  const authorizationsQuery = useQuery({
    queryKey: ["teacher-subject-authorizations", "class-creation"],
    queryFn: () => teacherSubjectAuthorizationService.listAllMyAuthorizations(),
    enabled: isVerified,
  });

  // 2. ACTIVE courses of an offered grade, all loaded at once so both filters always know their options.
  const {
    data: coursesData,
    isPending: isCoursePagePending, // not isLoading: a query paused offline would render as an empty catalog
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
    enabled: isVerified && hasSignedContract,
    staleTime: 1000 * 60 * 2,
  });

  // Only what the teacher may teach (the Backend refuses the rest): the approved teaching profile's subjects and grades,
  // plus authorizations granted by Admin. A suspended (subject, grade) is never offered.
  // The list is only final once the authorizations are known too
  const isCoursesLoading = isCoursePagePending || authorizationsQuery.isPending;
  const teaching = verification?.teachingProfile;
  const authorizations = authorizationsQuery.data ?? [];
  const authFor = (course: Course, status: string) =>
    authorizations.some((a) => a.status === status && a.subjectId === course.subjectId && a.gradeLevel === course.gradeLevel);
  const isAllowed = (course: Course) =>
    isOffered(course) &&
    !authFor(course, 'SUSPENDED') &&
    (authFor(course, 'APPROVED') ||
      Boolean(
        teaching &&
          teaching.gradeLevels.some((grade) => grade === course.gradeLevel) &&
          teaching.subjects.some((name) => sameName(name, course.subjectName))
      ));

  const courses: Course[] = (coursesData?.items || []).filter(isAllowed);
  const allowedGrades = SUPPORTED_GRADE_LEVELS.filter((grade) => courses.some((course) => course.gradeLevel === grade));
  const profileGrades = teaching ? SUPPORTED_GRADE_LEVELS.filter((grade) => teaching.gradeLevels.includes(grade)) : [];
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
    matchedCourseInList || (fetchedSelectedCourse && isAllowed(fetchedSelectedCourse) ? fetchedSelectedCourse : undefined);

  const isCheckingSelectedCourse =
    Boolean(selectedCourseId) && !matchedCourseInList && (isCoursesLoading || isVerifyingSelectedCourse);

  const isInvalidSelectedCourse =
    Boolean(selectedCourseId) &&
    !matchedCourseInList &&
    !isCoursesLoading &&
    !isVerifyingSelectedCourse &&
    (isSelectedCourseError || !selectedCourse);

  // Form watches
  const plan = useClassPlan(form, scheduleList);
  const plannedSessions = plan.sessions;
  const lastSession = plan.last;

  // Mutation
  const createClassMutation = useMutation({
    mutationFn: (payload: CreateClassPayload) => classService.createClass(payload),
    onSuccess: (created) => {
      message.success("Đã lưu bản nháp lớp học. Bạn có thể hoàn thiện rồi gửi duyệt.");
      const notice = sessionPlanNotice(created.sessionPlan);
      if (notice) message[notice.type](notice.text, notice.type === 'warning' ? 8 : 4);
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
          ? "Khóa học đã chọn không còn hoạt động hoặc ngoài môn và cấp học trong hồ sơ của bạn. Vui lòng chọn khóa học khác."
          : "Vui lòng chọn một khóa học chuẩn."
      );
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
      } catch {
        message.error("Vui lòng kiểm tra lại các thông tin được đánh dấu.");
        return;
      }
      const blocker = planBlocker(scheduleList, plan);
      if (blocker) {
        message.error(blocker);
        return;
      }
      setCurrentStep(2);
    }
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  };

  const buildPayload = (): CreateClassPayload => {
    const fields = classFormPayload(form, scheduleList, plan);
    return {
      ...fields,
      courseId: selectedCourseId!,
      classType: form.getFieldValue('classType') || 'PAID',
      schedule: fields.schedule.length ? fields.schedule : undefined,
    };
  };

  // Saves from any step: only what was typed has to be valid, the rest can be completed on the class page
  const handleSaveDraft = async () => {
    if (isSavingRef.current || !ensureCourseSelected()) return;
    const blocker = planBlocker(scheduleList, plan);
    if (blocker) {
      setCurrentStep(1);
      message.error(blocker);
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
        {teaching ? (
          <div className="bg-emerald-50 text-emerald-800 px-4 py-3 rounded-xl mb-6 flex items-start gap-3 border border-emerald-100">
            <CheckCircleOutlined className="mt-1 text-emerald-600 text-base" />
            <div>
              <div className="font-semibold">Khóa học theo hồ sơ giảng dạy của bạn</div>
              <div className="text-sm leading-6">
                Môn: {teaching.subjects.join(', ')} · Cấp học: {profileGrades.map((grade) => GRADE_LEVEL_LABELS[grade]).join(', ')}.
                Quyền giảng dạy được cấp tự động theo hồ sơ đã duyệt.
              </div>
            </div>
          </div>
        ) : (
          <Alert
            type="warning"
            showIcon
            className="mb-6 rounded-xl"
            title="Hồ sơ chưa khai báo môn và cấp học nhận dạy"
            description={
              <>
                Bạn chỉ tạo được lớp cho môn và cấp học đã được Admin cấp quyền giảng dạy. Gửi yêu cầu cấp quyền ở{' '}
                <Link to={ROUTES.TEACHER.PROFILE}>Hồ sơ giáo viên</Link>.
              </>
            }
          />
        )}

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
           
            className="w-full"
            allowClear
            value={gradeFilter}
            onChange={changeGradeFilter}
            options={allowedGrades.map((grade) => ({ value: grade, label: GRADE_LEVEL_LABELS[grade] }))}
          />
          <Select<string>
            aria-label="Lọc theo môn học"
            placeholder="Tất cả môn học"
           
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
              {courses.length === 0
                ? 'Chưa có khóa học nào thuộc môn và cấp học bạn được quyền giảng dạy. Bạn có thể '
                : 'Chưa có khóa học nào phù hợp. Hãy đổi bộ lọc hoặc '}
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
                      ? 'border-teal-600 bg-teal-50/50 shadow-xs' 
                      : 'border-gray-200 hover:border-teal-300 bg-white'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 pr-4">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        {course.gradeLevel && (
                          <span className="text-xs font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded">
                            {GRADE_LEVEL_LABELS[course.gradeLevel]}
                          </span>
                        )}
                        {course.subjectName && (
                          <span className="text-sm text-slate-500">{course.subjectName}</span>
                        )}
                      </div>
                      <div className="text-base font-semibold leading-snug text-slate-900 mb-1">{course.title}</div>
                      {course.description && (
                        <div className="text-sm leading-relaxed text-slate-500 line-clamp-2">{course.description}</div>
                      )}
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      isSelected ? 'border-teal-600 bg-teal-600 text-white' : 'border-gray-300'
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
        <Card className="rounded-2xl border border-teal-100 shadow-sm sticky top-6 overflow-hidden" bodyStyle={{ padding: 0 }}>
          <div className="bg-teal-50/60 p-4 border-b border-teal-100 flex justify-between items-center">
            <span className="font-semibold text-teal-900">Khóa học đã chọn</span>
          </div>
          <div className="p-5">
            <div className="w-full h-[150px] bg-slate-100 rounded-xl mb-4 relative overflow-hidden flex items-center justify-center">
              <BookOutlined className="text-4xl text-teal-300" />
            </div>
            <Title level={5} className="!m-0 !mb-2 !font-semibold">
              {selectedCourse ? selectedCourse.title : 'Chưa chọn khóa học'}
            </Title>
            <Divider className="my-3" />
            <div className="flex flex-col gap-2.5 text-sm text-gray-600">
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
            </div>
          </div>
        </Card>
      </div>
    </div>
  );

  // ---------------- Render Step 1: Cấu hình & lịch học ----------------
  const renderStep1 = () => (
    <div className="mt-6 max-w-[800px] mx-auto">
      <ClassConfigForm form={form} schedule={scheduleList} onScheduleChange={setScheduleList} plan={plan} />
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
        <Title level={3} className="!text-lg !m-0 !mb-2 !font-bold">Xác nhận thông tin lớp học</Title>
        <Paragraph className="text-gray-500 max-w-[500px] mx-auto text-sm">
          Lớp học sẽ được khởi tạo ở trạng thái <strong>Bản nháp (DRAFT)</strong> trên hệ thống Edunity.
        </Paragraph>
        
        <Card className="rounded-2xl shadow-sm border-gray-100 text-left mt-6 bg-slate-50/60 p-6">
          <Row gutter={[24, 20]}>
            <Col span={12}>
              <div className="text-sm text-gray-500 mb-0.5">Tên lớp học</div>
              <div className="font-semibold text-gray-900 text-base">{values.className || '-'}</div>
            </Col>
            <Col span={12}>
              <div className="text-sm text-gray-500 mb-0.5">Khóa học chuẩn</div>
              <div className="font-semibold text-teal-700 text-base">{selectedCourse?.title || '-'}</div>
            </Col>
            <Col span={12}>
              <div className="text-sm text-gray-500 mb-0.5">Loại hình & Học phí</div>
              <div className="font-semibold text-gray-900">
                {values.classType === 'FREE' ? (
                  <Tag color="green">Miễn phí (FREE)</Tag>
                ) : (
                  <span className="text-teal-600 font-bold">{parsePrice(values.price).toLocaleString('vi-VN')} VNĐ/học viên</span>
                )}
              </div>
            </Col>
            <Col span={12}>
              <div className="text-sm text-gray-500 mb-0.5">Sĩ số tối đa</div>
              <div className="font-semibold text-gray-900">{values.capacity} học viên</div>
            </Col>
            <Col span={12}>
              <div className="text-sm text-gray-500 mb-0.5">Số buổi</div>
              <div className="font-semibold text-gray-900">{plannedSessions.length} buổi</div>
            </Col>
            <Col span={12}>
              <div className="text-sm text-gray-500 mb-0.5">Thời gian học</div>
              <div className="font-semibold text-gray-900">
                {lastSession ? `${plannedSessions[0].date.format('DD/MM/YYYY')} – ${lastSession.date.format('DD/MM/YYYY')}` : 'Chưa thiết lập'}
              </div>
            </Col>
            <Col span={24}>
              <div className="text-sm text-gray-500 mb-0.5">Lịch học hàng tuần ({scheduleList.length} ca)</div>
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
          description={`Khi lưu, hệ thống tự tạo ${plannedSessions.length || 'các'} buổi học như phần xem trước. Để gửi duyệt, lớp cần đủ thông tin, học phí hợp lệ và lịch học.`}
        />
      </div>
    );
  };

  const stepItems = [
    { title: 'Chọn khóa chuẩn', icon: <BookOutlined /> },
    { title: 'Cấu hình & lịch học', icon: <CalendarOutlined /> },
    { title: 'Xác nhận', icon: <CheckCircleOutlined /> },
  ];

  // ---------------- Fail-closed Verified Gate Blocking ----------------
  if (!isVerified) {
    return (
      <div className="site-container py-6 min-h-[500px] max-w-[800px] mx-auto">
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

  // ---------------- Signed contract gate ----------------
  if (!hasSignedContract) {
    return (
      <div className="site-container py-6 min-h-[500px] max-w-[800px] mx-auto">
        {contractsQuery.isPending ? (
          <div className="py-16 text-center"><Spin /></div>
        ) : contractsQuery.isError ? (
          <Alert
            type="error"
            showIcon
            title="Không tải được hợp đồng giảng dạy"
            description={getFriendlyErrorMessage(contractsQuery.error, 'Vui lòng thử lại.')}
            action={<Button size="small" icon={<ReloadOutlined />} onClick={() => contractsQuery.refetch()}>Thử lại</Button>}
          />
        ) : (
          <Card className="rounded-2xl border border-amber-200 bg-amber-50/40 text-center p-4">
            <FileProtectOutlined className="text-5xl text-amber-500" />
            <Title level={3} className="!text-lg !mt-4 !mb-2 !font-bold">Cần ký hợp đồng giảng dạy</Title>
            <Paragraph className="text-slate-600 max-w-[520px] mx-auto">
              {contractAwaitingSignature
                ? 'Hồ sơ của bạn đã được duyệt và Edunity đã gửi hợp đồng giảng dạy. Hãy ký hợp đồng để bắt đầu tạo lớp học.'
                : 'Bạn chưa có hợp đồng giảng dạy còn hiệu lực. Edunity sẽ gửi hợp đồng cho bạn; sau khi ký, bạn có thể tạo lớp học.'}
            </Paragraph>
            <Link to={ROUTES.TEACHER.PROFILE}>
              <Button type="primary" className="bg-teal-600 hover:bg-teal-700 rounded-xl font-semibold">
                {contractAwaitingSignature ? 'Đi đến ký hợp đồng' : 'Xem hợp đồng của tôi'}
              </Button>
            </Link>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      <div>
        <Title level={2} className="!text-2xl !m-0 !font-bold tracking-tight text-gray-900">Tạo lớp học mới</Title>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <Steps 
          current={currentStep} 
          items={stepItems} 
          className="max-w-[800px] mx-auto mb-8 font-medium"
        />

        <div className={currentStep === 0 ? "block" : "hidden"}>{renderStep0()}</div>
        <div className={currentStep === 1 ? "block" : "hidden"}>{renderStep1()}</div>
        <div className={currentStep === 2 ? "block" : "hidden"}>{renderStep3()}</div>
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
                className="h-[44px] px-8 rounded-xl bg-teal-600 hover:bg-teal-700 font-medium"
              >
                Tiếp tục
              </Button>
            </>
          ) : (
            <Button 
              type="primary" 
              onClick={handleSaveDraft}
              loading={createClassMutation.isPending}
              className="h-[44px] px-8 rounded-xl bg-teal-600 hover:bg-teal-700 font-medium"
            >
              Xác nhận & Lưu bản nháp
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
