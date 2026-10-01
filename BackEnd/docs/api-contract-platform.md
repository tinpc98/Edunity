# API Contract - Các API bổ sung theo tài liệu đặc tả (Chương 12)

Tài liệu này mô tả các API được bổ sung để khớp với Chương 12 (API Design) của tài liệu đặc tả Edunity.
Các API đã có trước đó (`api-contract-auth.md`, `api-contract-catalog.md`, `api-contract-enrollment.md`,
`api-contract-student.md`, `api-contract-finance.md`) **không thay đổi** đường dẫn và định dạng response.

## 0. Quy ước chung

- Base URL: `http://localhost:3000/api`
- Xác thực: header `Authorization: Bearer <accessToken>` với JWT lấy từ `POST /auth/login` (mục 1).
  Ở môi trường dev/test vẫn dùng được `Bearer dev-<userId>` và header `x-user-id`; production chỉ nhận JWT.
- Response thành công: `{ "success": true, "data": ... }`
- Response lỗi: `{ "success": false, "error": "<MÃ_LỖI>", "message": "...", "details": { ... } }`
- Tiền tệ (Decimal128) trả về dạng chuỗi, ví dụ `"200000"`. Mọi document đều có thêm trường `id`.
- Phân trang: query `page` (mặc định 1), `pageSize` (mặc định 20, tối đa 100; chấp nhận `limit` như alias).
  Response phân trang: `{ items, total, page, pageSize, totalPages }`.
- Sai role → `403 FORBIDDEN`. Dữ liệu không hợp lệ → `400 VALIDATION_ERROR`.

Biến môi trường mới (xem `.env.example`; đều có giá trị mặc định ở dev, riêng `JWT_SECRET` bắt buộc ở production):

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `JWT_SECRET` | (secret dev) | Khóa ký access token. **Bắt buộc ở production** — server không khởi động nếu thiếu |
| `JWT_ACCESS_TTL` | `15m` | Thời hạn access token |
| `SCHOLARSHIP_VALID_DAYS` | `180` | Số ngày hiệu lực của Scholarship kể từ khi được duyệt |
| `REFRESH_TOKEN_TTL_DAYS` | `30` | Thời hạn refresh token |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | (không đặt) | Cấu hình phòng học LiveKit. Thiếu một trong ba → dùng token dev nội bộ |
| `ROOM_TOKEN_SECRET` | (secret dev) | Khóa ký token phòng học khi chưa cấu hình LiveKit |
| `STORAGE_DIR` | `./storage` | Thư mục lưu file (đã thêm vào `.gitignore`) |
| `PUBLIC_BASE_URL` | `http://localhost:<PORT>` | Gốc URL dùng để tạo link file |
| `FILE_URL_SECRET` | (secret dev) | Khóa ký signed URL |
| `FILE_URL_TTL_SECONDS` | `300` | Thời hạn signed URL |
| `PAYMENT_WEBHOOK_SECRET` | (không đặt) | Nếu đặt, `POST /payments/webhook` yêu cầu header `x-webhook-secret` |
| `APP_TZ_OFFSET_MINUTES` | `420` | Múi giờ của `schedule.startTime/endTime` (UTC+7) |

## 1. Authentication

| Method | Endpoint | Actor | Mô tả |
|---|---|---|---|
| POST | `/auth/register` | Public | Đã có. Nay nhận `role` = `STUDENT`, `TEACHER` hoặc `SPONSOR` |
| POST | `/auth/login` | Public | `{ email, password }` → `{ accessToken, expiresIn, refreshToken, user }` |
| POST | `/auth/refresh` | User | Body `{ refreshToken }` → `{ accessToken, expiresIn, refreshToken }` (token cũ bị thu hồi) |
| POST | `/auth/logout` | User | Body `{ refreshToken }` → thu hồi refresh token |
| GET | `/auth/me` | User | Đã có; nay dùng được cả ở production |
| POST | `/auth/dev-login` | Public | Đã có; chỉ còn ở dev/test (production trả 404) |

- `accessToken` là JWT (HS256), mặc định sống 15 phút. Gửi trong header `Authorization: Bearer <accessToken>`.
- Khi API trả `401 TOKEN_EXPIRED`, FE gọi `/auth/refresh` để lấy cặp token mới rồi gọi lại request.
  `401 UNAUTHORIZED` = token sai/không hợp lệ → đăng nhập lại.
- Role luôn đọc từ tài khoản trong DB ở mỗi request. Tài khoản bị `SUSPENDED`/`BANNED` nhận `403 ACCOUNT_BLOCKED` ngay lập tức.
- Refresh token dùng một lần (xoay vòng). Dùng lại token đã xoay → toàn bộ phiên của tài khoản bị thu hồi.
- Đăng ký `TEACHER`: tài khoản ở trạng thái `verificationStatus = UNVERIFIED`, phải gửi hồ sơ xác minh (mục 5).
- Đăng ký `SPONSOR`: nhận thêm `sponsorType` (`INDIVIDUAL` mặc định | `ORGANIZATION`), `organizationName`.
- Lỗi: `401 INVALID_REFRESH_TOKEN`, `403 ACCOUNT_BLOCKED`.

## 2. Catalog: Category → Subject → Course

| Method | Endpoint | Actor | Mô tả |
|---|---|---|---|
| GET | `/categories` | Public | Danh sách Category ACTIVE, kèm `allowedGradeLevels` |
| POST | `/admin/categories` | Admin | `{ name, description?, slug?, status? }` |
| PATCH | `/admin/categories/:id` | Admin | `{ name?, description?, status? }` |
| GET | `/categories/:id/subjects` | Public | Subject ACTIVE thuộc Category |
| GET | `/subjects/:id` | Public | Chi tiết Subject + danh sách `courses` |
| POST | `/admin/subjects` | Admin | `{ categoryId, name, description?, slug? }` |
| PATCH | `/admin/subjects/:id` | Admin | `{ name?, description?, status? }` |
| GET | `/courses` | Public | Query: `search`, `categoryId`, `subjectId`, `gradeLevel`, `level`, `page`, `pageSize` |
| GET | `/courses/:id` | Public | Chi tiết Course + `openClassCount` |
| GET | `/courses/:id/classes` | Public | Các Class đang `OPEN` của Course |
| POST | `/admin/courses` | Admin | `{ subjectId, title, description?, learningObjectives?, syllabus?, level?, gradeLevel?, prerequisites? }` |
| PATCH | `/admin/courses/:id` | Admin | Sửa Course, gồm cả `gradeLevel` và `status` |

**Grade Level (BR-42 → BR-46)**

- `gradeLevel` ∈ `PRE_PRIMARY`, `GRADE_1`…`GRADE_12`, `UNIVERSITY`, `COLLEGE` hoặc `null`.
- `allowedGradeLevels` của Category là danh sách để FE đổ vào select box; `null` nghĩa là Category không gắn với khối học
  (Ngoại ngữ, CNTT, Kỹ năng…) — khi đó `gradeLevel` có thể để `null`.
  - Tiểu học → `GRADE_1`…`GRADE_5`; Trung học cơ sở → `GRADE_6`…`GRADE_9`; Trung học phổ thông → `GRADE_10`…`GRADE_12`.
- Backend luôn validate lại: `400 INVALID_GRADE_LEVEL`, `400 GRADE_LEVEL_CATEGORY_MISMATCH` (kèm `details.allowedGradeLevels`).
- Lỗi khác: `409 DUPLICATE_CATEGORY | DUPLICATE_SUBJECT | DUPLICATE_COURSE | DUPLICATE_SLUG`, `404 CATEGORY_NOT_FOUND | SUBJECT_NOT_FOUND | COURSE_NOT_FOUND`.

### Course Proposal

| Method | Endpoint | Actor | Mô tả |
|---|---|---|---|
| POST | `/teacher/course-proposals` | Teacher | Gửi đề xuất → `PENDING_REVIEW` |
| GET | `/teacher/course-proposals` | Teacher | Đề xuất của tôi (`status?`) |
| PATCH | `/teacher/course-proposals/:id` | Teacher | Sửa và gửi lại khi `PENDING_REVIEW` / `NEED_CHANGES` |
| GET | `/admin/course-proposals` | Admin | `status?` |
| GET | `/admin/course-proposals/:id` | Admin | Chi tiết |
| POST | `/admin/course-proposals/:id/approve` | Admin | `{ gradeLevel?, reviewNote? }` → tạo Course trong catalog |
| POST | `/admin/course-proposals/:id/reject` | Admin | `{ reviewNote? }` |
| POST | `/admin/course-proposals/:id/request-changes` | Admin | `{ reviewNote }` (bắt buộc) → `NEED_CHANGES` |

Body tạo đề xuất:
```json
{
  "categoryId": "66b...", "subjectId": "66c...",
  "title": "Toán 8 nâng cao", "gradeLevel": "GRADE_8",
  "description": "...", "learningObjectives": "...", "syllabus": "...",
  "level": "ADVANCED", "prerequisites": "...", "estimatedDuration": "12 tuần"
}
```
Bắt buộc: `categoryId`, `subjectId`, `title`, `description`. Lỗi: `400 SUBJECT_CATEGORY_MISMATCH`, `403 ACCOUNT_NOT_ACTIVE`,
`409 COURSE_PROPOSAL_NOT_PENDING`, `409 DUPLICATE_COURSE` (khi approve mà Course đã tồn tại).

## 3. Class (Teacher) và duyệt Class (Admin)

Vòng đời: `DRAFT` → `PENDING_APPROVAL` → `OPEN` (approve) hoặc `REJECTED` (reject) → sửa → gửi duyệt lại.

| Method | Endpoint | Actor | Mô tả |
|---|---|---|---|
| GET | `/teacher/classes` | Teacher | Class của tôi (`status?` dạng `DRAFT,REJECTED`) |
| POST | `/teacher/classes` | Teacher (VERIFIED) | Tạo Class ở `DRAFT` |
| GET | `/teacher/classes/:id` | Teacher | Chi tiết Class + `sessions` |
| PATCH | `/teacher/classes/:id` | Teacher | Chỉ khi `DRAFT` / `REJECTED` |
| POST | `/teacher/classes/:id/submit` | Teacher (VERIFIED) | Gửi duyệt → `PENDING_APPROVAL` |
| GET | `/teacher/classes/:id/students` | Teacher | Học viên (`status?`, mặc định `CONFIRMED,COMPLETED`) |
| GET | `/teacher/classes/:id/planned-sessions` | Teacher | Các buổi dự kiến tính từ `startDate`, `endDate`, `schedule` |
| GET | `/admin/classes/pending` | Admin | Class chờ duyệt (kèm `sessionCount`) |
| GET | `/admin/classes/:id` | Admin | Class + `course` + `teacher` + `sessions` để review |
| POST | `/admin/classes/:id/approve` | Admin | `{ reviewNote? }` → `OPEN` |
| POST | `/admin/classes/:id/reject` | Admin | `{ reviewNote? }` → `REJECTED` |

Body tạo/sửa Class:
```json
{
  "courseId": "66d...",
  "className": "Toán 6 - Tối thứ 2",
  "description": "Mô tả riêng của lớp",
  "coverImage": "https://...",
  "classType": "PAID",
  "price": 500000,
  "capacity": 20,
  "enrollmentStart": "2026-10-01T00:00:00.000Z",
  "enrollmentEnd": "2026-10-15T00:00:00.000Z",
  "startDate": "2026-10-16T00:00:00.000Z",
  "endDate": "2026-12-31T00:00:00.000Z",
  "schedule": [{ "dayOfWeek": 1, "startTime": "19:00", "endTime": "21:00" }]
}
```
- Khi tạo chỉ bắt buộc `courseId`, `className`, `classType`, `capacity` (và `price` > 0 nếu `PAID`) để Teacher lưu nháp.
  `courseTitle`, `categoryId`, `subjectId`, `gradeLevel`, `teacherName` do hệ thống tự lấy.
- Khi **submit** phải đủ: `description`, 4 mốc thời gian, `schedule`, ít nhất 1 Session, và mọi Session nằm trong
  `startDate`…`endDate`. Thiếu → `400 CLASS_INCOMPLETE` với `details.missing`, hoặc `400 SESSION_OUT_OF_CLASS_RANGE`.
- Lỗi: `403 TEACHER_NOT_VERIFIED`, `403 ACCOUNT_NOT_ACTIVE`, `403 FORBIDDEN` (không phải chủ lớp),
  `409 CLASS_NOT_EDITABLE`, `409 CLASS_NOT_SUBMITTABLE`, `409 CLASS_NOT_PENDING_APPROVAL`.

## 4. Session và phòng học

| Method | Endpoint | Actor | Mô tả |
|---|---|---|---|
| GET | `/classes/:classId/sessions` | — | Đã có |
| POST | `/teacher/classes/:classId/sessions` | Teacher | Tạo 1 Session, hoặc nhiều Session với `{ "sessions": [...] }` |
| PATCH | `/teacher/sessions/:id` | Teacher | Sửa Session `SCHEDULED`; `{ "status": "CANCELLED" }` để hủy buổi |
| DELETE | `/teacher/sessions/:id` | Teacher | Xóa buổi trong kế hoạch, chỉ khi Class `DRAFT` / `REJECTED` |
| POST | `/sessions/:id/join` | Student / Teacher | Lấy room token |
| POST | `/teacher/sessions/:id/end` | Teacher | Kết thúc buổi → `COMPLETED`, chốt điểm danh |
| GET | `/teacher/sessions/:id/attendance` | Teacher | Danh sách điểm danh |

Body Session: `{ "title": "Buổi 1 - Số tự nhiên", "description": "...", "startDatetime": "...", "endDatetime": "..." }`.

**POST `/sessions/:id/join`** — response:
```json
{
  "success": true,
  "data": {
    "sessionId": "66f...",
    "roomId": "room_66f...",
    "provider": "LIVEKIT",
    "serverUrl": "wss://<project>.livekit.cloud",
    "accessToken": "<token tạm thời>",
    "role": "HOST",
    "expiresAt": "2026-10-16T14:00:00.000Z"
  }
}
```
- Không trả URL Meet/Zoom. `role` = `HOST` (Teacher chủ lớp) hoặc `PARTICIPANT` (Student có Enrollment `CONFIRMED`).
- `provider = "LIVEKIT"`: FE dùng LiveKit SDK (`livekit-client` / `@livekit/components-react`) kết nối bằng
  `room.connect(serverUrl, accessToken)`. HOST có quyền quản trị phòng; cả hai đều bật được mic/camera.
- `provider = "EDUNITY_DEV"` (`serverUrl = null`): backend chưa cấu hình `LIVEKIT_*`, token chỉ dùng để thử luồng join.
- Khi Teacher gọi `/teacher/sessions/:id/end`, phòng LiveKit bị đóng và mọi người bị ngắt kết nối.
- Cửa sổ vào lớp: từ 15 phút trước `startDatetime` đến `endDatetime`. Token hết hạn tại `expiresAt`.
- Teacher join lần đầu → Session chuyển `IN_PROGRESS`. Student join → ghi nhận điểm danh (`PRESENT` / `LATE`).
- Lỗi: `403 NOT_ENROLLED`, `409 SESSION_NOT_JOINABLE`, `409 SESSION_CANCELLED`, `409 SESSION_ENDED`, `404 SESSION_NOT_FOUND`.
- `GET /sessions/:id/join` (Student) vẫn dùng được và trả về cùng dữ liệu như trên — không còn `joinUrl`.

## 5. Xác minh Teacher

| Method | Endpoint | Actor | Mô tả |
|---|---|---|---|
| POST | `/teacher/verification` | Teacher | Gửi hồ sơ → `PENDING` |
| GET | `/teacher/verification` | Teacher | Trạng thái + tài liệu đã gửi |
| GET | `/admin/teacher-verifications` | Admin | `status?` (mặc định `PENDING`) |
| GET | `/admin/teacher-verifications/:teacherId` | Admin | Chi tiết |
| POST | `/admin/teacher-verifications/:teacherId/approve` | Admin | → `VERIFIED` |
| POST | `/admin/teacher-verifications/:teacherId/reject` | Admin | `{ reviewNote }` (bắt buộc) → `REJECTED` |

```json
{
  "qualificationSummary": "Cử nhân Sư phạm Toán",
  "biography": "...",
  "documents": [
    { "documentType": "IDENTITY", "files": [{ "side": "FRONT", "storageKey": "private/id-front.png" }, { "side": "BACK", "storageKey": "private/id-back.png" }] },
    { "documentType": "QUALIFICATION", "files": [{ "storageKey": "private/degree.pdf", "mimeType": "application/pdf" }] }
  ]
}
```
Bắt buộc có cả `IDENTITY` và `QUALIFICATION`. `storageKey` lấy từ `POST /uploads/private` (mục 13) và phải là file
do chính người gửi upload. Response chi tiết hồ sơ trả mỗi file kèm `url` (signed URL) và `urlExpiresAt`.
Lỗi: `409 VERIFICATION_PENDING`, `409 ALREADY_VERIFIED`, `409 VERIFICATION_NOT_PENDING`.

## 6. Payment

| Method | Endpoint | Actor | Mô tả |
|---|---|---|---|
| POST | `/enrollments/:id/payments` | Student | Đã có. Khi Enrollment là `MIXED`, `amount` = phần chênh lệch còn thiếu |
| POST | `/payments/webhook` | Gateway | Webhook chung cho học phí **và** Sponsor Contribution |
| GET | `/payments/:id` | Người trả / Admin | Trạng thái Payment + `enrollmentStatus`, `paymentSource`, `holdExpiresAt` |

Webhook body: `{ "gatewayReference": "SBX-...", "status": "SUCCESS" | "FAILED" }`. Gọi trùng trả `result: "IDEMPOTENT"`.
`POST /payments/sandbox/webhook` cũ vẫn hoạt động cho thanh toán học phí.

## 7. Scholarship Campaign

| Method | Endpoint | Actor | Mô tả |
|---|---|---|---|
| GET | `/campaigns` | Public | Mặc định `OPEN_FOR_FUNDING`; `status=OPEN_FOR_FUNDING,CLOSED` |
| GET | `/campaigns/:id` | Public | Chi tiết (không bao giờ trả Campaign `DRAFT`) |
| GET | `/admin/campaigns` | Admin | Tất cả, gồm `DRAFT` |
| GET | `/admin/campaigns/:id` | Admin | Chi tiết |
| POST | `/admin/campaigns` | Admin | Tạo Campaign `DRAFT` |
| PATCH | `/admin/campaigns/:id` | Admin | Sửa |
| POST | `/admin/campaigns/:id/publish` | Admin | `DRAFT` → `OPEN_FOR_FUNDING` |
| POST | `/admin/campaigns/:id/close` | Admin | `OPEN_FOR_FUNDING` → `CLOSED` |
| GET | `/admin/campaigns/:id/contributions` | Admin | Theo dõi tài trợ |

Sponsor **không có** API tạo Campaign.

```json
{
  "title": "Học bổng Toán THCS",
  "description": "...", "eligibilityCriteria": "...",
  "targetBudget": 10000000, "expectedSlots": 20, "awardAmountPerStudent": 500000,
  "fundingStart": "...", "fundingEnd": "...",
  "applicationStart": "...", "applicationEnd": "...",
  "scope": { "categoryIds": [], "subjectIds": [], "courseIds": ["66d..."] }
}
```
- Ràng buộc: `awardAmountPerStudent × expectedSlots ≤ targetBudget`. Publish yêu cầu đủ 4 mốc thời gian.
- `scope` rỗng = áp dụng cho mọi Paid Class; ngược lại Class hợp lệ nếu khớp **một** trong các danh sách.
- Sau khi publish, không sửa được `targetBudget`, `expectedSlots`, `awardAmountPerStudent`, `scope` → `409 CAMPAIGN_FIELD_LOCKED`.
- Trường tính thêm: `availableFund` (= `fundedAmount − allocatedAmount`), `fundingProgress` (%),
  `isAcceptingFunding`, `isAcceptingApplications`; chi tiết có thêm `scopeDetail`, `awardedScholarshipCount`, `contributionCount`.
- Lỗi: `404 CAMPAIGN_NOT_FOUND`, `409 INVALID_CAMPAIGN_STATUS`, `409 CAMPAIGN_CLOSED`.

## 8. Sponsor Contribution

| Method | Endpoint | Actor | Mô tả |
|---|---|---|---|
| POST | `/campaigns/:id/contributions` | Sponsor | `{ amount }` → tạo khoản tài trợ `PENDING` |
| GET | `/sponsor/contributions` | Sponsor | Lịch sử (`status?`, `campaignId?`) + `totalContributed` |
| GET | `/sponsor/campaigns/:id/impact` | Sponsor | Báo cáo tác động của Campaign mình đã tài trợ |

Luồng thanh toán 2 bước, giống học phí:
1. `POST /campaigns/:id/contributions` → `{ contributionId, gatewayReference: "SBX-C-...", amount, contributionStatus: "PENDING" }`
2. `POST /payments/webhook` với `{ gatewayReference, status: "SUCCESS" }` → `result: "CONTRIBUTION_SUCCESS"`.
   Chỉ khi đó `fundedAmount` của Campaign mới tăng và Sponsor nhận thông báo xác nhận.

Impact response:
```json
{
  "campaign": { "...": "..." },
  "myContribution": { "total": "600000", "count": 1, "shareOfFund": 100 },
  "fundUsage": { "fundedAmount": "600000", "allocatedAmount": "300000", "usedAmount": "200000", "unallocatedAmount": "300000", "usedPercent": 33.33 },
  "impact": { "sponsoredStudentCount": 1, "studentsUsingScholarshipCount": 1, "enrollmentsFundedCount": 1, "classesSupportedCount": 1 }
}
```
Chỉ trả số liệu tổng hợp, không lộ thông tin cá nhân của Student.
Lỗi: `409 CAMPAIGN_NOT_ACCEPTING_FUNDING`, `403 FORBIDDEN` (chưa có khoản tài trợ hoàn tất cho Campaign).

## 9. Scholarship (Student)

| Method | Endpoint | Actor | Mô tả |
|---|---|---|---|
| POST | `/campaigns/:id/applications` | Student | Nộp hồ sơ → `SUBMITTED` |
| GET | `/me/scholarship-applications` | Student | Hồ sơ của tôi (kèm `campaign`) |
| POST | `/me/scholarship-applications/:id/resubmit` | Student | Bổ sung khi `NEED_MORE_INFORMATION` → `SUBMITTED` |
| GET | `/me/scholarships` | Student | Học bổng của tôi (kèm `campaign`, `isUsable`) |
| POST | `/enrollments/:id/scholarship-payment` | Student | Dùng học bổng cho Enrollment đang giữ chỗ |

Body nộp hồ sơ (không có trường số tiền — số tiền luôn là `awardAmountPerStudent` của Campaign):
```json
{
  "statement": "Hoàn cảnh và nhu cầu học tập",
  "documents": [{ "files": [{ "storageKey": "private/<userId>/SCHOLARSHIP_PROOF/<uuid>.pdf", "mimeType": "application/pdf" }] }]
}
```
`storageKey` lấy từ `POST /uploads/private` với `purpose = SCHOLARSHIP_PROOF` (mục 13).
Lỗi: `409 CAMPAIGN_NOT_ACCEPTING_APPLICATIONS`, `409 DUPLICATE_APPLICATION` (kèm `details.existingApplicationId`).

**POST `/enrollments/:id/scholarship-payment`** — body `{ "scholarshipId": "..." }` (tùy chọn; bỏ trống thì hệ thống
tự chọn học bổng hợp lệ sắp hết hạn nhất).

```json
{
  "success": true,
  "data": {
    "enrollmentId": "...", "enrollmentStatus": "PENDING_PAYMENT", "paymentSource": "MIXED",
    "tuitionAmount": "500000", "scholarshipAmount": "300000", "remainingDue": "200000",
    "scholarshipId": "...", "scholarshipUsageId": "...", "holdExpiresAt": "..."
  }
}
```
- Học bổng đủ toàn bộ học phí → `enrollmentStatus: "CONFIRMED"`, `paymentSource: "SCHOLARSHIP"`, `remainingDue: "0"`.
- Học bổng chỉ đủ một phần → `paymentSource: "MIXED"`. FE gọi tiếp `POST /enrollments/:id/payments` (số tiền = `remainingDue`)
  rồi webhook. Enrollment chỉ `CONFIRMED` khi Payment + học bổng đủ học phí và còn trong thời gian giữ chỗ.
- Hết 15 phút giữ chỗ mà chưa trả đủ → Enrollment `EXPIRED`, phần học bổng tạm giữ được hoàn lại.
- Lỗi: `409 ENROLLMENT_EXPIRED`, `409 NO_ELIGIBLE_SCHOLARSHIP`, `409 CLASS_OUT_OF_SCHOLARSHIP_SCOPE`, `409 SCHOLARSHIP_EXPIRED`,
  `409 SCHOLARSHIP_NOT_USABLE`, `409 SCHOLARSHIP_ALREADY_APPLIED`, `409 CAMPAIGN_FUND_UNAVAILABLE`, `404 SCHOLARSHIP_NOT_FOUND`.

## 10. Scholarship (Admin)

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/admin/scholarship-applications` | `status?`, `campaignId?` |
| GET | `/admin/scholarship-applications/:id` | Hồ sơ + `student` + `campaign` + `documents` + `scholarship` |
| POST | `/admin/scholarship-applications/:id/approve` | `{ reviewNote? }` → `APPROVED`, tạo Scholarship |
| POST | `/admin/scholarship-applications/:id/reject` | `{ reviewNote? }` → `REJECTED` |
| POST | `/admin/scholarship-applications/:id/request-information` | `{ reviewNote }` (bắt buộc) → `NEED_MORE_INFORMATION` |

- Admin không nhập số tiền: `allocatedAmount = remainingAmount = awardAmountPerStudent`.
- Quỹ chưa phân bổ của Campaign không đủ → `409 INSUFFICIENT_CAMPAIGN_FUND`.
- Hồ sơ không ở trạng thái chờ duyệt → `409 APPLICATION_NOT_REVIEWABLE`.
- Mọi thao tác duyệt đều ghi Audit Log.

## 11. Reviews

| Method | Endpoint | Actor | Mô tả |
|---|---|---|---|
| POST | `/classes/:id/reviews` | Student | `{ rating: 1..5, comment? }` |
| GET | `/classes/:id/reviews` | Public | Phân trang + `ratingAverage`, `ratingCount` |
| GET | `/teachers/:id/reviews` | Public | Phân trang + `ratingAverage`, `ratingCount` |

Điều kiện đánh giá: Student có Enrollment `CONFIRMED`/`COMPLETED` của lớp **và** lớp đã có ít nhất một buổi `COMPLETED`
(hoặc lớp đang `IN_PROGRESS`/`COMPLETED`). Mỗi Enrollment một đánh giá.
Lỗi: `403 REVIEW_NOT_ALLOWED`, `409 DUPLICATE_REVIEW`.

## 12. Notification

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/me/notifications` | `unread=true` để lọc chưa đọc; response có thêm `unreadCount` |
| POST | `/me/notifications/:id/read` | Đánh dấu đã đọc |
| POST | `/me/notifications/read-all` | Đánh dấu tất cả đã đọc → `{ updated }` |

## 13. Upload file và signed URL

| Method | Endpoint | Actor | Mô tả |
|---|---|---|---|
| POST | `/uploads/private` | User | Upload tài liệu riêng tư → `{ storageKey, mimeType, size, originalName }` |
| POST | `/uploads/public` | User | Upload ảnh công khai → `{ url, path, mimeType, size }` |
| POST | `/files/signed-url` | Chủ file / Admin | `{ storageKey }` → `{ url, expiresAt }` |
| GET | `/files/download?key&expires&signature` | — | Tải file bằng signed URL (không cần token) |

- Upload dạng `multipart/form-data`, field file tên `file`, kèm field `purpose`.
- Private: `purpose` ∈ `IDENTITY`, `QUALIFICATION`, `SCHOLARSHIP_PROOF`; nhận PDF, JPEG, PNG, WEBP; tối đa 10MB.
  File **không** truy cập được qua URL tĩnh, chỉ qua signed URL (mặc định sống 5 phút).
- Public: `purpose` ∈ `AVATAR`, `COVER_IMAGE`; chỉ nhận ảnh; tối đa 5MB. Dùng `url` cho `avatarUrl`, `coverImage`.
- Backend kiểm tra nội dung file thật sự khớp định dạng khai báo.
- Signed URL đã có sẵn trong response chi tiết hồ sơ (mục 5, mục 10), FE thường không cần gọi `/files/signed-url`.
- Lỗi: `400 UNSUPPORTED_FILE_TYPE`, `413 FILE_TOO_LARGE`, `404 FILE_NOT_FOUND`, `403 INVALID_FILE_URL`.

Ví dụ FE:
```typescript
const form = new FormData();
form.append("purpose", "SCHOLARSHIP_PROOF");
form.append("file", file);
const { data } = await api.post("/uploads/private", form);
// data.data.storageKey → đưa vào documents[].files[].storageKey
```

## 14. Profile

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/me/profile` | Hồ sơ của tôi theo role |
| PATCH | `/me/profile` | Cập nhật hồ sơ |
| POST | `/me/avatar` | Upload ảnh (multipart, field `file`) và đặt làm avatar → `{ avatarUrl }` |
| POST | `/me/password` | `{ currentPassword, newPassword }` → đổi mật khẩu, đăng xuất mọi thiết bị |

Trường chung: `id`, `email`, `role`, `status`, `fullName`, `avatarUrl`, `createdAt`, `updatedAt`.

| Role | Trường sửa được | Trường chỉ đọc thêm |
|---|---|---|
| STUDENT | `fullName`, `dateOfBirth`, `bio`, `avatarUrl` | |
| TEACHER | `fullName`, `biography`, `qualificationSummary`, `avatarUrl` | `verificationStatus`, `ratingAverage`, `ratingCount` |
| SPONSOR | `sponsorType`, `organizationName`, `representativeName`, `description`, `avatarUrl` | |

`email`, `role`, `status` không sửa được qua API này. Lỗi: `400 INVALID_PASSWORD`, `400 PROFILE_NOT_EDITABLE` (Admin).

## 15. Nhắn tin (Student ↔ Teacher)

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/conversations` | `{ participantId, classId? }` → mở (hoặc lấy lại) cuộc trò chuyện 1-1 |
| GET | `/conversations` | Hộp thư của tôi, mới nhất trước (phân trang) |
| GET | `/conversations/:id/messages` | `limit` (mặc định 30), `before` → `{ items, hasMore, nextBefore }` |
| POST | `/conversations/:id/messages` | `{ content }` (tối đa 2000 ký tự) |
| DELETE | `/messages/:id` | Thu hồi tin nhắn của chính mình |

- Chỉ Student và Teacher nhắn được với nhau; nếu có `classId` thì lớp phải thuộc Teacher đó.
- Conversation: `{ id, classId, className, participant: { id, fullName, avatarUrl, role }, lastMessagePreview, lastMessageAt }`.
- `items` xếp theo thời gian tăng dần. Tải trang cũ hơn: gọi lại với `before = nextBefore`.
- Tin nhắn đã thu hồi vẫn nằm trong danh sách với `isDeleted: true`, `content: null`.
- Người nhận có Notification loại `NEW_MESSAGE`. Chưa có realtime — FE polling.
- Lỗi: `403 MESSAGING_NOT_ALLOWED`, `404 CONVERSATION_NOT_FOUND` (kể cả khi không phải thành viên), `404 MESSAGE_NOT_FOUND`.

## 16. Khiếu nại

| Method | Endpoint | Actor | Mô tả |
|---|---|---|---|
| POST | `/reports` | Student / Teacher / Sponsor | `{ type, description, reportedUserId?, classId? }` |
| GET | `/me/reports` | User | Khiếu nại tôi đã gửi |
| GET | `/admin/reports` | Admin | `status?`, `type?` |
| GET | `/admin/reports/:id` | Admin | Chi tiết |
| PATCH | `/admin/reports/:id` | Admin | `{ status, reviewNote }` |

- `type` ∈ `TEACHER_ABSENT`, `TEACHING_QUALITY`, `PAYMENT_DISPUTE`, `INAPPROPRIATE_BEHAVIOR`, `FRAUD`, `OTHER`.
  Phải có ít nhất `reportedUserId` hoặc `classId`.
- Trạng thái: `OPEN` → `IN_REVIEW` → `RESOLVED` | `REJECTED` (có thể đi thẳng từ `OPEN`). `RESOLVED`/`REJECTED` là cuối
  và bắt buộc `reviewNote`; người gửi nhận Notification.
- Response có `reporter`, `reportedUser`, `handledBy`, `class`. Lỗi: `409 INVALID_REPORT_STATUS`, `404 REPORT_NOT_FOUND`.

## 17. Admin: người dùng và dashboard

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/admin/users` | `role?`, `status?`, `search?` (email hoặc tên), phân trang |
| GET | `/admin/users/:id` | Chi tiết + `profile` + `activity` |
| PATCH | `/admin/users/:id/status` | `{ status: ACTIVE \| SUSPENDED \| BANNED, reason }` |
| GET | `/admin/dashboard` | Số liệu tổng quan |

- `reason` bắt buộc khi `SUSPENDED`/`BANNED`. Tài khoản bị khóa mất quyền truy cập ngay và bị thu hồi mọi refresh token.
  Không khóa được chính mình hay tài khoản Admin khác. Mọi thay đổi ghi Audit Log.

Dashboard response:
```json
{
  "users": { "total": 7, "students": 2, "teachers": 3, "sponsors": 1, "verifiedTeachers": 2, "newThisMonth": 7 },
  "pending": { "teacherVerifications": 1, "classApprovals": 1, "courseProposals": 0, "scholarshipApplications": 1, "reports": 1, "refundsRequired": 0 },
  "training": { "courses": 3, "classes": 11, "activeClasses": 9, "upcomingClasses": 0, "classesByStatus": { "OPEN": 9 }, "confirmedEnrollments": 0 },
  "finance": {
    "revenue": "0", "commission": "0", "revenueThisMonth": "0", "transactions": 1, "refunds": 0,
    "monthly": [{ "month": "2026-09", "revenue": "0", "commission": "0" }]
  },
  "scholarship": { "openCampaigns": 1, "totalFund": "2000000", "allocatedFund": "150000", "usedFund": "0", "allocatedPercent": 7.5, "studentsReceived": 1, "newApplications": 1 },
  "recentActivities": [{ "id": "...", "action": "CLASS_APPROVED", "targetType": "Class", "targetId": "...", "actorEmail": "admin@test.com", "createdAt": "..." }]
}
```
- `revenue` = tổng học phí của các Enrollment trả phí đã xác nhận (thanh toán trực tiếp, học bổng hoặc kết hợp);
  `commission` = phần hoa hồng của nền tảng. `monthly` luôn có 6 tháng gần nhất (theo UTC).
