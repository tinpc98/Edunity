# EDUNITY V3 — SECURITY & FINANCIAL REGRESSION VERIFICATION
**Task ID:** EDUNITY-V3-SOFT-DELETE-ARCHITECTURE-V1  
**Date:** 2026-11-20  
**Branch:** feature/teacher-admin  
**Role:** Financial Security Auditor / QA Lead  

---

## 1. BẢO TỒN PHÂN VÙNG TÀI CHÍNH & ĐỐI SOÁT (FINANCIAL SAFEGUARD)

Trong các sự cố P0 vừa qua, Edunity đã ghi nhận và hoàn tất đối soát thành công 2 giao dịch chuyển khoản 3.000đ:
- **Order 100000008 (Payment ID: 6affb173c018a7f472908143):**
  * Đã chuyển khoản thật thành công 3.000đ nhưng ghi danh quá hạn (`EXPIRED`).
  * Đã chuyển trạng thái sang vụ việc hoàn tiền: `RefundCase` mang trạng thái `NEEDS_REVIEW`.
- **Order 100000009 (Payment ID: 6affbd52cfd3c19ebc0a4d0e):**
  * Chuyển khoản thật thành công 3.000đ.
  * Đã ghi nhận thanh toán `COMPLETED` và xác nhận ghi danh `CONFIRMED` cho học sinh (`6affad45c018a7f4729080cf`).
  * Ghi nhận sĩ số lớp học (`6affb0d095b40d0635bf0ad6`) tăng chính xác lên 1.

**Kiểm tra hồi quy bảo vệ dữ liệu:**
1. Bộ test hồi quy `tuitionReconciliationAdminRefund.test.js` đã được chạy lại và **PASS 100% (6/6 tests)**:
   - Invariant 1 (Phục hồi thanh toán hợp lệ): Order 100000009 có `Payment: COMPLETED` & `Enrollment: CONFIRMED`.
   - Invariant 2 (Bảo toàn sĩ số): Class `enrolledCount` giữ đúng 1 học viên.
   - Invariant 3 (Bảo toàn doanh thu): Đúng 1 Transaction `ENROLLMENT_PAYMENT` và 1 `TeacherEarning`.
   - Invariant 4 (Khoản thanh toán thừa): Order 100000008 có Transaction `REFUND: PENDING` và `RefundCase: NEEDS_REVIEW`.
   - Invariant 5 (API Admin Refund): `listRefundCases` hiển thị đầy đủ hồ sơ hoàn tiền.
   - Invariant 6 (Quyền truy cập học viên): Học sinh tiếp tục truy cập lớp học bình thường qua `getMyEnrollments`.

2. Không có bất kỳ endpoint nào cho phép xóa mềm các thực thể tài chính:
   `Payment`, `Transaction`, `TeacherEarning`, `TeacherSettlement`, `Payout`, `RefundCase`, `BankProofRegistry`, `PaymentReconciliation`.

---

## 2. KIỂM SOÁT PHÂN QUYỀN (RBAC & ACCESS CONTROL)

1. **Trash API Access:**
   - Toàn bộ các route `/api/admin/trash` đều được áp dụng middleware `[authMiddleware, requireRole("ADMIN")]`.
   - Học sinh (`STUDENT`) và Khách chưa đăng nhập bị từ chối truy cập ngay lập tức với mã HTTP `401 Unauthorized` hoặc `403 Forbidden`.
   - Giáo viên (`TEACHER`) không thể truy cập API thùng rác và không thể tự ý xóa mềm các lớp học hoặc khóa học đã được duyệt.

2. **Public Isolation:**
   - Dữ liệu bị xóa mềm (`isDeleted: true`) bị loại bỏ hoàn toàn khỏi các endpoint công khai:
     * `GET /api/classes`
     * `GET /api/catalog/categories`
     * `GET /api/catalog/filters`
     * `GET /api/courses`
     * `GET /api/categories/:id/subjects`
   - Bộ lọc `NOT_DELETED = { isDeleted: { $ne: true } }` bảo vệ mọi truy vấn public.

---

## 3. KẾT QUẢ KIỂM THỬ BẢO MẬT & TOÀN VẸN DỮ LIỆU
- **Test suite mới:** `tests/softDeleteArchitecture.test.js` -> **PASS 12/12 tests**.
- **Test suite đối soát:** `tests/tuitionReconciliationAdminRefund.test.js` -> **PASS 6/6 tests**.
- **Frontend Typecheck & Build:** `tsc -b && vite build` -> **PASS (Exit code 0)**.
- **Frontend Lint:** `oxlint` -> **0 errors**.
