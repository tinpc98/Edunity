# Edunity — Thiết kế Database MongoDB

Nguồn: tài liệu đặc tả dự án (Chương 1–16), chuyển đổi từ thiết kế quan hệ ở Chương 10 sang mô hình document của MongoDB. Tài liệu gốc dùng PostgreSQL; bản thiết kế này giữ nguyên toàn bộ entity, business rule (BR-01..BR-46) và use case, chỉ thay đổi cách tổ chức dữ liệu cho phù hợp MongoDB.

## 1. Nguyên tắc thiết kế

### 1.1. Embedding vs Referencing

| Trường hợp | Quyết định | Lý do |
|---|---|---|
| `User` ↔ `StudentProfile`/`TeacherProfile`/`SponsorProfile` | **Embed** vào `users` | Quan hệ 1–0..1, luôn được đọc cùng nhau, kích thước nhỏ, không tăng trưởng không giới hạn |
| `Class` ↔ `Schedule` | **Embed** mảng `schedule[]` trong `classes` | 1–N nhưng bị chặn nhỏ (vài buổi/tuần), luôn đọc cùng Class |
| `ScholarshipCampaign` ↔ phạm vi Category/Subject/Course | **Embed** mảng id trong `scholarshipCampaigns.scope` | Nhỏ, chỉ đọc, không cần query ngược thường xuyên |
| `Category`→`Subject`→`Course`→`Class`→`Session` | **Reference** (collection riêng) | Mỗi tầng có vòng đời, kích thước và tần suất ghi khác nhau; Class/Session có thể rất nhiều |
| `Enrollment`, `Payment`, `Transaction`, `ScholarshipUsage` | **Reference**, collection riêng, không embed vào Class/Student | Ghi đồng thời cao, cần audit độc lập, cần index/transaction riêng, không được xóa vật lý (BR-34) |
| `SessionAttendance` | **Reference** riêng (không embed vào Session) | Số lượng có thể lớn (bằng capacity), ghi đồng thời khi nhiều Student join/leave cùng lúc → tránh document contention |

Nguyên tắc chung: **embed khi dữ liệu con nhỏ, bị chặn kích thước, cùng vòng đời và luôn đọc kèm cha; reference khi dữ liệu độc lập, tăng trưởng không giới hạn, cần ghi đồng thời cao, hoặc là dữ liệu tài chính cần audit**.

### 1.2. Denormalization (snapshot fields)

MongoDB không có JOIN hiệu quả như SQL, nên các trường hay dùng để filter/hiển thị danh sách được sao chép (denormalize) sang document con:

- `Course` lưu kèm `subjectName`, `categoryId`, `categoryName` để filter/search không cần lookup.
- `Class` lưu kèm `courseTitle`, `teacherName`, `categoryId`, `subjectId`, `gradeLevel`.
- `Session`, `Enrollment` lưu kèm `classId` + tên liên quan để hiển thị "My Learning"/"Teaching Schedule" mà không cần join.
- `Enrollment` lưu **snapshot `tuitionAmount`** tại thời điểm đăng ký (không đọc lại `Class.price`) — vì `BR-33` cho phép Class đã bắt đầu bị giới hạn thay đổi, nhưng giá đã chốt tại thời điểm Enrollment không được đổi theo giá Class về sau.

Các trường denormalize chỉ đọc, được ghi lại (backfill) khi bản ghi gốc thay đổi tên (category/subject đổi tên — hiếm khi xảy ra, chấp nhận cập nhật bất đồng bộ bằng application logic).

### 1.3. Kiểu dữ liệu tiền tệ

Tất cả field tiền (`amount`, `price`, `grossAmount`, `netAmount`, `remainingAmount`, `allocatedAmount`...) dùng **`Decimal128`**, không dùng `Number`/`Double`, để tránh sai số làm phép trừ/tổng không khớp — quan trọng với BR-13/BR-41 (tổng Payment + ScholarshipUsage phải khớp chính xác học phí).

### 1.4. Transaction & Concurrency

MongoDB (replica set) hỗ trợ **multi-document ACID transaction**. Các luồng sau **bắt buộc** chạy trong transaction (`session.startTransaction()`):

1. **Tạo Enrollment PAID** — kiểm tra capacity (tính cả `PENDING_PAYMENT` chưa hết hạn) + tạo `enrollment` (PENDING_PAYMENT) + `$inc classes.enrolledCount` có điều kiện `enrolledCount < capacity` (atomic, tránh race condition khi nhiều Student đăng ký cùng lúc).
2. **Xác nhận Payment** (webhook) — update `payments.status = COMPLETED` + cộng `enrollments.amountPaidViaPayment` + kiểm tra tổng đủ học phí → `enrollments.status = CONFIRMED` + tạo `transactions` + tạo `teacherEarnings`. Idempotent theo `payments.gatewayReference` (unique index).
3. **Sử dụng Scholarship (toàn bộ hoặc MIXED)** — trừ `scholarships.remainingAmount`, trừ `scholarshipCampaigns.allocatedAmount`/`availableFund` (có điều kiện đủ số dư, atomic), tạo `scholarshipUsages`, cập nhật `enrollments.amountPaidViaScholarship`, nếu đủ → `CONFIRMED` + `transactions` + `teacherEarnings`.
4. **Background job hết hạn giữ chỗ** (chạy mỗi 1 phút — mục 11.6 tài liệu gốc) — quét `enrollments` có `status=PENDING_PAYMENT` và `holdExpiresAt <= now`, chuyển `EXPIRED`, `$inc classes.enrolledCount: -1`, và nếu có `scholarshipUsages` ở trạng thái `PENDING` (tạm giữ) gắn với Enrollment đó thì hoàn lại `scholarships.remainingAmount` / `campaign.allocatedAmount` rồi đặt `scholarshipUsages.status = RELEASED`.

> Không dùng TTL index để **xóa** Enrollment hết hạn — tài liệu yêu cầu chuyển trạng thái (`EXPIRED`/`CANCELLED`), không xóa (BR-34 áp dụng tinh thần tương tự cho toàn bộ dữ liệu tài chính/enrollment).

### 1.5. Validation

Mỗi collection có `$jsonSchema` validator ở tầng MongoDB (chặn dữ liệu sai cấu trúc) **và** validate nghiệp vụ ở tầng application (vì MongoDB schema validator không tính toán được cross-field phức tạp như BR-13). Ví dụ bắt buộc ở DB validator: enum hợp lệ, field bắt buộc, kiểu dữ liệu.

---

## 2. Danh sách Collections

### 2.1. `users`
Tương ứng `User` + `StudentProfile`/`TeacherProfile`/`SponsorProfile` (Chương 10.1–10.4).

```jsonc
{
  _id: ObjectId,
  email: String,            // unique, lowercase
  passwordHash: String,
  role: "STUDENT" | "TEACHER" | "SPONSOR" | "ADMIN",
  status: "ACTIVE" | "PENDING" | "SUSPENDED" | "BANNED",

  studentProfile: {          // chỉ có khi role = STUDENT
    fullName: String,
    dateOfBirth: Date,
    avatarUrl: String,
    bio: String
  },
  teacherProfile: {           // chỉ có khi role = TEACHER
    fullName: String,
    biography: String,
    verificationStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED", // BR-01
    qualificationSummary: String,
    ratingAverage: Number,     // denormalized từ reviews
    ratingCount: Number
  },
  sponsorProfile: {           // chỉ có khi role = SPONSOR
    sponsorType: "INDIVIDUAL" | "ORGANIZATION",
    organizationName: String,
    representativeName: String,
    description: String
  },

  createdAt: Date,
  updatedAt: Date
}
```
**Index**: `{ email: 1 }` unique · `{ role: 1, status: 1 }` · `{ "teacherProfile.verificationStatus": 1 }` (Admin duyệt Teacher).

### 2.2. `categories`
```jsonc
{ _id, name, slug, description, status, createdAt, updatedAt }
```
**Index**: `{ slug: 1 }` unique.

### 2.3. `subjects`
```jsonc
{ _id, categoryId: ObjectId /* ref categories */, categoryName /* denorm */, name, slug, description, status }
```
**Index**: `{ categoryId: 1 }`.

### 2.4. `courses`
Chương 10.7. `gradeLevel` là thuộc tính, không phải entity (BR-42..BR-46).
```jsonc
{
  _id,
  subjectId, subjectName,          // denorm
  categoryId, categoryName,        // denorm — phục vụ filter Category→Subject→Course
  title, slug, description,
  learningObjectives: String, syllabus: String,
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED",   // khác với gradeLevel (BR-42 lưu ý)
  gradeLevel: "PRE_PRIMARY" | "GRADE_1".."GRADE_12" | "UNIVERSITY" | "COLLEGE" | null, // BR-43
  prerequisites: String,
  status: "ACTIVE" | "INACTIVE",
  createdAt, updatedAt
}
```
**Index**: `{ subjectId: 1 }` · `{ categoryId: 1, gradeLevel: 1, status: 1 }` (FR-STU-29 filter theo Grade Level) · text index `{ title: "text", description: "text" }` (FR-STU-06 Search Course).

### 2.5. `courseProposals`
Không có bảng riêng trong Chương 10 gốc nhưng UC-TEA-06 mô tả vòng đời độc lập với `Course` (PENDING_REVIEW → APPROVED/REJECTED); tách collection để không làm bẩn catalog chính thức.
```jsonc
{
  _id, teacherId, categoryId, subjectId,
  title, description, learningObjectives, syllabus, level, gradeLevel, prerequisites, estimatedDuration,
  status: "PENDING_REVIEW" | "NEED_CHANGES" | "APPROVED" | "REJECTED",
  reviewNote, reviewedByAdminId, reviewedAt,
  approvedCourseId: ObjectId | null,   // set sau khi Admin approve và tạo Course thật
  createdAt
}
```
**Index**: `{ status: 1, createdAt: 1 }` · `{ teacherId: 1 }`.

### 2.6. `classes`
Chương 10.8 + 10.9 (Schedule embed).
```jsonc
{
  _id,
  courseId, courseTitle,           // denorm
  teacherId, teacherName,          // denorm
  categoryId, subjectId, gradeLevel, // denorm — filter Class theo Course attributes
  className, coverImage,
  classType: "FREE" | "PAID",       // BR-08
  price: Decimal128,                 // BR-09/BR-10: FREE=0, PAID>0
  capacity: Int32,
  enrolledCount: Int32,              // maintained counter (bao gồm CONFIRMED + PENDING_PAYMENT còn hạn)
  enrollmentStart: Date, enrollmentEnd: Date,
  startDate: Date, endDate: Date,
  status: "DRAFT" | "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
  schedule: [ { dayOfWeek: Int32, startTime: String, endTime: String } ], // embed
  ratingAverage: Number, ratingCount: Number, // denorm từ reviews
  createdAt, updatedAt
}
```
**Index**: `{ courseId: 1 }` · `{ teacherId: 1, status: 1 }` (BR-15) · `{ categoryId: 1, subjectId: 1, gradeLevel: 1, classType: 1, status: 1 }` (search/filter) · text index `{ className: "text" }`.

### 2.7. `sessions`
Chương 10.10.
```jsonc
{
  _id, classId, className, teacherId,   // denorm để list "Teaching/Learning Schedule"
  title, startDatetime: Date, endDatetime: Date,
  meetingRoomId: String,   // ID nội bộ Video Provider — KHÔNG lưu Meet/Zoom URL
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
  createdAt
}
```
**Index**: `{ classId: 1, startDatetime: 1 }` · `{ teacherId: 1, startDatetime: 1 }`.

### 2.8. `sessionAttendances`
Chương 10.11.
```jsonc
{ _id, sessionId, classId, studentId, joinedAt, leftAt, attendanceStatus: "PRESENT" | "ABSENT" | "LATE" }
```
**Index**: `{ sessionId: 1, studentId: 1 }` unique.

### 2.9. `enrollments`
Chương 10.12 — collection trung tâm, nhiều business rule nhất (BR-06,07,11,12,13,31,32,38,39,40,41).
```jsonc
{
  _id,
  classId, courseId, teacherId,     // denorm
  studentId,
  enrollmentStatus: "PENDING_PAYMENT" | "CONFIRMED" | "COMPLETED" | "FAILED" | "CANCELLED" | "EXPIRED",
  paymentSource: "FREE" | "DIRECT_PAYMENT" | "SCHOLARSHIP" | "MIXED", // BR-13/41
  tuitionAmount: Decimal128,          // snapshot giá tại thời điểm đăng ký
  amountPaidViaPayment: Decimal128,   // default 0, cộng dồn khi Payment COMPLETED
  amountPaidViaScholarship: Decimal128, // default 0, cộng dồn khi ScholarshipUsage CONFIRMED
  enrolledAt: Date,
  holdExpiresAt: Date | null,        // BR-38/39: created_at + 15 phút, chỉ áp dụng khi PENDING_PAYMENT
  createdAt, updatedAt
}
```
**Index quan trọng**:
- **Partial unique index** (thay thế Postgres partial unique index ở tài liệu gốc, mục 10.12):
  ```js
  db.enrollments.createIndex(
    { studentId: 1, classId: 1 },
    { unique: true, partialFilterExpression: { enrollmentStatus: { $in: ["PENDING_PAYMENT", "CONFIRMED", "COMPLETED"] } } }
  )
  ```
  → BR-31: chỉ chặn Enrollment "còn hiệu lực" trùng lặp; `FAILED/CANCELLED/EXPIRED` không bị chặn.
- `{ enrollmentStatus: 1, holdExpiresAt: 1 }` — cho background job quét hết hạn giữ chỗ (BR-40).
- `{ studentId: 1, enrollmentStatus: 1 }` — "My Learning".
- `{ teacherId: 1, classId: 1 }` — Teacher xem Enrollment của Class mình.

### 2.10. `payments`
Chương 10.13.
```jsonc
{
  _id, enrollmentId, payerUserId,
  gateway: String, gatewayReference: String,  // unique — chống duplicate webhook
  amount: Decimal128,
  paymentStatus: "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED",
  createdAt, paidAt
}
```
**Index**: `{ gatewayReference: 1 }` unique · `{ enrollmentId: 1 }`.

### 2.11. `transactions`
Chương 10.14 — sổ cái tài chính, **append-only** (BR-34: không xóa vật lý khi completed).
```jsonc
{
  _id,
  transactionType: "ENROLLMENT_PAYMENT" | "SCHOLARSHIP_USAGE" | "SPONSOR_CONTRIBUTION" | "TEACHER_PAYOUT" | "REFUND",
  sourceUserId, destinationUserId: ObjectId | null,
  relatedEnrollmentId, relatedPaymentId: ObjectId | null, relatedScholarshipUsageId: ObjectId | null,
  amount: Decimal128,
  status: "PENDING" | "COMPLETED" | "FAILED",
  createdAt
}
```
**Index**: `{ relatedEnrollmentId: 1 }` · `{ sourceUserId: 1, createdAt: -1 }` · `{ destinationUserId: 1, createdAt: -1 }`.
Ràng buộc tầng application: không cung cấp API `DELETE`; nếu cần, chỉ cho phép ghi bản ghi `REFUND` mới (immutable ledger).

### 2.12. `teacherEarnings`
Chương 10.15.
```jsonc
{ _id, teacherId, enrollmentId, classId, grossAmount: Decimal128, commissionAmount: Decimal128, netAmount: Decimal128, status: "PENDING" | "AVAILABLE" | "PAID_OUT", createdAt }
```
Công thức (mục 4.2): `commissionAmount = grossAmount * commissionRate (10%)`, `netAmount = grossAmount - commissionAmount`.
**Index**: `{ teacherId: 1, createdAt: -1 }` · `{ enrollmentId: 1 }` unique (mỗi Enrollment tối đa 1 earning).

### 2.13. `reviews`
Chương 10.16. BR-30: chỉ Student đủ điều kiện (đã CONFIRMED/COMPLETED Enrollment) mới review.
```jsonc
{ _id, enrollmentId, studentId, teacherId, classId, rating: Int32 /* 1..5 */, comment: String, createdAt }
```
**Index**: `{ enrollmentId: 1 }` unique (1 Enrollment chỉ review 1 lần) · `{ classId: 1 }` · `{ teacherId: 1 }`.
Sau khi insert, cập nhật `classes.ratingAverage/ratingCount` và `users.teacherProfile.ratingAverage/ratingCount` (transaction hoặc background aggregation job).

### 2.14. `scholarshipCampaigns`
Chương 10.17.
```jsonc
{
  _id, createdByAdminId,
  title, description, eligibilityCriteria: String,
  scope: { categoryIds: [ObjectId], subjectIds: [ObjectId], courseIds: [ObjectId] }, // embed — phạm vi áp dụng
  targetBudget: Decimal128,
  fundedAmount: Decimal128,      // tổng Sponsor đã góp
  allocatedAmount: Decimal128,   // đã cấp cho Scholarship (BR-37)
  usedAmount: Decimal128,        // đã thực chi qua ScholarshipUsage
  expectedSlots: Int32,
  awardAmountPerStudent: Decimal128,  // BR-36/37: cố định, Student không tự chọn
  fundingStart: Date, fundingEnd: Date,
  applicationStart: Date, applicationEnd: Date,
  status: "DRAFT" | "OPEN_FOR_FUNDING" | "OPEN_FOR_APPLICATION" | "CLOSED",
  createdAt, updatedAt
}
```
`availableFund` (BR-26) được **tính**, không lưu cứng: `fundedAmount - allocatedAmount`; nhưng để tránh tính toán lặp lại và hỗ trợ điều kiện atomic trong transaction, khuyến nghị vẫn lưu `allocatedAmount`/`fundedAmount` và kiểm tra điều kiện `allocatedAmount + awardAmountPerStudent <= fundedAmount` ngay trong lệnh `findOneAndUpdate` (atomic, tránh vượt quỹ khi duyệt đồng thời nhiều hồ sơ).
**Index**: `{ status: 1, applicationStart: 1, applicationEnd: 1 }`.

### 2.15. `sponsorContributions`
Chương 10.18.
```jsonc
{ _id, campaignId, sponsorId, amount: Decimal128, contributionStatus: "PENDING" | "COMPLETED" | "FAILED", paymentReference, contributedAt }
```
**Index**: `{ campaignId: 1 }` · `{ sponsorId: 1, contributedAt: -1 }`.

### 2.16. `scholarshipApplications`
Chương 10.19. BR-29: không được nộp trùng khi hồ sơ cũ còn active.
```jsonc
{
  _id, campaignId, studentId,
  statement: String,
  status: "SUBMITTED" | "NEED_MORE_INFORMATION" | "APPROVED" | "REJECTED",
  submittedAt, reviewedByAdminId, reviewedAt, reviewNote,
}
```
**Index**: partial unique `{ studentId: 1, campaignId: 1 }` với `partialFilterExpression: { status: { $in: ["SUBMITTED", "NEED_MORE_INFORMATION"] } }` (BR-29).

### 2.17. `scholarships`
Chương 10.20. Được tạo khi Application APPROVED, `allocatedAmount = campaign.awardAmountPerStudent` (BR-37, không nhập tay).
```jsonc
{ _id, campaignId, applicationId, studentId, allocatedAmount: Decimal128, remainingAmount: Decimal128, validFrom: Date, expiresAt: Date, status: "ACTIVE" | "EXHAUSTED" | "EXPIRED" | "REVOKED" }
```
**Index**: `{ applicationId: 1 }` unique · `{ studentId: 1, status: 1 }`.

### 2.18. `scholarshipUsages`
Chương 10.21. `status: PENDING` dùng cho giai đoạn tạm giữ trong lúc chờ Student thanh toán phần chênh lệch MIXED trong 15 phút (mục 9.6, Exception Flow UC-STU-08); nếu hết hạn giữ chỗ, job chuyển `RELEASED` và hoàn số dư.
```jsonc
{ _id, scholarshipId, enrollmentId, classId, amount: Decimal128, usedAt, status: "PENDING" | "CONFIRMED" | "RELEASED" }
```
**Index**: `{ enrollmentId: 1 }` · `{ scholarshipId: 1 }`.

### 2.19. `verificationDocuments`
Chương 10.22 — dùng chung cho Teacher verification (identity/qualification) và Scholarship proof (NFR-04/NFR-14: private storage, không lưu public URL).
```jsonc
{ _id, userId, applicationId: ObjectId | null, documentType: "IDENTITY" | "QUALIFICATION" | "SCHOLARSHIP_PROOF", storageKey: String, status: "PENDING" | "APPROVED" | "REJECTED", uploadedAt }
```
**Index**: `{ userId: 1, documentType: 1 }` · `{ applicationId: 1 }`.

### 2.20. `notifications`
Chương 10.23.
```jsonc
{ _id, userId, title, content, type, isRead: Boolean, createdAt }
```
**Index**: `{ userId: 1, isRead: 1, createdAt: -1 }`.

### 2.21. `conversations`
Chương 10.24, denormalize thêm để render Inbox không cần lookup `messages`.
```jsonc
{ _id, classId: ObjectId | null, participantIds: [ObjectId], lastMessagePreview: String, lastMessageAt: Date, createdAt }
```
**Index**: `{ participantIds: 1, lastMessageAt: -1 }`.

### 2.22. `messages`
Chương 10.25.
```jsonc
{ _id, conversationId, senderId, content, createdAt }
```
**Index**: `{ conversationId: 1, createdAt: 1 }`.

### 2.23. `reports`
Chương 10.26 (Complaint management).
```jsonc
{ _id, reporterId, reportedUserId: ObjectId | null, classId: ObjectId | null, type, description, status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED", handledByAdminId: ObjectId | null, createdAt }
```
**Index**: `{ status: 1, createdAt: -1 }`.

### 2.24. `auditLogs`
Không có trong Chương 10 gốc nhưng **bắt buộc** theo BR-35 và NFR-15 ("Approval và financial operation cần audit").
```jsonc
{ _id, actorAdminId, action: String, targetType: String, targetId: ObjectId, beforeState: Object, afterState: Object, createdAt }
```
**Index**: `{ targetType: 1, targetId: 1, createdAt: -1 }` · `{ actorAdminId: 1, createdAt: -1 }`.

---

## 3. Sơ đồ quan hệ (tổng hợp)

```
Category 1—N Subject 1—N Course 1—N Class 1—N Session 1—N SessionAttendance
Teacher(User) 1—N Class
Student(User) N—N Class  (qua Enrollment)
Class 1—N Enrollment
Enrollment 1—0..1 Payment          ┐
Enrollment 1—0..1 ScholarshipUsage ┘  độc lập nhau — khi payment_source = MIXED, có cả 2

Teacher(User) 1—N TeacherEarning
Enrollment 1—0..1 TeacherEarning
Enrollment 1—0..1 Review

Admin(User) 1—N ScholarshipCampaign
Sponsor(User) 1—N SponsorContribution N—1 ScholarshipCampaign
Student(User) 1—N ScholarshipApplication N—1 ScholarshipCampaign
ScholarshipApplication 1—0..1 Scholarship
Scholarship 1—N ScholarshipUsage

User 1—N VerificationDocument
User 1—N Notification
Class 0..1—N Conversation 1—N Message
User 1—N Report (reporter), User 0..1—N Report (reported)
Admin(User) 1—N AuditLog
```

`gradeLevel` vẫn là **thuộc tính** của `courses` (không phải collection riêng) — không thay đổi cardinality của chuỗi Category→Subject→Course→Class→Session, đúng tinh thần BR-42.

---

## 4. Ánh xạ Business Rules → Ràng buộc kỹ thuật MongoDB

| BR | Ràng buộc | Cách hiện thực |
|---|---|---|
| BR-08/09/10 | Class FREE⇔price=0, PAID⇔price>0 | `$jsonSchema` validator trên `classes` + validate ở service layer trước insert/update |
| BR-11 | Không vượt Capacity | `findOneAndUpdate({_id, enrolledCount: {$lt: capacity}}, {$inc:{enrolledCount:1}})` atomic trong transaction tạo Enrollment |
| BR-13/BR-41 | Tổng Payment+ScholarshipUsage = học phí mới CONFIRMED | Service layer kiểm tra `amountPaidViaPayment + amountPaidViaScholarship == tuitionAmount` (Decimal128 so sánh chính xác) trước khi set `CONFIRMED` |
| BR-25/26/37 | Không vượt số dư Scholarship/Campaign | `findOneAndUpdate` với điều kiện `remainingAmount >= amount` / `allocatedAmount + award <= fundedAmount`, atomic |
| BR-29 | Không apply trùng Campaign khi hồ sơ active | Partial unique index trên `scholarshipApplications` |
| BR-31 | Không nhiều Enrollment active cùng lúc | Partial unique index trên `enrollments` |
| BR-34 | Không xóa Transaction đã completed | Không expose API delete; (tùy chọn) MongoDB collection-level restriction bằng role không cấp quyền `remove` trên collection `transactions` cho service account |
| BR-38/39/40 | Giữ chỗ 15 phút, job giải phóng | `holdExpiresAt`, cron/agenda job mỗi 1 phút quét `{enrollmentStatus:"PENDING_PAYMENT", holdExpiresAt:{$lte: now}}` |
| BR-42..46 | gradeLevel enum, phụ thuộc Category | Enum cố định trong `$jsonSchema`; validate quan hệ Category↔gradeLevel ở backend (BR-45), không tin dữ liệu frontend |
| NFR-04/14 | Verification/Scholarship document private | `storageKey` trỏ tới private bucket, API chỉ trả signed URL tạm thời, không lưu public URL trong DB |
| NFR-01/08 | Không hash sai / không lưu raw card | `passwordHash` (bcrypt/argon2), không có field lưu số thẻ trong `payments` — chỉ `gatewayReference` |

---

## 5. Background Jobs cần thiết

1. **Expire pending enrollments** (mỗi 1 phút, mục 11.6): scan + expire + release capacity + release scholarship hold.
2. **Teacher rating aggregation**: sau mỗi `review` mới → cập nhật `classes.ratingAverage`, `users.teacherProfile.ratingAverage` (có thể làm trong transaction ngay lúc insert review vì số lượng update nhỏ, không cần job riêng).
3. **Campaign status transition**: khi `applicationEnd`/`fundingEnd` qua → tự động chuyển `status` Campaign (tùy chọn, có thể để Admin thao tác thủ công qua FR-ADM-14).

---

## 6. Ghi chú triển khai (Mongoose)

- Dùng **Mongoose** với `session` (transaction) cho toàn bộ luồng ở mục 1.4.
- Định nghĩa `$jsonSchema` validator song song với Mongoose schema (defense-in-depth), đặc biệt cho các collection tài chính (`payments`, `transactions`, `enrollments`, `scholarshipUsages`).
- Toàn bộ `_id` dùng `ObjectId` mặc định của MongoDB thay vì UUID thủ công như bản Postgres gốc.
- Timestamps dùng `timestamps: true` của Mongoose (`createdAt`/`updatedAt` tự động) trừ các field thời gian nghiệp vụ riêng (`paidAt`, `enrolledAt`, `usedAt`...).
