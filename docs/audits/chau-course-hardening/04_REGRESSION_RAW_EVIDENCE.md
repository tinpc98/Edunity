# 04_REGRESSION_RAW_EVIDENCE.md — Bằng Chứng Kiểm Thử Tự Động & Hồi Quy Toàn Diện

**Dự án:** Edunity V3  
**Chủ sở hữu:** Châu  
**Ngày thực thi:** 13/11/2026  
**Môi trường:** Node.js v20+, Mongoose 8.x, Jest, Windows Sandbox  

---

## 1. TỔNG HỢP KẾT QUẢ KIỂM THỬ HỒI QUY (AGGREGATE METRICS)

> [!NOTE]
> Các lô kiểm thử được thực thi độc lập và tuần tự, không tính trùng lặp số lượng suites hay test cases giữa các đợt chạy.

| Lô kiểm thử (Test Batch) | Tập tin kiểm thử (Suites) | Số Suites PASS | Số Tests PASS | Tests FAIL | Tests SKIPPED | Thời gian chạy |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Batch 1: Hardening Suite** | `tests/courseLifecycleCur12.test.js` | 1 / 1 | 29 / 29 | 0 | 0 | 5.971 s |
| **Batch 2: Academic Core** | `courseCurriculum`, `cur10ClassCreationGate`, `cur11ScheduleAndTimezone`, `syllabusVersion`, `catalogSearch` | 5 / 5 | 95 / 95 | 0 | 0 | 41.167 s |
| **Batch 3: Lifecycle & Finance** | `cur09EnrollmentSnapshotFinance`, `classLifecycleRegression`, `sessionLifecycle`, `maintenanceAndFinance`, `payment`, `teacherSettlement.pr7` | 6 / 6 | 155 / 155 | 0 | 0 | 71.065 s |
| **TỔNG CỘNG** | **12 Suites độc lập** | **12 / 12 (100%)** | **279 / 279 (100%)** | **0** | **0** | **118.203 s** |

---

## 2. BẰNG CHỨNG RAW OUTPUT TỪ JEST

### 2.1. Batch 1: Dedicated Hardening Suite (`courseLifecycleCur12.test.js`)

**Command:** `npm --prefix BackEnd test tests/courseLifecycleCur12.test.js`

```text
> backend@1.0.0 test
> jest tests/courseLifecycleCur12.test.js

PASS tests/courseLifecycleCur12.test.js (5.536 s)
  TASK CHAU-COURSE-LIFECYCLE: CUR-04, CUR-12 & Course Safe Delete Suite
    Task 1: CUR-04 Admin Course Management
      √ CUR-04.1: adminListCourses returns both ACTIVE and INACTIVE courses when no status filter is passed (4 ms)
      √ CUR-04.2: adminListCourses filters strictly by status (INACTIVE / ACTIVE) (1 ms)
      √ CUR-04.3: adminListCourses searches across title, slug, description, curriculumReference (1 ms)
      √ CUR-04.4: adminListCourses filters by categoryId, subjectId, and applies stable sort (2 ms)
      √ CUR-04.5: adminGetCourse returns course detail even when status is INACTIVE (1 ms)
      √ CUR-04.6: Public getCourse on an INACTIVE course throws 404 COURSE_NOT_FOUND (9 ms)
      √ CUR-04.7: Public searchCourses strictly limits results to ACTIVE status (2 ms)
      √ CUR-04.8: updateCourse reactivates INACTIVE course to ACTIVE when Subject is active (4 ms)
      √ CUR-04.9: updateCourse reactivation fails if Subject is inactive (2 ms)
      √ CUR-04.10: HTTP GET /api/admin/courses returns 403 for non-admin roles (10 ms)
      √ CUR-04.11: HTTP GET /api/admin/courses/:id returns 200 for Admin even on INACTIVE course (9 ms)
    Task 2: CUR-12 Syllabus Snapshot for Class
      √ CUR-12.1 (Mandatory 1): Class uses Syllabus V1. Course published V2 later. API Class STILL returns V1 (7 ms)
      √ CUR-12.2 (Mandatory 2): Course is INACTIVE but older Class still reads valid syllabus (1 ms)
      √ CUR-12.3 (Mandatory 3): Class without syllabusVersionId returns structured error, does NOT fallback to V2 or latest (2 ms)
      √ CUR-12.4 (Mandatory 4): Role-based access for non-public class syllabus (DRAFT) (3 ms)
      √ CUR-12.5 (Snapshot Integrity): rejects with 409 SYLLABUS_VERSION_COURSE_MISMATCH when syllabusVersion belongs to different course (1 ms)
      √ CUR-12.6 (Snapshot Integrity): rejects with 409 SYLLABUS_VERSION_NUMBER_MISMATCH when versionNumber does not match class snapshot (1 ms)
      √ CUR-12.7 (Safe teacherId handling): null/undefined teacherId does not crash with TypeError (2 ms)
      √ CUR-12.8 (Unified RBAC): PENDING_APPROVAL and REJECTED classes are strictly accessible only by Teacher Owner and Admin (5 ms)
    Task 3: Course Safe Delete
      √ SAFE-DEL.1: Course with NO dependencies is soft-deleted successfully (2 ms)
      √ SAFE-DEL.2: Course with existing Class is REJECTED with 409 COURSE_HAS_CLASSES and recommendedAction SET_INACTIVE (1 ms)
      √ SAFE-DEL.3: Course with existing Enrollment is REJECTED with 409 COURSE_HAS_ENROLLMENTS (1 ms)
      √ SAFE-DEL.3b: Course with SessionRefundReview records is REJECTED with 409 COURSE_HAS_REFUND_REVIEWS (1 ms)
      √ SAFE-DEL.4: Course in ScholarshipCampaign is REJECTED with 409 COURSE_IN_SCHOLARSHIP_CAMPAIGN (1 ms)
      √ SAFE-DEL.5: Course in LearningPath is REJECTED with 409 COURSE_IN_LEARNING_PATH (1 ms)
      √ SAFE-DEL.6: Course with active CoursePricingPolicy is REJECTED with 409 COURSE_HAS_ACTIVE_PRICING_POLICY (1 ms)
      √ SAFE-DEL.7: Soft-delete on already deleted course throws 404 COURSE_NOT_FOUND (1 ms)
      √ SAFE-DEL.8: HTTP DELETE /api/admin/courses/:id returns 403 for non-admin user (2 ms)
      √ SAFE-DEL.9: AuditLog failure is NOT silently swallowed and propagates error (4 ms)

Test Suites: 1 passed, 1 total
Tests:       29 passed, 29 total
Snapshots:   0 total
Time:        5.971 s, estimated 8 s
Ran all test suites matching tests/courseLifecycleCur12.test.js.
```

---

### 2.2. Batch 2: Academic Core Regression Suite

**Command:**
`npm --prefix BackEnd test -- tests/courseCurriculum.test.js tests/cur10ClassCreationGate.test.js tests/cur11ScheduleAndTimezone.test.js tests/syllabusVersion.test.js tests/catalogSearch.test.js --runInBand`

```text
> backend@1.0.0 test
> jest tests/courseCurriculum.test.js tests/cur10ClassCreationGate.test.js tests/cur11ScheduleAndTimezone.test.js tests/syllabusVersion.test.js tests/catalogSearch.test.js --runInBand

PASS tests/catalogSearch.test.js (16.458 s)
PASS tests/syllabusVersion.test.js (11.398 s)
PASS tests/courseCurriculum.test.js (10.901 s)
PASS tests/cur11ScheduleAndTimezone.test.js
PASS tests/cur10ClassCreationGate.test.js

Test Suites: 5 passed, 5 total
Tests:       95 passed, 95 total
Snapshots:   0 total
Time:        41.167 s
Ran all test suites matching tests/courseCurriculum.test.js|tests/cur10ClassCreationGate.test.js|tests/cur11ScheduleAndTimezone.test.js|tests/syllabusVersion.test.js|tests/catalogSearch.test.js.
```

---

### 2.3. Batch 3: Lifecycle & Finance Regression Suite

**Command:**
`npm --prefix BackEnd test -- tests/cur09EnrollmentSnapshotFinance.test.js tests/classLifecycleRegression.test.js tests/sessionLifecycle.test.js tests/maintenanceAndFinance.test.js tests/payment.test.js tests/teacherSettlement.pr7.test.js --runInBand`

```text
> backend@1.0.0 test
> jest tests/cur09EnrollmentSnapshotFinance.test.js tests/classLifecycleRegression.test.js tests/sessionLifecycle.test.js tests/maintenanceAndFinance.test.js tests/payment.test.js tests/teacherSettlement.pr7.test.js --runInBand

PASS tests/sessionLifecycle.test.js (17.778 s)
PASS tests/teacherSettlement.pr7.test.js (24.456 s)
PASS tests/maintenanceAndFinance.test.js (8.768 s)
PASS tests/classLifecycleRegression.test.js (7.574 s)
PASS tests/payment.test.js (7.28 s)
PASS tests/cur09EnrollmentSnapshotFinance.test.js

Test Suites: 6 passed, 6 total
Tests:       155 passed, 155 total
Snapshots:   0 total
Time:        71.065 s
Ran all test suites matching tests/cur09EnrollmentSnapshotFinance.test.js|tests/classLifecycleRegression.test.js|tests/sessionLifecycle.test.js|tests/maintenanceAndFinance.test.js|tests/payment.test.js|tests/teacherSettlement.pr7.test.js.
```

---

## 3. KẾT LUẬN

Tất cả 279 bài test kiểm thử tự động trên toàn bộ các miền Đào tạo, Lịch học, Vòng đời Lớp học, Thanh toán và Quyết toán Giáo viên đều vượt qua 100% không phát sinh bất kỳ lỗi hồi quy nào.

