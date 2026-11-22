# BÁO CÁO HIỆN TRẠNG BACKEND — BE-USER-ALL
**Dự án:** EDUNITY V3  
**Phân hệ:** Admin User Management & Audit Consistency  
**Tác giả:** Senior Backend Engineer  
**Ngày:** 21/11/2026  

---

## 1. Tổng quan phân hệ hiện tại

Hệ thống EDUNITY V3 hiện đã triển khai các chức năng quản trị tài khoản người dùng cơ bản tại:
- Routes: [communityRoutes.js](file:///c:/CODE/Edunity/BackEnd/src/routes/communityRoutes.js#L38-L42)
  - `GET /api/admin/users`: Danh sách người dùng, lọc theo `role`, `status`, tìm kiếm chuỗi qua email/họ tên, có phân trang.
  - `GET /api/admin/users/:id`: Xem chi tiết thông tin tài khoản, hồ sơ (Student/Teacher/Sponsor) và chỉ số hoạt động.
  - `PATCH /api/admin/users/:id/status`: Khóa (`BANNED`), tạm ngưng (`SUSPENDED`), hoặc kích hoạt lại (`ACTIVE`).
- Controller: [communityController.js](file:///c:/CODE/Edunity/BackEnd/src/controllers/communityController.js#L31-L35)
- Service: [adminService.js](file:///c:/CODE/Edunity/BackEnd/src/services/adminService.js#L43-L132)
- Model: [User.js](file:///c:/CODE/Edunity/BackEnd/src/models/User.js#L88-L115)
- Audit: [AuditLog.js](file:///c:/CODE/Edunity/BackEnd/src/models/AuditLog.js) & [auditService.js](file:///c:/CODE/Edunity/BackEnd/src/services/auditService.js)
- Auth & Token: [authMiddleware.js](file:///c:/CODE/Edunity/BackEnd/src/middlewares/authMiddleware.js) & [authTokenService.js](file:///c:/CODE/Edunity/BackEnd/src/services/authTokenService.js)

---

## 2. Phân tích hiện trạng kỹ thuật & Lỗ hổng cần khắc phục

### 2.1. Model `User.js` thiếu các trường lưu trữ trạng thái chi tiết
- Schema hiện tại của `User`:
  ```javascript
  status: { type: String, enum: ["ACTIVE", "PENDING", "SUSPENDED", "BANNED"], default: "ACTIVE" }
  ```
- **Hạn chế:** Khi Admin khóa hoặc tạm ngưng tài khoản kèm lý do (`reason`), lý do này chỉ được ghi vào `AuditLog.afterState.reason` chứ **không được lưu trực tiếp trên bản ghi User**.
- Hệ quả: Khi gọi `GET /api/admin/users/:id` hoặc `GET /api/admin/users`, hệ thống không trả về lý do khóa hiện tại (`statusReason`), thời điểm thay đổi (`statusChangedAt`), hoặc Admin thực hiện (`statusChangedBy`).

### 2.2. Hàm `updateUserStatus` thiếu Transaction Atomicity & Concurrency Control
- Mã nguồn hiện tại trong `adminService.js`:
  ```javascript
  const before = user.status;
  user.status = status;
  await user.save();
  if (status !== "ACTIVE") await authTokenService.revokeAllForUser(user._id);

  await audit({
    actorAdminId: adminId,
    action: `USER_${status}`,
    targetType: "User",
    targetId: user._id,
    beforeState: { status: before },
    afterState: { status, reason: body.reason || null },
  });
  ```
- **Các nguy cơ nghiêm trọng:**
  1. **Không có MongoDB Transaction:** Lệnh `user.save()` thực hiện độc lập trước khi gọi `audit()`. Nếu tiến trình ghi `AuditLog` gặp lỗi (mất kết nối, timeout), `User` đã bị đổi trạng thái nhưng AuditLog không được ghi lại -> vi phạm nguyên tắc kiểm toán bắt buộc (Audit Consistency Failure / Partial Write).
  2. **Side effect trước khi Audit an toàn:** Lệnh `authTokenService.revokeAllForUser()` thực hiện trước khi kiểm toán hoàn tất.
  3. **Không có Conditional Update:** Thiếu điều kiện đối soát trạng thái hiện tại (`{ _id: user._id, status: user.status }`), dẫn đến nguy cơ race condition nếu 2 Admin thao tác đồng thời trên cùng một User.
  4. **Validation chưa chặt chẽ:** Kiểm tra `isBlank(body.reason)` nhưng chưa chuẩn hóa trim chuỗi và giới hạn độ dài an toàn (`max 500 ký tự`).

### 2.3. Thiếu API tra cứu lịch sử trạng thái (`Status History API`)
- Hiện tại chưa có endpoint để Admin xem lịch sử các lần chuyển đổi trạng thái của một tài khoản (`ACTIVE -> SUSPENDED -> ACTIVE -> BANNED`).
- Dữ liệu `AuditLog` đã ghi nhận các action `USER_ACTIVE`, `USER_SUSPENDED`, `USER_BANNED` nhưng chưa được bộc lộ qua API có phân trang, kiểm tra quyền và che chắn thông tin nhạy cảm.

### 2.4. Tính tương thích với dữ liệu Legacy (Legacy Data Compatibility)
- Các tài khoản đã bị khóa/tạm ngưng trong quá khứ chưa có trường `statusReason` trên document `User`. Cần cơ chế fallback thông minh tra cứu từ `AuditLog` mới nhất tương ứng với trạng thái hiện tại mà không tự tạo lý do giả mạo (fake reasons).

---

## 3. Kết luận

Hệ thống có nền tảng tốt về middleware và model, nhưng tầng thao tác trạng thái tài khoản cần được nâng cấp toàn diện bằng:
- Mở rộng Schema `User`.
- Đóng gói toàn bộ logic `updateUserStatus` vào **MongoDB Multi-document Transaction** với **Conditional Update**.
- Xây dựng endpoint chuẩn `GET /api/admin/users/:id/status-history`.
- Đảm bảo cơ chế revoke token và chặn truy cập tức thì (immediate enforcement) sau commit.
