# EDUNITY V3 — ADMIN UI REDESIGN
## BÁO CÁO 04: KẾT QUẢ CHUYỂN ĐỔI CÁC TRANG QUẢN TRỊ (ADMIN PAGES MIGRATION)

**Mã công việc:** `EDUNITY-V3-ADMIN-FULL-UI-REDESIGN`  
**Ngày thực hiện:** 19/11/2026  
**Chủ sở hữu:** Senior Frontend Architect & Ant Design Specialist  
**Nhánh Git:** `feature/teacher-admin`  

---

### I. TỔNG QUAN PHẠM VI CHUYỂN ĐỔI

Toàn bộ **22 routes** của phân hệ Admin đã được chuyển đổi toàn diện sang ngôn ngữ thiết kế **Soft Mint & Teal**. Không có trang nào bị bỏ sót hay hiển thị sai lệch bảng màu.

---

### II. CHI TIẾT CÁC PHÂN HỆ ĐÃ ĐƯỢC CHUYỂN ĐỔI

#### 1. Bảng điều khiển Quản trị (`AdminHomePage.tsx` & Sub-components)
- **Mã nguồn tương ứng trong Stitch:** `t_ng_quan_edunity_admin_dashboard/code.html`
- **Các thành phần đã hiện đại hóa:**
  - `AdminWelcomeHero.tsx`: Chuyển từ nền gradient tím đậm sang card trắng viền Soft Mint thanh lịch, hiệu ứng vầng sáng xanh ngọc (ambient glow), dải trạng thái vận hành 99.98%, widget ngày tháng trực tiếp tiếng Việt, và nút làm mới dữ liệu.
  - `AdminHomePage.tsx`: Tích hợp 4 thẻ `AdminKpiCard` (Người dùng: 42.850, Giảng viên: 1.420, Lớp đang mở, Doanh thu tháng).
  - `AdminQuickActions.tsx`: Thanh phím tắt nhanh với viền Mint và đếm huy hiệu tồn đọng.
  - `PendingTasks.tsx`: Danh mục tác vụ khẩn cấp bọc trong `AdminSectionCard` với nhãn ưu tiên sắc nét.
  - `PendingTeachers.tsx`: Hồ sơ giáo viên chờ duyệt với avatar vuông bo tròn, nhãn chờ duyệt, nút thẩm định nhanh.
  - `AdminFinanceOverview.tsx`: Thống kê doanh thu tháng, hoa hồng nền tảng và biểu đồ cột 6 tháng gần nhất với cột nổi bật màu Deep Teal và chấm tròn Mint.
  - `ScholarshipOverview.tsx`: Thẻ tiến độ giải ngân quỹ học bổng với thanh Progress màu Teal `#0D9488`.
  - `TrainingOverview.tsx`: Thống kê khóa học chuẩn và lớp học trực tuyến.
  - `RecentActivities.tsx`: Dòng thời gian Timeline với các chấm tròn màu sắc theo hành vi kiểm toán.

---

#### 2. Quản lý Người dùng & Hộp thoại Chi tiết Trung tâm (`AdminUsersPage.tsx`)
- **Mã nguồn tương ứng trong Stitch:** 
  - Danh sách: `qu_n_l_ng_i_d_ng_danh_s_ch_t_i_kho_n/code.html`
  - Modal: `chi_ti_t_ng_i_d_ng_modal_soft_mint_teal/code.html`
- **Thay đổi quan trọng nhất (YÊU CẦU BẮT BUỘC):**
  - **LOẠI BỎ HOÀN TOÀN `<Drawer>` dạng trượt ngang lề phải cũ.**
  - **THAY THẾ BẰNG `<Modal centered width={820}>` CHÍNH GIỮA MÀN HÌNH** với các đặc tính:
    1. *Hiệu ứng hiển thị:* Bo góc lớn 20px, viền mỏng Soft Mint, lớp phủ nền mờ làm tối (backdrop-blur).
    2. *Tương tác bàn phím:* Đóng modal tức thì khi bấm phím `Esc` (sử dụng cả `onCancel` và listener sự kiện bàn phím toàn cục).
    3. *Sticky Header:* Tiêu đề "Thông tin chi tiết người dùng", huy hiệu "HỒ SƠ HỆ THỐNG V3", nhãn phân hệ và nút đóng có chỉ dẫn phím `Esc`.
    4. *Profile Hero Banner:* Khung gradient Deep Teal sang trọng (`from-teal-800 via-teal-700 to-teal-900`), avatar lớn 72px có viền ngọc bích, vòng tròn tích xanh xác minh danh tính, thông tin tên, email, ID và nút đổi trạng thái nhanh.
    5. *Section 1 - Tài khoản & Bảo mật:* Lưới 3 cột gồm mã người dùng (kèm nút sao chép tiện lợi), vai trò & thẩm quyền, trạng thái vận hành, ngày gia nhập, xác thực bảo mật, và lần cập nhật cuối.
    6. *Section 2 - Hồ sơ theo vai trò (Role-specific Profile):*
       - *Giáo viên:* Trạng thái duyệt hồ sơ, tóm tắt chuyên môn học thuật, tiểu sử sư phạm tóm tắt, đánh giá sao từ học viên (`ratingAverage` với 5 biểu tượng sao vàng trực quan).
       - *Học sinh:* Họ tên, ngày sinh, giới thiệu bản thân.
       - *Nhà tài trợ:* Loại nhà tài trợ (Tổ chức/Cá nhân), tên tổ chức, đại diện pháp lý, mô tả tài trợ.
    7. *Section 3 - Thống kê Hoạt động & Vận hành:* Lưới thẻ số liệu hoạt động thực tế từ Backend (lớp học phụ trách/đăng ký, học viên đào tạo, lượt tài trợ hoàn tất, khiếu nại liên quan).
    8. *Sticky Footer:* Ghi chú nhật ký kiểm toán hệ thống cùng nút đóng thân thiện.
  - Bảo tồn 100% logic thay đổi trạng thái (ACTIVE, SUSPENDED, BANNED) và cơ chế khóa phiên người dùng.

---

#### 3. Phân hệ Xác minh & Thẩm định Giáo viên (`TeacherVerificationPage.tsx` & `TeacherVerificationDetailPage.tsx`)
- **Mã nguồn tương ứng trong Stitch:**
  - Danh sách chờ duyệt: `x_c_minh_gi_o_vi_n_danh_s_ch_ch_duy_t/code.html`
  - Hồ sơ thẩm định: `chi_ti_t_h_s_x_c_minh_gi_o_vi_n_ts._nguy_n_ho_ng_nam/code.html`
- **Các thành phần đã hiện đại hóa:**
  - `TeacherVerificationPage.tsx`: Bổ sung 4 thẻ KPI chuẩn Stitch (Tổng hồ sơ: 1.515, Đã xác minh: 1.420, Chờ duyệt gấp: 32, Từ chối/Bổ sung: 63), thanh lọc Tab dạng Pill bo góc hiện đại, bảng dữ liệu avatar Teal, đồng bộ URL parameters 3 chiều an toàn.
  - `TeacherVerificationDetailPage.tsx`: Khung hồ sơ giáo viên nổi bật với avatar Teal, mã định danh `#TCH-xxxx`, chuyên môn sư phạm. Bố cục 2 cột: cột trái hiển thị thông tin cá nhân, thẻ định danh CCCD, bằng cấp chuyên môn, lịch sử xét duyệt và hợp đồng; cột phải là bảng biên bản thẩm định ghim dính (sticky) với 2 nút quyết định (Phê duyệt quyền mở lớp / Từ chối yêu cầu sửa) tích hợp modal lý do chi tiết.
  - `TeacherContractsCard.tsx` & `TeacherIdentityCard.tsx`: Đồng bộ hóa màu sắc sang Teal/Mint `#0D9488`.

---

#### 4. Tổng quan Tài chính & Đối soát (`AdminFinanceOverviewPage.tsx`)
- **Mã nguồn tương ứng trong Stitch:** `t_ng_quan_t_i_ch_nh_i_so_t_edunity_fintech/code.html`
- **Các thành phần đã hiện đại hóa:**
  - `AdminPageHeader`: Tiêu đề phân hệ Kế toán & Đối soát kèm nút điều hướng nhanh đến hàng đợi đối soát bất thường.
  - Banner an toàn sổ cái tài chính: Nhấn mạnh 3 nguyên tắc bất khả xâm phạm (RECEIPT ≠ REVENUE, Tách biệt nguồn tiền, Thù lao giảng viên).
  - 4 thẻ KPI tài chính chủ chốt: Doanh thu Học phí, Quỹ Tài trợ Học bổng, Khoản thu tạm giữ (Nợ phải trả), Nghĩa vụ hoàn tiền.
  - 3 khối phân tích chuyên sâu: Sổ cái Thù lao Giảng viên (Pending, Available, Paid_out), Giám sát Worker phục hồi giao dịch Outbox, và Hàng đợi đối soát bất thường theo trạng thái.
  - 3 lối tắt dẫn đến Sổ cái Giao dịch, Hàng đợi Đối soát và Webhook Outbox.

---

#### 5. Nhóm 18 Trang Quản trị Còn Lại
Toàn bộ các trang danh mục, lớp học, chiến dịch, học bổng, sổ cái thanh toán và báo cáo khiếu nại đã được chuyển đổi triệt để các mã màu tím/indigo cũ sang Deep Teal `#0D9488` và Soft Mint `#CCFBF1`, cụ thể:
1. `AdminClassesPage.tsx` & `AdminClassDetailPage.tsx`: Bảng danh sách lớp, bộ lọc, thẻ môn học liên kết, kế hoạch buổi học.
2. `AdminCatalogPage.tsx` & `AdminCourseProposalsPage.tsx` & `AdminSyllabusManagementPage.tsx`: Danh mục khóa học, duyệt đề xuất, quản lý phiên bản giáo trình.
3. `AdminCampaignsPage.tsx`, `CreateCampaignPage.tsx`, `CampaignDetailPage.tsx`: Quản lý chiến dịch học bổng, tạm tính phân bổ số suất học bổng, danh sách nhà tài trợ.
4. `ScholarshipApplicationsPage.tsx` & `ScholarshipApplicationReviewPage.tsx`: Bảng hồ sơ ứng tuyển, các thẻ trạng thái, bảng định mức phê duyệt READ-ONLY theo quy định chiến dịch (BR-37).
5. `PaperDossierIntakePage.tsx` & `GuardianConsentReviewCard.tsx`: Tiếp nhận hồ sơ giấy, mã biên nhận, duyệt văn bản đồng thuận phụ huynh.
6. `AdminPaymentsPage.tsx`, `AdminTransactionsPage.tsx`, `AdminBankEventsPage.tsx`: Giám sát cổng thanh toán, sổ cái đối soát, webhooks payOS.
7. `AdminPayoutsPage.tsx` & `AdminRefundsPage.tsx`: Quyết toán thù lao giáo viên, duyệt yêu cầu hoàn tiền.
8. `AdminReportsPage.tsx`: Quản lý khiếu nại, sự cố buổi học, xếp lịch dạy bù.

---

### III. KẾT QUẢ KIỂM TRA MÃ NGUỒN
- Lệnh kiểm tra chuỗi `indigo` trên toàn bộ thư mục `FrontEnd/src/features/admin/` cho kết quả: **0 lần xuất hiện**.
- Lệnh kiểm tra `npm run build` trên thư mục `FrontEnd`: **Biên dịch thành công 100%, 0 lỗi, 0 cảnh báo TypeScript**.
