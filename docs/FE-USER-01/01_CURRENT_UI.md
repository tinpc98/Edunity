# BÁO CÁO HIỆN TRẠNG GIAO DIỆN — FE-USER-01
**Dự án:** EDUNITY V3  
**Phân hệ:** Admin User Management UI  
**Tác giả:** Senior Frontend Engineer  
**Ngày:** 21/11/2026  

---

## 1. Khảo sát giao diện hiện tại

Giao diện quản lý người dùng của Quản trị viên hiện được tập trung tại:
- **Tập tin chính:** [AdminUsersPage.tsx](file:///c:/CODE/Edunity/FrontEnd/src/features/admin/users/AdminUsersPage.tsx)
- **Kiểu dữ liệu:** [adminUser.ts](file:///c:/CODE/Edunity/FrontEnd/src/types/adminUser.ts)
- **Tầng dịch vụ:** [adminUser.service.ts](file:///c:/CODE/Edunity/FrontEnd/src/services/adminUser.service.ts)

### Cấu trúc hiện tại:
1. **Bảng danh sách người dùng (`AdminDataTable` / `Table`):**
   - Tìm kiếm theo từ khóa (tên, email), lọc theo vai trò (`STUDENT`, `TEACHER`, `SPONSOR`, `ADMIN`) và trạng thái (`ACTIVE`, `PENDING`, `SUSPENDED`, `BANNED`).
   - Các cột hiển thị: Thông tin người dùng, Mã định danh, Vai trò, Trạng thái (badge), Ngày tham gia, Thao tác.
2. **Modal chi tiết người dùng (Centered Modal ~820px):**
   - Header hiển thị avatar, họ tên, email, vai trò, ngày tham gia.
   - Mục 1: Thông tin tài khoản & bảo mật (Mã người dùng, Vai trò, Trạng thái vận hành, Ngày tham gia, Email xác thực, Lần cập nhật cuối).
   - Mục 2: Hồ sơ chi tiết theo vai trò (Student/Teacher/Sponsor).
   - Mục 3: Chỉ số hoạt động (Khóa học, lớp học, học viên, lượt tài trợ, khiếu nại liên quan).
3. **Modal thay đổi trạng thái (`Change Status Modal`):**
   - Lựa chọn trạng thái: `ACTIVE`, `SUSPENDED`, `BANNED`.
   - Nhập lý do (bắt buộc khi `SUSPENDED` hoặc `BANNED`).

---

## 2. Các điểm hạn chế & Yêu cầu cải tiến

### 2.1. Thiếu thông tin lý do khóa/tạm ngưng tài khoản
- Trong Modal chi tiết người dùng:
  - Khi một tài khoản bị `SUSPENDED` hoặc `BANNED`, giao diện chỉ hiển thị badge trạng thái màu vàng/đỏ đơn thuần.
  - **Không hiển thị:**
    - Lý do bị khóa/tạm ngưng (`statusReason`).
    - Thời điểm xử lý (`statusChangedAt`).
    - Quản trị viên đã thực hiện thao tác (`statusChangedBy`).
- Người quản trị khác khi xem hồ sơ không thể biết tại sao tài khoản bị tạm khóa, ai đã khóa và vào thời điểm nào.

### 2.2. Chưa có khu vực Lịch sử thay đổi trạng thái (Status History)
- Backend đã hỗ trợ API: `GET /api/admin/users/:id/status-history` với phân trang, trả về danh sách các lần chuyển đổi trạng thái (`USER_ACTIVE`, `USER_SUSPENDED`, `USER_BANNED`), lý do và người thực hiện.
- Frontend hiện chưa có API adapter, query hook, cũng như component để hiển thị lịch sử này.

### 2.3. Cải thiện trải nghiệm thao tác trạng thái (Status Actions)
- Sau khi đổi trạng thái thành công, cần đảm bảo đồng bộ lại:
  - Cache chi tiết người dùng (`adminUserKeys.detail(id)`).
  - Cache danh sách người dùng (`adminUserKeys.list(...)`).
  - Cache lịch sử trạng thái (`adminUserKeys.history(id, ...)`).
- Khi tài khoản được mở khóa về `ACTIVE`, tuyệt đối không tiếp tục hiển thị lý do khóa cũ như lý do hiện tại.
- Trường hợp tài khoản bị khóa nhưng thiếu dữ liệu lý do (legacy), cần hiển thị fallback chuẩn: *"Chưa có thông tin lý do"*, không tự ý tạo nội dung giả.

---

## 3. Kế hoạch triển khai

1. **Bước 1 — TypeScript Types:** Mở rộng `AdminUserDetail` và thêm `UserStatusHistoryItem`, `UserStatusHistoryResponse`.
2. **Bước 2 — Service API:** Bổ sung phương thức `getUserStatusHistory(id, params)` trong `AdminUserService`.
3. **Bước 3 — Detail UI:** Thiết kế Alert Card chuyên dụng hiển thị lý do khóa/tạm ngưng, thời gian, Admin phụ trách khi trạng thái là `SUSPENDED` hoặc `BANNED`.
4. **Bước 4 — Status History UI:** Tích hợp bảng lịch sử chuyển đổi trạng thái kèm loading, empty và error states.
5. **Bước 5 — Validation & Invalidation:** Bắt buộc trim reason, xử lý lỗi từ Backend, refetch đầy đủ query sau khi update.
