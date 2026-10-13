export type UserRole = "STUDENT" | "TEACHER" | "SPONSOR" | "ADMIN";

export type UserStatus = "ACTIVE" | "PENDING" | "SUSPENDED" | "BANNED";

export type SettableUserStatus = "ACTIVE" | "SUSPENDED" | "BANNED";

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
