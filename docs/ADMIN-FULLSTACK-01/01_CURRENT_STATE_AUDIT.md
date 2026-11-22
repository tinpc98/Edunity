# BÁO CÁO AUDIT HIỆN TRẠNG HỆ THỐNG QUẢN TRỊ ADMIN (EDUNITY V3)
**Mã tài liệu:** `docs/ADMIN-FULLSTACK-01/01_CURRENT_STATE_AUDIT.md`  
**Dự án:** EDUNITY V3  
**Vai trò:** Senior Fullstack Engineer  
**Thời điểm thực hiện:** 21/11/2026  

---

## 1. MỤC TIÊU AUDIT
Đối chiếu trực tiếp mã nguồn thực tế tại `BackEnd/` và `FrontEnd/` với 14 yêu cầu chức năng thuộc 7 Phase của nhiệm vụ **ADMIN-FULLSTACK-01**. Xác định chính xác các điểm đã có, điểm còn thiếu, điểm thừa cần lược bỏ và các rủi ro hồi quy.

---

## 2. BẢNG ĐỐI CHIẾU HIỆN TRẠNG TỪNG YÊU CẦU

| Phase / Yêu cầu | Hiện trạng mã nguồn thực tế | File liên quan | Đánh giá / Hướng xử lý |
| :--- | :--- | :--- | :--- |
| **PHASE 1: DASHBOARD** | | | |
| **1. Dọn giao diện Tổng quan** | - `AdminHomePage.tsx` đang nhúng `<PendingTasks />`, `<PendingTeachers />`, `<TrainingOverview />`.<br>- `AdminQuickActions.tsx` có các nút: "Tạo Campaign mới", "Kiểm tra thanh toán" (`/admin/payments`).<br>- `PendingTasks.tsx` là khu vực "Cần xử lý gấp" / "Hàng đợi khẩn cấp" có nút chuyển hướng.<br>- `PendingTeachers.tsx` là thẻ "Giáo viên chờ xác minh".<br>- `TrainingOverview.tsx` là thẻ "Nội dung đào tạo" / "Giáo viên đào tạo". | - `FrontEnd/src/features/admin/home/AdminHomePage.tsx`<br>- `AdminQuickActions.tsx`<br>- `PendingTasks.tsx`<br>- `PendingTeachers.tsx`<br>- `TrainingOverview.tsx` | **CẦN SỬA**:<br>- Loại bỏ 2 nút khỏi `AdminQuickActions.tsx`.<br>- Bỏ `<PendingTasks />`, `<PendingTeachers />`, `<TrainingOverview />` khỏi Dashboard.<br>- Tái cấu trúc layout 2 cột sang bố cục cân đối không để lại khoảng trống.<br>- Giữ nguyên các trang nghiệp vụ độc lập (`/admin/teachers/verifications`, `/admin/campaigns`, `/admin/payments`). |
| **2. Bộ lọc Tổng quan tài chính** | - Backend đã có API `/api/admin/overview` (qua `financeService.getFinanceOverview`) hỗ trợ timezone ICT (+7), các kỳ: `today`, `yesterday`, `3d`, `7d`, `30d`, `custom` (from/to) kèm time buckets thực tế.<br>- Widget `AdminFinanceOverview.tsx` trên Dashboard hiện chỉ nhận prop tĩnh 6 tháng từ `adminService.getDashboard()`, chưa có thanh lọc tương tác. | - `FrontEnd/src/features/admin/home/components/AdminFinanceOverview.tsx`<br>- `BackEnd/src/services/financeService.js`<br>- `BackEnd/src/controllers/financeController.js` | **CẦN SỬA**:<br>- Nâng cấp `AdminFinanceOverview.tsx` tích hợp bộ lọc thời gian: Hôm qua (`yesterday`), 3 ngày (`3d`), 7 ngày (`7d`), 1 tháng (`30d`), Tùy chọn (`custom`).<br>- Kết nối API thực `/api/admin/overview`.<br>- Đồng bộ số liệu KPI và biểu đồ dòng tiền theo kỳ lọc.<br>- Đầy đủ trạng thái Loading, Empty, Error kèm retry. |
| **3. Hoạt động gần đây** | - `RecentActivities.tsx` hiển thị danh sách dạng Timeline.<br>- Backend `adminService.getDashboard()` giới hạn `AuditLog.find().limit(10)`.<br>- Tuy nhiên nếu có >5 bản ghi, giao diện có nguy cơ kéo dài Dashboard nếu không có thanh cuộn giới hạn. | - `FrontEnd/src/features/admin/home/components/RecentActivities.tsx`<br>- `BackEnd/src/services/adminService.js` | **CẦN SỬA**:<br>- Đặt giới hạn hiển thị tối đa chiều cao `max-h-[380px] overflow-y-auto` với thanh cuộn mượt mà.<br>- Đảm bảo sắp xếp mới nhất trước (`createdAt: -1`). |
| **PHASE 2: USER MANAGEMENT** | | | |
| **4. Bỏ Mã người dùng** | - Cột "Mã người dùng" (`key: "id"`) hiển thị trực tiếp trong bảng danh sách `AdminUsersPage.tsx`.<br>- Thẻ thông tin "Mã người dùng" hiển thị trong modal chi tiết người dùng (`userDetail.id`). | - `FrontEnd/src/features/admin/users/AdminUsersPage.tsx` | **CẦN SỬA**:<br>- Xóa cột "Mã người dùng" khỏi bảng `Table`.<br>- Xóa khối "Mã người dùng" khỏi modal chi tiết.<br>- Giữ ID nội bộ làm `rowKey` và phục vụ các thao tác API ngầm. |
| **5. Lý do khóa/tạm ngưng** | - Đã triển khai đầy đủ qua task BE-USER-ALL & BE-USER-FIX-01.<br>- Hiển thị trạng thái, lý do (`statusReason`), thời gian (`statusChangedAt`), Admin thực hiện (`statusChangedBy`).<br>- Trạng thái `ACTIVE` không hiển thị lý do cũ.<br>- Tự động invalidate và refetch sau khi cập nhật trạng thái. | - `FrontEnd/src/features/admin/users/AdminUsersPage.tsx`<br>- `BackEnd/src/services/adminService.js` | **ĐÃ HOÀN THÀNH**.<br>Giữ nguyên logic chuẩn, bảo đảm hoạt động trơn tru sau khi bỏ Mã người dùng. |
| **PHASE 3: CATALOG & COURSES** | | | |
| **6. Tách các trang quản lý riêng biệt** | - Hiện tại `AdminCatalogPage.tsx` gom chung 5 tabs (`categories`, `subjects`, `courses`, `syllabus`, `pricing`) dưới một route `/admin/catalog`.<br>- Sidebar chỉ có 1 link "Danh mục & Khóa học". | - `FrontEnd/src/features/admin/catalog/AdminCatalogPage.tsx`<br>- `FrontEnd/src/components/layout/admin/AdminSidebar.tsx`<br>- `FrontEnd/src/routes/routePaths.ts`<br>- `FrontEnd/src/app/router.tsx` | **CẦN SỬA**:<br>- Tách thành 4 routes riêng biệt trong `routePaths.ts` & `router.tsx`:<br>  1. `/admin/categories` (Danh mục)<br>  2. `/admin/subjects` (Môn học)<br>  3. `/admin/courses` (Khóa học)<br>  4. `/admin/syllabus` (Giáo trình / Phiên bản)<br>- Tạo các trang chuyên biệt kế thừa CRUD sẵn có, giữ nguyên API.<br>- Cập nhật `AdminSidebar.tsx` hiển thị 4 mục với active key tương ứng. |
| **7. Bỏ Chính sách giá** | - `AdminCatalogPage.tsx` có tab `pricing` gọi `<AdminPricingPoliciesPage />`. | - `FrontEnd/src/features/admin/catalog/AdminCatalogPage.tsx` | **CẦN SỬA**:<br>- Bỏ tab "Chính sách giá" khỏi UI quản lý danh mục & khóa học.<br>- Giữ nguyên file component, route, model và logic giá cho các nghiệp vụ khác. |
| **PHASE 4: CLASS APPROVAL** | | | |
| **8. State Machine duyệt lớp** | - Backend hỗ trợ: `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `NEED_CHANGES`.<br>- Có đầy đủ AuditLog và thông báo cho giáo viên. | - `BackEnd/src/services/adminClassService.js`<br>- `BackEnd/src/models/Class.js` | **ĐÃ CÓ TRÊN BACKEND**.<br>Cần đồng bộ hoàn toàn lên giao diện Frontend. |
| **9. Yêu cầu chỉnh sửa (UI Buttons)** | - `AdminClassDetailPage.tsx` hiện chỉ có 2 nút: "Từ chối lớp" và "Phê duyệt mở lớp". Thiếu nút "Yêu cầu chỉnh sửa".<br>- `FrontEnd/src/services/class.service.ts` chưa khai báo hàm `requestChanges()`. | - `FrontEnd/src/features/admin/classes/AdminClassDetailPage.tsx`<br>- `FrontEnd/src/services/class.service.ts` | **CẦN SỬA**:<br>- Bổ sung hàm `requestChanges()` trong `class.service.ts`.<br>- Sắp xếp 3 nút trên `AdminClassDetailPage`: **Từ chối lớp \| Yêu cầu chỉnh sửa \| Phê duyệt mở lớp**.<br>- Modal "Yêu cầu chỉnh sửa" bắt buộc nhập nội dung `reviewNote`.<br>- Chống double-submit, xử lý loading/success/error. |
| **10. Tự động từ chối lớp quá hạn** | - Đã triển khai tại BE-02 (`rejectExpiredPendingClasses()` trong `maintenanceJob.js`).<br>- Có lease check, idempotency, transaction nguyên tử, AuditLog và Notification tự động.<br>- Lớp `NEED_CHANGES` và `APPROVED` không bị từ chối nhầm. | - `BackEnd/src/jobs/maintenanceJob.js`<br>- `BackEnd/tests/be02MaintenanceExpiredClass.test.js` | **ĐÃ HOÀN THÀNH**.<br>Giữ nguyên, không tạo cron mới gây trùng lặp. |
| **PHASE 5: REVIEWS & COMMENTS** | | | |
| **11. Quản lý bình luận & đánh giá** | - Backend đã có đầy đủ API moderation trong `accountRoutes.js` (`adminListReviews`, `hideReview`, `unhideReview`, `deleteReview`, `restoreReview`).<br>- Đã tự động tính toán lại rating trung bình trừ đi đánh giá ẩn/xóa.<br>- Frontend `AdminReviewsPage.tsx` đã có giao diện quản lý, tìm kiếm, lọc, modal ẩn, modal xóa mềm, xem lý do. | - `BackEnd/src/services/reviewService.js`<br>- `FrontEnd/src/features/admin/reviews/AdminReviewsPage.tsx` | **ĐÃ HOÀN THIỆN TỐT**.<br>Rà soát tính nhất quán UI/UX và kiểm thử hồi quy. |
| **PHASE 6: UI CONSISTENCY & CLEANUP** | | | |
| **12. Đồng bộ giao diện Admin** | - Hầu hết các trang đã dùng Jade/Teal design system (`#0D9488`, `#163B40`), `AdminPageHeader`, `AdminSectionCard`, `AdminStatusBadge`. | - Toàn bộ thư mục `FrontEnd/src/features/admin/` | **RÀ SOÁT & CHUẨN HÓA**:<br>Bảo đảm các trang phân tách mới (Categories, Subjects, Courses, Syllabus) tuân thủ 100% token giao diện Admin. |
| **13. Xóa mềm (Soft Delete & Trash)** | - Backend `trashService.js` và Frontend `AdminTrashPage.tsx` đã quản lý: `CATEGORY`, `SUBJECT`, `COURSE`, `CLASS`, `REVIEW`.<br>- Các thực thể tài chính (`Transaction`, `TeacherEarning`), `AuditLog` và `User` được bảo vệ tuyệt đối không cho xóa mềm bừa bãi. | - `BackEnd/src/services/trashService.js`<br>- `FrontEnd/src/features/admin/trash/AdminTrashPage.tsx` | **ĐÃ HOÀN THÀNH ĐÚNG NGUYÊN TẮC**.<br>Bảo toàn quy tắc an toàn dữ liệu. |
| **14. Xóa thông báo thừa** | - Kiểm tra các toast, alert và placeholder thông báo không cần thiết. | - `FrontEnd/src/features/admin/` | **CẦN SỬA**:<br>Rà soát và tinh giản các thông báo thừa, giữ nguyên validation và error cảnh báo quan trọng. |

---

## 3. KẾT LUẬN AUDIT
- **Phần Backend:** Nền tảng API hiện có (`financeService`, `adminService`, `adminClassService`, `reviewService`, `trashService`) rất vững chắc và đầy đủ tính năng. Không cần sửa phá vỡ kiến trúc, chỉ cần tận dụng tối đa API sẵn có.
- **Phần Frontend:** Cần can thiệp chính xác vào các trang:
  1. `AdminHomePage.tsx` và `AdminFinanceOverview.tsx`: Dọn bỏ các card/button thừa, thêm bộ lọc tài chính thời gian thực.
  2. `AdminUsersPage.tsx`: Bỏ hiển thị "Mã người dùng".
  3. Tách `AdminCatalogPage.tsx` thành 4 routes riêng biệt trên Sidebar.
  4. `AdminClassDetailPage.tsx`: Thêm nút và modal "Yêu cầu chỉnh sửa".
