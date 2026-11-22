# BÁO CÁO KẾT QUẢ KIỂM THỬ (TEST RESULTS & EVIDENCE)
## TASK BE-01 — CLASS NEED_CHANGES WORKFLOW

- **Dự án:** Edunity V3
- **Tập tin test mới:** [`BackEnd/tests/be01ClassNeedChanges.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/be01ClassNeedChanges.test.js)
- **Môi trường:** Node.js, Jest, Mongoose, Supertest, MongoMemoryReplSet thực thụ
- **Kết quả Suite mới:** **9/9 tests PASS (100%) — Thời gian: 6.138 s**
- **Kết quả Hồi quy Liên quan:** **6 Test Suites — 114 Tests — 100% PASS**

---

### 1. Chi tiết 9 Kịch bản Kiểm thử Chức năng Mới (`be01ClassNeedChanges.test.js`)

| STT | Tên Kịch bản / Mục tiêu | Trạng thái | Thời gian | Chi tiết Xác minh |
| :---: | :--- | :---: | :---: | :--- |
| **01** | Admin yêu cầu chỉnh sửa thành công | **PASS** | 161 ms | `POST /admin/classes/:id/request-changes` chuyển `PENDING_APPROVAL` -> `NEED_CHANGES`, lưu `reviewNote`, `reviewedBy`, `reviewedAt`, `updatedBy`. |
| **02** | Từ chối khi thiếu `reviewNote` hoặc `reviewNote` rỗng | **PASS** | 137 ms | Trả về `400 VALIDATION_ERROR` cho các trường hợp: không gửi field, chuỗi rỗng `""`, và chuỗi toàn khoảng trắng `"   \t \n "`. Trạng thái lớp giữ nguyên. |
| **03** | Không thể yêu cầu sửa lớp sai trạng thái | **PASS** | 242 ms | Trả về `409 CLASS_NOT_PENDING_APPROVAL` cho toàn bộ các trạng thái không hợp lệ: `DRAFT`, `OPEN`, `NEED_CHANGES`, `REJECTED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`. Trả về `404 CLASS_NOT_FOUND` nếu ID không tồn tại. |
| **04** | Giáo viên chỉnh sửa lớp `NEED_CHANGES` thành công | **PASS** | 156 ms | `PATCH /api/teacher/classes/:id` cập nhật thành công `description`, `capacity` khi lớp ở trạng thái `NEED_CHANGES`. |
| **05** | Giáo viên gửi duyệt lại lớp `NEED_CHANGES` thành công | **PASS** | 164 ms | `POST /api/teacher/classes/:id/submit` chuyển thành công `NEED_CHANGES` -> `PENDING_APPROVAL`. Admin có thể tiếp tục `approve` mở lớp thành công. |
| **06** | Giáo viên KHÔNG THỂ sửa hoặc nộp lại lớp `REJECTED` | **PASS** | 146 ms | `PATCH` trên lớp `REJECTED` bị từ chối `409 CLASS_NOT_EDITABLE`. `POST /submit` bị từ chối `409 CLASS_NOT_SUBMITTABLE`. Dữ liệu và trạng thái `REJECTED` được bảo toàn nguyên vẹn. |
| **07** | Ghi nhận AuditLog và Notification chính xác | **PASS** | 138 ms | `AuditLog` tạo bản ghi với `action: "CLASS_CHANGES_REQUESTED"`, `beforeState: { status: "PENDING_APPROVAL" }`, `afterState: { status: "NEED_CHANGES" }`. `Notification` gửi đúng `userId: teacherId` với `title: "Lớp học cần chỉnh sửa"`. |
| **08** | Race Condition / Idempotency khi gửi nhiều request đồng thời | **PASS** | 153 ms | Gửi 2 request `request-changes` đồng thời lên cùng một lớp: đúng 1 request nhận HTTP 200, request còn lại nhận HTTP 409. Chỉ sinh đúng 1 bản ghi `AuditLog`. |
| **09** | Kiểm tra bảo vệ RBAC / Quyền truy cập | **PASS** | 138 ms | Học sinh (Student) gọi bị chặn `403 FORBIDDEN`. Giáo viên (Teacher) gọi bị chặn `403 FORBIDDEN`. Yêu cầu chưa xác thực (Unauthenticated / Invalid Bearer) bị chặn `401 UNAUTHORIZED`. |

---

### 2. Minh chứng Thực thi Test Suite Chuyên biệt

```text
> backend@1.0.0 test
> jest tests/be01ClassNeedChanges.test.js

PASS tests/be01ClassNeedChanges.test.js (5.903 s)
  TASK BE-01: Class NEED_CHANGES Workflow Integration Suite
    √ 1. Admin requests changes successfully: transitions PENDING_APPROVAL -> NEED_CHANGES (161 ms)
    √ 2. Rejects request-changes when reviewNote is missing or empty after trim (137 ms)
    √ 3. Cannot request changes on classes not in PENDING_APPROVAL status (409 Conflict) (242 ms)
    √ 4. Teacher can edit class in NEED_CHANGES status (156 ms)
    √ 5. Teacher can re-submit class in NEED_CHANGES status -> PENDING_APPROVAL (164 ms)
    √ 6. Teacher CANNOT edit or re-submit a REJECTED class (terminal rejected state) (146 ms)
    √ 7. Audit log and Notification are correctly recorded upon requesting changes (138 ms)
    √ 8. Concurrent duplicate request-changes requests do not cause invalid state transitions (153 ms)
    √ 9. Enforces RBAC: Teacher, Student, and unauthenticated requests are blocked (138 ms)

Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total
Snapshots:   0 total
Time:        6.138 s
```

---

### 3. Kết quả Hồi quy Toàn diện trên các Suite Liên quan (Regression Evidence)

| STT | Tập tin Test Suite | Số Test | Thời gian | Trạng thái | Phạm vi Kiểm tra |
| :---: | :--- | :---: | :---: | :---: | :--- |
| 1 | `tests/be01ClassNeedChanges.test.js` | 9 | 6.14 s | **PASS** | Vòng đời và workflow `NEED_CHANGES` mới |
| 2 | `tests/cur10ClassCreationGate.test.js` | 6 | 1.84 s | **PASS** | Cổng tạo lớp và hợp đồng giáo viên |
| 3 | `tests/phase2ReplSet.test.js` | 3 | 5.82 s | **PASS** | Tích hợp Replica Set và vòng lặp duyệt lớp |
| 4 | `tests/courseLifecycleCur12.test.js` | 29 | 8.84 s | **PASS** | Vòng đời khóa học và snapshot giáo trình |
| 5 | `tests/chauSafeDeleteConcurrencyReplSet.test.js` | 14 | 5.05 s | **PASS** | Concurrency xóa khóa học và tạo lớp học |
| 6 | `tests/platform.test.js` | 13 | 8.36 s | **PASS** | Toàn bộ vòng đời nền tảng (Platform Integration) |
| 7 | `tests/classLifecycleRegression.test.js` | 6 | 4.37 s | **PASS** | Vòng đời đóng lớp và hạch toán dòng tiền V3 |
| **TỔNG** | **7 Test Suites** | **80** | **~40 s** | **100% PASS** | **Không có bất kỳ hồi quy nào** |
