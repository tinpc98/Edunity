# KỊCH BẢN DIỄN TẬP PILOT THANH TOÁN TIỀN THẬT CÓ KIỂM SOÁT
# DOCUMENT: 20_CONTROLLED_LIVE_PILOT_RUNBOOK.md
# NHIỆM VỤ: TIN-FIN-PR11 — STAGING INFRASTRUCTURE & PAYOS DEPLOYMENT PREPARATION

> **Dự án**: EDUNITY V3 — Hệ thống Thanh toán & Quản trị Tài chính  
> **Chủ nhiệm**: Tin — Senior DevOps Architect + Financial Security Auditor + QA Lead  
> **Quy mô diễn tập**: 10 giao dịch tiền thật giới hạn (5 Học phí + 5 Học bổng)  
> **Mức tiền thử nghiệm**: 10.000 VNĐ / giao dịch (Tổng giải ngân diễn tập: 100.000 VNĐ)  
> **NGUYÊN TẮC BẮT BUỘC**: TÀI LIỆU CHỈ HƯỚNG DẪN QUY TRÌNH. TUYỆT ĐỐI KHÔNG TỰ Ý CHUYỂN TIỀN KHI CHƯA CÓ LỆNH PHÊ DUYỆT TỪ BAN GIÁM ĐỐC.  

---

## 1. NGUYÊN TẮC AN TOÀN VÀ ĐIỀU KIỆN TIÊN QUYẾT (PREFLIGHT GATES)

Trước khi kích hoạt bất kỳ giao dịch quét mã VietQR thật nào trên Staging, toàn bộ các điều kiện sau đây phải được thỏa mãn:
1. **Phê duyệt nhân sự (Three-Party Sign-off)**: Phải có mặt đồng thời 3 nhân sự:
   - Team Leader Kỹ thuật & Kiến trúc sư Thanh toán (Tin).
   - Kế toán trưởng / Đại diện Tài chính Edunity.
   - DevOps / Hạ tầng phụ trách theo dõi log trực tiếp.
2. **Môi trường cách ly hoàn toàn**:
   - Máy chủ Staging chạy trên database `edunity_staging` (không có bất kỳ liên kết nào tới Production DB).
   - Tên miền đã có chứng chỉ HTTPS TLS 1.2+ hợp lệ.
   - Hai Webhook URL đã được đăng ký và xác nhận thành công trên payOS Portal.
3. **Khóa luồng Tiền Ra (Zero Outbound Execution)**:
   - Nghiêm cấm hoàn tiền tự động qua API.
   - Nghiêm cấm giải ngân thù lao cho giáo viên tự động qua API.
   - Mọi khoản tiền pilot vào tài khoản doanh nghiệp sẽ được kế toán quản lý và hạch toán vào mục "Chi phí diễn tập kỹ thuật".

---

## 2. KỊCH BẢN DIỄN TẬP KÊNH 1: TUITION (HỌC PHÍ) — 5 TEST CASES

### Mục tiêu:
Xác minh học sinh quét mã VietQR -> payOS báo có tiền vào tài khoản Doanh nghiệp -> Webhook gửi về -> Kích hoạt ghi danh `CONFIRMED` -> Ghi nhận doanh thu 10% cho Edunity -> Ghi nhận 90% thù lao `PENDING` cho Giảng viên.

```
+-----------+--------------------+---------------+------------------------------------------------------+-----------------------------------------------+
| TEST ID   | KỊCH BẢN THỬ NGHIỆM| SỐ TIỀN THỰC  | MỤC TIÊU KIỂM CHỨNG KỸ THUẬT                         | TIÊU CHÍ ĐẠT (PASS CRITERIA)                  |
+-----------+--------------------+---------------+------------------------------------------------------+-----------------------------------------------+
| TUI-PL-01 | Thanh toán chuẩn   | 10.000 VNĐ    | Chu trình đơn hàng chuẩn, webhook phản hồi < 500ms   | Payment COMPLETED, Enrollment CONFIRMED,      |
|           | đúng số tiền       |               |                                                      | Earning 9.000đ PENDING, Fee 1.000đ            |
+-----------+--------------------+---------------+------------------------------------------------------+-----------------------------------------------+
| TUI-PL-02 | Webhook gửi lặp lại| 10.000 VNĐ    | Mô phỏng payOS gửi lại webhook lần 2 (Retry / Dup)   | Idempotency kích hoạt: Trả về HTTP 200,       |
|           | (Duplicate Webhook)| (Lấy từ TC01) |                                                      | không tạo thêm Transaction kép, không cộng kép|
+-----------+--------------------+---------------+------------------------------------------------------+-----------------------------------------------+
| TUI-PL-03 | Thanh toán lớp học | 10.000 VNĐ    | Kiểm tra lớp học có nhiều học sinh cùng ghi danh     | Enrollment tăng sĩ số đúng 1,                 |
|           | thứ 2 (Multi-class)|               |                                                      | OrderCode sinh tăng dần duy nhất              |
+-----------+--------------------+---------------+------------------------------------------------------+-----------------------------------------------+
| TUI-PL-04 | Chuyển khoản thiếu | 5.000 VNĐ     | Người dùng cố tình sửa số tiền trên App ngân hàng     | Bị đưa vào hàng đợi Reconciliation Queue:     |
|           | (Underpayment)     | (Thiếu 5.000đ)|                                                      | Payment PARTIAL/FLAGGED, Enrollment KHÔNG mở  |
+-----------+--------------------+---------------+------------------------------------------------------+-----------------------------------------------+
| TUI-PL-05 | Chuyển khoản sai mã| 10.000 VNĐ    | Người dùng sửa memo chuyển khoản (Sai OrderCode)     | Bị đưa vào Reconciliation Queue:              |
|           | memo (Wrong Memo)  |               |                                                      | Cảnh báo UNMATCHED_ORDER_CODE, Audit Log ghi nhận|
+-----------+--------------------+---------------+------------------------------------------------------+-----------------------------------------------+
```

---

## 3. KỊCH BẢN DIỄN TẬP KÊNH 2: DONATION (HỌC BỔNG) — 5 TEST CASES

### Mục tiêu:
Xác minh Nhà tài trợ đóng góp Quỹ học bổng -> payOS báo có tiền vào tài khoản Quỹ -> Webhook Kênh Donation xác thực -> Bảo toàn 100% tiền tài trợ -> Tăng ngân sách chiến dịch học bổng (`currentFund`) -> Phí nền tảng bằng 0 VNĐ.

```
+-----------+--------------------+---------------+------------------------------------------------------+-----------------------------------------------+
| TEST ID   | KỊCH BẢN THỬ NGHIỆM| SỐ TIỀN THỰC  | MỤC TIÊU KIỂM CHỨNG KỸ THUẬT                         | TIÊU CHÍ ĐẠT (PASS CRITERIA)                  |
+-----------+--------------------+---------------+------------------------------------------------------+-----------------------------------------------+
| DON-PL-01 | Quyên góp chuẩn    | 10.000 VNĐ    | Chu trình tài trợ chiến dịch chuẩn, memo EDUNITY DON | Contribution COMPLETED, Campaign tăng đúng    |
|           | đúng số tiền       |               |                                                      | 10.000đ, PlatformFee = 0đ, Earning = 0đ       |
+-----------+--------------------+---------------+------------------------------------------------------+-----------------------------------------------+
| DON-PL-02 | Webhook gửi lặp lại| 10.000 VNĐ    | Mô phỏng payOS gửi lại webhook tài trợ lần 2         | Idempotency: HTTP 200, không tăng quỹ 2 lần   |
|           | (Duplicate Webhook)| (Lấy từ TC01) |                                                      | (Quỹ chỉ tăng chính xác 10.000đ một lần)      |
+-----------+--------------------+---------------+------------------------------------------------------+-----------------------------------------------+
| DON-PL-03 | Quyên góp chiến dịch| 10.000 VNĐ   | Kiểm tra tăng số lượng nhà tài trợ (donorCount)      | `donorCount` tăng +1, hiển thị vinh danh trên |
|           | thứ 2 (Campaign B) |               |                                                      | giao diện Frontend Chiến dịch                 |
+-----------+--------------------+---------------+------------------------------------------------------+-----------------------------------------------+
| DON-PL-04 | Nhầm lẫn chéo kênh | 10.000 VNĐ    | Gửi webhook ký bằng key Donation sang router Tuition | Chữ ký số không khớp: Bị từ chối HTTP 400    |
|           | (Cross-channel key)|               |                                                      | Không có tiền nào được cộng nhầm vào lớp học  |
+-----------+--------------------+---------------+------------------------------------------------------+-----------------------------------------------+
| DON-PL-05 | Chuyển khoản thiếu | 5.000 VNĐ     | Tài trợ số tiền khác với đăng ký ban đầu             | Ghi nhận số tiền thực nhận 5.000đ vào quỹ,    |
|           | số tiền đăng ký    |               |                                                      | Audit log lưu chênh lệch kỳ vọng             |
+-----------+--------------------+---------------+------------------------------------------------------+-----------------------------------------------+
```

---

## 4. BIỂU MẪU ĐỐI SOÁT TỪNG GIAO DỊCH (PILOT AUDIT SHEET)

Mỗi giao dịch diễn tập bắt buộc phải điền đầy đủ các trường vào biên bản đối soát tài chính:

```
================================================================================
BIÊN BẢN ĐỐI SOÁT GIAO DỊCH PILOT THỰC TẾ
================================================================================
1. Mã kiểm thử (Test Case ID):          [ TUI-PL-01 / DON-PL-01 ... ]
2. Kênh thanh toán (Channel):            [ TUITION / DONATION ]
3. Mã đơn hàng (OrderCode):              [ VD: 100099 ]
4. Số tiền kỳ vọng (Expected Amount):   [ 10.000 VNĐ ]
5. Số tiền thực nhận (Received Amount):  [ 10.000 VNĐ ]
6. Mã tham chiếu ngân hàng (Bank Ref):   [ VD: FT261110998877 ]
7. Thời điểm quét mã (Client Scan Time): [ 2026-11-10T14:30:15Z ]
8. Thời điểm nhận Webhook (Server Time): [ 2026-11-10T14:30:17Z ]
9. Trạng thái HTTP Webhook:              [ 200 OK / Response Time: 320ms ]
10. Trạng thái Database (DB State):
    - Payment / Contribution ID:        [ ObjectId(...) ]
    - Status:                            [ COMPLETED ]
    - Enrollment / Campaign Updated:    [ YES ]
    - TeacherEarning Status & Amount:   [ PENDING: 9.000đ ]
    - Platform Fee Recorded:            [ 1.000đ ]
11. Đối soát Sao kê Ngân hàng thật:
    - Tiền thực tế đã vào tài khoản:    [ XÁC NHẬN CÓ TIỀN ]
    - Nội dung hiển thị trên sao kê:     [ EDUNITY 100099 ]
12. Kết luận:                            [ PASS / FAIL ]
13. Chữ ký Kế toán trưởng:               [ ĐÃ KÝ ]
14. Chữ ký Trưởng nhóm Kỹ thuật (Tin):   [ ĐÃ KÝ ]
================================================================================
```

---

## 5. KẾ HOẠCH XỬ LÝ VÀ HOÀN TRẢ TIỀN DIỄN TẬP (RECONCILIATION & DISPOSITION)

1. **Tổng số tiền tham gia diễn tập**:
   Tối đa `100.000 VNĐ` (10 giao dịch x 10.000 VNĐ).
2. **Quy chế xử lý tiền trong tài khoản**:
   - Đối với Kênh Học phí: Số tiền 50.000 VNĐ sẽ được giữ lại trong tài khoản Doanh nghiệp Edunity và hạch toán vào mục "Kinh phí kiểm thử phần mềm V3".
   - Đối với Kênh Học bổng: Số tiền 50.000 VNĐ được giữ nguyên vẹn trong tài khoản Quỹ học bổng Edunity, đóng góp thẳng vào chiến dịch bảo trợ học sinh nghèo.
   - **Tuyệt đối không chuyển trả lại qua API** để bảo toàn nguyên tắc Zero Outbound Money.

