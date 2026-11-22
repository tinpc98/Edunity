# BÁO CÁO KIỂM THỬ HỒI QUY CHỨC NĂNG (FUNCTIONAL REGRESSION)
## TASK: EDUNITY-PUBLIC-MINT-TEAL-REDESIGN

---

### 1. BẢO TỒN CÁC TÍNH NĂNG ĐÃ TRIỂN KHAI TRƯỚC ĐÓ

Trong suốt quá trình tái thiết kế giao diện Public sang phong cách Mint/Teal, tất cả các cam kết và thay đổi từ task `EDUNITY-PUBLIC-CLASS-REGISTRATION-V1` đều được bảo tồn nghiêm ngặt:

| Tiêu Chí Nghiệp Vụ | Yêu Cầu Thiết Kế & Chức Năng | Trạng Thái Thực Tế |
| :--- | :--- | :--- |
| **Ẩn bộ lọc Trạng thái** | Tuyệt đối không hiển thị Status Filter trên trang khám phá lớp học công khai `/classes`. | **ĐÃ BẢO TỒN** |
| **Lọc thời gian khai giảng** | Chỉ hiển thị các lớp sắp khai giảng trong tương lai (`startDate > now`). Lớp đã hoặc đang diễn ra (`startDate <= now`) bị ẩn khỏi catalog công cộng. | **ĐÃ BẢO TỒN** |
| **Hiển thị lớp đầy chỗ** | Lớp đã đủ học viên (`enrolledCount >= capacity`) vẫn xuất hiện trong danh sách kèm badge "Đã đủ chỗ" và nút disabled, không bị ẩn đột ngột. | **ĐÃ BẢO TỒN** |
| **Hiển thị lớp đã đăng ký** | Học sinh đã ghi danh vẫn thấy lớp kèm nhãn "Đã đăng ký". | **ĐÃ BẢO TỒN** |
| **Loại bỏ tab Giáo trình** | Trang `ClassDetailPage` chỉ có 2 tab chính: "Nội dung lớp học" và "Giảng viên" (cùng tab Đánh giá nếu có). Không xuất hiện tab trùng lặp "Lộ trình & Mục tiêu". | **ĐÃ BẢO TỒN** |
| **Luồng Đăng ký một chạm** | Nút "Đăng ký ngay" thực hiện ghi danh và lập tức mở `DirectTuitionPaymentModal` với mã VietQR thật payOS, không đẩy học sinh qua trang trung gian không cần thiết. | **ĐÃ BẢO TỒN** |
| **Bảo toàn Backend & Database** | Không sửa đổi các endpoint Backend, cấu trúc MongoDB, bảng mã bảo mật payOS, cơ chế xác thực hoặc bảng Ledger tài chính. | **ĐÃ BẢO TỒN** |

---

### 2. KẾT QUẢ KIỂM THỬ TỰ ĐỘNG

#### 2.1. Frontend Build & Typecheck
- **Lệnh thực thi:** `npm --prefix FrontEnd run build`
- **Bộ công cụ:** `tsc -b && vite build`
- **Kết quả:**
  - Modules transformed: 3390 modules
  - TypeScript error count: **0**
  - Exit code: **0 (SUCCESS)**
  - Thời gian build: 5.99s

#### 2.2. Backend Integration Test Suite
- **Lệnh thực thi:** `npm --prefix BackEnd test -- tests/publicClassRegistration.test.js`
- **Bộ công cụ:** `Jest`
- **Kết quả:**
  - Suites: 1 passed, 1 total
  - Tests: **8 passed, 8 total** (100% PASS)
  - Exit code: **0 (SUCCESS)**
  - Chi tiết từng test:
    1. `1.1: Only upcoming classes (startDate > now) in status OPEN are visible in public catalog` — **PASS**
    2. `1.2: Never exposes unapproved or cancelled classes (DRAFT, PENDING_APPROVAL, REJECTED, CANCELLED)` — **PASS**
    3. `1.3: Classes that are full (enrolledCount >= capacity) remain visible with capacity badge` — **PASS**
    4. `2.1: Default sorting prioritizes upcoming classes (startDate: 1)` — **PASS**
    5. `2.2: Pagination filters before count & limit to ensure total and totalPages are accurate` — **PASS**
    6. `3.1: Free class registration creates CONFIRMED enrollment immediately without payment intent` — **PASS**
    7. `3.2: Paid class registration reserves seat with PENDING_PAYMENT and creates payment intent` — **PASS**
    8. `3.3: Unauthenticated registration is rejected with 401` — **PASS**
