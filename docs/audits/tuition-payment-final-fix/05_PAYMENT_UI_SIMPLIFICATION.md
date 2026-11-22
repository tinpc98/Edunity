# EDUNITY V3 — BÁO CÁO TỐI GIẢN GIAO DIỆN THANH TOÁN & THẺ ĐĂNG KÝ

**Mã tài liệu:** `docs/audits/tuition-payment-final-fix/05_PAYMENT_UI_SIMPLIFICATION.md`  
**Task ID:** `EDUNITY-TUITION-PAYMENT-FINAL-FIX`  
**Chủ trì:** Băng (Frontend/UI-UX Lead)  

---

## 1. MỤC TIÊU CẢI TIẾN

Giao diện popup thanh toán và thẻ đăng ký lớp học trước đây bị phản ánh là:
- Quá nhiều nút bấm trùng lặp gây rối mắt học viên.
- Hiển thị quá nhiều chi tiết kỹ thuật nội bộ (tên kênh TUITION, chuẩn Napas247, log kiểm tra 3s/lần, nút mở trang payOS ngoài).
- Popup kích thước quá dài, chiếm trọn màn hình.

**Yêu cầu cải tiến:**
1. Tối giản toàn bộ giao diện theo chuẩn phong cách Mint/Teal của EDUNITY V3.
2. Loại bỏ sạch sẽ các nhãn kỹ thuật không cần thiết đối với học sinh.
3. Giữ nguyên 100% cơ chế chạy ngầm của Payment Polling và Webhook Security.
4. Tối ưu kích thước popup trong khoảng 480px–520px gọn gàng, thân thiện.

---

## 2. BẢNG SO SÁNH TRƯỚC VÀ SAU CẢI TIẾN

### 2.1. Popup Thanh toán VietQR (`DirectTuitionPaymentModal.tsx` & `PaymentQrPanel.tsx`)

| Thành phần giao diện | Phiên bản cũ | Phiên bản tối giản mới |
| :--- | :--- | :--- |
| **Kích thước Popup** | Dài tràn màn hình (560px + padding lớn) | Gọn gàng **500px**, tối đa 85vh, có thanh cuộn mượt |
| **Nhãn Kênh Học Phí** | Tag lớn "KÊNH HỌC PHÍ (TUITION)" | **Đã xóa bỏ hoàn toàn** |
| **Nút mở payOS ngoài** | Nút "Mở trang cổng thanh toán payOS" | **Đã xóa bỏ** (chỉ tập trung quét mã VietQR) |
| **Giải thích chuẩn Napas** | Text kỹ thuật "Mã VietQR chuẩn EMVCo Napas247..." | **Đã xóa bỏ** |
| **Dòng log Polling** | Dòng text "Đang tự động kiểm tra trạng thái... (3 giây/lần)" | **Đã ẩn khỏi giao diện** (vẫn chạy ngầm 100%) |
| **Nút Kiểm tra ngay** | Nút thủ công "Kiểm tra ngay" | **Đã xóa bỏ** |
| **Bảo mật footer dài** | "Bảo mật bởi Unified Payment Engine • Không lưu thông tin..." | **Đã thay bằng thông báo ngắn thân thiện:** "Vui lòng chuyển đúng số tiền và nội dung để hệ thống xác nhận." |
| **Thông tin chuyển khoản** | Chia tách rời rạc, font chữ chưa nổi bật | Khối Card Bo tròn gọn gàng, có nút sao chép nhanh số tài khoản, số tiền và nội dung |
| **Tự động chuyển trang** | Không tự chuyển hoặc người dùng phải tự tìm đường | **Tự động điều hướng sau 1.5s** khi thanh toán xong kèm nút "Vào lớp học của tôi ngay" |

### 2.2. Thẻ Đăng ký Lớp học (`ClassRegistrationCard.tsx`)

| Trạng thái | Giao diện cũ (Trùng lặp CTAs) | Giao diện mới (Tinh gọn & Chuẩn mực) |
| :--- | :--- | :--- |
| **Đang giữ chỗ (`PENDING`)** | - Cùng lúc có nút "Thanh toán ngay" trong alert<br>- Nút "Xem đơn đăng ký"<br>- Nút "Hủy giữ chỗ"<br>- Nút to "Tiếp tục thanh toán học phí"<br>- Nút "Quản lý danh sách đơn giữ chỗ" | - Alert hiển thị: "Đang giữ chỗ · Còn lại 09:59"<br>- **Chỉ 1 nút Primary duy nhất:** **"Tiếp tục thanh toán"**<br>- Link nhỏ "Xem đơn đăng ký"<br>- Nút chữ nhỏ "Hủy giữ chỗ" có Popconfirm an toàn |
| **Đã ghi danh (`CONFIRMED`)** | Vẫn có thể sót nút thanh toán | Alert xanh lá thành công + **Chỉ 1 nút:** **"Vào lớp học của tôi"** |
| **Hết hạn (`EXPIRED`)** | Dễ gây hiểu lầm đơn vẫn còn giữ chỗ | Alert thông báo đơn đã hết hạn + Nút **"Đăng ký lại"** (nếu lớp còn chỗ) |

---

## 3. THIẾT KẾ MÀU SẮC & CONTRAST (MINT/TEAL THEME)

- **Màu chủ đạo (Primary Teal):** `#0D9488` (Teal 600) và Hover `#0B746C` (Teal 700).
- **Màu nền phụ:** Slate 50 (`#F8FAFC`) và Teal 50 (`#F0FDFA`).
- **Khung viền:** Border xám ngọc `#D6E5E2` tinh tế, bóng đổ nhẹ `shadow-xs`.
- **Mã QR:** Nằm chính giữa khung trắng nổi bật kích thước chuẩn 220px, viền bo góc nhẹ nhàng, độ tương phản cao, điện thoại quét tức thì từ khoảng cách 1 mét.
