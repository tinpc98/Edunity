# BÁO CÁO PHÂN TÍCH NGUYÊN NHÂN GỐC RỄ (ROOT CAUSE ANALYSIS)
## TASK CHAU-FINAL-P0-CLASS-CREATION — EDUNITY V3

- **Dự án:** Edunity V3 (No LMS Architecture)
- **Kỹ sư phụ trách:** Châu (Senior Backend Engineer — Academic & Catalog Core)
- **Mức độ nghiêm trọng:** P0 — Critical Concurrency & Transaction Integrity Failure
- **Đối tượng kiểm tra:** `BackEnd/src/services/teacherClassService.js` (`createClass`) phối hợp cùng `BackEnd/src/services/courseCatalogService.js` (`deleteCourse`)
- **Ngày lập:** 14/11/2026

---

### 1. Bối cảnh và Vấn đề Phát hiện

Trong đợt audit trước (`TASK CHAU-P0-SAFE-DELETE-VERIFY`), hàm xóa khóa học an toàn `deleteCourse` trong `BackEnd/src/services/courseCatalogService.js` đã được nâng cấp lên chuẩn **Transaction Fail-Closed**:
- Sử dụng MongoDB transaction trên toàn bộ chuỗi soft-delete.
- Tự động khóa độc quyền document Course thông qua phép toán nguyên tử:
  ```javascript
  Course.findOneAndUpdate(
    { _id: courseId, ...NOT_DELETED },
    { $inc: { lockVersion: 1 } },
    { session, returnDocument: "after" }
  );
  ```
- Loại bỏ hoàn toàn fallback non-transaction, trả về `503 DATABASE_TRANSACTION_UNAVAILABLE` nếu session/transaction không khả dụng.

Tuy nhiên, khi kiểm tra đối ứng phía tạo lớp học (`createClass` trong `BackEnd/src/services/teacherClassService.js`), hệ thống vẫn còn tồn tại nhánh fallback nguy hiểm:
```javascript
let session;
try {
  session = await mongoose.startSession();
} catch (sessionErr) {
  // Silent fallback: không ném lỗi 503
  session = null;
}

if (session && typeof session.withTransaction === "function") {
  return await executeCreate(session);
} else {
  return await executeCreate(null); // <-- LỖI P0: NON-TRANSACTION FALLBACK
}
```

### 2. Phân tích Kỹ thuật về Rủi ro (Technical Vulnerability)

#### 2.1. Phá vỡ Transaction Fail-Closed
Nếu MongoDB Replica Set gặp sự cố gián đoạn tạm thời, hoặc môi trường triển khai gặp lỗi khởi tạo session, `createClass` âm thầm chạy nhánh `executeCreate(null)`. Điều này cho phép dữ liệu lớp học được ghi vào database mà không có transaction bảo vệ.

#### 2.2. Vô hiệu hóa Mutex Lock giữa CREATE Class và DELETE Course
Cơ chế bảo vệ race condition của Edunity V3 dựa trên WiredTiger Document-Level Write Lock thông qua việc cập nhật trường `lockVersion` của document `Course`. 
- Khi `createClass` chạy với `session = null`, lệnh `Course.findOneAndUpdate` (hoặc `Course.findOne`) thực thi độc lập ngoài transaction.
- Khi đó, WiredTiger không giữ write lock trong suốt vòng đời của transaction tạo lớp, dẫn đến ranh giới nguyên tử (atomic boundary) bị phá vỡ.

#### 2.3. Kịch bản Race Condition thực tế dẫn đến Dữ liệu Rác (Orphan Class)
1. **Thời điểm $T_0$:** Khóa học `Course_A` đang ở trạng thái `ACTIVE`, chưa có lớp học nào (`classCount = 0`).
2. **Thời điểm $T_1$:** Admin gửi yêu cầu `DELETE /api/v1/courses/Course_A`. Hàm `deleteCourse` mở `session_1`, bắt đầu transaction và khóa `Course_A` với `lockVersion`.
3. **Thời điểm $T_2$:** `deleteCourse` kiểm tra `Class.countDocuments({ courseId: Course_A._id }, { session: session_1 })` và nhận kết quả `0`.
4. **Thời điểm $T_3$:** Giáo viên gửi yêu cầu tạo lớp học cho `Course_A`. Do session lỗi hoặc fallback được kích hoạt, `createClass` thực thi `executeCreate(null)`.
5. **Thời điểm $T_4$:** `createClass` đọc `Course_A` (thấy vẫn còn `ACTIVE`), khởi tạo `Class_X` và gọi `Class_X.save()`. Bản ghi `Class_X` được lưu thành công vào cơ sở dữ liệu.
6. **Thời điểm $T_5$:** `deleteCourse` tiếp tục chuỗi xử lý: chuyển `Course_A.isDeleted = true`, `status = INACTIVE`, soft-delete các `SyllabusVersion` và `CurriculumUnit`, ghi `AuditLog`, sau đó commit transaction của `session_1`.
7. **Hậu quả nghiêm trọng:**
   - Lớp học `Class_X` tồn tại nhưng trỏ đến một Course đã bị xóa (`isDeleted: true`).
   - Học viên có thể tìm thấy lớp, đăng ký hoặc thanh toán cho một chương trình học không còn hiệu lực.
   - Vi phạm nghiêm trọng các ràng buộc CUR-09 (Snapshot), CUR-10 (Gate), và CUR-12 (Syllabus Integrity).

#### 2.4. Lỗ hổng Rò rỉ Tài nguyên Session (Session Resource Leak)
Trước khi hoàn thiện, cả `createClass` và `deleteCourse` thực hiện kiểm tra `!session || typeof session.withTransaction !== "function"` ngay trước khi bước vào khối `try ... finally`:
```javascript
if (!session || typeof session.withTransaction !== "function") {
  throw new AppError("Database session is unavailable", "DATABASE_TRANSACTION_UNAVAILABLE", 503);
}

try {
  await session.withTransaction(...);
} finally {
  await session.endSession();
}
```
**Hệ quả rò rỉ:** Khi `startSession()` khởi tạo session thành công nhưng session đó không hỗ trợ `withTransaction` (hoặc mock/driver không tương thích), ngoại lệ 503 bị ném ra **bên ngoài** khối `try`. Do đó khối `finally` không được thực thi và lệnh `session.endSession()` bị bỏ qua, dẫn đến việc tích tụ session/kết nối treo trong MongoDB pool.

**Khắc phục triệt để:** Di chuyển toàn bộ bước thẩm định `session.withTransaction` vào **bên trong** khối `try`, đồng thời bọc an toàn `if (session && typeof session.endSession === "function") await session.endSession();` trong `finally`. Khi đó dù ném lỗi 503, session luôn được đóng sạch sẽ 100%.

---

### 3. Kết luận Nguyên nhân Gốc rễ

Nguyên nhân gốc rễ là việc duy trì cơ chế fallback "best-effort" (`executeCreate(null)`) trong code cũ, nhằm mục đích giúp ứng dụng chạy được trên môi trường MongoDB standalone cũ hoặc bỏ qua lỗi kết nối tạm thời. 

Trong kiến trúc tài chính - giáo dục khắt khe của Edunity V3:
1. **Không có chỗ cho sự mập mờ (Ambiguity):** Mọi thao tác ghi liên quan đến liên kết dữ liệu quan trọng đều phải Fail-Closed.
2. **Đối xứng bảo vệ (Symmetric Protection):** Muốn ngăn chặn race condition giữa hai luồng đối nghịch (Xóa Course vs Tạo Class), **cả hai luồng bắt buộc phải tuân thủ cùng một quy tắc transaction và cùng tranh chấp một ổ khóa tài nguyên (`Course.lockVersion`)**.

