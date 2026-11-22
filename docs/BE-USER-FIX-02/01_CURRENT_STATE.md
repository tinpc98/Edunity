# BE-USER-FIX-02: CURRENT STATE AUDIT

## 1. Bối cảnh & Hiện trạng hệ thống (Source of Truth)

Sau khi hoàn thành **BE-USER-ALL** và **BE-USER-FIX-01**, hệ thống quản lý tài khoản người dùng của EDUNITY V3 có cấu trúc như sau:

### 1.1. Luồng cập nhật trạng thái (`updateUserStatus`)
- Khi Admin thực hiện khóa (`BANNED`) hoặc tạm ngưng (`SUSPENDED`) tài khoản:
  1. Kiểm tra validation (lý do khóa bắt buộc, độ dài tối đa 500 ký tự).
  2. Bắt đầu một session MongoDB Multi-Document Transaction (`session.withTransaction`).
  3. Thực hiện conditional update trên model `User`:
     `findOneAndUpdate({ _id, status: currentUser.status }, { $set: updateFields }, { session })`.
  4. Ghi nhận hành động trong `AuditLog` với `actorAdminId`, `beforeState`, `afterState` trong cùng transaction session.
  5. Transaction được commit thành công.

### 1.2. Luồng thu hồi token sau commit (`Post-Commit Side-Effects`)
- Tại BE-USER-FIX-01:
  - Hàm `safeRevokeAllForUser(userId, maxAttempts = 3, delayMs = 20)` được gọi ngay sau khi commit transaction.
  - Vòng lặp `for` thử lại tối đa 3 lần trong RAM/process nếu gặp lỗi tạm thời.
  - Nếu cả 3 lần thử đều thất bại, hàm log `console.error` và trả về kết quả lỗi mà không ném exception làm sập request (tránh trả về HTTP 500 gây hiểu lầm cho Admin rằng thao tác khóa thất bại).

### 1.3. Cơ chế kiểm soát xác thực hiện tại (`authMiddleware.js` & `authTokenService.js`)
- **Access Token:** `authMiddleware.js` luôn truy vấn trực tiếp `User.findById(payload.sub).lean()` trên từng request. Nếu `BLOCKED_STATUSES.includes(user.status)` (`SUSPENDED`, `BANNED`), middleware lập tức trả về `403 ACCOUNT_BLOCKED`.
- **Refresh Token:** Endpoint `/auth/refresh` gọi `assertAccountUsable(user)`. Khi user có trạng thái `SUSPENDED` hoặc `BANNED`, hàm này lập tức ném lỗi `403 ACCOUNT_BLOCKED`, ngăn chặn triệt để việc cấp access token mới.
- **RefreshToken Collection:** Bảng `RefreshToken` lưu trữ hash của token, `issuedAt`, `expiresAt`, `revokedAt`, và `replacedByTokenId`. Thao tác revoke đánh dấu `revokedAt: new Date()`.
