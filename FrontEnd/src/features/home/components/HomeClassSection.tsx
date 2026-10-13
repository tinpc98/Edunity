import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Skeleton } from "antd";
import SectionHeader from "../../../components/common/SectionHeader";
import FeaturedClassCard from "./FeaturedClassCard";
import ClassCard from "./ClassCard";
import type { ClassDiscoveryItem } from "../../../types/classDiscovery";
import { getInitials, toHomeClassItem } from "../hooks/useHomeData";

export interface HomeClassFilter {
  label: string;
  match: (item: ClassDiscoveryItem) => boolean;
}

interface HomeClassSectionProps {
  categoryTag: string;
  title: string;
  viewAllLink: string;
  viewAllText: string;
  featuredBadge: string;
  emptyText: string;
  items: ClassDiscoveryItem[];
  isLoading: boolean;
  filters: HomeClassFilter[];
}

export default function HomeClassSection({
  categoryTag,
  title,
  viewAllLink,
  viewAllText,
  featuredBadge,
  emptyText,
  items,
  isLoading,
  filters,
}: HomeClassSectionProps) {
  const [activeFilter, setActiveFilter] = useState(filters[0]?.label ?? "");

  const visible = useMemo(() => {
    const filter = filters.find((f) => f.label === activeFilter);
    return filter ? items.filter(filter.match) : items;
  }, [items, filters, activeFilter]);

  const [featured, ...rest] = visible;

  return (
    <section className="home-section">
      <SectionHeader
        categoryTag={categoryTag}
        title={title}
        filterButtons={filters.length > 1 ? filters.map((f) => f.label) : []}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        viewAllLink={viewAllLink}
        viewAllText={viewAllText}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4 bg-white rounded-xl border border-slate-100 p-4">
            <Skeleton.Image active className="!w-full !h-[200px]" />
            <Skeleton active paragraph={{ rows: 4 }} className="mt-3" />
          </div>
          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-100 p-3">
                <Skeleton active paragraph={{ rows: 3 }} />
              </div>
            ))}
          </div>
        </div>
      ) : !featured ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white py-10 text-center">
          <p className="text-[13px] text-slate-500">{emptyText}</p>
          <Link to="/classes" className="mt-2 inline-block text-[12px] font-bold text-indigo-600 hover:text-indigo-800">
            Khám phá tất cả lớp học →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          <div className="lg:col-span-4 h-full">
            <FeaturedClassCard
              to={`/classes/${featured.id}`}
              badge={featuredBadge}
              levelBadge={(featured.gradeLevel ? featured.gradeLabel : featured.subjectName || "Lớp live").toUpperCase()}
              rating={`${featured.ratingAverage.toFixed(1)} (${featured.ratingCount} đánh giá)`}
              title={featured.className}
              teacherName={featured.teacherName}
              teacherInitials={getInitials(featured.teacherName)}
              teacherRole={featured.courseTitle ? `Khóa học: ${featured.courseTitle}` : "Giáo viên Edunity"}
              perks={featured.description ? [featured.description] : []}
              discountPrice={featured.formattedPrice}
              discountPercent=""
              bgImage={featured.coverImage}
              sessionsBadge={`Tối đa ${featured.capacity} HS`}
              startDate={featured.startDate}
              schedule={featured.scheduleText}
              seatsLeft={featured.seatsLeft}
              capacity={featured.capacity}
            />
          </div>
          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 content-start">
            {rest.slice(0, 6).map((cls) => (
              <ClassCard key={cls.id} classItem={toHomeClassItem(cls)} compact />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
