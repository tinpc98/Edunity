# BÁO CÁO CHI TIẾT THAY ĐỔI FRONTEND
**Mã tài liệu:** `docs/ADMIN-FULLSTACK-01/04_FRONTEND_CHANGES.md`  
**Dự án:** EDUNITY V3  
**Vai trò:** Senior Fullstack Engineer  

---

## 1. TỔNG QUAN THAY ĐỔI FRONTEND
Các thay đổi giao diện Quản trị viên (Admin) được thiết kế đồng bộ theo phong cách Jade/Teal token của EDUNITY V3 (`#0D9488`, `#163B40`), loại bỏ triệt để các thành phần thừa, tối ưu hóa trải nghiệm người dùng (UX) và bảo đảm tương thích 100% với hệ thống router, types và API.

---

## 2. DANH SÁCH FILE & CHI TIẾT THAY ĐỔI

### 2.1. Phân hệ Dashboard (Phase 1)
1. **`FrontEnd/src/features/admin/home/components/AdminQuickActions.tsx`**:
   - Loại bỏ nút "Tạo Campaign mới" và nút "Kiểm tra thanh toán" / "Kiểm tra payment".
   - Giữ lại 3 hành động nhanh thiết yếu: "Xác minh giáo viên", "Duyệt học bổng", "Quản lý khóa học" (dẫn đến `/admin/courses`).
2. **`FrontEnd/src/features/admin/home/AdminHomePage.tsx`**:
   - Loại bỏ các thành phần: `<PendingTasks />`, `<PendingTeachers />`, `<TrainingOverview />`.
   - Sắp xếp lại lưới bố cục 2 cột cân xứng:
     - Cột trái (`Col xl={15}`): `<AdminFinanceOverview />` (tích hợp bộ lọc tài chính thời gian thực).
     - Cột phải (`Col xl={9}`): `<ScholarshipOverview />` và `<RecentActivities />`.
   - Loại bỏ hoàn toàn khoảng trống trên trang.
3. **`FrontEnd/src/features/admin/home/components/AdminFinanceOverview.tsx`**:
   - Tích hợp thanh lọc kỳ báo cáo:
     - "Hôm qua" (`yesterday`)
     - "3 ngày" (`3d`)
     - "7 ngày" (`7d` - mặc định)
     - "1 tháng" (`30d`)
     - "Tùy chọn" (`custom`) kèm modal chọn `DatePicker.RangePicker` (validate ngày bắt đầu $\le$ ngày kết thúc).
   - Kết nối trực tiếp API Backend qua `financeService.getFinanceOverview(queryParams)`.
   - Hiển thị 4 thẻ KPI đồng bộ: Doanh thu kỳ này, Thu học phí xác nhận, Chi trả giáo viên, Hoàn tiền đã xử lý.
   - Biểu đồ cột phân bố dòng tiền (`RevenueTimeSeriesPoint`) hiển thị giá trị, tỷ lệ chiều cao, và tooltip chi tiết.
   - Hỗ trợ đầy đủ các trạng thái `isLoading` (Skeleton), `isError` (Alert kèm nút Thử lại), và `Empty` khi không có dữ liệu giao dịch.
4. **`FrontEnd/src/features/admin/home/components/RecentActivities.tsx`**:
   - Bổ sung khung cuộn `max-h-[380px] overflow-y-auto pr-2` cho danh sách Timeline.
   - Khi có nhiều hơn 5 hoạt động, bảng danh sách tự động cuộn bên trong card, không làm kéo giãn chiều cao Dashboard.
5. **`FrontEnd/src/features/admin/home/components/AdminWelcomeHero.tsx`**:
   - Chuẩn hóa thông điệp trạng thái khi không có việc tồn đọng: "Hệ thống đang vận hành hoàn toàn ổn định, không có tác vụ tồn đọng" và "Tất cả tác vụ đã được hoàn tất".

---

### 2.2. Phân hệ Quản lý Người dùng (Phase 2)
1. **`FrontEnd/src/features/admin/users/AdminUsersPage.tsx`**:
   - **Loại bỏ hiển thị Mã người dùng:**
     - Xóa cột "Mã người dùng" khỏi bảng `Table` hiển thị danh sách người dùng.
     - Xóa khối thông tin "Mã người dùng" khỏi modal chi tiết người dùng.
     - Giữ nguyên trường `id` trong dữ liệu nội bộ để làm `rowKey` và phục vụ các truy vấn API.
   - **Xác nhận hiển thị Lý do khóa/tạm ngưng:**
     - Giữ nguyên khối cảnh báo trạng thái: hiển thị rõ lý do khóa/tạm ngưng (`statusReason`), thời gian xử lý (`statusChangedAt`), và thông tin Admin thực hiện (`statusChangedBy`).
     - Khi tài khoản ở trạng thái `ACTIVE`, không hiển thị lý do cũ.
     - Tự động invalidate query và refetch thông tin chi tiết ngay sau khi Admin thay đổi trạng thái.

---

### 2.3. Phân hệ Danh mục & Khóa học (Phase 3)
1. **`FrontEnd/src/routes/routePaths.ts`**:
   - Khai báo 4 đường dẫn URL chuyên biệt trong `ROUTES.ADMIN`:
     - `CATEGORIES: "/admin/categories"`
     - `SUBJECTS: "/admin/subjects"`
     - `COURSES: "/admin/courses"`
     - `SYLLABUS: "/admin/syllabus"`
2. **`FrontEnd/src/components/layout/admin/AdminSidebar.tsx`**:
   - Tách mục "Danh mục & Khóa học" thành 4 mục riêng biệt trên menu điều hướng:
     - Danh mục (`<FolderOutlined />`) $\rightarrow$ `/admin/categories`
     - Môn học (`<ReadOutlined />`) $\rightarrow$ `/admin/subjects`
     - Khóa học (`<BookOutlined />`) $\rightarrow$ `/admin/courses`
     - Giáo trình / Phiên bản (`<FileTextOutlined />`) $\rightarrow$ `/admin/syllabus`
   - Mục đang mở được đánh dấu active chính xác theo URL hiện hành.
3. **`FrontEnd/src/app/router.tsx`**:
   - Bổ sung định tuyến cho 4 trang con với thuộc tính `fixedTab` tương ứng.
4. **`FrontEnd/src/features/admin/catalog/AdminCatalogPage.tsx`**:
   - Nhận prop `fixedTab` để hiển thị trực tiếp chế độ tương ứng (Danh mục / Môn học / Khóa học / Giáo trình).
   - Tự động thay đổi tiêu đề trang và icon tương ứng theo từng phân hệ.
   - Chuyển hướng mượt mà giữa các route khi người dùng nhấn chuyển tab.
   - **Loại bỏ tab "Chính sách giá" (`pricing`)** khỏi giao diện mà không xóa model hoặc logic backend.

---

### 2.4. Phân hệ Quy trình Duyệt Lớp học (Phase 4)
1. **`FrontEnd/src/services/class.service.ts`**:
   - Bổ sung hàm API:
     ```typescript
     async requestChanges(classId: string, payload: { reviewNote: string }): Promise<ClassModel>
     ```
     gọi endpoint `POST /api/admin/classes/:id/request-changes`.
2. **`FrontEnd/src/features/admin/classes/AdminClassDetailPage.tsx`**:
   - Bố trí 3 nút hành động duyệt lớp theo đúng thứ tự tiêu chuẩn:
     **Từ chối lớp | Yêu cầu chỉnh sửa | Phê duyệt mở lớp**
   - Nút "Yêu cầu chỉnh sửa" có icon `<EditOutlined />` và phong cách cảnh báo hổ phách (amber).
   - Xây dựng Modal "Yêu cầu Giáo viên Chỉnh sửa Lớp học":
     - Bắt buộc nhập nội dung yêu cầu (`reviewNote`). Nếu để trống sẽ hiển thị cảnh báo `message.warning`.
     - Hiển thị loading spinner trên nút submit khi đang gửi request.
     - Vô hiệu hóa cả 3 nút (chống double-submit) khi một thao tác bất kỳ đang được xử lý (`isAnySubmitting`).
     - Sau khi thành công, hiển thị thông báo và cập nhật trạng thái lớp sang `NEED_CHANGES`.

---

### 2.5. Kiểm duyệt Đánh giá, Xóa mềm & Dọn dẹp (Phase 5, 6)
- **`AdminReviewsPage.tsx`**: Rà soát các thao tác moderation (Ẩn / Hiện / Chuyển vào thùng rác / Khôi phục).
- **`AdminTrashPage.tsx`**: Bảo đảm 5 danh mục xóa mềm (`CATEGORY`, `SUBJECT`, `COURSE`, `CLASS`, `REVIEW`) hiển thị rõ ràng, xác nhận lý do trước khi xóa vĩnh viễn và khôi phục an toàn.
- **Dọn dẹp mã nguồn:** Loại bỏ toàn bộ import thừa (`AppstoreOutlined`, `DollarOutlined`, `CheckOutlined`, `Tooltip`, `CopyOutlined`) và hàm không còn dùng (`copyToClipboard`), giúp bản build production đạt 100% sạch sẽ và không cảnh báo.
