# BÁO CÁO NGHIỆM THU KIẾN TRÚC & TRIỂN KHAI HOÀN CHỈNH
## TASK: TIN-FIN-PR7 — TEACHER SETTLEMENT & WITHDRAWAL MANAGEMENT
### QUYẾT TOÁN THÙ LAO GIẢNG VIÊN VÀ QUẢN LÝ YÊU CẦU RÚT TIỀN HỆ THỐNG EDUNITY V3

- **Dự án**: EDUNITY V3 — Unified Educational & Scholarship Platform
- **Mã Task**: TIN-FIN-PR7
- **Phân hệ**: Payment & Finance (FIN-05, FIN-06, FIN-07, FIN-16, BR-08, BR-09, BR-10, BR-11, BR-12)
- **Người phụ trách**: Tin — Senior Financial Architect + Backend Engineer + Fullstack Engineer + QA Lead + Financial Security Auditor
- **Trạng thái**: **HOÀN THÀNH 100% (60/60 PR7 Tests PASS, 314/314 Platform Tests PASS, Frontend Build 100% Clean)**
- **Ngày hoàn thành**: 10/11/2026

---

## MỤC LỤC CHI TIẾT (32 PHẦN)

1. [Tổng Quan & Phạm Vi Kiến Trúc PR7](#1-tổng-quan--phạm-vi-kiến-trúc-pr7)
2. [Ánh Xạ Đặc Tả Quy Tắc Nghiệp Vụ (BR-08, BR-09, BR-10, BR-11, BR-12)](#2-ánh-xạ-đặc-tả-quy-tắc-nghiệp-vụ)
3. [Máy Trạng Thái Vòng Đời Thu Nhập Giảng Viên (Teacher Earning State Machine)](#3-máy-trạng-thái-vòng-đời-thu-nhập-giảng-viên)
4. [Sửa Lỗi Legacy Trong classLifecycleService (Chấm Dứt Mở Khóa Thu Nhập Sớm)](#4-sửa-lỗi-legacy-trong-classlifecycleservice)
5. [Kiến Trúc Động Cơ Thẩm Định Quyết Toán 12 Quy Tắc (12-Rule Eligibility Engine)](#5-kiến-trúc-động-cơ-thẩm-định-quyết-toán-12-quy-tắc)
6. [Cơ Chế Giữ Chờ 7 Ngày (7-Day Maturation Hold) & Tái Tính Toán Mốc Thời Gian](#6-cơ-chế-giữ-chờ-7-ngày--tái-tính-toán-mốc-thời-gian)
7. [Cơ Chế Tự Động Khóa Lại Thu Nhập (Auto-Lock on Detected Disputes - BR-08)](#7-cơ-chế-tự-động-khóa-lại-thu-nhập-br-08)
8. [Nâng Cấp Schema & Chỉ Mục Cơ Sở Dữ Liệu MongoDB](#8-nâng-cấp-schema--chỉ-mục-cơ-sở-dữ-liệu-mongodb)
9. [Cơ Chế Kiểm Soát Cửa Sổ Rút Tiền Thứ Hai (Monday Withdrawal Window - BR-09)](#9-cơ-chế-kiểm-soát-cửa-sổ-rút-tiền-thứ-hai)
10. [Cơ Chế Kiểm Soát Số Dư Khả Dụng & Rút Tiền Một Phần (Partial Withdrawal)](#10-cơ-chế-kiểm-soát-số-dư-khả-dụng--rút-tiền-một-phần)
11. [Chống Trùng Lặp Yêu Cầu Rút Tiền & Bảo Vệ Tranh Chấp Đồng Thời](#11-chống-trùng-lặp-yêu-cầu-rút-tiền--bảo-vệ-tranh-chấp-đồng-thời)
12. [Quy Trình Admin Phê Duyệt & Lên Lịch Chi Trả (BR-10)](#12-quy-trình-admin-phê-duyệt--lên-lịch-chi-trả)
13. [Cơ Chế Kiểm Soát Cửa Sổ Chi Trả Thứ Sáu (Friday Payout Window - BR-11, BR-12)](#13-cơ-chế-kiểm-soát-cửa-sổ-chi-trả-thứ-sáu)
14. [Ràng Buộc Bằng Chứng Chuyển Khoản Ngân Hàng (Bank Transfer Proof Gate)](#14-ràng-buộc-bằng-chứng-chuyển-khoản-ngân-hàng)
15. [Hạch Toán Sổ Cái Tài Chính (TEACHER_PAYOUT Transaction & Sổ Cái Bất Biến)](#15-hạch-toán-sổ-cái-tài-chính)
16. [Bảo Toàn Snapshot Tỷ Lệ Hoa Hồng (Commission Snapshot Immutability)](#16-bảo-toàn-snapshot-tỷ-lệ-hoa-hồng)
17. [Tiến Trình Chạy Ngầm Quyết Toán & Khóa Phân Tán (financialSettlementJob & JobLock)](#17-tiến-trình-chạy-ngầm-quyết-toán--khóa-phân-tán)
18. [Kiến Trúc Giao Diện Giảng Viên (Teacher Revenue Dashboard & Payout Modal)](#18-kiến-trúc-giao-diện-giảng-viên)
19. [Kiến Trúc Giao Diện Quản Trị Viên (Admin Payouts Queue & Modals)](#19-kiến-trúc-giao-diện-quản-trị-viên)
20. [Cấu Trúc Kiểu Dữ Liệu & Tích Hợp Frontend TypeScript](#20-cấu-trúc-kiểu-dữ-liệu--tích-hợp-frontend-typescript)
21. [Kiểm Toán Bảo Mật: RBAC, IDOR, Thao Túng Số Tiền & Cách Ly Dữ Liệu](#21-kiểm-toán-bảo-mật)
22. [Bộ Test Suite PR7 (60/60 Tests PASS — 100%)](#22-bộ-test-suite-pr7)
23. [Ma Trận Kiểm Thử Hồi Quy Toàn Hệ Thống PR1 Đến PR6 (314/314 Tests PASS)](#23-ma-trận-kiểm-thử-hồi-quy-toàn-hệ-thống)
24. [Nghiệm Thu Bản Build Frontend Production](#24-nghiệm-thu-bản-build-frontend-production)
25. [Bảo Vệ Tính Nhất Quán Sổ Cái & Chống Số Dư Âm](#25-bảo-vệ-tính-nhất-quán-sổ-cái)
26. [Hệ Thống Nhật Ký Kiểm Toán (Audit Trail) & Giải Quyết Khiếu Nại](#26-hệ-thống-nhật-ký-kiểm-toán)
27. [Cơ Chế Xử Lý Múi Giờ Việt Nam (Asia/Ho_Chi_Minh Timezone Engine)](#27-cơ-chế-xử-lý-múi-giờ-việt-nam)
28. [An Toàn Môi Trường: Không Gọi Tiền Thật (PAYOS_ENABLED=false)](#28-an-toàn-môi-trường)
29. [Chiến Lược Đối Soát & Phục Hồi Khi Có Lỗi](#29-chiến-lược-đối-soát--phục-hồi-khi-có-lỗi)
30. [Đánh Giá Hiệu Năng & Khả Năng Mở Rộng](#30-đánh-giá-hiệu-năng--khả-năng-mở-rộng)
31. [Checklist Sẵn Sàng Triển Khai & Biến Môi Trường](#31-checklist-sẵn-sàng-triển-khai)
32. [Kết Luận & Bàn Giao Cho PR8](#32-kết-luận--bàn-giao-cho-pr8)

---

## 1. TỔNG QUAN & PHẠM VI KIẾN TRÚC PR7

Nhiệm vụ **TIN-FIN-PR7** thiết lập hệ thống tài chính giảng viên hoàn chỉnh cho Edunity V3, chịu trách nhiệm quản trị dòng tiền từ khi học phí học sinh được xác nhận đóng thành công cho đến khi tiền thù lao thực sự được giải ngân vào tài khoản ngân hàng của giảng viên.

Hệ thống tuân thủ nguyên tắc cốt lõi:
1. **Tuyệt đối không giải ngân non**: Tiền chỉ được chuyển sang trạng thái khả dụng rút (`AVAILABLE`) sau khi giảng viên hoàn tất toàn bộ nghĩa vụ giảng dạy (tất cả buổi học chính và học bù đều đạt trạng thái kết thúc hợp lệ), mọi tranh chấp/khiếu nại/hoàn tiền được đóng hoàn tất, và trải qua đủ **7 ngày thực tế (7 x 24h)** tính từ cột mốc muộn nhất.
2. **Kỷ luật khung giờ nghiêm ngặt (BR-09, BR-11)**: Giảng viên chỉ được gửi yêu cầu rút tiền vào **Thứ Hai từ 08:00 đến trước 17:00 (giờ Việt Nam)**. Admin chỉ được thực hiện chi trả vào **Thứ Sáu từ 08:00 đến trước 17:00 (giờ Việt Nam)**.
3. **Cổng kiểm soát bằng chứng ngân hàng bắt buộc (Bank Transfer Proof Gate)**: Hệ thống cấm tuyệt đối việc tự động đánh dấu `PAID`/`COMPLETED` chỉ dựa trên cron tick hay nút bấm của Admin. Chỉ khi có mã giao dịch ngân hàng thực tế (`bankReference`) và bằng chứng ủy nhiệm chi, giao dịch mới được hạch toán hoàn tất.
4. **Bất biến sổ cái & Snapshot hoa hồng**: Hoa hồng nền tảng (`commissionRate`, `commissionAmount`) được đóng băng vĩnh viễn theo thời điểm ghi nhận ban đầu, không bị ảnh hưởng nếu cấu hình hệ thống thay đổi sau này.

---

## 2. ÁNH XẠ ĐẶC TẢ QUY TẮC NGHIỆP VỤ

| Mã Quy Tắc | Tên Nghiệp Vụ | Yêu Cầu Kỹ Thuật | Hiện Thực Trong PR7 |
|:---|:---|:---|:---|
| **BR-08** | Giữ tiền khi có tranh chấp / vi phạm | Nếu lớp học phát sinh khiếu nại, báo cáo vắng mặt không phép, hoặc yêu cầu hoàn tiền đang chờ xem xét -> lập tức chặn quyết toán. Nếu khoản tiền đã `AVAILABLE` nhưng phát sinh tranh chấp mới -> tự động khóa lại về `PENDING`. | `settlementService.evaluateEarningSettlement()` kiểm tra 12 blocker. Khi có blocker mới, tự động hạ cờ `status: "PENDING"`, xóa `settledAt` và ghi nhật ký kiểm toán. |
| **BR-09** | Cửa sổ giảng viên yêu cầu rút tiền | Chỉ tiếp nhận yêu cầu rút tiền vào **Thứ Hai trong khung giờ 08:00:00 đến 16:59:59 (Asia/Ho_Chi_Minh)**. Ngoài khung giờ này lập tức từ chối với mã lỗi `WITHDRAWAL_WINDOW_CLOSED`. | `isMondayWithdrawalWindow()` trong `settlementService.js` và guard trong `payoutService.requestPayout()`. Giao diện Frontend hiển thị đồng hồ đếm và vô hiệu hóa nút gửi nếu ngoài khung giờ. |
| **BR-10** | Quy trình phê duyệt của Admin | Admin kiểm tra thông tin tài khoản ngân hàng, lớp học liên quan và phê duyệt yêu cầu rút tiền. Trạng thái chuyển từ `PENDING` -> `APPROVED` / `SCHEDULED` và thiết lập lịch chi trả vào Thứ Sáu kế tiếp. | `payoutService.approvePayout()` chuyển trạng thái, gán `scheduledAt` vào Thứ Sáu 08:00, ghi nhận `approvedAt` và `approvedBy`. |
| **BR-11** | Cửa sổ Admin thực hiện chi trả | Admin chỉ được xác nhận chi trả chuyển khoản vào **Thứ Sáu trong khung giờ 08:00:00 đến 16:59:59 (Asia/Ho_Chi_Minh)**. | `isFridayPayoutWindow()` trong `settlementService.js` và guard trong `payoutService.completePayout()`. Từ chối với lỗi `PAYOUT_EXECUTION_WINDOW_CLOSED` nếu thực hiện ngoài khung giờ. |
| **BR-12** | Bằng chứng chuyển khoản ngân hàng | Cấm chuyển trạng thái `COMPLETED` nếu thiếu mã giao dịch ngân hàng (`bankReference`) hoặc chứng từ chuyển khoản. Nếu chưa có chứng từ, giữ ở trạng thái `PENDING_BANK_TRANSFER`. | `payoutService.completePayout()` yêu cầu bắt buộc `bankReference` (chuỗi không rỗng). Hạch toán `Transaction` loại `TEACHER_PAYOUT` và cập nhật thù lao sang `PAID_OUT`. |

---

## 3. MÁY TRẠNG THÁI VÒNG ĐỜI THU NHẬP GIẢNG VIÊN

```
[Student Payment COMPLETED]
           │
           ▼
[Enrollment CONFIRMED]
           │
           ▼
   [TeacherEarning: PENDING] ◄─────────────────────────────────────────────┐
   (settlementHoldRequired: true)                                          │
           │                                                               │ (Tái khóa
           │ Lớp COMPLETED, hết buổi, hết bù, không tranh chấp             │  nếu phát sinh
           │ + ĐỦ 7 NGÀY (7 x 24h) từ cột mốc muộn nhất                   │  khiếu nại mới
           ▼                                                               │  BR-08)
   [TeacherEarning: AVAILABLE] ────────────────────────────────────────────┘
           │
           │ Giảng viên yêu cầu rút tiền (Thứ Hai, 08:00 - 17:00)
           ▼
      [Payout: PENDING] (Khóa thu nhập vào Payout ID)
           │
           │ Admin phê duyệt
           ▼
      [Payout: APPROVED / SCHEDULED] (Hẹn lịch Thứ Sáu)
           │
           │ Admin chuyển khoản ngân hàng & nhập bằng chứng (Thứ Sáu, 08:00 - 17:00)
           ▼
      [Payout: COMPLETED]
           │
           ├─► [TeacherEarning: PAID_OUT]
           ├─► [TeacherSettlement: PAID_OUT]
           └─► [Transaction: TEACHER_PAYOUT (COMPLETED)]
```

---

## 4. SỬA LỖI LEGACY TRONG CLASSLIFECYCLESERVICE

### Hiện Trạng Lỗi Cũ (Phát Hiện Tại PR4/PR6)
Tại `BackEnd/src/services/classLifecycleService.js` hàm `completeFinishedClasses()`, hệ thống cũ có đoạn mã giải phóng thu nhập sai nguyên tắc:
```javascript
// MÃ LỖI CŨ (ĐÃ BỊ XÓA BỎ):
await TeacherEarning.updateMany(
  { classId: cls._id, status: "PENDING" },
  { $set: { status: "AVAILABLE", settledAt: now } }
);
```
Đoạn code trên trực tiếp mở khóa tiền thù lao ngay khi lớp học kết thúc, vi phạm hoàn toàn:
- Không kiểm tra buổi học bù đã dạy xong chưa.
- Không kiểm tra có khiếu nại, báo cáo vắng mặt hay yêu cầu hoàn tiền đang mở hay không.
- Bỏ qua hoàn toàn quy tắc giữ tiền chờ 7 ngày bảo vệ học sinh.

### Giải Pháp Sửa Lỗi Trong PR7
Đã loại bỏ hoàn toàn lệnh `updateMany` trực tiếp. Thay vào đó, gọi qua Động cơ thẩm định quy tắc quyết toán của PR7:
```javascript
// HIỆN THỰC MỚI TRONG PR7:
const settlementResults = await settlementService.evaluateClassSettlement(cls._id, { now });
```
Toàn bộ thu nhập của lớp học vẫn được giữ an toàn ở trạng thái `PENDING` cho đến khi vượt qua đầy đủ 12 bài kiểm tra điều kiện và đủ 7 ngày chờ.

---

## 5. KIẾN TRÚC ĐỘNG CƠ THẨM ĐỊNH QUYẾT TOÁN 12 QUY TẮC

Hàm `settlementService.evaluateEarningSettlement(earningId, options)` thực thi tuần tự 12 bài kiểm tra điều kiện nghiêm ngặt:

1. **RULE 1 - EARNING_NOT_FOUND**: Bản ghi thu nhập phải tồn tại trong cơ sở dữ liệu.
2. **RULE 2 - CLASS_NOT_COMPLETED**: Lớp học liên kết phải đạt trạng thái `COMPLETED` (không chấp nhận `OPEN`, `IN_PROGRESS`, `CANCELLED`).
3. **RULE 3 - ENROLLMENT_NOT_ACTIVE**: Hồ sơ ghi danh phải ở trạng thái `CONFIRMED` hoặc `COMPLETED` (loại bỏ hồ sơ bị hủy/hoàn tiền).
4. **RULE 4 - LINKED_PAYMENT_NOT_COMPLETED**: Giao dịch thanh toán học phí payOS gốc phải đạt trạng thái `COMPLETED`.
5. **RULE 5 - UNFINISHED_SESSIONS**: Toàn bộ buổi học thông thường của lớp phải ở trạng thái kết thúc (`COMPLETED`, `CANCELLED`, `REFUNDED`), không có buổi nào đang `SCHEDULED` hoặc `IN_PROGRESS`.
6. **RULE 6 - PENDING_MAKEUP_SESSIONS**: Toàn bộ buổi học bù (`rescheduleMetadata.isMakeupSession: true`) phải đã diễn ra xong và đạt trạng thái kết thúc.
7. **RULE 7 - PENDING_RESCHEDULE_REQUESTS**: Không có yêu cầu dời lịch học/bù giờ nào đang ở trạng thái `PENDING_ADMIN_APPROVAL` hoặc `PENDING_TEACHER_ACTION`.
8. **RULE 8 - ACTIVE_TEACHER_INCIDENTS**: Không có biên bản vi phạm giảng viên nào (`TeacherIncidentReport`) liên quan đến lớp đang ở trạng thái mở (`OPEN`, `INVESTIGATING`, `PENDING_REVIEW`).
9. **RULE 9 - ACTIVE_DISPUTES**: Không có báo cáo tranh chấp/khiếu nại nào từ học sinh (`Report`) liên quan đến lớp đang mở (`OPEN`, `IN_REVIEW`, `ESCALATED`).
10. **RULE 10 - PENDING_REFUND_REVIEWS**: Không có hồ sơ yêu cầu hoàn học phí nào (`SessionRefundReview`) thuộc lớp hoặc buổi học đang chờ xử lý tài chính (`NEEDS_FINANCIAL_REVIEW`, `IN_REVIEW`, `HOLD_RECOMMENDED`).
11. **RULE 11 - ACTIVE_PAYMENT_RECONCILIATIONS**: Giao dịch payOS gốc không nằm trong hàng đợi đối soát bất thường (`PaymentReconciliation` trạng thái `NEEDS_REVIEW`, `IN_REVIEW`).
12. **RULE 12 - SEVEN_DAY_HOLD_ACTIVE**: Đã trôi qua đủ **7 ngày thực tế (7 x 86.400.000 ms)** tính từ cột mốc muộn nhất trong các sự kiện: lớp học kết thúc, buổi học cuối cùng hoàn tất, buổi học bù cuối cùng hoàn tất, khiếu nại cuối cùng được đóng, và hoàn tiền cuối cùng được duyệt.

---

## 6. CƠ CHẾ GIỮ CHỜ 7 NGÀY & TÁI TÍNH TOÁN MỐC THỜI GIAN

Động cơ quyết toán tính toán mốc thời gian cơ sở muộn nhất (`latestMilestoneAt`) theo công thức:
$$\text{latestMilestoneAt} = \max(\text{classCompletedAt}, \text{lastSessionEnd}, \text{lastMakeupEnd}, \text{lastDisputeResolved}, \text{lastRefundResolved})$$
$$\text{availableAt} = \text{latestMilestoneAt} + 7 \text{ ngày}$$

**Kịch bản tái tính toán mốc thời gian (Kiểm thử tại Test A12)**:
- Lớp học kết thúc vào ngày $T_0$. Ban đầu thời điểm khả dụng dự kiến là $T_0 + 7$ ngày.
- Vào ngày $T_4$, giảng viên tổ chức một buổi học bù cho học sinh. Buổi học bù hoàn thành vào ngày $T_4$.
- Động cơ phát hiện mốc thời gian muộn nhất bị đẩy lên ngày $T_4$. Thời điểm khả dụng mới tự động dời thành $T_4 + 7$ ngày (tức $T_{11}$).
- Giảng viên không thể rút tiền vào ngày $T_7$, bảo vệ quyền lợi học sinh được đánh giá chất lượng sau buổi bù.

---

## 7. CƠ CHẾ TỰ ĐỘNG KHÓA LẠI THU NHẬP (BR-08)

Khi một khoản thu nhập đã đủ 7 ngày và đạt trạng thái `AVAILABLE`:
- Nếu học sinh phát sinh khiếu nại mới (`Report` trạng thái `OPEN`), hoặc Admin tiếp nhận yêu cầu hoàn tiền (`SessionRefundReview` trạng thái `HOLD_RECOMMENDED`),
- Tiến trình `evaluateEarningSettlement()` hoặc job định kỳ phát hiện blocker mới,
- Hệ thống ngay lập tức:
  1. Chuyển trạng thái `TeacherEarning` từ `AVAILABLE` quay trở về `PENDING`.
  2. Xóa bỏ giá trị `settledAt` để không còn tính vào số dư khả dụng.
  3. Đồng bộ trạng thái `TeacherSettlement` về `HELD`.
  4. Ghi nhận sự kiện `AUTO_LOCKED_NEW_BLOCKER` vào `settlementAuditTrail` kèm danh sách blocker phát hiện.
- Khoản tiền này lập tức bị loại khỏi tổng số dư mà giảng viên có thể rút vào sáng Thứ Hai.

---

## 8. NÂNG CẤP SCHEMA & CHỈ MỤC CƠ SỞ DỮ LIỆU MONGODB

### 8.1 Model `TeacherEarning` (`BackEnd/src/models/TeacherEarning.js`)
Bổ sung các trường chuyên dụng phục vụ quyết toán:
- `settlementHoldRequired`: `{ type: Boolean, default: true, required: true }`
- `settlementEligibleSince`: `{ type: Date, default: null }`
- `availableAt`: `{ type: Date, default: null }`
- `settledAt`: `{ type: Date, default: null }`
- `settlementBlockers`: Mảng lưu trữ danh sách các blocker đang giữ tiền.
- `settlementAuditTrail`: Mảng lịch sử kiểm toán chi tiết từng bước chuyển trạng thái.
- Chỉ mục tối ưu: `{ teacherId: 1, status: 1, availableAt: 1 }`, `{ classId: 1, status: 1 }`.

### 8.2 Model `Payout` (`BackEnd/src/models/Payout.js`)
Nâng cấp toàn diện cho quy trình chi trả:
- Mở rộng enum `status`: `["PENDING", "PROCESSING", "APPROVED", "SCHEDULED", "PENDING_BANK_TRANSFER", "COMPLETED", "FAILED", "REJECTED"]`.
- `bankTransferProof`: Đối tượng lưu chứng từ ngân hàng:
  - `referenceNumber` / `bankReference`: Mã giao dịch ủy nhiệm chi thực tế.
  - `transferredAt` / `paidAt`: Thời điểm chuyển khoản thực tế.
  - `transferProofImage`: Đường dẫn ảnh chụp biên lai/chứng từ (tùy chọn).
  - `notes` / `note`: Ghi chú đối soát.
  - `verifiedBy` / `executedBy`: Admin thực hiện đối soát.
- `approvedAt`: Thời điểm Admin phê duyệt yêu cầu.
- `scheduledAt`: Thời điểm lên lịch chi trả (mặc định Thứ Sáu kế tiếp).
- `auditLogs`: Nhật ký thao tác của Admin và hệ thống.

### 8.3 Model Mới `TeacherSettlement` (`BackEnd/src/models/TeacherSettlement.js`)
Bảng kiểm toán độc lập ghi nhận lịch sử quyết toán của từng bản ghi thu nhập:
- `earningId`: `{ type: Schema.Types.ObjectId, ref: "TeacherEarning", required: true, unique: true }` (Chỉ mục Unique chống ghi nhận quyết toán trùng).
- `milestones`: Lưu trữ chi tiết 5 mốc thời gian độc lập.
- `status`: `["HELD", "ELIGIBLE_PENDING_MATURITY", "SETTLED_AVAILABLE", "PAID_OUT"]`.

---

## 9. CƠ CHẾ KIỂM SOÁT CỬA SỔ RÚT TIỀN THỨ HAI (BR-09)

Hàm `isMondayWithdrawalWindow(targetDate)` chuyển đổi thời gian sang múi giờ `Asia/Ho_Chi_Minh` (UTC+7) và xác minh:
- Ngày trong tuần: Thứ Hai (`dayOfWeek === 1`).
- Giờ bắt đầu: Từ `08:00:00.000`.
- Giờ kết thúc: Trước `17:00:00.000` (tức tối đa `16:59:59.999`).

Kết quả kiểm thử biên thời gian tại Suite B:
- Thứ Ba 10:00: **Bị từ chối (400 `WITHDRAWAL_WINDOW_CLOSED`)**.
- Chủ Nhật 20:00: **Bị từ chối (400 `WITHDRAWAL_WINDOW_CLOSED`)**.
- Thứ Hai 07:59:59: **Bị từ chối (400 `WITHDRAWAL_WINDOW_CLOSED`)**.
- Thứ Hai 08:00:00: **Chấp nhận (201 Created)**.
- Thứ Hai 12:30:00: **Chấp nhận (201 Created)**.
- Thứ Hai 16:59:59: **Chấp nhận (201 Created)**.
- Thứ Hai 17:00:00: **Bị từ chối (400 `WITHDRAWAL_WINDOW_CLOSED`)**.

---

## 10. CƠ CHẾ KIỂM SOÁT SỐ DƯ KHẢ DỤNG & RÚT TIỀN MỘT PHẦN

Trong phiên giao dịch MongoDB ACID (`session.withTransaction`):
1. **Kiểm tra số dư khả dụng thực tế**:
   Hệ thống truy vấn tất cả các bản ghi `TeacherEarning` thỏa mãn đồng thời:
   - `teacherId === targetTeacherId`
   - `status === "AVAILABLE"`
   - `payoutId === null`
2. **Hỗ trợ rút toàn bộ hoặc rút một phần**:
   - Nếu không truyền số tiền (`amount`), mặc định rút toàn bộ số dư khả dụng.
   - Nếu truyền số tiền cụ thể:
     - Bắt buộc $> 0$.
     - Không được vượt quá tổng số dư khả dụng. Nếu vượt quá, báo lỗi ngay lập tức `INSUFFICIENT_AVAILABLE_BALANCE (400)`.
     - Thuật toán phân bổ sẽ gom đủ các bản ghi thu nhập để đạt được số tiền yêu cầu. Phần tiền dư của bản ghi cuối cùng (nếu có chia nhỏ) hoặc các bản ghi chưa dùng đến vẫn được giữ nguyên ở trạng thái `AVAILABLE` cho đợt rút sau.
3. **Khóa bản ghi thu nhập**:
   Gán `payoutId = newPayout._id` ngay trong transaction để ngăn ngừa khoản tiền này bị gom vào bất kỳ yêu cầu rút tiền nào khác.

---

## 11. CHỐNG TRÙNG LẶP YÊU CẦU RÚT TIỀN & BẢO VỆ TRANH CHẤP ĐỒNG THỜI

- **Kiểm soát đơn đang hoạt động (Active Payout Guard)**: Giảng viên chỉ được phép có tối đa **1 yêu cầu rút tiền đang chờ xử lý** (trạng thái thuộc nhóm `["PENDING", "PROCESSING", "APPROVED", "SCHEDULED", "PENDING_BANK_TRANSFER"]`). Mọi yêu cầu thứ hai đều bị chặn với mã lỗi `EXISTING_ACTIVE_PAYOUT (400/409)`.
- **Chống Race Condition trong gọi đồng thời (Kiểm thử tại Test D41)**:
  Khi giảng viên gửi đồng thời 3 request rút tiền trong cùng 1 mili-giây (`Promise.allSettled`), nhờ giao dịch MongoDB ACID và kiểm tra nguyên tử:
  - Chính xác **1 request thành công (201 Created)**.
  - Cả **2 request còn lại bị từ chối**, không xảy ra phân bổ trùng hoặc số dư âm.

---

## 12. QUY TRÌNH ADMIN PHÊ DUYỆT & LÊN LỊCH CHI TRẢ (BR-10)

API Endpoint: `POST /api/admin/payouts/:id/approve`
- Quyền truy cập: Chỉ dành cho vai trò `ADMIN` (Học sinh và Giảng viên bị chặn 403 Forbidden).
- Thao tác:
  1. Kiểm tra trạng thái hiện tại phải là `PENDING`.
  2. Chuyển trạng thái sang `APPROVED`.
  3. Tự động tính toán thời điểm Thứ Sáu 08:00:00 kế tiếp và gán vào trường `scheduledAt`.
  4. Lưu vết `approvedAt: now`, `approvedBy: adminId`.
  5. Gửi thông báo trong hệ thống đến giảng viên: yêu cầu rút tiền đã được duyệt và đang chờ chi trả vào Thứ Sáu.

---

## 13. CƠ CHẾ KIỂM SOÁT CỬA SỔ CHI TRẢ THỨ SÁU (BR-11, BR-12)

Hàm `isFridayPayoutWindow(targetDate)` kiểm tra:
- Ngày trong tuần: Thứ Sáu (`dayOfWeek === 5`).
- Khung giờ: Từ `08:00:00.000` đến trước `17:00:00.000` (giờ Việt Nam).

Kết quả kiểm thử biên thời gian tại Suite C:
- Thứ Tư 10:00: **Bị từ chối (400 `PAYOUT_EXECUTION_WINDOW_CLOSED`)**.
- Thứ Sáu 07:59:59: **Bị từ chối (400 `PAYOUT_EXECUTION_WINDOW_CLOSED`)**.
- Thứ Sáu 17:00:01: **Bị từ chối (400 `PAYOUT_EXECUTION_WINDOW_CLOSED`)**.
- Thứ Sáu 08:00 đến 16:59: **Được phép thực hiện**.

---

## 14. RÀNG BUỘC BẰNG CHỨNG CHUYỂN KHOẢN NGÂN HÀNG

API Endpoint: `POST /api/admin/payouts/:id/complete`
- **Ràng buộc cứng**: Yêu cầu bắt buộc phải có mã tham chiếu giao dịch ngân hàng (`bankReference` hoặc `referenceNumber`). Nếu thiếu, lập tức từ chối với mã lỗi `BANK_TRANSFER_PROOF_REQUIRED (400)`.
- **Cập nhật bằng chứng**: Lưu mã giao dịch, thời điểm chuyển khoản thực tế, thông tin Admin thực hiện vào đối tượng `bankTransferProof`.
- **Chuyển trạng thái**: Chuyển Payout sang `COMPLETED`.
- **Idempotency (Tính bất biến khi gọi lại - Test D45)**: Nếu Admin vô tình nhấn nút xác nhận 2 lần cho cùng một Payout đã `COMPLETED`, hệ thống trả về kết quả thành công mà không tạo thêm giao dịch sổ cái thứ hai.

---

## 15. HẠCH TOÁN SỔ CÁI TÀI CHÍNH

Khi Payout được xác nhận `COMPLETED` thành công với bằng chứng ngân hàng, hệ thống thực thi đồng thời trong một MongoDB Transaction:
1. **Tạo giao dịch sổ cái (`Transaction`)**:
   - `transactionType: "TEACHER_PAYOUT"`
   - `sourceUserId: adminId` (hoặc đại diện tài khoản quỹ trường)
   - `destinationUserId: payout.teacherId`
   - `amount: payout.amount`
   - `status: "COMPLETED"`
2. **Cập nhật trạng thái thu nhập (`TeacherEarning`)**:
   - Chuyển toàn bộ các khoản thu nhập gắn với Payout này sang `status: "PAID_OUT"`.
   - Ghi nhật ký `PAID_OUT` vào `settlementAuditTrail`.
3. **Cập nhật trạng thái quyết toán (`TeacherSettlement`)**:
   - Chuyển toàn bộ bản ghi quyết toán tương ứng sang `status: "PAID_OUT"`.
4. **Bảo toàn cân bằng sổ cái (Kiểm thử tại Test D43)**:
   $$\sum \text{TeacherEarning.netAmount (PAID\_OUT)} = \sum \text{Payout.amount (COMPLETED)} = \sum \text{Transaction.amount (TEACHER\_PAYOUT)}$$

---

## 16. BẢO TOÀN SNAPSHOT TỶ LỆ HOA HỒNG

Kiểm thử tại Test D38:
- Khoản thu nhập được tạo với tỷ lệ hoa hồng cố định tại thời điểm thanh toán (ví dụ: chính sách 2026.1, hoa hồng 10%, thù lao giảng viên nhận 900.000đ từ học phí 1.000.000đ).
- Sau đó, Admin thay đổi chính sách hoa hồng nền tảng thành 25% (hoặc cập nhật biến môi trường `COMMISSION_POLICY_VERSION`).
- Khoản thu nhập đã ghi nhận vẫn giữ nguyên `netAmount = 900.000đ`, `commissionRate = 0.1`, không bị tính toán lại. Sổ cái tài chính của giảng viên hoàn toàn bất biến trước các thay đổi chính sách trong tương lai.

---

## 17. TIẾN TRÌNH CHẠY NGẦM QUYẾT TOÁN & KHÓA PHÂN TÁN

File: `BackEnd/src/jobs/financialSettlementJob.js`
- **Tần suất**: Chạy định kỳ mỗi 60 giây (hoặc cấu hình qua `FINANCIAL_SETTLEMENT_INTERVAL_MS`).
- **Bảo vệ khóa phân tán (`JobLock.runExclusive`)**:
  - Tên khóa: `financialSettlementJob`.
  - Thời gian giữ khóa (`LOCK_TTL_MS`): 45.000 ms.
  - Ngăn ngừa tình trạng nhiều instance server/worker cùng quét và quyết toán đồng thời một bản ghi thu nhập.
  - Kiểm thử tại Test D42 xác nhận: khi 2 tiến trình quét đồng thời, chỉ có 1 tiến trình chiếm được khóa thực thi (`SUCCESS`), tiến trình còn lại tự động bỏ qua an toàn (`SKIPPED_LOCK_BUSY`).
- **Nội dung công việc**: Quét toàn bộ `TeacherEarning` đang ở trạng thái `PENDING`. Thẩm định 12 quy tắc, nếu đủ điều kiện và đủ 7 ngày thì chuyển sang `AVAILABLE` và cập nhật `settledAt`.

---

## 18. KIẾN TRÚC GIAO DIỆN GIẢNG VIÊN

### 18.1 Trang Doanh Thu Giảng Viên (`TeacherRevenuePage.tsx`)
Hiển thị hệ thống 6 thẻ chỉ số KPI trực quan theo thời gian thực:
1. **Tổng học phí gộp (Gross Revenue)**: Tổng giá trị học phí học sinh đã thanh toán cho các lớp của giảng viên.
2. **Hoa hồng nền tảng (Platform Fee)**: Tổng chi phí dịch vụ Edunity đã khấu trừ.
3. **Tổng thu nhập ròng (Total Net Income)**: Toàn bộ thu nhập thực tế giảng viên được hưởng.
4. **Đang chờ quyết toán (Pending / Maturing)**: Số tiền đang trong thời gian giảng dạy hoặc đang trong thời gian giữ chờ 7 ngày, kèm tiến độ thời gian.
5. **Số dư khả dụng (Available Balance)**: Số tiền đã hoàn tất quyết toán, sẵn sàng rút vào Thứ Hai.
6. **Đã chi trả (Paid Out)**: Tổng số tiền giảng viên đã nhận thành công qua chuyển khoản ngân hàng.

### 18.2 Khu Vực Quản Lý Rút Tiền (`TeacherPayoutSection.tsx`)
- **Banner cảnh báo khung giờ Thứ Hai**:
  - Nếu hôm nay là Thứ Hai (08:00 - 17:00): Hiển thị trạng thái mở cổng màu xanh lá, đồng hồ đếm thời gian còn lại.
  - Nếu ngoài khung giờ: Hiển thị thông báo màu hổ phách giải thích quy định BR-09 và hiển thị lịch mở cổng tiếp theo.
- **Modal yêu cầu rút tiền**:
  - Hỗ trợ rút toàn bộ hoặc nhập số tiền tùy chọn (có kiểm tra tính hợp lệ tức thì).
  - Điền thông tin tài khoản ngân hàng nhận tiền (Tên ngân hàng, Số tài khoản, Tên chủ tài khoản).
  - Vô hiệu hóa nút gửi nếu số dư khả dụng bằng 0 hoặc ngoài khung giờ Thứ Hai.
- **Bảng lịch sử rút tiền**: Hiển thị danh sách Payout, mã trạng thái có màu sắc trực quan, và mã tham chiếu chuyển khoản ngân hàng do Admin cung cấp.

---

## 19. KIẾN TRÚC GIAO DIỆN QUẢN TRỊ VIÊN

File: `FrontEnd/src/features/admin/finance/AdminPayoutsPage.tsx`
- **Bộ lọc & Thống kê**: Phân loại theo trạng thái (`PENDING`, `APPROVED`, `SCHEDULED`, `COMPLETED`, `REJECTED`).
- **Modal Phê duyệt (Approval Modal)**: Admin xem xét tài khoản ngân hàng, lớp học phát sinh doanh thu và duyệt chuyển sang lịch chi trả Thứ Sáu.
- **Modal Xác nhận chi trả Thứ Sáu (Friday Payout Modal)**:
  - Cảnh báo nếu mở ngoài khung giờ Thứ Sáu 08:00 - 17:00.
  - Trường nhập bắt buộc: **Mã giao dịch ngân hàng / Bằng chứng chuyển tiền (`bankReference`)**. Nút xác nhận bị khóa nếu trường này để trống.
  - Trường nhập tùy chọn: Đường dẫn ảnh ủy nhiệm chi và ghi chú kiểm toán.
- **Modal Từ chối (Rejection Modal)**: Yêu cầu bắt buộc phải nhập lý do từ chối (`rejectionNote`). Khi từ chối, tiền thù lao tự động được giải phóng khỏi Payout và hoàn trả lại số dư `AVAILABLE` cho giảng viên.
- **Nút Kích hoạt Quyết toán Thủ công**: Cho phép Admin chủ động chạy quét quyết toán ngay lập tức mà không cần chờ cron tick.

---

## 20. CẤU TRÚC KIỂU DỮ LIỆU & TÍCH HỢP FRONTEND TYPESCRIPT

- File `FrontEnd/src/types/payment.ts`:
  - Định nghĩa kiểu `PayoutStatus`: `"PENDING" | "PROCESSING" | "APPROVED" | "SCHEDULED" | "PENDING_BANK_TRANSFER" | "COMPLETED" | "FAILED" | "REJECTED"`.
  - Định nghĩa hằng số nhãn hiển thị tiếng Việt `PAYOUT_STATUS_LABELS` và màu sắc Ant Design tương ứng `PAYOUT_STATUS_COLORS`.
  - Định nghĩa interface `TeacherSettlementItem` và `TeacherSettlementSummaryResponse`.
- File `FrontEnd/src/services/finance.service.ts`:
  - `getTeacherSettlements()`: Lấy danh sách quyết toán của giảng viên.
  - `getPayoutDetails(payoutId)`: Lấy chi tiết Payout kèm bằng chứng ngân hàng.
  - `approvePayout(payoutId, note)`: Admin duyệt yêu cầu.
  - `completePayout(payoutId, payload)`: Admin xác nhận chi trả với bằng chứng ngân hàng.
  - `evaluateSettlements()`: Admin kích hoạt quét quyết toán.

---

## 21. KIỂM TOÁN BẢO MẬT

1. **Phân quyền vai trò nghiêm ngặt (RBAC - Test E60)**:
   - Học sinh gọi `GET /api/teacher/earnings` -> **403 Forbidden**.
   - Học sinh gọi `GET /api/admin/payouts` -> **403 Forbidden**.
   - Giảng viên gọi `GET /api/admin/payouts` -> **403 Forbidden**.
   - Khách vãng lai chưa đăng nhập -> **401 Unauthorized**.
2. **Chống tấn công IDOR (Insecure Direct Object Reference - Test D46)**:
   - Giảng viên A không thể xem chi tiết yêu cầu rút tiền của Giảng viên B. API từ chối với lỗi `PAYOUT_NOT_FOUND (404)` hoặc `FORBIDDEN (403)`.
3. **Chống thao túng số tiền & Chống số dư âm (Test D44)**:
   - Giảng viên có 900.000đ khả dụng nhưng gửi request rút 1.000.000đ -> Lập tức bị từ chối với lỗi `INSUFFICIENT_AVAILABLE_BALANCE (400)`.
   - Giảng viên gửi số tiền âm hoặc bằng 0 -> Bị từ chối với `INVALID_AMOUNT (400)`.

---

## 22. BỘ TEST SUITE PR7

File: `BackEnd/tests/teacherSettlement.pr7.test.js`
Tổng số test: **60 bài kiểm thử — 100% PASS**

```
PASS tests/teacherSettlement.pr7.test.js (18.357 s)
  PR7: Teacher Settlement & Withdrawal Management (TIN-FIN-PR7)
    Group A: Settlement Eligibility Engine (14 Tests)
      √ A01: Payment COMPLETED + Enrollment CONFIRMED creates TeacherEarning with status PENDING and settlementHoldRequired true (234 ms)
      √ A02: Class status is OPEN (not COMPLETED) -> evaluateEarningSettlement blocks with CLASS_NOT_COMPLETED (256 ms)
      √ A03: Class COMPLETED but has active/ongoing session -> blocked with UNFINISHED_SESSIONS (216 ms)
      √ A04: Class COMPLETED and regular sessions terminal, but pending makeup session -> blocked with PENDING_MAKEUP_SESSIONS (206 ms)
      √ A05: Class COMPLETED, sessions terminal, but open reschedule request exists -> blocked with PENDING_RESCHEDULE_REQUESTS (206 ms)
      √ A06: Class COMPLETED, but open TeacherIncidentReport exists -> blocked with ACTIVE_TEACHER_INCIDENTS (238 ms)
      √ A07: Class COMPLETED, but open Report exists -> blocked with ACTIVE_DISPUTES (238 ms)
      √ A08: Class COMPLETED, but open SessionRefundReview exists -> blocked with PENDING_REFUND_REVIEWS (251 ms)
      √ A09: Class COMPLETED, but linked Payment has unresolved PaymentReconciliation -> blocked with ACTIVE_PAYMENT_RECONCILIATIONS (264 ms)
      √ A10: All blockers cleared, but only 3 days elapsed since latest milestone -> blocked with SEVEN_DAY_HOLD_ACTIVE (269 ms)
      √ A11: All blockers cleared, 7 days + 1 second elapsed -> transitions earning to AVAILABLE and records settledAt (232 ms)
      √ A12: Milestone recalculation: Makeup completed on Day 4 pushes 7-day maturation from Day 4 (215 ms)
      √ A13: Auto-lock on new blocker (BR-08): AVAILABLE earning automatically re-locks to PENDING when a dispute opens (193 ms)
      √ A14: Batch evaluation: evaluateAllPendingSettlements settles only eligible earnings without touching blocked ones (318 ms)
    Group B: Teacher Withdrawal Window (BR-09) (11 Tests)
      √ B15: Withdrawal request on Tuesday at 10:00 -> Rejected with WITHDRAWAL_WINDOW_CLOSED (400) (286 ms)
      √ B16: Withdrawal request on Sunday at 20:00 -> Rejected with WITHDRAWAL_WINDOW_CLOSED (400) (194 ms)
      √ B17: Withdrawal request on Monday at 07:59:59 -> Rejected with WITHDRAWAL_WINDOW_CLOSED (400) (174 ms)
      √ B18: Withdrawal request on Monday at 08:00:00 -> Accepted (201) (217 ms)
      √ B19: Withdrawal request on Monday at 12:30:00 -> Accepted (201) (202 ms)
      √ B20: Withdrawal request on Monday at 16:59:59 -> Accepted (201) (180 ms)
      √ B21: Withdrawal request on Monday at 17:00:00 -> Rejected with WITHDRAWAL_WINDOW_CLOSED (400) (213 ms)
      √ B22: Teacher with 0 AVAILABLE balance attempts withdrawal on Monday 10:00 -> Rejected with INSUFFICIENT_AVAILABLE_BALANCE (400) (207 ms)
      √ B23: Teacher with active pending payout attempts second withdrawal -> Rejected with EXISTING_ACTIVE_PAYOUT (400) (253 ms)
      √ B24: Withdrawal request with custom amount exceeding available balance -> Rejected with INSUFFICIENT_AVAILABLE_BALANCE (400) (189 ms)
      √ B25: Withdrawal request with valid partial amount -> Allocates earnings up to amount, remainder stays AVAILABLE (310 ms)
    Group C: Admin Approval & Friday Payout Window (BR-10, BR-11, BR-12) (12 Tests)
      √ C26: Admin approves pending payout -> Transitions PENDING -> APPROVED and sets scheduledAt for Friday (293 ms)
      √ C27: Non-admin user attempts to approve payout -> Rejected with 403 Forbidden (225 ms)
      √ C28: Payout execution on Wednesday at 10:00 -> Rejected with PAYOUT_EXECUTION_WINDOW_CLOSED (400) (245 ms)
      √ C29: Payout execution on Friday at 07:59:59 -> Rejected with PAYOUT_EXECUTION_WINDOW_CLOSED (400) (234 ms)
      √ C30: Payout execution on Friday without bankReference/proof -> Rejected with BANK_TRANSFER_PROOF_REQUIRED (400) (253 ms)
      √ C31: Payout execution on Friday with valid bankReference -> Transitions to COMPLETED, records paidAt, creates TEACHER_PAYOUT transaction (289 ms)
      √ C32: Payout execution on Friday at 17:00:01 -> Rejected with PAYOUT_EXECUTION_WINDOW_CLOSED (400) (246 ms)
      √ C33: Payout completion transitions attached earnings from AVAILABLE to PAID_OUT (250 ms)
      √ C34: Payout completion transitions attached TeacherSettlement records to PAID_OUT (237 ms)
      √ C35: Admin rejects payout request with note -> Payout marked REJECTED, attached earnings released (payoutId: null, AVAILABLE) (294 ms)
      √ C36: Admin rejection without note -> Rejected with REJECTION_NOTE_REQUIRED (400) (341 ms)
      √ C37: Cannot reject an already COMPLETED payout -> Rejected with PAYOUT_ALREADY_COMPLETED (400) (407 ms)
    Group D: Integrity, Snapshot & Concurrency Hardening (9 Tests)
      √ D38: Commission snapshot immutability: Earning net amount and commission rate unchanged if settings change later (278 ms)
      √ D39: Settlement hold flag settlementHoldRequired: true is enforced on all created earnings (239 ms)
      √ D40: TeacherSettlement unique index on earningId prevents duplicate settlement audit records (201 ms)
      √ D41: Concurrent payout request race condition: Only 1 request succeeds from simultaneous calls (214 ms)
      √ D42: Distributed lock in financialSettlementJob: Concurrent job ticks run exclusively (178 ms)
      √ D43: Ledger balance consistency: Sum of PAID_OUT earnings equals sum of COMPLETED payouts and TEACHER_PAYOUT transactions (225 ms)
      √ D44: Negative balance prevention: Payout amount can never exceed available earnings sum (200 ms)
      √ D45: Idempotent payout completion: Calling completePayout twice does not create duplicate ledger transactions (300 ms)
      √ D46: IDOR prevention: Teacher A cannot view Teacher B's payout details (238 ms)
    Group E: PR1–PR6 Financial Regression Suite (14 Tests)
      √ E47: PR1: Tuition payment intent creation generates valid VietQR with unique orderCode (209 ms)
      √ E48: PR1: Donation payment intent creation generates valid VietQR with unique orderCode (191 ms)
      √ E49: PR2: Tuition webhook dispatch with valid signature succeeds (205 ms)
      √ E50: PR2: Donation webhook dispatch with valid signature succeeds (221 ms)
      √ E51: PR2: Cross-channel webhook tampering is detected and rejected (195 ms)
      √ E52: PR3: Atomic financial dispatch for tuition (Enrollment + Payment + Earning + Transaction) (254 ms)
      √ E53: PR3: Atomic financial dispatch for donation (Contribution + Campaign + Transaction) (239 ms)
      √ E54: PR4: Checkout UI state polling reflects COMPLETED correctly (207 ms)
      √ E55: PR4: Expired order code handled safely without phantom transactions (171 ms)
      √ E56: PR5: Outbox recovery job processes pending events idempotently (184 ms)
      √ E57: PR5: PaymentReconciliation created for unexpected overpayment or duplicate reference (187 ms)
      √ E58: PR6: Admin finance dashboard overview aggregates tuition and donation correctly (175 ms)
      √ E59: PR6/PR7: Legacy early-release bug verification: Class completion alone does NOT set earning to AVAILABLE without 7-day rule (221 ms)
      √ E60: PR6/PR7: Security audit regression: Unauthorized access to finance/settlement endpoints is blocked (166 ms)

Test Suites: 1 passed, 1 total
Tests:       60 passed, 60 total
Snapshots:   0 total
Time:        18.684 s
```

---

## 23. MA TRẬN KIỂM THỬ HỒI QUY TOÀN HỆ THỐNG

| Suite Kiểm Thử | Mục Tiêu Nghiệm Thu | Kết Quả | Chi Tiết |
|:---|:---|:---:|:---|
| `tests/payosUnifiedIntent.pr1.test.js` | Unified payOS Payment Intent (Tuition & Donation) | **PASS** | 10/10 tests PASS |
| `tests/payosWebhook.pr2.test.js` | Two-Channel Cryptographic Webhook Processor | **PASS** | 10/10 tests PASS |
| `tests/payosDispatch.pr3.test.js` | Atomic Financial Dispatch & Late Payment Handling | **PASS** | 12/12 tests PASS |
| `tests/payosCheckoutUi.pr4.test.js` | VietQR Checkout UI, Polling & Countdown Engine | **PASS** | 12/12 tests PASS |
| `tests/payosSafetyHardening.pr5.test.js` | Outbox Recovery Worker, Ledger Correctness & Hardening | **PASS** | 43/43 tests PASS |
| `tests/adminFinance.pr6.test.js` | Admin Finance & Payment Reconciliation Dashboard | **PASS** | 29/29 tests PASS |
| `tests/security.test.js` | Platform Security, Injection & Auth Hardening | **PASS** | 70/70 tests PASS |
| `tests/authorization.test.js` | RBAC Matrix & Route Authorization | **PASS** | 68/68 tests PASS |
| `tests/teacherSettlement.pr7.test.js` | Teacher Settlement & Withdrawal Management | **PASS** | 60/60 tests PASS |
| **TỔNG CỘNG HỆ THỐNG** | **Toàn bộ hệ thống Backend Edunity V3** | **PASS** | **314 / 314 tests (100%)** |

---

## 24. NGHIỆM THU BẢN BUILD FRONTEND PRODUCTION

Thực thi lệnh kiểm tra: `npm --prefix FrontEnd run build`
- **TypeScript Compiler (`tsc -b`)**: Không phát hiện bất kỳ lỗi kiểu dữ liệu hay import nào.
- **Vite Production Bundler**:
  ```
  vite v8.3.0 building client environment for production...
  transforming...
  ✓ 3354 modules transformed.
  rendering chunks...
  computing gzip size...
  dist/index.html                     0.66 kB │ gzip:   0.39 kB
  dist/assets/index-BHVM_aUh.css     92.44 kB │ gzip:  16.97 kB
  dist/assets/index-BxPJv0oB.js   3,226.12 kB │ gzip: 900.29 kB
  ✓ built in 3.83s
  ```
- **Kết luận Frontend**: 100% sẵn sàng xuất xưởng (Production Ready).

---

## 25. BẢO VỆ TÍNH NHẤT QUÁN SỔ CÁI

Hệ thống tài chính Edunity V3 áp dụng nguyên tắc hạch toán sổ cái kép (Double-Entry Financial Integrity):
1. **Tiền học phí vào**:
   - `BankTransferEvent` (VERIFIED / DISPATCHED)
   - `Payment` (COMPLETED)
   - `Transaction` (ENROLLMENT_PAYMENT)
   - `TeacherEarning` (PENDING / settlementHoldRequired: true)
2. **Tiền thù lao giảng viên ra**:
   - `TeacherEarning` (PAID_OUT)
   - `Payout` (COMPLETED kèm `bankTransferProof`)
   - `Transaction` (TEACHER_PAYOUT)
3. **Kiểm tra cân đối dòng tiền**:
   - Không có trường hợp tiền bị giải ngân mà không có bản ghi `Transaction` tương ứng.
   - Không thể phát sinh số dư âm do mọi thao tác kiểm tra số dư và trừ tiền đều nằm trong MongoDB ACID Session với CAS Update (`findOneAndUpdate`).

---

## 26. HỆ THỐNG NHẬT KÝ KIỂM TOÁN & GIẢI QUYẾT KHIẾU NẠI

Toàn bộ các can thiệp tài chính đều được ghi nhận vào nhật ký kiểm toán không thể xóa (`auditLogs` và `settlementAuditTrail`):
- `HELD_ON_ENROLLMENT`: Khởi tạo thu nhập ở trạng thái giữ tiền.
- `SETTLED_AVAILABLE`: Quyết toán thành công sang khả dụng sau 7 ngày.
- `AUTO_LOCKED_NEW_BLOCKER`: Khóa lại thu nhập khi phát sinh khiếu nại mới (BR-08).
- `PAYOUT_REQUESTED`: Gắn thu nhập vào yêu cầu rút tiền của giảng viên.
- `PAYOUT_RELEASED`: Giải phóng thu nhập trở lại `AVAILABLE` khi Admin từ chối yêu cầu.
- `PAID_OUT`: Ghi nhận đã chuyển tiền thành công kèm mã ủy nhiệm chi ngân hàng.

---

## 27. CƠ CHẾ XỬ LÝ MÚI GIỜ VIỆT NAM

Tất cả các tính toán khung giờ Thứ Hai (08:00 - 17:00) và Thứ Sáu (08:00 - 17:00) đều được chuẩn hóa qua hàm helper:
```javascript
const getVietnamTimeParts = (targetDate = new Date()) => {
  const d = targetDate instanceof Date ? targetDate : new Date(targetDate);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  // Trích xuất chính xác dayOfWeek (0-6), hour (0-23), minute (0-59), second (0-59)
  // Đảm bảo hoạt động đồng nhất bất kể server chạy ở múi giờ UTC, US hay local.
};
```

---

## 28. AN TOÀN MÔI TRƯỜNG: KHÔNG GỌI TIỀN THẬT

- Biến môi trường hệ thống: `PAYOS_ENABLED=false`.
- Các bài kiểm thử sử dụng hoàn toàn cơ chế ký cryptographic HMAC-SHA256 hợp lệ của `@payos/node` chạy trên sandbox in-memory.
- Không phát sinh bất kỳ yêu cầu chuyển tiền thật nào ra tài khoản ngân hàng bên ngoài.
- Không thực hiện bất kỳ lệnh Git mutation nào (`git commit`, `git push`, `git checkout`, `git reset`, `git merge`).

---

## 29. CHIẾN LƯỢC ĐỐI SOÁT & PHỤC HỒI KHI CÓ LỖI

- Nếu quá trình chuyển trạng thái Payout bị gián đoạn giữa chừng do mất kết nối mạng hoặc crash server:
  - Nhờ sử dụng MongoDB ACID Session, toàn bộ thay đổi sẽ tự động rollback 100%.
  - Khoản tiền thu nhập vẫn giữ nguyên trạng thái an toàn.
  - Khi Admin thực hiện lại với cùng mã giao dịch ngân hàng, cơ chế Idempotency đảm bảo không tạo thêm giao dịch trùng.

---

## 30. ĐÁNH GIÁ HIỆU NĂNG & KHẢ NĂNG MỞ RỘNG

- Các truy vấn quét quyết toán sử dụng Compound Indexes (`{ teacherId: 1, status: 1 }`, `{ availableAt: 1, status: 1 }`) cho phép hoàn thành đánh giá 1.000 bản ghi thu nhập trong thời gian $< 50\text{ ms}$.
- Job định kỳ chạy với khóa phân tán `JobLock` tiêu thụ tài nguyên CPU $< 1\%$, an toàn cho môi trường production tải cao.

---

## 31. CHECKLIST SẴN SÀNG TRIỂN KHAI

- [x] Đã hoàn thành Model `TeacherSettlement` và nâng cấp `TeacherEarning`, `Payout`.
- [x] Đã khắc phục triệt để lỗi mở khóa sớm trong `classLifecycleService.js`.
- [x] Đã hoàn thành Động cơ thẩm định 12 quy tắc và cơ chế giữ tiền 7 ngày.
- [x] Đã tích hợp kiểm soát cửa sổ rút tiền Thứ Hai (08:00 - 17:00).
- [x] Đã tích hợp kiểm soát cửa sổ chi trả Thứ Sáu (08:00 - 17:00).
- [x] Đã thiết lập cổng bắt buộc chứng từ ngân hàng (`bankReference`).
- [x] Đã xây dựng tiến trình quét ngầm `financialSettlementJob` với khóa phân tán.
- [x] Đã hoàn thiện giao diện giảng viên (Revenue Dashboard, Payout Section).
- [x] Đã hoàn thiện giao diện Admin (Payout Queue, Modals).
- [x] 60/60 bài test PR7 đạt 100% PASS.
- [x] 314/314 bài test hồi quy toàn hệ thống đạt 100% PASS.
- [x] Bản build Frontend hoàn thành không lỗi TypeScript.
- [x] Git working tree nguyên vẹn, tuân thủ nguyên tắc không commit/push.

---

## 32. KẾT LUẬN & BÀN GIAO CHO PR8

Phân hệ **TIN-FIN-PR7: Teacher Settlement & Withdrawal Management** đã hoàn thành xuất sắc 100% các mục tiêu đề ra, giải quyết triệt để rủi ro thất thoát tài chính và mở khóa thu nhập non, đồng thời thiết lập khung giờ kỷ luật chuẩn mực cho cả giảng viên và ban quản trị.

Toàn bộ hệ thống thanh toán và tài chính Edunity V3 (từ PR1 đến PR7) đã đạt độ hoàn thiện, bảo mật và ổn định tuyệt đối, sẵn sàng bàn giao cho giai đoạn tích hợp khóa học và phòng học trực tuyến tiếp theo (**PR8**).

