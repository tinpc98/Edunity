# EDUNITY V3 — TASK TIN-FINAL-INTEGRATION
# BÁO CÁO 06: QUẢN LÝ PHỤ THUỘC & BÀN GIAO LIÊN NHÓM (CROSS-TEAM DEPENDENCIES)

> **Mã công việc**: `CROSS-TEAM-HANDOVER` (Thuộc Task `TIN-FINAL-INTEGRATION`)  
> **Người bàn giao**: TÍN — Payment & Finance Architect  
> **Người nhận bàn giao chính**: CHÂU — Academic, Class & Curriculum Owner  
> **Người phối hợp an ninh**: BẢO — Auth, Verification & Guardian Consent Owner  

---

## 1. MA TRẬN BÀN GIAO KỸ THUẬT CHO CHÂU (HANDOVER MATRIX)

| Mã Task | Phân Hệ & Phạm Vi | Trạng Thái Triển Khai | Trạng Thái Kiểm Thử | Phụ Thuộc (Dependency) | Rào Cản (Blocker) | File Đã Sửa / Chạm Đến | Hành Động Tiếp Theo | Tiêu Chí Nghiệm Thu (Acceptance Criteria) |
|:---:|---|:---:|:---:|---|---|---|---|---|
| **FIN-INT-01** | Review Class Lifecycle sau khi Châu sửa | **DONE** | 🟢 **PASS** (Suite PR7 & PR10) | Hoàn thành các buổi học và buổi bù | Không có | `classLifecycleService.js`, `settlementService.js` | Châu duy trì logic `isTerminalSession` và `syncClassSettlementWithTracking` | Class COMPLETED không nuốt lỗi settlement; bảo lưu 7 ngày giữ tiền. |
| **CUR-09** | Tích hợp Snapshot Giáo trình & Chính sách giá | **DONE** (Phía Finance) | 🟢 **PASS** (Suite CUR-09) | Helper `buildEnrollmentSnapshotFromClass` | Chờ merge schema `Enrollment.js` từ `dev` | `enrollmentService.js`, `paymentService.js` | Châu kiểm tra các trường snapshot trên Model `Enrollment` | Đổi giá lớp học sau khi ghi danh không làm thay đổi Payment Intent cũ. |
| **FIN-INT-02** | Quyết toán Thu nhập Giáo viên & Khung giờ giải ngân | **DONE** | 🟢 **PASS** (60/60 Tests PR7) | Lớp học COMPLETED và đủ 7 ngày | Không có | `TeacherEarning.js`, `settlementService.js`, `payoutService.js` | Châu đảm bảo cập nhật `completedAt` khi đóng lớp | Không giải ngân sớm; bắt buộc Four-Eyes và đối soát ngân hàng. |
| **AID-06** | Phân bổ tài chính & Sử dụng Quỹ Học bổng | **DONE** (Phía Tài chính) | 🟢 **PASS** (Suite PR3 & PR5) | Hồ sơ chuyển sang `DOSSIER_VERIFIED` | Chờ Châu & Bảo merge API duyệt hồ sơ | `Scholarship.js`, `ScholarshipUsage.js`, `reservationService.js` | Châu & Bảo hoàn thiện cổng duyệt hồ sơ hành chính | Chỉ cấp quỹ khi `DOSSIER_VERIFIED`; học bổng MIXED tính đúng tiền túi. |
| **FIN-INT-03** | Hồi quy toàn bộ phân hệ Tài chính & Thanh toán | **PASS** | 🟢 **356/356 Tests PASS** | MongoDB Replica Set Local | Không có | Toàn bộ 16 file tests tài chính | Duy trì chạy regression trước mỗi lần merge | 100% test suites tài chính pass không có warning nuốt lỗi. |

---

## 2. CHI TIẾT 9 NỘI DUNG PHỐI HỢP LIÊN NHÓM CỐT LÕI

### 2.1. Những gì Tín đã hoàn tất (What Tin Fixed & Delivered)
1. Bổ sung hàm trích xuất an toàn `extractCur09Snapshot` trong `enrollmentService.js`, gắn các trường snapshot bất biến vào `new Enrollment` lúc học viên tạo đơn.
2. Khóa cứng giá trị thanh toán trong `paymentService.js` và `financialDispatchService.js`: Toàn bộ luồng tạo mã VietQR, hạch toán giao dịch `Transaction`, và tính doanh thu giáo viên `TeacherEarning` đều đọc bất biến từ `enrollment.tuitionAmount`.
3. Kiểm chứng và tích hợp hoàn chỉnh với cơ chế đồng bộ quyết toán có bắt lỗi `syncClassSettlementWithTracking` của Châu.
4. Xây dựng bộ test chuyên biệt `cur09EnrollmentSnapshotFinance.test.js` chứng minh toán học: Thay đổi giá lớp học từ 500k lên 750k không làm thay đổi số tiền thanh toán của học viên đã ghi danh.
5. Chạy hồi quy thành công 16 suites với 356 tests tài chính (100% PASS).

### 2.2. Những gì Châu cần thực hiện (What Chau Needs to Do)
1. Giữ nguyên ranh giới: Châu sở hữu toàn bộ các trường học thuật trên `Class.js`, `Enrollment.js`, giáo trình `SyllabusVersion.js`, và chính sách giá `CoursePricingPolicy.js`.
2. Duy trì việc cập nhật trường `completedAt` trên `Class` khi lớp học kết thúc, giúp động cơ 12 rào cản quyết toán của Tín xác định chính xác mốc tính 7 ngày.
3. Khi merge nhánh `dev` vào `feature/teacher-admin`, các trường mở rộng trong `Enrollment.js` (`syllabusVersionId`, `pricingPolicySnapshot`, v.v.) sẽ tự động được Mongoose lưu trữ nhờ đoạn mã Tín đã đấu nối sẵn trong `enrollmentService.js`.

### 2.3. Những gì Bảo cần bổ sung (What Bao Needs to Do)
1. Hoàn thiện cổng kiểm tra đồng thuận người giám hộ (`AID-08 / Guardian Consent`) cho học sinh chưa thành niên, để trường `consentSnapshot.status` trên `ScholarshipApplication` phản ánh đúng thực tế xác thực điện tử.

### 2.4. Danh mục API Contracts đã ổn định 100% (Stable Contracts)
- `POST /api/classes/:classId/enrollments`: Nhận `classId`, tạo đơn giữ chỗ 15 phút, snapshot giáo trình và chính sách giá, khóa mức học phí `tuitionAmount`.
- `POST /api/payments/payos/create-intent`: Đọc `enrollment.tuitionAmount`, tạo mã VietQR và payment link payOS.
- `POST /api/payments/webhooks/payos/tuition`: Tiếp nhận webhook, xác thực chữ ký HMAC SHA256, tự động chuyển `Enrollment` sang `CONFIRMED`, mở quyền vào lớp học ngay lập tức.
- `evaluateClassSettlement(classId, { now })`: Động cơ 12 rào cản tài chính, tự động tính mốc 7 ngày giữ an toàn.

### 2.5. Các tập tin cần hai bên rà soát chung (Mutual Review Files)
- `BackEnd/src/services/classLifecycleService.js`: Châu quản lý chu trình lớp; Tín quản lý hook gọi quyết toán.
- `BackEnd/src/services/enrollmentService.js`: Tín quản lý tạo đơn và thanh toán; Châu quản lý ràng buộc sĩ số và snapshot học thuật.

### 2.6. Các xung đột đã được giải quyết dứt điểm (Resolved Conflicts)
1. **Xung đột nuốt lỗi quyết toán**: Đã giải quyết bằng cờ `settlementSyncStatus` (`SYNCED` vs `FAILED`) và worker retry `retryPendingClassSettlements` của Châu.
2. **Xung đột thay đổi giá lớp học làm sai lệch thanh toán**: Đã giải quyết bằng cơ chế snapshot `enrollment.tuitionAmount` bất biến của Tín.
3. **Xung đột hoàn tiền lớp học bổng**: Đã giải quyết bằng cơ chế tách biệt nguồn tiền (chỉ hoàn tiền túi cho học viên, hoàn nguyên số dư cho Quỹ, không hoàn học bổng thành tiền mặt).

### 2.7. Xung đột còn tồn tại về mặt Git (Unmerged Branch Divergence)
- Hiện tại code của Châu nằm trên nhánh `dev` (và `remotes/origin/BE-2`), trong khi Tín làm việc trên `feature/teacher-admin` theo lệnh cách ly của Team Leader.
- Hai nhánh đang phân kỳ (diverged) nhưng mã nguồn logic hoàn toàn tương thích và không có mâu thuẫn nghiệp vụ.

### 2.8. Công việc Châu có thể tiếp tục triển khai ngay lập tức (Immediate Unblocked Work)
- Châu có thể tiếp tục hoàn thiện nghiệp vụ Quản lý Khóa học, Phê duyệt giáo trình, Cấu hình chính sách giá (`CUR-10`, `CUR-11`) và Quản lý buổi học LMS mà không lo sợ ảnh hưởng đến cổng thanh toán hay dòng tiền quyết toán của giáo viên.

### 2.9. Công việc cần đợi thống nhất chung (Pending Items)
- Phiên họp liên nhóm với Team Leader để thực hiện merge đồng bộ giữa `dev` và `feature/teacher-admin` sau khi có quyết định nghiệm thu chính thức.

