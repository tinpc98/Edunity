# BÁO CÁO PHÂN TÍCH KHOẢNG TRỐNG NGHIỆM THU CUỐI CÙNG (FINAL ACCEPTANCE GAP ANALYSIS)
# DOCUMENT: 09_FINAL_ACCEPTANCE_GAP_ANALYSIS.md
# NHIỆM VỤ: EDUNITY-V3-FULL-INTEGRATION-AUDIT

> **Dự án**: EDUNITY V3 — Nền tảng Giáo dục Trực tuyến & Gây quỹ Học bổng  
> **Chủ nhiệm kiểm toán**: Principal Software Architect + QA Lead  
> **Chế độ**: STRICT READ-ONLY AUDIT  
> **Thời điểm xác lập**: 11/11/2026  
> **Mục tiêu**: Đánh giá toàn diện mức độ đáp ứng của hệ thống so với tài liệu SRS gốc, SRS Addendum V3 và Kế hoạch phân công 4 thành viên; xác định chính xác các điểm chặn (Blockers) cần giải quyết trước khi có thể nghiệm thu toàn diện và triển khai Staging/Production.

---

## 1. MA TRẬN ĐỐI CHIẾU MỨC ĐỘ TUÂN THỦ TÀI LIỆU SRS (SRS CONFORMANCE MATRIX)

```
+-----------------------------------+---------------+-------------------+-----------------------------------------------------------------------------+
| PHÂN HỆ NGHIỆP VỤ (MODULE)        | MỨC ĐỘ SRS    | TỶ LỆ ĐÁP ỨNG     | TỔNG KẾT HIỆN TRẠNG & KHOẢNG TRỐNG KỸ THUẬT                                 |
+-----------------------------------+---------------+-------------------+-----------------------------------------------------------------------------+
| 1. Authentication & RBAC          | Bắt buộc      | **95% (PASS)**    | Đầy đủ JWT, Refresh Token, RBAC 4 role. Cần khóa dev-login ngoài dev.      |
| 2. Course Catalog & Pricing       | Bắt buộc      | **80% (PASS)**    | Category, Subject, Course, Proposal hoàn thiện. Thiếu CoursePricingPolicy.  |
| 3. Teacher Onboarding & Verify    | Bắt buộc      | **75% (PARTIAL)** | Đầy đủ KYC Upload, Admin Duyệt. Thiếu FPT.eContract và OCR CCCD.            |
| 4. Class & Schedule Management    | Bắt buộc      | **95% (PASS)**    | Tạo lớp, duyệt lớp, sinh Session, chống trùng lịch hoạt động toàn diện.     |
| 5. Enrollment & Capacity Hold     | Bắt buộc      | **100% (PASS)**   | Giữ chỗ 15m, giải phóng ghế tự động, đa nguồn thanh toán đạt chuẩn 100%.    |
| 6. Live Classroom & Attendance    | Bắt buộc      | **95% (PASS)**    | Phòng chờ 10m, trễ 5m, chặn 20m, chuyên cần 70% đã kiểm thử thực tế.        |
| 7. Session Incidents & Makeup     | Bắt buộc      | **90% (PASS)**    | Báo cáo sự cố, duyệt dạy bù, liên kết buổi học, chặn rút tiền khi có sự cố. |
| 8. LMS Homework & Assessments     | Bắt buộc      | **0% (MISSING)**  | Chưa có Assignment, Submission, Question, Exam, Rubric cả ở BE lẫn FE.      |
| 9. Scholarship Campaigns          | Bắt buộc      | **90% (PASS)**    | Tạo chiến dịch, quản lý ngân sách, đóng góp qua VietQR hoạt động chuẩn.     |
| 10. Scholarship Aid & Allocation  | Bắt buộc      | **80% (PARTIAL)** | Nộp đơn, duyệt đơn, cấp học bổng, mixed payment PASS. Thiếu hồ sơ bưu điện. |
| 11. Payment & Finance Engine      | Cốt lõi       | **100% (PASS)**   | PR1–PR10 hoàn tất: VietQR, Webhook, Outbox, Reconciliation, Ledger PASS.    |
| 12. Settlement & Payout Engine    | Cốt lõi       | **100% (PASS)**   | Rút tiền thứ Hai, chi trả thứ Sáu, Four-Eyes, BankProofRegistry PASS.       |
| 13. Refund & Reconciliation       | Cốt lõi       | **100% (PASS)**   | Four-Eyes Dual Verification, khóa hoàn tiền tự động, bảo vệ sổ cái PASS.    |
| 14. Admin Finance Dashboard       | Cốt lõi       | **100% (PASS)**   | Đầy đủ 6 màn hình quản trị tài chính, đối soát, giao dịch và sự kiện bank.  |
| 15. Notification & Community      | Bổ trợ        | **90% (PASS)**    | Tin nhắn nội bộ, thông báo in-app, khiếu nại báo cáo vi phạm hoàn thiện.   |
+-----------------------------------+---------------+-------------------+-----------------------------------------------------------------------------+
| **TOÀN BỘ DỰ ÁN EDUNITY V3**      | TỔNG THỂ      | **85.0% ĐẠT**     | **SẴN SÀNG NGHIỆM THU SAU KHI BỔ SUNG PHÂN HỆ LMS VÀ HỢP ĐỒNG GIÁO VIÊN**   |
+-----------------------------------+---------------+-------------------+-----------------------------------------------------------------------------+
```

---

## 2. DANH MỤC 4 ĐIỂM CHẶN LỚN NHẤT TRƯỚC KHI BÀN GIAO TOÀN DỰ ÁN

Để đạt điều kiện nghiệm thu toàn diện dự án (Milestone Phase B Sign-off), 4 điểm chặn sau đây bắt buộc phải được giải quyết:

### Blocker 1: Khoảng trống phân hệ LMS Học tập (LMS Functional Gap)
- **Mô tả**: Yêu cầu cốt lõi trong SRS G3 về giao bài tập về nhà, học sinh nộp bài, giáo viên chấm điểm (rubric) và bài thi kiểm tra năng lực đầu vào chưa được cài đặt trong source code.
- **Tác động**: Hệ thống hiện tại có thể dạy học trực tiếp qua video (LiveKit), nhưng chưa hỗ trợ đầy đủ quy trình sư phạm sau giờ học.
- **Hành động bắt buộc**: Châu (Backend) hoàn thiện Mongoose schemas và API; Băng (Frontend) dựng giao diện nộp bài và chấm điểm trong Sprint tiếp theo.

### Blocker 2: Cổng kiểm soát Hợp đồng Giáo viên (FPT.eContract Gate)
- **Mô tả**: SRS quy định giáo viên chỉ được phép mở lớp khi: Hồ sơ đã VERIFIED + Đã ký hợp đồng điện tử ACTIVE + Được duyệt danh mục môn dạy tương ứng.
- **Tác động**: Hiện tại `teacherClassService.js` mới chỉ kiểm tra trạng thái `VERIFIED`, chưa chặn gate hợp đồng và chưa kiểm tra môn dạy được cấp phép.
- **Hành động bắt buộc**: Bảo xây dựng Adapter hoặc Mock Contract State Machine; Châu bổ sung điều kiện kiểm tra hợp đồng vào service mở lớp.

### Blocker 3: Cơ chế đối chiếu Hồ sơ Học bổng Giấy (Paper Dossier Tracking)
- **Mô tả**: Theo chỉ đạo của Team Leader, các gói học bổng lớn đòi hỏi đối chiếu 2 bản: bản mềm upload trên hệ thống và bản cứng có công chứng gửi qua bưu điện.
- **Tác động**: Chưa có trường dữ liệu và màn hình để Admin xác nhận đã nhận bản cứng trước khi giải ngân học bổng.
- **Hành động bắt buộc**: Châu bổ sung model `PaperDossierReceipt`; Băng bổ sung giao diện quản lý vận đơn bưu điện vào màn hình duyệt đơn.

### Blocker 4: Chuẩn hóa Script Test CI/CD trên môi trường Windows
- **Mô tả**: Khi chạy song song toàn bộ 28 test suites bằng `npm test`, hệ điều hành Windows gặp lỗi tranh chấp socket trên các tiến trình `mongod.exe` nội bộ, dẫn đến 17 suites bị crash giả lập.
- **Tác động**: Gây hiểu nhầm về chất lượng code khi chạy lệnh kiểm thử tự động.
- **Hành động bắt buộc**: Tin cấu hình script `"test:ci": "jest --runInBand"` vào `package.json` và tài liệu hướng dẫn kiểm thử.

---

## 3. LỘ TRÌNH 5 PHA ĐỂ ĐẠT TRẠNG THÁI RELEASE READINESS

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              ĐIỀU KIỆN TIÊN QUYẾT TỪNG PHA                             │
└────────────────────────────────────────────────────────────────────────────────────────┘

  [ PHA A: LOCAL DEVELOPMENT ] (HIỆN TẠI - 85% HOÀN THÀNH)
  - Hoàn thiện 4 Blockers nêu trên (LMS Bài tập, FPT.eContract, Hồ sơ bưu điện).
  - Tất cả các test suites Backend và Frontend chạy PASS 100% trên Local.
  - TIÊU CHÍ QUA CỔNG: Toàn bộ 106 đầu việc trong checklist đạt trạng thái DONE.

  [ PHA B: FULL PROJECT ACCEPTANCE ] (NGHIỆM THU TOÀN DIỆN MÃ NGUỒN)
  - Team Leader chủ trì buổi nghiệm thu chéo giữa 4 thành viên.
  - Rà soát toàn bộ Git Working Tree, gom các thay đổi từ PR1–PR11 và các module thành commit sạch.
  - Ký biên bản nghiệm thu kỹ thuật (Codebase Sign-off).

  [ PHA C: DEPLOYMENT PREPARATION ] (KHỞI TẠO HẠ TẦNG STAGING)
  - Thuê VPS Staging và trỏ 2 domain HTTPS: `staging.edunity.vn` và `api-staging.edunity.vn`.
  - Cấu hình Nginx Reverse Proxy, SSL Let's Encrypt và MongoDB Replica Set có giao dịch ACID.
  - Nạp biến môi trường bí mật qua file cấu hình máy chủ.

  [ PHA D: PAYOS LIVE PILOT ] (DIỄN TẬP TIỀN THẬT CÓ KIỂM SOÁT)
  - Đăng ký Webhook 2 kênh trên Portal payOS Doanh nghiệp thật.
  - Bắt tay Test Probe thành công (`200 OK`).
  - Thực hiện 10 giao dịch tiền thật giới hạn (100.000 VNĐ) có 3 bên giám sát trực tiếp.
  - Đối soát 100% sao kê ngân hàng thật.

  [ PHA E: PRODUCTION RELEASE ] (PHÁT HÀNH CÔNG KHAI)
  - Mở cổng thanh toán và triển khai hệ thống cho người dùng thực tế.
```

---

## 4. KẾT LUẬN & CAM KẾT ĐẢM BẢO CHẤT LƯỢNG

1. **Khẳng định tính ổn định của Nền tảng**: Hệ sinh thái cốt lõi của Edunity V3 — bao gồm Lớp học trực tuyến LiveKit, Quản lý tài chính, Sổ cái, Ghi danh, Học bổng và Bảng điều khiển Quản trị — đã đạt mức độ hoàn thiện cao, bảo đảm tuyệt đối tính an toàn dữ liệu và toàn vẹn sổ cái.
2. **Không áp lực hạ tầng sớm**: Toàn đội ngũ tập trung giải quyết dứt điểm các khoảng trống LMS và Hợp đồng giáo viên trên môi trường Local trước khi đầu tư chi phí máy chủ và tên miền.
3. **Kỷ luật bảo toàn mã nguồn**: Tuân thủ tuyệt đối quy tắc không tự ý commit, merge hay push trong giai đoạn kiểm toán.

