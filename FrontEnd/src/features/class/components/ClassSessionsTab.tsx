import { Skeleton } from "antd";
import type { SessionEntity } from "../../../types/classDiscovery";

interface ClassSessionsTabProps {
  sessions: SessionEntity[];
  isLoading?: boolean;
}

export default function ClassSessionsTab({ sessions, isLoading }: ClassSessionsTabProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  const sessionCount = sessions.length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col gap-4">
      {/* Tab Header with Derived Total Count */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <h2 className="text-base font-bold text-slate-900 m-0">Nội dung lớp học</h2>
        <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
          {sessionCount} buổi
        </span>
      </div>

      {/* Sessions List */}
      {sessionCount === 0 ? (
        <div className="py-8 text-center text-sm text-slate-400">
          Chưa có danh sách buổi học cụ thể cho lớp này.
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-slate-100/90">
          {sessions.map((session, index) => {
            const sessionNum = String(index + 1).padStart(2, "0");

            return (
              <div
                key={session._id || session.title + index}
                className="py-3 px-3 rounded-xl hover:bg-slate-50/80 transition-colors flex items-center gap-3.5 group"
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-50/80 border border-indigo-100/80 text-indigo-600 font-bold text-xs flex items-center justify-center font-mono shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  {sessionNum}
                </div>
                <div className="text-sm font-medium text-slate-800 leading-normal">
                  {session.title}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
