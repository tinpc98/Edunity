# 04. HÀNG RÀO BẢO VỆ BACKEND VÀ KIỂM SOÁT PHÂN CÔNG (BACKEND GUARDS)

## 1. Khóa Chặn Thao tác Trên Hồ sơ Đã Giải quyết (Terminal Status Guard)
Tại `BackEnd/src/services/financeService.js`, phương thức `assignReconciliation`:
```javascript
// Guard: Resolved reconciliations cannot be assigned or re-opened!
const isResolved = ["RESOLVED_APPROVED", "RESOLVED_REFUNDED", "RESOLVED_IGNORED"].includes(recon.status);
if (isResolved) {
  throw new AppError(
    "Không thể phân công hoặc tiếp nhận hồ sơ đối soát đã giải quyết",
    "RECONCILIATION_ALREADY_RESOLVED",
    409
  );
}
```
- Khi một yêu cầu phân công hoặc tiếp nhận được gửi tới một hồ sơ đã kết thúc, Backend từ chối ngay lập tức với mã lỗi HTTP `409 Conflict`.
- Không dựa dẫm vào việc vô hiệu hóa nút ở Frontend; lớp API kiểm soát chặt chẽ trạng thái ở mức DB model.

## 2. Cơ chế Chống Trùng lặp Sự kiện Phân công (Assignment Idempotency Guard)
```javascript
// Guard: Idempotent duplicate assignment check
const isSameAssignee = recon.assignedTo && recon.assignedTo.toString() === targetUser._id.toString();
if (isSameAssignee && (!body.note || !body.note.trim())) {
  const current = await PaymentReconciliation.findById(id)
    .populate("eventId")
    .populate("assignedTo", "email role studentProfile teacherProfile sponsorProfile")
    .lean();
  return serializeDecimal128(current);
}
```
- Nếu hồ sơ đã được gán cho Admin A và lệnh tiếp theo vẫn gán cho Admin A mà không có ghi chú mới:
  * Trả về nguyên trạng hồ sơ hiện tại.
  * Không ghi thêm sự kiện `ASSIGNED` trùng lặp vào mảng `auditReferences`.
  * Không làm biến động thời gian `updatedAt` vô ích.

## 3. Xác thực Vai trò Người được Phân công (Assignee Role Validation)
- Chỉ tài khoản có `role === "ADMIN"` mới được phép nhận phân công xử lý đối soát.
- Nếu gửi ID của học viên hoặc giảng viên, Backend trả về lỗi HTTP `400 INVALID_ASSIGNEE`.

## 4. Bảo vệ Dữ liệu Tài chính Khi Ghi chú (Notes Mutation Isolation)
- Phương thức `addReconciliationNote`:
  * Chỉ thêm mục vào mảng `auditReferences`.
  * Tuyệt đối không thay đổi trạng thái đối soát (`recon.status`).
  * Không phát sinh mutation lên Payment, Enrollment hay RefundCase.
  * Với các hồ sơ đã giải quyết, ghi nhận hành động với loại `POST_RESOLVED_NOTE` để phân định ghi chú kiểm toán bổ sung sau khi kết thúc.
