# EDUNITY V3 — SOFT DELETE ARCHITECTURE: MODEL INVENTORY
**Task ID:** EDUNITY-V3-SOFT-DELETE-ARCHITECTURE-V1  
**Date:** 2026-11-20  
**Branch:** feature/teacher-admin  
**Architect:** Senior Backend Architect / MongoDB Specialist  

---

## 1. TỔNG QUAN
Qua kiểm tra toàn bộ thư mục `BackEnd/src/models/` và tập tin `BackEnd/src/models/index.js`, hệ thống EDUNITY V3 hiện có đúng **50 Mongoose Models** đang hoạt động.

Hệ thống đã có sẵn `softDeletePlugin` tại `BackEnd/src/models/plugins.js` cung cấp 3 trường:
- `isDeleted`: Boolean (default: false, indexed)
- `deletedAt`: Date (default: null)
- `deletedBy`: ObjectId ref "User" (default: null)

Trong task này, plugin được nâng cấp đồng bộ thêm trường:
- `deleteReason`: String (default: null)

Các truy vấn dữ liệu hiện tại trong service đã và đang áp dụng chuẩn quy ước:
`const NOT_DELETED = { isDeleted: { $ne: true } };`
giúp các document cũ (legacy document chưa có trường `isDeleted`) không bị ẩn nhầm.

---

## 2. BẢNG KIỂM KÊ TOÀN BỘ 50 MODELS (MODEL INVENTORY TABLE)

| # | Model | Collection | Existing Delete Fields | Existing Delete API | Current Deletion Behavior | Dependencies | Financial/Legal Sensitivity | Recommended Deletion Policy | Owner | Implementation Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `User` | `users` | `isDeleted`, `deletedAt`, `deletedBy` | Không có API hard delete | Deactivate via status (`SUSPENDED`, `BANNED`) | Toàn bộ hệ thống | Rất cao (Auth, KYC) | `ARCHIVE_OR_DEACTIVATE` | BẢO | Đã có status & soft delete plugin |
| 2 | `RefreshToken` | `refreshtokens` | Không | `revokeAllForUser` | Thu hồi / hết hạn TTL | User | Trung bình (Auth Token) | `AUDIT_RETENTION` | BẢO | Lifecycle token |
| 3 | `Category` | `categories` | `isDeleted`, `deletedAt`, `deletedBy` | Chưa có | Không cho xóa | Subject, Course | Thấp | `SOFT_DELETE_SUPPORTED` | CHÂU | Triển khai trong task này |
| 4 | `Subject` | `subjects` | `isDeleted`, `deletedAt`, `deletedBy` | Chưa có | Không cho xóa | Category (cha), Course, Class | Thấp | `SOFT_DELETE_SUPPORTED` | CHÂU | Triển khai trong task này |
| 5 | `Course` | `courses` | `isDeleted`, `deletedAt`, `deletedBy` | `DELETE /admin/courses/:id` | Soft delete an toàn với dependency guards | Subject, Class, PricingPolicy | Trung bình | `SOFT_DELETE_SUPPORTED` | CHÂU | Đã có delete, bổ sung restore & deleteReason |
| 6 | `CourseProposal` | `courseproposals` | Không | Không | Workflow trạng thái (Approve/Reject) | Course, Teacher | Thấp | `ARCHIVE_OR_DEACTIVATE` | CHÂU | State machine |
| 7 | `SyllabusVersion` | `syllabusversions` | `isDeleted`, `deletedAt`, `deletedBy` | Cascade theo Course | Quản lý phiên bản (Draft, Published, Archived) | Course | Thấp | `SOFT_DELETE_SUPPORTED` | CHÂU | Đã có soft delete |
| 8 | `CurriculumUnit` | `curriculumunits` | `isDeleted`, `deletedAt`, `deletedBy` | `DELETE .../units/:id` | Soft delete unit | SyllabusVersion | Thấp | `SOFT_DELETE_SUPPORTED` | CHÂU | Đã có soft delete |
| 9 | `LearningPath` | `learningpaths` | `isDeleted`, `deletedAt`, `deletedBy` | `DELETE /admin/learning-paths/:id` | Soft delete lộ trình | Course | Thấp | `SOFT_DELETE_SUPPORTED` | CHÂU | Đã có soft delete |
| 10 | `CoursePricingPolicy` | `coursepricingpolicies` | Không | Không | Phiên bản chính sách (Active/Inactive) | Course | Cao (Tài chính/Biểu phí) | `ARCHIVE_OR_DEACTIVATE` | TÍN / CHÂU | Versioned Policy |
| 11 | `Class` | `classes` | `isDeleted`, `deletedAt`, `deletedBy` | Chưa có | Không cho xóa trực tiếp | Course, Teacher, Enrollment, Payment | Rất cao (Tài chính & Học sinh) | `SOFT_DELETE_SUPPORTED` (Guarded) | CHÂU / TÍN | Triển khai trong task này |
| 12 | `Session` | `sessions` | Không | `DELETE /teacher/sessions/:id` | Hard delete session nháp hoặc Cancel | Class | Trung bình | `ARCHIVE_OR_DEACTIVATE` | CHÂU | Managed by Class |
| 13 | `ScheduleIdempotencyKey` | `scheduleidempotencykeys` | Không | Không | TTL Lock tự giải phóng | Session | Thấp (Kỹ thuật) | `AUDIT_RETENTION` | CHÂU | Technical Lock |
| 14 | `TeacherScheduleLock` | `teacherschedulelocks` | Không | Không | Mutex phân tán | Teacher | Thấp (Kỹ thuật) | `AUDIT_RETENTION` | CHÂU | Technical Lock |
| 15 | `TeacherSubjectAuthorization` | `teachersubjectauthorizations` | Không | Không | Approve / Suspend | Teacher, Subject | Trung bình | `ARCHIVE_OR_DEACTIVATE` | CHÂU | Authorization state |
| 16 | `SessionAttendance` | `sessionattendances` | Không | Không | Điểm danh học sinh | Session, Student | Cao (Học vụ) | `AUDIT_RETENTION` | CHÂU | Immutable record |
| 17 | `Enrollment` | `enrollments` | Không | Không | Lifecycle (Pending, Confirmed, Expired, Cancelled) | Class, Student, Payment | Cực kỳ cao (Học vụ & Quyền vào lớp) | `ARCHIVE_OR_DEACTIVATE` | TÍN / CHÂU | Protected Domain |
| 18 | `Payment` | `payments` | Không | Không | Sổ cái thanh toán payOS (Pending, Completed, Expired) | Enrollment, User | Bất khả xâm phạm | `IMMUTABLE_FINANCIAL_RECORD` | TÍN | Protected Domain |
| 19 | `Transaction` | `transactions` | Không | Không | Sổ cái bút toán kép | Payment, User, Ledger | Bất khả xâm phạm | `IMMUTABLE_FINANCIAL_RECORD` | TÍN | Protected Domain |
| 20 | `TeacherEarning` | `teacherearnings` | Không | Không | Ghi nhận doanh thu & hoa hồng | Class, Teacher, Enrollment | Bất khả xâm phạm | `IMMUTABLE_FINANCIAL_RECORD` | TÍN | Protected Domain |
| 21 | `TeacherSettlement` | `teachersettlements` | Không | Không | Đợt quyết toán tài chính | Teacher, TeacherEarning | Bất khả xâm phạm | `IMMUTABLE_FINANCIAL_RECORD` | TÍN | Protected Domain |
| 22 | `Payout` | `payouts` | Không | Không | Lệnh chi trả ngân hàng | Teacher, TeacherSettlement | Bất khả xâm phạm | `IMMUTABLE_FINANCIAL_RECORD` | TÍN | Protected Domain |
| 23 | `Review` | `reviews` | `isDeleted`, `deletedAt`, `deletedBy` | Chưa có | Admin gỡ đánh giá vi phạm | Class, Enrollment, User | Thấp | `SOFT_DELETE_SUPPORTED` | BĂNG / CHÂU | Triển khai trong task này |
| 24 | `ScholarshipCampaign` | `scholarshipcampaigns` | `isDeleted`, `deletedAt`, `deletedBy` | Không | Ẩn campaign lỗi/nháp | Sponsor, Course | Cao (Quỹ tài trợ) | `SOFT_DELETE_SUPPORTED` (Guarded) | TÍN / CHÂU | Đã có soft delete |
| 25 | `SponsorContribution` | `sponsorcontributions` | Không | Không | Sổ cái đóng góp tài trợ | Campaign, Sponsor | Bất khả xâm phạm | `IMMUTABLE_FINANCIAL_RECORD` | TÍN | Protected Domain |
| 26 | `ScholarshipApplication` | `scholarshipapplications` | Không | Không | Hồ sơ xét duyệt học bổng | Campaign, Student | Cao (Hồ sơ pháp lý) | `ARCHIVE_OR_DEACTIVATE` | BẢO / TÍN | Workflow lifecycle |
| 27 | `PaperDossierReceipt` | `paperdossierreceipts` | Không | Không | Biên nhận hồ sơ giấy | Application, Admin | Cao (Pháp lý) | `AUDIT_RETENTION` | BẢO | Legal document |
| 28 | `Scholarship` | `scholarships` | Không | Không | Quyết định cấp học bổng | Student, Campaign | Cao (Tài chính) | `ARCHIVE_OR_DEACTIVATE` | TÍN | Financial grant |
| 29 | `ScholarshipUsage` | `scholarshipusages` | Không | Không | Khấu trừ học bổng vào học phí | Scholarship, Enrollment | Bất khả xâm phạm | `IMMUTABLE_FINANCIAL_RECORD` | TÍN | Protected Domain |
| 30 | `VerificationDocument` | `verificationdocuments` | Không | `deleteMany` (khi submit lại) | Lưu trữ bằng cấp, căn cước KYC | Teacher, Sponsor | Cao (KYC / PII) | `AUDIT_RETENTION` | BẢO | KYC document |
| 31 | `Notification` | `notifications` | Không | Không | Đánh dấu đã đọc / chưa đọc | User | Thấp | `ARCHIVE_OR_DEACTIVATE` | BĂNG | Notification state |
| 32 | `Conversation` | `conversations` | Không | Không | Đoạn hội thoại tin nhắn | User | Thấp | `ARCHIVE_OR_DEACTIVATE` | BĂNG | Chat thread |
| 33 | `Message` | `messages` | `isDeleted`, `deletedAt`, `deletedBy` | `DELETE /messages/:id` | Thu hồi tin nhắn chat | Conversation, User | Thấp | `SOFT_DELETE_SUPPORTED` | BĂNG | Đã có soft delete |
| 34 | `Report` | `reports` | Không | Không | Xử lý khiếu nại (Open, Resolved) | User, Class | Cao (Kiểm toán khiếu nại) | `AUDIT_RETENTION` | BẢO | Audit incident |
| 35 | `AuditLog` | `auditlogs` | Không | Không | Lưu nhật ký quản trị | Admin, Target Entity | Bất khả xâm phạm | `AUDIT_RETENTION` | TÍN / BẢO | Audit trail |
| 36 | `PlatformSetting` | `platformsettings` | Không | Không | Cấu hình tham số hệ thống | Admin | Cao (Vận hành) | `ARCHIVE_OR_DEACTIVATE` | TÍN | Config key-value |
| 37 | `SessionPresenceInterval` | `sessionpresenceintervals` | Không | Không | Telemetry tham gia lớp học live | Session, User | Thấp | `AUDIT_RETENTION` | CHÂU | Telemetry data |
| 38 | `TeacherViolation` | `teacherviolations` | Không | Không | Biên bản vi phạm sư phạm | Teacher, Admin | Cao (Kỷ luật) | `AUDIT_RETENTION` | CHÂU | Disciplinary record |
| 39 | `TeacherDisciplineCase` | `teacherdisciplinecases` | Không | Không | Hồ sơ kỷ luật giảng viên | Teacher, Violation | Cao (Kỷ luật) | `AUDIT_RETENTION` | CHÂU | Disciplinary record |
| 40 | `TeacherIncidentReport` | `teacherincidentreports` | Không | Không | Sự cố kỹ thuật buổi học | Session, Teacher | Cao (Sự cố) | `AUDIT_RETENTION` | CHÂU | Incident record |
| 41 | `SessionRescheduleRequest` | `sessionreschedulerequests` | Không | Không | Đề xuất đổi lịch học | Session, Teacher, Student | Trung bình | `ARCHIVE_OR_DEACTIVATE` | CHÂU | Workflow |
| 42 | `SessionRefundReview` | `sessionrefundreviews` | Không | Không | Hồ sơ xét duyệt hoàn tiền buổi học | Session, Course, Class | Cao (Tài chính) | `AUDIT_RETENTION` | TÍN | Financial dispute |
| 43 | `JobLock` | `joblocks` | Không | `deleteOne` | Khóa distributed cronjob | System | Thấp | `AUDIT_RETENTION` | TÍN | Distributed Lock |
| 44 | `TeacherContractReviewPacket` | `teachercontractreviewpackets` | Không | Không | Hồ sơ duyệt hợp đồng giảng dạy | Teacher, Admin | Cao (Pháp lý) | `AUDIT_RETENTION` | CHÂU | Contract review |
| 45 | `BankTransferEvent` | `banktransferevents` | Không | Không | Nhật ký webhook ngân hàng gốc | Payment, payOS | Bất khả xâm phạm | `AUDIT_RETENTION` | TÍN | Webhook audit |
| 46 | `PaymentReconciliation` | `paymentreconciliations` | Không | Không | Nhật ký đối soát tài chính tự động | OrderCode, Payment | Bất khả xâm phạm | `AUDIT_RETENTION` | TÍN | Reconciliation audit |
| 47 | `RefundCase` | `refundcases` | Không | Không | Quản lý vụ việc hoàn tiền học phí | Payment, OrderCode, Student | Bất khả xâm phạm | `IMMUTABLE_FINANCIAL_RECORD` | TÍN | Financial recovery |
| 48 | `BankProofRegistry` | `bankproofregistries` | Không | Không | Sổ bộ ủy nhiệm chi / chứng từ chuyển khoản | BankTransferEvent | Bất khả xâm phạm | `IMMUTABLE_FINANCIAL_RECORD` | TÍN | Financial proof |
| 49 | `TeacherContract` | `teachercontracts` | Không | Không | Hợp đồng điện tử e-Contract | Teacher | Rất cao (Pháp lý) | `AUDIT_RETENTION` | CHÂU / BẢO | Legal contract |
| 50 | `GuardianConsent` | `guardianconsents` | Không | Không | Cam kết phụ huynh cho trẻ vị thành niên | Student, Guardian | Rất cao (Pháp lý) | `AUDIT_RETENTION` | BẢO | Legal consent |
