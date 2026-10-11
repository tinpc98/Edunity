import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Breadcrumb, Button, Skeleton, Input, Radio } from "antd";
import {
  StarFilled,
  UserOutlined,
  SearchOutlined,
  CheckCircleFilled,
  FireOutlined,
  AppstoreOutlined,
} from "@ant-design/icons";
import { ROUTES } from "../../../routes/routePaths";
import { catalogService, catalogKeys } from "../../../services/catalog.service";
import type { PublicTeacherListItem } from "../../../services/catalog.service";

// --- Components ---

function TeacherCard({ teacher }: { teacher: PublicTeacherListItem }) {
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 flex flex-col h-[270px] transition-all duration-200 hover:shadow-lg hover:border-indigo-200 group">
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
          <div className="flex items-center gap-1.5 mb-1">
            <h3 className="text-base font-bold text-slate-900 truncate" title={teacher.fullName}>
              {teacher.fullName}
            </h3>
            <span title="Giáo viên đã được xác thực chuyên môn" className="shrink-0 text-emerald-500 text-sm">
              <CheckCircleFilled />
            </span>
          </div>
          <p
            className="text-xs text-indigo-600 font-medium line-clamp-1"
            title={teacher.qualificationSummary || ""}
          >
            {teacher.qualificationSummary || "Giáo viên Edunity"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-3 bg-amber-50/60 w-fit px-2.5 py-1 rounded-full border border-amber-100">
        <StarFilled className="text-amber-400 text-xs" />
        <span className="text-xs font-bold text-slate-800">
          {typeof teacher.ratingAverage === "number" ? teacher.ratingAverage.toFixed(1) : "0.0"}
        </span>
        <span className="text-xs text-slate-400">
          · {teacher.ratingCount > 0 ? `${teacher.ratingCount} đánh giá` : "Mới tham gia"}
        </span>
      </div>

      <div className="mb-4 flex-1 overflow-hidden">
        <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed">
          {teacher.biography || "Giáo viên tận tâm với nhiều năm kinh nghiệm giảng dạy tại Edunity."}
        </p>
      </div>

      <div className="mt-auto pt-2 border-t border-slate-100">
        <Link to={`/teachers/${teacher.id}`} className="block">
          <Button
            type="primary"
            ghost
            className="w-full h-9 rounded-xl font-medium text-xs border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-400"
          >
            Xem hồ sơ & Lớp học →
          </Button>
        </Link>
      </div>
    </div>
  );
}

// --- Main Page ---

export default function TeacherDiscoveryPage() {
  const [filterType, setFilterType] = useState<"all" | "featured">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const isFeatured = filterType === "featured";

  const { data: teachers = [], isLoading } = useQuery({
    queryKey: catalogKeys.teachers({ featured: isFeatured, limit: 30 }),
    queryFn: () => catalogService.getTeachers(isFeatured ? true : undefined, 30),
  });

  const filteredTeachers = useMemo(() => {
    if (!searchQuery.trim()) return teachers;
    const q = searchQuery.toLowerCase().trim();
    return teachers.filter(
      (t) =>
        t.fullName?.toLowerCase().includes(q) ||
        t.qualificationSummary?.toLowerCase().includes(q) ||
        t.biography?.toLowerCase().includes(q)
    );
  }, [teachers, searchQuery]);

  return (
    <div className="site-container py-6 sm:py-10 max-w-[1260px] mx-auto min-h-[70vh] px-4">
      {/* Header & Breadcrumb */}
      <div className="mb-8">
        <Breadcrumb
          items={[
            { title: <Link to={ROUTES.HOME}>Trang chủ</Link> },
            { title: "Đội ngũ giáo viên" },
          ]}
          className="mb-4 text-xs font-medium"
        />

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight mb-2">
              Đội ngũ giáo viên tận tâm
            </h1>
            <p className="text-slate-500 text-sm max-w-2xl">
              Khám phá và kết nối với các giáo viên uy tín đã qua kiểm duyệt chuyên môn bởi Edunity.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Radio.Group
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              buttonStyle="solid"
              size="middle"
            >
              <Radio.Button value="all">
                <AppstoreOutlined className="mr-1" /> Tất cả
              </Radio.Button>
              <Radio.Button value="featured">
                <FireOutlined className="mr-1" /> Nổi bật
              </Radio.Button>
            </Radio.Group>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-8">
        <Input
          size="large"
          placeholder="Tìm kiếm theo tên giáo viên, chuyên môn hoặc môn học..."
          prefix={<SearchOutlined className="text-slate-400 mr-1" />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          allowClear
          className="rounded-xl max-w-lg shadow-sm border-slate-200"
        />
      </div>

      {/* Results Header */}
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-base font-bold text-slate-800 m-0">Danh sách giáo viên</h2>
        {!isLoading && (
          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
            {filteredTeachers.length} giáo viên
          </span>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="bg-white border border-slate-200/60 rounded-2xl p-5 h-[270px] flex flex-col"
            >
              <div className="flex gap-4">
                <Skeleton.Avatar active size={56} />
                <div className="flex-1">
                  <Skeleton active paragraph={{ rows: 2 }} title={{ width: "70%" }} />
                </div>
              </div>
              <div className="mt-auto">
                <Skeleton.Button active block size="small" className="h-9 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredTeachers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 py-16 px-6 text-center shadow-sm">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserOutlined className="text-2xl text-slate-300" />
          </div>
          <h3 className="text-base font-bold text-slate-700 mb-1">
            Không tìm thấy giáo viên phù hợp
          </h3>
          <p className="text-sm text-slate-500">
            {searchQuery
              ? `Không có kết quả nào cho "${searchQuery}". Vui lòng thử từ khóa khác.`
              : "Hiện tại chưa có giáo viên nào trong danh mục này."}
          </p>
          {searchQuery && (
            <Button onClick={() => setSearchQuery("")} className="mt-4 rounded-xl">
              Xóa tìm kiếm
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTeachers.map((teacher) => (
            <TeacherCard key={teacher.id} teacher={teacher} />
          ))}
        </div>
      )}
    </div>
  );
}
