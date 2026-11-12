# 01 — HIỆN TRẠNG PHÂN HỆ PAYMENT & FINANCE (EDUNITY V3)

- **Mã nhiệm vụ:** `TIN-G0-01`
- **Người phụ trách (Owner):** Tin (Team Leader — Toàn bộ Payment & Finance EDUNITY V3)
- **Ngày thực hiện Audit:** 09/11/2026
- **Chế độ thực thi:** `READ-ONLY AUDIT` (Không sửa code nghiệp vụ, không sửa Database, không gọi API payOS thực, không sửa `.env`, không commit/push Git)

---

## 1. Đối chiếu tài liệu trong Repository (Mục 1)

| Tài liệu yêu cầu | Trạng thái trong Repo | Đường dẫn thực tế & Ghi chú kiểm chứng |
|---|---|---|
| `docs/EDUNITY_V3_TEAM_GUIDE.md` | **MISSING** *(tại `docs/`)* — **CÓ BẢN TƯƠNG ĐƯƠNG Ở GỐC** | Không có file tên `docs/EDUNITY_V3_TEAM_GUIDE.md`, nhưng tại thư mục gốc có tài liệu chính thức [EDUNITY_V3_TAI_LIEU_CHUNG_KIEN_TRUC_CONG_NGHE_PHAN_CONG.md](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/EDUNITY_V3_TAI_LIEU_CHUNG_KIEN_TRUC_CONG_NGHE_PHAN_CONG.md) (Phiên bản 1.0 — 06/11/2026) và [EDUNITY_V3_Checklist_4_Thanh_Vien.md](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/EDUNITY_V3_Checklist_4_Thanh_Vien.md) (106 đầu việc V3, trong đó Tin phụ trách 26 đầu việc Payment/Finance). |
| Các tài liệu SRS / Business Rules liên quan | **PRESENT (Partial)** | - [docs/database-design-mongodb.md](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/docs/database-design-mongodb.md): Thiết kế 22 collections MongoDB và mapping Business Rules `BR-01` → `BR-50`.<br>- [docs/audit/EDUNITY_FULL_READ_ONLY_AUDIT.md](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/docs/audit/EDUNITY_FULL_READ_ONLY_AUDIT.md): Đối chiếu SRS.<br>- [docs/tin-05d-05e/](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/docs/tin-05d-05e/02-architecture-and-state-machine.md): Bộ tài liệu kiến trúc & state machine cho Smart Classroom, Incident, Reschedule & Session Refund Review (`TIN-05D` / `TIN-05E`).<br>- Các file `Edunity-SRS(2).md`, `EDUNITY_SRS_ADDENDUM_V3.md` được dẫn chiếu trong tài liệu V3 nhưng không nằm trong thư mục repo hiện tại (**MISSING file gốc**). |
| `BACKEND_ACTUAL_API_CONTRACT.md` | **MISSING (Đã dọn khỏi gốc)** | Đã được thay thế bởi bộ tài liệu API Contract chi tiết trong `BackEnd/docs/`: [api-contract-finance.md](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/docs/api-contract-finance.md), [api-contract-enrollment.md](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/docs/api-contract-enrollment.md), [api-contract-student.md](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/docs/api-contract-student.md), [api-contract-platform.md](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/docs/api-contract-platform.md), [api-contract-auth.md](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/docs/api-contract-auth.md), [api-contract-catalog.md](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/docs/api-contract-catalog.md). |
| `BACKEND_ENUM_AND_STATE_MACHINE_MAP.md` | **MISSING (Đã dọn khỏi gốc)** | Đã được kiểm chứng trực tiếp từ mã nguồn thực tế trong `BackEnd/src/models/*.js` và [docs/database-design-mongodb.md](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/docs/database-design-mongodb.md). |
| Tài liệu Payment/Finance trong `docs/` & `BackEnd/docs/` | **PRESENT** | - [BackEnd/docs/api-contract-finance.md](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/docs/api-contract-finance.md)<br>- [BackEnd/docs/api-contract-enrollment.md](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/docs/api-contract-enrollment.md)<br>- [BackEnd/docs/payment-sponsor-scholarship-summary.md](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/docs/payment-sponsor-scholarship-summary.md)<br>- [EDUNITY_BUGFIX_REPORT_2026-11-04.md](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/EDUNITY_BUGFIX_REPORT_2026-11-04.md) |

---

## 2. Trạng thái Git trước khi Audit (Mục 2)

Kết quả kiểm tra bằng các lệnh chỉ đọc (`git status -sb`, `git branch --show-current`, `git log -5 --oneline`, `git ls-files -u`):

- **Nhánh hiện tại (`git branch --show-current`):** `feature/teacher-admin` (`ahead 7` so với `origin/feature/teacher-admin`).
- **Commit HEAD (`git log -5 --oneline`):**
  - `d53ac0e` — `fix: khắc phục lỗi phân giải DNS khi kết nối MongoDB`
  - `5236658` — `Merge pull request #24 from tinpc98/BE-2`
  - `ce2e1d0` — `Sửa luồng vào lớp LiveKit, đăng ký nhanh từ thẻ lớp`
  - `1be3f92` — `Merge pull request #23 from tinpc98/BE-2`
  - `aa9c090` — `Sửa lỗi luồng buổi học, ghi hình, đăng ký, thông báo và tài chính`
- **Merge dở dang / Unmerged index (`git ls-files -u`):** Trống (`0` file conflict). Không có merge dở dang.
- **File đang thay đổi trên working tree:**
  - `M BackEnd/.env.example` và `M BackEnd/src/server.js` (thay đổi nhỏ có sẵn từ trước trên working tree).
  - `D` 18 file báo cáo `.md` cũ ở thư mục gốc vừa dọn dẹp theo phê duyệt trước đó.
  - `?? EDUNITY_V3_Checklist_4_Thanh_Vien.md` và `?? EDUNITY_V3_TAI_LIEU_CHUNG_KIEN_TRUC_CONG_NGHE_PHAN_CONG.md` (tài liệu kế hoạch V3 mới thêm vào thư mục gốc).

---

## 3. Danh mục API Payment, Enrollment, Scholarship & Finance hiện tại

| STT | Method & Endpoint | Role / Auth | Controller → Service | Chức năng hiện tại | Trạng thái V3 |
|---:|---|---|---|---|---|
| 1 | `GET /api/classes/:classId/availability` | Public | [`enrollmentController.getClassAvailability`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/controllers/enrollmentController.js#L1-L82) → [`enrollmentService.getClassAvailability`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/enrollmentService.js#L247-L265) | Kiểm tra chỗ trống (`capacity`, `enrolledCount`, `remaining`), giá `price` và trạng thái mở đăng ký. | **DONE** |
| 2 | `POST /api/classes/:classId/enrollments` | `STUDENT` | [`enrollmentController.createEnrollment`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/controllers/enrollmentController.js#L1-L35) → [`enrollmentService.createEnrollment`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/enrollmentService.js#L19-L177) | Đăng ký lớp FREE (`CONFIRMED` ngay) hoặc PAID (`PENDING_PAYMENT` + giữ chỗ 15 phút `holdExpiresAt`, tăng nguyên tử `Class.enrolledCount`). | **PARTIAL** *(cần bổ sung snapshot syllabus/commission V3)* |
| 3 | `GET /api/me/enrollments` | `STUDENT` | [`enrollmentController.getMyEnrollments`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/controllers/enrollmentController.js#L36-L52) → [`enrollmentService.getMyEnrollments`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/enrollmentService.js#L179-L220) | Danh sách đơn ghi danh của học viên. | **DONE** |
| 4 | `GET /api/enrollments/:id` | `STUDENT` | [`enrollmentController.getEnrollmentById`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/controllers/enrollmentController.js#L54-L66) → [`enrollmentService.getEnrollmentById`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/enrollmentService.js#L222-L229) | Chi tiết đơn ghi danh (kiểm tra quyền sở hữu `studentId`). | **DONE** |
| 5 | `POST /api/enrollments/:id/cancel` | `STUDENT` | [`enrollmentController.cancelEnrollment`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/controllers/enrollmentController.js#L68-L82) → [`reservationService.releaseReservation`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/reservationService.js#L16-L82) | Hủy đơn `PENDING_PAYMENT`, giảm `Class.enrolledCount`, hoàn trả `ScholarshipUsage` (`PENDING` → `RELEASED`). | **PARTIAL** *(chưa hủy Payment `PENDING` & link payOS)* |
| 6 | `POST /api/enrollments/:id/scholarship-payment` | `STUDENT` | [`scholarshipController.payWithScholarship`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/controllers/scholarshipController.js#L45-L53) → [`scholarshipPaymentService.payWithScholarship`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/scholarshipPaymentService.js#L63-L191) | Áp dụng học bổng toàn phần (`SCHOLARSHIP` → `CONFIRMED`) hoặc đồng chi trả (`MIXED` → giữ `ScholarshipUsage` ở `PENDING`, tính `remainingDue`). | **DONE** |
| 7 | `POST /api/enrollments/:id/payments` | `STUDENT` | [`paymentController.createSandboxPayment`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/controllers/paymentController.js#L27-L54) → [`paymentService.createSandboxPayment`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/paymentService.js#L19-L66) | Tạo bản ghi `Payment` (`gateway: "SANDBOX"`, `gatewayReference: "SBX-<uuid>"`). **Hiện bị chặn 403 trên staging/production** và chưa tạo payOS Payment Link / VietQR. | **PARTIAL / NEEDS PAYOS** |
| 8 | `GET /api/enrollments/:id/payments` | `STUDENT` | [`paymentController.getPaymentHistory`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/controllers/paymentController.js#L137-L154) → [`paymentService.getPaymentHistory`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/paymentService.js#L270-L280) | Lịch sử các lần tạo thanh toán của một Enrollment. | **DONE** |
| 9 | `GET /api/payments/:id` | `STUDENT` (owner), `ADMIN` | [`paymentController.getPaymentById`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/controllers/paymentController.js#L124-L135) → [`paymentService.getPaymentById`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/paymentService.js#L250-L268) | Tra cứu trạng thái `Payment` kèm `enrollmentStatus`, `holdExpiresAt` (dùng được cho FE polling 3s/lần). | **PARTIAL** *(cần trả thêm QR/checkout fields)* |
| 10 | `GET /api/me/payments` | `STUDENT` | [`studentController.getMyPayments`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/controllers/studentController.js#L27-L34) → [`studentService.getMyPayments`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/studentService.js#L54-L76) | Lịch sử thanh toán của học viên. | **DONE** |
| 11 | `POST /api/payments/sandbox/webhook` | Public *(chỉ `development`/`test`)* | [`paymentController.processWebhook`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/controllers/paymentController.js#L67-L87) | Giả lập callback thanh toán/tài trợ trong môi trường dev/test. | **DONE** |
| 12 | `POST /api/payments/webhook` | Public *(xác thực header `x-webhook-secret`)* | [`paymentController.processGatewayWebhook`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/controllers/paymentController.js#L95-L122) | Webhook cổng thanh toán hiện tại. **Không tương thích cấu trúc payload và HMAC signature của payOS.** | **BUG / INCOMPATIBLE WITH PAYOS** |
| 13 | `POST /api/campaigns/:id/contributions` | `SPONSOR` | [`scholarshipController.createContribution`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/controllers/scholarshipController.js#L25-L31) → [`contributionService.createContribution`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/contributionService.js#L21-L47) | Tạo `SponsorContribution` (`PENDING`, mã `SBX-C-<uuid>`). Chưa tạo QR payOS cho khoản tài trợ. | **PARTIAL / NEEDS PAYOS** |
| 14 | `GET /api/sponsor/contributions` | `SPONSOR` | [`scholarshipController.getMyContributions`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/controllers/scholarshipController.js#L27-L30) → [`contributionService.getMyContributions`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/contributionService.js#L131-L163) | Lịch sử đóng góp và tổng tiền đã tài trợ của Sponsor. | **DONE** |
| 15 | `GET /api/sponsor/campaigns/:id/impact` | `SPONSOR` | [`scholarshipController.getCampaignImpact`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/controllers/scholarshipController.js#L31-L33) → [`contributionService.getCampaignImpact`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/contributionService.js#L169-L215) | Báo cáo tác động chiến dịch (quỹ nhận, đã cấp, đã dùng, số học viên nhận/sử dụng, ẩn danh PII). | **DONE** |
| 16 | `POST /api/admin/scholarship-applications/:id/approve` | `ADMIN` | [`scholarshipController.approveApplication`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/controllers/scholarshipController.js#L55-L60) → [`scholarshipService.approveApplication`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/scholarshipService.js#L258-L337) | Duyệt hồ sơ học bổng + kiểm tra quỹ khả dụng (`fundedAmount - allocatedAmount >= award`) + cấp `Scholarship`. | **PARTIAL** *(gộp chung duyệt hồ sơ và cấp phát tài chính)* |
| 17 | `GET /api/teacher/earnings` | `TEACHER` | [`financeController.getTeacherEarnings`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/controllers/financeController.js#L4-L14) → [`financeService.getTeacherEarnings`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/financeService.js#L6-L54) | Xem danh sách `TeacherEarning` và tổng hợp `pending`, `available`, `paidOut`. | **DONE** |
| 18 | `GET /api/teacher/payouts` | `TEACHER` | [`financeRoutes.js`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/routes/financeRoutes.js#L17) → [`payoutService.listMyPayouts`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/payoutService.js#L75-L78) | Lịch sử yêu cầu rút tiền của Giáo viên. | **DONE** |
| 19 | `POST /api/teacher/payouts` | `TEACHER` | [`financeRoutes.js`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/routes/financeRoutes.js#L18) → [`payoutService.requestPayout`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/payoutService.js#L19-L73) | Tạo yêu cầu rút toàn bộ `TeacherEarning` đang `AVAILABLE`. | **PARTIAL** *(thiếu khung giờ Thứ Hai 08–17h & chờ 7 ngày đối soát)* |
| 20 | `GET /api/admin/payouts` | `ADMIN` | [`financeRoutes.js`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/routes/financeRoutes.js#L19) → [`payoutService.adminListPayouts`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/payoutService.js#L80-L99) | Hàng đợi yêu cầu rút tiền của Giáo viên cho Admin. | **DONE** |
| 21 | `POST /api/admin/payouts/:id/complete` | `ADMIN` | [`financeRoutes.js`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/routes/financeRoutes.js#L20) → [`payoutService.completePayout`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/payoutService.js#L105-L144) | Admin xác nhận đã chuyển khoản (`Payout` → `COMPLETED`, `TeacherEarning` → `PAID_OUT`, tạo `Transaction` `TEACHER_PAYOUT`). | **PARTIAL** *(thiếu bước `PROCESSING`/batch Thứ Sáu & AuditLog)* |
| 22 | `POST /api/admin/payouts/:id/reject` | `ADMIN` | [`financeRoutes.js`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/routes/financeRoutes.js#L21) → [`payoutService.rejectPayout`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/payoutService.js#L147-L175) | Admin từ chối yêu cầu rút tiền, gỡ `payoutId` khỏi `TeacherEarning` để giáo viên gửi lại. | **DONE** |
| 23 | `GET /api/admin/payments` | `ADMIN` | [`financeController.getAdminPayments`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/controllers/financeController.js#L16-L27) → [`financeService.getAdminPayments`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/financeService.js#L56-L70) | Danh sách `Payment` toàn hệ thống, lọc theo `status`. | **PARTIAL** *(limit mặc định 10 do lệch `pageSize` vs `limit`)* |
| 24 | `GET /api/admin/transactions` | `ADMIN` | [`financeController.getAdminTransactions`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/controllers/financeController.js#L29-L40) → [`financeService.getAdminTransactions`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/financeService.js#L72-L89) | Danh sách bút toán sổ cái `Transaction`. | **BUG** *(lọc `filter.type` thay vì `filter.transactionType`)* |
| 25 | `PATCH /api/admin/session-refund-reviews/:id` | `ADMIN` | [`teachingController.reviewRefundCase`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/controllers/teachingController.js) → [`sessionIncidentService.reviewRefundCase`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/sessionIncidentService.js#L1429-L1516) | Admin duyệt hoàn phí buổi học sự cố (`APPROVED_FOR_PAYMENT_TEAM`), gọi `settlementService.issueSessionRefund` tạo `Transaction` `REFUND` (`PENDING`) và giảm `TeacherEarning`. | **PARTIAL** *(chưa có API hoàn tất lệnh hoàn tiền `REFUND` từ `PENDING` → `COMPLETED`)* |

---

## 4. Models & Enum liên quan đến Payment & Finance

| Model | File | Các trường chính & Kiểu tiền tệ | Enum trạng thái hiện tại | Indexes hiện có |
|---|---|---|---|---|
| **Enrollment** | [Enrollment.js](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/models/Enrollment.js#L1-L48) | `classId`, `courseId`, `teacherId`, `studentId`, `tuitionAmount` (`Decimal128`), `amountPaidViaPayment` (`Decimal128`), `amountPaidViaScholarship` (`Decimal128`), `holdExpiresAt` (`Date`) | `enrollmentStatus`: `["PENDING_PAYMENT", "CONFIRMED", "COMPLETED", "FAILED", "CANCELLED", "EXPIRED"]`<br>`paymentSource`: `["FREE", "DIRECT_PAYMENT", "SCHOLARSHIP", "MIXED"]` | - Partial Unique `{ studentId: 1, classId: 1 }` khi `enrollmentStatus` thuộc `["PENDING_PAYMENT", "CONFIRMED", "COMPLETED"]`<br>- `{ enrollmentStatus: 1, holdExpiresAt: 1 }`<br>- `{ studentId: 1, enrollmentStatus: 1 }`<br>- `{ teacherId: 1, classId: 1 }` |
| **Payment** | [Payment.js](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/models/Payment.js#L1-L27) | `enrollmentId`, `payerUserId`, `gateway` (`String`), `gatewayReference` (`String`, unique), `amount` (`Decimal128`), `paidAt` (`Date`) | `paymentStatus`: `["PENDING", "COMPLETED", "FAILED", "REFUNDED"]` *(Thiếu `EXPIRED`, `CANCELLED` hoặc metadata payOS `orderCode`, `paymentLinkId`, `qrCode`, `checkoutUrl`)* | - Unique `{ gatewayReference: 1 }`<br>- `{ enrollmentId: 1, createdAt: -1 }`<br>*(Chưa có partial unique index chặn nhiều Payment `PENDING` cùng lúc trên 1 `enrollmentId`)* |
| **Transaction** | [Transaction.js](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/models/Transaction.js#L1-L29) | `sourceUserId`, `destinationUserId`, `relatedEnrollmentId`, `relatedPaymentId`, `relatedScholarshipUsageId`, `amount` (`Decimal128`) | `transactionType`: `["ENROLLMENT_PAYMENT", "SCHOLARSHIP_USAGE", "SPONSOR_CONTRIBUTION", "TEACHER_PAYOUT", "REFUND"]`<br>`status`: `["PENDING", "COMPLETED", "FAILED"]` | - `{ relatedEnrollmentId: 1 }`<br>- `{ sourceUserId: 1, createdAt: -1 }`<br>- `{ destinationUserId: 1, createdAt: -1 }`<br>*(Chưa có `relatedContributionId`, `relatedPayoutId` và chưa có unique index chống ghi trùng theo `relatedPaymentId + transactionType`)* |
| **TeacherEarning** | [TeacherEarning.js](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/models/TeacherEarning.js#L1-L26) | `teacherId`, `enrollmentId` (unique), `classId`, `grossAmount` (`Decimal128`), `commissionAmount` (`Decimal128`), `netAmount` (`Decimal128`), `payoutId` | `status`: `["PENDING", "AVAILABLE", "PAID_OUT"]` *(Thiếu `ON_HOLD` khi lớp đang có khiếu nại/học bù chưa đóng)* | - Unique `{ enrollmentId: 1 }`<br>- `{ teacherId: 1, createdAt: -1 }`<br>- `{ teacherId: 1, status: 1 }` |
| **Payout** | [Payout.js](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/models/Payout.js#L1-L42) | `teacherId`, `amount` (`Decimal128`), `bankAccountSnapshot` (`{ bankName, accountNumber, accountHolderName }`), `requestedAt`, `processedAt`, `processedBy`, `failureReason`, `reviewNote` | `status`: `["PENDING", "PROCESSING", "COMPLETED", "FAILED", "REJECTED"]`<br>`payoutMethod`: `["BANK_TRANSFER"]` | - `{ teacherId: 1, status: 1 }`<br>- `{ status: 1, requestedAt: 1 }` |
| **SponsorContribution** | [SponsorContribution.js](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/models/SponsorContribution.js#L1-L22) | `campaignId`, `sponsorId`, `amount` (`Decimal128`), `paymentReference` (`String`), `contributedAt` (`Date`) | `contributionStatus`: `["PENDING", "COMPLETED", "FAILED"]` | - `{ campaignId: 1 }`<br>- `{ sponsorId: 1, contributedAt: -1 }`<br>- Unique sparse `{ paymentReference: 1 }` |
| **ScholarshipCampaign** | [ScholarshipCampaign.js](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/models/ScholarshipCampaign.js#L1-L54) | `targetBudget`, `fundedAmount`, `allocatedAmount`, `usedAmount` (đều là `Decimal128`), `expectedSlots`, `awardAmountPerStudent` (`Decimal128`), `scope` | `status`: `["DRAFT", "OPEN_FOR_FUNDING", "CLOSED"]` | - `{ status: 1, applicationStart: 1, applicationEnd: 1 }` |
| **Scholarship** | [Scholarship.js](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/models/Scholarship.js#L1-L22) | `campaignId`, `applicationId` (unique), `studentId`, `allocatedAmount` (`Decimal128`), `remainingAmount` (`Decimal128`), `validFrom`, `expiresAt` | `status`: `["ACTIVE", "EXHAUSTED", "EXPIRED", "REVOKED"]` | - Unique `{ applicationId: 1 }`<br>- `{ studentId: 1, status: 1 }` |
| **ScholarshipUsage** | [ScholarshipUsage.js](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/models/ScholarshipUsage.js#L1-L21) | `scholarshipId`, `enrollmentId`, `classId`, `amount` (`Decimal128`), `usedAt` | `status`: `["PENDING", "CONFIRMED", "RELEASED"]` *(SRS gọi là `RESERVED` / `COMPLETED` / `CANCELLED` — xem mục 5.5)* | - `{ enrollmentId: 1 }`<br>- `{ scholarshipId: 1 }` |
| **SessionRefundReview** | [SessionRefundReview.js](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/models/SessionRefundReview.js#L1-L65) | `sessionId`, `classId`, `studentId`, `teacherId`, `enrollmentId`, `paymentId`, `refundAmount` (`Number`), `refundTransactionId` | `status`: `["NEEDS_FINANCIAL_REVIEW", "RESCHEDULED_WAIVED", "APPROVED_FOR_PAYMENT_TEAM", "REJECTED"]`<br>`earningReconciliationStatus`: `["HOLD_RECOMMENDED", "PENDING_PAYMENT_TEAM_REVIEW", "CLEARED_AFTER_MAKEUP", "RESOLVED"]` | - Unique `{ sessionId: 1, enrollmentId: 1 }`<br>- `{ status: 1, createdAt: -1 }` |
| **Models V3 chưa có** | *Chưa tạo* | `BankTransferEvent` (log sự kiện webhook ngân hàng/payOS), `PaymentReconciliation` (đối soát lệch tiền/nội dung/trễ hạn), `TeacherSettlement` (chốt khóa học + 7 ngày đối soát), `WalletAccount` / `WalletLedger` (dự phòng Xu) | **MISSING** | **MISSING** |

---

## 5. Phân tích chi tiết 15 luồng nghiệp vụ Payment & Finance (Mục 3 & Mục 5)

Đối với từng luồng dưới đây, báo cáo trả lời đầy đủ 10 tiêu chí kiểm chứng trực tiếp từ mã nguồn:

### 5.1. Luồng 1 — Thanh toán học phí trực tiếp (Direct Tuition Payment)
1. **Hiện có hay chưa?** Đã có luồng Sandbox (`PARTIAL`); **chưa có** tích hợp payOS thật.
2. **API thực hiện:**
   - `POST /api/classes/:classId/enrollments` ([enrollmentService.js:19-177](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/enrollmentService.js#L19-L177))
   - `POST /api/enrollments/:id/payments` ([paymentController.js:27-54](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/controllers/paymentController.js#L27-L54), [paymentService.js:19-66](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/paymentService.js#L19-L66))
   - `POST /api/payments/webhook` & `POST /api/payments/sandbox/webhook` ([paymentController.js:67-122](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/controllers/paymentController.js#L67-L122), [paymentService.js:68-247](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/paymentService.js#L68-L247))
3. **Model liên quan:** `Class`, `Enrollment`, `Payment`, `Transaction`, `TeacherEarning`, `Notification`.
4. **Trạng thái dữ liệu thay đổi ở đâu?**
   - Khi ghi danh PAID: `Class.enrolledCount` `+1`, `Enrollment` tạo mới với `enrollmentStatus = "PENDING_PAYMENT"`, `paymentSource = "DIRECT_PAYMENT"`, `holdExpiresAt = now + 15m` ([enrollmentService.js:88-128](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/enrollmentService.js#L88-L128)).
   - Khi tạo Payment: `Payment` tạo mới với `paymentStatus = "PENDING"`, `gateway = "SANDBOX"`, `gatewayReference = "SBX-<uuid>"` ([paymentService.js:54-63](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/paymentService.js#L54-L63)).
   - Khi nhận webhook `SUCCESS` còn hạn giữ chỗ: `Payment.paymentStatus` → `"COMPLETED"`, `Enrollment.enrollmentStatus` → `"CONFIRMED"`, `holdExpiresAt` → `null`, tạo `Transaction` (`ENROLLMENT_PAYMENT`, `COMPLETED`) và `TeacherEarning` (`PENDING`) ([paymentService.js:81-198](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/paymentService.js#L81-L198)).
5. **Có sử dụng transaction MongoDB không?**
   - `createEnrollment` và `processWebhook` **CÓ** dùng `session.withTransaction`.
   - `createSandboxPayment` **KHÔNG** dùng transaction.
6. **Có cơ chế chống xử lý trùng (Idempotency) không?**
   - Webhook dùng CAS nguyên tử `Payment.findOneAndUpdate({ gatewayReference, paymentStatus: "PENDING" }, ...)` ([paymentService.js:81-90](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/paymentService.js#L81-L90)) và `TeacherEarning.enrollmentId` có unique index.
7. **Có nguy cơ race condition không?**
   - Trong `createSandboxPayment` ([paymentService.js:33-63](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/paymentService.js#L33-L63)): kiểm tra `Payment.findOne({ enrollmentId, paymentStatus: "PENDING" })` rồi `payment.save()` mà không có unique partial index `{ enrollmentId: 1 }` cho `paymentStatus: "PENDING"`. Nếu học viên bấm đúp 2 request đồng thời, có thể tạo ra 2 bản ghi `Payment` `PENDING` cho cùng 1 Enrollment!
8. **Có đúng SRS và EDUNITY V3 không?**
   - **Chưa đạt V3:** Đang dùng nút bấm Sandbox trên FE ([CheckoutPage.tsx:429-439](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/FrontEnd/src/features/enrollment/CheckoutPage.tsx#L429-L439)) để gọi thẳng `/payments/sandbox/webhook` từ trình duyệt; trên `staging`/`production` endpoint tạo payment bị chặn cứng `403 FORBIDDEN` ([paymentController.js:29-31](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/controllers/paymentController.js#L29-L31)). Chưa tích hợp payOS Payment Link + VietQR + FE polling 3s.
9. **Có test hay chưa?** Có trong [BackEnd/tests/payment.test.js](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/tests/payment.test.js) (52 tests).
10. **Cần giữ nguyên, sửa hay bổ sung?** **Sửa & Mở rộng** sang kiến trúc `payOS Adapter` + `Payment Intent` + `VietQR Polling` (`FIN-01`, `FIN-02`, `FIN-03`, `FIN-05`).

---

### 5.2. Luồng 2 — Lớp miễn phí (FREE Class Enrollment)
1. **Hiện có hay chưa?** **DONE**.
2. **API thực hiện:** `POST /api/classes/:classId/enrollments` ([enrollmentService.js:83-152](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/enrollmentService.js#L83-L152)).
3. **Model liên quan:** `Class`, `Enrollment`, `Notification`.
4. **Trạng thái dữ liệu thay đổi ở đâu?** Trong `enrollmentService.createEnrollment`: khi `targetClass.classType === "FREE"`, `enrollmentStatus = "CONFIRMED"`, `paymentSource = "FREE"`, `tuitionAmount = 0`, `holdExpiresAt = null`, cộng `Class.enrolledCount` `+1` nguyên tử, không tạo `Payment`/`Transaction`/`TeacherEarning`.
5. **Transaction MongoDB:** Có (`session.withTransaction`).
6. **Chống xử lý trùng:** Có (Partial unique index `{ studentId: 1, classId: 1 }` trên `Enrollment` [Enrollment.js:33-41](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/models/Enrollment.js#L33-L41)).
7. **Race condition:** Đã kiểm soát tốt bằng `$expr: { $lt: ["$enrolledCount", "$capacity"] }` và unique index.
8. **Đúng SRS & V3:** Đúng `BR-10`, `BR-11`, `BR-12`, `BR-31`.
9. **Test:** Có trong [BackEnd/tests/enrollment.test.js](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/tests/enrollment.test.js#L70-L84).
10. **Hành động:** **Giữ nguyên** (chỉ bổ sung lưu trường snapshot `syllabusVersionId` khi Châu hoàn thành `CUR-09`).

---

### 5.3. Luồng 3 — Học bổng toàn phần (FULL Scholarship Enrollment)
1. **Hiện có hay chưa?** **DONE**.
2. **API thực hiện:** `POST /api/enrollments/:id/scholarship-payment` ([scholarshipPaymentService.js:63-191](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/scholarshipPaymentService.js#L63-L191)).
3. **Model liên quan:** `Enrollment`, `Scholarship`, `ScholarshipCampaign`, `ScholarshipUsage`, `Payment`, `Transaction`, `TeacherEarning`.
4. **Trạng thái dữ liệu thay đổi ở đâu?**
   - Trong `scholarshipPaymentService.payWithScholarship` & `settlementService.confirmScholarshipUsage`:
   - Khi `scholarshipRemaining >= tuition` (`isFullyCovered = true`):
     - `Scholarship.remainingAmount` giảm `scholarshipAmount` (nếu về `0` thì `Scholarship.status = "EXHAUSTED"`).
     - `Enrollment`: `enrollmentStatus = "CONFIRMED"`, `paymentSource = "SCHOLARSHIP"`, `amountPaidViaScholarship = amountDec`, `holdExpiresAt = null`.
     - Mọi `Payment` `PENDING` cũ của Enrollment được chuyển sang `FAILED` ([scholarshipPaymentService.js:146-150](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/scholarshipPaymentService.js#L146-L150)).
     - Tạo `ScholarshipUsage` (`CONFIRMED`), tăng `ScholarshipCampaign.usedAmount`, tạo `Transaction` (`SCHOLARSHIP_USAGE`, `COMPLETED`) và tạo `TeacherEarning` (`PENDING`) tính trên toàn bộ `tuition` (`BR-27`).
5. **Transaction MongoDB:** Có (`session.withTransaction`).
6. **Chống xử lý trùng:** Kiểm tra `existingUsage` trong transaction + điều kiện `Enrollment.enrollmentStatus === "PENDING_PAYMENT"` + nguyên tử `Scholarship.findOneAndUpdate({ remainingAmount: { $gte: amountDec } })`.
7. **Race condition:** Đã chặn race condition hai lớp cùng dùng 1 học bổng hoặc vượt quỹ Campaign (`$expr: { $gte: [{ $subtract: ["$fundedAmount", "$usedAmount"] }, amountDec] }`).
8. **Đúng SRS & V3:** Đúng `BR-23` → `BR-28`, `BR-41`.
9. **Test:** Có trong [BackEnd/tests/payment.test.js](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/tests/payment.test.js) và [BackEnd/tests/platform.test.js](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/tests/platform.test.js).
10. **Hành động:** **Giữ nguyên** logic cốt lõi; bổ sung hủy link payOS (nếu đã tạo trước khi áp học bổng) và partial unique index trên `ScholarshipUsage`.

---

### 5.4. Luồng 4 — Học bổng đồng chi trả (MIXED Scholarship + Co-payment)
1. **Hiện có hay chưa?** **PARTIAL** (Đã có logic Backend với Sandbox, cần nối payOS cho phần đồng chi trả `remainingDue`).
2. **API thực hiện:**
   - Bước 1: `POST /api/enrollments/:id/scholarship-payment` ([scholarshipPaymentService.js:63-191](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/scholarshipPaymentService.js#L63-L191))
   - Bước 2: `POST /api/enrollments/:id/payments` ([paymentService.js:44-53](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/paymentService.js#L44-L53))
   - Bước 3: `POST /api/payments/webhook` ([paymentService.js:140-206](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/paymentService.js#L140-L206))
3. **Model liên quan:** `Enrollment`, `Scholarship`, `ScholarshipUsage`, `ScholarshipCampaign`, `Payment`, `Transaction`, `TeacherEarning`.
4. **Trạng thái dữ liệu thay đổi ở đâu?**
   - Bước 1 (`payWithScholarship` khi `remainingDue > 0`): trừ tạm `Scholarship.remainingAmount`, đổi `Enrollment.paymentSource = "MIXED"` (vẫn giữ `PENDING_PAYMENT`), tạo `ScholarshipUsage` với `status = "PENDING"`.
   - Bước 2 (`createSandboxPayment`): tính `remainingNum = toNum(enrollment.tuitionAmount) - scholarshipHeld`, tạo `Payment` cho đúng phần chênh lệch `remainingNum`.
   - Bước 3 (`processWebhook` khi `SUCCESS`): kiểm tra `totalPaid = updatedPayment.amount + scholarshipHeld >= tuitionAmount`; chuyển `Enrollment` sang `CONFIRMED`, ghi `amountPaidViaPayment` và `amountPaidViaScholarship`; tạo 2 `Transaction` (`ENROLLMENT_PAYMENT` cho phần tiền học viên trả + `SCHOLARSHIP_USAGE` cho phần học bổng qua `confirmScholarshipUsage`); tạo 1 `TeacherEarning` trên tổng học phí (`grossAmount = updatedPayment.amount + scholarshipHeld`).
5. **Transaction MongoDB:** Có ở Bước 1 và Bước 3.
6. **Chống xử lý trùng:** Đã có ở tầng `Payment` và `Enrollment`.
7. **Nguy cơ Race Condition / Bug phát hiện:**
   - **Bug P1 khi MIXED Payment đến muộn (Late Payment trên đơn MIXED):** Nếu học viên áp học bổng MIXED, sau đó thanh toán ở phút thứ 14:59 nhưng webhook đến ở phút 15:01 **trước khi** cron `expireEnrollmentsJob` kịp chạy (nên `Enrollment.enrollmentStatus` vẫn là `PENDING_PAYMENT` nhưng `holdExpiresAt <= now`), nhánh `else` của `paymentService.processWebhook` ([paymentService.js:207-226](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/paymentService.js#L207-L226)) tạo `Transaction` `REFUND` (`PENDING`), và lát sau cron `expireEnrollmentsJob` chạy sẽ gọi `releaseReservation` trả lại `ScholarshipUsage` (`RELEASED`) và `Class.enrolledCount - 1`. Tuy nhiên, nếu Admin duyệt hoàn hoặc xử lý đơn muộn, cần đảm bảo không bao giờ confirm lại `ScholarshipUsage` đã `RELEASED`.
8. **Đúng SRS & V3:** Đúng công thức tài chính `BR-41`, cần nối payOS QR cho phần `remainingDue`.
9. **Test:** Có trong [BackEnd/tests/payment.test.js](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/tests/payment.test.js).
10. **Hành động:** **Sửa & Bổ sung** tích hợp payOS QR cho `remainingDue` (`FIN-09`).

---

### 5.5. Luồng 5 & 6 — Vòng đời `ScholarshipUsage` & Hoàn số dư học bổng khi hết hạn giữ chỗ
1. **Hiện có hay chưa?** **DONE** (cần lưu ý khác biệt tên enum giữa SRS và Code).
2. **API / Job thực hiện:**
   - Hủy chủ động: `POST /api/enrollments/:id/cancel` → [`reservationService.releaseReservation(enrollmentId, "CANCELLED")`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/reservationService.js#L16-L82).
   - Tự động hết hạn mỗi phút: [`expireEnrollmentsJob.js`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/jobs/expireEnrollmentsJob.js#L14-L70) → `releaseReservation(enrollmentId, "EXPIRED")`.
   - Tự động hết hạn khi đăng ký lại: [`enrollmentService.createEnrollment`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/enrollmentService.js#L39-L47) gọi `releaseReservation` nếu giữ chỗ cũ đã quá hạn.
   - Hết hạn học bổng (`Scholarship.expiresAt`): [`scholarshipExpiryService.expireScholarships`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/scholarshipExpiryService.js#L12-L55) hoàn trả `remainingAmount` chưa dùng về `ScholarshipCampaign.allocatedAmount`.
3. **Model & Enum Mapping (Quan trọng):**
   - Trong SRS gốc dùng tên trạng thái: `RESERVED` / `COMPLETED` / `CANCELLED`.
   - Trong Code thực tế ([ScholarshipUsage.js:13](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/models/ScholarshipUsage.js#L13)) dùng: `PENDING` / `CONFIRMED` / `RELEASED`.
   - Theo quy tắc tại Mục 6.2 của [EDUNITY_V3_TAI_LIEU_CHUNG_KIEN_TRUC_CONG_NGHE_PHAN_CONG.md](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/EDUNITY_V3_TAI_LIEU_CHUNG_KIEN_TRUC_CONG_NGHE_PHAN_CONG.md#L278): **Giữ nguyên enum `PENDING`/`CONFIRMED`/`RELEASED` trong DB và ghi rõ bảng mapping**, không đổi enum gây vỡ code đang chạy.
4. **Trạng thái dữ liệu thay đổi ở đâu?**
   - Trong `releaseReservation` ([reservationService.js:23-64](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/reservationService.js#L23-L64)):
     1. Cập nhật có điều kiện `Enrollment.updateOne({ _id: enrollmentId, enrollmentStatus: "PENDING_PAYMENT", ...(EXPIRED ? { holdExpiresAt: { $lte: now } } : {}) }, { $set: { enrollmentStatus: targetStatus } })`. Nếu `modifiedCount !== 1` thì dừng ngay (đảm bảo **idempotent 100%**, không bao giờ hoàn số dư học bổng hoặc giảm `enrolledCount` 2 lần).
     2. Giảm `Class.enrolledCount` đi `1`.
     3. Tìm các `ScholarshipUsage` có `status: "PENDING"` của `enrollmentId`, đổi `status = "RELEASED"` và cộng hoàn `Scholarship.remainingAmount` (`$inc: { remainingAmount: usage.amount }`).
5. **Điểm thiếu trong `releaseReservation`:**
   - Hiện tại `releaseReservation` **chưa cập nhật trạng thái các bản ghi `Payment` đang `PENDING`** của `enrollmentId` đó sang `FAILED`/`EXPIRED` và chưa gọi hủy link thanh toán trên payOS.
6. **Transaction MongoDB:** Có (`withTransaction`) và Cron có khóa phân tán `runExclusive("expireEnrollments", 55000, runJob)` qua collection `JobLock` ([jobLock.js](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/jobs/jobLock.js)).
7. **Test:** Có trong [BackEnd/tests/payment.test.js](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/tests/payment.test.js) (`PAY-EXC.5`), [BackEnd/tests/jobs.test.js](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/tests/jobs.test.js) và [BackEnd/tests/maintenanceAndFinance.test.js](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/tests/maintenanceAndFinance.test.js).
8. **Hành động:** **Giữ nguyên** phần `Enrollment` + `ScholarshipUsage`, **bổ sung** đóng các `Payment` `PENDING` khi `releaseReservation` chạy (`FIN-09`).

---

### 5.6. Luồng 7 & 8 — Nhà tài trợ quyên góp cho Campaign & Quản lý Quỹ (Received / Allocated / Used)
1. **Hiện có hay chưa?** **PARTIAL** (Đã có sổ quỹ và webhook Sandbox; chưa tích hợp payOS QR cho Sponsor).
2. **API thực hiện:**
   - `POST /api/campaigns/:id/contributions` ([contributionService.js:21-47](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/contributionService.js#L21-L47))
   - `POST /api/payments/webhook` ([contributionService.js:53-128](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/contributionService.js#L53-L128))
   - `GET /api/sponsor/contributions` ([contributionService.js:131-163](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/contributionService.js#L131-L163))
   - `GET /api/sponsor/campaigns/:id/impact` ([contributionService.js:169-215](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/contributionService.js#L169-L215))
3. **Model liên quan:** `ScholarshipCampaign`, `SponsorContribution`, `Transaction`, `Scholarship`, `ScholarshipUsage`.
4. **Cơ chế theo dõi Quỹ hiện tại trên `ScholarshipCampaign`:**
   - `fundedAmount` (Received): tăng khi webhook `SponsorContribution` `SUCCESS` ([contributionService.js:88-92](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/contributionService.js#L88-L92)).
   - `allocatedAmount` (Allocated): tăng khi Admin duyệt hồ sơ cấp `Scholarship` ([scholarshipService.js:279-286](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/scholarshipService.js#L279-L286)), giảm khi `Scholarship` hết hạn mà còn dư `remainingAmount` ([scholarshipExpiryService.js:31-35](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/scholarshipExpiryService.js#L31-L35)).
   - `usedAmount` (Used): tăng khi `ScholarshipUsage` chuyển sang `CONFIRMED` ([settlementService.js:26](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/settlementService.js#L26)).
   - **Điểm thiếu so với V3 (`FIN-15`, `FIN-16`, `SPO-04`):**
     - `createContribution` vẫn sinh mã `SBX-C-<uuid>` và `gateway: "SANDBOX"`, chưa gọi payOS tạo link VietQR cho Nhà tài trợ.
     - Chưa có endpoint `GET /api/sponsor/contributions/:id` để màn hình QR của Sponsor polling trạng thái 3s/lần.
     - Trong `Transaction` khi tạo `SPONSOR_CONTRIBUTION` ([contributionService.js:93-103](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/contributionService.js#L93-L103)), chưa lưu liên kết `relatedContributionId` hoặc `relatedCampaignId` để truy vết 1-1 từ sổ cái về khoản đóng góp.
     - Chưa tách trường `reservedAmount` (đang giữ tạm trong 15 phút checkout MIXED) trên báo cáo quỹ Campaign.
5. **Transaction MongoDB & Idempotency:** Có (`SponsorContribution.updateOne({ _id, contributionStatus: "PENDING" })` trong `session.withTransaction`). Đã vượt qua bài test 10 webhooks đồng thời (`PAY-03.5.1`).
6. **Hành động:** **Mở rộng** tích hợp payOS QR cho Sponsor (`FIN-15`, `SPO-04`) và bổ sung tham chiếu ledger (`FIN-16`).

---

### 5.7. Luồng 9 & 10 — `TeacherEarning`, Hoa hồng & Hoàn phí buổi học sự cố (`SessionRefundReview`)
1. **Hiện có hay chưa?** **PARTIAL**.
2. **API & Service thực hiện:**
   - Tạo `TeacherEarning`: trong [`paymentService.js:184-198`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/paymentService.js#L184-L198) (cho DIRECT/MIXED) và [`settlementService.js:50-69`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/settlementService.js#L50-L69) (cho FULL Scholarship).
   - Hoàn phí buổi học sự cố (`TIN-05E`): `PATCH /api/admin/session-refund-reviews/:id` ([sessionIncidentService.js:1429-1516](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/sessionIncidentService.js#L1429-L1516)) → [`settlementService.issueSessionRefund`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/settlementService.js#L80-L119).
3. **Cách tính hiện tại:**
   - `commissionRate = getSetting("COMMISSION_RATE") || 0.10` (10%).
   - `grossAmount = Class.price` (bao gồm cả phần học bổng tài trợ, đúng `BR-27`).
   - `commissionAmount = Math.round(grossAmount * commissionRate)`.
   - `netAmount = grossAmount - commissionAmount`.
   - Khi Admin duyệt `SessionRefundReview` với `APPROVED_FOR_PAYMENT_TEAM`:
     - `refundAmount = Math.min(paid, Math.round(tuitionAmount / sessionCount))`.
     - Tạo `Transaction` `REFUND` với `status: "PENDING"`.
     - Nếu `TeacherEarning.status !== "PAID_OUT"`, giảm trực tiếp `grossAmount` đi `refundAmount` và tính lại `commissionAmount`, `netAmount`. Nếu đã `PAID_OUT`, đặt `earningReconciliationStatus = "PENDING_PAYMENT_TEAM_REVIEW"`.
4. **Khoảng trống phát hiện so với V3 (`FIN-07`, `FIN-10`, `FIN-14`):**
   - `TeacherEarning` chưa lưu trường `commissionRate` snapshot vào DB (trong [financeService.js:35](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/financeService.js#L35) trả về `commissionRate: e.commissionRate` nhưng trong schema [TeacherEarning.js](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/models/TeacherEarning.js) **không có field `commissionRate`**, nên luôn trả về `undefined`!).
   - Khi học viên thanh toán bằng `SCHOLARSHIP` hoặc `MIXED`, nếu xảy ra hoàn phí buổi học (`issueSessionRefund`), hiện tại code chỉ tạo 1 `Transaction` `REFUND` về cho `studentId` mà chưa phân tách phần tiền mặt hoàn cho học viên vs phần hoàn trả về quỹ học bổng (`Scholarship` / `ScholarshipCampaign`).
   - Các `Transaction` `REFUND` được tạo ở trạng thái `PENDING` (cả từ thanh toán muộn lẫn từ `SessionRefundReview`), nhưng **chưa có API nào cho Admin xử lý/xác nhận hoàn tiền xong** (`PENDING` → `COMPLETED` hoặc `FAILED`).

---

### 5.8. Luồng 11, 12, 13 — `TeacherSettlement`, Yêu cầu rút tiền Thứ Hai (08:00–17:00) & Xử lý Payout Thứ Sáu
1. **Hiện có hay chưa?** **PARTIAL (Thiếu các quy tắc thời gian & đối soát 7 ngày của V3)**.
2. **Code hiện tại làm gì?**
   - Trong [`classLifecycleService.js:34-64`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/classLifecycleService.js#L34-L64): Ngay khi tất cả `Session` của lớp ở trạng thái kết thúc (`COMPLETED` / `CANCELLED` / `INTERRUPTED+ENDED`) và `now >= periodEnd`, job `maintenanceJob` chuyển `Class.status` → `"COMPLETED"` và **ngay lập tức chuyển toàn bộ `TeacherEarning` của lớp từ `PENDING` sang `AVAILABLE`** (dòng 54), không kiểm tra:
     - Lớp còn buổi học bù (`SessionRescheduleRequest` `PENDING`/`APPROVED` nhưng buổi học bù chưa dạy xong) hay không.
     - Lớp còn sự cố/khiếu nại/hoàn phí (`TeacherIncidentReport`, `SessionRefundReview` đang `NEEDS_FINANCIAL_REVIEW`, `Report` đang `OPEN`/`IN_REVIEW`) hay không.
     - Đã qua **thời gian chờ đối soát 7 ngày** sau khi đóng mọi học bù và khiếu nại hay chưa.
   - Trong [`payoutService.requestPayout`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/payoutService.js#L19-L73):
     - Cho phép giáo viên gửi yêu cầu rút tiền **bất kỳ ngày/giờ nào trong tuần** (chưa kiểm tra khung giờ **Thứ Hai 08:00–17:00 giờ `Asia/Ho_Chi_Minh`** theo yêu cầu V3 `FIN-11`).
     - Cho phép giáo viên tự nhập tay `{ bankName, accountNumber, accountHolderName }` ở mỗi lần rút mà chưa đối chiếu với tài khoản ngân hàng đã xác minh (`FIN-12` / `TEA-13`).
   - Trong [`payoutService.completePayout`](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/payoutService.js#L105-L144):
     - Admin bấm nút là chuyển thẳng `PENDING` → `COMPLETED` và `TeacherEarning` → `PAID_OUT`, chưa có bước chuyển sang `PROCESSING` (lệnh thanh toán batch Thứ Sáu) và chưa ghi `AuditLog`.

---

### 5.9. Luồng 14 & 15 — `AuditLog`, Bảo vệ thông tin tài chính & Dashboard / Lịch sử giao dịch
1. **Hiện có hay chưa?** **PARTIAL / BUG**.
2. **Các điểm đã có:**
   - Kiểm soát quyền sở hữu `GET /api/payments/:id` và `GET /api/enrollments/:id/payments` rất chặt (`PAY-OWN.1..4`).
   - Báo cáo tác động cho Nhà tài trợ (`GET /api/sponsor/campaigns/:id/impact`) ẩn hoàn toàn PII của học sinh (`NFR-04`).
   - Admin Dashboard (`GET /api/admin/dashboard`) tổng hợp số liệu thật từ `TeacherEarning`, `Transaction`, `ScholarshipCampaign`.
3. **Các lỗi & thiếu sót phát hiện:**
   - **BUG 1 (`financeService.js:76`):** `getAdminTransactions` viết `if (type) filter.type = type;` trong khi trường trong schema `Transaction` là `transactionType`. Khi Admin lọc theo loại giao dịch trên trang `/admin/transactions`, kết quả luôn trả về rỗng `[]`!
   - **BUG 2 (`financeController.js:21, 34`):** Controller gọi `const { page, pageSize } = parsePaging(req.query)` nhưng Frontend ([finance.service.ts:95, 130](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/FrontEnd/src/services/finance.service.ts#L95)) truyền query param là `limit` chứ không phải `pageSize`. Do `parsePaging` đọc `req.query.pageSize` (mặc định `10`), Backend luôn trả về tối đa 10 bản ghi/trang dù FE yêu cầu `limit=20`.
   - **GAP 3 (`AuditLog`):** Các thao tác tài chính quan trọng của Admin (`completePayout`, `rejectPayout` trong `payoutService.js`) hiện **chưa ghi `AuditLog`**.
   - **GAP 4 (`FR-TEA-18`):** Giáo viên chưa có API và giao diện xem lịch sử giao dịch sổ cái (`Transaction`) của riêng mình.

---

## 6. Bảng tổng hợp trạng thái các chức năng Payment & Finance hiện tại

| Mã / Nhóm chức năng | Tên chức năng | File minh chứng chính | Trạng thái hiện tại |
|---|---|---|---|
| **ENR-01** | Đăng ký lớp FREE & PAID (Seat Hold 15 phút) | [enrollmentService.js:19-177](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/enrollmentService.js#L19-L177) | **DONE** |
| **ENR-02** | Hủy giữ chỗ & Cron giải phóng chỗ hết hạn (`expireEnrollmentsJob`) | [reservationService.js:16-82](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/reservationService.js#L16-L82), [expireEnrollmentsJob.js:14-70](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/jobs/expireEnrollmentsJob.js#L14-L70) | **PARTIAL** *(chưa đóng `Payment` `PENDING` khi expire)* |
| **PAY-SANDBOX** | Tạo Payment Sandbox & Webhook giả lập (`development`/`test`) | [paymentController.js:27-87](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/controllers/paymentController.js#L27-L87), [paymentService.js:19-247](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/paymentService.js#L19-L247) | **DONE** |
| **FIN-01** | Tích hợp payOS Payment Link + VietQR 15 phút cho học phí | [paymentService.js:19-66](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/paymentService.js#L19-L66) | **MISSING** |
| **FIN-02** | Giao diện VietQR học phí + đếm ngược 15p + polling 3s/lần | [CheckoutPage.tsx:1-476](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/FrontEnd/src/features/enrollment/CheckoutPage.tsx#L1-L476) | **PARTIAL** *(có đếm ngược, chưa có VietQR & polling 3s)* |
| **FIN-03** | Xác thực chữ ký HMAC payOS (`checksumKey`) & đối chiếu tài khoản nhận | [paymentController.js:95-122](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/controllers/paymentController.js#L95-L122) | **BUG / INCOMPATIBLE** *(đang dùng `x-webhook-secret` tĩnh)* |
| **FIN-04** | Lưu sự kiện `BankTransferEvent` & hàng đợi đối soát `PaymentReconciliation` | *Chưa có file* | **MISSING** |
| **FIN-05** | Idempotency đa luồng cho `Payment`, `Transaction`, `Enrollment`, `TeacherEarning` | [paymentService.js:76-228](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/paymentService.js#L76-L228) | **PARTIAL** *(đạt ở tầng app, thiếu DB unique indexes cho `Payment` `PENDING` & `Transaction`)* |
| **FIN-06** | Xử lý tiền về muộn sau khi Enrollment `EXPIRED` (`BR-49`) | [paymentService.js:207-226](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/paymentService.js#L207-L226) | **PARTIAL** *(tạo `REFUND` `PENDING`, thiếu `PaymentReconciliation` & nhánh chờ khi thiếu tiền)* |
| **FIN-07 / FIN-08** | Quản lý Payment, Transaction, Reconciliation & Hoàn phí cho Admin | [financeService.js:56-89](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/financeService.js#L56-L89), [AdminTransactionsPage.tsx](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/FrontEnd/src/features/admin/finance/AdminTransactionsPage.tsx) | **BUG / PARTIAL** *(lỗi filter `type` vs `transactionType`, chưa có UI/API duyệt `REFUND` & `PaymentReconciliation`)* |
| **FIN-09** | Học bổng `FULL` & `MIXED` + hoàn trả giữ chỗ học bổng sau 15 phút | [scholarshipPaymentService.js:63-191](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/scholarshipPaymentService.js#L63-L191), [reservationService.js:49-63](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/reservationService.js#L49-L63) | **DONE** *(cần nối payOS cho phần đồng chi trả MIXED)* |
| **FIN-10** | `TeacherSettlement` chốt khóa học sau khi đóng học bù/khiếu nại + 7 ngày đối soát | [classLifecycleService.js:34-64](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/classLifecycleService.js#L34-L64) | **BUG / MISSING** *(hiện mở `AVAILABLE` ngay lập tức khi lớp `COMPLETED`)* |
| **FIN-11 / FIN-13** | Yêu cầu rút tiền Thứ Hai 08–17h & xử lý Payout batch Thứ Sáu | [payoutService.js:19-175](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/payoutService.js#L19-L175), [TeacherPayoutSection.tsx](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/FrontEnd/src/features/teacher/revenue/TeacherPayoutSection.tsx) | **PARTIAL** *(đã có CRUD Payout cơ bản, thiếu kiểm tra khung giờ Thứ Hai, trạng thái `PROCESSING` Thứ Sáu)* |
| **FIN-12** | Đối chiếu tài khoản ngân hàng nhận thù lao khớp chủ thể Giáo viên | [Payout.js:7-14](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/models/Payout.js#L7-L14), [payoutService.js:19-23](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/payoutService.js#L19-L23) | **MISSING** *(hiện cho nhập tay tự do khi rút tiền)* |
| **FIN-14** | Liên thông `SessionRefundReview` (`TIN-05E`) với đối soát thu nhập & hoàn tiền | [sessionIncidentService.js:1429-1516](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/sessionIncidentService.js#L1429-L1516), [settlementService.js:80-119](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/settlementService.js#L80-L119) | **PARTIAL** *(đã tạo `Transaction` `REFUND` `PENDING` & trừ `TeacherEarning`, thiếu bước thực thi/đối soát hoàn tiền)* |
| **FIN-15 / SPO-04** | `ContributionIntent` tạo QR payOS tài trợ theo Campaign & biên nhận | [contributionService.js:21-128](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/contributionService.js#L21-L128) | **PARTIAL** *(mới có Sandbox, chưa có QR payOS & polling)* |
| **FIN-16 / AID-06 / AID-10** | Sổ cái quỹ (`received`/`reserved`/`allocated`/`used`/`refunded`) & cấp phát học bổng an toàn | [scholarshipService.js:258-337](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/scholarshipService.js#L258-L337), [scholarshipExpiryService.js:12-55](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/src/services/scholarshipExpiryService.js#L12-L55) | **PARTIAL** *(đã có `funded`/`allocated`/`used`, thiếu tách `reserved`/`refunded` và liên kết `relatedContributionId`)* |

---

## 7. Hiện trạng Kiểm thử (Tests) của Phân hệ Payment & Finance (Mục 6)

Đã chạy trực tiếp các bộ test liên quan trên môi trường cô lập `MongoMemoryReplSet` (in-memory 100%, không chạm DB thật):

| File Test | Số lượng Test | Nội dung kiểm thử | Kết quả chạy thực tế |
|---|---:|---|---|
| [BackEnd/tests/payment.test.js](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/tests/payment.test.js) | 52 tests | `PAY-01` (Webhook secret fail-closed, timingSafeEqual), `PAY-02` (Sandbox guard), `PAY-03` (Idempotency & 10-worker concurrency cho Payment & Contribution), `PAY-04` (Late webhook sau FAILED & sau EXPIRED), `PAY-05` (Webhook routing), `PAY-06` (Boundary validation, quỹ Campaign & Scholarship), `PAY-OWN` (Ownership check), `PAY-EXC` (MIXED release & exception paths). | **52/52 PASS** |
| [BackEnd/tests/enrollment.test.js](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/tests/enrollment.test.js) | 11 tests | Đăng ký FREE/PAID, race condition 5 học viên tranh 1 chỗ cuối (`CLASS_FULL`), hủy giữ chỗ, re-enroll sau khi hủy. | **11/11 PASS** |
| [BackEnd/tests/maintenanceAndFinance.test.js](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/tests/maintenanceAndFinance.test.js) | 9 tests | Vòng đời lớp (`OPEN` → `IN_PROGRESS` → `COMPLETED`), giải phóng `TeacherEarning` sang `AVAILABLE`, hết hạn học bổng trả quỹ về `ScholarshipCampaign`, khóa `JobLock`, yêu cầu rút tiền (`Payout`), duyệt/từ chối rút tiền, hoàn phí buổi học (`SessionRefundReview`). | **9/9 PASS** |
| [BackEnd/tests/jobs.test.js](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/BackEnd/tests/jobs.test.js) | 3 tests | Cron `expireEnrollmentsJob` hết hạn giữ chỗ 15 phút, trả `Class.enrolledCount` và hoàn `ScholarshipUsage` (`RELEASED`). | **3/3 PASS** |
| **Tổng cộng 4 Suite đã chạy (`npx jest ... --runInBand`)** | **75 tests** | Chạy trên `MongoMemoryReplSet` 7.0.14 hoàn toàn cô lập (`Time: 85.604 s`). | **75/75 PASS (4/4 suites)** |
| **Test tích hợp payOS (`@payos/node` signature, `orderCode`, VietQR, `PaymentReconciliation`)** | 0 tests | Chưa có test cho cấu trúc webhook thật của payOS, đối chiếu `accountNumber` đích, lệch số tiền hoặc `TeacherSettlement` 7 ngày. | **UNTESTED (Chưa viết)** |
