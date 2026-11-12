# PHASE 0 REPORT — FOUNDATION, DATA INTEGRITY, MIGRATION & SETTINGS (CHÂU)

- **Scope Tasks:** `G0-02`, `G0-03`, `G0-04`, `G0-05`, `G0-08`, `G0-10`, `QA-01`, `QA-07`
- **Status:** **PASS (Verified on real MongoMemoryReplSet 7.0.14)**
- **Owner:** Châu — Backend Đào tạo, LMS và Database phi tài chính
- **Note on Initial vs Final Sync:** `G0-02` và `G0-10` đã đồng bộ cho trạng thái 55 models & Admin Settings sau Phase 0, và sẽ được đồng bộ lại lần cuối cuối Phase 6 sau khi bổ sung models/endpoints mới ở Phase 1–6.

---

## 1. Summary of Root-Cause Findings & Fixes Implemented

### `QA-01` — Session Join, LiveKit Webhook, Refund Snapshot & Midnight Crossing
1. **LiveKit Webhook Delegation (`egress_ended`):** [`BackEnd/src/services/sessionService.js`](../../../BackEnd/src/services/sessionService.js) `handleLiveKitWebhook` previously checked only `participant_joined`/`participant_left` and skipped `egress_ended`, losing `durationSeconds`, `recordingSegments`, and `SESSION_RECORDING_AVAILABLE` notifications on HTTP webhooks. Fixed to delegate `egress_ended`, `room_finished`, `participant_disconnected`, etc. to `sessionPresenceService.handleLiveKitEvent`.
2. **Refund Review Paid Amount Snapshot:** [`BackEnd/src/services/sessionIncidentService.js`](../../../BackEnd/src/services/sessionIncidentService.js) `getEnrolledStudentIds` selected non-existent `paidAmount scholarshipApplied` fields instead of `amountPaidViaPayment amountPaidViaScholarship tuitionAmount paymentSource`, causing `SessionRefundReview.paidAmountSnapshot` to snapshot `0`. Fixed `.select(...)` projection.
3. **Strict 300s Late Threshold:** Set `STUDENT_LATE_JITTER_SECONDS = 0` in [`BackEnd/src/services/sessionService.js`](../../../BackEnd/src/services/sessionService.js) so `> 300s` matches [`BackEnd/src/services/sessionPresenceService.js`](../../../BackEnd/src/services/sessionPresenceService.js).
4. **Midnight-Crossing `getMySessions` Filter:** Updated [`BackEnd/src/services/studentService.js`](../../../BackEnd/src/services/studentService.js) default date filter to include ongoing active sessions whose `endDatetime >= now`.

### `G0-05` — Versioned `PlatformSetting` Model, Sync Bridge & Admin CRUD API
1. Created [`BackEnd/src/models/PlatformSetting.js`](../../../BackEnd/src/models/PlatformSetting.js) (unique `{ key: 1, version: 1 }`, index `{ key: 1, status: 1, effectiveFrom: -1, version: -1 }`, schema post-hooks calling cache invalidation listener) and exported it in [`BackEnd/src/models/index.js`](../../../BackEnd/src/models/index.js) (total **55 models**).
2. Created [`BackEnd/src/services/platformSettingService.js`](../../../BackEnd/src/services/platformSettingService.js) supporting 7 configurable keys (`SEAT_HOLD_MINUTES`, `COMMISSION_RATE`, `SCHOLARSHIP_VALID_DAYS`, `RECORDING_RETENTION_DAYS`, `RECORDING_PROCESSING_TIMEOUT_HOURS`, `TEACHER_BRIEF_PRESENCE_MIN_SECONDS`, `ATTENDANCE_THRESHOLD_PERCENT`) + alias `SEAT_HOLD_DURATION`, zero-safe DB → Env → Default resolution, transactional monotonic versioning, scheduled `effectiveFrom`, rollback via new monotonic version, and `AuditLog`.
3. Updated [`BackEnd/src/utils/settings.js`](../../../BackEnd/src/utils/settings.js) keeping `getSetting(key, now)` synchronous (required by Tin's financial/enrollment callers) backed by `platformSettingService.getEffectiveSettingSync`, and fixed `value === 0` truthiness safety.
4. Wired cache warm-up on startup in [`BackEnd/src/server.js`](../../../BackEnd/src/server.js) and reset in [`BackEnd/tests/helpers/db.js`](../../../BackEnd/tests/helpers/db.js) `clearDB()`; wired `recordingMaintenanceService.js` and `sessionPresenceService.js` (`getTeacherBriefPresenceMinSeconds`) to `getSetting`.
5. Exposed Admin routes in [`BackEnd/src/routes/accountRoutes.js`](../../../BackEnd/src/routes/accountRoutes.js) & [`BackEnd/src/controllers/accountController.js`](../../../BackEnd/src/controllers/accountController.js): `GET /api/admin/settings`, `GET /api/admin/settings/:key`, `PUT /api/admin/settings/:key`, `POST /api/admin/settings/:key/rollback` (`[authMiddleware, requireRole("ADMIN")]`).

### `G0-08` — Cron Lock Lease Extension, Poison-Item Isolation & Transactional Class Completion
1. Added `extend()`, boolean return from `release()`, and optional background heartbeat (`heartbeatIntervalMs` with `.unref()` and guaranteed `clearInterval`) in [`BackEnd/src/jobs/jobLock.js`](../../../BackEnd/src/jobs/jobLock.js).
2. Updated [`BackEnd/src/jobs/expireEnrollmentsJob.js`](../../../BackEnd/src/jobs/expireEnrollmentsJob.js) with deterministic FIFO `.sort({ holdExpiresAt: 1, _id: 1 })`, per-item `try/catch` poison-item isolation, structured summary `{ skipped, processed, released, alreadyHandled, failed, failedIds }`, and direct `reservationService.releaseReservation` invocation.
3. Wrapped `Class`, `Enrollment`, and `TeacherEarning` completion updates inside `mongoose.startSession()` + `withTransaction(...)` sequentially in [`BackEnd/src/services/classLifecycleService.js`](../../../BackEnd/src/services/classLifecycleService.js), triggering `notify()` only after transaction commit.

### `G0-03`, `G0-04`, `QA-07`, `G0-02`, `G0-10` — Migration, Backup/Restore/Clone, Idempotent Seed & Contract Sync
1. **`QA-07` ([`BackEnd/scripts/backupRestoreClone.js`](../../../BackEnd/scripts/backupRestoreClone.js)):** Fixed MongoDB Node driver v7 compatibility (`indexes()` / `listIndexes().toArray()` with `.getIndexes()` fallback for mocks), streaming batch read/write, SHA-256 checksums + `backup-manifest.json`, pre-drop `BACKUP_CHECKSUM_MISMATCH` verification abort, atomic temp-staging + `rename` restore/clone, production confirmation guards, full index-key + `partialFilterExpression` parity check, and CLI entrypoint (`backup|restore|clone|reconcile`).
2. **`G0-03` ([`BackEnd/scripts/migrationPreflight.js`](../../../BackEnd/scripts/migrationPreflight.js)):** Expanded `UNIQUE_INDEX_SPECS` from 19 to **50 specs** across all 55 models (fixing `scholarshipapplications` partialFilterExpression), added `courseproposals` `BASIC` preflight check, `assertMigrationAllowed`, and full `runV3AcademicMigration` (`dryRun` default, `--apply` with `JobLock` + backup + `BASIC->BEGINNER` transform + postflight + `AuditLog`; `--rollback` with verified EJSON restore) + CLI runner.
3. **`G0-04` ([`BackEnd/scripts/seedAcademicIdempotent.js`](../../../BackEnd/scripts/seedAcademicIdempotent.js) & [`BackEnd/package.json`](../../../BackEnd/package.json)):** Removed invalid `adminProfile` field, moved mutable runtime fields to `$setOnInsert`, fixed MongoDB `$set` vs `$setOnInsert` conflict on `Enrollment` (`courseId`/`teacherId`) caught during real ReplSet testing, recomputed `Class.enrolledCount` from active enrollments, and pointed `npm run seed` to `scripts/seedAcademicIdempotent.js` (keeping `seed:demo` and `seed:legacy`).
4. **`G0-02` & `G0-10` Sync:** Updated [`BackEnd/docs/schema-inventory-g0-02.md`](../../../BackEnd/docs/schema-inventory-g0-02.md), [`docs/database-design-mongodb.md`](../../../docs/database-design-mongodb.md), [`BackEnd/docs/api-contract-academic.md`](../../../BackEnd/docs/api-contract-academic.md), [`BackEnd/docs/api-contract-platform.md`](../../../BackEnd/docs/api-contract-platform.md), [`BackEnd/tests/schemaInventory.test.js`](../../../BackEnd/tests/schemaInventory.test.js), [`BackEnd/tests/academicContract.test.js`](../../../BackEnd/tests/academicContract.test.js), [`BackEnd/tests/migrationPreflight.test.js`](../../../BackEnd/tests/migrationPreflight.test.js), [`BackEnd/tests/backupRestoreClone.test.js`](../../../BackEnd/tests/backupRestoreClone.test.js), [`BackEnd/tests/academicSeedIdempotent.test.js`](../../../BackEnd/tests/academicSeedIdempotent.test.js), and added [`BackEnd/tests/phase0ReplSet.test.js`](../../../BackEnd/tests/phase0ReplSet.test.js).

---

## 2. Verification Evidence (Phase 0 Gate)
- **Syntax check:** `node --check` on all 19 edited/added Phase 0 JS files → **19/19 PASS**.
- **Jest (MongoMemoryReplSet 7.0.14, `--runInBand --no-cache`):** **15/15 suites PASS**, **214/214 tests PASS**, **0 FAIL**, **0 SKIP** (`68.727s`):
  - `tests/phase0ReplSet.test.js` (PASS — webhook `egress_ended`, refund paid snapshot, strict `300s`/`301s` join rule, `PlatformSetting` CRUD + explicit `0` + rollback + `AuditLog`, atomic rollback of `completeFinishedClasses`, `expireEnrollmentsJob` poison-item isolation, `jobLock.extend`, backup checksum tamper abort, atomic clone/restore, `reconcileIndexes` on 50 specs, `runV3AcademicMigration` dry-run/apply/rollback/safe-halt, 2x idempotent `seedAcademicV3` preserving runtime mutations)
  - `tests/schemaInventory.test.js`, `tests/migrationPreflight.test.js`, `tests/backupRestoreClone.test.js`, `tests/academicSeedIdempotent.test.js`, `tests/academicContract.test.js`, `tests/cronLockIdempotency.test.js`, `tests/maintenanceAndFinance.test.js`, `tests/jobs.test.js`
  - Session regression: `tests/sessionJoin.test.js`, `tests/sessionLifecycle.test.js`, `tests/sessionConcurrency.test.js`, `tests/sessionRecordingFixes.test.js`, `tests/smartClassroomAndIncidents.test.js`, `tests/sessionAttendanceBaseline.test.js`

---

## 3. Remaining Risks & Next Gate
- **Pre-existing failing suites (`authorization.test.js`, `cur11ScheduleCollisionReplSet.test.js`, `platform.test.js`):** Tracked in Phase 1 (`CUR-02` route list) and Phase 2 (`CUR-10` / `CUR-11`), plus open-handle inspection scheduled before Final Acceptance.
- **Next Gate:** Phase 1 (`CUR-01`, `CUR-02`, `CUR-03`, `CUR-05`, `CUR-07`), ending with ReplSet verification of `CUR-07` `CoursePricingPolicy` before starting Phase 2.

