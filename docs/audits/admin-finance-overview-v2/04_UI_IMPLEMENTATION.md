# TRIỂN KHAI GIAO DIỆN ADMIN FINANCE OVERVIEW V2
**Task ID:** EDUNITY-ADMIN-FINANCE-OVERVIEW-V2  
**Hệ thống:** EDUNITY Admin V3 Design System (Mint/Teal Palette)  
**Tác giả:** Tín — Senior UI/UX Dashboard Designer & Senior Frontend Engineer  

---

## 1. Danh sách Thành phần Giao diện Đã Triển khai
Toàn bộ mã nguồn giao diện được đặt tại `FrontEnd/src/features/admin/finance/`:

1. **`AdminFinanceOverviewPage.tsx` (Trang chính):**
   - Đã **XÓA HOÀN TOÀN** banner kỹ thuật: "Nguyên tắc an toàn sổ cái tài chính (FIN-16, BR-34)".
   - Đã **XÓA HOÀN TOÀN** section: "Lối tắt Quản trị Tài chính & Đối soát" (toàn bộ 3 thẻ lối tắt và container).
   - Tích hợp bộ quản lý state cho bộ lọc thời gian (`activePeriod` và `customRange`), tự động cập nhật cache key React Query (`financeKeys.overview(queryParams)`).
   - Cung cấp đầy đủ các trạng thái `isLoading`, `isError`, `isFetching` với khả năng làm mới một chạm.

2. **`components/FinanceTimeFilterBar.tsx` (Thanh Bộ lọc Thời gian):**
   - 6 nút chọn nhanh chuẩn thiết kế Mint/Teal: "Hôm nay", "Hôm qua", "3 ngày", "7 ngày" (mặc định), "30 ngày", "Tùy chọn".
   - Tích hợp `DatePicker.RangePicker` của Ant Design khi người dùng bấm chọn "Tùy chọn".
   - Nhãn hiển thị phạm vi ngày thực tế theo giờ Việt Nam (UTC+7).

3. **`components/FinanceKpiGrid.tsx` (6 Thẻ KPI Tài chính):**
   - 6 thẻ KPI chuyên nghiệp chuẩn màu Mint/Teal:
     1. Doanh thu Học phí (`tuitionRevenue`)
     2. Quỹ Tài trợ Học bổng (`donationRevenue`)
     3. Khoản cần Đối soát (`reconciliationPending`)
     4. Nghĩa vụ Hoàn tiền (`refundLiability`)
     5. Thù lao Giáo viên chờ chi trả (`teacherPendingPayout`)
     6. Đã chi trả Giáo viên (`teacherPaidOut`)
   - Huy hiệu so sánh % biến động so với kỳ trước (màu xanh lá cho xu hướng tăng, màu đỏ cho xu hướng giảm, hoặc nhãn "Không có dữ liệu kỳ trước").
   - Tooltip giải thích chi tiết ý nghĩa nghiệp vụ của từng chỉ số.

4. **`components/RevenueAreaChart.tsx` (Biểu đồ Doanh thu theo Thời gian):**
   - Biểu đồ diện tích (Area Chart) tương tác bằng vector SVG mượt mà, không phụ thuộc thư viện nặng.
   - Nút chuyển series: "Tất cả nguồn" | "Học phí" | "Tài trợ".
   - Hiệu ứng gradient fill mềm mại, đường lưới ngang, trục tọa độ VND và tooltip tương tác khi rê chuột.

5. **`components/TuitionDonationBarChart.tsx` (Biểu đồ So sánh Học phí và Tài trợ):**
   - Biểu đồ cột nhóm (Grouped Bar Chart) đặt cạnh nhau để đối chiếu trực tiếp giữa Học phí (#0D9488) và Tài trợ (#14B8A6).
   - Tooltip hiển thị số tiền chính xác định dạng VND.

6. **`components/FundStructureDonutChart.tsx` (Biểu đồ Cơ cấu Nguồn tiền Donut):**
   - Biểu đồ tròn Donut SVG thể hiện tỷ trọng dòng tiền vào giữa Học phí và Tài trợ học bổng.
   - Vùng trung tâm hiển thị "Tổng dòng tiền vào" chuẩn xác.

7. **`components/ReconciliationStatusChart.tsx` (Biểu đồ Tình trạng Đối soát):**
   - Thanh tiến độ nhiều phân đoạn và danh sách chi tiết các trạng thái đối soát: Cần kiểm tra, Đang kiểm tra, Đã đối soát, Đã hoàn tiền, Đã đóng.
   - Liên kết trực tiếp sang hàng đợi đối soát `/admin/reconciliations`.

8. **`components/RecentTransactionsTable.tsx` (Bảng Giao dịch Gần đây):**
   - Bảng nhật ký hiển thị 5–10 giao dịch mới nhất trong sổ cái.
   - Hiển thị số tiền theo quy chuẩn kế toán (`+` màu xanh lá cho dòng tiền vào, `-` màu đỏ cho dòng tiền ra).
   - Nút dẫn sang sổ cái toàn bộ giao dịch `/admin/transactions`.

9. **`components/FinanceOperationsCard.tsx` (Tổng quan Vận hành Tài chính):**
   - Thay thế các chỉ số kỹ thuật nặng nề bằng các thông tin vận hành thân thiện: Tình trạng đồng bộ giao dịch, Giao dịch đã xử lý, Hàng đợi chờ hạch toán, Hồ sơ hoàn tiền đang mở.
