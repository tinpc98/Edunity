export type ClassStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "OPEN"
  | "REJECTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export type ClassType = "FREE" | "PAID";

export interface ScheduleEntry {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
}

export interface TeacherSummary {
  id: string;
  fullName: string;
  avatarUrl?: string | null;
  biography?: string | null;
  qualificationSummary?: string | null;
  ratingAverage?: number;
  ratingCount?: number;
  email?: string;
  status?: string;
  verificationStatus?: string;
}

export interface ApiClass {
  _id: string;
  courseId: string;
  courseTitle: string;
  teacherId: string;
  teacherName: string;
  categoryId: string;
  subjectId: string;
  gradeLevel?: string | null;
  className: string;
  description?: string;
  coverImage?: string;
  classType: ClassType;
  price: number | string;
  capacity: number;
  enrolledCount: number;
  enrollmentStart?: string | null;
  enrollmentEnd?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status: ClassStatus;
  updatedBy?: string | null;
  schedule?: ScheduleEntry[];
  ratingAverage?: number;
  ratingCount?: number;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  createdAt?: string;
  updatedAt?: string;
  teacher?: TeacherSummary | null;
  course?: {
    id?: string;
    _id?: string;
    title: string;
    slug?: string;
    description?: string;
    level?: string;
    gradeLevel?: string;
    subjectName?: string;
    categoryName?: string;
    status?: string;
  } | null;
  sessions?: any[];
  sessionCount?: number;
}

export interface ClassModel {
  id: string;
  courseId: string;
  courseTitle: string;
  teacherId: string;
  teacherName: string;
  categoryId: string;
  subjectId: string;
  gradeLevel?: string | null;
  className: string;
  description?: string;
  coverImage?: string;
  classType: ClassType;
  price: number;
  formattedPrice: string;
  capacity: number;
  enrolledCount: number;
  seatsLeft: number;
  isFull: boolean;
  enrollmentStart?: string | null;
  enrollmentEnd?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status: ClassStatus;
  statusLabel: string;
  schedule: ScheduleEntry[];
  ratingAverage: number;
  ratingCount: number;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  createdAt?: string;
  updatedAt?: string;
  teacher?: TeacherSummary | null;
  course?: ApiClass["course"];
  sessions?: any[];
  sessionCount?: number;
}

export interface ClassAvailability {
  capacity: number;
  enrolledCount: number;
  remaining: number;
  enrollmentOpen: boolean;
  classType: ClassType;
  price: number;
}

export interface CreateClassPayload {
  courseId: string;
  className: string;
  description?: string;
  coverImage?: string;
  classType: ClassType;
  price?: number;
  capacity: number;
  enrollmentStart?: string | null;
  enrollmentEnd?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  schedule?: ScheduleEntry[];
}

export interface UpdateClassPayload {
  courseId?: string;
  className?: string;
  description?: string;
  coverImage?: string;
  classType?: ClassType;
  price?: number;
  capacity?: number;
  enrollmentStart?: string | null;
  enrollmentEnd?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  schedule?: ScheduleEntry[];
}

export interface ReviewClassPayload {
  reviewNote?: string;
}

export interface ClassListFilters {
  search?: string;
  subjectId?: string;
  courseId?: string;
  teacherId?: string;
  statuses?: string;
  classTypes?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: "price_asc" | "price_desc" | "upcoming" | "createdAt";
  page?: number;
  pageSize?: number;
}

export interface PaginatedClasses<T = ClassModel> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const CLASS_STATUS_LABELS: Record<ClassStatus, string> = {
  DRAFT: "Bản nháp",
  PENDING_APPROVAL: "Chờ duyệt",
  OPEN: "Đang mở đăng ký",
  REJECTED: "Bị từ chối",
  IN_PROGRESS: "Đang diễn ra",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
};

export const CLASS_STATUS_COLORS: Record<ClassStatus, string> = {
  DRAFT: "default",
  PENDING_APPROVAL: "warning",
  OPEN: "processing",
  REJECTED: "error",
  IN_PROGRESS: "success",
  COMPLETED: "purple",
  CANCELLED: "default",
};

export function formatClassPrice(price: number, classType: ClassType): string {
  if (classType === "FREE" || price === 0) {
    return "Miễn phí";
  }
  return `${price.toLocaleString("vi-VN")}đ`;
}

export function formatDayOfWeek(dayOfWeek: number): string {
  switch (dayOfWeek) {
    case 0: return "Chủ nhật";
    case 1: return "Thứ 2";
    case 2: return "Thứ 3";
    case 3: return "Thứ 4";
    case 4: return "Thứ 5";
    case 5: return "Thứ 6";
    case 6: return "Thứ 7";
    default: return `Thứ ${dayOfWeek + 1}`;
  }
}

export type PaymentSourceType = "FREE" | "DIRECT_PAYMENT" | "SCHOLARSHIP" | "MIXED";

export interface ClassStudentRosterItem {
  enrollmentId: string;
  studentId: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  email: string | null;
  enrollmentStatus: string;
  paymentSource: PaymentSourceType;
  enrolledAt: string;
}

