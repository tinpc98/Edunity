# ROOT CAUSE ANALYSIS — BE-02-FIX-05
**Dự án:** EDUNITY V3  
**Giai đoạn:** Phase 2 Maintenance & Reliability Hardening  
**Tác giả:** Senior Backend Engineer  
**Ngày:** 21/11/2026  

---

## 1. Bối cảnh & Mục tiêu

Sau các đợt audit và hoàn thiện từ BE-02 đến BE-02-FIX-04, hệ thống Maintenance Job xử lý tự động từ chối lớp học quá hạn (`rejectExpiredPendingClasses`) và phục hồi thông báo (`recoverMissingExpiredClassNotifications`) đã đạt được kiến trúc xử lý dựa trên MongoDB Transaction kết hợp với AuditLog và Distributed Lock (`JobLock`).

Tuy nhiên, đợt kiểm tra độ tin cậy chuyên sâu (deep reliability audit) phát hiện 3 điểm rủi ro nghiêm trọng ở mức kiến trúc dữ liệu và concurrency:

1. **Sai lệch ngữ nghĩa trong Notification Retry (`retryFailedNotifications`):** Cron job mặc định gọi hàm retry không truyền `deliveryHandler` nhưng hàm này tự động chuyển đổi trạng thái bản ghi từ `FAILED` sang `DELIVERED`, tạo ra ảo giác "thông báo đã gửi thành công" (fake delivery) trong khi không có hành động phân phối thực tế nào diễn ra.
2. **Snapshot Isolation Blind Spot trong Distributed Lock Fencing:** Trong MongoDB multi-document transaction, việc kiểm tra sở hữu lock (`verifyOwnership`) chỉ bằng câu lệnh đọc (`findOne`) bị hạn chế bởi Snapshot Isolation. Nếu worker khác cướp lock hoặc gia hạn lock sau khi transaction bắt đầu snapshot, câu lệnh đọc vẫn trả về dữ liệu cũ (hoặc không thấy lock mới), và khi commit transaction, MongoDB không phát hiện `WriteConflict` vì `JobLock` không hề có write operation nào.
3. **Thiếu Error Boundary trong Recovery Keyset Pagination:** Trong tiến trình quét AuditLog để bù thông báo (`recoverMissingExpiredClassNotifications`), nếu một bản ghi ứng viên gặp lỗi (như trùng lặp khóa hoặc validation lỗi), exception chưa được bắt độc lập có thể làm đổ vỡ toàn bộ batch xử lý, dừng vòng lặp keyset pagination hoặc báo cáo sai lệch số lượng `recovered`.

---

## 2. Phân tích chi tiết từng vấn đề

### 2.1. Vấn đề 1: Sai lệch ngữ nghĩa Notification Retry (Fake Delivery Semantics)

#### Mô tả hiện tượng:
Trong `src/services/notificationService.js`, hàm `retryFailedNotifications(options)` được thiết kế để xử lý lại các thông báo thất bại:
```javascript
// Mã nguồn trước khi fix:
for (const notification of failedNotifications) {
  notification.retryCount += 1;
  notification.status = "DELIVERED"; // Tự động đổi trạng thái!
  await notification.save();
}
```
Đường dẫn cron mặc định trong `cronJobs.js` gọi:
```javascript
notificationRetry: () => retryFailedNotifications()
```

#### Nguyên nhân gốc rễ (Root Cause):
- Edunity Notification đóng vai trò là DB Inbox (thông báo lưu trữ trực tiếp trong cơ sở dữ liệu MongoDB để hiển thị trên web/mobile notification panel). Nếu một thông báo ở trạng thái `FAILED` (do lỗi ghi mạng, timeout, hoặc lỗi kết nối ngoài), việc retry không thể chỉ đơn thuần đổi cờ `status = "DELIVERED"` nếu không có `deliveryHandler` (kênh gửi email, push notification, hoặc WebSocket broker) thực hiện phát lại thành công.
- Việc tự động gán `status = "DELIVERED"` khi không có `deliveryHandler` làm sai lệch audit trail và che giấu lỗi kỹ thuật: người dùng không thực sự nhận được thông báo nhưng hệ thống lại báo cáo là đã phân phối thành công.

---

### 2.2. Vấn đề 2: Lỗ hổng Fencing dưới MongoDB Snapshot Isolation

#### Mô tả hiện tượng:
Trong `maintenanceJob.js`, khi xử lý transaction từ chối lớp học, worker cố gắng xác minh tính hợp lệ của lock:
```javascript
// Trước khi fix:
const isOwner = await jobLock.verifyOwnership(jobName, instanceId);
```
Hàm `verifyOwnership` thực hiện:
```javascript
const lock = await JobLock.findOne({ name, owner, lockedUntil: { $gt: now } });
return !!lock;
```

#### Nguyên nhân gốc rễ (Root Cause):
- **MongoDB Snapshot Isolation:** Khi một transaction bắt đầu (`session.withTransaction`), MongoDB thiết lập một read snapshot tại thời điểm đọc đầu tiên.
- Giả sử Worker A đang giữ lock với `lockedUntil = T`. Worker A chạy transaction chậm (do GC pause hoặc network latency).
- Lock của Worker A hết hạn tại thời điểm `T`. Worker B chiếm lock mới hợp lệ (`owner = Worker B`, `lockedUntil = T + 4m`).
- Nếu Worker A gọi `findOne` trong transaction, tùy vào thời điểm snapshot và session context:
  - Nếu không truyền `session`, Worker A đọc ngoài transaction và có thể phát hiện mất lock, nhưng không thể ngăn chặn Worker B ghi đè cùng lúc khi commit.
  - Nếu truyền `session`, `findOne` chỉ đọc snapshot. Do `JobLock` không bị ghi (write) bởi Worker A trong transaction này, MongoDB **không kích hoạt Write Conflict** giữa Worker A và Worker B khi commit transaction! Worker A sẽ commit thành công các thay đổi lớp học và audit log, trong khi Worker B cũng đang xử lý đồng thời, dẫn đến vi phạm tính toàn vẹn độc quyền (mutual exclusion).

#### Giải pháp kỹ thuật:
- Bổ sung trường `fencingToken: { type: Number, default: 0, min: 0 }` vào `JobLock`.
- Khi gọi `verifyOwnership` bên trong transaction có truyền `session`, thực hiện một thao tác ghi nguyên tử (atomic write operation):
  ```javascript
  const lock = await JobLock.findOneAndUpdate(
    { name, owner, lockedUntil: { $gt: now } },
    { $inc: { fencingToken: 1 } },
    { session, new: true }
  );
  ```
- Thao tác này buộc MongoDB phải ghi nhận write intent trên document `JobLock` trong session của transaction. Nếu worker khác đã chiếm lock hoặc sửa đổi document này, MongoDB sẽ lập tức phát hiện conflict hoặc truy vấn trả về `null`, cho phép transaction lập tức abort với lỗi `LOCK_FENCING_FAILED` / `LOCK_OWNERSHIP_LOST`.

---

### 2.3. Vấn đề 3: Thiếu Per-Candidate Error Boundary trong Keyset Recovery

#### Mô tả hiện tượng:
Trong hàm `recoverMissingExpiredClassNotifications`, hệ thống duyệt qua các bản ghi `AuditLog` loại `CLASS_AUTO_EXPIRED` để tạo thông báo bổ sung cho giảng viên nếu chưa có thông báo tương ứng.

#### Nguyên nhân gốc rễ (Root Cause):
- Trong quá trình xử lý lặp qua danh sách `candidates` được lấy từ Keyset Pagination:
  - Nếu một ứng viên bị lỗi (ví dụ: database transient error, hoặc trùng lặp `idempotencyKey` dẫn đến duplicate key error không mong muốn), toàn bộ vòng lặp hoặc promise của batch bị crash.
  - Các ứng viên kế tiếp trong cùng batch và các batch ở keyset sau bị bỏ qua, không được quét tiếp.
  - Hàm không trả về danh sách lỗi có cấu trúc (`errors: [{ classId, auditId, error }]`), khiến bộ phận vận hành không thể giám sát chính xác nguyên nhân thất bại.

---

## 3. Kết luận

Cả 3 vấn đề trên đều xuất phát từ các khía cạnh biên (edge cases) của hệ thống phân tán và cơ sở dữ liệu transaction. Việc khắc phục triệt để đòi hỏi:
1. Chuẩn hóa ngữ nghĩa retry: Chỉ chuyển `DELIVERED` khi có `deliveryHandler` thực thi thành công; nếu không có handler, giữ nguyên `FAILED` và đánh dấu `skipped` với mã `NO_DELIVERY_HANDLER`.
2. Biến lock check thành write operation có fencing token trong transaction session để tận dụng cơ chế phát hiện xung đột của WiredTiger.
3. Thêm per-candidate try-catch và structured error logging trong recovery pipeline để đảm bảo tính bất biến của tiến trình phục hồi.
