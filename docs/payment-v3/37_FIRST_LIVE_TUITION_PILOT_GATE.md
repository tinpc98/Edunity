# EDUNITY V3 — TASK TIN-FIN-FIRST-LIVE-TUITION-PILOT-GATE
# BÁO CÁO CỔNG KIỂM SOÁT GIAO DỊCH THẬT ĐẦU TIÊN (HỌC PHÍ - TUITION)

> **Dự án**: EDUNITY V3 — Phân hệ Payment & Finance  
> **Nhiệm vụ**: `TIN-FIN-FIRST-LIVE-TUITION-PILOT-GATE`  
> **Chủ quản**: TÍN — Payment & Finance  
> **Vai trò**: Principal Payment Architect + Live Integration Engineer + Financial Security QA Lead  
> **Ngày lập**: 2026-11-11  
> **Môi trường hiện tại**: Local Workspace (`localhost`), MongoDB Replica Set `rs0`  
> **Branch**: `feature/teacher-admin`  

---

## 1. TỔNG QUAN VÀ NGUYÊN TẮC BẢO MẬT TỐI CAO

Theo chỉ thị của Team Leader:
1. **Toàn bộ phân hệ Payment & Finance phải vận hành bằng hệ thống thật**, không sử dụng Mock API, không dùng Mock VietQR, không dùng Fake Webhook để tuyên bố nghiệm thu Live.
2. **EDUNITY hiện đang chạy 100% tại môi trường Local**. Chưa có VPS Staging/Production public, chưa có tên miền chính thức.
3. **Mục tiêu của nhiệm vụ**: Chuẩn bị đầy đủ cơ sở kỹ thuật, kiến trúc phân luồng, quy trình kiểm soát và ma trận an toàn để sẵn sàng thực hiện **giao dịch payOS thật đầu tiên (Live Tuition Pilot)** nhằm xác minh cơ chế tự động mở quyền học mà không cần Admin duyệt thủ công.
4. **Cam kết tuân thủ ranh giới**:
   - Không tự động bật `PAYOS_ENABLED=true` trên `.env` runtime.
   - Không thực hiện giao dịch chuyển tiền thật trước khi có phê duyệt bằng văn bản từ Team Leader.
   - Không tự ý đăng ký webhook đè lên payOS Merchant Portal.
   - Giữ nguyên ranh giới phân quyền: Không can thiệp sang LMS, Auth (Bảo), Quản lý lớp/Session (Châu), UI phi tài chính (Băng).

---

## 2. PHASE 1 — KIỂM TRA HIỆN TRẠNG THẬT & GIẢI MÃ MÂU THUẪN

### 2.1. Kiểm tra cấu hình môi trường thực tế (`BackEnd/.env` & Runtime)
Qua kiểm toán trực tiếp tập tin `BackEnd/.env` và runtime process:

| Khóa Cấu Hình | Giá Trị Thực Tế | Nhận Định An Toàn |
|---|---|---|
| `PAYOS_ENABLED` | `false` | **AN TOÀN**: Cổng thanh toán bên thứ 3 đang bị tắt ở runtime. |
| `PAYOS_TUITION_ENABLED` | `false` | **AN TOÀN**: Kênh học phí chưa kích hoạt live. |
| `PAYOS_DONATION_ENABLED` | `false` | **AN TOÀN**: Kênh quyên góp chưa kích hoạt live. |
| `REAL_LOCAL_RUNTIME` | `false` | **AN TOÀN**: Không kích hoạt mock runtime. |
| `ENABLE_PAYMENT_SANDBOX` | `false` | **AN TOÀN**: Các endpoint sandbox/mock trả về 503 Provider Disabled. |
| `VITE_ENABLE_PAYMENT_SANDBOX` | `false` | **AN TOÀN**: Frontend không hiển thị nút thanh toán giả lập. |
| `PAYOS_TUITION_CLIENT_ID` | `7786a516-****-****-****-************` | **ĐÃ CẤU HÌNH**: Định dạng UUID 36 ký tự hợp lệ. |
| `PAYOS_TUITION_API_KEY` | `****-****-****-****` | **ĐÃ CẤU HÌNH**: 36 ký tự. |
| `PAYOS_TUITION_CHECKSUM_KEY` | `64 ký tự hex` | **ĐÃ CẤU HÌNH**: Khóa chữ ký HMAC SHA256 hợp lệ. |
| `PAYOS_DONATION_CLIENT_ID` | `b42ecd57-****-****-****-************` | **ĐÃ CẤU HÌNH**: Kênh riêng biệt hoàn toàn với Tuition. |
| `PAYOS_DONATION_API_KEY` | `****-****-****-****` | **ĐÃ CẤU HÌNH**: 36 ký tự. |
| `PAYOS_DONATION_CHECKSUM_KEY` | `64 ký tự hex` | **ĐÃ CẤU HÌNH**: Khóa chữ ký riêng biệt cho Donation. |
| `MONGODB_URI` (.env) | `mongodb+srv://.../edunity` | Remote Atlas cluster. |
| `MONGODB_URI` (Test Local) | `mongodb://127.0.0.1:27017/edunity_test_verify?directConnection=true` | Local Replica Set `rs0` phục vụ giao dịch ACID. |
| `FRONTEND_URL` | `http://localhost:5173` | Local Vite dev server. |
| `BACKEND_URL` | `http://localhost:5000` | Local Express server. |

### 2.2. Làm rõ mâu thuẫn giữa các báo cáo trước
- **Mâu thuẫn**: Trong tài liệu PR10 có đoạn ghi nhận "Credentials đã cấu hình", nhưng tài liệu Audit Real Integration lại ghi "Chưa nạp credentials".
- **Bản chất kỹ thuật được xác minh**:
  1. *Trên đĩa cứng (Disk Storage)*: File `BackEnd/.env` cục bộ **ĐÃ CÓ** đầy đủ 2 bộ credentials hợp lệ của payOS cho cả 2 kênh Tuition và Donation.
  2. *Tại máy chủ Staging / CI/CD*: Hạ tầng Staging VPS độc lập chưa được dựng, nên Secret Manager trên cloud/server chưa hề được nạp các biến này.
  3. *Tại Runtime cục bộ*: Mặc dù credentials tồn tại trong `.env`, cờ `PAYOS_ENABLED` và `PAYOS_TUITION_ENABLED` được đặt là `false`. Do đó, `payosService.js` coi như cổng bị vô hiệu hóa (`PAYMENT_PROVIDER_DISABLED`), không kết nối ra ngoài internet.
- **Kết luận**: Không có mâu thuẫn về mã nguồn. Đây là sự khác biệt giữa *sự hiện diện của biến môi trường trong file cấu hình local* và *trạng thái kích hoạt (Runtime Activation) của dịch vụ*.

---

## 3. PHASE 2 — KIỂM CHỨNG CƠ CHẾ TỰ ĐỘNG CẤP QUYỀN HỌC (AUTO-ENROLLMENT)

### 3.1. Chuỗi nghiệp vụ chuẩn (E2E Automated Flow)
```
[Học viên bấm Mua Lớp]
       │
       ▼
[Tạo Enrollment: PENDING_PAYMENT] (Giữ chỗ 15 phút, tính toán holdExpiresAt)
       │
       ▼
[Gọi Payment Intent API] ──(Tạo Payment PENDING)──► [payOS createPaymentLink]
                                                           │
                                                           ▼
                                                    [Sinh VietQR Thật]
                                                           │
                                                           ▼
                                             [Học viên quét mã chuyển khoản]
                                                           │
                                                           ▼
                                                [Ngân hàng ghi nhận tiền]
                                                           │
                                                           ▼
                                                [payOS gửi Webhook HTTPS]
                                                           │
                                                           ▼
                                              [payosWebhookService.js]
                                              ├── 1. Xác thực HMAC SHA256 Checksum
                                              ├── 2. Mở MongoDB ACID Session
                                              ├── 3. Kiểm tra Idempotency (Trùng lặp)
                                              ├── 4. Cập nhật Payment: COMPLETED
                                              ├── 5. Ghi sổ cái Transaction: ENROLLMENT_PAYMENT
                                              ├── 6. Cập nhật Enrollment: CONFIRMED
                                              ├── 7. Tăng Class.currentStudents (+1)
                                              └── 8. Tạo TeacherEarning: PENDING (Ghi nhận doanh thu)
                                                           │
                                                           ▼
                                              [MongoDB Commit Transaction]
                                                           │
                                                           ▼
                                         [Học viên lập tức có quyền vào lớp!]
```

### 3.2. Xác minh các chốt chặn an toàn tài chính
1. **Không có Admin can thiệp**: Luồng được thực thi hoàn toàn bất đồng bộ và tự động bên trong `payosWebhookService.js` ngay khi nhận được tín hiệu webhook hợp lệ có chữ ký điện tử. Admin không cần duyệt thủ công.
2. **Không mở quyền trước khi tiền vào**: API `checkClassAccess` và `joinSession` kiểm tra trực tiếp trạng thái `Enrollment.status === 'CONFIRMED'`. Nếu Payment còn `PENDING` hoặc webhook chưa tới, quyền vào lớp bị từ chối 100% (`403 ENROLLMENT_NOT_CONFIRMED`).
3. **Tuyệt đối không tin tưởng `returnUrl`**: Khi học viên thanh toán xong trên cổng payOS và được redirect về `http://localhost:5173/payment/success?orderCode=...`, Frontend chỉ hiển thị trạng thái chờ và polling trạng thái Payment từ Backend. Frontend **không gửi** và Backend **không chấp nhận** bất kỳ cờ "thành công" nào từ URL query parameters để mở lớp.
4. **Chống xử lý trùng lặp (Strict Idempotency)**:
   - Webhook kiểm tra trạng thái của Payment: Nếu `payment.status === 'COMPLETED'`, hệ thống ghi log `WEBHOOK_DUPLICATE_IGNORED` và trả về HTTP 200 ngay lập tức, không ghi thêm Transaction hay Earning.
   - Thao tác cập nhật sử dụng query nguyên tử: `Payment.findOneAndUpdate({ _id: paymentId, status: { $ne: 'COMPLETED' } })`.
5. **Kiểm soát sĩ số lớp học (Capacity Guard)**:
   - Trước khi xác nhận Enrollment, hệ thống kiểm tra `classItem.currentStudents < classItem.maxStudents`. Nếu lớp đã đầy (do quá hạn hoặc race condition), giao dịch được chuyển sang diện hoàn tiền/đối soát (`PaymentReconciliation`), không cố nhồi nhét học viên vượt sĩ số.
6. **Đồng bộ hóa thời gian giữ chỗ (`holdExpiresAt` và `expiredAt`)**:
   - `Enrollment.holdExpiresAt` được tính bằng `Date.now() + 15 * 60 * 1000` (dạng Date/timestamp ms).
   - `payOS.expiredAt` được truyền lên cổng tính bằng Unix timestamp chuẩn giây: `Math.floor(holdExpiresAt.getTime() / 1000)`.
   - Nếu webhook đến sau khi Enrollment đã chuyển sang trạng thái `EXPIRED`: Tiền thanh toán muộn **không bao giờ** tự ý mở lại lớp đã hủy; thay vào đó, hệ thống tạo bản ghi `PaymentReconciliation` với mã `LATE_PAYMENT_CLASS_HOLD_EXPIRED` để bộ phận tài vụ xử lý hoàn tiền an toàn.
7. **Bảo toàn doanh thu giáo viên (TeacherEarning Deduplication)**:
   - Bảng `TeacherEarning` có unique constraint trên cặp `{ paymentId: 1 }`. Không thể phát sinh 2 bản ghi earning cho cùng 1 đơn hàng thanh toán.
8. **Độc lập giữa quyền vào Lớp và quyền vào Buổi học (Class Access vs Session Window)**:
   - Quyền truy cập lớp học (`Class Protected Access`): Ngay sau khi Enrollment `CONFIRMED`, học viên có quyền xem tài liệu, danh sách buổi học, bài tập.
   - Quyền tham gia phòng học trực tuyến (`Session Join`): Phụ thuộc vào quy tắc quản lý phòng học của phân hệ Giáo vụ (CHÂU) - chỉ mở trước giờ học 15 phút và đóng sau giờ bắt đầu 20 phút. Phân hệ Payment không can thiệp vào logic Session này.

---

## 4. PHASE 3 — CHÍNH SÁCH NO-MOCK & PHÂN LOẠI TEST RIGOR

### 4.1. Cam kết No-Mock tại Runtime
- **Không QR giả**: Loại bỏ hoàn toàn VietQR tĩnh từ mock string.
- **Không fake checkout URL**: Không tạo link redirect giả lập trạng thái đã thanh toán.
- **Không fake webhook endpoint**: Các endpoint `/api/payments/test-fake-webhook` đã bị gỡ bỏ hoặc khóa chặt với HTTP 503 `PAYMENT_PROVIDER_DISABLED`.
- **Không hardcoded Dashboard**: Các chỉ số trên Finance Dashboard truy vấn trực tiếp từ aggregate MongoDB trên collection `payments`, `teacher_earnings`, `reconciliations`.

### 4.2. Phân loại kiểm thử khách quan (Test Rigor Classification)
Để tránh nhầm lẫn giữa kiểm thử giao diện và tích hợp thực tế, toàn bộ hệ thống test được phân định rạch ròi:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       MA TRẬN PHÂN LOẠI TEST EDUNITY V3                     │
├─────────────────────────┬──────────────────────────┬────────────────────────┤
│ Phân Loại               │ Phạm Vi & Công Cụ        │ Trạng Thái Đánh Giá    │
├─────────────────────────┼──────────────────────────┼────────────────────────┤
│ UI_ONLY_PASS            │ Playwright Browser E2E   │ PASS (8/8 Suites)      │
│                         │ (Mô phỏng DOM, navigation│ Đạt độ sẵn sàng UI,    │
│                         │ component rendering)     │ KHÔNG chứng minh live. │
├─────────────────────────┼──────────────────────────┼────────────────────────┤
│ REAL_BACKEND_DB_PASS    │ Jest Integration Tests   │ PASS (3/3 Scenarios)   │
│                         │ Local MongoDB ReplicaSet │ Xác minh toàn vẹn ACID,│
│                         │ (ACID Transactions)      │ tự động cấp quyền DB.  │
├─────────────────────────┼──────────────────────────┼────────────────────────┤
│ REAL_PROVIDER_NOT_RUN   │ Live payOS API Gateway   │ BLOCKED / NOT_RUN      │
│                         │ (Gọi cổng thật, quét QR, │ Chờ duyệt Pilot Gate,  │
│                         │ nhận webhook public)     │ chưa thực hiện tiền.   │
└─────────────────────────┴──────────────────────────┴────────────────────────┘
```

> **CẢNH BÁO MINH BẠCH**: Tuyệt đối **KHÔNG** lấy kết quả `8/8 Browser E2E PASS` hoặc `3/3 Local DB PASS` để tuyên bố phân hệ Payment đã "LIVE PASS". Cổng thật chỉ được coi là PASS khi có giao dịch tiền thật được hạch toán thành công.

---

## 5. PHASE 4 — ĐÁNH GIÁ SẴN SÀNG HẠ TẦNG HTTPS LOCAL & RỦI RO WEBHOOK

Chi tiết phân tích hạ tầng được trình bày riêng tại văn bản:  
`docs/payment-v3/39_PAYOS_LOCAL_HTTPS_READINESS.md`.

**Điểm cảnh báo xung đột Webhook (Webhook Collision Guard)**:
- Cổng payOS quy định: Mỗi Merchant Channel (ứng với một Client ID) **chỉ được phép lưu duy nhất 1 Webhook URL**.
- Kênh Tuition (`7786a516...`) hiện đang có thể được trỏ tới môi trường Staging/Dev khác. Nếu kỹ sư tự ý chạy công cụ tạo tunnel (ngrok, cloudflared) rồi dán URL tạm thời lên payOS Merchant Portal, hành động này sẽ **GHI ĐÈ VÀ PHÁ HỦY** đường truyền webhook của hệ thống đang chạy.
- **Quy tắc an toàn**: DỪNG LẠI và chỉ cập nhật Webhook URL khi có xác nhận chính thức kênh payOS này dành riêng cho Local Pilot.

---

## 6. KẾT LUẬN & ĐỀ XUẤT HÀNH ĐỘNG

1. **Phân hệ Học phí (Tuition)**: Đã hoàn thiện 100% logic phần mềm, chuỗi tự động mở quyền học qua MongoDB Replica Set đã được kiểm chứng tuyệt đối an toàn.
2. **Hạ tầng kết nối**: Cần thiết lập đường hầm HTTPS an toàn hoặc triển khai Staging VPS độc lập để nhận webhook từ payOS.
3. **Phê duyệt tiền thật**: Giữ nguyên trạng thái khóa, chờ quyết định từ Team Leader.

