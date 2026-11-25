export type UserRole = "STUDENT" | "TEACHER" | "SPONSOR" | "ADMIN";

export type UserStatus = "ACTIVE" | "PENDING" | "SUSPENDED" | "BANNED";

export type SettableUserStatus = "ACTIVE" | "SUSPENDED" | "BANNED";

export interface AdminUserSummary {
  totalUsers: number;
  teachers: number;
  activeStudents: number;
  verification: {
    submitted: number;
    verified: number;
    pending: number;
    rejected: number;
  };
}

export interface StatusChangedByInfo {
  id: string;
  email?: string | null;
  fullName?: string | null;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  fullName: string | null;
  avatarUrl: string | null;
  verificationStatus?: string;
  createdAt: string;
  updatedAt: string;
  statusReason?: string | null;
  statusChangedAt?: string | null;
  statusChangedBy?: StatusChangedByInfo | null;
}

export interface AdminUserActivity {
  enrollments?: number;
  scholarships?: number;
  classes?: number;
  students?: number;
  contributions?: number;
  reportsAgainst?: number;
}

export interface AdminUserDetail extends AdminUserListItem {
  profile: Record<string, any> | null;
  activity: AdminUserActivity;
}

export interface UserStatusHistoryItem {
  id: string;
  action: string;
  fromStatus: UserStatus | null;
  toStatus: UserStatus;
  reason: string | null;
  performedBy: StatusChangedByInfo | null;
  performedAt: string;
}

export interface UserStatusHistoryResponse {
  items: UserStatusHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface UserStatusHistoryParams {
  page?: number;
  pageSize?: number;
}

export interface AdminUserListParams {
  role?: UserRole;
  status?: UserStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminUserListResponse {
  items: AdminUserListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface UpdateUserStatusPayload {
  status: SettableUserStatus;
  reason?: string;
}
