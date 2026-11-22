# KẾ HOẠCH TRIỂN KHAI HỆ THỐNG QUẢN TRỊ ADMIN (PHASE 1 - 7)
**Mã tài liệu:** `docs/ADMIN-FULLSTACK-01/02_IMPLEMENTATION_PLAN.md`  
**Dự án:** EDUNITY V3  
**Vai trò:** Senior Fullstack Engineer  

---

## 1. MỤC TIÊU & PHẠM VI TRIỂN KHAI
Triển khai toàn diện theo 7 Phase theo đúng quy tắc kỹ thuật nghiêm ngặt:
- **Nguyên tắc cốt lõi:** Source code là nguồn sự thật; không dùng mock data; sửa đổi tối thiểu và chính xác; giữ nguyên các chức năng đang hoạt động đúng; không ảnh hưởng phạm vi Student, Teacher, Sponsor.

---

## 2. KẾ HOẠCH THEO TỪNG PHASE

### PHASE 1: ADMIN DASHBOARD
1. **Dọn giao diện Tổng quan:**
   - Trong `AdminQuickActions.tsx`: Lược bỏ 2 nút "Tạo Campaign mới" và "Kiểm tra payment" (vẫn giữ các trang độc lập).
   - Trong `AdminHomePage.tsx`:
     - Gỡ bỏ `<PendingTasks />`, `<PendingTeachers />`, `<TrainingOverview />`.
     - Sắp xếp lại layout Dashboard: Cột chính hiển thị `<AdminFinanceOverview />` (có bộ lọc), cột phụ hiển thị `<ScholarshipOverview />` và `<RecentActivities />`.
2. **Bộ lọc Tổng quan Tài chính:**
   - Bổ sung thanh lọc thời gian vào `AdminFinanceOverview.tsx`:
     - Hôm qua (`yesterday`)
     - 3 ngày gần nhất (`3d`)
     - 7 ngày gần nhất (`7d`)
     - 1 tháng gần nhất (`30d`)
     - Khoảng ngày tùy chọn (`custom`) kèm modal chọn `DatePicker.RangePicker` với validation ngày.
   - Kết nối trực tiếp API `/api/admin/overview` (qua `financeService.getFinanceOverview`).
   - Hiển thị loading skeleton/spinner, empty state, error state kèm nút retry.
   - Đồng bộ hóa các chỉ số KPI doanh thu, hoa hồng, giao dịch và biểu đồ cột.
3. **Hoạt động gần đây:**
   - Cập nhật `RecentActivities.tsx`: Thiết lập container cuộn `max-h-[380px] overflow-y-auto pr-1` để khi có nhiều hơn 5 hoạt động vẫn đảm bảo chiều cao cố định, không kéo giãn Dashboard.

### PHASE 2: USER MANAGEMENT
1. **Bỏ mã người dùng:**
   - Trong `AdminUsersPage.tsx`:
     - Xóa cột "Mã người dùng" khỏi bảng `Table`.
     - Xóa thẻ "Mã người dùng" khỏi modal chi tiết người dùng.
     - Giữ `user.id` làm khóa định danh ngầm (`rowKey`, param API).
2. **Xác nhận lý do khóa/tạm ngưng:**
   - Đảm bảo trường `statusReason`, `statusChangedAt`, `statusChangedBy` hiển thị đúng cho `SUSPENDED` và `BANNED`.
   - Trạng thái `ACTIVE` tuyệt đối không hiển thị lý do cũ.

### PHASE 3: CATALOG & COURSE MANAGEMENT
1. **Tách các trang quản lý trên Sidebar:**
   - Cập nhật `routePaths.ts`:
     - `ROUTES.ADMIN.CATEGORIES = "/admin/categories"`
     - `ROUTES.ADMIN.SUBJECTS = "/admin/subjects"`
     - `ROUTES.ADMIN.COURSES = "/admin/courses"`
     - `ROUTES.ADMIN.SYLLABUS = "/admin/syllabus"`
     - Giữ `ROUTES.ADMIN.CATALOG = "/admin/catalog"` (tự chuyển hướng về `/admin/categories`).
   - Cập nhật `AdminSidebar.tsx`:
     - Hiển thị 4 mục riêng biệt trong nhóm ĐÀO TẠO & NỘI DUNG.
     - Active state đồng bộ chính xác theo từng route.
   - Cập nhật `router.tsx`:
     - Khai báo 4 routes mới có guard Admin.
   - Tạo các component trang:
     - `AdminCategoriesPage.tsx`
     - `AdminSubjectsPage.tsx`
     - `AdminCoursesPage.tsx`
     - Sử dụng `AdminSyllabusManagementPage.tsx` cho giáo trình.
   - Tái sử dụng trọn vẹn logic và API của `courseCatalog.service.ts` và `course.service.ts`.
2. **Bỏ tab Chính sách giá:**
   - Lược bỏ tab `pricing` khỏi giao diện Danh mục & Khóa học.

### PHASE 4: CLASS APPROVAL WORKFLOW
1. **Bổ sung API Client:**
   - Thêm hàm `requestChanges(classId, { reviewNote })` vào `FrontEnd/src/services/class.service.ts` gọi `POST /api/admin/classes/:id/request-changes`.
2. **Cập nhật giao diện duyệt lớp:**
   - Trong `AdminClassDetailPage.tsx`:
     - Hiển thị 3 nút hành động theo đúng thứ tự:
       **Từ chối lớp | Yêu cầu chỉnh sửa | Phê duyệt mở lớp**
     - Tạo modal "Yêu cầu chỉnh sửa", bắt buộc nhập `reviewNote`.
     - Tích hợp mutation `requestChangesMutation` với feedback `message.success` / `message.error`.
     - Chống double-submit (disabled khi mutation `isPending`).
3. **Bảo toàn cơ chế tự động từ chối:**
   - Xác nhận `rejectExpiredPendingClasses()` trong `maintenanceJob.js` tiếp tục bảo đảm an toàn cho lớp `PENDING_APPROVAL` quá hạn.

### PHASE 5: COMMENTS & REVIEWS
1. **Kiểm tra và chuẩn hóa:**
   - Rà soát `AdminReviewsPage.tsx` và `reviewService.js`.
   - Đảm bảo đầy đủ các tính năng: danh sách, lọc, tìm kiếm, xem chi tiết, ẩn, hiện lại, xóa mềm, khôi phục.
   - Bảo đảm rating trung bình công khai không bị sai lệch.

### PHASE 6: UI CONSISTENCY, SOFT DELETE & CLEANUP
1. **Đồng bộ hóa giao diện:**
   - Áp dụng các component chuẩn: `AdminPageHeader`, `AdminSectionCard`, `AdminStatusBadge`.
   - Bảo đảm responsive trên cả mobile và desktop.
2. **Xóa mềm và an toàn dữ liệu:**
   - Bảo vệ tuyệt đối các thực thể tài chính (`Transaction`, `TeacherEarning`), `AuditLog`, `User`.
   - Giữ nguyên cơ chế thùng rác `AdminTrashPage.tsx`.
3. **Dọn dẹp thông báo thừa:**
   - Loại bỏ các thông báo trùng lặp hoặc tin nhắn hướng dẫn không cần thiết.

### PHASE 7: TEST & REGRESSION
1. **Kiểm thử Backend:**
   - Chạy toàn bộ các test suite trọng yếu (`beUserDurableRevocation`, `beUserFix01`, `beUserAdminStatus`, `be01ClassNeedChanges`, `be02MaintenanceExpiredClass`, `be03AcademicSoftDelete`, `community`).
2. **Kiểm thử Frontend:**
   - Chạy TypeScript compiler check (`tsc -b`).
3. **Báo cáo nghiệm thu:**
   - Lập báo cáo kết quả và kết luận GO/NO-GO.
