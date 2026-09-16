import { useState } from "react";
import SectionHeader from "../../../components/common/SectionHeader";
import FeaturedClassCard from "./FeaturedClassCard";
import ClassCard from "./ClassCard";
import { THPT_CLASSES } from "../../../data/homeData";

const FILTERS = ["Tất cả", "Toán học", "Ngữ văn", "Tiếng Anh", "Vật lí - Hóa học", "ĐGNL (HSA/TSA)"];

export default function THPTSection() {
  const [activeFilter, setActiveFilter] = useState("Tất cả");

  return (
    <section className="home-section">
      <SectionHeader
        categoryTag="Lớp THPT Sắp Khai Giảng"
        title="Lớp THPT Sắp Khai Giảng"
        // subtitle="Các lớp live chuẩn bị khai giảng — xem lịch học, sĩ số còn trống và giáo viên trước khi đăng ký."
        filterButtons={FILTERS}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        viewAllText="Xem tất cả"
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="lg:col-span-4 h-full">
          <FeaturedClassCard
            badge="Khai giảng gần nhất"
            levelBadge="LỚP 12 • 2026"
            rating="4.98 (1.450 HS)"
            title="Lớp Toán 12 Live – Chinh Phục 9+ THPT Quốc Gia & HSA 2026"
            teacherName="ThS. Nguyễn Văn Đức"
            teacherRole="15 năm kinh nghiệm Chuyên Sư Phạm"
            perks={["Tặng trọn bộ 30 đề dự đoán chuẩn ma trận BGD", "Trợ giảng 1-1 chữa bài tập về nhà mỗi tuần"]}
            originalPrice="2.400.000đ"
            discountPrice="1.680.000đ"
            discountPercent="-30%"
            bgImage="https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=600&q=80"
            sessionsBadge="45 buổi Live • Nhóm nhỏ"
            startDate="20/09/2026"
            schedule="Thứ 2 & Thứ 5 • 19:30"
            seatsLeft={3}
            capacity={12}
          />
        </div>
        <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {THPT_CLASSES.slice(0, 6).map((cls:any) => <ClassCard key={cls.id} classItem={cls} compact />)}
        </div>
      </div>
    </section>
  );
}
