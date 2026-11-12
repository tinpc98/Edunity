# PHASE 5 REPORT — LEARNING PROGRESS & QUALITY (`LMS-10`, `LMS-12`, `LMS-14` + Session/Attendance Regression)

**Status:** `DONE`  
**Branch:** `BE-2`  
**Owner Scope:** Châu — Backend Đào tạo, LMS & Database phi tài chính

---

## 1. Mục tiêu Phase 5 & Kết quả Audit mã nguồn

Phase 5 kiểm toán và gia cố các luồng đánh giá tiết học, theo dõi tiến bộ học viên, dashboard tổng hợp học tập và regression hệ thống buổi học/điểm danh:

1. **`LMS-10` (`SessionReview.js`, `migrationPreflight.js`, `reviewService.js`):**
   - Index unique `{ sessionId: 1, studentId: 1 }` trên `SessionReview` trước đây không có `partialFilterExpression: { isDeleted: false }`, khiến học viên bị chặn đánh giá lại sau khi Admin gỡ (soft-delete) review vi phạm dù dữ liệu lịch sử đã đánh dấu `isDeleted: true`.
   - `parseIntRating` dùng `Number(val)` và `Number.isInteger` nên `rating: true` bị ép thành `1` và `rating: [5]` bị ép thành `5` thay vì trả `400 VALIDATION_ERROR`. `adminDeleteSessionReview` chưa kiểm tra kiểu chuỗi cho `body.reason`.
   - `createReview` (mức Class) cập nhật lại điểm trung bình `Class` và `User.teacherProfile` ngoài transaction, có thể bị lost-update khi nhiều học viên đánh giá lớp đồng thời.
   - `createSessionReview` và `adminDeleteSessionReview` chưa chạy atomically trong ReplSet transaction: khi 2 Admin cùng lúc gỡ 1 review, cả hai cùng qua `findOne` và ghi 2 `AuditLog` trùng lặp.
   - Đã vá toàn bộ: chuyển index `SessionReview` sang partial unique (`{ isDeleted: false }`, đồng bộ với `migrationPreflight.js` & test), bọc tuần tự trong `mongoose.startSession()` `withTransaction`, khóa atomic `SessionReview.findOneAndUpdate({ _id, ...NOT_DELETED })` cho `adminDeleteSessionReview`, chặn boolean/object/array coercion và giữ nguyên bất biến 0 side-effect kỷ luật/thù lao giảng viên.

2. **`LMS-12` (`studentProgressReviewService.js`):**
   - `updateStudentProgressReview` đọc document rồi `doc.save()` bên ngoài CAS, dễ phát sinh `500 VersionError` hoặc silent lost-update khi 2 request PATCH chạy song song trên cùng 1 đánh giá.
   - `parseMasteryScore` trước đây bị coercion tương tự `Number(true) === 1` và `Number([80]) === 80`; các trường `progressRating`, `periodType`, `sessionId` và query filter (`studentId`, `classId`, `teacherId`, `periodType`, `progressRating`) chưa từ chối array/object/scalar sai kiểu một cách nhất quán.
   - Đã áp dụng **Pinned-Revision CAS** trên `revisionNumber` (+ hỗ trợ `body.expectedRevisionNumber` tùy chọn) bằng `StudentProgressReview.findOneAndUpdate({ _id, teacherId, revisionNumber: expectedRevision })` trong `withTransaction` (`409 PROGRESS_REVIEW_CONFLICT`), bọc `createStudentProgressReview` trong `withTransaction`, và bổ sung input/query guards nghiêm ngặt.

3. **`LMS-14` (`learningProgressService.js`):**
   - Với các buổi học Smart Classroom bật `presenceTrackingActive: true` mà giáo viên chưa chốt điểm danh (`attendanceFinalizedAt === null`) và `SessionAttendance.evaluationStatus === "PENDING"`, hệ thống trước đây vẫn tính `attendanceStatus: "ABSENT"` vào mẫu số tỷ lệ chuyên cần (`attendanceRate`).
   - Lưu ý giữ tương thích ngược 100% với luồng `sessionService.endSession` legacy (`presenceTrackingActive === false`): các buổi học legacy đã `COMPLETED` qua `endSession` vẫn dùng `SessionAttendance` như trước nên không gây vỡ baseline/session regression.
   - Khi lớp chưa có học viên nào ghi nhận (`enrollments.length === 0`), `summarizeClassMetricsAcrossStudents` trước đây trả `0` sai cho `totalScheduledSessions`, `completedSessionsCount`, `totalPublishedAssignments`, `totalPublishedAssessments`. Đã truy vấn trực tiếp từ `Session`, `Assignment`, `Assessment`.
   - Bổ sung guard chia 0 / `NaN` (`maxScore > 0`) khi tính `%` điểm bài tập & bài kiểm tra, đồng thời chặn array/object/enum sai ở toàn bộ query filters của Student/Teacher/Admin.

---

## 2. Chi tiết thay đổi thực tế (Evidence-Based)

| Task | Files Modified / Created | Key Fixes & Contracts |
|---|---|---|
| `LMS-10` & `G0-03` Index | [`BackEnd/src/models/SessionReview.js`](file:///c:/CODE/Edunity/BackEnd/src/models/SessionReview.js), [`BackEnd/scripts/migrationPreflight.js`](file:///c:/CODE/Edunity/BackEnd/scripts/migrationPreflight.js), [`BackEnd/tests/migrationPreflight.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/migrationPreflight.test.js) | Đổi index `{ sessionId: 1, studentId: 1 }` sang `{ unique: true, partialFilterExpression: { isDeleted: false } }`; đồng bộ `sessionreviews` trong `UNIQUE_INDEX_SPECS` (`54` specs) & kiểm tra ở `G0-03.SPEC.3`. |
| `LMS-10` Service | [`BackEnd/src/services/reviewService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/reviewService.js) | Strict `parseIntRating` (chặn boolean/object/array) & `parseOptionalReason`; bọc `createReview` & `createSessionReview` tuần tự trong `withTransaction`; atomic `findOneAndUpdate` + `AuditLog` tx trong `adminDeleteSessionReview` (`[200, 404]`, 1 audit). |
| `LMS-12` Service | [`BackEnd/src/services/studentProgressReviewService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/studentProgressReviewService.js) | Chặn boolean/array/object trên `masteryScore`, `progressRating`, `periodType`, `sessionId` & toàn bộ query filters; bọc `createStudentProgressReview` trong tx; triển khai **Pinned-Revision CAS** trên `updateStudentProgressReview` (`409 PROGRESS_REVIEW_CONFLICT`). |
| `LMS-14` Service | [`BackEnd/src/services/learningProgressService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/learningProgressService.js) | Select `presenceTrackingActive`; giữ trạng thái `"PENDING"` cho buổi học `presenceTrackingActive && !attendanceFinalizedAt && evaluationStatus === "PENDING"` (không ảnh hưởng `endSession` legacy); sửa 0-enrollment class metric counts; thêm `maxScore > 0` guard & strict query validation. |
| Verification Suite | [`BackEnd/tests/phase5ReplSet.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/phase5ReplSet.test.js) | Chứng minh concurrency/CAS, partial unique re-review, lost-update class rating, presence finalization, 0-enrollment metrics, type/query guards & zero discipline/earning side-effects trên MongoMemoryReplSet. |

---

## 3. Kiểm chứng thực tế (Test Evidence)

1. **`node --check`** trên toàn bộ 7 file `.js` sửa/mới của Phase 5 (`SessionReview.js`, `migrationPreflight.js`, `migrationPreflight.test.js`, `reviewService.js`, `studentProgressReviewService.js`, `learningProgressService.js`, `phase5ReplSet.test.js`): **7/7 PASS** (exit code 0).
2. **Phase 5 ReplSet + LMS-10/12/14 + Session/Attendance Regression + Schema/Preflight/Contract Suites** (`npx jest tests/phase5ReplSet.test.js tests/lms10Review.test.js tests/stage5ProgressQualityCoordination.test.js tests/sessionAttendanceBaseline.test.js tests/sessionJoin.test.js tests/sessionLifecycle.test.js tests/sessionConcurrency.test.js tests/sessionRecordingFixes.test.js tests/smartClassroomAndIncidents.test.js tests/schemaInventory.test.js tests/migrationPreflight.test.js tests/academicContract.test.js --runInBand --no-cache`, chạy với `BypassSandbox: true` trên MongoMemoryReplSet 7.0.14):
   - **12/12 suites PASS (`158/158` tests PASS, `0 FAIL`, `0 SKIP`)** trong `56.652 s` (`task-6201`).

---

## 4. Chuyển tiếp sang Phase 6

- Toàn bộ `Phase 5` đã đóng sạch và kiểm chứng regression Session/Attendance (`sessionAttendanceBaseline`, `sessionJoin`, `sessionLifecycle`, `sessionConcurrency`, `sessionRecordingFixes`, `smartClassroomAndIncidents`) đều xanh 100%.
- **Sẵn sàng bước vào Phase 6:** `LMS-13` (Class Messaging & Moderation) và `AI-01..04` (AI Governance & Use Cases — giữ fail-closed `503 AI_PROVIDER_BLOCKED` & `AID_08_CONSENT_DEPENDENCY_BLOCKED`).

