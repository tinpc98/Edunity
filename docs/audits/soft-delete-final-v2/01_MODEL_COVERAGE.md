# EDUNITY V3 — SOFT DELETE FINALIZATION & PERMANENT DELETE
## Tài liệu 01: Bảng Kiểm kê và Độ Bao phủ Toàn diện của Models (Model Coverage)

**Mã tác vụ:** `EDUNITY-V3-SOFT-DELETE-FINAL-V2`  
**Nhánh làm việc:** `feature/teacher-admin`  
**Ngày thực hiện:** 21/11/2026  
**Chủ quản:** TÍN — ADMIN UI / SOFT DELETE INTEGRATION  

---

### 1. Tổng quan Kiểm kê Toàn hệ thống
Hệ thống EDUNITY V3 hiện có đúng **50 Mongoose Models** tại `BackEnd/src/models/`.  
Tất cả các model được phân loại nghiêm ngặt theo chính sách quản lý vòng đời dữ liệu:
- **`SOFT_DELETE_SUPPORTED`**: Cho phép xóa mềm đưa vào Thùng rác và khôi phục hoặc xóa vĩnh viễn có điều kiện.
- **`ARCHIVE_OR_DEACTIVATE`**: Quản lý theo vòng đời nghiệp vụ (Active, Inactive, Suspended, Cancelled, Closed).
- **`IMMUTABLE_FINANCIAL_RECORD`**: Dữ liệu tài chính bất khả xâm phạm, tuyệt đối không được xóa mềm hay xóa cứng.
- **`AUDIT_RETENTION`**: Dữ liệu kiểm toán, pháp lý, telemetry hoặc nhật ký hệ thống lưu trữ phục vụ truy vết.

---

### 2. Danh mục 5 Models Cốt lõi Quản lý trong Thùng rác (Admin Trash)

Hệ thống Thùng rác Admin (`/admin/trash`) hiện hỗ trợ trọn vẹn 3 thao tác: **Xem danh sách $\rightarrow$ Khôi phục $\rightarrow$ Xóa vĩnh viễn có kiểm soát** cho 5 thực thể cốt lõi:

| STT | Model | Thuộc tính Soft Delete | Hỗ trợ Xóa mềm | Hỗ trợ Khôi phục | Hỗ trợ Xóa vĩnh viễn | Ràng buộc Domain chính |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `Category` | `isDeleted`, `deletedAt`, `deletedBy`, `deleteReason` | Có | Có (`INACTIVE`) | **Có** (Chặn nếu còn Subject, Course, LearningPath) | Quản lý danh mục |
| 2 | `Subject` | `isDeleted`, `deletedAt`, `deletedBy`, `deleteReason` | Có | Có (`INACTIVE`) | **Có** (Chặn nếu còn Course, Class, TeacherSubjectAuthorization) | Môn học học thuật |
| 3 | `Course` | `isDeleted`, `deletedAt`, `deletedBy`, `deleteReason` | Có | Có (`INACTIVE`) | **Có** (Chặn nếu còn Class, Enrollment, RefundReview, Campaign, PricingPolicy) | Khóa học đào tạo |
| 4 | `Class` | `isDeleted`, `deletedAt`, `deletedBy`, `deleteReason` | Có | Có (`DRAFT`) | **Có** (Chặn TUYỆT ĐỐI nếu có Enrollment, Payment, TeacherEarning, RefundCase, Attendance) | Lớp học giảng dạy |
| 5 | `Review` | `isDeleted`, `deletedAt`, `deletedBy`, `deleteReason` | Có | Có (`PUBLISHED`) | **Có** (Chặn nếu còn Report / Khiếu nại mở) | Đánh giá học viên |

---

### 3. Đánh giá Chi tiết 5 Model Bổ sung từ Phase 1 Inventory

Theo yêu cầu mục XII, chúng tôi đã rà soát và xác định chính sách chính xác cho từng model:

#### 1. `CurriculumUnit`
- **Quan hệ:** Trực thuộc `SyllabusVersion` và `Course`.
- **Cơ chế:** Đã tích hợp `softDeletePlugin`. Được cascade tự động theo vòng đời của `Course` trong `courseCatalogService.js`:
  - Khi Course xóa mềm: Toàn bộ CurriculumUnit của Course chuyển `isDeleted = true`.
  - Khi Course khôi phục: Tự động khôi phục.
  - Khi Course xóa vĩnh viễn: Toàn bộ CurriculumUnit và SyllabusVersion của Course rác đó được dọn dẹp sạch sẽ, không gây mồ côi dữ liệu.

#### 2. `SyllabusVersion`
- **Quan hệ:** Phiên bản giáo trình của `Course`.
- **Bảo vệ:** Có cơ chế bất biến `enforceSyllabusVersionImmutability` khi đã xuất bản.
- **Cơ chế:** Được bảo vệ nghiêm ngặt. Nếu có bất kỳ Lớp học (`Class.syllabusVersionId`) hoặc Đơn ghi danh (`Enrollment.syllabusVersionId`) nào đã tham chiếu phiên bản giáo trình này, việc xóa vĩnh viễn Course cha sẽ bị chặn hoàn toàn.

#### 3. `LearningPath`
- **Quan hệ:** Lộ trình học tập (`CUR-03`).
- **Cơ chế:** Đã có `softDeletePlugin` và quản lý riêng qua `learningPathService.js` (`DELETE /admin/learning-paths/:id`). Trong Thùng rác, các thực thể Category và Course liên kết với LearningPath được bảo vệ chặn xóa vĩnh viễn nếu LearningPath đang trỏ tới.

#### 4. `Message`
- **Quan hệ:** Tin nhắn trò chuyện giữa người dùng (`Conversation`).
- **Cơ chế:** Đã có `softDeletePlugin` và endpoint thu hồi tin nhắn (`DELETE /messages/:id`).
- **Chính sách:** **TUYỆT ĐỐI KHÔNG đưa vào chức năng xóa vĩnh viễn của Thùng rác Admin.** Tin nhắn đóng vai trò là bằng chứng pháp lý trong giải quyết khiếu nại (`Report`, `TeacherIncidentReport`) và tuân thủ chính sách lưu trữ kiểm toán chat do Băng phụ trách.

#### 5. `ScholarshipCampaign`
- **Quan hệ:** Chiến dịch tài trợ học bổng.
- **Cơ chế:** Đã tích hợp `softDeletePlugin`.
- **Chính sách an toàn tài chính:** Vì liên quan trực tiếp đến các cam kết đóng góp tài trợ (`SponsorContribution`), đơn xin cấp học bổng (`ScholarshipApplication`), và quyết định cấp vốn (`ScholarshipUsage`), chiến dịch tuyệt đối KHÔNG được xóa vĩnh viễn thông thường. Khi kết thúc hoặc dừng hoạt động, hệ thống áp dụng quy trình đóng/lưu trữ (`ARCHIVE_OR_DEACTIVATE`). Trong Thùng rác, mọi Course nằm trong `ScholarshipCampaign` đều được bảo vệ chặn xóa vĩnh viễn.

---

### 4. Nhóm Models Tài chính và Kiểm toán Bất khả xâm phạm (Zero Mutation)
Các models sau đây **KHÔNG BAO GIỜ** được cấp phép xóa mềm hay xóa vĩnh viễn:
- `Payment`, `Transaction`, `TeacherEarning`, `TeacherSettlement`, `Payout`, `RefundCase`, `BankTransferEvent`, `PaymentReconciliation`, `BankProofRegistry`, `AuditLog`.
