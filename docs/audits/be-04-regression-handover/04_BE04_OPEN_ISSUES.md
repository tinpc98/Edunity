# DANH MỤC VẤN ĐỀ VÀ KHUYẾN NGHỊ KỸ THUẬT (BE-04.4 — OPEN ISSUES)

**Dự án:** EDUNITY V3 — Backend  
**Giai đoạn:** Phase 4 — Final Backend Regression & Go/No-Go Audit  
**Chịu trách nhiệm:** Senior Backend Engineer / Backend QA (Châu)  
**Ngày thực hiện:** 20/11/2026  
**Chế độ:** AUDIT READ-ONLY — KHÔNG SỬA CODE  

---

## 1. TỔNG KẾT PHÂN LOẠI MỨC ĐỘ RỦI RO (ISSUE SEVERITY BREAKDOWN)

- **CRITICAL (Khẩn cấp):** **0**
- **HIGH (Cao):** **0**
- **MEDIUM (Trung bình):** **0**
- **LOW (Thấp / Tối ưu hóa):** **2**
- **INFORMATIONAL (Thông tin ghi nhận):** **1**

> [!NOTE]
> Hệ thống Backend Edunity V3 hiện **không còn bất kỳ lỗi CRITICAL hoặc HIGH nào** chưa được xử lý. Toàn bộ logic nghiệp vụ cốt lõi, state machine, an toàn phụ thuộc và bảo mật đều hoạt động ổn định.

---

## 2. CHI TIẾT CÁC VẤN ĐỀ MỨC ĐỘ THẤP VÀ KHUYẾN NGHỊ (LOW / INFORMATIONAL)

### ISSUE-01: Denormalized Field Synchronization on Historical Records
- **Severity:** LOW
- **File path:** [BackEnd/src/services/courseCatalogService.js](file:///c:/CODE/Edunity/BackEnd/src/services/courseCatalogService.js#L117-L121)
- **Vị trí liên quan:** Hàm `updateCategory` và `updateSubject`.
- **Root cause:** Khi đổi tên Category (`updateCategory`), hệ thống đồng bộ `categoryName` cho toàn bộ `Subject` và `Course`. Tuy nhiên, các bảng lưu vết lịch sử như `CourseProposal` và `TeacherSubjectAuthorization` vẫn giữ nguyên snapshot tên cũ tại thời điểm tạo.
- **Reproduction steps:**
  1. Tạo Proposal với môn học A thuộc Danh mục "Toán".
  2. Đổi tên Danh mục "Toán" thành "Toán Học & Ứng Dụng".
  3. Truy vấn chi tiết Proposal cũ.
- **Expected vs Actual:**
  - *Expected (Nghiệp vụ):* Tài liệu lịch sử nên giữ snapshot tại thời điểm trình nộp (Immutable Snapshot).
  - *Actual:* Proposal hiển thị tên danh mục cũ tại thời điểm nộp đơn.
- **Đánh giá rủi ro:** Đây là hành vi đúng theo nguyên tắc kiến trúc Snapshot Học thuật (Academic Historical Fidelity), không phải lỗi dữ liệu.
- **Hướng xử lý đề xuất:** Giữ nguyên thiết kế snapshot hiện tại. Trong tương lai nếu Product muốn UI hiển thị cả tên hiện hành, có thể bổ sung trường `currentCategoryName` khi populate thông qua lookup.

---

### ISSUE-02: Strict Class Deletion Dependency Check on Inactive Pricing Policy Versions
- **Severity:** LOW
- **File path:** [BackEnd/src/services/courseCatalogService.js](file:///c:/CODE/Edunity/BackEnd/src/services/courseCatalogService.js#L545-L560)
- **Vị trí liên quan:** Hàm `deleteCourse`, kiểm tra `CoursePricingPolicy`.
- **Root cause:** Trong hàm `deleteCourse`, câu lệnh kiểm tra chính sách giá:
  ```javascript
  const activePolicyCount = await CoursePricingPolicy.countDocuments(
    { courseId: course._id, status: "ACTIVE", ...NOT_DELETED },
    { session }
  );
  ```
  Nếu Course có các phiên bản chính sách giá cũ ở trạng thái `ARCHIVED` hoặc `DRAFT` (nhưng không có phiên bản `ACTIVE`), Course vẫn được phép soft-delete.
- **Reproduction steps:**
  1. Tạo Course kèm Chính sách giá version 1.
  2. Lưu trữ (Archive) chính sách giá version 1 (status: `ARCHIVED`). Không tạo version mới.
  3. Gọi `DELETE /admin/courses/:id`.
- **Expected vs Actual:**
  - *Expected:* Course được soft-delete thành công vì không có chính sách giá ACTIVE nào đang chi phối.
  - *Actual:* Course soft-delete thành công; các phiên bản policy `ARCHIVED` vẫn tồn tại với mục đích tra cứu lịch sử.
- **Đánh giá rủi ro:** Không có rủi ro về mặt nghiệp vụ vì policy `ARCHIVED` không áp dụng cho lớp học mới nào.
- **Hướng xử lý đề xuất:** Duy trì cơ chế hiện tại. Khi cần xóa toàn diện catalog, Admin có thể lưu ý chính sách giá cũ đã được bảo toàn trong database lịch sử.

---

### ISSUE-03: Windows Sandbox Local Loopback Port Binding for MongoMemoryReplSet
- **Severity:** INFORMATIONAL
- **File path:** [BackEnd/tests/helpers/db.js](file:///c:/CODE/Edunity/BackEnd/tests/helpers/db.js#L10-L16)
- **Vị trí liên quan:** Khởi tạo `MongoMemoryReplSet` trong môi trường test Jest.
- **Root cause:** Trên hệ điều hành Windows, sandbox runner mặc định (`BypassSandbox: false`) có thể chặn bind cổng TCP ngẫu nhiên của Replica Set daemon, dẫn đến lỗi `MongoNetworkError: connect EACCES 127.0.0.1:<port>`.
- **Reproduction steps:**
  1. Chạy `npm test` bên trong sandbox Windows mà không cấp quyền mạng nội bộ.
- **Expected vs Actual:**
  - *Expected:* Quá trình kết nối TCP loopback hoàn tất mà không bị hạn chế quyền socket.
  - *Actual:* Jest runner báo lỗi EACCES do giới hạn sandbox hệ thống.
- **Hướng xử lý đã áp dụng:** Khi chạy các test suites sử dụng Replica Set Transaction trên Windows, luôn chạy với `BypassSandbox: true` để cấp quyền mở cổng loopback nội bộ.

---

## 3. KẾT LUẬN VỀ DANH MỤC VẤN ĐỀ

Không tồn tại bất kỳ rào cản kỹ thuật (Blocker), lỗ hổng an ninh hay lỗi nghiệp vụ mức độ nghiêm trọng nào cản trở việc phát hành. Hệ thống hoàn toàn đáp ứng đầy đủ tiêu chí chất lượng kỹ thuật của EDUNITY V3.
