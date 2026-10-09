import { useState, useEffect } from "react";
import { Button, Tag, Popconfirm, Tooltip } from "antd";

import {
  PoweroffOutlined,
  LogoutOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import type { ClassroomRole } from "../../../types/session";

interface ClassroomHeaderProps {
  sessionTitle: string;
  className?: string;
  role: ClassroomRole;
  participantCount: number;
  startDatetime?: string;
  onOpenAttendance?: () => void;
  onLeaveRoom: () => void;
  onEndSession?: () => void;
  isEndingSession?: boolean;
}

export default function ClassroomHeader({
  sessionTitle,
  className,
  role,
  participantCount,
  startDatetime,
  onOpenAttendance,
  onLeaveRoom,
  onEndSession,
  isEndingSession,
}: ClassroomHeaderProps) {
  const isTeacher = role === "HOST";

  // Real-time elapsed time calculation
  const [elapsedTime, setElapsedTime] = useState<string>("00:00");

  useEffect(() => {
    const startTime = startDatetime ? new Date(startDatetime).getTime() : Date.now();
    const updateTimer = () => {
      const now = Date.now();
      const diffSeconds = Math.max(0, Math.floor((now - startTime) / 1000));
      const hours = Math.floor(diffSeconds / 3600);
      const minutes = Math.floor((diffSeconds % 3600) / 60);
      const seconds = diffSeconds % 60;

      if (hours > 0) {
        setElapsedTime(
          `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
        );
      } else {
        setElapsedTime(
          `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
        );
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [startDatetime]);

  return (
    <header className="h-16 px-4 md:px-6 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 flex items-center justify-between text-white shrink-0 z-20">
      {/* Left: Session / Class info */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
          <VideoCameraOutlined className="text-lg" />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm md:text-base text-slate-100 truncate max-w-[200px] md:max-w-xs">
              {sessionTitle}
            </span>
            <Tag color="error" className="m-0 font-bold text-[10px] tracking-wider uppercase px-2 py-0 border-0 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              LIVE
            </Tag>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
            {className && <span className="truncate max-w-[150px]">{className}</span>}
            {className && <span>•</span>}
            <span className="flex items-center gap-1 font-mono text-slate-300">
              <ClockCircleOutlined className="text-[11px]" />
              {elapsedTime}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Participant Counter */}
        <Tooltip title="Số người đang trong phòng">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 rounded-xl border border-slate-700/60 text-xs font-semibold text-slate-300">
            <TeamOutlined className="text-indigo-400" />
            <span>{participantCount}</span>
          </div>
        </Tooltip>

        {/* Teacher-only: View Attendance button */}
        {isTeacher && onOpenAttendance && (
          <Button
            onClick={onOpenAttendance}
            icon={<TeamOutlined />}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 rounded-xl text-xs font-semibold"
          >
            <span className="hidden sm:inline">Điểm danh</span>
          </Button>
        )}

        {/* Leave Room action (Available to both Teacher and Student) */}
        <Button
          onClick={onLeaveRoom}
          icon={<LogoutOutlined />}
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 rounded-xl text-xs font-semibold"
        >
          <span className="hidden sm:inline">Rời phòng</span>
        </Button>

        {/* Teacher-only: End Session for Everyone */}
        {isTeacher && onEndSession && (
          <Popconfirm
            title="Kết thúc buổi học cho tất cả mọi người?"
            description="Buổi học sẽ chuyển sang trạng thái COMPLETED và chốt danh sách điểm danh. Hành động này không thể hoàn tác."
            onConfirm={onEndSession}
            okText="Kết thúc buổi học"
            cancelText="Hủy"
            okButtonProps={{ danger: true, loading: isEndingSession }}
          >
            <Button
              danger
              type="primary"
              icon={<PoweroffOutlined />}
              loading={isEndingSession}
              className="bg-rose-600 hover:bg-rose-700 rounded-xl text-xs font-semibold"
            >
              <span className="hidden sm:inline">Kết thúc buổi học</span>
              <span className="sm:hidden">Kết thúc</span>
            </Button>
          </Popconfirm>
        )}
      </div>
    </header>
  );
}
