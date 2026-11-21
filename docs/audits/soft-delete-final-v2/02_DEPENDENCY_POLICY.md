# EDUNITY V3 — SOFT DELETE FINALIZATION & PERMANENT DELETE
## Tài liệu 02: Chính sách Kiểm soát Ràng buộc Dữ liệu (Domain Dependency Policy)

**Mã tác vụ:** `EDUNITY-V3-SOFT-DELETE-FINAL-V2`  
**Nhánh làm việc:** `feature/teacher-admin`  
**File thực thi:** `BackEnd/src/services/trashService.js`  

---

### 1. Ma trận Ràng buộc Nghiệp vụ (Dependency Matrix)

```
Category (Danh mục)
   ├── Subject (Môn học)
   └── Course (Khóa học)
         ├── LearningPath (Lộ trình học)
         ├── ScholarshipCampaign (Chiến dịch học bổng)
         ├── CoursePricingPolicy (Biểu phí)
         ├── SyllabusVersion & CurriculumUnit (Giáo trình)
         └── Class (Lớp học)
               ├── Session & SessionAttendance (Buổi học & Điểm danh)
               ├── Enrollment (Ghi danh học viên) [BẢO VỆ TUYỆT ĐỐI]
               ├── Review (Đánh giá học viên)
               │     └── Report (Khiếu nại / Báo cáo vi phạm)
               └── Financial Invariants [BẤT KHẢ XÂM PHẠM]
                     ├── Payment
                     ├── TeacherEarning
                     ├── TeacherSettlement
                     └── RefundCase
```

---

### 2. Quy tắc Chặn Xóa Vĩnh viễn theo Từng Phân hệ

Hệ thống **không sử dụng** bất kỳ câu lệnh generic `deleteOne({ _id })` nào mà không chạy qua bộ lọc kiểm tra nghiệp vụ riêng biệt:

#### A. Phân hệ Danh mục (`CATEGORY`):
- **Điều kiện chặn:**
  1. `Subject.countDocuments({ categoryId: id }) > 0` $\rightarrow$ Chặn với thông báo: *"Không thể xóa vĩnh viễn vì vẫn còn môn học liên kết với danh mục này."*
  2. `Course.countDocuments({ categoryId: id }) > 0` $\rightarrow$ Chặn với thông báo: *"Không thể xóa vĩnh viễn vì vẫn còn khóa học liên kết với danh mục này."*
- **Hành động khi hợp lệ:** Chỉ xóa đúng bản ghi Category khi không còn bất kỳ thực thể con nào tham chiếu tới.

#### B. Phân hệ Môn học (`SUBJECT`):
- **Điều kiện chặn:**
  1. `Course.countDocuments({ subjectId: id }) > 0` $\rightarrow$ Chặn với thông báo: *"Không thể xóa vĩnh viễn vì vẫn còn khóa học liên kết với môn học này."*
  2. `Class.countDocuments({ subjectId: id }) > 0` $\rightarrow$ Chặn với thông báo: *"Không thể xóa vĩnh viễn vì vẫn còn lớp học liên kết với môn học này."*
  3. `TeacherSubjectAuthorization.countDocuments({ subjectId: id }) > 0` $\rightarrow$ Chặn với thông báo: *"Không thể xóa vĩnh viễn vì vẫn còn hồ sơ phân công giảng dạy liên kết với môn học này."*

#### C. Phân hệ Khóa học (`COURSE`):
- **Điều kiện chặn:**
  1. `Class.countDocuments({ courseId: id }) > 0` $\rightarrow$ Chặn: Còn lớp học liên kết.
  2. `Enrollment.countDocuments({ courseId: id }) > 0` $\rightarrow$ Chặn: Đã có lịch sử ghi danh của học viên.
  3. `SessionRefundReview.countDocuments({ courseId: id }) > 0` $\rightarrow$ Chặn: Đang có hồ sơ rà soát tài chính/khiếu nại.
  4. `ScholarshipCampaign.countDocuments({ courseIds: id }) > 0` $\rightarrow$ Chặn: Khóa học thuộc chiến dịch học bổng.
  5. `LearningPath.countDocuments({ "steps.courseId": id }) > 0` $\rightarrow$ Chặn: Khóa học nằm trong lộ trình học tập.
  6. `CoursePricingPolicy.countDocuments({ courseId: id }) > 0` $\rightarrow$ Chặn: Khóa học có biểu phí liên kết.
- **Dọn dẹp an toàn:** Khi Course đã qua toàn bộ các bài kiểm tra trên (là Course rác không có học viên/lớp học), hệ thống dọn sạch các `CurriculumUnit` và `SyllabusVersion` con để tránh rác mồ côi.

#### D. Phân hệ Lớp học (`CLASS`):
- **Điều kiện chặn TUYỆT ĐỐI:**
  1. `Enrollment.countDocuments({ classId: id }) > 0` $\rightarrow$ **CHẶN NGAY LẬP TỨC**. Bất kể trạng thái ghi danh là gì (Confirmed, Completed, Pending, Cancelled...), đảm bảo học viên không bao giờ bị mất dữ liệu lịch sử học tập hay quyền học My Learning.
  2. `Payment.countDocuments({ classId: id }) > 0` $\rightarrow$ **CHẶN NGAY LẬP TỨC**. Bảo vệ toàn vẹn lịch sử thanh toán học phí.
  3. `TeacherEarning.countDocuments({ classId: id }) > 0` $\rightarrow$ **CHẶN NGAY LẬP TỨC**. Bảo vệ doanh thu và nghĩa vụ thù lao giáo viên.
  4. `RefundCase.countDocuments({ classId: id }) > 0` $\rightarrow$ **CHẶN NGAY LẬP TỨC**. Bảo vệ hồ sơ hoàn tiền.
  5. `SessionAttendance.countDocuments(...) > 0` $\rightarrow$ **CHẶN NGAY LẬP TỨC**. Bảo vệ dữ liệu điểm danh buổi học.
  6. `SessionRefundReview.countDocuments({ classId: id }) > 0` $\rightarrow$ **CHẶN NGAY LẬP TỨC**.
  7. `Review.countDocuments({ classId: id }) > 0` $\rightarrow$ **CHẶN**.
- **Chỉ cho phép xóa khi:** Lớp học rác được tạo thử nghiệm, không có học viên đăng ký, không có thanh toán, không có điểm danh, và các buổi học đều ở trạng thái CANCELLED.

#### E. Phân hệ Đánh giá (`REVIEW`):
- **Điều kiện chặn:**
  1. `Report.countDocuments({ targetType: "REVIEW", targetId: id, status: { $in: ["OPEN", "IN_REVIEW"] } }) > 0` $\rightarrow$ Chặn: Đang là đối tượng báo cáo vi phạm cần giữ bằng chứng.

---

### 3. Cam kết An toàn Nghiệp vụ
- **Không hỗ trợ Force Delete:** Tuyệt đối không cho phép query params `force=true` hoặc `skipValidation=true`.
- **Không tự động xóa Media:** Không tự ý xóa các tệp hình ảnh, tài liệu lưu trữ đám mây dùng chung.
- **Không Cascade ngầm:** Không tự ý xóa dây chuyền các thực thể độc lập có giá trị kiểm toán.
