# 06. KẾT QUẢ KIỂM THỬ HỒI QUY (REGRESSION RESULTS)

## 1. Kết Quả Kiểm Thử Backend (Jest Suite)

### Suite 1: `BackEnd/tests/adminReconciliationQueueV2.test.js`
- **Kết quả**: 8/8 tests PASS (Thời gian: 8.78s)
  1. `Tab filtering correctly separates NEEDS_REVIEW, IN_REVIEW, RESOLVED, and ALL`: PASS
  2. `Accept NEEDS_REVIEW transitions status to IN_REVIEW and logs ASSIGNED event`: PASS
  3. `Duplicate assignment to the same admin without note is idempotent and adds no audit events`: PASS
  4. `Assign or accept on a RESOLVED reconciliation throws HTTP 409`: PASS
  5. `Assignment to non-admin user throws validation error`: PASS
  6. `Adding note records audit event without mutating Payment, Enrollment, or RefundCase`: PASS
  7. `OrderCode 100000008 reconciliation links to existing RefundCase without closing refund`: PASS
  8. `OrderCode 100000009 reconciliation is RESOLVED_APPROVED and read-only`: PASS

### Suite 2: `BackEnd/tests/adminFinanceAnalytics.test.js`
- **Kết quả**: 8/8 tests PASS (Thời gian: 8.24s)
  - Bảo đảm phân phối trạng thái giao dịch, doanh thu thực tế và chỉ số KPI tài chính không bị xáo trộn.

### Suite 3: `BackEnd/tests/tuitionReconciliationAdminRefund.test.js`
- **Kết quả**: 6/6 tests PASS (Thời gian: 17.16s)
  - Bảo đảm quy trình đối soát kép và lập hồ sơ hoàn tiền của đơn 100000008 và 100000009 hoạt động đúng chuẩn.

**Tổng cộng kiểm thử Backend**: **22/22 tests PASS (100%)**.

## 2. Kết Quả Kiểm Thử Frontend

### A. Linter (`npm run lint` - oxlint)
- **Kết quả**: 0 errors, 9 warnings (chỉ là các cảnh báo tối ưu memoization sẵn có từ trước của React Compiler).
- Không có lỗi cú pháp hoặc lỗi kiểu dữ liệu.

### B. Typecheck & Production Build (`npm run build` - tsc -b && vite build)
- **Kết quả**: Code exit 0.
- 3,403 modules được transform thành công.
- Thời gian build: 6.60s.

## 3. Kiểm Thử Giao Diện Đáp Ứng (Responsive Visual QA)
- **1920px (Desktop màn hình rộng)**: Các tab và bảng hiển thị cân đối, cột số tiền và trạng thái căn chỉnh rõ ràng.
- **1440px & 1366px (Laptop chuẩn)**: Không có hiện tượng chữ bị cắt cụt, thanh filter 4 cột co giãn mượt mà.
- **1024px (Tablet ngang)**: Bảng vừa vặn trong màn hình, các badge trạng thái hiển thị đầy đủ.
- **768px & 375px (Mobile & Tablet dọc)**: Bảng kích hoạt cuộn ngang có kiểm soát (`scroll={{ x: 1040 }}`), không tràn màn hình, Modal chi tiết tự động co giãn 95vw giúp thao tác dễ dàng.
