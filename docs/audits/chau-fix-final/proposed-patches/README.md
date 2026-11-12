# PROPOSED PATCHES — `OWNER_APPROVAL_REQUIRED`

> **TRẠNG THÁI:** **`OWNER_APPROVAL_REQUIRED` — KHÔNG TỰ ÁP DỤNG VÀO WORKING TREE CHÍNH**
>
> Hai file patch trong thư mục này **chỉ cập nhật test fixtures** cho 2 shared test suites ([`BackEnd/tests/platform.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/platform.test.js) và [`BackEnd/tests/authorization.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/authorization.test.js)) vốn nằm ngoài phạm vi tự sửa của Châu trong nhiệm vụ **FIX-FINAL**.
>
> Tuyệt đối **không** hạ hoặc làm yếu các cổng fail-closed nghiệp vụ/bảo mật (`CUR-10` `COURSE_LEVEL_REQUIRED`, `TEA-07`, `CUR-07`, `TEA-12` `503 CONTRACT_DEPENDENCY_BLOCKED`) để làm test xanh giả tạo.

---

## 1. Tóm tắt hai bản vá đề xuất

| File patch | Mục tiêu trên `BE-2` | Thay đổi tối thiểu trong fixture | Lệnh kiểm tra an toàn |
|---|---|---|---|
| [`platform.test.js.patch`](./platform.test.js.patch) | [`BackEnd/tests/platform.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/platform.test.js) | 1. Thêm `level: "BEGINNER"` cho 2 `Course.create(...)` (`L103`, `L889`).<br>2. Seed `CoursePricingPolicy` `ACTIVE` (`CUR-07`) và `TeacherSubjectAuthorization` `APPROVED` (`TEA-07`) cho `newTeacher`.<br>3. Đăng ký `contractVerifier` mock **test-scoped** (`classCreationGateService.setDependencyVerifiers`) kèm `resetDependencyVerifiers()` ở `beforeEach`, `afterEach`, `afterAll`.<br>4. Cập nhật `Session.updateOne` ở `L533` từ `start` (`Date.now() - 5 * 60 * 1000` đặt từ đầu test, bị trôi `> 300s` khi chạy tới `L551`) sang `new Date(Date.now() - 60 * 1000)` để khớp ngưỡng `LATE_AFTER_SECONDS = 300` (`0` jitter) của Tin và giữ nguyên assertion `attendanceStatus: "PRESENT"` ở `L560`. | `git apply --check docs/audits/chau-fix-final/proposed-patches/platform.test.js.patch` |
| [`authorization.test.js.patch`](./authorization.test.js.patch) | [`BackEnd/tests/authorization.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/authorization.test.js) | 1. Áp dụng sạch trên working tree `BE-2` hiện tại (giữ nguyên pre-existing diff tại `L55-57`).<br>2. Thêm `level: "BEGINNER"` cho `course` và `makeClass`; seed `TeacherSubjectAuthorization` (`APPROVED`) cho `teacherA`, `teacherB` và `CoursePricingPolicy` `GLOBAL` `ACTIVE`.<br>3. Bọc 2 test Mass-assignment (`L404`, `L419`) bằng `setDependencyVerifiers({ contractVerifier })` trong `try ... finally { resetDependencyVerifiers(); }` + `afterEach`/`afterAll`. | `git apply --check docs/audits/chau-fix-final/proposed-patches/authorization.test.js.patch` |

---

## 2. Lưu ý quan trọng về diff có sẵn trên working tree `BE-2`

Khi bắt đầu vòng FIX-FINAL, lệnh `git diff -- BackEnd/tests/authorization.test.js` đã ghi nhận sẵn **+3 dòng** ở `PUBLIC_ROUTES` (`BackEnd/tests/authorization.test.js:55-57`):
- `"get /api/courses/:id/syllabus"`
- `"get /api/learning-paths"`
- `"get /api/learning-paths/:id"`

Trong vòng FIX-FINAL, Châu **không chỉnh sửa thêm trực tiếp** `BackEnd/tests/authorization.test.js` hay `BackEnd/tests/platform.test.js`. Patch [`authorization.test.js.patch`](./authorization.test.js.patch) được tạo tương thích với trạng thái working tree hiện có (nhánh `BE-2` tại thời điểm bàn giao).

---

## 3. Bằng chứng kiểm chứng trong môi trường tạm cô lập

Cả hai file đã được sao chép sang thư mục tạm ngoài repo, áp dụng đúng nội dung hai patch trên và chạy kiểm chứng độc lập bằng Jest (`--runInBand --no-cache --detectOpenHandles`, **không `--forceExit`**):
- Log bằng chứng: [`../evidence/06_proposed_patch_verification.log`](../evidence/06_proposed_patch_verification.log)
- Kết quả thực tế: **`2/2` suites PASS**, **`81/81` tests PASS**, **`0` open handles**.

> **Lưu ý khi áp dụng:** Chỉ Core/QA hoặc Owner có thẩm quyền mới chạy `git apply` sau khi PO/Tech Lead phê duyệt chiến lược mock `TEA-12` trong test E2E legacy (trước khi Bảo hoàn thành module `TeacherContract` thật).

