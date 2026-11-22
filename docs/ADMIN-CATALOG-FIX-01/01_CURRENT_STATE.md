# 01_CURRENT_STATE.md — Hiện Trạng và Nguyên Nhân

**Dự án:** EDUNITY V3  
**Tác vụ:** TASK ADMIN-CATALOG-FIX-01 — SEPARATE ADMIN MANAGEMENT PAGES & REMOVE REDUNDANT BANNERS  
**Thời gian thực hiện:** 22/11/2026  
**Kỹ sư thực hiện:** Senior Fullstack Engineer

---

## 1. BỐI CẢNH & HIỆN TRẠNG TRƯỚC KHI SỬA

Trước khi thực hiện tác vụ này, hệ thống quản trị đào tạo (Academic Catalog) của Admin gặp phải 3 vấn đề kiến trúc và giao diện chính:

### 1.1. Kiến trúc trang đơn đóng gói trong Tabs (`AdminCatalogPage.tsx`)
- Toàn bộ 4 nghiệp vụ quản trị học thuật cốt lõi:
  1. Quản lý Danh mục đào tạo (`categories`)
  2. Quản lý Môn học (`subjects`)
  3. Quản lý Khóa học chuẩn (`courses`)
  4. Quản lý Giáo trình & Phiên bản (`syllabus`)
- Được gom chung trong một file component khổng lồ `AdminCatalogPage.tsx` (hơn 1.800 dòng code) và điều khiển hiển thị thông qua component `<Tabs activeKey={...} />` của Ant Design.
- Dù thanh Sidebar đã được cập nhật đường dẫn con (`/admin/categories`, `/admin/subjects`, `/admin/courses`, `/admin/syllabus`), `router.tsx` vẫn trỏ toàn bộ 4 route này về cùng một component `AdminCatalogPage` với prop `fixedTab` hoặc đọc tham số `?tab=...` từ URL.
- **Hệ quả:**
  - Vi phạm nguyên tắc phân tách trách nhiệm (Separation of Concerns).
  - Vẫn tồn tại thanh tab ngang điều hướng giữa các chức năng, làm rối mắt quản trị viên.
  - Mỗi lần tải trang, toàn bộ hooks, forms và mutations của cả 4 chức năng đều bị khởi tạo cùng lúc, gây tải chậm và khó bảo trì.

### 1.2. Banner kỹ thuật/Developer xuất hiện trên giao diện người dùng
Trên giao diện xuất hiện các thông báo `Alert` giải thích kỹ thuật nội bộ của lập trình viên, gây hoang mang cho người dùng cuối (Admin nghiệp vụ):
1. **Tại khối Khóa học:**
   - Tiêu đề: *"Danh sách quản trị hiện chỉ nhận Course ACTIVE từ Backend"*
   - Mô tả: *"Course INACTIVE không được trả về bởi API tìm kiếm hiện tại nên chưa thể xem hoặc kích hoạt lại tại đây. Không có bộ lọc trạng thái an toàn cho đến khi Backend cung cấp Admin list/detail hỗ trợ ACTIVE và INACTIVE."*
2. **Tại modal Chi tiết Khóa học:**
   - Tiêu đề: *"Đang hiển thị thông tin khóa học từ danh sách hiện tại"*
   - Mô tả: *"API chi tiết khóa học hiện chỉ trả dữ liệu cho khóa học đang ACTIVE. Các thông tin bên dưới được lấy từ dữ liệu danh sách."*
3. **Tại khối Giáo trình (`AdminSyllabusManagementPage.tsx`):**
   - Tiêu đề: *"Quản lý syllabus có version thật từ Backend"*
   - Mô tả: *"Chỉ bản nháp có thể sửa. Công bố sẽ lưu trữ phiên bản đã công bố trước đó; lịch sử không bị ghi đè. Danh sách khóa học hiện dùng API công khai nên chỉ trả khóa ACTIVE."*
   - Placeholder dropdown: *"Chọn khóa học ACTIVE"*

### 1.3. Nguyên nhân gốc rễ (Root Cause)
- **Về phía Backend:** Backend **thực tế đã có đầy đủ** endpoint quản trị chuyên biệt:
  - `GET /api/admin/courses`: Hỗ trợ phân trang, tìm kiếm, lọc theo `categoryId`, `subjectId`, `gradeLevel`, `level`, và đặc biệt là lọc `status` (`ACTIVE`, `INACTIVE`, `ALL`). Khi không truyền `status`, endpoint trả về cả khóa học `ACTIVE` và `INACTIVE`.
  - `GET /api/admin/courses/:id`: Trả về chi tiết khóa học kèm `openClassCount` và `totalClassCount` bất kể trạng thái khóa học là `ACTIVE` hay `INACTIVE`.
- **Về phía Frontend:** 
  - File `course.service.ts` trước đây chỉ cài đặt phương thức `searchCourses` trỏ vào API public `GET /courses` (vốn dĩ được thiết kế chỉ trả khóa học `ACTIVE` cho học viên/khách vãng lai).
  - Lập trình viên trước đó thay vì kết nối vào API `GET /api/admin/courses` sẵn có, lại đặt các banner `Alert` tạm thời giải thích lý do chỉ xem được khóa học `ACTIVE`.
  - Dropdown chọn khóa học ở trang Syllabus cũng gọi API public `searchCourses`, dẫn đến việc không thể tạo hoặc chỉnh sửa giáo trình cho các khóa học đang ở trạng thái `INACTIVE`.

---

## 2. MA TRẬN ĐỐI CHIẾU TRƯỚC VÀ SAU KHI SỬA

| Tiêu chí | Trước khi sửa | Sau khi sửa (Mục tiêu đạt được) |
|---|---|---|
| **Cấu trúc Trang** | 1 file chung `AdminCatalogPage.tsx` chứa `<Tabs>` | 4 trang độc lập: `AdminCategoriesPage`, `AdminSubjectsPage`, `AdminCoursesPage`, `AdminSyllabusPage` |
| **Routing** | 4 route mount vào 1 component với `fixedTab` | 4 route mount vào 4 component riêng biệt; `/admin/catalog` redirect an toàn sang `/admin/categories` |
| **Thanh Tab ngang** | Xuất hiện thanh Tab chuyển đổi | Xóa bỏ hoàn toàn thanh tab ngang |
| **Sidebar Navigation** | Highlight dựa trên startsWith đơn giản | Điều hướng 4 mục riêng biệt, active state chính xác tuyệt đối, hỗ trợ refresh và direct URL |
| **Banners Kỹ thuật** | 3 banner debug / developer hiển thị | Đã loại bỏ 100% banner kỹ thuật; giữ lại các thông báo lỗi và cảnh báo nghiệp vụ thực tế |
| **API Khóa học Admin** | Gọi `GET /courses` (chỉ ra ACTIVE) | Gọi `GET /api/admin/courses` (hỗ trợ đầy đủ ACTIVE, INACTIVE, ALL) |
| **Bộ lọc Trạng thái Khóa học** | Không có bộ lọc trạng thái | Có dropdown lọc `Tất cả`, `ACTIVE (Hoạt động)`, `INACTIVE (Tạm ngưng)` |
| **Chi tiết Khóa học** | Gọi `GET /courses/:id` (lỗi 404 nếu INACTIVE) | Gọi `GET /api/admin/courses/:id` (trả về 200 cho cả ACTIVE và INACTIVE) |
| **Dropdown Khóa học Syllabus** | Chỉ hiện khóa học ACTIVE | Hiển thị đầy đủ cả ACTIVE và INACTIVE (có nhãn đánh dấu trực quan) |
