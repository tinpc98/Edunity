# BÁO CÁO THAY ĐỔI & RÀ SOÁT BACKEND
**Mã tài liệu:** `docs/ADMIN-FULLSTACK-01/03_BACKEND_CHANGES.md`  
**Dự án:** EDUNITY V3  
**Vai trò:** Senior Fullstack Engineer  

---

## 1. TỔNG QUAN RÀ SOÁT BACKEND
Tuân thủ nguyên tắc:
- Không viết lại các phần đã hoạt động đúng.
- Không sửa đổi cấu trúc dữ liệu nếu không phát sinh lỗi.
- Đảm bảo tính tương thích ngược tuyệt đối (Backward Compatibility).

---

## 2. CHI TIẾT CÁC MODULE BACKEND ĐÃ ĐỐI CHIẾU & XÁC THỰC

### 2.1. Phân hệ Tổng quan & Dashboard (`adminService.js`)
- **File:** `BackEnd/src/services/adminService.js`
- **Chức năng:** `getDashboard()`
- **Đặc tả kiểm toán:**
  - Tổng hợp số liệu từ các Model: `User`, `Class`, `Course`, `CourseProposal`, `ScholarshipCampaign`, `TeacherEarning`, `Transaction`, `AuditLog`.
  - Giới hạn tải nhật ký hoạt động gần đây (`AuditLog.find({}).sort({ createdAt: -1 }).limit(10)`), bảo đảm hiệu năng cao, không tải toàn bộ collection.
  - Phân tách rõ ràng KPI người dùng (`students`, `teachers`, `sponsors`, `verifiedTeachers`).

### 2.2. Phân hệ Phân tích Tài chính (`financeService.js` & `financeController.js`)
- **File:** `BackEnd/src/services/financeService.js`, `BackEnd/src/controllers/financeController.js`
- **Route:** `GET /api/admin/overview`, `GET /api/admin/finance/overview`
- **Đặc tả kiểm toán:**
  - Hỗ trợ hàm `getVietnamDateBoundaries(period, customFrom, customTo)` chuẩn hóa timezone Việt Nam (ICT = UTC+7).
  - Hỗ trợ các khoảng lọc:
    - `yesterday` (Hôm qua: từ 00:00 đến 23:59 ngày hôm qua).
    - `3d` (3 ngày qua: từ 3 ngày trước đến thời điểm hiện tại).
    - `7d` (7 ngày qua: mặc định).
    - `30d` (30 ngày qua: tương đương 1 tháng gần nhất).
    - `custom` (Khoảng ngày tùy chọn: nhận `from` và `to` định dạng `YYYY-MM-DD`, tự động validate `from <= to`).
  - Phân chia `RevenueTimeSeriesPoint` theo độ mịn thời gian (`hour` cho 1 ngày, `day` cho tuần/tháng, `month` cho kỳ dài).
  - Tổng hợp chính xác doanh thu học phí (`tuitionRevenue`), tài trợ (`donationRevenue`), hoa hồng và các khoản bồi hoàn (`refundLiability`, `completedRefunds`).

### 2.3. Phân hệ Xét duyệt Lớp học (`adminClassService.js` & `teachingController.js`)
- **File:** `BackEnd/src/services/adminClassService.js`, `BackEnd/src/controllers/teachingController.js`, `BackEnd/src/routes/teachingRoutes.js`
- **Route:**
  - `POST /api/admin/classes/:id/approve`
  - `POST /api/admin/classes/:id/reject`
  - `POST /api/admin/classes/:id/request-changes`
- **Đặc tả nghiệp vụ:**
  - `requestChanges`: Bắt buộc nhập `reviewNote`. Cập nhật trạng thái lớp sang `NEED_CHANGES`.
  - Thực hiện trong MongoDB multi-document transaction an toàn.
  - Tự động ghi `AuditLog` (`action: "CLASS_CHANGE_REQUESTED"`).
  - Gửi thông báo đến giáo viên với nội dung yêu cầu chỉnh sửa chi tiết.
  - Cho phép giáo viên cập nhật lớp và gửi duyệt lại sang `PENDING_APPROVAL`.

### 2.4. Phân hệ Tự động Từ chối Lớp Quá hạn (`maintenanceJob.js`)
- **File:** `BackEnd/src/jobs/maintenanceJob.js`
- **Chức năng:** `rejectExpiredPendingClasses()`
- **Đặc tả bảo mật & Concurrency:**
  - Chỉ quét các lớp có trạng thái `PENDING_APPROVAL` và có `startDate <= now`.
  - Tuyệt đối không từ chối nhầm các lớp `APPROVED` hoặc `NEED_CHANGES`.
  - Sử dụng Distributed Job Lock (`jobLock.js`) kèm lease heartbeat và fencing token chống race condition với Admin đang duyệt thủ công.
  - Commit nguyên tử cập nhật Class, tạo AuditLog và tạo Notification cho giáo viên.

### 2.5. Phân hệ Kiểm duyệt Đánh giá (`reviewService.js`)
- **File:** `BackEnd/src/services/reviewService.js`, `BackEnd/src/routes/accountRoutes.js`
- **Route:**
  - `GET /api/admin/reviews`
  - `GET /api/admin/reviews/:id`
  - `POST /api/admin/reviews/:id/hide`
  - `POST /api/admin/reviews/:id/unhide`
  - `DELETE /api/admin/reviews/:id`
  - `POST /api/admin/reviews/:id/restore`
- **Đặc tả:**
  - Đánh giá bị ẩn (`isHidden: true`) hoặc bị xóa mềm (`isDeleted: true`) bị loại bỏ khỏi mọi API public.
  - Tự động tính toán lại điểm đánh giá trung bình (`recalculateRating`) của Lớp học và Giáo viên để đảm bảo tính minh bạch.
  - Ghi nhận `AuditLog` chi tiết cho từng thao tác kiểm duyệt.

### 2.6. Phân hệ Thùng rác & Xóa mềm (`trashService.js`)
- **File:** `BackEnd/src/services/trashService.js`, `BackEnd/src/routes/trashRoutes.js`
- **Quy tắc an toàn dữ liệu:**
  - Áp dụng xóa mềm có kiểm soát cho: Danh mục (`CATEGORY`), Môn học (`SUBJECT`), Khóa học (`COURSE`), Lớp học (`CLASS`), Đánh giá (`REVIEW`).
  - **Vùng cấm xóa mềm:** Tuyệt đối không áp dụng cho Giao dịch thanh toán (`Transaction`), Sổ cái thù lao (`TeacherEarning`), Hồ sơ kiểm toán (`AuditLog`), và Tài khoản người dùng (`User`).
  - Kiểm tra ràng buộc phụ thuộc trước khi khôi phục (`restoreTrashItem`), ngăn ngừa việc khôi phục môn học khi danh mục cha vẫn đang ở trong thùng rác.
