/**
 * Session Domain Types matching BackEnd/src/models/Session.js
 */

export type SessionStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type SessionContentType = 'LESSON' | 'MATERIAL' | 'ASSIGNMENT';

export interface SessionContent {
  id: string;
  title: string;
  type: SessionContentType;
  description?: string;
  storageKey?: string | null;
  order: number;
}

export interface SessionRecording {
  providerRecordingId?: string | null;
  storageKey?: string | null;
  status: 'PROCESSING' | 'AVAILABLE' | 'FAILED';
  durationSeconds?: number | null;
  availableAt?: string | null;
  failureReason?: string | null;
}

export interface ApiSession {
  _id: string;
  id?: string;
  classId: string | { _id: string; className?: string; [key: string]: any };
  className: string;
  teacherId: string | { _id: string; fullName?: string; [key: string]: any };
  title: string;
  description?: string;
  contents?: Array<{
    _id?: string;
    id?: string;
    title: string;
    type: SessionContentType;
    description?: string;
    storageKey?: string | null;
    order: number;
  }>;
  startDatetime: string;
  endDatetime: string;
  meetingRoomId?: string;
  status: SessionStatus;
  recording?: SessionRecording | null;
  createdAt?: string;
  updatedAt?: string;
  canJoin?: boolean;
}

export interface Session {
  id: string;
  classId: string;
  className: string;
  teacherId: string;
  title: string;
  description?: string;
  contents: SessionContent[];
  startDatetime: string;
  endDatetime: string;
  meetingRoomId?: string;
  status: SessionStatus;
  recording?: SessionRecording | null;
  createdAt?: string;
  updatedAt?: string;
  canJoin?: boolean;
  sessionNumber?: number;
}

export interface CreateSessionPayload {
  title: string;
  description?: string;
  startDatetime: string; // ISO string
  endDatetime: string;   // ISO string
}

export interface CreateSessionsBulkPayload {
  sessions: CreateSessionPayload[];
}

export interface UpdateSessionPayload {
  title?: string;
  description?: string;
  startDatetime?: string;
  endDatetime?: string;
  status?: 'CANCELLED';
}

export interface PlannedSession {
  index: number;
  dayOfWeek: number;
  startDatetime: string;
  endDatetime: string;
}

export interface SessionAttendanceItem {
  _id: string;
  sessionId: string;
  classId: string;
  studentId: {
    _id: string;
    email: string;
    studentProfile?: {
      fullName?: string;
      avatarUrl?: string;
    };
  };
  attendanceStatus: 'PRESENT' | 'LATE' | 'ABSENT';
  joinedAt?: string;
  leftAt?: string;
}

/**
 * Derived FE-only read model for Schedule presentation.
 * Notice: This is NOT a persisted entity in Backend.
 */
export interface ScheduleItem {
  id: string;
  sessionId: string;
  classId: string;
  className: string;
  title: string;
  startDatetime: string;
  endDatetime: string;
  status: SessionStatus;
  canJoin?: boolean;
  roleContext: 'TEACHER' | 'STUDENT';
}

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  SCHEDULED: 'Đã lên lịch',
  IN_PROGRESS: 'Đang diễn ra',
  COMPLETED: 'Đã hoàn thành',
  CANCELLED: 'Đã hủy',
};

export const SESSION_STATUS_COLORS: Record<SessionStatus, string> = {
  SCHEDULED: 'blue',
  IN_PROGRESS: 'gold',
  COMPLETED: 'green',
  CANCELLED: 'default',
};
