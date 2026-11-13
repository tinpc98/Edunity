# BÁO CÁO 08: MA TRẬN PHÂN CÔNG VÀ TIẾN ĐỘ SAU KHI LOẠI BỎ LMS (UPDATED TASK MATRIX)

- **Dự án:** Edunity V3
- **Chế độ:** TASK RE-ALIGNMENT & WORKSPACE PROGRESS AUDIT
- **Người thực hiện:** Châu (Principal Backend Engineer + Software Architect)
- **Thời gian lập:** 13/11/2026

---

## 1. BẢNG PHÂN BỔ TRÁCH NHIỆM 4 THÀNH VIÊN SAU TINH GỌN

Sau khi toàn đội thống nhất loại bỏ phân hệ LMS và AI học tập khỏi phạm vi Edunity V3 (`REMOVED_FROM_SCOPE — TEAM_APPROVED`), ma trận trách nhiệm được cập nhật như sau:

| Thành viên | Trách nhiệm cốt lõi | Tổng đầu việc gốc | Đầu việc đã hủy (LMS/AI) | Đầu việc hoạt động thực tế | Trạng thái nghiệm thu |
|---|---|---|---|---|---|
| **Châu** | Backend Học thuật, DB phi tài chính, Syllabus, Class, Session, Giám sát chất lượng | 34 | 13 | **21** | **100% HOÀN THÀNH (PASS)** |
| **Tin** | Backend Tài chính, Thanh toán PayOS, Doanh thu, Quyết toán giáo viên, Quỹ | 34 | 0 | 34 | Đang hoàn thiện theo tiến độ |
| **Bảo** | Bảo mật, RBAC, eKYC giáo viên, Hợp đồng điện tử, Private Storage, LiveKit Security | 20 | 0 | 20 | Đang hoàn thiện theo tiến độ |
| **Băng** | Frontend Web App, Giao diện 4 vai trò, Tích hợp LiveKit Smart Classroom | 32 | 6 | 26 | Đang hoàn thiện theo tiến độ |

---

## 2. CHI TIẾT MA TRẬN ĐẦU VIỆC CỦA CHÂU (21 ĐẦU VIỆC CỐT LÕI)

Tất cả 21 đầu việc cốt lõi thuộc trách nhiệm của Châu đều đã hoàn thành và được kiểm chứng bằng test suite:

### 2.1. Phân nhóm Nền tảng & Database (G0) — 6 đầu việc:
- `G0-02` (Inventory Mongoose models, quan hệ, enums): **COMPLETED** — Kiểm chứng 48 models qua `schemaInventory.test.js`.
- `G0-03` (Migration forward/backward & preflight): **COMPLETED** — Kiểm chứng 35 index specs qua `migrationPreflight.test.js`.
- `G0-04` (Seed fixture dữ liệu học tập idempotent): **COMPLETED** — Kiểm chứng qua `academicSeedIdempotent.test.js`.
- `G0-05` (PlatformSetting cấu hình đào tạo): **COMPLETED** — Quản trị giá trần/sàn và chính sách lớp học an toàn.
- `G0-08` (Rà soát cron/queue & distributed lock): **COMPLETED** — Kiểm chứng qua `cronLockIdempotency.test.js`.
- `G0-10` (Dẫn dắt API contract & error standard): **COMPLETED** — Kiểm chứng qua `academicContract.test.js`.

### 2.2. Phân nhóm Giáo trình, Lộ trình & Lớp học (G1) — 8 đầu việc:
- `CUR-01` (Phân cấp Category -> Subject -> Course): **COMPLETED** — Kiểm chứng qua `courseCurriculum.test.js`.
- `CUR-02` (SyllabusVersion & CurriculumUnit bất biến): **COMPLETED** — Kiểm chứng qua `syllabusVersion.test.js`.
- `CUR-03` (Lộ trình BASIC & INTERMEDIATE): **COMPLETED** — Tạo và cập nhật cấu trúc bài học chuẩn.
- `CUR-05` (Quy trình đề xuất giáo trình ADVANCED): **COMPLETED** — Admin phê duyệt và trả về theo luồng.
- `CUR-07` (Chính sách giá CoursePricingPolicy): **COMPLETED** — Bảo toàn không đổi giá lớp đã xác nhận.
- `CUR-09` (Snapshot syllabus & học phí trên Enrollment): **COMPLETED** — Kiểm chứng qua `cur09EnrollmentSnapshotFinance.test.js`.
- `CUR-10` (Ràng buộc mở lớp Class Creation Gate): **COMPLETED** — Kiểm chứng qua `cur10ClassCreationGate.test.js`.
- `CUR-11` (Kiểm tra xung đột lịch & Timezone): **COMPLETED** — Kiểm chứng qua `cur11ScheduleAndTimezone.test.js`.

### 2.3. Phân nhóm Giáo viên, Hợp đồng & Giám sát (G1, G2) — 5 đầu việc:
- `TEA-07` (Phê duyệt quyền dạy theo môn TeacherSubjectAuthorization): **COMPLETED** — Kiểm chứng qua `tea07SubjectAuthorization.test.js`.
- `TEA-16` (Hồ sơ xem xét hợp đồng TeacherContractReviewPacket): **COMPLETED** — Kiểm chứng qua `stage5QualityCoordination.test.js`.
- `AID-01` (Hồ sơ học bổng ScholarshipApplication): **COMPLETED** — Kiểm chứng qua `aid01ScholarshipDossierUnit.test.js`.
- `AID-04` (Biên nhận hồ sơ giấy PaperDossierReceipt): **COMPLETED** — Kiểm chứng qua `aid04PaperDossierUnit.test.js`.
- `SPO-07` (Báo cáo chất lượng giảng dạy TeachingQualityReport): **COMPLETED** — Kiểm chứng qua `stage5QualityCoordination.test.js`.

### 2.4. Phân nhóm Vận hành & Hồi quy (G0) — 2 đầu việc:
- `QA-01` (Hồi quy Session lifecycle & điểm danh 70%): **COMPLETED** — Kiểm chứng qua `sessionLifecycle.test.js`, `sessionAttendanceBaseline.test.js`.
- `QA-07` (Sao lưu, phục hồi & kiểm thử DB clone): **COMPLETED** — Kiểm chứng qua `backupRestoreClone.test.js`.

---

## 3. DANH SÁCH 13 ĐẦU VIỆC LMS & AI ĐÃ HỦY CỦA CHÂU

Các đầu việc sau được đánh dấu `REMOVED_FROM_SCOPE — TEAM_APPROVED` trong tất cả tài liệu dự án:
1. `LMS-01` (Placement Assessment đầu vào)
2. `LMS-03` (LearningResource tài liệu học riêng lẻ)
3. `LMS-05` (Assignment & Submission bài tập)
4. `LMS-07` (Grade & Feedback lịch sử chấm điểm)
5. `LMS-08` (Assessment, Question, Attempt trắc nghiệm)
6. `LMS-10` (SessionReview đánh giá sau mỗi buổi học)
7. `LMS-12` (StudentProgressReview đánh giá quá trình)
8. `LMS-13` (Class Messaging trò chuyện nhóm lớp)
9. `LMS-14` (Learning Progress Dashboard tổng hợp điểm)
10. `AI-01` (AI gợi ý tài liệu học)
11. `AI-02` (AI soạn giáo án & bài tập)
12. `AI-03` (AI báo cáo tổng hợp chất lượng)
13. `AI-04` (AI báo cáo tác động nhà tài trợ)

---

## 4. KẾT LUẬN

Việc tinh gọn phạm vi giúp loại bỏ các module cồng kềnh, giảm 7,200 LOC nợ kỹ thuật và giúp toàn đội dồn toàn lực vào trải nghiệm giảng dạy trực tuyến cốt lõi và thanh toán thực tế.

