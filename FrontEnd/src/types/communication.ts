export type NotificationType =
  | "NEW_MESSAGE"
  | "REVIEW_CREATED"
  | "REPORT_CREATED"
  | "REPORT_RESOLVED"
  | "REPORT_REJECTED"
  | "ENROLLMENT_CONFIRMED"
  | "TEACHER_VERIFIED"
  | "TEACHER_VERIFICATION_REJECTED"
  | "SCHOLARSHIP_AWARDED"
  | "SCHOLARSHIP_REJECTED"
  | "SCHOLARSHIP_NEED_MORE_INFORMATION"
  | "COURSE_PROPOSAL_APPROVED"
  | "COURSE_PROPOSAL_REJECTED"
  | "CLASS_APPROVED"
  | "CLASS_REJECTED"
  | "ACCOUNT_REACTIVATED"
  | string;

export interface ApiNotification {
  _id: string;
  userId: string;
  title: string;
  content?: string;
  type?: NotificationType;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  content: string;
  type: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  unreadCount: number;
}

// ==========================================
// Messaging Types
// ==========================================

export interface ApiConversationParticipant {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  role: "STUDENT" | "TEACHER";
  email?: string;
}

export interface ApiConversation {
  id: string;
  classId: string | null;
  className: string | null;
  participant: ApiConversationParticipant | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface ConversationItem {
  id: string;
  classId: string | null;
  className: string | null;
  participant: ApiConversationParticipant | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface ApiMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  isDeleted: boolean;
  createdAt: string;
}

export interface MessageItem {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  isDeleted: boolean;
  createdAt: string;
}

export interface MessageListResponse {
  items: MessageItem[];
  hasMore: boolean;
  nextBefore: string | null;
}

export interface OpenConversationPayload {
  participantId: string;
  classId?: string;
}

export interface SendMessagePayload {
  content: string;
}

// ==========================================
// Review Types
// ==========================================

export interface ApiReviewStudent {
  id: string | null;
  fullName: string | null;
  avatarUrl: string | null;
}

export interface ApiReview {
  _id: string;
  rating: number;
  comment?: string;
  classId?: string | null;
  className?: string | null;
  student?: ApiReviewStudent;
  createdAt: string;
  updatedAt?: string;
}

export interface ReviewItem {
  id: string;
  rating: number;
  comment: string;
  classId: string | null;
  className: string | null;
  student: ApiReviewStudent;
  createdAt: string;
}

export interface ReviewListResponse {
  items: ReviewItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  ratingAverage: number;
  ratingCount: number;
}

export interface CreateReviewPayload {
  rating: number;
  comment?: string;
}

// ==========================================
// Complaint / Report Types
// ==========================================

export const REPORT_TYPES = [
  "TEACHER_ABSENT",
  "TEACHING_QUALITY",
  "PAYMENT_DISPUTE",
  "INAPPROPRIATE_BEHAVIOR",
  "FRAUD",
  "OTHER",
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_STATUSES = ["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];

export interface ApiUserSummary {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  role: string;
  email?: string;
}

export interface ApiClassSummary {
  className: string;
  teacherName?: string;
}

export interface ApiReport {
  _id?: string;
  id?: string;
  reporterId?: string;
  reportedUserId?: string | null;
  classId?: string | null;
  type: ReportType;
  description: string;
  status: ReportStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  reporter?: ApiUserSummary | null;
  reportedUser?: ApiUserSummary | null;
  handledBy?: ApiUserSummary | null;
  class?: ApiClassSummary | null;
  createdAt: string;
  updatedAt?: string;
}

export interface ReportItem {
  id: string;
  type: ReportType;
  description: string;
  status: ReportStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  reporter: ApiUserSummary | null;
  reportedUser: ApiUserSummary | null;
  handledBy: ApiUserSummary | null;
  classSummary: ApiClassSummary | null;
  createdAt: string;
}

export interface ReportListResponse {
  items: ReportItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CreateReportPayload {
  type: ReportType;
  description: string;
  reportedUserId?: string;
  classId?: string;
}

export interface AdminUpdateReportPayload {
  status: ReportStatus;
  reviewNote?: string;
}
