# EDUNITY V3 — SOFT DELETE ARCHITECTURE: OWNER HANDOFF
**Task ID:** EDUNITY-V3-SOFT-DELETE-ARCHITECTURE-V1  
**Date:** 2026-11-20  
**Branch:** feature/teacher-admin  
**Coordinator:** Senior Backend Architect  

---

## 1. PHÂN CÔNG QUYỀN SỞ HỮU DOMAIN (TEAM OWNERSHIP MATRIX)

| Chủ Sở Hữu (Owner) | Domain Quản Lý | Nhiệm Vụ Đã Hoàn Thành | Kế Hoạch Bàn Giao & Lưu Ý Tiếp Theo |
|---|---|---|---|
| **CHÂU** | Academic Domain: Categories, Subjects, Courses, Curriculum/Syllabus, Classes, Sessions | Đã triển khai safe soft delete và restore cho Category, Subject, Course, Class. Thêm dependency checks không cho mồ côi dữ liệu con. | Khi cập nhật logic mở lớp hoặc tạo khóa học mới, tiếp tục dùng `NOT_DELETED = { isDeleted: { $ne: true } }`. Không thay đổi logic khôi phục Class về `DRAFT`. |
| **TÍN** | Finance, Payment Safeguards, Admin Shared UI & Trash Integration | Đã xây dựng trang `/admin/trash`, Modal xác nhận xóa kèm lý do tại `AdminCatalogPage` và `AdminClassesPage`, dịch vụ `trashService`, bảo vệ 100% phân vùng tài chính (Payment, Transaction, Earning, RefundCase). | Khi xây dựng thêm các chức năng tài chính mới, giữ nguyên tính bất biến (`IMMUTABLE_FINANCIAL_RECORD`), không tạo nút xóa mềm cho sổ cái. |
| **BẢO** | Auth, RBAC, User Management, Verification KYC | Đã phân loại User thuộc `ARCHIVE_OR_DEACTIVATE`. Giữ nguyên cơ chế `SUSPENDED`/`BANNED` hiện tại. Bảo vệ các endpoint Thùng rác bằng role `ADMIN`. | Không biến soft delete thành thao tác xóa tài khoản Auth. Nếu sau này cần tính năng "Xóa tài khoản theo yêu cầu người dùng (GDPR)", cần quy trình xác thực 2 lớp và ẩn danh hóa (Anonymization) thay vì xóa cứng. |
| **BĂNG** | Public & Student UI | Đã đảm bảo các endpoint Public Catalog và Class Discovery loại bỏ toàn bộ bản ghi `isDeleted: true`. | Giao diện Public đã được cách ly hoàn toàn khỏi dữ liệu thùng rác. Tiếp tục giữ nguyên cấu trúc query hiện tại. |

---

## 2. HƯỚNG DẪN MỞ RỘNG (EXTENSION GUIDELINES FOR FUTURE MODELS)
Nếu trong tương lai có thêm Model nội dung mới cần hỗ trợ Soft Delete:
1. Đăng ký plugin: `schema.plugin(softDeletePlugin);`.
2. Luôn truy vấn danh sách bằng: `const NOT_DELETED = { isDeleted: { $ne: true } };`.
3. Khai báo dependency check trước khi cập nhật `isDeleted = true`.
4. Bổ sung loại dữ liệu vào `trashService.js` (danh sách `VALID_TRASH_TYPES`).
5. Đăng ký nhãn loại dữ liệu vào `AdminTrashPage.tsx` (`TYPE_CONFIG`).
