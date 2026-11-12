# 01. EXECUTIVE SUMMARY — EDUNITY V3 BACKEND ACCEPTANCE (CHÂU)

- **Ngày đánh giá:** `12/11/2026`
- **Branch / Base Commit:** `BE-2` (bắt đầu từ merge commit `46567997548cc4bad62e52364760fa5a4c8cd69a`, base `dev` tại `3687944`)
- **Phạm vi phụ trách (Owner):** **Châu** — Backend Đào tạo, LMS và Database phi tài chính (**34 tasks**, `Phase 0 → Phase 6`)
- **Môi trường kiểm chứng:** Node.js `v24.18.0`, Express `^5.2.1`, Mongoose `^9.10.1`, MongoDB Driver `7.5.0`, Jest `^30.5.2`, `MongoMemoryReplSet` (WiredTiger `7.0.14`)

---

## 1. Kết luận Nghiệm thu (Acceptance Decision)

> **KẾT LUẬN: `CONDITIONAL ACCEPT (PASS PHẠM VI CHÂU — MỞ KHÓA TRIỂN KHAI KHI ĐẤU NỐI DEPENDENCY NGOÀI)`**

- **Toàn bộ 34/34 tasks thuộc phạm vi Châu (`Phase 0 → Phase 6`)** đã được kiểm toán lại trên mã nguồn thực tế, sửa lỗi gốc rễ (transaction, CAS, lock, schema index, fail-closed gate, anti-coercion & query guards, redaction) và chứng minh chạy thật trên **`MongoMemoryReplSet 7.0.14`**.
- **Chỉ số chất lượng toàn hệ thống cải thiện rõ rệt so với baseline `4656799`:**
  - **Cú pháp JS toàn backend + scripts + tests:** **`219/219` file PASS** (`0` lỗi).
  - **Baseline (`4656799`):** `35/39` suites PASS (`4` FAIL: `schemaInventory`, `cur11ScheduleCollisionReplSet`, `platform`, `authorization`), `573/579` tests PASS (`6` FAIL), có cảnh báo `open handles`.
  - **Final TEST 2 (`BE-2` sau Phase 6):** **`44/46` suites PASS**, **`615/618` tests PASS**, `0` open handles, `0` failed tests trong **100% suite chuyên trách của Châu** (bao gồm 7 suite ReplSet mới `phase0ReplSet..phase6ReplSet`, `schemaInventory`, `migrationPreflight`, `cur11ScheduleCollisionReplSet`, `academicContract`, `lms*`, `aid*`, `cur*`, `tea07*`, `stage5*`, `stage6*`, toàn bộ suite `session*`).
- **Lý do `CONDITIONAL` (không nâng khống lên 46/46 hay gỡ blocker):**
  1. **2 suite có 3 assertion fail cũ (`platform.test.js:410` và `authorization.test.js:410,423`)** đều bắt nguồn có chủ đích từ cổng **fail-closed `CUR-10`** (`Course` mẫu trong test cũ thiếu `level`, chưa có `TEA-07`/`CUR-07`/`TEA-12`). Theo ranh giới sở hữu, Châu không tự sửa [`BackEnd/tests/platform.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/platform.test.js) và tuyệt đối không nới lỏng cổng `CUR-10`/`TEA-12`.
  2. **Các dependency ngoài phạm vi Châu** vẫn được giữ nguyên trạng thái **fail-closed** (`TEA-12` của Bảo → `503 CONTRACT_DEPENDENCY_BLOCKED`, `AID-08` của Bảo → `503 CONSENT_DEPENDENCY_BLOCKED`, `AI Provider/DPA` của PO/Infra → `503 AI_PROVIDER_BLOCKED`, `CUR-09 Enrollment` / `AID-06` của Tin, `storageService.js` & `app.js` của Bảo).

---

## 2. Những lỗ hổng trọng yếu đã được phát hiện và vá triệt để

1. **Phase 0 (`G0-*`, `QA-*`):** Bắt `egress_ended` trên HTTP webhook LiveKit; sửa snapshot học phí `SessionRefundReview` đọc sai tên trường; mở rộng `migrationPreflight.js` từ `19` → `50` (nay **`54`** specs trên **57 models**); sửa xung đột `$set`/`$setOnInsert` trong `seedAcademicIdempotent.js`; xây dựng `PlatformSetting` có version/rollback/0-safety; bảo toàn `JobLock.extend()` và tuần tự hóa ReplSet tx `completeFinishedClasses`.
2. **Phase 1 (`CUR-01..07`):** Bổ sung `NOT_DELETED`, đồng bộ `Course.level` xuống lớp `DRAFT`/`REJECTED`, vá thiếu `.session(session)` trong `syllabusService.js` + `JobLock` cho migration syllabus, xây mới hoàn chỉnh `LearningPath` (`CUR-03`, kiểm tra chu trình DAG) và `CoursePricingPolicy` (`CUR-07` theo version & `effectiveFrom`, ưu tiên `COURSE > SUBJECT > CATEGORY > GLOBAL`).
3. **Phase 2 (`TEA-07`, `CUR-09..11`):** Tích hợp `CUR-07` vào `CUR-10`, đóng hoàn toàn lỗ hổng bypass `approveClass` bỏ qua mọi gate, lưu snapshot `CUR-09` bất biến trên `Class` và tạo helper/schema handover cho Tin trên `Enrollment`; triệt tiêu circular require qua `utils/teacherScheduleLock.js` và bọc `reviewRescheduleRequest` + `deleteSession` bằng tx mutex & CAS.
4. **Phase 3 (`AID-01`, `AID-04`, `SPO-07`, `TEA-16`):** Đóng bypass `/approve` cho chiến dịch V3 `AID-01`, thêm `"APPROVED"` vào partial unique index `ScholarshipApplication`, vá `closePaperDossierReceipt` khi chưa link đơn, tách rạch ròi attribution `SPO-07` & `NOT_DELETED`/`RESCHEDULED`, thêm partial unique `TeacherContractReviewPacket` + CAS + `AuditLog` trong tx trước khi chặn `503 CONTRACT_DEPENDENCY_BLOCKED`.
5. **Phase 4 (`LMS-01`, `LMS-03`, `LMS-05`, `LMS-07`, `LMS-08`):** Chứng minh và vá triệt để **write-skew** dưới Snapshot Isolation giữa `deleteAssignment` và `submitAssignment`; che `storageKey` học viên; thêm CAS `regradeSubmission` (`revisionNumber`); khóa nguyên tử `Assessment`/`Attempt` và Fisher-Yates shuffle; thêm partial unique `GENERATED` + bounded retry cho `PlacementResult`.
6. **Phase 5 (`LMS-10`, `LMS-12`, `LMS-14`):** Chuyển `SessionReview` sang partial unique `{ isDeleted: false }` và tuần tự hóa tính lại rating lớp trong tx; triển khai **Pinned-Revision CAS** (`LMS-12`); phân biệt buổi học Smart Classroom chưa finalize điểm danh (`"PENDING"`) vs `endSession` legacy ở `LMS-14`, sửa metric lớp `0` học viên và chặn boolean/array coercion (`Number(true) === 1`).
7. **Phase 6 (`LMS-13`, `AI-01..04`):** Xóa bỏ `.save()` gây `500 VersionError` trên `Conversation` bằng atomic updates + ReplSet `withTransaction` đồng bộ khóa kênh/mute; CAS nguyên tử cho `adminReviewMessageReport`, `adminModerateMessage`, `approveTeacherAiDraft`/`rejectTeacherAiDraft`; sửa lỗi `AI-01` fallback & `503 AI_PROVIDER_BLOCKED` tiêu thụ oan rate/token quota; chạy `detectPromptInjection` ngay cả khi 0 resource.

---

## 3. Bằng chứng tôn trọng ranh giới sở hữu

Kết quả `git diff --name-only HEAD` trên các file ngoài phạm vi (**`BackEnd/src/app.js`**, **`BackEnd/src/services/storageService.js`**, **`authMiddleware.js`**, **`requireRole.js`**, **`paymentService.js`**, **`settlementService.js`**, **`enrollmentService.js`**, **`FrontEnd/*`**, **`.env`**) là **trống 100% (0 byte chỉnh sửa)**. Mọi giao tiếp liên nhóm đều sử dụng hợp đồng bàn giao và cơ chế fail-closed rõ ràng.

