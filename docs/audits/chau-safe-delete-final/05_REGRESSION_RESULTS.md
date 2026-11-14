# 05_REGRESSION_RESULTS.md — Báo Cáo Kiểm Thử Hồi Quy Toàn Diện (Full Regression)

**Dự án:** Edunity V3  
**Người thực hiện:** Châu  
**Ngày thực thi:** 13/11/2026  
**Chế độ:** Full Regression (Non-Double-Counting, Zero Failures)  

---

## 1. TỔNG HỢP KẾT QUẢ KIỂM THỬ HỒI QUY (AGGREGATE METRICS)

> [!NOTE]
> Các lô kiểm thử được chạy tuần tự và độc lập. Mỗi file test chỉ được đếm một lần duy nhất, tuyệt đối không tính trùng lặp test cases hay suites.

| Lô kiểm thử (Test Batch) | Danh sách tập tin kiểm thử (Test Suites) | Số Suites PASS | Số Tests PASS | Tests FAIL | Tests SKIPPED | Thời gian chạy |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Batch 1: Safe Delete & Concurrency ReplSet** | `chauSafeDeleteConcurrencyReplSet.test.js`, `courseLifecycleCur12.test.js` | 2 / 2 | 37 / 37 | 0 | 0 | 5.177 s |
| **Batch 2: Academic Core & Class Creation** | `catalogSearch.test.js`, `syllabusVersion.test.js`, `courseCurriculum.test.js`, `cur11ScheduleAndTimezone.test.js`, `cur10ClassCreationGate.test.js` | 5 / 5 | 95 / 95 | 0 | 0 | 30.288 s |
| **Batch 3: Enrollment, CUR-09 & Finance/Settlement** | `teacherSettlement.pr7.test.js`, `sessionLifecycle.test.js`, `maintenanceAndFinance.test.js`, `classLifecycleRegression.test.js`, `payment.test.js`, `cur09EnrollmentSnapshotFinance.test.js`, `enrollment.test.js` | 7 / 7 | 165 / 165 | 0 | 0 | 35.250 s |
| **TỔNG CỘNG HỆ THỐNG** | **14 Test Suites Độc Lập** | **14 / 14 (100%)** | **297 / 297 (100%)** | **0** | **0** | **70.715 s** |

---

## 2. BẰNG CHỨNG RAW JEST OUTPUT TỪNG LÔ

### 2.1. Batch 1: Safe Delete & Concurrency ReplSet

**Lệnh thực thi:**
```bash
npm --prefix BackEnd test -- tests/courseLifecycleCur12.test.js tests/chauSafeDeleteConcurrencyReplSet.test.js --runInBand
```

**Raw Output:**
```text
> backend@1.0.0 test
> jest tests/courseLifecycleCur12.test.js tests/chauSafeDeleteConcurrencyReplSet.test.js --runInBand

PASS tests/chauSafeDeleteConcurrencyReplSet.test.js
PASS tests/courseLifecycleCur12.test.js

Test Suites: 2 passed, 2 total
Tests:       37 passed, 37 total
Snapshots:   0 total
Time:        5.177 s, estimated 8 s
Ran all test suites matching tests/courseLifecycleCur12.test.js|tests/chauSafeDeleteConcurrencyReplSet.test.js.
```

---

### 2.2. Batch 2: Academic Core & Class Creation Regression

**Lệnh thực thi:**
```bash
npm --prefix BackEnd test -- tests/courseCurriculum.test.js tests/cur10ClassCreationGate.test.js tests/cur11ScheduleAndTimezone.test.js tests/syllabusVersion.test.js tests/catalogSearch.test.js --runInBand
```

**Raw Output:**
```text
> backend@1.0.0 test
> jest tests/courseCurriculum.test.js tests/cur10ClassCreationGate.test.js tests/cur11ScheduleAndTimezone.test.js tests/syllabusVersion.test.js tests/catalogSearch.test.js --runInBand

PASS tests/catalogSearch.test.js (7.749 s)
PASS tests/syllabusVersion.test.js (10.689 s)
PASS tests/courseCurriculum.test.js (10.459 s)
PASS tests/cur11ScheduleAndTimezone.test.js
PASS tests/cur10ClassCreationGate.test.js

Test Suites: 5 passed, 5 total
Tests:       95 passed, 95 total
Snapshots:   0 total
Time:        30.288 s, estimated 41 s
Ran all test suites matching tests/courseCurriculum.test.js|tests/cur10ClassCreationGate.test.js|tests/cur11ScheduleAndTimezone.test.js|tests/syllabusVersion.test.js|tests/catalogSearch.test.js.
```

---

### 2.3. Batch 3: Enrollment, CUR-09 & Finance/Settlement Regression

**Lệnh thực thi:**
```bash
npm --prefix BackEnd test -- tests/cur09EnrollmentSnapshotFinance.test.js tests/enrollment.test.js tests/classLifecycleRegression.test.js tests/sessionLifecycle.test.js tests/maintenanceAndFinance.test.js tests/payment.test.js tests/teacherSettlement.pr7.test.js --runInBand
```

**Raw Output:**
```text
> backend@1.0.0 test
> jest tests/cur09EnrollmentSnapshotFinance.test.js tests/enrollment.test.js tests/classLifecycleRegression.test.js tests/sessionLifecycle.test.js tests/maintenanceAndFinance.test.js tests/payment.test.js tests/teacherSettlement.pr7.test.js --runInBand

PASS tests/teacherSettlement.pr7.test.js (12.65 s)
PASS tests/sessionLifecycle.test.js (6.521 s)
PASS tests/maintenanceAndFinance.test.js
PASS tests/classLifecycleRegression.test.js
PASS tests/payment.test.js
PASS tests/cur09EnrollmentSnapshotFinance.test.js
PASS tests/enrollment.test.js

Test Suites: 7 passed, 7 total
Tests:       165 passed, 165 total
Snapshots:   0 total
Time:        35.25 s, estimated 74 s
Ran all test suites matching tests/cur09EnrollmentSnapshotFinance.test.js|tests/enrollment.test.js|tests/classLifecycleRegression.test.js|tests/sessionLifecycle.test.js|tests/maintenanceAndFinance.test.js|tests/payment.test.js|tests/teacherSettlement.pr7.test.js.
```

---

## 3. KẾT LUẬN

100% các bài test (297/297 tests trên 14 test suites độc lập) đều vượt qua xuất sắc. Việc nâng cấp cơ chế fail-closed và khóa đồng bộ concurrency trên Course, Class và Enrollment không gây ra bất kỳ tác dụng phụ (side-effect) hay hồi quy (regression) nào trên toàn bộ codebase Edunity V3.

