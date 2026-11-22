# KẾ HOẠCH TRIỂN KHAI — BE-USER-ALL
**Dự án:** EDUNITY V3  
**Phân hệ:** Admin User Management & Audit Consistency  
**Tác giả:** Senior Backend Engineer  
**Ngày:** 21/11/2026  

---

## 1. Mục tiêu và phạm vi triển khai

Triển khai hoàn chỉnh toàn bộ yêu cầu Backend theo 3 Phase độc lập, đảm bảo:
- **Backend Only:** Không can thiệp Frontend.
- **Tính toàn vẹn giao dịch (ACID):** User state update và AuditLog trong cùng một transaction.
- **Fail-Closed:** Không fallback sang non-transactional write nếu transaction lỗi.
- **Zero Regression:** Giữ nguyên contract và hành vi của tất cả API hiện có.

---

## 2. Kế hoạch chi tiết theo từng Phase

### Phase 1 — User Status & Audit Consistency
1. **Extend User Schema (`BackEnd/src/models/User.js`):**
   - Thêm `statusReason: { type: String, default: null }`.
   - Thêm `statusChangedAt: { type: Date, default: null }`.
   - Thêm `statusChangedBy: { type: Schema.Types.ObjectId, ref: "User", default: null }`.
   - Thêm index `{ status: 1, statusChangedAt: -1 }`.
   - Bảo toàn các enum hiện hữu: `["ACTIVE", "PENDING", "SUSPENDED", "BANNED"]`.
2. **Refactor `updateUserStatus` (`BackEnd/src/services/adminService.js`):**
   - Trim và validate `reason` khi status là `SUSPENDED` hoặc `BANNED`. Giới hạn độ dài max 500 ký tự.
   - Chặn Admin tự thay đổi trạng thái tài khoản của chính mình (400 `validationError`).
   - Chặn khóa tài khoản Admin khác (403 `FORBIDDEN`).
   - Kiểm tra request lặp lại (idempotency / no duplicate audit): nếu trạng thái mục tiêu trùng trạng thái hiện tại, trả về ngay mà không mở transaction hay ghi audit log mới.
   - Áp dụng MongoDB Session và Transaction (`session.withTransaction`):
     - Conditional update: `User.findOneAndUpdate({ _id: user._id, status: user.status, ...NOT_DELETED }, { $set: updateFields }, { session, new: true })`.
     - Ghi `AuditLog` cùng session qua `audit(..., session)`.
     - Nếu audit lỗi -> rollback 100% thay đổi của User.
     - Nếu transaction không khả dụng -> fail-closed (ném lỗi, không fallback).
   - Side effects hậu commit (Post-commit):
     - `status !== "ACTIVE"`: Gọi `authTokenService.revokeAllForUser(user._id)` để thu hồi mọi refresh token.
     - `status === "ACTIVE"`: Gọi `notify(...)` gửi thông báo kích hoạt lại.
   - Định dạng dữ liệu trả về `presentUser`: bổ sung `statusReason`, `statusChangedAt`, `statusChangedBy` mà không làm thay đổi các trường cũ.

### Phase 2 — Admin User Detail & Status History API
1. **Mở rộng `GET /api/admin/users/:id` (`getUser` trong `adminService.js`):**
   - Trả về `statusReason`, `statusChangedAt`, `statusChangedBy`.
   - `statusChangedBy` định dạng thông tin tối thiểu: `{ id, email, fullName }`, loại bỏ toàn bộ dữ liệu nhạy cảm (`passwordHash`, `tokenVersion`).
   - Cơ chế tương thích dữ liệu cũ (Legacy Data Fallback): nếu tài khoản đang bị khóa/tạm ngưng mà trường `statusReason` trên document rỗng, truy vấn `AuditLog` mới nhất ứng với trạng thái hiện tại (`action: USER_${status}`) để trích xuất lý do và người thực hiện; nếu không có thì trả `null`, tuyệt đối không tạo lý do giả.
2. **Triển khai `GET /api/admin/users/:id/status-history`:**
   - Định tuyến: `router.get("/admin/users/:id/status-history", admin, controller.getUserStatusHistory)` trong `communityRoutes.js`.
   - Controller: `exports.getUserStatusHistory` trong `communityController.js`.
   - Service: `getUserStatusHistory(userId, paging)` trong `adminService.js`.
   - Phân quyền: Chỉ cho phép role `ADMIN`.
   - Truy vấn `AuditLog`: lọc theo `targetType: "User"`, `targetId: userId`, action thuộc nhóm `["USER_ACTIVE", "USER_SUSPENDED", "USER_BANNED"]`, sắp xếp `{ createdAt: -1 }`.
   - Hỗ trợ phân trang chuẩn (`page`, `pageSize`, `skip`, `limit`, `totalPages`, `total`).
   - Dữ liệu trả về: `{ id, action, fromStatus, toStatus, reason, performedBy: { id, email, fullName }, performedAt }`.

### Phase 3 — Backend Test & Regression
1. Xây dựng bộ kiểm thử tích hợp chuyên biệt: `BackEnd/tests/beUserAdminStatus.test.js`.
2. Bao phủ đầy đủ 33 kịch bản kiểm thử:
   - Status workflow (8 tests).
   - Transaction & Concurrency (6 tests).
   - Authentication & Authorization (6 tests).
   - API & Legacy Data (9 tests).
   - Regression (4 test groups).
3. Chạy kiểm thử trên MongoDB Replica Set (`MongoMemoryReplSet`).
4. Chạy kiểm thử hồi quy toàn bộ hệ thống (`community.test.js`, `be01ClassNeedChanges`, `be02MaintenanceExpiredClass`, `be03AcademicSoftDelete`, `chauSafeDeleteConcurrencyReplSet`, `classLifecycleRegression`).

---

## 3. Quản trị rủi ro & Rollback plan

- **Rủi ro 1: Phá vỡ response hiện có của Frontend.**
  - *Giải pháp:* Giữ nguyên toàn bộ cấu trúc `{ success: true, data: { ... } }`, chỉ bổ sung các field mới (`statusReason`, `statusChangedAt`, `statusChangedBy`).
- **Rủi ro 2: Race condition khi nhiều Admin cập nhật cùng lúc.**
  - *Giải pháp:* Sử dụng conditional update `findOneAndUpdate({ _id, status: currentStatus })`. Nếu bản ghi bị sửa giữa chừng, query trả về `null` và hệ thống báo lỗi 409 Conflict.
- **Rủi ro 3: Lộ thông tin mật của Admin.**
  - *Giải pháp:* `statusChangedBy` và `performedBy` chỉ select `_id`, `email`, `studentProfile`, `teacherProfile`. Không bao giờ trả `passwordHash` hay session secret.
