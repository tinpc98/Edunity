import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Skeleton, App as AntdApp } from "antd";
import {
  LeftOutlined,
  RightOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import { useAuthStore } from "../../../stores/auth.store";
import { enrollmentService } from "../../../services/enrollment.service";
import { classDiscoveryService } from "../../../services/classDiscovery.service";
import { ROUTES } from "../../../routes/routePaths";
import type { ClassDiscoveryItem, SessionEntity } from "../../../types/classDiscovery";

export interface ScheduleSessionItem {
  session: SessionEntity;
  classItem: ClassDiscoveryItem;
  sessionNumber: number;
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

function formatTime(isoString: string) {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "";
  }
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
  const { notification } = AntdApp.useApp();

  const [viewMode, setViewMode] = useState<ViewMode>("WEEK");
  const [baseDate, setBaseDate] = useState<Date>(new Date());

  const { data: enrollments, isLoading: isLoadingEnrollments } = useQuery({
    queryKey: ["studentEnrollments", user?.userId],
    queryFn: () => (user?.userId ? enrollmentService.getEnrollmentsByStudent(user.userId) : []),
    enabled: Boolean(user?.userId),
  });

  const confirmedEnrollments = (enrollments || []).filter(
    (e) => e.enrollmentStatus === "CONFIRMED" || e.enrollmentStatus === "COMPLETED"
  );

  const { data: allSessions, isLoading: isLoadingSessions } = useQuery<ScheduleSessionItem[]>({
    queryKey: [
      "studentAllSessions",
      user?.userId,
      confirmedEnrollments.map((e) => e.id).join(","),
    ],
    queryFn: async () => {
      const results = await Promise.all(
        confirmedEnrollments.map(async (enr) => {
          const [classItem, sessions] = await Promise.all([
            classDiscoveryService.fetchClassById(enr.classId),
            classDiscoveryService.fetchSessionsByClassId(enr.classId),
          ]);
          if (!classItem) return [];

          const sorted = [...sessions].sort(
            (a, b) => new Date(a.startDatetime).getTime() - new Date(b.startDatetime).getTime()
          );

          return sorted.map((s, idx) => ({
            session: s,
            classItem,
            sessionNumber: idx + 1,
          }));
        })
      );
      return results.flat();
    },
    enabled: Boolean(user?.userId) && confirmedEnrollments.length > 0,
  });

  const isLoading = isLoadingEnrollments || (confirmedEnrollments.length > 0 && isLoadingSessions);

  const { monday, sunday } = getWeekRange(baseDate);

  const filteredSessions = useMemo(() => {
    if (!allSessions) return [];

    return allSessions.filter((item) => {
      const d = new Date(item.session.startDatetime);
      if (viewMode === "TODAY") {
        const today = new Date();
        return (
          d.getDate() === today.getDate() &&
          d.getMonth() === today.getMonth() &&
          d.getFullYear() === today.getFullYear()
        );
      } else {
        return d >= monday && d <= sunday;
      }
    });
  }, [allSessions, viewMode, monday, sunday]);

  const groupedSessions = useMemo(() => {
    const sorted = [...filteredSessions].sort(
      (a, b) =>
        new Date(a.session.startDatetime).getTime() - new Date(b.session.startDatetime).getTime()
    );

    const groups: Record<string, ScheduleSessionItem[]> = {};
    for (const item of sorted) {
      const dateKey = formatDateKey(new Date(item.session.startDatetime));
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(item);
    }
    return groups;
  }, [filteredSessions]);

  const handlePrevWeek = () => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - 7);
    setBaseDate(d);
  };

  const handleNextWeek = () => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + 7);
    setBaseDate(d);
  };

  const handleSetToday = () => {
    setBaseDate(new Date());
    setViewMode("TODAY");
  };

  const handleSetWeek = () => {
    setBaseDate(new Date());
    setViewMode("WEEK");
  };

  const handleClassClick = (classId: string) => {
    navigate(`/student/classes/${classId}`);
  };

  const handleLiveClick = (e: React.MouseEvent, item: ScheduleSessionItem) => {
    e.stopPropagation();
    if (!item.session.meetingRoomId) {
      notification.warning({
        message: "Phòng học trực tuyến",
        description: "Phòng học hiện chưa sẵn sàng.",
        placement: "topRight",
      });
      return;
    }
    notification.info({
      message: "Vào phòng học LIVE",
      description: `Đang kết nối vào phòng học trực tiếp "${item.session.title}". Tính năng phòng học Live Classroom đang được hoàn thiện.`,
      placement: "topRight",
    });
  };

  return (
    <div className="w-full max-w-[1000px] mx-auto space-y-5">
      {/* 1. STABLE PAGE HEADER */}
      <div className="space-y-1">
        <div className="text-[12px] font-medium text-slate-400">
          <Link to={ROUTES.STUDENT.HOME} className="hover:text-indigo-600 transition-colors">Học tập</Link>
          <span className="mx-1">/</span>
          <span className="text-indigo-600">Lịch học</span>
        </div>
        <h1 className="text-[26px] font-bold text-slate-800 leading-tight">Lịch học</h1>
        <p className="text-[14px] text-slate-500">Theo dõi các buổi học sắp tới của bạn</p>
      </div>

      {/* 2. STABLE TOOLBAR */}
      <div className="flex items-center justify-between w-full pb-4 border-b border-slate-200/70">
        <div className="flex items-center p-1 bg-slate-100/80 rounded-xl border border-slate-200 shrink-0">
            <button
              onClick={handleSetToday}
              className={`px-4 h-[34px] rounded-lg text-[13px] transition-all cursor-pointer ${
                viewMode === "TODAY"
                  ? "bg-indigo-50 text-indigo-600 shadow-sm font-semibold border border-indigo-100/50"
                  : "text-slate-500 hover:text-slate-700 font-medium bg-transparent border border-transparent"
              }`}
            >
              Hôm nay
            </button>
            <button
              onClick={handleSetWeek}
              className={`px-4 h-[34px] rounded-lg text-[13px] transition-all cursor-pointer ${
                viewMode === "WEEK"
                  ? "bg-indigo-50 text-indigo-600 shadow-sm font-semibold border border-indigo-100/50"
                  : "text-slate-500 hover:text-slate-700 font-medium bg-transparent border border-transparent"
              }`}
            >
              Tuần này
            </button>
          </div>

        {/* WEEK CONTROLS (Always mounted to preserve layout width) */}
        <div className={`flex items-center gap-3 transition-opacity duration-200 ${viewMode === "TODAY" ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
          <div className="flex items-center bg-white border border-slate-200 rounded-xl h-[42px] overflow-hidden shadow-2xs w-[290px] sm:w-[310px]">
            <button
              onClick={handlePrevWeek}
              className="w-[44px] sm:w-[46px] h-full flex items-center justify-center text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 border-r border-slate-200 transition-colors cursor-pointer shrink-0"
            >
              <LeftOutlined className="text-[12px]" />
            </button>
            <div className="flex-1 px-2 text-[12.5px] font-semibold text-slate-700 text-center whitespace-nowrap leading-none">
              {formatWeekDisplay(monday, sunday)}
            </div>
            <button
              onClick={handleNextWeek}
              className="w-[44px] sm:w-[46px] h-full flex items-center justify-center text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 border-l border-slate-200 transition-colors cursor-pointer shrink-0"
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
          <p className="text-[13px] text-slate-500">
            Bạn chưa có buổi học nào trong khoảng thời gian này.
          </p>
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
                {items.map(({ session, classItem, sessionNumber }) => {
                  const isInProgress = session.status === "IN_PROGRESS";
                  const isCompleted = session.status === "COMPLETED";
                  const isScheduled = session.status === "SCHEDULED";
                  const isCancelled = session.status === "CANCELLED";

                  return (
                    <div
                      key={session._id}
                      onClick={() => handleClassClick(classItem.id)}
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
                        isInProgress ? "bg-indigo-100" :
                        "bg-indigo-50"
                      }`}>
                        <div className={`text-[15px] font-bold leading-none ${
                          isCompleted ? "text-[#047857]" :
                          isCancelled ? "text-[#BE123C]" :
                          isInProgress ? "text-[#4338CA]" :
                          "text-[#4F46E5]"
                        }`}>
                          {formatTime(session.startDatetime)}
                        </div>
                        <div className={`text-[11.5px] font-medium leading-none mt-1 ${
                          isInProgress ? "text-[#6366F1]" :
                          isCancelled ? "text-[#94A3B8]" :
                          "text-[#64748B]"
                        }`}>
                          {formatTime(session.endDatetime)}
                        </div>
                      </div>

                      {/* CENTER */}
                      <div className="flex flex-col justify-center pl-4 pr-3 min-w-0">
                        <div className="text-[14px] font-semibold text-slate-800 truncate group-hover:text-indigo-600 transition-colors">
                          {classItem.className}
                        </div>
                        <div className="text-[12px] font-medium text-slate-600 truncate mt-0.5">
                          Buổi {sessionNumber} <span className="mx-1 text-slate-300">•</span> {session.title}
                        </div>
                        <div className="text-[11px] font-medium text-slate-400 truncate mt-1">
                          GV. {classItem.teacherName}
                        </div>
                      </div>

                      {/* STATUS */}
                      <div className="flex flex-col items-end justify-center pl-2">
                        {isInProgress && (
                          <>
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200/60 mb-1.5">
                              <span className="text-[14px] leading-none mb-[1px]">•</span>
                              ĐANG DIỄN RA
                            </span>
                            <button
                              onClick={(e) => handleLiveClick(e, { session, classItem, sessionNumber })}
                              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                            >
                              Vào lớp học <span>&rarr;</span>
                            </button>
                          </>
                        )}

                        {isScheduled && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200/60">
                            SẮP DIỄN RA
                          </span>
                        )}

                        {isCompleted && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200/60">
                            <span>✓</span> ĐÃ HOÀN THÀNH
                          </span>
                        )}

                        {isCancelled && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider text-rose-600 bg-rose-50 border border-rose-200/60">
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
