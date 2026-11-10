# BÁO CÁO KỸ THUẬT: MỞ RỘNG COURSE THEO KHỐI LỚP, TRÌNH ĐỘ VÀ SÁCH THAM CHIẾU (TASK CUR-01)

**Dự án:** Edunity V3 Platform  
**Task ID:** TASK CUR-01 — Course grade level curriculum reference  
**Chế độ:** IMPLEMENTATION — PHASE 2  
**Kỹ sư thực hiện:** Senior Backend Engineer  
**Trạng thái:** COMPLETE (Hoàn thành 100%, 21/21 test cases PASS)

---

## 1. TỔNG QUAN VÀ MỤC TIÊU TRIỂN KHAI

Nhiệm vụ CUR-01 yêu cầu mở rộng mô hình Khóa học (`Course`) theo 3 tiêu chí học thuật cốt lõi và duy trì bất biến chuỗi phân cấp danh mục:
1. **Khối lớp (`gradeLevel`)**: Phân loại theo 15 khối chuẩn Bộ GD&ĐT (`PRE_PRIMARY`, `GRADE_1` .. `GRADE_12`, `UNIVERSITY`, `COLLEGE`), kèm quy tắc ràng buộc logic với Chuyên mục (`Category`) theo chuẩn BR-43/44/45.
2. **Trình độ (`level`) & Ingress Normalization**: Duy trì enum chuẩn Mongoose V3 `["BEGINNER", "INTERMEDIATE", "ADVANCED"]`, đồng thời triển khai cơ chế chuẩn hóa đầu vào (Ingress Mapping) tự động chuyển đổi giá trị cũ `BASIC` thành `BEGINNER` một cách êm ái mà không làm vỡ enum schema Mongoose.
3. **Sách / Chương trình tham chiếu (`curriculumReference`)**: Bổ sung trường dữ liệu mô tả bộ sách giáo khoa (ví dụ: *"Cánh Diều"*, *"Kết Nối Tri Thức Với Cuộc Sống"*, *"Chân Trời Sáng Tạo"*) hoặc chương trình quốc tế (*"Cambridge"*, *"Oxford"*, *"IB"*) trên cả `Course` và `CourseProposal`.
4. **Bảo toàn quan hệ phân cấp `Category → Subject → Course`**: Giữ nguyên tính toàn vẹn 1—N, dữ liệu snapshot denormalized (`categoryName`, `subjectName`), và cơ chế cascade updates khi đổi tên danh mục.

---

## 2. CHI TIẾT CÁC THAY ĐỔI VÀ LOGIC TRIỂN KHAI

### 2.1. Mở rộng Model Mongoose
- [`BackEnd/src/models/Course.js`](file:///c:/CODE/Edunity/BackEnd/src/models/Course.js):
  - Bổ sung trường:
    ```javascript
    curriculumReference: { type: String, trim: true, default: null }, // Sách/chương trình tham chiếu
    ```
  - Bổ sung Index:
    ```javascript
    courseSchema.index({ curriculumReference: 1 });
    ```
  - Duy trì các index hiện có: `{ subjectId: 1 }`, `{ categoryId: 1, gradeLevel: 1, status: 1 }`, và text index `{ title: "text", description: "text" }`.
- [`BackEnd/src/models/CourseProposal.js`](file:///c:/CODE/Edunity/BackEnd/src/models/CourseProposal.js):
  - Bổ sung trường:
    ```javascript
    curriculumReference: { type: String, trim: true, default: null },
    ```
    Giúp giảng viên có thể chỉ định bộ sách tham chiếu ngay từ bước nộp hồ sơ đề xuất khóa học.

### 2.2. Ingress Normalization cho Cấp độ Khóa học (`level`)
File: [`BackEnd/src/services/courseCatalogService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/courseCatalogService.js)
- Tuân thủ nghiêm ngặt chỉ đạo: *"Không tự đổi enum BEGINNER thành BASIC; phải có mapping và quyết định migration"*.
- Triển khai helper chuẩn hóa đầu vào:
  ```javascript
  const normalizeLevel = (rawLevel) => {
    if (rawLevel === undefined || rawLevel === null || rawLevel === "") return undefined;
    const upper = String(rawLevel).trim().toUpperCase();
    if (upper === "BASIC") return "BEGINNER"; // Ánh xạ an toàn dữ liệu V2/client cũ
    return upper;
  };

  const resolveLevel = (level) => {
    const normalized = normalizeLevel(level);
    if (normalized === undefined) return undefined;
    if (!COURSE_LEVELS.includes(normalized)) throw validationError(`level must be one of ${COURSE_LEVELS.join(", ")}`);
    return normalized;
  };
  ```
- Kết quả: Khi client gửi `level: "BASIC"`, hệ thống tự động map thành `"BEGINNER"`, lưu thành công vào database mà không gây lỗi `400 VALIDATION_ERROR` hay vi phạm enum schema.

### 2.3. Cập nhật `courseCatalogService.js`
- Bổ sung `curriculumReference` vào `COURSE_TEXT_FIELDS`:
  ```javascript
  const COURSE_TEXT_FIELDS = ["description", "learningObjectives", "syllabus", "prerequisites", "curriculumReference"];
  ```
  Nhờ đó, cả `insertCourse` và `updateCourse` tự động nhận diện và cập nhật `curriculumReference`.
- Nâng cấp `searchCourses`:
  - Hỗ trợ lọc theo trường riêng:
    ```javascript
    if (query.curriculumReference) {
      filter.curriculumReference = { $regex: escapeRegex(query.curriculumReference.trim()), $options: "i" };
    }
    ```
  - Tích hợp vào tìm kiếm tổng hợp (`search` text query):
    ```javascript
    if (query.search) {
      const pattern = { $regex: escapeRegex(query.search), $options: "i" };
      filter.$or = [{ title: pattern }, { description: pattern }, { curriculumReference: pattern }];
    }
    ```
    Người dùng có thể gõ từ khóa bộ sách (ví dụ: *"Cánh Diều"*) vào ô tìm kiếm chung để tìm các khóa học tương ứng.

### 2.4. Nâng cấp Quy trình Duyệt Đề Xuất (`courseProposalService.js`)
File: [`BackEnd/src/services/courseProposalService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/courseProposalService.js)
- Thêm `curriculumReference` vào `TEXT_FIELDS` để `createProposal` và `updateMyProposal` tự động tiếp nhận.
- Áp dụng `catalog.resolveLevel(data.level)` trong `buildProposalData` để giáo viên gửi `level: "BASIC"` cũng được chuẩn hóa thành `"BEGINNER"`.
- Trong hàm `approveProposal`, cho phép chuyển thừa `curriculumReference` sang `catalog.insertCourse` và hỗ trợ Admin xác nhận/ghi đè nếu cần:
  ```javascript
  const data = proposal.toObject();
  if (body.gradeLevel !== undefined) data.gradeLevel = body.gradeLevel;
  if (body.curriculumReference !== undefined) data.curriculumReference = body.curriculumReference;
  ```

---

## 3. BẢNG ĐỐI SOÁT FILE ĐÃ THAY ĐỔI VÀ TẠO MỚI

| STT | File / Đường dẫn | Loại thay đổi | Chi tiết nội dung thay đổi |
| :---: | :--- | :---: | :--- |
| 1 | [`BackEnd/src/models/Course.js`](file:///c:/CODE/Edunity/BackEnd/src/models/Course.js) | Sửa đổi | Bổ sung field `curriculumReference` và index `{ curriculumReference: 1 }`. |
| 2 | [`BackEnd/src/models/CourseProposal.js`](file:///c:/CODE/Edunity/BackEnd/src/models/CourseProposal.js) | Sửa đổi | Bổ sung field `curriculumReference` vào schema đề xuất. |
| 3 | [`BackEnd/src/services/courseCatalogService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/courseCatalogService.js) | Sửa đổi | Bổ sung `curriculumReference` vào text fields, Ingress `BASIC` $\rightarrow$ `BEGINNER`, lọc search theo sách tham chiếu. |
| 4 | [`BackEnd/src/services/courseProposalService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/courseProposalService.js) | Sửa đổi | Tích hợp `curriculumReference` vào proposal fields, chuẩn hóa level và chuyển thừa qua transaction approve. |
| 5 | [`BackEnd/docs/api-contract-academic.md`](file:///c:/CODE/Edunity/BackEnd/docs/api-contract-academic.md) | Sửa đổi | Cập nhật API contract mục C02: thêm `curriculumReference` vào request/response mẫu của Course Proposal. |
| 6 | [`BackEnd/tests/courseCurriculum.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/courseCurriculum.test.js) | Tạo mới | Bộ kiểm thử tự động toàn diện 21/21 test cases (100% PASS). |
| 7 | [`BackEnd/docs/cur-01-course-curriculum-report.md`](file:///c:/CODE/Edunity/BackEnd/docs/cur-01-course-curriculum-report.md) | Tạo mới | Báo cáo kỹ thuật chi tiết này. |

---

## 4. KẾT QUẢ KIỂM THỬ TỰ ĐỘNG (TEST SUITE VERIFICATION)

Bộ kiểm thử [`BackEnd/tests/courseCurriculum.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/courseCurriculum.test.js) chạy hoàn toàn trong môi trường sandbox cô lập, tốc độ xử lý nhanh (2.3s) và đạt tỷ lệ thành công 100%:

```text
PASS tests/courseCurriculum.test.js
  TASK CUR-01: Course Grade Level, Curriculum Reference & Hierarchy Suite
    1. Schema Extensions & Invariants (Course & CourseProposal)
      √ CUR-01.SCH.1: Course schema contains curriculumReference as optional String (4 ms)
      √ CUR-01.SCH.2: CourseProposal schema contains curriculumReference as optional String (1 ms)
      √ CUR-01.SCH.3: Course schema maintains strict COURSE_LEVELS enum (BEGINNER, not BASIC) (2 ms)
      √ CUR-01.SCH.4: Course schema maintains GRADE_LEVELS enum with 15 standardized grades (1 ms)
      √ CUR-01.SCH.5: Course schema indexes include categoryId+gradeLevel and curriculumReference
    2. Ingress Level Normalization (BASIC -> BEGINNER)
      √ CUR-01.LVL.1: normalizeLevel maps legacy 'BASIC' (case-insensitive) to 'BEGINNER' (1 ms)
      √ CUR-01.LVL.2: normalizeLevel preserves canonical COURSE_LEVELS
      √ CUR-01.LVL.3: normalizeLevel returns undefined for blank or null inputs
      √ CUR-01.LVL.4: resolveLevel validates and maps BASIC to BEGINNER successfully
      √ CUR-01.LVL.5: resolveLevel rejects invalid level with 400 VALIDATION_ERROR (11 ms)
    3. Category - Grade Level Binding (BR-43, BR-44, BR-45)
      √ CUR-01.CAT.1: allowedGradeLevelsForCategory derives allowed grades from category name/slug
      √ CUR-01.CAT.2: resolveGradeLevel allows matching grade level
      √ CUR-01.CAT.3: resolveGradeLevel throws GRADE_LEVEL_CATEGORY_MISMATCH when grade outside category (6 ms)
      √ CUR-01.CAT.4: resolveGradeLevel throws INVALID_GRADE_LEVEL for non-existent grade enum
    4. Course Catalog Service Integration
      √ CUR-01.SVC.1: insertCourse includes curriculumReference and normalizes level: 'BASIC' -> 'BEGINNER' (2 ms)
      √ CUR-01.SVC.2: searchCourses filters by curriculumReference with case-insensitive regex (1 ms)
      √ CUR-01.SVC.3: searchCourses general search ($or) includes curriculumReference (1 ms)
      √ CUR-01.SVC.4: updateCourse allows updating curriculumReference and level (1 ms)
    5. Course Proposal Workflow (Curriculum Reference & Approval)
      √ CUR-01.PROP.1: Teacher proposal accepts curriculumReference and normalizes level: 'BASIC' (1 ms)
      √ CUR-01.PROP.2: approveProposal passes curriculumReference to insertCourse in catalog (1 ms)
    6. Category -> Subject -> Course Hierarchy Invariants
      √ CUR-01.HIER.1: Subject and Course schemas retain references to Category and Subject

Test Suites: 1 passed, 1 total
Tests:       21 passed, 21 total
Snapshots:   0 total
Time:        2.346 s
```

### Kiểm tra Hồi quy Toàn diện (Regression Check across 6 Suites):
Chạy đồng thời 6 test suites của toàn bộ các Task nền tảng và CUR-01:
- `academicContract.test.js`
- `academicSeedIdempotent.test.js`
- `backupRestoreClone.test.js`
- `cronLockIdempotency.test.js`
- `migrationPreflight.test.js`
- `courseCurriculum.test.js`

**Kết quả:** `Test Suites: 6 passed, 6 total. Tests: 97 passed, 97 total (100% PASS)` trong 3.788s. Không có bất kỳ hồi quy nào.

---

## 5. KẾT LUẬN VÀ TUÂN THỦ NGUYÊN TẮC

- **Phạm vi triển khai**: Đúng mức tối thiểu cần thiết để đáp ứng CUR-01; không refactor lan sang các module khác.
- **Tính tương thích ngược**: Dữ liệu cũ và client cũ gửi `BASIC` được ingress helper xử lý mượt mà thành `BEGINNER`. Trường `curriculumReference` là nullable/optional nên không gây ảnh hưởng đến dữ liệu hiện hữu.
- **Ranh giới an toàn**: Không sửa đổi code tài chính (của Tin), auth/security (của Bảo), hay frontend (của Băng).
- **Git status**: Không tự động commit hay push code. Mã nguồn sẵn sàng để nghiệm thu.

