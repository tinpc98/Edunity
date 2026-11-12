# TEST RESULTS LOG — EDUNITY V3 (CHÂU)

Mỗi dòng đều ghi lại lệnh chạy thực tế, thời điểm, và output kiểm chứng trên mã nguồn thật.

## 1. Baseline Benchmark (HEAD `4656799` — Before Fixes)

| Check Command | Scope | Result | Details |
|---|---|---|---|
| `node --check` on all `.js` in `BackEnd/src` + `BackEnd/scripts` | 165 files | **165/165 PASS** | 0 syntax errors |
| `npm --prefix c:\CODE\Edunity\BackEnd test -- --runInBand --json` | Full Jest suite (39 suites) | **35/39 suites PASS, 4/39 FAIL** | `573/579` cases PASS, `6 FAIL`, `0 SKIP`, duration `221.9s`. 4 suites fail: `schemaInventory.test.js` (`54` vs `33`), `cur11ScheduleCollisionReplSet.test.js` (`CONC-CUR11-01` supertest promise chưa invoke), `platform.test.js` (`400 COURSE_LEVEL_REQUIRED` tại class create), `authorization.test.js` (`/api/courses/:id/syllabus` thiếu trong `PUBLIC_ROUTES` & `PATCH /teacher/classes/:id`). Open handle warning cuối phiên test. |

## 2. Phase-by-Phase Incremental Verification Runs

### Phase 0 Verification (`G0-02, G0-03, G0-04, G0-05, G0-08, G0-10, QA-01, QA-07`)
| Check Command | Scope | Result | Details |
|---|---|---|---|
| `node --check` on 19 edited/new Phase 0 JS files | Phase 0 `src/`, `scripts/`, `tests/phase0ReplSet.test.js` | **19/19 PASS** | 0 syntax errors |
| `npx jest tests/phase0ReplSet.test.js tests/schemaInventory.test.js tests/migrationPreflight.test.js tests/backupRestoreClone.test.js tests/academicSeedIdempotent.test.js tests/academicContract.test.js tests/cronLockIdempotency.test.js tests/maintenanceAndFinance.test.js tests/jobs.test.js tests/sessionJoin.test.js tests/sessionLifecycle.test.js tests/sessionConcurrency.test.js tests/sessionRecordingFixes.test.js tests/smartClassroomAndIncidents.test.js tests/sessionAttendanceBaseline.test.js --runInBand --no-cache` | 15 suites (Phase 0 + Session regression on MongoMemoryReplSet 7.0.14) | **15/15 suites PASS (`214/214` tests PASS, `0 FAIL`, `0 SKIP`)** | Runtime `68.727s`. Sau 1 lần phát hiện & sửa lỗi thật `$set`/`$setOnInsert` conflict trong `seedAcademicIdempotent.js` và `expireEnrollmentsJob.js`, toàn bộ 15 suites đạt xanh 100%. |

### Phase 1 Verification (`CUR-01, CUR-02, CUR-03, CUR-05, CUR-07`)
| Check Command | Scope | Result | Details |
|---|---|---|---|
| `node --check` on 20 edited/new Phase 1 JS files | Constants, models, services, controller, routes, scripts, tests | **20/20 PASS** | 0 syntax errors |
| `npx jest tests/phase1ReplSet.test.js tests/courseCurriculum.test.js tests/syllabusVersion.test.js tests/catalogSearch.test.js tests/schemaInventory.test.js tests/migrationPreflight.test.js tests/academicContract.test.js --runInBand --no-cache` | 7 suites (Phase 1 real ReplSet + unit/contract/schema/preflight) | **7/7 suites PASS (`132/132` tests PASS, `0 FAIL`, `0 SKIP`)** | Runtime `22.237 s`. Đã kiểm chứng transaction `SyllabusVersion`, non-mocked `migrateForward`/`migrateBackward` + `JobLock` release & re-acquire, `LearningPath` DAG/redaction, `CourseProposal` v1 transactional creation, `CoursePricingPolicy` precedence/versioning/rollback. |
| `npx jest tests/authorization.test.js --runInBand --no-cache` | Route matrix + RBAC + redaction + mass assignment | **66/68 PASS, 2 expected FAIL** | Toàn bộ `Route matrix` (`PUBLIC_ROUTES` mới + `/api/admin/pricing-policies*`, `/api/admin/learning-paths*`, `/api/teacher/courses/:courseId/pricing-policy`) & `Responses do not leak` PASS 100%. 2 fail tại `PATCH /api/teacher/classes/:id` (L410, L423) do seed chưa có `course.level` / `TEA-12` fail-closed. |

### Phase 2 Verification (`TEA-07, CUR-09, CUR-10, CUR-11`)
| Check Command | Scope | Result | Details |
|---|---|---|---|
| `node --check` on all 13 modified/created Phase 2 JS files | Models, utils, services, tests | **13/13 PASS** | Exit code 0, 0 syntax errors |
| `npx jest tests/phase2ReplSet.test.js tests/cur11ScheduleCollisionReplSet.test.js tests/tea07SubjectAuthorization.test.js tests/cur10ClassCreationGate.test.js tests/cur11ScheduleAndTimezone.test.js tests/smartClassroomAndIncidents.test.js tests/teacherVerificationAccess.test.js tests/phase1ReplSet.test.js tests/schemaInventory.test.js tests/migrationPreflight.test.js tests/academicContract.test.js --runInBand --no-cache` | 11 suites (Phase 2 ReplSet + unit/concurrency/incident/schema/preflight/contract) | **11/11 suites PASS (`111/111` tests PASS, `0 FAIL`, `0 SKIP`)** | Runtime `44.451 s`. Xác nhận `CONC-CUR11-01` và `CONC-CUR11-05` đã xanh, `approveClass` bypass đã đóng (strict CUR-07 + TEA-07 + TEA-12 `503`), snapshot `CUR-09` bất biến sau khi publish syllabus v2 / pricing policy v2, và `reviewRescheduleRequest` serialized qua `TeacherScheduleLock` + CAS + rollback trên ReplSet thật. |

### Phase 3 Verification (`AID-01, AID-04, SPO-07, TEA-16`)
| Check Command | Scope | Result | Details |
|---|---|---|---|
| `node --check` on all 9 modified/created Phase 3 JS files | Models, preflight script/test, 4 services, `phase3ReplSet.test.js` | **9/9 PASS** | Exit code 0, 0 syntax errors |
| `npx jest tests/phase3ReplSet.test.js tests/aid01ScholarshipDossierUnit.test.js tests/aid04PaperDossierUnit.test.js tests/aidDossierReplSet.test.js tests/stage5ProgressQualityCoordination.test.js tests/schemaInventory.test.js tests/migrationPreflight.test.js tests/academicContract.test.js --runInBand --no-cache` | 8 suites (Phase 3 ReplSet + AID/SPO/TEA16 + schema/preflight/contract) | **8/8 suites PASS (`70/70` tests PASS, `0 FAIL`, `0 SKIP`)** | Runtime `23.604 s`. Chứng minh partial unique `"APPROVED"`, chặn bypass V3 `/approve`, CAS `resubmit` vs `reject`, `AID-04` link CAS & hủy biên nhận chưa link, `SPO-07` `NOT_DELETED`/`RESCHEDULED`/attribution/`reportType` guards, `TEA-16` active partial unique index (`409`), atomic CAS transition & tx audit trước `503 CONTRACT_DEPENDENCY_BLOCKED`. |
| `npx jest tests/platform.test.js -t "only admin creates campaigns\|application review allocates" --runInBand --no-cache` | Legacy scholarship campaign & allocation baseline | **1/1 suite PASS (`2/2` matched PASS, `11 skipped`)** | Runtime `7.108 s`. Không có regression trên luồng học bổng legacy. |

### Phase 4 Verification (`LMS-01, LMS-03, LMS-05, LMS-07, LMS-08`)
| Check Command | Scope | Result | Details |
|---|---|---|---|
| `node --check` on all 9 modified/created Phase 4 JS files | `PlacementResult.js`, `migrationPreflight`, 5 LMS/Placement services, `phase4ReplSet.test.js` | **9/9 PASS** | Exit code 0, 0 syntax errors |
| `npx jest tests/phase4ReplSet.test.js tests/lms03LearningResource.test.js tests/lms0507AssignmentGrade.test.js tests/lms0801AssessmentPlacement.test.js tests/schemaInventory.test.js tests/migrationPreflight.test.js tests/academicContract.test.js --runInBand --no-cache` | 7 suites (Phase 4 ReplSet + LMS-01/03/05/07/08 + schema/preflight/contract) | **7/7 suites PASS (`58/58` tests PASS, `0 FAIL`, `0 SKIP`)** | Runtime `25.627 s` (`task-6101`). Chứng minh & vá triệt để write-skew `deleteAssignment` vs `submitAssignment`, CAS `regradeSubmission`, partial unique active `GENERATED` `PlacementResult` (`54` preflight specs), tx lock `LearningResource`/`Assessment`/`Attempt`, che raw `storageKey` học viên & answer keys, chặn boolean/empty-string coercion. |

### Phase 5 Verification (`LMS-10, LMS-12, LMS-14 + Session/Attendance Regression`)
| Check Command | Scope | Result | Details |
|---|---|---|---|
| `node --check` on all 7 modified/created Phase 5 JS files | `SessionReview.js`, `migrationPreflight`, 3 Phase 5 services, `phase5ReplSet.test.js` | **7/7 PASS** | Exit code 0, 0 syntax errors |
| `npx jest tests/phase5ReplSet.test.js tests/lms10Review.test.js tests/stage5ProgressQualityCoordination.test.js tests/sessionAttendanceBaseline.test.js tests/sessionJoin.test.js tests/sessionLifecycle.test.js tests/sessionConcurrency.test.js tests/sessionRecordingFixes.test.js tests/smartClassroomAndIncidents.test.js tests/schemaInventory.test.js tests/migrationPreflight.test.js tests/academicContract.test.js --runInBand --no-cache` | 12 suites (Phase 5 ReplSet + LMS-10/12/14 + Session/Attendance regression + schema/preflight/contract) | **12/12 suites PASS (`158/158` tests PASS, `0 FAIL`, `0 SKIP`)** | Runtime `56.652 s` (`task-6201`). Chứng minh `LMS-10` partial unique re-review & atomic admin delete + tx class rating average, `LMS-12` Pinned-Revision CAS (`409 PROGRESS_REVIEW_CONFLICT`) & concurrent milestone race, `LMS-14` pending presence finalization + 0-enrollment metrics + coercion/query guards, không gây regression trên các suite Session/Attendance. |

### Phase 6 Verification (`LMS-13, AI-01..04`)
| Check Command | Scope | Result | Details |
|---|---|---|---|
| `node --check` on 4 Phase 6 JS files | `messagingService.js`, `aiGovernanceService.js`, `aiUseCaseService.js`, `phase6ReplSet.test.js` | **4/4 PASS** | Exit code 0, 0 syntax errors |
| `npx jest tests/phase6ReplSet.test.js tests/stage6MessagingAndAi.test.js tests/community.test.js tests/schemaInventory.test.js tests/migrationPreflight.test.js tests/academicContract.test.js --runInBand --no-cache` | 6 suites (Phase 6 ReplSet + Stage 6 + Community + Schema/Preflight/Contract) | **6/6 suites PASS (`70/70` tests PASS, `0 FAIL`, `0 SKIP`)** | Runtime `26.824 s` (`task-6299`). Xác minh atomic `Conversation` (0 `VersionError`), CAS duyệt report/gỡ tin nhắn & duyệt AI draft (`[200, 409]`), recall-vs-hide nhất quán, zero quota waste khi `AI-01` fallback / `503 AI_PROVIDER_BLOCKED`, prompt injection check với 0 tài nguyên, và chặn coercion/hostile query. |

## 3. Global Sync & Final TEST 2 Full Regression (After Phase 6 Closure)

| Check Command | Scope | Result | Details |
|---|---|---|---|
| `Get-ChildItem -Path BackEnd\src, BackEnd\scripts, BackEnd\tests -Recurse -Filter *.js \| node --check` | Tất cả 219 file `.js` (`src/`, `scripts/`, `tests/`) | **219/219 PASS** | Exit code 0, `FAILED=0` (`task-6368`) |
| `npx jest --runInBand --no-cache --json --outputFile=...` | Toàn bộ **46 test suites** trong `BackEnd/tests/` | **44/46 suites PASS, 2/46 FAIL (`615/618` tests PASS, `0` SKIP, `0` open handles)** | Runtime `255.422 s` (`task-6369`). **100% suites chuyên trách Châu (Phase 0→6 ReplSet, CUR, TEA, AID, SPO, LMS, AI, Session, Schema/Preflight/Contract) PASS hoàn toàn.** 3 tests fail chỉ nằm tại legacy fixtures `platform.test.js:410` (1) & `authorization.test.js:410,423` (2) do `Course` mẫu thiếu `level` + thiếu `TEA-07`/`CUR-07`/`TEA-12` khi đi qua cổng fail-closed `CUR-10`. |
| `npx jest tests/authorization.test.js --detectOpenHandles --runInBand --no-cache` | Open-handle leak & RBAC audit | **`66/68` PASS, `0` open-handle warnings** | Thoát sạch không còn cảnh báo rò rỉ socket/timer (`task-6387`). |
