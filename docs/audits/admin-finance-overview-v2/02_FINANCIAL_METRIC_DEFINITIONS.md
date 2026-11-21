# ĐỊNH NGHĨA CHỈ SỐ TÀI CHÍNH — FINANCIAL METRIC DEFINITIONS
**Task ID:** EDUNITY-ADMIN-FINANCE-OVERVIEW-V2  
**Hệ thống:** EDUNITY V3 Financial Ledger  

---

## 1. Nguyên tắc Kế toán Cốt lõi (FIN-16, BR-34)
1. **RECEIPT ≠ REVENUE:**  
   Khoản tiền người dùng nạp vào hoặc chuyển khoản muộn/thừa (`UNAPPLIED_TUITION_RECEIPT`) là **nợ phải trả**, không được ghi nhận vào doanh thu học phí khả dụng cho đến khi được phân bổ hợp lệ vào một lượt ghi danh có hiệu lực.
2. **TÁCH BIỆT NGUỒN TIỀN (RESTRICTED FUNDS):**  
   Quỹ tài trợ học bổng (`SPONSOR_CONTRIBUTION`) là nguồn tiền tài trợ có ràng buộc phục vụ trao học bổng, được hạch toán riêng biệt, **tuyệt đối không gộp chung vào doanh thu học phí** hay lợi nhuận hoạt động nền tảng.
3. **CHỐNG TÍNH TRÙNG (NO DOUBLE-COUNTING):**  
   Không được cộng dồn số liệu từ bảng `Payment` (Payment Intent) và bảng `Transaction` (Financial Ledger) của cùng một giao dịch. Sổ cái `Transaction` là nguồn dữ liệu chân lý duy nhất (Single Source of Truth) cho các khoản thu/chi đã xác thực.

---

## 2. Định nghĩa 6 Thẻ KPI Tài chính (Period-based & Snapshot)

### KPI 1: Doanh thu Học phí (Tuition Revenue)
- **Bản chất:** Chỉ số theo kỳ (Period Metric).
- **Nguồn dữ liệu:** `Transaction` với điều kiện:
  ```javascript
  {
    transactionType: "ENROLLMENT_PAYMENT",
    status: "COMPLETED",
    createdAt: { $gte: fromUtc, $lt: toUtc }
  }
  ```
- **So sánh kỳ trước:** So sánh với khoảng thời gian liền kề trước đó có cùng độ dài `[prevFromUtc, prevToUtc)`. Nếu kỳ trước bằng 0, hiển thị "Không có dữ liệu kỳ trước".
- **Không bao gồm:** Pending Payment, Unapplied Receipts, Donation, Refund.

### KPI 2: Quỹ Tài trợ Học bổng (Donation Fund)
- **Bản chất:** Chỉ số theo kỳ (Period Metric).
- **Nguồn dữ liệu:** `Transaction` với điều kiện:
  ```javascript
  {
    transactionType: "SPONSOR_CONTRIBUTION",
    status: "COMPLETED",
    createdAt: { $gte: fromUtc, $lt: toUtc }
  }
  ```
- **So sánh kỳ trước:** Tính % biến động theo kỳ tương đương trước đó.

### KPI 3: Khoản cần Đối soát (Items Requiring Reconciliation)
- **Bản chất:** Chỉ số thời điểm thực (Snapshot Metric as-of-now).
- **Nguồn dữ liệu:** `PaymentReconciliation` với điều kiện:
  ```javascript
  {
    status: { $in: ["NEEDS_REVIEW", "IN_REVIEW"] }
  }
  ```
- **Ý nghĩa:** Số lượng sự vụ và tổng số tiền đang chờ Admin can thiệp hoặc xử lý bất thường (sai lệch số tiền, sai tài khoản thụ hưởng, thanh toán muộn).

### KPI 4: Nghĩa vụ Hoàn tiền (Pending Refund Liability)
- **Bản chất:** Chỉ số thời điểm thực (Snapshot Metric as-of-now).
- **Nguồn dữ liệu:** `Transaction` với điều kiện:
  ```javascript
  {
    transactionType: "REFUND",
    status: "PENDING"
  }
  ```
  Và số lượng hồ sơ từ `RefundCase` với `status: { $in: ["NEEDS_REVIEW", "IN_REVIEW", "APPROVED", "PENDING_BANK_TRANSFER", "AWAITING_BANK_VERIFICATION"] }`.
- **Ý nghĩa:** Nghĩa vụ tài chính phải hoàn trả lại cho học viên/Mạnh Thường Quân do thanh toán thừa hoặc sự cố hủy lớp.

### KPI 5: Thù lao Giáo viên Chờ Chi trả (Pending Teacher Remuneration)
- **Bản chất:** Chỉ số thời điểm thực (Snapshot Metric as-of-now).
- **Nguồn dữ liệu:** `TeacherEarning` với điều kiện:
  - Tạm giữ (Chờ lớp hoàn thành): `status: "PENDING"`
  - Khả dụng rút (Đã đủ điều kiện): `status: "AVAILABLE"`
- **Ý nghĩa:** Tổng nghĩa vụ thù lao giáo viên mà nền tảng đang nắm giữ chưa giải ngân.

### KPI 6: Đã Chi trả Giáo viên (Teacher Remuneration Disbursed)
- **Bản chất:** Chỉ số theo kỳ (Period Metric).
- **Nguồn dữ liệu:** `Transaction` với điều kiện:
  ```javascript
  {
    transactionType: "TEACHER_PAYOUT",
    status: "COMPLETED",
    createdAt: { $gte: fromUtc, $lt: toUtc }
  }
  ```
- **Ý nghĩa:** Số tiền thù lao thực tế đã giải ngân thành công qua ngân hàng cho giáo viên trong khoảng thời gian được lọc.

---

## 3. Quy chuẩn Tính toán Tỷ lệ Tăng trưởng (Delta Comparison)
- Độ dài kỳ so sánh: Bằng đúng khoảng thời gian được chọn `(toUtc - fromUtc)`.
- Công thức: `Delta % = ((Current - Previous) / Previous) * 100`.
- Ràng buộc an toàn:
  - Khi `Previous === 0`: Không chia cho 0, hiển thị `deltaPercent: null`, nhãn "Không có dữ liệu kỳ trước".
  - Khi `Previous > 0`: Làm tròn 1 chữ số thập phân, định dạng tiếng Việt.
