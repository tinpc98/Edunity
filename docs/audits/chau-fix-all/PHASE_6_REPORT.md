# PHASE 6 REPORT — CLASS MESSAGING & GOVERNED AI (`LMS-13`, `AI-01`..`AI-04`)

**Status:** `DONE`  
**Branch:** `BE-2`  
**Owner Scope:** Châu — Backend Đào tạo, LMS & Database phi tài chính

---

## 1. Mục tiêu Phase 6 & Kết quả Audit mã nguồn

Phase 6 kiểm toán và gia cố kênh trao đổi lớp học (`LMS-13`) và tầng quản trị & sử dụng AI (`AI-01..04`):

1. **`LMS-13` ([`BackEnd/src/services/messagingService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/messagingService.js)):**
   - Phát hiện `sendMessageToConversationDoc` và `ensureClassConversationDoc` gọi `conversation.save()`, khiến các tin nhắn gửi đồng thời vào cùng phòng lớp (hoặc direct chat) va chạm `__v` (Mongoose OCC `VersionError`) và ném lỗi `500 INTERNAL_SERVER_ERROR` không mong muốn; đồng thời thiếu serializing transaction nên tin nhắn học viên vẫn có thể lọt sau khi Admin/Teacher vừa `LOCK_CHANNEL`, tắt `allowStudentPosts`, hoặc `MUTE_USER`.
   - `adminReviewMessageReport` đọc report rồi gọi `hide/mute/lock` và `.save()` bên ngoài CAS, dễ phát sinh race khi 2 Admin duyệt cùng lúc (ghi trùng 2 `AuditLog`), tương tự với `adminModerateMessage`, `teacherModerateMessage`, `teacherUpdateClassConversationModeration`, `adminUpdateClassConversationModeration`, `mute`/`unmute`, `deleteMessage`, và `reportMessage`.
   - Thiếu validator nghiêm ngặt chặn coercion/hostile query trên `isLocked`, `allowStudentPosts`, `durationMinutes` (`Number(true) === 1`), `category`, `action`, và các tham số truy vấn dạng mảng/object (`?status=OPEN&status=RESOLVED`, `{ $ne: null }`).
   - Đã vá toàn bộ: chuyển sang atomic updates + ReplSet `withTransaction` (`runInTx`), `adminReviewMessageReport` dùng CAS `{ _id, status: beforeStatus }` trong transaction và cập nhật side effects tuần tự kèm 1 `AuditLog` duy nhất, chuẩn hóa sync preview khi xóa/thu hồi (`deleteMessage`) vs ẩn tin nhắn (`HIDE`), và bổ sung strict coercion/query guards (`400 VALIDATION_ERROR`).

2. **`AI-01..04` ([`BackEnd/src/services/aiGovernanceService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/aiGovernanceService.js) & [`BackEnd/src/services/aiUseCaseService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/aiUseCaseService.js)):**
   - Trong `executeGovernedAi`, `assertAiRateAndBudget` chạy **trước** kiểm tra `!registeredAiAdapter`, làm cho `AI-01 DETERMINISTIC_FALLBACK` và các request `503 AI_PROVIDER_BLOCKED` đốt sạch hạn mức `rateMaxRequests` / token budget dù chưa hề gọi model AI nào! Đã đảo thứ tự an toàn: kiểm tra `detectPromptInjection` & PII redaction trước → kiểm tra adapter fail-closed / fallback → chỉ trừ rate/budget khi thực sự gọi adapter AI đã được phê duyệt.
   - `recommendLearningResourcesForStudent` trả về sớm khi `resources.length === 0` trước khi chạy `executeGovernedAi`, làm bỏ sót `detectPromptInjection(topic)` với người dùng chưa có tài nguyên nào. Đã chạy `detectPromptInjection` ngay đầu luồng trước khi short-circuit.
   - `approveTeacherAiDraft` và `rejectTeacherAiDraft` chưa chạy trong ReplSet transaction kèm CAS nguyên tử, có nguy cơ sinh trùng `Assessment`/`Question`/`LearningResource` hoặc mất đồng bộ approve-vs-reject. Đã khóa nguyên tử qua `AiGeneratedDraft.findOneAndUpdate({ ..., status: "DRAFT_PENDING_REVIEW", ...NOT_DELETED })` trong `withTransaction`.
   - Bổ sung validator chặn boolean/array/object coercion (`limit`, `questionCount`, `durationMinutes`, `focus`, `status`, `draftType`, `featureCode`, `outcome`, `actorRole`) trả `400 VALIDATION_ERROR`, giữ nguyên cơ chế **fail-closed** (`503 AI_PROVIDER_BLOCKED` + blocker `AID_08_CONSENT_DEPENDENCY_BLOCKED`).

---

## 2. Chi tiết thay đổi thực tế (Evidence-Based)

| Task | Files Modified / Created | Key Fixes & Contracts |
|---|---|---|
| `LMS-13` | [`BackEnd/src/services/messagingService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/messagingService.js) | Atomic `Conversation.updateOne` thay `.save()` chống `VersionError`; ReplSet `withTransaction` + CAS cho send/delete/report/moderation/mute/unmute/adminReview; post-commit notifications; strict type & query guards (`isLocked`, `allowStudentPosts`, `durationMinutes`, array/object). |
| `AI-01..04` Governance | [`BackEnd/src/services/aiGovernanceService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/aiGovernanceService.js) | Reject non-string `userPrompt`; chuyển check `!registeredAiAdapter` (`503 AI_PROVIDER_BLOCKED` & `AI-01` fallback) lên trước `assertAiRateAndBudget` (không lãng phí quota); strict query guards trên `adminListAiAuditLogs`. |
| `AI-01..04` Use Cases | [`BackEnd/src/services/aiUseCaseService.js`](file:///c:/CODE/Edunity/BackEnd/src/services/aiUseCaseService.js) | Check `detectPromptInjection(topic)` trước short-circuit 0 resource; strict bounds/type/query guards; `approveTeacherAiDraft` & `rejectTeacherAiDraft` dùng atomic CAS + `withTransaction` ngăn tạo trùng target draft hoặc race approve vs reject. |
| Verification Suite | [`BackEnd/tests/phase6ReplSet.test.js`](file:///c:/CODE/Edunity/BackEnd/tests/phase6ReplSet.test.js) | Chứng minh trên MongoMemoryReplSet: zero `500 VersionError` khi gửi đồng thời, lock-vs-post race, admin report review CAS `[200, 409]` + 1 audit, restore CAS, recall-vs-hide consistency, zero quota waste trên fallback/`503`, prompt injection trên 0 resource, và approve/reject CAS. |

---

## 3. Kiểm chứng thực tế (Test Evidence)

1. **`node --check`** trên toàn bộ 4 file `.js` sửa/mới của Phase 6 (`messagingService.js`, `aiGovernanceService.js`, `aiUseCaseService.js`, `phase6ReplSet.test.js`): **4/4 PASS** (exit code 0).
2. **Phase 6 ReplSet + Stage 6 + Community + Schema/Preflight/Contract Suites** (`npx jest tests/phase6ReplSet.test.js tests/stage6MessagingAndAi.test.js tests/community.test.js tests/schemaInventory.test.js tests/migrationPreflight.test.js tests/academicContract.test.js --runInBand --no-cache`, chạy với `BypassSandbox: true` trên MongoMemoryReplSet 7.0.14):
   - **6/6 suites PASS (`70/70` tests PASS, `0 FAIL`, `0 SKIP`)** trong `26.824 s` (`task-6299`).

---

## 4. Chuyển tiếp sang Global Docs Sync (`G0-02`, `G0-10`) & Final TEST 2

- Toàn bộ các phase triển khai & sửa lỗi (`Phase 0 → Phase 6`) đã hoàn tất và qua kiểm chứng ReplSet thật.
- **Bước cuối:** Đồng bộ lần cuối [`BackEnd/docs/schema-inventory-g0-02.md`](file:///c:/CODE/Edunity/BackEnd/docs/schema-inventory-g0-02.md), [`docs/database-design-mongodb.md`](file:///c:/CODE/Edunity/docs/database-design-mongodb.md), và [`BackEnd/docs/api-contract-academic.md`](file:///c:/CODE/Edunity/BackEnd/docs/api-contract-academic.md) cho **57 models / 17 soft-delete / 54 unique specs**, sau đó chạy **Final TEST 2** toàn hệ thống (global `node --check` + toàn bộ Jest suites) và phát hành gói **7 tài liệu Acceptance** tại `docs/audits/chau-fix-all/final-acceptance/`.

