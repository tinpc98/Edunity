import { Alert, Tag } from "antd";
import {
  CalendarOutlined,
  FieldTimeOutlined,
  OrderedListOutlined,
} from "@ant-design/icons";
import { GRADE_LEVEL_LABELS } from "../../../types/catalog";
import { formatScheduleEntries } from "../../../api/classAdapters";
import type { ClassDiscoveryItem } from "../../../types/classDiscovery";

interface ClassCurriculumTabProps {
  item: ClassDiscoveryItem;
  /** Number of sessions actually planned for this class (from GET /classes/:id/sessions) */
  sessionCount: number;
  isSessionsLoading?: boolean;
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
  const scheduleLines = formatScheduleEntries(item.schedule);
  const period =
    item.formattedEndDate ? `${item.startDate} – ${item.formattedEndDate}` : `Khai giảng ${item.startDate}`;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <h2 className="text-base font-bold text-slate-900 m-0">Lộ trình & Mục tiêu</h2>
        {item.gradeLevel && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag color="orange" className="!m-0 rounded-md">
              {GRADE_LEVEL_LABELS[item.gradeLevel]}
            </Tag>
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

      <Alert
        type="info"
        showIcon
        title="Nội dung syllabus của lớp chưa khả dụng"
        description={
          item.syllabusVersionNumber != null
            ? `Lớp được gắn với syllabus v${item.syllabusVersionNumber}, nhưng Backend chưa cung cấp API lấy snapshot theo Class. Không hiển thị syllabus hiện tại của Course thay thế.`
            : "Backend chưa cung cấp snapshot syllabus theo Class; không thể xác định an toàn nội dung đã gắn với lớp."
        }
      />
    </div>
  );
}
