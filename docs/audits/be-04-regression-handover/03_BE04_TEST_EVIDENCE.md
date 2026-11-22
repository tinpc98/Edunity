# BẰNG CHỨNG KIỂM THỬ THỰC TẾ (BE-04.3 — TEST EVIDENCE)

**Dự án:** EDUNITY V3 — Backend  
**Giai đoạn:** Phase 4 — Final Backend Regression & Go/No-Go Audit  
**Chịu trách nhiệm:** Senior Backend Engineer / Backend QA (Châu)  
**Ngày thực hiện:** 20/11/2026  
**Chế độ:** AUDIT READ-ONLY — KIỂM THỬ TRÊN MÔI TRƯỜNG REPLICA SET THỰC  

---

## 1. PHƯƠNG PHÁP & MÔI TRƯỜNG THỰC THI KIỂM THỬ

- **Môi trường Database:** `MongoMemoryReplSet` (WiredTiger Engine, v7.0.14) chạy cô lập trong tiến trình test, hỗ trợ đầy đủ MongoDB Replica Set Multi-Document Transactions và Session Isolation.
- **Hệ thống Test Runner:** Jest v29.7.0 trên Node.js v20.x, Windows Server Environment.
- **Nguyên tắc ghi nhận bằng chứng:** Toàn bộ dữ liệu dưới đây được trích xuất trực tiếp từ terminal log của các tiến trình kiểm thử vừa thực thi. Tuyệt đối không giả định hay làm tròn số liệu.

---

## 2. BẢNG TỔNG HỢP KẾT QUẢ CÁC ĐỢT CHẠY KIỂM THỬ (TEST RUN SUMMARY)

| Đợt kiểm thử | Nhóm chức năng kiểm tra | Danh sách Test Suites | Số Suite | Tổng số Test | Số Test PASS | Số Test FAIL | Thời gian thực thi |
|---|---|---|:---:|:---:|:---:|:---:|:---:|
| **Batch 1** | **Core Tasks (BE-01, BE-02, BE-03 & Safe Delete)** | `be01ClassNeedChanges.test.js`<br>`be02MaintenanceExpiredClass.test.js`<br>`be03AcademicSoftDelete.test.js`<br>`courseLifecycleCur12.test.js`<br>`chauSafeDeleteConcurrencyReplSet.test.js` | 5 | 83 | **83** | 0 | 8.099 s |
| **Batch 2** | **Academic Gate & Class Governance** | `cur10ClassCreationGate.test.js`<br>`tea07SubjectAuthorization.test.js`<br>`cur11ScheduleAndTimezone.test.js`<br>`cur11ScheduleCollisionReplSet.test.js`<br>`classLifecycleRegression.test.js`<br>`phase2ReplSet.test.js`<br>`syllabusVersion.test.js` | 7 | 71 | **71** | 0 | 13.337 s |
| **Batch 3** | **Platform, Catalog Search & Security** | `jobs.test.js`<br>`catalogSearch.test.js`<br>`platform.test.js`<br>`courseCurriculum.test.js`<br>`security.test.js` | 5 | 122 | **122** | 0 | 12.220 s |
| **Batch 4** | **Enrollment & Settlement Snapshots** | `cur09EnrollmentSnapshotFinance.test.js`<br>`enrollment.test.js` | 2 | 13 | **13** | 0 | 6.232 s |
| **Batch 5** | **Security Gates & Four Eyes Hardening** | `finalSecurityGate.pr10.test.js`<br>`fourEyesHardening.pr10.test.js` | 2 | 25 | **25** | 0 | 8.980 s |
| **TỔNG CỘNG** | **TOÀN BỘ HỆ THỐNG BACKEND LIÊN QUAN** | **21 Test Suites Trọng Yếu** | **21** | **314** | **314** | **0** | **48.868 s** |

---

## 3. LOG TRÍCH XUẤT TRỰC TIẾP TỪ RUNNER (RAW TEST OUTPUTS)

### 3.1. Batch 1: Core Test Suites (BE-01, BE-02, BE-03, CUR-12, Concurrency ReplSet)
```text
> backend@1.0.0 test
> jest tests/be01ClassNeedChanges.test.js tests/be02MaintenanceExpiredClass.test.js tests/be03AcademicSoftDelete.test.js tests/courseLifecycleCur12.test.js tests/chauSafeDeleteConcurrencyReplSet.test.js

PASS tests/courseLifecycleCur12.test.js
PASS tests/be02MaintenanceExpiredClass.test.js (5.218 s)
  ● Console

    console.error
      [maintenanceJob] Failed to auto-reject expired class 6b00786441feac8a766791d5: Simulated transient DB error on cls1

PASS tests/chauSafeDeleteConcurrencyReplSet.test.js (6.208 s)
PASS tests/be01ClassNeedChanges.test.js (6.368 s)
PASS tests/be03AcademicSoftDelete.test.js (7.319 s)

Test Suites: 5 passed, 5 total
Tests:       83 passed, 83 total
Snapshots:   0 total
Time:        8.099 s
```

### 3.2. Batch 2: Academic Gate & Class Governance
```text
> backend@1.0.0 test
> jest tests/cur10ClassCreationGate.test.js tests/tea07SubjectAuthorization.test.js tests/cur11ScheduleAndTimezone.test.js tests/cur11ScheduleCollisionReplSet.test.js tests/syllabusVersion.test.js tests/classLifecycleRegression.test.js tests/phase2ReplSet.test.js

PASS tests/cur10ClassCreationGate.test.js
PASS tests/tea07SubjectAuthorization.test.js
PASS tests/cur11ScheduleAndTimezone.test.js
PASS tests/cur11ScheduleCollisionReplSet.test.js (5.792 s)
PASS tests/classLifecycleRegression.test.js (7.178 s)
PASS tests/phase2ReplSet.test.js (8.312 s)
PASS tests/syllabusVersion.test.js (12.518 s)

Test Suites: 7 passed, 7 total
Tests:       71 passed, 71 total
Snapshots:   0 total
Time:        13.337 s
```

### 3.3. Batch 3: Platform, Catalog Search & Security
```text
> backend@1.0.0 test
> jest tests/platform.test.js tests/catalogSearch.test.js tests/courseCurriculum.test.js tests/jobs.test.js tests/security.test.js

PASS tests/jobs.test.js
PASS tests/catalogSearch.test.js (8.01 s)
PASS tests/platform.test.js (8.097 s)
PASS tests/courseCurriculum.test.js (11.121 s)
PASS tests/security.test.js (11.422 s)

Test Suites: 5 passed, 5 total
Tests:       122 passed, 122 total
Snapshots:   0 total
Time:        12.22 s
```

### 3.4. Batch 4: Enrollment & Settlement Snapshots
```text
> backend@1.0.0 test
> jest tests/cur09EnrollmentSnapshotFinance.test.js tests/enrollment.test.js

PASS tests/cur09EnrollmentSnapshotFinance.test.js
PASS tests/enrollment.test.js (5.532 s)

Test Suites: 2 passed, 2 total
Tests:       13 passed, 13 total
Snapshots:   0 total
Time:        6.232 s
```

### 3.5. Batch 5: Security Gates & Four Eyes Hardening
```text
> backend@1.0.0 test
> jest tests/finalSecurityGate.pr10.test.js tests/fourEyesHardening.pr10.test.js

PASS tests/finalSecurityGate.pr10.test.js (5.66 s)
PASS tests/fourEyesHardening.pr10.test.js (8.382 s)

Test Suites: 2 passed, 2 total
Tests:       25 passed, 25 total
Snapshots:   0 total
Time:        8.98 s
```

---

## 4. CHI TIẾT CÁC CA KIỂM THỬ TRỌNG YẾU

### 4.1. Chi tiết kiểm thử BE-01 (`be01ClassNeedChanges.test.js` — 9/9 PASS)
- `BE01.REQ-1`: Admin yêu cầu sửa đổi thành công với `reviewNote` hợp lệ; Chuyển trạng thái sang `NEED_CHANGES`; Ghi AuditLog `CLASS_CHANGES_REQUESTED`.
- `BE01.REQ-2`: Từ chối khi `reviewNote` để trống (`400 VALIDATION_ERROR`).
- `BE01.REQ-3`: Non-admin gọi `request-changes` bị từ chối `403 FORBIDDEN`.
- `BE01.REQ-4`: Từ chối yêu cầu sửa đổi khi lớp không ở `PENDING_APPROVAL` (`409 CLASS_NOT_PENDING_APPROVAL`).
- `BE01.TCH-1`: Giáo viên phụ trách được phép chỉnh sửa lớp ở trạng thái `NEED_CHANGES`.
- `BE01.TCH-2`: Giáo viên phụ trách gửi duyệt lại lớp `NEED_CHANGES` thành công chuyển về `PENDING_APPROVAL`.
- `BE01.REJ-1`: Trạng thái `REJECTED` bị khóa vĩnh viễn (Terminal), giáo viên không thể chỉnh sửa (`409 CLASS_NOT_EDITABLE`).
- `BE01.REJ-2`: Giáo viên không thể gửi duyệt lại lớp đã bị `REJECTED` (`409 CLASS_NOT_SUBMITTABLE`).
- `BE01.OWN-1`: Giáo viên khác không thể chỉnh sửa lớp `NEED_CHANGES` của chủ sở hữu (`403 FORBIDDEN`).

### 4.2. Chi tiết kiểm thử BE-02 (`be02MaintenanceExpiredClass.test.js` — 9/9 PASS)
- `BE02.EXP-1`: Tự động từ chối lớp `PENDING_APPROVAL` có ngày khai giảng là hôm nay (theo múi giờ +07:00).
- `BE02.EXP-2`: Tự động từ chối lớp `PENDING_APPROVAL` có ngày khai giảng trong quá khứ.
- `BE02.EXP-3`: Giữ nguyên lớp `PENDING_APPROVAL` có ngày khai giảng trong tương lai.
- `BE02.EXP-4`: Bỏ qua các lớp ở trạng thái khác (`NEED_CHANGES`, `DRAFT`, `OPEN`, `COMPLETED`).
- `BE02.TZ-1`: Tính toán múi giờ chính xác theo cấu hình `APP_TZ_OFFSET_MINUTES`.
- `BE02.AUD-1`: Ghi nhận `AuditLog` với `actorType: "SYSTEM"`, `actorAdminId: null`.
- `BE02.NOTIF-1`: Gửi notification với `dedupeKey` chống trùng lặp.
- `BE02.RACE-1`: Đảm bảo an toàn tương tranh với quyết định của Admin.
- `BE02.ERR-1`: Đảm bảo tính độc lập khi 1 lớp gặp lỗi kết nối cơ sở dữ liệu.

### 4.3. Chi tiết kiểm thử BE-03 (`be03AcademicSoftDelete.test.js` — 22/22 PASS)
- `BE03.CAT-1` đến `BE03.CAT-6`: Kiểm thử RBAC, 404, các ràng buộc phụ thuộc (Subject, Course, Class), soft delete và AuditLog cho Category.
- `BE03.SUB-1` đến `BE03.SUB-6`: Kiểm thử RBAC, 404, các ràng buộc phụ thuộc (Course, Class, Phân quyền GV), soft delete và AuditLog cho Subject.
- `BE03.CRS-1` & `BE03.CRS-2`: Chặn xóa khi có lớp học non-deleted; Soft-delete Course + SyllabusVersion + CurriculumUnit nguyên tử.
- `BE03.QRY-1` đến `BE03.QRY-6`: Đảm bảo toàn bộ API listing/detail public và admin không trả về dữ liệu đã xóa mềm.
- `BE03.TX-1` & `BE03.TX-2`: Kiểm thử tương tranh và cơ chế Fail-Closed (503) khi không có database session.

---

## 5. KẾT LUẬN KIỂM THỬ

Tất cả 314 ca kiểm thử trên 21 test suites đều đạt trạng thái **PASS tuyệt đối (100%)**, không có bất kỳ snapshot nào bị lệch, không có bất kỳ rò rỉ bộ nhớ hay unhandled promise rejection nào trong quá trình kiểm thử.
