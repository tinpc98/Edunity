import React, { useState } from "react";
import SectionHeader from "./SectionHeader";
import FeaturedClassCard from "./FeaturedClassCard";
import ClassCard from "./ClassCard";
import { THCS_CLASSES } from "../../data/homeData";

const FILTERS = ["Lớp 6", "Lớp 7", "Lớp 8", "Lớp 9 (Thi vào 10)"];

export default function THCSSection() {
  const [activeFilter, setActiveFilter] = useState("Lớp 9 (Thi vào 10)");

  return (
    <section className="home-section">
      <SectionHeader
        categoryTag="Nền tảng vững chắc"
        title="Lớp THCS Sắp Khai Giảng & Luyện Thi Vào 10"
        subtitle="Chọn lớp live theo khối, lịch học và giáo viên; ưu tiên lớp sĩ số nhỏ đang còn chỗ."
        filterButtons={FILTERS}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        viewAllText="Xem tất cả khóa THCS"
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="lg:col-span-4 h-full">
          <FeaturedClassCard
            badge="Lớp sắp khai giảng"
            levelBadge="LỚP 9 VIP"
            rating="4.99 (920 HS)"
            title="Lớp Toán 9 Live – Bứt Phá & Luyện Thi Vào 10 Chuyên"
            teacherName="Thầy Vũ Đình Tuấn"
            teacherRole="Thủ khoa Sư phạm Toán - ĐHSPHN"
            perks={["Bao quát các dạng bài trọng tâm và sửa bài trực tiếp theo nhóm nhỏ."]}
            originalPrice="2.100.000đ"
            discountPrice="1.490.000đ"
            discountPercent="-29%"
            bgImage="https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=600&q=80"
            sessionsBadge="26 buổi Live • Tối đa 12 HS"
            startDate="21/09/2026"
            schedule="Thứ 3 & Thứ 7 • 19:30"
            seatsLeft={2}
            capacity={12}
          />
        </div>
        <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {THCS_CLASSES.slice(0, 6).map((cls) => <ClassCard key={cls.id} classItem={cls} compact />)}
        </div>
      </div>
    </section>
  );
}
