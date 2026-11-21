# BÁO CÁO KẾT QUẢ KIỂM THỬ TÍCH HỢP (BE-01-FIX — TEST RESULTS)

**Dự án:** EDUNITY V3 — Backend  
**Giai đoạn:** Phase 1 Hardening — Class NEED_CHANGES Transaction & Audit Consistency  
**Chịu trách nhiệm:** Senior Backend Engineer (Châu)  
**Ngày thực hiện:** 21/11/2026  
**Trạng thái kiểm thử:** 100% PASS (14/14 TESTS BE-01, 88/88 TESTS FULL REGRESSION)  

---

## 1. PHẠM VI KIỂM THỬ BỔ SUNG

Trong tệp [BackEnd/tests/be01ClassNeedChanges.test.js](file:///c:/CODE/Edunity/BackEnd/tests/be01ClassNeedChanges.test.js), chúng tôi đã cập nhật và bổ sung đầy đủ các kịch bản kiểm thử theo đúng yêu cầu của mục 5 trong Task BE-01-FIX:

1. Request changes thành công (`Test 1`).
2. Thiếu `reviewNote` bị từ chối với 400 `VALIDATION_ERROR` (`Test 2`).
3. Sai trạng thái bị từ chối với 409 `CLASS_NOT_PENDING_APPROVAL` (`Test 3`).
4. Giáo viên sửa và gửi duyệt lại thành công (`Test 4`, `Test 5`).
5. Trạng thái `REJECTED` bị khóa vĩnh viễn (`Test 6`).
6. Audit log và Notification được ghi nhận chính xác (`Test 7`).
7. Hai request request-changes đồng thời không gây sai trạng thái (`Test 8`).
8. Kiểm tra phân quyền RBAC (`Test 9`).
9. **[MỚI] Audit thất bại thì Class không bị cập nhật dở dang (Rollback kiểm chứng) (`Test 10`).**
10. **[MỚI] Notification chỉ được gửi sau khi transaction đã commit thành công (`Test 11`).**
11. **[MỚI] Notification thất bại không gây hiểu nhầm trạng thái transaction (API trả 200 OK) (`Test 12`).**
12. **[MỚI] Tranh chấp đồng thời giữa `request-changes` và `approveClass` (`Test 13`).**
13. **[MỚI] Fail-closed với 503 khi session database không khả dụng (`Test 14`).**

---

## 2. KẾT QUẢ TEST SUITE BE-01 (`be01ClassNeedChanges.test.js`)

**Lệnh chạy:**
```powershell
npm --prefix BackEnd test -- tests/be01ClassNeedChanges.test.js
```

**Kết quả:** 14/14 tests PASS (Thời gian: 9.954s).

```text
PASS tests/be01ClassNeedChanges.test.js (9.717 s)
  TASK BE-01: Class NEED_CHANGES Workflow Integration Suite
    √ 1. Admin requests changes successfully: transitions PENDING_APPROVAL -> NEED_CHANGES (300 ms)
    √ 2. Rejects request-changes when reviewNote is missing or empty after trim (254 ms)
    √ 3. Cannot request changes on classes not in PENDING_APPROVAL status (409 Conflict) (380 ms)
    √ 4. Teacher can edit class in NEED_CHANGES status (240 ms)
    √ 5. Teacher can re-submit class in NEED_CHANGES status -> PENDING_APPROVAL (260 ms)
    √ 6. Teacher CANNOT edit or re-submit a REJECTED class (terminal rejected state) (291 ms)
    √ 7. Audit log and Notification are correctly recorded upon requesting changes (320 ms)
    √ 8. Concurrent duplicate request-changes requests do not cause invalid state transitions (297 ms)
    √ 9. Enforces RBAC: Teacher, Student, and unauthenticated requests are blocked (321 ms)
    √ 10. Transaction rollback on audit failure: Class remains PENDING_APPROVAL and no notification sent (457 ms)
    √ 11. Notification is dispatched post-commit: DB state is already committed when notify executes (408 ms)
    √ 12. Notification failure does not cause false transaction rollback (API returns 200 OK) (398 ms)
    √ 13. Concurrency between request-changes and approveClass: exactly one succeeds without overwriting (355 ms)
    √ 14. Fails closed with 503 DATABASE_TRANSACTION_UNAVAILABLE when session cannot be created (294 ms)

Test Suites: 1 passed, 1 total
Tests:       14 passed, 14 total
Snapshots:   0 total
Time:        9.954 s, estimated 10 s
```

---

## 3. KẾT QUẢ CHẠY HỒI QUY TOÀN BỘ CÁC MODULE LIÊN QUAN

Chạy đồng thời 5 test suites cốt lõi trên môi trường Replica Set thực:
1. `tests/be01ClassNeedChanges.test.js` (Class NEED_CHANGES Workflow & Transaction Hardening)
2. `tests/be02MaintenanceExpiredClass.test.js` (Maintenance Job Auto-Rejection)
3. `tests/be03AcademicSoftDelete.test.js` (Academic Soft Delete & Dependency Guard)
4. `tests/courseLifecycleCur12.test.js` (Course Lifecycle & Syllabus Versioning)
5. `tests/chauSafeDeleteConcurrencyReplSet.test.js` (ReplSet Safe Delete Concurrency)

**Lệnh chạy:**
```powershell
npm --prefix BackEnd test -- tests/be01ClassNeedChanges.test.js tests/be02MaintenanceExpiredClass.test.js tests/be03AcademicSoftDelete.test.js tests/courseLifecycleCur12.test.js tests/chauSafeDeleteConcurrencyReplSet.test.js
```

**Kết quả thực tế:**
```text
PASS tests/courseLifecycleCur12.test.js
PASS tests/be02MaintenanceExpiredClass.test.js (7.095 s)
PASS tests/chauSafeDeleteConcurrencyReplSet.test.js (9.403 s)
PASS tests/be01ClassNeedChanges.test.js (11.689 s)
PASS tests/be03AcademicSoftDelete.test.js (11.938 s)

Test Suites: 5 passed, 5 total
Tests:       88 passed, 88 total
Snapshots:   0 total
Time:        12.711 s
```

---

## 4. PHÂN TÍCH BẰNG CHỨNG CÁC CA KIỂM THỬ MỚI

### 4.1. Kiểm chứng Rollback khi Audit thất bại (`Test 10`)
- **Kịch bản:** Giả lập `auditService.audit` ném lỗi kết nối DB khi ghi nhật ký kiểm toán.
- **Quan sát thực nghiệm:**
  - API trả về mã lỗi HTTP 500 do transaction bị ném ngoại lệ.
  - Truy vấn database ngay sau đó: `Class.findById(cls._id)` cho thấy `status` **VẪN LÀ `PENDING_APPROVAL`**, `reviewNote` vẫn là `null`, `reviewedBy` vẫn là `null`.
  - Spy kiểm tra `notificationService.notify` xác nhận: **KHÔNG CÓ BẤT KỲ THÔNG BÁO NÀO ĐƯỢC GỬI ĐI**.
- **Kết luận:** Nguy cơ Class bị cập nhật dở dang khi thiếu audit log đã được triệt tiêu 100%.

### 4.2. Kiểm chứng Thời điểm phát thông báo (`Test 11`)
- **Kịch bản:** Đặt spy bên trong `notificationService.notify`, tại khoảnh khắc hàm này được gọi, thực hiện một query đọc trực tiếp vào database để kiểm tra trạng thái lớp.
- **Quan sát thực nghiệm:**
  - `statusAtNotificationTime` trả về đúng giá trị `"NEED_CHANGES"`.
- **Kết luận:** Chứng minh tuyệt đối rằng thông báo chỉ được kích hoạt SAU KHI transaction đã commit xong vào database.

### 4.3. Kiểm chứng Cách ly lỗi Notification (`Test 12`)
- **Kịch bản:** Giả lập `notificationService.notify` ném lỗi timeout mạng.
- **Quan sát thực nghiệm:**
  - API trả về mã `200 OK` với payload `status: "NEED_CHANGES"`.
  - Database đã commit trạng thái `NEED_CHANGES` và bản ghi `AuditLog` đã tồn tại nguyên vẹn.
- **Kết luận:** Sự cố của kênh thông báo không làm gián đoạn hoặc rollback nghiệp vụ cốt lõi đã thành công của Admin.

### 4.4. Kiểm chứng Tương tranh giữa Request Changes và Approve (`Test 13`)
- **Kịch bản:** Bắn đồng thời 2 request song song: Admin A gọi `request-changes`, Admin B gọi `approve`.
- **Quan sát thực nghiệm:**
  - Mảng mã trạng thái trả về: `[200, 409]`.
  - Chính xác 1 thao tác thành công (200), thao tác còn lại nhận `409 CLASS_NOT_PENDING_APPROVAL`.
  - Trạng thái cuối cùng của lớp là `NEED_CHANGES` hoặc `OPEN`, hoàn toàn không bị sai lệch hoặc tranh chấp ghi đè.
