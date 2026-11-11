# EDUNITY V3 — TASK TIN-FIN-FIRST-LIVE-TUITION-PILOT-GATE
# BÁO CÁO ĐÁNH GIÁ SẴN SÀNG HẠ TẦNG HTTPS LOCAL & PHÒNG NGỪA XUNG ĐỘT WEBHOOK

> **Tài liệu**: `39_PAYOS_LOCAL_HTTPS_READINESS.md`  
> **Chủ quản**: TÍN — Payment & Finance  
> **Nhiệm vụ**: Đánh giá phương án nhận Webhook payOS an toàn khi EDUNITY chạy tại Local  

---

## 1. THÁCH THỨC VẬN HÀNH THỰC TẾ CỦA WEBHOOK PAYOS TẠI LOCAL

### 1.1. Yêu cầu kỹ thuật từ payOS
1. Cổng thanh toán **payOS hoạt động trên kiến trúc điện toán đám mây công khai**.
2. Khi người dùng quét mã VietQR và ngân hàng khớp lệnh thành công, payOS gửi một yêu cầu `POST` dạng Webhook chứa chữ ký điện tử HMAC SHA256 về máy chủ của Edunity.
3. Yêu cầu bắt buộc từ payOS:
   - **Giao thức phải là HTTPS** (chứng chỉ TLS/SSL hợp lệ, không chấp nhận HTTP hoặc chứng chỉ tự ký không tin cậy).
   - **Địa chỉ tiếp nhận phải công khai trên Internet** (Publicly reachable).
   - Địa chỉ cục bộ `http://localhost:5000` hoặc `http://127.0.0.1:5000` hoàn toàn **không thể nhận được Webhook** từ payOS nếu không có hạ tầng trung gian.

---

## 2. SO SÁNH HAI PHƯƠNG ÁN HẠ TẦNG: HTTPS TUNNEL TẠM THỜI VS STAGING VPS

| Tiêu Chí So Sánh | Phương Án A: Đường Hầm HTTPS Tạm Thời (Cloudflare Tunnel / Tailscale) | Phương Án B: Triển Khai Staging VPS Độc Lập |
|---|---|---|
| **Mô tả kỹ thuật** | Chạy một daemon cục bộ (ví dụ: `cloudflared` hoặc `tailscale funnel`) tạo proxy an toàn trỏ HTTPS vào cổng 5000. | Thuê VPS riêng (Ubuntu), trỏ subdomain Staging (ví dụ `api-staging.edunity.vn`), cài SSL Let's Encrypt. |
| **Chi phí & Thời gian** | Không tốn chi phí, thiết lập xong trong 5–10 phút. | Tốn chi phí thuê VPS, cấu hình DNS, Nginx, Docker mất 1–2 ngày. |
| **Tính ổn định của URL** | Phụ thuộc vào daemon local; nếu máy tắt hoặc restart tunnel, URL có thể thay đổi (trừ khi dùng Named Tunnel). | URL cố định 100%, uptime 24/7. |
| **Độ an toàn bảo mật** | Cần cấu hình chặt chẽ để không lộ các route nội bộ (Admin, DB). | Tách biệt hoàn toàn khỏi máy phát triển cá nhân của lập trình viên. |
| **Khuyến nghị của Tín** | **Thích hợp cho phiên Live Pilot kiểm chứng nhanh 1 giao dịch** dưới sự giám sát trực tiếp. | **Bắt buộc cho giai đoạn Staging UAT dài hạn** trước khi lên Production. |

---

## 3. THIẾT KẾ KIẾN TRÚC CÔ LẬP NẾU DÙNG HTTPS TUNNEL CHO LOCAL PILOT

Nếu Team Leader phê duyệt phương án thử nghiệm nhanh bằng HTTPS Tunnel tại Local, kiến trúc phải tuân thủ nghiêm ngặt **5 tầng cô lập**:

```
[Internet: payOS Server]
          │ (POST Webhook HTTPS có HMAC SHA256)
          ▼
┌─────────────────────────────────────────────────────────────┐
│ TẦNG 1: CLOUDFLARE INGRESS FILTER                          │
│ - Chỉ mở duy nhất path: /api/payments/payos/webhook         │
│ - Chặn 100% các path: /api/admin/*, /api/auth/*, /api/users │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ TẦNG 2: EXPRESS RATE LIMITER & BODY GUARD                   │
│ - Giới hạn tần suất: tối đa 10 requests / phút              │
│ - Kiểm tra kích thước payload: tối đa 100KB                 │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ TẦNG 3: SIGNATURE VERIFICATION GATE                         │
│ - Kiểm tra chữ ký HMAC SHA256 với PAYOS_TUITION_CHECKSUM_KEY│
│ - Sai chữ ký ➜ HTTP 400 + Báo động an ninh, từ chối xử lý   │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ TẦNG 4: TEST RUNTIME & DỮ LIỆU CÔ LẬP                       │
│ - Database riêng biệt: edunity_pilot_live                   │
│ - Tài khoản Học viên riêng: student_pilot@edunity.test      │
│ - Lớp học riêng: Pilot Class (Học phí danh nghĩa 10.000 VNĐ)│
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ TẦNG 5: KHÓA CHI TIỀN TỰ ĐỘNG (OUTBOUND LOCK)               │
│ - PAYOUT_ENABLED=false (Khóa 100% rút tiền giáo viên)       │
│ - REFUND_ENABLED=false (Khóa 100% hoàn tiền tự động)        │
│ - Bắt buộc duyệt kép Four-Eyes và kiểm tra chứng từ ngân hàng│
└─────────────────────────────────────────────────────────────┘
```

---

## 4. NGUY CƠ XUNG ĐỘT WEBHOOK (WEBHOOK COLLISION GUARD)

> [!CAUTION]
> **CẢNH BÁO NGUY HIỂM VỀ CƠ CHẾ ĐĂNG KÝ WEBHOOK CỦA PAYOS**:
> 1. Trong cổng quản trị `payOS Merchant Portal`, mỗi ứng dụng (Client ID) **CHỈ ĐƯỢC PHÉP CẤU HÌNH DUY NHẤT 1 ĐƯỜNG DẪN WEBHOOK URL**.
> 2. Nếu Kênh Học Phí (`PAYOS_TUITION_CLIENT_ID = 7786a516...`) hiện đang được liên kết với một Webhook URL của môi trường khác (ví dụ: máy chủ của thành viên khác hoặc server thử nghiệm cũ), hành động cập nhật URL bằng lệnh script hoặc giao diện web sẽ **NGAY LẬP TỨC GHI ĐÈ VÀ CẮT ĐỨT DÒNG DỮ LIỆU CỦA HỆ THỐNG ĐÓ**.
> 3. **Quy tắc An toàn Tối cao**:
>    - Tuyệt đối **KHÔNG TỰ Ý ĐĂNG KÝ HOẶC THAY ĐỔI WEBHOOK URL** trên cổng payOS.
>    - Trước khi thiết lập bất kỳ tunnel nào, Team Leader hoặc Quản trị viên payOS phải đăng nhập vào Dashboard kiểm tra: Nếu Webhook URL hiện tại đang trỏ tới một hệ thống đang hoạt động, **BẮT BUỘC DỪNG LẠI (STOP)** và tạo một ứng dụng kênh riêng (Sub-merchant hoặc Dev channel) để tránh phá hủy môi trường sẵn có.

---

## 5. CAM KẾT HÀNH ĐỘNG CỦA TÍN (OWNER)

1. **Không tự ý mở Cloudflare Tunnel / Ngrok**.
2. **Không tự ý gọi API đăng ký Webhook của payOS**.
3. **Không chỉnh sửa file cấu hình `BackEnd/.env`**.
4. Luôn tuân thủ nguyên tắc: *Kiến trúc kỹ thuật đã sẵn sàng, nhưng cổng kích hoạt phải do Team Leader ra lệnh*.

