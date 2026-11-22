# BÁO CÁO KẾT QUẢ KIỂM THỬ (TEST RESULTS & EVIDENCE)
## TASK BE-02 — AUTOMATIC CLASS EXPIRATION REJECTION

- **Dự án:** Edunity V3
- **Tập tin test mới:** [`BackEnd/tests/be02MaintenanceExpiredClass.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/be02MaintenanceExpiredClass.test.js)
- **Môi trường:** Node.js, Jest, Mongoose, MongoMemoryReplSet thực thụ
- **Kết quả Suite mới:** **9/9 tests PASS (100%) — Thời gian: 5.335 s**
- **Kết quả Hồi quy Liên quan:** **2 Test Suites — 28 Tests — 100% PASS**

---

### 1. Chi tiết 9 Kịch bản Kiểm thử Chức năng Mới (`be02MaintenanceExpiredClass.test.js`)

| STT | Tên Kịch bản / Mục tiêu | Trạng thái | Thời gian | Chi tiết Xác minh Thực tế |
| :---: | :--- | :---: | :---: | :--- |
| **01** | Lớp `PENDING_APPROVAL` quá hạn hoặc đến ngày khai giảng bị từ chối | **PASS** | 177 ms | Quét đúng cả 2 lớp: lớp có `startDate` trong quá khứ và lớp có `startDate` là ngày hôm nay. Trạng thái chuyển sang `REJECTED`, ghi đúng `reviewNote`, giữ nguyên `startDate`. |
| **02** | Lớp chưa đến ngày khai giảng không bị ảnh hưởng | **PASS** | 131 ms | Lớp có `startDate` trong tương lai được bỏ qua nguyên vẹn; trạng thái vẫn là `PENDING_APPROVAL`, không có `reviewNote`. |
| **03** | Lớp đã duyệt hoặc `NEED_CHANGES`/`DRAFT` không bị đụng chạm | **PASS** | 149 ms | Kiểm tra trên các lớp có `startDate` trong quá khứ nhưng mang trạng thái `OPEN`, `IN_PROGRESS`, `COMPLETED`, `NEED_CHANGES`, `DRAFT`: cả 5 lớp đều giữ nguyên 100% trạng thái gốc. |
| **04** | Kiểm tra ranh giới múi giờ chính xác (Timezone Boundary) | **PASS** | 115 ms | Với lớp khai giảng ngày 20/11 (giờ VN): thời điểm 23:55 ngày 19/11 (giờ VN) KHÔNG bị từ chối; thời điểm 00:05 ngày 20/11 (giờ VN) BỊ từ chối ngay lập tức dù giờ UTC của server vẫn là ngày 19/11. |
| **05** | Tính lũy đẳng (Idempotency): Chạy job 2 lần liên tiếp | **PASS** | 135 ms | Lần 1 xử lý 1 lớp. Lần 2 xử lý 0 lớp. Kiểm tra database thấy chỉ sinh **đúng 1 bản ghi AuditLog** và **đúng 1 Notification**. |
| **06** | Concurrency Safety: Chạy song song không ghi đè | **PASS** | 151 ms | Kích hoạt đồng thời 2 worker `rejectExpiredPendingClasses`: tổng số lớp xử lý là 1, chỉ đúng 1 bản ghi AuditLog được tạo. |
| **07** | Cô lập sự cố (Fault Isolation) | **PASS** | 166 ms | Giả lập lỗi DB trên lớp 1: hệ thống ghi nhận lỗi vào mảng `errors`, không bị crash tiến trình, và xử lý thành công lớp 2. |
| **08** | Audit Actor Hệ thống hợp lệ | **PASS** | 137 ms | Bản ghi AuditLog được tạo với `actorAdminId: null`, `actorType: "SYSTEM"`, không giả mạo bất kỳ Admin ID nào. |
| **09** | Tích hợp trong chuỗi `runMaintenanceJob` | **PASS** | 198 ms | Hàm `runMaintenanceJob` thực thi hoàn tất bước `expiredPendingClasses`, trả về kết quả cấu trúc và từ chối lớp quá hạn thành công. |

---

### 2. Minh chứng Thực thi Test Suite Chuyên biệt

```text
> backend@1.0.0 test
> jest tests/be02MaintenanceExpiredClass.test.js

PASS tests/be02MaintenanceExpiredClass.test.js (5.112 s)
  TASK BE-02: Automatic Class Expiration Rejection Integration Suite
    √ 1. Rejects PENDING_APPROVAL class when startDate has arrived or is in the past (177 ms)
    √ 2. Does not reject PENDING_APPROVAL class when startDate is in the future (131 ms)
    √ 3. Only targets PENDING_APPROVAL: OPEN, IN_PROGRESS, NEED_CHANGES, DRAFT are untouched (149 ms)
    √ 4. Precision Timezone Boundary Test: evaluates calendar day boundaries accurately (115 ms)
    √ 5. Idempotent: Running the job twice produces exactly 1 audit and 1 notification (135 ms)
    √ 6. Concurrency Safety: Does not overwrite concurrent Admin approval or double reject (151 ms)
    √ 7. Fault Isolation: An error on one class does not crash the processing of other classes (166 ms)
    √ 8. Audit System Actor: Correctly records actorType=SYSTEM without faking Admin ID (137 ms)
    √ 9. Integration: runMaintenanceJob executes expiredPendingClasses step successfully (198 ms)

Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total
Snapshots:   0 total
Time:        5.335 s
```

---

### 3. Kết quả Hồi quy Liên quan

1. **`tests/be01ClassNeedChanges.test.js`:** **9/9 tests PASS** (5.55 s) — Đảm bảo trạng thái `NEED_CHANGES` và workflow yêu cầu sửa đổi không bị ảnh hưởng.
2. **`tests/maintenanceAndFinance.test.js`:** **10/10 tests PASS** (6.48 s) — Đảm bảo toàn bộ các tác vụ bảo trì định kỳ khác (hết hạn học bổng, xóa recording, jobLock...) tiếp tục vận hành hoàn hảo.
3. **Tổng cộng:** **28/28 tests PASS 100%**.

---

### 4. Báo cáo Các Trường hợp Chưa Kiểm thử được (Untested Edge Cases)

1. **Sự cố mất kết nối mạng MongoDB Replica Set toàn phần giữa chừng:** Đã kiểm thử lỗi ghi trên từng document (Test 7), nhưng trường hợp ngắt kết nối mạng tầng TCP trong lúc đang commit cần môi trường kiểm thử hạ tầng chuyên biệt (chaos engineering).
2. **Nhuận giây (Leap Seconds):** Múi giờ IANA chuẩn bỏ qua giây nhuận; việc so sánh ranh giới ngày dựa trên epoch timestamp và offset phút có thể chênh lệch tối đa 1 giây tại thời điểm chuyển giao giây nhuận thiên văn.
