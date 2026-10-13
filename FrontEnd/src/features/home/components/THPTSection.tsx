import { useMemo } from "react";
import HomeClassSection, { type HomeClassFilter } from "./HomeClassSection";
import { useHomeOpenClasses } from "../hooks/useHomeData";
import type { BackendGradeLevel } from "../../../types/classDiscovery";

const THPT_GRADES: BackendGradeLevel[] = ["GRADE_10", "GRADE_11", "GRADE_12"];

export default function THPTSection() {
  const { data = [], isLoading } = useHomeOpenClasses();

  const items = useMemo(
    () => data.filter((c) => c.gradeLevel !== null && THPT_GRADES.includes(c.gradeLevel)),
    [data]
  );

  // One chip per subject that actually has an open THPT class
  const filters = useMemo<HomeClassFilter[]>(() => {
    const subjects = [...new Set(items.map((c) => c.subjectName).filter(Boolean))];
    return [
      { label: "Tất cả", match: () => true },
      ...subjects.map((name) => ({ label: name, match: (c: (typeof items)[number]) => c.subjectName === name })),
    ];
  }, [items]);

  return (
    <HomeClassSection
      categoryTag="Lớp THPT Sắp Khai Giảng"
      title="Lớp THPT Sắp Khai Giảng"
      viewAllLink="/classes?grades=GRADE_10,GRADE_11,GRADE_12"
      viewAllText="Xem tất cả"
      featuredBadge="Khai giảng gần nhất"
      emptyText="Hiện chưa có lớp THPT nào đang mở đăng ký."
      items={items}
      isLoading={isLoading}
      filters={filters}
    />
  );
}
