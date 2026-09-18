export type TeacherClassStatus = 'ACTIVE' | 'ENROLLING' | 'UPCOMING' | 'COMPLETED';
export type TeacherClassType = 'FREE' | 'PAID';

export interface TeacherClass {
  id: string;
  name: string;
  courseId: string;
  courseName: string;
  subject: string;
  grade: string;
  type: TeacherClassType;
  status: TeacherClassStatus;
  schedule: string;
  startDate: string;
  endDate?: string;
  price?: number;
  capacity: number;
  enrolled: number;
  rating: number;
  reviewCount: number;
  totalSessions: number;
  completedSessions: number;
  nextSession?: {
    date: string;
    time: string;
    sessionNumber: number;
  };
  thumbnail?: string;
}

export interface CourseCatalogItem {
  id: string;
  title: string;
  subject: string;
  grade: string;
  description: string;
  totalLessons: number;
  type: TeacherClassType;
}

export interface TeacherSchedule {
  dayOfWeek: string; // e.g., 'Thứ 3'
  startTime: string; // '20:00'
  endTime: string;   // '21:30'
}

export type SessionStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED';

export interface TeacherSession {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  status: SessionStatus;
  attendanceCount?: number;
  totalStudents: number;
  duration?: number; // minutes
}

export interface TeacherStudent {
  id: string;
  name: string;
  email: string;
  joinDate: string;
  status: 'CONFIRMED' | 'COMPLETED' | 'PENDING';
  attendanceRate: number;
  averageScore?: number;
  lastAttended?: string;
}

export interface TeacherReview {
  id: string;
  studentName: string;
  studentAvatar?: string;
  rating: number;
  date: string;
  comment: string;
}
