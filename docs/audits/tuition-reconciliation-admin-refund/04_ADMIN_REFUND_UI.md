# EDUNITY V3 — AUDIT 04: ADMIN FINANCE REFUND MANAGEMENT UI

## 1. Thiết Kế Giao Diện Theo Chuẩn Mint/Teal (EDUNITY V3 Design System)
Trang Quản lý Hoàn tiền An toàn (`FrontEnd/src/features/admin/finance/AdminRefundsPage.tsx`) được đồng bộ toàn diện theo ngôn ngữ thiết kế Mint/Teal của Admin EDUNITY V3:
- **Tone màu chủ đạo**: Deep Mint/Teal (`#0D9488`, `#0F766E`, `#163B40`), bề mặt nền ngọc nhạt (`#F0FDFA`, `#E5F5F1`), viền sắc nét (`#D6E5E2`, `#CCFBF1`).
- **Thành phần kiến trúc chuẩn hóa**:
  - `AdminPageHeader`: Hiển thị eyebrow "TÀI CHÍNH & ĐỐI SOÁT", icon `AuditOutlined`, tiêu đề trang "Quản Lý Hoàn Tiền An Toàn (Safe Refund Engine)", và nút làm mới dữ liệu realtime.
  - `AdminSectionCard`: Đóng gói bộ lọc tìm kiếm và bảng dữ liệu với viền bo tròn 16px, shadow dịu mắt.
  - KPI Summary Cards: 4 khối thống kê nhanh trực quan (Chờ xem xét, Chờ chuyển khoản, Chờ xác minh 4-Eyes, Đã hoàn tất).
  - Cảnh báo chính sách (Policy Alert Banner): Nhấn mạnh nguyên tắc kiểm soát tài chính và Four-Eyes Principle.

## 2. Bảng Hàng Đợi Hoàn Tiền (Refund Queue Table)
Bảng dữ liệu cung cấp đầy đủ các cột nghiệp vụ thiết yếu:
1. **Mã hồ sơ**: Mã định danh duy nhất (VD: `REF-20261120-F7304D`) kèm nút copy 1-click và nhãn phân loại mục đích (*Học phí* / *Tài trợ*).
2. **Lý do hoàn tiền**: Tên lý do chuẩn hóa (VD: *Thanh toán trùng / thừa*) kèm đoạn mô tả chi tiết nguồn gốc sự cố.
3. **Số tiền đủ điều kiện**: Hiển thị số tiền tối đa được phép hoàn với định dạng VND nổi bật.
4. **Số tiền duyệt**: Số tiền thực tế được Admin cấp phép chi hoàn.
5. **Tài khoản thụ hưởng**: Thẻ hiển thị rõ tên ngân hàng, số tài khoản (monospaced), và tên chủ tài khoản in hoa.
6. **Trạng thái**: Tag màu sắc ngữ nghĩa tương ứng với 8 trạng thái vòng đời hoàn tiền.
7. **Thao tác (Actions)**:
   - Nút **Chi tiết** (`EyeOutlined`): Mở Modal chi tiết toàn diện.
   - Nút **Duyệt** (`CheckCircleOutlined`): Mở form duyệt số tiền hoàn (áp dụng khi `NEEDS_REVIEW` hoặc `IN_REVIEW`).
   - Nút **Từ chối** (`CloseCircleOutlined`): Mở form nhập lý do từ chối.
   - Nút **Nộp chứng từ** (`UploadOutlined`): Mở form nhập mã giao dịch ngân hàng thực tế (bắt buộc `bankReference`).
   - Nút **Xác minh (4-Eyes)** (`SafetyCertificateOutlined`): Mở form xác minh độc lập dành cho Admin thứ hai.

## 3. Modal Chi Tiết Hồ Sơ (Full Case Details Modal)
Modal hiển thị chuyên sâu bao gồm:
- **Thông tin tài chính**: Số tiền gốc, số tiền đủ điều kiện, số tiền đã duyệt, phương thức chi trả.
- **Thẻ ngân hàng người nhận**: Ngân hàng, số tài khoản, tên chủ tài khoản.
- **Lý do & Chi tiết**: Diễn giải nguyên nhân hoàn tiền do thanh toán trùng lặp.
- **Chứng từ ngân hàng**: Mã GD đối chiếu ngân hàng (Bank Reference), ủy nhiệm chi, thời gian nộp.
- **Nhật ký kiểm toán (Audit Trail)**: Dòng thời gian hiển thị từng hành động, vai trò người thực hiện và mốc thời gian ISO.

## 4. Kiểm Soát Quy Trình An Toàn (Safe Refund Workflow)
1. **Kiểm soát số tiền duyệt**: Cấm duyệt số tiền lớn hơn số tiền đủ điều kiện (`eligibleAmount`).
2. **Bắt buộc mã giao dịch ngân hàng**: Không thể chuyển trạng thái hoàn tất nếu chưa có mã giao dịch thực tế từ ngân hàng.
3. **Nguyên tắc Bốn Mắt (Four-Eyes Principle)**: Admin nộp chứng từ và Admin xác minh hoàn tất bắt buộc phải là 2 cá nhân quản trị viên khác nhau (được thực thi nghiêm ngặt tại Backend `verifyAndCompleteRefund`).
