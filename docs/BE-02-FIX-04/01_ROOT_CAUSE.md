# BE-02-FIX-04: Phân Tích Nguyên Nhân Gốc Rễ (Root Cause Analysis)

**Dự án:** EDUNITY V3  
**Giai đoạn:** Phase 2 — Hardening & Final Reliability (BE-02-FIX-04)  
**Tài liệu:** Báo cáo phân tích chuyên sâu các khiếm khuyết phát hiện sau BE-02-FIX-03  

---

## 1. Vấn Đề 1: Giả Lập Delivery Trong Hàm `retryFailedNotifications()`

### 1.1. Hiện trạng trước sửa đổi
Trong các phiên bản trước, hàm `retryFailedNotifications` trong `notificationService.js` xử lý các bản ghi thông báo có `deliveryStatus: "FAILED"` như sau:
```javascript
for (const notif of failedDocs) {
  try {
    notif.deliveryStatus = "DELIVERED";
    notif.lastError = null;
    await notif.save();
    retried.push(notif._id.toString());
  } catch (err) { ... }
}
```

### 1.2. Phân tích nguyên nhân gốc rễ
1. **Bản chất của Notification trong Edunity:**
   Notification trong hệ sinh thái Edunity là một **DB inbox** (hộp thư lưu trong bảng `Notification` của MongoDB). Người dùng truy vấn trực tiếp qua API `GET /api/account/me/notifications`.
2. **Khuyết tật ngữ nghĩa (Semantic Defect):**
   Nếu một bản ghi đã được lưu trong DB với trạng thái `FAILED`, việc một background worker quét qua và chỉ đơn giản đổi chuỗi `deliveryStatus = "DELIVERED"` mà không thực hiện bất kỳ hành động truyền tin/giao nhận thực tế nào là **giả lập delivery (fake status flipping)**.
   Nếu có một kênh truyền tin ngoại vi (như email, push gateway, webhook), retry bắt buộc phải thực thi lại lời gọi truyền tin đó. Nếu lời gọi đó tiếp tục thất bại, bản ghi bắt buộc phải giữ nguyên `FAILED` và tăng `retryCount`.

---

## 2. Vấn Đề 2: Rủi Ro Bỏ Sót Dữ Liệu & Batch Hogging Trong `recoverMissingExpiredClassNotifications()`

### 2.1. Hiện trạng trước sửa đổi
Hàm quét phục hồi trong BE-02-FIX-03 sử dụng truy vấn:
```javascript
const expiredClasses = await Class.find({
  status: "REJECTED",
  reviewNote: { $regex: /ngày khai giảng.*chưa được phê duyệt/i },
  ...NOT_DELETED,
})
  .select("_id teacherId className reviewNote")
  .limit(50)
  .lean();
```

### 2.2. Phân tích nguyên nhân gốc rễ
1. **Nguy cơ chiếm giữ vĩnh viễn Batch đầu tiên (Batch Hogging):**
   Truy vấn sử dụng `.limit(50)` cố định mà không có cơ chế Keyset Pagination (`_id: { $gt: lastId }`).
   Giả sử hệ thống có 120 lớp học quá hạn: 50 lớp đầu tiên đã có Notification từ trước, còn 70 lớp tiếp theo bị thiếu Notification.
   Mỗi lần hàm chạy, nó luôn truy vấn ra đúng 50 lớp đầu tiên. Khi kiểm tra thấy 50 lớp này đều đã có notification, hàm kết thúc mà **hoàn toàn không bao giờ nhìn thấy 70 lớp tiếp theo**.
2. **Fragile Regex trên `reviewNote`:**
   Dùng biểu thức chính quy trên văn bản tiếng Việt làm điều kiện xác định nghiệp vụ chính tiềm ẩn nguy cơ:
   - Nếu Admin từ chối thủ công một lớp học và ghi chú có chứa các từ khóa như *"ngày khai giảng"* và *"chưa được phê duyệt"*, hàm recovery sẽ nhận diện nhầm là lớp bị từ chối tự động và gửi nhầm thông báo tự động cho giáo viên.
   - Truy vấn regex không thể sử dụng index hiệu quả, gây full collection scan khi dữ liệu lớn.
3. **Giải pháp chuẩn:**
   Sử dụng bản ghi `AuditLog` với `action: "CLASS_EXPIRED_REJECTED"` và `targetType: "Class"`. Đây là dấu vết nghiệp vụ duy nhất, bất biến và chỉ được sinh ra bởi hệ thống khi tự động từ chối lớp quá hạn. Kết hợp Keyset Pagination trên `_id` đảm bảo quét sạch 100% dữ liệu qua nhiều batch mà không bị nghẽn.

---

## 3. Vấn Đề 3: Kiểm Tra Lease Chưa Đủ Chặt Trong Quá Trình Xử Lý Giao Dịch

### 3.1. Hiện trạng trước sửa đổi
Maintenance job chỉ kiểm tra lease thông qua biến bộ nhớ `lockContext.isLeaseActive()`.

### 3.2. Phân tích nguyên nhân gốc rễ
1. **Lỗ hổng GC Pause / Mất Lease giữa chừng:**
   Nếu Worker 1 gặp hiện tượng Full GC pause kéo dài hoặc event loop bị block quá thời gian TTL (4 phút), khóa phân tán trong MongoDB sẽ hết hạn. Worker 2 có thể acquire thành công khóa này trong MongoDB.
   Khi Worker 1 phục hồi từ GC pause, biến trong bộ nhớ `leaseActive` vẫn là `true` (do timer heartbeat chưa kịp chạy). Worker 1 sẽ mở transaction và thực hiện ghi dữ liệu song song với Worker 2, gây nguy cơ xung đột dữ liệu (Split-Brain).
2. **Khuyết tật thiếu Fencing:**
   Kiểm tra trong bộ nhớ không thể thay thế cho việc xác thực quyền sở hữu trên cơ sở dữ liệu.
   Cần phải có cơ chế **Lock Fencing**: xác thực trực tiếp trên MongoDB document `JobLock` ngay trước khi mở transaction và đặc biệt là **bên trong session của chính transaction đó** (`verifyOwnership(session)`). Nếu khóa đã bị worker khác cướp, transaction lập tức throw `LOCK_FENCING_FAILED` và abort toàn bộ thao tác.
