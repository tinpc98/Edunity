# BÁO CÁO 03: DANH SÁCH FILE VÀ MÃ NGUỒN ĐÃ XÓA (DELETED FILES MANIFEST)

- **Dự án:** Edunity V3
- **Chế độ:** SAFE DELETION MANIFEST & CODEBASE PURGE AUDIT
- **Người thực hiện:** Châu (Principal Backend Engineer + Software Architect)
- **Thời gian lập:** 13/11/2026

---

## 1. TỔNG QUAN DỮ LIỆU ĐÃ XÓA

Tổng cộng **33 files** phục vụ riêng cho phân hệ LMS và AI học tập đã được xóa bỏ vĩnh viễn khỏi mã nguồn BackEnd, bao gồm:
- **14 Models Mongoose**
- **09 Backend Services**
- **02 Controllers**
- **08 Test Suites**

Tổng số dòng mã đã loại bỏ an toàn: **~7,200 LOC**.

---

## 2. DANH MỤC CHI TIẾT CÁC FILE ĐÃ XÓA

### 2.1. Danh mục Mongoose Models Đã Xóa (14 Files)

Tất cả các model sau đã được xóa khỏi thư mục `BackEnd/src/models/` và gỡ bỏ khỏi file xuất khẩu trung tâm [`BackEnd/src/models/index.js`](file:///c:/CODE/Edunity/BackEnd/src/models/index.js):

| STT | Đường dẫn File Model | Tên Collection MongoDB | Phạm vi Nghiệp vụ | Trạng thái Tham chiếu |
|---|---|---|---|---|
| 1 | `BackEnd/src/models/LearningResource.js` | `learningresources` | LMS-03 Học liệu khóa/lớp | Đã gỡ khỏi models & indexes |
| 2 | `BackEnd/src/models/Assignment.js` | `assignments` | LMS-05 Bài tập giáo viên giao | Đã gỡ khỏi models & indexes |
| 3 | `BackEnd/src/models/Submission.js` | `submissions` | LMS-05 Bài nộp của học sinh | Đã gỡ khỏi models & indexes |
| 4 | `BackEnd/src/models/Grade.js` | `grades` | LMS-07 Bảng điểm & rubric | Đã gỡ khỏi models & indexes |
| 5 | `BackEnd/src/models/GradeHistory.js` | `gradehistories` | LMS-07 Lịch sử chấm & sửa điểm | Đã gỡ khỏi models & indexes |
| 6 | `BackEnd/src/models/Assessment.js` | `assessments` | LMS-08 Đề thi & bài kiểm tra | Đã gỡ khỏi models & indexes |
| 7 | `BackEnd/src/models/Question.js` | `questions` | LMS-08 Ngân hàng câu hỏi | Đã gỡ khỏi models & indexes |
| 8 | `BackEnd/src/models/Attempt.js` | `attempts` | LMS-08 Lượt làm bài thi | Đã gỡ khỏi models & indexes |
| 9 | `BackEnd/src/models/PlacementResult.js` | `placementresults` | LMS-01 Kết quả xếp lớp đầu vào | Đã gỡ khỏi models & indexes |
| 10 | `BackEnd/src/models/SessionReview.js` | `sessionreviews` | LMS-10 Đánh giá sau buổi học | Đã gỡ khỏi models & indexes |
| 11 | `BackEnd/src/models/StudentProgressReview.js` | `studentprogressreviews` | LMS-12 Nhận xét tiến bộ định kỳ | Đã gỡ khỏi models & indexes |
| 12 | `BackEnd/src/models/MessageModerationReport.js`| `messagemoderationreports`| LMS-13 Báo cáo vi phạm chat lớp | Đã gỡ khỏi models & indexes |
| 13 | `BackEnd/src/models/AiAuditLog.js` | `aiauditlogs` | Stage 6 Audit log truy vấn AI | Đã gỡ khỏi models & indexes |
| 14 | `BackEnd/src/models/AiGeneratedDraft.js` | `aigenerateddrafts` | Stage 6 Bản nháp bài giảng do AI tạo | Đã gỡ khỏi models & indexes |

*Ghi chú số lượng model:* Sau khi loại bỏ 14 models này và thêm `TeacherContractReviewPacket` (TEA-16) cùng các model tài chính của Tin, hệ thống hiện có chính xác **48 core models**, đã xác minh bằng [`BackEnd/tests/schemaInventory.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/schemaInventory.test.js) (PASS 16/16).

---

### 2.2. Danh mục Backend Services Đã Xóa (09 Files)

Các service sau nằm trong `BackEnd/src/services/` chỉ phục vụ các chức năng LMS/AI đã bị xóa hoàn toàn:

| STT | Đường dẫn File Service | Số dòng code | Mục đích nghiệp vụ trước khi xóa |
|---|---|---|---|
| 1 | `BackEnd/src/services/learningResourceService.js` | ~240 | Quản lý tải lên, phân quyền truy cập, signed URL học liệu |
| 2 | `BackEnd/src/services/assignmentService.js` | ~310 | Tạo bài tập, cấu hình hạn nộp, nộp bài, kiểm tra điều kiện |
| 3 | `BackEnd/src/services/gradeService.js` | ~280 | Chấm điểm, rubric, ghi nhận lịch sử thay đổi điểm |
| 4 | `BackEnd/src/services/assessmentService.js` | ~360 | Tạo đề thi, quản lý câu hỏi trắc nghiệm/tự luận, tính giờ làm bài |
| 5 | `BackEnd/src/services/placementService.js` | ~190 | Đề thi đầu vào, chấm điểm xếp lớp học viên |
| 6 | `BackEnd/src/services/studentProgressReviewService.js` | ~210 | Giáo viên đánh giá tiến bộ học sinh theo Class/Enrollment |
| 7 | `BackEnd/src/services/learningProgressService.js` | ~250 | Dashboard tổng hợp điểm, bài tập và chuyên cần học tập |
| 8 | `BackEnd/src/services/aiGovernanceService.js` | ~280 | Kiểm soát an toàn AI, hạn mức token, rà soát dữ liệu PII |
| 9 | `BackEnd/src/services/aiUseCaseService.js` | ~320 | Tạo giáo án AI, gợi ý tài liệu, sinh câu hỏi trắc nghiệm |

---

### 2.3. Danh mục Controllers Đã Xóa (02 Files)

| STT | Đường dẫn File Controller | Số dòng code | Mục đích trước khi xóa |
|---|---|---|---|
| 1 | `BackEnd/src/controllers/lmsController.js` | ~420 | Xử lý request cho toàn bộ LMS-01, 03, 05, 07, 08 |
| 2 | `BackEnd/src/controllers/aiController.js` | ~260 | Xử lý request cho các usecase AI Stage 6 |

---

### 2.4. Danh mục Test Suites Đã Xóa (08 Files)

Các file kiểm thử unit và integration độc quyền cho LMS đã được xóa khỏi `BackEnd/tests/` nhằm làm sạch test suite hoạt động:

| STT | Đường dẫn File Test | Loại kiểm thử | Nội dung kiểm thử cũ |
|---|---|---|---|
| 1 | `BackEnd/tests/lms03LearningResource.test.js` | Unit / Integration | Kiểm tra upload, download, phân quyền LearningResource |
| 2 | `BackEnd/tests/lms0507AssignmentGrade.test.js` | Unit / Integration | Kiểm tra giao bài tập, nộp bài, chấm điểm và rubric |
| 3 | `BackEnd/tests/lms0801AssessmentPlacement.test.js` | Unit / Integration | Kiểm tra thi online, câu hỏi, snapshot đề, xếp lớp đầu vào |
| 4 | `BackEnd/tests/lms10Review.test.js` | Unit / Integration | Kiểm tra đánh giá giảng viên theo Session (SessionReview) |
| 5 | `BackEnd/tests/stage5ProgressQualityCoordination.test.js` | Unit / Integration | *Đã xóa file cũ chứa LMS-12/14, thay bằng `stage5QualityCoordination.test.js`* |
| 6 | `BackEnd/tests/phase4ReplSet.test.js` | ReplSet Integration | Kiểm tra transaction replica set cho tài liệu, bài tập, điểm số |
| 7 | `BackEnd/tests/phase5ReplSet.test.js` | ReplSet Integration | Kiểm tra transaction replica set cho tiến bộ học tập |
| 8 | `BackEnd/tests/phase6ReplSet.test.js` | ReplSet Integration | Kiểm tra transaction replica set cho class chat & AI audit log |
| 9 | `BackEnd/tests/stage6MessagingAndAi.test.js` | Integration | Kiểm tra channel messaging và AI prompt generation |

---

## 3. XÁC NHẬN AN TOÀN SAU KHI XÓA (CLEANUP VERIFICATION)

Đã chạy kiểm tra quét chuỗi toàn diện trong thư mục `BackEnd/src/` để đảm bảo không còn bất kỳ dòng `import` hoặc `require` nào trỏ tới 33 file đã xóa.
- Tất cả các lệnh `require('../models/LearningResource')`, `require('../services/assignmentService')`, v.v... đều không còn tồn tại.
- Lệnh chạy test bộ core [`BackEnd/tests/schemaInventory.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/schemaInventory.test.js) xác nhận 48 models hợp lệ và không gặp bất kỳ lỗi `Cannot find module` nào.

