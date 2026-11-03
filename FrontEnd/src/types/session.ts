/**
 * Session Domain Types matching BackEnd/src/models/Session.js
 */

export type SessionStatus =
  | 'SCHEDULED'
  | 'WAITING'
  | 'IN_PROGRESS'
  | 'INTERRUPTED'
  | 'COMPLETED'
  | 'CANCELLED';

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
  roomState?: string;
  lifecycleState?: string;
  endReason?: string | null;
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
  roomState?: string;
  lifecycleState?: string;
  endReason?: string | null;
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
  attendanceStatus: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED' | 'NOT_EVALUATED';
  joinedAt?: string;
  leftAt?: string;
  hasVerifiedConnection?: boolean;
  isCurrentlyConnected?: boolean;
  reconnectionCount?: number;
  rawOnlineSeconds?: number;
  waitingRoomSeconds?: number;
  scheduledDurationSeconds?: number;
  scheduledOnlineSeconds?: number;
  teacherStudentOverlapSeconds?: number;
  attendancePercentage?: number;
  lateArrivalSeconds?: number;
  isLate?: boolean;
  evaluationStatus?: string;
  evaluationReason?: string | null;
}

export type VideoProviderType = 'LIVEKIT' | 'EDUNITY_DEV';
export type ClassroomRole = 'HOST' | 'PARTICIPANT';

export interface JoinSessionResponse {
  sessionId: string;
  roomId: string;
  provider: VideoProviderType;
  serverUrl: string | null;
  accessToken: string;
  role: ClassroomRole;
  expiresAt: string;
  firstJoinDeadlineAt?: string | null;
  roomState?: string;
  isWaitingRoom?: boolean;
  isReconnect?: boolean;
}

export interface SessionLiveStatusResponse {
  sessionId: string;
  title: string;
  className: string;
  status: SessionStatus;
  roomState: string;
  lifecycleState: string;
  endReason?: string | null;
  startDatetime: string;
  endDatetime: string;
  preOpenAt: string;
  studentFirstJoinDeadlineAt: string;
  autoCompleteAt: string;
  isWaitingRoom: boolean;
  isInTeachingPeriod: boolean;
  isOvertimeGracePeriod: boolean;
  teacherPresence?: {
    firstPreOpenJoinAt?: string | null;
    firstTeachingJoinAt?: string | null;
    isCurrentlyConnected?: boolean;
    totalOnlineSeconds?: number;
    scheduledOnlineSeconds?: number;
    yellowWarningTriggeredAt?: string | null;
    redViolationTriggeredAt?: string | null;
    noShowCancelledAt?: string | null;
    earlyLeaveTriggeredAt?: string | null;
    overtimeRemindedAt?: string | null;
  };
  myAttendance?: {
    attendanceStatus: string;
    attendancePercentage: number;
    scheduledOnlineSeconds: number;
    scheduledDurationSeconds: number;
    waitingRoomSeconds: number;
    lateArrivalSeconds: number;
    isLate: boolean;
    reconnectionCount?: number;
  } | null;
  violations?: Array<{
    _id: string;
    violationCategory: string;
    violationType: string;
    severity: 'YELLOW' | 'RED' | 'NO_SHOW' | 'EARLY_LEAVE';
    detectedAt: string;
    reviewStatus: string;
  }>;
}

export type IncidentType =
  | 'DEVICE_FAILURE'
  | 'INTERNET_FAILURE'
  | 'POWER_OUTAGE'
  | 'HEALTH_ISSUE'
  | 'PERSONAL_EMERGENCY'
  | 'PLATFORM_FAILURE'
  | 'OTHER';

export type IncidentRequestedAction =
  | 'EXCUSE_LATE'
  | 'CANCEL_SESSION'
  | 'RESCHEDULE_SESSION'
  | 'EXCUSE_INTERRUPTION';

export interface SubmitIncidentReportPayload {
  incidentType: IncidentType;
  description: string;
  requestedAction: IncidentRequestedAction;
  evidenceFiles?: Array<{ storageKey: string; originalName?: string; mimeType?: string } | string>;
  proposedSchedule?: {
    startDatetime: string;
    endDatetime: string;
    title?: string;
  };
}

export interface RequestReschedulePayload {
  proposedStartDatetime: string;
  proposedEndDatetime: string;
  proposedTitle?: string;
  reason: string;
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
  WAITING: 'Phòng chờ (10p)',
  IN_PROGRESS: 'Đang diễn ra',
  INTERRUPTED: 'Tạm gián đoạn',
  COMPLETED: 'Đã hoàn thành',
  CANCELLED: 'Đã hủy',
};

export const SESSION_STATUS_COLORS: Record<SessionStatus, string> = {
  SCHEDULED: 'blue',
  WAITING: 'cyan',
  IN_PROGRESS: 'gold',
  INTERRUPTED: 'volcano',
  COMPLETED: 'green',
  CANCELLED: 'default',
};
