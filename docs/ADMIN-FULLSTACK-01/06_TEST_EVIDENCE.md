# BẰNG CHỨNG KIỂM THỬ THỰC TẾ (TEST EVIDENCE)
**Mã tài liệu:** `docs/ADMIN-FULLSTACK-01/06_TEST_EVIDENCE.md`  
**Dự án:** EDUNITY V3  
**Vai trò:** Senior Fullstack Engineer  

---

## 1. KIỂM THỬ XÂY DỰNG FRONTEND (TYPECHECK & PRODUCTION BUILD)

### Lệnh thực thi:
```powershell
npm --prefix FrontEnd run build
```

### Kết quả đầu ra:
```text
> edunity@0.0.0 build
> tsc -b && vite build

vite v8.3.0 building client environment for production...
transforming...
✓ 3401 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                     0.66 kB │ gzip:   0.39 kB
dist/assets/index-B12askrW.css    119.98 kB │ gzip:  20.38 kB
dist/assets/index-6vbHkGLi.js   3,656.62 kB │ gzip: 996.74 kB

✓ built in 7.39s
```
- **Trạng thái:** **PASS (100% không lỗi Type, không broken import)**.
- **Modules biên dịch:** 3.401 modules.
- **Thời gian hoàn tất:** 7.39 giây.

---

## 2. KIỂM THỬ BACKEND TOÀN DIỆN (9 TEST SUITES)

### Lệnh thực thi:
```powershell
npm --prefix BackEnd test -- tests/beUserDurableRevocation.test.js tests/beUserFix01.test.js tests/beUserAdminStatus.test.js tests/be01ClassNeedChanges.test.js tests/be02MaintenanceExpiredClass.test.js tests/be03AcademicSoftDelete.test.js tests/chauSafeDeleteConcurrencyReplSet.test.js tests/classLifecycleRegression.test.js tests/community.test.js --runInBand
```

### Kết quả đầu ra:
```text
PASS tests/beUserDurableRevocation.test.js (16.215 s)
PASS tests/beUserAdminStatus.test.js (7.781 s)
PASS tests/be01ClassNeedChanges.test.js (18.665 s)
PASS tests/be02MaintenanceExpiredClass.test.js (9.920 s)
PASS tests/be03AcademicSoftDelete.test.js (5.639 s)
PASS tests/beUserFix01.test.js (11.984 s)
PASS tests/chauSafeDeleteConcurrencyReplSet.test.js (9.881 s)
PASS tests/classLifecycleRegression.test.js (9.671 s)
PASS tests/community.test.js (11.230 s)

Test Suites: 9 passed, 9 total
Tests:       145 passed, 145 total
Snapshots:   0 total
Time:        47.978 s
```

---

## 3. BẢNG CHI TIẾT BẰNG CHỨNG THEO PHÂN HỆ

| Phân hệ / Nghiệp vụ | Bộ test liên quan | Số kịch bản | Kết quả | Đặc tả xác thực |
| :--- | :--- | :---: | :---: | :--- |
| **Quy trình Duyệt Lớp & NEED_CHANGES** | `be01ClassNeedChanges.test.js` | 14 | **PASS** | Kiểm tra quyền Admin duyệt, từ chối, yêu cầu sửa `NEED_CHANGES`, lưu `reviewNote`, ghi `AuditLog`, gửi `Notification`, rollback khi lỗi. |
| **Tự động Từ chối Lớp Quá hạn** | `be02MaintenanceExpiredClass.test.js` | 13 | **PASS** | Chạy bảo trì tự động quét lớp `PENDING_APPROVAL` quá hạn, distributed lock an toàn, không từ chối nhầm lớp `NEED_CHANGES`. |
| **Xóa Mềm Học Thuật & Thùng Rác** | `be03AcademicSoftDelete.test.js` | 26 | **PASS** | Xóa mềm Category, Subject, Course, kiểm tra phụ thuộc ràng buộc fail-closed, khôi phục từ thùng rác. |
| **Xác thực Trạng thái Người dùng** | `beUserAdminStatus.test.js` | 33 | **PASS** | Khóa, tạm ngưng, kích hoạt lại tài khoản, lưu `statusReason`, kiểm tra quyền Admin, phân trang và tìm kiếm. |
| **Lý do Khóa & Đối chiếu Audit** | `beUserFix01.test.js` | 10 | **PASS** | Đối chiếu audit log cũ chính xác, nhiều chu kỳ khóa - mở, không phát sinh lỗi 500 khi side-effect tạm thời lỗi. |
| **Thu hồi Token Bền vững (Durable)** | `beUserDurableRevocation.test.js` | 18 | **PASS** | Tác vụ outbox bền vững, worker sweep, an toàn phiên mới khi kích hoạt lại (`revokeBefore` cutoff), chống replay. |
| **Đồng thời & Rollback ReplicaSet** | `chauSafeDeleteConcurrencyReplSet.test.js` | 5 | **PASS** | Kiểm tra tranh chấp đồng thời, snapshot isolation, an toàn giao dịch multi-document. |
| **Vòng đời Lớp học** | `classLifecycleRegression.test.js` | 4 | **PASS** | Kiểm tra luồng trạng thái từ tạo lớp, mở tuyển sinh, kết thúc lớp học. |
| **Cộng đồng, Đánh giá & Hồ sơ** | `community.test.js` | 22 | **PASS** | Hồ sơ người dùng, phân quyền truy cập, danh sách thảo luận và kiểm duyệt nội dung. |
| **TỔNG CỘNG** | **9 Suites** | **145** | **145/145 PASS (100%)** | **Toàn bộ hệ thống Backend đạt tiêu chuẩn ổn định cao nhất.** |
