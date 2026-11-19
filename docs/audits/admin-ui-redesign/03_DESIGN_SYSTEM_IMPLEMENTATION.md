# EDUNITY V3 — ADMIN UI REDESIGN
## BÁO CÁO 03: TRIỂN KHAI HỆ THỐNG THIẾT KẾ (DESIGN SYSTEM IMPLEMENTATION)

**Mã công việc:** `EDUNITY-V3-ADMIN-FULL-UI-REDESIGN`  
**Ngày thực hiện:** 19/11/2026  
**Chủ sở hữu:** Senior Frontend Architect & Ant Design Specialist  
**Nhánh Git:** `feature/teacher-admin`  

---

### I. MỤC TIÊU & NGUYÊN TẮC CỐT LÕI

Hệ thống thiết kế mới của phân hệ Quản trị viên (Admin) được trích xuất trực tiếp từ bộ đặc tả Stitch AI (`stitch_edunity_admin_v3_ui_redesign/edunity_soft_mint_teal/DESIGN.md`) nhằm mục tiêu:
1. **Đồng bộ hóa 100% bảng màu Soft Mint & Deep Teal** thay thế màu tím/indigo cũ trên tất cả các trang quản trị.
2. **Cách ly tuyệt đối (100% Layout & Style Isolation)** giữa phân hệ Admin và các phân hệ Student, Teacher, Sponsor. Mọi cập nhật token hay layout chỉ áp dụng bên trong Admin Scope.
3. **Bảo toàn 100% logic nghiệp vụ, API query, mutation, validation, RBAC, và MongoDB models**.

---

### II. KIẾN TRÚC COLOR TOKENS & TYPOGRAPHY

#### 1. Color Palette Tokens (`FrontEnd/tailwind.config.js` & `adminTheme.ts`)

| Nhóm Màu | Tên Token | Mã Hex | Vai Trò & Điểm Ứng Dụng |
| :--- | :--- | :--- | :--- |
| **Primary** | Deep Teal 700/800 | `#0D9488` / `#115E59` | Màu thương hiệu chủ đạo, CTA buttons, active pills, logo icon, primary links |
| **Accent** | Mint Bright 300 | `#5EEAD4` | Đường viền highlight, điểm nhấn gradient hero, hover effects |
| **Pills & Badges**| Soft Mint 100 | `#CCFBF1` | Background của badge, tag trạng thái active, selection highlights |
| **Surface** | Surface Mint | `#F2FAF8` | Nền Sidebar, Table header, Section header, modal secondary surface |
| **Canvas** | Page Canvas | `#F7FAFA` | Nền canvas toàn bộ trang quản trị |
| **Card / Modal**| Pure White | `#FFFFFF` | Nền thẻ nghiệp vụ (Card), Centered Modal, Data table container |
| **Border** | Mint Border | `#E2EDEB` | Đường viền phân cách vi mô, card borders, table row dividers |
| **Text Primary** | Dark Charcoal | `#1F2937` | Tiêu đề, số liệu KPI, văn bản chính |
| **Text Secondary**| Muted Slate | `#4B5563` / `#6B7280` | Nhãn phụ, mô tả trường, breadcrumb text |
| **Status Tokens**| Emerald / Amber / Rose / Sky | `#10B981` / `#F59E0B` / `#EF4444` / `#0EA5E9` | Trạng thái nghiệp vụ: Verified/Active, Pending, Rejected/Banned, Info |

#### 2. Typography & Elevation
- **Font Family:** `'Be Vietnam Pro', 'Plus Jakarta Sans', system-ui, sans-serif`
- **Border Radius:**
  - Elements: `borderRadius: 12px`
  - Cards: `borderRadiusLG: 16px`
  - Modals: `borderRadiusLG: 20px`
  - Buttons: `borderRadius: 10px`
  - Badges/Pills: `rounded-full` (`9999px`)

---

### III. KIẾN TRÚC BỐ CỤC ĐỘC LẬP (`AdminLayout`)

Để đảm bảo không ảnh hưởng đến Teacher và Sponsor vốn dùng chung `DashboardShell.tsx`, chúng tôi đã xây dựng hệ thống layout chuyên biệt cho Admin:

```
FrontEnd/src/components/layout/
├── AdminLayout.tsx                    <-- Wrapper ConfigProvider + Admin Frame
└── admin/
    ├── adminTheme.ts                 <-- Ant Design ThemeConfig chuyên biệt
    ├── AdminSidebar.tsx              <-- Sidebar Mint/Teal chuẩn Stitch (w-72, grouped nav)
    └── AdminHeader.tsx               <-- Glassmorphism Header (Ctrl+K search, live status)
```

#### 1. `AdminLayout.tsx`
- Bọc toàn bộ router subtree của Admin bằng `<ConfigProvider theme={adminThemeConfig}>`.
- Kiểm tra quyền hạn `user.role === 'ADMIN'`. Chuyển hướng bảo mật nếu không đủ quyền.
- Điều phối trạng thái co giãn (collapsible sidebar) và hỗ trợ responsive trên màn hình tablet/mobile.

#### 2. `AdminSidebar.tsx`
- Phông nền Surface Mint `#F2FAF8`, logo chữ "E" trong khối bo góc Teal, nhãn phiên bản `Management V3`, pill huy hiệu "ADMIN".
- 5 nhóm điều hướng:
  1. *Tổng quan:* Dashboard
  2. *Quản lý hệ thống:* Người dùng, Giáo viên, Danh mục & Khóa học, Duyệt đề xuất khóa học, Lớp học
  3. *Học bổng:* Chiến dịch, Hồ sơ ứng tuyển, Hồ sơ giấy
  4. *Tài chính & Đối soát:* Tổng quan tài chính, Sổ cái giao dịch, Hàng đợi đối soát, Webhooks & Outbox, Thanh toán học phí, Rút tiền giáo viên, Quản lý hoàn tiền
  5. *Vận hành:* Khiếu nại, Thông báo
- Active item indicator: Dải pill bo góc viền trái màu Teal (`before:w-1.5 before:bg-teal-600 before:rounded-r-full`).
- Chân Sidebar hiển thị Profile Card Admin cùng nút đăng xuất an toàn.

#### 3. `AdminHeader.tsx`
- Chiều cao `64px`, thiết kế Glassmorphism trong suốt mờ (`bg-white/85 backdrop-blur-xl border-b border-[#E2EDEB]`).
- Breadcrumb phân hệ với biểu tượng bảo mật.
- Thanh tìm kiếm nhanh tích hợp phím tắt gợi ý `Ctrl+K`.
- Huy hiệu hệ thống "Operational" nhấp nháy xanh thời gian thực.
- Tích hợp `NotificationPopover` và Dropdown quản trị viên.

---

### IV. BỘ LINH KIỆN TÁI SỬ DỤNG CHUYÊN BIỆT (`FrontEnd/src/components/admin/`)

Đã đóng gói 5 thành phần UI dùng chung tuân thủ triệt để Stitch Design:

1. **`AdminPageHeader.tsx`**: Header trang chuẩn gồm eyebrow category, tiêu đề trang `text-3xl font-bold`, mô tả nghiệp vụ và khu vực thao tác hành động (actions/extra).
2. **`AdminKpiCard.tsx`**: Thẻ số liệu thống kê chuẩn với khung chứa biểu tượng bo góc (Teal/Mint/Amber/Rose), số liệu lớn `text-[28px]`, pill hiển thị xu hướng tăng/giảm và mô tả chu kỳ đối soát.
3. **`AdminSectionCard.tsx`**: Khung nội dung `rounded-2xl` có dải tiêu đề header `#FAFDFD`, viền `#E2EDEB` và khu vực thao tác nhanh.
4. **`AdminDataTable.tsx`**: Khung bảng dữ liệu Ant Design bọc thanh điều khiển tiêu đề, hiển thị tổng số bản ghi thời gian thực, bảng màu header `#F2FAF8`, hiệu ứng hover `#F2FAF8` và phân trang chuẩn.
5. **`AdminStatusBadge.tsx`**: Huy hiệu trạng thái pill chuẩn (`roleBadge`, `statusBadge`) với màu sắc và chấm đèn tín hiệu đồng bộ.

---

### V. KẾT QUẢ ĐẠT ĐƯỢC
- Không có lỗi build TypeScript / Vite.
- Thiết lập xong nền tảng trực quan hiện đại, thanh thoát, giảm áp lực thị giác cho quản trị viên khi làm việc với mật độ thông tin cao.
