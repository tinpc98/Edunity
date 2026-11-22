# BE-02-FIX-03: Phân Tích Nguyên Nhân Gốc Rễ (Root Cause Analysis)

**Dự án:** EDUNITY V3  
**Giai đoạn:** Phase 2 — Targeted Fix (BE-02-FIX-03)  
**Tài liệu:** Phân tích sự cố mất thông báo khi tiến trình gặp lỗi (Crash Post-Commit) và kiến trúc giao dịch  

---

## 1. Bối cảnh & Hiện tượng (Context & Symptom)

Trong giai đoạn BE-02-FIX-02, hệ thống đã chuẩn hóa việc chuyển trạng thái lớp học (`Class`) và ghi lịch sử kiểm toán (`AuditLog`) vào trong cùng một MongoDB session có giao dịch (`session.withTransaction`).
Tuy nhiên, thao tác gửi thông báo (`notificationService.notify`) lại được tách rời và đặt ở bước **post-commit** (sau khi transaction đã commit thành công):

```javascript
// Mã nguồn trong BE-02-FIX-02:
await session.withTransaction(async () => {
  committedDoc = await Class.findOneAndUpdate(..., { session });
  await audit(..., session);
});

// Thao tác gửi thông báo diễn ra NGOÀI transaction (Post-Commit):
try {
  await notify(committedDoc.teacherId, ..., { throwOnError: true });
} catch (notifyErr) {
  // Cố gắng ghi Notification với status FAILED...
}
```

Mặc dù có cơ chế bọc `try/catch` để tránh làm rollback transaction đã commit, mô hình này để lộ các lỗ hổng kiến trúc nghiêm trọng khi xảy ra lỗi tiến trình (**Crash Post-Commit**).

---

## 2. Phân Tích Các Tình Huống Thất Bại Cụ Thể (Failure Scenarios)

### 2.1. Lỗ hổng 1: Tiến trình Crash ngay sau Transaction Commit (Post-Commit Crash Window)
- **Cơ chế lỗi:**
  1. Transaction commit thành công: Lớp học chuyển sang `REJECTED`, bản ghi `AuditLog` đã được ghi vào MongoDB.
  2. Ngay tại microsecond tiếp theo, trước khi mã JavaScript kịp thực thi dòng `await notify(...)`, Node.js process bị crash đột ngột (do `SIGKILL`, `OOM Killer`, mất nguồn phần cứng, hoặc Kubernetes Pod bị restart).
  3. Kết quả: Trong cơ sở dữ liệu, lớp học đã là `REJECTED`, nhưng **hoàn toàn không có bất kỳ bản ghi Notification nào** (kể cả bản ghi `FAILED`).
  4. Hậu quả: Khi job hoặc hệ thống khởi động lại, truy vấn của maintenance job chỉ tìm kiếm `{ status: "PENDING_APPROVAL" }`. Lớp học này vĩnh viễn bị bỏ qua! Giáo viên không bao giờ nhận được thông báo về việc lớp bị từ chối, và hệ thống không có bất kỳ dấu vết nào để tự phục hồi.

### 2.2. Lỗ hổng 2: "Giả lập Retry" bằng cách đổi trạng thái không cần thiết (Fake Status Flipping)
- **Bản chất của Notification trong Edunity:**
  Hệ thống Edunity sử dụng cơ chế thông báo nội bộ lưu trực tiếp trong MongoDB (bảng `Notification`), không có dịch vụ hàng đợi đẩy bên thứ ba (như FCM hay Email Gateway) trong luồng nội tại của hàm `notify`. Người dùng đọc thông báo qua API `GET /api/notifications` hoặc `GET /api/account/me/notifications`.
- **Nghịch lý của BE-02-FIX-02:**
  Khi thao tác ghi MongoDB post-commit thất bại, hệ thống lưu bản ghi với trạng thái `deliveryStatus: "FAILED"`. Sau đó worker retry quét các bản ghi này và chỉ đơn giản cập nhật trường `deliveryStatus = "DELIVERED"` trong cùng database MongoDB mà không thực hiện bất kỳ hành động truyền tin thực sự nào ra bên ngoài.
  Điều này vi phạm nguyên tắc thiết kế: *Không giả lập retry bằng cách đổi trạng thái trong DB nếu không có tác vụ thực sự để thử lại*.

### 2.3. Lỗ hổng 3: Phân mảnh dữ liệu khi ghi Notification DB thất bại
- Nếu thao tác lưu Notification thất bại do lỗi schema, lỗi disk hoặc lỗi phân vùng mạng:
  - Nếu nằm ngoài transaction: Class đã bị `REJECTED` nhưng không có thông báo.
  - Nếu nằm trong transaction: Toàn bộ Class update, AuditLog và Notification sẽ cùng rollback sạch sẽ (Atomicity).

---

## 3. Giải Pháp Kiến Trúc Tối Ưu (Architectural Solution)

### 3.1. Lưu trữ Notification nguyên tử trong Transaction (Atomic Notification Persistence)
Vì `Class`, `AuditLog`, và `Notification` đều nằm chung trên một MongoDB Database Cluster, ta đưa thao tác lưu trữ `Notification` vào **chính cùng MongoDB Session và Transaction** với `Class` và `AuditLog`:

```
MongoDB Multi-Document ACID Transaction:
┌──────────────────────────────────────────────────────────┐
│ 1. Class.findOneAndUpdate(status: REJECTED, { session }) │
│ 2. AuditLog.create(action: CLASS_EXPIRED_REJECTED)       │
│ 3. Notification.findOneAndUpdate(status: DELIVERED)      │
└──────────────────────────────────────────────────────────┘
                         │
             COMMIT NGUYÊN TỬ 100%
```

- **Nếu Crash trước Commit:** MongoDB tự động abort/rollback toàn bộ. Class vẫn là `PENDING_APPROVAL`, không có AuditLog rác, không có Notification rác. Job chạy lại sẽ xử lý lại bình thường.
- **Nếu Crash sau Commit:** Cả Class, AuditLog và Notification đều đã được commit an toàn vào DB! Không tồn tại "khoảng trống thời gian" nào mà Class bị `REJECTED` nhưng thiếu Notification.
- **Nếu Notification ghi lỗi:** Transaction rollback toàn bộ, không có partial commit, fail-closed an toàn.

### 3.2. Cơ chế Tự Phục Hồi Dữ Liệu Thiếu (Crash Recovery / Self-Healing)
Để xử lý các lớp học đã bị `REJECTED` trong quá khứ (từ các phiên bản cũ gặp crash post-commit hoặc can thiệp thủ công) mà bị thiếu notification, bổ sung bước `recoverMissingExpiredClassNotifications` vào `maintenanceJob`.
Hàm này quét các lớp học có `status: "REJECTED"` do quá hạn khai giảng nhưng chưa có bản ghi `Notification` tương ứng (theo `dedupeKey`), và tạo bù thông báo một cách hoàn toàn idempotent.
