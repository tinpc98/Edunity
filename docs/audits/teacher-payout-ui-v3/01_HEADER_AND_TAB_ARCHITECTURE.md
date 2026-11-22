# EDUNITY V3 — ADMIN TEACHER PAYOUT UI AUDIT V3
## Document 01: Header & Two-Tab Business Architecture

### 1. Hiện trạng trước khi cải tiến
1. **Khoảng trống đầu trang:** Không có tiêu đề trang chính thức (`AdminPageHeader`), xuất hiện khoảng trống lớn gây lãng phí diện tích hiển thị.
2. **Trộn lẫn hai nghiệp vụ khác nhau:**
   - Nghiệp vụ 1: Xét duyệt & xác minh tài khoản ngân hàng của giáo viên (KYC / Banking Verification).
   - Nghiệp vụ 2: Quản lý & chi trả thù lao giảng dạy (Payout Requests & Transfer Execution).
3. **Chiếm diện tích không cần thiết:** Khối "Tài khoản nhận tiền chờ duyệt" đặt ở đầu trang dù thực tế có 0 tài khoản chờ duyệt, hiển thị một khung trống cao gây đẩy toàn bộ bảng yêu cầu rút tiền xuống sâu.

---

### 2. Thiết kế kiến trúc 2 Tab nghiệp vụ độc lập
Trang `/admin/payouts` được tái cấu trúc thành 2 Tab rõ ràng:
- **Tiêu đề trang chuẩn Admin (`AdminPageHeader`):**
  - **Tiêu đề chính:** "Quản lý rút tiền giáo viên"
  - **Mô tả:** "Quản lý yêu cầu rút tiền, xác minh tài khoản nhận và theo dõi quá trình chi trả thù lao."
  - **Eyebrow:** "TÀI CHÍNH & ĐỐI SOÁT" (icon `<BankOutlined />`).
  - **Nút hành động góc phải:** "Quét đối soát (7 ngày)" kèm trạng thái loading xoay vòng khi kích hoạt mutation.

- **Tab 1: Yêu cầu rút tiền (`requests` - Mặc định):**
  - Chuyên biệt cho việc tiếp nhận, phê duyệt, lên lịch và xác nhận hoàn tất chuyển khoản thù lao cho giảng viên.
  - Không còn chứa khối tài khoản ngân hàng chờ duyệt ở phía trên.
  - Mặc định tải ngay khi Admin truy cập `/admin/payouts`.

- **Tab 2: Tài khoản nhận tiền (`bank-accounts`):**
  - Tách riêng toàn bộ quy trình kiểm tra và xác minh thông tin ngân hàng.
  - Huy hiệu số đếm thông minh: Hiển thị badge số lượng tài khoản đang chờ xác minh (`pendingBankCount`) lấy trực tiếp từ database thật (`teacherBankAccountService.adminList("PENDING_REVIEW")`). Nếu là 0, badge tự động ẩn để giữ giao diện tối giản.

---

### 3. Đồng bộ trạng thái URL (URL Query Parameter Sync)
- Sử dụng `useSearchParams` từ `react-router-dom`:
  - Mặc định: `/admin/payouts` (tương đương `tab=requests`).
  - Tab 2: `/admin/payouts?tab=bank-accounts`.
- **Lợi ích:**
  - Refresh trang (F5) không bao giờ bị mất tab đang chọn hoặc bị lỗi 404.
  - Nút Back / Forward trên trình duyệt hoạt động nhất quán.
  - Sidebar Admin luôn giữ trạng thái active chính xác.
  - Chuyển tab mượt mà không reload toàn bộ trang.
