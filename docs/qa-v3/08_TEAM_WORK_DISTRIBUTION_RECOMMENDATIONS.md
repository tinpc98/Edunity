# BÁO CÁO KHUYẾN NGHỊ PHÂN CÔNG CÔNG VIỆC VÀ TỐI ƯU HÓA ĐỘI NGŨ
# DOCUMENT: 08_TEAM_WORK_DISTRIBUTION_RECOMMENDATIONS.md
# NHIỆM VỤ: EDUNITY-V3-FULL-INTEGRATION-AUDIT

> **Dự án**: EDUNITY V3 — Nền tảng Giáo dục Trực tuyến & Gây quỹ Học bổng  
> **Chủ nhiệm**: Principal Software Architect + QA Lead  
> **Đội ngũ phát triển**: Tin (Payment/Finance/DevOps) — Băng (Frontend/QA) — Bảo (Security/Legal) — Châu (Backend LMS/Academic)  
> **Thời điểm thẩm định**: 11/11/2026  

---

## 1. TỔNG QUAN TIẾN ĐỘ THỰC TẾ CỦA 4 THÀNH VIÊN

Đối chiếu trực tiếp mã nguồn thực tế tại commit hiện tại với bản phân công 106 đầu việc tại `EDUNITY_V3_Checklist_4_Thanh_Vien.md`:

```
+-----------+-----------------------------------+-------------------+-------------------+-----------------------------------------------+
| THÀNH VIÊN| PHẠM VI PHỤ TRÁCH CHÍNH           | TỔNG ĐẦU VIỆC     | ĐÃ HOÀN THÀNH     | TIẾN ĐỘ & TRẠNG THÁI HIỆN TẠI                 |
+-----------+-----------------------------------+-------------------+-------------------+-----------------------------------------------+
| **TIN**   | Payment, Finance, DevOps, Ledger  | 26 đầu việc       | 26 / 26 (100%)    | [ HOÀN TẤT & READY ] PR1–PR11 PASS 100%       |
| **BĂNG**  | Frontend phi tài chính & QA E2E   | 26 đầu việc       | 16 / 26 (61.5%)   | [ ĐANG PHÁT TRIỂN ] Còn thiếu UI LMS G3       |
| **BẢO**   | Security, eKYC, eContract, PII    | 20 đầu việc       | 11 / 20 (55.0%)   | [ ĐANG PHÁT TRIỂN ] Chưa có eContract, OCR   |
| **CHÂU**  | Backend Đào tạo, LMS, DB Học bổng | 34 đầu việc       | 18 / 34 (52.9%)   | [ ĐANG PHÁT TRIỂN ] Thiếu toàn bộ LMS G3      |
+-----------+-----------------------------------+-------------------+-------------------+-----------------------------------------------+
| **TỔNG**  | TOÀN BỘ HỆ THỐNG EDUNITY V3       | **106 ĐẦU VIỆC**  | **71 / 106 (67%)**| **67% HOÀN TẤT TOÀN DIỆN TRÊN LOCAL**         |
+-----------+-----------------------------------+-------------------+-------------------+-----------------------------------------------+
```

---

## 2. KHUYẾN NGHỊ HÀNH ĐỘNG CHI TIẾT CHO TỪNG THÀNH VIÊN

### 2.1. TIN — Payment, Finance, DevOps & Hạ tầng (Senior Architect)
- **Hiện trạng**: Đã xuất sắc hoàn thành trọn vẹn 100% phân hệ Thanh toán, Sổ cái, Đối soát, Hoàn tiền, Rút tiền giáo viên (PR1–PR10), xây dựng bộ Browser E2E Automation và bộ tài liệu Staging (PR11).
- **Nhiệm vụ trọng tâm trong Pha A tiếp theo**:
  1. **Đóng gói script test an toàn**: Bổ sung script `"test:ci": "jest --runInBand"` vào `BackEnd/package.json` để đồng đội chạy kiểm thử không bị crash socket trên Windows.
  2. **Chuẩn bị cấu hình DNS cho Docker (Pha C)**: Sửa điều kiện DNS trong `BackEnd/src/config/db.js` theo khuyến nghị để ưu tiên `process.env.DNS_SERVERS`, tránh xung đột khi chạy container.
  3. **Hỗ trợ tích hợp liên phân hệ**: Phối hợp cùng Châu và Bảo để móc nối các điểm chặn tài chính khi học sinh được duyệt học bổng hoặc khi giáo viên hoàn tất khóa học.
  4. **Chủ trì Hạ tầng Pha C**: Thiết lập VPS Staging, Nginx Reverse Proxy, SSL HTTPS và MongoDB Replica Set khi toàn dự án hoàn tất.

---

### 2.2. CHÂU — Backend Đào tạo, LMS, DB Học sinh & Học bổng (Backend Lead)
- **Hiện trạng**: Đã hoàn thành xuất sắc cấu trúc Course, Class, Session, SessionAttendance (70%), Schedule overlap check và quy trình duyệt học bổng cơ bản.
- **Khoảng trống cần tập trung giải quyết ngay (P1 Blocker)**:
  1. **Xây dựng phân hệ LMS Bài tập (Assignment System - LMS-05, LMS-07)**:
     - Tạo Mongoose Models: `Assignment.js`, `Submission.js`, `GradeRubric.js`.
     - Xây dựng API: Giáo viên tạo bài tập, đính kèm file, học sinh nộp bài, giáo viên chấm điểm và lưu lịch sử phản hồi.
  2. **Xây dựng phân hệ Kiểm tra năng lực & Thi trắc nghiệm (LMS-01, LMS-08)**:
     - Tạo Mongoose Models: `Assessment.js`, `Question.js`, `ExamAttempt.js`.
     - Xây dựng API: Bài kiểm tra đầu vào (Placement test), nộp bài thi, tự động tính điểm trắc nghiệm.
  3. **Quản lý biên nhận hồ sơ giấy (AID-04)**:
     - Tạo Model `PaperDossierReceipt.js` lưu mã vận đơn bưu điện, ngày nhận bản cứng, trạng thái đối chiếu bản cứng vs bản mềm.
  4. **Phân quyền môn dạy của giáo viên (TEA-07)**:
     - Tạo Model `TeacherSubjectAuthorization.js` và tích hợp vào `teacherClassService.js` để chặn giáo viên mở lớp ngoài môn được cấp phép.
  5. **Bảng chính sách giá theo phiên bản (CUR-07)**:
     - Tách bảng `CoursePricingPolicy.js` để Admin chỉnh sửa khung giá động mà không làm ảnh hưởng các lớp học đã xác nhận.

---

### 2.3. BĂNG — Frontend phi tài chính & QA Automation (Frontend / QA Lead)
- **Hiện trạng**: Đã xây dựng hoàn thiện toàn bộ khung giao diện Ant Design 6 + TailwindCSS cho 4 vai trò, 74 routes hoạt động trơn tru, build TypeScript đạt 100% không lỗi (3,355 modules).
- **Nhiệm vụ trọng tâm tiếp theo**:
  1. **Xây dựng UI cho phân hệ LMS Học tập (kết hợp với Backend của Châu)**:
     - Màn hình học sinh xem bài tập, upload file bài làm và xem điểm số (`/student/assignments`).
     - Màn hình học sinh làm bài test đầu vào và thi trắc nghiệm trực tuyến (`/student/assessments`).
     - Màn hình giáo viên giao bài tập, chấm điểm, nhận xét học sinh (`/teacher/assignments`).
  2. **Giao diện đối chiếu hồ sơ học bổng hai bản (AID-05)**:
     - Bổ sung tab kiểm tra mã vận đơn bưu điện và tick-box xác nhận bản cứng trên `ScholarshipApplicationReviewPage.tsx`.
  3. **Mở rộng Playwright Browser E2E**:
     - Viết thêm E2E tests cho luồng học sinh vào lớp học LiveKit, nộp bài tập và xem báo cáo chuyên cần.
  4. **Kiểm tra Responsive & Accessibility (QA-09)**:
     - Rà soát hiển thị trên thiết bị di động (Mobile viewport) và tối ưu hóa các bảng dữ liệu lớn.

---

### 2.4. BẢO — Security, eKYC, eContract & Quyền riêng tư (Security Architect)
- **Hiện trạng**: Đã cấu hình vững chắc Helmet CSP, Rate Limiting, xác thực JWT, phân quyền RBAC và hệ thống ký URL tải file bảo mật.
- **Nhiệm vụ trọng tâm cần hoàn thiện (P0/P1 Blocker)**:
  1. **Tích hợp giải pháp Hợp đồng điện tử FPT.eContract (TEA-09, TEA-10, TEA-11)**:
     - Tạo Model `TeacherContract.js` và `ContractSignature.js`.
     - Xây dựng quy trình gửi hợp đồng mẫu, giáo viên ký số, đại diện trung tâm đối soát và kích hoạt trạng thái `ACTIVE`.
     - Bổ sung gate kiểm tra `contractStatus === 'ACTIVE'` vào `teacherClassService.js` trước khi cho phép giáo viên tạo lớp.
  2. **Bảo vệ dữ liệu người thụ hưởng chưa thành niên (AID-07, AID-08)**:
     - Xây dựng Model `BeneficiaryPublicProfile.js` và `DataDisclosureConsent.js`.
     - Đảm bảo Sponsor chỉ xem bản tóm tắt hoàn cảnh đã che thông tin nhạy cảm (CCCD, địa chỉ, số điện thoại), hỗ trợ quyền thu hồi công bố của người giám hộ.
  3. **Khóa cổng hậu phát triển dev-login (SEC-01)**:
     - Rà soát `authMiddleware.js` để bảo đảm header `x-user-id` và `dev-<id>` bị vô hiệu hóa hoàn toàn khi chạy server môi trường thật.
  4. **Nghiên cứu giải pháp OCR hỗ trợ bóc tách giấy tờ (TEA-02, AID-03)**:
     - Lựa chọn nhà cung cấp eKYC/OCR phù hợp để hỗ trợ gợi ý điền form nộp hồ sơ CCCD/bằng cấp.

---

## 3. LỊCH TRÌNH VÀ PHỐI HỢP CÔNG VIỆC TRONG PHA A (SPRINT PLAN)

```
Tuần 1: Châu hoàn thiện Schemas & APIs cho LMS Bài tập + Bảo thiết kế Schema FPT.eContract
   ↓
Tuần 2: Băng dựng UI nộp bài tập & chấm điểm + Châu hoàn thiện logic chấm trắc nghiệm online
   ↓
Tuần 3: Bảo tích hợp Adapter FPT.eContract + Băng hoàn thiện UI duyệt hồ sơ giấy học bổng
   ↓
Tuần 4: Chạy hồi quy toàn bộ hệ thống (Jest + Build + Playwright) -> Bàn giao Pha B (Nghiệm thu SRS)
   ↓
Pha C: Tin chủ trì thiết lập hạ tầng VPS Staging, HTTPS và chuẩn bị Pilot payOS Kênh 1 & Kênh 2
```

