# 03. CONCURRENCY & SECURITY AUDIT — BẰNG CHỨNG KỸ THUẬT PHASE 0 → 6

Tài liệu này tổng hợp toàn bộ cơ chế kiểm soát đồng thời (Concurrency/Isolation), ràng buộc toàn vẹn database (Partial Unique Indexes) và phòng thủ bảo mật (RBAC, Anti-Coercion, Redaction, Prompt Injection, Fail-Closed Gates) đã được triển khai và kiểm chứng trên **`MongoMemoryReplSet 7.0.14`**.

---

## 1. Kiểm soát Đồng thời, Transaction & Compare-And-Swap (CAS)

> **Quy tắc bất biến MongoDB Node Driver v7:** Mọi thao tác trong một `ClientSession` transaction (`withTransaction`) đều thực hiện tuần tự (`await` từng query), tuyệt đối không dùng `Promise.all` trên cùng một `dbSession`.

| Phân hệ | Rủi ro Race / Write-Skew đã phát hiện | Cơ chế khắc phục & Bằng chứng |
|---|---|---|
| **`G0-08` Jobs & Lifecycle** | Cron chạy chồng nhiều node; 1 record lỗi chặn toàn bộ batch `expireEnrollmentsJob`; `completeFinishedClasses` mất đồng bộ giữa `Class` ↔ `Enrollment` ↔ `TeacherEarning` | [`jobLock.js`](file:///c:/CODE/Edunity/BackEnd/src/jobs/jobLock.js) bổ sung `extend()` & heartbeat `.unref()`; [`expireEnrollmentsJob.js`](file:///c:/CODE/Edunity/BackEnd/src/jobs/expireEnrollmentsJob.js) sort FIFO & cô lập từng record; [`classLifecycleService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/classLifecycleService.js) chạy tuần tự trong `withTransaction`, `notify()` sau commit (`phase0ReplSet.test.js`). |
| **`CUR-02` / `CUR-05` / `CUR-07`** | Trùng `versionNumber`, publish 2 bản `PUBLISHED` song song, thiếu `.session(session)` khi sửa unit, migration syllabus chạy trùng | [`syllabusService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/syllabusService.js) gắn `.session(session)` đầy đủ + partial unique index; [`migrateSyllabusVersions.js`](file:///c:/CODE/Edunity/BackEnd/scripts/migrateSyllabusVersions.js) dùng `jobLock.runExclusive`; [`coursePricingPolicyService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/coursePricingPolicyService.js) & [`courseProposalService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/courseProposalService.js) tạo version/Course+Syllabus v1 trong `withTransaction` (`phase1ReplSet.test.js`). |
| **`CUR-10` / `CUR-11` Lớp & Lịch** | Admin `approveClass` bỏ qua cổng kiểm tra; 2 yêu cầu tạo/dời lịch cùng giáo viên đan xen hoặc double-approve `reviewRescheduleRequest` | Tách [`teacherScheduleLock.js`](file:///c:/CODE/Edunity/BackEnd/src/utils/teacherScheduleLock.js) (`$inc: { lockSeq: 1 }`), [`sessionIncidentService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/sessionIncidentService.js) `reviewRescheduleRequest` + `deleteSession` dùng tx lock + CAS (`PENDING_ADMIN_APPROVAL`), `assertNoScheduleConflict` chạy tuần tự kèm `dbSession`; kiểm chứng `[200, 409]` và `lockSeq` rollback sạch tại `phase2ReplSet.test.js` & `cur11ScheduleCollisionReplSet.test.js`. |
| **`AID-01` / `AID-04` / `TEA-16`** | Hai request `resubmit` vs `reject` hoặc `approveApplication` / `adminUpdateContractReviewPacketStatus` ghi đè nhau; race tạo 2 packet mở cùng `teacherId` | [`scholarshipService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/scholarshipService.js), [`paperDossierService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/paperDossierService.js), [`incidentContractCoordinationService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/incidentContractCoordinationService.js) bọc `withTransaction` + `findOneAndUpdate` CAS + re-check trong tx + partial unique `TeacherContractReviewPacket` (`[201, 409]`, 1 `AuditLog`) (`phase3ReplSet.test.js`). |
| **`LMS-01/03/05/07/08` Core LMS** | **Write-skew** giữa `deleteAssignment` và `submitAssignment` dưới Snapshot Isolation; hồi sinh `LearningResource` khi update/delete song song; race `regradeSubmission`; race `Question`/`Attempt`; 2 `PlacementResult` `GENERATED` | Atomic write-lock trên `Assignment` (`__v`), `LearningResource`, `Assessment`, `Attempt` trong `withTransaction`; CAS `Grade.findOneAndUpdate({ _id, revisionNumber })` (`409 REGRADE_CONFLICT`); partial unique `{ studentId, subjectId, gradeLevel }` (`status: "GENERATED"`) + retry loop hữu hạn 3 lần bắt `E11000` (`phase4ReplSet.test.js`). |
| **`LMS-10` / `LMS-12` Review & Tiến bộ** | Race `adminDeleteSessionReview` ghi 2 `AuditLog`; lost-update rating trung bình lớp; lost-update khi `updateStudentProgressReview` song song | [`reviewService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/reviewService.js) chạy tx tuần tự + CAS `findOneAndUpdate`; [`studentProgressReviewService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/studentProgressReviewService.js) triển khai **Pinned-Revision CAS** trên `revisionNumber` (`409 PROGRESS_REVIEW_CONFLICT`) (`phase5ReplSet.test.js`). |
| **`LMS-13` / `AI-02` Chat & AI Draft** | `.save()` trên `Conversation` gây `500 VersionError` khi gửi đồng thời; tin nhắn lọt sau khi Admin `LOCK_CHANNEL`/`MUTE`; race duyệt report/gỡ tin nhắn & `approveTeacherAiDraft` vs `reject` | [`messagingService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/messagingService.js) thay `.save()` bằng atomic `Conversation.updateOne` trong `withTransaction`, CAS report `[200, 409]` + 1 audit; [`aiUseCaseService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/aiUseCaseService.js) dùng CAS `DRAFT_PENDING_REVIEW` trong `withTransaction` (`phase6ReplSet.test.js`). |

---

## 2. Ràng buộc Tính Duy Nhất Cấp Database (Partial Unique Indexes)

Tất cả **54 specs** được đối chiếu tự động 1:1 giữa Mongoose schemas và `MongoMemoryReplSet` bởi [`BackEnd/scripts/migrationPreflight.js`](file:///c:/CODE/Edunity/BackEnd/scripts/migrationPreflight.js) (`migrationPreflight.test.js` **12/12 PASS**). Các partial index trọng yếu mới gia cố:
- `syllabusversions`: `{ courseId: 1 }` (`status: "PUBLISHED", isDeleted: false`)
- `scholarshipapplications`: `{ studentId: 1, campaignId: 1 }` (`status in ["DRAFT", "SUBMITTED", "NEED_MORE_INFORMATION", "DOSSIER_VERIFIED", "APPROVED"]`) — bổ sung `APPROVED` ở Phase 3
- `paperdossierreceipts`: `{ trackingKey: 1 }` & `{ applicationId: 1 }` trên active statuses
- `learningresources`: `{ "legacySessionContent.sessionId": 1, "legacySessionContent.contentItemId": 1 }` (`isDeleted: false`)
- `placementresults`: `{ studentId: 1, subjectId: 1, gradeLevel: 1 }` (`status: "GENERATED"`) — bổ sung ở Phase 4
- `sessionreviews`: `{ sessionId: 1, studentId: 1 }` (`isDeleted: false`) — chuyển sang partial unique ở Phase 5
- `studentprogressreviews`: `{ classId: 1, studentId: 1, periodType: 1 }` (`MID_TERM`/`END_OF_CLASS`) & `{ classId: 1, studentId: 1, sessionId: 1 }`
- `teachercontractreviewpackets`: `{ teacherId: 1 }` trên active statuses (`DRAFT`..`ON_HOLD`) — bổ sung ở Phase 3
- `messagemoderationreports`: `{ messageId: 1, reporterId: 1 }` (`status in ["OPEN", "IN_REVIEW"]`)

---

## 3. Phòng thủ Bảo mật, Anti-Coercion, Redaction & Fail-Closed

1. **Chặn JavaScript Type Coercion & Hostile Express 5 Queries (`400 VALIDATION_ERROR`):**
   - Triệt tiêu các bẫy ép kiểu JS thường gặp: `Number(true) === 1`, `Number("") === 0`, `Number([5]) === 5`, `Boolean("false") === true`, `String({ $ne: null })`.
   - Áp dụng nhất quán qua helper kiểm tra `typeof === "boolean"` / `typeof === "number" && Number.isFinite` / `typeof === "string"` / `!Array.isArray` trên `CUR-07`, `TEA-07`, `AID-01`, `AID-04`, `SPO-07`, `TEA-16`, `LMS-01/03/05/07/08/10/12/13/14`, và `AI-01..04`.
   - Ngăn tham số query lặp kiểu mảng (`?status=OPEN&status=RESOLVED`) hoặc NoSQL operator object (`{ $ne: null }`) khi gọi service trực tiếp.
2. **Data Redaction & RBAC / IDOR Protection:**
   - Ẩn tuyệt đối ID nhân viên (`reviewedBy`, `actorId`, `receivedBy`, `reconciledBy`, `verifiedBy`, `gradedBy`, `createdBy`) với public/Student/Teacher trong `LearningPath`, `CourseProposal`, `ScholarshipApplication`, `PaperDossierReceipt`, `Grade`, `Attempt`, `StudentProgressReview`, `MessageModerationReport`.
   - Ẩn raw `storageKey` với `STUDENT` ở cả `LearningResource` (`LMS-03`), `Submission` (`LMS-05`), và `AI-01` recommendations (chỉ cấp qua `downloadUrl` / endpoint `signed-url` đã verify enrollment).
   - Ẩn `correctOptionIds`, `acceptedAnswers`, `explanation` với học viên đang làm bài/xem bài khi chưa chấm xong (`LMS-08`).
3. **Quản trị AI An toàn (`AI-01..04`) & Bảo toàn Quota:**
   - Lọc & từ chối **Prompt Injection** (`detectPromptInjection`) ngay đầu luồng kể cả khi ngữ cảnh trống (`0` learning resource ở `AI-01`).
   - Che/chặn **PII** trước và sau khi gọi provider; kiểm tra **Numeric Grounding** (`502 AI_OUTPUT_UNGROUNDED`) cho báo cáo `AI-03` & `AI-04`.
   - **Bảo toàn Quota:** Kiểm tra `!registeredAiAdapter` (`503 AI_PROVIDER_BLOCKED` & `AI-01` `DETERMINISTIC_FALLBACK`) **trước** `assertAiRateAndBudget`, bảo đảm người dùng không bị cạn hạn mức do nhà cung cấp đang khóa.
4. **Cổng Fail-Closed & An toàn Tương đối SHA-256 (`QA-07`):**
   - Giữ cứng `503 CONTRACT_DEPENDENCY_BLOCKED` (`TEA-12`), `503 CONSENT_DEPENDENCY_BLOCKED` (`AID-08`), `503 AI_PROVIDER_BLOCKED` (`DEP-INFRA-01`).
   - [`backupRestoreClone.js`](file:///c:/CODE/Edunity/BackEnd/scripts/backupRestoreClone.js) kiểm tra checksum SHA-256 từng file EJSON và cấu trúc index trước khi drop DB trong quá trình restore/clone (`BACKUP_CHECKSUM_MISMATCH`).

