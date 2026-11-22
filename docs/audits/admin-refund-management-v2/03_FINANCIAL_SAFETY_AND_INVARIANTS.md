# EDUNITY V3 — ADMIN REFUND AUDIT
## Document 03: Financial Safety & Invariant Guarantees

### 1. Cam kết an toàn tài chính (Financial Safety Rules)

Việc tái cấu trúc giao diện chỉ tinh gọn phần hiển thị, tuyệt đối không làm suy giảm hoặc nới lỏng các chốt chặn kiểm soát tài chính phía Backend:

1. **Nguyên tắc Bốn Mắt (Four-Eyes Principle) vẫn được bảo toàn 100%:**
   - Sau khi một quản trị viên nộp chứng từ chuyển tiền (`submitRefundProof`), hồ sơ chuyển sang trạng thái `AWAITING_BANK_VERIFICATION`.
   - Backend bắt buộc một quản trị viên thứ hai (khác với người nộp chứng từ nếu bật `enforceDifferentAdmin`) thực hiện đối chiếu sao kê và bấm xác minh hoàn tất (`verifyAndCompleteRefund`).
2. **Khóa giới hạn số tiền phê duyệt:**
   - Backend `approveRefundCase` kiểm tra chặt chẽ: `approvedAmount <= eligibleAmount`.
   - Nếu Admin cố tình gửi số tiền duyệt vượt quá số tiền đủ điều kiện, backend lập tức từ chối với mã lỗi `INVALID_APPROVED_AMOUNT` (HTTP 400).
3. **Bảo vệ nghĩa vụ nợ hoàn tiền (Refund Liability):**
   - Không cho phép phê duyệt trùng lặp hoặc tạo nhiều hồ sơ hoàn tiền cho cùng một giao dịch gốc.
   - Giao dịch nợ hoàn tiền (`obligationTransactionId`) được ghi nhận chuẩn mực trong Sổ cái tài chính (`Transaction`).

---

### 2. Bảo toàn các thực thể trọng yếu (Order 100000008 & Order 100000009)

- **Order 100000008 (Vụ việc chuyển dư học phí 3.000đ):**
  - Trạng thái thanh toán: `COMPLETED`.
  - Trạng thái đối soát: `NEEDS_REVIEW` (Lệch giao dịch: `OVERPAYMENT_EXCESS`).
  - Hồ sơ hoàn tiền: `REF-20261120-F7304D` với `eligibleAmount: 3000` VNĐ ở trạng thái `NEEDS_REVIEW`, chờ xử lý thủ công có kiểm soát.
  - Tuyệt đối không tự động trích tiền ngân hàng hoặc tạo giao dịch chi giả mạo.
- **Order 100000009 (Đơn thanh toán ghi danh thành công):**
  - Trạng thái thanh toán: `COMPLETED`.
  - Trạng thái ghi danh học viên: `ENROLLED`.
  - Không bị ảnh hưởng bởi bất kỳ thao tác nào của module hoàn tiền.
