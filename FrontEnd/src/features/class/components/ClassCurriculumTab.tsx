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
import { courseSyllabusService } from "../../../services/courseSyllabus.service";
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
  const syllabusQuery = useQuery({
    queryKey: ["public-course-syllabus", item.courseId],
    queryFn: () => courseSyllabusService.getPublishedSyllabus(item.courseId),
    enabled: Boolean(item.courseId),
    staleTime: 60_000,
    retry: false,
  });

  const scheduleLines = formatScheduleEntries(item.schedule);
  const period =
    item.formattedEndDate ? `${item.startDate} – ${item.formattedEndDate}` : `Khai giảng ${item.startDate}`;

  const syllabus = syllabusQuery.data;
  const classSyllabusMismatch =
    item.syllabusVersionNumber != null &&
    syllabus != null &&
    syllabus.version?.versionNumber !== item.syllabusVersionNumber;
  const hasCourseContent = Boolean(
    course?.learningObjectives ||
      course?.prerequisites ||
      syllabus?.legacySyllabus ||
      syllabus?.units.length
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
      {isLoading && syllabusQuery.isLoading ? (
        <Skeleton active paragraph={{ rows: 5 }} />
      ) : (
        <>
          {(isError || !course) && (
            <Alert
              type="warning"
              showIcon
              title="Thông tin khóa học chưa khả dụng"
              description={
                item.syllabusVersionNumber
                  ? `Lớp được tạo với syllabus v${item.syllabusVersionNumber}, nhưng Backend chưa cung cấp endpoint công khai tra cứu chính xác phiên bản đã gắn với lớp.`
                  : "Backend không trả chi tiết khóa học để hiển thị thêm mục tiêu và yêu cầu tiên quyết."
              }
              action={<Button size="small" onClick={() => refetch()}>Thử lại</Button>}
            />
          )}

          {course && (
            <div className="text-xs text-slate-500">
              Lớp học thuộc khóa{" "}
              <Link to={`/courses/${course.id}`} className="font-semibold text-indigo-600 hover:text-indigo-700">
                {course.title}
              </Link>
              . Đề cương chỉ hiển thị khi khớp phiên bản syllabus được gắn với lớp.
            </div>
          )}

          {course?.learningObjectives && (
            <Section icon={<AimOutlined className="text-emerald-500" />} title="Mục tiêu học tập">
              <p className="text-sm text-slate-600 leading-relaxed m-0 whitespace-pre-line">
                {course.learningObjectives}
              </p>
            </Section>
          )}

          {syllabusQuery.isLoading ? (
            <Skeleton active paragraph={{ rows: 3 }} />
          ) : syllabusQuery.isError ? (
            <Alert
              type="warning"
              showIcon
              title="Chưa tải được phiên bản giáo trình công khai"
              description="Khóa học có thể đã ngừng hoạt động; Backend hiện chỉ phục vụ syllabus công khai cho khóa ACTIVE."
              action={<Button size="small" onClick={() => syllabusQuery.refetch()}>Thử lại</Button>}
            />
          ) : classSyllabusMismatch ? (
            <Alert
              type="warning"
              showIcon
              title="Phiên bản syllabus của lớp chưa truy xuất được"
              description={`Lớp được tạo với syllabus v${item.syllabusVersionNumber}, nhưng endpoint công khai trả phiên bản hiện tại${syllabus?.version ? ` v${syllabus.version.versionNumber}` : " dạng legacy"}. Không hiển thị nội dung khác phiên bản như thể đó là syllabus của lớp.`}
            />
          ) : syllabus?.source === "VERSIONED" ? (
            <Section
              icon={<SnippetsOutlined className="text-amber-500" />}
              title={`Lộ trình / Đề cương${syllabus.version ? ` · v${syllabus.version.versionNumber}` : ""}`}
            >
              {syllabus.units.length ? (
                <ol className="m-0 list-decimal space-y-3 pl-5">
                  {syllabus.units.map((unit) => (
                    <li key={unit.id} className="pl-1 text-sm text-slate-700">
                      <div className="font-semibold">{unit.title}</div>
                      {unit.description && <p className="mb-1 mt-1 text-slate-600">{unit.description}</p>}
                      {unit.learningObjectives && (
                        <p className="mb-1 mt-1 text-slate-600">Mục tiêu: {unit.learningObjectives}</p>
                      )}
                      {unit.topics.length > 0 && (
                        <p className="mb-0 mt-1 text-slate-500">Chủ đề: {unit.topics.join(" · ")}</p>
                      )}
                      {unit.durationMinutes != null && (
                        <span className="text-xs text-slate-500">{unit.durationMinutes} phút</span>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="m-0 whitespace-pre-line text-sm text-slate-600">
                  {syllabus.legacySyllabus || "Phiên bản công bố chưa có nội dung bài học."}
                </p>
              )}
            </Section>
          ) : syllabus?.legacySyllabus ? (
            <Section icon={<SnippetsOutlined className="text-amber-500" />} title="Lộ trình / Đề cương">
              <p className="text-sm text-slate-600 leading-relaxed m-0 whitespace-pre-line">
                {syllabus.legacySyllabus}
              </p>
            </Section>
          ) : null}

          {course?.prerequisites && (
            <Section icon={<UnorderedListOutlined className="text-rose-500" />} title="Yêu cầu tiên quyết">
              <p className="text-sm text-slate-600 leading-relaxed m-0 whitespace-pre-line">
                {course.prerequisites}
              </p>
            </Section>
          )}

          {!hasCourseContent && !syllabusQuery.isLoading && !syllabusQuery.isError && (
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
