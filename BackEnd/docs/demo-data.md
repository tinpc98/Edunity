# Dữ liệu demo

`npm run seed:demo` xóa toàn bộ database đang cấu hình trong `.env` rồi nạp bộ dữ liệu demo theo nghiệp vụ thật. Ngày tháng tính tương đối theo thời điểm chạy, nên lớp "sắp khai giảng" luôn ở tương lai.

`npm run seed` cũ vẫn giữ nguyên cho Postman và kiểm thử.

## Chạy

```bash
cd BackEnd
npm run seed:demo              # chỉ in ra DB đích và số document hiện có, không thay đổi gì
npm run seed:demo -- --yes     # sao lưu vào backups/, xóa hết, nạp dữ liệu demo
```

- Bản sao lưu nằm ở `BackEnd/backups/<thời điểm>/`, mỗi collection một file EJSON. Thư mục này nằm trong `.gitignore` và chứa cả `passwordHash`: không chia sẻ.
- `--no-backup`: bỏ qua bước sao lưu.
- Với `NODE_ENV=production`, script từ chối chạy nếu thiếu `--allow-production`.
- Giấy tờ riêng tư (CCCD, bằng cấp, minh chứng học bổng) được ghi vào thư mục storage **của máy chạy script**. Chạy script trên máy có backend để Admin mở được giấy tờ.

## Tài khoản

Mật khẩu chung: `Edunity@2026`. Mọi email dùng domain `example.com` (domain dành riêng cho dữ liệu mẫu).

| Vai trò | Email | Ghi chú |
|---|---|---|
| Admin | `admin@example.com` | Quản trị hệ thống |
| Admin | `vanhanh@example.com` | Vận hành, duyệt hồ sơ |
| Giáo viên | `duc.nguyen@example.com` | Đã xác minh, có lớp đang dạy, đã nhận chi trả |
| Giáo viên | `vanlong.trinh@example.com` | Hồ sơ xác minh đang chờ duyệt |
| Giáo viên | `giahan.ly@example.com` | Hồ sơ bị từ chối |
| Giáo viên | `quanghuy.phan@example.com` | Mới đăng ký, chưa nộp hồ sơ |
| Học viên | `anh.nguyenminh01@example.com` | Lớp 12, có học bổng, đang học nhiều lớp |
| Nhà tài trợ | `lienhe.hatmam@example.com` | Tổ chức, đã đóng góp cho 2 chiến dịch |
| Nhà tài trợ | `huuphuoc.nguyen@example.com` | Cá nhân |

Email học viên còn lại có dạng `<tên>.<họ đệm><số thứ tự>@example.com`; Admin xem đủ danh sách ở trang Người dùng. Có 1 học viên bị tạm khóa để thử luồng chặn đăng nhập.

## Nội dung

- **Tài khoản:** 54 học viên (Tiểu học, THCS, THPT, sinh viên, người đi làm), 13 giáo viên ở 4 trạng thái xác minh, 4 nhà tài trợ, 2 admin.
- **Danh mục:** 5 danh mục, 17 môn, 19 khóa học. Khối lớp khớp quy tắc danh mục.
- **Lớp học:** 24 lớp ở đủ trạng thái OPEN, IN_PROGRESS, COMPLETED, PENDING_APPROVAL, DRAFT, REJECTED, CANCELLED. Có lớp miễn phí, lớp đã hết chỗ, lớp đã kết thúc kèm đánh giá.
- **Buổi học:** khoảng 330 buổi theo lịch tuần (giờ Việt Nam). Buổi đã qua có điểm danh.
- **Đăng ký và tiền:**
  - Có đủ hình thức thanh toán FREE, DIRECT_PAYMENT, SCHOLARSHIP, MIXED.
  - Trạng thái đăng ký gồm cả giữ chỗ chờ thanh toán, hết hạn, đã hủy. Có giao dịch thất bại trước khi thanh toán thành công.
  - Thu nhập giáo viên tính 10% hoa hồng, kèm chi trả đã hoàn tất.
- **Học bổng:** 4 chiến dịch (đã đóng, đang nhận hồ sơ, sắp mở nhận hồ sơ, bản nháp). Hồ sơ ở mọi trạng thái; học bổng đã dùng một phần hoặc hết.
- **Khác:** đề xuất khóa học, hội thoại học viên – giáo viên, thông báo, khiếu nại, nhật ký thao tác của admin.

Các con số dẫn xuất được tính giống cách service tính, nên luôn khớp nhau:
- Sĩ số đã đăng ký bằng số enrollment còn hiệu lực.
- Quỹ chiến dịch bằng tổng đóng góp thành công; số đã cấp và đã dùng khớp với học bổng.
- Số dư học bổng khớp với số đã sử dụng.
- Điểm đánh giá lớp và giáo viên tính từ review.
