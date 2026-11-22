# 02. PHÂN TÍCH LUỒNG NGHIỆP VỤ ĐỐI SOÁT (WORKFLOW ANALYSIS)

## 1. Vòng đời của một Hồ sơ Đối soát (PaymentReconciliation Lifecycle)

```
[BankTransferEvent bất thường]
             │
             ▼
      (NEEDS_REVIEW) ──── "Cần xử lý"
             │
             │ [Admin bấm "Bắt đầu xử lý"]
             ▼
       (IN_REVIEW)   ──── "Đang xử lý"
             │
      ┌──────┴──────────────────────┬──────────────────────┐
      ▼                             ▼                      ▼
(RESOLVED_APPROVED)        (RESOLVED_REFUNDED)    (RESOLVED_IGNORED)
"Đã duyệt ghi danh"       "Đã lập hồ sơ hoàn tiền"     "Đã đóng"
      │                             │
[Kích hoạt khóa học]     [Tạo RefundCase nợ hoàn tiền]
                                    │
                         [Quy trình Hoàn tiền riêng]
```

## 2. Ranh giới giữa Đối soát (Reconciliation) và Hoàn tiền (Refund)
- **Hàng đợi đối soát (PaymentReconciliation)**:
  * Trách nhiệm: Xác minh nguyên nhân phát sinh sai lệch (đến muộn, tài khoản không khớp, sai lệch số tiền, trùng lặp).
  * Điểm dừng: Khi Admin đưa ra kết luận:
    a) Chấp nhận ghi danh (RESOLVED_APPROVED), hoặc
    b) Phân loại là khoản nộp thừa/sai lệch cần hoàn trả (RESOLVED_REFUNDED), hoặc
    c) Bỏ qua/đóng hồ sơ (RESOLVED_IGNORED).
- **Quản lý hoàn tiền (RefundCase)**:
  * Trách nhiệm: Quản lý nghĩa vụ nợ hoàn tiền, thông tin tài khoản thụ hưởng của học viên, và xác nhận ủy nhiệm chi ngân hàng thực tế.
  * Khi Reconciliation chuyển sang `RESOLVED_REFUNDED`, hồ sơ đối soát KẾT THÚC, nhưng nghĩa vụ hoàn tiền mới BẮT ĐẦU. Tiền chưa rời khỏi tài khoản ngân hàng của nền tảng EDUNITY cho đến khi kế toán xác nhận hoàn tất trong trang Quản lý hoàn tiền (`/admin/refunds`).

## 3. Phân tích nguyên nhân gốc lỗi phân công trên hồ sơ đã giải quyết (Incident Investigation)
- **Đơn hàng 100000009**:
  * Trạng thái thực tế: `RESOLVED_APPROVED` (lúc 14:03:50).
  * Lỗi xảy ra: 2 lần gọi API `assignReconciliation` lúc 21:27:07 và 21:27:28.
  * **Nguyên nhân gốc (Root Cause)**:
    1. UI Frontend `AdminReconciliationsPage.tsx` đặt nút `Tiếp nhận` ở cấp dòng (Row-level Action) cho mọi trạng thái mà không kiểm tra `record.status`.
    2. Backend `financeService.assignReconciliation` chỉ kiểm tra chuyển trạng thái `if (status === "NEEDS_REVIEW") status = "IN_REVIEW"`, hoàn toàn không có guard chặn các trạng thái `RESOLVED_*`.
    3. Không có cơ chế kiểm tra trùng lặp (Idempotency): Nếu hồ sơ đã gán cho Admin A, việc gán lại tiếp tục cho Admin A vẫn đẩy thêm một event `ASSIGNED` mới vào mảng `auditReferences`.
