# PHASE 4 REPORT — CORE LMS & PLACEMENT ASSESSMENT (`LMS-01`, `LMS-03`, `LMS-05`, `LMS-07`, `LMS-08`)

**Status:** `DONE`  
**Branch:** `BE-2`  
**Owner Scope:** Châu — Backend Đào tạo, LMS & Database phi tài chính

---

## 1. Mục tiêu Phase 4 & Kết quả Audit mã nguồn

Phase 4 kiểm toán và gia cố toàn bộ luồng LMS cốt lõi:

1. **`LMS-03` (`learningResourceService.js`):**
   - `updateLearningResource` và `deleteLearningResource` chưa chạy trong MongoDB transaction kèm atomic lock, dẫn tới nguy cơ race làm hồi sinh tài nguyên vừa xóa (`isDeleted` lật ngược) hoặc trùng lặp xóa/audit.
   - `listSessionResources` trước đây không tải `allMigrated` khi lọc theo trạng thái (`status=DRAFT`/`ARCHIVED`), làm item legacy đã migrate vẫn lọt lại hoặc item legacy chưa migrate xuất hiện nhầm dưới bộ lọc `DRAFT`.
   - `migrateSessionContents` chưa bọc chung việc tạo tài nguyên + `AuditLog` vào transaction và thiếu retry an toàn nếu có concurrent `E11000` race; thiếu type/enum/boolean guards (`dryRun: "false"`, object/array coercion).
2. **`LMS-05` (`assignmentService.js`):**
   - `presentSubmission` chưa ẩn `storageKey` thô đối với học viên (trái với `LMS-03` chỉ trả `downloadUrl`).
   - Phát hiện **write-skew thực sự dưới Snapshot Isolation** giữa `deleteAssignment` (gắn `isDeleted: true` sau khi đếm `Submission`) và `submitAssignment` (trước đây chỉ read `Assignment` trong tx rồi tạo `Submission`), được chứng minh trực tiếp khi chạy `phase4ReplSet.test.js` lần 1 (`dbA2.isDeleted === true` và `dbA2Subs === 1`). Đã vá triệt để bằng atomic write-lock `Assignment.findOneAndUpdate(..., { $inc: { __v: 1 } })` trong transaction của `submitAssignment`, cùng `updateAssignment`/`deleteAssignment`/`publishAssignment`/`closeAssignment`.
   - Bổ sung guard số/boolean nghiêm ngặt chặn JS coercion (`Number("") === 0`, `Number(true) === 1`, `Boolean("false") === true`).
3. **`LMS-07` (`gradeService.js`):**
   - `regradeSubmission` chưa dùng Compare-And-Swap (`revisionNumber`) theo phiên bản mong đợi và chưa chặn numeric/object coercion trên `score` và query filters. Đã vá bằng đọc `preGrade` / `expectedRevisionNumber` + atomic CAS `Grade.findOneAndUpdate({ _id, revisionNumber: expectedRevision })` trong `session.withTransaction` (`409 REGRADE_CONFLICT`).
4. **`LMS-08` (`assessmentService.js`):**
   - `addQuestion` / `updateQuestion` / `deleteQuestion` / `publishAssessment` / `startAttempt` / `manualGradeAttempt` còn khoảng hở đồng thời dẫn tới sai lệch `questionOrder` tự tăng, `totalMaxScore` / `gradingMode`, write-skew với `archiveAssessment`, và chưa chặn triệt để `questionId` trùng/lạ hoặc coercion khi chấm tự luận.
   - Đã đồng bộ lock `Assessment` trong transaction (`lockManageableAssessmentInTx` & `startAttempt`), thay `.sort(() => Math.random() - 0.5)` bằng Fisher-Yates `shuffleArray`, lock `Attempt` khi `manualGradeAttempt`, và giữ nghiêm ngặt che giấu `correctOptionIds` / `acceptedAnswers` / `explanation` / `gradedBy` trên student view.
5. **`LMS-01` (`PlacementResult.js`, `placementService.js`):**
   - `PlacementResult` thiếu partial unique index `{ studentId: 1, subjectId: 1, gradeLevel: 1 }` trên `{ status: "GENERATED" }` để bảo đảm ở tầng DB không thể tồn tại 2 kết quả `GENERATED` song song cùng `(student, subject, gradeLevel)`.
   - `evaluatePlacementFromAttempt` khi race trên 2 `Attempt` khác nhau của cùng 1 học sinh dễ vấp `E11000` nếu không có bounded retry loop, và `existingInTx` có thể trả sai `idempotent`. Đã thêm partial unique index (`54` preflight specs), retry loop có giới hạn khi `E11000`, re-check `Attempt.status === "GRADED"` trong tx, và enum/ObjectId guards.

---

## 2. Chi tiết thay đổi thực tế (Evidence-Based)

| Task | Files Modified / Created | Key Fixes & Contracts |
|---|---|---|
| `LMS-01` & `G0-03` Index | [`BackEnd/src/models/PlacementResult.js`](file:///c:/CODE/Edunity/BackEnd/src/models/PlacementResult.js), [`BackEnd/scripts/migrationPreflight.js`](file:///c:/CODE/Edunity/BackEnd/scripts/migrationPreflight.js), [`BackEnd/tests/migrationPreflight.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/migrationPreflight.test.js) | Thêm partial unique index `{ studentId: 1, subjectId: 1, gradeLevel: 1 }` (`status: "GENERATED"`); đồng bộ `54` `UNIQUE_INDEX_SPECS` trong preflight. |
| `LMS-03` Service | [`BackEnd/src/services/learningResourceService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/learningResourceService.js) | Strict boolean/string/enum/ObjectId/fileSize guards; `updateLearningResource` & `deleteLearningResource` trong `withTransaction` + atomic lock chống resurrection; sửa `listSessionResources` lọc `allMigrated`/`DRAFT`; `migrateSessionContents` + `AuditLog` trong tx + bảo toàn 100% `Session.contents[]`. |
| `LMS-05` Service | [`BackEnd/src/services/assignmentService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/assignmentService.js) | Ẩn raw `storageKey` trong `presentSubmission` cho `STUDENT`; `assertOptionalBoolean`/`assertFiniteNumeric` guards; `updateAssignment`/`deleteAssignment`/`publishAssignment`/`closeAssignment`/`submitAssignment` dùng atomic lock + tx ngăn triệt để write-skew xóa vs nộp bài. |
| `LMS-07` Service | [`BackEnd/src/services/gradeService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/gradeService.js) | Strict `assertFiniteNumeric`/`assertOptionalString`/`assertQueryObjectId`; CAS `regradeSubmission` trên `revisionNumber` (`409 REGRADE_CONFLICT`), giữ append-only `GradeHistory`. |
| `LMS-08` Service | [`BackEnd/src/services/assessmentService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/assessmentService.js) | Lock `Assessment` trong `withTransaction` (`create`/`update`/`addQuestion`/`updateQuestion`/`deleteQuestion`/`publish`/`archive`/`startAttempt`); Fisher-Yates `shuffleArray`; `submitAttempt` & `manualGradeAttempt` atomic `Attempt` lock + từ chối `questionId` trùng/lạ (`400`) & coercion; tiếp tục redact answer key/explanation/grader identity. |
| `LMS-01` Service | [`BackEnd/src/services/placementService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/placementService.js) | Strict enum/ObjectId/string query guards; accurate `idempotent: true` replay trong tx; bounded retry loop (3 lần) khi race `E11000` giữa 2 attempt khác nhau để supersede bản cũ nguyên tử, không tạo trùng `GENERATED`. |
| Verification Suite | [`BackEnd/tests/phase4ReplSet.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/phase4ReplSet.test.js) | Chứng minh concurrency/CAS/write-skew/privacy/partial-unique/type-coercion cho đủ `LMS-03`, `LMS-05`, `LMS-07`, `LMS-08`, `LMS-01` trên MongoMemoryReplSet. |

---

## 3. Kiểm chứng thực tế (Test Evidence)

1. **`node --check`** trên toàn bộ 9 file `.js` sửa/mới của Phase 4 (`PlacementResult.js`, `migrationPreflight.js`, `migrationPreflight.test.js`, `learningResourceService.js`, `assignmentService.js`, `gradeService.js`, `assessmentService.js`, `placementService.js`, `phase4ReplSet.test.js`): **9/9 PASS** (exit code 0).
2. **Phase 4 ReplSet + LMS/Schema/Preflight/Contract Suites** (`npx jest tests/phase4ReplSet.test.js tests/lms03LearningResource.test.js tests/lms0507AssignmentGrade.test.js tests/lms0801AssessmentPlacement.test.js tests/schemaInventory.test.js tests/migrationPreflight.test.js tests/academicContract.test.js --runInBand --no-cache`, chạy với `BypassSandbox: true` trên MongoMemoryReplSet 7.0.14):
   - **7/7 suites PASS (`58/58` tests PASS, `0 FAIL`, `0 SKIP`)** trong `25.627 s` (`task-6101`).
   - Quá trình chạy test thực sự đã phát hiện & xác nhận vá xong write-skew giữa `deleteAssignment` vs `submitAssignment`, race `regradeSubmission` CAS, và xác nhận chuẩn Express v5 simple query parser kết hợp validation tại tầng service.

---

## 4. Trạng thái Dependency chuyển sang Phase 5

- **DEP-BAO-03 (`storageService.js`):** Giữ nguyên ranh giới không sửa file của Bảo (`PRIVATE_PURPOSES` chỉ có `IDENTITY`, `QUALIFICATION`, `SCHOLARSHIP_PROOF`, `INCIDENT_EVIDENCE`; thiếu signature `video/mp4`). Test upload PDF qua `INCIDENT_EVIDENCE` hoạt động bình thường; việc tách purpose riêng (`LEARNING_RESOURCE` / `ASSIGNMENT_SUBMISSION`) / MP4 tiếp tục giữ ở danh sách dependency ngoài phạm vi.
- **DEP-BAO-04 (`app.js` CORS `allowedHeaders`):** Giữ nguyên ranh giới không sửa `app.js` (`allowedHeaders` chưa có `Idempotency-Key` cho browser CORS; API server/Supertest nhận `Idempotency-Key` bình thường).
- **Sẵn sàng bước vào Phase 5:** `LMS-10`, `LMS-12`, `LMS-14` và Session/Attendance Regression.

