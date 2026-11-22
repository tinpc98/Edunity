# BÁO CÁO KẾT QUẢ KIỂM THỬ TÍCH HỢP & HỒI QUY (BE-03.5 & BE-03.6)

**Dự án:** EDUNITY V3 — Backend  
**Giai đoạn:** Phase 3 — Academic Soft Delete & Dependency Safety  
**Chịu trách nhiệm:** Senior Backend Engineer (Châu)  
**Ngày thực hiện:** 20/11/2026  
**Trạng thái kiểm thử:** 100% PASS (83/83 TESTS TRÊN 5 SUITES)  

---

## 1. PHẠM VI KIỂM THỬ

Bộ kiểm thử được xây dựng chuyên biệt trong [be03AcademicSoftDelete.test.js](file:///c:/CODE/Edunity/BackEnd/tests/be03AcademicSoftDelete.test.js) với 22 ca kiểm thử tích hợp trên môi trường cơ sở dữ liệu cô lập `MongoMemoryReplSet` (hỗ trợ real replica set transactions), kết hợp chạy hồi quy toàn bộ các test suites liên quan đến vòng đời học thuật và bảo vệ tương tranh.

---

## 2. KẾT QUẢ TEST SUITE BE-03 (`be03AcademicSoftDelete.test.js`)

**Kết quả:** 22/22 tests PASS (Thời gian: 8.085s).

```text
PASS tests/be03AcademicSoftDelete.test.js (8.085 s)
  TASK BE-03: Academic Soft Delete & Dependency Safety Integration Suite
    BE-03.2 — Category Delete API (DELETE /admin/categories/:id)
      √ BE03.CAT-1: Non-admin or unauthenticated access is rejected (401 / 403) (138 ms)
      √ BE03.CAT-2: Deleting non-existent category returns 404 CATEGORY_NOT_FOUND (121 ms)
      √ BE03.CAT-3: Deletion is blocked with 409 CATEGORY_HAS_SUBJECTS when active subject exists (131 ms)
      √ BE03.CAT-4: Deletion is blocked with 409 CATEGORY_HAS_COURSES when active course exists (144 ms)
      √ BE03.CAT-5: Deletion is blocked with 409 CATEGORY_HAS_CLASSES when active class exists (150 ms)
      √ BE03.CAT-6: Successfully soft-deletes category without dependencies & records AuditLog (161 ms)
    BE-03.3 — Subject Delete API (DELETE /admin/subjects/:id)
      √ BE03.SUB-1: Non-admin access is rejected (401 / 403) (109 ms)
      √ BE03.SUB-2: Deleting non-existent subject returns 404 SUBJECT_NOT_FOUND (129 ms)
      √ BE03.SUB-3: Deletion is blocked with 409 SUBJECT_HAS_COURSES when active course exists (122 ms)
      √ BE03.SUB-4: Deletion is blocked with 409 SUBJECT_HAS_CLASSES when active class exists (127 ms)
      √ BE03.SUB-5: Deletion is blocked with 409 SUBJECT_HAS_TEACHER_AUTHORIZATIONS when active auth exists (124 ms)
      √ BE03.SUB-6: Successfully soft-deletes subject without dependencies & records AuditLog (148 ms)
    BE-03.4 — Course Delete Safety (DELETE /admin/courses/:id)
      √ BE03.CRS-1: Deletion is blocked with 409 COURSE_HAS_CLASSES when OPEN or non-deleted class exists (138 ms)
      √ BE03.CRS-2: Successfully soft-deletes course, syllabus versions & curriculum units atomically (151 ms)
    BE-03.5 — Query Safety & Regression
      √ BE03.QRY-1: GET /api/categories does not return soft-deleted categories (122 ms)
      √ BE03.QRY-2: GET /api/categories/:id/subjects returns 404 for deleted category & excludes deleted subjects (157 ms)
      √ BE03.QRY-3: GET /api/subjects/:id returns 404 for deleted subject & excludes deleted courses (123 ms)
      √ BE03.QRY-4: GET /api/courses excludes soft-deleted courses (131 ms)
      √ BE03.QRY-5: GET /api/admin/courses excludes soft-deleted courses (146 ms)
      √ BE03.QRY-6: GET /api/admin/courses/:id returns 404 for soft-deleted course (125 ms)
    BE-03.6 — Fail-Closed Transaction & Concurrency Integrity
      √ BE03.TX-1: Fails closed with 503 DATABASE_TRANSACTION_UNAVAILABLE when session cannot be started (121 ms)
      √ BE03.TX-2: Concurrent delete requests on the same category: exactly one succeeds, second gets 404 (129 ms)
```

---

## 3. KẾT QUẢ KIỂM THỬ HỒI QUY TOÀN DIỆN (FULL REGRESSION SUITE)

Chạy đồng thời 5 test suites trọng yếu trong dự án Edunity V3:
1. `tests/be01ClassNeedChanges.test.js` (Workflow trạng thái `NEED_CHANGES` & từ chối sửa lớp)
2. `tests/be02MaintenanceExpiredClass.test.js` (Tự động từ chối lớp `PENDING_APPROVAL` quá hạn ngày khai giảng)
3. `tests/courseLifecycleCur12.test.js` (Toàn bộ vòng đời Course & CUR-12 Syllabus chốt)
4. `tests/chauSafeDeleteConcurrencyReplSet.test.js` (Kiểm thử tương tranh Course Safe Delete trên ReplSet)
5. `tests/be03AcademicSoftDelete.test.js` (Kiểm thử xóa mềm Category/Subject/Course & an toàn phụ thuộc)

**Lệnh chạy:**
```powershell
npm --prefix BackEnd test -- tests/be01ClassNeedChanges.test.js tests/be02MaintenanceExpiredClass.test.js tests/courseLifecycleCur12.test.js tests/chauSafeDeleteConcurrencyReplSet.test.js tests/be03AcademicSoftDelete.test.js
```

**Kết quả thực tế:**
```text
PASS tests/courseLifecycleCur12.test.js
PASS tests/be02MaintenanceExpiredClass.test.js (5.302 s)
PASS tests/chauSafeDeleteConcurrencyReplSet.test.js (5.305 s)
PASS tests/be01ClassNeedChanges.test.js (6.223 s)
PASS tests/be03AcademicSoftDelete.test.js (7.212 s)

Test Suites: 5 passed, 5 total
Tests:       83 passed, 83 total
Snapshots:   0 total
Time:        7.942 s
```

---

## 4. PHÂN TÍCH CHI TIẾT CÁC CA KIỂM THỬ NỔI BẬT

### 4.1. Bảo vệ tính toàn vẹn vật lý (No Physical Deletion)
Trong `BE03.CAT-6`, `BE03.SUB-6`, `BE03.CRS-2`:
- Sử dụng trực tiếp `Category.findById(cat._id)`, `Subject.findById(sub._id)`, `Course.findById(crs._id)`.
- Xác nhận bản ghi **vẫn tồn tại nguyên vẹn** trong MongoDB với:
  - `isDeleted === true`
  - `deletedAt instanceof Date`
  - `deletedBy === admin._id`
  - `status === "INACTIVE"`
- Không có bất kỳ lệnh `deleteOne`, `deleteMany`, hay `findByIdAndDelete` nào được gọi trên catalog.

### 4.2. An toàn truy vấn đối với người dùng cuối & quản trị (Query Safety)
- `BE03.QRY-1` kiểm tra `GET /api/categories`: Các Category đã xóa mềm hoàn toàn không xuất hiện trong danh sách công khai.
- `BE03.QRY-2` kiểm tra `GET /api/categories/:id/subjects`: Trả về 404 nếu danh mục đã bị xóa, và không trả về môn học đã bị xóa.
- `BE03.QRY-3` kiểm tra `GET /api/subjects/:id`: Trả về 404 nếu môn học đã bị xóa, và lọc sạch các khóa học đã bị xóa.
- `BE03.QRY-4` & `BE03.QRY-5`: Cả API tìm kiếm public `GET /api/courses` và quản trị `GET /api/admin/courses` đều tự động lọc bỏ các Course đã soft-deleted (`...NOT_DELETED`).
- `BE03.QRY-6`: `GET /api/admin/courses/:id` trả về 404 `COURSE_NOT_FOUND` khi truy vấn chi tiết Course đã xóa mềm.

### 4.3. Kiểm thử tương tranh & Fail-Closed Transaction
- `BE03.TX-1`: Giả lập sự cố ngắt kết nối Replica Set khi gọi `startSession()`. Hệ thống ném đúng mã lỗi `503 DATABASE_TRANSACTION_UNAVAILABLE` và dữ liệu không bị sửa đổi.
- `BE03.TX-2`: Bắn đồng thời 2 request `DELETE /api/admin/categories/:id` trong cùng một mili-giây. Kết quả: chính xác 1 request thành công trả về `200 OK`, request thứ hai nhận `404 CATEGORY_NOT_FOUND`. Chỉ có duy nhất 1 bản ghi `AuditLog` được tạo ra.
