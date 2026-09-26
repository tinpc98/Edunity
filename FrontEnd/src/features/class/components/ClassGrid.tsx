import type { ClassDiscoveryItem } from "../types/classDiscovery";
import ClassCard from "./ClassCard";
import ClassCardSkeleton from "./ClassCardSkeleton";
import ClassDiscoveryEmpty from "./ClassDiscoveryEmpty";

interface ClassGridProps {
  items: ClassDiscoveryItem[];
  isLoading: boolean;
  onResetFilters: () => void;
}

export default function ClassGrid({
  items,
  isLoading,
  onResetFilters,
}: ClassGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {Array.from({ length: 6 }).map((_, idx) => (
          <ClassCardSkeleton key={idx} />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return <ClassDiscoveryEmpty onResetFilters={onResetFilters} />;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
      {items.map((item) => (
        <ClassCard key={item.id} item={item} />
      ))}
    </div>
  );
}
