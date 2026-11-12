# EDUNITY V3 — MASTER PROGRESS TRACKER (CHÂU BACKEND FIX ALL PHASE 0 → 6)

- **Branch:** `BE-2`
- **Starting HEAD Commit:** `46567997548cc4bad62e52364760fa5a4c8cd69a` (`Merge branch 'dev' into BE-2`, base `dev` at `3687944`)
- **Owner Scope:** Châu — Backend Đào tạo, LMS và Database phi tài chính (34 tasks: Phase 0 → Phase 6)
- **Prior Audit Folder Check:** `docs/audits/chau-test-01/` tồn tại trên ổ đĩa nhưng đang **rỗng (0 file)**. Baseline bên dưới được kiểm chứng trực tiếp từ mã nguồn thực tế tại commit `4656799`.

## Baseline Verification Summary (HEAD `4656799`)
- `node --check`: **165/165 files PASS** (0 syntax errors).
- `npm test -- --runInBand --json` (MongoMemoryReplSet, `--detectOpenHandles` chưa chạy baseline):
  - **Suites:** `35/39 PASS`, `4/39 FAIL` (`platform.test.js`, `cur11ScheduleCollisionReplSet.test.js`, `authorization.test.js`, `schemaInventory.test.js`)
  - **Test cases:** `573/579 PASS`, `6 FAIL`, `0 SKIP`
  - **Runtime:** `221.9s` (có cảnh báo `Jest did not exit one second after the test run has completed`)

## Phase Completion Tracker

| Phase | Scope Tasks | Status | Gate Requirement | Notes |
|---|---|---|---|---|
| **Phase 0** | `G0-02`, `G0-03`, `G0-04`, `G0-05`, `G0-08`, `G0-10`, `QA-01`, `QA-07` | **DONE** | Schema/migration/seed/settings/cron/backup/session fixes + API docs sync | 15/15 suites (214/214 tests) PASS trên ReplSet (`PHASE_0_REPORT.md`); `G0-02` & `G0-10` sẽ đồng bộ lại cuối Phase 6 |
| **Phase 1** | `CUR-01`, `CUR-02`, `CUR-03`, `CUR-05`, `CUR-07` | **DONE** | Build & test `CUR-07` versioned pricing verifier on ReplSet before Phase 2 | **7/7 suites PASS (`132/132` tests PASS)** trên MongoMemoryReplSet (`PHASE_1_REPORT.md`); `CUR-07` sẵn sàng nối vào `CUR-10` ở Phase 2 |
| **Phase 2** | `TEA-07`, `CUR-09`, `CUR-10`, `CUR-11` | **DONE** | Close `approveClass` bypass; keep `TEA-12` fail-closed; concurrency ReplSet proof | **11/11 suites PASS (`111/111` tests PASS)** trên MongoMemoryReplSet (`PHASE_2_REPORT.md`); nối `CUR-07` vào `CUR-10`, hoàn tất `CUR-09` snapshot + handover Mục 8, đóng bypass `approveClass`, triệt tiêu circular require & serialized `CUR-11` reschedule ReplSet tx/CAS |
| **Phase 3** | `AID-01`, `AID-04`, `SPO-07`, `TEA-16` | **DONE** | Enforce non-financial verification gate; no financial auto-grant | **8/8 suites PASS (`70/70` tests PASS)** + legacy scholarship regression **2/2 PASS** trên MongoMemoryReplSet (`PHASE_3_REPORT.md`); `53` preflight specs; giữ `TEA-12`/`AID-08` fail-closed |
| **Phase 4** | `LMS-01`, `LMS-03`, `LMS-05`, `LMS-07`, `LMS-08` | **DONE** | Full real-DB Teacher→Student→Teacher→Student flow; `storageService` dep noted | **7/7 suites PASS (`58/58` tests PASS)** trên MongoMemoryReplSet (`PHASE_4_REPORT.md`); vá write-skew `deleteAssignment` vs `submitAssignment`, partial unique `PlacementResult` (`54` preflight specs), CAS `regradeSubmission`, lock `Assessment`/`Attempt`, che `storageKey` học viên & chặn coercion; giữ nguyên boundary `DEP-BAO-03`/`04` |
| **Phase 5** | `LMS-10`, `LMS-12`, `LMS-14`, Quality Regression | **DONE** | Partial unique `SessionReview`, progress ungraded fix, regression pass | **12/12 suites PASS (`158/158` tests PASS)** trên MongoMemoryReplSet (`PHASE_5_REPORT.md`); partial unique `SessionReview`, Pinned-Revision CAS `LMS-12`, giữ `PENDING` cho Smart Classroom chưa finalize ở `LMS-14` (không phá `endSession` legacy), sửa 0-enrollment metrics & chặn coercion |
| **Phase 6** | `LMS-13`, `AI-01`, `AI-02`, `AI-03`, `AI-04` | **DONE** | `AID-08` fail-closed; zero quota waste on fallback; AI provider remains BLOCKED | **6/6 suites PASS (`70/70` tests PASS)** trên MongoMemoryReplSet (`PHASE_6_REPORT.md`); triệt tiêu `VersionError` trên `Conversation`, CAS `adminReviewMessageReport` & `approveTeacherAiDraft`, bảo toàn quota khi `AI-01` fallback / `503 AI_PROVIDER_BLOCKED`, siết prompt injection & type coercion |
| **Final TEST 2** | Full Regression + `G0-02`/`G0-10` Final Sync + `final-acceptance/` (7 docs) | **DONE (`CONDITIONAL ACCEPT`)** | Fresh global syntax check + full Jest suite + honest acceptance decision | `node --check`: **219/219 PASS**; Full Jest: **44/46 suites PASS (`615/618` tests, `0` open handles)** — 100% suite phạm vi Châu PASS, `3` fail do legacy fixture `CUR-10` (`platform.test.js`, `authorization.test.js`); đã phát hành trọn bộ `final-acceptance/` (7 docs) |
