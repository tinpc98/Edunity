# MA TRẬN QUAN HỆ PHỤ THUỘC DỮ LIỆU HỌC THUẬT (ACADEMIC DEPENDENCY MATRIX)
## Báo cáo Phân tích Chi tiết — Task BE-03-FIX

- **Mã task:** `BE-03-FIX`
- **Dự án:** EDUNITY V3 — BackEnd System
- **Tác giả:** Senior Backend Engineer (Châu)
- **Ngày lập:** 21/11/2026
- **Tệp nguồn phân tích:**
  - `BackEnd/src/models/Category.js`
  - `BackEnd/src/models/Subject.js`
  - `BackEnd/src/models/Course.js`
  - `BackEnd/src/models/Class.js`
  - `BackEnd/src/models/SyllabusVersion.js`
  - `BackEnd/src/models/CurriculumUnit.js`
  - `BackEnd/src/models/Enrollment.js`
  - `BackEnd/src/models/CoursePricingPolicy.js`
  - `BackEnd/src/models/LearningPath.js`
  - `BackEnd/src/models/ScholarshipCampaign.js`
  - `BackEnd/src/models/TeacherSubjectAuthorization.js`
  - `BackEnd/src/models/CourseProposal.js`
  - `BackEnd/src/models/SessionRefundReview.js`

---

## 1. TỔNG QUAN CẤU TRÚC PHÂN CẤP DANH MỤC HỌC THUẬT

Hệ thống học thuật EDUNITY V3 được tổ chức theo mô hình cây phân cấp 3 tầng với các thực thể độc lập tham chiếu chéo:

$$\text{Category} \longrightarrow \text{Subject} \longrightarrow \text{Course} \longrightarrow \text{Class} \longrightarrow \text{Enrollment / Session / Review / Financial Records}$$

Ngoài ra, Course còn sở hữu trực tiếp các tài nguyên nội dung học thuật:
- $\text{Course} \longleftrightarrow \text{SyllabusVersion}$ (Phiên bản giáo trình)
- $\text{Course} \longleftrightarrow \text{CurriculumUnit}$ (Đơn vị bài học/chương trình)

---

## 2. BẢNG MA TRẬN QUAN HỆ CHI TIẾT (DEPENDENCY MATRIX)

| Gốc (Source Entity) | Thực thể phụ thuộc (Dependent Entity) | Trường tham chiếu (Foreign Key / Field) | Loại phụ thuộc (Type) | Xử lý khi Xóa mềm (Delete Behavior) | Cơ chế kiểm tra trong Code (Source Verification) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Category** | `Subject` | `Subject.categoryId` | Active | **Chặn xóa** (409 `CATEGORY_HAS_SUBJECTS`) | `Subject.countDocuments({ categoryId, isDeleted: { $ne: true } })` |
| **Category** | `Course` | `Course.categoryId` | Active | **Chặn xóa** (409 `CATEGORY_HAS_COURSES`) | `Course.countDocuments({ categoryId, isDeleted: { $ne: true } })` |
| **Category** | `Class` | `Class.categoryId` | Active / Historical | **Chặn xóa** (409 `CATEGORY_HAS_CLASSES`) | `Class.countDocuments({ categoryId, isDeleted: { $ne: true } })` |
| **Category** | `LearningPath` | `LearningPath.categoryId` | Active | **Chặn xóa** (409 `CATEGORY_IN_LEARNING_PATH`) | `LearningPath.countDocuments({ categoryId, isDeleted: { $ne: true } })` |
| **Category** | `ScholarshipCampaign` | `ScholarshipCampaign.categoryIds` | Active | **Chặn xóa** (409 `CATEGORY_IN_SCHOLARSHIP_CAMPAIGN`) | `ScholarshipCampaign.countDocuments({ categoryIds, isDeleted: { $ne: true } })` |
| **Category** | `CoursePricingPolicy` | `CoursePricingPolicy.categoryId` | Active | **Chặn xóa** (409 `CATEGORY_HAS_ACTIVE_PRICING_POLICY`) | `CoursePricingPolicy.countDocuments({ categoryId, status: "ACTIVE", isDeleted: { $ne: true } })` |
| **Category** | `TeacherSubjectAuthorization` | `TeacherSubjectAuthorization.categoryId` | Active | **Bảo vệ gián tiếp qua Subject** | Mỗi Authorization gắn với `subjectId`, Subject không xóa được nếu có Auth; Category không xóa được nếu có Subject |
| **Subject** | `Course` | `Course.subjectId` | Active | **Chặn xóa** (409 `SUBJECT_HAS_COURSES`) | `Course.countDocuments({ subjectId, isDeleted: { $ne: true } })` |
| **Subject** | `Class` | `Class.subjectId` | Active / Historical | **Chặn xóa** (409 `SUBJECT_HAS_CLASSES`) | `Class.countDocuments({ subjectId, isDeleted: { $ne: true } })` |
| **Subject** | `TeacherSubjectAuthorization` | `TeacherSubjectAuthorization.subjectId` | Active | **Chặn xóa** (409 `SUBJECT_HAS_TEACHER_AUTHORIZATIONS`) | `TeacherSubjectAuthorization.countDocuments({ subjectId, status: { $in: ["PENDING", "APPROVED"] } })` |
| **Subject** | `ScholarshipCampaign` | `ScholarshipCampaign.subjectIds` | Active | **Chặn xóa** (409 `SUBJECT_IN_SCHOLARSHIP_CAMPAIGN`) | `ScholarshipCampaign.countDocuments({ subjectIds, isDeleted: { $ne: true } })` |
| **Subject** | `CourseProposal` | `CourseProposal.subjectId` | Active | **Chặn xóa** (409 `SUBJECT_HAS_COURSE_PROPOSALS`) | `CourseProposal.countDocuments({ subjectId, status: { $in: ["PENDING", "CHANGES_REQUESTED"] }, isDeleted: { $ne: true } })` |
| **Subject** | `CoursePricingPolicy` | `CoursePricingPolicy.subjectId` | Active | **Chặn xóa** (409 `SUBJECT_HAS_ACTIVE_PRICING_POLICY`) | `CoursePricingPolicy.countDocuments({ subjectId, status: "ACTIVE", isDeleted: { $ne: true } })` |
| **Course** | `Class` | `Class.courseId` | Active & Historical | **Chặn xóa** (409 `COURSE_HAS_CLASSES`) | `Class.countDocuments({ courseId, isDeleted: { $ne: true } })` (Bảo vệ tất cả lớp học chưa bị xóa) |
| **Course** | `Enrollment` | `Enrollment.courseId` | Historical & Financial | **Chặn xóa** (409 `COURSE_HAS_ENROLLMENTS`) | `Enrollment.countDocuments({ courseId })` (Không phân biệt trạng thái enrollment) |
| **Course** | `SessionRefundReview` | `SessionRefundReview.courseId` | Financial Dispute | **Chặn xóa** (409 `COURSE_HAS_REFUND_REVIEWS`) | `SessionRefundReview.countDocuments({ courseId })` |
| **Course** | `ScholarshipCampaign` | `ScholarshipCampaign.courseIds` | Active | **Chặn xóa** (409 `COURSE_IN_SCHOLARSHIP_CAMPAIGN`) | `ScholarshipCampaign.countDocuments({ courseIds, isDeleted: { $ne: true } })` |
| **Course** | `LearningPath` | `LearningPath.steps.courseId` & `prerequisiteCourseIds` | Active | **Chặn xóa** (409 `COURSE_IN_LEARNING_PATH`) | `LearningPath.countDocuments({ $or: [{ "steps.courseId": courseId }, { prerequisiteCourseIds: courseId }], isDeleted: { $ne: true } })` |
| **Course** | `CoursePricingPolicy` | `CoursePricingPolicy.courseId` | Active | **Chặn xóa** (409 `COURSE_HAS_ACTIVE_PRICING_POLICY`) | `CoursePricingPolicy.countDocuments({ courseId, status: "ACTIVE", isDeleted: { $ne: true } })` |
| **Course** | `SyllabusVersion` | `SyllabusVersion.courseId` | Nội dung sở hữu | **Xóa mềm dây chuyền (Cascade Soft Delete)** | Cập nhật `isDeleted: true`, `deletedAt`, `deletedBy` đồng thời trong Transaction |
| **Course** | `CurriculumUnit` | `CurriculumUnit.courseId` | Nội dung sở hữu | **Xóa mềm dây chuyền (Cascade Soft Delete)** | Cập nhật `isDeleted: true`, `deletedAt`, `deletedBy` đồng thời trong Transaction |

---

## 3. PHÂN ĐỊNH BA LOẠI PHỤ THUỘC (ACTIVE, HISTORICAL, SOFT-DELETED)

### 3.1. Phụ thuộc đang hoạt động (Active Dependencies)
- **Định nghĩa:** Các thực thể đang trong vòng đời vận hành (`status` là `ACTIVE`, `OPEN`, `IN_PROGRESS`, `PENDING_APPROVAL`, `PENDING`).
- **Quy tắc an toàn:**
  - Không bao giờ cho phép xóa Category, Subject hoặc Course nếu có bất kỳ phụ thuộc Active nào.
  - Người dùng/Admin phải hủy hoặc hoàn thành các thực thể này trước, hoặc sử dụng giải pháp **ngừng hoạt động (`SET_INACTIVE`)**.

### 3.2. Phụ thuộc lịch sử (Historical Dependencies)
- **Định nghĩa:** Các thực thể đại diện cho dữ liệu đã diễn ra trong quá khứ và có giá trị pháp lý/tài chính:
  - `Enrollment`: Đăng ký học của học viên (kể cả đã hoàn thành khóa học).
  - `Class` ở trạng thái `COMPLETED`: Lớp học đã kết thúc, đã cấp chứng chỉ/đánh giá/thù lao.
  - `SessionRefundReview`: Lịch sử khiếu nại, hoàn tiền học phí.
- **Quy tắc an toàn:**
  - Các thực thể này không bao giờ bị xóa vật lý hoặc xóa mềm.
  - Khóa học có phụ thuộc lịch sử **tuyệt đối không được xóa mềm** để bảo vệ tính toàn vẹn hồ sơ học tập và báo cáo thuế/tài chính.
  - Giải pháp đúng đắn được hệ thống thông báo cho Admin là: **Đổi trạng thái Course sang `INACTIVE`**.

### 3.3. Phụ thuộc đã xóa mềm (Soft-deleted Dependencies)
- **Định nghĩa:** Các bản ghi đã có cờ `isDeleted: true`.
- **Quy tắc an toàn:**
  - Khi kiểm tra dependency để xóa Category/Subject/Course, các truy vấn kiểm tra đều sử dụng `{ isDeleted: { $ne: true } }` (thông qua `...NOT_DELETED`).
  - Ví dụ: Nếu một Category chỉ có các Subject đã bị xóa mềm trước đó (`isDeleted: true`), Category đó hoàn toàn được phép xóa mềm mà không bị chặn giả (`false positive`).
