# EDUNITY V3 — TÀI LIỆU TRIỂN KHAI CHUNG CHO NHÓM

> **Phiên bản:** 1.0 — ngày 06/11/2026  
> **Team Leader:** Tin  
> **Nhóm phát triển:** Tin — Băng — Bảo — Châu  
> **Mục đích:** Một tài liệu chung để thống nhất yêu cầu, công nghệ, dữ liệu, API, phân công, quy trình làm việc và nghiệm thu.  
> **Trạng thái:** Kế hoạch triển khai; không có nghĩa tất cả đầu việc bên dưới đều chưa có code. Mỗi người cần **đối chiếu với repo** trước khi sửa.

---

## 0. Đọc nhanh — những quyết định quan trọng nhất

1. **Tin làm toàn bộ Payment và tài chính**, bao gồm Backend, dữ liệu tài chính và **giao diện tài chính**: payOS, QR học phí, QR tài trợ, webhook, sổ cái, học bổng phần tiền, đối soát, rút tiền, hoàn tiền, xử lý giao dịch đến muộn. Châu **không phụ trách Payment**.
2. **Băng làm Frontend phi tài chính và E2E QA** cho cả bốn vai trò. Băng kiểm thử Payment nhưng **không tự chỉnh business logic Payment của Tin**.
3. **Bảo làm bảo mật, Auth/RBAC, eKYC/CCCD, hợp đồng FPT.eContract, dữ liệu riêng tư, xác minh giáo viên, bảo vệ LiveKit**.
4. **Châu làm Backend dữ liệu học thuật, giáo trình, giá khóa học theo cấu hình Admin, lớp/lịch, bài tập/kiểm tra/đánh giá và hồ sơ học bổng phi tài chính**.
5. **Giữ MongoDB/Mongoose của dự án hiện tại** để phát triển V3; không tự chuyển sang PostgreSQL hoặc xóa/seed lại DB đang có dữ liệu. Quyết định kiến trúc khác với khuyến nghị SRS gốc phải ghi nhận trong ADR.
6. Học trực tuyến nhúng ngay trên website dùng **LiveKit**, **không mặc định tích hợp Google Meet** chỉ vì tài liệu phân công cũ dùng cách gọi đó.
7. Thu tiền dùng **payOS Payment Link**, hiển thị **VietQR do payOS cung cấp**, QR học phí hết hạn sau **15 phút**, FE polling **khoảng 3 giây/lần**, xác nhận thành công chỉ bằng webhook/đối soát đáng tin trên **Backend**.
8. **Hồ sơ CCCD, bằng cấp, hoàn cảnh khó khăn của học sinh là dữ liệu riêng tư.** MTQ chỉ xem bản tóm tắt đã biên tập, được duyệt và có cơ sở cho phép công bố; không được truy cập ảnh scan hồ sơ gốc.
9. **Bắt đầu cả bốn nhánh cùng lúc**, nhưng phải cùng xuất phát từ một commit `dev` đã được tích hợp và ổn định. Mỗi module có một owner chịu trách nhiệm sửa chính.
10. **Jest PASS + Frontend build PASS chưa đủ để xem là hoàn tất**: mỗi luồng cần API/integration test, browser E2E, kiểm tra phân quyền; payOS/LiveKit/eKYC/eContract cần test staging thực tế khi có quyền truy cập dịch vụ.

### Nguồn tài liệu được hợp nhất

- `Edunity-SRS(2).md`: SRS gốc, phạm vi 4 vai trò, cấu trúc Course/Class/Session, Enrollment, Scholarship, 50 business rules.
- `Phan_chia_cong_viec_4_luong.docx`: phân chia Admin, Student, Teacher, Sponsor, mở rộng hợp đồng, LMS, học bổng và giám sát.
- `Edunity_Phan_Cong_Cong_Viec_4_Thanh_Vien.docx`: kế hoạch khắc phục lỗi cũ và phân công tổ chức.
- `EDUNITY_SRS_ADDENDUM_V3.md`: yêu cầu bổ sung do Team Leader trao đổi.
- `EDUNITY_V3_Checklist_4_Thanh_Vien.md`: backlog chi tiết **106 đầu việc**; bản phân công mới nhất Tin/Băng/Bảo/Châu.
- `Edunity.zip`: mã nguồn snapshot gửi để review, **không khẳng định đồng nhất với remote GitHub hiện tại**.
- Các quyết định của Team Leader về **12 câu hỏi** đã trả lời trong cuộc trao đổi ngày 06/11/2026; phân biệt phần đã quyết và phần cần chi tiết hóa ở mục 4.

---

## 1. Mục tiêu, phạm vi và nhóm người dùng

### 1.1. EDUNITY giải quyết bài toán gì?

EDUNITY là hệ thống dạy và học **trực tuyến trực tiếp** trên cùng một website, kết nối **Student — Teacher — Sponsor (MTQ) — Admin**, đồng thời quản lý học phí, học bổng và chất lượng đào tạo. Mục tiêu không chỉ gọi video: phải có chương trình/lộ trình chuẩn, lớp học, ghi danh, điểm danh, tài liệu, kiểm tra, báo cáo minh bạch và xử lý tài chính an toàn.

**Luồng học tập chuẩn:**

```text
Admin tạo Category/Subject/Course + SyllabusVersion + PricingPolicy
→ Giáo viên đã xác minh + hợp đồng hiệu lực + được duyệt môn
→ Tạo Class và Schedule / Session từ Course đã duyệt
→ Học viên xem học phí/lộ trình, đăng ký Class
→ FREE hoặc PAID (payOS) hoặc SCHOLARSHIP/MIXED
→ Enrollment CONFIRMED mới được Join LiveKit
→ Placement → Học trực tiếp → Attendance → Bài tập/Thi → Review
→ Chốt học bù và khiếu nại → Đối soát TeacherEarning → Payout
```

**Luồng tài trợ:**

```text
Admin tạo Campaign và tiêu chí → MTQ chọn ủng hộ → payOS QR
→ Webhook xác thực → Tiền quỹ được ghi nhận và đối soát
→ Student/Guardian nộp hồ sơ online + gửi hồ sơ giấy
→ Admin kiểm tra/đối chiếu → Scholarship Application được duyệt
→ Tin kiểm quỹ và cấp Scholarship → Dùng cho lớp phù hợp
→ MTQ theo dõi dòng tiền và kết quả hỗ trợ đã được phép công khai
```

### 1.2. Phạm vi theo vai trò

| Vai trò | Chức năng trọng tâm |
|---|---|
| **Admin** | Danh mục môn/khối lớp, lộ trình BASIC/INTERMEDIATE, chính sách giá theo khóa, duyệt syllabus ADVANCED, xác minh giáo viên, ký hợp đồng, học bổng, lịch/lớp, báo cáo tài chính, giám sát chất lượng, khiếu nại. |
| **Teacher** | Đăng ký KYC + bằng cấp + môn dạy + ngân hàng, ký eContract, tạo lớp trong phạm vi được duyệt, lên lịch, LiveKit, quản lý học viên, bài tập/thi/điểm, doanh thu và yêu cầu rút tiền. |
| **Student** | Tìm môn/khóa/lớp, xem lộ trình và học phí rõ ràng, placement khuyến nghị, ghi danh, payOS hoặc scholarship, học LiveKit, bài tập/tài liệu/thi, review sau buổi và cuối khóa, xin hỗ trợ. |
| **Sponsor / MTQ** | Chọn mức công khai thông tin, xem campaign, QR ủng hộ, lịch sử đóng góp, báo cáo quỹ, thông tin người hưởng lợi được biên tập và có quyền công bố. |
| **Quality Supervisor / Hội đồng giám sát (quyền bổ sung)** | Kiểm tra chất lượng buổi học, giáo trình, điểm số và bằng chứng sự cố đúng phạm vi; không mặc định truy cập KYC hay tài chính toàn hệ thống. |

### 1.3. Ưu tiên phạm vi

- **G0 — Nền tảng:** crosswalk SRS↔code, MongoDB schema/migration, API contract, Auth/RBAC, secrets, staging, smoke/E2E.
- **G1 — Quản trị đào tạo:** giáo trình, syllabus và giá, hồ sơ giáo viên, eKYC, hợp đồng, giới hạn quyền dạy, hồ sơ hỗ trợ hai bản.
- **G2 — Tài chính và minh bạch:** payOS, scholarship/mixed, quỹ tài trợ, thu/chi, settlement/payout, refund/reconciliation.
- **G3 — Quá trình học tập:** placement, giáo án/tài liệu, giao/nộp/chấm bài, kiểm tra, điểm, đánh giá sau Session và Class, tiến bộ học tập.
- **G4 — AI (sau):** gợi ý tài liệu/giáo án, hỗ trợ phân tích chất lượng; SRS gốc **chưa coi AI Tutor/AI Matching là MVP**. Không ưu tiên AI hơn các luồng G0–G3.

---

## 2. Kiến trúc và công nghệ cần sử dụng

> Phân biệt **[HIỆN CÓ]** (xác nhận từ `Edunity.zip` → `BackEnd/package.json`, `FrontEnd/package.json`), **[TÍCH HỢP MỚI]** và **[ĐỀ XUẤT]** (cần nhóm chọn/kiểm chứng). Không được xem công nghệ [ĐỀ XUẤT] là package đã cài.

### 2.1. Stack hiện có trong ZIP

| Lớp | Công nghệ | Hiện trạng / mục đích |
|---|---|---|
| Backend runtime | **Node.js, JavaScript, Express 5** | [HIỆN CÓ] REST APIs, controllers, services, routes. |
| Cơ sở dữ liệu | **MongoDB + Mongoose 9** | [HIỆN CÓ] Document models, indexes, session/transaction cho nghiệp vụ đa collection. |
| Frontend | **React 19 + TypeScript + Vite 8** | [HIỆN CÓ] Web App nhiều role, SPA. |
| UI | **Ant Design 6, Tailwind CSS 3, @ant-design/icons** | [HIỆN CÓ] Form, bảng, modal, responsive. |
| Router | **React Router 7** | [HIỆN CÓ] Role routes / protected navigation. |
| API fetching | **TanStack React Query 5** | [HIỆN CÓ] Request, cache, query invalidation, polling. |
| Client state | **Zustand 5** | [HIỆN CÓ] State giao diện, auth/client transient state; không thay thế kiểm soát quyền Backend. |
| Lớp học video | **LiveKit Server SDK, livekit-client, @livekit/components-react** | [HIỆN CÓ] Room, token, participant, classroom UI; cần test LiveKit thật. |
| Xác thực / bảo vệ | **jsonwebtoken, helmet, cors, express-rate-limit** | [HIỆN CÓ] Auth, security headers, rate limiting; Bảo kiểm tra triển khai thực tế. |
| Upload | **multer**, storageService | [HIỆN CÓ] Upload xử lý server; cần kho private và quyền xem có hạn. |
| Background job | **node-cron 4** | [HIỆN CÓ] Expire seat hold và session lifecycle; phải có concurrency/idempotency. |
| Backend test | **Jest 30, Supertest 7, mongodb-memory-server 11** | [HIỆN CÓ] Unit/API/integration với dữ liệu giả. |
| FE lint/build | **oxlint, TypeScript compiler, Vite** | [HIỆN CÓ] Kiểm tra static/build, chưa thay thế UI E2E. |
| Git workflow | **Git, GitHub, Pull Request, nhánh `dev`** | [ĐÃ THỐNG NHẤT CÁCH LÀM] Xác minh trạng thái branch thực tế trước khi tạo nhánh. |

**Các thành phần có sẵn đáng tái sử dụng:** `Enrollment`, `Payment`, `Transaction`, `Scholarship`, `ScholarshipUsage`, `TeacherEarning`, `SponsorContribution`, `Session`, `SessionAttendance`, `SessionPresenceInterval`, `TeacherIncidentReport`, `SessionRefundReview`, `VerificationDocument`, v.v. **Không tạo collection trùng chỉ vì SRS V3 đặt tên mới.**

### 2.2. Công nghệ / dịch vụ mới cần tích hợp

| Nhu cầu | Công nghệ / lựa chọn | Trạng thái / lưu ý |
|---|---|---|
| Thu học phí và tài trợ QR | **payOS Payment Link + VietQR** | [TEAM LEADER ĐÃ CHỌN] Tin tích hợp, lấy QR/checkout từ Backend, nhận webhook xác thực. Không hard-code ngân hàng. |
| Hợp đồng giáo viên | **FPT.eContract** | [TEAM LEADER ĐÃ CHỌN] Bảo làm adapter, quy trình gửi/ký/kiểm trạng thái; cần quyền API/sandbox và rà soát chữ ký hợp lệ. |
| OCR + xác minh chính thức CCCD | **Dịch vụ eKYC/OCR có khả năng xác minh** | [YÊU CẦU ĐÃ CHỐT, VENDOR CHƯA CHỌN] OCR chỉ gợi ý điền; phải có bước xác minh chính thức theo provider và đối chiếu hợp lệ. |
| File CCCD/bằng cấp/hồ sơ | **Private object storage + signed URLs + mã hóa** | [ĐỀ XUẤT] Chọn backend lưu trữ tương thích hệ thống đang dùng, không mở public URL, kiểm MIME/magic bytes. |
| Gửi mail hợp đồng/thông báo | **Email transactional (SMTP/provider API)** | [CẦN CHỐT] Email mời ký, trạng thái KYC, Payment, Enrollment, payout. |
| Browser E2E | **Playwright** | [ĐỀ XUẤT] Chưa thấy trong FE `package.json` snapshot; cài/cấu hình test runner và driver khi triển khai. |
| API contract | **OpenAPI 3.x + JSON schema / tài liệu thống nhất** | [ĐỀ XUẤT] Thống nhất request/response, auth, enum, error, idempotency giữa 4 người trước khi tích hợp. |
| Audit / logging | **AuditLog có sẵn + structured logging có che PII** | [CẦN MỞ RỘNG] Không log raw CCCD, token, webhook secret, bằng cấp hay hồ sơ nghèo. |
| Task queue mở rộng | **Job durable + DB lock; cân nhắc Redis/BullMQ** | [ĐỀ XUẤT NẾU CẦN] Chưa xem là bắt buộc; node-cron hiện có nhưng multi-instance cần chống xử lý trùng. |
| CI / Staging | **GitHub Actions hoặc CI đang có; môi trường dev/staging riêng** | [ĐỀ XUẤT] Backend tests, FE build, E2E và kiểm tra migration trước merge. |

### 2.3. Quy tắc kỹ thuật chung

- **Backend quyết định business rule**; Frontend chỉ hiển thị/validate cơ bản. Không cấp quyền học bằng query params, ảnh biên lai, localStorage hay tự chỉnh trạng thái từ FE.
- MongoDB ghi đa collection liên quan tiền/quỹ/capacity phải dùng **transaction hợp lệ với deployment**, unique index/idempotency/CAS và kiểm tra race. Dùng đơn vị VNĐ nguyên khi giao tiếp payOS; mapping sang kiểu lưu hiện tại (`Decimal128` nếu schema dùng) có kiểm chứng, không làm toán tiền bằng floating-point thiếu kiểm soát.
- **Giờ lịch học và thời gian payout** phải dùng IANA timezone `Asia/Ho_Chi_Minh`; timestamp thực lưu UTC/ISO chuẩn, chuyển đổi khi hiển thị.
- API phân trang, filter, snapshot và error shape nhất quán; thay đổi enum cũ phải có bảng mapping, migration và test ngược.
- **Không dùng `.env` thật, file upload thật, số CCCD thật trong commit/seed/test artifact**. Bản ZIP được gửi có thể chứa `.env` → không phát tán ZIP nguyên bản lên nhóm công khai.
- Nghiêm cấm seed xóa rộng (`deleteMany({})`) trên database đã có dữ liệu. Chỉ dùng `edunity_demo_v3` riêng, preflight, backup, restore và seed idempotent.

---

## 3. Các yêu cầu nghiệp vụ đã thống nhất

### 3.1. Admin quản lý lộ trình học và giá

1. Giữ chuỗi **Category → Subject → Course → Class → Session** của SRS gốc.
2. Admin/trung tâm chuẩn hóa giáo trình **BASIC → INTERMEDIATE** theo môn, lớp, phiên bản sách, chương/bài, mục tiêu và số buổi.
3. Giáo viên có thể gửi **ADVANCED SyllabusProposal** và giá đề xuất; chỉ được sử dụng sau khi Admin duyệt. Cần lưu lịch sử ai duyệt, khi nào, lý do và version.
4. **Admin chỉnh được giá trực tiếp từ trang quản lý khóa học** bằng `CoursePricingPolicy`/phiên bản policy. Ví dụ Toán 8 cơ bản **17–23 buổi, học phí 1.400.000–1.600.000 VNĐ/học viên** là ví dụ ban đầu, **không áp cứng cho mọi môn BASIC**.
5. Thay đổi giá/syllabus **không áp ngược lên lớp/Enrollment đã chốt**: lưu `priceSnapshot`, `syllabusVersionId`, `commissionPolicyVersion` (phần commission do Tin sở hữu).
6. Cần theo dõi trùng lịch, học bù, số buổi đã dạy, sức chứa và lịch học cá nhân.

### 3.2. Teacher onboarding, hợp đồng và quyền mở lớp

1. Form nhiều bước: thông tin cá nhân (họ tên, giới tính, giấy tờ định danh, ngày/nơi cấp, địa chỉ/cư trú), học vấn/bằng cấp, môn dự định dạy, tài khoản ngân hàng nhận thù lao. Chỉ thu trường cần thiết, bảo vệ chặt chẽ.
2. OCR hỗ trợ điền + **xác minh CCCD chính thức** qua provider được chọn. Giáo viên phải kiểm tra và xác nhận lại dữ liệu, không coi OCR là xác minh pháp lý.
3. Admin duyệt hồ sơ và **môn/khối lớp được phép dạy**, có luồng từ chối/yêu cầu bổ sung, cập nhật bằng cấp.
4. Sau duyệt, hệ thống gửi **FPT.eContract**; giáo viên ký, đại diện có thẩm quyền ký/xác nhận; **chỉ mở lớp khi hồ sơ verified, contract ACTIVE, subject authorization hợp lệ**.
5. Danh mục khóa học của giáo viên chỉ hiện môn/khối lớp đã đăng ký hoặc được duyệt theo chính sách; Backend chặn truy cập môn ngoài quyền kể cả gọi API trực tiếp.
6. Hệ thống tái xác minh/đánh giá giáo viên định kỳ; chưa tự động trừ thu nhập hoặc chấm dứt hợp đồng chỉ vì bộ đếm vi phạm.
7. Ngân hàng nhận thù lao phải có cơ chế đối chiếu chủ tài khoản khớp danh tính giáo viên, không để giáo viên sửa lén tài khoản hưởng tiền.

### 3.3. Lớp học online LiveKit, điểm danh, sự cố (TIN-05D/E)

- Phòng chờ mở **trước 10 phút**; học viên tham gia lần đầu tối đa **sau giờ bắt đầu 20 phút**; quá hạn chỉ cho reconnect nếu trước đó đã thực sự kết nối LiveKit hợp lệ.
- Đi muộn nếu vào lớp lần đầu **trễ hơn 5 phút** so với giờ bắt đầu; đủ điều kiện điểm danh dựa trên hiện diện **>=70%** thời lượng học dự kiến, hợp nhất các khoảng online không trùng. Không tính thời gian phòng chờ trước giờ học.
- Giáo viên chưa vào lớp: ngưỡng cảnh báo **10 phút (yellow)**, **20 phút (red)**, tự hủy no-show theo policy **30 phút**; nếu giáo viên gián đoạn kéo dài thì học sinh không bị chấm ABSENT do lỗi giáo viên.
- Không tự kết thúc lớp khi giáo viên vẫn đang giảng dạy sau giờ dự kiến; kiểm soát recording/egress theo presence thật, hỗ trợ nhiều segment và retry/an toàn.
- Session sự cố cần incident evidence, xác minh của Admin, kế hoạch **makeup/reschedule** và **refund review**, tuyệt đối không coi review là đã hoàn tiền thật.
- SRS gốc chưa mô tả chi tiết tất cả rule TIN-05D/E, cần bổ sung phụ lục và test.

### 3.4. Student: quá trình học và kiểm tra năng lực

- **Bài kiểm tra đầu vào là khuyến nghị**, không chặn đăng ký hoặc vào lớp vì chưa làm/điểm thấp. Teacher/Center dùng kết quả để phân nhóm/chọn giáo án phù hợp.
- Có tài liệu theo Course/Class/Session, bài tập tham khảo, giao/nộp/chấm bài tập về nhà, đề thi/quiz, kết quả, lịch sử sửa điểm và báo cáo tiến bộ.
- Sau **mỗi Session** học viên có thể đánh giá giáo viên; cuối **Class** đánh giá tổng kết riêng. Chống spam/trùng review, có kênh phản ánh sự cố và kiểm soát quyền xem.
- Nhắn tin Teacher–Student là tính năng bổ sung/tùy chọn theo ưu tiên kế hoạch, bảo đảm quyền truy cập theo lớp.

### 3.5. Hồ sơ học bổng: hai bản, quyền duyệt và công bố

- Student/người giám hộ tạo hồ sơ **bản mềm** trên hệ thống; có thông tin trường, lớp, hoàn cảnh, giấy tờ xác minh theo tiêu chí Campaign.
- Đồng thời nộp **bản cứng** về trung tâm; hệ thống ghi mã hồ sơ, lịch sử nhận, đối chiếu hai bản, yêu cầu bổ sung và kết quả xét duyệt.
- Team Leader đề cập hồ sơ CCCD, chứng nhận hộ nghèo, thông tin cư trú, bằng cấp nếu có. Cần **rà soát loại giấy tờ nào thật sự phải chứng thực/công chứng theo quy định áp dụng**; không bắt buộc sổ hộ khẩu giấy đã hết giá trị sử dụng.
- Khi Admin duyệt, phần **phi tài chính** (trạng thái hồ sơ, xác thực giấy tờ) thuộc **Châu/Bảo**; phần **kiểm quỹ, allocation, balance, usage, hoàn quỹ** thuộc **Tin**.
- Trung tâm giữ bản gốc bảo mật. Sponsor chỉ thấy **BeneficiaryPublicProfile** (thông tin cơ bản, khó khăn, thành tích/bảng điểm/giấy xác nhận đã che dữ liệu nhạy cảm và được phép công bố); không xem raw CCCD, địa chỉ/số điện thoại cá nhân, giấy khai sinh hay dữ liệu người thứ ba.
- Cần luồng đồng ý riêng của học sinh/người giám hộ khi pháp luật áp dụng, có lịch sử đồng ý và khả năng thu hồi công bố. Không mặc định mọi giấy tờ của mọi học sinh đều public.

### 3.6. Payment / QR / Scholarship / Sponsor — Tin chịu trách nhiệm

1. **payOS** tạo Payment Link và **VietQR** với số tiền, mã đơn hàng/đối soát, thời hạn **15 phút** cho học phí; Frontend polling Backend **~3 giây/lần** khi màn hình đang mở, có timeout/backoff hợp lý.
2. **Webhook đã xác minh mới là nguồn xác nhận chính**; không dựa vào ảnh chụp giao dịch, status tự gửi từ FE hoặc redirect checkout. Xử lý retry/duplicate/out-of-order, đối chiếu số tiền, mã đơn, tài khoản nhận và event duy nhất.
3. SRS cũ có FREE, DIRECT, SCHOLARSHIP, MIXED: **PAID chỉ được CONFIRMED khi tổng tiền đã xác thực + ScholarshipUsage hoàn tất đúng học phí**, không tạo earning trùng khi callback lặp.
4. Seat hold **15 phút**, hết hạn giải phóng chỗ; với MIXED phải hoàn `ScholarshipUsage` đang giữ đúng một lần nếu không được thanh toán.
5. **QR hết hạn nhưng ngân hàng ghi nhận giao dịch thành công muộn vẫn phải ghi nhận tiền**, tạo trạng thái đối soát thích hợp. Team Leader muốn **cộng Xu**, nhưng **chưa chốt tỷ lệ Xu/VNĐ, mục đích dùng Xu, hoàn/rút Xu, ledger/tax/accounting và tác động BR-49**. Vì vậy **chưa bật tự động cộng Xu thật**, không tự mở lại Enrollment quá hạn nếu không có rule an toàn đã duyệt.
6. Sai mã chuyển tiền/thiếu/thừa tiền/chuyển muộn/không ghép được đơn hàng: tạo `PaymentReconciliation`/support ticket, thông báo trung tâm; **không cấp quyền học sai**.
7. Sponsor chia sẻ Campaign lên Facebook → người xem nhấn Ủng hộ → payOS QR → webhook → `Contribution` verified → ledger nhận quỹ → báo cáo minh bạch có kiểm soát.
8. Học bổng có quota/scope/quỹ; học viên chỉ dùng cho lớp hợp lệ; Teacher Earning tính trên **gross Class.price**, tách nguồn scholarship và co-payment trên sổ cái, không phát tiền mặt trực tiếp cho học viên.
9. Teacher hoàn tất toàn bộ **học bù và khiếu nại ảnh hưởng thu nhập**, rồi mới bắt đầu **7 ngày đối soát**. Quy tắc tính ngày lịch/ngày làm việc cần được viết rõ trước khi phát lệnh tiền thật.
10. Yêu cầu rút tiền **thứ Hai 08:00–17:00 giờ Việt Nam**; trả tiền dự kiến **thứ Sáu**; không đánh dấu `PAID` khi mới gửi lệnh, cần xác nhận thực chuyển tiền. Cách xử lý ngày lễ, cuối kỳ chờ văn bản quy định cuối cùng.
11. Refund/reversal/payout cần **review, audit, idempotency, reconciliation** và trạng thái hoàn chỉnh; không tự động trừ/hoàn tiền vì incident hoặc vi phạm giáo viên nếu chưa có policy.

### 3.7. Hội đồng giám sát

- Theo chỉ đạo mới: giám sát **chất lượng buổi học, giáo trình, điểm số và đánh giá của giáo viên**; có quyền xem bằng chứng liên quan theo nhiệm vụ, ghi nhận kiến nghị và AuditLog.
- **Không đồng nhất Hội đồng giám sát chất lượng với đơn vị độc lập đối soát quỹ tài trợ.** Đơn vị/đầu mối đối soát quỹ là vấn đề tổ chức riêng, chưa xác lập đối tác cụ thể.

---

## 4. Quyết định của Team Leader — đã chốt và còn cần chi tiết hóa

| # | Nội dung | Kết luận vận hành | Ghi chú |
|---:|---|---|---|
| 01 | Khung giá/số buổi | Admin tự quyết giá theo khóa học, có màn hình điều chỉnh. | Ví dụ Toán 8 chỉ là mẫu; cần policy version/effective date/snapshot. |
| 02 | Mốc 7 ngày đối soát | Sau **mọi học bù và khiếu nại liên quan được đóng**. | Cần xác định 7 ngày lịch hay ngày làm việc. |
| 03 | Lịch payout | Nhận yêu cầu rút **thứ Hai 08–17h**, mục tiêu xử lý **thứ Sáu**. | Cần quy tắc ngày lễ/cutoff và điều kiện xác nhận đã trả. |
| 04 | Hợp đồng điện tử | Chọn **FPT.eContract**. | Cần sandbox/API + xác định hình thức ký/chứng cứ ký hợp lệ. |
| 05 | OCR và lưu hồ sơ | Cần **xác minh CCCD chính thức**; định hướng lưu hồ sơ giáo viên đến **1 năm sau khi nghỉ**. | Chưa chọn eKYC vendor; thời hạn từng loại giấy tờ có thể phải dài hơn theo luật, hồ sơ tài trợ cần chính sách riêng. |
| 06 | Bản giấy / chứng thực | Hồ sơ căn cước, xác nhận hộ nghèo, cư trú, bằng cấp nếu có. | Rà soát loại giấy tờ cần chứng thực pháp lý, không bắt nộp hộ khẩu giấy bất hợp lệ. |
| 07 | Public hồ sơ người hưởng lợi | Trung tâm giữ bản gốc; MTQ xem **bản công bố chọn lọc** gồm hoàn cảnh, chứng nhận, bảng điểm phù hợp. | Redaction, consent, guardian, audit/revoke là bắt buộc. |
| 08 | Thu tiền | **payOS + VietQR**, webhook, 15 phút, FE polling ~3 giây, tiền vào tài khoản liên kết payOS. | Lỗi tạo ticket trung tâm, không nhập cứng tài khoản ngân hàng trên FE. |
| 09 | Payment muộn BR-49 | Team Leader muốn ghi nhận tiền và **cộng Xu** nếu QR hết hạn. | **Chưa chốt định nghĩa Xu và hệ quả tài chính**, không triển khai tự động đến khi có policy. |
| 10 | Syllabus nâng cao | Admin duyệt; syllabus/giá **không thay ngầm của lượt đã ghi danh**. | Giá tối đa và thang phê duyệt do Admin cấu hình sau. |
| 11 | Placement / Review | Placement **khuyến nghị**, điểm thấp **không chặn học**. | Cần định nghĩa ai thấy kết quả, review ẩn danh tới đâu nếu triển khai. |
| 12 | Hội đồng giám sát | Giám sát **buổi học, điểm số, giáo trình giáo viên**. | RBAC và privacy bắt buộc; không mặc định được xét duyệt/chi quỹ. |

**Không khóa các module đang có thể phát triển trước:** xây adapter sandbox, schema, API, UX, test giả lập; chỉ khóa hành vi **chuyển tiền thật, tự động cộng Xu, công khai giấy tờ, ký hợp đồng thật** đến khi hoàn tất chính sách/đối tác/quyền pháp lý.

---

## 5. Phân chia công nghệ và quyền sở hữu module

| Owner | Phạm vi sửa chính | Công nghệ / module | Đầu ra cần bàn giao |
|---|---|---|---|
| **Tin (Leader)** | Payment backend **và giao diện tài chính**, Ledger, Scholarship money, Contribution, Settlement, Payout, Refund | Node.js/Express/Mongoose, payOS API/webhooks, VietQR, React/TS, React Query, Jest/Supertest, Mongo transactions | API tài chính, UI QR/admin finance/teacher payout, schema migration tài chính, test idempotency/race, hướng dẫn sandbox. |
| **Băng** | FE **phi tài chính** cho Admin/Student/Teacher/Sponsor + browser E2E | React 19, TypeScript, Vite, Ant Design, Tailwind, React Router, React Query, Zustand; Playwright (đề xuất bổ sung) | Form hoàn chỉnh, guard giao diện, tích hợp API, video/screenshot e2e, báo cáo bug. |
| **Bảo** | Auth/RBAC, eKYC, giấy tờ riêng tư, teacher verification, FPT.eContract, LiveKit security, consent | Express middleware, JWT, Mongo security/audit, file private storage, FPT.eContract, eKYC provider cần chọn, LiveKit Server SDK, Jest/Supertest | Adapter định danh/hợp đồng, security gates, permission matrix, private file API, test IDOR/security. |
| **Châu** | Backend học thuật + DB **phi tài chính**, Syllabus, Price policy, Class/Schedule, LMS, Scholarship paper/soft dossier | Node.js/Express, MongoDB/Mongoose, node-cron, file services, Jest/Supertest, OpenAPI contract | Academic APIs/models, migration, fixture học thuật, tài liệu giáo trình, LMS tests, class rule guard. |

**Owner chính không có nghĩa người khác không được review.** Các module hợp nhất chỉ thông qua PR có reviewer của owner. Đặc biệt: Tin sở hữu `Payment`, `Transaction`, `TeacherEarning`, `ScholarshipUsage` và ledger; Châu không sửa schema tiền nếu chưa tạo đề xuất được Tin duyệt. Châu sở hữu dữ liệu học thuật; Tin nhận **snapshot đã xác nhận từ API**, không sửa Course/Class vì payment convenience. Bảo sở hữu Auth/RBAC/contract gates; Băng không dùng chỉ frontend guard để thay backend authorization.

### 5.1. Ranh giới file dựa trên snapshot mã nguồn

> Là **điểm xuất phát**, không phải danh sách độc quyền cứng; luôn đối chiếu repo HEAD mới nhất.

| Nhóm | File/Module gợi ý | Quy tắc phối hợp |
|---|---|---|
| Tin | `BackEnd/src/services/paymentService.js`, `scholarshipPaymentService.js`, `contributionService.js`, `financeService.js`, `settlementService.js`, `BackEnd/src/models/Payment.js`, `Transaction.js`, `TeacherEarning.js`, `ScholarshipUsage.js`; FE `features`/`paymentAdapters.ts` liên quan tiền. | Chỉ Tin merge logic tính tiền; Bảo security review. |
| Băng | `FrontEnd/src/features/**` phi tài chính, `FrontEnd/src/api/**Adapters.ts` phi tài chính, `routes`, `components`, browser e2e. | Chia route/page theo role, không thay API contract một chiều. |
| Bảo | `BackEnd/src/middlewares/**`, `authTokenService.js`, `teacherVerificationService.js`, `storageService.js`, KYC/contract mới, `videoProvider.js` phần token/room permission. | Phải bảo toàn LiveKit presence/attendance của Class/Session. |
| Châu | `BackEnd/src/models/Category.js`, `Subject.js`, `Course.js`, `Class.js`, `Session.js`, `services/courseCatalogService.js`, `teacherClassService.js`, `catalogService.js`, thêm academic/LMS models. | `Session`/`Enrollment` có chồng lấn nghiệp vụ; cần owner đồng duyệt khi sửa. |
| Chung / đặc biệt | `BackEnd/src/models/User.js`, `Enrollment.js`, `ScholarshipApplication.js`, `app.js`, `index.js`, `FrontEnd/src/routes/**` | Tạo PR nhỏ, trao đổi API/model schema trước, không 4 người cùng chỉnh tự do. |

---

## 6. Database V3 — thiết kế và nguyên tắc migration

### 6.1. Giữ model cũ và mở rộng tối thiểu

**[ĐÃ CÓ trong ZIP]** Các model/luồng chính: User, Category, Subject, Course, CourseProposal, Class, Session, SessionAttendance, Enrollment, Payment, Transaction, TeacherEarning, ScholarshipCampaign, SponsorContribution, ScholarshipApplication, Scholarship, ScholarshipUsage, Message/Conversation, Review, AuditLog, Report, Notification, các model vi phạm/session make-up/refund.

**[ĐỀ XUẤT — phải mapping với model cũ]**:

| Nhóm | Models/fields cần xem xét | Owner |
|---|---|---|
| Giáo trình | `SyllabusVersion`, `SyllabusProposal`, `CurriculumUnit`, `CoursePricingPolicy`, snapshot giá/version | Châu |
| Giáo viên | `TeacherIdentityRecord`, `TeacherQualification`, `TeacherSubjectAuthorization`, `ReverificationCycle` | Bảo (KYC), Châu (subject authorization) |
| Hợp đồng | `TeacherContract`, `ContractSignature`, version mẫu, evidence/hash, provider status | Bảo |
| Ngân hàng | `TeacherBankAccount` có bảo vệ dữ liệu | Bảo model/rights, Tin sử dụng qua API payout |
| Hồ sơ giấy | `PaperDossierReceipt`, checklist giấy tờ theo Campaign | Châu |
| Công bố/đồng ý | `BeneficiaryPublicProfile`, `DataDisclosureConsent` | Bảo |
| Payment | `PaymentIntent`, provider webhook log, `PaymentReconciliation`, settlement/refund states | Tin |
| Tài trợ | `ContributionIntent`, fund ledger/reconciliation | Tin |
| Thù lao | `TeacherSettlement`, `PayoutRequest`, `PayoutBatch` | Tin |
| Ví Xu | `WalletAccount`, `WalletLedger` **chỉ ở mức dự phòng** | Tin, CHỜ CHỐT POLICY |
| LMS | **ĐÃ LOẠI BỎ KHỎI PHẠM VI (TEAM_APPROVED)** — Toàn bộ mã nguồn, model, API LMS-only đã xóa an toàn | Châu (đã dọn dẹp) |
| Chất lượng | `Review` (Class Review), `TeacherContractReviewPacket` (TEA-16), `TeachingQualityReport` (SPO-07). `SessionReview` đã loại bỏ | Châu |
| Cấu hình | `PlatformSetting` versioned (giá/giữ chỗ/hoa hồng/giờ payout) | Châu phụ trách đào tạo, Tin sở hữu cấu hình tài chính |

### 6.2. Ràng buộc bắt buộc

- Không trùng Enrollment active trên cùng `(studentId, classId)`; giữ chỗ hết hạn phải được giải phóng nhất quán, không vượt sức chứa.
- Payment/Contribution có mã/transaction reference độc nhất; webhook replay không tăng quỹ/tiền/teacher earnings thêm lần nữa.
- `Scholarship.remainingAmount` không âm; sử dụng `RESERVED`/`CONFIRMED`/`RELEASED` hiện hành phải **mapping rõ** với `RESERVED`/`COMPLETED`/`CANCELLED` trong SRS, không đổi enum vội.
- Mọi bản ghi tiền có nguồn, đối tượng, trạng thái, currency, timestamps và audit; không xóa payment completed, không đoán backfill bằng số tiền bằng nhau.
- Giá, syllabus và commission phải lưu snapshot/phiên bản khi học viên ghi danh để đổi policy không sửa quá khứ.
- Lịch dùng timezone đúng; attendance dựa trên LiveKit trusted presence, không nhận heartbeat/client event làm chứng cứ duy nhất.
- Hồ sơ gốc KYC/Student tách khỏi public profile và phân quyền cụ thể; file private không truy cập chỉ bằng ObjectId.

### 6.3. Chú ý từ lần review ZIP trước

1. `BackEnd/scripts/seed.js` có `deleteMany({})` trên collections quan trọng — **không chạy trên DB đang sử dụng**.
2. `BackEnd/src/utils/settings.js` hiện mới là `Temporary mock implementation` đọc environment, chưa phải `PlatformSetting` thật.
3. `paymentService.js` xử lý thanh toán muộn lệch nhánh BR-49 trong SRS; nay đã có mong muốn cộng Xu nhưng policy vẫn thiếu.
4. Payment cần kiểm tra unique active attempts/concurrency trước khi tạo index trên dữ liệu có sẵn.
5. SRS ban đầu khuyến nghị PostgreSQL; code ZIP thực dùng MongoDB/Mongoose — ghi nhận bằng quyết định kiến trúc, không đổi engine tự phát.

**Quy trình migration an toàn:** read-only audit → backup → schema mapping → kiểm trùng/thiếu index → dry-run → migration forward → validate quan hệ/tổng tiền → test rollback → deploy staging → E2E. Không hard reset collection hoặc sửa trực tiếp dữ liệu production.

---

## 7. Hợp đồng tích hợp giữa bốn người

**Trước khi hoàn thiện từng giao diện, Backend owner phải công bố API contract**: method/path, authorization, request payload, response envelope, enum, status/error, idempotency, pagination, timestamps. Frontend không tự đặt field/status và Backend không đổi response âm thầm.

### 7.1. Ranh giới nghiệp vụ liên quan nhau

| Luồng tích hợp | API/data do ai sở hữu? | Kết quả phải thống nhất |
|---|---|---|
| Course/Class → Checkout | Châu sở hữu `Class` giá + syllabus snapshot; Tin sở hữu Payment/enrollment financial transitions | Tin chỉ dùng giá server-snapshot do backend trả, không tin giá FE gửi lên. |
| Teacher Verified → Create Class | Bảo sở hữu verification/contract; Châu sở hữu create class | Class API kiểm tra verification + active contract + subject authorization trước khi tạo. |
| Scholarship Application → Allocate | Châu quản lý hồ sơ; Bảo bảo mật/consent; Tin quản lý quỹ | Application approved chưa có nghĩa tiền đã cấp nếu fund allocation chưa thành công. |
| Session/Attendance → Settlement | Châu/Session services phát trạng thái hoàn tất; Tin xác nhận lock settlement | Không chốt earning khi còn makeup, khiếu nại tài chính mở. |
| payOS → QR UI | Tin sở hữu payment FE + BE; Băng chạy E2E cross-role | QR chỉ chờ, tiền thành công do Backend xác thực. |
| Sponsor Transparency | Tin cung cấp ledger/aggregate; Bảo cung cấp public profile; Băng hiển thị | Không trả raw giấy tờ/dữ liệu liên hệ người hưởng lợi. |
| LiveKit → Attendance/Incidents | Bảo quản lý token/room security; Châu quản lý academic service; Tin chỉ đọc dữ liệu settled | Không phá các ngưỡng TIN-05D/E và quyền học đã chốt. |

### 7.2. Chuẩn payload nên thống nhất (minh họa, CHƯA phải API đang tồn tại)

```json
{
  "success": true,
  "data": {
    "id": "string",
    "status": "PENDING_PAYMENT",
    "createdAt": "2026-11-06T10:00:00.000Z"
  },
  "message": ""
}
```

- Phải **kiểm tra response hiện hành** trước khi chọn dạng này; không áp đại trà nếu gây breaking change.
- Các mã nghiệp vụ như `PAYMENT_EXPIRED`, `ENROLLMENT_FULL`, `TEACHER_CONTRACT_REQUIRED`, `SCHOLARSHIP_INSUFFICIENT`, `JOIN_WINDOW_CLOSED` nên thống nhất format và HTTP status.
- Model/schema/enum mới phải được review chéo, đặc biệt tại các điểm `Enrollment`, `User`, `Scholarship`, `Session`, `PlatformSetting`.

---

## 8. Git và quy trình làm song song

### 8.1. Nhánh và pull request

Từ **cùng base commit trên `dev` đã sạch và được tích hợp**, tạo nhánh:

```text
main               (release / production khi đã nghiệm thu)
└── dev             (nhánh tích hợp)
    ├── feature/v3-payment-tin
    ├── feature/v3-ui-bang
    ├── feature/v3-security-bao
    └── feature/v3-academic-chau
```

**Trước khi tạo nhánh:** `git fetch origin`, `git status`, kiểm tra nhánh có merge dang dở hay code chưa push; không giả định lịch sử được đóng trong ZIP là remote mới nhất.

**Lệnh tham khảo khi working tree sạch và dev đã đúng base:**

```bash
git fetch origin
git switch dev
git pull --ff-only origin dev
git switch -c feature/v3-academic-chau
# Từng người tự thay tên nhánh của mình
```

- Mỗi PR chỉ làm một cụm tính năng rõ ràng, có link task và kèm test/evidence.
- Không commit `.env`, credentials, token, ảnh CCCD thật, dữ liệu người học thật hoặc `node_modules`.
- Trước khi merge: Backend unit/integration, FE build/lint và E2E liên quan PASS; reviewer của module đồng ý.
- **Không** dùng `git add .` khi đang có thay đổi lẫn từ nhóm khác; không tự `reset --hard`, `rebase` hoặc `push --force` lên nhánh chung để giải conflict.
- Tin chịu trách nhiệm PR integration và quyết định merge vào `dev`, **không cần xin phép một Team Leader khác**.

### 8.2. Quy trình cập nhật công việc

1. Mỗi task dùng mã duy nhất (ví dụ `FIN-03`, `CUR-07`, `TEA-12`, `LMS-08`).
2. Cập nhật file checklist Excel dùng chung: **Chưa làm → Đang làm → Chờ nghiệm thu → Hoàn thành**; trạng thái **Bị chặn** khi thiếu API/chính sách/provider.
3. Chỉ tích **[x]** khi có PR, test/evidence, API/UI phù hợp, không còn bug blocker. Code có sẵn nhưng chưa đối chiếu → **Chờ xác minh**, không tự nhận 100%.
4. Mỗi người báo cáo ngắn: `(mã task) – tình trạng – link PR – test đã chạy – blocker – phụ thuộc người khác`.
5. Họp tích hợp kỹ thuật khi đổi model chung; không tự sửa file do owner khác quản lý.

---

## 9. Kiểm thử, bảo mật và điều kiện nghiệm thu

### 9.1. Ba tầng kiểm thử bắt buộc

- **Tầng 1 — Unit/Mongoose validation:** model enum, snapshot, unique constraints, mapping state, các hàm tính tiền; Jest.
- **Tầng 2 — Backend integration/API:** Supertest + MongoDB test instance/replica phù hợp, idempotency, concurrent callbacks, role/ownership, upload; không mock hết mọi đường nghiệp vụ tài chính.
- **Tầng 3 — Browser E2E và provider staging:** Playwright cho Admin/Student/Teacher/Sponsor, LiveKit thực nếu đã cấu hình, payOS sandbox/test, FPT.eContract sandbox, OCR/eKYC test environment, luồng khôi phục khi mạng chập chờn.

### 9.2. Kịch bản nghiệm thu bắt buộc

- [ ] Admin tạo syllabus BASIC, sửa giá/version và xác minh học viên cũ vẫn giữ snapshot.
- [ ] Teacher nộp hồ sơ, eKYC, Admin duyệt, FPT contract ký đầy đủ, tạo Class đúng môn; thử API bypass phải FAIL.
- [ ] Học viên FREE đăng ký, JOIN LiveKit hợp lệ, attendance đúng cả trường hợp late/reconnect.
- [ ] PAID QR 15 phút, webhook valid → một Payment/Transaction/Earning, callback duplicate không tăng thêm.
- [ ] PAID QR hết hạn trước khi thanh toán, giao dịch đến muộn → tiền được ghi nhận/đối soát an toàn, không auto cấp quyền hoặc Xu khi policy chưa chốt.
- [ ] Scholarship FULL và MIXED: reserve, co-payment, expire, refund balance, quỹ không âm, capacity không vượt.
- [ ] Teacher hủy/no-show, makeup, incident, refund review, điểm danh học sinh không bị phạt sai.
- [ ] Đối soát khóa học sau makeup/complaints, 7 ngày, request thứ Hai 08–17, payout thứ Sáu theo lịch đã được ban hành.
- [ ] Sponsor đóng góp qua link Facebook/QR, webhook verified, số dư quỹ và dashboard đúng, không leak student PII.
- [ ] Student làm placement, homework, exam, nhận điểm, review sau Session và cuối Class.
- [ ] Kiểm thử 4 role không truy cập được dữ liệu cross-user (IDOR); file CCCD/giấy tờ chỉ mở có authorization và signed URL.
- [ ] Backup/restore staging thành công; seed demo không sửa DB thật.

### 9.3. Release gates

- Không còn **P0/P1 chưa xử lý** trong luồng ra mắt.
- Backend tests và FE build/lint PASS, E2E 4 role có **minh chứng**.
- LiveKit join/recording/webhook test với provider thật hoặc ghi rõ **NOT VERIFIED**.
- payOS/FPT/eKYC được kiểm chứng trong sandbox/contract test; chưa test thật thì đánh dấu **INTEGRATION NOT VERIFIED**.
- Đối chiếu sổ tiền/capacity/scholarship đạt điều kiện nhất quán; permission và retention rõ ràng.
- Có tài liệu vận hành: cấu hình env **chỉ tên biến**, onboarding team, migration/rollback, backup/restore, xử lý webhook lỗi, hỗ trợ thanh toán.

---

## 10. Cấu hình môi trường và cách chạy (không chia sẻ secrets)

### 10.1. Cấu hình hiện có trong code ZIP

`BackEnd/src/config/env.js` có validation các biến: `NODE_ENV`, `CORS_ORIGIN`, `JWT_SECRET`, `FILE_URL_SECRET`, `PAYMENT_WEBHOOK_SECRET`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `ROOM_TOKEN_SECRET` (fallback khi không có LiveKit). `BackEnd/src/config/db.js` dùng `MONGODB_URI`.

Tại V3 cần thêm **cấu hình payOS**, nhà cung cấp FPT.eContract, eKYC, email, private storage tùy API của từng nhà cung cấp. **Tên biến mới phải do owner thiết kế thống nhất trong `.env.example`**; không tự đoán tên biến/tự hard-code key trong Frontend và không dùng chung secret giữa dev/staging/prod.

### 10.2. Chạy local (theo scripts đã thấy trong snapshot)

```bash
# Terminal 1
cd BackEnd
npm ci           # cần package-lock.json khớp package.json
npm run dev      # nodemon src/server.js

# Terminal 2
cd FrontEnd
npm ci
npm run dev      # Vite dev server

# Backend test
cd BackEnd
npm test -- --runInBand

# Frontend build
cd FrontEnd
npm run build
```

Lưu ý: `npm ci` chỉ chạy khi có lockfile hợp lệ. Dùng **Node.js phiên bản tương thích** với những package trong repo và đồng bộ phiên bản qua `.nvmrc`/engines được nhóm chốt; không tự chọn bản runtime theo suy đoán. Cần cấu hình `.env` riêng ở từng máy và service tương ứng.

---

## 11. Checklist 106 công việc được giao — copy trực tiếp sang GitHub / Excel

> **Cách tích:** `[ ]` = chưa nghiệm thu; `[x]` = có mã PR + test + được review. Toàn bộ để `[ ]` theo mặc định để tránh giả vờ code hiện tại chưa tồn tại hay đã hoàn tất. Owner cần xác minh những tính năng đã triển khai trong repo và cập nhật bằng chứng.

## Tin — 26 đầu việc

### G0 · G0 — Nền tảng & DB

- [ ] **G0-01** — Đối chiếu toàn bộ SRS gốc + V3 + code + API; lập ma trận tính năng _(ưu tiên P0; tiêu chí: Có danh sách đã có/chưa có/sai hợp đồng theo file)_
### G2 · G1/G2 — Học bổng & hồ sơ giấy

- [ ] **AID-06** — Tài chính khi duyệt Scholarship: nhận hồ sơ APPROVED từ Châu, kiểm quỹ và cấp phát an toàn _(ưu tiên P1; tiêu chí: Allocation theo policy, giao dịch audit, không vượt quỹ)_
- [ ] **AID-10** — Báo cáo quỹ đã cấp/đã dùng/số người hỗ trợ, đối soát dòng tiền và ledger _(ưu tiên P1; tiêu chí: Số liệu đối chiếu ledger và trạng thái thực)_
### G2 · G2 — QR, tài chính & rút tiền

- [ ] **FIN-01** — Tích hợp payOS Payment Link/VietQR 15 phút, tham chiếu duy nhất, API tạo trạng thái _(ưu tiên P0; tiêu chí: QR tạo không làm Enrollment CONFIRMED)_
- [ ] **FIN-02** — UI QR học phí, đếm ngược và trạng thái chờ thanh toán _(ưu tiên P1; tiêu chí: Có retry, expiry, hiển thị lỗi và bảo vệ chống fake success)_
- [ ] **FIN-03** — Xác thực chữ ký webhook payOS + idempotency + đối chiếu tài khoản nhận từ cấu hình server _(ưu tiên P0; tiêu chí: Chỉ tiền được xác nhận thật mới đổi trạng thái Payment)_
- [ ] **FIN-04** — BankTransferEvent + PaymentReconciliation cho thiếu/thừa/sai nội dung _(ưu tiên P0; tiêu chí: Sai lệch vào hàng đợi, không tự mở quyền học)_
- [ ] **FIN-05** — Đối soát idempotency Payment, Transaction, Enrollment, TeacherEarning _(ưu tiên P0; tiêu chí: Không sinh earnings/ledger trùng khi webhook lặp)_
- [ ] **FIN-06** — Chốt và triển khai payment đến muộn sau Enrollment EXPIRED: tiền vào ledger, không auto cấp quyền; ví Xu chờ policy _(ưu tiên P0; tiêu chí: Không tự khôi phục/hoàn tiền khi chưa thống nhất)_
- [ ] **FIN-07** — API quản lý giao dịch/đối soát/hoàn phí cho Admin _(ưu tiên P1; tiêu chí: Có bộ lọc, audit, trạng thái, tránh double refund)_
- [ ] **FIN-08** — UI Admin theo dõi Payment, sai lệch giao dịch, refund review _(ưu tiên P1; tiêu chí: Chỉ Admin có quyền được thao tác)_
- [ ] **FIN-09** — Test scholarship full/mixed và giữ chỗ 15 phút; hoàn reservation _(ưu tiên P0; tiêu chí: Hủy/expire trả đúng quỹ và capacity)_
- [ ] **FIN-10** — TeacherSettlement chốt đủ khóa và 7 ngày đối soát _(ưu tiên P1; tiêu chí: Không mở payout khi còn học bù/tranh chấp theo rule)_
- [ ] **FIN-11** — Payout thứ Hai 08–17h, đối soát đủ 7 ngày; batch thứ Sáu; xử lý ngày lễ chờ policy _(ưu tiên P1; tiêu chí: Không hiện PAID chỉ vì gửi lệnh thanh toán)_
- [ ] **FIN-12** — Kiểm tra tài khoản ngân hàng trùng chủ thể, kiểm soát thay đổi _(ưu tiên P1; tiêu chí: Có lịch sử, đối soát, chống sửa đích nhận tiền trái phép)_
- [ ] **FIN-13** — Teacher rút tiền / Admin duyệt batch, theo dõi trạng thái _(ưu tiên P1; tiêu chí: UI chỉ cho yêu cầu đúng kỳ, có lý do ON_HOLD/FAILED)_
- [ ] **FIN-14** — Liên thông refund review TIN-05E với payment reconciliation _(ưu tiên P1; tiêu chí: Chỉ admin duyệt; không hoàn phí tự động)_
- [ ] **FIN-15** — ContributionIntent tạo QR tài trợ theo Campaign _(ưu tiên P1; tiêu chí: Mỗi intent có mã riêng, không tính quỹ khi chưa nhận tiền)_
- [ ] **FIN-16** — Ledger quỹ: received/reserved/allocated/used/refunded _(ưu tiên P0; tiêu chí: Số dư khớp ledger, không âm, không double count)_
- [ ] **FIN-17** — API/quy trình bên thứ ba đối soát quỹ và đối chiếu sổ ngân hàng _(ưu tiên P1; tiêu chí: Phân tách người duyệt và người đối soát)_
- [ ] **FIN-18** — API báo cáo Sponsor: khoản đóng góp, phân bổ, kết quả quỹ _(ưu tiên P1; tiêu chí: Chỉ trả dữ liệu được phép công bố)_
- [ ] **FIN-19** — Stress test callback trùng, đồng thời, muộn, partial success _(ưu tiên P0; tiêu chí: Không tăng quỹ/doanh thu sai dù nhiều worker)_
### G2 · G2 — Nhà tài trợ & giám sát

- [ ] **SPO-04** — UI QR tài trợ, nhận webhook payOS và biên nhận: Tin thực hiện trọn luồng tài chính _(ưu tiên P1; tiêu chí: Không thông báo thành công trước webhook xác thực)_
- [ ] **SPO-05** — Dashboard tài chính tài trợ và số học viên hỗ trợ; Tin triển khai dữ liệu + UI tài chính _(ưu tiên P1; tiêu chí: Thông tin cá nhân người học được tối thiểu hóa)_
### G2 · Nghiệm thu & vận hành

- [ ] **QA-08** — Đối soát test toàn chuỗi tiền/học bổng/earning/refund _(ưu tiên P0; tiêu chí: Sổ cân bằng và không có giao dịch nhân đôi)_
### G0 · Nghiệm thu & vận hành

- [ ] **QA-10** — Release checklist, PR integration, CI gates, docs API/migration _(ưu tiên P0; tiêu chí: Không merge/push production nếu các gate chưa đạt)_

---

---

## Băng — 26 đầu việc

### G0 · G0 — Nền tảng & DB

- [ ] **G0-11** — Thiết lập smoke/E2E 4 role và kịch bản dữ liệu test độc lập _(ưu tiên P0; tiêu chí: Chạy được browser E2E với test account cô lập)_
### G1 · G1 — Giáo trình & lớp

- [ ] **CUR-04** — Giao diện Admin biên soạn và duyệt syllabus có phiên bản _(ưu tiên P1; tiêu chí: Tạo nháp, review, publish và xem lịch sử)_
- [ ] **CUR-06** — Giao diện Teacher đề xuất syllabus và Admin duyệt _(ưu tiên P1; tiêu chí: Hiển thị rõ phiên bản, giá, lý do và tiến độ duyệt)_
- [ ] **CUR-08** — Giao diện Admin chỉnh chính sách giá; Student xem giá rõ ràng _(ưu tiên P1; tiêu chí: Hiển thị theo học viên/cả khóa, số buổi, ngoại lệ)_
- [ ] **CUR-12** — Catalog/Lớp: hiển thị lộ trình, học phí, số buổi, lịch, mục tiêu _(ưu tiên P1; tiêu chí: Trang chi tiết đầy đủ cho Student/Teacher)_
### G1 · G1 — Giáo viên & hợp đồng

- [ ] **TEA-03** — Form onboarding Teacher nhiều bước: cá nhân, bằng cấp, môn dạy, ngân hàng _(ưu tiên P1; tiêu chí: Lưu nháp và tiếp tục, xem trạng thái upload)_
- [ ] **TEA-06** — Giao diện Admin duyệt Teacher và yêu cầu bổ sung tài liệu _(ưu tiên P1; tiêu chí: Nộp lại sau REJECTED và các trạng thái hiển thị rõ)_
- [ ] **TEA-08** — Danh mục Teacher lọc chỉ môn được đăng ký/duyệt _(ưu tiên P1; tiêu chí: Danh mục rõ ràng, backend vẫn enforce RBAC)_
- [ ] **TEA-11** — Giao diện Teacher ký hợp đồng/Admin ký xác nhận _(ưu tiên P1; tiêu chí: Theo dõi hợp đồng đã gửi/đã ký/đang hiệu lực)_
- [ ] **TEA-14** — Giao diện khai thông tin tài khoản nhận thù lao trong onboarding; Bảo bảo vệ dữ liệu, Tin dùng qua API _(ưu tiên P1; tiêu chí: Thông tin hiển thị masked và bước kiểm tra)_
### G1 · G1/G2 — Học bổng & hồ sơ giấy

- [ ] **AID-02** — Form Student xin hỗ trợ nhiều bước kèm giấy tờ, xác nhận _(ưu tiên P1; tiêu chí: Lưu nháp, nộp, bổ sung và xem tiến độ)_
- [ ] **AID-05** — Màn hình Admin tiếp nhận/đối chiếu hồ sơ giấy và online _(ưu tiên P1; tiêu chí: Ghi nhận người nhận, thời điểm, kết quả)_
### G2 · G1/G2 — Học bổng & hồ sơ giấy

- [ ] **AID-09** — Sponsor view chỉ đọc hồ sơ công bố đã duyệt _(ưu tiên P1; tiêu chí: Không truy cập hồ sơ xác minh thô)_
### G2 · G2 — Nhà tài trợ & giám sát

- [ ] **SPO-02** — Giao diện Sponsor profile công khai tùy chọn _(ưu tiên P2; tiêu chí: Từng tùy chọn mặc định private)_
- [ ] **SPO-03** — Trang chia sẻ Campaign lên Facebook có CTA Ủng hộ ngay _(ưu tiên P1; tiêu chí: Share link đúng campaign, preview phù hợp)_
- [ ] **SPO-08** — Giao diện Admin/Supervisor quỹ, học bổng và hồ sơ sự cố _(ưu tiên P2; tiêu chí: Có queue xử lý phân quyền và audit hành động)_
### G3 · G3 — Học tập, bài tập, đánh giá (LMS — ĐÃ LOẠI BỎ KHỎI PHẠM VI DỰ ÁN)

- [x] **LMS-02** — UI Student làm placement / Teacher tạo và xem kết quả — `REMOVED_FROM_SCOPE — TEAM_APPROVED`
- [x] **LMS-04** — Trang giáo án, tài liệu, bài tham khảo cho Student/Teacher — `REMOVED_FROM_SCOPE — TEAM_APPROVED`
- [x] **LMS-06** — UI giao bài, nộp bài, xem feedback và hạn nộp — `REMOVED_FROM_SCOPE — TEAM_APPROVED`
- [x] **LMS-09** — UI tạo đề, thi online, kết quả, review bài thi — `REMOVED_FROM_SCOPE — TEAM_APPROVED`
- [x] **LMS-11** — UI đánh giá giảng viên sau buổi và cuối khóa — `REMOVED_FROM_SCOPE — TEAM_APPROVED`
- [x] **LMS-15** — UI tiến bộ học tập Student và kết quả nhóm cho Teacher/Admin — `REMOVED_FROM_SCOPE — TEAM_APPROVED`
### G3 · Nghiệm thu & vận hành

- [ ] **QA-03** — Browser E2E Student → Enroll → Join → Homework → Review _(ưu tiên P0; tiêu chí: Kịch bản cross-role chạy được trên Staging)_
### G1 · Nghiệm thu & vận hành

- [ ] **QA-04** — Browser E2E Teacher KYC → Contract → Class → Incident _(ưu tiên P0; tiêu chí: Không có bước bypass; ghi nhận trace)_
### G2 · Nghiệm thu & vận hành

- [ ] **QA-05** — Browser E2E QR payment + scholarship + Sponsor Donate (Băng test độc lập, Tin sửa lỗi tài chính) _(ưu tiên P0; tiêu chí: Các trạng thái pending/success/error chính xác)_
### G3 · Nghiệm thu & vận hành

- [ ] **QA-09** — Kiểm thử UI responsive, accessibility, lỗi kết nối, loading _(ưu tiên P2; tiêu chí: 4 vai trò thao tác được trên desktop/mobile)_

---

---

## Bảo — 20 đầu việc

### G0 · G0 — Nền tảng & DB

- [ ] **G0-06** — Lập ma trận RBAC + quyền sở hữu + phân vùng dữ liệu nhạy cảm _(ưu tiên P0; tiêu chí: API không lộ giấy tờ và dữ liệu khác chủ thể)_
- [ ] **G0-07** — Mã hóa, private upload, signed URL, retention và audit truy cập giấy tờ _(ưu tiên P0; tiêu chí: Test file giả, IDOR, truy cập quá hạn và xóa theo policy)_
- [ ] **G0-09** — Chuẩn hóa audit log cho duyệt hồ sơ, giao dịch và quản trị _(ưu tiên P0; tiêu chí: Lưu ai làm, khi nào, thay đổi gì, không lộ bí mật)_
- [ ] **G0-12** — Chuẩn hóa Staging: MongoDB riêng, env/secrets, LiveKit và webhook demo _(ưu tiên P0; tiêu chí: Staging tách production; có healthcheck và smoke test)_
### G1 · G1 — Giáo viên & hợp đồng

- [ ] **TEA-01** — Thiết kế TeacherIdentityRecord và bảo vệ CCCD/hộ khẩu/địa chỉ _(ưu tiên P0; tiêu chí: Lưu private, hạn chế quyền, không ghi log PII)_
- [ ] **TEA-02** — Dịch vụ OCR hỗ trợ điền CCCD/bằng cấp, có bước sửa/đối chiếu _(ưu tiên P1; tiêu chí: OCR không tự đánh dấu danh tính đã được xác minh)_
- [ ] **TEA-04** — Private document upload cho bằng cấp và giấy tờ Teacher _(ưu tiên P0; tiêu chí: Kiểm MIME/magic bytes/dung lượng/quyền xem)_
- [ ] **TEA-05** — Admin verify thông tin cá nhân, bằng cấp, lịch sử duyệt/từ chối _(ưu tiên P1; tiêu chí: Không thể bỏ qua bước verify; có lý do review)_
- [ ] **TEA-09** — TeacherContract/ContractSignature và mẫu hợp đồng phiên bản _(ưu tiên P1; tiêu chí: Có state machine hợp đồng, file hash, audit)_
- [ ] **TEA-10** — Tích hợp email mời ký và đối tác ký điện tử, xác nhận chữ ký _(ưu tiên P1; tiêu chí: Không coi checkbox/ảnh chữ ký là chữ ký hợp lệ mặc định)_
- [ ] **TEA-12** — Contract gate: verified + active contract + môn duyệt mới được mở lớp _(ưu tiên P0; tiêu chí: Cả API và UI chặn mở lớp khi thiếu điều kiện)_
- [ ] **TEA-13** — TeacherBankAccount mã hóa và đối chiếu tên chủ tài khoản _(ưu tiên P1; tiêu chí: Không công khai số tài khoản, không trả raw PII)_
### G2 · G1 — Giáo viên & hợp đồng

- [ ] **TEA-15** — Theo dõi tái xác minh/đánh giá định kỳ giáo viên _(ưu tiên P2; tiêu chí: Có lịch nhắc và quy trình review, không auto phạt)_
### G1 · G1/G2 — Học bổng & hồ sơ giấy

- [ ] **AID-03** — OCR giấy tờ Student + bảo vệ dữ liệu người chưa thành niên _(ưu tiên P0; tiêu chí: OCR chỉ gợi ý; quyền giám hộ và consent rõ)_
- [ ] **AID-07** — BeneficiaryPublicProfile đã biên tập và giới hạn công bố _(ưu tiên P0; tiêu chí: Không công khai CCCD/địa chỉ/số điện thoại/bản scan)_
- [ ] **AID-08** — DataDisclosureConsent và quyền rút lại đồng ý của người giám hộ _(ưu tiên P0; tiêu chí: Thu hồi công khai, bảo toàn lịch sử đối soát)_
### G2 · G2 — Nhà tài trợ & giám sát

- [ ] **SPO-01** — Tùy chọn Sponsor công khai/ẩn danh theo consent riêng _(ưu tiên P1; tiêu chí: Có chức năng thu hồi công khai)_
- [ ] **SPO-06** — Vai trò đối soát độc lập/hội đồng giám sát và permission guard _(ưu tiên P1; tiêu chí: Không mặc định được xem toàn bộ hồ sơ cá nhân)_
### G1 · Nghiệm thu & vận hành

- [ ] **QA-02** — LiveKit thật Staging: join, reconnect, recording, egress, webhook _(ưu tiên P0; tiêu chí: Có video evidence/test log và quyền role đúng)_
- [ ] **QA-06** — Pen-test cơ bản RBAC, IDOR, file, webhooks, CSRF, JWT _(ưu tiên P0; tiêu chí: Chứng minh dữ liệu nhạy cảm không bị lộ)_

---

---

## Châu — 34 đầu việc

### G0 · G0 — Nền tảng & DB

- [ ] **G0-02** — Lập inventory Mongoose models, quan hệ, indexes, enum và trạng thái _(ưu tiên P0; tiêu chí: Có ERD và schema mapping không tạo collection trùng)_
- [ ] **G0-03** — Thiết kế migration forward/backward và preflight dữ liệu cho schema V3 _(ưu tiên P0; tiêu chí: Có kế hoạch dry-run/backup/rollback không xóa dữ liệu)_
- [ ] **G0-04** — Seed fixture dữ liệu học tập phi tài chính V3; Tin cung cấp seed tài chính sandbox độc lập _(ưu tiên P1; tiêu chí: Seed idempotent, không xóa DB thật, quan hệ nhất quán)_
- [ ] **G0-05** — PlatformSetting về chính sách đào tạo/giá theo phiên bản; phần COMMISSION_RATE Tin sở hữu _(ưu tiên P1; tiêu chí: Có cài đặt mặc định an toàn và quản trị theo quyền)_
- [ ] **G0-08** — Rà soát cron/queue, tính idempotent, retry, lock theo DB _(ưu tiên P1; tiêu chí: Worker đa instance không ghi nhận trùng)_
- [ ] **G0-10** — Dẫn dắt API contract toàn dự án: Châu soạn schema học tập, Tin chốt Payment API, Bảo chốt Security _(ưu tiên P0; tiêu chí: Có hợp đồng API được 4 owner đọc và kiểm tra)_
### G1 · G1 — Giáo trình & lớp

- [ ] **CUR-01** — Mở rộng Category/Subject/Course theo khối lớp, trình độ, sách/chương trình tham chiếu _(ưu tiên P1; tiêu chí: Giữ quan hệ Category → Subject → Course)_
- [ ] **CUR-02** — Thiết kế SyllabusVersion/CurriculumUnit và trạng thái publish _(ưu tiên P1; tiêu chí: Version đã publish không sửa ngầm)_
- [ ] **CUR-03** — API Admin tạo/sửa lộ trình BASIC và INTERMEDIATE _(ưu tiên P1; tiêu chí: Mục tiêu, bài học, tài liệu và buổi dự kiến hợp lệ)_
- [ ] **CUR-05** — Teacher gửi SyllabusProposal ADVANCED; Admin duyệt/trả về _(ưu tiên P1; tiêu chí: Đề xuất không được tự publish khi chưa duyệt)_
- [ ] **CUR-07** — CoursePricingPolicy do Admin điều chỉnh; không thay đổi giá/syllabus của lớp đã xác nhận _(ưu tiên P1; tiêu chí: Giữ ví dụ Toán 8 BASIC riêng; override cần duyệt)_
- [ ] **CUR-09** — Snapshot syllabusVersion và học phí trên Class/Enrollment _(ưu tiên P0; tiêu chí: Giáo trình/giá cũ không đổi cho lượt ghi danh đã chốt)_
- [ ] **CUR-10** — Ràng buộc Class theo Course, quyền môn dạy và giá đã duyệt _(ưu tiên P0; tiêu chí: Teacher không tạo lớp ngoài môn/khung giá)_
- [ ] **CUR-11** — Kiểm tra trùng lịch Teacher/Class và đồng bộ Schedule → Session _(ưu tiên P1; tiêu chí: Không tạo buổi trùng và không sai timezone)_
### G1 · G1 — Giáo viên & hợp đồng

- [ ] **TEA-07** — TeacherSubjectAuthorization theo môn, khối lớp, trình độ _(ưu tiên P1; tiêu chí: Có trạng thái PENDING/APPROVED/SUSPENDED và index)_
- [ ] **TEA-16** — Đối chiếu TIN-05E cảnh báo, sự cố, uy tín, hồ sơ xem xét hợp đồng _(ưu tiên P1; tiêu chí: Không trừ tiền hoặc chấm dứt hợp đồng tự động)_
### G1 · G1/G2 — Học bổng & hồ sơ giấy

- [ ] **AID-01** — Mở rộng ScholarshipApplication theo checklist Campaign và người giám hộ _(ưu tiên P1; tiêu chí: Dữ liệu tối thiểu theo từng chương trình, không gom quá mức)_
- [ ] **AID-04** — PaperDossierReceipt: mã hồ sơ, gửi bưu điện, nhận, đối chiếu bản cứng _(ưu tiên P1; tiêu chí: Admin biết hồ sơ đủ cả bản giấy và mềm)_
### G2 · G2 — Nhà tài trợ & giám sát

- [ ] **SPO-07** — Báo cáo chất lượng giảng dạy, vi phạm giáo viên và khiếu nại cho Admin _(ưu tiên P1; tiêu chí: Báo cáo có truy vết, đúng quyền, không auto phạt)_
### G3 · G3 — Học tập, bài tập, đánh giá (LMS — ĐÃ LOẠI BỎ KHỎI PHẠM VI DỰ ÁN)

> **QUYẾT ĐỊNH TOÀN ĐỘI (TEAM_APPROVED):** Phạm vi LMS (Learning Resources, Assignments, Submissions, Grades, Assessments, Placements, Progress Reviews, Class Messaging) đã chính thức được loại bỏ hoàn toàn khỏi Edunity V3 theo thỏa thuận thống nhất của nhóm phát triển. Toàn bộ mã nguồn, route, service, controller, model và test suite LMS-only đã được dọn sạch an toàn. Hệ thống tập trung tối đa vào Quản lý Lớp học, Buổi học trực tuyến LiveKit, Điểm danh, Đối soát chất lượng và Quyết toán tài chính.

- [x] **LMS-01** — Assessment PLACEMENT đầu vào theo Class/Course/Syllabus — `REMOVED_FROM_SCOPE — TEAM_APPROVED`
- [x] **LMS-03** — LearningResource/Tài liệu học và quyền truy cập file — `REMOVED_FROM_SCOPE — TEAM_APPROVED`
- [x] **LMS-05** — Assignment + Submission + deadline + file upload — `REMOVED_FROM_SCOPE — TEAM_APPROVED`
- [x] **LMS-07** — Grade/Feedback, rubric và lịch sử chấm điểm — `REMOVED_FROM_SCOPE — TEAM_APPROVED`
- [x] **LMS-08** — Assessment, Question, Attempt và chấm trắc nghiệm/tự luận — `REMOVED_FROM_SCOPE — TEAM_APPROVED`
- [x] **LMS-10** — Review Teacher sau mỗi Session và cuối Class — `REMOVED_FROM_SCOPE — TEAM_APPROVED` _(Ghi chú: Đã loại bỏ SessionReview riêng lẻ; Giữ nguyên Class Review cốt lõi qua Review schema)_
- [x] **LMS-12** — Teacher đánh giá quá trình và tiến bộ Student theo quyền — `REMOVED_FROM_SCOPE — TEAM_APPROVED`
- [x] **LMS-13** — Messaging Student–Teacher trong Class (tùy chọn) — `REMOVED_FROM_SCOPE — TEAM_APPROVED` _(Ghi chú: Giữ nguyên Direct 1-1 Messaging an toàn)_
- [x] **LMS-14** — Tổng hợp kết quả học tập, tiến bộ và attendance cho dashboard — `REMOVED_FROM_SCOPE — TEAM_APPROVED`
### G0 · Nghiệm thu & vận hành

- [ ] **QA-01** — Hồi quy Session 05D/E: pre-open 10p, join 20p, online, attendance 70% (bảo trì từ code Tin) _(ưu tiên P0; tiêu chí: Có test webhook mất/trùng và auto-close đúng rule)_
- [ ] **QA-07** — Backup/restore và migration thử nghiệm trên DB clone _(ưu tiên P0; tiêu chí: Có log khôi phục và thời gian phục hồi kiểm chứng)_
### G4 · G4 — AI (ĐÃ LOẠI BỎ KHỎI PHẠM VI DỰ ÁN)

- [x] **AI-01** — Đánh giá AI hỗ trợ gợi ý tài liệu cho Student — `REMOVED_FROM_SCOPE — TEAM_APPROVED`
- [x] **AI-02** — AI hỗ trợ giáo viên soạn giáo án, câu hỏi, bài tập — `REMOVED_FROM_SCOPE — TEAM_APPROVED`
- [x] **AI-03** — AI báo cáo tổng hợp Admin và giám sát chất lượng — `REMOVED_FROM_SCOPE — TEAM_APPROVED`
- [x] **AI-04** — AI tổng hợp báo cáo tác động nhà tài trợ — `REMOVED_FROM_SCOPE — TEAM_APPROVED`

---

**Lưu ý:** Các mục phụ thuộc nhà cung cấp thật, tiền thật, hồ sơ định danh hoặc quyết định chưa hoàn tất chỉ triển khai ở mức an toàn đến khi chính sách được xác nhận.

---


---

## 12. Các deliverables bắt buộc cuối mỗi giai đoạn

| Giai đoạn | Mỗi owner phải bàn giao | Người tổng hợp |
|---|---|---|
| G0 | `schema-map`, API contract, DB migration plan, permission matrix, staging guide, smoke E2E baseline | Tin |
| G1 | PR syllabus/pricing, hồ sơ teacher/hợp đồng, UI onboarding, hồ sơ scholarship 2 bản, test contract gate | Tin |
| G2 | payOS QR/webhook, ledger/contribution, mixed scholarship, settlement/payout, financial UI và test reconciliation | Tin |
| G3 | LearningResource/Assignment/Assessment/Review, FE tương ứng, E2E học tập, quality dashboard | Châu + Băng |
| G4 | AI feasibility note, data privacy/usage policy, thử nghiệm có tách dữ liệu và đánh giá quality | Tin điều phối |

**Bàn giao tối thiểu cho mỗi task:** mô tả yêu cầu đã triển khai, file/code thay đổi, bản cập nhật API, migration nếu có, cách chạy test, bằng chứng kết quả, nguy cơ/giới hạn và PR link.

## 13. Những điểm chưa được phép suy diễn / chưa triển khai tiền thật

- **Ví Xu:** chưa rõ quy đổi, được chi cho dịch vụ nào, quy trình hoàn/rút, sổ kế toán, thời hạn. Chỉ thiết kế sơ bộ, chưa tự động cộng tiền.
- **Ngày nghỉ / ngày lễ / 7 ngày đối soát:** phải có văn bản quy định cuối cùng trước payout production.
- **FPT.eContract:** provider đã chọn; cần tài khoản/API docs/sandbox và phương thức ký hợp lệ của hợp đồng cụ thể.
- **eKYC:** yêu cầu xác minh chính thức đã chốt, **chưa chọn vendor**.
- **Dữ liệu trẻ em và hồ sơ giấy:** cần kiểm tra đồng ý hợp lệ, thời hạn lưu từng loại, redaction, chứng thực và thủ tục quyền thu hồi.
- **Giá ADVANCED:** admin có quyền quyết/duyệt; mức trần và tiêu chí nếu muốn áp dụng phải cấu hình thành policy chứ không đoán.
- **Đơn vị đối soát quỹ độc lập:** chưa xác lập provider; không trao toàn bộ quyền hồ sơ cho Hội đồng giám sát chất lượng.
- **Bằng chứng release:** chưa được thay thế bằng các báo cáo Jest/build trước đây; phải chạy trên code/branch cuối cùng và môi trường staging phù hợp.

## 14. Danh sách tài liệu tham khảo trong nhóm

- `Edunity-SRS(2).md` — văn bản gốc nên đọc đầu tiên.
- `Phan_chia_cong_viec_4_luong.docx` — phân luồng hệ thống theo role.
- `EDUNITY_SRS_ADDENDUM_V3.md` — phụ lục yêu cầu mở rộng (lưu ý phần phân vai cũ **đã được thay bằng tài liệu này**).
- `EDUNITY_V3_Checklist_4_Thanh_Vien.md` — 106 task có mã; các mã được chép vào mục 11.
- `EDUNITY_Checklist_4_Thanh_Vien_Cung_Check.xlsx` — checklist 52 nhóm đầu việc để team đánh dấu/đo tiến độ.
- `EDUNITY_Data_Review_Design/01_REVIEW_CODE_VS_SRS.md` và `02_DATA_ARCHITECTURE_V2.md` — bằng chứng review ZIP/định hướng dữ liệu V2, chưa phải migration V3 hoàn tất.
- `Edunity.zip` — snapshot nguồn, **không được phát tán nguyên bản vì có thể chứa secrets**.

**Để hoàn thành EDUNITY V3, không ưu tiên viết lại những gì đã hoạt động; ưu tiên kiểm chứng/hoàn thiện, tích hợp đúng owner, bảo vệ dữ liệu nhạy cảm và kiểm thử đầu-cuối.**
