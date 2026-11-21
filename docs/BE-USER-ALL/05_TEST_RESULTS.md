# BÁO CÁO KẾT QUẢ KIỂM THỬ — BE-USER-ALL
**Dự án:** EDUNITY V3  
**Phân hệ:** Admin User Management & Audit Consistency  
**Tác giả:** Senior Backend Engineer  
**Ngày:** 21/11/2026  

---

## 1. Tóm tắt kết quả kiểm thử

Tất cả các bài kiểm thử đơn vị, kiểm thử tích hợp giao dịch đa tài liệu (MongoDB Multi-document Transactions), kiểm thử phân quyền RBAC và kiểm thử hồi quy (regression) đều vượt qua 100%.

| Test Suite | File kiểm thử | Số test | Kết quả | Thời gian |
|---|---|---|---|---|
| **BE-USER-ALL Complete Suite** | [beUserAdminStatus.test.js](file:///c:/CODE/Edunity/BackEnd/tests/beUserAdminStatus.test.js) | **33 / 33** | **PASS** | 11.29 s |
| **Community Suite** | [community.test.js](file:///c:/CODE/Edunity/BackEnd/tests/community.test.js) | **11 / 11** | **PASS** | 7.15 s |
| **BE-02 Maintenance Expired Class** | [be02MaintenanceExpiredClass.test.js](file:///c:/CODE/Edunity/BackEnd/tests/be02MaintenanceExpiredClass.test.js) | **17 / 17** | **PASS** | 7.11 s |
| **BE-01 Class Need Changes** | [be01ClassNeedChanges.test.js](file:///c:/CODE/Edunity/BackEnd/tests/be01ClassNeedChanges.test.js) | **23 / 23** | **PASS** | 8.33 s |
| **BE-03 Academic Soft Delete** | [be03AcademicSoftDelete.test.js](file:///c:/CODE/Edunity/BackEnd/tests/be03AcademicSoftDelete.test.js) | **17 / 17** | **PASS** | 6.82 s |
| **Chau Safe Delete Concurrency** | [chauSafeDeleteConcurrencyReplSet.test.js](file:///c:/CODE/Edunity/BackEnd/tests/chauSafeDeleteConcurrencyReplSet.test.js) | **6 / 6** | **PASS** | 6.65 s |
| **Class Lifecycle Regression** | [classLifecycleRegression.test.js](file:///c:/CODE/Edunity/BackEnd/tests/classLifecycleRegression.test.js) | **10 / 10** | **PASS** | 6.65 s |
| **TỔNG CỘNG** | **7 Test Suites** | **117 / 117** | **100% PASS** | — |

---

## 2. Chi tiết 33 kịch bản kiểm thử trong `beUserAdminStatus.test.js`

Lệnh chạy: `npm --prefix BackEnd test -- tests/beUserAdminStatus.test.js`

```text
PASS tests/beUserAdminStatus.test.js (11.016 s)
  TASK BE-USER-ALL: Admin User Management Complete Suite
    1. Status Workflow (TC 1 - 8)
      √ 1. ACTIVE -> SUSPENDED với lý do hợp lệ (220 ms)
      √ 2. ACTIVE -> BANNED với lý do hợp lệ (139 ms)
      √ 3. SUSPENDED -> ACTIVE: xóa lý do khóa hiện tại và gửi thông báo (162 ms)
      √ 4. SUSPENDED -> BANNED: nâng mức xử phạt kèm lý do mới (155 ms)
      √ 5. BANNED -> ACTIVE: kích hoạt lại tài khoản bị cấm (189 ms)
      √ 6. Thiếu reason khi chuyển sang SUSPENDED/BANNED bị từ chối 400 (121 ms)
      √ 7. Reason chỉ chứa khoảng trắng bị từ chối 400 (117 ms)
      √ 8. Request lặp lại (idempotency): trả 200 và không tạo duplicate audit (137 ms)
    2. Transaction & Concurrency (TC 9 - 14)
      √ 9. User update và AuditLog commit thành công trong cùng transaction (134 ms)
      √ 10. AuditLog thất bại -> Rollback User status và không ghi nhận thay đổi (151 ms)
      √ 11. Transaction không khả dụng -> fail-closed (ném lỗi, không fallback sang nontransactional) (124 ms)
      √ 12. Hai Admin thay đổi cùng User đồng thời: xử lý an toàn không dirty write (137 ms)
      √ 13. Không tạo duplicate audit khi có xung đột (130 ms)
      √ 14. Không có partial write: User document và AuditLog luôn nhất quán (130 ms)
    3. Authentication & Authorization (TC 15 - 20)
      √ 15. Admin tự khóa tài khoản của chính mình bị từ chối 400 (126 ms)
      √ 16. Khóa tài khoản Admin khác bị từ chối 403 FORBIDDEN (132 ms)
      √ 17. Student/Teacher/Sponsor truy cập API Admin bị từ chối 403 FORBIDDEN (136 ms)
      √ 18. Access token sau khi tài khoản bị khóa bị từ chối 403 ACCOUNT_BLOCKED ngay lập tức (212 ms)
      √ 19. Refresh token sau khi tài khoản bị khóa bị thu hồi và từ chối (193 ms)
      √ 20. Kích hoạt lại tài khoản: đăng nhập và sử dụng dịch vụ bình thường (199 ms)
    4. API & Legacy Data (TC 21 - 29)
      √ 21. GET user detail ACTIVE: trả về statusReason null (123 ms)
      √ 22. GET user detail SUSPENDED: trả về đầy đủ statusReason, statusChangedAt, statusChangedBy (139 ms)
      √ 23. GET user detail BANNED: trả về đầy đủ thông tin khóa (151 ms)
      √ 24. GET status history: trả về danh sách lịch sử chuyển đổi trạng thái (193 ms)
      √ 25. Pagination: status history hỗ trợ phân trang chuẩn (160 ms)
      √ 26. Legacy user thiếu statusReason: fallback tra cứu AuditLog hợp lệ, không tạo lý do giả (256 ms)
      √ 27. User không tồn tại hoặc ObjectId không hợp lệ trả 404 USER_NOT_FOUND (128 ms)
      √ 28. Không lộ dữ liệu nhạy cảm (passwordHash, tokenVersion, v.v.) (136 ms)
      √ 29. Backward compatibility: GET /admin/users giữ nguyên cấu trúc chuẩn (114 ms)
    5. Regression (TC 30 - 33)
      √ 30. Admin user list filter và search hoạt động chính xác (136 ms)
      √ 31. Request không xác thực (unauthenticated) trả 401 UNAUTHORIZED (110 ms)
      √ 32. Thao tác xem hồ sơ và thông tin cá nhân không bị ảnh hưởng (175 ms)
      √ 33. Notification ACCOUNT_REACTIVATED được tạo khi mở khóa (150 ms)

Test Suites: 1 passed, 1 total
Tests:       33 passed, 33 total
Snapshots:   0 total
Time:        11.288 s
```

---

## 3. Bằng chứng kiểm chứng cho các yêu cầu trọng yếu

### 3.1. Bằng chứng Rollback Atomicity (Test 10)
- Mô phỏng `AuditLog.create` ném exception trong session transaction.
- Kết quả:
  - Phản hồi trả về HTTP 500.
  - Trạng thái `User` trong cơ sở dữ liệu giữ nguyên `ACTIVE` (không bị đổi thành `BANNED`).
  - Trường `statusReason` trong DB giữ nguyên `null`.
  - Không có bất kỳ bản ghi `AuditLog` rác nào được lưu lại.

### 3.2. Bằng chứng Fail-Closed khi Transaction không khả dụng (Test 11)
- Mô phỏng `mongoose.startSession` ném lỗi không hỗ trợ transaction.
- Kết quả:
  - Phản hồi trả về HTTP 500.
  - Hệ thống **tuyệt đối không ghi đè non-transactional** lên User. Trạng thái User giữ nguyên `ACTIVE`.

### 3.3. Bằng chứng Token Revocation & Immediate Enforcement (Test 18 & 19)
- User đang sở hữu JWT Access Token và Refresh Token hợp lệ và truy cập thành công `/api/me/profile`.
- Ngay sau khi Admin khóa tài khoản:
  - Lần gọi API tiếp theo với Access Token cũ bị `authMiddleware` từ chối tức thì với mã `403 ACCOUNT_BLOCKED`.
  - Lần gọi refresh token bị từ chối và bản ghi trong bảng `RefreshToken` bị đánh dấu `revokedAt`.

### 3.4. Bằng chứng Phục hồi dữ liệu Legacy an toàn (Test 26)
- Với tài khoản bị khóa trong quá khứ không có trường `statusReason`:
  - `GET /api/admin/users/:id` tra cứu `AuditLog` mới nhất ứng với trạng thái và trích xuất đúng lý do và Admin thực hiện.
  - Với tài khoản không có log: trả về `statusReason: null`, không tự bịa lý do giả.

### 3.5. Bằng chứng Phân trang và Lịch sử trạng thái (Test 24 & 25)
- Endpoint `GET /api/admin/users/:id/status-history` phản hồi đầy đủ các bước chuyển trạng thái, sắp xếp mới nhất trước, phân trang chính xác (`page`, `pageSize`, `total`, `totalPages`).
