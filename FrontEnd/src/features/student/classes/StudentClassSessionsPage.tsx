import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, Skeleton } from "antd";
import {
  UserOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  BookOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import { useAuthStore } from "../../../stores/auth.store";
import { enrollmentService } from "../../../services/enrollment.service";
import { classDiscoveryService } from "../../../services/classDiscovery.service";
import { ROUTES } from "../../../routes/routePaths";
import type { ClassDiscoveryItem, SessionEntity } from "../../../types/classDiscovery";
import SessionDetailModal, { type SessionWithNumber } from "./components/SessionDetailModal";

function formatSessionDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return isoString;
  }
}

function formatSessionTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  } catch {
    return "";
  }
}

function isDateToday(isoString: string): boolean {
  try {
    const d = new Date(isoString);
    const today = new Date();
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  } catch {
    return false;
  }
}

export default function StudentClassSessionsPage() {
  const { classId } = useParams<{ classId: string }>();
  const { user } = useAuthStore();

  const [selectedSession, setSelectedSession] = useState<SessionWithNumber | null>(null);

  // 1. Fetch authenticated student enrollments to verify access
  const { data: enrollments, isLoading: isLoadingEnrollments } = useQuery({
    queryKey: ["studentEnrollments", user?.userId],
    queryFn: () => (user?.userId ? enrollmentService.getEnrollmentsByStudent(user.userId) : []),
    enabled: Boolean(user?.userId),
  });

  // Check valid confirmed learning enrollment
  const hasAccess = useMemo(() => {
    if (!enrollments || !classId) return false;
    return enrollments.some(
      (e) =>
        e.classId === classId &&
        (e.enrollmentStatus === "CONFIRMED" || e.enrollmentStatus === "COMPLETED")
    );
  }, [enrollments, classId]);

  // 2. Fetch Class Details
  const {
    data: classItem,
    isLoading: isLoadingClass,
    isError: isClassError,
  } = useQuery<ClassDiscoveryItem | null>({
    queryKey: ["classDetail", classId],
    queryFn: () => (classId ? classDiscoveryService.fetchClassById(classId) : null),
    enabled: Boolean(classId),
  });

  // 3. Fetch Class Sessions
  const {
    data: rawSessions,
    isLoading: isLoadingSessions,
    isError: isSessionsError,
  } = useQuery<SessionEntity[]>({
    queryKey: ["classSessions", classId],
    queryFn: () => (classId ? classDiscoveryService.fetchSessionsByClassId(classId) : []),
    enabled: Boolean(classId),
  });

  // Sort Sessions chronologically by startDatetime ASC and derive sessionNumber
  const sortedSessions = useMemo<SessionWithNumber[]>(() => {
    if (!rawSessions || rawSessions.length === 0) return [];
    const sorted = [...rawSessions].sort(
      (a, b) => new Date(a.startDatetime).getTime() - new Date(b.startDatetime).getTime()
    );
    return sorted.map((s, idx) => ({
      ...s,
      sessionNumber: idx + 1,
    }));
  }, [rawSessions]);

  // Derive Progress: validSessions exclude CANCELLED
  const validSessions = useMemo(
    () => sortedSessions.filter((s) => s.status !== "CANCELLED"),
    [sortedSessions]
  );
  const completedCount = useMemo(
    () => validSessions.filter((s) => s.status === "COMPLETED").length,
    [validSessions]
  );
  const totalValidCount = validSessions.length;
  const progressPercent =
    totalValidCount > 0 ? Math.round((completedCount / totalValidCount) * 100) : 0;

  const isLoading = isLoadingEnrollments || isLoadingClass || isLoadingSessions;
  const isError = isClassError || isSessionsError;

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <Skeleton.Input active size="small" className="!w-48 !h-4" />
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-2xs">
          <Skeleton active paragraph={{ rows: 2 }} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-3"
            >
              <Skeleton.Button active shape="square" className="!w-12 !h-12 !rounded-xl" />
              <Skeleton active paragraph={{ rows: 2 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError || !classItem) {
    return (
      <div className="max-w-md mx-auto my-12 bg-white rounded-2xl border border-rose-200 p-8 text-center shadow-2xs">
        <p className="text-base font-bold text-rose-600 mb-1">Không tìm thấy thông tin lớp học</p>
        <p className="text-xs text-slate-500 mb-6">
          Không thể tải dữ liệu lớp học hoặc lớp học không tồn tại.
        </p>
        <Link to={ROUTES.STUDENT.HOME}>
          <Button type="primary" className="bg-indigo-600 hover:bg-indigo-700 rounded-xl text-xs font-semibold">
            Quay lại Lớp học của tôi
          </Button>
        </Link>
      </div>
    );
  }

  // Access validation: Student must have confirmed enrollment
  if (!hasAccess) {
    return (
      <div className="max-w-md mx-auto my-12 bg-white rounded-2xl border border-amber-200 p-8 text-center shadow-2xs">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3 text-xl">
          <BookOutlined />
        </div>
        <p className="text-base font-bold text-slate-900 mb-1">Chưa có quyền truy cập</p>
        <p className="text-xs text-slate-500 mb-6">
          Bạn chưa đăng ký hoặc chưa hoàn tất thanh toán cho lớp học này.
        </p>
        <Link to={ROUTES.STUDENT.HOME}>
          <Button type="primary" className="bg-indigo-600 hover:bg-indigo-700 rounded-xl text-xs font-semibold">
            Về trang Lớp học của tôi
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ================= 6. BREADCRUMB ================= */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link
          to={ROUTES.STUDENT.HOME}
          className="hover:text-indigo-600 font-medium transition-colors"
        >
          Học tập của tôi
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-slate-700 font-semibold truncate max-w-md">
          {classItem.className}
        </span>
      </div>

      {/* ================= 7. CLASS SUMMARY CARD ================= */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        {/* Left: Metadata */}
        <div className="flex-1 min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 block mb-1">
            {classItem.courseTitle}
          </span>

          <h1 className="text-xl sm:text-2xl font-black text-slate-900 leading-tight mb-2.5 truncate" title={classItem.className}>
            {classItem.className}
          </h1>

          <div className="flex flex-wrap items-center gap-y-1.5 gap-x-2.5 text-xs text-slate-600">
            <span className="flex items-center gap-1.5 font-medium text-slate-800">
              <UserOutlined className="text-slate-400 text-xs" />
              {classItem.teacherName}
            </span>

            <span className="text-slate-300">•</span>

            <span className="flex items-center gap-1.5 text-slate-600">
              <CalendarOutlined className="text-slate-400 text-xs" />
              {classItem.startDate} – {classItem.formattedEndDate || classItem.endDate || "20/12/2026"}
            </span>

            <span className="text-slate-300">•</span>

            <span className="flex items-center gap-1.5 text-slate-600">
              <ClockCircleOutlined className="text-slate-400 text-xs" />
              {classItem.scheduleDays || classItem.scheduleText}
              {classItem.scheduleTime ? ` • ${classItem.scheduleTime}` : ""}
            </span>
          </div>
        </div>

        {/* Right: 8. CLASS PROGRESS BOX */}
        <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 sm:w-64 shrink-0">
          <div className="text-xs font-semibold text-slate-500 mb-1">
            Tiến độ lớp học
          </div>
          <div className="text-sm font-bold text-slate-900">
            {totalValidCount > 0 ? (
              <>
                {completedCount}/{totalValidCount} buổi ({progressPercent}%)
              </>
            ) : (
              "0/0 buổi (0%)"
            )}
          </div>
          <div className="h-1.5 w-full bg-indigo-100 rounded-full overflow-hidden mt-2.5">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* ================= 9. SESSION SECTION HEADER ================= */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-slate-900">Các buổi học</h2>
          <span className="text-xs text-slate-400 font-medium">
            ({sortedSessions.length} buổi học)
          </span>
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 shadow-2xs">
          <span>✓</span>
          <span>
            {completedCount}/{totalValidCount} buổi đã hoàn thành
          </span>
        </div>
      </div>

      {/* ================= 10. SESSION GRID ================= */}
      {sortedSessions.length === 0 ? (
        /* 27. Empty Session State */
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-2xs max-w-md mx-auto my-8">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3 text-xl">
            <CalendarOutlined />
          </div>
          <p className="text-sm font-bold text-slate-900 mb-1">Chưa có buổi học nào</p>
          <p className="text-xs text-slate-500">
            Lịch học của lớp sẽ được cập nhật khi các buổi học được tạo.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {sortedSessions.map((session) => {
            const isCompleted = session.status === "COMPLETED";
            const isInProgress = session.status === "IN_PROGRESS";
            const isScheduled = session.status === "SCHEDULED";
            const isCancelled = session.status === "CANCELLED";

            const formattedDate = formatSessionDate(session.startDatetime);
            const startTime = formatSessionTime(session.startDatetime);
            const endTime = formatSessionTime(session.endDatetime);
            const isToday = isDateToday(session.startDatetime);

            return (
              <div
                key={session._id}
                onClick={() => setSelectedSession(session)}
                className={`bg-white rounded-2xl border p-4 shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between group ${
                  isInProgress
                    ? "border-indigo-300 bg-indigo-50/15"
                    : isCompleted
                    ? "border-slate-200/80 hover:border-emerald-300"
                    : isCancelled
                    ? "border-slate-200/70 opacity-80"
                    : "border-slate-200/80 hover:border-indigo-200"
                }`}
              >
                <div>
                  {/* Top Row: Number box + Status badge */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    {/* 12. Session Number Box */}
                    <div
                      className={`w-11 h-11 rounded-xl font-extrabold text-base flex items-center justify-center shrink-0 ${
                        isCompleted
                          ? "bg-emerald-50 border border-emerald-200/80 text-emerald-600"
                          : isInProgress
                          ? "bg-indigo-600 text-white shadow-xs"
                          : isCancelled
                          ? "bg-rose-50 border border-rose-200/80 text-rose-500"
                          : "bg-indigo-50 border border-indigo-100 text-indigo-600"
                      }`}
                    >
                      {session.sessionNumber}
                    </div>

                    {/* Status Badge */}
                    <div>
                      {isCompleted && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-md">
                          <span>✓</span>
                          <span>HOÀN THÀNH</span>
                        </span>
                      )}

                      {isInProgress && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200/60 px-2 py-0.5 rounded-md shadow-2xs">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-600 animate-pulse" />
                          <span>ĐANG DIỄN RA</span>
                        </span>
                      )}

                      {isScheduled && (
                        <span className="inline-flex items-center text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md">
                          SẮP DIỄN RA
                        </span>
                      )}

                      {isCancelled && (
                        <span className="inline-flex items-center text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200/60 px-2 py-0.5 rounded-md">
                          ĐÃ HỦY
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 11 & 13-16. Buổi X (DO NOT SHOW session.title ON CARD) */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-slate-800">
                      Buổi {session.sessionNumber}
                    </span>
                    {isInProgress && (
                      <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-rose-600 text-white tracking-wider">
                        LIVE
                      </span>
                    )}
                  </div>

                  {/* Date & Time */}
                  <div className="text-xs text-slate-500 font-medium">
                    {isInProgress && isToday ? "Hôm nay" : formattedDate}
                    {startTime && endTime ? ` • ${startTime}–${endTime}` : ""}
                  </div>
                </div>

                {/* 17. Detail Action */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-indigo-600 group-hover:text-indigo-700 transition-colors">
                  <span>Chi tiết buổi học</span>
                  <ArrowRightOutlined className="text-[11px] group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ================= 18. SESSION DETAIL MODAL ================= */}
      <SessionDetailModal
        open={Boolean(selectedSession)}
        session={selectedSession}
        onClose={() => setSelectedSession(null)}
      />
    </div>
  );
}
