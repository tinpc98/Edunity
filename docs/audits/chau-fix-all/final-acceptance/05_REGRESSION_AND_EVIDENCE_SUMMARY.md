# 05. REGRESSION & VERIFICATION EVIDENCE SUMMARY (TEST 1 → FINAL TEST 2)

Mọi số liệu dưới đây được trích xuất trực tiếp từ lần chạy thực tế sau cùng trên branch `BE-2` (`MongoMemoryReplSet 7.0.14`, `--runInBand --no-cache`, `BypassSandbox: true`).

---

## 1. Bảng so sánh Baseline (`4656799`) vs Final TEST 2 (`BE-2`)

| Chỉ số kiểm chứng | Baseline TEST 1 (`HEAD 4656799`) | Final TEST 2 (`BE-2` sau Phase 6) | Chênh lệch / Ý nghĩa |
|---|---|---|---|
| **Global JS Syntax (`node --check`)** | `165/165` files (`src/`, `scripts/`) PASS | **`219/219` files (`src/`, `scripts/`, `tests/`) PASS** | `+54` file (tăng toàn bộ test + modules mới, `0` lỗi cú pháp) |
| **MongoDB Models / Preflight Specs** | `55` models (test kiểm tra `33` — FAIL), `19` preflight specs | **`57` models / `17` soft-delete / `54` preflight specs** | `schemaInventory.test.js` (**16/16 PASS**) & `migrationPreflight.test.js` (**12/12 PASS**) |
| **Tổng Test Suites** | `35/39` PASS, `4` FAIL (`schemaInventory`, `cur11Collision`, `platform`, `authorization`) | **`44/46` PASS, `2` FAIL** (`platform`, `authorization`) | Đã vá `schemaInventory` & `cur11ScheduleCollisionReplSet`, thêm **7 suite mới `phase0ReplSet..phase6ReplSet`** đều PASS 100% |
| **Tổng Test Cases** | `573/579` PASS, `6` FAIL, `0` SKIP | **`615/618` PASS, `3` FAIL, `0` SKIP** | `+42` test cases PASS thực trên ReplSet, giảm nửa số fail (`6` → `3` legacy `CUR-10` fixture fails) |
| **Open Handles** | Cảnh báo `Jest did not exit one second after...` | **`0` open handles** (`final-jest-report.json`) | Chấm dứt hoàn toàn cảnh báo handle rò rỉ |
| **Thời gian chạy toàn Jest** | `221.9s` (`39` suites) | `255.422s` (`46` suites) | Thêm `7` suite multi-document ReplSet transaction/race tests |

---

## 2. Kết quả chi tiết theo Phase Gate (`Phase 0 → Phase 6`)

| Giai đoạn | Lệnh chạy thực tế | Số Suite PASS | Số Test PASS | Thời gian | Tóm tắt bằng chứng |
|---|---|---|---|---|---|
| **Phase 0 Gate** | `npx jest tests/phase0ReplSet.test.js tests/schemaInventory.test.js ... (15 suites)` | **15/15 PASS** | **214/214 PASS** | `68.727s` | Webhook `egress_ended`, refund snapshot, `PlatformSetting` 0-safe & rollback, cron `JobLock` extend, tx `completeFinishedClasses`, SHA-256 backup/restore/clone, 50 specs preflight, 2x seed idempotency |
| **Phase 1 Gate** | `npx jest tests/phase1ReplSet.test.js tests/courseCurriculum.test.js ... (7 suites)` | **7/7 PASS** | **132/132 PASS** | `22.237s` | `CUR-01` `NOT_DELETED`/`level`, `CUR-02` tx session + `JobLock` migration, `CUR-03` `LearningPath` DAG/redaction, `CUR-05` tx Syllabus v1, `CUR-07` `CoursePricingPolicy` precedence/versioning/rollback |
| **Phase 2 Gate** | `npx jest tests/phase2ReplSet.test.js tests/cur11ScheduleCollisionReplSet.test.js ... (11 suites)` | **11/11 PASS** | **111/111 PASS** | `44.451s` | `TEA-07` filters, `CUR-09` snapshot immutability, `CUR-10` đóng bypass `approveClass`, giữ `TEA-12` `503`, `CONC-CUR11-01..05` & reschedule CAS/tx lock (`lockSeq` rollback proof) |
| **Phase 3 Gate** | `npx jest tests/phase3ReplSet.test.js tests/aid01ScholarshipDossierUnit.test.js ... (8 suites)` (+ legacy `platform.test.js` `-t`) | **8/8 PASS** (+ legacy **2/2 PASS**) | **70/70 PASS** (+ `2/2` matched) | `23.604s` | Partial unique `"APPROVED"`, chặn bypass V3 `/approve`, `resubmit` vs `reject` CAS, `AID-04` unlink cancel & CAS, `SPO-07` attribution/rescheduled/deleted guards, `TEA-16` active partial unique & tx audit trước `503` |
| **Phase 4 Gate** | `npx jest tests/phase4ReplSet.test.js tests/lms03LearningResource.test.js ... (7 suites)` | **7/7 PASS** | **58/58 PASS** | `25.627s` | Vá **write-skew** `deleteAssignment` vs `submitAssignment`, CAS `regradeSubmission`, partial unique `GENERATED` `PlacementResult` (`54` specs), lock `Assessment`/`Attempt`, che `storageKey` & answer keys, anti-coercion |
| **Phase 5 Gate** | `npx jest tests/phase5ReplSet.test.js tests/lms10Review.test.js ... (12 suites)` | **12/12 PASS** | **158/158 PASS** | `56.652s` | `LMS-10` partial unique `SessionReview` & tx class rating, `LMS-12` **Pinned-Revision CAS**, `LMS-14` pending presence finalization & 0-enrollment metrics, Session/Attendance regression 100% PASS |
| **Phase 6 Gate** | `npx jest tests/phase6ReplSet.test.js tests/stage6MessagingAndAi.test.js ... (6 suites)` | **6/6 PASS** | **70/70 PASS** | `26.824s` | Triệt tiêu `500 VersionError` `Conversation`, CAS `adminReviewMessageReport` & `approveTeacherAiDraft`, recall-vs-hide nhất quán, zero quota waste trên `AI-01` fallback / `503`, prompt injection check với 0 resource |
| **Final TEST 2 Full Run** | `npx jest --runInBand --no-cache --json --outputFile=...` (`46` suites toàn repo) | **44/46 PASS** | **615/618 PASS** | `255.422s` | `44` suites hoàn toàn xanh (`100%` các suite thuộc Châu + Payment + Session + Community + Security PASS); chỉ còn `3` legacy `CUR-10` fixture fails ở `platform.test.js` (`1`) & `authorization.test.js` (`2`) |

---

## 3. Phân tích 3 test fail còn lại trên toàn repo (`platform.test.js` & `authorization.test.js`)

| Suite & Line | Test Case | Expected vs Actual | Nguyên nhân kỹ thuật xác thực |
|---|---|---|---|
| [`platform.test.js:410`](file:///c:/CODE/Edunity/BackEnd/tests/platform.test.js#L410) | `Teacher verification, class approval and classroom › runs the whole class lifecycle` | Expected `201`, Received `400` (`COURSE_LEVEL_REQUIRED`) | Fixture tại [`platform.test.js:96-105`](file:///c:/CODE/Edunity/BackEnd/tests/platform.test.js#L96-L105) tạo `Course` không có `level`, chưa có `TEA-07`, `CUR-07`, `TEA-12`. Theo ranh giới sở hữu, Châu không tự sửa `platform.test.js` và không hạ cổng `CUR-10`. |
| [`authorization.test.js:410`](file:///c:/CODE/Edunity/BackEnd/tests/authorization.test.js#L410) | `Mass assignment › a class update cannot change its status or owner` | Expected `200`, Received `400` (`COURSE_LEVEL_REQUIRED`) | Fixture tại [`authorization.test.js:101`](file:///c:/CODE/Edunity/BackEnd/tests/authorization.test.js#L101) tạo `Course` thiếu `level`, thiếu `TEA-07`/`CUR-07`/`TEA-12`; endpoint `PATCH /api/teacher/classes/:id` qua cổng `CUR-10` fail-closed. |
| [`authorization.test.js:423`](file:///c:/CODE/Edunity/BackEnd/tests/authorization.test.js#L423) | `Mass assignment › a class cover image must be an image location, not arbitrary content` | Expected `200`, Received `400` (`COURSE_LEVEL_REQUIRED`) | Tương tự dòng `410` cùng fixture `data.draftA` không có `Course.level` & `TEA-07`/`CUR-07`/`TEA-12`. |

