# MA TRẬN KIỂM THỬ HỒI QUY TOÀN DIỆN (FINAL REGRESSION MATRIX)
## Đánh giá Chất lượng Backend EDUNITY V3 — Task BE-04-FINAL

- **Dự án:** EDUNITY V3 — BackEnd System
- **Vai trò:** Senior Backend Engineer / QA Lead phụ trách EDUNITY V3
- **Ngày kiểm định:** 21/11/2026
- **Phạm vi kiểm toán:** BE-01-FIX, BE-02-FIX, BE-03-FIX và các module phụ thuộc
- **Môi trường:** Node.js v24.18.0 / npm 11.16.0 / Jest 30.5.2 / MongoMemoryReplSet 7.0.14 WiredTiger

---

## 1. TỔNG HỢP KẾT QUẢ TEST SUITES ĐÃ THỰC THI

| STT | Tên Test Suite | File Path | Số Tests | Kết quả | Thời gian | Trọng tâm kiểm thử |
| :---: | :--- | :--- | :---: | :---: | :---: | :--- |
| 1 | **Class NEED_CHANGES Workflow** | `tests/be01ClassNeedChanges.test.js` | 14/14 | **PASS** | 7.78s | State machine `NEED_CHANGES`, terminal `REJECTED`, Transaction & Audit atomicity, post-commit notification isolation, RBAC. |
| 2 | **Maintenance Expired Class Job** | `tests/be02MaintenanceExpiredClass.test.js` | 15/15 | **PASS** | 7.45s | Tự động từ chối lớp quá hạn, múi giờ `APP_TZ_OFFSET_MINUTES`, transaction rollback, heartbeat lease renewal, crash recovery, dedupe notification. |
| 3 | **Academic Soft Delete Safety** | `tests/be03AcademicSoftDelete.test.js` | 22/22 | **PASS** | 7.65s | Xóa mềm Category, Subject, Course; kiểm tra toàn bộ 7 dependency; cascade soft-delete giáo trình; lọc query `...NOT_DELETED`. |
| 4 | **Safe Delete & ReplSet Concurrency** | `tests/chauSafeDeleteConcurrencyReplSet.test.js` | 14/14 | **PASS** | 6.34s | Chống race condition giữa `deleteCourse` và `createClass` / `createEnrollment` qua `lockVersion`; multi-document rollback; fail-closed 503. |
| 5 | **Class Lifecycle Regression** | `tests/classLifecycleRegression.test.js` | 6/6 | **PASS** | 5.37s | Vòng đời chuyển trạng thái `OPEN` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `COMPLETED`; hoàn tất enrollment và ghi nhận earnings. |
| 6 | **Course Lifecycle & CUR-12** | `tests/courseLifecycleCur12.test.js` | 15/15 | **PASS** | 6.50s | Vòng đời Course, Course Proposal, Syllabus Versioning, tính bất biến của giáo trình xuất bản. |
| 7 | **Class Creation Gate** | `tests/cur10ClassCreationGate.test.js` | 12/12 | **PASS** | 4.80s | Cổng kiểm duyệt tạo lớp (Pricing policy, Teacher contract, Verification, Session schedule completeness). |
| 8 | **Schedule & Timezone** | `tests/cur11ScheduleAndTimezone.test.js` | 10/10 | **PASS** | 5.10s | Lịch học theo múi giờ, phát hiện xung đột lịch giáo viên và phòng học ảo. |
| 9 | **Phase 2 ReplSet Full Flow** | `tests/phase2ReplSet.test.js` | 19/19 | **PASS** | 6.34s | Tích hợp toàn diện luồng duyệt lớp, mở lớp, thanh toán, enrollment, và hủy lớp. |
| 10 | **Platform & Payment Webhook** | `tests/platform.test.js` | 14/14 | **PASS** | 9.42s | Cấu hình nền tảng, cơ chế idempotency của Webhook thanh toán PayOS. |
| 11 | **Cron Lock & Idempotency** | `tests/cronLockIdempotency.test.js` | 10/10 | **PASS** | 81.65s | Mô phỏng CAS guard cho distributed job lock, chống xử lý trùng lặp trong cron tasks. |
| **TỔNG** | **11 Test Suites Toàn diện** | | **151/151** | **100% PASS** | | **Không có lỗi hồi quy (Zero Regressions)** |

---

## 2. MA TRẬN YÊU CẦU CHI TIẾT & BẰNG CHỨNG KIỂM TOÁN

### 2.1. Phân hệ Vòng đời Lớp học (Class Workflow & State Machine)

| Mã yêu cầu | Yêu cầu kỹ thuật & Nghiệp vụ | Test Cases kiểm chứng | Kết quả | Trạng thái nguồn |
| :--- | :--- | :--- | :---: | :--- |
| **WF-01** | Bổ sung trạng thái `NEED_CHANGES` vào schema Class | `be01ClassNeedChanges.test.js` (Test 1, 2) | **PASS** | `models/Class.js` enum bao gồm `NEED_CHANGES` |
| **WF-02** | `REJECTED` là trạng thái cuối (terminal), không cho phép sửa hay gửi duyệt lại | `be01ClassNeedChanges.test.js` (Test 5, 6, 7) | **PASS** | `teacherClassService.js` chặn `REJECTED` chuyển `PENDING_APPROVAL` hoặc update |
| **WF-03** | Chuyển đổi hợp lệ `PENDING_APPROVAL` $\rightarrow$ `NEED_CHANGES` yêu cầu `reviewNote` | `be01ClassNeedChanges.test.js` (Test 1, 2, 3) | **PASS** | `adminClassService.js` validate `reviewNote` bắt buộc và không rỗng |
| **WF-04** | Giáo viên chỉnh sửa lớp `NEED_CHANGES` và gửi duyệt lại $\rightarrow$ `PENDING_APPROVAL` | `be01ClassNeedChanges.test.js` (Test 4, 8) | **PASS** | `teacherClassService.js` cho phép resubmit khi status là `NEED_CHANGES` |
| **WF-05** | Quyền hạn & Sở hữu: Chỉ Admin mới được request changes; Giáo viên chỉ sửa lớp của mình | `be01ClassNeedChanges.test.js` (Test 9, 10) | **PASS** | Kiểm tra quyền RBAC và `cls.teacherId.toString() === teacherId.toString()` |
| **WF-06** | Tính nguyên tử giao dịch: Lỗi ghi audit phải rollback Class về trạng thái ban đầu | `be01ClassNeedChanges.test.js` (Test 11) | **PASS** | `session.withTransaction` rollback 100% khi `audit` ném lỗi |
| **WF-07** | Cách ly Notification: Lỗi gửi thông báo không làm rollback transaction | `be01ClassNeedChanges.test.js` (Test 12) | **PASS** | `notify` được bọc riêng trong `try/catch` sau khi transaction commit |
| **WF-08** | Chống xung đột đồng thời: 2 request duyệt/yêu cầu sửa cùng lúc không ghi đè lẫn nhau | `be01ClassNeedChanges.test.js` (Test 13, 14) | **PASS** | Conditional query `{ _id, status: "PENDING_APPROVAL", ...NOT_DELETED }` |

---

### 2.2. Phân hệ Tiến trình Bảo trì Tự động (Maintenance Job & Class Expiration)

| Mã yêu cầu | Yêu cầu kỹ thuật & Nghiệp vụ | Test Cases kiểm chứng | Kết quả | Trạng thái nguồn |
| :--- | :--- | :--- | :---: | :--- |
| **JB-01** | Chỉ tự động từ chối các lớp có trạng thái `PENDING_APPROVAL` | `be02MaintenanceExpiredClass.test.js` (Test 1, 3) | **PASS** | Bỏ qua hoàn toàn `OPEN`, `IN_PROGRESS`, `NEED_CHANGES`, `DRAFT` |
| **JB-02** | Kiểm tra chính xác ranh giới ngày theo múi giờ ứng dụng (`APP_TZ_OFFSET_MINUTES`) | `be02MaintenanceExpiredClass.test.js` (Test 4) | **PASS** | 5 phút trước nửa đêm không từ chối; 5 phút sau nửa đêm từ chối chính xác |
| **JB-03** | Tính nguyên tử: Chuyển `REJECTED` và ghi `AuditLog` nằm trong cùng một transaction | `be02MaintenanceExpiredClass.test.js` (Test 10) | **PASS** | `session.withTransaction` bọc `Class.findOneAndUpdate` và `audit(..., session)` |
| **JB-04** | Tự phục hồi: Khi audit lỗi $\rightarrow$ rollback $\rightarrow$ lần quét sau tự động tìm thấy và xử lý lại | `be02MaintenanceExpiredClass.test.js` (Test 10) | **PASS** | Class giữ nguyên `PENDING_APPROVAL` khi abort, lần chạy 2 xử lý thành công |
| **JB-05** | Tính lũy thừa (Idempotency): Chạy nhiều lần không sinh trùng audit hay notification | `be02MaintenanceExpiredClass.test.js` (Test 5) | **PASS** | Lần 2 từ chối 0 lớp; chỉ sinh đúng 1 AuditLog và 1 Notification |
| **JB-06** | Khóa phân tán có Heartbeat: Tự động gia hạn lease khi công việc kéo dài | `be02MaintenanceExpiredClass.test.js` (Test 13, 15) | **PASS** | `runExclusive` nhận `options.heartbeatIntervalMs: 60000`, gia hạn `lockedUntil` |
| **JB-07** | Phục hồi sau sự cố sập instance (Crash Recovery): Lease tự mở sau TTL khi worker chết | `be02MaintenanceExpiredClass.test.js` (Test 14) | **PASS** | Lease 4 phút (`lockedUntil <= now`) cho phép worker mới acquire ngay lập tức |
| **JB-08** | Ghi nhận Audit System Actor: `actorAdminId: null`, `actorType: "SYSTEM"` | `be02MaintenanceExpiredClass.test.js` (Test 8) | **PASS** | Không gán fake Admin ID; ghi đúng `beforeState` & `afterState` |
| **JB-09** | Cách ly Notification: Lỗi thông báo không làm hỏng job hoặc rollback lớp học | `be02MaintenanceExpiredClass.test.js` (Test 11) | **PASS** | `notify` được bọc riêng sau commit; `dedupeKey` chống spam |

---

### 2.3. Phân hệ Xóa mềm Danh mục Học thuật (Academic Soft Delete)

| Mã yêu cầu | Yêu cầu kỹ thuật & Nghiệp vụ | Test Cases kiểm chứng | Kết quả | Trạng thái nguồn |
| :--- | :--- | :--- | :---: | :--- |
| **SD-01** | Xóa mềm Category: Chặn khi có Subject, Course, Class, LearningPath, Campaign, PricingPolicy | `be03AcademicSoftDelete.test.js` (Test 3, 4, 5) | **PASS** | Trả về 409 tương ứng; chỉ cho phép xóa khi không còn dependency non-deleted |
| **SD-02** | Xóa mềm Subject: Chặn khi có Course, Class, TeacherAuth, Campaign, Proposal, PricingPolicy | `be03AcademicSoftDelete.test.js` (Test 9, 10, 11) | **PASS** | Trả về 409 tương ứng; bảo vệ quyền phân công giáo viên PENDING/APPROVED |
| **SD-03** | Xóa mềm Course: Chặn khi có Class (mọi trạng thái chưa xóa) hoặc có Enrollment lịch sử | `be03AcademicSoftDelete.test.js` (Test 13), `chauSafeDelete...` | **PASS** | Bảo vệ toàn vẹn hồ sơ học tập và tài chính; hướng dẫn dùng `SET_INACTIVE` |
| **SD-04** | Cascade Soft Delete: Tự động xóa mềm SyllabusVersion và CurriculumUnit trong cùng transaction | `be03AcademicSoftDelete.test.js` (Test 14), `chauSafeDelete...` | **PASS** | `SyllabusVersion` & `CurriculumUnit` được gán cờ `isDeleted: true` đồng bộ |
| **SD-05** | Tính nguyên tử & Fail-Closed: Bắt buộc transaction; lỗi DB/Audit là rollback toàn bộ | `be03AcademicSoftDelete.test.js` (Test 21, 22), `chauSafeDelete...` | **PASS** | Trả về 503 khi không có transaction; rollback đa tài liệu khi có lỗi |
| **SD-06** | Chống đua Concurrency: `deleteCourse` vs `createClass` / `createEnrollment` | `chauSafeDeleteConcurrencyReplSet.test.js` (Test 4, 5, 12) | **PASS** | `$inc: { lockVersion: 1 }` trên Course triệt tiêu hoàn toàn race condition |
| **SD-07** | Query Isolation: Toàn bộ API public & admin tự động loại bỏ dữ liệu đã xóa mềm | `be03AcademicSoftDelete.test.js` (Test 15-20) | **PASS** | Nhất quán sử dụng `...NOT_DELETED` (`{ isDeleted: { $ne: true } }`) |
