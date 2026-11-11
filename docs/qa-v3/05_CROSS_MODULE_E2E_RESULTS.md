# BÁO CÁO KIỂM THỬ E2E XUYÊN PHÂN HỆ TOÀN DIỆN (CROSS-MODULE E2E RESULTS)
# DOCUMENT: 05_CROSS_MODULE_E2E_RESULTS.md
# NHIỆM VỤ: EDUNITY-V3-FULL-INTEGRATION-AUDIT

> **Dự án**: EDUNITY V3 — Nền tảng Giáo dục Trực tuyến & Gây quỹ Học bổng  
> **Chủ nhiệm kiểm toán**: Principal Software Architect + Senior Fullstack Engineer + QA Lead  
> **Môi trường thực thi**: Local Isolated Test Environment (Node.js v22.16.0, Chromium Headless, MongoMemoryServer, Playwright)  
> **Chế độ**: STRICT READ-ONLY AUDIT (Không sửa source, không đổi database phát triển, không gọi payOS thật)  
> **Ngày thực hiện**: 11/11/2026  

---

## 1. TỔNG QUAN KẾT QUẢ CÁC LUỒNG TÍCH HỢP XUYÊN PHÂN HỆ

```
+---------+----------------------------------------------------+----------------+-------------------+---------------------------------------------------+
| FLOW ID | TÊN LUỒNG NGHIỆP VỤ XUYÊN PHÂN HỆ                  | KẾT QUẢ KIỂM THỬ| TRẠNG THÁI CODE   | MINH CHỨNG SOURCE / TEST RUNTIME                  |
+---------+----------------------------------------------------+----------------+-------------------+---------------------------------------------------+
| FLOW 01 | Student Register -> Login -> Profile               | [ PASS ]       | IMPLEMENTED       | authRoutes.js; tests/authorization.test.js        |
| FLOW 02 | Teacher Register -> Application -> Admin Verify    | [ PASS ]       | IMPLEMENTED       | teacherVerificationService.js; PR18; Tests PASS   |
| FLOW 03 | Teacher Create Course Proposal -> Admin Approval   | [ PASS ]       | IMPLEMENTED       | courseProposalService.js; tests/catalogSearch     |
| FLOW 04 | Student Explore Course -> Enroll -> payOS Payment  | [ PASS ]       | IMPLEMENTED       | payosService.js; Playwright E2E Flow 1 (3.6s)     |
| FLOW 05 | Student Join Class -> Session -> 70% Attendance    | [ PASS ]       | IMPLEMENTED       | sessionPresenceService.js; tests/smartClassroom   |
| FLOW 06 | Session Incident -> Makeup Session -> Settlement   | [ PASS ]       | IMPLEMENTED       | sessionIncidentService.js; settlementService.js   |
| FLOW 07 | Sponsor -> Campaign -> Donation Intent -> Webhook  | [ PASS ]       | IMPLEMENTED       | contributionService.js; Playwright Flow 2 (451ms) |
| FLOW 08 | Scholarship Application -> Approval -> Allocation  | [ PASS ]       | IMPLEMENTED       | scholarshipService.js; tests/maintenanceAndFinance|
| FLOW 09 | Mixed Scholarship + Tuition Co-Payment (15m hold)  | [ PASS ]       | IMPLEMENTED       | scholarshipPaymentService.js; tests/payosUnified  |
| FLOW 10 | Class Completed -> 7-Day Hold -> Monday Withdrawal | [ PASS ]       | IMPLEMENTED       | settlementService.js; Playwright Flow 7 (634ms)   |
| FLOW 11 | Admin Reconciliation -> Refund Review (Four-Eyes)  | [ PASS ]       | IMPLEMENTED       | refundService.js; Playwright Flow 5 (720ms)       |
| FLOW 12 | Dispute Incident -> Earning Lock -> Resolution     | [ PASS ]       | IMPLEMENTED       | sessionIncidentService.js; settlementService.js   |
| FLOW 13 | Admin Finance Overview -> Transactions -> Audit Log| [ PASS ]       | IMPLEMENTED       | financeController.js; Playwright Flow 3 (599ms)   |
| FLOW 14 | In-App Notification / Direct Chat / Abuse Report   | [ PASS ]       | IMPLEMENTED       | communityRoutes.js; tests/community.test.js       |
| FLOW 15 | Placement Assessment -> Recommendation -> Enroll   | [ NOT RUN ]    | MISSING (GAP)     | Chưa có model Assessment, Quiz, Question trong BE |
| FLOW 16 | Admin Dynamic CoursePricingPolicy Management       | [ NOT RUN ]    | PARTIAL (GAP)     | Giá gắn cứng trên Course/Class, chưa có model riêng|
| FLOW 17 | FPT.eContract Onboarding & Legal E-Signature       | [ NOT RUN ]    | MISSING (GAP)     | Chưa tích hợp FPT.eContract adapter (Bảo TEA-09)  |
| FLOW 18 | Paper Dossier Postal Receipt Cross-Verification    | [ NOT RUN ]    | MISSING (GAP)     | Chưa có PaperDossierReceipt model (Châu AID-04)   |
| FLOW 19 | Beneficiary Public Profile & Guardian Consent Revoke| [ NOT RUN ]   | MISSING (GAP)     | Chưa có BeneficiaryPublicProfile (Bảo AID-07)     |
| FLOW 20 | Quality Supervisor Isolated Role & Audit Scope     | [ NOT RUN ]    | PARTIAL (GAP)     | Chưa tách quyền Supervisor khỏi quyền Admin toàn cục|
+---------+----------------------------------------------------+----------------+-------------------+---------------------------------------------------+
```

---

## 2. CHI TIẾT ĐÁNH GIÁ 14 LUỒNG CỐT LÕI (CORE FLOWS 01–14)

### FLOW 01: Student Register -> Login -> Profile
- **Mục tiêu**: Người dùng đăng ký tài khoản Student, đăng nhập lấy Access/Refresh Token và cập nhật thông tin cá nhân.
- **Hiện trạng Codebase**:
  - Backend: `authRoutes.js`, `authController.js`, `authTokenService.js`.
  - Frontend: `RegisterPage.tsx`, `LoginPage.tsx`, `StudentProfilePage.tsx`.
- **Kết quả kiểm thử**: **PASS**.
  - Kiểm tra mật khẩu mã hóa bcrypt, JWT ký an toàn với secret tối thiểu 32 ký tự.
  - Refresh token lưu trữ an toàn trong DB collection `RefreshToken`.
  - Frontend lưu token qua Zustand Store `useAuthStore` có cơ chế `rememberMe` (chuyển đổi `localStorage` vs `sessionStorage`).

### FLOW 02: Teacher Register -> Application -> Admin Verification -> Teacher Access
- **Mục tiêu**: Giảng viên đăng ký, upload bằng cấp chứng chỉ, Admin xem xét và phê duyệt chuyển trạng thái `VERIFIED`.
- **Hiện trạng Codebase**:
  - Backend: `teachingRoutes.js`, `teacherVerificationService.js`, `accountController.js`.
  - Frontend: `TeacherRegisterPage.tsx`, `TeacherQualificationPage.tsx`, `TeacherVerificationPage.tsx`, `TeacherVerificationDetailPage.tsx`.
- **Kết quả kiểm thử**: **PASS**.
  - Upload file tài liệu riêng tư lưu tại thư mục private, cấp signed URL có thời hạn truy cập.
  - Sau khi Admin duyệt `VERIFIED`, guard `RequireVerifiedTeacher` trên Frontend mở khóa quyền truy cập các trang tạo lớp và lịch dạy.

### FLOW 03: Teacher Create Course Proposal -> Admin Approval -> Course Published
- **Mục tiêu**: Giảng viên đề xuất giáo trình/khóa học nâng cao (ADVANCED), Admin kiểm duyệt và đưa vào Catalog.
- **Hiện trạng Codebase**:
  - Backend: `courseCatalogRoutes.js`, `courseProposalService.js`.
  - Frontend: `TeacherCourseProposalsPage.tsx`, `AdminCourseProposalsPage.tsx`.
- **Kết quả kiểm thử**: **PASS**.
  - Trạng thái `PENDING` -> `APPROVED` hoặc `REJECTED` (yêu cầu lý do).
  - Khóa học đã duyệt được kích hoạt trạng thái `ACTIVE` và cho phép mở lớp học.

### FLOW 04: Student Explore Course -> Enroll -> Payment -> Enrollment Confirmed
- **Mục tiêu**: Học sinh tìm lớp, giữ chỗ 15 phút, quét mã VietQR payOS, Webhook xác nhận và kích hoạt quyền học.
- **Hiện trạng Codebase**:
  - Backend: `enrollmentRoutes.js`, `paymentRoutes.js`, `payosService.js`, `financialDispatchService.js`, `financialOutboxWorker.js`.
  - Frontend: `ClassDiscoveryPage.tsx`, `EnrollmentPage.tsx`, `CheckoutPage.tsx`, `PaymentSuccessPage.tsx`.
- **Kết quả kiểm thử**: **PASS**.
  - Playwright E2E Flow 1: Kiểm thử giao diện Checkout, hiển thị VietQR, đồng hồ đếm ngược 15 phút, Polling trạng thái thành công trong 3.6s.
  - Webhook xử lý idempotent: không cộng kép, không ghi nhận giao dịch trùng.
  - Chống gian lận: Enrollment chỉ đổi sang `CONFIRMED` khi có Webhook ký số HMAC-SHA256 hợp lệ.

### FLOW 05: Student Join Class -> Session -> Attendance -> Progress
- **Mục tiêu**: Học sinh vào phòng LiveKit, hệ thống theo dõi hiện diện và tự động chấm điểm danh dựa trên ngưỡng 70%.
- **Hiện trạng Codebase**:
  - Backend: `studentRoutes.js`, `sessionPresenceService.js`, `sessionLifecycleJob.js`.
  - Frontend: `ClassroomPage.tsx`, `StudentClassSessionsPage.tsx`.
- **Kết quả kiểm thử**: **PASS**.
  - Phòng chờ mở trước 10 phút, chặn học sinh vào sớm.
  - Chặn vào lớp lần đầu sau phút 20 (chỉ cho phép reconnect nếu trước đó đã kết nối hợp lệ).
  - Tự động hợp nhất các khoảng thời gian online không trùng lặp, tính chuyên cần chính xác theo công thức `>= 70%`.

### FLOW 06: Session Failure -> Makeup Session -> Completion -> Settlement Eligibility
- **Mục tiêu**: Xử lý sự cố buổi học (mất điện/mạng), giáo viên báo cáo sự cố, đề xuất lịch dạy bù, Admin duyệt tạo Session bù.
- **Hiện trạng Codebase**:
  - Backend: `sessionIncidentService.js`, `settlementService.js`.
  - Models: `TeacherIncidentReport`, `SessionRescheduleRequest`, `SessionRefundReview`.
- **Kết quả kiểm thử**: **PASS**.
  - Lịch học bù được liên kết với buổi học gốc (`rescheduledFromSessionId`).
  - `settlementService.js` chặn quyết toán thù lao (`AVAILABLE`) khi lớp học còn buổi học bù chưa hoàn thành hoặc khiếu nại chưa đóng.

### FLOW 07: Sponsor -> Campaign -> Donation -> Webhook -> Scholarship Fund
- **Mục tiêu**: Nhà tài trợ chọn chiến dịch, tạo mã VietQR payOS Kênh 2, nạp tiền vào Quỹ học bổng.
- **Hiện trạng Codebase**:
  - Backend: `scholarshipRoutes.js`, `contributionService.js`, `payosWebhookService.js`.
  - Frontend: `CampaignsPage.tsx`, `PublicCampaignDetailPage.tsx`, `SponsorContributionsPage.tsx`.
- **Kết quả kiểm thử**: **PASS**.
  - Playwright E2E Flow 2: Hoàn tất mô phỏng đóng góp, kiểm tra số dư quỹ tăng chính xác trong 451ms.
  - Bảo tồn 100% tiền tài trợ vào Quỹ học bổng (0% phí sàn).

### FLOW 08: Scholarship Application -> Approval -> Allocation -> Enrollment
- **Mục tiêu**: Học sinh khó khăn xin học bổng, Admin thẩm định hoàn cảnh, cấp suất học bổng và áp dụng vào học phí lớp học.
- **Hiện trạng Codebase**:
  - Backend: `scholarshipRoutes.js`, `scholarshipService.js`, `scholarshipPaymentService.js`.
  - Frontend: `StudentScholarshipApplicationsPage.tsx`, `ScholarshipApplicationsPage.tsx`.
- **Kết quả kiểm thử**: **PASS**.
  - Khi duyệt đơn, hệ thống tạo bản ghi `Scholarship` với hạn mức cụ thể.
  - Khi học sinh dùng học bổng, tạo `ScholarshipUsage`, khấu trừ `remainingAmount` theo giao dịch nguyên tử (ACID session).

### FLOW 09: Mixed Scholarship + Tuition Payment
- **Mục tiêu**: Thanh toán kết hợp học bổng bán phần + bù tiền qua VietQR, kiểm soát giữ chỗ 15 phút.
- **Hiện trạng Codebase**:
  - Backend: `scholarshipPaymentService.js`, `expireEnrollmentsJob.js`.
- **Kết quả kiểm thử**: **PASS**.
  - Nếu học sinh không hoàn tất phần tiền mặt trong 15 phút, `expireEnrollmentsJob` hủy đơn ghi danh và hoàn lại hạn mức học bổng về trạng thái `RELEASED`.

### FLOW 10: Class Completion -> TeacherEarning -> 7-Day Hold -> Withdrawal
- **Mục tiêu**: Lớp học kết thúc, ghi nhận thù lao giáo viên, giữ đủ 7 ngày đối soát, rút tiền vào thứ Hai.
- **Hiện trạng Codebase**:
  - Backend: `classLifecycleService.js`, `settlementService.js`, `clock.js`.
  - Frontend: `TeacherRevenuePage.tsx`, `TeacherPayoutSection.tsx`.
- **Kết quả kiểm thử**: **PASS**.
  - Playwright E2E Flow 6 & 7: Kiểm tra giao diện doanh thu, bảng kê chi tiết và kiểm soát khung giờ rút tiền thứ Hai (08:00–17:00).
  - Clock injection guard: Ngăn chặn 100% việc giả mạo thời gian qua client headers trên môi trường chạy thực tế.

### FLOW 11: Admin Reconciliation -> Refund Review
- **Mục tiêu**: Quản lý giao dịch bất thường (chuyển thiếu/thừa tiền), xử lý hoàn phí có kiểm soát Four-Eyes.
- **Hiện trạng Codebase**:
  - Backend: `financeService.js`, `refundService.js`, `bankProofService.js`.
  - Frontend: `AdminReconciliationsPage.tsx`, `AdminRefundsPage.tsx`.
- **Kết quả kiểm thử**: **PASS**.
  - Playwright E2E Flow 4 & 5: Tải danh sách hồ sơ đối soát, Admin tiếp nhận xử lý và hoàn tất hoàn tiền có sao kê ngân hàng.
  - Ngăn chặn hoàn tiền tự động qua API, bắt buộc chuyển khoản ngân hàng thủ công và Admin thứ hai đối soát.

### FLOW 12: Dispute -> Earning Lock -> Resolution
- **Mục tiêu**: Khi có khiếu nại của học sinh về chất lượng hoặc sự cố buổi học, khóa thù lao giáo viên tương ứng.
- **Hiện trạng Codebase**:
  - Backend: `sessionIncidentService.js`, `settlementService.js`.
  - Schema: `TeacherEarning.onHold`, `TeacherEarning.settlementHoldRequired`.
- **Kết quả kiểm thử**: **PASS**.
  - Khi có tranh chấp mở, `onHold` được đặt thành `true`, ngăn chặn giáo viên tạo lệnh rút khoản tiền đang bị khiếu nại.

### FLOW 13: Admin Finance Overview -> Transaction Details -> Audit Trail
- **Mục tiêu**: Dashboard tài chính tổng quan, tra cứu sổ cái giao dịch và truy vết kiểm toán toàn bộ thao tác.
- **Hiện trạng Codebase**:
  - Backend: `financeController.js`, `auditService.js`.
  - Frontend: `AdminFinanceOverviewPage.tsx`, `AdminTransactionsPage.tsx`, `AdminBankEventsPage.tsx`.
- **Kết quả kiểm thử**: **PASS**.
  - Playwright E2E Flow 3: Render đầy đủ các metric: Tổng thu học phí, Tổng quỹ học bổng, Tổng hoàn tiền, Tổng thù lao giáo viên và Doanh thu sàn.

### FLOW 14: Notification / Chat / Community
- **Mục tiêu**: Thông báo sự kiện in-app, nhắn tin trực tiếp giữa các thành viên lớp học và gửi báo cáo vi phạm.
- **Hiện trạng Codebase**:
  - Backend: `communityRoutes.js`, `notificationService.js`, `messagingService.js`, `reportService.js`.
  - Frontend: `NotificationsPage.tsx`, `MessagesPage.tsx`, `MyReportsPage.tsx`.
- **Kết quả kiểm thử**: **PASS**.
  - Đầy đủ API tạo cuộc hội thoại, gửi tin nhắn, đánh dấu đã đọc và gửi báo cáo khiếu nại vi phạm.

---

## 3. CHI TIẾT 6 LUỒNG CÒN THIẾU HOẶC CHƯA HOÀN THIỆN (GAPS 15–20)

### FLOW 15: Placement Assessment -> Recommendation -> Enrollment (SRS G3)
- **Hiện trạng**: **MISSING (CHƯA TRIỂN KHAI)**.
- **Khoảng trống kỹ thuật**:
  - Không có Mongoose Models: `Assessment`, `Question`, `Attempt`, `Rubric`.
  - Không có Backend Routes/Services để học sinh làm bài test đầu vào.
  - Không có giao diện Frontend (`/student/placement`).
- **Phân công trách nhiệm**: Châu (Backend) & Băng (Frontend).

### FLOW 16: Admin Dynamic CoursePricingPolicy Management (SRS CUR-07)
- **Hiện trạng**: **PARTIAL (TRIỂN KHAI MỘT PHẦN)**.
- **Khoảng trống kỹ thuật**:
  - Giá khóa học hiện đang được lưu trực tiếp trên field `basePrice` / `price` của Course và Class.
  - Chưa có bảng phiên bản `CoursePricingPolicy` độc lập để cấu hình khung giá theo khối lớp và loại giáo trình (Basic vs Intermediate) như mô tả trong SRS Addendum V3.
- **Phân công trách nhiệm**: Châu (Backend).

### FLOW 17: FPT.eContract Onboarding & Legal E-Signature (SRS TEA-09, TEA-10, TEA-11)
- **Hiện trạng**: **MISSING (CHƯA TRIỂN KHAI)**.
- **Khoảng trống kỹ thuật**:
  - Chưa có adapter kết nối với API FPT.eContract.
  - Chưa có schema lưu trữ thông tin hợp đồng điện tử (`TeacherContract`, `ContractSignature`).
  - Logic mở lớp trong `teacherClassService.js` chỉ kiểm tra `verificationStatus === 'VERIFIED'`, chưa chặn gate hợp đồng hiệu lực (`contractStatus === 'ACTIVE'`).
- **Phân công trách nhiệm**: Bảo (Security/Legal Architecture).

### FLOW 18: Paper Dossier Postal Receipt Cross-Verification (SRS AID-04, AID-05)
- **Hiện trạng**: **MISSING (CHƯA TRIỂN KHAI)**.
- **Khoảng trống kỹ thuật**:
  - Chưa có cơ chế theo dõi mã bưu điện và biên nhận hồ sơ giấy (`PaperDossierReceipt`).
  - Chưa có giao diện đối chiếu 2 bản hồ sơ (bản cứng gửi bưu điện và bản mềm upload online) cho Admin.
- **Phân công trách nhiệm**: Châu (Backend) & Băng (Frontend).

### FLOW 19: Beneficiary Public Profile & Guardian Consent Revoke (SRS AID-07, AID-08)
- **Hiện trạng**: **MISSING (CHƯA TRIỂN KHAI)**.
- **Khoảng trống kỹ thuật**:
  - Chưa có model và API công bố hồ sơ người thụ hưởng đã biên tập (`BeneficiaryPublicProfile`).
  - Chưa có luồng cấp quyền và thu hồi đồng ý công khai thông tin (`DataDisclosureConsent`) của người giám hộ học sinh chưa thành niên.
- **Phân công trách nhiệm**: Bảo (Security) & Băng (Frontend).

### FLOW 20: Quality Supervisor Isolated Role & Audit Scope (SRS G0-06, SPO-06)
- **Hiện trạng**: **PARTIAL (TRIỂN KHAI MỘT PHẦN)**.
- **Khoảng trống kỹ thuật**:
  - Hệ thống chỉ có 4 role cơ bản: `ADMIN`, `TEACHER`, `STUDENT`, `SPONSOR`.
  - Vai trò Giám sát chất lượng (Quality Supervisor) hiện đang dùng chung quyền của ADMIN. Chưa có role riêng bị giới hạn quyền xem dữ liệu tài chính và thông tin nhạy cảm KYC.
- **Phân công trách nhiệm**: Bảo (RBAC Security).

