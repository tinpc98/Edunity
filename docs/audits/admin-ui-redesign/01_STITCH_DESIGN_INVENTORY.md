# EDUNITY V3 — BÁO CÁO KIỂM KÊ THIẾT KẾ GOOGLE STITCH
**TASK ID:** `EDUNITY-V3-ADMIN-FULL-UI-REDESIGN`  
**NGÀY THỰC HIỆN:** 19/11/2026  
**THƯ MỤC NGUỒN STITCH:** `stitch_edunity_admin_v3_ui_redesign/stitch_edunity_admin_v3_ui_redesign`

---

## I. TỔNG QUAN CÁC TÀI SẢN THIẾT KẾ ĐÃ XUẤT

Thư mục Stitch chứa 2 bộ đặc tả thiết kế Markdown (`DESIGN.md`) và 7 thư mục màn hình mẫu hoàn chỉnh bao gồm mã HTML/Tailwind (`code.html`) và ảnh render (`screen.png`):

| STT | Tên Thư Mục Màn Hình | Loại File | Màn Hình Đại Diện Trong Edunity | Giá Trị Áp Dụng / Thành Phần Tái Sử Dụng |
|---|---|---|---|---|
| 1 | `edunity_soft_mint_teal` | `DESIGN.md` | Toàn bộ Design System Admin | Design Tokens: Màu sắc Mint/Teal (#0D9488, #5EEAD4, #CCFBF1, #F7FAFA, #F2FAF8), Typography (Be Vietnam Pro, Tabular-nums), Spacing 8px, Elevation, Bán kính bo góc (8px - 20px). |
| 2 | `academic_saas_ecosystem` | `DESIGN.md` | Tài liệu mở rộng SaaS Ecosystem | Hướng dẫn bố cục phân quyền Admin, mật độ thông tin dữ liệu phân tầng (High-density analytical dashboards). |
| 3 | `t_ng_quan_edunity_admin_dashboard` | `code.html`, `screen.png` | **Trang Tổng quan Admin (`/admin`)** | Bố cục Sidebar chuẩn Mint/Teal, Header có tìm kiếm nhanh & Operational status, Banner chào mừng động, 4 Thẻ KPI thống kê, Hộp tác vụ khẩn cấp (Urgent Tasks), Bảng dòng tiền & Học bổng, Dòng thời gian hoạt động gần đây. |
| 4 | `qu_n_l_ng_i_d_ng_danh_s_ch_t_i_kho_n` | `code.html`, `screen.png` | **Quản lý người dùng (`/admin/users`)** | Thanh công cụ lọc vai trò & trạng thái, Ô tìm kiếm chuẩn Mint/Teal, Bảng dữ liệu người dùng (Avatar, ID, Role pill, Status badge, Thao tác), Thẻ thống kê 4 nhóm tài khoản. |
| 5 | `chi_ti_t_ng_i_d_ng_modal_soft_mint_teal` | `code.html`, `screen.png` | **Chi tiết người dùng — CENTERED MODAL** | Modal chính giữa màn hình (rộng ~820px, bo góc 20px, backdrop mờ), Header ghim cố định kèm nút Esc, Hero banner gradient Teal/Mint, Khối thông tin bảo mật, Khối hồ sơ giáo viên, Khối thống kê hoạt động. |
| 6 | `chi_ti_t_ng_i_d_ng_modal_variant_b_mint_teal` | `code.html`, `screen.png` | **Chi tiết người dùng — Biến thể B** | Biến thể tabbed card layout cho trường hợp người dùng đa vai trò. |
| 7 | `x_c_minh_gi_o_vi_n_danh_s_ch_ch_duy_t` | `code.html`, `screen.png` | **Xác minh giáo viên (`/admin/teachers/verifications`)** | Hệ thống Tab trạng thái (Chờ duyệt, Đã xác minh, Từ chối, Chưa gửi), 4 Thẻ KPI số lượng hồ sơ, Bảng danh sách giáo viên kèm chuyên môn & ngày nộp, Nút xem hồ sơ. |
| 8 | `chi_ti_t_h_s_x_c_minh_gi_o_vi_n_ts._nguy_n_ho_ng_nam` | `code.html`, `screen.png` | **Chi tiết hồ sơ giáo viên (`/admin/teachers/verifications/:id`)** | Hero card hồ sơ giảng viên (học vị, kinh nghiệm, chuyên môn), Nhóm nút phê duyệt/từ chối/yêu cầu bổ sung, Bố cục 2 cột (Thông tin eKYC, Bằng cấp & Chứng chỉ kèm OCR Confidence, Lịch sử xét duyệt, Hợp đồng điện tử). |
| 9 | `t_ng_quan_t_i_ch_nh_i_so_t_edunity_fintech` | `code.html`, `screen.png` | **Tổng quan tài chính & đối soát (`/admin/finance-overview`)** | Nguyên tắc IFRS-15 "Receipt is not always Revenue", 4 Thẻ tài chính độc lập (Học phí TUITION vs Quỹ tài trợ DONATION vs Thu chưa phân bổ vs Hoàn tiền), Thù lao giảng viên (PENDING, AVAILABLE, PAID_OUT), Trạng thái Outbox Worker & Hàng đợi đối soát. |

---

## II. BẢNG MÃ MÀU VÀ DESIGN TOKENS CHÍNH THỨC (MINT & TEAL)

```css
/* Core Primary & Secondary */
--color-primary: #0D9488;             /* Teal chính cho nút bấm, active link, brand accents */
--color-primary-hover: #0F766E;       /* Teal đậm hơn khi hover */
--color-primary-container: #008378;   /* Teal container */
--color-secondary-mint: #5EEAD4;      /* Mint sáng điểm nhấn, focus ring, progress */
--color-soft-mint: #CCFBF1;           /* Mint nhạt cho nền chip, badge, hover row */

/* Surfaces & Layout */
--color-canvas-bg: #F7FAFA;           /* Nền trang Admin dịu mắt */
--color-sidebar-bg: #F2FAF8;          /* Nền Sidebar ánh Teal nhẹ nhàng */
--color-surface: #FFFFFF;             /* Nền Card, Modal, Table */
--color-border: #E2EDEB;              /* Viền chia cắt tinh tế, độ tương phản mềm */

/* Typography */
--color-text-primary: #1F2937;        /* Màu chữ chính (Slate tối, không chói) */
--color-text-secondary: #64748B;      /* Màu chữ phụ, chú thích */
--color-text-muted: #94A3B8;          /* Màu placeholder, nhãn mờ */

/* Semantic Status */
--color-success: #10B981;             /* Hoạt động, Đã xác minh, Ghi có thành công */
--color-success-bg: #ECFDF5;
--color-warning: #F59E0B;             /* Chờ duyệt, Tạm giữ, Cần đối soát */
--color-warning-bg: #FFFBEB;
--color-danger: #EF4444;              /* Bị khóa, Từ chối, Lỗi webhook */
--color-danger-bg: #FEF2F2;
--color-info: #0EA5E9;                /* Thông tin, Đang xử lý */
--color-info-bg: #F0F9FF;
```

---

## III. NGUYÊN TẮC ÁP DỤNG VÀO HỆ THỐNG HIỆN HỮU

1. **Bảo toàn 100% logic nghiệp vụ:** Sử dụng đúng các API endpoints, React Query keys, Zustand stores hiện có.
2. **Không phá vỡ giao diện Student/Teacher/Sponsor:** Áp dụng scoped Mint/Teal theme riêng cho phân hệ Admin thông qua dedicated `AdminLayout` và Ant Design nested `ConfigProvider`.
3. **User Detail Modal:** Thay thế hoàn toàn Drawer bên phải bằng centered Modal với bề rộng 820px, bo góc 20px, backdrop mờ và hỗ trợ phím Esc.
