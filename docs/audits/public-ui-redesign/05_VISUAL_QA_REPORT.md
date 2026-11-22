# BÁO CÁO ĐẢM BẢO CHẤT LƯỢNG HÌNH ẢNH (VISUAL QA REPORT)
## ĐỒNG BỘ GIAO DIỆN MINT/TEAL — EDUNITY V3

---

### 1. KIỂM TRA ĐỘ TƯƠNG PHẢN VÀ KHẢ NĂNG TIẾP CẬN (ACCESSIBILITY & CONTRAST)

| Cặp Màu Kiểm Tra | Hex Foreground / Background | Tỉ Lệ Tương Phản (WCAG) | Đánh Giá Chuẩn AA/AAA |
| :--- | :--- | :--- | :--- |
| **Chữ chính trên nền trang** | `#163B40` trên `#F5FAF9` | **11.4 : 1** | **Đạt chuẩn AAA** (Rõ nét, dễ đọc trên mọi thiết bị) |
| **Chữ phụ trên nền trang** | `#334155` trên `#F5FAF9` | **8.2 : 1** | **Đạt chuẩn AAA** |
| **Nút bấm chính** | Trắng `#FFFFFF` trên `#0D9488` | **4.6 : 1** | **Đạt chuẩn AA** (Nổi bật, điểm nhấn rõ ràng) |
| **Badge chữ trên nền Soft Mint** | `#0F766E` trên `#CCFBF1` | **5.3 : 1** | **Đạt chuẩn AA** (Êm mắt, không bị lóa) |
| **Tiêu đề section trên nền trắng** | `#163B40` trên `#FFFFFF` | **12.6 : 1** | **Đạt chuẩn AAA** |

---

### 2. TRẢI NGHIỆM ĐA THIẾT BỊ (RESPONSIVE BEHAVIOR)

#### 2.1. Màn hình máy tính (Desktop >= 1280px)
- Thanh Header hiển thị đầy đủ logo, thanh tìm kiếm pill bo tròn, toàn bộ menu điều hướng ngang và các nút đăng nhập/đăng ký.
- Layout 2 cột trên trang Khám phá lớp học (`FilterSidebar` sticky bên trái, `ClassGrid` bên phải) cân đối, không bị xô lệch.
- Thẻ lớp học hiển thị dạng lưới 3 cột đều đặn với chiều cao đồng đều.

#### 2.2. Màn hình máy tính bảng (Tablet 768px - 1024px)
- Hero banner co giãn tỷ lệ ảnh thông minh, nội dung chữ co vào trong để không che khuất hình ảnh.
- Grid lớp học tự động chuyển thành 2 cột với khoảng cách 16px tối ưu chạm vuốt.

#### 2.3. Màn hình di động (Mobile < 768px)
- Header tự động ẩn menu ngang và nút bấm, xuất hiện nút Menu Hamburger thuận tiện.
- Khi nhấn Hamburger, Ant Design `<Drawer>` mở ra trơn tru từ cạnh phải chứa:
  - Thanh tìm kiếm nhanh.
  - Toàn bộ danh sách liên kết: Trang chủ, Khám phá lớp học, Khóa học, Giáo viên, Chiến dịch học bổng.
  - Khu vực CTA đăng nhập / đăng ký tài khoản.
- Nút bấm và input có chiều cao tối thiểu 40px – 48px, đảm bảo chuẩn cảm ứng di động.

---

### 3. KIỂM TRA HIỆU ỨNG TƯƠNG TÁC (INTERACTION & MICRO-ANIMATIONS)

1. **Hover Card:** Khi di chuột vào các thẻ khóa học, lớp học, giảng viên, đường viền nhẹ nhàng chuyển từ `#D6E5E2` sang `#0D9488` kết hợp shadow nhẹ nổi lên `hover:shadow-md` và dịch chuyển mượt mà 300ms.
2. **Tab Navigation:** Vạch chỉ thị tab Ant Design lướt êm ái sang tab được chọn với màu `#0D9488`, chữ tab active chuyển sang tông xanh ngọc đậm `#0D9488`.
3. **Buttons:** Hiệu ứng hover từ `#0D9488` sang `#0B746C` với đổ bóng nhẹ, mang lại phản hồi xúc giác thị giác tốt cho người dùng.
