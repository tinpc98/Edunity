# BÁO CÁO 01: HIỆN TRẠNG QUẢN LÝ VÒNG ĐỜI KHÓA HỌC VÀ LỖ HỔNG HỌC THUẬT (CURRENT STATE AUDIT)

- **Dự án:** Edunity V3
- **Chế độ:** AUDIT → IMPLEMENTATION → REGRESSION → HANDOVER
- **Vai trò:** Senior Backend Engineer (Châu)
- **Thời gian lập:** 13/11/2026

---

## 1. BỐI CẢNH VÀ HIỆN TRẠNG TRƯỚC KHI THỰC HIỆN

Trước khi thực hiện Task `CHAU-COURSE-LIFECYCLE`, hệ thống Backend Edunity V3 đã có các thành phần cơ bản về quản lý danh mục và khóa học (`Category`, `Subject`, `Course`, `SyllabusVersion`, `CurriculumUnit`, `Class`). Tuy nhiên, qua quá trình kiểm toán mã nguồn chi tiết, nhóm phát triển đã phát hiện 3 lỗ hổng lớn trong vòng đời khóa học và truy xuất giáo trình:

### 1.1. Lỗ hổng 1 — Admin không thể quản trị toàn diện Course (CUR-04)
- **Hiện trạng định tuyến:**
  - File [`BackEnd/src/routes/courseCatalogRoutes.js`](file:///c:/CODE/Edunity/BackEnd/src/routes/courseCatalogRoutes.js) chỉ định nghĩa:
    ```javascript
    router.get("/courses", controller.searchCourses);
    router.get("/courses/:id", controller.getCourse);
    router.post("/admin/courses", admin, controller.createCourse);
    router.patch("/admin/courses/:id", admin, controller.updateCourse);
    ```
- **Hạn chế nghiêm trọng:**
  - Không hề có endpoint `GET /api/admin/courses` dành riêng cho quản trị viên.
  - API danh sách công khai `GET /api/courses` (`searchCourses`) áp đặt cứng bộ lọc:
    ```javascript
    const filter = { status: "ACTIVE", ...NOT_DELETED };
    ```
    dẫn đến việc các khóa học ở trạng thái `INACTIVE` hoàn toàn "vô hình" trước Admin trên giao diện quản trị.
  - API chi tiết công khai `GET /api/courses/:id` (`getCourse`) ném ngoại lệ 404 nếu khóa học không ở trạng thái `ACTIVE`:
    ```javascript
    if (course.status !== "ACTIVE") throw new AppError("Course not found", "COURSE_NOT_FOUND", 404);
    ```
    Điều này khiến Admin không thể mở trang chi tiết để xem hoặc kích hoạt lại một khóa học đã tạm ngưng (`INACTIVE`).

### 1.2. Lỗ hổng 2 — Thiếu API truy xuất Syllabus Snapshot cho Class (CUR-12)
- **Hiện trạng Schema:**
  - Schema [`BackEnd/src/models/Class.js`](file:///c:/CODE/Edunity/BackEnd/src/models/Class.js#L76-L82) đã được thiết kế sẵn các trường snapshot:
    - `syllabusVersionId`: Tham chiếu tới `SyllabusVersion`.
    - `syllabusVersionNumber`: Số thứ tự phiên bản giáo trình tại thời điểm mở lớp.
- **Hạn chế nghiêm trọng:**
  - Backend hoàn toàn thiếu một endpoint chuyên trách (ví dụ `GET /api/classes/:id/syllabus`) để học viên và giáo viên đọc giáo trình đúng phiên bản của lớp.
  - Nếu client cố đọc qua `GET /api/courses/:id/syllabus`, hệ thống sẽ trả về phiên bản giáo trình đã xuất bản **mới nhất** của Khóa học (`publishedSyllabusVersionId`), dẫn đến hiện tượng trôi lệch giáo trình (Syllabus Drift): Khóa học cập nhật lên V2 nhưng Lớp học cũ vốn dạy theo V1 lại bị hiển thị nhầm bài học của V2.

### 1.3. Lỗ hổng 3 — Thiếu cơ chế Xóa an toàn Khóa học (Course Safe Delete)
- **Hiện trạng:**
  - Không có route `DELETE /api/admin/courses/:id`.
  - Chưa có bộ kiểm tra ràng buộc toàn vẹn dữ liệu (Dependency Guard) để ngăn việc xóa nhầm một khóa học đang có lớp học mở, có học viên đang theo học, hoặc có giao dịch tài chính/học bổng đang lưu vết.

---

## 2. NGUYÊN NHÂN GỐC RỄ (ROOT CAUSE ANALYSIS)

1. **Phân tách chưa triệt để giữa Public View và Admin View:** Trước đây hệ thống tái sử dụng chung `searchCourses` và `getCourse` cho cả người dùng công khai lẫn người quản trị, dẫn đến việc các ràng buộc an toàn của Public API (chỉ hiện `ACTIVE`) vô tình trói buộc quyền hạn của Admin.
2. **Thiếu Endpoint ngữ cảnh Lớp học cho Giáo trình:** Giáo trình được xem như tài nguyên cấp Course (`/courses/:id/syllabus`) thay vì nhận diện rằng mỗi Lớp học (`Class`) là một thực thể vận hành độc lập có vòng đời và snapshot giáo trình bất biến riêng.
3. **Chưa chuẩn hóa Soft-delete Lifecycle:** Mặc dù schema `Course` có cắm `softDeletePlugin` (`isDeleted`, `deletedAt`, `deletedBy`), nhưng chưa được hiện thực hóa thành API nghiệp vụ hoàn chỉnh có kiểm tra chặn xóa an toàn.

---

## 3. KẾT LUẬN VÀ PHẠM VI XỬ LÝ

Để giải quyết triệt để 3 vấn đề trên mà không làm ảnh hưởng đến các phân hệ khác (Finance, Security, LiveKit), nhánh Châu triển khai kế hoạch gồm:
1. **CUR-04:** Bổ sung `GET /api/admin/courses` (hỗ trợ lọc status, tìm kiếm, phân trang, sort) và `GET /api/admin/courses/:id` (cho phép đọc mọi trạng thái, kèm thống kê lớp học).
2. **CUR-12:** Xây dựng `GET /api/classes/:id/syllabus` truy xuất chính xác phiên bản giáo trình được snapshot trong Class, bảo đảm không fallback sang bản mới nhất.
3. **Safe Delete:** Bổ sung `DELETE /api/admin/courses/:id` với 5 chốt chặn dependency nghiêm ngặt và cơ chế soft-delete an toàn.

