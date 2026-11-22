# BE-USER-FIX-02: REGRESSION RESULTS REPORT

## 1. Bảng tổng hợp hồi quy toàn hệ thống (145/145 Tests)

| STT | Suite / Module | File Test | Số Test | Trạng Thái | Thời Gian | Ghi Chú |
| :---: | :--- | :--- | :---: | :---: | :---: | :--- |
| 1 | **BE-USER-FIX-02** | `tests/beUserDurableRevocation.test.js` | 18 | **PASS (18/18)** | ~10.5s | Durable outbox, worker sweep, session isolation, cutoff safety |
| 2 | **BE-USER-FIX-01** | `tests/beUserFix01.test.js` | 10 | **PASS (10/10)** | ~5.8s | Legacy audit matching, multi-cycle, post-commit non-500 |
| 3 | **BE-USER-ALL** | `tests/beUserAdminStatus.test.js` | 33 | **PASS (33/33)** | ~7.7s | Status workflow, metadata, history, filter/search |
| 4 | **BE-01** | `tests/be01ClassNeedChanges.test.js` | 14 | **PASS (14/14)** | ~19.0s | NEED_CHANGES workflow, reviewNote, rollback, RBAC |
| 5 | **BE-02** | `tests/be02MaintenanceExpiredClass.test.js` | 13 | **PASS (13/13)** | ~7.3s | Auto-reject expired classes, fencing, lease heartbeat, cron retry |
| 6 | **BE-03** | `tests/be03AcademicSoftDelete.test.js` | 26 | **PASS (26/26)** | ~12.8s | Academic soft-delete, dependency safety, fail-closed tx |
| 7 | **ReplicaSet Concurrency** | `tests/chauSafeDeleteConcurrencyReplSet.test.js` | 5 | **PASS (5/5)** | ~6.1s | Concurrency, rollback on standalone server, snapshot isolation |
| 8 | **Lifecycle Regression** | `tests/classLifecycleRegression.test.js` | 4 | **PASS (4/4)** | ~5.1s | Class state progression, enrollment completion |
| 9 | **Community & Profile** | `tests/community.test.js` | 22 | **PASS (22/22)** | ~10.2s | Me profile, community discussion, session management |
| **TỔNG** | **9 Test Suites** | **145 Tests** | **145** | **PASS (145/145)** | **~85s** | **100% PASS, 0 HỎNG HÓC** |

---

## 2. Phân tích tác động hồi quy (Regression Impact Analysis)

### 2.1. Module Quản lý Người dùng (BE-USER-ALL & BE-USER-FIX-01)
- Các trường trạng thái `statusReason`, `statusChangedAt`, `statusChangedBy` hoạt động trơn tru.
- Cơ chế đối chiếu audit log cũ (`Legacy Audit Matching`) tiếp tục trả `null` khi có ranh giới mở khóa xen giữa, không bao giờ nhận nhầm lý do cũ.
- Tác vụ thu hồi token được tích hợp bền vững trong transaction, giúp `updateUserStatus` không phát sinh lỗi 500 khi side-effect tạm thời gián đoạn.

### 2.2. Module Class Workflow (BE-01 & BE-02)
- API `POST /api/admin/classes/:id/request-changes` bảo đảm tính nguyên tử và ghi AuditLog kèm notification sau commit.
- Maintenance Job (`rejectExpiredPendingClasses`, `recoverMissingExpiredClassNotifications`, và `tokenRevocationSweep`) phối hợp nhịp nhàng dưới distributed lock `runExclusive("maintenance")`.

### 2.3. Module Academic Soft Delete (BE-03)
- Các mã lỗi chặn xóa do ràng buộc dữ liệu (`CATEGORY_HAS_SUBJECTS`, `CATEGORY_HAS_COURSES`, `CATEGORY_HAS_CLASSES`, `SUBJECT_HAS_COURSES`, `SUBJECT_HAS_CLASSES`, `SUBJECT_HAS_TEACHER_AUTHORIZATIONS`) được giữ vững theo đúng hợp đồng API chuẩn.
- Các thao tác xóa mềm danh mục và môn học được bảo vệ fail-closed trong transaction.
