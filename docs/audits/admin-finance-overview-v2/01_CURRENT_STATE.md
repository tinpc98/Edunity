# BÁO CÁO HIỆN TRẠNG TRƯỚC KHI NÂNG CẤP — ADMIN FINANCE OVERVIEW V2
**Task ID:** EDUNITY-ADMIN-FINANCE-OVERVIEW-V2  
**Thời gian kiểm tra:** 20/11/2026  
**Người thực hiện:** Tín — Senior Financial Systems Architect & Admin Finance UI Lead  

---

## 1. Hiện trạng Trang Admin Finance Overview Cũ
- **Route thực tế trong source:** `/admin/finance-overview` (được mount tại `FrontEnd/src/app/router.tsx` với đường dẫn con `finance-overview` trong nhánh `/admin`).
- **File giao diện:** `FrontEnd/src/features/admin/finance/AdminFinanceOverviewPage.tsx`.
- **Hạn chế của giao diện cũ:**
  1. Thiếu bộ lọc thời gian: Số liệu hiển thị chỉ là số cộng dồn toàn thời gian (All-time sum), không thể lọc theo Hôm nay, Hôm qua, 3 ngày, 7 ngày, 30 ngày hay Khoảng ngày tùy chọn.
  2. Thiếu biểu đồ trực quan: Không có biểu đồ doanh thu theo thời gian, không có biểu đồ so sánh học phí vs tài trợ, không có biểu đồ cơ cấu nguồn tiền, không có biểu đồ phân bố tình trạng đối soát.
  3. Tồn tại banner thừa: Banner lớn "Nguyên tắc an toàn sổ cái tài chính (FIN-16, BR-34)" chiếm diện tích và mang tính chất kỹ thuật.
  4. Tồn tại khu vực lối tắt: Section "Lối tắt Quản trị Tài chính & Đối soát" trùng lặp với menu thanh bên (Admin Sidebar).
  5. Thuật ngữ kỹ thuật tiếng Anh hiển thị trực tiếp cho Admin:
     - `Financial Outbox Worker`, `Webhooks`, `Ledger`, `Pending`, `Available`, `Paid Out`, `Idle`, `Retry`, `Backlog`, `Batch Size`, `Resolved Approved`, `Unapplied Tuition Receipt`.
  6. Khối thông tin Outbox Worker quá nặng về thông số nội bộ backend (chu kỳ quét 30 giây, batch size 25 sự kiện/tick, backlog, retry exhausted).

---

## 2. Hiện trạng API Backend
- **Endpoint hiện có:** `GET /api/admin/overview` (cùng các alias `GET /api/finance/admin/overview`, `GET /api/admin/finance/overview`).
- **Controller:** `BackEnd/src/controllers/financeController.js` (`exports.getFinanceOverview`).
- **Service:** `BackEnd/src/services/financeService.js` (`exports.getFinanceOverview`).
- **Hạn chế Backend hiện tại:**
  - Hàm `financeService.getFinanceOverview` chưa tiếp nhận và xử lý tham số lọc thời gian (`query`).
  - Chưa có pipeline tổng hợp chuỗi thời gian (time series) theo ngày/giờ.
  - Chưa có tính toán so sánh với kỳ trước (delta %) để phục vụ phân tích xu hướng tài chính.

---

## 3. Dữ liệu Tài chính Thực tế Trong Database
Qua kiểm tra trực tiếp MongoDB:
- `Transaction`: 171 bản ghi giao dịch thực tế trong sổ cái tài chính append-only:
  - `ENROLLMENT_PAYMENT`: Doanh thu học phí từ các khóa học.
  - `SPONSOR_CONTRIBUTION`: Các khoản tài trợ học bổng từ Mạnh Thường Quân.
  - `SCHOLARSHIP_USAGE`: Các khoản sử dụng học bổng thanh toán khóa học.
  - `TEACHER_PAYOUT`: Các khoản giải ngân thù lao cho giáo viên.
  - `UNAPPLIED_TUITION_RECEIPT`: Khoản thu thừa 3.000 VNĐ đang tạm giữ.
  - `REFUND`: 1 khoản hoàn tiền 3.000 VNĐ đang ở trạng thái PENDING.
- `RefundCase`: 1 hồ sơ hoàn tiền thực tế `REF-20261120-F7304D` trạng thái `NEEDS_REVIEW`.
- `PaymentReconciliation`: 3 bản ghi đối soát thực tế.
- `TeacherEarning`: 146 bản ghi thù lao giáo viên.
- `Payout`: 2 bản ghi rút tiền giáo viên.

---

## 4. Kế hoạch Triển khai Nâng cấp
1. Xóa bỏ hoàn toàn banner FIN-16/BR-34 và section Lối tắt khỏi UI.
2. Thiết kế và triển khai bộ lọc thời gian: Hôm nay, Hôm qua, 3 ngày, 7 ngày (mặc định), 30 ngày, Tùy chọn (Date Range Picker) với ranh giới giờ Việt Nam (UTC+7).
3. Mở rộng Backend read-only Analytics API để tổng hợp dữ liệu theo chu kỳ, tính toán delta % so với kỳ trước, và bucket chuỗi thời gian.
4. Triển khai 6 Period-based KPI Cards chuẩn kế toán.
5. Triển khai 4 biểu đồ tương tác SVG: Doanh thu theo thời gian, So sánh học phí vs tài trợ, Cơ cấu nguồn tiền Donut, Tình trạng đối soát.
6. Triển khai Bảng giao dịch gần đây và Khối tổng quan vận hành tài chính thân thiện.
7. Việt hóa 100% giao diện với bảng màu Mint/Teal chuẩn EDUNITY Admin V3.
