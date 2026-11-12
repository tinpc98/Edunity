# EDUNITY V3 — TASK TIN-FIN-FIRST-LIVE-TUITION-PILOT-GATE
# CHECKLIST ĐIỀU KIỆN TIÊN QUYẾT & KỊCH BẢN NGHIỆM THU HỌC PHÍ THẬT

> **Tài liệu**: `38_LIVE_TUITION_ACCEPTANCE_CHECKLIST.md`  
> **Chủ quản**: TÍN — Payment & Finance  
> **Áp dụng**: Phiên kiểm thử giao dịch thật đầu tiên (First Live Tuition Pilot)  
> **Quy tắc an toàn**: Mọi bước nghiệm thu phải có điều kiện thực tế (Actual Result). Nếu bất kỳ điều kiện nào FAIL, dừng thử nghiệm ngay lập tức.

---

## PHẦN I: MA TRẬN 12 ĐIỀU KIỆN TIÊN QUYẾT (LIVE PILOT PRECONDITIONS)

Trước khi kích hoạt bất kỳ giao dịch bằng tiền thật nào qua cổng payOS, toàn bộ 12 điều kiện kỹ thuật và pháp lý tài chính sau đây bắt buộc phải đạt trạng thái **PASSED / READY**:

| STT | Tên Điều Kiện Tiên Quyết | Tiêu Chí Kiểm Tra Cụ Thể | Trạng Thái Hiện Tại | Hành Động Yêu Cầu Trước Khi GO |
|:---:|---|---|:---:|---|
| **1** | **Team Leader Phê Duyệt** | Có văn bản hoặc chỉ thị chính thức từ Team Leader đồng ý thử nghiệm tiền thật. | 🔴 **PENDING** | Chờ văn bản phê duyệt chính thức từ Team Leader. |
| **2** | **Xác Minh Kênh TUITION** | Kênh payOS kích hoạt đúng Client ID `7786a516...`, tách biệt khỏi kênh Donation. | 🟢 **READY** | Cấu hình trong `.env` đã được rà soát đúng UUID. |
| **3** | **Xác Minh TK Ngân Hàng** | Tài khoản nhận tiền trên payOS là tài khoản kiểm thử chính chủ của dự án. | 🟡 **UNVERIFIED** | Team Leader kiểm tra Merchant Dashboard của payOS. |
| **4** | **Xác Minh Chính Sách Hoa Hồng** | Tỷ lệ nền tảng (Platform Commission, ví dụ 20%) và Teacher Earning (80%) được định cấu hình rõ. | 🟢 **READY** | Kiểm chứng trong `paymentService.js` và logic ledger. |
| **5** | **Test Class & Học Phí Thật** | Tạo lớp học riêng với mức học phí hợp lệ (ví dụ: 10.000 VNĐ, không chấp nhận số tiền tùy tiện lệch class fee). | 🟡 **PREPARED** | Đã chuẩn bị mã seed Class, chưa deploy lên runtime live. |
| **6** | **MongoDB Cô Lập** | Database phục vụ thử nghiệm hoàn toàn riêng biệt, không dùng lẫn DB staging/prod dơ. | 🟢 **READY** | Cấu hình chạy trên Local Replica Set `rs0` riêng. |
| **7** | **Điểm Cuối HTTPS Webhook** | Đường dẫn HTTPS công khai có thể tiếp nhận gói tin từ payOS webhook sender. | 🔴 **BLOCKED** | Localhost:5000 chưa có HTTPS Public Tunnel hoặc VPS. |
| **8** | **Mẫu Webhook An Toàn** | Kiểm tra thuật toán HMAC SHA256 với đúng Checksum Key của kênh Tuition. | 🟢 **READY** | Suite Jest `payosSafetyHardening.pr5` đã xác minh pass. |
| **9** | **Giám Sát & Log Giao Dịch** | Hệ thống log chi tiết bắt đầu từ khi sinh QR đến khi commit database. | 🟢 **READY** | Cơ chế logging Winston và Console log trace sẵn sàng. |
| **10**| **Khóa Chặt Payout & Refund**| Cơ chế Four-Eyes và BankProofRegistry khóa 100% dòng tiền chi ra ngoài tự động. | 🟢 **LOCKED** | `PAYOUT_ENABLED=false`, bắt buộc 2 Admin duyệt thủ công. |
| **11**| **Phương Án Xử Lý Tiền Lỗi**  | Runbook hoàn tiền / ghi nhận vào sổ tài vụ nếu giao dịch ngân hàng trừ tiền nhưng webhook mất. | 🟢 **READY** | `PaymentReconciliation` với job quét tự động sẵn sàng. |
| **12**| **Nhân Sự Đối Soát Sao Kê**  | Phân công chuyên viên kiểm tra trực tiếp sao kê ứng dụng ngân hàng số sau khi quét QR. | 🟡 **PENDING** | Team Leader chỉ định người cầm app ngân hàng đối soát. |

> **KẾT LUẬN CỔNG TIÊN QUYẾT**: Hiện tại có **2 điều kiện BLOCKED / PENDING** (Điều kiện 1: Phê duyệt của Team Leader; Điều kiện 7: Hạ tầng HTTPS Webhook).  
> ➜ **QUYẾT ĐỊNH CỔNG**: **NO-GO LIVE PILOT** cho đến khi đủ 12/12 điều kiện.

---

## PHẦN II: KỊCH BẢN NGHIỆM THU 14 BƯỚC GIAO DỊCH THẬT (LIVE ACCEPTANCE PLAN)

Kịch bản này sẽ được kích hoạt tuần tự từng bước khi đã có quyết định GO từ Team Leader:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    KỊCH BẢN NGHIỆM THU 14 BƯỚC CHI TIẾT                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Bước | Hành Động Kiểm Thử | Thành Phần Thực Thi | Kết Quả Mong Đợi (Expected Result) | Kết Quả Thực Tế Hiện Tại (Actual Result) |
|:---:|---|---|---|---|
| **1** | Đăng nhập tài khoản Học viên thử nghiệm. | FrontEnd Auth (`/login`) | Đăng nhập thành công, nhận JWT Token, vào Student Dashboard. | 🟢 **PASS (Local Verify)**: Token sinh hợp lệ. |
| **2** | Chọn Lớp học thử nghiệm (`Pilot Class - 10.000 VNĐ`). | Course/Class Catalog | Hiển thị chi tiết lớp học, học phí 10.000 VNĐ, số chỗ còn trống. | 🟢 **PASS (Local Verify)**: Class schema hợp lệ. |
| **3** | Bấm nút "Đăng ký học" để tạo Enrollment. | `POST /api/enrollments` | Tạo `Enrollment` trạng thái `PENDING_PAYMENT`, giữ chỗ trong 15 phút. | 🟢 **PASS (Local Verify)**: `holdExpiresAt` tính đúng. |
| **4** | Hệ thống gọi payOS tạo Link thanh toán. | `POST /api/payments/payos/create-intent` | Nhận phản hồi payOS thành công, sinh mã VietQR thật kèm chuỗi thanh toán. | 🔴 **NOT_RUN**: Chờ kích hoạt HTTPS và bật cổng thật. |
| **5** | Người được ủy quyền quét mã VietQR và chuyển tiền. | App Ngân hàng cá nhân | Ứng dụng ngân hàng xác nhận chuyển đúng 10.000 VNĐ kèm đúng nội dung thanh toán. | 🔴 **NOT_RUN**: Chưa thực hiện chuyển tiền thật. |
| **6** | Cổng payOS ghi nhận giao dịch từ ngân hàng. | Hệ thống payOS Gateway | Trạng thái giao dịch trên payOS Dashboard chuyển sang `PAID`. | 🔴 **NOT_RUN**: Chưa kết nối payOS live. |
| **7** | payOS bắn Webhook HTTPS về máy chủ Edunity. | Ingress Webhook Endpoint | Webhook nhận payload, xác thực chữ ký HMAC SHA256 thành công (HTTP 200). | 🔴 **BLOCKED**: Cần HTTPS endpoint tiếp nhận. |
| **8** | Backend cập nhật bản ghi `Payment`. | `payosWebhookService.js` | `Payment.status` chuyển từ `PENDING` sang `COMPLETED`, lưu `payosTransactionId`. | 🟢 **PASS (Automated Suite)**: Logic ACID đã chứng minh. |
| **9** | Backend ghi sổ cái dòng tiền `Transaction`. | `Transaction` Ledger Model | Sinh 1 bản ghi `Transaction` duy nhất mã `ENROLLMENT_PAYMENT` (+10.000 VNĐ). | 🟢 **PASS (Automated Suite)**: Idempotency đảm bảo duy nhất. |
| **10**| Backend tự động chuyển đổi `Enrollment`. | `Enrollment` Model | `Enrollment.status` chuyển sang `CONFIRMED`, `Class.currentStudents` tăng 1. | 🟢 **PASS (Automated Suite)**: Xác minh tự động, không Admin. |
| **11**| Học viên được cấp quyền truy cập Lớp học. | Protected Class Service | Học viên truy cập lớp học thành công, xem danh sách bài học và buổi học. | 🟢 **PASS (Automated Suite)**: Truy cập thành công tức thì. |
| **12**| Backend phân bổ thu nhập giáo viên. | `TeacherEarning` Model | Bản ghi `TeacherEarning` tạo với trạng thái `PENDING`, đúng tỷ lệ hoa hồng. | 🟢 **PASS (Automated Suite)**: Không trùng lặp earning. |
| **13**| Cập nhật số liệu trên Finance Dashboard. | Admin Finance Dashboard | Doanh thu học phí tăng 10.000 VNĐ, đồ thị dòng tiền cập nhật tức thời. | 🟢 **PASS (Local Verify)**: Aggregate MongoDB phản ánh đúng. |
| **14**| Chuyên viên đối soát với sao kê ngân hàng số. | Sao kê tài khoản nhận | Số dư tài khoản ngân hàng tăng đúng 10.000 VNĐ, mã giao dịch trùng khớp payOS. | 🔴 **NOT_RUN**: Chưa có biến động số dư thực tế. |

---

## PHẦN III: QUY TẮC DỪNG KHẨN CẤP (EMERGENCY BRAKE PROTOCOL)

Trong quá trình tiến hành phiên Live Pilot khi được duyệt:
1. **DỪNG NGAY LẬP TỨC** nếu bất kỳ bước nào từ Bước 4 đến Bước 14 trả về lỗi, timeout hoặc sai lệch số tiền.
2. **GIỮ NGUYÊN CHỨNG TỪ**: Chụp ảnh màn hình ứng dụng ngân hàng, lưu log webhook tại máy chủ, xuất bản ghi database liên quan.
3. **TUYỆT ĐỐI KHÔNG TỰ Ý RETRY CHUYỂN KHOẢN**: Nghiêm cấm chuyển thêm tiền lần 2 để "thử lại" khi chưa xác định được nguyên nhân lỗi của giao dịch trước.
4. **BÁO CÁO TEAM LEADER**: Mở bản ghi `PaymentReconciliation` và lập báo cáo sự cố trong vòng 15 phút.

