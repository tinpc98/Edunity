# BÁO CÁO 04: BÓC TÁCH LOGIC DÙNG CHUNG VÀ TÁI CẤU TRÚC (SHARED LOGIC EXTRACTION)

- **Dự án:** Edunity V3
- **Chế độ:** REFACTOR & SHARED LOGIC PURGE
- **Người thực hiện:** Châu (Principal Backend Engineer + Software Architect)
- **Thời gian lập:** 13/11/2026

---

## 1. MỤC TIÊU BÓC TÁCH LOGIC DÙNG CHUNG

Khi loại bỏ LMS, thách thức lớn nhất không phải là xóa các file LMS độc lập (như `assignmentService.js`), mà là **xử lý các service và model dùng chung** có chứa đồng thời cả logic của Core/Quality/Community lẫn logic của LMS.

Nếu xóa vội vàng, hệ thống sẽ gặp lỗi runtime (Uncaught Exception), vỡ hợp đồng API với Frontend, hoặc làm hỏng chức năng đánh giá giảng viên cốt lõi.

Dưới đây là chi tiết kỹ thuật của 6 module dùng chung đã được bóc tách và tái cấu trúc an toàn.

---

## 2. CHI TIẾT CÁC MODULE ĐƯỢC TÁI CẤU TRÚC

### 2.1. Tái cấu trúc `reviewService.js` (Bóc tách LMS-10 khỏi Class Review)

- **Vị trí file:** [`BackEnd/src/services/reviewService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/reviewService.js)
- **Vấn đề trước refactor:** File chứa cả logic đánh giá lớp học tổng thể (`Review`) và đánh giá chi tiết từng buổi học (`SessionReview`).
- **Hành động đã thực hiện:**
  - Gỡ bỏ import `SessionReview` từ `../models`.
  - Xóa 3 hàm phụ thuộc LMS-10:
    - `createSessionReview(...)`
    - `getSessionReviews(...)`
    - `summarizeSessionReviews(...)`
  - **Bảo toàn 100% các hàm đánh giá Class cốt lõi:**
    - `createReview(...)`: Cho phép học viên đã hoàn thành khóa học đánh giá chất lượng lớp học và giảng viên, tính toán lại rating trung bình cho Teacher profile.
    - `getClassReviews(...)`: Lấy danh sách review của lớp học kèm phân trang.
    - `getTeacherReviews(...)`: Lấy tổng hợp review của giáo viên để phục vụ profile công khai.
    - `getMyReviews(...)`: Học viên xem lại lịch sử đánh giá của chính mình.
- **Kết quả:** Không làm ảnh hưởng đến chức năng hiển thị sao đánh giá và uy tín giáo viên trên hệ thống.

---

### 2.2. Tái cấu trúc `teachingQualityReportService.js` (SPO-07 Quality Report)

- **Vị trí file:** [`BackEnd/src/services/teachingQualityReportService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/teachingQualityReportService.js)
- **Vấn đề trước refactor:** Service này tổng hợp chất lượng giảng dạy cho Admin và nhà tài trợ. Báo cáo này trước đây truy vấn collection `sessionreviews` để thống kê chỉ số hài lòng theo từng buổi.
- **Hành động đã thực hiện:**
  - Loại bỏ import `SessionReview`.
  - Trong logic aggregate dữ liệu buổi học, thay thế truy vấn DB bằng mảng rỗng tương thích ngược:
    ```javascript
    // Zero-breakage backward compatibility for consumers expecting sessionReviews field
    const sessionReviews = [];
    ```
  - Loại bỏ `SessionReview` khỏi danh sách `traceability.sourceCollections`.
  - Giữ nguyên toàn bộ logic đối soát chất lượng:
    - Thống kê tỷ lệ hoàn thành buổi học (`Session.status = COMPLETED`).
    - Thống kê vi phạm kỷ luật giáo viên (`TeacherViolation`).
    - Thống kê sự cố kỹ thuật và phòng học (`TeacherIncidentReport`).
    - Thống kê kỷ luật hành chính (`TeacherDisciplineCase`).
    - Thống kê hoàn tiền buổi học (`SessionRefundReview`).
    - Tổng hợp điểm đánh giá khóa học (`Review`).
- **Kết quả:** Đạt tiêu chuẩn nghiệm thu và vượt qua 100% test case trong [`BackEnd/tests/stage5QualityCoordination.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/stage5QualityCoordination.test.js).

---

### 2.3. Tái cấu trúc `messagingService.js` (Bóc tách LMS-13 khỏi Chat 1-1)

- **Vị trí file:** [`BackEnd/src/services/messagingService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/messagingService.js)
- **Vấn đề trước refactor:** File cung cấp song song 2 kênh trao đổi: Chat 1-1 giữa 2 tài khoản và Kênh chat theo Lớp học (`ClassChannel`) kèm báo cáo vi phạm tin nhắn (`MessageModerationReport`).
- **Hành động đã thực hiện:**
  - Gỡ bỏ import `MessageModerationReport`.
  - Xóa toàn bộ các phương thức phục vụ chat lớp học và kiểm duyệt:
    - `createClassConversation(...)`
    - `sendClassMessage(...)`
    - `reportMessage(...)`
    - `listMessageReports(...)`
    - `moderateMessage(...)`
  - **Bảo toàn 100% chat 1-1 cốt lõi:**
    - `openConversation(...)`: Mở cuộc trò chuyện trực tiếp giữa Student và Teacher theo Enrollment hợp lệ.
    - `listMyConversations(...)`: Lấy danh sách hội thoại của người dùng hiện tại.
    - `listMessages(...)`: Đọc lịch sử tin nhắn với phân trang và kiểm tra quyền thành viên.
    - `sendMessage(...)`: Gửi tin nhắn trực tiếp an toàn.
    - `deleteMessage(...)`: Xóa tin nhắn cá nhân.
- **Kết quả:** Vượt qua toàn bộ 11 test case trong [`BackEnd/tests/community.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/community.test.js) (PASS 11/11).

---

### 2.4. Bảo toàn trường dữ liệu `Session.contents` trong Học thuật Cốt lõi

- **Vị trí file:** [`BackEnd/src/models/Session.js`](file:///c:/CODE/Edunity/BackEnd/src/models/Session.js)
- **Quy tắc an toàn:** Không bao giờ được phép xóa trường `contents` của schema `Session`.
- **Thực thi:** Trường `contents` (chứa tiêu đề tài liệu, link đính kèm, mô tả buổi học) được bảo lưu nguyên vẹn 100%. Khi giáo viên tạo buổi học hoặc đính kèm tài liệu trực tiếp trong syllabus/session, dữ liệu vẫn được lưu trữ và truy xuất bình thường mà không cần tới hệ thống `LearningResource` phức tạp.

---

### 2.5. Làm sạch hằng số hệ thống trong `constants.js`

- **Vị trí file:** [`BackEnd/src/models/constants.js`](file:///c:/CODE/Edunity/BackEnd/src/models/constants.js)
- **Hành động đã thực hiện:**
  - Xóa bỏ các enum LMS-only không còn sử dụng:
    - `LEARNING_RESOURCE_ACCESS_SCOPE`, `LEARNING_RESOURCE_TYPES`
    - `ASSIGNMENT_STATUS`, `SUBMISSION_STATUS`
    - `GRADE_STATUS`, `RUBRIC_CRITERIA_TYPES`
    - `ASSESSMENT_TYPES`, `QUESTION_TYPES`, `ATTEMPT_STATUS`
    - `PROGRESS_REVIEW_STATUS`, `MESSAGE_MODERATION_STATUS`
    - `AI_FEATURE_CODES`, `AI_USAGE_LIMITS`
  - **Giữ nguyên các hằng số dùng chung quan trọng:**
    - `GRADE_LEVELS`: Danh mục khối lớp phổ thông (Lớp 1 đến Lớp 12).
    - `COURSE_LEVELS`: Trình độ khóa học (`BASIC`, `INTERMEDIATE`, `ADVANCED`).
    - `CONTRACT_REVIEW_*`: Hằng số phục vụ quy trình xem xét hợp đồng giáo viên TEA-16 (`TeacherContractReviewPacket`).

---

### 2.6. Tinh chỉnh Scripts Migration và Backup

- **`BackEnd/scripts/backupRestoreClone.js`:**
  - Cải tiến hàm `getCollectionIndexes` để bắt lỗi khi collection không tồn tại (`ns does not exist`), trả về mảng rỗng một cách an toàn mà không làm gián đoạn tiến trình clone DB.
- **`BackEnd/scripts/migrationPreflight.js`:**
  - Gỡ bỏ toàn bộ unique/partial index specs của các collection LMS đã xóa khỏi hằng số `UNIQUE_INDEX_SPECS`.
  - Rút gọn chính xác từ 54 specs xuống còn **35 core index specs**.
  - Kiểm tra và vượt qua toàn bộ 12 test case trong [`BackEnd/tests/migrationPreflight.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/migrationPreflight.test.js).

---

## 3. KẾT LUẬN

Việc bóc tách logic dùng chung đã hoàn tất mà không phát sinh bất kỳ side-effect nào. Tất cả các service còn lại đều có tính độc lập cao, tuân thủ nguyên lý Đơn trách nhiệm (Single Responsibility Principle) và hoạt động ổn định trên môi trường kiểm thử.

