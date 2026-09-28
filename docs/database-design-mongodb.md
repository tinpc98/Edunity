# Edunity — Thiết kế Database MongoDB

Nguồn: tài liệu đặc tả dự án (Chương 1–16), chuyển đổi từ thiết kế quan hệ ở Chương 10 sang mô hình document của MongoDB. Tài liệu gốc dùng PostgreSQL; bản thiết kế này giữ nguyên toàn bộ entity, business rule (BR-01..BR-46) và use case, chỉ thay đổi cách tổ chức dữ liệu cho phù hợp MongoDB.

> **Cập nhật (đợt 2)**: bổ sung field audit/lifecycle theo các archetype chuẩn hoá (mục 1.6), sửa cardinality Enrollment↔Payment, thêm entity `Payout`, mở rộng `Session` với nội dung buổi học + recording, mở rộng `VerificationDocument` cho upload CCCD 2 mặt.
>
> **Cập nhật (đợt 3 — rà soát lần cuối)**: sửa `scholarshipCampaigns.status` (bỏ state `OPEN_FOR_APPLICATION` không có transition nào dùng tới), thêm idempotency key cho `sponsorContributions` (cùng rủi ro duplicate webhook như `payments`), thêm entity `refreshTokens` để hỗ trợ logout từng thiết bị và Admin force-logout khi suspend/ban tài khoản.

## 1. Nguyên tắc thiết kế

### 1.1. Embedding vs Referencing

| Trường hợp | Quyết định | Lý do |
|---|---|---|
| `User` ↔ `StudentProfile`/`TeacherProfile`/`SponsorProfile` | **Embed** vào `users` | Quan hệ 1–0..1, luôn được đọc cùng nhau, kích thước nhỏ, không tăng trưởng không giới hạn |
| `Class` ↔ `Schedule` | **Embed** mảng `schedule[]` trong `classes` | 1–N nhưng bị chặn nhỏ (vài buổi/tuần), luôn đọc cùng Class |
| `Session` ↔ `Content`, `Session` ↔ `Recording` | **Embed** `contents[]` và `recording` trong `sessions` | Nội dung/bài tập chỉ tồn tại trong phạm vi Session; mỗi Session tối đa 1 recording ở MVP (xem 2.7) |
| `ScholarshipCampaign` ↔ phạm vi Category/Subject/Course | **Embed** mảng id trong `scholarshipCampaigns.scope` | Nhỏ, chỉ đọc, không cần query ngược thường xuyên |
| `Category`→`Subject`→`Course`→`Class`→`Session` | **Reference** (collection riêng) | Mỗi tầng có vòng đời, kích thước và tần suất ghi khác nhau; Class/Session có thể rất nhiều |
| `Enrollment`, `Payment`, `Transaction`, `ScholarshipUsage`, `Payout` | **Reference**, collection riêng, không embed vào Class/Student | Ghi đồng thời cao, cần audit độc lập, cần index/transaction riêng, không được xóa vật lý (BR-34) |
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
2. **Xác nhận Payment** (webhook) — tạo/](update) một document `payments` mới cho mỗi lần thử thanh toán (xem 2.10: Enrollment 1–N Payment), set `paymentStatus = COMPLETED` + cộng `enrollments.amountPaidViaPayment` + kiểm tra tổng đủ học phí → `enrollments.status = CONFIRMED` + tạo `transactions` + tạo `teacherEarnings`. Idempotent theo `payments.gatewayReference` (unique index) — một lần retry tạo một `gatewayReference`/document `payments` mới, các lần FAILED trước đó vẫn được giữ lại làm lịch sử.
3. **Sử dụng Scholarship (toàn bộ hoặc MIXED)** — trừ `scholarships.remainingAmount`, trừ `scholarshipCampaigns.allocatedAmount`/`availableFund` (có điều kiện đủ số dư, atomic), tạo `scholarshipUsages`, cập nhật `enrollments.amountPaidViaScholarship`, nếu đủ → `CONFIRMED` + `transactions` + `teacherEarnings`.
4. **Background job hết hạn giữ chỗ** (chạy mỗi 1 phút — mục 11.6 tài liệu gốc) — quét `enrollments` có `status=PENDING_PAYMENT` và `holdExpiresAt <= now`, chuyển `EXPIRED`, `$inc classes.enrolledCount: -1`, và nếu có `scholarshipUsages` ở trạng thái `PENDING` (tạm giữ) gắn với Enrollment đó thì hoàn lại `scholarships.remainingAmount` / `campaign.allocatedAmount` rồi đặt `scholarshipUsages.status = RELEASED`.
5. **Tạo Payout** — kiểm tra tổng `teacherEarnings` đang `AVAILABLE` của Teacher đủ `amount` yêu cầu, tạo `payouts` (PENDING) và gắn `payoutId` lên từng `teacherEarnings` liên quan (atomic, tránh 1 earning bị gộp vào 2 Payout cùng lúc).

> Không dùng TTL index để **xóa** Enrollment hết hạn — tài liệu yêu cầu chuyển trạng thái (`EXPIRED`/`CANCELLED`), không xóa (BR-34 áp dụng tinh thần tương tự cho toàn bộ dữ liệu tài chính/enrollment).

### 1.5. Validation

Mỗi collection có `$jsonSchema` validator ở tầng MongoDB (chặn dữ liệu sai cấu trúc) **và** validate nghiệp vụ ở tầng application (vì MongoDB schema validator không tính toán được cross-field phức tạp như BR-13). Ví dụ bắt buộc ở DB validator: enum hợp lệ, field bắt buộc, kiểu dữ liệu.

### 1.6. Field Archetypes (audit & lifecycle)

Để nhất quán trên toàn bộ schema, mỗi collection được gắn thêm field theo một hoặc nhiều "archetype" sau (hiện thực bằng Mongoose plugin trong `models/plugins.js`: `softDeletePlugin`, `reviewablePlugin`, `adminManagedPlugin`):

| Archetype | Field | Áp dụng cho |
|---|---|---|
| **BASE** | `createdAt`, `updatedAt` | Tất cả collection (Mongoose `timestamps: true`). Riêng `transactions`, `auditLogs` chỉ có `createdAt` vì là bản ghi ghi-một-lần, không bao giờ update. |
| **SOFT-DELETABLE** | `isDeleted`, `deletedAt`, `deletedBy` | `users`, `categories`, `subjects`, `courses`, `classes`, `reviews`, `scholarshipCampaigns`, `messages` (danh sách nội dung có thể cần ẩn/gỡ nhưng vẫn phải giữ tham chiếu lịch sử) |
| **ADMIN/MANAGED CONTENT** | `createdBy`, `updatedBy` | `categories`, `subjects`, `courses` (Admin tạo trực tiếp, không suy ra được actor từ field khác). `classes` chỉ cần `updatedBy` vì `teacherId` đã là creator; `courseProposals`/`scholarshipApplications`/`reports`/`messages` không cần `createdBy` riêng vì đã có `teacherId`/`studentId`/`reporterId`/`senderId` đóng vai trò đó |
| **REVIEWABLE** | `status`, `reviewedBy`, `reviewedAt`, `reviewNote` | `courseProposals`, `classes` (khi `status = PENDING_APPROVAL`), `scholarshipApplications`, `verificationDocuments`, `reports`, `users.teacherProfile` (Teacher verification) |
| **TIME-BOUND** | `expiresAt` / `holdExpiresAt` + timestamp nghiệp vụ | `enrollments.holdExpiresAt`, `scholarships.expiresAt`, `sessions.startDatetime/endDatetime`, `payments.paidAt`, `payouts.requestedAt/processedAt` |
| **FINANCIAL / HISTORY** | không soft-delete; chỉ `status` + timestamp | `payments`, `transactions`, `teacherEarnings`, `sponsorContributions`, `scholarshipUsages`, `payouts` |

Lưu ý: `status` **không thay thế** `isDeleted`. Ví dụ `classes.status = CANCELLED` là trạng thái nghiệp vụ (lớp đã huỷ nhưng vẫn hiển thị trong lịch sử), còn `isDeleted = true` là bị gỡ khỏi hệ thống bởi Admin/Teacher — hai khái niệm độc lập.

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
    reviewedBy: ObjectId | null,   // REVIEWABLE — Admin xử lý verify (FR-ADM-02)
    reviewedAt: Date | null,
    reviewNote: String | null,
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

  isDeleted: Boolean, deletedAt: Date | null, deletedBy: ObjectId | null, // SOFT-DELETABLE
  createdAt: Date,
  updatedAt: Date
}
```
**Index**: `{ email: 1 }` unique · `{ role: 1, status: 1 }` · `{ "teacherProfile.verificationStatus": 1 }` (Admin duyệt Teacher) · `{ isDeleted: 1 }`.

### 2.2. `categories`
```jsonc
{ _id, name, slug, description, status, createdBy, updatedBy, isDeleted, deletedAt, deletedBy, createdAt, updatedAt }
```
**Index**: `{ slug: 1 }` unique · `{ isDeleted: 1 }`.

### 2.3. `subjects`
```jsonc
{ _id, categoryId /* ref categories */, categoryName /* denorm */, name, slug, description, status, createdBy, updatedBy, isDeleted, deletedAt, deletedBy }
```
**Index**: `{ categoryId: 1 }` · `{ isDeleted: 1 }`.

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
  sourceProposalId: ObjectId | null,  // nếu Course được tạo từ một CourseProposal đã APPROVED
  createdBy, updatedBy,               // ADMIN/MANAGED CONTENT
  isDeleted, deletedAt, deletedBy,     // SOFT-DELETABLE
  createdAt, updatedAt
}
```
**Index**: `{ subjectId: 1 }` · `{ categoryId: 1, gradeLevel: 1, status: 1 }` (FR-STU-29 filter theo Grade Level) · text index `{ title: "text", description: "text" }` (FR-STU-06 Search Course) · `{ isDeleted: 1 }`.

### 2.5. `courseProposals`
Không có bảng riêng trong Chương 10 gốc nhưng UC-TEA-06 mô tả vòng đời độc lập với `Course` (PENDING_REVIEW → APPROVED/REJECTED); tách collection để không làm bẩn catalog chính thức. `teacherId` đóng vai trò `createdBy` nên không cần field riêng.
```jsonc
{
  _id, teacherId, categoryId, subjectId,
  title, description, learningObjectives, syllabus, level, gradeLevel, prerequisites, estimatedDuration,
  status: "PENDING_REVIEW" | "NEED_CHANGES" | "APPROVED" | "REJECTED",
  reviewedBy, reviewedAt, reviewNote,   // REVIEWABLE
  approvedCourseId: ObjectId | null,   // set sau khi Admin approve và tạo Course thật
  createdAt, updatedAt
}
```
**Index**: `{ status: 1, createdAt: 1 }` · `{ teacherId: 1 }`.

### 2.6. `classes`
Chương 10.8 + 10.9 (Schedule embed). `teacherId` đóng vai trò `createdBy`.
```jsonc
{
  _id,
  courseId, courseTitle,           // denorm
  teacherId, teacherName,          // denorm — cũng là createdBy
  categoryId, subjectId, gradeLevel, // denorm — filter Class theo Course attributes
  className, coverImage,
  classType: "FREE" | "PAID",       // BR-08
  price: Decimal128,                 // BR-09/BR-10: FREE=0, PAID>0
  capacity: Int32,
  enrolledCount: Int32,              // maintained counter (bao gồm CONFIRMED + PENDING_PAYMENT còn hạn)
  enrollmentStart: Date, enrollmentEnd: Date,
  startDate: Date, endDate: Date,
  status: "DRAFT" | "PENDING_APPROVAL" | "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
  updatedBy: ObjectId | null,        // Teacher/Admin sửa gần nhất
  reviewedBy, reviewedAt, reviewNote, // REVIEWABLE — Admin duyệt Class ở PENDING_APPROVAL
  schedule: [ { dayOfWeek: Int32, startTime: String, endTime: String } ], // embed
  ratingAverage: Number, ratingCount: Number, // denorm từ reviews
  isDeleted, deletedAt, deletedBy,     // SOFT-DELETABLE
  createdAt, updatedAt
}
```
**Index**: `{ courseId: 1 }` · `{ teacherId: 1, status: 1 }` (BR-15) · `{ categoryId: 1, subjectId: 1, gradeLevel: 1, classType: 1, status: 1 }` (search/filter) · text index `{ className: "text" }` · `{ isDeleted: 1 }`.

### 2.7. `sessions`
Chương 10.10, mở rộng để hỗ trợ Session Detail (nội dung/tài liệu/bài tập) và xem lại Recording.
```jsonc
{
  _id, classId, className, teacherId,   // denorm để list "Teaching/Learning Schedule"
  title,
  description: String,                  // mô tả/tổng quan buổi học

  contents: [                           // embed — chỉ tồn tại trong phạm vi Session
    {
      _id: ObjectId,
      title: String,
      type: "LESSON" | "MATERIAL" | "ASSIGNMENT",
      description: String,
      storageKey: String | null,        // private storage key của file đính kèm, KHÔNG lưu public URL
      order: Int32
    }
  ],

  startDatetime: Date, endDatetime: Date,

  // Live Room: Session → meetingRoomId → Video Provider → Embedded Classroom
  meetingRoomId: String,   // ID nội bộ Video Provider — KHÔNG lưu Meet/Zoom URL
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED",

  // Recording: Session → recording → Playback (độc lập, không dùng chung id với meetingRoomId)
  recording: {                          // embed, 0..1 — xem quyết định thiết kế bên dưới
    providerRecordingId: String | null,
    storageKey: String | null,          // private, cấp qua signed URL có thời hạn sau khi kiểm tra Enrollment
    status: "PROCESSING" | "AVAILABLE" | "FAILED",
    durationSeconds: Number | null,
    availableAt: Date | null,
    failureReason: String | null
  } | null,

  createdAt, updatedAt
}
```

**Quyết định thiết kế — Recording: embed hay collection riêng?**
Chọn **embed** cho MVP vì (1) tài liệu đặc tả xác nhận mỗi Session tối đa 1 recording, (2) recording luôn được đọc kèm Session Detail, không có use case nào truy vấn recording độc lập. Nên tách sang collection `sessionRecordings` riêng nếu về sau Video Provider trả nhiều file/nhiều chất lượng cho một Session, hoặc recording cần vòng đời quản lý độc lập (xoá để tiết kiệm storage, webhook cập nhật trạng thái tần suất cao) — quyết định này nên được xác nhận lại sau khi chọn Video SDK cụ thể.

**Quyền truy cập Recording** (tầng API, không phải schema): `Student → chọn Class → chọn Session → BE kiểm tra Enrollment hợp lệ với Class chứa Session → kiểm tra recording.status = AVAILABLE → cấp signed URL playback có thời hạn`. Không trả `storageKey` thô cho frontend.

**Index**: `{ classId: 1, startDatetime: 1 }` · `{ teacherId: 1, startDatetime: 1 }`.

### 2.8. `sessionAttendances`
Chương 10.11.
```jsonc
{ _id, sessionId, classId, studentId, joinedAt, leftAt, attendanceStatus: "PRESENT" | "ABSENT" | "LATE", createdAt, updatedAt }
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
  amountPaidViaPayment: Decimal128,   // default 0, cộng dồn từ các payments COMPLETED (1 Enrollment có thể có nhiều Payment — xem 2.10)
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
Chương 10.13. **Enrollment 1 — N Payment** (đã sửa từ 1–0..1): một Enrollment có thể có nhiều Payment vì Student có thể thanh toán thất bại rồi thử lại nhiều lần trước khi có một Payment `COMPLETED`. Không đặt unique trên `enrollmentId`.
```jsonc
{
  _id, enrollmentId, payerUserId,
  gateway: String, gatewayReference: String,  // unique — chống duplicate webhook, mỗi lần thử là 1 reference riêng
  amount: Decimal128,
  paymentStatus: "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED",
  createdAt, updatedAt, paidAt
}
```
**Index**: `{ gatewayReference: 1 }` unique · `{ enrollmentId: 1, createdAt: -1 }` (lịch sử các lần thử thanh toán).

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
{
  _id, teacherId, enrollmentId, classId,
  grossAmount: Decimal128, commissionAmount: Decimal128, netAmount: Decimal128,
  status: "PENDING" | "AVAILABLE" | "PAID_OUT",
  payoutId: ObjectId | null,   // set khi earning được gộp vào một Payout (status -> PAID_OUT)
  createdAt, updatedAt
}
```
Công thức (mục 4.2): `commissionAmount = grossAmount * commissionRate (10%)`, `netAmount = grossAmount - commissionAmount`.
**Index**: `{ teacherId: 1, createdAt: -1 }` · `{ teacherId: 1, status: 1 }` (tìm earning `AVAILABLE` để gộp Payout) · `{ enrollmentId: 1 }` unique (mỗi Enrollment tối đa 1 earning).

### 2.13. `payouts`
**Mới** — Teacher yêu cầu rút tiền, gộp nhiều `teacherEarnings` đang `AVAILABLE`. Financial/History entity: không soft-delete.
```jsonc
{
  _id, teacherId,
  amount: Decimal128,
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "REJECTED",
  payoutMethod: "BANK_TRANSFER",
  bankAccountSnapshot: { bankName: String, accountNumber: String, accountHolderName: String }, // snapshot tại thời điểm yêu cầu
  requestedAt: Date,
  processedAt: Date | null,
  processedBy: ObjectId | null,   // Admin xử lý thủ công
  failureReason: String | null,   // khi FAILED
  reviewNote: String | null,      // khi Admin reject/ghi chú
  createdAt, updatedAt
}
```
Nguồn sự thật cho việc "earning nào thuộc Payout nào" là `teacherEarnings.payoutId` (one-way reference) — `payouts` không lưu mảng `earningIds` để tránh hai nơi cùng giữ quan hệ và có thể lệch nhau; khi cần liệt kê, query `teacherEarnings.find({ payoutId })`.
**Index**: `{ teacherId: 1, status: 1 }` · `{ status: 1, requestedAt: 1 }` (hàng đợi xử lý cho Admin).

### 2.14. `reviews`
Chương 10.16. BR-30: chỉ Student đủ điều kiện (đã CONFIRMED/COMPLETED Enrollment) mới review.
```jsonc
{ _id, enrollmentId, studentId, teacherId, classId, rating: Int32 /* 1..5 */, comment: String, isDeleted, deletedAt, deletedBy, createdAt, updatedAt }
```
**Index**: `{ enrollmentId: 1 }` unique (1 Enrollment chỉ review 1 lần) · `{ classId: 1 }` · `{ teacherId: 1 }` · `{ isDeleted: 1 }`.
Sau khi insert, cập nhật `classes.ratingAverage/ratingCount` và `users.teacherProfile.ratingAverage/ratingCount` (transaction hoặc background aggregation job). `isDeleted` cho phép Admin gỡ review vi phạm mà không mất dữ liệu gốc.

### 2.15. `scholarshipCampaigns`
Chương 10.17.
```jsonc
{
  _id, createdBy, updatedBy,   // ADMIN/MANAGED CONTENT (BR-16: chỉ Admin tạo)
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
  status: "DRAFT" | "OPEN_FOR_FUNDING" | "CLOSED",
  isDeleted, deletedAt, deletedBy,  // SOFT-DELETABLE — ẩn Campaign nháp/lỗi, vẫn giữ lịch sử tài trợ
  createdAt, updatedAt
}
```
`availableFund` (BR-26) được **tính**, không lưu cứng: `fundedAmount - allocatedAmount`; nhưng để tránh tính toán lặp lại và hỗ trợ điều kiện atomic trong transaction, khuyến nghị vẫn lưu `allocatedAmount`/`fundedAmount` và kiểm tra điều kiện `allocatedAmount + awardAmountPerStudent <= fundedAmount` ngay trong lệnh `findOneAndUpdate` (atomic, tránh vượt quỹ khi duyệt đồng thời nhiều hồ sơ).

> **Sửa lỗi thiết kế**: bỏ state `OPEN_FOR_APPLICATION` (không có FR/UC nào transition vào state này — UC-ADM-03 chỉ có "Publish → status = OPEN_FOR_FUNDING" và FR-ADM-14 "Close Campaign"). `OPEN_FOR_FUNDING` là trạng thái "đã publish" duy nhất, bao trùm cả giai đoạn nhận tài trợ lẫn giai đoạn nhận hồ sơ; việc đang ở giai đoạn nào được suy ra bằng cách so sánh thời gian hiện tại với `fundingStart/fundingEnd` và `applicationStart/applicationEnd` tương ứng (BR-17, BR-19), không phải bằng một status riêng.

**Index**: `{ status: 1, applicationStart: 1, applicationEnd: 1 }` · `{ isDeleted: 1 }`.

### 2.16. `sponsorContributions`
Chương 10.18. Cũng đi qua Payment Gateway (mục 9.10: Contribution → Payment → Confirmation) nên có cùng rủi ro duplicate webhook như `payments` — cần idempotency key tương tự.
```jsonc
{ _id, campaignId, sponsorId, amount: Decimal128, contributionStatus: "PENDING" | "COMPLETED" | "FAILED", paymentReference: String | null, contributedAt, createdAt, updatedAt }
```
**Index**: `{ campaignId: 1 }` · `{ sponsorId: 1, contributedAt: -1 }` · `{ paymentReference: 1 }` unique + sparse (chống duplicate webhook; sparse vì contribution `PENDING` có thể chưa có reference).

### 2.17. `scholarshipApplications`
Chương 10.19. BR-29: không được nộp trùng khi hồ sơ cũ còn active. `studentId` đóng vai trò `createdBy`.
```jsonc
{
  _id, campaignId, studentId,
  statement: String,
  status: "SUBMITTED" | "NEED_MORE_INFORMATION" | "APPROVED" | "REJECTED",
  submittedAt,
  reviewedBy, reviewedAt, reviewNote,   // REVIEWABLE
  createdAt, updatedAt
}
```
**Index**: partial unique `{ studentId: 1, campaignId: 1 }` với `partialFilterExpression: { status: { $in: ["SUBMITTED", "NEED_MORE_INFORMATION"] } }` (BR-29).

### 2.18. `scholarships`
Chương 10.20. Được tạo khi Application APPROVED, `allocatedAmount = campaign.awardAmountPerStudent` (BR-37, không nhập tay).
```jsonc
{ _id, campaignId, applicationId, studentId, allocatedAmount: Decimal128, remainingAmount: Decimal128, validFrom: Date, expiresAt: Date, status: "ACTIVE" | "EXHAUSTED" | "EXPIRED" | "REVOKED", createdAt, updatedAt }
```
**Index**: `{ applicationId: 1 }` unique · `{ studentId: 1, status: 1 }`.

### 2.19. `scholarshipUsages`
Chương 10.21. `status: PENDING` dùng cho giai đoạn tạm giữ trong lúc chờ Student thanh toán phần chênh lệch MIXED trong 15 phút (mục 9.6, Exception Flow UC-STU-08); nếu hết hạn giữ chỗ, job chuyển `RELEASED` và hoàn số dư.
```jsonc
{ _id, scholarshipId, enrollmentId, classId, amount: Decimal128, usedAt, status: "PENDING" | "CONFIRMED" | "RELEASED", createdAt, updatedAt }
```
**Index**: `{ enrollmentId: 1 }` · `{ scholarshipId: 1 }`.

### 2.20. `verificationDocuments`
Chương 10.22 — dùng chung cho Teacher verification (identity/qualification) và Scholarship proof (NFR-04/NFR-14: private storage, không lưu public URL).
```jsonc
{
  _id, userId, applicationId: ObjectId | null,
  documentType: "IDENTITY" | "QUALIFICATION" | "SCHOLARSHIP_PROOF",
  files: [                          // thay cho 1 storageKey duy nhất — tối ưu cho CCCD cần 2 mặt
    { side: "FRONT" | "BACK" | "SINGLE", storageKey: String, mimeType: String }
  ],
  status: "PENDING" | "APPROVED" | "REJECTED",
  reviewedBy, reviewedAt, reviewNote,  // REVIEWABLE
  uploadedAt, createdAt, updatedAt
}
```
`documentType = IDENTITY` (CCCD) thường có 2 phần tử trong `files` (`FRONT` + `BACK`); các loại khác thường chỉ có 1 phần tử (`SINGLE`) hoặc nhiều trang nếu cần.
**Index**: `{ userId: 1, documentType: 1 }` · `{ applicationId: 1 }` · `{ status: 1 }`.

### 2.21. `notifications`
Chương 10.23.
```jsonc
{ _id, userId, title, content, type, isRead: Boolean, readAt: Date | null, createdAt, updatedAt }
```
**Index**: `{ userId: 1, isRead: 1, createdAt: -1 }`.

### 2.22. `conversations`
Chương 10.24, denormalize thêm để render Inbox không cần lookup `messages`.
```jsonc
{ _id, classId: ObjectId | null, participantIds: [ObjectId], lastMessagePreview: String, lastMessageAt: Date, createdAt }
```
**Index**: `{ participantIds: 1, lastMessageAt: -1 }`.

### 2.23. `messages`
Chương 10.25. `senderId` đóng vai trò `createdBy`.
```jsonc
{ _id, conversationId, senderId, content, isDeleted, deletedAt, deletedBy, createdAt, updatedAt }
```
`deletedBy` gần như luôn trùng `senderId` (Student/Teacher thu hồi tin nhắn của chính mình) nên không bắt buộc set tường minh.
**Index**: `{ conversationId: 1, createdAt: 1 }`.

### 2.24. `reports`
Chương 10.26 (Complaint management). `reporterId` đóng vai trò `createdBy`.
```jsonc
{
  _id, reporterId, reportedUserId: ObjectId | null, classId: ObjectId | null,
  type, description,   // nội dung khiếu nại do reporter cung cấp
  status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED",
  reviewedBy, reviewedAt, reviewNote,  // REVIEWABLE — thay cho handledByAdminId, chuẩn hoá tên field
  createdAt, updatedAt
}
```
**Index**: `{ status: 1, createdAt: -1 }`.

### 2.25. `auditLogs`
Không có trong Chương 10 gốc nhưng **bắt buộc** theo BR-35 và NFR-15 ("Approval và financial operation cần audit").
```jsonc
{ _id, actorAdminId, action: String, targetType: String, targetId: ObjectId, beforeState: Object, afterState: Object, createdAt }
```
**Index**: `{ targetType: 1, targetId: 1, createdAt: -1 }` · `{ actorAdminId: 1, createdAt: -1 }`.

### 2.26. `refreshTokens`
**Mới** — Chương 11.5 dùng "JWT Access Token + Refresh Token" nhưng Chương 10 gốc không có bảng nào lưu phiên đăng nhập, nên không có cách revoke một refresh token cụ thể (logout 1 thiết bị) hay buộc logout ngay khi Admin suspend/ban tài khoản (access token cũ vẫn dùng được tới khi hết hạn). Thêm collection này để Auth Module kiểm tra trước khi cấp access token mới từ refresh token.
```jsonc
{
  _id, userId,
  tokenHash: String,           // hash của refresh token, không lưu token thô
  issuedAt: Date, expiresAt: Date,
  revokedAt: Date | null,      // set khi logout hoặc Admin suspend/ban User
  replacedByTokenId: ObjectId | null, // refresh token rotation
  userAgent: String, ip: String,      // audit thiết bị đăng nhập
  createdAt, updatedAt
}
```
**Index**: `{ tokenHash: 1 }` unique · `{ userId: 1, revokedAt: 1 }` (liệt kê/thu hồi toàn bộ phiên của 1 User khi suspend/ban) · TTL index trên `expiresAt` (`expireAfterSeconds: 0`) để tự xoá sau khi hết hạn — đây là **ngoại lệ hợp lý** cho nguyên tắc "không dùng TTL để xoá" ở mục 1.4, vì refresh token hết hạn không phải dữ liệu tài chính/lịch sử cần giữ lại.

---

## 3. Sơ đồ quan hệ (tổng hợp)

```
Category 1—N Subject 1—N Course 1—N Class 1—N Session 1—N SessionAttendance
Session 1—N SessionContent (embedded)
Session 1—0..1 Recording (embedded, xem 2.7 để biết khi nào cần tách collection riêng)
Teacher(User) 1—N Class
Student(User) N—N Class  (qua Enrollment)
Class 1—N Enrollment
Enrollment 1—N Payment              ┐  độc lập nhau — khi payment_source = MIXED, cùng lúc có Payment (đã CONFIRMED)
Enrollment 1—0..1 ScholarshipUsage  ┘  và ScholarshipUsage cho cùng Enrollment

Teacher(User) 1—N TeacherEarning
Teacher(User) 1—N Payout
TeacherEarning N—0..1 Payout  (qua teacherEarnings.payoutId)
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
| BR-08/09/10 | Class FREE⇔price=0, PAID⇔price>0 | `$jsonSchema` validator + Mongoose `pre("validate")` trên `classes` |
| BR-11 | Không vượt Capacity | `findOneAndUpdate({_id, enrolledCount: {$lt: capacity}}, {$inc:{enrolledCount:1}})` atomic trong transaction tạo Enrollment |
| BR-13/BR-41 | Tổng Payment (COMPLETED) + ScholarshipUsage = học phí mới CONFIRMED | Service layer kiểm tra `amountPaidViaPayment + amountPaidViaScholarship == tuitionAmount` (Decimal128 so sánh chính xác) trước khi set `CONFIRMED`; nhiều `payments` FAILED trước đó không tính vào tổng |
| BR-25/26/37 | Không vượt số dư Scholarship/Campaign | `findOneAndUpdate` với điều kiện `remainingAmount >= amount` / `allocatedAmount + award <= fundedAmount`, atomic |
| BR-29 | Không apply trùng Campaign khi hồ sơ active | Partial unique index trên `scholarshipApplications` |
| BR-31 | Không nhiều Enrollment active cùng lúc | Partial unique index trên `enrollments` |
| BR-34 | Không xóa Transaction đã completed | Không expose API delete; (tùy chọn) MongoDB collection-level restriction bằng role không cấp quyền `remove` trên collection `transactions` cho service account |
| BR-38/39/40 | Giữ chỗ 15 phút, job giải phóng | `holdExpiresAt`, cron/agenda job mỗi 1 phút quét `{enrollmentStatus:"PENDING_PAYMENT", holdExpiresAt:{$lte: now}}` |
| BR-42..46 | gradeLevel enum, phụ thuộc Category | Enum cố định trong `$jsonSchema`; validate quan hệ Category↔gradeLevel ở backend (BR-45), không tin dữ liệu frontend |
| NFR-04/14 | Verification/Scholarship document private | `files[].storageKey` trỏ tới private bucket, API chỉ trả signed URL tạm thời, không lưu public URL trong DB |
| NFR-01/08 | Không hash sai / không lưu raw card | `passwordHash` (bcrypt/argon2), không có field lưu số thẻ trong `payments` — chỉ `gatewayReference` |
| — (mới) | Recording chỉ xem được khi có Enrollment hợp lệ | API kiểm tra `enrollments` (CONFIRMED/COMPLETED) trước khi cấp signed URL từ `sessions.recording.storageKey` |
| — (mới) | Payout không được gộp trùng một `teacherEarning` | `teacherEarnings.payoutId` chỉ set 1 lần trong transaction tạo Payout, điều kiện `payoutId: null` khi `findOneAndUpdate` |

---

## 5. Background Jobs cần thiết

1. **Expire pending enrollments** (mỗi 1 phút, mục 11.6): scan + expire + release capacity + release scholarship hold.
2. **Teacher rating aggregation**: sau mỗi `review` mới → cập nhật `classes.ratingAverage`, `users.teacherProfile.ratingAverage` (có thể làm trong transaction ngay lúc insert review vì số lượng update nhỏ, không cần job riêng).
3. **Campaign status transition**: khi `applicationEnd`/`fundingEnd` qua → tự động chuyển `status` Campaign (tùy chọn, có thể để Admin thao tác thủ công qua FR-ADM-14).
4. **Recording ingestion webhook/poll**: khi Video Provider báo recording đã xử lý xong → cập nhật `sessions.recording.status = AVAILABLE`, `storageKey`, `durationSeconds`, `availableAt` (hoặc `FAILED` + `failureReason`).

---

## 6. Ghi chú triển khai (Mongoose)

- Dùng **Mongoose** với `session` (transaction) cho toàn bộ luồng ở mục 1.4.
- Các archetype ở mục 1.6 được hiện thực bằng 3 schema plugin dùng chung trong `BackEnd/src/models/plugins.js`: `softDeletePlugin`, `reviewablePlugin`, `adminManagedPlugin` — áp dụng qua `schema.plugin(...)` thay vì lặp lại field ở từng model.
- Định nghĩa `$jsonSchema` validator song song với Mongoose schema (defense-in-depth), đặc biệt cho các collection tài chính (`payments`, `transactions`, `enrollments`, `scholarshipUsages`, `payouts`).
- Toàn bộ `_id` dùng `ObjectId` mặc định của MongoDB thay vì UUID thủ công như bản Postgres gốc.
- Timestamps dùng `timestamps: true` của Mongoose (`createdAt`/`updatedAt` tự động) trừ `transactions`/`auditLogs` (chỉ `createdAt`, không bao giờ update) và các field thời gian nghiệp vụ riêng (`paidAt`, `enrolledAt`, `usedAt`, `requestedAt`...).
