# BÁO CÁO 01: TỔNG KIỂM KÊ VÀ DANH MỤC THÀNH PHẦN LMS ĐÃ LOẠI BỎ (LMS INVENTORY)

- **Dự án:** Edunity V3
- **Chế độ:** FULL SOURCE AUDIT → SAFE DELETION → REFACTOR → REGRESSION → HANDOVER
- **Người thực hiện:** Châu (Principal Backend Engineer + Software Architect)
- **Quyết định:** Nhóm phát triển đã chính thức thống nhất loại bỏ hoàn toàn LMS khỏi sản phẩm Edunity V3 (`REMOVED_FROM_SCOPE — TEAM_APPROVED`).
- **Thời gian lập:** 13/11/2026

---

## 1. MỤC TIÊU VÀ PHẠM VI KIỂM KÊ

Toàn bộ các thành phần phục vụ riêng biệt cho LMS (Learning Management System) và tính năng AI soạn thảo/tổng hợp học thuật đã được xác định, cách ly và loại bỏ hoàn toàn khỏi mã nguồn BackEnd Edunity V3. 

Kiểm kê xác nhận không còn bất kỳ endpoint API, controller, service, Mongoose model, migration spec, cron job, hay unit/integration test LMS nào còn hoạt động trong hệ thống.

---

## 2. BẢNG TỔNG HỢP CÁC MODULE LMS ĐÃ LOẠI BỎ

| STT | Phân hệ LMS | Task ID | Mongoose Models Đã Xóa | Services Đã Xóa / Refactor | Controllers Đã Xóa / Refactor | Routes Đã Gỡ Bỏ | Test Suites Đã Xóa |
|---|---|---|---|---|---|---|---|
| 1 | **Placement Assessment** | `LMS-01` | `PlacementResult.js` | `placementService.js` (Deleted) | `lmsController.js` (Deleted) | `POST /student/classes/:id/placement`, `GET /student/classes/:id/placement/result`, `GET /teaching/classes/:id/placements` | `lms0801AssessmentPlacement.test.js` |
| 2 | **Learning Resources** | `LMS-03` | `LearningResource.js` | `learningResourceService.js` (Deleted) | `lmsController.js` (Deleted) | `GET /student/learning-resources`, `GET /student/learning-resources/:id/download-url`, `POST /teaching/learning-resources`, `PATCH /teaching/learning-resources/:id`, `DELETE /teaching/learning-resources/:id` | `lms03LearningResource.test.js`, `phase4ReplSet.test.js` |
| 3 | **Assignments & Submissions** | `LMS-05` | `Assignment.js`, `Submission.js` | `assignmentService.js` (Deleted) | `lmsController.js` (Deleted) | `GET /student/classes/:id/assignments`, `POST /student/assignments/:id/submissions`, `GET /student/assignments/:id/my-submission`, `POST /teaching/assignments`, `GET /teaching/classes/:id/assignments`, `GET /teaching/assignments/:id/submissions` | `lms0507AssignmentGrade.test.js`, `phase4ReplSet.test.js` |
| 4 | **Grades & Feedback** | `LMS-07` | `Grade.js`, `GradeHistory.js` | `gradeService.js` (Deleted) | `lmsController.js` (Deleted) | `POST /teaching/submissions/:id/grade`, `GET /teaching/submissions/:id/grade`, `GET /teaching/classes/:id/gradebook` | `lms0507AssignmentGrade.test.js`, `phase4ReplSet.test.js` |
| 5 | **Assessments & Tests** | `LMS-08` | `Assessment.js`, `Question.js`, `Attempt.js` | `assessmentService.js` (Deleted) | `lmsController.js` (Deleted) | `POST /teaching/assessments`, `POST /teaching/assessments/:id/questions`, `GET /teaching/assessments/:id`, `POST /student/assessments/:id/attempts`, `POST /student/attempts/:id/submit` | `lms0801AssessmentPlacement.test.js`, `phase4ReplSet.test.js` |
| 6 | **Session-level Reviews** | `LMS-10` | `SessionReview.js` | `reviewService.js` (Refactored - giữ lại Class Review) | `accountController.js` (Refactored) | `POST /account/sessions/:id/review`, `GET /account/sessions/:id/reviews` | `lms10Review.test.js` |
| 7 | **Student Progress Review** | `LMS-12` | `StudentProgressReview.js` | `studentProgressReviewService.js` (Deleted) | `qualityProgressController.js` (Refactored) | `POST /teaching/classes/:id/students/:studentId/progress-review`, `GET /teaching/classes/:id/students/:studentId/progress-reviews`, `GET /student/classes/:id/progress-reviews` | `stage5ProgressQualityCoordination.test.js`, `phase5ReplSet.test.js` |
| 8 | **Class Messaging & Moderation**| `LMS-13`| `MessageModerationReport.js` | `messagingService.js` (Refactored - giữ lại 1-1 Chat) | `communityController.js` (Refactored) | `POST /community/classes/:classId/conversations`, `POST /community/classes/:classId/conversations/:id/messages`, `POST /community/messages/:id/report`, `GET /community/reports/messages` | `stage6MessagingAndAi.test.js`, `phase6ReplSet.test.js` |
| 9 | **Learning Progress Dashboard** | `LMS-14` | _(Aggregate)_ | `learningProgressService.js` (Deleted) | `qualityProgressController.js` (Refactored) | `GET /student/progress-dashboard`, `GET /teaching/classes/:id/progress-dashboard` | `stage5ProgressQualityCoordination.test.js`, `phase5ReplSet.test.js` |
| 10 | **AI Lesson & Student Support** | `AI-01..04` | `AiAuditLog.js`, `AiGeneratedDraft.js` | `aiGovernanceService.js`, `aiUseCaseService.js` (Deleted) | `aiController.js` (Deleted) | `POST /student/ai/recommendations`, `POST /teaching/ai/lesson-plan`, `POST /teaching/ai/questions`, `POST /community/ai/sponsor-report` | `stage6MessagingAndAi.test.js`, `phase6ReplSet.test.js` |

---

## 3. CHI TIẾT TỪNG PHÂN VÙNG ĐÃ LOẠI BỎ

### 3.1. Phân vùng Học liệu & Tài nguyên (LMS-03)
- **Mô tả:** Hệ thống quản lý tài liệu tải lên theo Course, Class và Session; ký signed URL qua S3/MinIO.
- **Model đã xóa:** `LearningResource` (lưu trữ metadata tài liệu, fileKey, mimeType, accessScope).
- **Service đã xóa:** `learningResourceService.js`.
- **Bảo toàn cốt lõi:** Trường `Session.contents` trong schema [`BackEnd/src/models/Session.js`](file:///c:/CODE/Edunity/BackEnd/src/models/Session.js) được bảo toàn nguyên vẹn 100%, bảo đảm không làm mất dữ liệu lịch sử buổi học.

### 3.2. Phân vùng Bài tập, Nộp bài & Chấm điểm (LMS-05, LMS-07)
- **Mô tả:** Giáo viên giao bài tập (Assignment), học viên nộp bài đính kèm file (Submission), giáo viên chấm điểm (Grade) kèm rubric và lưu vết lịch sử chấm (GradeHistory).
- **Models đã xóa:** `Assignment`, `Submission`, `Grade`, `GradeHistory`.
- **Services đã xóa:** `assignmentService.js`, `gradeService.js`.
- **Bảo toàn cốt lõi:** Không có liên kết nào đến luồng thanh toán hoặc quyết toán của giáo viên. Các cột điểm này hoàn toàn độc lập với việc xác nhận hoàn thành buổi học (Session `COMPLETED`).

### 3.3. Phân vùng Kiểm tra, Đề thi & Placement (LMS-08, LMS-01)
- **Mô tả:** Ngân hàng câu hỏi trắc nghiệm/tự luận, tạo bài kiểm tra, học viên làm bài tính giờ và nộp bài kiểm tra đầu vào xếp lớp.
- **Models đã xóa:** `Assessment`, `Question`, `Attempt`, `PlacementResult`.
- **Services đã xóa:** `assessmentService.js`, `placementService.js`.
- **Bảo toàn cốt lõi:** Việc ghi danh lớp học (`Enrollment`) và xếp lớp trong Edunity V3 diễn ra trực tiếp qua thanh toán và chính sách khóa học, không bị phụ thuộc vào điều kiện bắt buộc của bài thi đầu vào.

### 3.4. Phân vùng Đánh giá buổi học (LMS-10 SessionReview)
- **Mô tả:** Đánh giá giảng viên sau mỗi buổi học riêng lẻ.
- **Model đã xóa:** `SessionReview`.
- **Service refactor:** [`BackEnd/src/services/reviewService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/reviewService.js) đã lược bỏ `createSessionReview`, `getSessionReviews`, `summarizeSessionReviews`.
- **Bảo toàn cốt lõi:** Giữ lại 100% chức năng đánh giá khóa học/lớp học qua model `Review` (Class-level review: `createReview`, `getClassReviews`, `getTeacherReviews`).

### 3.5. Phân vùng Theo dõi tiến bộ học tập (LMS-12, LMS-14)
- **Mô tả:** Giáo viên nhận xét tiến bộ định kỳ của học sinh; Dashboard thống kê điểm số và tỷ lệ hoàn thành bài tập.
- **Model đã xóa:** `StudentProgressReview`.
- **Services đã xóa:** `studentProgressReviewService.js`, `learningProgressService.js`.
- **Bảo toàn cốt lõi:** Giữ nguyên các chức năng giám sát chất lượng giảng dạy cấp cao: `TEA-16` (Hồ sơ xem xét hợp đồng giáo viên - `TeacherContractReviewPacket`) và `SPO-07` (Báo cáo chất lượng giảng dạy - `teachingQualityReportService`).

### 3.6. Phân vùng Tin nhắn lớp học & AI (LMS-13, AI-01 -> AI-04)
- **Mô tả:** Kênh chat nhóm theo lớp học kèm cơ chế báo cáo kiểm duyệt tin nhắn (moderation); AI soạn bài học, gợi ý tài liệu và phân tích báo cáo.
- **Models đã xóa:** `MessageModerationReport`, `AiAuditLog`, `AiGeneratedDraft`.
- **Services đã xóa:** `aiGovernanceService.js`, `aiUseCaseService.js`.
- **Service refactor:** [`BackEnd/src/services/messagingService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/messagingService.js) loại bỏ channel chat nhóm và report tin nhắn; giữ lại 100% chức năng chat 1-1 trực tiếp an toàn giữa 2 người dùng.

---

## 4. KẾT LUẬN KIỂM KÊ

Mọi thành phần thuộc danh mục LMS đã được kiểm kê chi tiết và loại bỏ triệt để. Danh mục kiểm kê này là cơ sở để đối soát trong biểu đồ phụ thuộc (Dependency Graph) và danh sách file đã xóa ở các báo cáo tiếp theo.

