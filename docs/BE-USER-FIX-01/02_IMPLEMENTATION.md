# BE-USER-FIX-01: TECHNICAL IMPLEMENTATION REPORT

## 1. Tổng quan các thay đổi
Task BE-USER-FIX-01 tập trung khắc phục hai rủi ro đã xác định trong báo cáo `01_ROOT_CAUSE.md`:
1. **FIX-01: Legacy Audit Matching**: Nâng cấp thuật toán tra cứu lý do trạng thái cho tài khoản legacy, đảm bảo tôn trọng ranh giới chu kỳ chuyển trạng thái và tính nhất quán với trạng thái hiện tại.
2. **FIX-02: Post-Commit Side Effects & Reliability**: Phân tách rõ ràng giữa transaction database và side-effects sau commit; trang bị cơ chế thử lại (`safeRevokeAllForUser`) và phục hồi idempotent (`idempotent recovery`).

---

## 2. Chi tiết triển khai

### 2.1. FIX-01: Legacy Audit Matching (`BackEnd/src/services/adminService.js`)

#### Thiết kế logic:
- Khi một tài khoản mang trạng thái `SUSPENDED` hoặc `BANNED` nhưng trường `statusReason` trên document `User` là `null` (dữ liệu cũ trước khi bổ sung trường):
- Không truy vấn đơn thuần theo `action: "USER_" + user.status`.
- Thay vào đó, truy vấn bản ghi AuditLog **gần nhất theo trình tự thời gian** trong tập hợp tất cả các hành động chuyển đổi trạng thái:
  `action: { $in: ["USER_ACTIVE", "USER_SUSPENDED", "USER_BANNED"] }`, sắp xếp `{ createdAt: -1 }`.
- **Kiểm tra tính nhất quán (Consistency Guard):**
  Chỉ trích xuất `reason`, `statusChangedAt`, và `statusChangedBy` nếu và chỉ nếu:
  1. `latestStatusAudit.action === "USER_" + user.status`
  2. `latestStatusAudit.afterState && latestStatusAudit.afterState.status === user.status`
  3. `latestStatusAudit.afterState.reason` có giá trị hợp lệ.
- Nếu bản ghi audit gần nhất là một hành động khác (ví dụ: `USER_ACTIVE` - tài khoản từng được mở khóa, hoặc `USER_BANNED` trong khi hiện tại đang `SUSPENDED`):
  -> Trả về `statusReason = null`. Tuyệt đối không nhảy cóc qua ranh giới mở khóa để lấy lý do từ chu kỳ cũ.

#### Code Snippet (`BackEnd/src/services/adminService.js`):
```javascript
  // Legacy data fallback for accounts locked before new fields were added
  // FIX-01: Cross-check against the user's chronologically latest status change action.
  // Only extract reason if that latest status audit transitioned the user to their CURRENT status.
  if ((user.status === "SUSPENDED" || user.status === "BANNED") && !statusReason) {
    const latestStatusAudit = await AuditLog.findOne({
      targetType: "User",
      targetId: user._id,
      action: { $in: ["USER_ACTIVE", "USER_SUSPENDED", "USER_BANNED"] },
    })
      .sort({ createdAt: -1 })
      .populate("actorAdminId", "email studentProfile teacherProfile")
      .lean();

    if (
      latestStatusAudit &&
      latestStatusAudit.action === `USER_${user.status}` &&
      latestStatusAudit.afterState &&
      latestStatusAudit.afterState.status === user.status &&
      latestStatusAudit.afterState.reason
    ) {
      statusReason = latestStatusAudit.afterState.reason;
      if (!statusChangedAt) {
        statusChangedAt = latestStatusAudit.createdAt;
      }
      if (!statusChangedBy && latestStatusAudit.actorAdminId) {
        statusChangedBy = latestStatusAudit.actorAdminId;
      }
    }
  }
```

---

### 2.2. FIX-02: Post-Commit Side Effects & Reliability

#### 2.2.1. Thêm `safeRevokeAllForUser` (`BackEnd/src/services/authTokenService.js`)
- Triển khai hàm `safeRevokeAllForUser(userId, maxAttempts = 3, delayMs = 20)`.
- Vòng lặp thử lại tối đa 3 lần với backoff tăng dần nếu gặp lỗi tạm thời (transient glitch).
- Nếu toàn bộ các lần thử thất bại, ghi log có cấu trúc (`console.error`) và trả về `{ success: false, error }` thay vì throw exception làm sập request.
- Lý do kỹ thuật:
  - Giao dịch MongoDB đã commit, trạng thái `User.status` đã được lưu là `BANNED`/`SUSPENDED`.
  - `authMiddleware.js` đọc `User.findById(payload.sub)` trên từng request, lập tức từ chối access token với HTTP 403 `ACCOUNT_BLOCKED`.
  - `/auth/refresh` gọi `assertAccountUsable(user)` và từ chối refresh token với HTTP 403 `ACCOUNT_BLOCKED`.
  - Do đó, tài khoản hoàn toàn bị phong tỏa ngay cả khi việc cập nhật bảng `RefreshToken` bị hoãn lại.

#### Code Snippet (`BackEnd/src/services/authTokenService.js`):
```javascript
/**
 * Resilient token revocation with retry mechanism for post-commit side-effects.
 * If all retries fail, it logs the error and returns a failure descriptor without
 * throwing, preventing post-commit 500 errors when DB status is already committed.
 */
const safeRevokeAllForUser = async (userId, maxAttempts = 3, delayMs = 20) => {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await module.exports.revokeAllForUser(userId);
      return { success: true, attempts: attempt };
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
  console.error(`[authTokenService] Post-commit revokeAllForUser failed after ${maxAttempts} attempts for userId=${userId}:`, lastError);
  return { success: false, error: lastError, attempts: maxAttempts };
};
```

#### 2.2.2. Idempotent Recovery (`BackEnd/src/services/adminService.js`)
- Trong trường hợp request lặp lại khi `existingUser.status === status`:
- Nếu trạng thái là `SUSPENDED` hoặc `BANNED`, hệ thống tự động kích hoạt `await authTokenService.safeRevokeAllForUser(existingUser._id);`.
- Thao tác này dọn dẹp triệt để bất kỳ refresh token nào còn sót lại từ lần lỗi trước, mà không tạo thêm bản ghi `AuditLog` trùng lặp.

#### 2.2.3. Bọc an toàn Post-Commit Notification (`BackEnd/src/services/adminService.js`)
- Việc gửi thông báo kích hoạt tài khoản (`ACCOUNT_REACTIVATED`) được thực hiện bên ngoài transaction và được bọc trong khối `try/catch`.
- Lỗi gửi thông báo (ví dụ dịch vụ email/thông báo bên ngoài gián đoạn) được ghi nhận an toàn, không làm rollback trạng thái đã mở khóa thành công trong cơ sở dữ liệu.

```javascript
  // Post-commit side-effects (cannot be rolled back if placed inside transaction)
  if (status !== "ACTIVE") {
    await authTokenService.safeRevokeAllForUser(committedDoc._id);
  } else if (actuallyChanged) {
    try {
      await notify(
        committedDoc._id,
        "Tài khoản đã được kích hoạt lại",
        "Bạn có thể tiếp tục sử dụng Edunity.",
        "ACCOUNT_REACTIVATED"
      );
    } catch (notifErr) {
      console.error(`[adminService] Post-commit notification failed for userId=${committedDoc._id}:`, notifErr);
    }
  }
```
