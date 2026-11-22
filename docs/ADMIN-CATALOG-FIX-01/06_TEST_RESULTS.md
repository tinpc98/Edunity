# 06_TEST_RESULTS.md — Bằng Chứng Kiểm Thử (Test Evidence)

**Dự án:** EDUNITY V3  
**Tác vụ:** TASK ADMIN-CATALOG-FIX-01 — SEPARATE ADMIN MANAGEMENT PAGES & REMOVE REDUNDANT BANNERS  
**Thời gian thực hiện:** 22/11/2026  
**Kỹ sư thực hiện:** Senior Fullstack Engineer

---

## 1. KIỂM THỬ FRONTEND (BUILD & TYPECHECK)

- **Lệnh thực thi:**
  ```powershell
  npm --prefix FrontEnd run build
  ```
- **Kết quả:**
  ```
  > edunity@0.0.0 build
  > tsc -b && vite build

  vite v8.3.0 building client environment for production...
  transforming...
  ✓ 3405 modules transformed.
  rendering chunks...
  computing gzip size...
  dist/index.html                     0.66 kB │ gzip:     0.38 kB
  dist/assets/index-CiaUnwVJ.css    119.46 kB │ gzip:    20.31 kB
  dist/assets/index-CzVteTWp.js   3,779.70 kB │ gzip: 1,042.85 kB

  ✓ built in 3.56s
  ```
- **Đánh giá:**
  - TypeScript Compiler (`tsc -b`): **0 errors** (không có lỗi kiểu, không có missing property).
  - Vite Bundler: **0 broken imports**, 3,405 modules đóng gói thành công.

---

## 2. KIỂM THỬ BACKEND (ACADEMIC CATALOG & DEPENDENCY SUITES)

- **Lệnh thực thi:**
  ```powershell
  npm test --prefix BackEnd -- tests/courseLifecycleCur12.test.js tests/syllabusVersion.test.js tests/courseCurriculum.test.js tests/be03AcademicSoftDelete.test.js tests/catalogSearch.test.js tests/academicContract.test.js
  ```
- **Kết quả:**
  ```
  PASS tests/academicContract.test.js
  PASS tests/courseLifecycleCur12.test.js
  PASS tests/catalogSearch.test.js (8.118 s)
  PASS tests/be03AcademicSoftDelete.test.js (8.465 s)
  PASS tests/courseCurriculum.test.js (11.215 s)
  PASS tests/syllabusVersion.test.js (12.041 s)

  Test Suites: 6 passed, 6 total
  Tests:       150 passed, 150 total
  Snapshots:   0 total
  Time:        12.744 s, estimated 13 s
  Ran all test suites matching tests/courseLifecycleCur12.test.js|tests/syllabusVersion.test.js|tests/courseCurriculum.test.js|tests/be03AcademicSoftDelete.test.js|tests/catalogSearch.test.js|tests/academicContract.test.js.
  ```

---

## 3. CHI TIẾT CÁC TEST CASES ĐẶC THÙ ĐÃ XÁC THỰC

1. **`CUR-04.1` (Admin List Course Return Both Statuses):**
   - Xác thực `adminListCourses` không áp đặt điều kiện `status: ACTIVE` mặc định. Trả về cả 2 khóa học `ACTIVE` và `INACTIVE` khi không lọc trạng thái. ➔ **PASSED**
2. **`CUR-04.2` (Strict Status Filtering):**
   - Xác thực lọc chính xác theo `status: "INACTIVE"` và `status: "ACTIVE"`. ➔ **PASSED**
3. **`CUR-04.3` (Search Capabilities):**
   - Tìm kiếm đa trường trên `title`, `slug`, `description`, `curriculumReference`. ➔ **PASSED**
4. **`CUR-04.10` & `CUR-04.11` (RBAC & Detail Access):**
   - Khóa học `INACTIVE` bị chặn 403 đối với Student/Teacher khi gọi API Admin.
   - Admin gọi `GET /api/admin/courses/:id` nhận mã 200 OK ngay cả khi khóa học đang `INACTIVE`. ➔ **PASSED**
5. **`BE03.QRY-5` & `BE03.QRY-6` (Soft Delete Exclusion):**
   - Danh sách `GET /api/admin/courses` tự động loại bỏ các khóa học đã xóa mềm (`isDeleted: true`).
   - Gọi chi tiết khóa học đã xóa mềm trả về mã 404. ➔ **PASSED**
6. **`CUR-02` & `CUR-12` (Syllabus Versioning & Class Snapshot):**
   - Bản nháp, công bố, lưu trữ phiên bản giáo trình hoạt động độc lập, không ghi đè lịch sử. ➔ **PASSED**
