# EDUNITY V3 — ADMIN REFUND AUDIT
## Document 02: UI Redesign & Layout Streamlining

### 1. Loại bỏ Banner chính sách kỹ thuật
- **Nội dung bị loại bỏ:**
  - Banner `<Alert>` lớn: *"Chính sách kiểm soát tài chính & Nguyên tắc Bốn Mắt (Four-Eyes Principle)..."*.
  - Tiêu đề, icon, khoảng trống đệm dư thừa.
- **Tiêu đề trang mới:**
  - Tiêu đề: `Quản lý hoàn tiền`
  - Mô tả: `Theo dõi, xem xét và xử lý các hồ sơ hoàn tiền học phí và tài trợ.`

---

### 2. Tinh chỉnh bố cục bảng thành 6 cột chuẩn mực

Bảng trước đây có quá nhiều cột, làm co cụm thông tin ngân hàng và tràn ngang màn hình. Bố cục mới chuẩn hóa thành 6 cột:

| STT | Tên cột | Chi tiết hiển thị |
| :--- | :--- | :--- |
| **1** | **Mã hồ sơ** | Hiển thị mã gọn (ví dụ `REF-20261120-F7304D`), font mono, copyable, tag phân loại "Học phí" / "Tài trợ". Không bị vỡ dòng. |
| **2** | **Người nhận hoàn** | Họ tên người thụ hưởng in hoa đậm (`PHAM CONG TIN`). Dòng phụ hiển thị ngân hàng và số tài khoản che bớt (`MBBank • 7682••••1998`). Nếu chưa có: *"Chưa xác minh người nhận"*. |
| **3** | **Lý do hoàn tiền** | Tên ngắn gọn: *"Thanh toán trùng"*, *"Thanh toán trễ"*, *"Hủy lớp"*, *"Lý do khác"*. Không đưa văn bản dài vào bảng. |
| **4** | **Số tiền cần hoàn** | Căn phải (`text-right`), không xuống dòng (`whitespace-nowrap`), màu xanh ngọc nổi bật. Hiển thị đúng: `3.000 đ`. |
| **5** | **Trạng thái** | Tag màu tiếng Việt chuẩn mực: *"Chờ xem xét"*, *"Đang xem xét"*, *"Chờ chuyển tiền"*, *"Chờ xác minh hoàn tiền"*, *"Đã hoàn tất"*, *"Từ chối"*. |
| **6** | **Thao tác** | **CHỈ GIỮ DUY NHẤT 1 NÚT: [Chi tiết]**. Toàn bộ nút Duyệt / Từ chối / Nộp chứng từ được đưa vào trong modal. |

---

### 3. Tái thiết kế Modal "Chi tiết yêu cầu hoàn tiền"

Modal chi tiết được cấu trúc thành 5 phân khu thông tin rõ ràng:

1. **Phần 1 — Tổng quan**:
   - Header nổi bật với số tiền cần hoàn (`3.000 đ`), mã hồ sơ và nhãn trạng thái tiếng Việt.
2. **Phần 2 — Thông tin giao dịch gốc**:
   - Mã đơn thanh toán gốc (`100000008`), số tiền thực nhận (`3.000 đ`), ngày thanh toán, loại giao dịch, lớp học liên quan.
3. **Phần 3 — Người nhận hoàn tiền**:
   - Họ tên người nhận, ngân hàng thụ hưởng, số tài khoản che bảo mật (`7682••••1998`), trạng thái xác minh tài khoản.
4. **Phần 4 — Kết quả kiểm tra (Tài chính)**:
   - Đối chiếu 4 chỉ số tài chính: Số tiền đề nghị hoàn (`3.000 đ`), Số tiền đủ điều kiện (`3.000 đ`), Số tiền đã phê duyệt, Số tiền đã thực hoàn.
   - Hiển thị thông báo lý do nếu số tiền đủ điều kiện bằng 0.
5. **Phần 5 — Lịch sử xử lý**:
   - Timeline tiếng Việt ghi nhận chi tiết các bước: Tạo yêu cầu, Tiếp nhận xem xét, Phê duyệt, Nộp chứng từ, Xác minh hoàn tất, kèm vai trò (Quản trị viên / Hệ thống) và dấu thời gian.

#### Nút thao tác dưới chân Modal (Footer Actions):
- **Trạng thái Chờ xem xét (`NEEDS_REVIEW` / `IN_REVIEW`)**:
  - `[Duyệt hoàn tiền]` (Màu xanh ngọc Teal)
  - `[Từ chối]` (Màu đỏ Danger)
  - `[Đóng]`
- **Trạng thái Chờ chuyển tiền (`APPROVED` / `PENDING_BANK_TRANSFER`)**:
  - `[Nộp chứng từ chuyển tiền]` (Màu cam Amber)
  - `[Đóng]`
- **Trạng thái Chờ xác minh (`AWAITING_BANK_VERIFICATION`)**:
  - `[Xác minh hoàn tiền (Four-Eyes)]` (Màu tím Purple)
  - `[Đóng]`
- **Trạng thái Đã hoàn tất (`COMPLETED`) hoặc Từ chối (`REJECTED`)**:
  - `[Đóng]` (Chế độ chỉ xem)
