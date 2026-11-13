# EDUNITY V3 — TASK TIN-FINAL-INTEGRATION
# BÁO CÁO 04: TÍCH HỢP CẤP PHÁT QUỸ HỌC BỔNG TÀI CHÍNH (AID-06 SCHOLARSHIP FINANCE)

> **Mã công việc**: `AID-06` (Thuộc Task `TIN-FINAL-INTEGRATION`)  
> **Chủ quản**: TÍN — Payment & Finance Architect & Security Auditor  
> **Đối tác liên quan**:  
> - CHÂU: Academic Dossier Gate (`AID-01`, `AID-04`), Paper Dossier & ScholarshipApplication  
> - BẢO: Guardian Consent Gate (`AID-08`) & Minor Privacy  
> **Tập tin liên quan**:  
> - `BackEnd/src/models/Scholarship.js`  
> - `BackEnd/src/models/ScholarshipUsage.js`  
> - `BackEnd/src/models/ScholarshipCampaign.js`  
> - `BackEnd/src/services/settlementService.js`  
> - `BackEnd/src/services/financialDispatchService.js`  
> - `BackEnd/src/services/paymentService.js`  
> - `BackEnd/src/services/reservationService.js`  

---

## 1. PHÂN TÁCH TRÁCH NHIỆM LIÊN PHÂN HỆ (SEPARATION OF DUTIES)

Để bảo đảm tính minh bạch tài chính và kiểm soát quỹ phi lợi nhuận của EDUNITY V3, luồng cấp phát học bổng được phân định rõ ràng giữa 3 bên:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. CHÂU & BẢO (Hồ sơ học thuật & Đồng thuận giám hộ):                       │
│ - Học sinh nộp đơn: ScholarshipApplication (SUBMITTED)                      │
│ - Bảo kiểm tra Đồng thuận giám hộ (AID-08 / Guardian Consent)              │
│ - Châu kiểm tra Hồ sơ giấy & Tài liệu online (AID-01, AID-04)               │
│ - Chốt trạng thái hành chính: DOSSIER_VERIFIED                              │
│ ⚠️ Tuyệt đối KHÔNG chạm vào số dư Quỹ, không ghi nhận Transaction          │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. TÍN (Phân bổ tài chính & Sổ cái - AID-06):                               │
│ - Kiểm tra điều kiện tiên quyết: status === 'DOSSIER_VERIFIED'              │
│ - Mở MongoDB ACID Replica Set Transaction:                                  │
│   ├── Kiểm tra ngân sách: allocatedAmount + award <= fundedAmount            │
│   ├── Tăng số tiền phân bổ: Campaign.allocatedAmount += award               │
│   ├── Chuyển trạng thái đơn: status -> APPROVED                             │
│   └── Tạo thực thể tài chính: Scholarship (allocatedAmount = award)         │
│ - Ghi nhận nhật ký kiểm toán bất biến (AuditLog)                            │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. TÍN (Sử dụng học bổng khi ghi danh lớp học - FIN-04, FIN-05):           │
│ - Học bổng toàn phần (100%): Mở Enrollment CONFIRMED ngay, không tạo VietQR │
│ - Học bổng bán phần (MIXED): Tạo ScholarshipUsage (PENDING) giữ chỗ,         │
│   chỉ thu phần còn lại qua VietQR. Khi khớp tiền, trừ Campaign.usedAmount   │
│   và ghi sổ cái Transaction (SCHOLARSHIP_USAGE).                           │
│ - Khi đơn hết hạn/hủy: Trả lại số dư khả dụng cho Scholarship (RELEASED).   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. QUY TRÌNH HẠCH TOÁN TÀI CHÍNH AID-06 CHI TIẾT

### 2.1. Điều kiện tiên quyết để phân bổ ngân sách (Preconditions)
Hệ thống quản lý tài chính chỉ cho phép xuất quỹ khi hội đủ **9 tiêu chí**:
1. Hồ sơ học sinh đạt trạng thái chuẩn hóa: `ScholarshipApplication.status === 'DOSSIER_VERIFIED'`.
2. Toàn bộ hồ sơ giấy biên nhận không còn tình trạng bất đồng bộ (`DISCREPANCY`).
3. Đã có xác nhận đồng thuận hợp lệ từ người giám hộ (`consentSnapshot.status === 'VERIFIED'` hoặc `'NOT_REQUIRED'` đối với người trưởng thành).
4. Chiến dịch học bổng đang trong thời gian mở cấp phát (`OPEN_FOR_FUNDING` hoặc `ACTIVE`).
5. Ngân sách khả dụng thực tế của chiến dịch đủ để chi trả: `Campaign.fundedAmount - Campaign.allocatedAmount >= awardAmountPerStudent`.
6. Số tiền cấp phát không được lấy từ request body của người dùng mà bắt buộc lấy từ giá trị cấu hình cố định `Campaign.awardAmountPerStudent`.
7. Mỗi học sinh chỉ được hưởng tối đa 1 học bổng cho mỗi chiến dịch (Bảo vệ bởi Partial Unique Index `{ studentId: 1, campaignId: 1 }`).
8. Người thực hiện thao tác là Quản trị viên (`ADMIN`) có quyền duyệt tài chính.
9. Thực thi hoàn toàn bên trong MongoDB ACID Session để tránh tình trạng phân bổ vượt ngân quỹ.

### 2.2. Kiểm soát sử dụng học bổng: Toàn phần (Full) vs Đồng chi trả (Mixed)
- **Học bổng Toàn phần (100% Full Scholarship)**:
  - Khi `tuitionAmount <= scholarship.remainingAmount`:
  - Đơn ghi danh chuyển ngay sang `enrollmentStatus = 'CONFIRMED'`.
  - Phương thức thanh toán ghi nhận `paymentSource = 'SCHOLARSHIP'`.
  - Không sinh mã VietQR hoặc Payment Intent trên cổng thanh toán.
- **Học bổng Đồng chi trả (Mixed Co-payment - BR-41)**:
  - Khi học bổng chỉ chi trả một phần (ví dụ học bổng 1.000.000 VNĐ, lớp học phí 1.500.000 VNĐ):
  - Hệ thống tạo bản ghi giữ chỗ `ScholarshipUsage` với số tiền 1.000.000 VNĐ ở trạng thái `PENDING`.
  - API Payment Intent tính toán số tiền học sinh cần chuyển khoản:
    $$\text{Remaining Due} = \text{Enrollment.tuitionAmount} - \text{Scholarship Held} = 1.500.000 - 1.000.000 = 500.000\text{ VNĐ}$$
  - Cổng payOS sinh VietQR thu đúng 500.000 VNĐ.
  - Khi nhận Webhook thanh toán đủ 500.000 VNĐ:
    - `Payment` chuyển `COMPLETED` (+500.000 VNĐ).
    - `ScholarshipUsage` chuyển `CONFIRMED` (+1.000.000 VNĐ) và tăng `Campaign.usedAmount`.
    - Sinh 2 bản ghi `Transaction`: `ENROLLMENT_PAYMENT` (500k) và `SCHOLARSHIP_USAGE` (1000k).
    - `TeacherEarning` tạo trên toàn bộ học phí gốc (1.500.000 VNĐ).

### 2.3. Hoàn nguyên Quỹ khi Hết hạn giữ chỗ (Hold Expiration Safety)
Tại `BackEnd/src/services/reservationService.js` (dòng 48–63):
Khi cronjob quét phát hiện đơn ghi danh quá 15 phút chưa thanh toán phần tiền túi (`EXPIRED`), hệ thống tự động:
1. Chuyển `ScholarshipUsage.status` từ `PENDING` sang `RELEASED`.
2. Cộng hoàn lại số tiền vào `Scholarship.remainingAmount` qua `$inc: { remainingAmount: usage.amount }`.
3. Số tiền học bổng ngay lập tức khả dụng trở lại để học sinh đăng ký lớp học khác, không bao giờ bị "giam" hoặc thất thoát quỹ.

---

## 3. RÀO CẢN NGOẠI VI & ĐỀ XUẤT PHỐI HỢP (CROSS-TEAM BLOCKERS)

1. **Rào cản từ CHÂU (Dossier Review)**:
   - Trên nhánh `feature/teacher-admin`, Châu chưa merge API `verify-dossier` và trạng thái `DOSSIER_VERIFIED`.
   - Tuy nhiên, trên nhánh `dev`, Châu **đã triển khai hoàn tất** tại `BackEnd/src/services/scholarshipService.js` (commit `104e893`).
2. **Rào cản từ BẢO (Guardian Consent Gate)**:
   - Module xác thực đồng thuận phụ huynh (`AID-08`) cần được Bảo hoàn thiện tích hợp để trả về trạng thái consent xác thực thay vì fallback `NOT_REQUIRED`.
3. **Trạng thái phân loại**:  
   - Logic tài chính phân bổ & sử dụng quỹ của Tín: **DONE (SẴN SÀNG 100%)**.  
   - Tích hợp nghiệp vụ đầu vào: **BLOCKED_EXTERNAL ON UPSTREAM DOSSIER VERIFICATION (CHÂU & BẢO)**.

