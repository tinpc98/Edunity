import SectionHeader from "./SectionHeader";
import ClassCard from "./ClassCard";
import { FREE_CLASSES } from "../../data/homeData";

export default function FreeClassSection() {
  return (
    <section className="home-section">
      <SectionHeader
        categoryTag="Lớp live miễn phí"
        title="Lớp Học Miễn Phí Sắp Khai Giảng"
        // subtitle="Các lớp live miễn phí vẫn có giáo viên, lịch học, sĩ số và số lượng chỗ đăng ký rõ ràng như các lớp trả phí."
        viewAllText="Xem tất cả lớp miễn phí"
      />

      <div className="grid grid-cols-4 gap-4">
        {FREE_CLASSES.map((item) => (
          <ClassCard key={item.id} classItem={item} compact />
        ))}
      </div>
    </section>
  );
}
