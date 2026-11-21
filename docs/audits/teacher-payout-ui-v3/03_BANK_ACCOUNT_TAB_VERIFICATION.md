# EDUNITY V3 — ADMIN TEACHER PAYOUT UI AUDIT V3
## Document 03: Bank Account Verification Tab & Workflow

### 1. Mục tiêu Tab Tài khoản nhận tiền
Cung cấp cho Quản trị viên phân hệ chuyên trách để:
1. Kiểm tra thông tin ngân hàng giáo viên đăng ký nhận thù lao.
2. Đối soát họ tên chủ tài khoản với tên trên CCCD đã xác minh định danh (BAO-02 / BAO-09).
3. Phê duyệt hoặc từ chối có lý do cụ thể gửi thông báo trực tiếp đến giáo viên.
4. Quản lý trạng thái khóa rút tiền bảo vệ 72 giờ (`payoutLockedUntil`) khi có sự thay đổi thông tin số tài khoản.

---

### 2. Thiết kế giao diện Tab 2 (`AdminBankAccountsTab.tsx`)

#### A. Bộ lọc trạng thái & Tìm kiếm
- 4 Trạng thái:
  - **Chờ xác minh** (`PENDING_REVIEW` - Mặc định).
  - **Đã xác minh** (`VERIFIED`).
  - **Bị từ chối** (`REJECTED`).
  - **Tất cả** (`ALL`).
- Ô tìm kiếm theo tên giáo viên, email, tên ngân hàng hoặc tên chủ tài khoản.

#### B. Bảng dữ liệu tài khoản
Gồm 7 cột thông tin chuẩn mực:
1. **Giáo viên:** Tên giáo viên, email.
2. **Ngân hàng:** Tên ngân hàng nhận (Vietcombank, MB, Techcombank...).
3. **Số tài khoản:** Số tài khoản giải mã cho Admin kiểm tra đối chiếu.
4. **Chủ tài khoản / Tên CCCD:** Tên chủ tài khoản ngân hàng và họ tên trên căn cước công dân.
5. **Ngày đăng ký:** Định dạng ngày giờ chuẩn `DD/MM/YYYY HH:mm`.
6. **Trạng thái:** Tag hiển thị tiếng Việt rõ ràng (`Chờ xác minh`, `Đã xác minh`, `Bị từ chối`).
7. **Thao tác:**
   - Nút "Chi tiết": Mở Modal hiển thị toàn diện dữ liệu tài khoản, lịch sử duyệt, khóa bảo vệ.
   - Nút "Duyệt": Phê duyệt nhanh cho tài khoản đang ở trạng thái `PENDING_REVIEW`.
   - Nút "Từ chối": Mở Modal nhập lý do từ chối (bắt buộc).

#### C. Trạng thái rỗng (Empty State)
- Khi không có bản ghi nào chờ duyệt hoặc khớp bộ lọc, hiển thị Empty State gọn gàng:
  `"Không có tài khoản nào chờ xác minh."`
- Không chiếm khung trống cao 300px, không gây lộn xộn giao diện.

---

### 3. Tích hợp Backend API an toàn (Safe Read-Only API Extension)
- Mở rộng hàm `adminListBankAccounts` trong `BackEnd/src/services/teacherBankAccountService.js`:
  - Hỗ trợ `status === "ALL"` (lấy toàn bộ tài khoản có bất kỳ trạng thái nào).
  - Hỗ trợ tìm kiếm từ khóa `query.search` theo email, họ tên, ngân hàng.
  - Vẫn giữ nguyên quy tắc kiểm tra nghiêm ngặt: nếu status không nằm trong tập hợp hợp lệ thì ném lỗi `status is invalid`.
- Cập nhật service `FrontEnd/src/services/teacherBankAccount.service.ts`:
  - Hàm `adminList(status, page, pageSize, search)` hỗ trợ đầy đủ phân trang và tìm kiếm.
