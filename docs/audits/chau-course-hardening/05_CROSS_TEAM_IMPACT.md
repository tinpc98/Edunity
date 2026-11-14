# 05_CROSS_TEAM_IMPACT.md — Đánh Giá Tác Động Liên Nhóm (Cross-Team Impact Assessment)

**Dự án:** Edunity V3  
**Chủ sở hữu:** Châu  
**Các bên liên quan:** Tin (Finance & Settlements), Bảo (Security & Auth), Băng (Frontend & UI)  
**Ngày phát hành:** 13/11/2026  

---

## 1. TÁC ĐỘNG ĐỐI VỚI TIN (BACKEND TÀI CHÍNH, THANH TOÁN & QUYẾT TOÁN)

### 1.1. Cam Kết Không Xâm Phạm Miền Sở Hữu
- Không có bất kỳ dòng code nào trong các service tài chính của Tin (`paymentService.js`, `settlementService.js`, `teacherSettlementService.js`, `refundReconciliationService.js`) bị chỉnh sửa hoặc ghi đè.
- Không thay đổi công thức tính doanh thu giáo viên, tỷ lệ chia sẻ học phí, hold-time 7 ngày, hoặc logic chuyển trạng thái `AVAILABLE`.

### 1.2. Giá Trị Gia Tăng Từ Việc Bổ Sung Rào Chắn `SessionRefundReview`
- Trong quy trình xử lý sự cố buổi học (incident, giáo viên vắng mặt, hủy buổi học không bù), model `SessionRefundReview` lưu trữ các trường hợp cần xem xét hoàn tiền hoặc đối soát doanh thu giáo viên.
- Việc bổ sung kiểm tra `SessionRefundReview` trong `deleteCourse` bảo đảm Admin không thể soft-delete một khóa học khi các buổi học thuộc khóa học đó đang có hồ sơ khiếu nại tài chính chưa được giải quyết dứt điểm.
- Ngăn chặn hoàn toàn hiện tượng bản ghi tài chính mồ côi (orphan records).

### 1.3. Kết Quả Kiểm Chứng Tích Hợp
- Toàn bộ 6 test suites liên quan đến tài chính (`cur09EnrollmentSnapshotFinance`, `classLifecycleRegression`, `sessionLifecycle`, `maintenanceAndFinance`, `payment`, `teacherSettlement.pr7`) đạt **155/155 test cases PASS (100%)**.

---

## 2. TÁC ĐỘNG ĐỐI VỚI BẢO (SECURITY, KIỂM TOÁN & RBAC)

### 2.1. Khắc Phục Lỗ Hổng Tuân Thủ Kiểm Toán (Audit Compliance)
- Việc loại bỏ `try/catch` nuốt lỗi trong `deleteCourse` và đưa `auditService.audit` vào thẳng transaction session bảo đảm nguyên tắc: **Không có thao tác xóa nào diễn ra mà thiếu vết kiểm toán**.
- Nếu bảng `AuditLog` gặp sự cố, transaction sẽ rollback lập tức, ngăn chặn việc phá hoại dữ liệu ẩn danh.

### 2.2. Chuẩn Hóa RBAC cho Syllabus Snapshot
- Các lớp học ở trạng thái `DRAFT`, `PENDING_APPROVAL`, và `REJECTED` được bảo vệ tuyệt đối: Chỉ Admin và Giáo viên tạo lớp (Teacher Owner) mới có quyền truy cập.
- Ngăn ngừa nguy cơ lộ đề bài, giáo trình hoặc học liệu đang trong vòng xét duyệt bản quyền ra cho học viên hoặc giáo viên khác.

### 2.3. Loại Trừ Rủi Ro Crash Uncaught Exception
- Loại bỏ hoàn toàn lỗi `TypeError: Cannot read properties of undefined (reading 'toString')` khi `teacherId` mang giá trị `null`/`undefined`. Server Express không bị nghẽn hoặc crash tiến trình.

---

## 3. TÁC ĐỘNG ĐỐI VỚI BĂNG (FRONTEND & CLIENT APPLICATIONS)

### 3.1. Hỗ Trợ Đầy Đủ API Quản Lý Khóa Học Cho Admin
- API `GET /api/admin/courses` cho phép Băng hiển thị danh sách khóa học đầy đủ:
  - Lọc theo `status` (`ACTIVE`, `INACTIVE`, hoặc tất cả).
  - Tìm kiếm theo từ khóa (tên khóa, slug, mô tả, mã tham chiếu).
  - Phân trang chuẩn (`page`, `limit`) và sắp xếp ổn định (`createdAt desc`, `_id desc`).
- API `GET /api/admin/courses/:id` cho phép xem chi tiết khóa học ngay cả khi khóa học đang ở trạng thái `INACTIVE`.
- API `PATCH /api/admin/courses/:id` cho phép Admin tái kích hoạt khóa học (`status: "ACTIVE"`) khi môn học cha (`Subject`) đang hoạt động.

### 3.2. Cấu Trúc Lỗi Thân Thiện & Gợi Ý Hành Động (`recommendedAction`)
Khi Admin nhấn nút xóa một khóa học đang có dữ liệu phụ thuộc, Backend trả về response chi tiết:
```json
{
  "success": false,
  "error": "COURSE_HAS_CLASSES",
  "message": "Cannot delete course: 3 class(es) exist. Deactivate the course by setting status to INACTIVE instead.",
  "details": {
    "classCount": 3,
    "recommendedAction": "SET_INACTIVE"
  }
}
```
Frontend có thể hiển thị hộp thoại xác nhận trực quan:
> *"Khóa học này đang có 3 lớp học liên kết. Bạn không thể xóa vĩnh viễn, bạn có muốn chuyển trạng thái sang TẠM NGƯNG (INACTIVE) không?"*

### 3.3. API Đọc Giáo Trình Lớp Học (CUR-12) Ổn Định Tuyệt Đối
- Endpoint `GET /api/classes/:id/syllabus` luôn trả về đúng phiên bản giáo trình đã chốt tại thời điểm mở lớp, kèm danh sách đơn vị bài học (`units`) sắp xếp theo thứ tự `unitOrder` tăng dần.
- Giao diện lớp học của học viên và giáo viên hiển thị giáo trình nhất quán, không bị thay đổi bất ngờ khi Admin cập nhật khóa học gốc.

