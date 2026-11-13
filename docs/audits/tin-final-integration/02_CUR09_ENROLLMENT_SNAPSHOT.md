# EDUNITY V3 — TASK TIN-FINAL-INTEGRATION
# BÁO CÁO 02: TÍCH HỢP SNAPSHOT GHI DANH BẤT BIẾN (CUR-09 ENROLLMENT SNAPSHOT)

> **Mã công việc**: `CUR-09` (Thuộc Task `TIN-FINAL-INTEGRATION`)  
> **Chủ quản**: TÍN — Payment & Finance Architect & Security Auditor  
> **Đối tác liên quan**: CHÂU — Academic & Pricing Policy Owner  
> **Tập tin liên quan**:  
> - `BackEnd/src/services/enrollmentService.js`  
> - `BackEnd/src/services/paymentService.js`  
> - `BackEnd/src/services/financialDispatchService.js`  
> - `BackEnd/src/models/Enrollment.js`  
> - `BackEnd/tests/cur09EnrollmentSnapshotFinance.test.js`  

---

## 1. YÊU CẦU NGHIỆP VỤ & TÍNH BẤT BIẾN TÀI CHÍNH (FINANCIAL IMMUTABILITY)

### 1.1. Bối cảnh bài toán CUR-09
1. Khi học viên đăng ký giữ chỗ một lớp học (`POST /api/classes/:classId/enrollments`), hệ thống phải đóng băng (snapshot) toàn bộ trạng thái học thuật và chính sách học phí tại thời điểm đó:
   - Phiên bản giáo trình (`syllabusVersionId`, `syllabusVersionNumber`).
   - Chính sách giá áp dụng (`pricingPolicyId`, `pricingPolicyKey`, `pricingPolicyVersion`, `pricingPolicySnapshot`).
   - Mức học phí đã chốt (`tuitionAmount`).
2. **Nguyên tắc bảo vệ giao dịch tài chính (Financial Consistency)**:
   - Học viên tạo đơn ghi danh khi lớp có học phí **500.000 VNĐ**.
   - Trong thời gian 15 phút giữ chỗ của học viên, nếu Quản trị viên cập nhật giá lớp học thành **750.000 VNĐ**, hoặc khóa học ban hành chính sách giá mới (`SUPERSEDED` phiên bản cũ):
     - Đơn giữ chỗ của học viên **VẪN PHẢI GIỮ NGUYÊN MỨC GIÁ 500.000 VNĐ**.
     - Mã VietQR và Payment Link sinh ra từ cổng thanh toán **PHẢI DỰA TRÊN 500.000 VNĐ**.
     - Sổ cái `Transaction` và doanh thu giáo viên `TeacherEarning` **PHẢI ĐƯỢC TÍNH TOÁN TRÊN 500.000 VNĐ**.
     - Tuyệt đối không được phép recalculate theo giá mới khi giao dịch đang diễn ra.

---

## 2. HIỆN THỰC KỸ THUẬT CỦA TÍN TRONG MODULES QUẢN LÝ

### 2.1. Đấu nối Helper Snapshot trong `enrollmentService.js`
Tại `BackEnd/src/services/enrollmentService.js`:
Bổ sung hàm trích xuất an toàn hỗ trợ cả hai môi trường (khi có và khi chưa có `coursePricingPolicyService` trên nhánh làm việc):
```javascript
/**
 * CUR-09 helper: extracts immutable snapshot from targetClass.
 * Delegates to coursePricingPolicyService.buildEnrollmentSnapshotFromClass when present,
 * or safely extracts the CUR-09 fields directly from targetClass as fallback.
 */
const extractCur09Snapshot = (targetClass) => {
  try {
    const { buildEnrollmentSnapshotFromClass } = require("./coursePricingPolicyService");
    if (typeof buildEnrollmentSnapshotFromClass === "function") {
      return buildEnrollmentSnapshotFromClass(targetClass);
    }
  } catch (_) {
    // Graceful fallback when coursePricingPolicyService is not yet loaded in current branch
  }
  if (!targetClass) {
    return {
      syllabusVersionId: null,
      syllabusVersionNumber: null,
      pricingPolicyId: null,
      pricingPolicyKey: null,
      pricingPolicyVersion: null,
      pricingPolicySnapshot: null,
    };
  }
  const snap = targetClass.pricingPolicySnapshot || null;
  return {
    syllabusVersionId: targetClass.syllabusVersionId || null,
    syllabusVersionNumber: targetClass.syllabusVersionNumber || null,
    pricingPolicyId: targetClass.pricingPolicyId || (snap && snap.policyId) || null,
    pricingPolicyKey: targetClass.pricingPolicyKey || (snap && snap.policyKey) || null,
    pricingPolicyVersion: targetClass.pricingPolicyVersion || (snap && snap.version) || null,
    pricingPolicySnapshot: snap || null,
  };
};
```
Trong hàm `createEnrollment`, snapshot được nạp vào document một lần duy nhất lúc khởi tạo:
```javascript
// 5. Create Enrollment (CUR-09: copy immutable syllabus and pricing policy snapshots)
const cur09Snapshot = extractCur09Snapshot(targetClass);
const enrollmentDoc = new Enrollment({
  classId: targetClass._id,
  courseId: targetClass.courseId,
  teacherId: targetClass.teacherId,
  studentId: studentId,
  enrollmentStatus,
  paymentSource,
  tuitionAmount,
  enrolledAt: now,
  holdExpiresAt,
  ...cur09Snapshot,
});
```

### 2.2. Khóa cứng giá trong `paymentService.js` và `financialDispatchService.js`
1. Tại `paymentService.createTuitionPaymentIntent` (dòng 296–306):
   ```javascript
   const { total: scholarshipHeld } = await getPendingScholarshipUsages(enrollment._id);
   const remainingNum = scholarshipHeld > 0
     ? toNum(enrollment.tuitionAmount) - scholarshipHeld
     : toNum(enrollment.tuitionAmount);
   ```
   ➜ Số tiền thanh toán được đọc trực tiếp từ `enrollment.tuitionAmount` đã chốt, **không bao giờ đọc lại `Class.price`**.
2. Tại `financialDispatchService.dispatchBankTransferEvent` (dòng 454 & 578):
   ```javascript
   const tuitionNum = toNum(enrollment.tuitionAmount);
   ...
   const grossAmountNum = tuitionNum;
   const earning = await createTeacherEarning(updatedEnrollment, grossAmountNum, session, {
     settlementHoldRequired: true,
   });
   ```
   ➜ Thu nhập giáo viên được tính theo đúng snapshot học phí của đơn đăng ký, bảo vệ tính toàn vẹn của sổ cái kế toán.

---

## 3. KẾT QUẢ KIỂM THỬ XÁC MINH (TEST EVIDENCE)

Đã bổ sung bộ kiểm thử chuyên biệt `BackEnd/tests/cur09EnrollmentSnapshotFinance.test.js` chạy trên Replica Set thực tế:
- **Test 1**: `createEnrollment` ghi nhận chính xác snapshot học phí và thông tin lớp học tại thời điểm đăng ký. (PASS)
- **Test 2**: Thay đổi giá lớp học từ 500.000 VNĐ lên 750.000 VNĐ sau khi ghi danh -> Payment Intent của học sinh vẫn giữ nguyên 500.000 VNĐ, không bị ảnh hưởng. (PASS)
- **Test 3**: Lớp học cũ (Legacy Class) không có cấu hình chính sách giá CUR-09 tạo Enrollment an toàn, các trường snapshot fallback null, không chặn học viên. (PASS)

```
PASS tests/cur09EnrollmentSnapshotFinance.test.js (4.136 s)
  CUR-09: Enrollment Snapshot Integration with Payment and Transaction
    √ 1. createEnrollment captures immutable Class tuitionAmount snapshot at enrollment time (224 ms)
    √ 2. Changing Class tuition fee afterwards NEVER alters existing Enrollment snapshot or Payment amount (221 ms)
    √ 3. Legacy Class creates Enrollment gracefully and locks initial tuition (160 ms)
```

---

## 4. KẾT LUẬN & BÀN GIAO CHO CHÂU

- **Phần Tín phụ trách (Finance Side)**: Đã hoàn tất 100%. Mức giá thanh toán và hạch toán doanh thu giáo viên hoàn toàn bất biến theo snapshot của đơn ghi danh.
- **Phần Châu phụ trách (Academic Schema Side)**: Khi nhánh `dev` (chứa các trường mở rộng trong `Enrollment.js` và `Class.js`) được merge vào, `enrollmentService.js` sẽ tự động lưu trữ đầy đủ 6 trường snapshot học thuật vào database mà không phát sinh bất kỳ xung đột mã nguồn nào.
- **Trạng thái**: **CUR-09 FINANCE SIDE: DONE (HOÀN THÀNH)**.

