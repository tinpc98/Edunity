# KẾT QUẢ KIỂM THỬ (TEST RESULTS)
## TASK ID: EDUNITY-PUBLIC-CLASS-REGISTRATION-V1
**Thời gian:** 2026-11-20  
**Môi trường:** Local MongoDB In-Memory ReplicaSet / Jest / Vite + TypeScript Build  

---

### I. TỔNG HỢP KIỂM THỬ

| Nhóm Kiểm Thử | Suite File | Tổng số Test | Kết quả | Thời gian |
|---|---|---|---|---|
| **Chức năng mới** | `tests/publicClassRegistration.test.js` | 8 | **8/8 PASS (100%)** | 6.97s |
| **Catalog Regression** | `tests/catalogSearch.test.js` | 29 | **29/29 PASS (100%)** | 16.01s |
| **Frontend Build & Typecheck** | `npm --prefix FrontEnd run build` (`tsc -b && vite build`) | Toàn bộ components & modules | **BUILD THÀNH CÔNG (0 LỖI)** | 6.29s |

---

### II. CHI TIẾT BỘ TEST MỚI: `tests/publicClassRegistration.test.js`

```
PASS tests/publicClassRegistration.test.js (6.769 s)
  EDUNITY-PUBLIC-CLASS-REGISTRATION-V1: Public Class Listing & Registration Test Suite
    √ 1.1: Only upcoming classes (startDate > now) in status OPEN are visible in public catalog (312 ms)
    √ 1.2: Never exposes unapproved or cancelled classes (DRAFT, PENDING_APPROVAL, REJECTED, CANCELLED) (234 ms)
    √ 1.3: Classes that are full (enrolledCount >= capacity) remain visible with capacity badge (185 ms)
    √ 2.1: Default sorting prioritizes upcoming classes (startDate: 1) (199 ms)
    √ 2.2: Pagination filters before count & limit to ensure total and totalPages are accurate (304 ms)
    √ 3.1: Free class registration creates CONFIRMED enrollment immediately without payment intent (259 ms)
    √ 3.2: Paid class registration reserves seat with PENDING_PAYMENT and creates payment intent (390 ms)
    √ 3.3: Unauthenticated registration is rejected with 401 (390 ms)

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
Snapshots:   0 total
Time:        6.97 s
```

#### Phân tích chi tiết:
1. **Lọc lớp đã bắt đầu (`startDate <= now`):**
   - Lớp có ngày khai giảng trong quá khứ bị loại bỏ hoàn toàn khỏi `data.items`.
   - `total` và `totalPages` giảm tương ứng, không đếm các lớp quá hạn.
2. **Bảo mật trạng thái duyệt (`status: "OPEN"`):**
   - Các lớp ở trạng thái `DRAFT`, `PENDING_APPROVAL`, `REJECTED`, `CANCELLED` không xuất hiện, kể cả khi client gửi truy vấn ép `?statuses=DRAFT,PENDING_APPROVAL`.
3. **Hiển thị lớp đầy chỗ:**
   - Lớp có `enrolledCount = capacity = 10` vẫn được trả về trong danh sách công khai, cho phép UI hiển thị nhãn "Đã đủ chỗ".
4. **Sắp xếp theo ngày khai giảng:**
   - Thứ tự trả về tự động xếp lớp gần ngày hiện tại nhất lên đầu danh sách (`startDate: 1, _id: 1`).
5. **Đăng ký một chạm (One-click Registration):**
   - Lớp miễn phí: Đăng ký thành công trả về `CONFIRMED`, `paymentSource: FREE`.
   - Lớp có phí: Đăng ký tạo bản ghi `PENDING_PAYMENT`, sau đó tự động tạo `Payment` intent với mã `orderCode`, số tiền, và thời hạn giữ chỗ.

---

### III. KẾT QUẢ REGRESSION: `tests/catalogSearch.test.js`

```
PASS tests/catalogSearch.test.js (15.782 s)
  TIN-04A: Catalog Search, Filtering, Pagination & Stable Sorting Test Suite
    √ CAT-04A-01: FREE + minPrice=0 + maxPrice=5000000 returns only free classes (price = 0) (256 ms)
    √ CAT-04A-02: FREE + minPrice=100000 returns empty result (items=[], total=0) (198 ms)
    √ CAT-04A-03: PAID + maxPrice=0 returns empty result (items=[], total=0) (255 ms)
    √ CAT-04A-04: PAID + price range (100k - 500k) returns only paid classes within range (227 ms)
    √ CAT-04A-05: No classTypes specified, minPrice=0 returns all classes (price >= 0) (198 ms)
    √ CAT-04A-06: maxPrice=0 returns only classes with price 0 (188 ms)
    √ CAT-04A-07: minPrice > maxPrice handled safely without HTTP 500 (items=[], total=0) (369 ms)
    √ CAT-04A-08: Negative minPrice clamped to 0 safely without HTTP 500 (401 ms)
    √ CAT-04A-09: Non-numeric minPrice=abc ignored safely without NaN query (427 ms)
    √ CAT-04A-10: maxPrice=Infinity ignored safely without creating invalid query (386 ms)
    √ CAT-04A-11: Valid categoryId with data returns only classes in that category (451 ms)
    √ CAT-04A-12: Valid categoryId without data returns empty array items=[] and total=0 (439 ms)
    √ CAT-04A-13: Malformed categoryId returns 400 validation error without HTTP 500 (445 ms)
    √ CAT-04A-14: Combines categoryId and subjectId correctly (415 ms)
    √ CAT-04A-15: Combines categoryId and price filters correctly (442 ms)
    √ CAT-04A-16: Combines categoryId and standard search query correctly (470 ms)
    √ CAT-04A-17: Negative page=-1 clamped safely to page 1 without HTTP 500 (325 ms)
    √ CAT-04A-18: Zero page=0 clamped safely to page 1 without HTTP 500 (401 ms)
    √ CAT-04A-19: Negative pageSize=-10 safely defaulted without HTTP 500 (441 ms)
    √ CAT-04A-20: Overlarge pageSize=500 capped at 100 (404 ms)
    √ CAT-04A-21: Invalid string pageSize defaulted safely to 12 without HTTP 500 (365 ms)
    √ CAT-04A-22: Sorting multiple classes with same price produces stable deterministic order (481 ms)
    √ CAT-04A-23: Pagination page 1 and page 2 have no overlapping items (480 ms)
    √ CAT-04A-24: Never exposes DRAFT, PENDING_APPROVAL, or REJECTED classes in Public Catalog (486 ms)
    √ CAT-04A-25: Response contract adheres strictly to { success: true, data: { items, total, page, pageSize, totalPages } } (457 ms)
    √ CAT-04A-26: Regression - legacy catalog routes work properly (455 ms)
    √ CAT-04A-27: TIN-01 regression - user without embedded profile can upload avatar without PROFILE_NOT_EDITABLE (577 ms)
    √ CAT-04A-28: TIN-02A regression - storageService / upload avatar accepts MIME image/jpg (500 ms)
    √ CAT-04A-29: TIN-03A regression - GET /api/student/sessions/:id/join is strictly read-only (returns 405) and canJoin checks status (518 ms)

Test Suites: 1 passed, 1 total
Tests:       29 passed, 29 total
Snapshots:   0 total
Time:        16.01 s
```

---

### IV. FRONTEND BUILD & LINT/TYPE CHECK

```bash
> tsc -b && vite build
vite v8.3.0 building client environment for production...
transforming...
✓ 3389 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                     0.66 kB │ gzip:   0.39 kB
dist/assets/index-BzvNQ5or.css    104.98 kB │ gzip:  18.71 kB
dist/assets/index-KfNqpTDe.js   3,437.29 kB │ gzip: 947.82 kB
✓ built in 6.29s
```
**Trạng thái:** 0 lỗi TypeScript, 0 lỗi build.
