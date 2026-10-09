import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Breadcrumb, Button, Skeleton } from "antd";
import { StarFilled, UserOutlined } from "@ant-design/icons";
import { ROUTES } from "../../../routes/routePaths";
import { catalogService } from "../../../services/catalog.service";
import type { PublicTeacherListItem } from "../../../services/catalog.service";

// --- Components ---

function TeacherCard({ teacher }: { teacher: PublicTeacherListItem }) {
  return (
    <div className="bg-white border border-slate-200/70 rounded-2xl p-4 flex flex-col h-[230px] transition-shadow hover:shadow-md hover:border-slate-300">
      <div className="flex gap-4 mb-3">
        {teacher.avatarUrl ? (
          <img
            src={teacher.avatarUrl}
            alt={teacher.fullName}
            className="w-14 h-14 rounded-full object-cover border border-slate-100 flex-shrink-0"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 text-xl flex-shrink-0">
            <UserOutlined />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-slate-900 truncate mb-1" title={teacher.fullName}>
            {teacher.fullName}
          </h3>
          <p className="text-[13px] text-slate-500 line-clamp-2 leading-relaxed" title={teacher.qualificationSummary || ""}>
            {teacher.qualificationSummary}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-2.5">
        <StarFilled className="text-amber-400 text-[12px]" />
        <span className="text-[12px] font-semibold text-slate-800">
          {teacher.ratingAverage.toFixed(1)}
        </span>
        <span className="text-[12px] text-slate-400">
          · {teacher.ratingCount > 0 ? `${teacher.ratingCount} đánh giá` : "Chưa có đánh giá"}
        </span>
      </div>

      <div className="mb-4">
        <p className="text-[12px] text-slate-500 line-clamp-2 leading-[1.45]">
          {teacher.biography || "\u00A0"}
        </p>
      </div>

      <div className="mt-auto">
        <Link to={`/teachers/${teacher.id}`} className="block">
          <Button
            className="w-full h-8 rounded-lg bg-indigo-50/50 hover:bg-indigo-50 text-indigo-600 border-none font-medium text-[13px]"
          >
            Xem hồ sơ →
          </Button>
        </Link>
      </div>
    </div>
  );
}

// --- Main Page ---

export default function TeacherDiscoveryPage() {
  const { data: teachers = [], isLoading } = useQuery({
    queryKey: ["public-teachers-discovery"],
    // Request a decent amount of teachers for the grid
    queryFn: () => catalogService.getTeachers(false, 12),
  });

  return (
    <div className="site-container py-6 sm:py-10 max-w-[1260px] mx-auto min-h-[60vh]">
      {/* Header */}
      <div className="mb-10">
        <Breadcrumb
          items={[
            { title: <Link to={ROUTES.HOME}>Trang chủ</Link> },
            { title: "Giáo viên" },
          ]}
          className="mb-4 text-[13px]"
        />
      </div>

      {/* Content */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-[18px] font-bold text-slate-800">Đội ngũ giáo viên</h2>
          {!isLoading && teachers.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[12px] font-semibold">
              {teachers.length} giáo viên
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="bg-white border border-slate-200/50 rounded-2xl p-4 h-[230px] flex flex-col">
                <div className="flex gap-4">
                  <Skeleton.Avatar active size={56} />
                  <div className="flex-1">
                    <Skeleton active paragraph={{ rows: 2 }} title={{ width: "70%" }} />
                  </div>
                </div>
                <div className="mt-auto">
                  <Skeleton.Button active block size="small" className="h-8" />
                </div>
              </div>
            ))}
          </div>
        ) : teachers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/60 py-16 px-6 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <UserOutlined className="text-2xl text-slate-300" />
            </div>
            <h3 className="text-[16px] font-bold text-slate-700 mb-2">Chưa có giáo viên để hiển thị</h3>
            <p className="text-[14px] text-slate-500">Thông tin giáo viên sẽ được cập nhật tại đây.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {teachers.map(teacher => (
              <TeacherCard key={teacher.id} teacher={teacher} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
