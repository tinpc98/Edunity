import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "antd";
import {
  LeftOutlined,
  RightOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import { useAuthStore } from "../../../stores/auth.store";
import { sessionService, sessionKeys } from "../../../services/session.service";
import { ROUTES } from "../../../routes/routePaths";
import type { Session } from "../../../types/session";

export interface StudentScheduleEntry {
  session: Session;
  sessionNumber?: number;
}

const weekdays = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

function getWeekRange(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { monday, sunday };
}

function formatDateKey(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatGroupDate(dateString: string) {
  const d = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const dTime = new Date(d);
  dTime.setHours(0, 0, 0, 0);

  const prefix =
    dTime.getTime() === today.getTime()
      ? "HÔM NAY · "
      : dTime.getTime() === tomorrow.getTime()
      ? "NGÀY MAI · "
      : "";
  const dayStr = String(d.getDate()).padStart(2, "0");
  const monthStr = String(d.getMonth() + 1).padStart(2, "0");
  return `${prefix}${weekdays[d.getDay()]}, ${dayStr}/${monthStr}`;
}

function formatWeekDisplay(monday: Date, sunday: Date) {
  const mDay = String(monday.getDate()).padStart(2, "0");
  const mMonth = String(monday.getMonth() + 1).padStart(2, "0");
  const sDay = String(sunday.getDate()).padStart(2, "0");
  const sMonth = String(sunday.getMonth() + 1).padStart(2, "0");
  const sYear = sunday.getFullYear();
  return `${mDay}/${mMonth} – ${sDay}/${sMonth}/${sYear}`;
}

type ViewMode = "TODAY" | "WEEK";

export default function StudentSchedulePage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [viewMode, setViewMode] = useState<ViewMode>("WEEK");
  const [baseDate, setBaseDate] = useState<Date>(new Date());

  const { monday, sunday } = getWeekRange(baseDate);

  // 1. Fetch real student sessions from backend endpoint GET /api/me/sessions
  const { data: mySessions = [], isLoading } = useQuery<Session[]>({
    queryKey: sessionKeys.studentMySessions(monday.toISOString(), sunday.toISOString()),
    queryFn: () => sessionService.getMySessions(monday.toISOString(), sunday.toISOString()),
    enabled: Boolean(user?.userId && user?.role === "STUDENT"),
  });

  const filteredSessions = useMemo(() => {
    return mySessions.filter((session) => {
      const d = new Date(session.startDatetime);
      if (viewMode === "TODAY") {
        const today = new Date();
        return (
          d.getDate() === today.getDate() &&
          d.getMonth() === today.getMonth() &&
          d.getFullYear() === today.getFullYear()
        );
      }
      return d >= monday && d <= sunday;
    });
  }, [mySessions, viewMode, monday, sunday]);

  // Group by date (YYYY-MM-DD)
  const groupedSessions = useMemo(() => {
    const groups: Record<string, Session[]> = {};
    const sorted = [...filteredSessions].sort(
      (a, b) => new Date(a.startDatetime).getTime() - new Date(b.startDatetime).getTime()
    );

    sorted.forEach((session) => {
      const d = new Date(session.startDatetime);
      const key = formatDateKey(d);
      if (!groups[key]) groups[key] = [];
      groups[key].push(session);
    });

    return groups;
  }, [filteredSessions]);

  const handlePrevWeek = () => {
    const prev = new Date(baseDate);
    prev.setDate(prev.getDate() - 7);
    setBaseDate(prev);
  };

  const handleNextWeek = () => {
    const next = new Date(baseDate);
    next.setDate(next.getDate() + 7);
    setBaseDate(next);
  };

  const handleCurrentWeek = () => {
    setBaseDate(new Date());
  };

  const handleClassClick = (classId: string) => {
    navigate(ROUTES.STUDENT.CLASS_SESSIONS.replace(":classId", classId));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* 1. TOP HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Lịch học của tôi
          </h1>
          <p className="text-xs sm:text-[13px] text-slate-500 mt-1">
            Theo dõi thời gian các ca học trực tuyến và tiến độ khóa học
          </p>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start sm:self-auto border border-slate-200/60">
          <button
            onClick={() => setViewMode("TODAY")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewMode === "TODAY"
                ? "bg-white text-indigo-600 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Hôm nay
          </button>
          <button
            onClick={() => setViewMode("WEEK")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewMode === "WEEK"
                ? "bg-white text-indigo-600 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Tuần này
          </button>
        </div>
      </div>

      {/* 2. WEEK CONTROLS */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleCurrentWeek}
            className="flex items-center gap-1.5 px-3.5 h-[42px] bg-slate-100 hover:bg-slate-200/80 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            <CalendarOutlined className="text-slate-500" />
            <span>Hiện tại</span>
          </button>
          <span className="text-sm sm:text-base font-bold text-slate-800">
            {formatWeekDisplay(monday, sunday)}
          </span>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={handlePrevWeek}
            className="hidden sm:flex items-center justify-center gap-1.5 px-4 h-[42px] bg-white border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 rounded-xl text-[12.5px] font-semibold shadow-2xs transition-all cursor-pointer"
          >
            <span className="text-[11px]">&larr;</span>
            <span>Tuần trước</span>
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevWeek}
              className="w-[42px] h-[42px] flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
            >
              <LeftOutlined className="text-[12px]" />
            </button>
            <button
              onClick={handleNextWeek}
              className="w-[42px] h-[42px] flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
            >
              <RightOutlined className="text-[12px]" />
            </button>
          </div>
          <button
            onClick={handleNextWeek}
            className="hidden sm:flex items-center justify-center gap-1.5 px-4 h-[42px] bg-white border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 rounded-xl text-[12.5px] font-semibold shadow-2xs transition-all cursor-pointer"
          >
            <span>Tuần tới</span>
            <span className="text-[11px]">&rarr;</span>
          </button>
        </div>
      </div>

      {/* 3. SCHEDULE SUMMARY */}
      <div className="text-[13px] font-medium text-slate-500">
        {filteredSessions.length} buổi học trong {viewMode === "TODAY" ? "hôm nay" : "tuần này"}
      </div>

      {isLoading ? (
        <div className="space-y-4 pt-2">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton.Button active size="small" className="!w-32 !h-5" />
              <div className="bg-white rounded-xl border border-slate-100 p-4 h-[76px] shadow-sm flex gap-4">
                <Skeleton.Button active className="!w-16 !h-full" />
                <Skeleton active paragraph={{ rows: 1 }} />
              </div>
            </div>
          ))}
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center shadow-sm w-full max-w-[520px] min-h-[180px] mx-auto my-8 flex flex-col items-center justify-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 text-xl">
            <CalendarOutlined />
          </div>
          <h2 className="text-[15px] font-bold text-slate-800 mb-1">Chưa có lịch học</h2>
          <p className="text-[13px] text-slate-500 max-w-sm mb-4">
            Bạn chưa có buổi học nào trong khoảng thời gian này. Hãy đăng ký tham gia các lớp học để xem lịch học trực tuyến.
          </p>
          <Link to={ROUTES.CLASSES}>
            <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs">
              Khám phá lớp học
            </button>
          </Link>
        </div>
      ) : (
        <div className="space-y-6 pt-2">
          {Object.entries(groupedSessions).map(([dateKey, items]) => (
            <div key={dateKey} className="space-y-2.5">
              <div className="text-[13px] font-semibold text-slate-700">
                {formatGroupDate(dateKey).includes("HÔM NAY") || formatGroupDate(dateKey).includes("NGÀY MAI") ? (
                  <>
                    <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                      {formatGroupDate(dateKey).split("·")[0]}
                    </span>
                    <span className="text-slate-300 mx-1.5">•</span>
                    <span>{formatGroupDate(dateKey).split("·")[1].trim()}</span>
                  </>
                ) : (
                  formatGroupDate(dateKey)
                )}
              </div>

              <div className="space-y-2">
                {items.map((session) => {
                  const isInProgress = session.status === "IN_PROGRESS";
                  const isCompleted = session.status === "COMPLETED";
                  const isScheduled = session.status === "SCHEDULED";
                  const isCancelled = session.status === "CANCELLED";

                  return (
                    <div
                      key={session.id}
                      onClick={() => handleClassClick(session.classId)}
                      className={`grid grid-cols-[76px_minmax(0,1fr)_auto] items-center bg-white rounded-xl border px-4 py-3 min-h-[76px] shadow-2xs hover:shadow-sm hover:border-indigo-200 transition-all cursor-pointer group w-full max-w-[1000px] ${
                        isInProgress
                          ? "border-indigo-300"
                          : isCancelled
                          ? "border-slate-100 opacity-80"
                          : "border-slate-200"
                      }`}
                    >
                      {/* TIME */}
                      <div className={`w-[76px] h-[58px] rounded-[10px] flex flex-col justify-center items-center shrink-0 ${
                        isCompleted ? "bg-emerald-50" :
                        isCancelled ? "bg-rose-50" :
                        isInProgress ? "bg-indigo-600 text-white" :
                        "bg-slate-50 text-slate-700"
                      }`}>
                        <span className={`text-[13px] font-bold tracking-tight leading-none ${
                          isInProgress ? "text-white" :
                          isCompleted ? "text-emerald-700" :
                          isCancelled ? "text-rose-600" :
                          "text-slate-800"
                        }`}>
                          {new Date(session.startDatetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className={`text-[10px] font-medium leading-none mt-1 ${
                          isInProgress ? "text-indigo-100" :
                          isCompleted ? "text-emerald-600/80" :
                          isCancelled ? "text-rose-500/80" :
                          "text-slate-400"
                        }`}>
                          {new Date(session.endDatetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {/* CONTENT */}
                      <div className="min-w-0 pr-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md truncate max-w-[200px]">
                            {session.className}
                          </span>
                        </div>
                        <h4 className="text-[13.5px] font-bold text-slate-900 truncate mt-1 group-hover:text-indigo-600 transition-colors">
                          {session.title}
                        </h4>
                      </div>

                      {/* BADGE */}
                      <div>
                        {isInProgress && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200/60 px-2 py-0.5 rounded-md">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-600 animate-pulse" />
                            <span>ĐANG DIỄN RA</span>
                          </span>
                        )}
                        {isCompleted && (
                          <span className="inline-flex items-center text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-md">
                            ĐÃ HOÀN THÀNH
                          </span>
                        )}
                        {isScheduled && (
                          <span className="inline-flex items-center text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md">
                            ĐÃ LÊN LỊCH
                          </span>
                        )}
                        {isCancelled && (
                          <span className="inline-flex items-center text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200/60 px-2 py-0.5 rounded-md">
                            ĐÃ HỦY
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
