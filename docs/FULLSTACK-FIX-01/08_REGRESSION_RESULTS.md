# Phase 5 — Hồi quy

| Nhóm | Kết quả cuối |
| --- | --- |
| Backend | 90/90 suite, 1.484/1.484 test. Baseline là 1.472 test trong hai nhóm, tăng 12 ca. |
| Nhóm cũ đọc `.env` | 14/14 suite và 96/96 test trên replica set tạm, tính trong tổng Backend. |
| Frontend | Typecheck và production build đạt. Oxlint có 0 lỗi, 0 cảnh báo. |
| Playwright | 37/37 ca, tăng 3 ca từ baseline, gồm test trình duyệt dùng API giả lập và unit test utility. |
| MongoDB thật | MCP read-only, 0 thao tác ghi. |

| Vai trò | Các luồng được kiểm tra | Bằng chứng |
| --- | --- | --- |
| Admin | Danh mục, khóa, xem danh sách lớp và duyệt lớp, chi tiết Thùng rác, từ chối khôi phục lớp mất liên kết, tổng quan tài chính. | `catalogSearch`, `courseLifecycleCur12`, `teacherClassFlow02`, `softDeleteArchitecture`, `softDeleteFinalV2`, `adminFinance.pr6`. |
| Teacher | Tạo và quản lý draft, đối chiếu snapshot khóa, giảng dạy, kết thúc lớp và xem lại bản ghi được phép. | `teacherClassFlow02`, `classLifecycleRegression`, `sessionLifecycle`, `sessionRecordingFixes`, `sensitiveAccess.bao12`. |
| Student | Danh mục và lớp công khai, hạn đăng ký, số chỗ khi tranh suất, intent và lịch sử học phí, lịch qua nửa đêm, quyền tham gia và playback. | `catalogSearch`, `enrollment`, `sessionJoin`, `payosUnifiedIntent.pr1`, `authorization`, Playwright cho CTA và lịch sử. |
| Sponsor | Quyền truy cập, API dùng chung, đóng góp và luồng QR tài trợ giả lập. | `authorization`, `payosUnifiedIntent.pr1`, Playwright `payment-finance`. |

Thời hạn đăng ký và trạng thái vòng đời lớp được kiểm tra riêng. Session công khai có regression kiểm tra trọn bộ trường JSON. Tài khoản khác bị loại khỏi lịch sử học phí trong test tích hợp phân trang. Nhóm được chuyển khỏi `.env` vẫn chạy đủ 96 ca.

Typecheck và production build thành công. Oxlint đạt 0 cảnh báo. Vite vẫn báo module auth vừa được import tĩnh vừa được import động, và bundle chính vượt ngưỡng cảnh báo kích thước. Jest vẫn báo một số chỗ dùng tùy chọn Mongoose đã deprecated.

Git không ghi nhận thay đổi package manifest, lockfile, `.env`, cấu hình deploy hoặc file tích hợp FPT eContract/OCR. Worktree chứa code, test, script chỉ đọc và 10 báo cáo của task.
