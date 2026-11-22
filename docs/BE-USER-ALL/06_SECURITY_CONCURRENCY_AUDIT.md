# BÁO CÁO KIỂM TOÁN BẢO MẬT & CONCURRENCY — BE-USER-ALL
**Dự án:** EDUNITY V3  
**Phân hệ:** Admin User Management & Audit Consistency  
**Tác giả:** Senior Backend Engineer  
**Ngày:** 21/11/2026  

---

## 1. Kiểm toán tính toàn vẹn giao dịch (ACID Transaction Audit)

### 1.1. Atomic Multi-document Transaction
- **Mục tiêu:** Đảm bảo việc cập nhật trạng thái của bản ghi `User` và việc ghi nhận bản ghi `AuditLog` là **nguyên tử (atomic)**: hoặc cả hai cùng thành công, hoặc cả hai cùng bị rollback.
- **Hiện thực:**
  - Áp dụng `session = await mongoose.startSession()`.
  - Thực thi toàn bộ thao tác trong `session.withTransaction(async () => { ... })`.
  - Thao tác ghi User sử dụng `User.findOneAndUpdate(..., { session })`.
  - Thao tác ghi Audit sử dụng `audit(..., session)`.
  - Nếu có bất kỳ exception nào xảy ra trong transaction (ví dụ: DB Write Error trên bảng AuditLog):
    - `withTransaction` tự động phát lệnh `abortTransaction()`.
    - Dữ liệu `User` trên cơ sở dữ liệu MongoDB rollback về trạng thái ban đầu (`ACTIVE`).
    - Số lượng bản ghi `AuditLog` là 0.
- **Fail-Closed Principle:**
  - Nếu MongoDB không hỗ trợ transaction (ví dụ standalone mongo) hoặc `startSession()` ném exception, hàm throw lỗi ngay lập tức (HTTP 500), tuyệt đối **không fallback** sang ghi non-transactional nhằm tránh phát sinh trạng thái bất nhất.

### 1.2. Tránh Partial Writes & Side-effects ngoài Transaction
- Lệnh thu hồi Refresh Token (`authTokenService.revokeAllForUser`) và lệnh gửi thông báo kích hoạt (`notify`) là các hành động có tính side-effect không thể rollback nếu nằm trong session MongoDB.
- Toàn bộ các side-effects này được đặt **bên ngoài và chỉ chạy sau khi** `session.withTransaction` đã hoàn tất commit thành công (`committedDoc`).

---

## 2. Kiểm toán Concurrency & Race Conditions

### 2.1. Ngăn chặn Dirty Overwrite bằng Conditional Update
- Trong trường hợp 2 Admin cùng thực hiện thay đổi trạng thái của cùng một User tại cùng một thời điểm:
  - Nếu chỉ dùng `user.save()`, Admin thứ hai có thể vô tình ghi đè trạng thái của Admin thứ nhất mà không biết rằng trạng thái ban đầu đã bị thay đổi.
  - **Giải pháp:** Sử dụng conditional update với điều kiện:
    ```javascript
    User.findOneAndUpdate(
      { _id: currentUser._id, status: currentUser.status, ...NOT_DELETED },
      { $set: updateFields },
      { session, returnDocument: "after" }
    );
    ```
  - Nếu Admin A đã commit đổi trạng thái từ `ACTIVE` -> `SUSPENDED`, truy vấn của Admin B (vẫn dựa trên điều kiện `status: "ACTIVE"`) sẽ tìm thấy 0 bản ghi (`updated === null`).
  - Hệ thống lập tức ném mã lỗi:
    ```json
    {
      "success": false,
      "error": "CONCURRENT_UPDATE_CONFLICT",
      "message": "Concurrent user status update detected. Please retry."
    }
    ```
    (HTTP 409 Conflict), bảo vệ tính nhất quán tuyệt đối.

### 2.2. Xử lý Request lặp lại (Idempotency)
- Nếu Admin gửi lại request với cùng trạng thái mà User đang có (ví dụ tài khoản đã `SUSPENDED`, Admin lại gửi tiếp `SUSPENDED`):
  - Hệ thống kiểm tra `existingUser.status === status`.
  - Hàm lập tức trả về `presentUser(existingUser)` với HTTP 200 OK.
  - Không mở transaction, không tạo bản ghi `AuditLog` trùng lặp, không spam database.

---

## 3. Kiểm toán Bảo mật & Phân quyền (Authentication & Authorization)

### 3.1. Role-Based Access Control (RBAC)
- Tuyến API `/api/admin/users/:id/status` và `/api/admin/users/:id/status-history` được bảo vệ bằng middleware:
  `admin = [authMiddleware, requireRole("ADMIN")]`
- Mọi request từ `STUDENT`, `TEACHER`, hoặc `SPONSOR` đều bị chặn ngay tại middleware `requireRole` với HTTP 403 `FORBIDDEN`.
- Mọi request không có token hoặc token giả mạo bị chặn với HTTP 401 `UNAUTHORIZED`.

### 3.2. Ngăn ngừa tự khóa tài khoản & Khóa Admin chéo
- **Self-Ban Prevention:** Admin không được phép tự khóa hoặc tạm ngưng tài khoản của chính mình.
  `if (adminId && userId.toString() === adminId.toString()) throw validationError("You cannot change the status of your own account");`
  Trả về HTTP 400 `VALIDATION_ERROR`.
- **Peer-Admin Protection:** Tài khoản mang role `ADMIN` được bảo vệ tuyệt đối:
  `if (existingUser.role === "ADMIN") throw new AppError("Admin accounts cannot be suspended or banned here", "FORBIDDEN", 403);`
  Trả về HTTP 403 `FORBIDDEN`.

### 3.3. Thu hồi quyền truy cập tức thì (Immediate Token Enforcement)
- Khi một tài khoản bị `SUSPENDED` hoặc `BANNED`:
  1. **Access Token:** `authMiddleware` thực hiện đọc trạng thái tài khoản trực tiếp từ database trong mỗi request (`User.findById(payload.sub).lean()`). Nếu tài khoản có trạng thái nằm trong `["SUSPENDED", "BANNED"]`, middleware lập tức từ chối với HTTP 403 `ACCOUNT_BLOCKED`.
  2. **Refresh Token:** Toàn bộ refresh token của tài khoản được đánh dấu `revokedAt = new Date()` qua `authTokenService.revokeAllForUser(user._id)`. Mọi nỗ lực gọi `/api/auth/refresh` sau đó đều bị từ chối với HTTP 401 hoặc 403.
- Khi tài khoản được kích hoạt lại `ACTIVE`:
  - Người dùng có thể đăng nhập lại và lấy cặp token mới để tiếp tục sử dụng hệ thống bình thường.

### 3.4. Bảo vệ dữ liệu nhạy cảm (PII & Credentials Protection)
- Trong cả API chi tiết người dùng (`GET /api/admin/users/:id`), API danh sách (`GET /api/admin/users`), và API lịch sử (`GET /api/admin/users/:id/status-history`):
  - Trường `passwordHash` luôn bị loại bỏ (`-passwordHash`).
  - Trường `tokenVersion` không bị để lộ ra response.
  - `statusChangedBy` và `performedBy` chỉ trả thông tin tối thiểu: `{ id, email, fullName }`.
