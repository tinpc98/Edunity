import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Skeleton, Tag } from "antd";
import { CheckCircleFilled, StarFilled, ArrowRightOutlined } from "@ant-design/icons";
import { getInitials, useHomeFeaturedTeachers, useHomeOpenClasses } from "../hooks/useHomeData";

export default function FeaturedTeachersSection() {
  const { data: teachers = [], isLoading } = useHomeFeaturedTeachers(4);
  const { data: openClasses = [] } = useHomeOpenClasses();

  // The public teacher list has no class stats: derive them from the open classes already loaded
  const statsByTeacher = useMemo(() => {
    const stats = new Map<string, { openClasses: number; students: number }>();
    for (const cls of openClasses) {
      const current = stats.get(cls.teacherId) || { openClasses: 0, students: 0 };
      stats.set(cls.teacherId, { openClasses: current.openClasses + 1, students: current.students + cls.enrolledCount });
    }
    return stats;
  }, [openClasses]);

  if (!isLoading && teachers.length === 0) return null;

  return (
    <section className="home-section section-soft">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5"><span className="w-1 h-5 bg-cyan-600 rounded-full" /><span className="text-[10px] font-bold tracking-wider text-cyan-700 uppercase">Học trực tiếp cùng chuyên gia</span></div>
          <h2 className="text-[25px] font-extrabold text-slate-900 tracking-tight">Giáo viên nổi bật</h2>
        </div>
        <Link to="/teachers" className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">Xem tất cả giáo viên <ArrowRightOutlined /></Link>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {isLoading
          ? Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="bg-white border border-slate-100 rounded-2xl p-5 min-h-[300px]">
                <Skeleton avatar active paragraph={{ rows: 4 }} />
              </div>
            ))
          : teachers.map((teacher, index) => {
              const stats = statsByTeacher.get(teacher.id) || { openClasses: 0, students: 0 };
              return (
                <article key={teacher.id} className="bg-white border border-slate-100 rounded-2xl p-5 text-center shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all min-h-[300px] flex flex-col">
                  <div className={`mx-auto w-[92px] h-[92px] rounded-full p-[3px] ${index % 2 === 0 ? "bg-indigo-500" : "bg-cyan-500"} relative`}>
                    {teacher.avatarUrl ? (
                      <img src={teacher.avatarUrl} alt={teacher.fullName} className="w-full h-full rounded-full object-cover border-[3px] border-white" />
                    ) : (
                      <div className="w-full h-full rounded-full border-[3px] border-white bg-indigo-50 text-indigo-700 font-black text-[22px] flex items-center justify-center">
                        {getInitials(teacher.fullName)}
                      </div>
                    )}
                    <span className="absolute -right-1 bottom-1 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow"><CheckCircleFilled className="text-indigo-600 text-[18px]" /></span>
                  </div>
                  <div className="mt-2.5"><Tag color="geekblue" className="m-0 text-[9px] rounded-full"><CheckCircleFilled /> Đã xác minh</Tag></div>
                  <h3 className="mt-2.5 text-[14px] font-extrabold text-slate-800">{teacher.fullName}</h3>
                  <div className="text-[10px] font-bold text-indigo-600 mt-0.5 line-clamp-1">{teacher.qualificationSummary || "Giáo viên Edunity"}</div>
                  <p className="text-[10px] text-slate-500 leading-4 mt-2 line-clamp-2 min-h-[32px]">
                    {teacher.biography || "Giáo viên đã được Edunity xác minh hồ sơ chuyên môn."}
                  </p>

                  <div className="mt-3 grid grid-cols-3 rounded-xl bg-slate-50 overflow-hidden divide-x divide-slate-100 py-2.5">
                    <div><div className="text-[11.5px] font-extrabold text-slate-700">{stats.students}</div><div className="text-[8.5px] text-slate-400">Học sinh</div></div>
                    <div>
                      <div className="text-[11.5px] font-extrabold text-amber-500">
                        {teacher.ratingCount > 0 ? teacher.ratingAverage.toFixed(1) : "–"} <StarFilled className="text-[9px]" />
                      </div>
                      <div className="text-[8.5px] text-slate-400">{teacher.ratingCount} đánh giá</div>
                    </div>
                    <div><div className="text-[11.5px] font-extrabold text-cyan-700">{stats.openClasses} lớp</div><div className="text-[8.5px] text-slate-400">Đang mở</div></div>
                  </div>

                  <Link
                    to={`/classes?teacherId=${teacher.id}`}
                    className="mt-auto pt-3 block"
                  >
                    <span className="flex items-center justify-center gap-1 h-9 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10.5px] transition-colors">
                      Xem lớp của giáo viên <ArrowRightOutlined />
                    </span>
                  </Link>
                </article>
              );
            })}
      </div>
    </section>
  );
}
