# TÀI LIỆU CHUẨN HÓA API CONTRACT HỌC THUẬT (CUR / LMS / AID)
**Dự án:** EDUNITY V3  
**Phân hệ:** Curriculum (CUR), Learning Management System (LMS), Financial Aid / Scholarship & Sponsor (AID)  
**Tài liệu tham chiếu:** `BackEnd/src/utils/http.js`, `BackEnd/src/routes/*`, `BackEnd/src/controllers/*`, `BackEnd/src/services/*`  
**Ngày chuẩn hóa:** 07/11/2026 — Phiên bản 3.0  

---

## 1. QUY ƯỚC CHUNG (ENVELOPE, PHÂN TRANG VÀ LỖI)

### 1.1. Base URL & Giao thức
- **Base URL:** `http://localhost:3000/api` (môi trường cục bộ) hoặc `https://<domain>/api` (môi trường sản xuất).
- Mọi request và response đều sử dụng `Content-Type: application/json; charset=utf-8` (ngoại trừ các endpoint upload multipart).

### 1.2. Envelope thành công (Success Envelope)
Theo chuẩn triển khai tại `BackEnd/src/utils/http.js` thông qua wrapper `handle(fn, statusCode = 200)`:
```typescript
interface ApiResponse<T> {
  success: true;
  data: T;
}
```
*Đặc tính chuẩn hóa:*
- Toàn bộ giá trị BSON `Decimal128` (ví dụ: học phí, số tiền tài trợ, số dư học bổng) được tự động chuyển đổi thành chuỗi ký tự số (`string`) qua `serializeDecimal128` tại `BackEnd/src/utils/serialize.js`. Ví dụ: `"500000"`, `"0"`.
- Mọi thực thể cơ sở dữ liệu trả về đều chứa trường định danh `id` kiểu chuỗi hex 24 ký tự.

### 1.3. Envelope phân trang (Pagination Envelope)
Theo chuẩn `parsePaging` và `paged` tại `BackEnd/src/utils/http.js`:
- **Tham số truy vấn (Query Parameters):**
  - `page`: Số nguyên $\ge 1$ (mặc định: `1`).
  - `pageSize` (hoặc alias `limit`): Số nguyên trong khoảng $[1, 100]$ (mặc định: `20`, riêng danh sách lớp học công khai mặc định là `12`).
- **Cấu trúc `data` phân trang:**
```json
{
  "success": true,
  "data": {
    "items": [],
    "total": 120,
    "page": 1,
    "pageSize": 20,
    "totalPages": 6
  }
}
```

### 1.4. Envelope lỗi (Error Envelope)
Được chuẩn hóa tập trung qua bộ xử lý lỗi toàn cục tại `BackEnd/src/app.js` và `BackEnd/src/utils/errors.js`:
```json
{
  "success": false,
  "error": "MÃ_LỖI_UPPER_SNAKE_CASE",
  "message": "Thông điệp mô tả chi tiết lỗi",
  "details": {}
}
```

#### Ma trận mã lỗi chuẩn hóa toàn hệ thống:
| HTTP Status | Mã lỗi (`error`) | Ý nghĩa và hoàn cảnh áp dụng |
| :--- | :--- | :--- |
| **400 Bad Request** | `VALIDATION_ERROR` | Dữ liệu đầu vào thiếu trường bắt buộc, sai kiểu dữ liệu, vượt ngưỡng an toàn |
| | `INVALID_GRADE_LEVEL` | Khối lớp không hợp lệ theo chuẩn Bộ GD&ĐT (BR-43) |
| | `GRADE_LEVEL_CATEGORY_MISMATCH` | Khối lớp không nằm trong `allowedGradeLevels` của Chuyên mục (BR-44/45) |
| | `SUBJECT_CATEGORY_MISMATCH` | Môn học không thuộc về Chuyên mục đã chọn |
| | `COURSE_ATTRIBUTE_MISMATCH` | Thuộc tính môn/danh mục/khối lớp/trình độ truyền lên không khớp Course (`CUR-10`) |
| | `COURSE_LEVEL_REQUIRED` | Khóa học chưa cấu hình `level` hợp lệ để mở lớp |
| | `GRADE_LEVEL_REQUIRED` | Thiếu `gradeLevel` cho danh mục có ràng buộc khối lớp (`TEA-07`) |
| | `CLASS_INCOMPLETE` | Lớp học chưa đủ thông tin bắt buộc khi bấm gửi duyệt (`details.missing`) |
| | `SESSION_OUT_OF_CLASS_RANGE` | Lịch buổi học nằm ngoài khoảng `startDate` đến `endDate` của Lớp học |
| **401 Unauthorized** | `UNAUTHORIZED` | Thiếu token xác thực, token không hợp lệ hoặc sai chữ ký webhook |
| | `TOKEN_EXPIRED` | Access Token JWT đã hết hạn (Client gọi `/api/auth/refresh`) |
| **403 Forbidden** | `FORBIDDEN` | Tài khoản không có vai trò phù hợp (`requireRole`) |
| | `ACCOUNT_BLOCKED` | Tài khoản đang ở trạng thái `SUSPENDED` hoặc `BANNED` |
| | `ACCOUNT_NOT_ACTIVE` | Tài khoản chưa kích hoạt |
| | `TEACHER_NOT_VERIFIED` | Giảng viên chưa được Admin duyệt hồ sơ `VERIFIED` |
| | `SUBJECT_AUTHORIZATION_REQUIRED` | Giảng viên chưa có quyền giảng dạy `APPROVED` cho `(subjectId, gradeLevel, level)` (`TEA-07`/`CUR-10`) |
| | `SUBJECT_AUTHORIZATION_PENDING` | Quyền giảng dạy đang ở trạng thái `PENDING`, chưa được duyệt |
| | `SUBJECT_AUTHORIZATION_SUSPENDED` | Quyền giảng dạy đã bị Admin tạm đình chỉ (`SUSPENDED`) |
| | `TEACHER_CONTRACT_NOT_FOUND` | Giảng viên chưa có hợp đồng giảng dạy (`TEA-12` khi port contract sẵn sàng) |
| | `TEACHER_CONTRACT_NOT_ACTIVE` | Hợp đồng giảng dạy không ở trạng thái `ACTIVE` |
| | `TEACHER_CONTRACT_EXPIRED` | Hợp đồng giảng dạy đã hết hạn |
| | `NOT_ENROLLED` | Học viên chưa có đơn đăng ký `CONFIRMED` cho lớp học |
| | `JOIN_WINDOW_CLOSED` | Học viên vào trễ quá 20 phút đầu giờ của buổi học |
| **404 Not Found** | `CATEGORY_NOT_FOUND` | Không tìm thấy Chuyên mục |
| | `SUBJECT_NOT_FOUND` | Không tìm thấy Môn học |
| | `COURSE_NOT_FOUND` | Không tìm thấy Khóa học |
| | `SYLLABUS_VERSION_NOT_FOUND` | Không tìm thấy Phiên bản giáo trình (hoặc không thuộc Khóa học) |
| | `CURRICULUM_UNIT_NOT_FOUND` | Không tìm thấy Đơn vị bài học trong Phiên bản giáo trình |
| | `SUBJECT_AUTHORIZATION_NOT_FOUND` | Không tìm thấy hồ sơ cấp quyền giảng dạy (`TEA-07`) |
| | `CLASS_NOT_FOUND` | Không tìm thấy Lớp học |
| | `SESSION_NOT_FOUND` | Không tìm thấy Buổi học |
| | `CAMPAIGN_NOT_FOUND` | Không tìm thấy Chiến dịch học bổng |
| | `APPLICATION_NOT_FOUND` | Không tìm thấy Hồ sơ xin cấp học bổng |
| | `DOCUMENT_NOT_FOUND` | Không tìm thấy tài liệu xác minh trong hồ sơ |
| | `PAPER_RECEIPT_NOT_FOUND` | Không tìm thấy biên nhận hồ sơ bản giấy (`AID-04`) |
| | `SCHOLARSHIP_NOT_FOUND` | Không tìm thấy Học bổng của học viên |
| **400 Bad Request** | `DOSSIER_INCOMPLETE` | Hồ sơ học bổng thiếu `guardianInfo`, `schoolInfo` hoặc `statement` (`AID-01`) |
| | `PAPER_DOSSIER_NOT_ALLOWED` | Chiến dịch không cho phép nộp bản giấy |
| | `INVALID_CHECKLIST_ITEM_CODE` | Mã checklist không thuộc chiến dịch |
| **403 Forbidden** | `GUARDIAN_CONSENT_REQUIRED` | Thiếu đồng thuận người giám hộ (`AID-08`) khi chiến dịch bật kiểm tra consent |
| **405 Method Not Allowed** | `METHOD_NOT_ALLOWED` | Gọi phương thức HTTP bị cấm (ví dụ: `GET /api/sessions/:id/join`) |
| **409 Conflict** | `DUPLICATE_CATEGORY / SUBJECT / COURSE` | Trùng lặp tên thực thể trong cùng cấp danh mục |
| | `DUPLICATE_SUBJECT_AUTHORIZATION` | Trùng quyền giảng dạy `(teacherId, subjectId, gradeLevel, level)` (`TEA-07`) |
| | `IDEMPOTENCY_KEY_CONFLICT` | Dùng lại `Idempotency-Key` với payload tạo/sinh lịch khác trước đó (`CUR-11`) |
| | `SESSION_TIME_CONFLICT` | Trùng giờ dạy với buổi học khác của giảng viên hoặc tự trùng trong batch |
| | `DUPLICATE_SLUG` | Trùng lặp đường dẫn tĩnh SEO |
| | `SYLLABUS_VERSION_IMMUTABLE` | Phiên bản giáo trình đã `PUBLISHED`/`ARCHIVED` bị khóa bất biến, không thể chỉnh sửa |
| | `SYLLABUS_VERSION_CONFLICT` | Xung đột số thứ tự phiên bản giáo trình đồng thời |
| | `SYLLABUS_PUBLISH_CONFLICT` | Xung đột publish phiên bản giáo trình đồng thời trên cùng khóa học |
| | `SYLLABUS_VERSION_ALREADY_PUBLISHED` | Phiên bản giáo trình đã ở trạng thái `PUBLISHED` |
| | `DUPLICATE_UNIT_ORDER` | Trùng `unitOrder` trong cùng Phiên bản giáo trình |
| | `CLASS_NOT_EDITABLE` | Lớp học không ở trạng thái `DRAFT` hoặc `REJECTED` |
| | `RESCHEDULE_REQUIRED` | Không được sửa ngày giờ trực tiếp khi lớp đang `OPEN`/`IN_PROGRESS` |
| | `TEACHER_SCHEDULE_CONFLICT` | Lịch dạy bù bị trùng với buổi khác của Giảng viên |
| | `CLASS_SCHEDULE_CONFLICT` | Lịch dạy bù bị trùng với buổi khác của Lớp học |
| | `DUPLICATE_RESCHEDULE_REQUEST` | Buổi học đã có yêu cầu dời lịch đang chờ duyệt |
| | `DUPLICATE_APPLICATION` | Học viên đã có hồ sơ đang xử lý cho Chiến dịch này |
| | `DOSSIER_CHECKLIST_INCOMPLETE` | Hồ sơ chưa đáp ứng đủ mục checklist bắt buộc (online và/hoặc bản giấy) |
| | `DUPLICATE_PAPER_RECEIPT` | Hồ sơ đã có biên nhận bản giấy đang hoạt động (`AID-04`) |
| | `DUPLICATE_TRACKING_NUMBER` | Trùng mã vận đơn bưu điện đang hoạt động |
| | `DUPLICATE_RECEIPT_CODE` | Trùng mã biên nhận bản giấy |
| | `APPLICATION_LINK_MISMATCH` | Sai lệch chiến dịch/học viên/mã hồ sơ khi liên kết bản giấy |
| | `APPLICATION_LINK_REQUIRED` | Biên nhận bản giấy chưa liên kết tới `ScholarshipApplication` |
| | `INVALID_PAPER_RECEIPT_STATUS` | Chuyển trạng thái biên nhận bản giấy không hợp lệ hoặc đã chốt |
| | `PAPER_RECEIPT_DISCREPANCY_UNRESOLVED` | Biên nhận bản giấy đang có sai lệch chưa xử lý |
| | `RECONCILIATION_HAS_UNRESOLVED_ITEMS` | Có mục bản giấy bị `MISSING`/`MISMATCH`/`DAMAGED` khi chốt `RECONCILED` |
| | `PAPER_CHECKLIST_INCOMPLETE` | Thiếu mục bản giấy bắt buộc `MATCHED` khi chốt `RECONCILED` |
| | `CAMPAIGN_NOT_ACCEPTING_APPLICATIONS`| Nộp đơn ngoài thời hạn nhận hồ sơ của Chiến dịch |
| | `CAMPAIGN_FUND_UNAVAILABLE` | Quỹ khả dụng của Chiến dịch không đủ giải ngân |
| | `SCHOLARSHIP_NOT_USABLE` | Học bổng đã hết hạn, hết số dư hoặc không hợp lệ |
| | `CLASS_OUT_OF_SCHOLARSHIP_SCOPE` | Lớp học nằm ngoài phạm vi tài trợ của Chiến dịch |
| **429 Too Many Requests** | `RATE_LIMITED` | Vượt tần suất gọi API cho phép (tin nhắn, upload) |
| **503 Service Unavailable** | `VIDEO_PROVIDER_UNAVAILABLE` | Lỗi kết nối dịch vụ LiveKit Server |
| | `RECORDING_START_FAILED` | Không thể khởi động phiên ghi hình bài giảng |
| | `PRICING_POLICY_DEPENDENCY_BLOCKED` | Cổng kiểm tra chính sách giá (`CUR-07` `CoursePricingPolicy`) chưa sẵn sàng (fail-closed) |
| | `CONTRACT_DEPENDENCY_BLOCKED` | Cổng xác minh hợp đồng giảng viên `ACTIVE` (`TEA-12` của Bảo) chưa sẵn sàng (fail-closed, không thay thế bằng `VERIFIED`) |
| | `CONSENT_DEPENDENCY_BLOCKED` | Cổng xác minh đồng thuận người giám hộ (`AID-08` của Bảo) chưa sẵn sàng (fail-closed khi campaign bật `requireGuardianConsentForMinor`) |

---

## 2. MA TRẬN PHÂN QUYỀN (RBAC & SECURITY MATRIX)

Mọi yêu cầu có xác thực phải gửi kèm header:  
`Authorization: Bearer <accessToken>`

| Phân hệ | Phương thức | Tuyến đường (Endpoint) | Quyền truy cập (RBAC) | Kiểm tra quyền sở hữu & Trạng thái |
| :--- | :--- | :--- | :--- | :--- |
| **CUR** | `GET` | `/api/catalog/categories` | Public | Lấy cây danh mục lồng nhau môn học |
| **CUR** | `GET` | `/api/catalog/filters` | Public | Lấy metadata bộ lọc môn học và khối lớp |
| **CUR** | `GET` | `/api/categories` | Public | Lấy danh mục phẳng kèm `allowedGradeLevels` |
| **CUR** | `POST` | `/api/admin/categories` | `ADMIN` | Toàn quyền tạo Chuyên mục |
| **CUR** | `PATCH` | `/api/admin/categories/:id` | `ADMIN` | Toàn quyền cập nhật Chuyên mục |
| **CUR** | `GET` | `/api/categories/:id/subjects`| Public | Lấy môn học theo Chuyên mục |
| **CUR** | `GET` | `/api/subjects/:id` | Public | Chi tiết Môn học + danh sách khóa học |
| **CUR** | `POST` | `/api/admin/subjects` | `ADMIN` | Toàn quyền tạo Môn học |
| **CUR** | `PATCH` | `/api/admin/subjects/:id` | `ADMIN` | Toàn quyền cập nhật Môn học |
| **CUR** | `GET` | `/api/courses` | Public | Tìm kiếm khóa học công khai (`ACTIVE`) |
| **CUR** | `GET` | `/api/courses/:id` | Public | Chi tiết khóa học + số lớp đang `OPEN` |
| **CUR** | `GET` | `/api/courses/:id/classes` | Public | Danh sách lớp `OPEN` của khóa học |
| **CUR** | `GET` | `/api/courses/:id/syllabus` | Public | Giáo trình đã `PUBLISHED` + `CurriculumUnit` (hoặc fallback `Course.syllabus`) |
| **CUR** | `POST` | `/api/admin/courses` | `ADMIN` | Toàn quyền tạo Khóa học |
| **CUR** | `PATCH` | `/api/admin/courses/:id` | `ADMIN` | Toàn quyền sửa Khóa học (khóa sửa `syllabus` nếu đã có `publishedSyllabusVersionId`) |
| **CUR** | `GET` | `/api/admin/courses/:id/syllabus-versions` | `ADMIN` | Danh sách tất cả phiên bản giáo trình của Khóa học |
| **CUR** | `POST` | `/api/admin/courses/:id/syllabus-versions` | `ADMIN` | Tạo phiên bản `DRAFT` mới (từ đầu hoặc clone từ version cũ) |
| **CUR** | `GET` | `/api/admin/courses/:id/syllabus-versions/:versionId` | `ADMIN` | Xem chi tiết một phiên bản giáo trình và danh sách bài học |
| **CUR** | `PATCH` | `/api/admin/courses/:id/syllabus-versions/:versionId` | `ADMIN` | Cập nhật tiêu đề/tóm tắt phiên bản `DRAFT` |
| **CUR** | `POST` | `/api/admin/courses/:id/syllabus-versions/:versionId/publish` | `ADMIN` | Publish `DRAFT` $\rightarrow$ `PUBLISHED` và archive bản cũ (transaction) |
| **CUR** | `POST` | `/api/admin/courses/:id/syllabus-versions/:versionId/archive` | `ADMIN` | Đưa phiên bản sang trạng thái `ARCHIVED` bất biến |
| **CUR** | `POST` | `/api/admin/courses/:id/syllabus-versions/:versionId/units` | `ADMIN` | Thêm `CurriculumUnit` vào phiên bản `DRAFT` |
| **CUR** | `PATCH` | `/api/admin/courses/:id/syllabus-versions/:versionId/units/:unitId` | `ADMIN` | Sửa `CurriculumUnit` trong phiên bản `DRAFT` |
| **CUR** | `DELETE` | `/api/admin/courses/:id/syllabus-versions/:versionId/units/:unitId` | `ADMIN` | Soft-delete `CurriculumUnit` trong phiên bản `DRAFT` |
| **CUR** | `PUT` | `/api/admin/courses/:id/syllabus-versions/:versionId/units/reorder` | `ADMIN` | Sắp xếp lại `unitOrder` của phiên bản `DRAFT` |
| **CUR** | `POST` | `/api/teacher/course-proposals` | `TEACHER` | Yêu cầu `verificationStatus = "VERIFIED"` |
| **CUR** | `GET` | `/api/teacher/course-proposals` | `TEACHER` | Chỉ xem đề xuất do chính mình tạo |
| **CUR** | `PATCH` | `/api/teacher/course-proposals/:id` | `TEACHER` | Chỉ sửa khi `PENDING_REVIEW` hoặc `NEED_CHANGES` |
| **CUR** | `GET` | `/api/admin/course-proposals` | `ADMIN` | Danh sách đề xuất chờ duyệt |
| **CUR** | `GET` | `/api/admin/course-proposals/:id` | `ADMIN` | Chi tiết đề xuất kèm thông tin giảng viên |
| **CUR** | `POST` | `/api/admin/course-proposals/:id/approve` | `ADMIN` | Transaction tạo Course trong catalog |
| **CUR** | `POST` | `/api/admin/course-proposals/:id/reject` | `ADMIN` | Từ chối đề xuất khóa học |
| **CUR** | `POST` | `/api/admin/course-proposals/:id/request-changes` | `ADMIN` | Yêu cầu sửa đổi kèm `reviewNote` |
| **LMS** | `GET` | `/api/teacher/subject-authorizations` | `TEACHER` | Danh sách quyền giảng dạy của chính giảng viên đăng nhập (`TEA-07`) |
| **LMS** | `POST` | `/api/teacher/subject-authorizations` | `TEACHER` | Gửi yêu cầu cấp quyền dạy theo môn/khối/trình độ (`PENDING`) |
| **LMS** | `GET` | `/api/teacher/subject-authorizations/:id` | `TEACHER` | Xem chi tiết quyền giảng dạy của chính mình (chống IDOR) |
| **LMS** | `GET` | `/api/admin/subject-authorizations` | `ADMIN` | Danh sách hồ sơ phân quyền giảng dạy |
| **LMS** | `POST` | `/api/admin/subject-authorizations` | `ADMIN` | Admin cấp trực tiếp hoặc tạo quyền giảng dạy |
| **LMS** | `GET` | `/api/admin/subject-authorizations/:id` | `ADMIN` | Chi tiết hồ sơ phân quyền giảng dạy |
| **LMS** | `POST` | `/api/admin/subject-authorizations/:id/approve` | `ADMIN` | Duyệt / khôi phục quyền giảng dạy (`APPROVED`) + AuditLog |
| **LMS** | `POST` | `/api/admin/subject-authorizations/:id/suspend` | `ADMIN` | Tạm đình chỉ quyền giảng dạy (`SUSPENDED`) kèm lý do + AuditLog |
| **LMS** | `GET` | `/api/classes` | Public | Chỉ trả lớp `OPEN`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` |
| **LMS** | `GET` | `/api/classes/:id` | Public | Chi tiết lớp học + hồ sơ giảng viên |
| **LMS** | `GET` | `/api/classes/:id/sessions` | Public | Danh sách buổi học công khai |
| **LMS** | `GET` | `/api/teacher/classes` | `TEACHER` | Lớp của giảng viên đăng nhập |
| **LMS** | `POST` | `/api/teacher/classes` | `TEACHER` | Yêu cầu `VERIFIED` + `TEA-07 APPROVED` + `Course` khớp + `CUR-07` + `TEA-12 ACTIVE` (`CUR-10`) |
| **LMS** | `GET` | `/api/teacher/classes/:id` | `TEACHER` | Chi tiết lớp của tôi + sessions |
| **LMS** | `PATCH` | `/api/teacher/classes/:id` | `TEACHER` | Chỉ sửa khi `DRAFT` hoặc `REJECTED` + cổng `CUR-10` |
| **LMS** | `POST` | `/api/teacher/classes/:id/submit` | `TEACHER` | Kiểm tra đầy đủ thông tin + cổng `CUR-10` |
| **LMS** | `GET` | `/api/teacher/classes/:id/students` | `TEACHER` | Xem học viên lớp của mình |
| **LMS** | `GET` | `/api/teacher/classes/:id/planned-sessions`| `TEACHER`| Dự kiến lịch từ schedule theo múi giờ `Asia/Ho_Chi_Minh` $\rightarrow$ UTC |
| **LMS** | `GET` | `/api/admin/classes/pending` | `ADMIN` | Danh sách lớp chờ phê duyệt |
| **LMS** | `GET` | `/api/admin/classes/:id` | `ADMIN` | Xem chi tiết lớp để duyệt |
| **LMS** | `POST` | `/api/admin/classes/:id/approve` | `ADMIN` | Phê duyệt mở lớp (`OPEN`) |
| **LMS** | `POST` | `/api/admin/classes/:id/reject` | `ADMIN` | Từ chối mở lớp |
| **LMS** | `POST` | `/api/teacher/classes/:classId/sessions/generate` | `TEACHER` | Sinh & lưu hàng loạt buổi học từ `Class.schedule` trong transaction + khóa giáo viên (`Idempotency-Key`, `Asia/Ho_Chi_Minh` $\rightarrow$ UTC) (`CUR-11`) |
| **LMS** | `POST` | `/api/teacher/classes/:classId/sessions` | `TEACHER` | Thêm buổi học vào kế hoạch lớp trong transaction + khóa giáo viên (`Idempotency-Key`) |
| **LMS** | `PATCH` | `/api/teacher/sessions/:id` | `TEACHER` | Sửa thông tin buổi học |
| **LMS** | `DELETE`| `/api/teacher/sessions/:id` | `TEACHER` | Xóa buổi (chỉ khi lớp `DRAFT`/`REJECTED`) |
| **LMS** | `POST` | `/api/teacher/sessions/:id/start` | `TEACHER` | Bắt đầu dạy, bật ghi hình LiveKit |
| **LMS** | `POST` | `/api/teacher/sessions/:id/end` | `TEACHER` | Kết thúc dạy, chốt điểm danh |
| **LMS** | `GET` | `/api/teacher/sessions/:id/attendance` | `TEACHER`| Xem bảng điểm danh buổi học |
| **LMS** | `POST` | `/api/sessions/:id/join` | `STUDENT`, `TEACHER` | Giảng viên chủ lớp hoặc Học viên `CONFIRMED` |
| **LMS** | `GET` | `/api/sessions/:id/join` | Any | **CHẶN: 405 METHOD_NOT_ALLOWED (BUG-TIN03-01)** |
| **LMS** | `GET` | `/api/me/sessions` | `STUDENT` | Lịch các buổi học đã đăng ký |
| **LMS** | `GET` | `/api/sessions/:id/recording` | `STUDENT`, `TEACHER`, `ADMIN` | Cấp signed URL xem video bài giảng |
| **LMS** | `GET` | `/api/sessions/:id/live-status` | `STUDENT`, `TEACHER`, `ADMIN` | Polling thời gian thực phòng học |
| **LMS** | `POST` | `/api/sessions/:id/presence/connect` | `STUDENT`, `TEACHER` | Ghi nhận telemetry kết nối |
| **LMS** | `POST` | `/api/sessions/:id/presence/heartbeat` | `STUDENT`, `TEACHER` | Ghi nhận nhịp tim duy trì kết nối |
| **LMS** | `POST` | `/api/sessions/:id/presence/leave` | `STUDENT`, `TEACHER` | Ghi nhận telemetry rời phòng |
| **LMS** | `POST` | `/api/sessions/livekit-webhook` | LiveKit Server | Xác thực Authorization header |
| **LMS** | `GET` | `/api/teacher/discipline-overview` | `TEACHER` | Xem tổng hợp thẻ vàng, đỏ, vắng mặt |
| **LMS** | `POST` | `/api/teacher/sessions/:id/incident-reports`| `TEACHER` | Báo cáo sự cố buổi học của mình |
| **LMS** | `POST` | `/api/teacher/incident-reports/:id/appeal` | `TEACHER` | Kháng nghị báo cáo sự cố |
| **LMS** | `POST` | `/api/teacher/sessions/:id/reschedule-requests`| `TEACHER`| Đề xuất lịch học bù |
| **LMS** | `POST` | `/api/student/reschedule-requests/:id/respond`| `STUDENT` | Xác nhận tham gia (`ACCEPTED`/`CANNOT_ATTEND`) |
| **LMS** | `GET` | `/api/admin/smart-classroom/overview` | `ADMIN` | Tổng quan phòng học thông minh |
| **LMS** | `POST` | `/api/admin/incident-reports/:id/review` | `ADMIN` | Phê duyệt sự cố, miễn giảm vi phạm |
| **LMS** | `POST` | `/api/admin/teacher-violations/:id/review` | `ADMIN` | Duyệt xử phạt vi phạm giảng viên |
| **LMS** | `POST` | `/api/admin/discipline-cases/:id/review` | `ADMIN` | Duyệt hồ sơ kỷ luật |
| **LMS** | `POST` | `/api/admin/reschedule-requests/:id/review` | `ADMIN` | Phê duyệt tạo buổi học bù |
| **LMS** | `POST` | `/api/admin/session-refund-reviews/:id/review`| `ADMIN`| Xem xét hoàn tiền an toàn liên nhóm |
| **LMS** | `POST` | `/api/classes/:id/reviews` | `STUDENT` | Đã học và có ít nhất 1 buổi `COMPLETED` |
| **LMS** | `GET` | `/api/classes/:id/reviews` | Public | Đánh giá của lớp học |
| **LMS** | `GET` | `/api/teachers/:id/reviews` | Public | Đánh giá của giảng viên |
| **AID** | `GET` | `/api/campaigns` | Public | Chiến dịch `OPEN_FOR_FUNDING` hoặc `CLOSED` |
| **AID** | `GET` | `/api/campaigns/:id` | Public | Chi tiết chiến dịch công khai |
| **AID** | `GET` | `/api/admin/campaigns` | `ADMIN` | Quản trị mọi chiến dịch (kể cả `DRAFT`) |
| **AID** | `GET` | `/api/admin/campaigns/:id` | `ADMIN` | Xem chi tiết chiến dịch quản trị |
| **AID** | `POST` | `/api/admin/campaigns` | `ADMIN` | Tạo chiến dịch `DRAFT` |
| **AID** | `PATCH` | `/api/admin/campaigns/:id` | `ADMIN` | Sửa chiến dịch (khóa trường nhạy cảm sau publish)|
| **AID** | `POST` | `/api/admin/campaigns/:id/publish` | `ADMIN` | Mở nhận tài trợ / hồ sơ |
| **AID** | `POST` | `/api/admin/campaigns/:id/close` | `ADMIN` | Đóng chiến dịch |
| **AID** | `GET` | `/api/admin/campaigns/:id/contributions` | `ADMIN`| Danh sách các khoản tài trợ |
| **AID** | `POST` | `/api/campaigns/:id/contributions` | `SPONSOR` | Tạo khoản tài trợ (`PENDING`) |
| **AID** | `GET` | `/api/sponsor/contributions` | `SPONSOR` | Lịch sử tài trợ của tôi |
| **AID** | `GET` | `/api/sponsor/campaigns/:id/impact` | `SPONSOR` | Báo cáo tác động tổng hợp của chiến dịch |
| **AID** | `POST` | `/api/campaigns/:id/applications` | `STUDENT` | Nộp hồ sơ xin cấp học bổng |
| **AID** | `POST` | `/api/campaigns/:id/dossiers` | `STUDENT` | Tạo/nộp hồ sơ phi tài chính (`DRAFT` hoặc `SUBMITTED`, bắt buộc `guardianInfo`, `schoolInfo`, checklist) (`AID-01`) |
| **AID** | `GET` | `/api/campaigns/:id/checklist` | `STUDENT`, `ADMIN` | Xem cấu hình `documentChecklist` & `dossierPolicy` của chiến dịch (`AID-01`) |
| **AID** | `PUT` | `/api/admin/campaigns/:id/checklist` | `ADMIN` | Cập nhật `documentChecklist` & `dossierPolicy` khi chiến dịch đang `DRAFT` (`AID-01`) |
| **AID** | `GET` | `/api/me/scholarship-applications` | `STUDENT` | Xem hồ sơ học bổng của tôi (ẩn ID nhân viên duyệt) |
| **AID** | `GET` | `/api/me/scholarship-applications/:id` | `STUDENT` | Xem chi tiết hồ sơ của tôi kèm signed URL & tóm tắt bản giấy đã ẩn ID staff (`AID-01`) |
| **AID** | `GET` | `/api/me/scholarship-applications/:id/paper-receipts` | `STUDENT` | Xem trạng thái biên nhận hồ sơ bản giấy của chính mình (ẩn ID staff) (`AID-04`) |
| **AID** | `PATCH` | `/api/me/scholarship-dossiers/:id` | `STUDENT` | Cập nhật hồ sơ khi `DRAFT` hoặc `NEED_MORE_INFORMATION` (`AID-01`) |
| **AID** | `POST` | `/api/me/scholarship-dossiers/:id/submit` | `STUDENT` | Gửi hồ sơ `DRAFT` sang `SUBMITTED` (`AID-01`) |
| **AID** | `POST` | `/api/me/scholarship-dossiers/:id/withdraw` | `STUDENT` | Rút hồ sơ khi chưa duyệt hoàn tất (`AID-01`) |
| **AID** | `POST` | `/api/me/scholarship-applications/:id/resubmit`| `STUDENT`| Bổ sung minh chứng hồ sơ |
| **AID** | `GET` | `/api/me/scholarships` | `STUDENT` | Danh sách học bổng đã được cấp |
| **AID** | `POST` | `/api/enrollments/:id/scholarship-payment` | `STUDENT` | Thanh toán học phí bằng học bổng |
| **AID** | `GET` | `/api/admin/scholarship-applications` | `ADMIN` | Danh sách hồ sơ xin cấp học bổng |
| **AID** | `GET` | `/api/admin/scholarship-applications/:id` | `ADMIN` | Xem hồ sơ, guardianInfo, schoolInfo, checklist và file minh chứng có link ký số |
| **AID** | `POST` | `/api/admin/scholarship-applications/:id/verify-dossier` | `ADMIN` | Xác minh & duyệt hồ sơ phi tài chính (`DOSSIER_VERIFIED`) — KHÔNG tự cấp quỹ/giao dịch (`AID-01`) |
| **AID** | `PATCH` | `/api/admin/scholarship-applications/:id/documents/:documentId/review` | `ADMIN` | Duyệt/từ chối từng minh chứng online (`APPROVED`/`REJECTED`) |
| **AID** | `POST` | `/api/admin/scholarship-applications/:id/approve`| `ADMIN`| Luồng cấp học bổng gộp cũ (tương thích ngược; phân tách với `AID-06` của Tin) |
| **AID** | `POST` | `/api/admin/scholarship-applications/:id/reject` | `ADMIN` | Từ chối hồ sơ |
| **AID** | `POST` | `/api/admin/scholarship-applications/:id/request-information`| `ADMIN`| Yêu cầu bổ sung thông tin |
| **AID** | `POST` | `/api/admin/paper-dossiers` | `ADMIN` | Tiếp nhận biên nhận hồ sơ bản giấy bưu điện (`PaperDossierReceipt`) (`AID-04`) |
| **AID** | `GET` | `/api/admin/paper-dossiers` | `ADMIN` | Danh sách biên nhận hồ sơ bản giấy (`AID-04`) |
| **AID** | `GET` | `/api/admin/paper-dossiers/:id` | `ADMIN` | Chi tiết biên nhận bản giấy + lịch sử tiếp nhận/đối chiếu (`AID-04`) |
| **AID** | `POST` | `/api/admin/paper-dossiers/:id/link` | `ADMIN` | Liên kết biên nhận bản giấy với `ScholarshipApplication` (`AID-04`) |
| **AID** | `POST` | `/api/admin/paper-dossiers/:id/reconcile` | `ADMIN` | Đối chiếu từng mục checklist bản giấy (`IN_RECONCILIATION`/`DISCREPANCY`/`RECONCILED`) (`AID-04`) |
| **AID** | `POST` | `/api/admin/paper-dossiers/:id/reject` | `ADMIN` | Từ chối biên nhận bản giấy (`REJECTED`) (`AID-04`) |
| **AID** | `POST` | `/api/admin/paper-dossiers/:id/cancel` | `ADMIN` | Hủy biên nhận bản giấy nhập sai (`CANCELLED`) (`AID-04`) |

---

## 3. CHI TIẾT TỪNG PHÂN HỆ VÀ REQUEST / RESPONSE MẪU

### 3.1. Phân hệ Curriculum & Catalog (CUR)

#### C01. Lấy danh sách danh mục phẳng (`GET /api/categories`)
- **Actor:** Public
- **Query:** Không yêu cầu
- **Response mẫu (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "66b1a2c3d4e5f6a7b8c9d011",
      "name": "Toán phổ thông",
      "slug": "toan-pho-thong",
      "description": "Các chương trình toán học phổ thông",
      "status": "ACTIVE",
      "allowedGradeLevels": ["GRADE_6", "GRADE_7", "GRADE_8", "GRADE_9"]
    }
  ]
}
```

#### C02. Giảng viên gửi đề xuất khóa học (`POST /api/teacher/course-proposals`)
- **Actor:** `TEACHER` (yêu cầu tài khoản `status: "ACTIVE"` và `verificationStatus: "VERIFIED"`)
- **Request Body:**
```json
{
  "categoryId": "66b1a2c3d4e5f6a7b8c9d011",
  "subjectId": "66b1a2c3d4e5f6a7b8c9d022",
  "title": "Toán hình học không gian 9 nâng cao",
  "description": "Chuyên đề giải toán hình học không gian thi vào lớp 10",
  "learningObjectives": "Thành thạo phương pháp chứng minh tiếp tuyến và tứ giác nội tiếp",
  "syllabus": "Tuần 1-4: Tứ giác nội tiếp; Tuần 5-8: Góc tạo bởi tiếp tuyến và dây cung",
  "level": "ADVANCED",
  "gradeLevel": "GRADE_9",
  "curriculumReference": "Cánh Diều",
  "estimatedDuration": "8 tuần"
}
```
- **Response mẫu (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "66c2b3d4e5f6a7b8c9d0e111",
    "teacherId": "66a0f1e2d3c4b5a6f7e8d901",
    "categoryId": "66b1a2c3d4e5f6a7b8c9d011",
    "subjectId": "66b1a2c3d4e5f6a7b8c9d022",
    "title": "Toán hình học không gian 9 nâng cao",
    "level": "ADVANCED",
    "gradeLevel": "GRADE_9",
    "curriculumReference": "Cánh Diều",
    "status": "PENDING_REVIEW",
    "createdAt": "2026-11-07T15:00:00.000Z"
  }
}
```
- **Lỗi mẫu khi khối lớp không hợp lệ với chuyên mục (400 Bad Request):**
```json
{
  "success": false,
  "error": "GRADE_LEVEL_CATEGORY_MISMATCH",
  "message": "gradeLevel is not allowed for this category",
  "details": {
    "allowedGradeLevels": ["GRADE_6", "GRADE_7", "GRADE_8", "GRADE_9"]
  }
}
```

#### C03. Lấy giáo trình công khai & Quản lý Phiên bản Giáo trình (`CUR-02`)
- **Public (`GET /api/courses/:id/syllabus`):** Trả về phiên bản `PUBLISHED` cùng danh sách `CurriculumUnit` đã ẩn thông tin nội bộ (`publishedBy`, `createdBy`). Nếu khóa học chưa có phiên bản giáo trình, fallback sang `legacySyllabus` (`Course.syllabus`).
```json
{
  "success": true,
  "data": {
    "courseId": "66b1a2c3d4e5f6a7b8c9d033",
    "courseTitle": "Toán 10 – Nền tảng Đại số và Hình học",
    "source": "VERSIONED",
    "version": {
      "id": "66d4e5f6a7b8c9d0e1f2a401",
      "versionNumber": 1,
      "title": "Giáo trình Toán 10 v1",
      "status": "PUBLISHED",
      "publishedAt": "2026-11-09T10:00:00.000Z"
    },
    "units": [
      {
        "id": "66d4e5f6a7b8c9d0e1f2a501",
        "unitOrder": 1,
        "title": "Mệnh đề và Tập hợp",
        "durationMinutes": 90,
        "topics": ["Mệnh đề", "Tập hợp và phép toán"]
      }
    ],
    "legacySyllabus": "1. Mệnh đề và Tập hợp"
  }
}
```
- **Admin Publish (`POST /api/admin/courses/:id/syllabus-versions/:versionId/publish`):** Chuyển `DRAFT` $\rightarrow$ `PUBLISHED` trong transaction (archive bản cũ nếu có, đồng bộ `Course.publishedSyllabusVersionId` và `Course.syllabus`). Bản đã `PUBLISHED` hoặc `ARCHIVED` trả lỗi `409 SYLLABUS_VERSION_IMMUTABLE` khi cố chỉnh sửa nội dung.

---

### 3.2. Phân hệ Learning Management System (LMS)

#### L01. Vào phòng học trực tuyến (`POST /api/sessions/:id/join`)
- **Actor:** `TEACHER` phụ trách hoặc `STUDENT` có đơn `CONFIRMED`
- **Request Body:** Không yêu cầu
- **Response mẫu (200 OK):**
```json
{
  "success": true,
  "data": {
    "sessionId": "66e4d5c6b7a8f9e0d1c2b3a4",
    "roomId": "room_66e4d5c6b7a8f9e0d1c2b3a4",
    "provider": "LIVEKIT",
    "serverUrl": "wss://edunity-live.livekit.cloud",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "role": "PARTICIPANT",
    "expiresAt": "2026-11-07T16:30:00.000Z"
  }
}
```

#### L02. Chặn gọi GET vào endpoint tham gia phòng học (`GET /api/sessions/:id/join`)
- **Response mẫu (405 Method Not Allowed):**
```json
{
  "success": false,
  "error": "METHOD_NOT_ALLOWED",
  "message": "GET method is not allowed for joining a session. Use POST /api/sessions/:id/join instead."
}
```

#### L03. Giảng viên báo cáo sự cố buổi học (`POST /api/teacher/sessions/:id/incident-reports`)
- **Actor:** `TEACHER` chủ buổi học
- **Request Body:**
```json
{
  "incidentType": "INTERNET_FAILURE",
  "description": "Đứt cáp quang khu vực, đường truyền gián đoạn từ 14:10",
  "requestedAction": "RESCHEDULE_SESSION",
  "evidenceFiles": [
    {
      "storageKey": "private/66a0f1/INCIDENT_EVIDENCE/fpt-outage-log.png",
      "originalName": "bao-cao-mang.png",
      "mimeType": "image/png"
    }
  ],
  "proposedSchedule": {
    "startDatetime": "2026-11-08T14:00:00.000Z",
    "endDatetime": "2026-11-08T16:00:00.000Z",
    "title": "Buổi học bù: Toán hình học không gian 9"
  }
}
```
- **Response mẫu (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "66f5e6d7c8b9a0f1e2d3c4b5",
    "sessionId": "66e4d5c6b7a8f9e0d1c2b3a4",
    "incidentType": "INTERNET_FAILURE",
    "requestedAction": "RESCHEDULE_SESSION",
    "reviewStatus": "PENDING",
    "submittedWithinWindow": true,
    "submissionTiming": "DURING_SESSION",
    "evidenceFiles": [
      {
        "storageKey": "private/66a0f1/INCIDENT_EVIDENCE/fpt-outage-log.png",
        "url": "http://localhost:3000/api/files/download?key=...&expires=...&signature=...",
        "urlExpiresAt": "2026-11-07T15:35:00.000Z"
      }
    ]
  }
}
```

---

### 3.3. Phân hệ Financial Aid & Scholarship (AID)

#### A01. Nhà tài trợ khởi tạo khoản đóng góp (`POST /api/campaigns/:id/contributions`)
- **Actor:** `SPONSOR`
- **Request Body:**
```json
{
  "amount": 10000000
}
```
- **Response mẫu (201 Created):**
```json
{
  "success": true,
  "data": {
    "contributionId": "66d4e5f6a7b8c9d0e1f2a3b4",
    "gatewayReference": "SBX-C-1730990400000-9123",
    "amount": "10000000",
    "contributionStatus": "PENDING"
  }
}
```

#### A02. Học viên sử dụng học bổng thanh toán (`POST /api/enrollments/:id/scholarship-payment`)
- **Actor:** `STUDENT` chủ đơn
- **Request Body:** `{ "scholarshipId": "66f6a7b8c9d0e1f2a3b4c5d6" }`
- **Trường hợp chi trả toàn phần (200 OK):**
```json
{
  "success": true,
  "data": {
    "enrollmentId": "66c3d4e5f6a7b8c9d0e1f233",
    "enrollmentStatus": "CONFIRMED",
    "paymentSource": "SCHOLARSHIP",
    "tuitionAmount": "1200000",
    "scholarshipAmount": "1200000",
    "remainingDue": "0",
    "scholarshipId": "66f6a7b8c9d0e1f2a3b4c5d6",
    "scholarshipUsageId": "66a2b3c4d5e6f7a8b9c0d1e2"
  }
}
```
- **Trường hợp chi trả một phần (`MIXED`) (200 OK):**
```json
{
  "success": true,
  "data": {
    "enrollmentId": "66c3d4e5f6a7b8c9d0e1f233",
    "enrollmentStatus": "PENDING_PAYMENT",
    "paymentSource": "MIXED",
    "tuitionAmount": "2000000",
    "scholarshipAmount": "1500000",
    "remainingDue": "500000",
    "scholarshipId": "66f6a7b8c9d0e1f2a3b4c5d6",
    "scholarshipUsageId": "66a2b3c4d5e6f7a8b9c0d1e2",
    "holdExpiresAt": "2026-11-07T15:15:00.000Z"
  }
}
```

---

#### A03. Hồ sơ học bổng phi tài chính (`AID-01` — `POST /api/campaigns/:id/dossiers` & `POST /api/admin/scholarship-applications/:id/verify-dossier`)
- **Student tạo/nộp (`POST /api/campaigns/:id/dossiers`):** Bắt buộc `guardianInfo`, `schoolInfo`, `statement`, `submissionMode` (`ONLINE` / `PAPER` / `HYBRID`) và các chứng từ `storageKey` riêng tư theo `documentChecklist` của Campaign (hoặc `saveAsDraft: true` để lưu nháp `DRAFT`, sau đó bổ sung qua `PATCH /api/me/scholarship-dossiers/:id` và nộp qua `POST /api/me/scholarship-dossiers/:id/submit`).
- **Admin xác minh phi tài chính (`POST /api/admin/scholarship-applications/:id/verify-dossier`):** Kiểm tra đầy đủ `guardianInfo`, `schoolInfo`, checklist online + biên nhận bản giấy đã `RECONCILED`, chuyển trạng thái sang `DOSSIER_VERIFIED` — **tuyệt đối không** tạo `Scholarship`, không tăng `allocatedAmount`, không sinh `Transaction`.

#### A04. Tiếp nhận & Đối chiếu Hồ sơ Bản giấy (`AID-04` — `/api/admin/paper-dossiers*`)
- **Intake (`POST /api/admin/paper-dossiers`):** Lưu `PaperDossierReceipt` gồm `receiptCode`, `postalInfo` (`deliveryMethod`, `carrierName`, `trackingNumber`, `senderName`, `senderPhone`, `sentAt`, `postmarkDate`, `packageCondition`), `receivedBy`, `receivedAt`, `history[]` (`RECEIPT_LOGGED`), liên kết `applicationId` hoặc `applicationCode`.
- **Liên kết & Đối chiếu (`POST /api/admin/paper-dossiers/:id/link`, `/reconcile`, `/reject`, `/cancel`):** Đối chiếu từng mục theo `documentChecklist` của chiến dịch (`MATCHED`, `MISSING`, `MISMATCH`, `DAMAGED`, `NOT_APPLICABLE`), chuyển `IN_RECONCILIATION` $\rightarrow$ `RECONCILED` / `DISCREPANCY`, đồng bộ `checklistProgress` trên `ScholarshipApplication` và ghi append-only `history[]` + `AuditLog`.
- **Student tra cứu (`GET /api/me/scholarship-applications/:id/paper-receipts`):** Chỉ chủ hồ sơ xem được trạng thái tiếp nhận/đối chiếu đã ẩn toàn bộ `receivedBy`, `reconciledBy`, `verifiedBy`, `actorAdminId`.

---

## 4. TƯƠNG THÍCH DỮ LIỆU CŨ VÀ RANH GIỚI LIÊN NHÓM

1. **Ranh giới tài chính an toàn với Châu (Payment / Sponsor / Scholarship):**
   - Khi buổi học bị hủy do lỗi giảng viên hoặc học viên từ chối lịch học bù, LMS chỉ tạo bản ghi `SessionRefundReview` với trạng thái `HOLD_RECOMMENDED`.
   - Tuyệt đối không tự ý cập nhật `Payment`, `Transaction` hay `TeacherEarning`. Mọi thao tác hoàn tiền thực tế phải do quản trị viên tài chính xử lý.

2. **Ranh giới tài chính & học bổng phi tài chính với Tin (`AID-06` & Financial Allocation):**
   - `AID-01` (`POST /api/admin/scholarship-applications/:id/verify-dossier`) và `AID-04` (`PaperDossierReceipt`) chỉ thực hiện tiếp nhận, đối chiếu checklist, xác minh thông tin người giám hộ/trường lớp và chuyển hồ sơ sang `DOSSIER_VERIFIED`.
   - Tuyệt đối KHÔNG tự tạo `Scholarship`, KHÔNG tăng `ScholarshipCampaign.allocatedAmount`, và KHÔNG sinh bản ghi `Transaction` hay `ScholarshipUsage` trong luồng xác minh phi tài chính.
   - Quyết định cấp quỹ (`AID-06`) tiếp tục do phân hệ tài chính của Tin đảm nhiệm ở giai đoạn tiếp theo (dựa trên trạng thái `DOSSIER_VERIFIED`), trong khi endpoint cũ `POST /api/admin/scholarship-applications/:id/approve` được giữ nguyên để tương thích ngược.

3. **Ranh giới bảo mật, JWT, Consent & Storage với Bảo (`AID-08` & `NFR-04`):**
   - Không can thiệp cấu trúc token JWT, `User`, `storageService`, `fileController` hay cơ chế RBAC sẵn có.
   - Tài liệu minh chứng chỉ lưu `storageKey` riêng tư (`POST /api/uploads/private`, `purpose = SCHOLARSHIP_PROOF`) và chỉ cấp signed URL tạm thời cho chủ sở hữu (`STUDENT`) hoặc `ADMIN`. Thông tin `guardianInfo`, `schoolInfo`, tài liệu riêng tư và ID nhân viên (`reviewedBy`, `receivedBy`, `reconciledBy`, `actorAdminId`) bị ẩn khỏi công khai và khỏi tài khoản học sinh.
   - Phụ thuộc `AID-08` (Guardian Consent của Bảo) được kết nối qua cổng fail-closed tại `scholarshipDossierGateService` (`503 CONSENT_DEPENDENCY_BLOCKED` nếu campaign bật `dossierPolicy.requireGuardianConsentForMinor = true` khi chưa tích hợp module consent chính thức); `guardianInfo` của `AID-01` không thay thế cho consent pháp lý `AID-08`.
   - Khi chuyển sang môi trường Production kết nối Cổng thanh toán thật, Bảo sẽ hỗ trợ cấu hình `req.rawBody` để xác thực chữ ký HMAC.

4. **Ghi chú tích hợp giao diện với Băng (Frontend):**
   - Số tiền luôn ở định dạng chuỗi số (`string`).
   - Phân trang luôn bao gồm `items`, `total`, `page`, `pageSize`, `totalPages`.
   - Tuyệt đối không gọi `GET /api/sessions/:id/join`. Bắt buộc dùng `POST /api/sessions/:id/join` để nhận LiveKit room token.

