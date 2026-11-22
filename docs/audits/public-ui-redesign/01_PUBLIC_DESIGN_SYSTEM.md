# HỆ THỐNG THIẾT KẾ GIAO DIỆN CÔNG CỘNG (PUBLIC DESIGN SYSTEM)
## ĐỒNG BỘ THƯƠNG HIỆU MINT / TEAL — EDUNITY V3

---

### 1. BẢNG MÀU CHỦ ĐẠO (COLOR TOKENS)

Hệ màu Mint/Teal được kế thừa từ chuẩn thiết kế Edunity Admin V3 kết hợp tông màu thân thiện cho nền tảng giáo dục mở:

| Token Name | Hex Code | Tác dụng | Phạm vi áp dụng |
| :--- | :--- | :--- | :--- |
| **Teal Primary** | `#0D9488` | Màu thương hiệu chính, CTA chính | Buttons, active links, progress bars, key accents |
| **Teal Dark** | `#0F766E` | Màu nhấn đậm, active text, badge text | Active nav, section tag text, headers |
| **Teal Hover** | `#0B746C` | Màu hover cho các nút chính | Button hover, CTA active interaction |
| **Teal Secondary** | `#14B8A6` | Màu phụ trợ, gradient accents | Header banners, gradient cards |
| **Soft Mint** | `#CCFBF1` | Màu nền badge, pill, highlight nhẹ | Active filter pills, verified badges, status tags |
| **Mint Surface** | `#F0FDFA` | Màu nền khối phụ, container menu | Mega menu active column, subtle card backgrounds |
| **Background Layout** | `#F5FAF9` | Màu nền toàn bộ website công cộng | `body`, `PublicLayout`, main content container |
| **Text Primary** | `#163B40` | Màu chữ chính với độ tương phản cao | Headings, card titles, table text, important labels |
| **Text Secondary** | `#334155` / `#64748B` | Màu chữ phụ, mô tả | Subtitles, meta info, teacher roles |
| **Border Soft** | `#D6E5E2` | Đường viền card, bảng và ngăn cách | Cards, inputs, tables, dividers |

---

### 2. CẤU TRÚC THEME ANTD VÀ TAILWIND

- **File cấu hình Ant Design Public Theme:** `FrontEnd/src/components/layout/publicTheme.ts`
  - `colorPrimary`: `#0D9488`
  - `colorLink`: `#0D9488`
  - `colorLinkHover`: `#0F766E`
  - `colorTextBase`: `#163B40`
  - `colorBorder`: `#D6E5E2`
  - `colorBgLayout`: `#F5FAF9`
  - Tùy biến chi tiết: Button, Card, Table, Modal, Tabs, Tag, Input, Select, Pagination, Progress.
- **Phạm vi cô lập:**
  - `PublicLayout.tsx` bọc toàn bộ Public routes bằng `<ConfigProvider theme={publicThemeConfig}>`.
  - Không ảnh hưởng đến các layout Dashboard nội bộ (`AdminLayout`, `StudentLayout`, `TeacherLayout`, `SponsorLayout`).

---

### 3. QUY CHUẨN TYPOGRAPHY VÀ CARD STYLES

1. **Card Layout:**
   - Bo góc chuẩn: `rounded-xl` (12px) hoặc `rounded-2xl` (16px).
   - Nền trắng `bg-white`, viền mảnh `border border-[#D6E5E2]`.
   - Hover effect: `hover:border-[#0D9488] hover:shadow-md transition-all duration-300`.
2. **Typography Hierarchy:**
   - H1/H2 Headings: font weight `font-extrabold` / `font-black`, color `#163B40`.
   - Section sub-labels: uppercase, font-bold, tracking-wider, color `#0F766E` kết hợp vạch chỉ thị `#0D9488`.
   - Body & descriptions: text size 12-14px, color `#334155` hoặc `#64748B`.
3. **Buttons & Interactive Elements:**
   - Primary Button: `bg-[#0D9488] hover:bg-[#0B746C] text-white shadow-xs rounded-lg`.
   - Ghost/Secondary Button: `border-[#99F6E4] text-[#0F766E] hover:bg-[#CCFBF1]`.
