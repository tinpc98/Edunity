import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, Skeleton, App as AntdApp } from "antd";
import {
  BookOutlined,
  CalendarOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useAuthStore } from "../../../stores/auth.store";
import { enrollmentService } from "../../../services/enrollment.service";
import { classDiscoveryService } from "../../../services/classDiscovery.service";
import { ROUTES } from "../../../routes/routePaths";
import type { ClassDiscoveryItem } from "../../../types/classDiscovery";

type FilterTab = "ALL" | "IN_PROGRESS" | "COMPLETED";

interface EnrolledClassItem {
  enrollmentId: string;
  classItem: ClassDiscoveryItem;
  totalSessions: number;
  completedSessions: number;
  progressPercent: number;
  learningStatus: "IN_PROGRESS" | "COMPLETED";
}

export default function StudentHomePage() {
  const { user } = useAuthStore();
  const { notification } = AntdApp.useApp();
  const [activeTab, setActiveTab] = useState<FilterTab>("ALL");

  // Query 1: Fetch enrollments for the authenticated student
  const {
    data: enrollments,
    isLoading: isLoadingEnrollments,
    isError: isEnrollmentError,
    refetch: refetchEnrollments,
  } = useQuery({
    queryKey: ["studentEnrollments", user?.userId],
    queryFn: () => (user?.userId ? enrollmentService.getEnrollmentsByStudent(user.userId) : []),
    enabled: Boolean(user?.userId),
  });

  // Source of Truth: Only CONFIRMED or COMPLETED enrollments grant learning access
  const confirmedEnrollments = (enrollments || []).filter(
    (e) => e.enrollmentStatus === "CONFIRMED" || e.enrollmentStatus === "COMPLETED"
  );

  // Query 2: Resolve Class entity and Session progress for each confirmed enrollment
  const {
    data: enrolledClasses,
    isLoading: isLoadingClasses,
    isError: isClassesError,
    refetch: refetchClasses,
  } = useQuery<EnrolledClassItem[]>({
    queryKey: [
      "enrolledClassesWithSessions",
      user?.userId,
      confirmedEnrollments.map((e) => `${e.id}_${e.enrollmentStatus}`).join(","),
    ],
    queryFn: async () => {
      const results = await Promise.all(
        confirmedEnrollments.map(async (enr) => {
          const [classItem, sessions] = await Promise.all([
            classDiscoveryService.fetchClassById(enr.classId),
            classDiscoveryService.fetchSessionsByClassId(enr.classId),
          ]);

          if (!classItem) return null;

          // Sessions contract derivation: ignore CANCELLED sessions
          const validSessions = sessions.filter((s) => s.status !== "CANCELLED");
          const totalSessions =
            validSessions.length > 0
              ? validSessions.length
              : classItem.totalSessions || 0;
          const completedSessions = validSessions.filter(
            (s) => s.status === "COMPLETED"
          ).length;
          const progressPercent =
            totalSessions > 0
              ? Math.min(100, Math.round((completedSessions / totalSessions) * 100))
              : 0;

          // Derived learning status: COMPLETED if enrollment/class is COMPLETED or all sessions done
          const isCompleted =
            enr.enrollmentStatus === "COMPLETED" ||
            classItem.status === "COMPLETED" ||
            (totalSessions > 0 && completedSessions === totalSessions);

          const learningStatus: "IN_PROGRESS" | "COMPLETED" = isCompleted
            ? "COMPLETED"
            : "IN_PROGRESS";

          return {
            enrollmentId: enr.id,
            classItem,
            totalSessions,
            completedSessions,
            progressPercent,
            learningStatus,
          };
        })
      );

      return results.filter((r): r is EnrolledClassItem => Boolean(r));
    },
    enabled: Boolean(user?.userId) && confirmedEnrollments.length > 0,
  });

  const isLoading = isLoadingEnrollments || (confirmedEnrollments.length > 0 && isLoadingClasses);
  const isError = isEnrollmentError || isClassesError;

  const handleRefetch = () => {
    refetchEnrollments();
    if (confirmedEnrollments.length > 0) {
      refetchClasses();
    }
  };

  const allEnrolledList = enrolledClasses || [];
  const inProgressCount = allEnrolledList.filter((c) => c.learningStatus === "IN_PROGRESS").length;
  const completedCount = allEnrolledList.filter((c) => c.learningStatus === "COMPLETED").length;
  const totalCount = allEnrolledList.length;

  const filteredList = allEnrolledList.filter((c) => {
    if (activeTab === "IN_PROGRESS") return c.learningStatus === "IN_PROGRESS";
    if (activeTab === "COMPLETED") return c.learningStatus === "COMPLETED";
    return true;
  });

  const handleCardClick = (classItem: ClassDiscoveryItem) => {
    notification.info({
      message: "Không gian lớp học",
      description: `Không gian học tập trực tuyến cho "${classItem.className}" đang được chuẩn bị.`,
      placement: "topRight",
    });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ================= 8. MAIN HEADER ================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Danh sách lớp học
          </h1>
        </div>

        {/* Derived enrollment count */}
        <div className="flex items-center">
          <span className="inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
            Tổng số {totalCount} lớp đã đăng ký
          </span>
        </div>
      </div>

      {/* ================= 9. FILTERS ================= */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("ALL")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${activeTab === "ALL"
            ? "bg-indigo-600 text-white shadow-xs"
            : "bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80 hover:border-slate-300"
            }`}
        >
          Tất cả ({totalCount})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("IN_PROGRESS")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${activeTab === "IN_PROGRESS"
            ? "bg-indigo-600 text-white shadow-xs"
            : "bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80 hover:border-slate-300"
            }`}
        >
          Đang học ({inProgressCount})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("COMPLETED")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${activeTab === "COMPLETED"
            ? "bg-indigo-600 text-white shadow-xs"
            : "bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80 hover:border-slate-300"
            }`}
        >
          Đã hoàn thành ({completedCount})
        </button>
      </div>

      {/* ================= CONTENT AREA ================= */}
      {isLoading ? (
        /* 22. Loading State: Compact Skeleton cards */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-[980px]">
          {[1, 2, 3].map((key) => (
            <div
              key={key}
              className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden p-4 space-y-3 shadow-2xs"
            >
              <Skeleton.Image className="!w-full !h-[155px] rounded-xl" active />
              <Skeleton active paragraph={{ rows: 2 }} />
            </div>
          ))}
        </div>
      ) : isError ? (
        /* 23. Error State */
        <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center shadow-2xs max-w-md mx-auto my-8">
          <p className="text-sm font-bold text-rose-600 mb-1">
            Không thể tải danh sách lớp học
          </p>
          <p className="text-xs text-slate-500 mb-4">
            Đã xảy ra lỗi trong quá trình lấy thông tin lớp học của bạn.
          </p>
          <Button
            onClick={handleRefetch}
            className="rounded-xl text-xs font-semibold"
          >
            Thử lại
          </Button>
        </div>
      ) : confirmedEnrollments.length === 0 ? (
        /* 16. Empty State */
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-2xs max-w-md mx-auto my-12">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 text-2xl">
            <BookOutlined />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1">
            Bạn chưa tham gia lớp học nào
          </h2>
          <p className="text-xs text-slate-500 mb-6 max-w-sm mx-auto">
            Khám phá các lớp học phù hợp để bắt đầu học.
          </p>
          <Link to={ROUTES.CLASSES}>
            <Button
              type="primary"
              className="bg-indigo-600 hover:bg-indigo-700 rounded-xl font-semibold text-xs px-6 h-10 shadow-xs"
            >
              Khám phá lớp học
            </Button>
          </Link>
        </div>
      ) : filteredList.length === 0 ? (
        /* Empty Filter Tab State */
        <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center shadow-2xs max-w-md mx-auto my-8">
          <p className="text-sm font-semibold text-slate-700 mb-1">
            Không có lớp học nào trong danh mục này
          </p>
          <p className="text-xs text-slate-400">
            {activeTab === "COMPLETED"
              ? "Bạn chưa có lớp học nào hoàn thành."
              : "Bạn không có lớp học nào đang diễn ra."}
          </p>
        </div>
      ) : (
        /* ================= 10. COMPACT CLASS GRID ================= */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-[980px]">
          {filteredList.map((item) => {
            const { classItem, enrollmentId } = item;
            return (
              <div
                key={enrollmentId}
                onClick={() => handleCardClick(classItem)}
                className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-2xs hover:shadow-md hover:border-indigo-300 transition-all duration-200 cursor-pointer group"
              >
                {/* 4. Cover Image (height 155px) & Status Badge */}
                <div className="relative h-[155px] w-full overflow-hidden bg-slate-100">
                  <img
                    src={classItem.coverImage}
                    alt={classItem.className}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-2.5 left-2.5">
                    {item.learningStatus === "IN_PROGRESS" ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase bg-emerald-500 text-white shadow-xs">
                        Đang học
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase bg-slate-700 text-white shadow-xs">
                        Đã hoàn thành
                      </span>
                    )}
                  </div>
                </div>

                {/* 5. Compact Card Content (16px padding) */}
                <div className="p-4 flex flex-col">
                  {/* courseTitle */}
                  <span
                    className="text-xs font-semibold text-indigo-600 truncate block mb-1"
                    title={classItem.courseTitle}
                  >
                    {classItem.courseTitle}
                  </span>

                  {/* className */}
                  <h3 className="text-sm font-bold text-slate-900 line-clamp-2 leading-snug group-hover:text-indigo-600 transition-colors">
                    {classItem.className}
                  </h3>

                  {/* teacherName */}
                  <div className="flex items-center gap-1.5 mt-2.5 text-xs text-slate-600">
                    <UserOutlined className="text-slate-400 text-xs shrink-0" />
                    <span className="font-medium text-slate-700 truncate">
                      {classItem.teacherName}
                    </span>
                  </div>

                  {/* startDate — endDate */}
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500">
                    <CalendarOutlined className="text-slate-400 text-xs shrink-0" />
                    <span className="truncate">
                      {classItem.startDate} —{" "}
                      {classItem.formattedEndDate || classItem.endDate || "Đang cập nhật"}
                    </span>
                  </div>

                  {/* 6 & 7. Compact Session Progress (flowing directly without empty gap) */}
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-500 font-medium">Tiến độ</span>
                      <span className="font-bold text-slate-800">
                        {item.totalSessions > 0
                          ? `${item.completedSessions}/${item.totalSessions} buổi`
                          : "Chưa có buổi học"}
                      </span>
                    </div>
                    <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                        style={{ width: `${item.progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
