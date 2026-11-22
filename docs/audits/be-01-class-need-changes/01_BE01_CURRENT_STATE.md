# BÁO CÁO HIỆN TRẠNG TRƯỚC KHI TRIỂN KHAI (CURRENT STATE AUDIT)
## TASK BE-01 — CLASS NEED_CHANGES WORKFLOW

- **Dự án:** Edunity V3 (No LMS Architecture)
- **Kỹ sư phụ trách:** Senior Backend Engineer (Châu — Academic & Catalog Core)
- **Phân hệ:** Quản lý Vòng đời Lớp học (Class Lifecycle Governance)
- **Thời điểm lập:** 20/11/2026

---

### 1. Bối cảnh Nghiệp vụ & Vấn đề Cốt lõi

Trước đợt nâng cấp BE-01, vòng đời phê duyệt lớp học của Edunity V3 chỉ có 2 kết quả khả dĩ khi Admin xem xét một lớp ở trạng thái `PENDING_APPROVAL`:
1. `APPROVE` (`POST /admin/classes/:id/approve`): Chuyển trạng thái sang `OPEN`, mở cổng tuyển sinh.
2. `REJECT` (`POST /admin/classes/:id/reject`): Chuyển trạng thái sang `REJECTED`.

#### Điểm bất cập kỹ thuật (Architectural Flaw)
Trong quy định cũ (BR-51), trạng thái `REJECTED` bị lạm dụng đồng thời cho 2 mục đích hoàn toàn trái ngược:
1. **Từ chối vĩnh viễn (Terminal Rejection):** Lớp học vi phạm nghiêm trọng chính sách, hợp đồng giáo viên không hợp lệ, hoặc chương trình học không được phép mở.
2. **Yêu cầu chỉnh sửa (Request Changes / Revision Needed):** Lớp học chỉ thiếu thông tin mô tả, lịch học chưa hợp lý, hoặc cần điều chỉnh giá và nội dung buổi học.

Do sử dụng chung trạng thái `REJECTED`, mã nguồn trong `BackEnd/src/services/teacherClassService.js` đã định nghĩa:
```javascript
const EDITABLE_STATUSES = ["DRAFT", "REJECTED"]; // BR-47, BR-51 cũ
```
Hệ quả:
- Bất kỳ lớp nào bị `REJECTED` thì giáo viên sở hữu đều có quyền gọi `PATCH /api/teacher/classes/:id` để sửa và gọi `POST /api/teacher/classes/:id/submit` để gửi duyệt lại.
- Admin **hoàn toàn bất lực trong việc từ chối dứt điểm** một lớp học vi phạm, vì giáo viên luôn có thể mở lại luồng duyệt.
- Thông báo từ chối trong `adminClassService.js` chứa câu chữ mập mờ: `"Lớp ... cần chỉnh sửa và gửi duyệt lại."`, ngay cả khi lớp bị từ chối thẳng thừng.

---

### 2. Rà soát Mã nguồn Hiện trạng (Source Code Audit)

#### 2.1. Model `Class.js` (`BackEnd/src/models/Class.js`)
- Enum trạng thái hiện tại:
  ```javascript
  enum: ["DRAFT", "PENDING_APPROVAL", "OPEN", "REJECTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]
  ```
- Hoàn toàn chưa có giá trị `NEED_CHANGES`.

#### 2.2. Dịch vụ Admin `adminClassService.js` (`BackEnd/src/services/adminClassService.js`)
- Chỉ có 4 hàm: `listPendingClasses`, `getClassForReview`, `approveClass`, `rejectClass`.
- Chưa có hàm `requestChanges`.
- Trong hàm `rejectClass`, trường `reviewNote` không bắt buộc (chỉ fallback `body.reviewNote || null`), dẫn đến việc Admin có thể từ chối mà không để lại lý do.

#### 2.3. Dịch vụ Teacher `teacherClassService.js` (`BackEnd/src/services/teacherClassService.js`)
- Các hàm `updateClass` và `submitClass` chỉ kiểm tra `EDITABLE_STATUSES.includes(cls.status)` với `EDITABLE_STATUSES = ["DRAFT", "REJECTED"]`.
- `REJECTED` đang được coi là trạng thái có thể chỉnh sửa và nộp lại.

#### 2.4. Phân quyền & RBAC Giáo trình (`BackEnd/src/services/syllabusService.js`)
- Dòng 777 bảo vệ giáo trình lớp học chưa công khai:
  ```javascript
  if (["DRAFT", "PENDING_APPROVAL", "REJECTED"].includes(classDoc.status))
  ```
  Nếu có trạng thái mới `NEED_CHANGES`, trạng thái này cũng phải được bảo vệ chặt chẽ để chỉ Giáo viên sở hữu lớp và Admin mới có quyền truy cập giáo trình.

---

### 3. Mục tiêu Cải tiến của TASK BE-01

1. **Bổ sung trạng thái `NEED_CHANGES`:** Tách bạch rõ ràng giữa "Yêu cầu chỉnh sửa" và "Từ chối vĩnh viễn".
2. **Biến `REJECTED` thành trạng thái từ chối cuối cùng (Terminal State):** Lớp `REJECTED` bị khóa cứng 100%, không cho phép sửa hay nộp lại.
3. **Xây dựng API `POST /admin/classes/:id/request-changes`:** Bắt buộc có lý do phản hồi (`reviewNote`), ghi nhật ký kiểm toán (`AuditLog`), và gửi thông báo (`Notification`) kịp thời cho giáo viên.
