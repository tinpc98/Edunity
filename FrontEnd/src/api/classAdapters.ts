import type {
  ApiClass,
  ClassModel,
  ClassAvailability,
  PaginatedClasses,
} from "../types/class";
import { CLASS_STATUS_LABELS, formatClassPrice } from "../types/class";
import type {
  ClassDiscoveryItem,
  TimeOfDay,
  BackendGradeLevel,
} from "../types/classDiscovery";
import { GRADE_LEVEL_LABELS } from "../types/catalog";

const DAY_NAMES = [
  "Chủ nhật",
  "Thứ 2",
  "Thứ 3",
  "Thứ 4",
  "Thứ 5",
  "Thứ 6",
  "Thứ 7",
];

export function deriveScheduleText(schedule?: { dayOfWeek: number; startTime: string; endTime: string }[]): string {
  if (!schedule || schedule.length === 0) return "Lịch học linh hoạt";
  const days = schedule.map((s) => DAY_NAMES[s.dayOfWeek] || `Thứ ${s.dayOfWeek}`).join(" & ");
  const time = `${schedule[0].startTime} - ${schedule[0].endTime}`;
  return `${days} • ${time}`;
}

export function deriveScheduleDaysAndTime(schedule?: { dayOfWeek: number; startTime: string; endTime: string }[]): {
  days: string;
  time: string;
} {
  if (!schedule || schedule.length === 0) {
    return { days: "Linh hoạt", time: "08:30 – 10:30" };
  }
  const days = schedule.map((s) => DAY_NAMES[s.dayOfWeek] || `Thứ ${s.dayOfWeek}`).join(" & ");
  const time = `${schedule[0].startTime} – ${schedule[0].endTime}`;
  return { days, time };
}

export function deriveTimeOfDay(schedule?: { dayOfWeek: number; startTime: string; endTime: string }[]): TimeOfDay {
  if (!schedule || schedule.length === 0) return "EVENING";
  const firstStartTime = schedule[0].startTime;
  if (firstStartTime < "12:00") return "MORNING";
  if (firstStartTime < "18:00") return "AFTERNOON";
  return "EVENING";
}

function formatDateVN(dateStr?: string | null): string {
  if (!dateStr) return "sắp công bố";
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function adaptClassFromApi(apiClass: ApiClass): ClassModel {
  const price = Number(apiClass.price ?? 0);
  const capacity = Number(apiClass.capacity ?? 0);
  const enrolledCount = Number(apiClass.enrolledCount ?? 0);
  const seatsLeft = Math.max(0, capacity - enrolledCount);
  const isFull = capacity > 0 && enrolledCount >= capacity;
  const status = apiClass.status || "DRAFT";
  const classType = apiClass.classType || "FREE";

  return {
    id: apiClass._id || (apiClass as any).id,
    courseId: typeof apiClass.courseId === "object" && (apiClass.courseId as any)?._id
      ? (apiClass.courseId as any)._id
      : String(apiClass.courseId || ""),
    courseTitle: apiClass.courseTitle || (apiClass as any).course?.title || "",
    teacherId: typeof apiClass.teacherId === "object" && (apiClass.teacherId as any)?._id
      ? (apiClass.teacherId as any)._id
      : String(apiClass.teacherId || ""),
    teacherName: apiClass.teacherName || apiClass.teacher?.fullName || "",
    categoryId: typeof apiClass.categoryId === "object" && (apiClass.categoryId as any)?._id
      ? (apiClass.categoryId as any)._id
      : String(apiClass.categoryId || ""),
    subjectId: typeof apiClass.subjectId === "object" && (apiClass.subjectId as any)?._id
      ? (apiClass.subjectId as any)._id
      : String(apiClass.subjectId || ""),
    gradeLevel: apiClass.gradeLevel ?? null,
    className: apiClass.className || "",
    description: apiClass.description || "",
    coverImage: apiClass.coverImage,
    classType,
    price,
    formattedPrice: formatClassPrice(price, classType),
    capacity,
    enrolledCount,
    seatsLeft,
    isFull,
    enrollmentStart: apiClass.enrollmentStart || null,
    enrollmentEnd: apiClass.enrollmentEnd || null,
    startDate: apiClass.startDate || null,
    endDate: apiClass.endDate || null,
    status,
    statusLabel: CLASS_STATUS_LABELS[status] || status,
    schedule: Array.isArray(apiClass.schedule) ? apiClass.schedule : [],
    ratingAverage: Number(apiClass.ratingAverage ?? 0),
    ratingCount: Number(apiClass.ratingCount ?? 0),
    reviewedBy: apiClass.reviewedBy || null,
    reviewedAt: apiClass.reviewedAt || null,
    reviewNote: apiClass.reviewNote || null,
    createdAt: apiClass.createdAt,
    updatedAt: apiClass.updatedAt,
    teacher: apiClass.teacher || null,
    course: apiClass.course || null,
    sessions: apiClass.sessions || [],
    sessionCount: apiClass.sessionCount ?? apiClass.sessions?.length ?? 0,
  };
}

export function adaptClassListFromApi(response: {
  items: ApiClass[];
  total: number;
  page: number;
  pageSize: number;
  totalPages?: number;
}): PaginatedClasses {
  const items = (response.items || []).map(adaptClassFromApi);
  const total = Number(response.total ?? 0);
  const page = Number(response.page ?? 1);
  const pageSize = Number(response.pageSize ?? 12);
  const totalPages = (response.totalPages ?? Math.ceil(total / pageSize)) || 1;

  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
  };
}

export function adaptClassAvailability(data: any): ClassAvailability {
  const capacity = Number(data.capacity ?? 0);
  const enrolledCount = Number(data.enrolledCount ?? 0);
  const remaining = Number(data.remaining ?? Math.max(0, capacity - enrolledCount));
  const price = Number(data.price ?? 0);
  const classType = data.classType || (price > 0 ? "PAID" : "FREE");

  return {
    capacity,
    enrolledCount,
    remaining,
    enrollmentOpen: Boolean(data.enrollmentOpen),
    classType,
    price,
  };
}

export function adaptClassModelToDiscoveryItem(cls: ClassModel): ClassDiscoveryItem {
  const scheduleText = deriveScheduleText(cls.schedule);
  const { days: scheduleDays, time: scheduleTime } = deriveScheduleDaysAndTime(cls.schedule);
  const timeOfDay = deriveTimeOfDay(cls.schedule);
  const gradeLevel = (cls.gradeLevel as BackendGradeLevel) || null;
  const gradeLabel = gradeLevel ? GRADE_LEVEL_LABELS[gradeLevel] || gradeLevel : "Khối lớp";
  const canEnroll = cls.status === "OPEN" && !cls.isFull;

  return {
    id: cls.id,
    className: cls.className,
    title: cls.className,
    courseId: cls.courseId,
    courseTitle: cls.courseTitle,
    subjectId: cls.subjectId,
    subjectName: (cls.course as any)?.subjectName || "",
    teacherId: cls.teacherId,
    teacherName: cls.teacherName || cls.teacher?.fullName || "Giảng viên",
    teacherAvatar: cls.teacher?.avatarUrl || undefined,
    teacherTitle: cls.teacher?.qualificationSummary || "Giảng viên Edunity",
    qualificationSummary: cls.teacher?.qualificationSummary || undefined,
    teacherBiography: cls.teacher?.biography || undefined,
    gradeLevel,
    gradeLabel,
    coverImage:
      cls.coverImage ||
      "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=600&q=80",
    classType: cls.classType,
    price: cls.price,
    formattedPrice: cls.formattedPrice,
    capacity: cls.capacity,
    enrolledCount: cls.enrolledCount,
    seatsLeft: cls.seatsLeft,
    isFull: cls.isFull,
    status: cls.status as any,
    statusLabel: cls.statusLabel,
    canEnroll,
    startDate: formatDateVN(cls.startDate),
    endDate: cls.endDate || undefined,
    formattedEndDate: cls.endDate ? formatDateVN(cls.endDate) : undefined,
    scheduleText,
    scheduleDays,
    scheduleTime,
    timeOfDay,
    ratingAverage: cls.ratingAverage,
    ratingCount: cls.ratingCount,
    totalSessions: cls.sessionCount,
    description: cls.description,
  };
}
