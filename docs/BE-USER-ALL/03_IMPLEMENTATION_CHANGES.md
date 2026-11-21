# CHI TIẾT THAY ĐỔI TRIỂN KHAI — BE-USER-ALL
**Dự án:** EDUNITY V3  
**Phân hệ:** Admin User Management & Audit Consistency  
**Tác giả:** Senior Backend Engineer  
**Ngày:** 21/11/2026  

---

## 1. Danh sách các file thay đổi

| STT | Tập tin | Thành phần | Nội dung thay đổi |
|---|---|---|---|
| 1 | [User.js](file:///c:/CODE/Edunity/BackEnd/src/models/User.js) | Mongoose Model | Bổ sung 3 trường: `statusReason`, `statusChangedAt`, `statusChangedBy` và index `{ status: 1, statusChangedAt: -1 }`. |
| 2 | [adminService.js](file:///c:/CODE/Edunity/BackEnd/src/services/adminService.js) | Service Layer | Cập nhật `presentUser`, `listUsers`, `getUser`, refactor `updateUserStatus` với MongoDB Transaction + Conditional Update, bổ sung hàm `getUserStatusHistory`. |
| 3 | [communityController.js](file:///c:/CODE/Edunity/BackEnd/src/controllers/communityController.js) | Controller | Thêm controller `getUserStatusHistory`. |
| 4 | [communityRoutes.js](file:///c:/CODE/Edunity/BackEnd/src/routes/communityRoutes.js) | Routes | Thêm route `GET /admin/users/:id/status-history` với guard `admin = [authMiddleware, requireRole("ADMIN")]`. |

---

## 2. Chi tiết logic mã nguồn

### 2.1. Model `User.js`
```javascript
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    tokenVersion: { type: Number, default: 0 },
    role: { type: String, enum: ["STUDENT", "TEACHER", "SPONSOR", "ADMIN"], required: true },
    status: { type: String, enum: ["ACTIVE", "PENDING", "SUSPENDED", "BANNED"], default: "ACTIVE" },
    statusReason: { type: String, default: null },
    statusChangedAt: { type: Date, default: null },
    statusChangedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    // ...
  },
  { timestamps: true }
);

userSchema.index({ role: 1, status: 1 });
userSchema.index({ status: 1, statusChangedAt: -1 });
```

### 2.2. Service `adminService.js` — Hàm `updateUserStatus`
- **Validation:** Bắt buộc `reason` khi chuyển sang `SUSPENDED` hoặc `BANNED`. Trim whitespace và giới hạn độ dài `reason.length <= 500`.
- **Authorization & Rules:**
  - Chặn Admin tự thao tác trên tài khoản của chính mình: ném `validationError("You cannot change the status of your own account")` (HTTP 400).
  - Chặn khóa tài khoản Admin khác: ném `AppError("Admin accounts cannot be suspended or banned here", "FORBIDDEN", 403)`.
- **Idempotency:** Nếu trạng thái người dùng hiện tại đã trùng với `status` yêu cầu, hàm trả về ngay thông tin người dùng mà không tạo transaction hay ghi log trùng lặp.
- **MongoDB Multi-document Transaction:**
  - Bắt đầu session: `const session = await mongoose.startSession();`
  - Thực thi qua `session.withTransaction(async () => { ... })`.
  - Conditional update chống race condition:
    ```javascript
    const updated = await User.findOneAndUpdate(
      { _id: currentUser._id, status: currentUser.status, ...NOT_DELETED },
      { $set: updateFields },
      { session, new: true }
    );
    if (!updated) {
      throw new AppError("Concurrent user status update detected. Please retry.", "CONCURRENT_UPDATE_CONFLICT", 409);
    }
    ```
  - Ghi `AuditLog` cùng session:
    ```javascript
    await audit({
      actorAdminId: adminId,
      action: `USER_${status}`,
      targetType: "User",
      targetId: updated._id,
      beforeState,
      afterState: {
        status,
        reason: status === "ACTIVE" ? null : reason,
        statusChangedAt: now,
        statusChangedBy: adminId,
      },
    }, session);
    ```
  - **Fail-Closed:** Nếu `withTransaction` thất bại hoặc transaction không khả dụng, hệ thống throw lỗi ra ngoài, tuyệt đối không có fallback sang non-transactional write.
- **Post-commit Side Effects:**
  - Nếu `status !== "ACTIVE"`: Gọi `authTokenService.revokeAllForUser(user._id)` để thu hồi ngay lập tức mọi refresh token đang lưu hành.
  - Nếu `status === "ACTIVE"`: Gửi thông báo hệ thống `ACCOUNT_REACTIVATED`.

### 2.3. Service `adminService.js` — Hàm `getUser` (Legacy Compatibility)
- Khi gọi `GET /api/admin/users/:id`:
  - Nếu user có trạng thái `SUSPENDED` hoặc `BANNED` nhưng trường `statusReason` trên document rỗng (dữ liệu legacy tạo trước khi có trường mới), hệ thống tự động tìm bản ghi `AuditLog` mới nhất có `action: USER_${status}` để trích xuất lý do và Admin đã thực hiện.
  - Tuyệt đối không tự bịa lý do giả mạo (fake reason). Nếu không tìm thấy, trả về `null`.
  - `statusChangedBy` chỉ trả thông tin tối thiểu: `{ id, email, fullName }`. Tuyệt đối không để lộ mật khẩu, hash, hoặc token.

### 2.4. Service `adminService.js` — Hàm `getUserStatusHistory`
- Hỗ trợ endpoint mới: `GET /api/admin/users/:id/status-history`.
- Kiểm tra `userId` hợp lệ và user tồn tại.
- Truy vấn `AuditLog` theo `targetType: "User"`, `targetId: userId`, `action: { $in: ["USER_ACTIVE", "USER_SUSPENDED", "USER_BANNED"] }`.
- Sắp xếp `{ createdAt: -1 }`, hỗ trợ phân trang chuẩn qua `parsePaging` và `paged`.
- Trả về danh sách: `{ id, action, fromStatus, toStatus, reason, performedBy: { id, email, fullName }, performedAt }`.
