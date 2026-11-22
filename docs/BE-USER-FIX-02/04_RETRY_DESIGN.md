# BE-USER-FIX-02: RETRY & CONCURRENCY DESIGN

## 1. Thiết kế Mô hình Outbox Bền vững (Transactional Outbox)

### 1.1. Cấu trúc Collection `TokenRevocationTask`
```javascript
{
  _id: ObjectId("..."),
  userId: ObjectId("..."),
  targetStatus: "BANNED", // "SUSPENDED" | "BANNED"
  reason: "Vi phạm nghiêm trọng quy chế",
  revokeBefore: ISODate("2026-11-21T14:00:00.000Z"), // Cutoff Timestamp
  status: "PENDING", // PENDING | PROCESSING | COMPLETED | FAILED
  attempts: 0,
  maxAttempts: 5,
  nextRunAt: ISODate("2026-11-21T14:00:00.000Z"),
  lockedUntil: null,
  lockedBy: null,
  lastError: null,
  revokedCount: 0,
  completedAt: null,
  createdAt: ISODate("..."),
  updatedAt: ISODate("...")
}
```

### 1.2. Tính nguyên tử với Transaction (ACID Invariant)
```javascript
// adminService.js
await session.withTransaction(async () => {
  // 1. Cập nhật User status
  const updated = await User.findOneAndUpdate(
    { _id: currentUser._id, status: currentUser.status, ...NOT_DELETED },
    { $set: updateFields },
    { session, returnDocument: "after" }
  );

  // 2. Ghi AuditLog
  await audit({ ... }, session);

  // 3. Ghi TokenRevocationTask
  await tokenRevocationService.recordRevocationTask(
    {
      userId: updated._id,
      targetStatus: status,
      reason,
      revokeBefore: now,
    },
    session
  );
});
```
* **Khi transaction abort:** Cả `User`, `AuditLog`, và `TokenRevocationTask` đều rollback 100%. Không có bất kỳ bản ghi rác nào được lưu lại.
* **Khi transaction commit:** Cả 3 document được cam kết bền vững vào disk. Kể cả khi process Node.js bị kill ngay lập tức tại ranh giới sau commit, task vẫn được bảo tồn trọn vẹn trong MongoDB.

---

## 2. Cơ chế Worker, Khóa Phân tán & Exponential Backoff

### 2.1. Tranh chấp giữa nhiều Worker đồng thời (Atomic Lease Claim)
Để hỗ trợ nhiều worker chạy đồng thời (multi-instance, horizontal scaling) mà không xử lý trùng lặp hoặc gây race condition:
```javascript
const task = await TokenRevocationTask.findOneAndUpdate(
  {
    status: { $in: ["PENDING", "PROCESSING"] },
    nextRunAt: { $lte: now },
    $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
  },
  {
    $set: {
      status: "PROCESSING",
      lockedUntil: new Date(now.getTime() + leaseMs), // Lease 30 giây
      lockedBy: workerId,
    },
  },
  { returnDocument: "after" }
);
```
- MongoDB đảm bảo thao tác `findOneAndUpdate` diễn ra nguyên tử ở cấp độ document.
- Khi Worker A đã nhận task và set `lockedUntil = now + 30s`, Worker B truy vấn tại cùng thời điểm sẽ bỏ qua task này và lấy task tiếp theo.
- Nếu Worker A bị crash trong lúc đang xử lý, sau 30 giây lease hết hạn (`lockedUntil <= now`), một Worker khác sẽ tự động nhận lại task để tiếp tục xử lý (Fault Tolerance).

### 2.2. Tính toán Exponential Backoff & Dead Letter
Khi việc thu hồi token gặp lỗi (ví dụ lỗi mạng kết nối tới collection RefreshToken):
$$\text{backoffMs} = \min(60000, 1000 \times 2^{\text{attempts} - 1})$$
- Lần 1: 1,000 ms (1s)
- Lần 2: 2,000 ms (2s)
- Lần 3: 4,000 ms (4s)
- Lần 4: 8,000 ms (8s)
- Lần 5: 16,000 ms (16s)
- **Khi vượt quá `maxAttempts` (5 lần):**
  Task chuyển trạng thái sang `FAILED`. Task KHÔNG bao giờ bị xóa để đội ngũ vận hành có thể theo dõi và cảnh báo qua dashboard.

---

## 3. Cơ chế Bảo vệ Phiên Mới (Cutoff Boundary Safety)

### Bài toán:
Ngăn chặn kịch bản: Khóa tài khoản ($T_1$) $\rightarrow$ Mở khóa ($T_2$) $\rightarrow$ Người dùng đăng nhập nhận RefreshToken mới ($T_3$) $\rightarrow$ Worker nền chạy lại task cũ ($T_4$).

### Giải pháp kỹ thuật:
- Khi tạo task tại thời điểm $T_1$, hệ thống cố định: `task.revokeBefore = T_1`.
- Khi worker thực thi, câu truy vấn cập nhật trên bảng `RefreshToken` được giới hạn nghiêm ngặt:
```javascript
const cutoff = task.revokeBefore;
const filter = {
  userId: task.userId,
  $or: [{ createdAt: { $lte: cutoff } }, { issuedAt: { $lte: cutoff } }],
  revokedAt: null,
};
await RefreshToken.updateMany(filter, { $set: { revokedAt: new Date() } });
```
- Vì $T_3 > T_2 > T_1$, RefreshToken mới có `createdAt = T_3 > cutoff`.
- Do đó, câu lệnh `updateMany` hoàn toàn bỏ qua token mới, bảo vệ 100% phiên đăng nhập hợp lệ của người dùng vừa được kích hoạt lại!
