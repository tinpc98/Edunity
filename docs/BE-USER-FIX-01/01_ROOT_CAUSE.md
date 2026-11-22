# BE-USER-FIX-01: ROOT CAUSE ANALYSIS

## 1. Bối cảnh & Mục tiêu
Dự án EDUNITY V3 đã hoàn thành các module:
- **BE-01**: Class NEED_CHANGES workflow.
- **BE-02**: Automatic Expired Class Rejection (maintenance job).
- **BE-03**: Academic Soft Delete.
- **BE-USER-ALL**: Admin User Management (status metadata, multi-document transactions, AuditLog, status history).

Audit mã nguồn sau `BE-USER-ALL` phát hiện hai rủi ro kỹ thuật cần khắc phục triệt để:
1. **Lỗi đối chiếu AuditLog của dữ liệu cũ (Legacy Audit Matching):** Cơ chế fallback lấy lý do khóa tài khoản cho các user legacy có thể trích xuất nhầm lý do từ một chu kỳ khóa cũ đã kết thúc.
2. **Lỗi tin cậy sau commit giao dịch (Post-Commit Side-Effects Reliability):** Việc thu hồi token (`revokeAllForUser`) hoặc gửi thông báo (`notify`) thực hiện sau khi transaction MongoDB đã commit nếu gặp lỗi đột xuất (transient network glitch, socket timeout) có thể throw unhandled 500 error, khiến client hiểu nhầm giao dịch đổi trạng thái thất bại.

---

## 2. Chi tiết Root Cause

### 2.1. FIX-01: Legacy Audit Matching Blind Spot

#### Vấn đề trong mã nguồn trước khi sửa:
Trong `BackEnd/src/services/adminService.js`, hàm `getUser()` có logic fallback:
```javascript
// Mã nguồn trước FIX-01
if ((user.status === "SUSPENDED" || user.status === "BANNED") && !statusReason) {
  const legacyAudit = await AuditLog.findOne({
    targetType: "User",
    targetId: user._id,
    action: `USER_${user.status}`,
  })
    .sort({ createdAt: -1 })
    .populate("actorAdminId", "email studentProfile teacherProfile")
    .lean();

  if (legacyAudit && legacyAudit.afterState && legacyAudit.afterState.reason) {
    statusReason = legacyAudit.afterState.reason;
    statusChangedAt = legacyAudit.createdAt;
    ...
  }
}
```

#### Phân tích lỗ hổng:
1. **Bỏ qua ranh giới mở khóa (Reactivation Boundary):**
   - Giả sử một tài khoản có lịch sử:
     - $T_1$: Bị khóa vĩnh viễn (`USER_BANNED`), lý do: *"Spam link lừa đảo"*.
     - $T_2$: Được mở khóa (`USER_ACTIVE`), lý do: *"Kháng nghị thành công"*.
     - $T_3$: Tài khoản ở trạng thái `BANNED` (do import dữ liệu cũ, script bảo trì, hoặc thao tác legacy chưa ghi `statusReason` vào bản ghi User).
   - Truy vấn `action: "USER_BANNED"` sắp xếp `{ createdAt: -1 }` sẽ nhảy cóc qua $T_2$ và lấy bản ghi $T_1$!
   - Kết quả: Tài khoản hiển thị lý do *"Spam link lừa đảo"* của đợt 1, trong khi đợt đó đã được xóa bỏ tại $T_2$.
2. **Không kiểm tra tính nhất quán với trạng thái hiện tại:**
   - Nếu tài khoản hiện tại là `SUSPENDED`, nhưng audit log mới nhất là `USER_BANNED` hoặc ngược lại, việc chỉ lọc theo `action: USER_${user.status}` có thể kéo một log từ thời điểm người dùng mang trạng thái đó trong quá khứ, dù sau đó họ đã chuyển sang trạng thái khác.

---

### 2.2. FIX-02: Post-Commit Side Effects Partial Failure

#### Vấn đề trong mã nguồn trước khi sửa:
Trong `BackEnd/src/services/adminService.js`, hàm `updateUserStatus()`:
```javascript
  await session.withTransaction(async () => {
    // 1. Conditional update User
    // 2. Ghi AuditLog
    // Transaction commit thành công
  });

  // Post-commit side-effects
  if (status !== "ACTIVE") {
    await authTokenService.revokeAllForUser(committedDoc._id);
  } else {
    await notify(committedDoc._id, ...);
  }
```

#### Phân tích lỗ hổng:
1. **Phân tách ranh giới Transaction vs Side-Effects:**
   - Side-effects như gửi thông báo hoặc cập nhật bảng phụ trợ bên ngoài transaction không thể rollback transaction một khi MongoDB đã gọi `commitTransaction()`.
   - Nếu `authTokenService.revokeAllForUser()` gặp lỗi (ví dụ: MongoDB socket timeout với collection RefreshToken), hàm throw unhandled exception và Express trả về HTTP 500.
   - **Hệ quả vận hành:** Admin nhận thông báo "500 Internal Server Error" và tưởng rằng việc khóa tài khoản thất bại, nhưng trên thực tế `User.status` đã được đổi thành `BANNED` và `AuditLog` đã được lưu.
2. **Bảo đảm an toàn xác thực (Authentication Safety):**
   - Bản thân `authMiddleware.js` luôn truy vấn trực tiếp `User.findById()` trên mỗi request kèm JWT. Khi `user.status` trong DB đã là `BANNED` hoặc `SUSPENDED`, `authMiddleware` lập tức trả về `403 ACCOUNT_BLOCKED`.
   - Tương tự, endpoint `/auth/refresh` kiểm tra `assertAccountUsable(user)` và từ chối cấp access token mới.
   - Do đó, việc `revokeAllForUser` thất bại tạm thời KHÔNG gây rò rỉ quyền truy cập của tài khoản bị khóa.
3. **Thiếu cơ chế Idempotent Recovery:**
   - Nếu admin thử lại bằng cách bấm nút khóa một lần nữa, nhánh lặp lại (`existingUser.status === status`) trước đây chỉ trả về User mà không thu hồi lại refresh token, dẫn đến các refresh token còn sót từ lần lỗi trước không bao giờ được dọn dẹp.
