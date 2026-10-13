import { useQuery } from "@tanstack/react-query";
import { classDiscoveryService } from "../../../services/classDiscovery.service";
import { catalogKeys, catalogService } from "../../../services/catalog.service";
import { campaignKeys, campaignService } from "../../../services/campaign.service";
import type { ClassDiscoveryItem, FilterState } from "../../../types/classDiscovery";
import type { Category, ClassItem } from "../../../types/home";

const HOME_STALE_TIME = 1000 * 60 * 2;

const baseFilters: FilterState = {
  search: "",
  gradeLevels: [],
  classTypes: [],
  timeOfDay: [],
  statuses: ["OPEN"],
  sort: "upcoming",
  page: 1,
  pageSize: 100,
};

/** Open classes (closest start date first): shared by the THPT/THCS sections and teacher stats. */
export function useHomeOpenClasses() {
  return useQuery({
    queryKey: ["home", "openClasses"],
    queryFn: async () => (await classDiscoveryService.fetchClasses(baseFilters)).items,
    staleTime: HOME_STALE_TIME,
  });
}

export function useHomeFreeClasses(limit = 4) {
  return useQuery({
    queryKey: ["home", "freeClasses", limit],
    queryFn: async () =>
      (await classDiscoveryService.fetchClasses({ ...baseFilters, classTypes: ["FREE"], pageSize: limit })).items,
    staleTime: HOME_STALE_TIME,
  });
}

export function useHomeFeaturedTeachers(limit = 4) {
  return useQuery({
    queryKey: catalogKeys.teachers({ featured: true, limit }),
    queryFn: () => catalogService.getTeachers(true, limit),
    staleTime: HOME_STALE_TIME,
  });
}

export function useHomeCategories() {
  return useQuery({
    queryKey: catalogKeys.categories(),
    queryFn: async (): Promise<Category[]> => {
      const categories = await catalogService.getCategories();
      return categories.map((category) => ({
        id: category.id,
        title: category.name,
        badge: null,
        badgeColor: null,
        icon: "",
        groups: category.subjects.length > 0 ? [{ name: "MÔN HỌC", subjects: category.subjects }] : [],
      }));
    },
    staleTime: 1000 * 60 * 10,
  });
}

export function useHomeCampaigns() {
  return useQuery({
    queryKey: campaignKeys.list({ status: "OPEN_FOR_FUNDING", pageSize: 20 }),
    queryFn: () => campaignService.listCampaigns({ status: "OPEN_FOR_FUNDING", pageSize: 20 }),
    staleTime: HOME_STALE_TIME,
  });
}

export function toHomeClassItem(item: ClassDiscoveryItem): ClassItem {
  return {
    id: item.id,
    tag: item.gradeLevel ? item.gradeLabel : item.subjectName || item.courseTitle || "Lớp live",
    title: item.className,
    teacher: item.teacherName,
    rating: item.ratingAverage,
    sessionsCount: `Tối đa ${item.capacity} HS`,
    price: item.price,
    image: item.coverImage,
    startDate: item.startDate,
    schedule: item.scheduleText,
    seatsLeft: item.seatsLeft,
    capacity: item.capacity,
  };
}

export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "GV";
  const picked = words.length === 1 ? [words[0]] : [words[words.length - 2], words[words.length - 1]];
  return picked.map((w) => w.charAt(0).toUpperCase()).join("");
}
