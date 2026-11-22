# BIÊN BẢN BÀN GIAO KỸ THUẬT (FINAL HANDOVER REPORT)
## TASK BE-02 — AUTOMATIC CLASS EXPIRATION REJECTION

- **Dự án:** Edunity V3 (No LMS Architecture)
- **Kỹ sư bàn giao:** Senior Backend Engineer (Châu — Academic & Non-Financial Core)
- **Các bên tiếp nhận:** Nhóm Vận hành Hệ thống (DevOps), Nhóm Backend Core, QA Lead
- **Trạng thái bàn giao:** **HOÀN THÀNH 100% — SẴN SÀNG TRIỂN KHAI PRODUCTION**
- **Ngày bàn giao:** 20/11/2026

---

### 1. Tóm tắt Nội dung Bàn giao

Đã hoàn thành toàn bộ 5 hạng mục của task BE-02:
1. **BE-02.1 (Expired Class Detection):** Quét các lớp `status = "PENDING_APPROVAL"` có `startDate <= today` theo múi giờ vận hành ứng dụng (mặc định UTC+7 / `APP_TZ_OFFSET_MINUTES = 420`).
2. **BE-02.2 (Automatic Rejection):** Chuyển trạng thái sang `REJECTED`, gán `reviewNote: "Lớp học đã đến ngày khai giảng nhưng chưa được phê duyệt."`, giữ nguyên `startDate`, không xóa lớp, không ảnh hưởng các lớp khác.
3. **BE-02.3 (Audit System Actor):** Nâng cấp schema `AuditLog` cho phép `actorAdminId: null` và `actorType: "SYSTEM"`. Tuyệt đối không giả mạo Admin ID.
4. **BE-02.4 (Idempotent Notification):** Gửi thông báo đến giáo viên sở hữu lớp, sử dụng `dedupeKey: "CLASS_EXPIRED_REJECTED:<classId>"` để chống gửi lặp.
5. **BE-02.5 (Concurrency & Idempotency):** Áp dụng cập nhật nguyên tử có điều kiện `status: "PENDING_APPROVAL"`, kết hợp với `jobLock` phân tán hiện có.

---

### 2. Danh mục Tập tin Thay đổi & Tạo mới

| Đường dẫn Tập tin | Loại thao tác | Mục đích / Trách nhiệm |
| :--- | :---: | :--- |
| [`BackEnd/src/jobs/maintenanceJob.js`](file:///c:/CODE/Edunity/BackEnd/src/jobs/maintenanceJob.js) | Modify | Viết logic quét ngày khai giảng theo timezone và tích hợp vào `runMaintenanceJob` |
| [`BackEnd/src/models/AuditLog.js`](file:///c:/CODE/Edunity/BackEnd/src/models/AuditLog.js) | Modify | Nâng cấp schema hỗ trợ `actorType: "SYSTEM"` và `actorAdminId: null` |
| [`BackEnd/src/services/auditService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/auditService.js) | Modify | Tự động phân định `SYSTEM` vs `ADMIN` khi ghi nhật ký kiểm toán |
| [`BackEnd/tests/be02MaintenanceExpiredClass.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/be02MaintenanceExpiredClass.test.js) | Create | 9 kịch bản kiểm thử toàn diện cho cơ chế từ chối tự động |

---

### 3. Hướng dẫn Vận hành & Cấu hình Môi trường

#### Biến Môi trường Khuyến nghị
Trong file `.env`:
```env
# Múi giờ chuẩn nghiệp vụ của Edunity tại Việt Nam (UTC+7 tính bằng phút)
APP_TZ_OFFSET_MINUTES=420

# Hoặc tên múi giờ IANA chuẩn
APP_TIMEZONE=Asia/Ho_Chi_Minh
```

#### Chu kỳ Chạy Tự động
Tác vụ được tích hợp tự động vào `maintenanceJob.js` và được kích hoạt bởi cron job `startMaintenanceJob()`:
- **Tần suất chạy:** Mỗi 5 phút một lần (`*/5 * * * *`).
- **Khóa phân tán:** Được bảo vệ bởi lease `maintenance` với thời hạn TTL 4 phút trong MongoDB (`JobLock`).

---

### 4. Cam kết Ràng buộc Kỹ thuật (Constraints Verification)

1. **Frontend:** Không can thiệp mã nguồn Frontend.
2. **Khóa học & Phê duyệt:** Không can thiệp vào quy trình duyệt Course Catalog.
3. **Chính sách giá:** Không thay đổi bất kỳ chính sách giá nào.
4. **Không đụng trạng thái khác:** Giữ nguyên vẹn các lớp `OPEN`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`.
5. **Không tự mở rộng sang `NEED_CHANGES`:** Lớp `NEED_CHANGES` không bị tự động từ chối, giáo viên được toàn quyền sửa đổi và nộp lại khi sẵn sàng.
6. **Lịch dạy:** Không thay đổi lịch buổi học (`Session`) hoặc lịch của giáo viên.

**KÝ BÀN GIAO:**  
**Châu** — Senior Backend Engineer (Edunity V3)
