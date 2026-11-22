# ĐẶC TẢ HỢP ĐỒNG GIAO TIẾP API (API CONTRACT)
**Mã tài liệu:** `docs/ADMIN-FULLSTACK-01/05_API_CONTRACT.md`  
**Dự án:** EDUNITY V3  
**Vai trò:** Senior Fullstack Engineer  

---

## 1. NGUYÊN TẮC HỢP ĐỒNG API
- Tất cả API đều yêu cầu quyền Quản trị viên (`role === "ADMIN"`).
- Định dạng dữ liệu: JSON chuẩn RESTful `{ success: true, data: ... }` hoặc `{ success: false, error: "CODE", message: "..." }`.
- Không thay đổi các endpoint sẵn có; giữ nguyên tương thích ngược (Backward Compatibility).

---

## 2. CHI TIẾT CÁC ENDPOINT ADMIN

### 2.1. Phân tích tài chính theo kỳ (`GET /api/admin/overview`)
- **Method:** `GET`
- **Path:** `/api/admin/overview` (hoặc `/api/admin/finance/overview`)
- **Query Parameters:**
  - `period`: `yesterday` | `3d` | `7d` | `30d` | `custom`
  - `from`: `YYYY-MM-DD` (bắt buộc khi `period === "custom"`)
  - `to`: `YYYY-MM-DD` (bắt buộc khi `period === "custom"`)
- **Response Format:**
  ```json
  {
    "success": true,
    "data": {
      "period": {
        "key": "7d",
        "from": "2026-11-14T17:00:00.000Z",
        "to": "2026-11-21T16:59:59.999Z",
        "label": "7 ngày qua (15/11 - 21/11/2026)",
        "granularity": "day"
      },
      "kpis": {
        "tuitionRevenue": {
          "value": "12500000",
          "formattedValue": "12.500.000 ₫",
          "hasComparison": true,
          "deltaPercent": 8.5,
          "trendDirection": "up"
        },
        "donationRevenue": { "value": "5000000" },
        "teacherPaidOut": { "value": "8000000" },
        "refundLiability": { "value": "0" }
      },
      "charts": {
        "revenueTimeSeries": [
          {
            "key": "2026-11-15",
            "label": "15/11",
            "tuition": 2000000,
            "donation": 500000,
            "total": 2500000
          }
        ]
      }
    }
  }
  ```

---

### 2.2. Quy trình Duyệt Lớp học & Yêu cầu Sửa
#### A. Phê duyệt mở lớp
- **Method:** `POST`
- **Path:** `/api/admin/classes/:id/approve`
- **Body:** `{ "reviewNote": "Đạt chuẩn" }` (tùy chọn)
- **Kết quả:** Trạng thái chuyển `OPEN`.

#### B. Từ chối mở lớp
- **Method:** `POST`
- **Path:** `/api/admin/classes/:id/reject`
- **Body:** `{ "reviewNote": "Lý do từ chối cụ thể..." }` (bắt buộc)
- **Kết quả:** Trạng thái chuyển `REJECTED`.

#### C. Yêu cầu chỉnh sửa lớp học (NEED_CHANGES)
- **Method:** `POST`
- **Path:** `/api/admin/classes/:id/request-changes`
- **Body:**
  ```json
  {
    "reviewNote": "Nội dung yêu cầu giáo viên điều chỉnh chi tiết..."
  }
  ```
- **Xác thực:** `reviewNote` bắt buộc phải là chuỗi không rỗng (nếu rỗng trả về mã lỗi `400 VALIDATION_ERROR`).
- **Kết quả:**
  - Trạng thái lớp chuyển sang `NEED_CHANGES`.
  - Cập nhật trường `reviewNote` và `reviewedAt`.
  - Ghi nhận `AuditLog` với `action: "CLASS_CHANGE_REQUESTED"`.
  - Phát sinh thông báo `Notification` đến tài khoản giáo viên chủ nhiệm lớp.

---

### 2.3. Quản lý Người dùng & Lý do Khóa
- **Cập nhật trạng thái:** `PATCH /api/admin/users/:id/status`
- **Body:**
  ```json
  {
    "status": "SUSPENDED", // hoặc "BANNED" / "ACTIVE"
    "reason": "Vi phạm quy chế giảng dạy..."
  }
  ```
- **Lấy thông tin chi tiết:** `GET /api/admin/users/:id`
  - Trả về thông tin người dùng kèm metadata trạng thái: `statusReason`, `statusChangedAt`, `statusChangedBy` (gồm `id`, `email`, `fullName`).
  - Nếu tài khoản `ACTIVE`, `statusReason` trả về `null`.
- **Lịch sử trạng thái:** `GET /api/admin/users/:id/status-history`
  - Trả về danh sách phân trang các lần thay đổi trạng thái kèm đối chiếu `AuditLog`.

---

### 2.4. Kiểm duyệt Đánh giá & Bình luận
- **Danh sách kiểm duyệt:** `GET /api/admin/reviews?status=ALL&rating=5&search=...&page=1&pageSize=10`
- **Ẩn đánh giá:** `POST /api/admin/reviews/:id/hide` với body `{ "reason": "Nội dung phản cảm" }`
- **Hiển thị lại:** `POST /api/admin/reviews/:id/unhide`
- **Xóa mềm đánh giá:** `DELETE /api/admin/reviews/:id` với body `{ "reason": "Xóa theo yêu cầu pháp lý" }`
- **Khôi phục đánh giá:** `POST /api/admin/reviews/:id/restore`

---

### 2.5. Thùng rác Hệ thống (Trash)
- **Danh sách rác:** `GET /api/admin/trash?type=ALL&search=...&page=1&pageSize=10`
  - Hỗ trợ các `type`: `ALL`, `CATEGORY`, `SUBJECT`, `COURSE`, `CLASS`, `REVIEW`.
- **Khôi phục:** `POST /api/admin/trash/:type/:id/restore`
  - Thực hiện kiểm tra phụ thuộc (ví dụ không thể khôi phục Subject nếu Category cha đã bị xóa).
- **Xóa vĩnh viễn (Hard Delete):** `DELETE /api/admin/trash/:type/:id`
  - Bắt buộc nhập văn bản xác nhận `confirmText = "XÓA VĨNH VIỄN"` và `reason`.
