# EDUNITY V3 — BÁO CÁO KẾT QUẢ HỒI QUY & KIỂM THỬ TỔNG HỢP

**Mã tài liệu:** `docs/audits/tuition-payment-final-fix/06_REGRESSION_RESULTS.md`  
**Task ID:** `EDUNITY-TUITION-PAYMENT-FINAL-FIX`  
**Chủ trì:** QA Lead & Integration Architect  

---

## 1. TỔNG QUAN KIỂM THỬ

Tất cả các thay đổi về Backend và Frontend trong task `EDUNITY-TUITION-PAYMENT-FINAL-FIX` đã được kiểm thử hồi quy độc lập, bao gồm:
1. **Kiểm thử biên dịch Frontend & Typecheck TypeScript:** `npm --prefix FrontEnd run build` (`tsc -b && vite build`).
2. **Kiểm thử tĩnh Linter:** `oxlint` trên toàn bộ 267 files Frontend.
3. **Kiểm thử tích hợp chuyên biệt mới (Backend Jest):** `tests/tuitionPaymentFinalFix.test.js`.
4. **Kiểm thử hồi quy quy trình đăng ký lớp học công khai:** `tests/publicClassRegistration.test.js`.
5. **Kiểm thử hồi quy tài chính và ghi danh:** `tests/enrollment.test.js`.

---

## 2. KẾT QUẢ CHI TIẾT CÁC SUITE KIỂM THỬ

### 2.1. Frontend Build & TypeScript Typecheck
- **Lệnh thực thi:** `npm --prefix FrontEnd run build`
- **Exit code:** `0` (Success)
- **Kết quả:**
  ```text
  ✓ 3391 modules transformed.
  rendering chunks...
  computing gzip size...
  dist/index.html                     0.66 kB │ gzip:   0.39 kB
  dist/assets/index-HRoN3iiC.css    106.41 kB │ gzip:  18.90 kB
  dist/assets/index-BjnIH1Tm.js   3,462.19 kB │ gzip: 956.00 kB
  ✓ built in 7.14s
  ```
- **Linter (oxlint):** 0 errors.

### 2.2. Suite Kiểm thử Chuyên biệt: `tuitionPaymentFinalFix.test.js`
- **Lệnh thực thi:** `npm --prefix BackEnd test -- tests/tuitionPaymentFinalFix.test.js`
- **Exit code:** `0` (Success)
- **Số test:** 5/5 PASS (100%)
- **Nội dung kiểm chứng:**
  1. `Test 1:` Đơn đăng ký lớp học mới thiết lập `holdExpiresAt` đúng chuẩn 10 phút (600 giây).
  2. `Test 2:` Payment Intent tự động kế thừa chính xác mốc 10 phút của `holdExpiresAt`.
  3. `Test 3:` Endpoint `GET /api/me/enrollments?include=class` trả về đầy đủ mảng `schedule` của các lớp đã ghi danh.
  4. `Test 4:` Cơ chế Active Polling Sync trong `getPaymentById` tự động phát hiện trạng thái `PAID` từ payOS và kích hoạt xác nhận `Enrollment(CONFIRMED)` + `Payment(COMPLETED)`.
  5. `Test 5:` Đơn cũ đã ở trạng thái `EXPIRED` tuyệt đối không bị tự động sửa đổi khi chưa có lệnh đối soát ủy quyền.

### 2.3. Suite Hồi quy Đăng ký Lớp học: `publicClassRegistration.test.js`
- **Lệnh thực thi:** `npm --prefix BackEnd test -- tests/publicClassRegistration.test.js`
- **Exit code:** `0` (Success)
- **Số test:** 8/8 PASS (100%)
- **Nội dung kiểm chứng:**
  1. `1.1:` Chỉ các lớp học sắp khai giảng (`startDate > now`) ở trạng thái OPEN mới hiển thị trên trang khám phá.
  2. `1.2:` Không để lộ các lớp chưa duyệt, bản nháp hoặc đã hủy (DRAFT, PENDING_APPROVAL, REJECTED, CANCELLED).
  3. `1.3:` Lớp đã đầy (`enrolledCount >= capacity`) vẫn hiển thị nhưng gắn huy hiệu đầy chỗ.
  4. `2.1:` Sắp xếp mặc định ưu tiên ngày khai giảng gần nhất.
  5. `2.2:` Phân trang chính xác số lượng và tổng số trang.
  6. `3.1:` Đăng ký lớp FREE tạo bản ghi `CONFIRMED` ngay lập tức không qua thanh toán.
  7. `3.2:` Đăng ký lớp PAID tạo bản ghi giữ chỗ `PENDING_PAYMENT` và sinh Payment Intent.
  8. `3.3:` Người dùng chưa đăng nhập bị chặn với mã 401 Unauthorized.

### 2.4. Suite Hồi quy Ghi danh: `enrollment.test.js`
- **Lệnh thực thi:** `npm --prefix BackEnd test -- tests/enrollment.test.js`
- **Exit code:** `0` (Success)
- **Số test:** 10/10 PASS (100%)
- **Nội dung kiểm chứng:**
  - Giữ chỗ và xử lý tranh chấp sĩ số qua CAS Atomic Operation (Concurrency).
  - Tự động hủy chỗ khi học viên chọn hủy giữ chỗ.
  - Ngăn chặn hủy các đơn đã `CONFIRMED`.

---

## 3. TỔNG KẾT BẢNG SỐ LIỆU KIỂM THỬ

| Nhóm kiểm thử | Trạng thái | Tổng Tests | Passed | Failed | Thời gian | Exit Code |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Frontend Build (`tsc -b && vite build`)** | **PASS** | Bundle | OK | 0 | 7.14s | 0 |
| **Frontend Linter (`oxlint`)** | **PASS** | 267 files | OK | 0 | 0.83s | 0 |
| **Backend: `tuitionPaymentFinalFix.test.js`** | **PASS** | 5 | 5 | 0 | 11.12s | 0 |
| **Backend: `publicClassRegistration.test.js`** | **PASS** | 8 | 8 | 0 | 21.98s | 0 |
| **Backend: `enrollment.test.js`** | **PASS** | 10 | 10 | 0 | 7.14s | 0 |
| **TỔNG CỘNG** | **PASS** | **23** | **23** | **0** | — | **0** |

Không có bất kỳ lỗi biên dịch, linter hay hồi quy nào phát sinh.
