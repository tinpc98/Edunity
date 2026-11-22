# 03. Thay đổi Backend

Không đổi model, index, dữ liệu. Không có migration, cron mới hay dependency mới.

| File | Thay đổi |
|---|---|
| `services/teacherClassService.js` | Tách validation theo bước; thêm `evaluateClass` và readiness; gửi duyệt có transaction và AuditLog; sửa lớp ghi kèm điều kiện trạng thái |
| `services/classCreationGateService.js` | Thay `validateClassGate` bằng bộ chạy điều kiện trả đủ lỗi; thêm kiểm tra số buổi và thông điệp tiếng Việt |
| `services/adminClassService.js` | Approve dùng chung rule và kiểm tra hạn; approve/reject gộp AuditLog vào transaction; sửa nội dung thông báo từ chối |
| `utils/approvalDeadline.js` (mới) | Chuyển nguyên hàm hạn duyệt từ maintenance job để dùng chung |
| `jobs/maintenanceJob.js` | Import hàm trên, hành vi không đổi |
| `routes/teachingRoutes.js`, `controllers/teachingController.js` | Hai route readiness |
| `BackEnd/docs/api-contract-academic.md` | Cập nhật các dòng API liên quan |

## Transaction và đồng thời

- Submit, approve, reject: đổi trạng thái và ghi AuditLog trong cùng transaction.
- Submit, approve so thêm `updatedAt`. Nội dung đổi trong lúc kiểm tra thì trả 409.
- Update ghi với điều kiện `status in (DRAFT, NEED_CHANGES)`.
- Thông báo chỉ gửi sau commit, một lần cho mỗi lần chuyển trạng thái thành công.
- `requestChanges` và transaction tạo lớp (khóa `Course.lockVersion`) giữ nguyên.

## Audit và thông báo

| Sự kiện | AuditLog | Thông báo |
|---|---|---|
| Gửi duyệt | `CLASS_SUBMITTED` (mới) | Admin, kèm tên các điều kiện cần kiểm tra |
| Phê duyệt | `CLASS_APPROVED` | Giáo viên |
| Từ chối | `CLASS_REJECTED` | Giáo viên |
| Yêu cầu sửa | `CLASS_CHANGES_REQUESTED` | Giáo viên |

`AuditLog.actorType` chỉ có ADMIN và SYSTEM. `CLASS_SUBMITTED` vì vậy ghi `SYSTEM`, còn ID giáo viên nằm ở `afterState.submittedBy`, để không ghi sai thành hành động của Admin.

## Ảnh hưởng khi triển khai

- Lớp đang PENDING đã tới ngày khai giảng hoặc có ca trùng giờ sẽ không duyệt được. Admin dùng "Yêu cầu chỉnh sửa".
- Submit, approve, reject cần MongoDB replica set, giống luồng tạo lớp hiện có.
- Rollback chỉ cần revert code. Lớp DRAFT tạo theo luật mới vẫn hợp schema cũ, nhưng code cũ sẽ không cho sửa hoặc gửi nếu thiếu quyền, giá hay hợp đồng.
