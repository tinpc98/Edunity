# EDUNITY V3 — TASK TIN-FINAL-MERGE-READINESS
# BÁO CÁO 03: ĐỐI SOÁT VÀ TÍCH HỢP SNAPSHOT GHI DANH CUR-09
# (CUR-09 ENROLLMENT SNAPSHOT INTEGRATION & IMMUTABILITY AUDIT)

> **Mã nhiệm vụ**: `TIN-FINAL-MERGE-READINESS`  
> **Chủ quản**: TÍN — Payment & Finance Architect, MongoDB Transaction Specialist  
> **Tập tin liên quan**:  
> - `BackEnd/src/services/enrollmentService.js` (Điểm tích hợp chung Tín - Châu)  
> - `BackEnd/src/services/coursePricingPolicyService.js` (Châu sở hữu)  
> - `BackEnd/src/models/Enrollment.js` (Schema học thuật & snapshot)  
> - `BackEnd/tests/cur09EnrollmentSnapshotFinance.test.js` (Tín khởi tạo)  

---

## 1. ĐỐI SOÁT HAI HELPER SNAPSHOT VÀ HỢP NHẤT KIẾN TRÚC

### 1.1. Hiện trạng đối chiếu hai helper
1. **Helper của Châu (`coursePricingPolicyService.js` dòng 825)**:
   - Tên: `buildEnrollmentSnapshotFromClass(cls)`
   - Cấu trúc trả về:
     ```javascript
     {
       syllabusVersionId: cls.syllabusVersionId || null,
       syllabusVersionNumber: cls.syllabusVersionNumber || null,
       pricingPolicyId: cls.pricingPolicyId || (snap && snap.policyId) || null,
       pricingPolicyKey: cls.pricingPolicyKey || (snap && snap.policyKey) || null,
       pricingPolicyVersion: cls.pricingPolicyVersion || (snap && snap.version) || null,
       pricingPolicySnapshot: snap ? { policyId, policyKey, version, scopeType, classType, allowFree, minPrice, maxPrice, minSessions, maxSessions, effectiveFrom, effectiveTo, capturedAt } : null
     }
     ```
   - Đây là **Single Source of Truth (SSOT)** theo đúng tài liệu bàn giao kỹ thuật của Châu tại `dev:docs/coordination-and-handover.md` (Mục 8).
2. **Helper trước đây của Tín (`enrollmentService.js`)**:
   - Từng có khối fallback nội bộ tự trích xuất nếu không tìm thấy service.
   - Nhận định: Việc duy trì hai khối trích xuất song song có nguy cơ gây phân kỳ dữ liệu nếu Châu thay đổi cấu trúc `pricingPolicySnapshot`.

### 1.2. Giải pháp hoàn thiện một lần của Tín
Tín đã chuẩn hóa lại `BackEnd/src/services/enrollmentService.js`:
- Loại bỏ toàn bộ code trùng lặp fallback logic.
- Ủy quyền trực tiếp và duy nhất cho `buildEnrollmentSnapshotFromClass` của Châu:
  ```javascript
  let buildEnrollmentSnapshotFromClass = null;
  try {
    ({ buildEnrollmentSnapshotFromClass } = require("./coursePricingPolicyService"));
  } catch (err) {
    const missingThisModule =
      err && err.code === "MODULE_NOT_FOUND" &&
      String(err.message || "").startsWith("Cannot find module './coursePricingPolicyService'");
    if (!missingThisModule) throw err;
  }

  const extractCur09Snapshot = (targetClass) =>
    typeof buildEnrollmentSnapshotFromClass === "function"
      ? buildEnrollmentSnapshotFromClass(targetClass)
      : {};
  ```
- **Ưu điểm**:
  - Tương thích sạch 100% khi chạy trên nhánh `feature/teacher-admin` (chưa có file `coursePricingPolicyService.js`).
  - Tự động kích hoạt gọi helper chính thức của Châu khi chạy trên nhánh `dev` hoặc khi merge.
  - Fail-closed: Bất kỳ lỗi runtime nào khác (ngoài việc thiếu file do nhánh cũ) sẽ quăng lỗi ngay lập tức, không che giấu lỗi.

---

## 2. KIỂM CHỨNG TÍNH BẤT BIẾN CỦA HỌC PHÍ VÀ DOANH THU (PRICE IMMUTABILITY)

### 2.1. Kịch bản kiểm chứng thực nghiệm (`cur09EnrollmentSnapshotFinance.test.js`)
1. **Tạo lớp và ghi danh**: Lớp học được tạo tại giá 500.000 VNĐ. Học sinh thực hiện ghi danh (`createEnrollment`). Đơn `Enrollment` lưu snapshot `tuitionAmount: 500000` cùng toàn bộ snapshot giáo trình và chính sách giá.
2. **Biến động giá sau ghi danh**: Quản trị viên cập nhật giá lớp học tăng 50% lên mức 750.000 VNĐ (`Class.price = 750000`).
3. **Thanh toán và Sổ cái**:
   - Học sinh gọi `createTuitionPaymentIntent`: Payment Intent sinh ra có số tiền là **500.000 VNĐ** (đọc từ `enrollment.tuitionAmount`), tuyệt đối không bị đội lên 750.000 VNĐ.
   - Khi thanh toán thành công qua payOS: Giao dịch kế toán `Transaction` hạch toán đúng **500.000 VNĐ**.
   - Bản ghi doanh thu `TeacherEarning`: Tính toán grossAmount dựa trên đơn ghi danh gốc **500.000 VNĐ**, không chịu ảnh hưởng bởi việc tăng giá của lớp học.

### 2.2. Kết quả kiểm thử
- Suite `BackEnd/tests/cur09EnrollmentSnapshotFinance.test.js`: **3 / 3 tests PASS (100%)**.
- Kiểm thử chạy đồng thời trên bản trial merge kết hợp với toàn bộ model `CoursePricingPolicy` và `Class` của Châu đều đạt kết quả xuất sắc.

**Kết luận**: **CUR-09 FINANCE SIDE: DONE & VERIFIED**. Snapshot học phí và giáo trình bất biến 100%.

