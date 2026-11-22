# KẾT QUẢ KIỂM THỬ HỒI QUY — REGRESSION RESULTS
**Task ID:** EDUNITY-ADMIN-FINANCE-OVERVIEW-V2  
**Thời gian:** 20/11/2026  
**Phụ trách:** Tín — Finance QA Lead  

---

## 1. Kết quả Bộ Kiểm thử Backend Jest Mới (`tests/adminFinanceAnalytics.test.js`)
Lệnh chạy: `npx jest tests/adminFinanceAnalytics.test.js --runInBand --forceExit`  
**Kết quả:** PASS (7/7 tests passed, 0 failures)  
**Thời gian:** 24.289 s  

### Chi tiết các ca kiểm thử:
1. `√ 1. Returns structured analytics response with 6 KPI cards and metadata (2705 ms)`: Xác thực API trả về đầy đủ metadata kỳ lọc, 6 thẻ KPI định dạng tiền tệ VND, không phát sinh lỗi.
2. `√ 2. Correct ICT (UTC+7) period boundaries for today, yesterday, 3d, 7d, 30d (2724 ms)`: Xác thực đúng ranh giới thời gian nửa mở `[fromUtc, toUtc)` theo giờ Việt Nam, chia 24 bucket giờ cho `today`/`yesterday` và số bucket ngày tương ứng cho `3d`, `7d`, `30d`.
3. `√ 3. Custom date range filter parses boundaries properly (341 ms)`: Xác thực lọc khoảng ngày tùy chọn `from` - `to` chuyển đổi chính xác sang UTC.
4. `√ 4. Fund structure donut separates tuition and donation without double counting (371 ms)`: Xác thực tổng dòng tiền vào bằng đúng tổng các nguồn thu cấu thành, tỷ lệ % đạt 100%.
5. `√ 5. Reconciliation distribution reflects real PaymentReconciliation counts (414 ms)`: Xác thực tổng số lượng phân bố các trạng thái đối soát bằng đúng tổng số lượng bản ghi trong database (3 bản ghi).
6. `√ 6. Operations summary provides clean Vietnamese status without raw worker jargon (116 ms)`: Xác thực thông tin vận hành 100% tiếng Việt, các trạng thái hợp lệ.
7. `√ 7. Read-only safety: Calling getFinanceOverview does NOT mutate database (966 ms)`: Xác thực số lượng bản ghi trong các bảng `Transaction`, `PaymentReconciliation`, `RefundCase`, `TeacherEarning` trước và sau khi gọi API là hoàn toàn không đổi (bảo toàn 100% dữ liệu tài chính).

---

## 2. Kết quả Bộ Kiểm thử Hồi quy Sự vụ Tài chính Thực tế (`tests/tuitionReconciliationAdminRefund.test.js`)
Lệnh chạy: `npx jest tests/tuitionReconciliationAdminRefund.test.js --runInBand --forceExit`  
**Kết quả:** PASS (6/6 tests passed, 0 failures)  
**Thời gian:** 12.474 s  

### Chi tiết các bất biến tài chính:
1. `√ 1. Legitimate recovery invariant: Order 100000009 has Payment COMPLETED & Enrollment CONFIRMED (1539 ms)`: Giao dịch thật 3.000 VNĐ đã xác nhận ghi danh được bảo toàn nguyên vẹn.
2. `√ 2. Capacity invariant: Class enrolledCount is exactly 1 (442 ms)`: Sĩ số lớp học không bị ảnh hưởng.
3. `√ 3. Revenue invariant: Exactly ONE ENROLLMENT_PAYMENT Transaction and ONE TeacherEarning exist (840 ms)`: Không bị tính trùng doanh thu hoặc nhân bản thù lao.
4. `√ 4. Duplicate classification invariant: Order 100000008 has Enrollment EXPIRED & RefundCase in NEEDS_REVIEW (206 ms)`: Giao dịch chuyển khoản thừa 3.000 VNĐ giữ nguyên hồ sơ hoàn tiền `REF-20261120-F7304D` trạng thái `NEEDS_REVIEW`.
5. `√ 5. Service API check: listRefundCases returns the created refund case (111 ms)`: API quản lý hoàn tiền Admin hoạt động ổn định.
6. `√ 6. Student access check: getMyEnrollments returns confirmed class for student (252 ms)`: Học viên vẫn truy cập bình thường vào lớp học đã ghi danh.

---

## 3. Kết quả Kiểm thử Kiểm tra Kiểu Frontend (TypeScript Build)
Lệnh chạy: `cd FrontEnd; npm run build` (`tsc -b && vite build`)  
**Kết quả:** Đang đóng gói hoàn tất không lỗi kiểu dữ liệu.
