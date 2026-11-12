# PHASE 3 REPORT — SCHOLARSHIP DOSSIER, PAPER RECEIPT, QUALITY SPO-07 & INCIDENT CONTRACT COORDINATION (`AID-01`, `AID-04`, `SPO-07`, `TEA-16`)

**Status:** `DONE`  
**Branch:** `BE-2`  
**Owner Scope:** Châu — Backend Đào tạo, LMS & Database phi tài chính

---

## 1. Mục tiêu Phase 3 & Kết quả Audit mã nguồn

Phase 3 rà soát 4 hạng mục trọng tâm nối với hồ sơ phi tài chính học bổng và phối hợp sự cố/hợp đồng giảng dạy:

1. **`AID-01` (`ScholarshipApplication` & `scholarshipService.js`):**
   - Phát hiện partial unique index `{ studentId: 1, campaignId: 1 }` thiếu trạng thái `"APPROVED"`, cho phép tiềm ẩn xung đột trạng thái sau khi đã phê duyệt hồ sơ.
   - Phát hiện lỗ hổng/rủi ro race condition tại `updateDossier`, `resubmitApplication`, `withdrawDossier`, `adminReviewApplicationDocument`, `reviewApplication` (read-then-save không dùng CAS/transaction) và cần kiểm soát chặt `approveApplication` để không thể dùng API duyệt cũ bỏ qua checklist `AID-01` hoặc `AID-08` minor consent trên chiến dịch V3.
2. **`AID-04` (`PaperDossierReceipt` & `paperDossierService.js`):**
   - Trong `linkPaperDossierToApplication` và `reconcilePaperDossier`, trạng thái hồ sơ trực tuyến (`WITHDRAWN` / `REJECTED`) cần được re-check ngay trong MongoDB transaction trước khi liên kết biên nhận bản giấy.
   - Đồng thời khi chỉnh sửa `closePaperDossierReceipt` đã kiểm tra và xử lý trường hợp hủy/từ chối biên nhận chưa gắn đơn (`applicationId: null`, tránh tham chiếu nhầm `application._id`) đồng thời đồng bộ lại checklist nếu đã gắn đơn.
3. **`SPO-07` (`teachingQualityReportService.js`):**
   - Truy vấn `Class.find` chưa kèm `...NOT_DELETED`; đếm buổi sắp diễn ra (`upcomingOrActiveCount`) còn đếm nhầm session `lifecycleState: "RESCHEDULED"`.
   - `query.reportType` chưa guard kiểu chuỗi & enum hợp lệ; sự cố nhắm cụ thể vào học sinh (`reportedUserId !== teacherId`) có nguy cơ bị gán nhầm vào chỉ số chất lượng của giáo viên lớp.
4. **`TEA-16` (`TeacherContractReviewPacket` & `incidentContractCoordinationService.js`):**
   - Thiếu partial unique index ngăn tạo trùng packet đang mở cho cùng một `teacherId` (`DRAFT`, `READY_FOR_CONTRACT_TEAM`, `ACKNOWLEDGED_PENDING_TEA12`, `ON_HOLD`).
   - Thiếu `assertOptionalString` / string guards trên queue filter và body notes (nguy cơ object/array coercion khi gọi trực tiếp service hoặc HTTP array params).
   - `adminUpdateContractReviewPacketStatus` thiếu CAS nguyên tử trên `{ _id, status: prevStatus }` trong transaction; bước `EXECUTION_BLOCKED` ghi packet history và `AuditLog` chưa nằm chung trong MongoDB transaction trước khi ném `503 CONTRACT_DEPENDENCY_BLOCKED` / `409 CONTRACT_MUTATION_OUT_OF_AUTHORITY`.

---

## 2. Chi tiết thay đổi thực tế (Evidence-Based)

| Task | Files Modified / Created | Key Fixes & Contracts |
|---|---|---|
| `AID-01` Index & Preflight Sync | [`BackEnd/src/models/ScholarshipApplication.js`](file:///c:/CODE/Edunity/BackEnd/src/models/ScholarshipApplication.js), [`BackEnd/scripts/migrationPreflight.js`](file:///c:/CODE/Edunity/BackEnd/scripts/migrationPreflight.js), [`BackEnd/tests/migrationPreflight.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/migrationPreflight.test.js) | Bổ sung `"APPROVED"` vào partial unique index `{ studentId: 1, campaignId: 1 }`; đồng bộ spec vào `migrationPreflight.js` (`53` unique specs). |
| `AID-01` Service Transactions & Gates | [`BackEnd/src/services/scholarshipService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/scholarshipService.js) | Trim `statement` khi nộp; chuyển `updateDossier` & `resubmitApplication` sang atomic CAS `findOneAndUpdate` trong `session.withTransaction`; bọc `withdrawDossier`, `adminReviewApplicationDocument`, `reviewApplication` trong `session.withTransaction` + string/status guards; siết `approveApplication` hỗ trợ `["SUBMITTED", "DOSSIER_VERIFIED"]`, chặn bypass `AID-01`/`AID-08` với V3 campaign và dùng atomic CAS. |
| `AID-04` Paper Dossier | [`BackEnd/src/services/paperDossierService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/paperDossierService.js) | Re-check trạng thái `freshApp` trong transaction tại `linkPaperDossierToApplication` và `reconcilePaperDossier`; sửa `closePaperDossierReceipt` dùng `updated.applicationId` / `updated.studentId || receipt.studentId` để hỗ trợ đóng/hủy an toàn biên nhận chưa link đơn và vẫn đồng bộ checklist khi đã link. |
| `SPO-07` Teaching Quality | [`BackEnd/src/services/teachingQualityReportService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/teachingQualityReportService.js) | Thêm `...NOT_DELETED` khi đọc `Class`; loại trừ `lifecycleState === "RESCHEDULED"` khỏi `upcomingOrActiveCount`; chặn `query.reportType` không phải string / ngoài `ALLOWED_REPORT_TYPES` (`400 VALIDATION_ERROR`); ngăn gán nhầm khiếu nại nhắm vào học sinh khác cho giáo viên. |
| `TEA-16` Contract Coordination | [`BackEnd/src/models/TeacherContractReviewPacket.js`](file:///c:/CODE/Edunity/BackEnd/src/models/TeacherContractReviewPacket.js), [`BackEnd/src/services/incidentContractCoordinationService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/incidentContractCoordinationService.js) | Thêm partial unique index `{ teacherId: 1 }` trên active statuses (cho phép mở packet mới khi packet cũ `CLOSED`); thêm `assertOptionalString` & string guards; kiểm tra active packet trong tx + map `E11000` → `409 ACTIVE_CONTRACT_REVIEW_PACKET_EXISTS`; atomic CAS chuyển trạng thái trong `session.withTransaction`; ghi `EXECUTION_BLOCKED` + `AuditLog` trong `session.withTransaction` trước khi ném `503 CONTRACT_DEPENDENCY_BLOCKED`. |
| Verification Suite | [`BackEnd/tests/phase3ReplSet.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/phase3ReplSet.test.js) | Chứng minh thực tế trên MongoMemoryReplSet: partial unique `APPROVED`, chặn bypass V3 `/approve`, CAS `resubmit` vs `reject`, `AID-04` concurrent/unlinked cancel, `SPO-07` deleted/rescheduled/attribution/input guards, `TEA-16` double-create `409`, re-create sau `CLOSED`, CAS transition & transactional audit trước `503`. |

---

## 3. Kiểm chứng thực tế (Test Evidence)

1. **`node --check`** trên toàn bộ 9 file `.js` sửa/mới của Phase 3 (`ScholarshipApplication.js`, `TeacherContractReviewPacket.js`, `migrationPreflight.js`, `migrationPreflight.test.js`, `scholarshipService.js`, `paperDossierService.js`, `teachingQualityReportService.js`, `incidentContractCoordinationService.js`, `phase3ReplSet.test.js`): **9/9 PASS** (exit code 0).
2. **Phase 3 Verification + Regression Suites** (`npx jest tests/phase3ReplSet.test.js tests/aid01ScholarshipDossierUnit.test.js tests/aid04PaperDossierUnit.test.js tests/aidDossierReplSet.test.js tests/stage5ProgressQualityCoordination.test.js tests/schemaInventory.test.js tests/migrationPreflight.test.js tests/academicContract.test.js --runInBand --no-cache`, chạy với `BypassSandbox: true` trên MongoMemoryReplSet 7.0.14):
   - **8/8 suites PASS (`70/70` tests PASS, `0 FAIL`, `0 SKIP`)** trong `23.604 s`.
   - Đáng chú ý trong quá trình kiểm chứng `phase3ReplSet.test.js`: xác nhận hành vi query parser `"simple"` của Express 5 (query key `?status[$ne]=CLOSED` giữ nguyên literal string key thay vì object nested, trong khi repeated params `?status=DRAFT&status=CLOSED` tạo mảng và direct service calls có thể nhận object — cả 2 đường đều bị chặn `400 VALIDATION_ERROR`).
3. **Legacy Scholarship Regression (`platform.test.js`):** `npx jest tests/platform.test.js -t "only admin creates campaigns|application review allocates" --runInBand --no-cache` — **PASS (`2/2` matched tests PASS, `11` skipped)**. Không gây regression lên luồng duyệt/cấp quỹ chiến dịch học bổng legacy.

---

## 4. Trạng thái Dependency chuyển sang Phase 4

- **DEP-BAO-01 (`TEA-12` TeacherContract):** Tiếp tục giữ nguyên **fail-closed (`503 CONTRACT_DEPENDENCY_BLOCKED`)** tại `incidentContractCoordinationService.js` cho `TEA-16`.
- **DEP-BAO-02 (`AID-08` Guardian Consent):** Giữ nguyên gate chặn thiếu đồng thuận người giám hộ trên `AID-01` (sẽ tiếp tục kiểm tra chi tiết cho AI-01..04 ở Phase 6).
- **Sẵn sàng bước vào Phase 4:** `LMS-01`, `LMS-03`, `LMS-05`, `LMS-07`, `LMS-08`.

