import { useMemo } from "react";
import HomeClassSection, { type HomeClassFilter } from "./HomeClassSection";
import { useHomeOpenClasses } from "../hooks/useHomeData";
import type { BackendGradeLevel } from "../../../types/classDiscovery";

const THCS_GRADES: BackendGradeLevel[] = ["GRADE_6", "GRADE_7", "GRADE_8", "GRADE_9"];

const FILTERS: HomeClassFilter[] = [
  { label: "Tất cả", match: () => true },
  { label: "Lớp 6", match: (c) => c.gradeLevel === "GRADE_6" },
  { label: "Lớp 7", match: (c) => c.gradeLevel === "GRADE_7" },
  { label: "Lớp 8", match: (c) => c.gradeLevel === "GRADE_8" },
  { label: "Lớp 9 (Thi vào 10)", match: (c) => c.gradeLevel === "GRADE_9" },
];

export default function THCSSection() {
  const { data = [], isLoading } = useHomeOpenClasses();

  const items = useMemo(
    () => data.filter((c) => c.gradeLevel !== null && THCS_GRADES.includes(c.gradeLevel)),
    [data]
  );

  return (
    <HomeClassSection
      categoryTag="Nền tảng vững chắc"
      title="Lớp THCS Sắp Khai Giảng & Luyện Thi Vào 10"
      viewAllLink="/classes?grades=GRADE_6,GRADE_7,GRADE_8,GRADE_9"
      viewAllText="Xem tất cả khóa THCS"
      featuredBadge="Lớp sắp khai giảng"
      emptyText="Hiện chưa có lớp THCS nào đang mở đăng ký."
      items={items}
      isLoading={isLoading}
      filters={FILTERS}
    />
  );
}
