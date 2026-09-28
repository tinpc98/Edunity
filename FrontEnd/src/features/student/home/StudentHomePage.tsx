import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Tag, Button, Empty, Skeleton } from "antd";
import {
  BookOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  UserOutlined,
  ArrowLeftOutlined,
} from "@ant-design/icons";
import { useAuthStore } from "../../../stores/auth.store";
import { enrollmentService } from "../../../services/enrollment.service";
import { classDiscoveryService } from "../../../services/classDiscovery.service";

export default function StudentHomePage() {
  const { user } = useAuthStore();

  const { data: enrollments, isLoading: isLoadingEnrollments } = useQuery({
    queryKey: ["studentEnrollments", user?.userId],
    queryFn: () => (user?.userId ? enrollmentService.getEnrollmentsByStudent(user.userId) : []),
    enabled: Boolean(user?.userId),
  });

  const confirmedEnrollments = (enrollments || []).filter(
    (e) => e.enrollmentStatus === "CONFIRMED" || e.enrollmentStatus === "COMPLETED"
  );

  const { data: enrolledClasses, isLoading: isLoadingClasses } = useQuery({
    queryKey: ["enrolledClassesDetails", confirmedEnrollments.map((e) => e.classId).join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        confirmedEnrollments.map(async (enr) => {
          const cls = await classDiscoveryService.fetchClassById(enr.classId);
          return { enrollment: enr, classItem: cls };
        })
      );
      return results.filter((r) => Boolean(r.classItem));
    },
    enabled: confirmedEnrollments.length > 0,
  });

  const isLoading = isLoadingEnrollments || (confirmedEnrollments.length > 0 && isLoadingClasses);

  return (
    <main className="site-container py-10 max-w-5xl min-h-[calc(100vh-140px)]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/80 mb-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 mb-1">
            Không gian học tập cá nhân
          </p>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900">
            Học tập của tôi
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Danh sách các lớp học bạn đã đăng ký và xác nhận tham gia thành công.
          </p>
        </div>

        <Link to="/classes">
          <Button icon={<ArrowLeftOutlined />} className="text-xs font-semibold rounded-xl">
            Khám phá thêm lớp học
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton active paragraph={{ rows: 3 }} />
          <Skeleton active paragraph={{ rows: 3 }} />
        </div>
      ) : enrolledClasses && enrolledClasses.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {enrolledClasses.map(({ enrollment, classItem }) => {
            if (!classItem) return null;
            return (
              <div
                key={enrollment.id}
                className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between hover:shadow-sm transition-shadow"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <Tag color="indigo" className="font-semibold text-xs border-none">
                      {classItem.gradeLabel}
                    </Tag>
                    <Tag color="green" className="font-semibold text-xs border-none">
                      ĐÃ THAM GIA
                    </Tag>
                  </div>

                  <h3 className="text-lg font-bold text-slate-900 mb-2 leading-snug">
                    {classItem.title}
                  </h3>

                  <div className="text-xs text-slate-600 flex items-center gap-2 mb-3">
                    <BookOutlined className="text-indigo-600" />
                    <span>{classItem.courseTitle}</span>
                  </div>

                  <div className="space-y-2 pt-3 border-t border-slate-100 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <UserOutlined className="text-indigo-600" />
                      <span>Giáo viên: <strong>{classItem.teacherName}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarOutlined className="text-indigo-600" />
                      <span>Khai giảng: <strong>{classItem.startDate}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ClockCircleOutlined className="text-indigo-600" />
                      <span>Lịch học: <strong>{classItem.scheduleText}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="pt-5 mt-4 border-t border-slate-100 flex items-center justify-between">
                  <div className="text-xs text-slate-400">
                    Mã đơn: <span className="font-mono text-slate-600">{enrollment.id}</span>
                  </div>
                  <Link to={`/classes/${classItem.id}`}>
                    <Button type="default" size="small" className="rounded-lg text-xs font-semibold">
                      Xem chi tiết lớp
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs">
          <Empty
            description={
              <div className="space-y-1">
                <p className="font-semibold text-slate-700">Chưa có lớp học nào</p>
                <p className="text-xs text-slate-400">
                  Bạn chưa đăng ký lớp học nào. Hãy khám phá danh sách lớp để bắt đầu học tập.
                </p>
              </div>
            }
          >
            <Link to="/classes">
              <Button type="primary" className="bg-indigo-600 hover:bg-indigo-700 rounded-xl mt-2 font-semibold text-xs">
                Khám phá lớp học ngay
              </Button>
            </Link>
          </Empty>
        </div>
      )}
    </main>
  );
}
