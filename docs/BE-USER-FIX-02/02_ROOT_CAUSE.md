# BE-USER-FIX-02: ROOT CAUSE ANALYSIS

## 1. Vấn đề cốt lõi (Core Problem)

Sau khi hoàn thành `BE-USER-FIX-01`, cơ chế bảo vệ trạng thái người dùng đã đáp ứng tính nhất quán cục bộ:
- Transaction MongoDB cập nhật `User` và `AuditLog` thành công.
- Sau khi commit, hàm `safeRevokeAllForUser` cố gắng thu hồi token trong RAM với tối đa 3 lần thử lại (`in-memory retry`).
- Nếu việc thu hồi thất bại, API không throw HTTP 500 unhandled để tránh gây hiểu lầm cho client.
- Khi có một request cập nhật trạng thái tiếp theo cho cùng user đó, nhánh `idempotent recovery` sẽ gọi lại hàm thu hồi token.

Tuy nhiên, phân tích sâu về độ bền vững (`durability`) và tính sẵn sàng của hệ thống phát hiện **khoảng trống kỹ thuật (resilience gap)**:

### Kịch bản rủi ro:
1. **Server Crash / Process Killed ngay sau commit:**
   - Transaction cập nhật `User` thành `BANNED` đã commit vào MongoDB.
   - Nhưng server bị crash, mất điện, bị Kubernetes OOM-kill, hoặc container restart ngay tại ranh giới sau commit trước khi `safeRevokeAllForUser` chạy xong.
2. **Lỗi cơ sở dữ liệu tạm thời kéo dài trên collection `RefreshToken`:**
   - Cả 3 lần thử lại in-memory (kéo dài trong vòng ~100ms) đều gặp timeout hoặc network partition.
   - Request API kết thúc bình thường (trả 200 OK với trạng thái BANNED).
3. **Thiếu cơ chế tự động quét lại (No Background Re-sweep):**
   - Nếu sau đó Admin không bao giờ thực hiện thao tác nào trên user này nữa (không có request tiếp theo), thì không có bất kỳ worker nào biết rằng tài khoản này vẫn còn các `RefreshToken` chưa được đánh dấu `revokedAt`.
   - Kết quả: Các refresh token chưa thu hồi sẽ tồn tại âm thầm trong DB cho đến khi hết hạn TTL.

---

## 2. Rủi ro thu hồi nhầm phiên mới sau khi kích hoạt lại (Stale Revocation Race)

Một yêu cầu nghiệp vụ và bảo mật rất tinh tế:
- Giả sử tại thời điểm $T_1$, tài khoản bị khóa (`BANNED`). Một tác vụ thu hồi token được tạo hoặc lên lịch thử lại.
- Tác vụ thu hồi gặp lỗi và bị trì hoãn trong hàng đợi retry.
- Đến thời điểm $T_2$, người dùng kháng nghị thành công, Admin kích hoạt lại tài khoản (`ACTIVE`).
- Tại thời điểm $T_3$, người dùng đăng nhập lại hợp lệ và được cấp một `RefreshToken` mới $R_{\text{new}}$ ($T_3 > T_2 > T_1$).
- Đến thời điểm $T_4$, worker nền thức dậy và thực thi lại tác vụ thu hồi token còn sót từ thời điểm $T_1$.
- **Nếu tác vụ chỉ đơn thuần gọi `revokeAllForUser(userId)`:**
  Worker sẽ thu hồi toàn bộ token của user, bao gồm cả $R_{\text{new}}$ vừa được cấp hợp lệ tại $T_3$!
  $\rightarrow$ Người dùng vừa được mở khóa và đăng nhập sẽ bị logout đột ngột mà không rõ lý do.

---

## 3. Kết luận phân tích

Hệ thống bắt buộc phải có:
1. **Outbox Pattern bền vững:** Tác vụ thu hồi token phải được lưu trữ vào MongoDB trong cùng transaction ACID với việc cập nhật trạng thái User. Nếu transaction rollback, task không tồn tại. Nếu transaction commit, task chắc chắn được lưu trữ bền vững kể cả khi server restart.
2. **Phạm vi thu hồi có giới hạn thời gian (`Token Cutoff Boundary`):** Tác vụ thu hồi tại $T_1$ phải lưu vết `revokeBefore = T_1`. Worker chỉ được phép thu hồi các token có `createdAt <= revokeBefore`, bảo vệ 100% các phiên đăng nhập mới sau khi tài khoản được kích hoạt lại.
3. **Worker phân tán an toàn:** Có cơ chế khóa lease (`lockedUntil`, `lockedBy`) để nhiều instance worker chạy đồng thời không tranh chấp hoặc xử lý trùng lặp.
