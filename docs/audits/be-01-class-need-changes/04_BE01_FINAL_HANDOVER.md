# BIÊN BẢN BÀN GIAO KỸ THUẬT (FINAL HANDOVER REPORT)
## TASK BE-01 — CLASS NEED_CHANGES WORKFLOW

- **Dự án:** Edunity V3 (No LMS Architecture)
- **Kỹ sư bàn giao:** Senior Backend Engineer (Châu — Academic & Non-Financial Core)
- **Các bên tiếp nhận:** Nhóm Backend Core, QA Automation Lead, Frontend Integration Team
- **Trạng thái bàn giao:** **HOÀN THÀNH 100% — SẴN SÀNG TRIỂN KHAI PRODUCTION**
- **Ngày bàn giao:** 20/11/2026

---

### 1. Tóm tắt Nội dung Bàn giao

Đã hoàn thành toàn bộ 4 mục tiêu của task BE-01:
1. **BE-01.1 (Class Model):** Thêm giá trị `NEED_CHANGES` vào enum `status` trong `Class.js`.
2. **BE-01.2 (Admin Request Changes API):** Cung cấp endpoint `POST /admin/classes/:id/request-changes` có bảo vệ RBAC (`ADMIN`), bắt buộc có `reviewNote` hợp lệ sau trim, chuyển trạng thái sang `NEED_CHANGES`, ghi `AuditLog` và gửi `Notification` cho giáo viên.
3. **BE-01.3 (Teacher Class Service):** Chuyển `EDITABLE_STATUSES` thành `["DRAFT", "NEED_CHANGES"]`. Giáo viên được chỉnh sửa và gửi duyệt lại lớp `NEED_CHANGES`. Lớp `REJECTED` bị khóa cứng vĩnh viễn (Terminal State), trả về `409 CLASS_NOT_EDITABLE` khi cố sửa và `409 CLASS_NOT_SUBMITTABLE` khi cố gửi duyệt.
4. **BE-01.4 (Audit & Notification):** Sử dụng `auditService` và `notificationService` hiện có; lưu đúng actor, targetId, before/after states, gửi thông báo đúng giáo viên sở hữu.

---

### 2. Danh mục Tập tin Thay đổi & Tạo mới

| Đường dẫn Tập tin | Loại thao tác | Mục đích / Trách nhiệm |
| :--- | :---: | :--- |
| [`BackEnd/src/models/Class.js`](file:///c:/CODE/Edunity/BackEnd/src/models/Class.js) | Modify | Thêm `NEED_CHANGES` vào enum trạng thái lớp học |
| [`BackEnd/src/services/adminClassService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/adminClassService.js) | Modify | Hiện thực hàm `requestChanges`, chuẩn hóa thông báo của `rejectClass` |
| [`BackEnd/src/controllers/teachingController.js`](file:///c:/CODE/Edunity/BackEnd/src/controllers/teachingController.js) | Modify | Bổ sung controller handler `requestChanges` |
| [`BackEnd/src/routes/teachingRoutes.js`](file:///c:/CODE/Edunity/BackEnd/src/routes/teachingRoutes.js) | Modify | Đăng ký route `POST /admin/classes/:id/request-changes` |
| [`BackEnd/src/services/teacherClassService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/teacherClassService.js) | Modify | Cập nhật `EDITABLE_STATUSES = ["DRAFT", "NEED_CHANGES"]`, khóa lớp `REJECTED` |
| [`BackEnd/src/services/syllabusService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/syllabusService.js) | Modify | Bảo vệ RBAC giáo trình đối với lớp `NEED_CHANGES` |
| [`BackEnd/tests/be01ClassNeedChanges.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/be01ClassNeedChanges.test.js) | Create | 9 kịch bản kiểm thử toàn diện cho workflow mới |
| [`BackEnd/tests/phase2ReplSet.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/phase2ReplSet.test.js) | Modify | Đồng bộ kịch bản test theo chuẩn `NEED_CHANGES` |
| [`BackEnd/tests/platform.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/platform.test.js) | Modify | Đồng bộ kịch bản vòng đời nền tảng theo chuẩn `NEED_CHANGES` |

---

### 3. Hướng dẫn Tích hợp API (API Integration Guide)

#### Endpoint 1: Admin Yêu cầu Giáo viên Chỉnh sửa Lớp học
- **URL:** `POST /api/admin/classes/:id/request-changes`
- **Quyền:** `ADMIN` (`Authorization: Bearer <token>`)
- **Headers:** `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "reviewNote": "Vui lòng cập nhật lại mô tả lớp học và phân bổ lại thời lượng buổi 1."
  }
  ```
- **Phản hồi Thành công (HTTP 200):**
  ```json
  {
    "success": true,
    "data": {
      "id": "673f8a000000000000000001",
      "status": "NEED_CHANGES",
      "reviewNote": "Vui lòng cập nhật lại mô tả lớp học và phân bổ lại thời lượng buổi 1.",
      "reviewedBy": "673f8a000000000000000002",
      "reviewedAt": "2026-11-20T16:00:00.000Z"
    }
  }
  ```
- **Các mã lỗi nghiệp vụ:**
  - `400 VALIDATION_ERROR`: Thiếu `reviewNote` hoặc `reviewNote` rỗng.
  - `404 CLASS_NOT_FOUND`: ID lớp không tồn tại hoặc đã bị xóa mềm.
  - `409 CLASS_NOT_PENDING_APPROVAL`: Lớp không ở trạng thái `PENDING_APPROVAL`.
  - `403 FORBIDDEN`: Người dùng không phải là ADMIN.

#### Endpoint 2: Giáo viên Chỉnh sửa Lớp `NEED_CHANGES`
- **URL:** `PATCH /api/teacher/classes/:id`
- **Quyền:** `TEACHER` (Chỉ giáo viên sở hữu lớp)
- **Hành vi:** Được phép sửa `className`, `description`, `price`, `capacity`, `schedule`... Trạng thái lớp vẫn là `NEED_CHANGES`.

#### Endpoint 3: Giáo viên Nộp lại Lớp sau khi Chỉnh sửa
- **URL:** `POST /api/teacher/classes/:id/submit`
- **Quyền:** `TEACHER` (Chỉ giáo viên sở hữu lớp)
- **Hành vi:** Thẩm định lại đầy đủ các cổng: completeness, số buổi học, hợp đồng giáo viên (`ACTIVE`), chính sách giá (`ACTIVE`). Nếu đạt, trạng thái chuyển sang `PENDING_APPROVAL`, kích hoạt thông báo gửi Admin.

---

### 4. Cam kết Ràng buộc Kỹ thuật (Constraints Verification)

1. **Frontend:** Không can thiệp mã nguồn Frontend.
2. **Finance & Pricing:** Không thay đổi các bảng giá, tính toán hoa hồng, hoặc logic quyết toán của Tin.
3. **LiveKit / Video:** Không đụng chạm các module WebRTC, phòng học trực tuyến.
4. **Không migrate tự động data cũ:** Các lớp `REJECTED` trong quá khứ được giữ nguyên theo đúng dữ liệu lịch sử.
5. **Zero Dependency:** Không bổ sung bất kỳ thư viện NPM bên ngoài nào.

**KÝ BÀN GIAO:**  
**Châu** — Senior Backend Engineer (Edunity V3)
