# BÁO CÁO HIỆN TRẠNG TRƯỚC KHI TRIỂN KHAI (CURRENT STATE AUDIT)
## TASK BE-02 — AUTOMATIC CLASS EXPIRATION REJECTION

- **Dự án:** Edunity V3 (No LMS Architecture)
- **Kỹ sư phụ trách:** Senior Backend Engineer (Châu — Academic & Catalog Core)
- **Phân hệ:** Quản lý Tự động hóa Vòng đời Lớp học & Bảo trì Hệ thống (Maintenance Jobs)
- **Thời điểm lập:** 20/11/2026

---

### 1. Hiện trạng Kiến trúc & Vấn đề Cốt lõi

Trong Edunity V3, giáo viên tạo lớp học và đặt lịch khai giảng thông qua trường `startDate`. Lớp sau khi hoàn thiện sẽ được gửi duyệt sang trạng thái `PENDING_APPROVAL`.

Trước đợt nâng cấp BE-02:
1. **Lớp học bị treo vô thời hạn (Hanging Pending Classes):**
   - Trong [`BackEnd/src/jobs/maintenanceJob.js`](file:///c:/CODE/Edunity/BackEnd/src/jobs/maintenanceJob.js), tác vụ định kỳ `runMaintenanceJob` (chạy mỗi 5 phút) chỉ thực hiện các bước:
     * Chuyển trạng thái lớp đã duyệt: `OPEN → IN_PROGRESS → COMPLETED` (`advanceClassStatuses`).
     * Hết hạn học bổng (`expireScholarships`).
     * Dọn dẹp bản ghi video hết hạn (`expireOldRecordings`, `failStaleProcessingRecordings`).
     * Quét tái xác minh giáo viên (`runReverificationSweep`).
     * Xử lý Outbox tài chính (`financialOutboxWorker`).
   - **Hoàn toàn không có tác vụ kiểm tra các lớp `PENDING_APPROVAL` đã quá hạn ngày khai giảng.**
2. **Hệ quả nghiệp vụ nghiêm trọng:**
   - Nếu Admin không kịp duyệt trước ngày khai giảng (`startDate`), lớp học vẫn nằm im ở trạng thái `PENDING_APPROVAL`.
   - Học sinh không thể đăng ký vì lớp chưa mở.
   - Nếu vài tuần sau Admin mới vào duyệt lớp, lớp sẽ bị kích hoạt mở tuyển sinh (`OPEN`) khi ngày khai giảng thực tế đã trôi qua trong quá khứ, dẫn đến việc xếp lịch học bị sai lệch hoàn toàn và gây ra khiếu nại từ học viên và giáo viên.

---

### 2. Rà soát Kỹ thuật trên Mã nguồn Hiện tại

#### 2.1. Kiểu dữ liệu `startDate` trong `models/Class.js`
- Định nghĩa schema: `startDate: Date`.
- Dữ liệu được lưu trữ trong MongoDB dưới dạng BSON `Date` (UTC timestamp).
- Khi tạo lớp, `teacherClassService.js` chuyển đổi chuỗi ngày nhận vào thành đối tượng Date thông qua `parseDateTimeInZone`.

#### 2.2. Vấn đề Múi giờ Ứng dụng (Timezone Shift)
- Hệ thống có cấu hình múi giờ nghiệp vụ tại Việt Nam: `APP_TZ_OFFSET_MINUTES = 420` (tương ứng UTC+7, `Asia/Ho_Chi_Minh`).
- Máy chủ backend / container Docker thường chạy mặc định ở múi giờ UTC (`+00:00`).
- Nếu lấy trực tiếp `new Date().getUTCDate()`, ranh giới ngày sẽ bị chậm 7 tiếng so với thực tế tại Việt Nam.
  * *Ví dụ:* Vào lúc 01:00 AM ngày 20/11 tại Việt Nam (UTC+7), giờ UTC của máy chủ vẫn là 18:00 ngày 19/11.
  * Nếu dùng giờ máy chủ, hệ thống sẽ nhận định sai rằng ngày 20/11 chưa đến.
- Do đó, quy tắc xác định "ngày khai giảng đã đến" bắt buộc phải tính toán chuẩn xác theo `APP_TZ_OFFSET_MINUTES` / `APP_TIMEZONE`, độc lập tuyệt đối với timezone của máy chủ OS.

#### 2.3. Hạn chế trong Schema của `AuditLog.js`
- Schema [`BackEnd/src/models/AuditLog.js`](file:///c:/CODE/Edunity/BackEnd/src/models/AuditLog.js) trước đây quy định:
  ```javascript
  actorAdminId: { type: Schema.Types.ObjectId, ref: "User", required: true }
  ```
- Ràng buộc `required: true` khiến các tác vụ tự động ngầm của hệ thống (Background Maintenance Jobs) không thể ghi AuditLog nếu không có một Admin thực hiện.
- Nếu không điều chỉnh schema, lập trình viên sẽ bị cám dỗ tạo ra hành vi xấu: giả mạo (spoof) một Admin ID ảo hoặc lấy bừa một Admin trong database để ghi audit. Điều này vi phạm nghiêm trọng nguyên tắc minh bạch kiểm toán.

#### 2.4. Cơ chế Khóa Job (`jobLock.js`)
- Hệ thống đã có sẵn module [`BackEnd/src/jobs/jobLock.js`](file:///c:/CODE/Edunity/BackEnd/src/jobs/jobLock.js) sử dụng model MongoDB `JobLock` phân tán (`runExclusive("maintenance", 4 * 60 * 1000, ...)`).
- Tuy nhiên, để phòng ngừa trường hợp nhiều node chạy song song hoặc jobLock bị nhả sớm, việc cập nhật trạng thái lớp bắt buộc phải an toàn ở cấp độ câu lệnh cơ sở dữ liệu (Database-level conditional atomic update).
