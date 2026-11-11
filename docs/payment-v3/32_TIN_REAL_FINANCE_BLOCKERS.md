# 32 — DANH MỤC CÁC ĐIỂM NGHẼN, RÀO CẢN VÀ ĐIỀU KIỆN TIÊN QUYẾT CHO HỆ THỐNG THẬT
**DỰ ÁN: EDUNITY V3**  
**TASK:** `TIN-FIN-REAL-END-TO-END-AUDIT`  
**OWNER:** TÍN — PAYMENT & FINANCE  
**CHẾ ĐỘ:** REAL INTEGRATION FIRST / RISK & BLOCKER REGISTRATION  
**NGÀY LẬP:** 11/11/2026  

---

## I. CÁC ĐIỂM NGHẼN VỀ CHÍNH SÁCH TÀI CHÍNH (POLICY BLOCKERS)

Các quy tắc kinh doanh dưới đây đang được áp dụng theo giả định kỹ thuật trong mã nguồn nhưng CHƯA CÓ VĂN BẢN PHÊ DUYỆT CHÍNH THỨC từ Hội đồng Trường hoặc Ban Giám Đốc Dự án:

1. **Chính sách tỷ lệ chiết khấu sàn 10% / thù lao giáo viên 90% (`POLICY-COMMISSION-01`):**
   - *Hiện trạng:* Mã nguồn tại `financialDispatchService.js` và `TeacherEarning.js` đang mặc định snapshot tỷ lệ `commissionRate: 0.1` (10% sàn, 90% giáo viên).
   - *Rủi ro:* Chưa có quyết định chính thức bằng văn bản về cơ cấu phân chia doanh thu, có thể dẫn đến khiếu nại pháp lý hoặc sai lệch quyết toán thuế thu nhập cá nhân của giảng viên.
   - *Hành động yêu cầu:* Ban Giám Đốc cần ban hành Quy chế Tài chính Giảng viên chính thức.

2. **Chính sách xử lý tiền đóng muộn BR-49 (`POLICY-LATE-PAYMENT-02`):**
   - *Hiện trạng:* Khi tiền về muộn sau 15 phút và lớp đã đầy, hệ thống ghi nhận vào `UNAPPLIED_TUITION_RECEIPT` và đưa vào `PaymentReconciliation`.
   - *Rủi ro:* Chưa có quy chế rõ ràng: Tiền này sẽ tự động hoàn trả vào tài khoản học viên, hay giữ lại làm số dư tín dụng (Credit/Voucher) để học viên đăng ký lớp khác?
   - *Hành động yêu cầu:* Ban hành chính sách hoàn trả giao dịch trễ hạn.

3. **Quy định thời gian giữ đối soát 7 ngày (`POLICY-SETTLEMENT-HOLD-03`):**
   - *Hiện trạng:* Tham số `SETTLEMENT_HOLD_DAYS = 7` đang tính theo 7 ngày lịch (168 giờ liên tục).
   - *Rủi ro:* Trong các dịp nghỉ lễ dài ngày (Tết Nguyên Đán, Quốc khánh), 7 ngày lịch có thể không đủ thời gian làm việc để kế toán xử lý khiếu nại của học viên.
   - *Hành động yêu cầu:* Xác nhận bằng văn bản: Tính theo 7 ngày lịch hay 7 ngày làm việc (Business days).

---

## II. SỰ PHỤ THUỘC VÀO CÁC OWNER KHÁC (OWNER DEPENDENCIES)

Tín chịu trách nhiệm toàn bộ về dòng tiền, Sổ cái, Cổng thanh toán và Quyết toán. Tuy nhiên, các phân hệ tài chính không thể vận hành độc lập nếu thiếu dữ liệu đầu vào từ các Owner khác:

| Mã phụ thuộc | Chủ sở hữu (Owner) | Phân hệ liên quan | Chi tiết điểm nghẽn | Trạng thái hiện tại |
| :--- | :---: | :--- | :--- | :---: |
| **DEP-CHAU-01** | **Châu** | `Course / Class Management` | Thiếu luồng đóng học thuật lớp học (`Class.status = "COMPLETED"`). Nếu lớp không được đóng chính thức từ phân hệ của Châu, quy trình Settlement 7 ngày của Tín sẽ không bao giờ được kích hoạt. | **BLOCKING** |
| **DEP-CHAU-02** | **Châu** | `Session / Makeup / Incident` | Cơ chế duyệt dạy bù (`SessionRescheduleRequest`) và giải quyết sự cố (`TeacherIncidentReport`) chưa khép kín, khiến `TeacherSettlement` luôn ở trạng thái `WAITING_ACADEMIC_CLOSURE`. | **BLOCKING** |
| **DEP-CHAU-03** | **Châu** | `Scholarship Application` | Quy trình thẩm định và duyệt hồ sơ học sinh (`AID-01`, `AID-04`) chưa hoàn thiện. Tín không thể giải ngân học bổng thật nếu không có hồ sơ `APPROVED` hợp pháp từ Châu. | **BLOCKING** |
| **DEP-BAO-01** | **Bảo** | `Teacher Verification & Bank Account` | Thẩm định tài khoản ngân hàng chính chủ của giáo viên (`TEA-13`). Tín yêu cầu tài khoản ngân hàng phải được Bảo thẩm định để chống rửa tiền hoặc rút tiền sai chủ tài khoản. | **BLOCKING** |
| **DEP-BAO-02** | **Bảo** | `Minor Data Privacy & Consent` | Cơ chế bảo vệ dữ liệu nhạy cảm của người thụ hưởng học bổng dưới 15 tuổi (Nghị định 13/2023/NĐ-CP) chưa hoàn tất. Tín không thể xuất báo cáo nhà tài trợ công khai nếu chưa được che dữ liệu. | **BLOCKING** |
| **DEP-BANG-01** | **Băng** | `Student Learning UI & Dispute` | Giao diện học viên chưa có nút khiếu nại trực tiếp buổi học bị sự cố, dẫn đến rủi ro học viên không thể gửi yêu cầu hoàn phí trong thời hạn 7 ngày đối soát. | **PENDING** |

---

## III. DANH SÁCH CÁC FILE DÙNG CHUNG CẦN ĐƯỢC CÁC OWNER REVIEW

Trong quá trình triển khai PR1 đến PR11, Tín đã bổ sung các trường dữ liệu tài chính vào một số file dùng chung. Danh sách các file này cần được các Owner liên quan rà soát để đảm bảo không xung đột nghiệp vụ:

1. `BackEnd/src/models/index.js` (Export các models mới: `BankTransferEvent`, `PaymentReconciliation`, `BankProofRegistry`, `TeacherSettlement`, `RefundCase`).  
   → **Người cần review:** Toàn bộ team.
2. `BackEnd/src/services/classLifecycleService.js` (Bổ sung chốt chặn không mở `TeacherEarning` ngay khi lớp hoàn thành mà phải chuyển sang `TeacherSettlement`).  
   → **Người cần review:** **Châu** (Owner Class Lifecycle).
3. `BackEnd/src/services/scholarshipService.js` (Tách biệt hàm cấp phát quỹ an toàn sang `scholarshipPaymentService.js`).  
   → **Người cần review:** **Châu** (Owner Scholarship).
4. `FrontEnd/src/features/campaign/CampaignDetailPage.tsx` (Tích hợp form ủng hộ tài trợ qua VietQR payOS Kênh 2).  
   → **Người cần review:** **Băng** (Owner UI Công khai) & **Châu** (Owner Chiến dịch).
5. `BackEnd/src/config/db.js` (Cần gỡ bỏ cấu hình cứng `dns.setServers(["1.1.1.1", "8.8.8.8"])` trước khi deploy Docker/VPC).  
   → **Người cần review:** **Bảo** (Owner System Infrastructure).

---

## IV. BẢNG ĐÁNH GIÁ QUYẾT ĐỊNH GO / NO-GO CHO TỪNG LUỒNG TÀI CHÍNH

| Luồng nghiệp vụ tài chính | Trạng thái kiến trúc / Code | Trạng thái tích hợp thật | Quyết định hiện tại | Điều kiện để chuyển sang GO |
| :--- | :---: | :---: | :---: | :--- |
| **1. Kênh Thu Học phí (Tuition Inbound)** | **SẴN SÀNG** | `CONFIGURED` (Chưa nạp tiền thật) | **NO-GO** | 1. Có Staging HTTPS tiếp nhận Webhook.<br>2. Ký hợp đồng tích hợp chính thức với payOS.<br>3. Chạy thành công Pilot 10.000 VNĐ. |
| **2. Kênh Thu Tài trợ (Donation Inbound)** | **SẴN SÀNG** | `CONFIGURED` (Chưa nạp tiền thật) | **NO-GO** | 1. Đăng ký Webhook Kênh Tài trợ riêng biệt.<br>2. Chạy thành công Pilot 10.000 VNĐ vào Quỹ. |
| **3. Cấp phát Quỹ Học bổng (Fund Allocation)** | **SẴN SÀNG** | `OWNER_BLOCKED` | **NO-GO** | 1. Châu hoàn tất luồng duyệt hồ sơ học sinh `AID-01`/`04`.<br>2. Bảo hoàn tất xác nhận đồng ý của phụ huynh. |
| **4. Quyết toán Thù lao (Teacher Settlement)** | **SẴN SÀNG** | `OWNER_BLOCKED` | **NO-GO** | 1. Châu hoàn tất quy trình đóng học thuật lớp học.<br>2. Phê duyệt văn bản tỷ lệ chiết khấu sàn 10%. |
| **5. Rút tiền & Chi trả (Teacher Payout)** | **SẴN SÀNG** | `NOT_REAL_VERIFIED` | **NO-GO** | 1. Bảo thẩm định tài khoản ngân hàng giáo viên.<br>2. Thiết lập quy trình Four-Eyes giữa 2 Admin có thẩm quyền. |
| **6. Hoàn tiền & Đối soát (Refund Engine)** | **SẴN SÀNG** | `NOT_REAL_VERIFIED` | **NO-GO** | 1. Ban hành Quy chế hoàn tiền chính thức.<br>2. Kiểm thử chuyển khoản hoàn tiền thật trên Staging. |

---

## V. KẾT LUẬN CHUNG
Hệ thống tài chính EDUNITY V3 do Tín phụ trách đã đạt trạng thái **SẴN SÀNG VỀ MẶT KIẾN TRÚC VÀ MÃ NGUỒN (CODE READINESS: 100%)**, nhưng **CHƯA ĐỦ ĐIỀU KIỆN ĐỂ KÍCH HOẠT TIỀN THẬT NGAY LẬP TỨC (REAL MONEY E2E READINESS: 0%)** do thiếu hạ tầng Staging HTTPS công khai và đang bị nghẽn bởi các quy chế văn bản cùng các phân hệ phụ thuộc từ Châu và Bảo.

