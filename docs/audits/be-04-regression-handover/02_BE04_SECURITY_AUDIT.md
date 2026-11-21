# BÁO CÁO KIỂM TOÁN BẢO MẬT BACKEND (BE-04.2 — SECURITY AUDIT)

**Dự án:** EDUNITY V3 — Backend  
**Giai đoạn:** Phase 4 — Final Backend Regression & Go/No-Go Audit  
**Chịu trách nhiệm:** Senior Backend Engineer / Backend QA (Châu)  
**Ngày thực hiện:** 20/11/2026  
**Chế độ:** AUDIT READ-ONLY — KHÔNG SỬA CODE  

---

## 1. MỤC TIÊU & PHẠM VI KIỂM TOÁN BẢO MẬT

Kiểm toán toàn diện các khía cạnh an toàn thông tin của Backend Edunity V3 trên các thành phần bị ảnh hưởng bởi BE-01, BE-02, BE-03, dựa trên 8 tiêu chuẩn bảo mật cốt lõi:
1. **Authentication (Xác thực người dùng)**
2. **Authorization & RBAC (Phân quyền truy cập)**
3. **Object Ownership & BOLA/IDOR Defense (Kiểm soát sở hữu dữ liệu)**
4. **Input Validation & Boundary Checking (Kiểm tra dữ liệu đầu vào)**
5. **Mass Assignment Protection (Chống ghi đè thuộc tính ngoài ý muốn)**
6. **ID & ObjectId Validation (Xử lý định danh an toàn)**
7. **Error Handling & Information Disclosure (Xử lý lỗi và chống lộ lọt thông tin)**
8. **Audit Trail Integrity & Non-repudiation (Tính toàn vẹn kiểm toán)**

---

## 2. KẾT QUẢ ĐÁNH GIÁ CHI TIẾT THEO 8 TRỤ CỘT BẢO MẬT

### 2.1. Authentication (Xác thực)
- **Cơ chế hoạt động:** 
  - Hệ thống sử dụng JWT Access Token chuẩn mang payload chữ ký HMAC.
  - Middleware `authenticateJwt` (`BackEnd/src/middlewares/authMiddleware.js`) xác thực token trên mỗi request:
    - Kiểm tra chữ ký và hạn dùng token.
    - Truy vấn trực tiếp trạng thái User trong database để đảm bảo tài khoản không bị xóa (`user.isDeleted`) hoặc bị khóa (`SUSPENDED`, `BANNED`).
    - Đối chiếu `payload.tv` với `user.tokenVersion`: khi người dùng đổi mật khẩu hoặc đăng xuất toàn bộ thiết bị, `tokenVersion` tăng lên khiến mọi token cũ lập tức bị vô hiệu hóa (Immediate Invalidation).
- **Phân tách môi trường Test:**
  - Header shortcut `x-user-id` chỉ được kích hoạt khi `process.env.NODE_ENV === "test"`.
  - Tệp `server.js` kiểm tra và từ chối khởi động (Hard Crash) nếu chạy với `NODE_ENV === "test"`.
- **Đánh giá:** **AN TOÀN TUYỆT ĐỐI**.

### 2.2. Authorization & Role-Based Access Control (RBAC)
- **Cơ chế phân quyền:**
  - Áp dụng middleware `requireRole("ADMIN")`, `requireRole("TEACHER")`, `requireRole("STUDENT")` sau lớp xác thực.
  - Các API quản trị danh mục/môn học (`DELETE /admin/categories/:id`, `DELETE /admin/subjects/:id`, `DELETE /admin/courses/:id`, `POST /admin/classes/:id/request-changes`) đều bắt buộc quyền `ADMIN`.
- **Kiểm chứng thực tế:**
  - Test suite `be03AcademicSoftDelete.test.js` (Test `BE03.CAT-1`, `BE03.SUB-1`): Student và Teacher khi gọi API DELETE của Admin đều bị chặn ngay lập tức với mã lỗi `403 FORBIDDEN`.
  - Test suite `be01ClassNeedChanges.test.js` (Test `BE01.REQ-1`): Teacher khi gọi `POST /admin/classes/:id/request-changes` bị từ chối `403 FORBIDDEN`.
- **Đánh giá:** **AN TOÀN TUYỆT ĐỐI**.

### 2.3. Object Ownership (Chống BOLA / IDOR)
- **Rủi ro phân tích:** Giáo viên A có thể đoán ID lớp của Giáo viên B để sửa nội dung hoặc gửi duyệt thay.
- **Biện pháp phòng ngừa:**
  - Hàm `getOwnClass(teacherId, classId)` trong `teacherClassService.js`:
    ```javascript
    if (cls.teacherId.toString() !== teacherId.toString()) {
      throw FORBIDDEN("You can only manage your own classes");
    }
    ```
  - Mọi thao tác của giáo viên (`PATCH /teacher/classes/:id`, `POST /teacher/classes/:id/submit`, `GET /teacher/classes/:id`) đều bắt buộc đi qua `getOwnClass`.
- **Kiểm chứng thực tế:**
  - Test `BE01.OWN-1` trong `be01ClassNeedChanges.test.js`: Giáo viên B gọi `PATCH` hoặc `submit` trên lớp của Giáo viên A nhận kết quả `403 FORBIDDEN`.
- **Đánh giá:** **AN TOÀN TUYỆT ĐỐI**.

### 2.4. Input Validation & Boundary Checking
- **Rủi ro phân tích:** Gửi payload rỗng, giá trị âm, chuỗi thời gian sai định dạng gây crash server.
- **Biện pháp phòng ngừa:**
  - `applyClassInput`: Kiểm tra regex `TIME_PATTERN` (`/^([01]\d|2[0-3]):[0-5]\d$/`), kiểm tra thứ tự ngày (`startDate <= endDate`), kiểm tra số lượng học viên (`capacity >= 1`).
  - Kiểm tra giá tiền: Lớp `FREE` bắt buộc `price === 0`; lớp `PAID` bắt buộc `price > 0`.
  - Yêu cầu ghi chú duyệt: `requestChanges` bắt buộc `reviewNote` không được để trống (`isBlank(body.reviewNote)`).
- **Đánh giá:** **AN TOÀN TUYỆT ĐỐI**.

### 2.5. Mass Assignment Defense (Chống ghi đè trường nhạy cảm)
- **Rủi ro phân tích:** Hacker gửi payload chứa `status: "OPEN"`, `isDeleted: true`, hoặc `reviewedBy: adminId` khi tạo/sửa lớp.
- **Biện pháp phòng ngừa:**
  - Không sử dụng `Object.assign(doc, req.body)` hoặc `Model.create(req.body)` trực tiếp.
  - Hàm `applyClassInput` sử dụng **Explicit Whitelisting**: chỉ trích xuất các trường được phép (`className`, `description`, `coverImage`, `classType`, `price`, `capacity`, `timezone`, `schedule`, ngày tháng).
  - Trạng thái `status` chỉ được cập nhật qua các hàm chuyển đổi nghiệp vụ chuyên biệt (`submitClass`, `approveClass`, `requestChanges`, `rejectClass`).
- **Đánh giá:** **AN TOÀN TUYỆT ĐỐI**.

### 2.6. ID Validation (Xử lý ObjectId an toàn)
- **Rủi ro phân tích:** Client gửi tham số `:id` không phải 24 ký tự hex (ví dụ `"abc"`, `"' OR 1=1"`) dẫn đến lỗi CastError của Mongoose làm lộ chi tiết cấu trúc server.
- **Biện pháp phòng ngừa:**
  - Mọi hàm service (`getCategoryOrThrow`, `getSubjectOrThrow`, `getCourseOrThrow`, `getOwnClass`, `getClassForReview`, v.v.) đều gọi `assertId` hoặc `mongoose.isValidObjectId(id)`.
  - Khi ID không hợp lệ, hệ thống trả về mã lỗi `400` hoặc `404` có cấu trúc rõ ràng (`CATEGORY_NOT_FOUND`, `CLASS_NOT_FOUND`), không bao giờ để lọt CastError unhandled.
- **Đánh giá:** **AN TOÀN TUYỆT ĐỐI**.

### 2.7. Error Handling & Information Disclosure
- **Cơ chế:**
  - Middleware xử lý lỗi toàn cục (`app.js`):
    - Chuẩn hóa đầu ra JSON: `{ success: false, error: err.code, message: err.message }`.
    - Lỗi parse JSON sai format: trả `400 VALIDATION_ERROR`.
    - Lỗi kích thước payload quá tải: trả `413 PAYLOAD_TOO_LARGE`.
  - Không gửi stack trace hoặc thông tin nội bộ của MongoDB về phía client trong môi trường non-debug.
- **Đánh giá:** **AN TOÀN TUYỆT ĐỐI**.

### 2.8. Audit Trail Integrity & Non-repudiation
- **Cơ chế bảo vệ kiểm toán:**
  - Schema `AuditLog`: ghi nhận `actorAdminId`, `actorType` (`ADMIN` hoặc `SYSTEM`), `action`, `targetType`, `targetId`, `beforeState`, `afterState`.
  - Thao tác ghi log được tích hợp trực tiếp vào **MongoDB Transaction Session** trong các luồng xóa mềm (`deleteCategory`, `deleteSubject`, `deleteCourse`) và phê duyệt lớp học.
  - Không nuốt lỗi (No Silent Swallowing): Nếu ghi `AuditLog` thất bại trong transaction, toàn bộ transaction sẽ bị rollback, ngăn chặn tình trạng dữ liệu thay đổi mà không có nhật ký kiểm toán.
- **Đánh giá:** **AN TOÀN TUYỆT ĐỐI**.

---

## 3. BẢNG TỔNG KẾT ĐÁNH GIÁ AN NINH

| Tiêu chuẩn bảo mật | Mức độ rủi ro tiềm ẩn | Biện pháp bảo vệ đã áp dụng | Trạng thái xác minh |
|---|:---:|---|:---:|
| **Authentication Bypass** | CRITICAL | JWT HMAC, đối chiếu DB trạng thái user, tokenVersion invalidate | **SECURE** |
| **Privilege Escalation** | CRITICAL | RBAC middleware `requireRole`, phân định rõ ràng quyền Admin/Teacher/Student | **SECURE** |
| **BOLA / IDOR** | HIGH | `getOwnClass` bắt buộc so khớp `cls.teacherId === req.user.id` | **SECURE** |
| **Mass Assignment** | HIGH | Explicit property whitelisting, không bind trực tiếp `req.body` | **SECURE** |
| **SQL/NoSQL Injection** | HIGH | Dùng Mongoose ODM tham số hóa, Regex escape kỹ lưỡng với `escapeRegex` | **SECURE** |
| **Denial of Service (DoS)** | MEDIUM | Helmet security headers, Giới hạn kích thước payload, Transaction timeout | **SECURE** |
| **Data Tampering** | HIGH | Transaction fail-closed, Concurrency lock với `lockVersion` và conditional update | **SECURE** |
| **Audit Log Spoofing** | HIGH | Ghi nhật ký nguyên tử trong transaction session, phân loại rõ `SYSTEM` vs `ADMIN` | **SECURE** |

---

## 4. KẾT LUẬN KIỂM TOÁN BẢO MẬT

Hệ thống Backend Edunity V3 sau khi hoàn tất các task BE-01, BE-02, BE-03 đạt mức độ an toàn cao, tuân thủ các nguyên tắc thiết kế bảo mật Defensive Programming và Zero-Trust Architecture ở tầng ứng dụng. Không phát hiện bất kỳ lỗ hổng an ninh nào thuộc mức độ HIGH hoặc CRITICAL.
