# EDUNITY V3 — SOFT DELETE FINALIZATION & PERMANENT DELETE
## Tài liệu 06: An ninh Phân quyền và Nhật ký Kiểm toán Độc lập (Security & Audit)

**Mã tác vụ:** `EDUNITY-V3-SOFT-DELETE-FINAL-V2`  
**Nhánh làm việc:** `feature/teacher-admin`  

---

### 1. Mô hình Phân quyền Quản trị (RBAC Architecture)

Hệ thống phân tách rạch ròi 3 cấp độ thẩm quyền trong module Thùng rác:

| Cấp quyền | Vai trò yêu cầu | Năng lực kiểm tra | Thao tác được phép |
| :--- | :--- | :--- | :--- |
| **Cấp 1: Xem Thùng rác** | `role === "ADMIN"` | Tài khoản `ACTIVE`, chưa bị khóa | Xem danh sách, tìm kiếm, phân trang, xem chi tiết |
| **Cấp 2: Khôi phục dữ liệu** | `role === "ADMIN"` | Tài khoản `ACTIVE`, chưa bị khóa | Khôi phục bản ghi hợp lệ về `INACTIVE` / `DRAFT` |
| **Cấp 3: Xóa vĩnh viễn** | `role === "ADMIN"` | **`adminProfile.isSuperAdmin === true`** HOẶC **`adminProfile.permissions.includes("PERMANENT_DELETE")`** | Xóa vĩnh viễn dữ liệu rác sau khi qua 100% dependency guards |

#### Cấu trúc Schema `User.js` Bổ sung:
```javascript
const adminProfileSchema = new Schema(
  {
    permissions: { type: [String], default: [] },
    isSuperAdmin: { type: Boolean, default: false },
  },
  { _id: false }
);
```
- Nếu một Quản trị viên thông thường (không có quyền `PERMANENT_DELETE`) cố tình gọi API xóa vĩnh viễn: Backend từ chối ngay lập tức với mã lỗi `403 FORBIDDEN` (*"Bạn không có quyền thực hiện Xóa vĩnh viễn dữ liệu"*).

---

### 2. Nhật ký Kiểm toán Độc lập (Independent Audit Trail)

Mọi thao tác Xóa vĩnh viễn đều được ghi nhận vào collection độc lập `AuditLog` trước khi lệnh `deleteOne` được thực thi.

#### Cấu trúc Bản ghi `AuditLog`:
```json
{
  "_id": "673f...abcd",
  "actorAdminId": "673e...1234",
  "action": "PERMANENT_DELETE",
  "targetType": "CATEGORY",
  "targetId": "673e...5678",
  "beforeState": {
    "title": "Danh mục thử nghiệm",
    "codeOrSlug": "danh-muc-thu-nghiem",
    "originalStatus": "INACTIVE",
    "softDeletedAt": "2026-11-20T14:30:00.000Z",
    "softDeletedBy": "673e...1234",
    "softDeleteReason": "Dọn dẹp danh mục trùng",
    "permanentDeleteReason": "Admin phê duyệt xóa vĩnh viễn dữ liệu rác",
    "dependenciesChecked": [
      "CHILD_RELATIONS",
      "ENROLLMENT",
      "FINANCIAL_INTEGRITY",
      "AUDIT_SAFETY"
    ]
  },
  "afterState": {
    "permanentlyDeleted": true,
    "deletedAt": "2026-11-21T09:40:00.000Z",
    "permanentDeleteReason": "Admin phê duyệt xóa vĩnh viễn dữ liệu rác"
  },
  "createdAt": "2026-11-21T09:40:00.123Z"
}
```

#### Nguyên tắc Bất biến Kiểm toán:
- **Lưu trữ độc lập:** Bản ghi kiểm toán không nằm chung trong document bị xóa.
- **Không bao giờ xóa AuditLog:** AuditLog không hỗ trợ bất kỳ thao tác xóa mềm hay xóa cứng nào.
- **Fail-safe Execution:** Nếu quá trình ghi `AuditLog` gặp sự cố (ví dụ lỗi kết nối database kiểm toán), giao dịch xóa vĩnh viễn sẽ bị hủy bỏ ngay lập tức, đảm bảo không có bất kỳ hành động xóa nào diễn ra mà không có dấu vết kiểm toán.
