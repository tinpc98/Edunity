/**
 * Types for Class Discovery Feature
 * Aligned with Backend MongoDB schema (Class, Course, Subject, User/Teacher)
 */

export type BackendGradeLevel =
  | "PRE_PRIMARY"
  | "GRADE_1"
  | "GRADE_2"
  | "GRADE_3"
  | "GRADE_4"
  | "GRADE_5"
  | "GRADE_6"
  | "GRADE_7"
  | "GRADE_8"
  | "GRADE_9"
  | "GRADE_10"
  | "GRADE_11"
  | "GRADE_12"
  | "UNIVERSITY"
  | "COLLEGE";

export type BackendClassType = "FREE" | "PAID";

export type BackendClassStatus =
  | "DRAFT"
  | "OPEN"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export interface ScheduleEntry {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  startTime: string; // "HH:mm" e.g. "19:30"
  endTime: string; // "HH:mm" e.g. "21:00"
}

/**
 * Raw Class Entity matching BackEnd/src/models/Class.js
 */
export interface ClassEntity {
  _id: string;
  courseId: string;
  courseTitle: string;
  teacherId: string;
  teacherName: string;
  categoryId: string;
  subjectId: string;
  gradeLevel: BackendGradeLevel | null;
  className: string;
  coverImage?: string;
  classType: BackendClassType;
  price: number;
  capacity: number;
  enrolledCount: number;
  enrollmentStart?: string;
  enrollmentEnd?: string;
  startDate?: string;
  endDate?: string;
  status: BackendClassStatus;
  schedule: ScheduleEntry[];
  ratingAverage: number;
  ratingCount: number;
}

export type TimeOfDay = "MORNING" | "AFTERNOON" | "EVENING";

/**
 * Frontend View Model for Class Discovery Card & Details
 * Derived cleanly from domain models without corrupting backend contracts.
 */
export interface ClassDiscoveryItem {
  id: string;
  title: string;
  courseId: string;
  courseTitle: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  teacherAvatar?: string;
  teacherTitle?: string;
  gradeLevel: BackendGradeLevel | null;
  gradeLabel: string;
  coverImage: string;
  classType: BackendClassType;
  price: number;
  formattedPrice: string;
  capacity: number;
  enrolledCount: number;
  seatsLeft: number;
  isFull: boolean;
  status: BackendClassStatus;
  statusLabel: string;
  canEnroll: boolean;
  startDate: string;
  scheduleText: string;
  timeOfDay: TimeOfDay;
  ratingAverage: number;
  ratingCount: number;
  totalSessions?: number;
}

export type SortOption =
  | "relevance"
  | "upcoming"
  | "price_asc"
  | "price_desc"
  | "rating";

export interface FilterState {
  search: string;
  subjectId?: string;
  gradeLevels: BackendGradeLevel[];
  courseId?: string;
  classTypes: BackendClassType[];
  minPrice?: number;
  maxPrice?: number;
  timeOfDay: TimeOfDay[];
  statuses: BackendClassStatus[];
  teacherId?: string;
  sort: SortOption;
  page: number;
  pageSize: number;
}

export interface FilterMetadata {
  subjects: Array<{ id: string; name: string; count: number }>;
  grades: Array<{ level: BackendGradeLevel; label: string; count: number }>;
  courses: Array<{ id: string; title: string; count: number }>;
  teachers: Array<{ id: string; name: string; count: number }>;
  minPrice: number;
  maxPrice: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
