# BÁO CÁO KẾT QUẢ KIỂM THỬ — TASK BE-03-FIX
## Chi tiết Kết quả Thực thi Test Suites & Xác nhận An toàn Hồi quy

- **Mã task:** `BE-03-FIX`
- **Dự án:** EDUNITY V3 — BackEnd System
- **Tác giả:** Senior Backend Engineer (Châu)
- **Ngày lập:** 21/11/2026
- **Môi trường chạy:** Jest / MongoMemoryReplSet 7.0.14 WiredTiger / Windows PowerShell

---

## 1. TỔNG QUAN KẾT QUẢ KIỂM THỬ

- **Bộ kiểm thử chính BE-03 (`be03AcademicSoftDelete.test.js`):** 22/22 Passed (100%)
- **Bộ kiểm thử đồng thời & Transaction (`chauSafeDeleteConcurrencyReplSet.test.js`):** 14/14 Passed (100%)
- **Tổng số tests hai suite trọng tâm:** 36/36 Passed (100%)
- **Kiểm thử hồi quy toàn diện hệ thống liên quan (6 Suites):** 99/99 Passed (100%)

---

## 2. CHI TIẾT 22 TEST CASES CỦA `be03AcademicSoftDelete.test.js`

| Nhóm kiểm thử | Mã Test Case | Mô tả kịch bản | Kết quả |
| :--- | :--- | :--- | :---: |
| **Category Delete** | `BE03.CAT-1` | Truy cập không hợp lệ hoặc không có quyền Admin bị từ chối với 401/403 | **PASS** |
| | `BE03.CAT-2` | Xóa Category không tồn tại trả về 404 `CATEGORY_NOT_FOUND` | **PASS** |
| | `BE03.CAT-3` | Xóa bị chặn với 409 `CATEGORY_HAS_SUBJECTS` khi có Subject phụ thuộc | **PASS** |
| | `BE03.CAT-4` | Xóa bị chặn với 409 `CATEGORY_HAS_COURSES` khi có Course phụ thuộc | **PASS** |
| | `BE03.CAT-5` | Xóa bị chặn với 409 `CATEGORY_HAS_CLASSES` khi có Class phụ thuộc | **PASS** |
| | `BE03.CAT-6` | Xóa mềm thành công Category không có phụ thuộc, ghi nhận `AuditLog` chuẩn | **PASS** |
| **Subject Delete** | `BE03.SUB-1` | Truy cập xóa Subject không có quyền Admin bị từ chối với 401/403 | **PASS** |
| | `BE03.SUB-2` | Xóa Subject không tồn tại trả về 404 `SUBJECT_NOT_FOUND` | **PASS** |
| | `BE03.SUB-3` | Xóa bị chặn với 409 `SUBJECT_HAS_COURSES` khi có Course phụ thuộc | **PASS** |
| | `BE03.SUB-4` | Xóa bị chặn với 409 `SUBJECT_HAS_CLASSES` khi có Class phụ thuộc | **PASS** |
| | `BE03.SUB-5` | Xóa bị chặn với 409 `SUBJECT_HAS_TEACHER_AUTHORIZATIONS` khi có phân công giáo viên | **PASS** |
| | `BE03.SUB-6` | Xóa mềm thành công Subject không có phụ thuộc, ghi nhận `AuditLog` chuẩn | **PASS** |
| **Course Delete** | `BE03.CRS-1` | Xóa bị chặn với 409 `COURSE_HAS_CLASSES` khi có Class phụ thuộc | **PASS** |
| | `BE03.CRS-2` | Xóa mềm thành công Course; cascade soft-delete SyllabusVersion và CurriculumUnit trong cùng transaction | **PASS** |
| **Query Safety** | `BE03.QRY-1` | `GET /api/categories` tự động lọc sạch các Category đã xóa mềm | **PASS** |
| | `BE03.QRY-2` | `GET /api/categories/:id/subjects` trả về 404 cho category đã xóa và loại trừ subject đã xóa | **PASS** |
| | `BE03.QRY-3` | `GET /api/subjects/:id` trả về 404 cho subject đã xóa và loại trừ course đã xóa | **PASS** |
| | `BE03.QRY-4` | `GET /api/courses` loại trừ các Course đã xóa mềm | **PASS** |
| | `BE03.QRY-5` | `GET /api/admin/courses` loại trừ các Course đã xóa mềm khỏi danh sách quản trị | **PASS** |
| | `BE03.QRY-6` | `GET /api/admin/courses/:id` trả về 404 cho Course đã xóa mềm | **PASS** |
| **Transaction** | `BE03.TX-1` | Cơ chế Fail-Closed: trả về 503 `DATABASE_TRANSACTION_UNAVAILABLE` khi không thể mở session | **PASS** |
| | `BE03.TX-2` | Hai yêu cầu xóa đồng thời cùng Category: đúng 1 yêu cầu thành công (200), yêu cầu thứ hai trả về 404 | **PASS** |

---

## 3. CHI TIẾT 14 TEST CASES CỦA `chauSafeDeleteConcurrencyReplSet.test.js`

| STT | Kịch bản kiểm thử | Mô tả & Xác minh | Kết quả |
| :---: | :--- | :--- | :---: |
| 1 | Session Unavailable Fail-Closed | Xóa Course khi session không khả dụng trả về 503, dữ liệu Course nguyên vẹn | **PASS** |
| 1b | Transaction Unavailable Fail-Closed | Xóa Course khi transaction không khả dụng trả về 503 và tự đóng session | **PASS** |
| 2 | Mid-Transaction Failure Rollback | Lỗi giữa transaction: rollback đa tài liệu Course, SyllabusVersion, CurriculumUnit | **PASS** |
| 3 | AuditLog Integrity Rollback | Lỗi ghi AuditLog: transaction rollback hoàn toàn thao tác soft-delete Course | **PASS** |
| 4 | Deterministic Concurrency Barrier | Đua giữa DELETE Course và CREATE Class: không bao giờ sinh ra orphan Class | **PASS** |
| 5 | Concurrency Barrier (Enrollment) | Đua giữa DELETE Course và CREATE Enrollment: không bao giờ sinh ra orphan Enrollment | **PASS** |
| 6 | Multiple Concurrent DELETEs | Nhiều yêu cầu xóa đồng thời: đúng 1 request thành công, chỉ sinh 1 AuditLog | **PASS** |
| 7 | Transaction Conflict Handling | `session.withTransaction` tự động retry lỗi xung đột tạm thời một cách sạch sẽ | **PASS** |
| 8 | Invariant on Deleted Course | Course đã xóa mềm luôn từ chối tạo mới Class và từ chối tạo mới Enrollment | **PASS** |
| 9 | createClass Fail-Closed (Session) | `createClass` trả về 503 khi không thể mở session, không tạo Class ngoài luồng | **PASS** |
| 10 | createClass Fail-Closed (Transaction) | `createClass` trả về 503 khi transaction không hỗ trợ, đóng session an toàn | **PASS** |
| 11 | createClass Mid-Transaction Failure | Lỗi trong quá trình `createClass`: rollback toàn bộ thay đổi | **PASS** |
| 12 | Concurrency Barrier (Pre-create) | `createClass` bắt đầu trước `deleteCourse`: Class tạo thành công, DELETE bị từ chối 409 | **PASS** |
| 13 | createClass Conflict Handling | `createClass` xử lý conflict và retry an toàn với `withTransaction` | **PASS** |

---

## 4. RAW JEST TEST OUTPUT TRÍCH XUẤT

```text
> backend@1.0.0 test
> jest tests/be03AcademicSoftDelete.test.js tests/chauSafeDeleteConcurrencyReplSet.test.js

PASS tests/chauSafeDeleteConcurrencyReplSet.test.js
PASS tests/be03AcademicSoftDelete.test.js (6.77 s)

Test Suites: 2 passed, 2 total
Tests:       36 passed, 36 total
Snapshots:   0 total
Time:        7.474 s, estimated 9 s
Ran all test suites matching tests/be03AcademicSoftDelete.test.js|tests/chauSafeDeleteConcurrencyReplSet.test.js.
```
