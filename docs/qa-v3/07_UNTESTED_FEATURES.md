# DANH MỤC CÁC TÍNH NĂNG CHƯA ĐƯỢC KIỂM THỬ HOẶC CHƯA TRIỂN KHAI
# DOCUMENT: 07_UNTESTED_FEATURES.md
# NHIỆM VỤ: EDUNITY-V3-FULL-INTEGRATION-AUDIT

> **Dự án**: EDUNITY V3 — Nền tảng Giáo dục Trực tuyến & Gây quỹ Học bổng  
> **Chủ nhiệm**: Principal Software Architect + QA Lead  
> **Chế độ**: STRICT READ-ONLY AUDIT  
> **Ngày lập báo cáo**: 11/11/2026  

---

## 1. TỔNG QUAN PHÂN LOẠI CÁC TÍNH NĂNG CHƯA KIỂM THỬ (UNTESTED CATEGORIES)

Qua quá trình rà soát chi tiết toàn bộ codebase, các tính năng chưa được kiểm thử toàn diện được phân thành 3 nhóm rõ rệt:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        PHÂN LOẠI CÁC TÍNH NĂNG CHƯA KIỂM THỬ                           │
└────────────────────────────────────────────────────────────────────────────────────────┘

  [ NHÓM 1: CHƯA CÓ SOURCE CODE (CAPABILITY GAP / MISSING) ]
  - Tính năng có trong SRS và Backlog 4 thành viên nhưng chưa được viết code trong repo.
  - Trạng thái kiểm thử: NOT RUN (Không có code để test).

  [ NHÓM 2: PHỤ THUỘC DỊCH VỤ NGOÀI THẬT (EXTERNAL DEPENDENCY GATED) ]
  - Tính năng đã hoàn thiện code và mock test, nhưng cần dịch vụ thật trên Staging HTTPS.
  - Bao gồm: payOS Live tiền thật, FPT.eContract API thật, LiveKit Cloud/Server thật.
  - Trạng thái kiểm thử: MOCK PASS / LIVE NOT RUN.

  [ NHÓM 3: BỊ ẢNH HƯỞNG BỞI MÔI TRƯỜNG TEST NỘI BỘ (ENVIRONMENT TEST DEGRADED) ]
  - Các test suite chạy đơn lẻ đạt PASS 100%, nhưng bị lỗi tranh chấp socket khi chạy song song.
  - Trạng thái kiểm thử: ISOLATED PASS / PARALLEL FAILED (Cần chạy tuần tự --runInBand).
```

---

## 2. CHI TIẾT DANH MỤC CÁC TÍNH NĂNG CHƯA ĐƯỢC KIỂM THỬ

### 2.1. Nhóm 1: Tính năng chưa có mã nguồn trong Repository (MISSING / NOT RUN)

| Mã tính năng | Module | Mô tả yêu cầu nghiệp vụ SRS | Thành viên phụ trách | Lý do chưa kiểm thử |
| :--- | :--- | :--- | :---: | :--- |
| **LMS-01** | Learning / LMS | Bài kiểm tra năng lực đầu vào (Placement Assessment) | Châu (BE) / Băng (FE) | Chưa tạo Model, Controller, Service và UI |
| **LMS-03 / 05** | Learning / LMS | Giao bài tập về nhà (Assignment), nộp bài (Submission) | Châu (BE) / Băng (FE) | Chưa có schema Mongoose lưu bài tập |
| **LMS-07** | Learning / LMS | Chấm điểm, phản hồi (Feedback) và thang điểm Rubric | Châu (BE) / Băng (FE) | Chưa có API chấm điểm và lịch sử sửa điểm |
| **LMS-08 / 09** | Learning / LMS | Thi trắc nghiệm online, ngân hàng câu hỏi (Question/Exam) | Châu (BE) / Băng (FE) | Chưa có bảng câu hỏi và logic tính điểm trắc nghiệm |
| **LMS-14 / 15** | Learning / LMS | Báo cáo tiến bộ học tập tổng hợp từ điểm số và chuyên cần | Châu (BE) / Băng (FE) | Chưa có service tổng hợp điểm số thực tế |
| **TEA-02** | Teacher KYC | Dịch vụ OCR hỗ trợ tự động bóc tách CCCD và bằng cấp | Bảo | Chưa tích hợp nhà cung cấp dịch vụ OCR |
| **TEA-09 / 10**| Teacher Contract | Hợp đồng điện tử FPT.eContract và adapter ký số | Bảo | Chưa tích hợp API FPT.eContract và webhook ký |
| **TEA-07** | Teacher Subject | Phân quyền môn dạy được cấp phép (SubjectAuthorization) | Châu | Class mới chỉ kiểm tra VERIFIED, chưa lọc môn |
| **AID-04 / 05**| Scholarship Aid | Quản lý biên nhận hồ sơ giấy (PaperDossierReceipt) | Châu (BE) / Băng (FE) | Chưa có model theo dõi mã bưu điện hồ sơ cứng |
| **AID-07 / 08**| Beneficiary PII| Hồ sơ người thụ hưởng công khai và thu hồi Consent | Bảo (Sec) / Băng (FE) | Chưa có cơ chế bảo vệ dữ liệu người chưa thành niên |
| **CUR-07** | Catalog Pricing | Chính sách giá khóa học linh hoạt theo phiên bản | Châu | Giá đang gắn cứng trực tiếp vào Course/Class |

---

### 2.2. Nhóm 2: Tính năng phụ thuộc Hạ tầng Staging và Dịch vụ Thật (PHASE C/D GATES)

| Hạng mục tích hợp | Hiện trạng trên Local | Điều kiện tiên quyết để kiểm thử thật | Kế hoạch kích hoạt |
| :--- | :--- | :--- | :--- |
| **payOS Live Tuition (Kênh 1)** | Đã test 100% Mock Adapter và Playwright E2E | Cần VPS Staging, Domain HTTPS, đăng ký Webhook URL trên payOS Portal | Kích hoạt tại **Pha D** (Diễn tập 5 giao dịch x 10.000đ) |
| **payOS Live Donation (Kênh 2)** | Đã test 100% Mock Adapter và Playwright E2E | Cần VPS Staging, Domain HTTPS, đăng ký Webhook URL trên payOS Portal | Kích hoạt tại **Pha D** (Diễn tập 5 giao dịch x 10.000đ) |
| **LiveKit Server Production Egress** | Đã test Room Token và Mock Webhook | Cần máy chủ LiveKit Server độc lập có cấu hình Egress ghi hình | Kích hoạt tại **Pha C/D** trên môi trường Staging |
| **FPT.eContract API Sandbox** | Chưa kết nối API | Cần hợp đồng đối tác và thông tin tài khoản Sandbox từ FPT | Chờ chính sách và tài khoản đối tác từ Ban Quản trị |

---

### 2.3. Nhóm 3: Kiểm thử tải và Concurrency trên Test Runner

| Hạng mục kiểm thử | Hiện trạng kiểm thử | Nguyên nhân kỹ thuật & Rủi ro | Giải pháp khuyến nghị |
| :--- | :--- | :--- | :--- |
| **Chạy đồng thời toàn bộ 28 Jest Suites** | 17/28 suites bị crash khi chạy song song (`npm test`) | `mongodb-memory-server` trên Windows gặp lỗi tranh chấp socket/port (`fassert failure`) khi 16 workers cùng khởi tạo `mongod.exe` | Bắt buộc chạy tuần tự bằng cờ `--runInBand` hoặc giới hạn `--maxWorkers=2` |
| **Kiểm thử chịu tải Webhook đồng thời (100 req/s)** | Đã test 2 và 10 webhook đồng thời trong unit test | Chưa đo lường hiệu năng khi có hàng nghìn học sinh cùng quét mã thanh toán vào giờ cao điểm | Cần kịch bản Stress Test bằng công cụ k6 hoặc Artillery trên Staging |
| **Kiểm thử phục hồi dữ liệu từ Backup (Disaster Recovery)** | Chưa thực hiện diễn tập khôi phục | Dự án chưa có kịch bản dump/restore cơ sở dữ liệu tự động | Bổ sung script backup định kỳ trong thư mục `BackEnd/scripts/` |

---

## 3. KẾT LUẬN & KIẾN NGHỊ CHO QA LEAD

1. **Không coi các tính năng Nhóm 1 là lỗi runtime**: Đây là các khoảng trống chức năng (Functional Gaps) chưa được triển khai trong mã nguồn, cần phân công cụ thể cho các thành viên phụ trách (Châu, Băng, Bảo) tiếp tục hoàn thiện trong **Pha A**.
2. **Chuẩn hóa lệnh chạy kiểm thử**: Bổ sung script `"test:ci": "jest --runInBand"` vào `BackEnd/package.json` để quy trình CI/CD và các kiểm thử viên không gặp lỗi crash do cạnh tranh tiến trình trên môi trường Windows.
3. **Duy trì tuyệt đối an toàn dữ liệu**: Tiếp tục khóa `PAYOS_ENABLED=false` và không mở cổng ra Internet cho đến khi toàn bộ các tính năng Nhóm 1 được bàn giao và nghiệm thu.

