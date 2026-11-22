# EDUNITY V3 — ADMIN NOTIFICATIONS AUDIT
## Document 03: Header Bell Synchronization & Deep Link Routing

### 1. Dữ liệu thật & Đồng bộ số đếm chuông (Header Bell)

#### A. Khảo sát dữ liệu MongoDB thực tế
- Bộ sưu tập `notifications` hiện có tổng cộng **2.212 bản ghi**.
- Tài khoản Quản trị viên `admin@example.com` (`_id: 6ae9eea27281b039f5b4a86f`):
  - Tổng số thông báo: **219 bản ghi**.
  - Số thông báo chưa đọc (`isRead: false`): **99 bản ghi**.
- Đây là nguồn gốc con số `99` (hoặc `98`) hiển thị trên huy hiệu chuông thông báo (Bell Badge) ở Header của Quản trị viên.

#### B. Cơ chế đồng bộ hai chiều (Bi-directional Synchronization)
- Khi Quản trị viên bấm "Đánh dấu tất cả đã đọc" hoặc "Đánh dấu đã đọc" một mục tại trang `/admin/notifications`:
  - Mutation gửi yêu cầu tới API backend (`POST /api/me/notifications/:id/read` hoặc `POST /api/me/notifications/read-all`).
  - TanStack Query kích hoạt `invalidateQueries({ queryKey: ["notifications"] })`.
  - Huy hiệu số đếm trên Header Bell được làm mới ngay lập tức (giảm dần hoặc về 0), không yêu cầu người dùng phải F5 tải lại trang.
- Tương tự, thao tác đọc thông báo từ popup chuông trên Header cũng đồng thời làm mới dữ liệu tại trang Quản trị viên.

---

### 2. Sửa lỗi điều hướng từ Header Bell Popover
- **Vấn đề trước đây:** Trong `NotificationPopover.tsx`, nút "Xem tất cả thông báo" gắn cứng hàm `navigate("/notifications")`. Khi Admin bấm vào, hệ thống chuyển hướng ra giao diện công khai ngoài `AdminLayout`.
- **Giải pháp:** Cập nhật hàm điều hướng kiểm tra vai trò người dùng:
  ```typescript
  const targetRoute = user?.role === "ADMIN" 
    ? ROUTES.ADMIN.NOTIFICATIONS 
    : "/notifications";
  navigate(targetRoute);
  ```
  Nhờ đó, Quản trị viên luôn được giữ trong không gian làm việc của Admin Portal.

---

### 3. Phân luồng Deep-link thông minh theo vai trò (`notificationRoute.ts`)
Hàm `getNotificationRoute(notification, userRole)` được chuẩn hóa để điều hướng chính xác các sự kiện quản trị:

| Tiền tố / Phân loại sự kiện | Điều hướng dành cho ADMIN (`userRole === "ADMIN"`) | Ghi chú nghiệp vụ |
| :--- | :--- | :--- |
| `REFUND_` | `/admin/refunds` (kèm query search nếu có mã) | Mở trực tiếp màn hình Quản lý hoàn tiền |
| `PAYOUT_` | `/admin/payouts` | Mở màn hình Rút tiền & Quyết toán giáo viên |
| `RECONCIL_` | `/admin/reconciliations` | Mở Hàng đợi đối soát giao dịch |
| `PAYMENT_` | `/admin/payments` | Mở Quản lý thanh toán học phí |
| `TEACHER_VERIF_` | `/admin/teachers/verifications` | Mở Hồ sơ duyệt hồ sơ giáo viên |
| `CLASS_`, `COURSE_` | `/admin/classes` | Mở Quản lý lớp học & khóa học |
| `SCHOLARSHIP_` | `/admin/scholarship-applications` | Mở Quản lý đơn xin học bổng |
| `ADMIN_`, `INCIDENT_`, `DISCIPLINE_`, `REPORT_` | `/admin/reports` | Mở Quản lý báo cáo vi phạm & sự cố |
| Khác / Fallback | `/admin/notifications` | Giữ nguyên tại trang thông báo Admin |

*Lưu ý an toàn:* Đối với các vai trò khác (`TEACHER`, `STUDENT`), hệ thống vẫn duy trì các route tương ứng (như `/teacher/earnings`, `/student/refunds`...), không làm ảnh hưởng luồng nghiệp vụ của người dùng thông thường.

---

### 4. Bảo mật dữ liệu & Phạm vi truy cập (Security & Scoping)
- Backend API (`/api/me/notifications`) sử dụng `req.user.id` từ JWT token để truy vấn và cập nhật.
- Mọi thao tác đọc hay đánh dấu đọc đều được giới hạn tuyệt đối (`scoped`) theo `userId`.
- Tuyệt đối không có khả năng đọc trộm hoặc đánh dấu nhầm thông báo của tài khoản khác.
