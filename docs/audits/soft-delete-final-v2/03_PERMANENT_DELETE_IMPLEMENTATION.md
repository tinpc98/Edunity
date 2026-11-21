# EDUNITY V3 — SOFT DELETE FINALIZATION & PERMANENT DELETE
## Tài liệu 03: Triển khai Chức năng Xóa Vĩnh viễn (Permanent Delete Implementation)

**Mã tác vụ:** `EDUNITY-V3-SOFT-DELETE-FINAL-V2`  
**Endpoint:** `DELETE /api/admin/trash/:type/:id/permanent`  
**Nhánh làm việc:** `feature/teacher-admin`  
**Controllers & Routes:** `trashController.js`, `trashRoutes.js`, `trashService.js`  

---

### 1. Phân biệt Bản chất: Xóa mềm vs. Xóa vĩnh viễn

| Tiêu chí | Xóa mềm (Soft Delete) | Xóa vĩnh viễn (Permanent Delete) |
| :--- | :--- | :--- |
| **Trạng thái lưu trữ** | Vẫn nằm trong MongoDB (`isDeleted: true`) | Bị xóa vật lý hoàn toàn khỏi collection (`deleteOne`) |
| **Khả năng khôi phục** | Có thể khôi phục về trạng thái `INACTIVE`/`DRAFT` | **Không thể khôi phục** bằng chức năng Thùng rác thông thường |
| **Mục đích** | Ẩn tạm thời, đưa vào hàng đợi kiểm tra | Dọn dẹp dữ liệu rác/thử nghiệm sau khi đã xác minh kỹ lưỡng |
| **Điều kiện tiên quyết** | Bản ghi đang hoạt động (`isDeleted: false`) | **Bắt buộc** bản ghi đã nằm trong Thùng rác (`isDeleted: true`) |
| **Quyền hạn yêu cầu** | Role `ADMIN` | Role `ADMIN` + Quyền `PERMANENT_DELETE` / Super Admin |

---

### 2. Kiến trúc API và Luồng Xử lý 12 Bước (12-Step Workflow)

Khi nhận request `DELETE /api/admin/trash/:type/:id/permanent`:

```
1. Authenticate JWT Access Token
       │
2. Authorize Permanent Deletion (Role ADMIN & PERMANENT_DELETE capability)
       │
3. Validate Resource Type (Allowlist: CATEGORY, SUBJECT, COURSE, CLASS, REVIEW)
       │
4. Validate MongoDB ObjectId format
       │
5. Find existing record in collection
       │
6. Verify soft-deleted state (Must have isDeleted === true)
       │
7. Verify domain dependencies (No blocking children, no active references)
       │
8. Verify no financial/legal blockers (No Enrollment, Payment, RefundCase...)
       │
9. Capture pre-delete state snapshot (name, slug, soft-delete metadata, check list)
       │
10. Record irreversible-delete audit log into AuditLog collection
       │
11. Perform physical collection.deleteOne({ _id, isDeleted: true })
       │
12. Return safe response { success: true, message: "Dữ liệu đã được xóa vĩnh viễn..." }
```

---

### 3. Chi tiết Mã nguồn Triển khai

#### A. Route Mapping (`BackEnd/src/routes/trashRoutes.js`):
```javascript
const express = require("express");
const controller = require("../controllers/trashController");
const authMiddleware = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/requireRole");

const router = express.Router();
const admin = [authMiddleware, requireRole("ADMIN")];

router.get("/admin/trash", admin, controller.listTrash);
router.get("/admin/trash/:type/:id", admin, controller.getTrashDetail);
router.post("/admin/trash/:type/:id/restore", admin, controller.restoreTrashItem);
router.delete("/admin/trash/:type/:id/permanent", admin, controller.permanentDeleteTrashItem);

module.exports = router;
```

#### B. Controller Handler (`BackEnd/src/controllers/trashController.js`):
```javascript
exports.permanentDeleteTrashItem = handle((req) =>
  trashService.permanentDeleteTrashItem(
    req.user.id,
    req.params.type,
    req.params.id,
    req.body?.reason || req.query?.reason
  )
);
```

#### C. Xử lý Tranh chấp Đồng thời & Tính Idempotent:
- Câu lệnh xóa sử dụng điều kiện nguyên tử: `deleteOne({ _id: id, isDeleted: true })`.
- Nếu hai request xóa đồng thời cùng gọi vào một record: Request đầu tiên xóa thành công và ghi log; request thứ hai sẽ nhận mã lỗi 404 (do bản ghi không còn tồn tại) và không gây ra bất kỳ tác dụng phụ nào cho hệ thống.
