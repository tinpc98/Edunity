# BÁO CÁO TRIỂN KHAI KỸ THUẬT (IMPLEMENTATION REPORT)
## TASK BE-02 — AUTOMATIC CLASS EXPIRATION REJECTION

- **Dự án:** Edunity V3 (No LMS Architecture)
- **Kỹ sư phụ trách:** Senior Backend Engineer (Châu)
- **Ngày hoàn thành:** 20/11/2026

---

### 1. Chi tiết Thay đổi Kỹ thuật theo Từng Tập tin

#### 1.1. Nâng cấp Schema Kiểm toán — [`BackEnd/src/models/AuditLog.js`](file:///c:/CODE/Edunity/BackEnd/src/models/AuditLog.js) & [`BackEnd/src/services/auditService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/auditService.js)
Để hỗ trợ ghi nhận tác vụ tự động của hệ thống một cách minh bạch mà **không giả mạo Admin ID**:
1. Trong `AuditLog.js`:
   - Chuyển `actorAdminId` thành không bắt buộc: `{ required: false, default: null }`.
   - Bổ sung trường `actorType`: `{ type: String, enum: ["ADMIN", "SYSTEM"], default: "ADMIN" }`.
2. Trong `auditService.js`:
   - Nếu `actorAdminId` rỗng hoặc `actorType === "SYSTEM"`, trường `actorAdminId` được lưu là `null` và `actorType` được lưu là `"SYSTEM"`.
   - Giữ nguyên vẹn 100% tính tương thích ngược cho tất cả các lời gọi Admin trước đây.

---

#### 1.2. Hiện thực Logic Từ chối Tự động — [`BackEnd/src/jobs/maintenanceJob.js`](file:///c:/CODE/Edunity/BackEnd/src/jobs/maintenanceJob.js)

##### A. Phân giải Múi giờ Ứng dụng độc lập với Server
```javascript
const resolveTzOffsetMinutes = (options = {}) => {
  if (options && options.tzOffsetMinutes !== undefined && options.tzOffsetMinutes !== null) {
    const num = Number(options.tzOffsetMinutes);
    if (!Number.isNaN(num)) return num;
  }
  if (process.env.APP_TZ_OFFSET_MINUTES !== undefined && process.env.APP_TZ_OFFSET_MINUTES !== null) {
    const envNum = parseInt(process.env.APP_TZ_OFFSET_MINUTES, 10);
    if (!Number.isNaN(envNum)) return envNum;
  }
  // Mặc định múi giờ Việt Nam UTC+7 (420 phút)
  return 420;
};
```

##### B. Chuyển đổi Ngày Lịch theo Múi giờ
Chuyển đổi thời điểm UTC thành chuỗi ngày lịch `YYYY-MM-DD` tại múi giờ đích bằng phép toán cộng dồn mili-giây thuần túy, tuyệt đối không dùng phương thức định dạng cục bộ của hệ điều hành máy chủ:
```javascript
const getZonedCalendarDateStr = (date, offsetMinutes) => {
  const localMs = date.getTime() + offsetMinutes * 60 * 1000;
  const d = new Date(localMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isClassStartDateReached = (startDate, now, offsetMinutes) => {
  if (!startDate || !(startDate instanceof Date) || isNaN(startDate.getTime())) {
    return false;
  }
  const nowDateStr = getZonedCalendarDateStr(now, offsetMinutes);
  const startDateStr = getZonedCalendarDateStr(startDate, offsetMinutes);
  return startDateStr <= nowDateStr;
};
```

##### C. Hàm Quét & Từ chối `rejectExpiredPendingClasses`
1. **Bộ lọc ứng viên (Candidate Filter):**
   ```javascript
   const candidates = await Class.find({
     status: "PENDING_APPROVAL",
     startDate: { $exists: true, $ne: null },
     ...NOT_DELETED,
   }).select("_id className teacherId startDate status").lean();
   ```
   *Chỉ lấy các lớp đang chờ duyệt và có ngày khai giảng. Không can thiệp `NEED_CHANGES`, `DRAFT`, `OPEN`, `IN_PROGRESS`.*

2. **Cập nhật nguyên tử có điều kiện (Conditional Atomic Update):**
   ```javascript
   const updated = await Class.findOneAndUpdate(
     {
       _id: cls._id,
       status: "PENDING_APPROVAL", // Điều kiện chặn race condition
       ...NOT_DELETED,
     },
     {
       $set: {
         status: "REJECTED",
         reviewNote: "Lớp học đã đến ngày khai giảng nhưng chưa được phê duyệt.",
         reviewedAt: now,
         updatedBy: null, // Actor hệ thống
       },
     },
     { returnDocument: "after" }
   ).lean();
   ```
   Nếu Admin đã kịp duyệt lớp hoặc một worker khác đã xử lý, `updated` sẽ trả về `null` và vòng lặp bỏ qua ngay lập tức.

3. **Ghi nhận Kiểm toán Hệ thống:**
   ```javascript
   await audit({
     actorAdminId: null,
     actorType: "SYSTEM",
     action: "CLASS_EXPIRED_REJECTED",
     targetType: "Class",
     targetId: updated._id,
     beforeState: { status: "PENDING_APPROVAL" },
     afterState: {
       status: "REJECTED",
       reviewNote: updated.reviewNote,
       reason: "START_DATE_PASSED_WITHOUT_APPROVAL",
     },
   });
   ```

4. **Gửi Thông báo Chống Trùng lặp (Idempotent Notification):**
   ```javascript
   await notify(
     updated.teacherId,
     "Lớp học bị từ chối tự động",
     `Lớp "${updated.className}" đã bị từ chối tự động do đã đến ngày khai giảng nhưng chưa được phê duyệt.`,
     "CLASS_EXPIRED_REJECTED",
     { dedupeKey: `CLASS_EXPIRED_REJECTED:${updated._id.toString()}` }
   );
   ```
   Chỉ mục duy nhất `{ userId: 1, dedupeKey: 1 }` trong `Notification.js` đảm bảo không bao giờ sinh thông báo trùng khi job chạy lại.

5. **Cô lập lỗi (Fault Isolation):**
   Bọc `try ... catch` riêng biệt cho từng lớp học. Nếu một lớp gặp sự cố cơ sở dữ liệu tạm thời, lỗi được đẩy vào danh sách `errors` và vòng lặp tiếp tục xử lý toàn bộ các lớp còn lại.

6. **Tích hợp vào `runMaintenanceJob`:**
   Bổ sung bước `expiredPendingClasses` vào chuỗi housekeeping định kỳ:
   ```javascript
   const steps = {
     classes: () => advanceClassStatuses(now),
     expiredPendingClasses: () => rejectExpiredPendingClasses(now, options),
     scholarships: () => expireScholarships(now),
     expiredRecordings: () => expireOldRecordings(now),
     staleRecordings: () => failStaleProcessingRecordings(now),
     teacherReverification: () => runReverificationSweep(now),
   };
   ```

---

### 2. Bảng Ràng buộc Nghiệp vụ (Business Gates & Invariants)

| Tiêu chí | Quy định Kỹ thuật | Cơ chế Đảm bảo |
| :--- | :--- | :--- |
| **Phạm vi trạng thái** | Chỉ xử lý lớp `PENDING_APPROVAL` | Lọc cứng trong query: `{ status: "PENDING_APPROVAL" }` |
| **Không đụng `NEED_CHANGES`** | Lớp đang yêu cầu sửa được giữ nguyên để giáo viên sửa | Loại trừ hoàn toàn khỏi bộ lọc |
| **Không đổi ngày khai giảng** | `startDate` không được phép chỉnh sửa | Câu lệnh `$set` chỉ cập nhật `status`, `reviewNote`, `reviewedAt` |
| **Không xóa lớp** | Bản ghi phải được bảo toàn lịch sử | Sử dụng `findOneAndUpdate` đổi trạng thái, không dùng `deleteOne` |
| **Tính lũy đẳng (Idempotency)**| Chạy job nhiều lần không sinh tác dụng phụ | Cập nhật có điều kiện `status: "PENDING_APPROVAL"` và `dedupeKey` |
| **Không giả mạo Admin** | Ghi nhận đúng danh tính tác nhân hệ thống | `actorAdminId: null`, `actorType: "SYSTEM"` |
