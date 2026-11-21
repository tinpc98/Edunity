# BÁO CÁO TRIỂN KHAI KỸ THUẬT (IMPLEMENTATION REPORT)
## TASK BE-01 — CLASS NEED_CHANGES WORKFLOW

- **Dự án:** Edunity V3 (No LMS Architecture)
- **Kỹ sư phụ trách:** Senior Backend Engineer (Châu)
- **Ngày hoàn thành:** 20/11/2026

---

### 1. Chi tiết Thay đổi theo Từng Tập tin (File Changes)

#### 1.1. Model Lớp học — [`BackEnd/src/models/Class.js`](file:///c:/CODE/Edunity/BackEnd/src/models/Class.js)
Bổ sung giá trị `NEED_CHANGES` vào enum `status` của schema `Class`:
```javascript
status: {
  type: String,
  enum: ["DRAFT", "PENDING_APPROVAL", "OPEN", "NEED_CHANGES", "REJECTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
  default: "DRAFT",
},
```
- Các trường `reviewedBy`, `reviewedAt`, `reviewNote` đã có sẵn thông qua plugin `reviewablePlugin`.

---

#### 1.2. Dịch vụ Admin — [`BackEnd/src/services/adminClassService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/adminClassService.js)
1. Bổ sung các helper kiểm tra chuỗi rỗng và tạo lỗi chuẩn:
   ```javascript
   const isBlank = (val) => val === undefined || val === null || (typeof val === "string" && val.trim() === "");
   const validationError = (msg) => new AppError(msg, "VALIDATION_ERROR", 400);
   ```

2. Cập nhật hàm `rejectClass`:
   Sửa nội dung thông báo mặc định gửi giáo viên từ `"cần chỉnh sửa và gửi duyệt lại"` thành `"đã bị từ chối"`, phản ánh đúng bản chất terminal của `REJECTED`:
   ```javascript
   await notify(
     updated.teacherId,
     "Lớp học bị từ chối",
     updated.reviewNote || `Lớp "${updated.className}" đã bị từ chối.`,
     "CLASS_REJECTED"
   );
   ```

3. Hiện thực mới hàm `requestChanges`:
   - Xác thực `classId` hợp lệ dạng ObjectId; nếu không hợp lệ throw `CLASS_NOT_FOUND` (404).
   - Kiểm tra bắt buộc `reviewNote` không được để trống sau khi trim; nếu thiếu throw `validationError("reviewNote is required when requesting changes")` (400).
   - Sử dụng cập nhật nguyên tử `Class.findOneAndUpdate`:
     ```javascript
     const updated = await Class.findOneAndUpdate(
       { _id: classId, status: "PENDING_APPROVAL", ...NOT_DELETED },
       {
         $set: {
           status: "NEED_CHANGES",
           reviewedBy: adminId,
           reviewedAt: new Date(),
           reviewNote: reviewNote,
           updatedBy: adminId,
         },
       },
       { returnDocument: "after" }
     ).lean();
     ```
   - Nếu không tìm thấy bản ghi: kiểm tra `Class.exists`; nếu lớp không tồn tại trả về 404 `CLASS_NOT_FOUND`, nếu lớp đang ở trạng thái khác trả về 409 `CLASS_NOT_PENDING_APPROVAL`.
   - Ghi nhận `AuditLog` theo chuẩn hệ thống:
     ```javascript
     await audit({
       actorAdminId: adminId,
       action: "CLASS_CHANGES_REQUESTED",
       targetType: "Class",
       targetId: updated._id,
       beforeState: { status: "PENDING_APPROVAL" },
       afterState: { status: "NEED_CHANGES", reviewNote: updated.reviewNote },
     });
     ```
   - Gửi `Notification` đến đúng giáo viên sở hữu lớp:
     ```javascript
     await notify(
       updated.teacherId,
       "Lớp học cần chỉnh sửa",
       updated.reviewNote,
       "CLASS_CHANGES_REQUESTED"
     );
     ```
   - Xuất khẩu hàm: `module.exports = { listPendingClasses, getClassForReview, approveClass, rejectClass, requestChanges };`.

---

#### 1.3. Controller & Routing — [`teachingController.js`](file:///c:/CODE/Edunity/BackEnd/src/controllers/teachingController.js) & [`teachingRoutes.js`](file:///c:/CODE/Edunity/BackEnd/src/routes/teachingRoutes.js)
1. Trong controller:
   ```javascript
   exports.requestChanges = handle((req) => adminClasses.requestChanges(req.user.id, req.params.id, body(req)));
   ```
2. Trong routes:
   Đăng ký endpoint và bảo vệ nghiêm ngặt bằng middleware `admin` (`authMiddleware` + `requireRole("ADMIN")`):
   ```javascript
   router.post("/admin/classes/:id/request-changes", admin, controller.requestChanges);
   ```

---

#### 1.4. Dịch vụ Giáo viên — [`BackEnd/src/services/teacherClassService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/teacherClassService.js)
1. Điều chỉnh danh sách trạng thái được phép sửa đổi:
   ```javascript
   const EDITABLE_STATUSES = ["DRAFT", "NEED_CHANGES"]; // BE-01: REJECTED is final terminal status
   ```
2. Trong hàm `updateClass`:
   Chặn toàn bộ thao tác sửa đổi trên các trạng thái ngoài `DRAFT` và `NEED_CHANGES` (bao gồm `REJECTED`):
   ```javascript
   if (!EDITABLE_STATUSES.includes(cls.status)) {
     throw new AppError("Only DRAFT or NEED_CHANGES classes can be edited", "CLASS_NOT_EDITABLE", 409);
   }
   ```
3. Trong hàm `submitClass`:
   Chỉ cho phép nộp duyệt lớp ở trạng thái `DRAFT` hoặc `NEED_CHANGES`:
   ```javascript
   if (!EDITABLE_STATUSES.includes(cls.status)) {
     throw new AppError("Only DRAFT or NEED_CHANGES classes can be submitted", "CLASS_NOT_SUBMITTABLE", 409);
   }
   // Và trong atomic findOneAndUpdate:
   const updated = await Class.findOneAndUpdate(
     { _id: cls._id, status: { $in: EDITABLE_STATUSES } },
     { $set: { status: "PENDING_APPROVAL", level: alignment.level, updatedBy: teacherId, ...snapshots } },
     { returnDocument: "after" }
   ).lean();
   if (!updated) throw new AppError("Only DRAFT or NEED_CHANGES classes can be submitted", "CLASS_NOT_SUBMITTABLE", 409);
   ```

---

#### 1.5. Phân quyền Giáo trình — [`BackEnd/src/services/syllabusService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/syllabusService.js)
Bổ sung `NEED_CHANGES` vào quy tắc RBAC truy cập giáo trình:
```javascript
// Unified RBAC policy: DRAFT, PENDING_APPROVAL, NEED_CHANGES, REJECTED strictly restricted to Teacher Owner and Admin
if (["DRAFT", "PENDING_APPROVAL", "NEED_CHANGES", "REJECTED"].includes(classDoc.status)) { ... }
```
Đảm bảo học viên hoặc người dùng chưa đăng nhập không thể xem thông tin syllabus của lớp đang trong quá trình chỉnh sửa.

---

### 2. Sơ đồ Chuyển đổi Trạng thái Lớp học (State Transition Matrix)

```
        ┌────────┐
        │ DRAFT  │ ──(submitClass)──> ┌──────────────────┐
        └────────┘                    │ PENDING_APPROVAL │
            ▲                         └──────────────────┘
            │                           │        │       │
            │               approveClass│        │       │rejectClass
            │                           │        │       ▼
            │                           │        │  ┌──────────┐
            │                           │        │  │ REJECTED │ (TERMINAL - KHÓA CỨNG)
            │                           │        │  └──────────┘
            │                           ▼        │
            │                        ┌──────┐    │requestChanges
            │                        │ OPEN │    ▼
            │                        └──────┘ ┌──────────────┐
            │                                 │ NEED_CHANGES │
            │                                 └──────────────┘
            │                                        │
            └───────────(edit & submitClass)─────────┘
```
