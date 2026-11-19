import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import "dayjs/locale/vi";
import {
  HourglassOutlined,
  SafetyCertificateOutlined,
  BookOutlined,
  DollarOutlined,
  QuestionCircleOutlined,
  FileDoneOutlined,
  ReloadOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import type { AdminDashboardPending } from "../../../../types/adminDashboard";

dayjs.locale("vi");

interface AdminWelcomeHeroProps {
  pending?: AdminDashboardPending;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export default function AdminWelcomeHero({
  pending,
  onRefresh,
  isRefreshing,
}: AdminWelcomeHeroProps) {
  const navigate = useNavigate();

  const totalTasks = pending
    ? pending.teacherVerifications +
      pending.scholarshipApplications +
      pending.classApprovals +
      pending.courseProposals +
      pending.reports +
      pending.refundsRequired
    : 0;

  const todayStr = dayjs().format("dddd, DD/MM/YYYY");
  const capitalizedToday = todayStr.charAt(0).toUpperCase() + todayStr.slice(1);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-white border border-[#D6E5E2] p-6 shadow-[0_2px_8px_rgba(15,118,110,0.04)] mb-6">
      {/* Mint Ambient Glow Circles */}
      <div className="absolute -right-16 -top-16 w-80 h-80 rounded-full bg-teal-100/30 blur-3xl pointer-events-none" />
      <div className="absolute right-32 -bottom-20 w-64 h-64 rounded-full bg-emerald-100/20 blur-2xl pointer-events-none" />

      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#CCFBF1] border border-[#99F6E4] text-[#0F766E] text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-[#0D9488] animate-pulse" />
            <span>Hệ thống vận hành ổn định 99.98%</span>
            <span className="text-teal-400">•</span>
            <span className="text-[#0F766E]">Edunity V3 Core</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#163B40] tracking-tight">
            Xin chào, Admin 👋
          </h1>

          <p className="text-sm text-[#334155] leading-relaxed">
            {totalTasks > 0 ? (
              <>
                Chào mừng trở lại với <span className="font-bold text-[#0F766E]">Trung tâm Điều hành Edunity V3</span>. Hiện có{" "}
                <span className="font-extrabold text-[#0D9488] underline decoration-teal-400 decoration-2 underline-offset-4">
                  {totalTasks} tác vụ cần xử lý
                </span>{" "}
                để đảm bảo chất lượng giảng dạy và tính minh bạch tài chính.
              </>
            ) : (
              <>
                Chào mừng trở lại với <span className="font-bold text-[#0F766E]">Trung tâm Điều hành Edunity V3</span>. Hệ thống đang vận hành hoàn toàn ổn định, không có tác vụ khẩn cấp tồn đọng.
              </>
            )}
          </p>

          {/* Quick task pills */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {pending && pending.teacherVerifications > 0 && (
              <button
                onClick={() => navigate("/admin/teachers/verifications")}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#FEF3C7] hover:bg-amber-100 text-[#B45309] border border-[#FDE68A] text-xs font-bold transition-all shadow-2xs"
              >
                <HourglassOutlined className="text-[#D97706]" />
                <span>{pending.teacherVerifications} giáo viên chờ duyệt</span>
              </button>
            )}

            {pending && pending.scholarshipApplications > 0 && (
              <button
                onClick={() => navigate("/admin/scholarship-applications")}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#EEF2FF] hover:bg-indigo-100 text-[#4338CA] border border-[#C7D2FE] text-xs font-bold transition-all shadow-2xs"
              >
                <SafetyCertificateOutlined className="text-[#6366F1]" />
                <span>{pending.scholarshipApplications} hồ sơ học bổng chờ duyệt</span>
              </button>
            )}

            {pending && pending.classApprovals > 0 && (
              <button
                onClick={() => navigate("/admin/classes")}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#CCFBF1] hover:bg-teal-100 text-[#0F766E] border border-[#99F6E4] text-xs font-bold transition-all shadow-2xs"
              >
                <BookOutlined className="text-[#0D9488]" />
                <span>{pending.classApprovals} lớp học chờ duyệt</span>
              </button>
            )}

            {pending && pending.courseProposals > 0 && (
              <button
                onClick={() => navigate("/admin/course-proposals")}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#F3E8FF] hover:bg-purple-100 text-[#7E22CE] border border-[#E9D5FF] text-xs font-bold transition-all shadow-2xs"
              >
                <FileDoneOutlined className="text-[#9333EA]" />
                <span>{pending.courseProposals} đề xuất khóa học</span>
              </button>
            )}

            {pending && pending.refundsRequired > 0 && (
              <button
                onClick={() => navigate("/admin/refunds")}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#FEE2E2] hover:bg-rose-100 text-[#DC2626] border border-[#FECACA] text-xs font-bold transition-all shadow-2xs"
              >
                <DollarOutlined className="text-[#EF4444]" />
                <span>{pending.refundsRequired} yêu cầu hoàn tiền</span>
              </button>
            )}

            {pending && pending.reports > 0 && (
              <button
                onClick={() => navigate("/admin/reports")}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#FFEDD5] hover:bg-orange-100 text-[#C2410C] border border-[#FED7AA] text-xs font-bold transition-all shadow-2xs"
              >
                <QuestionCircleOutlined className="text-[#EA580C]" />
                <span>{pending.reports} khiếu nại mới</span>
              </button>
            )}

            {totalTasks === 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#DCFCE7] text-[#15803D] border border-[#BBF7D0] text-xs font-bold">
                <CheckCircleOutlined className="text-[#16A34A]" />
                <span>Tất cả hàng đợi đã được giải quyết</span>
              </span>
            )}
          </div>
        </div>

        {/* Date Snapshot & Refresh Button */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-3 bg-[#F0F8F6] border border-[#D6E5E2] px-4 py-2.5 rounded-xl">
            <div className="w-10 h-10 rounded-lg bg-white text-[#0F766E] flex items-center justify-center text-lg shadow-2xs">
              <CalendarOutlined />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                Hôm nay
              </span>
              <span className="text-xs sm:text-sm font-bold text-[#163B40]">
                {capitalizedToday}
              </span>
            </div>
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0D9488] hover:bg-[#0B746C] text-white text-xs sm:text-sm font-semibold shadow-xs hover:shadow transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
            >
              <ReloadOutlined className={isRefreshing ? "animate-spin" : ""} />
              <span>Làm mới</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
