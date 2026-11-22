# BE-USER-FIX-02: TEST EVIDENCE REPORT

## 1. Kết quả kiểm thử bộ chức năng mới (Durable Revocation)

### Lệnh thực thi:
```bash
npm --prefix BackEnd test -- tests/beUserDurableRevocation.test.js
```

### Kết quả tổng hợp:
- **Test Suites:** 1 passed, 1 total
- **Tests:** 18 passed, 18 total
- **Snapshots:** 0 total
- **Thời gian:** 10.498 s

---

## 2. Chi tiết 18 kịch bản kiểm thử BE-USER-FIX-02

### Nhóm 1: Token Revocation & Worker (TC 1 - 8)
1. **TC01: Khóa User $\rightarrow$ tạo task durable và revoke thành công**
   - User `BANNED`. `TokenRevocationTask` được tạo trong DB với `status: "COMPLETED"`, `revokedCount = 1`.
   - Toàn bộ refresh tokens trước thời điểm khóa bị thu hồi (`revokedAt !== null`).
2. **TC02: Tạm ngưng User $\rightarrow$ tạo task durable và revoke thành công**
   - User `SUSPENDED`. `TokenRevocationTask` được tạo và xử lý thành công, tokens được thu hồi.
3. **TC03: Revoke thất bại tạm thời $\rightarrow$ retry thành công qua worker sweep**
   - Giả lập lỗi tại `RefreshToken.updateMany` trong lần đầu $\rightarrow$ task chuyển sang `PENDING` với `attempts = 1` và `nextRunAt` được backoff.
   - Khi worker sweep chạy tick tiếp theo $\rightarrow$ hoàn tất thành công `COMPLETED`, token được thu hồi.
4. **TC04: Revoke thất bại liên tục $\rightarrow$ chuyển trạng thái FAILED và giữ nguyên log lỗi**
   - Giả lập lỗi DB kéo dài qua `maxAttempts` (3 lần) $\rightarrow$ task chuyển sang `status: "FAILED"` với `lastError` được ghi nhận. Task không bị xóa khỏi DB.
5. **TC05: Server restart $\rightarrow$ worker mới quét và xử lý thành công task còn tồn tại trong DB**
   - Giả lập server crash ngay sau commit (task tồn tại ở trạng thái `PENDING` trong MongoDB).
   - Worker mới khởi động quét DB và xử lý thành công `COMPLETED`.
6. **TC06: Hai worker xử lý đồng thời không xung đột và không xử lý trùng**
   - 2 worker độc lập cùng tranh chấp claim pending tasks.
   - Cơ chế atomic `findOneAndUpdate` với lease locking đảm bảo mỗi worker nhận đúng 1 task riêng biệt, không có tình trạng trùng lặp.
7. **TC07: Request khóa lặp lại: flush task cũ, không tạo duplicate task hoặc duplicate audit**
   - Admin gửi lại request khóa tài khoản đã bị khóa $\rightarrow$ nhánh idempotent phục hồi thu hồi các token sót mà không tạo `TokenRevocationTask` mới hay `AuditLog` trùng.
8. **TC08: Revoke idempotent: gọi processTask nhiều lần trên cùng 1 task cho kết quả nhất quán**
   - Gọi `processTask` lặp lại trên task đã `COMPLETED` $\rightarrow$ trả về `alreadyCompleted: true`, không phát sinh lỗi.

### Nhóm 2: Transaction Integrity (TC 9 - 12)
9. **TC09: User update thất bại $\rightarrow$ không tạo TokenRevocationTask**
   - Lỗi validation khi gọi API $\rightarrow$ không có document task nào được tạo trong DB.
10. **TC10: AuditLog thất bại $\rightarrow$ rollback toàn bộ User status và TokenRevocationTask**
    - Giả lập lỗi ghi AuditLog bên trong transaction $\rightarrow$ rollback toàn bộ, User status giữ nguyên `ACTIVE`, không có task trong DB.
11. **TC11: Transaction commit thành công $\rightarrow$ TokenRevocationTask chắc chắn tồn tại**
    - Gọi API khóa thành công $\rightarrow$ task chắc chắn được commit trong DB với `userId`, `targetStatus`, `revokeBefore`.
12. **TC12: Không có partial write: User document, AuditLog, và TokenRevocationTask luôn nhất quán**
    - Tính nguyên tử tuyệt đối của MongoDB multi-document transaction được bảo đảm.

### Nhóm 3: Authentication & Session Isolation (TC 13 - 18)
13. **TC13: Access token của BANNED bị authMiddleware từ chối 403 ACCOUNT_BLOCKED**
    - Middleware đọc trạng thái User từ DB và từ chối ngay lập tức.
14. **TC14: Refresh token của BANNED bị từ chối 403 ACCOUNT_BLOCKED**
    - Endpoint `/api/auth/refresh` kiểm tra trạng thái User và chặn cấp token mới.
15. **TC15: Access token của SUSPENDED bị authMiddleware từ chối 403 ACCOUNT_BLOCKED**
    - Tài khoản tạm ngưng bị chặn truy cập API.
16. **TC16: Refresh token của SUSPENDED bị từ chối 403 ACCOUNT_BLOCKED**
    - Tài khoản tạm ngưng bị chặn tạo access token mới.
17. **TC17: User ACTIVE đăng nhập và sử dụng token bình thường**
    - Luồng xác thực của tài khoản đang hoạt động được bảo toàn 100%.
18. **TC18: Kích hoạt lại tài khoản sau khi khóa: worker cũ KHÔNG thu hồi nhầm token của phiên mới**
    - Tài khoản bị khóa tại $T_1$ (task có `revokeBefore = T_1`).
    - Tài khoản được mở khóa tại $T_2$ và đăng nhập nhận RefreshToken mới tại $T_3$ ($T_3 > T_1$).
    - Worker chạy lại task cũ từ $T_1$ $\rightarrow$ RefreshToken mới tại $T_3$ KHÔNG BỊ THU HỒI, phiên mới vẫn sử dụng hoàn toàn bình thường.
