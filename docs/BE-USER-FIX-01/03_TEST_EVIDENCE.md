# BE-USER-FIX-01: TEST EVIDENCE REPORT

## 1. Kết quả kiểm thử tổng hợp

| Suite | File Test | Số Test | Trạng Thái | Thời Gian |
| :--- | :--- | :---: | :---: | :---: |
| **BE-USER-FIX-01** | `tests/beUserFix01.test.js` | 10 | **PASS (10/10)** | 5.8s |
| **BE-USER-ALL** | `tests/beUserAdminStatus.test.js` | 33 | **PASS (33/33)** | 7.7s |
| **BE-01 Regression** | `tests/be01ClassNeedChanges.test.js` | 14 | **PASS (14/14)** | 7.5s |
| **BE-02 Regression** | `tests/be02MaintenanceExpiredClass.test.js` | 13 | **PASS (13/13)** | 7.3s |
| **BE-03 Regression** | `tests/be03AcademicSoftDelete.test.js` | 26 | **PASS (26/26)** | 7.5s |
| **ReplicaSet Regression** | `tests/chauSafeDeleteConcurrencyReplSet.test.js` | 5 | **PASS (5/5)** | 6.1s |
| **Lifecycle Regression** | `tests/classLifecycleRegression.test.js` | 4 | **PASS (4/4)** | 5.1s |
| **Community Regression** | `tests/community.test.js` | 22 | **PASS (22/22)** | 10.2s |
| **TỔNG CỘNG** | **8 Test Suites** | **127** | **PASS (127/127)** | **~24s** |

---

## 2. Bằng chứng kiểm thử chi tiết 10 kịch bản BE-USER-FIX-01

### Test Suite: `tests/beUserFix01.test.js`
```
PASS tests/beUserFix01.test.js (5.62 s)
  TASK BE-USER-FIX-01: Legacy Status Reason & Post-Commit Reliability
    FIX-01: Legacy Audit Matching
      √ 1. Legacy user với 1 chu kỳ khóa duy nhất: lấy lý do và admin từ AuditLog (211 ms)
      √ 2. Legacy user với nhiều chu kỳ (ACTIVE -> BANNED -> ACTIVE -> BANNED): lấy lý do từ chu kỳ hiện tại, không lấy lý do cũ (167 ms)
      √ 3. Legacy audit không khớp trạng thái hiện tại (BANNED -> ACTIVE trong audit nhưng DB là BANNED): trả null (216 ms)
    FIX-02: Post-Commit Side Effects & Reliability
      √ 4. Post-commit revoke token failure: Status đã commit, API trả 200, access token bị chặn với 403 ACCOUNT_BLOCKED (263 ms)
      √ 5. Retry revoke token: safeRevokeAllForUser thử lại thành công sau lần đầu lỗi (115 ms)
      √ 6. Post-commit notification failure: Kích hoạt lại tài khoản thành công, không rollback trạng thái (127 ms)
      √ 7. Repeated request sau post-commit failure (Idempotent Recovery): thu hồi token còn sót, không tạo duplicate audit (138 ms)
      √ 8. Transaction rollback khi lỗi trong transaction: Rollback User status, không tạo AuditLog (95 ms)
      √ 9. Concurrent status update: Conditional update ngăn chặn dirty write conflict (124 ms)
      √ 10. Authentication and Authorization regression (98 ms)

Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
Snapshots:   0 total
Time:        5.816 s
```

---

## 3. Phân tích kết quả theo kịch bản

### Kịch bản 1 — Legacy User 1 chu kỳ khóa:
- **Đầu vào:** User legacy `status: "BANNED"`, `statusReason: null`. Bản ghi `AuditLog` duy nhất `USER_BANNED` với lý do *"Legacy single cycle ban reason"*.
- **Kết quả:** `GET /api/admin/users/:id` trả về `statusReason = "Legacy single cycle ban reason"`, admin thực hiện được populate chuẩn xác.

### Kịch bản 2 — Legacy User nhiều chu kỳ khóa/mở:
- **Đầu vào:** User legacy có chu kỳ 1 (`USER_BANNED` - *"Lý do khóa đợt 1"*), mở khóa (`USER_ACTIVE`), chu kỳ 2 (`USER_BANNED` - *"Lý do khóa đợt 2 - Mới nhất"*).
- **Kết quả:** `GET /api/admin/users/:id` trả về đúng *"Lý do khóa đợt 2 - Mới nhất"*, không bị ảnh hưởng bởi chu kỳ 1.

### Kịch bản 3 — Legacy Audit không khớp trạng thái hiện tại:
- **Đầu vào:** User trong DB là `BANNED`, nhưng bản ghi audit gần nhất là `USER_ACTIVE` (hoặc user là `SUSPENDED` nhưng audit gần nhất là `USER_BANNED`).
- **Kết quả:** API trả về `statusReason: null`. Không bao giờ trích xuất lý do xuyên ranh giới mở khóa.

### Kịch bản 4 — Thu hồi Token thất bại sau commit:
- **Đầu vào:** Sinh viên có JWT token hợp lệ. Admin gọi khóa tài khoản `BANNED`, giả lập `revokeAllForUser` lỗi.
- **Kết quả:**
  - API trả về HTTP 200 OK (không sập 500).
  - Trạng thái DB của User là `BANNED`, `AuditLog` đã commit.
  - Request sử dụng access token của sinh viên lập tức bị chặn tại `authMiddleware` với `403 ACCOUNT_BLOCKED`.

### Kịch bản 5 — Thử lại thu hồi Token (safeRevokeAllForUser):
- **Đầu vào:** Sinh viên có refresh token chưa thu hồi. Lần gọi đầu tiên lỗi mạng tạm thời, lần thứ hai thành công.
- **Kết quả:** `safeRevokeAllForUser` hoàn thành với `attempts: 2`, refresh token trong database chuyển sang `revokedAt !== null`.

### Kịch bản 6 — Gửi thông báo thất bại sau commit:
- **Đầu vào:** Mở khóa tài khoản `SUSPENDED` -> `ACTIVE`. Giả lập `Notification.create` ném lỗi.
- **Kết quả:** API trả về HTTP 200 OK. Tài khoản trong DB vẫn là `ACTIVE`, không bị rollback. `AuditLog` được ghi nhận đầy đủ.

### Kịch bản 7 — Phục hồi Idempotent khi gửi lại request:
- **Đầu vào:** User đã là `BANNED`, nhưng còn 1 `RefreshToken` sót lại từ lần lỗi trước. Admin gửi lại request khóa tài khoản.
- **Kết quả:**
  - Nhánh idempotent kích hoạt `safeRevokeAllForUser`, thu hồi thành công refresh token còn sót (`revokedAt !== null`).
  - Số lượng bản ghi `AuditLog` cho user không tăng (0 duplicate audit).

### Kịch bản 8 — Transaction Rollback:
- **Đầu vào:** Lỗi cơ sở dữ liệu xảy ra bên trong khối `session.withTransaction`.
- **Kết quả:** Transaction abort hoàn toàn. Trạng thái `User` giữ nguyên `ACTIVE`, số lượng `AuditLog` là 0.

### Kịch bản 9 — Xung đột Concurrent Update:
- **Đầu vào:** Hai Admin cùng gửi request thay đổi trạng thái đồng thời trên cùng một User document.
- **Kết quả:** Cơ chế conditional update `{ _id, status: currentUser.status }` phát hiện xung đột và xử lý an toàn (trả về 409 conflict hoặc xử lý tuần tự an toàn, không có dirty overwrite).

### Kịch bản 10 — Hồi quy Authentication & Authorization:
- **Đầu vào:** Test bảo vệ endpoint Admin với token không hợp lệ, vai trò STUDENT, và truy cập profile của user ACTIVE.
- **Kết quả:**
  - Invalid token: `401 UNAUTHORIZED`.
  - STUDENT: `403 FORBIDDEN`.
  - Active user `/api/me/profile`: `200 OK`.
