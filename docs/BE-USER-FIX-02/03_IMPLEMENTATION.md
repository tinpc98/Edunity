# BE-USER-FIX-02: TECHNICAL IMPLEMENTATION REPORT

## 1. Tổng quan kiến trúc giải pháp

Để giải quyết triệt để rủi ro mất tác vụ thu hồi token sau khi commit và nguy cơ thu hồi nhầm token của phiên mới sau khi mở khóa, BE-USER-FIX-02 áp dụng mô hình **Transactional Outbox Pattern** kết hợp với **Cutoff Timestamp Boundary**:

```
[ Admin Action: SUSPEND / BAN ]
               │
               ▼
┌──────────────────────────────────────────────┐
│  MongoDB Multi-Document ACID Transaction     │
│  ├── 1. Cập nhật User status & metadata      │
│  ├── 2. Tạo AuditLog                         │
│  └── 3. Tạo TokenRevocationTask (Outbox)     │
│         └── revokeBefore: cutoffTimestamp    │
└──────────────────────────────────────────────┘
               │
               ├───────────────────┬──────────────────────┐
               ▼                   ▼                      ▼
      [ Immediate Sweep ]   [ Background Sweep ]   [ Server Restart / Crash ]
      Thực thi ngay sau     maintenanceJob định    Worker quét DB khi khởi động lại,
      commit (sub-ms)       kỳ quét task pending   không mất bất kỳ tác vụ nào.
```

---

## 2. Chi tiết các thành phần đã triển khai

### 2.1. Model `TokenRevocationTask` (`BackEnd/src/models/TokenRevocationTask.js`)
Lưu trữ bền vững các tác vụ thu hồi token:
- `userId`: ID người dùng bị khóa/tạm ngưng.
- `targetStatus`: `SUSPENDED` hoặc `BANNED`.
- `reason`: Lý do xử lý vi phạm.
- `revokeBefore`: Mốc thời gian giới hạn (`cutoff timestamp`). Chỉ những token được cấp trước hoặc tại thời điểm này mới bị thu hồi.
- `status`: `PENDING` $\rightarrow$ `PROCESSING` $\rightarrow$ `COMPLETED` / `FAILED`.
- `attempts` & `maxAttempts`: Đếm số lần thử lại (mặc định tối đa 5 lần).
- `nextRunAt`: Thời điểm chạy tiếp theo (exponential backoff).
- `lockedUntil` & `lockedBy`: Lease phân tán ngăn ngừa xung đột giữa nhiều worker đồng thời.
- `lastError`: Lưu chi tiết lỗi nếu thất bại để phục vụ cảnh báo vận hành.
- `completedAt` & `revokedCount`: Đo lường kết quả thực thi.

### 2.2. Dịch vụ `tokenRevocationService` (`BackEnd/src/services/tokenRevocationService.js`)
Cung cấp các API xử lý nghiệp vụ:
- `recordRevocationTask({ userId, targetStatus, reason, revokeBefore }, session)`:
  Ghi nhận task vào DB trong cùng session transaction.
- `claimNextPendingTask(now, leaseMs, workerId)`:
  Sử dụng `findOneAndUpdate` nguyên tử để khóa và nhận task cho worker cụ thể.
- `processTask(task)`:
  Thực hiện thu hồi các `RefreshToken` thỏa mãn điều kiện:
  `userId: task.userId`, `createdAt: { $lte: task.revokeBefore }`, `revokedAt: null`.
  Cập nhật trạng thái `COMPLETED` kèm `revokedCount`.
  Nếu lỗi: Tự động tính toán exponential backoff và chuyển về `PENDING` hoặc `FAILED` khi hết số lần retry.
- `processPendingTasksForUser(userId)`:
  Xử lý ngay lập tức các task đang chờ của user; phục vụ cho cả luồng post-commit tức thời và luồng idempotent recovery khi Admin gửi lại request.
- `runTokenRevocationSweep(now, options)`:
  Quét và xử lý hàng loạt theo batch size, hỗ trợ kiểm tra lease phân tán.

### 2.3. Tích hợp Transaction trong `adminService.js`
Trong hàm `updateUserStatus()`:
- **Bên trong transaction:** Sau khi conditional update `User` và tạo `AuditLog`, gọi `tokenRevocationService.recordRevocationTask(..., session)`. Đảm bảo tính nguyên tử 100%: nếu có lỗi bên trong transaction thì cả 3 cùng rollback; nếu commit thì task chắc chắn tồn tại trong DB.
- **Bên ngoài transaction (Post-Commit):** Gọi `tokenRevocationService.processPendingTasksForUser(committedDoc._id)` trong khối `try/catch`. Thao tác thu hồi diễn ra ngay lập tức, không gây lag hay delay. Nếu có lỗi, task vẫn nằm an toàn trong DB để worker quét lại.
- **Nhánh Idempotent:** Khi Admin gửi lại request với trạng thái đã có sẵn, hệ thống gọi `processPendingTasksForUser(existingUser._id)` để hoàn tất các task chưa xong mà không tạo trùng `AuditLog`.

### 2.4. Tích hợp định kỳ trong `maintenanceJob.js`
- Bổ sung bước `tokenRevocationSweep` vào danh mục các tác vụ bảo trì định kỳ của `runMaintenanceJob`.
- Chạy dưới distributed lock `runExclusive("maintenance")` định kỳ 5 phút một lần, tự động dọn dẹp mọi task pending còn sót lại.

### 2.5. Bảo đảm an toàn xác thực hai lớp (`authTokenService.js`)
- Trong hàm `refresh()`: Kiểm tra trạng thái tài khoản `User.findById(record.userId)` và gọi `assertAccountUsable(user)` trước tiên.
- Bất kể refresh token đã được cập nhật `revokedAt` trong DB hay chưa, nếu tài khoản đang mang trạng thái `SUSPENDED` hoặc `BANNED`, endpoint `/auth/refresh` lập tức từ chối với HTTP 403 `ACCOUNT_BLOCKED`.
