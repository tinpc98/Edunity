# 06. FULL REGRESSION REPORT — TASK FIX-FINAL (CHÂU)

Báo cáo này tổng hợp toàn bộ kết quả kiểm chứng thực thi chính thức (**Checks 1 → 5**) trên cây mã nguồn nhánh `BE-2` sau các bản vá `FIX-FINAL`, đối chiếu với baseline trước `FIX-FINAL` và kết quả chạy thử bản vá `proposed-patches` trong môi trường tạm cô lập.

- **Quy tắc thực thi bắt buộc:** Mọi lần chạy Jest chính thức đều dùng `--runInBand --no-cache`, **tuyệt đối KHÔNG dùng `--forceExit` và KHÔNG dùng `--passWithNoTests`**.
- **Raw artifacts & logs kiểm chứng:** Lưu đầy đủ tại [`docs/audits/chau-fix-final/evidence/`](./evidence/).

---

## 1. Bảng tổng hợp kết quả 5 Verification Checks chính thức trên `BE-2` (+ Sandbox Patch Verification)

| Check | Lệnh chạy thực tế (Working dir: `BackEnd/`) | Suites | Tests | Open Handles | Duration | Evidence File |
|---|---|---|---|---|---|---|
| **Check 1: Global JS Syntax** | `node --check` toàn bộ `.js` trong `src/`, `scripts/`, `tests/` | `N/A` | **`219/219` files PASS** (`0` error) | `N/A` | `< 3s` | [`01_syntax_check.log`](./evidence/01_syntax_check.log) |
| **Check 2: Targeted Suites (`BE-2` unpatched)** | `npx jest tests/platform.test.js tests/authorization.test.js tests/cur10ClassCreationGate.test.js tests/phase2ReplSet.test.js tests/academicContract.test.js --runInBand --no-cache` | `3 passed / 2 failed` (`5 total`) | `106 passed / 3 failed` (`109 total`) | `0` | `48.126 s` | [`02_targeted_tests.log`](./evidence/02_targeted_tests.log) |
| **Check 3: Phase 0–6 ReplSet Suites** | `npx jest tests/phase0ReplSet.test.js ... tests/phase6ReplSet.test.js --runInBand --no-cache` | **`7 passed / 0 failed` (`7 total`)** | **`41 passed / 0 failed` (`41 total`)** | `0` | `92.756 s` | [`03_phase_replset_integration.log`](./evidence/03_phase_replset_integration.log) |
| **Check 4a: Full Jest Suite + JSON Report (`BE-2`)** | `npx jest --runInBand --no-cache --json --outputFile=..\docs\audits\chau-fix-final\evidence\04_full_jest_report.json` | **`44 passed / 2 failed` (`46 total`)** | **`617 passed / 3 failed` (`620 total`, `0` skipped)** | **`0`** (`[]`) | `427.837 s` | [`04_full_jest_report.json`](./evidence/04_full_jest_report.json)<br>[`04_full_jest_console.log`](./evidence/04_full_jest_console.log) |
| **Check 4b: Full Suite `--detectOpenHandles` Proof** | `npx jest --runInBand --no-cache --detectOpenHandles` | **`44 passed / 2 failed` (`46 total`)** | **`617 passed / 3 failed` (`620 total`)** | **`0` leaked handles** (tự thoát sạch, `0` warning) | `394.745 s` | [`04_open_handles_check.log`](./evidence/04_open_handles_check.log) |
| **Check 5: Security & Phase 2–6 Regression** | `npx jest tests/security.test.js tests/authorization.test.js tests/cur10ClassCreationGate.test.js tests/stage5ProgressQualityCoordination.test.js tests/stage6MessagingAndAi.test.js tests/phase2..6ReplSet.test.js --runInBand --no-cache` | `9 passed / 1 failed` (`10 total`) | `162 passed / 2 failed` (`164 total`; `security.test.js` **`54/54` PASS**) | `0` | `54.035 s` | [`05_security_regression.log`](./evidence/05_security_regression.log) |
| **Isolated Sandbox Patch Proof (`%TEMP%`)** | Áp [`platform.test.js.patch`](./proposed-patches/platform.test.js.patch) + [`authorization.test.js.patch`](./proposed-patches/authorization.test.js.patch) trong `%TEMP%`, chạy `--runInBand --no-cache --detectOpenHandles` | **`2 passed / 0 failed` (`2 total`)** | **`81 passed / 0 failed` (`81 total`)** (`platform` `13/13`, `authorization` `68/68`) | **`0`** (tự thoát sạch) | `71.839 s` | [`06_proposed_patch_verification.log`](./evidence/06_proposed_patch_verification.log) |

---

## 2. So sánh trước FIX-FINAL vs sau FIX-FINAL trên nhánh `BE-2`

| Chỉ số trên nhánh `BE-2` | Baseline (`HEAD 4656799`) | Sau `chau-fix-all` (Trước FIX-FINAL) | Sau `FIX-FINAL` (Hiện tại trên `BE-2`) | Thay đổi đáng chú ý |
|---|---|---|---|---|
| **JS Syntax (`node --check`)** | `165/165` (`src/`, `scripts/`) | `219/219` (`src/`, `scripts/`, `tests/`) | **`219/219` PASS (`0` errors)** | Không phát sinh lỗi cú pháp sau 7 file service + 3 file test |
| **Tổng Test Suites** | `35/39` PASS (`4` FAIL) | `44/46` PASS (`2` FAIL) | **`44/46` PASS (`2` FAIL)** | **`100%` (44/44)** suite ngoài 2 shared fixture legacy đều PASS |
| **Tổng Test Cases** | `573/579` PASS (`6` FAIL) | `615/618` PASS (`3` FAIL) | **`617/620` PASS (`3` FAIL, `0` SKIP)** | **`+2` test cases** mới (cộng nhiều assertion trong `phase1/2/3ReplSet`) kiểm chứng chống coercion & Express 5 query injection |
| **Open Handles (Full Suite `--detectOpenHandles`)** | Có cảnh báo chưa đóng handle | `0` | **`0`** (tự thoát sạch `exit`, 0 `--forceExit`) | Xác nhận clean teardown trên toàn bộ `46` suites |
| **Trạng thái nếu Core/Owner apply `proposed-patches/`** | `N/A` | Chưa kiểm chứng với `CUR-10` E2E đầy đủ | **Đã chứng minh cô lập `81/81` PASS (`71.839s`)** | Vượt qua `platform.test.js:410`, phát lộ và xử lý luôn latent fixture drift `platform.test.js:560` |

---

## 3. Chi tiết 3 Test Failures còn lại trên Working Tree `BE-2` (Chủ đích — KHÔNG phải regression code Châu)

Ba failure duy nhất trên `BE-2` nằm hoàn toàn ở 2 shared legacy suites (nơi Châu không tự ý sửa trực tiếp theo ranh giới sở hữu và tuyệt đối không hạ cổng fail-closed `CUR-10`):

1. **`tests/platform.test.js:410`** — `Teacher verification, class approval and classroom › runs the whole class lifecycle`
   - Expected `201`, Received `400` (`COURSE_LEVEL_REQUIRED`).
   - Fixture tạo `Course` không có `level`, chưa seed `TEA-07`/`CUR-07`/`TEA-12`.
2. **`tests/authorization.test.js:410`** — `Mass assignment › a class update cannot change its status or owner`
   - Expected `200`, Received `400` (`COURSE_LEVEL_REQUIRED`).
   - Fixture tạo `course`/`draftA` không có `Course.level`, chưa seed `TEA-07`/`CUR-07`/`TEA-12`.
3. **`tests/authorization.test.js:423`** — `Mass assignment › a class cover image must be an image location, not arbitrary content`
   - Expected `200`, Received `400` (`COURSE_LEVEL_REQUIRED`).
   - Cùng fixture `draftA` nêu trên.

*(Chi tiết root cause & phát hiện latent thứ 4 ở `platform.test.js:560` xem tại [`01_THREE_FAILURE_ROOT_CAUSE.md`](./01_THREE_FAILURE_ROOT_CAUSE.md).)*

---

## 4. Bảng thống kê đầy đủ 46/46 Suites từ [`04_full_jest_report.json`](./evidence/04_full_jest_report.json)

| # | Test Suite | Status | Passed | Failed | Skipped | Total | Duration (s) |
|---|---|---|---|---|---|---|---|
| 1 | `academicContract.test.js` | **PASS** | 19 | 0 | 0 | 19 | 1.56 |
| 2 | `academicSeedIdempotent.test.js` | **PASS** | 10 | 0 | 0 | 10 | 1.08 |
| 3 | `aid01ScholarshipDossierUnit.test.js` | **PASS** | 7 | 0 | 0 | 7 | 0.81 |
| 4 | `aid04PaperDossierUnit.test.js` | **PASS** | 4 | 0 | 0 | 4 | 0.84 |
| 5 | `aidDossierReplSet.test.js` | **PASS** | 4 | 0 | 0 | 4 | 8.42 |
| 6 | `authorization.test.js` | **FAIL** | 66 | 2 | 0 | 68 | 18.15 |
| 7 | `backupRestoreClone.test.js` | **PASS** | 15 | 0 | 0 | 15 | 1.27 |
| 8 | `catalogSearch.test.js` | **PASS** | 29 | 0 | 0 | 29 | 14.16 |
| 9 | `community.test.js` | **PASS** | 11 | 0 | 0 | 11 | 11.66 |
| 10 | `courseCurriculum.test.js` | **PASS** | 21 | 0 | 0 | 21 | 1.14 |
| 11 | `cronLockIdempotency.test.js` | **PASS** | 20 | 0 | 0 | 20 | 0.90 |
| 12 | `cur10ClassCreationGate.test.js` | **PASS** | 6 | 0 | 0 | 6 | 1.04 |
| 13 | `cur11ScheduleAndTimezone.test.js` | **PASS** | 9 | 0 | 0 | 9 | 1.78 |
| 14 | `cur11ScheduleCollisionReplSet.test.js` | **PASS** | 5 | 0 | 0 | 5 | 7.78 |
| 15 | `enrollment.test.js` | **PASS** | 10 | 0 | 0 | 10 | 8.20 |
| 16 | `jobs.test.js` | **PASS** | 3 | 0 | 0 | 3 | 5.98 |
| 17 | `lms03LearningResource.test.js` | **PASS** | 2 | 0 | 0 | 2 | 7.24 |
| 18 | `lms0507AssignmentGrade.test.js` | **PASS** | 2 | 0 | 0 | 2 | 7.32 |
| 19 | `lms0801AssessmentPlacement.test.js` | **PASS** | 2 | 0 | 0 | 2 | 8.64 |
| 20 | `lms10Review.test.js` | **PASS** | 1 | 0 | 0 | 1 | 6.18 |
| 21 | `maintenanceAndFinance.test.js` | **PASS** | 10 | 0 | 0 | 10 | 11.75 |
| 22 | `migrationPreflight.test.js` | **PASS** | 12 | 0 | 0 | 12 | 1.03 |
| 23 | `payment.test.js` | **PASS** | 52 | 0 | 0 | 52 | 60.61 |
| 24 | `phase0ReplSet.test.js` | **PASS** | 10 | 0 | 0 | 10 | 28.96 |
| 25 | `phase1ReplSet.test.js` | **PASS** | 5 | 0 | 0 | 5 | 8.21 |
| 26 | `phase2ReplSet.test.js` | **PASS** | 3 | 0 | 0 | 3 | 8.85 |
| 27 | `phase3ReplSet.test.js` | **PASS** | 5 | 0 | 0 | 5 | 8.06 |
| 28 | `phase4ReplSet.test.js` | **PASS** | 5 | 0 | 0 | 5 | 11.63 |
| 29 | `phase5ReplSet.test.js` | **PASS** | 7 | 0 | 0 | 7 | 10.86 |
| 30 | `phase6ReplSet.test.js` | **PASS** | 6 | 0 | 0 | 6 | 8.32 |
| 31 | `platform.test.js` | **FAIL** | 12 | 1 | 0 | 13 | 12.46 |
| 32 | `rateLimit.test.js` | **PASS** | 3 | 0 | 0 | 3 | 7.32 |
| 33 | `schemaInventory.test.js` | **PASS** | 16 | 0 | 0 | 16 | 6.77 |
| 34 | `security.test.js` | **PASS** | 54 | 0 | 0 | 54 | 17.29 |
| 35 | `sessionAttendanceBaseline.test.js` | **PASS** | 14 | 0 | 0 | 14 | 1.62 |
| 36 | `sessionConcurrency.test.js` | **PASS** | 13 | 0 | 0 | 13 | 11.93 |
| 37 | `sessionJoin.test.js` | **PASS** | 24 | 0 | 0 | 24 | 12.60 |
| 38 | `sessionLifecycle.test.js` | **PASS** | 24 | 0 | 0 | 24 | 15.49 |
| 39 | `sessionRecordingFixes.test.js` | **PASS** | 9 | 0 | 0 | 9 | 9.56 |
| 40 | `smartClassroomAndIncidents.test.js` | **PASS** | 15 | 0 | 0 | 15 | 19.73 |
| 41 | `stage5ProgressQualityCoordination.test.js` | **PASS** | 4 | 0 | 0 | 4 | 8.69 |
| 42 | `stage6MessagingAndAi.test.js` | **PASS** | 6 | 0 | 0 | 6 | 11.25 |
| 43 | `syllabusVersion.test.js` | **PASS** | 30 | 0 | 0 | 30 | 1.81 |
| 44 | `tea07SubjectAuthorization.test.js` | **PASS** | 12 | 0 | 0 | 12 | 1.69 |
| 45 | `teacherVerificationAccess.test.js` | **PASS** | 10 | 0 | 0 | 10 | 15.69 |
| 46 | `videoProvider.test.js` | **PASS** | 10 | 0 | 0 | 10 | 0.52 |
| **TỔNG** | **`46` suites** | **44 PASS / 2 FAIL** | **617** | **3** | **0** | **620** | **427.84 s** |

