# KIỂM TOÁN BẢO MẬT, PHÂN QUYỀN VÀ XỬ LÝ ĐỒNG THỜI
## Báo cáo Kiểm toán Chuyên sâu — Task BE-04-FINAL

- **Dự án:** EDUNITY V3 — BackEnd System
- **Tác giả:** Senior Backend Engineer / QA Lead phụ trách EDUNITY V3
- **Ngày lập:** 21/11/2026

---

## 1. KIỂM TOÁN BẢO MẬT & PHÂN QUYỀN (RBAC & ACCESS CONTROL)

### 1.1. Quyền hạn Phê duyệt và Yêu cầu Chỉnh sửa Lớp học (Admin Class Actions)
- **Endpoint:** `POST /api/admin/classes/:id/request-changes`
  - **Middleware bảo vệ:** Bắt buộc có token hợp lệ và quyền `ADMIN` (`admin` middleware: `req.user.role === "ADMIN"`).
  - **Xác minh thực tế:** Khi gửi request từ tài khoản `STUDENT` hoặc `TEACHER`, hệ thống trả về ngay lập tức mã lỗi `403 FORBIDDEN` (được kiểm chứng qua Test 9 trong `be01ClassNeedChanges.test.js`).
  - **Ràng buộc đầu vào:** Trường `reviewNote` bắt buộc phải có, kiểu string, không được để trống hoặc chỉ chứa khoảng trắng. Nếu thiếu hoặc rỗng, trả về `400 VALIDATION_ERROR`.

### 1.2. Quyền sở hữu và Gửi duyệt lại Lớp học (Teacher Ownership & Class Resubmission)
- **Endpoint:** `PUT /api/teacher/classes/:id` & `POST /api/teacher/classes/:id/submit`
  - **Middleware bảo vệ:** Yêu cầu quyền `TEACHER` đã được xác minh (`isVerifiedTeacher`).
  - **Kiểm tra quyền sở hữu:** Giáo viên A tuyệt đối không thể xem, sửa hoặc resubmit lớp học của Giáo viên B:
    ```javascript
    if (cls.teacherId.toString() !== teacherId.toString()) {
      throw new AppError("You do not have permission to modify this class", "FORBIDDEN", 403);
    }
    ```
  - **Xác minh thực tế:** Đã được kiểm thử trong Test 10 của `be01ClassNeedChanges.test.js` (kết quả trả về đúng 403).

### 1.3. Quyền Xóa Danh mục Học thuật (Category, Subject, Course)
- **Endpoints:**
  - `DELETE /api/admin/categories/:id`
  - `DELETE /api/admin/subjects/:id`
  - `DELETE /api/admin/courses/:id`
- **Middleware bảo vệ:** Toàn bộ 3 route đều nằm dưới tiền tố `/admin/` và áp dụng middleware `admin`. Các vai trò khác hoặc token không hợp lệ đều nhận 401/403.

---

## 2. KIỂM TOÁN XỬ LÝ ĐỒNG THỜI & CHỐNG RACE CONDITION

### 2.1. Bảo vệ chống Race Condition giữa Xóa Course và Tạo Class / Enrollment
- **Nguy cơ tiềm ẩn:** Một Admin đang thực hiện xóa Course trong khi một Giáo viên đang gửi lệnh tạo Class thuộc Course đó, hoặc một Học viên đang thanh toán/đăng ký học. Nếu không có cơ chế đồng bộ, hệ thống có thể tạo ra lớp học hoặc đơn đăng ký mồ côi (orphan records) trỏ đến một Course đã bị xóa.
- **Giải pháp kỹ thuật đã triển khai:**
  - Cả `deleteCourse` (trong `courseCatalogService.js`) và `createClass` (trong `teacherClassService.js`) đều thực thi trong MongoDB Transaction Session và thực hiện cập nhật tăng phiên bản khóa nguyên tử trên cùng bản ghi Course document:
    ```javascript
    const course = await Course.findOneAndUpdate(
      { _id: courseId, status: "ACTIVE", ...NOT_DELETED },
      { $inc: { lockVersion: 1 } },
      { session, returnDocument: "after" }
    );
    ```
  - Engine WiredTiger của MongoDB biến hai thao tác này thành tuần tự tuyệt đối (serializable write conflict detection).
  - Nếu `createClass` ghi trước: Class được tạo $\rightarrow$ `deleteCourse` chạy sau thấy `classCount > 0` và từ chối với 409 `COURSE_HAS_CLASSES`.
  - Nếu `deleteCourse` ghi trước: Course bị soft-delete $\rightarrow$ `createClass` chạy sau không tìm thấy Course thỏa mãn `{ status: "ACTIVE", ...NOT_DELETED }` và từ chối với 400 `COURSE_NOT_ACTIVE`.
- **Bằng chứng kiểm thử:** Bộ test `chauSafeDeleteConcurrencyReplSet.test.js` (14/14 tests pass) đã kiểm chứng cả hai trường hợp đua với độ trễ nhân tạo (artificial delay injection) và chứng minh zero orphan records.

### 2.2. Bảo vệ chống Xung đột Trạng thái Lớp học (State Transition CAS Guard)
- **Thao tác:** `requestClassChanges`, `approveClass`, `rejectClass` trong `adminClassService.js` và `rejectExpiredPendingClasses` trong `maintenanceJob.js`.
- **Cơ chế:** Mọi câu lệnh cập nhật trạng thái đều sử dụng truy vấn nguyên tử có điều kiện (Compare-And-Swap / CAS filter):
  ```javascript
  { _id: classId, status: "PENDING_APPROVAL", ...NOT_DELETED }
  ```
- **Xác minh thực tế:**
  - Nếu 2 Admin cùng nhấn nút (một người nhấn `Request Changes`, một người nhấn `Approve` hoặc `Reject`): Request đến trước sẽ match và chuyển trạng thái; request đến sau nhận `doc = null` và lập tức nhận lỗi `409 CLASS_NOT_PENDING_APPROVAL`.
  - Nếu Admin phê duyệt cùng lúc với thời điểm Maintenance Job quét lớp quá hạn: Admin chuyển lớp sang `OPEN`; Maintenance Job chạy `findOneAndUpdate` không match, tự động bỏ qua an toàn mà không làm gián đoạn quyết định của Admin.

### 2.3. Khóa Phân tán Đa Thực thể (Distributed Job Lock Multi-Instance Safety)
- **Thao tác:** Chạy tác vụ bảo trì định kỳ 5 phút/lần (`startMaintenanceJob`).
- **Cơ chế:**
  - Sử dụng bảng `JobLocks` trong MongoDB với unique index trên trường `name`.
  - Thuật toán `acquire` sử dụng `findOneAndUpdate` nguyên tử kết hợp kiểm tra `lockedUntil <= now || owner === instanceId`.
  - Cơ chế **Heartbeat tự động** (`options.heartbeatIntervalMs: 60 * 1000`): Mỗi 1 phút, instance đang giữ lease sẽ gọi `extend` gia hạn lease thêm 4 phút. Nhờ đó, ngay cả khi tác vụ quét dọn bảo trì kéo dài hơn 4 phút, khóa vẫn không bị trôi hạn.
  - Cơ chế **Crash Recovery**: Khi instance bị sự cố (OOM, restart container), timer heartbeat dừng lại; sau tối đa 4 phút, lease tự động hết hạn và instance khác có thể chiếm quyền an toàn, hoàn toàn không xảy ra deadlock.

---

## 3. KIỂM TOÁN TÍNH NGUYÊN TỬ CỦA TRANSACTION & AUDIT LOGGING

1. **Transaction Fail-Closed:**
   - Cả 3 module trọng yếu (`adminClassService.js`, `maintenanceJob.js`, `courseCatalogService.js`) đều áp dụng nguyên tắc: Không thể tạo session hoặc không có transaction $\rightarrow$ Từ chối thao tác ngay lập tức (Fail-Closed với 503).
2. **Audit Logging trong Transaction:**
   - Bản ghi kiểm toán `AuditLog` luôn được truyền `{ session }` và ghi cùng transaction với thay đổi dữ liệu chính.
   - Nếu việc ghi audit thất bại (mô phỏng lỗi DB, đứt kết nối), transaction tự động abort $\rightarrow$ dữ liệu lớp học / danh mục học thuật được rollback 100%, không sinh ra bản ghi mồ côi hay trạng thái sai lệch.
3. **Cách ly Luồng Gửi Thông báo (Post-Commit Notification Isolation):**
   - Việc gửi notification qua websocket/push/email luôn được kích hoạt **SAU KHI TRANSACTION ĐÃ COMMIT THÀNH CÔNG**.
   - Khối `try/catch` độc lập bọc quanh lệnh `notify` đảm bảo lỗi hạ tầng notification không làm rollback giao dịch lõi và không làm dừng các tiến trình tiếp theo.
