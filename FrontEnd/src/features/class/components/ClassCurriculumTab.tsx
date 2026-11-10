import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Skeleton, Tag } from "antd";
import {
  AimOutlined,
  CalendarOutlined,
  FieldTimeOutlined,
  OrderedListOutlined,
  ReadOutlined,
  SnippetsOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { courseService } from "../../../services/course.service";
import { COURSE_LEVEL_LABELS, GRADE_LEVEL_LABELS } from "../../../types/catalog";
import { formatScheduleEntries } from "../../../api/classAdapters";
import type { ClassDiscoveryItem } from "../../../types/classDiscovery";

interface ClassCurriculumTabProps {
  item: ClassDiscoveryItem;
  /** Number of sessions actually planned for this class (from GET /classes/:id/sessions) */
  sessionCount: number;
  isSessionsLoading?: boolean;
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 m-0">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

function SummaryItem({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50/80 border border-slate-100">
      <div className="w-8 h-8 rounded-lg bg-white border border-slate-200/70 text-indigo-600 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
        <div className="text-sm font-semibold text-slate-800 mt-0.5">{children}</div>
      </div>
    </div>
  );
}

export default function ClassCurriculumTab({ item, sessionCount, isSessionsLoading }: ClassCurriculumTabProps) {
  const {
    data: course,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    // Same key as CourseDetailPage so both pages share the cached course
    queryKey: ["public-course", item.courseId],
    queryFn: () => courseService.getCourse(item.courseId),
    enabled: Boolean(item.courseId),
    staleTime: 60_000,
    retry: false,
  });

  const scheduleLines = formatScheduleEntries(item.schedule);
  const period =
    item.formattedEndDate ? `${item.startDate} – ${item.formattedEndDate}` : `Khai giảng ${item.startDate}`;

  const hasCourseContent = Boolean(
    course && (course.learningObjectives || course.syllabus || course.prerequisites)
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <h2 className="text-base font-bold text-slate-900 m-0">Lộ trình & Mục tiêu</h2>
        {course && (
          <div className="flex flex-wrap items-center gap-1.5">
            {course.level && (
              <Tag color="blue" className="!m-0 rounded-md">
                {COURSE_LEVEL_LABELS[course.level]}
              </Tag>
            )}
            {course.gradeLevel && (
              <Tag color="orange" className="!m-0 rounded-md">
                {GRADE_LEVEL_LABELS[course.gradeLevel]}
              </Tag>
            )}
          </div>
        )}
      </div>

      {/* Class-specific summary: sessions, period, weekly schedule */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryItem icon={<OrderedListOutlined />} label="Số buổi">
          {isSessionsLoading ? "…" : sessionCount > 0 ? `${sessionCount} buổi` : "Đang cập nhật"}
        </SummaryItem>
        <SummaryItem icon={<CalendarOutlined />} label="Thời gian">
          {period}
        </SummaryItem>
        <SummaryItem icon={<FieldTimeOutlined />} label="Lịch học hằng tuần">
          {scheduleLines.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {scheduleLines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
          ) : (
            "Đang cập nhật"
          )}
        </SummaryItem>
      </div>

      {/* Course curriculum (shared by every class of the course) */}
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 5 }} />
      ) : isError || !course ? (
        <Alert
          type="warning"
          showIcon
          title="Chưa tải được lộ trình của khóa học"
          description="Thông tin lộ trình và mục tiêu đang tạm thời không khả dụng."
          action={
            <Button size="small" onClick={() => refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : (
        <>
          <div className="text-xs text-slate-500">
            Lớp học thuộc khóa{" "}
            <Link to={`/courses/${course.id}`} className="font-semibold text-indigo-600 hover:text-indigo-700">
              {course.title}
            </Link>
            . Lộ trình và mục tiêu dưới đây áp dụng theo khóa học.
          </div>

          {course.learningObjectives && (
            <Section icon={<AimOutlined className="text-emerald-500" />} title="Mục tiêu học tập">
              <p className="text-sm text-slate-600 leading-relaxed m-0 whitespace-pre-line">
                {course.learningObjectives}
              </p>
            </Section>
          )}

          {course.syllabus && (
            <Section icon={<SnippetsOutlined className="text-amber-500" />} title="Lộ trình / Đề cương">
              <p className="text-sm text-slate-600 leading-relaxed m-0 whitespace-pre-line">{course.syllabus}</p>
            </Section>
          )}

          {course.prerequisites && (
            <Section icon={<UnorderedListOutlined className="text-rose-500" />} title="Yêu cầu tiên quyết">
              <p className="text-sm text-slate-600 leading-relaxed m-0 whitespace-pre-line">
                {course.prerequisites}
              </p>
            </Section>
          )}

          {!hasCourseContent && (
            <div className="py-6 text-center text-sm text-slate-400 flex flex-col items-center gap-2">
              <ReadOutlined className="text-2xl text-slate-300" />
              Khóa học chưa cập nhật lộ trình và mục tiêu học tập.
            </div>
          )}
        </>
      )}
    </div>
  );
}
