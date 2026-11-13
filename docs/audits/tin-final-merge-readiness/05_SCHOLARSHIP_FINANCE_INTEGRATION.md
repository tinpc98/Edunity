# EDUNITY V3 — TASK TIN-FINAL-MERGE-READINESS
# BÁO CÁO 05: TÍCH HỢP TÀI CHÍNH HỌC BỔNG VÀ ĐỐI CHIẾU TIỀN ĐỀ THƯỢNG NGUỒN
# (AID-06 SCHOLARSHIP FINANCE, CONSENT GATE & UPSTREAM PREREQUISITES AUDIT)

> **Mã nhiệm vụ**: `TIN-FINAL-MERGE-READINESS`  
> **Chủ quản**: TÍN — Payment & Finance Architect, Financial Security Auditor  
> **Phân công trách nhiệm**:  
> - **Châu**: Quy trình hồ sơ học thuật, checklist tài liệu, biên nhận bưu điện `PaperDossierReceipt`, duyệt hồ sơ `verify-dossier` (`AID-01`, `AID-04`)  
> - **Bảo**: Xác thực danh tính phụ huynh, cổng đồng thuận người giám hộ điện tử `Guardian Consent` (`AID-08`)  
> - **Tín**: Quản lý hạn mức ngân quỹ, đặt trước (`RESERVED`), xác nhận trừ quỹ (`COMMITTED`), giải phóng quỹ (`RELEASED`), đồng chi trả (MIXED), và hạch toán sổ cái kép (`AID-06`, `FIN-16`)  

---

## 1. NĂNG LỰC TRIỂN KHAI PHÍA FINANCE CỦA TÍN (FINANCE_IMPLEMENTATION_READY)

### 1.1. Chu trình quản trị quỹ nguyên tử (ACID Fund Allocation)
Trong `settlementService.js` và `financialDispatchService.js`, Tín đã hoàn tất 100% các nghiệp vụ tài chính học bổng:
- **Bảo lưu hạn mức (`RESERVED`)**:
  Khi học sinh đăng ký khóa học bằng học bổng, số tiền học phí được trừ tạm thời khỏi hạn mức khả dụng của học bổng (`Scholarship.remainingAmount`) và tạo bản ghi `ScholarshipUsage` trạng thái `RESERVED` với thời hạn giữ chỗ (`holdExpiresAt`).
- **Xác nhận sử dụng quỹ (`COMMITTED`)**:
  - Đối với học bổng toàn phần (100%): Xác nhận ghi danh tức thì, chuyển `ScholarshipUsage` sang `COMMITTED`, sinh giao dịch kế toán `SCHOLARSHIP_USAGE` thành công.
  - Đối với học bổng bán phần (MIXED): Chờ thanh toán phần còn lại qua VietQR payOS. Khi payOS bắn webhook xác nhận đủ tiền, hệ thống đồng thời xác nhận `Payment` và `ScholarshipUsage` trong cùng một transaction session duy nhất.
- **Giải phóng hoàn nguyên quỹ (`RELEASED`)**:
  Nếu học sinh không hoàn tất thanh toán phần còn lại trước khi hết hạn giữ chỗ (15 phút), cron job tự động hủy đơn ghi danh và hoàn trả 100% hạn mức về lại cho học bổng (`$inc: { remainingAmount: usage.amount }`), không làm thất thoát ngân quỹ.

---

## 2. HIỆN TRẠNG TIỀN ĐỀ THƯỢNG NGUỒN VÀ RÀO CẢN NGOẠI VI (OWNER_BLOCKED)

### 2.1. Phụ thuộc CHÂU: Duyệt hồ sơ phi tài chính (AID-01 / AID-04)
- Trên nhánh `dev`, Châu đã bổ sung:
  - Endpoint `POST /api/admin/scholarship-applications/:id/verify-dossier` để chuyển trạng thái hồ sơ sang `DOSSIER_VERIFIED`.
  - Nghiệp vụ đối chiếu biên nhận hồ sơ giấy bưu điện `PaperDossierReceipt` (`AID-04`).
- Ranh giới nghiêm ngặt: Hàm `verifyDossierApplication` của Châu chỉ thực hiện xác minh hành chính, **tuyệt đối không** sinh giao dịch tiền tệ, không tự cấp `Scholarship` và không tăng `allocatedAmount`.

### 2.2. Phụ thuộc BẢO: Cổng đồng thuận người giám hộ (AID-08)
- Trong `scholarshipDossierGateService.js` trên `dev`:
  Hàm `assertConsentGate` thiết lập cơ chế fail-closed: Nếu chiến dịch yêu cầu phụ huynh đồng thuận cho học sinh dưới 18 tuổi mà chưa đăng ký `consentVerifier` hợp lệ, hệ thống ném ngoại lệ HTTP 503:
  `CONSENT_DEPENDENCY_BLOCKED: AID-08 Guardian Consent verification dependency is not available`.
- Bảo hiện **chưa triển khai module eKYC/xác thực chữ ký số người giám hộ thực tế**.

### 2.3. Nguyên tắc No-Mock Runtime
- Tín tuân thủ nghiêm ngặt chỉ thị của Team Leader: Tuyệt đối không viết stub/verifier giả trong môi trường chạy thật để tự thông luồng học bổng.
- Do đó, quy trình cấp phát học bổng toàn trình (End-to-End) bị tạm dừng khách quan cho đến khi Bảo và Châu bàn giao xong module của mình.

**Kết luận**:  
- **Tài chính**: **`FINANCE_IMPLEMENTATION_READY`**  
- **Quy trình Toàn trình E2E**: **`OWNER_BLOCKED`** (Chờ Châu đưa `verify-dossier` vào luồng nghiệp vụ và Bảo hoàn thiện Guardian Consent `AID-08`).

