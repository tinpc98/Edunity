# EDUNITY V3 — SOFT DELETE DOMAIN POLICY MATRIX
**Task ID:** EDUNITY-V3-SOFT-DELETE-ARCHITECTURE-V1  
**Date:** 2026-11-20  
**Branch:** feature/teacher-admin  
**Architect:** Senior Backend Architect / Security & Data Integrity Engineer  

---

## 1. PHÂN LOẠI CHÍNH SÁCH XÓA TOÀN HỆ THỐNG

| Nhóm Chính Sách | Số Lượng Models | Định Nghĩa & Quy Tắc Ứng Xử | Danh Sách Models Thuộc Nhóm |
|---|---|---|---|
| **A. SOFT_DELETE_SUPPORTED** | **10** | Dữ liệu nội dung, danh mục, lớp học, tài liệu giảng dạy và đánh giá. Hỗ trợ chuyển vào Thùng rác (soft delete), ẩn khỏi Public và danh sách quản trị thông thường, kiểm tra quan hệ ràng buộc (dependency checks) trước khi xóa và hỗ trợ Khôi phục (Restore). | `Category`, `Subject`, `Course`, `Class`, `CurriculumUnit`, `LearningPath`, `Review`, `Message`, `SyllabusVersion`, `ScholarshipCampaign` |
| **B. ARCHIVE_OR_DEACTIVATE** | **13** | Dữ liệu có vòng đời nghiệp vụ đặc thù (Lifecycle state machine). Quản lý qua các trạng thái như `SUSPENDED`, `BANNED`, `ARCHIVED`, `CANCELLED`, `EXPIRED`. Không cung cấp thao tác xóa mềm thông thường để tránh phá vỡ quy trình vận hành. | `User`, `CourseProposal`, `CoursePricingPolicy`, `Session`, `TeacherSubjectAuthorization`, `Enrollment`, `ScholarshipApplication`, `Scholarship`, `Notification`, `Conversation`, `PlatformSetting`, `SessionRescheduleRequest`, `PaperDossierReceipt` |
| **C. IMMUTABLE_FINANCIAL_RECORD** | **10** | Dữ liệu tài chính, sổ cái kế toán, ghi nhận doanh thu, thanh toán, đối soát, hoàn tiền. **TUYỆT ĐỐI BẤT KHẢ XÂM PHẠM**. Không cho phép bất kỳ thao tác xóa mềm hay xóa cứng nào. Giữ nguyên vẹn toàn bộ lịch sử giao dịch và đối soát. | `Payment`, `Transaction`, `TeacherEarning`, `TeacherSettlement`, `Payout`, `SponsorContribution`, `ScholarshipUsage`, `RefundCase`, `BankProofRegistry`, `PaymentReconciliation` |
| **D. AUDIT_RETENTION** | **17** | Dữ liệu phục vụ kiểm toán, nhật ký bảo mật, hồ sơ kỷ luật, bằng chứng pháp lý, biên bản sự cố và telemetry. Bắt buộc lưu giữ vĩnh viễn theo chính sách lưu trữ kiểm toán. | `RefreshToken`, `ScheduleIdempotencyKey`, `TeacherScheduleLock`, `SessionAttendance`, `VerificationDocument`, `Report`, `AuditLog`, `SessionPresenceInterval`, `TeacherViolation`, `TeacherDisciplineCase`, `TeacherIncidentReport`, `SessionRefundReview`, `JobLock`, `TeacherContractReviewPacket`, `BankTransferEvent`, `TeacherContract`, `GuardianConsent` |
| **E. NEEDS_OWNER_DECISION** | **0** | Đã được phân loại dứt điểm 100%, không còn model nào tồn đọng. | Không có |

---

## 2. QUY TẮC RÀNG BUỘC PHỤ THUỘC (DEPENDENCY POLICIES) TRONG NHÓM A

### 2.1. CATEGORY (DANH MỤC)
- **Điều kiện XÓA:**
  * Không có bất kỳ `Subject` nào còn tồn tại và chưa xóa thuộc Category (`Subject.countDocuments({ categoryId, isDeleted: { $ne: true } }) === 0`).
  * Không có bất kỳ `Course` nào còn tồn tại và chưa xóa thuộc Category (`Course.countDocuments({ categoryId, isDeleted: { $ne: true } }) === 0`).
  * Nếu vi phạm: Báo lỗi `DEPENDENCY_CONFLICT` (409) kèm số lượng bản ghi liên quan.
- **Điều kiện KHÔI PHỤC:**
  * Slug hoặc tên danh mục không bị trùng lặp với danh mục đang hoạt động (`Category.findOne({ slug: category.slug, isDeleted: { $ne: true } }) === null`).
  * Nếu trùng slug: Báo lỗi `RESTORE_CONFLICT` (409).
  * Khôi phục đưa status về `INACTIVE` để Quản trị viên chủ động bật lại `ACTIVE`.

### 2.2. SUBJECT (MÔN HỌC)
- **Điều kiện XÓA:**
  * Không có `Course` nào thuộc môn học đang tồn tại và chưa xóa (`Course.countDocuments({ subjectId, isDeleted: { $ne: true } }) === 0`).
  * Không có `Class` nào thuộc môn học đang mở hoặc chưa xóa (`Class.countDocuments({ subjectId, isDeleted: { $ne: true } }) === 0`).
  * Nếu vi phạm: Báo lỗi `DEPENDENCY_CONFLICT` (409).
- **Điều kiện KHÔI PHỤC:**
  * Category cha (`categoryId`) phải còn tồn tại và chưa bị xóa mềm.
  * Slug không bị trùng với Subject đang hoạt động.
  * Nếu vi phạm: Báo lỗi `RESTORE_CONFLICT` (409).

### 2.3. COURSE (KHÓA HỌC)
- **Điều kiện XÓA:**
  * Tuân thủ quy trình Safe Delete của `courseCatalogService.deleteCourse`:
    1. Không có bất kỳ `Class` nào gắn với Course (`Class.countDocuments({ courseId }) === 0`).
    2. Không có bất kỳ `Enrollment` nào của học sinh (`Enrollment.countDocuments({ courseId }) === 0`).
    3. Không có hồ sơ tranh chấp tài chính / hoàn tiền (`SessionRefundReview.countDocuments({ courseId }) === 0`).
    4. Không nằm trong chiến dịch học bổng (`ScholarshipCampaign.countDocuments({ courseIds: course._id, isDeleted: { $ne: true } }) === 0`).
    5. Không nằm trong lộ trình học tập (`LearningPath.countDocuments(...) === 0`).
    6. Không có biểu phí đang kích hoạt (`CoursePricingPolicy.countDocuments({ courseId, status: "ACTIVE" }) === 0`).
  * Nếu vi phạm: Báo lỗi `DEPENDENCY_CONFLICT` (409).
- **Điều kiện KHÔI PHỤC:**
  * Subject cha và Category cha phải còn tồn tại và không bị xóa mềm.
  * Slug không bị trùng lặp.
  * Tự động khôi phục các `SyllabusVersion` và `CurriculumUnit` đã bị xóa kèm theo Course.
  * Trạng thái Course phục hồi về `INACTIVE`.

### 2.4. CLASS (LỚP HỌC) — BẢO VỆ TUYỆT ĐỐI HỌC VIÊN & TÀI CHÍNH
- **Điều kiện XÓA:**
  * Lớp học KHÔNG ĐƯỢC CÓ bất kỳ học sinh nào đã xác nhận ghi danh hoặc hoàn tất thanh toán (`Enrollment.countDocuments({ classId, enrollmentStatus: { $in: ["CONFIRMED", "COMPLETED", "PENDING_PAYMENT"] } }) === 0`).
  * Lớp học KHÔNG ĐƯỢC ở trạng thái đang diễn ra (`status !== "IN_PROGRESS"`).
  * Lớp học không có khiếu nại tài chính / buổi học chưa giải quyết.
  * Chỉ cho phép xóa mềm lớp `DRAFT`, `PENDING_APPROVAL`, `REJECTED`, hoặc `OPEN` chưa có ai đăng ký giữ chỗ.
  * Khi xóa, chuyển `status = "CANCELLED"`, hủy các `Session` tương ứng, ghi nhận `deleteReason`.
- **Điều kiện KHÔI PHỤC:**
  * Course cha phải còn tồn tại và chưa bị xóa mềm.
  * Nếu ngày khai giảng (`startDate`) đã qua trong quá khứ, lớp phục hồi về `DRAFT` để giáo viên/admin lên lại lịch học mới, không được phục hồi thành `OPEN`.

### 2.5. REVIEW (ĐÁNH GIÁ)
- **Điều kiện XÓA:**
  * Dành cho Admin gỡ bỏ bình luận mang tính xúc phạm, quảng cáo, vi phạm quy tắc cộng đồng.
  * Ghi nhận `deleteReason`, `deletedBy`, `deletedAt`.
- **Điều kiện KHÔI PHỤC:**
  * Enrollment và Class gốc vẫn còn tồn tại.
  * Khôi phục hiển thị đánh giá và cập nhật lại điểm đánh giá trung bình.

---

## 3. BẢO VỆ PHÂN VÙNG TÀI CHÍNH (FINANCIAL IMMUTABILITY GUARANTEE)

Hệ thống cam kết tuyệt đối:
1. KHÔNG thêm bất kỳ API xóa mềm hay nút bấm Thùng rác nào cho:
   - `Payment`
   - `Transaction`
   - `TeacherEarning`
   - `TeacherSettlement`
   - `Payout`
   - `RefundCase`
   - `BankProofRegistry`
   - `PaymentReconciliation`
   - `SponsorContribution`
2. Việc xóa mềm một Class hoặc Course không được phép xóa (cascade delete) dữ liệu tài chính.
3. Toàn bộ các bản ghi đối soát thực tế 2 lần chuyển khoản 3.000đ (Order 100000008, Order 100000009) được bảo toàn nguyên vẹn 100%.
