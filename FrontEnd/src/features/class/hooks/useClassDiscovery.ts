import { useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { classDiscoveryService } from "../../../services/classDiscovery.service";
import type {
  BackendClassStatus,
  BackendClassType,
  BackendGradeLevel,
  FilterState,
  SortOption,
  TimeOfDay,
} from "../../../types/classDiscovery";

export function useClassDiscoveryQuery(filters: FilterState) {
  return useQuery({
    queryKey: ["classDiscovery", filters],
    queryFn: () => classDiscoveryService.fetchClasses(filters),
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

export function useFilterMetadataQuery() {
  return useQuery({
    queryKey: ["classDiscoveryMetadata"],
    queryFn: () => classDiscoveryService.fetchFilterMetadata(),
    staleTime: 1000 * 60 * 10,
  });
}

export function useClassDetailQuery(classId: string | undefined) {
  return useQuery({
    queryKey: ["classDetail", classId],
    queryFn: () => (classId ? classDiscoveryService.fetchClassById(classId) : null),
    enabled: Boolean(classId),
  });
}

const DEFAULT_PAGE_SIZE = 9;

export function useClassDiscoveryFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters: FilterState = useMemo(() => {
    const search = searchParams.get("search") || "";
    const subjectId = searchParams.get("subjectId") || undefined;
    const courseId = searchParams.get("courseId") || undefined;
    const teacherId = searchParams.get("teacherId") || undefined;

    const gradeLevels = (searchParams.get("grades")?.split(",").filter(Boolean) ||
      []) as BackendGradeLevel[];

    const classTypes = (searchParams.get("classTypes")?.split(",").filter(Boolean) ||
      []) as BackendClassType[];

    const timeOfDay = (searchParams.get("timeOfDay")?.split(",").filter(Boolean) ||
      []) as TimeOfDay[];

    const statuses = (searchParams.get("statuses")?.split(",").filter(Boolean) ||
      []) as BackendClassStatus[];

    const minPrice = searchParams.has("minPrice")
      ? Number(searchParams.get("minPrice"))
      : undefined;

    const maxPrice = searchParams.has("maxPrice")
      ? Number(searchParams.get("maxPrice"))
      : undefined;

    const sort = (searchParams.get("sort") || "relevance") as SortOption;
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const pageSize = Number(searchParams.get("pageSize") || DEFAULT_PAGE_SIZE);

    return {
      search,
      subjectId,
      gradeLevels,
      courseId,
      classTypes,
      minPrice,
      maxPrice,
      timeOfDay,
      statuses,
      teacherId,
      sort,
      page,
      pageSize,
    };
  }, [searchParams]);

  const updateFilters = useCallback(
    (updates: Partial<FilterState>, resetPage = true) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);

          if ("search" in updates) {
            if (updates.search && updates.search.trim()) {
              next.set("search", updates.search.trim());
            } else {
              next.delete("search");
            }
          }

          if ("subjectId" in updates) {
            if (updates.subjectId && updates.subjectId !== "ALL") {
              next.set("subjectId", updates.subjectId);
            } else {
              next.delete("subjectId");
            }
          }

          if ("courseId" in updates) {
            if (updates.courseId && updates.courseId !== "ALL") {
              next.set("courseId", updates.courseId);
            } else {
              next.delete("courseId");
            }
          }

          if ("teacherId" in updates) {
            if (updates.teacherId && updates.teacherId !== "ALL") {
              next.set("teacherId", updates.teacherId);
            } else {
              next.delete("teacherId");
            }
          }

          if ("gradeLevels" in updates) {
            if (updates.gradeLevels && updates.gradeLevels.length > 0) {
              next.set("grades", updates.gradeLevels.join(","));
            } else {
              next.delete("grades");
            }
          }

          if ("classTypes" in updates) {
            if (updates.classTypes && updates.classTypes.length > 0) {
              next.set("classTypes", updates.classTypes.join(","));
            } else {
              next.delete("classTypes");
            }
          }

          if ("timeOfDay" in updates) {
            if (updates.timeOfDay && updates.timeOfDay.length > 0) {
              next.set("timeOfDay", updates.timeOfDay.join(","));
            } else {
              next.delete("timeOfDay");
            }
          }

          if ("statuses" in updates) {
            if (updates.statuses && updates.statuses.length > 0) {
              next.set("statuses", updates.statuses.join(","));
            } else {
              next.delete("statuses");
            }
          }

          if ("minPrice" in updates) {
            if (updates.minPrice !== undefined && updates.minPrice > 0) {
              next.set("minPrice", String(updates.minPrice));
            } else {
              next.delete("minPrice");
            }
          }

          if ("maxPrice" in updates) {
            if (updates.maxPrice !== undefined && updates.maxPrice < 2000000) {
              next.set("maxPrice", String(updates.maxPrice));
            } else {
              next.delete("maxPrice");
            }
          }

          if ("sort" in updates) {
            if (updates.sort && updates.sort !== "relevance") {
              next.set("sort", updates.sort);
            } else {
              next.delete("sort");
            }
          }

          if ("page" in updates) {
            if (updates.page && updates.page > 1) {
              next.set("page", String(updates.page));
            } else {
              next.delete("page");
            }
          } else if (resetPage) {
            next.delete("page"); // reset to page 1
          }

          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const resetAllFilters = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

  const hasActiveFilters = useMemo(() => {
    return Boolean(
      filters.search ||
        filters.subjectId ||
        filters.gradeLevels.length > 0 ||
        filters.courseId ||
        filters.classTypes.length > 0 ||
        filters.timeOfDay.length > 0 ||
        filters.statuses.length > 0 ||
        filters.teacherId ||
        (filters.minPrice !== undefined && filters.minPrice > 0) ||
        (filters.maxPrice !== undefined && filters.maxPrice < 2000000)
    );
  }, [filters]);

  return {
    filters,
    updateFilters,
    resetAllFilters,
    hasActiveFilters,
  };
}
