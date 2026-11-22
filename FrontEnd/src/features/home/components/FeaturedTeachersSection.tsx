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
          <div className="flex items-center gap-2 mb-1.5"><span className="w-1.5 h-5 bg-[#0D9488] rounded-full" /><span className="text-[11px] font-bold tracking-wider text-[#0F766E] uppercase">Học trực tiếp cùng chuyên gia</span></div>
          <h2 className="text-[25px] font-extrabold text-[#163B40] tracking-tight">Giáo viên nổi bật</h2>
        </div>
        <Link to="/teachers" className="text-[12px] font-bold text-[#0D9488] hover:text-[#0F766E] flex items-center gap-1 group">Xem tất cả giáo viên <ArrowRightOutlined className="group-hover:translate-x-0.5 transition-transform" /></Link>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {isLoading
          ? Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="bg-white border border-[#D6E5E2] rounded-2xl p-5 min-h-[300px]">
                <Skeleton avatar active paragraph={{ rows: 4 }} />
              </div>
            ))
          : teachers.map((teacher, index) => {
              const stats = statsByTeacher.get(teacher.id) || { openClasses: 0, students: 0 };
              return (
                <article key={teacher.id} className="bg-white border border-[#D6E5E2] hover:border-[#0D9488] rounded-2xl p-5 text-center shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all min-h-[300px] flex flex-col">
                  <div className={`mx-auto w-[92px] h-[92px] rounded-full p-[3px] ${index % 2 === 0 ? "bg-[#0D9488]" : "bg-[#14B8A6]"} relative`}>
                    {teacher.avatarUrl ? (
                      <img src={teacher.avatarUrl} alt={teacher.fullName} className="w-full h-full rounded-full object-cover border-[3px] border-white" />
                    ) : (
                      <div className="w-full h-full rounded-full border-[3px] border-white bg-[#CCFBF1] text-[#0F766E] font-black text-[22px] flex items-center justify-center">
                        {getInitials(teacher.fullName)}
                      </div>
                    )}
                    <span className="absolute -right-1 bottom-1 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow"><CheckCircleFilled className="text-[#0D9488] text-[18px]" /></span>
                  </div>
                  <div className="mt-2.5"><Tag className="m-0 text-[10px] rounded-full bg-[#CCFBF1] text-[#0F766E] border-none font-semibold"><CheckCircleFilled className="text-[#0D9488]" /> Đã xác minh</Tag></div>
                  <h3 className="mt-2.5 text-[14px] font-extrabold text-[#163B40]">{teacher.fullName}</h3>
                  <div className="text-[11px] font-bold text-[#0D9488] mt-0.5 line-clamp-1">{teacher.qualificationSummary || "Giáo viên Edunity"}</div>
                  <p className="text-[11px] text-[#64748B] leading-4 mt-2 line-clamp-2 min-h-[32px]">
                    {teacher.biography || "Giáo viên đã được Edunity xác minh hồ sơ chuyên môn."}
                  </p>

                  <div className="mt-3 grid grid-cols-3 rounded-xl bg-[#F5FAF9] border border-[#D6E5E2]/50 overflow-hidden divide-x divide-[#D6E5E2]/60 py-2.5">
                    <div><div className="text-[11.5px] font-extrabold text-[#163B40]">{stats.students}</div><div className="text-[9px] text-[#64748B]">Học sinh</div></div>
                    <div>
                      <div className="text-[11.5px] font-extrabold text-amber-500">
                        {teacher.ratingCount > 0 ? teacher.ratingAverage.toFixed(1) : "–"} <StarFilled className="text-[9px]" />
                      </div>
                      <div className="text-[9px] text-[#64748B]">{teacher.ratingCount} đánh giá</div>
                    </div>
                    <div><div className="text-[11.5px] font-extrabold text-[#0F766E]">{stats.openClasses} lớp</div><div className="text-[9px] text-[#64748B]">Đang mở</div></div>
                  </div>

                  <Link
                    to={`/teachers/${teacher.id}`}
                    className="mt-auto pt-3 block"
                  >
                    <span className="flex items-center justify-center gap-1 h-9 rounded-lg bg-[#CCFBF1]/70 hover:bg-[#0D9488] text-[#0F766E] hover:text-white font-bold text-[11px] transition-colors">
                      Xem hồ sơ <ArrowRightOutlined />
                    </span>
                  </Link>
                </article>
              );
            })}
      </div>
    </section>
  );
}
