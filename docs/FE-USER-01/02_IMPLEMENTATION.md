# CHI TIẾT TRIỂN KHAI GIAO DIỆN — FE-USER-01
**Dự án:** EDUNITY V3  
**Phân hệ:** Admin User Management UI  
**Tác giả:** Senior Frontend Engineer  
**Ngày:** 21/11/2026  

---

## 1. Danh sách các file thay đổi

| STT | Tập tin | Thành phần | Nội dung thay đổi |
|---|---|---|---|
| 1 | [adminUser.ts](file:///c:/CODE/Edunity/FrontEnd/src/types/adminUser.ts) | TypeScript Types | Mở rộng `AdminUserListItem` & `AdminUserDetail` với `statusReason`, `statusChangedAt`, `statusChangedBy`; định nghĩa `UserStatusHistoryItem`, `UserStatusHistoryResponse`, `UserStatusHistoryParams`. |
| 2 | [adminUser.service.ts](file:///c:/CODE/Edunity/FrontEnd/src/services/adminUser.service.ts) | Service & Query Keys | Bổ sung query key `adminUserKeys.history`, triển khai phương thức `getUserStatusHistory(id, params)`. |
| 3 | [AdminUsersPage.tsx](file:///c:/CODE/Edunity/FrontEnd/src/features/admin/users/AdminUsersPage.tsx) | Page Component | Tích hợp khối hiển thị lý do khóa/tạm ngưng (`statusReason`), tích hợp bảng lịch sử chuyển đổi trạng thái có phân trang (`Status History`), chuẩn hóa validator và cơ chế query invalidation. |

---

## 2. Chi tiết kỹ thuật mã nguồn

### 2.1. TypeScript Types (`adminUser.ts`)
```typescript
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
```

### 2.2. Service API (`adminUser.service.ts`)
```typescript
export const adminUserKeys = {
  all: ["admin", "users"] as const,
  list: (params?: AdminUserListParams) => ["admin", "users", "list", params] as const,
  detail: (id: string) => ["admin", "users", "detail", id] as const,
  history: (id: string, params?: UserStatusHistoryParams) => ["admin", "users", "history", id, params] as const,
};

export class AdminUserService {
  // ...
  async getUserStatusHistory(id: string, params: UserStatusHistoryParams = {}): Promise<UserStatusHistoryResponse> {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set("page", String(params.page));
    if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));

    const query = searchParams.toString();
    const endpoint = `/admin/users/${id}/status-history${query ? `?${query}` : ""}`;
    return apiClient<UserStatusHistoryResponse>(endpoint, { method: "GET" });
  }
}
```

### 2.3. Hiển thị Trạng thái & Lý do trong User Detail Modal (`AdminUsersPage.tsx`)
- **Trạng thái tài khoản:**
  - `ACTIVE`: Đang hoạt động (success badge).
  - `SUSPENDED`: Tạm ngưng (warning badge).
  - `BANNED`: Đã khóa (error badge).
- **Khối thông tin lý do chuyên dụng (Alert Callout):**
  - Chỉ hiển thị khi `status === "SUSPENDED" || status === "BANNED"`.
  - Hiển thị:
    - Lý do khóa/tạm ngưng: `userDetail.statusReason || "Chưa có thông tin lý do"`.
    - Thời gian xử lý: `dayjs(userDetail.statusChangedAt).format("HH:mm DD/MM/YYYY")`.
    - Admin thực hiện: `userDetail.statusChangedBy?.fullName || userDetail.statusChangedBy?.email || "Quản trị viên"`.
  - Khi trạng thái là `ACTIVE`: Ẩn hoàn toàn khối này, không bao giờ hiển thị lý do cũ như lý do hiện tại.
  - Trường hợp không có dữ liệu: Hiển thị *"Chưa có thông tin lý do"*, không tự sinh nội dung giả mạo.

### 2.4. Khu vực Lịch sử thay đổi trạng thái (Status History Section)
- Thêm Section riêng biệt trong Modal chi tiết với icon `AuditOutlined`.
- Sử dụng TanStack Query `useQuery` gắn với `adminUserKeys.history(selectedUserId, ...)`.
- Tự động reset trang về 1 khi chọn người dùng mới (`useEffect`).
- Đầy đủ 4 trạng thái:
  - **Loading State:** Icon quay `SyncOutlined spin` kèm thông báo *"Đang tải lịch sử trạng thái..."*.
  - **Error State:** `<Alert type="error" />` kèm nút *"Thử lại"* gọi `refetchStatusHistory()`.
  - **Empty State:** Khung bo nét đứt xám *"Chưa có lịch sử thay đổi trạng thái cho tài khoản này."*.
  - **Success / Data State:** Danh sách các lượt chuyển đổi trạng thái:
    - Huy hiệu chuyển đổi: `item.fromStatus` → `item.toStatus`.
    - Thời gian thực hiện: `HH:mm DD/MM/YYYY`.
    - Lý do: Khối xám bo góc trích dẫn chi tiết nội dung.
    - Người thực hiện: Admin hoặc Hệ thống.
  - **Pagination:** Tích hợp `Pagination` Ant Design (size small) khi tổng số bản ghi vượt quá kích thước trang (5 bản ghi/trang).

### 2.5. Xử lý thao tác trạng thái (Status Actions) & Validation
- **Form Validator:**
  - Bắt buộc nhập lý do khi chọn `SUSPENDED` hoặc `BANNED`.
  - Kiểm tra `!value || !value.trim()` chống nhập khoảng trắng vô nghĩa.
  - Giới hạn tối đa 500 ký tự (`value.trim().length <= 500`).
- **Mutation & Query Invalidation:**
  - Không cập nhật UI như thành công khi API ném lỗi; hiển thị thông báo lỗi `message.error(err?.message)`.
  - Khi thành công:
    - Gọi `queryClient.invalidateQueries({ queryKey: adminUserKeys.all })` để làm mới danh sách ngoài bảng.
    - Gọi `refetchUserDetail()` để cập nhật tức thì dữ liệu chi tiết trong modal.
    - Gọi `refetchStatusHistory()` để nạp bản ghi kiểm toán vừa tạo vào bảng lịch sử.
    - Đóng modal nhập và reset form.
