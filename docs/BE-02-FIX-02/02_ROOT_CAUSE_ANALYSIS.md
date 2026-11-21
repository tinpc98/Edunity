# BE-02-FIX-02: Phân Tích Nguyên Nhân Gốc Rễ (Root Cause Analysis)

**Dự án:** EDUNITY V3  
**Giai đoạn:** Phase 2 — Targeted Fix (BE-02-FIX-02)  
**Tài liệu:** RCA Report  

---

## 1. Vấn đề 1: Fallback Không Giao Dịch Trong Hàm Tự Động Từ Chối Lớp Quá Hạn (FIX-01)

### 1.1. Hiện tượng & Triệu chứng
Trong `maintenanceJob.js`, khi xử lý danh sách lớp học quá hạn khai giảng (`rejectExpiredPendingClasses`), logic cũ cố gắng khởi tạo MongoDB session thông qua `mongoose.startSession()`. Tuy nhiên, nếu môi trường không hỗ trợ transaction (như Standalone MongoDB) hoặc nếu `startSession()` ném ngoại lệ, luồng thực thi rơi vào nhánh `else`:
```javascript
// Mã nguồn cũ:
if (session && typeof session.withTransaction === "function") {
  // Giao dịch được bảo vệ
} else {
  // Nhánh fallback không an toàn:
  const updated = await Class.findOneAndUpdate(
    { _id: cls._id, status: CLASS_STATUS.PENDING_APPROVAL },
    { $set: { status: CLASS_STATUS.REJECTED, ... } }
  );
  if (updated) {
    await auditService.log({ ... }); // <-- RỦI RO LỚN TẠI ĐÂY
  }
}
```

### 1.2. Phân tích nguyên nhân gốc rễ (Root Cause)
1. **Thiếu tính nguyên tử (Lack of Atomicity):** Hoạt động cập nhật `Class` và ghi `AuditLog` là hai truy vấn độc lập không được bảo bọc bởi giao dịch cơ sở dữ liệu.
2. **Nguy cơ mất tính toàn vẹn kiểm toán (Audit Trail Inconsistency):** Khi `Class.findOneAndUpdate` thành công, trạng thái lớp chuyển sang `REJECTED`. Nếu sau đó `auditService.log` gặp lỗi (lỗi phân vùng mạng, lỗi kết nối DB tạm thời, hoặc schema validation trên bảng AuditLog), ngoại lệ được ném ra và bị bắt ở khối `catch`. Trạng thái của lớp học trong cơ sở dữ liệu vẫn là `REJECTED`, nhưng không hề có bản ghi `AuditLog` nào được tạo ra.
3. **Mất khả năng phục hồi tự động:** Do trạng thái của lớp đã là `REJECTED`, ở lần chạy tiếp theo của maintenance job, query `{ status: CLASS_STATUS.PENDING_APPROVAL }` sẽ không tìm thấy lớp này nữa. Lớp học bị mất audit vĩnh viễn và không có cách nào tự động tái tạo lại audit log.

### 1.3. Giải pháp thiết kế
- **Loại bỏ hoàn toàn nhánh `else` fallback.**
- Quy định rằng mọi thao tác chuyển trạng thái tự động và ghi AuditLog **phải** được thực hiện bên trong MongoDB session và `withTransaction`.
- **Triết lý Fail-Closed:** Nếu không thể tạo session hoặc transaction thất bại (do `WriteConflict`, transient error, v.v.), hủy bỏ giao dịch, không thay đổi trạng thái lớp, ghi log lỗi chi tiết và để lớp học giữ nguyên trạng thái `PENDING_APPROVAL`. Ở lần chạy tiếp theo của maintenance job, hệ thống sẽ tự động thử lại.

---

## 2. Vấn đề 2: Khiếm Khuyết Quản Lý Lease và Heartbeat Của Khóa Phân Tán (FIX-02)

### 2.1. Hiện tượng & Triệu chứng
Trong `jobLock.js`, hàm `runExclusive` thực hiện acquire khóa phân tán với thời hạn lease nhất định (mặc định 4 phút) và thiết lập một `heartbeatTimer` định kỳ (mặc định 30 giây) để gọi `jobLock.extend(name, instanceId, leaseMs)`.
Tuy nhiên:
1. `heartbeatTimer` chỉ gọi `await extend(...)` mà hoàn toàn bỏ qua kết quả trả về (`extend` trả về `false` nếu lock đã hết hạn và bị worker khác chiếm quyền).
2. Khi `extend` ném lỗi (ví dụ socket timeout với MongoDB), lỗi bị nuốt qua `catch (_) {}`.
3. Worker đang thực thi `task` không nhận được bất kỳ thông tin nào về trạng thái lease của khóa, tiếp tục thực hiện ghi dữ liệu dù thời hạn lease đã mất.

### 2.2. Phân tích nguyên nhân gốc rễ (Root Cause)
1. **Hiệu ứng Split-Brain và Overlapping Executions:** Giả sử Worker A thực thi một tác vụ dài hơn thời gian lease (hoặc bị GC pause, mạng chậm khiến heartbeat thất bại quá 4 phút). Khóa phân tán hết hạn và Worker B acquire thành công khóa đó. Worker A hồi phục và tiếp tục chạy tác vụ ghi dữ liệu song song với Worker B, dẫn đến xung đột dữ liệu nghiêm trọng.
2. **Heartbeat chồng lấn (Heartbeat Concurrency):** Khi MongoDB phản hồi chậm, nếu thời gian chờ của một lời gọi `extend` dài hơn chu kỳ heartbeat (30s), nhiều promise heartbeat có thể chạy đồng thời, gây lãng phí tài nguyên và tạo điều kiện race condition.

### 2.3. Giải pháp thiết kế
1. **Theo dõi trạng thái Lease tích cực:** Khai báo biến `leaseActive = true`. Nếu `extend()` trả về `false` hoặc ném ngoại lệ, lập tức đặt `leaseActive = false`, ghi nhận `lostReason`, ghi log cảnh báo và dừng `heartbeatTimer`.
2. **Cờ chống chồng lấn `inFlightHeartbeat`:** Đảm bảo tại một thời điểm chỉ có tối đa một lời gọi `extend` đang được xử lý.
3. **Cung cấp `lockContext` cho tác vụ:** Truyền đối tượng `lockContext` vào `task(lockContext)`:
   - `isLeaseActive()`: Trả về `true` nếu lease còn hiệu lực, `false` nếu đã mất.
   - `checkLeaseOrThrow()`: Ném lỗi `LEASE_LOST` nếu lease đã mất.
   - `getLeaseState()`: Trả về snapshot trạng thái lease hiện tại.
4. **Tích hợp kiểm tra Lease vào Maintenance Job:** Trong `runMaintenanceJob` và vòng lặp `rejectExpiredPendingClasses`, trước mỗi bước và trước khi xử lý mỗi candidate lớp học, kiểm tra `lockContext.isLeaseActive()`. Nếu mất lease, hủy bỏ các bước tiếp theo ngay lập tức để worker mới an toàn tiếp quản.

---

## 3. Vấn đề 3: Đánh Rơi Thông Báo Khi Dispatch Thất Bại Sau Commit (FIX-03)

### 3.1. Hiện tượng & Triệu chứng
Trong `maintenanceJob.js`, thông báo được gửi sau khi transaction commit thành công (`post-commit`):
```javascript
// Sau commit:
try {
  await notificationService.notify({ ... });
} catch (notifyErr) {
  console.error("Failed to send notification:", notifyErr.message);
}
```
Nếu lời gọi gửi thông báo ném lỗi (ví dụ dịch vụ bên ngoài/kênh đẩy gặp sự cố tạm thời), lỗi chỉ được in ra console mà không có cơ chế lưu vết trạng thái thất bại.

### 3.2. Phân tích nguyên nhân gốc rễ (Root Cause)
1. **Không thể Rollback giao dịch đã Commit:** Do transaction đã commit thành công, không thể và không được phép rollback trạng thái `REJECTED` của lớp học (vì điều đó sẽ gây mâu thuẫn dữ liệu với các hệ thống khác đã quan sát thấy trạng thái commit).
2. **Thiếu cơ chế Re-delivery / Outbox Pattern:** Khi không ghi nhận bản ghi thông báo ở trạng thái lỗi (`deliveryStatus: "FAILED"`), hệ thống mất dấu việc giáo viên chưa nhận được thông báo về việc lớp bị từ chối tự động.

### 3.3. Giải pháp thiết kế
1. **Lưu trữ thông báo thất bại có cấu trúc:** Khi dispatch thông báo gặp lỗi ở bước post-commit, bắt ngoại lệ và chủ động lưu một bản ghi vào bảng `Notification` với:
   - `deliveryStatus: "FAILED"`
   - `lastError: notifyErr.message`
   - `dedupeKey: `expired_class_rejected:${classId}`
2. **Quy trình Retry tự động:** Thêm hàm `retryFailedNotifications(options)` trong `notificationService` để tìm các thông báo có `deliveryStatus: "FAILED"` và tái gửi.
3. **Tích hợp vào Maintenance Job:** Bổ sung bước `notificationRetry` vào danh sách các bước bảo trì tự động định kỳ của `maintenanceJob`, đảm bảo hệ thống tự phục hồi mà không cần can thiệp thủ công.
