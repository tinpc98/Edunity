# PHASE 2 REPORT — TEACHER AUTHORIZATION, PRICING/SYLLABUS SNAPSHOT, CLASS GATE & SCHEDULE COLLISIONS (`TEA-07`, `CUR-09`, `CUR-10`, `CUR-11`)

**Status:** `DONE`  
**Branch:** `BE-2`  
**Owner Scope:** Châu — Backend Đào tạo, LMS & Database phi tài chính

---

## 1. Mục tiêu Phase 2 & Phạm vi sửa lỗi

1. **TEA-07 (`TeacherSubjectAuthorization`):** Kiểm tra toàn bộ CRUD, duyệt/đình chỉ quyền giảng dạy, vá lỗi filter `level` khi truyền string rỗng/tùy chọn trong `listMyAuthorizations` và `adminListAuthorizations`.
2. **CUR-09 (Class & Enrollment Syllabus/Pricing Policy Snapshot):**
   - Lưu đầy đủ snapshot bất biến (`syllabusVersionId`, `syllabusVersionNumber`, `pricingPolicyId`, `pricingPolicyKey`, `pricingPolicyVersion`, `pricingPolicySnapshot`) trên [`Class`](file:///c:/CODE/Edunity/BackEnd/src/models/Class.js) khi tạo/cập nhật/gửi duyệt/Admin duyệt lớp.
   - Bổ sung trước các trường snapshot nullable tương ứng trên [`Enrollment`](file:///c:/CODE/Edunity/BackEnd/src/models/Enrollment.js), helper [`buildEnrollmentSnapshotFromClass`](file:///c:/CODE/Edunity/BackEnd/src/services/coursePricingPolicyService.js), và tài liệu bàn giao Mục 8 trong [`BackEnd/docs/coordination-and-handover.md`](file:///c:/CODE/Edunity/BackEnd/docs/coordination-and-handover.md) để **Tin** tích hợp vào `enrollmentService.js` (Châu không sửa trực tiếp file ngoài phạm vi).
3. **CUR-10 (Class Creation / Submit / Approve Governance Gate):**
   - Nối verifier thật của **CUR-07** ([`verifyClassPricingPolicy`](file:///c:/CODE/Edunity/BackEnd/src/services/coursePricingPolicyService.js)) làm default `pricingPolicyVerifier` trong [`classCreationGateService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/classCreationGateService.js) (`cur07PricingPolicyReady: true`).
   - Giữ nguyên **fail-closed** cho **TEA-12** (`contractVerifier: null`, `tea12ContractReady: false` → trả `503 CONTRACT_DEPENDENCY_BLOCKED`, tuyệt đối không coi `verificationStatus === "VERIFIED"` là hợp đồng hiệu lực).
   - **Vá lỗ hổng bypass nghiêm trọng tại `adminClassService.approveClass`:** Trước Phase 2, `approveClass` chỉ kiểm tra `PENDING_APPROVAL` và chuyển thẳng sang `OPEN`, bỏ qua kiểm tra lại Course/Teacher/Completeness/CUR-07/TEA-07/TEA-12 và không ghi snapshot CUR-09. Nay đã đóng hoàn toàn bypass trên `approveClass` (trong khi giữ `rejectClass` luôn khả dụng).
4. **CUR-11 (Schedule Serialization, Timezone, Reschedule & Concurrent Safety):**
   - Tách `TeacherScheduleLock` helpers sang [`BackEnd/src/utils/teacherScheduleLock.js`](file:///c:/CODE/Edunity/BackEnd/src/utils/teacherScheduleLock.js) nhằm triệt tiêu circular dependency bắc cầu `sessionService -> sessionPresenceService -> sessionIncidentService -> sessionService`.
   - Sửa `assertNoScheduleConflict` trong [`sessionIncidentService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/sessionIncidentService.js) chạy tuần tự (`await` từng query, không dùng `Promise.all` trong MongoDB transaction) và nhận `dbSession`.
   - Kiểm tra quá khứ (`400 SESSION_IN_PAST`) và lớp đã đóng (`409 CLASS_CLOSED`) trong `requestSessionReschedule`; bọc `reviewRescheduleRequest` trong `runInTeacherScheduleTx` + CAS nguyên tử (`status: "PENDING_ADMIN_APPROVAL"`), tạo makeup session với `scheduleSource: "MAKEUP"`, bọc `deleteSession` trong `runInTeacherScheduleTx`.
   - Sửa test bất đồng bộ `CONC-CUR11-01` trong [`cur11ScheduleCollisionReplSet.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/cur11ScheduleCollisionReplSet.test.js) (`Promise.resolve(...)` kích hoạt lazy Supertest request) và cập nhật `CONC-CUR11-05` theo CUR-07 + TEA-12 fail-closed.

---

## 2. Chi tiết thay đổi thực tế (Evidence-Based)

| Task | Files Modified / Created | Key Fixes & Contracts |
|---|---|---|
| `CUR-09` | [`BackEnd/src/models/Class.js`](file:///c:/CODE/Edunity/BackEnd/src/models/Class.js), [`BackEnd/src/models/Enrollment.js`](file:///c:/CODE/Edunity/BackEnd/src/models/Enrollment.js), [`BackEnd/docs/coordination-and-handover.md`](file:///c:/CODE/Edunity/BackEnd/docs/coordination-and-handover.md) | Thêm embedded `pricingPolicySnapshotSchema` & trường versioned snapshot cho `Class`; thêm snapshot nullable cho `Enrollment`; ghi contract bàn giao cho Tin tại Mục 8. |
| `CUR-07` + `CUR-09` + `CUR-10` | [`BackEnd/src/services/coursePricingPolicyService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/coursePricingPolicyService.js), [`BackEnd/src/services/classCreationGateService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/classCreationGateService.js), [`BackEnd/src/services/teacherClassService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/teacherClassService.js), [`BackEnd/src/services/adminClassService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/adminClassService.js) | Wiring `verifyClassPricingPolicy` vào `classCreationGateService`, thêm `captureClassSnapshots` (chỉ query `SyllabusVersion` khi có `publishedSyllabusVersionId`), lưu snapshot tại `createClass`/`updateClass`/`submitClass`/`approveClass`, đóng bypass `approveClass`, giữ `TEA-12` fail-closed `503`. |
| `TEA-07` | [`BackEnd/src/services/teacherSubjectAuthorizationService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/teacherSubjectAuthorizationService.js) | Guard `query.level` an toàn trong `listMyAuthorizations` & `adminListAuthorizations`. |
| `CUR-11` | [`BackEnd/src/utils/teacherScheduleLock.js`](file:///c:/CODE/Edunity/BackEnd/src/utils/teacherScheduleLock.js), [`BackEnd/src/services/sessionService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/sessionService.js), [`BackEnd/src/services/sessionIncidentService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/sessionIncidentService.js) | Triệt tiêu circular require qua `utils/teacherScheduleLock.js`; `assertNoScheduleConflict` tuần tự & hỗ trợ `dbSession`; CAS + tx lock trên `reviewRescheduleRequest` (`scheduleSource: "MAKEUP"`) và `deleteSession`; chặn lịch quá khứ & lớp đã đóng. |
| Verification Tests | [`BackEnd/tests/cur10ClassCreationGate.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/cur10ClassCreationGate.test.js), [`BackEnd/tests/cur11ScheduleCollisionReplSet.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/cur11ScheduleCollisionReplSet.test.js), [`BackEnd/tests/phase2ReplSet.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/phase2ReplSet.test.js) | Cập nhật mong đợi `cur07PricingPolicyReady: true, tea12ContractReady: false`; sửa Supertest lazy activation ở `CONC-CUR11-01`; thêm suite ReplSet toàn diện kiểm chứng `TEA-07`, snapshot immutability `CUR-09`, bypass closure `approveClass`, double-approve CAS & cross-class serialization `CUR-11`. |

---

## 3. Kiểm chứng thực tế (Test Evidence)

1. **`node --check`** trên toàn bộ 13 file `.js` Phase 2 (10 file source + 3 file test): **13/13 PASS** (exit code 0).
2. **Phase 2 Full Verification + Regression Suites** (`npx jest tests/phase2ReplSet.test.js tests/cur11ScheduleCollisionReplSet.test.js tests/tea07SubjectAuthorization.test.js tests/cur10ClassCreationGate.test.js tests/cur11ScheduleAndTimezone.test.js tests/smartClassroomAndIncidents.test.js tests/teacherVerificationAccess.test.js tests/phase1ReplSet.test.js tests/schemaInventory.test.js tests/migrationPreflight.test.js tests/academicContract.test.js --runInBand --no-cache`, chạy với `BypassSandbox: true` trên MongoMemoryReplSet 7.0.14):
   - **11/11 suites PASS (`111/111` tests PASS, `0 FAIL`, `0 SKIP`)** trong `44.451 s`.
   - Hai phát hiện thực tế trong quá trình chạy (`phase2ReplSet.test.js`):
     1. Truy vấn makeup session sau reschedule cần lọc `"rescheduleMetadata.isMakeupSession": true` vì cả session gốc (`RESCHEDULED`, `isMakeupSession: false`) và session bù (`SCHEDULED`, `scheduleSource: "MAKEUP"`, `isMakeupSession: true`) đều lưu `rescheduleRequestId`.
     2. Giá trị `TeacherScheduleLock.lockSeq === 2` sau 2 giao dịch thành công + 2 giao dịch xung đột thất bại chứng minh `$inc: { lockSeq: 1 }` đã thực sự rollback sạch sẽ khi giao dịch xung đột abort (`409`).
   - `CONC-CUR11-01` & `CONC-CUR11-05` trong `cur11ScheduleCollisionReplSet.test.js` đã PASS 100% trên ReplSet thật.

---

## 4. Trạng thái Dependency chuyển sang Phase 3

- **DEP-BAO-01 (`TEA-12` TeacherContract):** Vẫn đang giữ **BLOCKED (`503 CONTRACT_DEPENDENCY_BLOCKED`)** trong `classCreationGateService.js` và sẽ tiếp tục giữ nguyên cơ chế fail-closed cho **`TEA-16`** trong Phase 3.
- **DEP-TIN-01 (`CUR-09` Enrollment Snapshot):** Đã hoàn tất phần schema + helper + tài liệu handover phía Châu; Tin sẽ đọc từ `Class` via [`buildEnrollmentSnapshotFromClass`](file:///c:/CODE/Edunity/BackEnd/src/services/coursePricingPolicyService.js) khi cập nhật `enrollmentService.js`.

