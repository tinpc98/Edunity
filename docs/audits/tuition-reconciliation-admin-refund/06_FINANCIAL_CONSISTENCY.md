# EDUNITY V3 — AUDIT 06: FINANCIAL CONSISTENCY & INVARIANTS

## 1. Bảng Cân Đối Tài Chính Tổng Thể (Double-Entry Balance Verification)
Sau khi đối soát hoàn tất cả 2 giao dịch thật (mỗi giao dịch 3.000 VNĐ, tổng dòng tiền thực nhận tại MBBank là **6.000 VNĐ**), hệ thống duy trì sự cân đối kế toán tuyệt đối:

| Tài khoản kế toán / Khoản mục | Nợ (Debit) | Có (Credit) | Bản chất kinh tế |
| :--- | :---: | :---: | :--- |
| **Tài khoản ngân hàng MBBank** | 6.000đ | — | Tiền thực tế vào tài khoản qua 2 mã GD payOS |
| **Doanh thu học phí lớp học** | — | 3.000đ | Doanh thu được ghi nhận từ Order `100000009` |
| ↳ *Hoa hồng nền tảng (10%)* | — | 300đ | Thu nhập dự kiến của Edunity (tạm khóa chính sách) |
| ↳ *Phải trả giáo viên (Teacher Earning)* | — | 2.700đ | Nghĩa vụ trả cho giáo viên sau buổi học (Settlement Hold) |
| **Khoản thu chưa phân bổ (Unapplied Receipt)** | — | 3.000đ | Dòng tiền thừa từ Order `100000008` |
| **Phải trả hoàn tiền học viên (Refund Liability)**| 3.000đ | 3.000đ | Nghĩa vụ hoàn trả tiền thừa đang treo chờ Admin xử lý |
| **TỔNG CỘNG** | **6.000đ** | **6.000đ** | **Cân đối hoàn hảo (Discrepancy = 0)** |

## 2. Kiểm Tra Các Bất Biến Nghiệp Vụ (Business Invariants Audit)

### 2.1. Bất biến Quyền Ghi danh (Enrollment Invariant)
- **Số suất ghi danh được xác nhận**: Đúng **1** suất duy nhất (Enrollment `6affbd50cfd3c19ebc0a4d0c`).
- **Đơn đăng ký trùng lặp**: Giữ nguyên trạng thái `EXPIRED` (Enrollment `6affb171c018a7f472908142`).
- **Kết quả**: Không có hiện tượng ghi danh ảo, không trùng lặp quyền học tập.

### 2.2. Bất biến Sĩ số Lớp học (Capacity Invariant)
- **Lớp**: `6affb0d095b40d0635bf0ad6` ("TEST PAYOS 3K - Toán 12 THPT").
- **EnrolledCount ban đầu**: 0.
- **EnrolledCount sau đối soát**: **1** (chỉ tăng 1 lần duy nhất từ đơn `100000009`).
- **Sĩ số còn lại (Remaining seats)**: 19 / 20 chỗ.

### 2.3. Bất biến Thu nhập Giáo viên (Teacher Earnings Invariant)
- **Số bản ghi TeacherEarning**: Đúng **1** bản ghi duy nhất (`6afff0d91c819e11be06a8f4`).
- **Số tiền ròng**: 2.700 VNĐ.
- **Trạng thái**: `PENDING`.
- **Khóa thanh toán**: `settlementHoldRequired: true`.
- **Settlement Blockers**: `["POLICY_BLOCKED"]`.
- **Kết quả**: Giáo viên không bao giờ được trả 2 lần tiền cho cùng 1 học viên.

### 2.4. Bất biến Trách nhiệm Hoàn tiền (Refund Obligation Invariant)
- **Bút toán hoàn tiền treo**: 1 giao dịch `REFUND` (`6afff0d91c819e11be06a8f8`) ở trạng thái `PENDING`.
- **Hồ sơ hoàn tiền**: 1 hồ sơ `REF-20261120-F7304D` ở trạng thái `NEEDS_REVIEW`.
- **Bảo mật chuyển khoản**: Không có bất kỳ lệnh gọi API tự động rút tiền nào được kích hoạt. Tiền chỉ được giải tỏa khi Admin thứ hai ký duyệt đối chiếu sao kê ngân hàng độc lập.
