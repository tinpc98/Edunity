import { Link } from "react-router-dom";
import { Skeleton } from "antd";
import SectionHeader from "../../../components/common/SectionHeader";
import ClassCard from "./ClassCard";
import { toHomeClassItem, useHomeFreeClasses } from "../hooks/useHomeData";

export default function FreeClassSection() {
  const { data: classes = [], isLoading } = useHomeFreeClasses(4);

  return (
    <section className="home-section">
      <SectionHeader
        categoryTag="Lớp live miễn phí"
        title="Lớp Học Miễn Phí Sắp Khai Giảng"
        viewAllLink="/classes?classTypes=FREE"
        viewAllText="Xem tất cả lớp miễn phí"
      />

      {isLoading ? (
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 p-3">
              <Skeleton active paragraph={{ rows: 3 }} />
            </div>
          ))}
        </div>
      ) : classes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white py-10 text-center">
          <p className="text-[13px] text-slate-500">Hiện chưa có lớp miễn phí nào đang mở đăng ký.</p>
          <Link to="/classes" className="mt-2 inline-block text-[12px] font-bold text-indigo-600 hover:text-indigo-800">
            Khám phá tất cả lớp học →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {classes.map((item) => (
            <ClassCard key={item.id} classItem={toHomeClassItem(item)} compact />
          ))}
        </div>
      )}
    </section>
  );
}
