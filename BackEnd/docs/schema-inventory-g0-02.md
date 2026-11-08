# BÁO CÁO BÀN GIAO THIẾT KẾ VÀ KIỂM KÊ MONGOOSE SCHEMA (TASK G0-02)
**Dự án:** EDUNITY V3  
**Giai đoạn:** Phase 2 (Implementation / Automated Validation)  
**Phân hệ:** Toàn bộ Mongoose Schemas (Core Data Models)  
**Tác giả:** Senior Backend Engineer  
**Ngày cập nhật:** 07/11/2026  
**File kiểm thử tự động đi kèm:** `BackEnd/tests/schemaInventory.test.js` (16/16 PASS)  

---

## 1. NGUỒN SỰ THẬT & MÔI TRƯỜNG THỰC THI (SOURCE OF TRUTH)

- **Node.js Runtime:** `>= 20.x` (LTS)
- **Web Framework:** `express: ^5.2.1` (`BackEnd/package.json:19`)
- **ODM:** `mongoose: ^9.10.1` (`BackEnd/package.json:24`)
- **Database Driver Override:** `mongodb: 7.5.0` (`BackEnd/package.json:35`)
- **Kiểm thử tự động:** `jest: ^30.5.2`, `mongodb-memory-server: ^11.2.0` (WiredTiger ReplicaSet 7.0.14)
- **Thư mục Models:** `BackEnd/src/models/` (gồm 33 Mongoose models, 1 file constants, 1 file plugins, 1 file index registry)

---

## 2. MA TRẬN 33 MONGOOSE SCHEMAS THEO PHÂN HỆ

### Phân hệ 1: Định danh, Tài khoản & Xác minh (Identity & Auth)
1. **`User` (`User.js`):**
   - *Fields:* `email` (unique), `passwordHash`, `tokenVersion`, `role` (`STUDENT`, `TEACHER`, `SPONSOR`, `ADMIN`), `status` (`ACTIVE`, `PENDING`, `SUSPENDED`, `BANNED`).
   - *Subdocuments:* `studentProfile`, `teacherProfile` (`verificationStatus`: `UNVERIFIED`, `PENDING`, `VERIFIED`, `REJECTED`, `ratingAverage`, `ratingCount`), `sponsorProfile`.
   - *Plugins:* `softDeletePlugin` (`isDeleted`, `deletedAt`, `deletedBy`).
   - *Indexes:* `{ email: 1 }` (UQ), `{ role: 1, status: 1 }`, `{ "teacherProfile.verificationStatus": 1 }`, `{ isDeleted: 1 }`.
2. **`RefreshToken` (`RefreshToken.js`):**
   - *Fields:* `userId`, `tokenHash` (unique), `issuedAt`, `expiresAt`, `revokedAt`, `replacedByTokenId`, `userAgent`, `ip`.
   - *Indexes:* `{ tokenHash: 1 }` (UQ), `{ userId: 1, revokedAt: 1 }`, `{ expiresAt: 1 }` (TTL: `expireAfterSeconds: 0`).
3. **`VerificationDocument` (`VerificationDocument.js`):**
   - *Fields:* `userId`, `applicationId`, `documentType` (`IDENTITY`, `QUALIFICATION`, `SCHOLARSHIP_PROOF`), `files[]` (`side`: `FRONT`, `BACK`, `SINGLE`, `storageKey`), `status` (`PENDING`, `APPROVED`, `REJECTED`), `reviewedBy`, `reviewedAt`, `reviewNote`.
   - *Indexes:* `{ userId: 1, documentType: 1 }`, `{ applicationId: 1 }`, `{ status: 1 }`.

### Phân hệ 2: Danh mục Khóa học & Đề xuất (Academic Catalog & Proposals)
4. **`Category` (`Category.js`):**
   - *Fields:* `name`, `slug` (unique), `description`, `status` (`ACTIVE`, `INACTIVE`).
   - *Plugins:* `adminManagedPlugin` (`createdBy`, `updatedBy`), `softDeletePlugin`.
   - *Indexes:* `{ slug: 1 }` (UQ), `{ isDeleted: 1 }`.
5. **`Subject` (`Subject.js`):**
   - *Fields:* `categoryId`, `categoryName` (denorm), `name`, `slug` (unique), `description`, `status` (`ACTIVE`, `INACTIVE`).
   - *Plugins:* `adminManagedPlugin`, `softDeletePlugin`.
   - *Indexes:* `{ slug: 1 }` (UQ), `{ categoryId: 1 }`, `{ isDeleted: 1 }`.
6. **`Course` (`Course.js`):**
   - *Fields:* `subjectId`, `subjectName`, `categoryId`, `categoryName`, `title`, `slug` (unique), `level` (`BEGINNER`, `INTERMEDIATE`, `ADVANCED`), `gradeLevel` (15 cấp lớp từ `PRE_PRIMARY` đến `COLLEGE`), `status` (`ACTIVE`, `INACTIVE`), `sourceProposalId`.
   - *Plugins:* `adminManagedPlugin`, `softDeletePlugin`.
   - *Indexes:* `{ slug: 1 }` (UQ), `{ subjectId: 1 }`, `{ categoryId: 1, gradeLevel: 1, status: 1 }`, Text `{ title, description }`, `{ isDeleted: 1 }`.
7. **`CourseProposal` (`CourseProposal.js`):**
   - *Fields:* `teacherId`, `categoryId`, `subjectId`, `title`, `level`, `gradeLevel`, `status` (`PENDING_REVIEW`, `NEED_CHANGES`, `APPROVED`, `REJECTED`), `approvedCourseId`.
   - *Plugins:* `reviewablePlugin`.
   - *Indexes:* `{ status: 1, createdAt: 1 }`, `{ teacherId: 1 }`.

### Phân hệ 3: Lớp học & Buổi học Thông minh (Class & Smart Classroom)
8. **`Class` (`Class.js`):**
   - *Fields:* `courseId`, `courseTitle`, `teacherId`, `teacherName`, `classType` (`FREE`, `PAID`), `price` (Decimal128), `capacity`, `enrolledCount`, `status` (`DRAFT`, `PENDING_APPROVAL`, `OPEN`, `REJECTED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`), `schedule[]`, `ratingAverage`, `ratingCount`.
   - *Validation Hook:* `pre('validate')` bắt buộc: `FREE` thì `price = 0`; `PAID` thì `price > 0`.
   - *Plugins:* `reviewablePlugin`, `softDeletePlugin`.
   - *Indexes:* `{ courseId: 1 }`, `{ teacherId: 1, status: 1 }`, `{ categoryId, subjectId, gradeLevel, classType, status }`, Text `{ className }`, `{ isDeleted: 1 }`.
9. **`Session` (`Session.js`):**
   - *Fields:* `classId`, `className`, `teacherId`, `title`, `contents[]` (`title`, `type`, `storageKey`, `order`), `startDatetime`, `endDatetime`, `meetingRoomId`, `status` (`SCHEDULED`, `WAITING`, `IN_PROGRESS`, `INTERRUPTED`, `COMPLETED`, `CANCELLED`), `roomState` (8 states), `lifecycleState` (8 states), `endReason` (7 states), `teacherPresence`, `rescheduleMetadata`, `recording`, `recordingSegments[]`.
   - *Indexes:* `{ classId: 1, startDatetime: 1 }`, `{ teacherId: 1, startDatetime: 1 }`, `{ status: 1, startDatetime: 1, endDatetime: 1 }`.
10. **`SessionAttendance` (`SessionAttendance.js`):**
    - *Fields:* `sessionId`, `classId`, `studentId`, `attendanceStatus` (`PRESENT`, `ABSENT`, `LATE`, `EXCUSED`, `NOT_EVALUATED`), `hasVerifiedConnection`, `attendancePercentage`, `rawOnlineSeconds`, `evaluationStatus` (`PENDING`, `FINALIZED`, `NOT_EVALUATED`, `EXCUSED`).
    - *Indexes:* `{ sessionId: 1, studentId: 1 }` (UQ).
11. **`SessionPresenceInterval` (`SessionPresenceInterval.js`):**
    - *Fields:* `sessionId`, `classId`, `userId`, `role`, `connectionSessionId`, `connectedAt`, `disconnectedAt`, `durationSeconds`, `source`, `processedEventIds[]`.
    - *Indexes:* `{ sessionId: 1, userId: 1, connectedAt: 1 }`, `{ sessionId: 1, userId: 1, connectionSessionId: 1 }` (UQ), `{ processedEventIds: 1 }`.
12. **`SessionRescheduleRequest` (`SessionRescheduleRequest.js`):**
    - *Fields:* `originalSessionId`, `classId`, `teacherId`, `requestedBy`, `incidentReportId`, `status` (`PENDING_ADMIN_APPROVAL`, `APPROVED`, `REJECTED`, `CANCELLED`), `studentConfirmations[]` (`studentId`, `status` [`PENDING`, `ACCEPTED`, `CANNOT_ATTEND`]).
    - *Indexes:* `{ originalSessionId: 1 }` (UQ partial: `status in ["PENDING_ADMIN_APPROVAL", "APPROVED"]`), `{ classId: 1, status: 1 }`.
13. **`SessionRefundReview` (`SessionRefundReview.js`):**
    - *Fields:* `sessionId`, `classId`, `courseId`, `studentId`, `teacherId`, `enrollmentId`, `paymentId`, `triggerReason`, `status` (`NEEDS_FINANCIAL_REVIEW`, `RESCHEDULED_WAIVED`, `APPROVED_FOR_PAYMENT_TEAM`, `REJECTED`), `earningReconciliationStatus`, `paidAmountSnapshot` (Number), `refundAmount` (Number), `reviewedBy`, `reviewedAt`, `reviewNote`.
    - *Indexes:* `{ sessionId: 1, enrollmentId: 1 }` (UQ), `{ status: 1, createdAt: -1 }`.

### Phân hệ 4: Chất lượng Giảng dạy, Sự cố & Kỷ luật (Quality, Incidents & Discipline)
14. **`Review` (`Review.js`):**
    - *Fields:* `enrollmentId` (UQ), `studentId`, `teacherId`, `classId`, `rating` (1..5), `comment`.
    - *Plugins:* `softDeletePlugin`.
    - *Indexes:* `{ enrollmentId: 1 }` (UQ), `{ classId: 1 }`, `{ teacherId: 1 }`, `{ isDeleted: 1 }`.
15. **`TeacherViolation` (`TeacherViolation.js`):**
    - *Fields:* `sessionId`, `classId`, `teacherId`, `violationCategory`, `violationType`, `severity` (`YELLOW`, `RED`, `NO_SHOW`, `EARLY_LEAVE`), `reviewStatus`, `escalationHistory[]`, `appealStatus`.
    - *Indexes:* `{ sessionId: 1, teacherId: 1, violationCategory: 1 }` (UQ), `{ teacherId: 1, reviewStatus: 1, severity: 1 }`.
16. **`TeacherDisciplineCase` (`TeacherDisciplineCase.js`):**
    - *Fields:* `teacherId`, `triggerRule`, `recommendedAction`, `triggerViolationIds[]`, `status`, `autoExecutionBlocked` (true), `policyBlockerNote`.
    - *Indexes:* `{ teacherId: 1, status: 1, triggerRule: 1 }`.
17. **`TeacherIncidentReport` (`TeacherIncidentReport.js`):**
    - *Fields:* `sessionId`, `classId`, `teacherId`, `incidentType`, `description`, `evidenceFiles[]`, `requestedAction`, `reviewStatus`, `decisionHistory[]`, `appeals[]`.
    - *Indexes:* `{ sessionId: 1, teacherId: 1 }`.

### Phân hệ 5: Đăng ký & Tài chính Sổ cái (Enrollment, Payment & Ledger)
18. **`Enrollment` (`Enrollment.js`):**
    - *Fields:* `classId`, `courseId`, `teacherId`, `studentId`, `enrollmentStatus` (`PENDING_PAYMENT`, `CONFIRMED`, `COMPLETED`, `FAILED`, `CANCELLED`, `EXPIRED`), `paymentSource` (`FREE`, `DIRECT_PAYMENT`, `SCHOLARSHIP`, `MIXED`), `tuitionAmount`, `amountPaidViaPayment`, `amountPaidViaScholarship`, `holdExpiresAt` (giữ chỗ 15 phút).
    - *Indexes:* `{ studentId: 1, classId: 1 }` (UQ partial: `enrollmentStatus in ["PENDING_PAYMENT", "CONFIRMED", "COMPLETED"]`), `{ enrollmentStatus: 1, holdExpiresAt: 1 }`, `{ studentId: 1, enrollmentStatus: 1 }`, `{ teacherId: 1, classId: 1 }`.
19. **`Payment` (`Payment.js`):**
    - *Fields:* `enrollmentId`, `payerUserId`, `gateway`, `gatewayReference` (UQ), `amount` (Decimal128), `paymentStatus` (`PENDING`, `COMPLETED`, `FAILED`, `REFUNDED`), `paidAt`.
    - *Indexes:* `{ gatewayReference: 1 }` (UQ), `{ enrollmentId: 1, createdAt: -1 }`.
20. **`Transaction` (`Transaction.js`):**
    - *Fields:* `transactionType` (`ENROLLMENT_PAYMENT`, `SCHOLARSHIP_USAGE`, `SPONSOR_CONTRIBUTION`, `TEACHER_PAYOUT`, `REFUND`), `sourceUserId`, `destinationUserId`, `relatedEnrollmentId`, `relatedPaymentId`, `relatedScholarshipUsageId`, `amount` (Decimal128), `status` (`PENDING`, `COMPLETED`, `FAILED`).
    - *Indexes:* `{ relatedEnrollmentId: 1 }`, `{ sourceUserId: 1, createdAt: -1 }`, `{ destinationUserId: 1, createdAt: -1 }`.
21. **`TeacherEarning` (`TeacherEarning.js`):**
    - *Fields:* `teacherId`, `enrollmentId` (UQ), `classId`, `grossAmount`, `commissionAmount` (10%), `netAmount`, `status` (`PENDING`, `AVAILABLE`, `PAID_OUT`), `payoutId`.
    - *Indexes:* `{ enrollmentId: 1 }` (UQ), `{ teacherId: 1, createdAt: -1 }`, `{ teacherId: 1, status: 1 }`.
22. **`Payout` (`Payout.js`):**
    - *Fields:* `teacherId`, `amount` (Decimal128), `status` (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `REJECTED`), `payoutMethod` (`BANK_TRANSFER`), `bankAccountSnapshot`.
    - *Indexes:* `{ teacherId: 1, status: 1 }`, `{ status: 1, requestedAt: 1 }`.

### Phân hệ 6: Tài trợ & Học bổng (Sponsor & Scholarship)
23. **`ScholarshipCampaign` (`ScholarshipCampaign.js`):**
    - *Fields:* `createdBy`, `title`, `scope` (`categoryIds`, `subjectIds`, `courseIds`), `targetBudget`, `fundedAmount`, `allocatedAmount`, `usedAmount`, `expectedSlots`, `awardAmountPerStudent`, `fundingStart`, `fundingEnd`, `applicationStart`, `applicationEnd`, `status` (`DRAFT`, `OPEN_FOR_FUNDING`, `CLOSED`).
    - *Plugins:* `softDeletePlugin`.
    - *Indexes:* `{ status: 1, applicationStart: 1, applicationEnd: 1 }`, `{ isDeleted: 1 }`.
24. **`SponsorContribution` (`SponsorContribution.js`):**
    - *Fields:* `campaignId`, `sponsorId`, `amount` (Decimal128), `contributionStatus` (`PENDING`, `COMPLETED`, `FAILED`), `paymentReference`.
    - *Indexes:* `{ campaignId: 1 }`, `{ sponsorId: 1, contributedAt: -1 }`, `{ paymentReference: 1 }` (UQ, sparse).
25. **`ScholarshipApplication` (`ScholarshipApplication.js`):**
    - *Fields:* `campaignId`, `studentId`, `statement`, `status` (`SUBMITTED`, `NEED_MORE_INFORMATION`, `APPROVED`, `REJECTED`), `submittedAt`.
    - *Plugins:* `reviewablePlugin`.
    - *Indexes:* `{ studentId: 1, campaignId: 1 }` (UQ partial: `status in ["SUBMITTED", "NEED_MORE_INFORMATION"]`).
26. **`Scholarship` (`Scholarship.js`):**
    - *Fields:* `campaignId`, `applicationId` (UQ), `studentId`, `allocatedAmount`, `remainingAmount`, `status` (`ACTIVE`, `EXHAUSTED`, `EXPIRED`, `REVOKED`).
    - *Indexes:* `{ applicationId: 1 }` (UQ), `{ studentId: 1, status: 1 }`.
27. **`ScholarshipUsage` (`ScholarshipUsage.js`):**
    - *Fields:* `scholarshipId`, `enrollmentId`, `classId`, `amount` (Decimal128), `status` (`PENDING`, `CONFIRMED`, `RELEASED`).
    - *Indexes:* `{ enrollmentId: 1 }`, `{ scholarshipId: 1 }`.

### Phân hệ 7: Vận hành, Giao tiếp & Hệ thống (Operations & Platform)
28. **`Conversation` (`Conversation.js`):** `{ classId, participantIds[], lastMessagePreview, lastMessageAt }`. Index: `{ participantIds: 1, lastMessageAt: -1 }`.
29. **`Message` (`Message.js`):** `{ conversationId, senderId, content }`. Plugin: `softDeletePlugin`. Index: `{ conversationId: 1, createdAt: 1 }`, `{ isDeleted: 1 }`.
30. **`Notification` (`Notification.js`):** `{ userId, title, content, type, sessionId, dedupeKey, deliveryStatus, isRead }`. Index: `{ userId: 1, isRead: 1, createdAt: -1 }`, `{ userId: 1, dedupeKey: 1 }` (UQ partial).
31. **`Report` (`Report.js`):** `{ reporterId, reportedUserId, classId, type, description, status }`. Plugin: `reviewablePlugin`. Index: `{ status: 1, createdAt: -1 }`.
32. **`AuditLog` (`AuditLog.js`):** `{ actorAdminId, action, targetType, targetId, beforeState, afterState }`. Index: `{ targetType: 1, targetId: 1, createdAt: -1 }`, `{ actorAdminId: 1, createdAt: -1 }`.
33. **`JobLock` (`JobLock.js`):** `{ name, owner, lockedUntil }`. Index: `{ name: 1 }` (UQ).

---

## 3. SƠ ĐỒ THỰC THỂ QUAN HỆ (MERMAID ERD)

```mermaid
erDiagram
    User ||--o{ RefreshToken : "tokens"
    User ||--o{ VerificationDocument : "documents"
    User ||--o{ CourseProposal : "proposals"
    User ||--o{ Class : "teaches"
    User ||--o{ Enrollment : "enrolls"
    User ||--o{ Payment : "payments"
    User ||--o{ TeacherEarning : "earnings"
    User ||--o{ Payout : "payouts"
    User ||--o{ Review : "reviews"
    User ||--o{ SponsorContribution : "contributions"
    User ||--o{ ScholarshipApplication : "scholarship_apps"
    User ||--o{ Notification : "notifications"

    Category ||--o{ Subject : "has"
    Subject ||--o{ Course : "has"
    CourseProposal ||--o| Course : "promoted_to"
    Course ||--o{ Class : "instances"

    Class ||--o{ Session : "sessions"
    Class ||--o{ Enrollment : "students"
    Class ||--o{ Review : "ratings"

    Session ||--o{ SessionAttendance : "attendance"
    Session ||--o{ SessionPresenceInterval : "intervals"
    Session ||--o{ SessionRescheduleRequest : "reschedules"
    Session ||--o{ SessionRefundReview : "refund_reviews"
    Session ||--o{ TeacherViolation : "violations"

    Enrollment ||--o{ Payment : "payment_attempts"
    Enrollment ||--o| TeacherEarning : "earning"
    Enrollment ||--o| Review : "review"
    Enrollment ||--o{ ScholarshipUsage : "usages"

    TeacherEarning }o--o| Payout : "payout"

    ScholarshipCampaign ||--o{ SponsorContribution : "funds"
    ScholarshipCampaign ||--o{ ScholarshipApplication : "applications"
    ScholarshipApplication ||--o| Scholarship : "grant"
    Scholarship ||--o{ ScholarshipUsage : "spends"

    Conversation ||--o{ Message : "messages"
```

---

## 4. QUY TẮC ÁNH XẠ KỸ THUẬT (MAPPING RULES)

### 4.1. Mapping `BEGINNER` vs `BASIC`
- **Mongoose Schema Enums:**
  - `constants.js:19`: `COURSE_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"]`
  - `Course.js:18`: `level: { type: String, enum: COURSE_LEVELS }`
  - `CourseProposal.js:16`: `level: { type: String, enum: COURSE_LEVELS }`
- **Quy tắc Ingress Normalization:**
  - `BASIC` / `basic` / `Basic` → chuẩn hóa thành **`BEGINNER`** trước khi validate Mongoose.
  - Tuyệt đối không lưu giá trị `BASIC` vào MongoDB vì sẽ ném lỗi `ValidatorError`.
  - Giá trị canonical xuất ra API/Frontend: `BEGINNER` (hiển thị UI: "Cơ bản").

### 4.2. Mapping `Review cũ` vs `Session`
- **Thực tế Schema `Review.js`:**
  - `Review` là thực thể đánh giá **cấp Lớp học (`Class`)**, gắn với `enrollmentId` duy nhất.
  - **Không có trường `sessionId`**.
- **Quan hệ với `Session`:**
  - `Session` đóng vai trò **Cổng kiểm soát điều kiện (Gatekeeper Check)** tại `reviewService.js:47`: Phải có ít nhất 1 Session `COMPLETED` thì học viên mới được quyền tạo Review cho lớp.
- **Phân biệt với `SessionRefundReview.js`:**
  - `SessionRefundReview` là quy trình **Admin duyệt hoàn tiền buổi học sự cố**, không phải review chấm điểm của học sinh.
- **Khuyến nghị V3:**
  - Giữ nguyên `Review.js` cho đánh giá khóa học/giáo viên.
  - Nếu V3 cần tính năng học sinh đánh giá phản hồi từng buổi học (per-session feedback), phải tạo Collection mới `SessionFeedback` để không phá vỡ unique index `{ enrollmentId: 1 }` và công thức rating của `Class`.

---

## 5. PHÁT HIỆN BẤT CẬP & ĐỀ XUẤT CẢI TIẾN (FINDINGS & RECOMMENDATIONS)

| STT | Vị trí phát hiện | Hiện trạng | Rủi ro | Đề xuất xử lý |
| :---: | :--- | :--- | :--- | :--- |
| **1** | `SessionRefundReview.js:44, 52` | Dùng `Number` cho `paidAmountSnapshot` và `refundAmount` | Sai số dấu phẩy động JavaScript khi tính toán tiền tệ hoàn phí | Chuẩn hóa sang `Schema.Types.Decimal128` đồng nhất với `Payment`/`Enrollment` |
| **2** | `Transaction.js:25-28` | Chưa có Partial Unique Index `{ relatedPaymentId: 1, transactionType: 1 }` | Nguy cơ race condition ở tầng database nếu bypass application logic | Chạy script dọn bản ghi trùng lặp và apply index lên Production |
| **3** | Phân hệ Payment (PAY-04) | Giao dịch `late-SUCCESS` sau `FAILED` mới chỉ log `console.warn` | Mất dấu vết đối soát khi log hệ thống bị trôi | Triển khai model `PaymentReviewQueue` đã được phê duyệt trong handover |
| **4** | `constants.js:1-17` | `GRADE_LEVELS` gồm đúng **15 cấp lớp** (từ `PRE_PRIMARY` đến `COLLEGE`) | Một số tài liệu nhầm lẫn là 16 cấp | Đồng bộ tài liệu V3 theo danh sách 15 cấp chuẩn trong code |

---

## 6. KẾT QUẢ KIỂM THỬ TỰ ĐỘNG (TEST EVIDENCE)

Suite kiểm thử tự động `BackEnd/tests/schemaInventory.test.js` đã được thực thi trên môi trường `MongoMemoryReplSet`:

```text
PASS tests/schemaInventory.test.js
  TASK G0-02: Mongoose Schema Inventory & Validation
    1. Registry, Exports and Constants Verification
      √ G0-02.1.1: Models/index.js exports all 33 expected Mongoose models (71 ms)
      √ G0-02.1.2: constants.js exports GRADE_LEVELS (15 levels) and COURSE_LEVELS (3 levels) (40 ms)
      √ G0-02.1.3: plugins.js exports all 3 common archetype plugins (40 ms)
    2. Mapping BEGINNER vs BASIC (Course & CourseProposal)
      √ G0-02.2.1: Course.level rejects 'BASIC' with ValidationError and accepts 'BEGINNER' (44 ms)
      √ G0-02.2.2: CourseProposal.level rejects 'BASIC' and accepts canonical 'BEGINNER' (34 ms)
      √ G0-02.2.3: Canonical Ingress Normalization Helper maps 'BASIC' -> 'BEGINNER' (34 ms)
    3. Mapping Review cũ vs Session
      √ G0-02.3.1: Review schema is Class-level (has classId, enrollmentId, NO sessionId) (32 ms)
      √ G0-02.3.2: Review has unique index on enrollmentId (1 review per enrollment) (67 ms)
      √ G0-02.3.3: reviewService.createReview enforces Session completed prerequisite (Gatekeeper check) (161 ms)
      √ G0-02.3.4: SessionRefundReview is an Admin incident refund review, NOT a student review (59 ms)
    4. Soft-delete Archetype vs Hard-Lifecycle Entities
      √ G0-02.4.1: Soft-deletable models contain isDeleted, deletedAt, deletedBy and index (36 ms)
      √ G0-02.4.2: Financial and Session lifecycle models do NOT use softDeletePlugin (33 ms)
    5. Core Unique and Partial Filter Indexes on MongoDB
      √ G0-02.5.1: Enrollment partial unique index enforces single active enrollment per student/class (58 ms)
      √ G0-02.5.2: Payment.gatewayReference enforces uniqueness for gateway idempotency (45 ms)
      √ G0-02.5.3: SessionAttendance enforces unique attendance per session per student (41 ms)
    6. Class Price Business Rule Validation Hook
      √ G0-02.6.1: Class price hook enforces FREE price = 0 and PAID price > 0 (50 ms)

Test Suites: 1 passed, 1 total
Tests:       16 passed, 16 total
Snapshots:   0 total
Time:        4.771 s
```
- **Tổng số test:** 16
- **Passed:** 16 (100% xanh)
- **Failed:** 0
- **Skipped:** 0

