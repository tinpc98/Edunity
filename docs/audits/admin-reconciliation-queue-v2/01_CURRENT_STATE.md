# 01. HIỆN TRẠNG HÀNG ĐỢI ĐỐI SOÁT TRƯỚC KHI TÁI THIẾT KẾ (CURRENT STATE)

## 1. Bối cảnh
Trước khi triển khai bản nâng cấp `EDUNITY-ADMIN-RECONCILIATION-QUEUE-V2`, giao diện Hàng đợi đối soát (`/admin/reconciliations`) gặp phải nhiều bất cập cả về trải nghiệm người dùng (UX) lẫn tính toàn vẹn nghiệp vụ (Business Integrity):

1. **Giao diện rườm rà, lạm dụng cảnh báo kỹ thuật**:
   - Banner vàng lớn *"Nguyên tắc xử lý Đối soát & An toàn quỹ (BR-34, PR8 Reserved)"* choán không gian hiển thị, chứa các thuật ngữ mã nguồn không thân thiện với nhân viên vận hành.
2. **Bố cục bảng danh sách bị tràn ngang**:
   - Mỗi hàng hiển thị cùng lúc 3 nút nằm ngang: `[Chi tiết]` `[Tiếp nhận]` `[Ghi chú]`, chiếm hơn 240px khiến bảng dễ bị tràn mép và ép co cụm các cột dữ liệu quan trọng như Số tiền, Mã đơn.
3. **Trộn lẫn các hồ sơ đã hoàn tất và hồ sơ cần xử lý**:
   - Toàn bộ hồ sơ (NEEDS_REVIEW, IN_REVIEW, RESOLVED_APPROVED, RESOLVED_REFUNDED) nằm chung trong một danh sách duy nhất. Quản trị viên không thể phân biệt ngay lập tức việc gì cần làm gấp.
4. **Lỗ hổng phân công hồ sơ đã giải quyết**:
   - Nút `[Tiếp nhận]` hiển thị cho cả các hồ sơ đã có trạng thái cuối cùng (RESOLVED_APPROVED, RESOLVED_REFUNDED).
   - Thực tế ghi nhận: Đơn `#100000009` đã được giải quyết đối soát lúc 14:03:50 ngày 20/11/2026, nhưng sau đó vẫn bị kích hoạt nút tiếp nhận lúc 21:27:07 và 21:27:28, sinh ra 2 bản ghi `ASSIGNED` không hợp lệ trong nhật ký kiểm toán.
5. **Nhật ký xử lý (Audit Trail) đậm tính kỹ thuật**:
   - Hiển thị trực tiếp các enum mã nguồn tiếng Anh: `WEBHOOK_RECONCILIATION_OPENED`, `RECONCILIATION_RESOLVED`, `Receiver bank account does not match verified channel account`, v.v.
6. **Chưa có sự phân định ranh giới giữa Đối soát và Hoàn tiền**:
   - Nhân viên vận hành dễ nhầm lẫn giữa việc "Đã giải quyết đối soát" và "Đã hoàn trả tiền mặt", trong khi RefundCase vẫn đang trong hàng đợi chờ ủy nhiệm chi thực tế.
