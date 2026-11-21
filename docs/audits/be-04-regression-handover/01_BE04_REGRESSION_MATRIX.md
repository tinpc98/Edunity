# MA TRẬN KIỂM ĐỊNH HỒI QUY TOÀN DIỆN (BE-04.1 — REGRESSION MATRIX)

**Dự án:** EDUNITY V3 — Backend  
**Giai đoạn:** Phase 4 — Final Backend Regression & Go/No-Go Audit  
**Chịu trách nhiệm:** Senior Backend Engineer / Backend QA (Châu)  
**Ngày thực hiện:** 20/11/2026  
**Chế độ:** AUDIT READ-ONLY — KHÔNG SỬA CODE  

---

## 1. TỔNG QUAN PHẠM VI KIỂM ĐỊNH

Tài liệu này tổng hợp ma trận kiểm định hồi quy toàn diện cho 3 task backend vừa hoàn thành:
- **BE-01:** Quy trình yêu cầu chỉnh sửa lớp học (`NEED_CHANGES` Workflow & Terminal `REJECTED`).
- **BE-02:** Tự động từ chối lớp học quá hạn khai giảng (`Automatic Class Expiration Rejection`).
- **BE-03:** Cơ chế xóa mềm và bảo vệ an toàn phụ thuộc học thuật (`Academic Soft Delete & Dependency Safety`).

---

## 2. MA TRẬN VÒNG ĐỜI TRẠNG THÁI LỚP HỌC (CLASS STATE MACHINE MATRIX)

Hệ thống quản lý trạng thái của lớp học (`Class.status`) tuân thủ nghiêm ngặt mô hình máy trạng thái hữu hạn (FSM) dưới đây:

| Trạng thái hiện tại | Thao tác kích hoạt | Actor | Endpoint API | Trạng thái tiếp theo | Điều kiện kiểm tra / Governance Gates | Audit Action | Kết quả kiểm định |
|---|---|---|---|---|---|---|:---:|
| `(None)` | Tạo mới lớp học | TEACHER | `POST /api/teacher/classes` | `DRAFT` | Giáo viên ACTIVE & VERIFIED; Khóa học ACTIVE; Không soft-deleted; Phân quyền TEA-07 hợp lệ; Chính sách giá CUR-07 hợp lệ | `(None)` | **PASS** |
| `DRAFT` | Chỉnh sửa lớp học | TEACHER | `PATCH /api/teacher/classes/:id` | `DRAFT` | Chỉ lớp do chính giáo viên tạo (`teacherId`); Trạng thái thuộc `EDITABLE_STATUSES` (`DRAFT`, `NEED_CHANGES`); Validate input nghiêm ngặt | `(None)` | **PASS** |
| `DRAFT` | Gửi duyệt lớp học | TEACHER | `POST /api/teacher/classes/:id/submit` | `PENDING_APPROVAL` | Điền đủ trường bắt buộc (mô tả, ngày tuyển sinh/khai giảng/kết thúc, lịch học); Có ít nhất 1 session hợp lệ; Align môn học & phân quyền TEA-07; Ký hợp đồng TEA-12 | `(None)` (Thông báo Admin) | **PASS** |
| `PENDING_APPROVAL` | Yêu cầu sửa đổi | ADMIN | `POST /api/admin/classes/:id/request-changes` | `NEED_CHANGES` | `reviewNote` bắt buộc không được để trống; Lớp đang ở `PENDING_APPROVAL`; Không bị soft-deleted | `CLASS_CHANGES_REQUESTED` | **PASS** |
| `NEED_CHANGES` | Giáo viên chỉnh sửa | TEACHER | `PATCH /api/teacher/classes/:id` | `NEED_CHANGES` | Chỉ giáo viên phụ trách (`teacherId`); Thuộc `EDITABLE_STATUSES`; Re-check schema & snapshot | `(None)` | **PASS** |
| `NEED_CHANGES` | Gửi duyệt lại | TEACHER | `POST /api/teacher/classes/:id/submit` | `PENDING_APPROVAL` | Tái kiểm tra tính đầy đủ và các governance gates; Thông báo Admin | `(None)` (Thông báo Admin) | **PASS** |
| `PENDING_APPROVAL` | Phê duyệt lớp | ADMIN | `POST /api/admin/classes/:id/approve` | `OPEN` | Re-check toàn bộ governance gates; Chốt snapshot phiên bản giáo trình (`syllabusVersionId`) và giá (`pricingPolicyVersion`) | `CLASS_APPROVED` | **PASS** |
| `PENDING_APPROVAL` | Từ chối lớp học | ADMIN | `POST /api/admin/classes/:id/reject` | `REJECTED` | Lớp đang ở `PENDING_APPROVAL`; Ghi nhận `reviewNote` và `reviewedBy` | `CLASS_REJECTED` | **PASS** |
| `PENDING_APPROVAL` | Tự động từ chối khi đến ngày khai giảng | SYSTEM (Job) | `runMaintenanceJob` / `rejectExpiredPendingClasses` | `REJECTED` | `startDate` theo múi giờ hệ thống (`APP_TZ_OFFSET_MINUTES`) đã đến hoặc quá hạn mà chưa được Admin duyệt | `CLASS_EXPIRED_REJECTED` (`actorType: SYSTEM`) | **PASS** |
| `REJECTED` *(Terminal)* | Thử chỉnh sửa | TEACHER | `PATCH /api/teacher/classes/:id` | *(Bị chặn)* | Hệ thống từ chối `409 CLASS_NOT_EDITABLE` do `REJECTED` không nằm trong `EDITABLE_STATUSES` | `(None)` | **PASS** |
| `REJECTED` *(Terminal)* | Thử gửi duyệt lại | TEACHER | `POST /api/teacher/classes/:id/submit` | *(Bị chặn)* | Hệ thống từ chối `409 CLASS_NOT_SUBMITTABLE` | `(None)` | **PASS** |
| `REJECTED` *(Terminal)* | Thử phê duyệt | ADMIN | `POST /api/admin/classes/:id/approve` | *(Bị chặn)* | Hệ thống từ chối `409 CLASS_NOT_PENDING_APPROVAL` | `(None)` | **PASS** |
| `REJECTED` *(Terminal)* | Thử yêu cầu sửa | ADMIN | `POST /api/admin/classes/:id/request-changes` | *(Bị chặn)* | Hệ thống từ chối `409 CLASS_NOT_PENDING_APPROVAL` | `(None)` | **PASS** |
| `REJECTED` *(Terminal)* | Thử từ chối lại | ADMIN | `POST /api/admin/classes/:id/reject` | *(Bị chặn)* | Hệ thống từ chối `409 CLASS_NOT_PENDING_APPROVAL` | `(None)` | **PASS** |

---

## 3. MA TRẬN KIỂM ĐỊNH MAINTENANCE JOB (BE-02)

| Kịch bản kiểm tra | Điều kiện đầu vào | Hành vi kỳ vọng | Cơ chế bảo vệ kỹ thuật | Trạng thái |
|---|---|---|---|:---:|
| **Lớp PENDING_APPROVAL quá hạn** | Lớp có `status: "PENDING_APPROVAL"`, `startDate` <= ngày hiện tại theo timezone (+07:00) | Chuyển `REJECTED`, ghi reviewNote giải thích, ghi AuditLog SYSTEM, gửi notification đến giáo viên | `isClassStartDateReached` tính toán ngày lịch địa phương chính xác | **PASS** |
| **Lớp PENDING_APPROVAL chưa đến hạn** | `startDate` là ngày mai hoặc tương lai | Không xử lý, lớp giữ nguyên `PENDING_APPROVAL` | So sánh chuỗi ngày `YYYY-MM-DD` tại timezone cấu hình | **PASS** |
| **Lớp NEED_CHANGES đến ngày khai giảng** | `status: "NEED_CHANGES"`, `startDate` <= ngày hiện tại | Không được tự động từ chối (giữ nguyên quyền sửa đổi của giáo viên) | Query chỉ lọc `{ status: "PENDING_APPROVAL" }` | **PASS** |
| **Lớp DRAFT / OPEN / CANCELLED** | Các trạng thái khác có `startDate` trong quá khứ | Tuyệt đối không can thiệp | Bộ lọc trạng thái nghiêm ngặt | **PASS** |
| **Chạy lặp lại (Idempotency)** | Job chạy 2 lần liên tiếp trên cùng dữ liệu | Lần 2 trả về `rejectedCount: 0`, không ném lỗi, không spam thông báo | `findOneAndUpdate({ status: "PENDING_APPROVAL" })` và `dedupeKey` | **PASS** |
| **Tranh chấp với thao tác của Admin** | Admin Approve/Reject đồng thời khi Job đang chạy | Update nào đến trước được commit, update sau nhận `null` và bỏ qua an toàn | Conditional atomic update của MongoDB | **PASS** |
| **Cách ly lỗi (Error Isolation)** | 1 lớp bị lỗi kết nối DB tạm thời | Lớp lỗi được ghi nhận vào mảng `errors`, job tiếp tục xử lý các lớp còn lại | Khối `try...catch` bên trong vòng lặp candidate | **PASS** |

---

## 4. MA TRẬN XÓA MỀM VÀ AN TOÀN PHỤ THUỘC (BE-03)

| Thực thể | API Endpoint | Phụ thuộc kiểm tra trước khi xóa | Mã lỗi khi vi phạm | Hành vi khi hợp lệ | Audit Action | Kết quả |
|---|---|---|---|---|---|:---:|
| **Category** | `DELETE /admin/categories/:id` | • `Subject` (non-deleted)<br>• `Course` (non-deleted)<br>• `Class` (non-deleted)<br>• `LearningPath`<br>• `ScholarshipCampaign`<br>• `CoursePricingPolicy` (ACTIVE) | `409 CATEGORY_HAS_SUBJECTS`<br>`409 CATEGORY_HAS_COURSES`<br>`409 CATEGORY_HAS_CLASSES`<br>`409 CATEGORY_IN_LEARNING_PATH`<br>`409 CATEGORY_IN_SCHOLARSHIP_CAMPAIGN` | `isDeleted = true`<br>`status = "INACTIVE"`<br>`deletedAt = now`<br>`deletedBy = adminId`<br>*(Bản ghi còn nguyên trên DB)* | `CATEGORY_SOFT_DELETED` | **PASS** |
| **Subject** | `DELETE /admin/subjects/:id` | • `Course` (non-deleted)<br>• `Class` (non-deleted)<br>• `TeacherSubjectAuthorization` (PENDING/APPROVED)<br>• `ScholarshipCampaign`<br>• `CourseProposal` (PENDING/CHANGES_REQUESTED)<br>• `CoursePricingPolicy` (ACTIVE) | `409 SUBJECT_HAS_COURSES`<br>`409 SUBJECT_HAS_CLASSES`<br>`409 SUBJECT_HAS_TEACHER_AUTHORIZATIONS`<br>`409 SUBJECT_IN_SCHOLARSHIP_CAMPAIGN`<br>`409 SUBJECT_HAS_COURSE_PROPOSALS` | `isDeleted = true`<br>`status = "INACTIVE"`<br>`deletedAt = now`<br>`deletedBy = adminId`<br>*(Bản ghi còn nguyên trên DB)* | `SUBJECT_SOFT_DELETED` | **PASS** |
| **Course** | `DELETE /admin/courses/:id` | • `Class` (non-deleted)<br>• `Enrollment`<br>• `SessionRefundReview`<br>• `ScholarshipCampaign`<br>• `LearningPath`<br>• `CoursePricingPolicy` (ACTIVE) | `409 COURSE_HAS_CLASSES`<br>`409 COURSE_HAS_ENROLLMENTS`<br>`409 COURSE_HAS_REFUND_REVIEWS`<br>`409 COURSE_IN_SCHOLARSHIP_CAMPAIGN`<br>`409 COURSE_IN_LEARNING_PATH` | Soft-delete nguyên tử Course + mọi `SyllabusVersion` + mọi `CurriculumUnit` trong Transaction | `COURSE_SOFT_DELETED` | **PASS** |

---

## 5. MA TRẬN AN TOÀN TRUY VẤN PUBLIC & ADMIN (QUERY SAFETY MATRIX)

| API Route | Phương thức | Dữ liệu trả về | Xử lý bản ghi đã xóa mềm (`isDeleted: true`) | Trạng thái kiểm định |
|---|---|---|---|:---:|
| `/api/categories` | `GET` | Danh mục công khai | Tự động loại bỏ (`...NOT_DELETED`), không hiển thị | **PASS** |
| `/api/categories/:id/subjects` | `GET` | Môn học theo danh mục | Trả `404 CATEGORY_NOT_FOUND` nếu Category đã xóa mềm; Tự động loại bỏ Subject đã xóa mềm | **PASS** |
| `/api/subjects/:id` | `GET` | Chi tiết môn học | Trả `404 SUBJECT_NOT_FOUND` nếu Subject đã xóa mềm; Chỉ trả về danh sách Course ACTIVE chưa xóa | **PASS** |
| `/api/courses` | `GET` | Tìm kiếm khóa học | Tự động loại bỏ (`...NOT_DELETED`), không lộ khóa học đã xóa | **PASS** |
| `/api/admin/courses` | `GET` | Danh sách quản trị khóa học | Tự động áp dụng `...NOT_DELETED` ở tầng base filter | **PASS** |
| `/api/admin/courses/:id` | `GET` | Chi tiết khóa học quản trị | Trả `404 COURSE_NOT_FOUND` nếu Course đã xóa mềm | **PASS** |
| `/api/classes/:id/syllabus` | `GET` | Giáo trình gắn lớp học | Trả `404 CLASS_NOT_FOUND` nếu Class đã xóa mềm; Kiểm tra RBAC chặt chẽ với trạng thái `NEED_CHANGES` và `REJECTED` | **PASS** |

---

## 6. KẾT LUẬN MA TRẬN HỒI QUY

Toàn bộ 100% các nhánh rẽ nghiệp vụ, điều kiện chuyển đổi trạng thái, cơ chế bắt lỗi phụ thuộc và bộ lọc an toàn truy vấn đều hoạt động chính xác theo đúng đặc tả kiến trúc Edunity V3. Không phát hiện bất kỳ xung đột hoặc hồi quy tiêu cực nào.
