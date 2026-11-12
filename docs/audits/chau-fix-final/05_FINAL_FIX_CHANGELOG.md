# 05. FINAL FIX CHANGELOG — TASK FIX-FINAL (CHÂU)

Tài liệu này liệt kê chính xác **toàn bộ các file được sửa trong vòng `FIX-FINAL`** (chỉ trong phạm vi sở hữu của Châu), nhằm bịt kín các lỗ hổng P0/P1 về JS type-coercion, Query Object/Array Injection trên Express 5, và bổ sung regression tests ngay trong các suite `phase*ReplSet` thuộc Châu.

- **Bảo toàn baseline:** Toàn bộ [`docs/audits/chau-fix-all/*`](file:///c:/CODE/Edunity/docs/audits/chau-fix-all) không bị chỉnh sửa hoặc ghi đè.
- **Tôn trọng ranh giới sở hữu:** `0` chỉnh sửa trên file của Tin, Bảo, Băng (`FrontEnd/*`), `.env`, và `0` chỉnh sửa trực tiếp trên shared tests [`platform.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/platform.test.js) / [`authorization.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/authorization.test.js).

---

## 1. Danh sách Production Files đã gia cố trong FIX-FINAL (7 Service Files)

| # | File | Symbol & Dòng | Vấn đề P0/P1 đã phát hiện | Chi tiết khắc phục | Khả năng Rollback |
|---|---|---|---|---|---|
| 1 | [`teacherClassService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/teacherClassService.js) | `parseStrictInteger` (`L65-77`), `parseSchedule` (`L79-102`), `applyClassInput` (`L127-131`) | `Number(entry.dayOfWeek)` và `Number(body.capacity)` ép kiểu JS: `false -> 0` (lọt vào ngày Chủ nhật `0`), `true -> 1`, `"" -> 0`, `[1] -> 1`; thiếu kiểm tra `typeof startTime/endTime === "string"`. | Bổ sung `parseStrictInteger` từ chối `boolean`, `null`, `undefined`, `Array`, `Object`, chuỗi rỗng; ép `typeof startTime/endTime === "string"`. Trả `400 VALIDATION_ERROR`. | Chuẩn (`git checkout` file riêng lẻ, không đổi schema) |
| 2 | [`classCreationGateService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/classCreationGateService.js) | `assertPricingPolicyGate` (`L143-160`) | Khi `body.price` không đi qua `cls` (gọi gate trực tiếp như `validateClassGate({ body: { price: true } })`), `Number(true) === 1` hoặc `Number("") === 0` bị lọt qua cổng giá. | Chặn `null`, `boolean`, `Array`, `Object`, chuỗi rỗng trước `Number(body.price)`. | Chuẩn (chỉ guard đầu vào) |
| 3 | [`coursePricingPolicyService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/coursePricingPolicyService.js) | `toStrictFiniteNumber` (`L27-39`), `validateScopeAndMatchers` (`L98-127`), `validateBoundsAndDates` (`L146-176`), `rollbackToPolicyVersion` (`L414-418`), `listPolicies` (`L574-577`), `verifyClassPricingPolicy` (`L683-716`) | 1. `minSessions`/`maxSessions`/`targetVersion` chấp nhận `true` (`1`), `[2]`.<br>2. `allowFree: "false"` (boolean string) bị coi là truthy `true` khi `classType === "ALL"`.<br>3. `gradeLevel`/`level`/`classType`/`query.policyKey` chấp nhận object/array (`{ $ne: null }` hoặc `?policyKey=A&policyKey=B`).<br>4. `verifyClassPricingPolicy` ép kiểu `price` và `totalSessions` từ boolean/array/empty string. | Thêm `toStrictFiniteNumber`, ép `typeof === "boolean"` cho `allowFree`, `typeof === "string"` cho `gradeLevel`/`level`/`classType`/`policyKey`, chống coercion toàn bộ bounds & verify preview. | Chuẩn (giữ nguyên schema & API response format) |
| 4 | [`scholarshipDossierGateService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/scholarshipDossierGateService.js) | `parseChecklist` (`documentChecklist` `L213-287`) | Trong cấu hình checklist `AID-01`, `required: "false"` bị `Boolean("false") === true`, `maxFiles: true` thành `1`, `order: null` thành `0`/`NaN` muộn, `acceptedMode`/`acceptedDocumentTypes[]` không chặn object. | Kiểm tra chặt `typeof entry.required === "boolean"`, `typeof acceptedMode === "string"`, `typeof dt === "string"` trong `acceptedDocumentTypes`, thêm `parseChecklistInt` chặn `null`/`boolean`/`Array`/`Object`/chuỗi rỗng cho `maxFiles` và `order`. | Chuẩn |
| 5 | [`paperDossierService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/paperDossierService.js) | `parsePostalInfo` (`L56-128`), `parseReconciledItems` (`L570-594`) | `postalInfo.envelopeSealed: "false"` bị ép thành boolean, `deliveryMethod`/`packageCondition` chưa ép `typeof === "string"`, `reconciledItems[].pageCount` bị `Number(null) === 0`, `Number(false) === 0`, `Number("") === 0` lọt qua check integer `[0..500]`; `isOriginal`/`hasOfficialStamp` chưa ép strict boolean. | Siết chặt `typeof === "string"` và `typeof === "boolean"`, chặn `null`/`boolean`/`Array`/`Object`/chuỗi rỗng ở `pageCount`. | Chuẩn |
| 6 | [`sessionService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/sessionService.js) | `createSessions` (`L232-244`), `generateSessionsFromSchedule` (`L309-312`) | `sessionNumber: true` ép thành `1`, `skipPast: "false"` bị bỏ qua lặng lẽ hoặc hiểu sai ý định. | Chặn `boolean`/`Array`/`Object`/chuỗi rỗng với `sessionNumber`; ép `typeof body.skipPast === "boolean"` khi truyền `skipPast`. | Chuẩn |
| 7 | [`teachingQualityReportService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/teachingQualityReportService.js) | `assertNonObjectIdentifier` (`L19-28`) và các hàm nhận `teacherId`/`courseId`/`classId` | Truy vấn `?teacherId=id1&teacherId=id2` trên Express 5 tạo Array hoặc NoSQL object `{ $ne: null }`, đi qua `mongoose.isValidObjectId([...]) === false` nhưng trả sai mã (`404 TEACHER_NOT_FOUND` hoặc bỏ qua bộ lọc thay vì `400 VALIDATION_ERROR`). | Bổ sung `assertNonObjectIdentifier` chặn Object/Array trước khi validate ID → trả `400 VALIDATION_ERROR` khi nhận object/array query, đồng thời vẫn giữ nguyên `404` cho chuỗi không phải ObjectId (`/teachers/not-an-id`) theo contract hiện hành tại `stage5ProgressQualityCoordination.test.js:1275`. | Chuẩn |

---

## 2. Danh sách Regression Test Files thuộc Châu đã bổ sung trong FIX-FINAL (3 Suites)

| # | Test Suite | Dòng thêm | Nội dung kiểm chứng tự động mới | Kết quả |
|---|---|---|---|---|
| 1 | [`BackEnd/tests/phase1ReplSet.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/phase1ReplSet.test.js#L752-L785) | `L752-785` | Bước 7 trong `CUR-07`: từ chối `allowFree: "false"`, `minSessions: true`, `maxSessions: [5]`, `level/gradeLevel: { $ne: null }`, `rollback targetVersion: true`, `verify-preview` với `price/totalSessions` boolean/empty, và query `?policyKey=A&policyKey=B` → tất cả trả `400 VALIDATION_ERROR`. | PASS |
| 2 | [`BackEnd/tests/phase2ReplSet.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/phase2ReplSet.test.js#L496-L583) | `L496-583` | Rejection `badCap` (`true`, `false`, `[10]`, `""`, `{}`), `badDay` (`false`, `true`, `null`, `""`, `[1]`, `{}`), `validateClassGate({ body: { price: true } })`, `sessionNumber` coercion, `skipPast: "false"` → tất cả `400 VALIDATION_ERROR`. | PASS |
| 3 | [`BackEnd/tests/phase3ReplSet.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/phase3ReplSet.test.js#L653-L775) | `L653-775` | Rejection `AID-01` checklist coercion, `AID-04` `envelopeSealed: "false"`, `deliveryMethod: { $ne: "" }`, `pageCount` (`null`, `false`, `""`), `isOriginal: "false"`, `SPO-07` `?teacherId=A&teacherId=A` (`400`) vs `/teachers/not-an-id` (`404`). | PASS |

---

## 3. Đề xuất bản vá cho Shared Test Suites (Không tự ghi vào Working Tree Repo)

- [`docs/audits/chau-fix-final/proposed-patches/platform.test.js.patch`](./proposed-patches/platform.test.js.patch)
- [`docs/audits/chau-fix-final/proposed-patches/authorization.test.js.patch`](./proposed-patches/authorization.test.js.patch)
- [`docs/audits/chau-fix-final/proposed-patches/README.md`](./proposed-patches/README.md) (`OWNER_APPROVAL_REQUIRED`)

