# EDUNITY V3 — AUDIT 08: FINAL HANDOVER & OPERATIONAL GUIDE

## 1. Tổng Kết Hoàn Thành Nhiệm Vụ (Task Summary)
Nhiệm vụ `EDUNITY-TUITION-RECONCILIATION-ADMIN-REFUND-V1` đã được hoàn thành 100% với độ tin cậy và an toàn tài chính tuyệt đối:

1. **Khôi phục thành công Ghi danh Hợp lệ (Order `100000009`)**:
   - `Payment 6affbd51cfd3c19ebc0a4d11`: `COMPLETED` (paidAt: `2026-11-20T03:25:54.000Z`).
   - `Enrollment 6affbd50cfd3c19ebc0a4d0c`: `CONFIRMED`, giải phóng hold timer.
   - `Class 6affb0d095b40d0635bf0ad6`: `enrolledCount` tăng từ 0 lên 1.
   - Sổ cái: `Transaction ENROLLMENT_PAYMENT` 3.000đ (`COMPLETED`).
   - Thu nhập: `TeacherEarning` 3.000đ (`PENDING`, `settlementBlockers: ["POLICY_BLOCKED"]`).
   - Thông báo: Đã phát thông báo thành công tới Học viên và Giáo viên.

2. **Phân loại Khoản Thu Thừa & Khởi Tạo Hồ Sơ Hoàn Tiền (Order `100000008`)**:
   - `Payment 6affb173c018a7f472908143`: `COMPLETED` (ghi nhận dòng tiền thực vào MBBank `4008999999`).
   - `Enrollment 6affb171c018a7f472908142`: Giữ nguyên `EXPIRED` (chặn nhân bản quyền học tập).
   - Sổ cái (TIN-FIN-PR5):
     - `UNAPPLIED_TUITION_RECEIPT` 3.000đ (`COMPLETED`) -> Dòng tiền vào ngân hàng.
     - `REFUND` 3.000đ (`PENDING`) -> Nghĩa vụ hoàn trả tiền thừa đang treo.
   - Hồ sơ hoàn tiền: `RefundCase` mã `REF-20261120-F7304D` ở trạng thái `NEEDS_REVIEW`.
   - Tài khoản nhận tiền: MBBank `76828051998` (PHAM CONG TIN).
   - Cảnh báo: Thông báo bền vững đã được gửi tới chuông của toàn bộ Quản trị viên (`REFUND_REQUIRED`).

3. **Nâng cấp Giao diện Quản trị Hoàn Tiền Mint/Teal (Safe Refund UI)**:
   - File: `FrontEnd/src/features/admin/finance/AdminRefundsPage.tsx`.
   - Tích hợp `AdminPageHeader`, `AdminSectionCard`, bộ lọc trạng thái và ô tìm kiếm thông minh.
   - Modal xem chi tiết hồ sơ (`viewingCase`) hiển thị toàn bộ siêu dữ liệu, tài khoản ngân hàng và nhật ký kiểm toán.
   - Modal nộp ủy nhiệm chi ngân hàng (`submittingProof`) bắt buộc nhập `bankReference`.
   - Modal kiểm tra độc lập `Four-Eyes Principle` (`verifying`).
   - Routing: Click thông báo chuông Admin dẫn thẳng tới `/admin/refunds`.

---

## 2. Hướng Dẫn Vận Hành Dành Cho Quản Trị Viên (Admin SOP)

Để hoàn tất quy trình chi trả khoản tiền 3.000đ cho học viên Phạm Công Tín:

1. **Bước 1: Phê duyệt hồ sơ**:
   - Truy cập `/admin/refunds`.
   - Tìm hồ sơ `REF-20261120-F7304D`.
   - Bấm nút **Duyệt**, xác nhận số tiền 3.000đ -> Trạng thái chuyển thành `APPROVED` (Chờ chuyển khoản).

2. **Bước 2: Thực hiện chuyển khoản ngân hàng thủ công**:
   - Admin phụ trách tài chính mở ứng dụng ngân hàng và chuyển 3.000đ tới:
     * **Ngân hàng**: MBBank (Ngân hàng Quân Đội)
     * **Số tài khoản**: `76828051998`
     * **Chủ tài khoản**: PHAM CONG TIN
     * **Nội dung**: Hoan tien Edunity REF-20261120-F7304D

3. **Bước 3: Nộp chứng từ chuyển khoản**:
   - Tại dòng hồ sơ `REF-20261120-F7304D`, bấm nút **Nộp chứng từ**.
   - Nhập mã giao dịch thực tế của ngân hàng (VD: `FT26...`) và đính kèm ảnh ủy nhiệm chi.
   - Bấm **Nộp chứng từ** -> Trạng thái chuyển thành `AWAITING_BANK_VERIFICATION`.

4. **Bước 4: Xác minh độc lập (Four-Eyes Verification)**:
   - Quản trị viên thứ hai (khác với người nộp chứng từ ở Bước 3) đăng nhập vào hệ thống.
   - Bấm nút **Xác minh (4-Eyes)**, đối chiếu sao kê và xác nhận mã giao dịch.
   - Bấm **Xác nhận hoàn tất** -> Hệ thống chuyển trạng thái `COMPLETED` và tự động cập nhật bút toán kế toán.
