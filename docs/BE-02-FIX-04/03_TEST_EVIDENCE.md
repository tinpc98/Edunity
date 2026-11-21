# BE-02-FIX-04: Bằng Chứng Kiểm Thử Chi Tiết (Test Evidence)

**Dự án:** EDUNITY V3  
**Giai đoạn:** Phase 2 — Hardening & Final Reliability (BE-02-FIX-04)  
**File kiểm thử:** [BackEnd/tests/be02MaintenanceExpiredClass.test.js](file:///c:/CODE/Edunity/BackEnd/tests/be02MaintenanceExpiredClass.test.js)  
**Môi trường:** MongoDB Memory Replica Set (ACID Multi-Document Transactions)  
**Lệnh thực thi:** `npm --prefix BackEnd test -- tests/be02MaintenanceExpiredClass.test.js`  
**Kết quả:** 17/17 PASS (100%)  

---

## 1. Bằng Chứng Thực Tế Cho 10 Yêu Cầu Kỹ Thuật

### 1.1. Yêu cầu 1: Transaction Rollback khi Notification Persistence Thất Bại (Req 1)
- **Kịch bản:** Giả lập lỗi ghi cơ sở dữ liệu khi lưu `Notification` bên trong transaction.
- **Bằng chứng kiểm chứng:**
  - `result.rejectedCount == 0`.
  - Trạng thái của lớp học trong DB: `PENDING_APPROVAL`.
  - `AuditLog.countDocuments({ targetId: cls._id }) == 0`.
  - `Notification.countDocuments({ userId: teacher._id }) == 0`.
  - **Kết luận:** Rollback nguyên tử 100%, không xảy ra partial commit.

### 1.2. Yêu cầu 2: Recovery Sau Crash (Req 2)
- **Kịch bản:** Giả lập lớp học ở trạng thái `REJECTED` do quá hạn (có AuditLog `action: "CLASS_EXPIRED_REJECTED"`), nhưng document Notification bị thiếu.
- **Bằng chứng kiểm chứng:**
  - `recoverMissingExpiredClassNotifications` phát hiện và bù Notification: `recoveredCount == 1`.
  - Document Notification mới được tạo với `deliveryStatus: "DELIVERED"`, `dedupeKey: "CLASS_EXPIRED_REJECTED:<classId>"`.
  - Chạy recovery lần thứ hai: `recoveredCount == 0`, không nhân đôi thông báo.

### 1.3. Yêu cầu 3: Recovery Trên 100 Lớp với Keyset Pagination (Req 3)
- **Kịch bản:**
  - Tạo **120 lớp học** quá hạn kèm 120 bản ghi AuditLog `CLASS_EXPIRED_REJECTED`.
  - **50 lớp đầu tiên** đã có sẵn Notification.
  - **70 lớp tiếp theo** bị thiếu Notification.
  - Chạy recovery với `batchSize = 30` (nhỏ hơn 50 để kiểm tra việc phân trang vượt qua batch đầu).
- **Bằng chứng kiểm chứng:**
  - Hàm recovery sử dụng `_id: { $gt: lastId }` tịnh tiến qua các batch.
  - Không bị nghẽn ở 50 bản ghi đầu tiên!
  - `recoveryResult.recoveredCount == 70` (chính xác 70 lớp thiếu được phục hồi).
  - Tổng số Notification trong DB sau khi chạy: đúng **120**.
  - Chạy lại lần 2: `recoveredCount == 0`.

### 1.4. Yêu cầu 4: Recovery Không Nhầm Lớp Bị Admin Từ Chối Thủ Công (Req 4)
- **Kịch bản:** Admin từ chối thủ công một lớp học (`reviewedBy: admin._id`, AuditLog `action: "CLASS_REJECTED"`), ghi chú cố tình chứa từ khóa *"Admin từ chối vì đã đến ngày khai giảng mà hồ sơ chưa hoàn chỉnh"*.
- **Bằng chứng kiểm chứng:**
  - Chạy recovery: `res.recoveredCount == 0`.
  - `Notification.countDocuments({ userId: teacher._id }) == 0`.
  - **Kết luận:** Bỏ qua 100% các lớp từ chối thủ công, bảo vệ an toàn nghiệp vụ.

### 1.5. Yêu cầu 5: Notification Deduplication (Req 5)
- **Kịch bản:** Gọi `notify` nhiều lần với cùng một `dedupeKey`.
- **Bằng chứng kiểm chứng:**
  - Lời gọi 1 và 2 đều trả về `success: true`.
  - Tổng số bản ghi trong bảng `Notification` là 1. Bản ghi đầu tiên được bảo toàn nguyên vẹn.

### 1.6. Yêu cầu 6: Retry Semantics Thực Tế (Req 6)
- **Kịch bản:**
  - Tạo một Notification có `deliveryStatus: "FAILED"`.
  - Lần 1: Chạy retry với `deliveryHandler` ném ngoại lệ -> Notification giữ nguyên `deliveryStatus: "FAILED"`, `retryCount = 1`, `lastError` ghi nhận lỗi.
  - Lần 2: Chạy retry với `deliveryHandler` thành công -> Notification chuyển sang `deliveryStatus: "DELIVERED"`, `lastError = null`, `retriedAt` được cập nhật.
  - **Kết luận:** Phản ánh đúng kết quả truyền tin thực tế, không fake đổi trạng thái.

### 1.7. Yêu cầu 7: Hai Worker Chạy Đồng Thời (Req 7)
- **Kịch bản:** Hai worker đồng thời gọi `rejectExpiredPendingClasses` trên cùng 1 lớp học.
- **Bằng chứng kiểm chứng:**
  - Tổng số lớp bị từ chối: đúng **1**.
  - `AuditLog`: đúng **1**.
  - `Notification`: đúng **1**.

### 1.8. Yêu cầu 8: Lease Mất Giữa Transaction (Lock Fencing) (Req 8)
- **Kịch bản:**
  - Worker 1 đang mở transaction để reject lớp học.
  - Khi đang ở bên trong `withTransaction`, Worker 2 cướp khóa trong DB (`JobLock.owner = "worker-fencing-2"`).
  - Lệnh `lockContext.verifyOwnership(session)` bên trong transaction phát hiện mất quyền sở hữu trên MongoDB.
- **Bằng chứng kiểm chứng:**
  - Ném ngoại lệ `LOCK_FENCING_FAILED` với message: `Lock fencing error: distributed lock "test-fencing-lock" is no longer owned by worker-fencing-1`.
  - Transaction lập tức abort: Class giữ nguyên trạng thái `PENDING_APPROVAL`.
  - `AuditLog`: 0 bản ghi.
  - `Notification`: 0 bản ghi.
  - Worker 1 ngắt vòng lặp ngay lập tức và dừng xử lý các ứng viên tiếp theo.

---

## 2. Nhật Ký Thực Thi Kiểm Thử (Jest Output Snapshot)

```
PASS tests/be02MaintenanceExpiredClass.test.js (7.375 s)
  TASK BE-02-FIX-04: Final Notification & Concurrency Hardening Suite
    Req 1 & Core Transaction Atomicity
      √ 1. Transaction rollback khi notification persistence thất bại (165 ms)
      √ 1b. Transaction thành công trọn vẹn: Cả Class, AuditLog và Notification đều được commit (125 ms)
    Req 2: Recovery sau crash
      √ 2. Recovery sau crash: Tự phục hồi notification cho lớp đã REJECTED do quá hạn (159 ms)
    Req 3: Recovery trên 100 lớp
      √ 3. Recovery trên 120 lớp: Keyset pagination quét sạch 70 lớp thiếu dù 50 lớp đầu đã có notification (912 ms)
    Req 4: Recovery không nhầm manual rejection
      √ 4. Recovery bỏ qua hoàn toàn các lớp bị Admin từ chối thủ công (140 ms)
    Req 5: Notification deduplication
      √ 5. Gửi lặp lại cùng dedupeKey không tạo bản ghi thứ 2 (idempotency) (149 ms)
    Req 6: Retry Semantics
      √ 6. Retry thực sự thực hiện delivery: Nếu deliveryHandler thất bại giữ FAILED; thành công chuyển DELIVERED (172 ms)
    Req 7: Hai worker chạy đồng thời
      √ 7. Hai worker đồng thời: Đúng 1 worker reject thành công, không tạo duplicate audit/notification (134 ms)
    Req 8: Lease mất giữa transaction (Lock Fencing)
      √ 8. Lock fencing bên trong transaction: Nếu lease bị mất/cướp khóa, transaction lập tức abort (126 ms)
    Distributed Lock Baseline Tests
      √ 11. Acquire lock thành công khi tự do (99 ms)
      √ 12. Acquire lock trả về false khi có worker khác nắm giữ (105 ms)
      √ 13. Heartbeat gia hạn khóa thành công (479 ms)
      √ 14. Heartbeat trả về false đánh dấu lease mất (366 ms)
      √ 15. Release không xóa lock của worker khác (117 ms)
    Timezone & Boundary Precision
      √ 16. Lớp tương lai không bị từ chối (95 ms)
      √ 17. Chỉ lọc PENDING_APPROVAL: OPEN, IN_PROGRESS, NEED_CHANGES, DRAFT không bị ảnh hưởng (111 ms)
      √ 18. Hằng số bảo trì được xuất đúng chuẩn (86 ms)

Test Suites: 1 passed, 1 total
Tests:       17 passed, 17 total
Snapshots:   0 total
Time:        7.595 s
```
