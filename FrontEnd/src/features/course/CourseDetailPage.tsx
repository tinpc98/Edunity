import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Skeleton,
  Alert,
  Tag,
  Button,
  Breadcrumb,
  Divider,
} from "antd";
import {
  BookOutlined,
  ArrowLeftOutlined,
  TagsOutlined,
  SnippetsOutlined,
  UnorderedListOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { courseService } from "../../services/course.service";
import { classService, classKeys } from "../../services/class.service";
import { GRADE_LEVEL_LABELS, COURSE_LEVEL_LABELS } from "../../types/catalog";
import { ROUTES } from "../../routes/routePaths";

export default function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();

  const { data: course, isLoading, isError } = useQuery({
    queryKey: ["public-course", courseId],
    queryFn: () => courseService.getCourse(courseId!),
    enabled: !!courseId,
    staleTime: 60_000,
    retry: false,
  });

  const { data: courseClasses } = useQuery({
    queryKey: classKeys.courseClasses(courseId!),
    queryFn: () => classService.getCourseClasses(courseId!),
    enabled: !!courseId,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Skeleton active avatar paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (isError || !course) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Alert
          type="error"
          message="Không tìm thấy khóa học"
          description="Khóa học này không tồn tại hoặc đã bị gỡ khỏi hệ thống."
          showIcon
          action={
            <Button onClick={() => navigate(ROUTES.COURSES.LIST)}>Về danh sách</Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Band */}
      <div className="bg-gradient-to-br from-indigo-700 to-violet-700 text-white py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <Breadcrumb
            className="mb-4 text-indigo-300"
            items={[
              { title: <Link to={ROUTES.HOME} className="text-indigo-300 hover:text-white">Trang chủ</Link> },
              { title: <Link to={ROUTES.COURSES.LIST} className="text-indigo-300 hover:text-white">Khóa học</Link> },
              { title: <span className="text-white font-medium">{course.title}</span> },
            ]}
          />
          <p className="text-indigo-300 text-sm font-medium mb-2">
            {course.categoryName} › {course.subjectName}
          </p>
          <h1 className="text-3xl font-bold mb-4">{course.title}</h1>
          <div className="flex flex-wrap gap-2">
            {course.level && (
              <Tag color="blue" className="text-sm rounded-full">{COURSE_LEVEL_LABELS[course.level]}</Tag>
            )}
            {course.gradeLevel && (
              <Tag color="orange" className="text-sm rounded-full">{GRADE_LEVEL_LABELS[course.gradeLevel]}</Tag>
            )}
            {course.openClassCount !== undefined && (
              <span className="bg-white/20 text-white text-sm px-3 py-0.5 rounded-full font-medium">
                {course.openClassCount} lớp đang mở
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col lg:flex-row gap-6">
        {/* Main Info */}
        <div className="flex-1 space-y-6">

          {course.description && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-3">
                <BookOutlined className="text-indigo-500" /> Mô tả khóa học
              </h2>
              <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{course.description}</p>
            </div>
          )}

          {course.learningObjectives && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-3">
                <TagsOutlined className="text-emerald-500" /> Mục tiêu học tập
              </h2>
              <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{course.learningObjectives}</p>
            </div>
          )}

          {course.syllabus && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-3">
                <SnippetsOutlined className="text-amber-500" /> Đề cương khóa học
              </h2>
              <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{course.syllabus}</p>
            </div>
          )}

          {course.prerequisites && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-3">
                <UnorderedListOutlined className="text-rose-500" /> Yêu cầu tiên quyết
              </h2>
              <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{course.prerequisites}</p>
            </div>
          )}

          {!course.description && !course.learningObjectives && !course.syllabus && !course.prerequisites && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-gray-400 text-center">
              Chưa có thông tin chi tiết cho khóa học này.
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-full lg:w-64 shrink-0">
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm sticky top-4 space-y-4">
            <div>
              <p className="text-xs text-gray-400 font-semibold uppercase mb-1">Danh mục</p>
              <p className="font-semibold text-gray-800">{course.categoryName}</p>
            </div>
            <Divider className="my-2" />
            <div>
              <p className="text-xs text-gray-400 font-semibold uppercase mb-1">Môn học</p>
              <p className="font-semibold text-gray-800">{course.subjectName}</p>
            </div>
            {course.level && (
              <>
                <Divider className="my-2" />
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase mb-1">Cấp độ</p>
                  <Tag color="blue">{COURSE_LEVEL_LABELS[course.level]}</Tag>
                </div>
              </>
            )}
            {course.gradeLevel && (
              <>
                <Divider className="my-2" />
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase mb-1">Khối lớp</p>
                  <Tag color="orange">{GRADE_LEVEL_LABELS[course.gradeLevel]}</Tag>
                </div>
              </>
            )}
            {course.openClassCount !== undefined && (
              <>
                <Divider className="my-2" />
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase mb-1">Lớp đang mở</p>
                  <p className="text-2xl font-bold text-emerald-600">{course.openClassCount}</p>
                  {course.openClassCount > 0 && (
                    <Button 
                      type="primary" 
                      size="small" 
                      className="mt-2 w-full bg-indigo-600 hover:bg-indigo-700"
                      onClick={() => navigate(`/classes?courseId=${course.id}`)}
                    >
                      Xem tất cả lớp →
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Open Classes Section */}
      {courseClasses?.items && courseClasses.items.length > 0 && (
        <div className="max-w-4xl mx-auto px-4 pb-8">
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <TeamOutlined className="text-indigo-600" /> Các lớp học đang tuyển sinh ({courseClasses.items.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {courseClasses.items.map((cls) => (
                <div 
                  key={cls.id}
                  className="p-4 rounded-xl border border-gray-200 hover:border-indigo-300 transition-all bg-slate-50/50 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <span className="font-bold text-gray-900 text-sm">{cls.className}</span>
                      <Tag color={cls.classType === 'FREE' ? 'green' : 'indigo'} className="!m-0 text-xs">
                        {cls.formattedPrice}
                      </Tag>
                    </div>
                    <div className="text-xs text-gray-500 mb-2">
                      Giảng viên: <strong className="text-gray-700">{cls.teacherName}</strong>
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-gray-200/60 text-xs text-gray-500">
                    <span>Còn {cls.seatsLeft}/{cls.capacity} chỗ</span>
                    <Button 
                      type="link" 
                      size="small" 
                      className="p-0 font-semibold text-indigo-600"
                      onClick={() => navigate(`/classes/${cls.id}`)}
                    >
                      Xem lớp →
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Back button */}
      <div className="max-w-4xl mx-auto px-4 pb-10">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(ROUTES.COURSES.LIST)}>
          Quay lại danh sách
        </Button>
      </div>
    </div>
  );
}
