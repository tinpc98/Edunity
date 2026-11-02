# EDUNITY — MASTER PROMPT KIỂM THỬ TOÀN DIỆN END-TO-END (READ-ONLY SOURCE)

**Phiên bản:** 1.0 — 22/10/2026  
**Mục đích:** Dán toàn bộ nội dung file này vào AI coding agent có quyền **đọc** repository Edunity và **tương tác** với môi trường kiểm thử. Đây là **lệnh triển khai kiểm thử + mẫu báo cáo**, không phải báo cáo khẳng định đã kiểm thử.  
**Nguồn nền:** Báo cáo “Phase 0 — Complete Project Reconnaissance & Forensic Audit” ngày 22/10/2026, 20.1–20.14. Tất cả tên route/endpoint dưới đây là baseline của báo cáo, **phải đối chiếu code/runtime hiện tại**; không mặc định còn đúng sau các commit mới.

---

## 0. VAI TRÒ, ĐẦU RA VÀ GIỚI HẠN KHÔNG THỂ THƯƠNG LƯỢNG

Bạn là **Principal QA Engineer + E2E Tester + API Tester + Security/Accessibility Reviewer** được giao khảo sát, thực thi và ghi nhận kiểm thử toàn bộ hệ thống **Edunity** tới mức từng control nhỏ nhất. Phải dùng bằng chứng từ **source hiện tại và runtime thật**, không chỉ đọc báo cáo hoặc giả định tính năng PASS. Hãy tiến hành tới mức môi trường và quyền hiện có cho phép, ghi minh bạch các bước bị chặn.

**YÊU CẦU BẮT BUỘC — KHÔNG FIX, KHÔNG SỬA CODE**

1. **TUYỆT ĐỐI KHÔNG** edit/format/refactor/fix bất cứ file code, cấu hình, test, README, lockfile, package, script hay git metadata nào trong repository `D:/Dự Án/Edunity`. Không tạo hoặc xóa file trong repository, không tự tạo test code trong dự án, không checkout/cherry-pick/merge/rebase/commit/push. Backend đang trong trạng thái **FREEZE**; không sửa Frontend hay Backend.
2. **Không** `npm install`, `npm update`, `npm audit fix`, `npx` tự tải package mới; không seed/reset/migrate/drop database, không xóa dữ liệu thật, không sửa biến môi trường để “cho test chạy”, không thay đổi role, token, trạng thái DB bằng tay nhằm ép pass.
3. Chỉ thực thi **read-only inspection**, các lệnh kiểm tra không làm đổi repository; cẩn trọng lệnh build/test/lint có thể tạo cache, snapshots, artifacts, test DB. Nếu việc chạy một công cụ ghi dữ liệu vào working tree hoặc `.env`, **không chạy** trên bản gốc; dùng bản sao tạm bên ngoài repo **chỉ khi cho phép và an toàn**, hoặc đánh dấu `BLOCKED`.
4. **Được phép thao tác tạo/sửa/xóa bản ghi qua chính UI/API hợp lệ trong một môi trường TEST/SANDBOX ĐÃ XÁC MINH**, với tài khoản thử nghiệm và dữ liệu giả có tiền tố `QA_EDUNITY_`, vì E2E CRUD cần phát sinh trạng thái. Không có xác minh môi trường tách biệt hoặc còn nguy cơ chạm database thật/shared production => **chỉ kiểm tra GET/read-only, không thực hiện POST/PUT/PATCH/DELETE, webhook, upload hay các thao tác tác động dữ liệu**, ghi `BLOCKED: unsafe environment` cho trường hợp đó.
5. Không dùng thẻ thanh toán thật, không chuyển tiền thật, không tải CCCD/dữ liệu cá nhân thật, không gửi tin nhắn/email/push tới người thật, không vô tình gửi thông báo công khai. Không thử phá hoại, fuzz quá tải, brute force, khai thác lỗ hổng hay bypass ngoài quyền cho phép. Chỉ kiểm tra bảo mật theo cách không gây hại.
6. Không được đánh dấu `PASS` nếu chỉ suy luận từ code, nhận HTTP 200 cho trang tĩnh, hoặc TypeScript build thành công. `PASS` cần hành động thực tế + kết quả đối chiếu expected + bằng chứng. `CODE_REVIEW_ONLY` / `NOT_RUN` / `BLOCKED` / `N/A` phải tách khỏi pass.
7. Không tự ý sửa lỗi “tiện tay” dù lỗi hiển nhiên. Chỉ **ghi nhận: tái hiện, vị trí nghi vấn, API response, ảnh/log, mức độ, ảnh hưởng và đề xuất hướng điều tra**. Không tạo pull request, patch, diff hay commit. Không trả lời kiểu “đã fix”.
8. File báo cáo, screenshots, logs, HAR đã lọc bí mật, checklist đặt **ngoài repository**, ví dụ thư mục do người dùng chỉ định hoặc `D:/Edunity-QA-Reports/<timestamp>/`; nếu không có quyền ghi ngoài repo thì in nội dung báo cáo trong phản hồi. Không ghi dữ liệu nhạy cảm trong artifacts.
9. Cuối buổi so sánh Git baseline và final (`status`, `HEAD`, tracked diff, untracked/ignored nếu có thể) và xác nhận rõ **SOURCE CHANGES = 0** hoặc mô tả sai lệch. Nếu không thể xác nhận thì không tuyên bố đã giữ nguyên.
10. Mọi kịch bản E2E thao tác thật qua browser/API phải có trạng thái và bằng chứng; không giả lập đã nhấn nút hay đã gọi API. Nếu thiếu browser/credentials/server, ghi rõ hạn chế, vẫn thực hiện source audit tối đa.

**Kết quả phải xuất thành các file ngoài repo**: `EDUNITY_FULL_TEST_REPORT.md` (bắt buộc), `EDUNITY_TEST_CASE_RESULTS.csv` (bắt buộc), `EDUNITY_BUG_REGISTER.csv` (bắt buộc; có header dù 0 bug), `EDUNITY_TEST_EVIDENCE_INDEX.md` (bắt buộc), thư mục bằng chứng được ẩn danh nếu có quyền lưu. Không sửa file nguồn dự án khi tạo các artifact này.

---

## 1. NGỮ CẢNH NỀN CẦN KIỂM CHỨNG

- **Frontend:** React 19, Vite 8, React Router v7, Ant Design 6, TanStack Query v5; địa chỉ dev báo cáo: `http://localhost:5173`.
- **Backend:** Express + Mongoose, JWT auth/refresh, middleware phân quyền, cron; địa chỉ báo cáo: `http://localhost:3000`.
- **DB:** MongoDB Atlas (không giả định test DB tách biệt).
- **Vai trò:** PUBLIC/GUEST, STUDENT, TEACHER chưa duyệt / PENDING / VERIFIED, SPONSOR, ADMIN.
- **Tích hợp:** LiveKit thật hoặc fallback `EDUNITY_DEV`; payment sandbox/webhook nội bộ; upload avatar public và tài liệu private signed URL; chat REST polling.
- **Kiến trúc cơ bản:** Client -> API -> MongoDB; collections gồm User, Category, Subject, Course, CourseProposal, Class, Session, SessionAttendance, Enrollment, Payment, Transaction, TeacherEarning, ScholarshipCampaign, SponsorContribution, ScholarshipApplication, Scholarship, ScholarshipUsage, VerificationDocument, Conversation, Message, Report, Notification, AuditLog.
- **Seed users theo báo cáo (chỉ dùng khi được phép):** `admin@test.com`, `teacher@test.com` (verified), `teacher3@test.com` (pending), `student1@test.com`, `student2@test.com`, `sponsor@test.com`. Không ghi mật khẩu, token hoặc tài liệu riêng tư vào báo cáo; sử dụng credential đã được cấp hợp lệ.
- **Baseline git tại thời điểm báo cáo:** branch `feature/teacher-admin`, HEAD `4d2892a`; đây **không** phải cam kết HEAD hiện tại. Ghi lại branch/HEAD hiện tại trước khi test.

**6 giả thuyết lỗi đã được báo cáo — phải tái kiểm chứng, không tự kết luận lỗi vẫn còn:**
- `GAP-01` / P0: `/admin/teachers/verifications` FE đọc `.data`/`.paging.total` thay vì API trả `{items,total,page,pageSize,totalPages}`.
- `GAP-02` / P1: `/student/payments` dùng `StudentPaymentHistoryPage` + `payment.service.ts` mock localStorage thay vì trang/API thật.
- `GAP-03` / P1: `validatePrivateDocument` từ chối `.jpg` khi `file.type` rỗng hoặc `image/jpg`; backend cũng hạn chế MIME.
- `GAP-04` / P1: upload avatar khi `teacherProfile` null trả `PROFILE_NOT_EDITABLE`.
- `GAP-05` / P2: Admin Users thiếu action đi tới duyệt hồ sơ giáo viên.
- `GAP-06` / P3: mock data files không dùng nằm lại trong `FrontEnd/src/data/`.

---

## 2. PHƯƠNG PHÁP LÀM VIỆC — 8 CỔNG KIỂM TRA

**Gate A — Xác lập ranh giới an toàn.** Kiểm tra repository path, HEAD, branch, git working tree, environment đang trỏ đến localhost/test hay prod, DB name/cluster, storage, sandbox; không lộ bí mật. Ghi nhận nguồn dữ liệu nào có thể an toàn tạo test, nguồn nào chỉ đọc. Nếu không xác nhận được, chỉ chạy read-only; không coi đó là “thất bại chức năng”.

**Gate B — Inventory bằng code hiện tại.** Liệt kê toàn bộ file route, controller, service, model, middleware, Frontend router, page, components, services, hooks, stores, menu links; đối chiếu Phase 0. Tạo mapping `role -> route -> page -> service -> method endpoint -> DB/state -> test IDs`. Phát hiện chức năng bổ sung chưa có trong danh sách: phải **tự bổ sung test case**, không bỏ sót. Phân biệt route có trong file và route hoạt động thực tế.

**Gate C — Kiểm tra môi trường.** Check server/DB connectivity, CORS, auth/refresh, storage, email/notification config, LiveKit, payment sandbox, cron, response envelope, console error. Chỉ đánh dấu `READY`, `DEGRADED`, `BLOCKED`; không sửa config. Kiểm tra services trả dữ liệu thật hay mock.

**Gate D — Source review tĩnh, không chỉnh sửa.** So khớp contract (envelope, pagination, params, model enums), guards, auth, error mapping, validation, null states, upload, URLs, state transitions, navigation, loading/error handling, lộ thông tin, missing dependency. Mọi phát hiện chỉ qua đọc code ghi `SOURCE_FINDING`, không gọi là lỗi runtime đã xác minh.

**Gate E — API testing.** Với API chỉ đọc: thực thi GET được phép; với API mutation: chỉ thực thi trên TEST/SANDBOX đã xác minh. Cho từng endpoint kiểm tra happy path, 400/401/403/404/409, validation, ownership, duplicate, pagination, limit, sorting, id invalid, concurrency/idempotency nếu an toàn, định dạng dữ liệu và response envelope `{success,data,message,error}`. Ghi request/response **redacted**, status, thời gian.

**Gate F — UI + chức năng vi mô.** Trong browser thực tế, duyệt **từng route, nút, link, icon action, menu, modal, drawer, tab, table, filter, sort, pagination, dropdown, input, upload, toast, notification, navigation, back, refresh, deep link, disabled/loading/empty/error states**, kiểm tra keyboard/mobile nếu có công cụ. Mỗi control có một case nếu chức năng và tác động riêng; test nhãn, tooltip, yêu cầu bắt buộc, error message, permission, phục hồi trạng thái.

**Gate G — E2E xuyên vai trò & regression.** Chạy chuỗi Student/Teacher/Sponsor/Admin end-to-end, dữ liệu xuyên module phải nhất quán sau refresh/đăng nhập khác role. Kiểm thử 6 GAP trước rồi chạy regression liên quan; không ép thay đổi dữ liệu bằng script DB trực tiếp.

**Gate H — Báo cáo & toàn vẹn.** Xuất ma trận chi tiết và bug register với evidence, thống kê số case theo role/module/trạng thái, limitations, ưu tiên sửa (chỉ khuyến nghị, **không sửa**), kiểm tra git cuối cùng. Nếu công cụ bị chặn, ghi danh sách để người dùng/QA thủ công tiếp tục.

**Trình tự ưu tiên khi thời gian hạn chế:** kiểm tra an toàn -> GAP-01..05 -> Auth & Roles -> Teacher verification -> Enrollment/Payments -> Scholarships -> Classrooms/Attendance -> remaining pages -> tiny controls -> final report. Tuy nhiên **không được tuyên bố đã test toàn bộ** nếu còn `NOT_RUN/BLOCKED`.

---

## 3. CHUẨN KẾT QUẢ TEST CASE VÀ BẰNG CHỨNG

Mỗi case bắt buộc có các cột:

`TestID,Module,Role,Layer,Route_or_API,Preconditions,TestData,Steps,Expected,Actual,Status,Severity_if_failed,EvidenceRef,HTTP_Status,Timestamp,Environment,Notes`

**Status duy nhất được phép:** `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN`, `N/A`, `CODE_REVIEW_ONLY`. `BLOCKED` luôn có lý do. `FAIL` phải có **bằng chứng runtime**; nếu chỉ đọc code dùng `CODE_REVIEW_ONLY` và ghi ở source findings. `N/A` dùng khi feature không tồn tại trong code hiện tại, không áp dụng thật, hoặc môi trường không hỗ trợ theo thiết kế (giải thích rõ), không dùng để che untested.

**Bằng chứng tối thiểu cho mỗi FAIL:** URL + role + tiền điều kiện, test data đã ẩn danh, bước tái hiện, expected/actual, screenshot hoặc terminal output/console/network (ẩn token), request method/path + status, correlation ID/timestamp nếu có, số lần tái hiện; bug ID. `PASS` ghi ngắn hành động và actual quan sát, không chỉ “OK”.

**Độ ưu tiên bug:** P0 (luồng cốt lõi không chạy, mất tiền/dữ liệu, auth nghiêm trọng), P1 (chức năng chính hỏng), P2 (chức năng phụ/UX đáng kể), P3 (nhỏ/cosmetic). Tách `Severity` khỏi `Confidence` (Confirmed/Suspected/Environment-dependent).

**Độ bao phủ đo bằng 3 thước đo:** Route coverage, Endpoint coverage, Control coverage (controls đã inventory vs controls thực sự test). Bổ sung State transition coverage, Cross-role workflow coverage, Negative/Boundary coverage. Không gộp `BLOCKED/NOT_RUN` vào pass rate. Nêu cách tính.

---

## 4. KIỂM THỬ DỮ LIỆU AN TOÀN, PHÂN QUYỀN, TRANSACTION

- Với thao tác ghi trong sandbox, tạo dữ liệu QA rõ ràng `QA_EDUNITY_<case-id>_<time>`; dùng tài khoản test được cấp; ghi TestData IDs để truy vết và dọn dẹp qua UI nếu có phép, **không xóa/chỉnh data thật**.
- Với giao dịch sandbox, không thanh toán tiền thật; kiểm tra webhook chỉ khi được xác nhận là sandbox, xem `Enrollment`, `Payment`, `Transaction`, `TeacherEarning`, `ScholarshipUsage` nhất quán, không khẳng định đã chuyển tiền thật.
- Với hồ sơ giáo viên, chỉ upload file giả tạo không chứa CCCD thật; không đính kèm nội dung ID/ảnh riêng tư trong bug report. Signed link không được công khai.
- Negative auth cases phải dùng token/tài khoản test của chính tester. Chỉ kiểm tra access control trong phạm vi sở hữu và test fixtures được phép; không đọc dữ liệu người dùng thật.
- Khi verify cron expiry, không thay đồng hồ hệ thống hoặc DB trực tiếp; sử dụng dữ liệu test với thời hạn hợp lệ nếu đã có, nếu không `BLOCKED` và kiểm tra logic tĩnh.
- Kiểm tra transaction MongoDB chỉ trong môi trường hỗ trợ replica set; nếu backend đòi replica set mà test DB không hỗ trợ, ghi blocker riêng (không thay topology để “fix”).

---

## 5. MA TRẬN KIỂM THỬ CHI TIẾT (BASELINE BẮT BUỘC)

**Cách thực hiện:** mỗi dòng là một nhóm kịch bản tối thiểu; đối với các dòng có từ “mọi/từng”, phải tách thành case con cho **từng control, trường nhập, trạng thái và API** được tìm thấy trong source/runtime. Không dừng ở checklist này nếu có tính năng khác.

### 5.1. Hệ thống chung: khởi động, điều hướng, shell, UI nhỏ nhất

- [ ] **GEN-001** — Kiểm tra URL frontend/backend, port 5173/3000, phản hồi thực, lỗi khởi động, health/root/API chính, và MongoDB connection; phân biệt uptime với nghiệp vụ.
- [ ] **GEN-002** — Inventory tất cả menu, submenu, footer link, logo, breadcrumb, header actions, sidebar collapse, back/forward, logo-to-home ở cả 5 layout.
- [ ] **GEN-003** — Kiểm tra mọi route deep-link trực tiếp, browser refresh, trailing slash, query string, route không tồn tại, redirect 404, loop redirect, preserve intended destination.
- [ ] **GEN-004** — Kiểm tra chuyển vai trò và đăng xuất làm ẩn menu/action của vai trò trước, không rò cached data.
- [ ] **GEN-005** — Kiểm tra responsive mobile/tablet/desktop; không tràn khung, bảng cuộn ngang hợp lý, sidebar/drawer đóng mở, modal không che CTA.
- [ ] **GEN-006** — Kiểm tra tất cả form: default, required, trim spaces, độ dài min/max, định dạng email/số/ngày/giá/URL, Enter/Escape, double submit, reset/cancel.
- [ ] **GEN-007** — Kiểm tra từng table: loading, empty, error, retry, search, debounce, filter, clear filter, sort tăng/giảm, paginate trang đầu/cuối, total đúng, per-page, reload.
- [ ] **GEN-008** — Kiểm tra từng select/date picker/dropdown/radio/checkbox/switch/tab: trạng thái chọn, disabled, options, cancel/clear, keyboard, persistence.
- [ ] **GEN-009** — Kiểm tra mọi modal/drawer/popconfirm: mở từ action đúng, ESC/Cancel/X/overlay, focus, xác nhận một lần, nội dung lỗi/toast chính xác.
- [ ] **GEN-010** — Kiểm tra notification/toast và thông báo lỗi: không hiển thị thông tin nhạy cảm/stacktrace; dismiss, retry, loading spinner, skeleton, no-data.
- [ ] **GEN-011** — Kiểm tra avatar/image placeholder, ảnh lỗi, file link signed/public, alt text, lazy loading, clipboard/copy, ngày giờ múi giờ Asia/Bangkok/UTC, tiền tệ VND.
- [ ] **GEN-012** — Kiểm tra accessibility cơ bản: label, tab order, focus visible, icon aria-label, keyboard-only, contrast, semantic headings, trạng thái invalid và screen-reader hints.
- [ ] **GEN-013** — Kiểm tra từng network request được phát đúng một lần/mục đích; không gọi lặp vô hạn, 404 âm thầm, unhandled rejection, React warning/console errors.
- [ ] **GEN-014** — Kiểm tra API errors và HTTP status 400/401/403/404/409/422/429/500 và network timeout/offline (giả lập an toàn nếu công cụ có), UI fallback không crash.
- [ ] **GEN-015** — Kiểm tra phân biệt production/test API URL, CORS, cookie/localStorage/token hygiene, auth refresh race condition và source map/error leakage.
- [ ] **GEN-016** — Kiểm tra khôi phục sau refresh, back/forward, navigate khi có form unsaved, reload khi request đang chạy; không bị duplicate submission.
- [ ] **GEN-017** — Inventory và kiểm tra i18n text/typo, font, layout, logo, empty views, icons, hover/focus/disabled state, cursor semantics.
- [ ] **GEN-018** — Kiểm tra chuyển trang từ tất cả nút CTA, card, row action, breadcrumb và external link; không để dead button, href # ngoài dự tính.

### 5.2. Public/GUEST: khám phá khóa học, lớp học, giáo viên, học bổng

- [ ] **PUB-001** — `/` HomePage: homepage sections, featured classes/teachers/campaigns, search, CTA, pagination/carousel nếu có, click-through và dữ liệu thật.
- [ ] **PUB-002** — `/classes` ClassDiscoveryPage: search keyword, category/subject/grade/price/status filter, combine filters, clear, pagination, no results, invalid query.
- [ ] **PUB-003** — `/classes/:classId`: thông tin lớp, giáo viên, số chỗ, giá, lịch Session, tiêu chí đủ điều kiện, đăng ký; classId thiếu/sai/id không tồn tại.
- [ ] **PUB-004** — `/teachers` TeacherDiscoveryPage: list, search/sort/filter, avatar/bio, chỉ hiển thị đúng teacher theo chính sách, empty-state.
- [ ] **PUB-005** — `/teachers/:teacherId`: hồ sơ public, liên kết lớp/khóa học, avatar, đánh giá, unavailable/private fields, ID lỗi.
- [ ] **PUB-006** — `/courses` CoursesPage: danh mục Category->Subject->Course, search/filter/list/sort và điều hướng chi tiết.
- [ ] **PUB-007** — `/courses/:courseId`: thông tin khóa học, lớp liên quan, kế hoạch học, trạng thái không tồn tại.
- [ ] **PUB-008** — `/campaigns` CampaignsPage: danh sách quỹ, trạng thái, tổng mục tiêu/đã đóng góp, tìm kiếm, filter, CTA.
- [ ] **PUB-009** — `/campaigns/:campaignId`: chi tiết quỹ, tiến độ/điều kiện/hạn, link apply/contribute theo role, ID lỗi.
- [ ] **PUB-010** — `/login`: tất cả link điều hướng tới register, teacher register, forgot password (nếu code có), redirect sau login.
- [ ] **PUB-011** — `/register`: lựa chọn role hợp lệ, điều khoản/checkbox nếu tồn tại, lỗi trùng email, empty/invalid inputs.
- [ ] **PUB-012** — `/register/teacher`: multi-step registration, thông tin chứng nhận, login sau đăng ký, cancellation/back/refresh.
- [ ] **PUB-013** — `/register/teacher/qualification`: trang guard TEACHER, file input, upload, validation, retry, submit trạng thái.
- [ ] **PUB-014** — `/register/teacher/pending`: trạng thái chờ duyệt sau submit, refresh, điều hướng, status thật từ API.
- [ ] **PUB-015** — Guest nhấn đăng ký lớp/checkout/classroom/đóng góp/xem trang dashboard -> chuyển login hoặc 403 đúng; không lộ thông tin riêng.
- [ ] **PUB-016** — Kiểm tra `/enrollment/:classId` được báo là legacy mock: có còn route không, có bị người dùng dẫn tới không, ghi nhận sai lệch không sửa.
- [ ] **PUB-017** — Mọi card, ảnh, badge, tooltip, link trong danh mục public phản ánh đúng dữ liệu API, không sử dụng mock âm thầm.

### 5.3. Auth & Account: đăng ký, đăng nhập, token, profile, avatar

- [ ] **AUTH-001** — POST `/api/auth/register`: đủ 4 role nếu được mở, role không hợp lệ/nâng quyền ADMIN qua payload phải bị chặn, email trùng, password rule.
- [ ] **AUTH-002** — POST `/api/auth/login`: đúng, sai mật khẩu, email không tồn tại, leading/trailing spaces, account disabled (nếu có), thông báo lỗi không lộ user tồn tại.
- [ ] **AUTH-003** — POST `/api/auth/refresh`: valid/expired/invalid/revoked token, token rotation, concurrent refresh, logout invalidation.
- [ ] **AUTH-004** — POST `/api/auth/logout`: sign out từ mọi layout, refresh sau logout, token cũ không dùng lại; không xoá dữ liệu ngoài phiên hiện tại.
- [ ] **AUTH-005** — GET `/api/auth/me`: trả đúng user/role/avatar; khi không token/expired token/role đổi (nếu có kịch bản an toàn).
- [ ] **AUTH-006** — Remember login: reload/tab mới/browser reopen theo thiết kế, thời hạn session, storage, logout across tabs nếu hỗ trợ.
- [ ] **AUTH-007** — Route guards guest/authenticated/role: test Student vào Admin/Teacher/Sponsor và tương tự mỗi cặp; deep-link + API call trực tiếp.
- [ ] **AUTH-008** — GET/PATCH `/api/me/profile`: từng field theo từng role, validation, blank/invalid, cancel, save, refresh, đồng bộ header/dashboard.
- [ ] **AUTH-009** — POST `/api/me/avatar`: chọn file JPG/PNG/WebP chuẩn, kích thước <=5MB; file vượt hạn, sai MIME/magic bytes, network fail, ảnh broken.
- [ ] **AUTH-010** — Avatar teacherProfile null (nếu fixture test an toàn có sẵn): kiểm tra `PROFILE_NOT_EDITABLE`; không sửa DB để tự tạo fixture.
- [ ] **AUTH-011** — Kiểm tra profile Student/Teacher/Sponsor khác nhau; dữ liệu sở hữu không lộ sang vai trò khác qua API hoặc UI.
- [ ] **AUTH-012** — Kiểm tra Authorization Bearer missing/malformed/expired, 401 vs 403, ngăn IDOR trên resource mà tester không sở hữu (chỉ fixture test).
- [ ] **AUTH-013** — Kiểm tra `apiClient` unwrap envelope, error map, query invalidation sau mutation, optimistic display và trường hợp backend success nhưng UI không cập nhật.
- [ ] **AUTH-014** — Kiểm tra UI password visibility, show/hide, CapsLock nếu có, confirm password/remember checkbox, disabled submit, spinners, back navigation.
- [ ] **AUTH-015** — Kiểm tra fullName email avatar đã cập nhật phản ánh nhất quán trên topbar/profile/dashboard và khi log in lại.

### 5.4. Teacher: đăng ký & xác minh hồ sơ (nghiệp vụ rủi ro cao)

- [ ] **VER-001** — Giáo viên mới đăng ký -> teacherProfile.verificationStatus `UNVERIFIED` -> yêu cầu xác minh đúng trang.
- [ ] **VER-002** — Kiểm tra 2 lối nộp: `/register/teacher/qualification` và `/teacher/profile` modal; dữ liệu hai lối thống nhất.
- [ ] **VER-003** — Input qualificationSummary/biography: required, min/max nếu có, Unicode, whitespace, lưu/chỉnh, error hiển thị.
- [ ] **VER-004** — Chọn CCCD/identityFront bắt buộc, identityBack nếu có, qualificationFiles ít nhất một; kiểm tra từng file slot.
- [ ] **VER-005** — File .pdf, .jpg, .jpeg, .png, .webp đúng định dạng/size; MIME chuẩn, `image/jpg`, `file.type=""`, spoofed extension, magic byte mismatch.
- [ ] **VER-006** — Upload nhiều file: progress/loading, file bị trùng, xóa/chọn lại, request lỗi/timeout, dữ liệu form vẫn giữ, không submit nửa chừng.
- [ ] **VER-007** — POST `/api/uploads/private` với `purpose=IDENTITY/QUALIFICATION`: ownership, authentication, whitelist, size, response `storageKey/mimeType/size`.
- [ ] **VER-008** — POST `/api/teacher/verification`: body documents kiểu [{documentType,files:[{storageKey,side,mimeType}]}], qualificationSummary; chặn thiếu/trùng key không sở hữu.
- [ ] **VER-009** — Kiểm tra submit thành công -> `PENDING` trong `GET /api/teacher/verification` và sau refresh, không được bấm submit trùng.
- [ ] **VER-010** — Kiểm tra submit lại trong lúc PENDING, sau REJECTED, sau APPROVED theo state machine trong code; không đoán quy tắc.
- [ ] **VER-011** — Admin GET `/api/admin/teacher-verifications` trả `data.items`, `total`, `page`, `pageSize`, `totalPages` qua envelope; FE phải hiển thị đúng, không đọc `.data` sai.
- [ ] **VER-012** — Admin `/admin/teachers/verifications`: filter PENDING/APPROVED/REJECTED, sort, search, paging, total, empty/Loading/error states.
- [ ] **VER-013** — Admin `/admin/teachers/verifications/:id`: chi tiết bằng cấp/ID file signed URL, trạng thái, notes, tải/xem có hết hạn đúng.
- [ ] **VER-014** — POST `/api/admin/teacher-verifications/:id/approve`: chỉ admin, happy path, double approve, unauthorized, cập nhật teacher status.
- [ ] **VER-015** — POST `/api/admin/teacher-verifications/:id/reject`: lý do reviewNote required nếu policy, validation, duplicate, teacher thấy lý do, submit lại nếu policy.
- [ ] **VER-016** — Teacher verified tạo lớp được; unverified/pending/rejected bị chặn cả UI/API; trạng thái cập nhật không cần logout nếu thiết kế.
- [ ] **VER-017** — `/admin/users` tag chờ xác thực và action/link đi tới trang duyệt nếu có; nếu không, xác nhận GAP-05.
- [ ] **VER-018** — Kiểm tra private signed file: hết hạn, signature sai, key khác owner, URL lộ ra public, cache/copy và không leak nội dung trong log.
- [ ] **VER-019** — Backend Mongo replica set/transaction submit: nếu môi trường không hỗ trợ, ghi BLOCKED hoặc lỗi thật, không sửa DB topology.
- [ ] **VER-020** — Giáo viên nộp hồ sơ mới, admin duyệt, teacher vào profile/permission trạng thái mới end-to-end và đối chiếu DB gián tiếp qua GET.

### 5.5. Teacher: dashboard, catalog, khóa học, lớp, lịch, doanh thu, đánh giá

- [ ] **TEA-001** — `/teacher`: dashboard KPI lớp/số học viên/doanh thu, trạng thái teacher verification, links tới đúng danh sách, số liệu đối chiếu API.
- [ ] **TEA-002** — `/teacher/courses`: catalog hiển thị Course/Category/Subject, filter/sort/paginate, chọn khóa cho đề xuất/tạo lớp.
- [ ] **TEA-003** — `/teacher/course-proposals`: list proposals, create proposal, form validate title/subject/grade và mọi field thực tế.
- [ ] **TEA-004** — POST `/api/teacher/course-proposals`: quyền teacher, field required, trùng proposal, status ban đầu, response và cập nhật list.
- [ ] **TEA-005** — Admin duyệt/yêu cầu sửa/từ chối course proposal theo action và state machine code; teacher thấy trạng thái/review note.
- [ ] **TEA-006** — `/teacher/classes`: list lớp theo status, tab/filter/search, empty, link chi tiết, chỉ thấy lớp thuộc teacher.
- [ ] **TEA-007** — `/teacher/classes/create`: nút tạo lớp có guard VERIFIED, field title/courseId/price/maxStudents, required/min/max, zero/free, ngày/giờ và số chỗ.
- [ ] **TEA-008** — POST `/api/teacher/classes`: chặn teacher unverified, dữ liệu sai, class status đúng; không tạo trùng do double click.
- [ ] **TEA-009** — `/teacher/classes/:classId`: tabs, students, sessions, enrollments, status, lịch, start/end, số ghế, route invalid.
- [ ] **TEA-010** — Quy trình Admin duyệt lớp, thay đổi trạng thái lớp, teacher/student thấy cùng status; kiểm tra action theo state machine code.
- [ ] **TEA-011** — `/teacher/schedule`: calendar/list week/month/day, giờ/timezone, overlap, class click, session joining, navigate date.
- [ ] **TEA-012** — Quản lý Session: tạo/sửa/hủy nếu route cho phép; buổi trùng thời gian, trạng thái lớp chưa duyệt, số lượng/điều kiện.
- [ ] **TEA-013** — Teacher xem danh sách học viên, điểm danh/số lượt tham gia sau session, empty/withdrawn/confirmed; không thấy lớp teacher khác.
- [ ] **TEA-014** — `/teacher/revenue`: số tiền đã thu/chờ thanh toán/hoàn (nếu có), filter ngày, bảng giao dịch, cộng tổng và định dạng VND.
- [ ] **TEA-015** — `/teacher/reviews`: đánh giá sao/nội dung/average, filter/lỗi/no review, phân quyền trả lời/chỉnh/xóa nếu code có.
- [ ] **TEA-016** — `/teacher/profile`: biography/qualification/avatar, update cancel/save, verification modal, error/state progress, persist sau logout-login.
- [ ] **TEA-017** — Kiểm tra trạng thái dữ liệu sau lớp mới/duyệt lớp/học viên nhập lớp/thanh toán cập nhật dashboard và earning đúng.
- [ ] **TEA-018** — Kiểm tra owner checks với classId/proposalId/sessionId của teacher khác bằng fixtures an toàn, phân biệt 403/404.
- [ ] **TEA-019** — Kiểm tra gắn đường dẫn giáo viên public/profile, nguồn avatar, teacher card, lớp liên quan sau khi verify.
- [ ] **TEA-020** — Kiểm tra thông báo teacher liên quan course approval/class approval/enrollment nếu code hỗ trợ, không giả định thông báo tồn tại.

### 5.6. Student: dashboard, lịch học, lớp, ghi danh, thanh toán, hồ sơ

- [ ] **STU-001** — `/student`: classes my enrolled, upcoming sessions, CTA join, empty/active/completed và số lượng thực từ API.
- [ ] **STU-002** — `/student/classes/:classId`: đúng lớp đã đăng ký, sessions, next join, attendance, không lộ lớp người khác.
- [ ] **STU-003** — `/student/schedule`: calendar/list date navigation, giờ/UTC, buổi đã qua/sắp tới, link classroom và empty.
- [ ] **STU-004** — `/student/enrollments`: lớp PENDING_PAYMENT/CONFIRMED/CANCELED/EXPIRED theo enum thực, filter/status, actions cancel/pay lại.
- [ ] **STU-005** — `/student/profile`: xem/sửa từng field được phép, validate, avatar nếu hỗ trợ, đồng bộ thông tin header.
- [ ] **STU-006** — Public class detail -> click `Đăng ký học` -> POST `/api/classes/:id/enrollments` -> nhận Enrollment đúng.
- [ ] **STU-007** — Lớp FREE: đăng ký -> CONFIRMED, không yêu cầu checkout/thu tiền, số ghế giảm hợp lý.
- [ ] **STU-008** — Lớp PAID: PENDING_PAYMENT -> hold seat -> redirect `/checkout/:enrollmentId` -> tạo payment.
- [ ] **STU-009** — POST `/api/enrollments/:id/payments`: amount đúng, gatewayReference độc nhất, role/ownership, lỗi enrollment không hợp lệ.
- [ ] **STU-010** — POST `/api/payments/sandbox/webhook` trong sandbox: SUCCESS và failure/duplicate theo policy, trạng thái Payment/Enrollment/Transaction/Earning đúng.
- [ ] **STU-011** — Checkout success/fail/cancel/back/reload/multi-click, payment pending, lỗi mạng, hiển thị gatewayReference redacted và trạng thái nhất quán.
- [ ] **STU-012** — `/student/payments`: lịch sử lấy API GET `/api/me/payments` thật, không localStorage mock, số tiền/thời gian/status/filter/sort.
- [ ] **STU-013** — Kiểm tra `StudentPaymentsPage` vs `StudentPaymentHistoryPage` và router hiện tại; tái kiểm chứng GAP-02 runtime + import chain.
- [ ] **STU-014** — Lớp hết chỗ: thông báo, không overbook, giới hạn maxStudents kể cả hai người đồng thời đăng ký (nếu sandbox hỗ trợ).
- [ ] **STU-015** — Đăng ký trùng lớp, ghi danh rồi hủy/expire, nhiều request cùng lúc, giữ chỗ quá hạn/cron; expected từ state machine thật.
- [ ] **STU-016** — Hủy đăng ký theo API/UI nếu hỗ trợ; seat inventory khôi phục đúng, payment/policy ảnh hưởng đúng.
- [ ] **STU-017** — Đăng ký lớp cần teacher verified/class approved và course/status hợp lệ; invalid classId, public/private class.
- [ ] **STU-018** — Chỉ student mới được đăng ký; teacher/admin/sponsor/guest gửi POST enroll phải bị từ chối hợp lý.
- [ ] **STU-019** — Chuyển từ thanh toán thành công -> `/student` có lớp -> lịch học chứa session -> join classroom đúng.
- [ ] **STU-020** — Kiểm tra public `/enrollment/:classId` legacy, không để mock flow lẫn vào payment thực.
- [ ] **STU-021** — Kiểm tra câu chữ trạng thái, đơn vị VND, số tiền zero/large, Decimal rounding, time/expiredAt theo runtime.
- [ ] **STU-022** — Student logout/login account khác không thấy dữ liệu lớp/payments/enrollment của nhau.
- [ ] **STU-023** — Kiểm tra refund/discount/coupon nếu code hiện tại có, chỉ thêm case khi phát hiện, không suy đoán đã phát triển.

### 5.7. LiveKit, Classroom, Session, Attendance

- [ ] **LIVE-001** — `/classroom/:sessionId` direct link có auth/role/ownership; sessionId invalid, class chưa ghi danh, lớp teacher khác.
- [ ] **LIVE-002** — POST `/api/sessions/:id/join`: provider/serverUrl/accessToken chỉ cấp người hợp lệ trong thời gian cho phép.
- [ ] **LIVE-003** — PreJoin UI: microphone/camera permissions allow/deny, device list/switch, preview, mic/cam toggle, join/cancel.
- [ ] **LIVE-004** — Chế độ `EDUNITY_DEV`: ghi rõ simulated; kiểm tra UI/guard/attendance chỉ trong giới hạn, không gọi là LiveKit production PASS.
- [ ] **LIVE-005** — LiveKit thật chỉ test khi server/token hợp lệ: connect/disconnect/reconnect, quality, audio/video, participant roster.
- [ ] **LIVE-006** — Khởi tạo phòng bằng teacher, student join đúng lớp, nhiều student bằng sandbox accounts, room lock/capacity nếu có.
- [ ] **LIVE-007** — Teacher/student rời phòng, refresh/tab mới, hết token, đổi mạng, camera permission revoked, rejoin trước/sau giờ.
- [ ] **LIVE-008** — Bảng điều khiển: mic/camera, participant list, chat trong lớp, screen sharing/record nếu UI/code có.
- [ ] **LIVE-009** — AttendanceModal: xem danh sách, tự điểm danh, confirm, vắng mặt, attendance lần 2, dữ liệu lưu và hiển thị đúng.
- [ ] **LIVE-010** — Kết thúc session -> attendance persistent -> Student/Teacher schedule/history cập nhật; invalid transitions.
- [ ] **LIVE-011** — Không cấp LiveKit access token cho user không có role/attendance enrollment hợp lệ; không log token.
- [ ] **LIVE-012** — Check UI kết thúc lớp/giáo viên logout/student bị kick nếu feature có; trạng thái `not started/in progress/ended`.
- [ ] **LIVE-013** — Kiểm tra khả năng vào lớp trên mobile/không thiết bị camera (nếu môi trường), thông báo thiếu quyền rõ ràng.
- [ ] **LIVE-014** — Kiểm tra session timezone, ngày biên, lịch trùng, trạng thái class suspended/cancelled ảnh hưởng join.

### 5.8. Học bổng, chiến dịch, đóng góp, Sponsor

- [ ] **SCH-001** — `/sponsor`: dashboard contributions/campaigns KPIs, amount totals, status, no-data, API source thật.
- [ ] **SCH-002** — `/sponsor/profile`: xem/sửa profile fields hợp lệ, email/contact/organization nếu có, validation, persist, avatar nếu có.
- [ ] **SCH-003** — `/sponsor/contributions`: list phân trang/filter, trạng thái/amount/date, drill-down, owner check.
- [ ] **SCH-004** — `/campaigns`: public campaigns list status/open/closed, filter/search, targetAmount/currentAmount, progress percent đúng.
- [ ] **SCH-005** — `/campaigns/:campaignId`: description/eligibility/deadlines, CTA contribute/apply, invalid ID.
- [ ] **SCH-006** — Admin tạo campaign POST `/api/admin/campaigns` trong sandbox: required, targetAmount > 0, start/end, status, duplicate.
- [ ] **SCH-007** — Admin sửa/đóng/mở campaign nếu code hỗ trợ, state transitions và visibility public đúng.
- [ ] **SCH-008** — Sponsor tạo contribution qua luồng được hỗ trợ, số tiền min/max/negative/zero, campaign không active, duplicate/double submit.
- [ ] **SCH-009** — Đóng góp sandbox -> contribution history + campaign aggregate + sponsor dashboard nhất quán; giao dịch không tạo tiền thật.
- [ ] **SCH-010** — `/student/scholarships/explore`: tìm kiếm/lọc campaign/học bổng còn hiệu lực, eligibility và CTA apply.
- [ ] **SCH-011** — `/student/scholarships/applications`: list trạng thái từng đơn, reason, documents, filter, chi tiết/dự thảo nếu hỗ trợ.
- [ ] **SCH-012** — POST `/api/campaigns/:id/applications`: reason/documents validation, application trùng, sai campaign, role, deadline.
- [ ] **SCH-013** — Admin `/admin/scholarship-applications`: queue, filters, paging, status và accuracy count.
- [ ] **SCH-014** — Admin `/admin/scholarship-applications/:id`: xem thông tin/tài liệu bảo mật, approve/reject, required note, double approve.
- [ ] **SCH-015** — Student `/student/scholarships`: approved scholarship, balance, expiry, consumed/remaining amount và visibility.
- [ ] **SCH-016** — Đăng ký lớp dùng học bổng FULL/MIXED (nếu code hỗ trợ) -> payment/usage/remaining balance/seat đúng, không chi vượt.
- [ ] **SCH-017** — Application rejected/approved/cancelled/expired -> Student/Sponsor/Admin views cập nhật theo state machine.
- [ ] **SCH-018** — Kiểm tra campaign target đạt/vượt mục tiêu và concurrency contribution, chính sách khóa/allow overfund theo code.
- [ ] **SCH-019** — Access control: sponsor chỉ đọc đóng góp mình, student chỉ đọc applications của mình, admin đúng quyền duyệt.
- [ ] **SCH-020** — Tất cả tiền tệ, phép cộng trừ, precision, rounding và timezone trong học bổng/đóng góp nhất quán.

### 5.9. Admin: tất cả khu vực quản trị

- [ ] **ADM-001** — `/admin`: KPI/tables/charts thống kê, period filters, data aggregate từ API, loading/empty/error và click-through.
- [ ] **ADM-002** — `/admin/users`: list/search/role/status filter, sort/pagination, user detail drawer, enable/disable nếu API cho phép, kiểm tra status.
- [ ] **ADM-003** — Chi tiết user STUDENT/TEACHER/SPONSOR/ADMIN: đúng profile fields, không lộ secrets, role guard của mọi action.
- [ ] **ADM-004** — `/admin/teachers/verifications`: queue status/filter/paging/total và mở chi tiết; đặc biệt GAP-01.
- [ ] **ADM-005** — `/admin/teachers/verifications/:id`: signed documents, approve/reject/reason, refresh và teacher status downstream.
- [ ] **ADM-006** — `/admin/classes`: list classes, filter status/teacher/date, total/empty, mở chi tiết/duyệt nếu có.
- [ ] **ADM-007** — `/admin/classes/:classId`: thông tin/class sessions/enrolled students, approve/reject/suspend theo chính sách, role guard.
- [ ] **ADM-008** — `/admin/catalog`: CRUD category/subject/course nếu có; mỗi action create/edit/delete/validation/dependency, confirm, refresh.
- [ ] **ADM-009** — `/admin/course-proposals`: review teacher proposals, list/detail, approve/reject/request-change, note, teacher feedback.
- [ ] **ADM-010** — `/admin/campaigns`: list/create/update/status controls, filter/paging, totals, campaign detail.
- [ ] **ADM-011** — `/admin/campaigns/create`: tất cả input, dates, amount, validation, create success, navigation/cancel.
- [ ] **ADM-012** — `/admin/campaigns/:campaignId`: campaign status, contribution statistics, edit/action nếu có, invalid ID.
- [ ] **ADM-013** — `/admin/scholarship-applications`: pending/approved/rejected/other statuses, filter/search/list count.
- [ ] **ADM-014** — `/admin/scholarship-applications/:id`: review documents, approve/reject, resulting balance, duplicate submission guard.
- [ ] **ADM-015** — `/admin/payments`: list payments sandbox, amount, status, filters/total, transaction references, detail action.
- [ ] **ADM-016** — `/admin/transactions`: list transactions ledger, matching payments/enrollments/earnings, filter/date/totals, permissions.
- [ ] **ADM-017** — `/admin/reports`: complaint queue, status/filter, evidence privacy, review/action/resolve nếu code cho phép.
- [ ] **ADM-018** — Kiểm tra Admin không được bypass state machine bằng request giả, không duyệt lặp/sai trạng thái.
- [ ] **ADM-019** — Kiểm tra every destructive UI action: confirmation, authorization, error handling; **chỉ thao tác trên fixture sandbox**.
- [ ] **ADM-020** — Kiểm tra AdminUsersPage tag `Chờ xác thực` và action dẫn đến đúng verification detail nếu có; GAP-05.
- [ ] **ADM-021** — Kiểm tra thông báo và audit log các admin actions nếu API/model hiện thực; ghi đúng người/timestamp/action.
- [ ] **ADM-022** — Kiểm tra admin GET `/api/admin/dashboard`, `/api/admin/users`, `/api/admin/teacher-verifications` API paging contract và role restrictions.

### 5.10. Community: chat, tin nhắn, report, notification, đánh giá

- [ ] **COM-001** — Inventory route/message panel thực tế (có thể không nằm trong route matrix báo cáo); xác định sidebar chat bên trái/từng layout nếu đã tồn tại.
- [ ] **COM-002** — Tạo conversation Student-Teacher bằng test accounts đã được phép; list conversations, tìm user, open thread, phân trang nếu có.
- [ ] **COM-003** — Gửi tin nhắn thường, Unicode, emoji, text dài, trống/whitespace, duplicate click, reconnect; sender/receiver đúng.
- [ ] **COM-004** — Nhận tin qua REST polling, timing/focus/unread badge/mark read, thứ tự timestamp, không tự xưng realtime websocket nếu chưa có.
- [ ] **COM-005** — Xem lịch sử khi refresh/relogin, phân quyền conversation riêng, direct URL/ID khác account không đọc được.
- [ ] **COM-006** — Attachments trong chat nếu code có: loại file, size, preview/download, signed link/permission.
- [ ] **COM-007** — Báo cáo vi phạm/khiếu nại từ Student/Teacher (nếu API hỗ trợ): target, reason, optional evidence, duplicate, anonymous/identity theo policy.
- [ ] **COM-008** — Admin xem `Reports`, lọc trạng thái, chi tiết, xử lý/đóng/reopen nếu có, phản ánh user side.
- [ ] **COM-009** — Notifications list/unread/read/delete nếu code hiện thực: event liên quan course approval/class/payment/scholarship và quyền sở hữu.
- [ ] **COM-010** — Reviews từ Student sau khi học: điều kiện đã tham gia, điểm sao giới hạn, một đánh giá/lớp theo policy, text validation.
- [ ] **COM-011** — Public teacher/course/class reviews: aggregate sao đúng, không leak danh tính nếu policy, report abuse nếu hỗ trợ.
- [ ] **COM-012** — XSS content hiển thị dưới dạng escaped text an toàn; file/chat content không được chạy HTML/script (test benign marker).
- [ ] **COM-013** — Kiểm tra không thể giả senderId/userId của account khác qua body nếu có, chỉ sandbox fixtures.

### 5.11. API contract & data model chi tiết

- [ ] **API-001** — Khám phá chính xác toàn bộ Express routes: authRoutes, accountRoutes, catalogRoutes, communityRoutes, courseCatalogRoutes, enrollmentRoutes, financeRoutes, paymentRoutes, scholarshipRoutes, studentRoutes, teachingRoutes; mapping controller -> service -> model.
- [ ] **API-002** — Đối chiếu từng API method/path/params/body với FE services (24 services theo báo cáo) và TypeScript types; đánh dấu orphaned/unconsumed/mismatched.
- [ ] **API-003** — Kiểm tra envelope `{success,data,message,error}`, payload khi thành công/lỗi, HTTP code nhất quán, cookie/auth headers, Content-Type.
- [ ] **API-004** — Pagination chuẩn `{items,total,page,pageSize,totalPages}` cho mọi endpoint list; FE đọc đúng property, total/pagination.
- [ ] **API-005** — Mọi enum/state machine ở User, Class, Enrollment, Session, VerificationDocument, Scholarship; illegal transitions phải bị chặn.
- [ ] **API-006** — Mọi ID invalid/case khác/ID đã xóa/no permission, thiếu required field, null, wrong type, extra fields, decimals, Unicode.
- [ ] **API-007** — Validate price/amount/seat/capacity/grade/date: negative, zero, min/max, end before start, timezone/UTC và overflow.
- [ ] **API-008** — Atomicity/consistency Enrollment-Payment-Transaction-Earning, Scholarship-Usage, Verification-TeacherProfile, Contribution-Campaign tổng hợp.
- [ ] **API-009** — Dữ liệu public vs private: leak storageKey, signed URL, CCCD, password hashes, JWT/refresh token, internal stack traces.
- [ ] **API-010** — Query filtering/search, indexing/performance trên dataset có sẵn; không tạo stress traffic hoặc mutate prod.
- [ ] **API-011** — CORS và preflight, cache headers private endpoints, rate limiting nếu cấu hình, same origin, response sensitive caching.
- [ ] **API-012** — `/api/files/download` signature/expiry/path traversal protection qua test không gây hại (invalid signature/expired URL/test fixtures).
- [ ] **API-013** — API session join token claims/serverURL và access limitations theo enrolled user.
- [ ] **API-014** — `expireEnrollmentsJob`: đọc schedule, kiểm tra tác dụng trên fixture expired nếu có và môi trường an toàn, không ép chạy job gây ảnh hưởng chung.
- [ ] **API-015** — Mongo Mongoose constraints, unique indexes, transactions, error mapping; khác biệt SRS PostgreSQL vs MongoDB chỉ ghi finding nếu ảnh hưởng behavior.
- [ ] **API-016** — Backend tests hiện có `community.test.js`, `enrollment.test.js`, `jobs.test.js`, `platform.test.js`: chỉ chạy nếu bảo đảm không mutate source hoặc shared DB; ghi passed/failed/skipped và coverage thực.
- [ ] **API-017** — Frontend typecheck/lint nếu chỉ read hoặc chạy ở bản sao tạm; không tự động cài Vitest/Playwright/Cypress.
- [ ] **API-018** — API compatibility giữa FE 5173 và BE 3000: baseUrl, auth refresh, payload multipart vs JSON, retry/timeout, CORS/multiple tabs.
- [ ] **API-019** — Mọi endpoint không có FE consumer vẫn cần API test nếu thực sự hiện diện trong code; mọi FE service không được route dùng vẫn phải đánh giá dead/legacy code.

### 5.12. Bảo mật, độ ổn định, hiệu suất, accessibility và deploy readiness

- [ ] **NFR-001** — Toàn bộ role matrix 4x4: guest/student/teacher/sponsor/admin truy cập route và endpoint sai quyền; 401/403/redirect chính xác.
- [ ] **NFR-002** — IDOR trong class/enrollment/payment/profile/message/application/report/contribution/verification document trên tài khoản QA thứ hai.
- [ ] **NFR-003** — JWT expired/forged/missing/malformed, refresh/logout rotation, session reset, no sensitive tokens in URLs/logs/local storage exposures.
- [ ] **NFR-004** — Input injection benign markers: HTML/JS trong title/message/name/reason hiển thị escaped; không gửi payload khai thác gây hại.
- [ ] **NFR-005** — Multipart upload: invalid MIME/ext/magic bytes/oversize, filename traversal benign invalid strings, security errors không leak system paths.
- [ ] **NFR-006** — Signed URLs for private identity documents: expiry, invalid signature, unrelated owner, no direct static path access.
- [ ] **NFR-007** — Các endpoint admin mutate cần yêu cầu role+auth, chống mass-assignment fields (`role`, `verificationStatus`, `pricePaid`) qua API nếu parser cho phép.
- [ ] **NFR-008** — Double-click/double payment/duplicate webhook/retries/reconnect: idempotency và không nhân bản transaction.
- [ ] **NFR-009** — Consistency giữa cache TanStack Query + server state sau mutate/refresh/tab khác/đăng nhập user khác.
- [ ] **NFR-010** — Loading time UX navigation/list/detail trên điều kiện thực, Network tab requests count/size, không đưa ra benchmark nếu không đo.
- [ ] **NFR-011** — Check browser console/runtime warnings/unhandled errors/network failures khi đi qua tất cả route.
- [ ] **NFR-012** — A11y: keyboard navigation, forms labels/errors, modal focus trap, contrast, status badges accessible, responsive zoom 200%.
- [ ] **NFR-013** — Cross-browser ít nhất Chromium; Firefox/WebKit chỉ khi browser có sẵn, thiếu công cụ ghi BLOCKED/NOT_RUN.
- [ ] **NFR-014** — Offline/intermittent network bằng simulation an toàn: user sees retry, không duplicate POST/mất form.
- [ ] **NFR-015** — Compatibility với locale `vi-VN`, múi giờ VN, currency VND và ngôn ngữ validation.
- [ ] **NFR-016** — Reliability với empty DB/empty list/null profile (nếu có fixture) không crash giao diện.
- [ ] **NFR-017** — LiveKit prod readiness: chỉ đánh giá cấu hình/khả năng kết nối thật; không coi EDUNITY_DEV là production ready.
- [ ] **NFR-018** — Payment prod readiness: sandbox không tương đương gateway thật; cảnh báo rõ yêu cầu tích hợp/thẩm định webhook signature.
- [ ] **NFR-019** — E2E test automation coverage hiện chưa có theo báo cáo: kiểm tra có bổ sung runner mới hay chưa, không tự cài.
- [ ] **NFR-020** — Source cleanliness: dead imports/unreferenced mocks, strict type errors, conflicts trong routing; ghi finding, không xóa.

### 5.13. Chuỗi E2E liên vai trò bắt buộc

- [ ] **E2E-001** — `E2E-A` Teacher guest -> đăng ký -> login -> upload tài liệu hợp lệ -> submit PENDING -> Admin list thấy -> detail -> approve -> Teacher VERIFIED -> tạo lớp -> Admin duyệt -> Student khám phá lớp.
- [ ] **E2E-002** — `E2E-B` Teacher nộp hồ sơ sai/thiếu file -> báo lỗi -> sửa file -> submit -> Admin reject với lý do -> Teacher xem lý do và nộp lại nếu state machine cho phép.
- [ ] **E2E-003** — `E2E-C` Student guest -> register/login -> class discovery -> chọn lớp FREE -> enrollment confirmed -> schedule -> join session -> attendance -> review nếu đủ điều kiện.
- [ ] **E2E-004** — `E2E-D` Student PAID -> enroll PENDING_PAYMENT -> checkout -> sandbox success webhook -> Enrollment CONFIRMED -> Student my classes -> history payments (không mock) -> Teacher revenue -> Admin payments/transactions.
- [ ] **E2E-005** — `E2E-E` Student PAID -> checkout fail/duplicate webhook -> không ghi nhận trả hai lần -> trạng thái Enrollment/Payment/Transaction phù hợp policy.
- [ ] **E2E-006** — `E2E-F` Admin tạo campaign -> Sponsor đóng góp sandbox -> campaign progress update -> Student apply -> Admin approve -> Student nhận scholarship -> dùng FULL/MIXED khi thanh toán -> balance/usage update.
- [ ] **E2E-007** — `E2E-G` Teacher proposal course -> Admin review -> course public catalog -> Teacher tạo class -> Admin approve -> Student enroll -> calendar/classroom.
- [ ] **E2E-008** — `E2E-H` Teacher session create/schedule -> Student calendar -> cả hai join LiveKit hoặc DEV (phân biệt) -> attendance end -> teacher/student views match.
- [ ] **E2E-009** — `E2E-I` Student/Teacher chat -> other receives via polling -> Student reports incident -> Admin sees report -> action/resolve nếu hỗ trợ -> state update.
- [ ] **E2E-010** — `E2E-J` Role isolation: Student A vs Student B; teacher A vs teacher B; Guest vs protected URLs; unauthorized API calls; no data leakage.
- [ ] **E2E-011** — `E2E-K` Profile update + avatar mỗi vai trò có hỗ trợ -> headers, public teacher cards, dashboards và refresh/login lại đồng bộ.
- [ ] **E2E-012** — `E2E-L` Expired hold/cancel enrollment frees seat -> another student can enroll, reservation/payment consistency, chỉ nếu safe test environment hỗ trợ.

---

## 6. DANH MỤC ROUTE GỐC — PHẢI MỞ TỪNG URL, KHÔNG BỎ SÓT

Trong inventory sau đây, `CODE_PRESENT` không có nghĩa runtime PASS. Có thể route thực tế đã đổi: ghi `BASELINE_CHANGED` trong báo cáo và cập nhật test inventory hiện tại.

| Role | Route baseline |
|---|---|
| Public | `/`, `/classes`, `/classes/:classId`, `/teachers`, `/teachers/:teacherId`, `/courses`, `/courses/:courseId`, `/campaigns`, `/campaigns/:campaignId`, `/login`, `/register`, `/register/teacher`, `/register/teacher/qualification`, `/register/teacher/pending`, `/enrollment/:classId` (legacy), `/checkout/:enrollmentId`, `/classroom/:sessionId` |
| Student | `/student`, `/student/classes/:classId`, `/student/schedule`, `/student/enrollments`, `/student/profile`, `/student/payments`, `/student/scholarships`, `/student/scholarships/applications`, `/student/scholarships/explore` |
| Teacher | `/teacher`, `/teacher/classes`, `/teacher/classes/create`, `/teacher/classes/:classId`, `/teacher/courses`, `/teacher/course-proposals`, `/teacher/schedule`, `/teacher/profile`, `/teacher/revenue`, `/teacher/reviews` |
| Admin | `/admin`, `/admin/users`, `/admin/teachers/verifications`, `/admin/teachers/verifications/:id`, `/admin/classes`, `/admin/classes/:classId`, `/admin/catalog`, `/admin/course-proposals`, `/admin/campaigns`, `/admin/campaigns/create`, `/admin/campaigns/:campaignId`, `/admin/scholarship-applications`, `/admin/scholarship-applications/:id`, `/admin/payments`, `/admin/transactions`, `/admin/reports` |
| Sponsor | `/sponsor`, `/sponsor/profile`, `/sponsor/contributions` |

**Quy tắc tuyệt đối:** đọc `router.tsx`, `routePaths.ts` và layout/menu source để tìm thêm nested/dynamic routes ngoài danh sách trên. Test 404/missing param, direct URL, role guard và control trên từng route. Nếu số route inventory cuối cùng không khớp báo cáo, đưa diff hai bên, không tự sửa routing.

---

## 7. DANH MỤC ENDPOINT BASELINE — PHẢI XÁC MINH QUA ROUTE SOURCE

| Method | Endpoint | Điều cần test trọng yếu |
|---|---|---|
| POST | `/api/auth/register` | role, duplicate email, request schema |
| POST | `/api/auth/login` | valid/invalid, JWT/session |
| POST | `/api/auth/refresh` | expired/rotation/revoked |
| POST | `/api/auth/logout` | revoke + cleanup |
| GET | `/api/auth/me` | correct role/user |
| GET / PATCH | `/api/me/profile` | role profile, validation |
| POST | `/api/me/avatar` | MIME, profile null, saved URL |
| POST | `/api/uploads/private` | ownership, magic bytes, purpose |
| POST | `/api/uploads/public` | role, MIME, static URL |
| GET | `/api/files/download` | signed key, expires, signature |
| POST / GET | `/api/teacher/verification` | submit/status transitions |
| GET | `/api/admin/teacher-verifications` | items/total pagination |
| GET | `/api/admin/teacher-verifications/:id` | private detail |
| POST | `/api/admin/teacher-verifications/:id/approve` | approval rules |
| POST | `/api/admin/teacher-verifications/:id/reject` | reviewNote, reject rules |
| GET | `/api/catalog/categories` | category/subject schema |
| GET | `/api/classes` | class discovery search/filter |
| GET | `/api/classes/:id` | class details/sessions |
| GET | `/api/courses` | course discovery |
| POST | `/api/teacher/course-proposals` | teacher proposal validation |
| GET | `/api/admin/course-proposals` | admin pagination |
| GET | `/api/teacher/classes` | teacher ownership |
| POST | `/api/teacher/classes` | verified guard |
| POST | `/api/classes/:id/enrollments` | seat hold/duplicate |
| POST | `/api/enrollments/:id/payments` | amount/payment creation |
| POST | `/api/payments/sandbox/webhook` | sandbox only + idempotency |
| GET | `/api/me/payments` | history actual backend, check source |
| POST | `/api/sessions/:id/join` | role/access and provider |
| GET | `/api/campaigns` | public campaigns |
| POST | `/api/admin/campaigns` | validate campaign |
| POST | `/api/campaigns/:id/applications` | scholarship apply |
| GET | `/api/admin/dashboard` | aggregates |
| GET | `/api/admin/users` | users/filter/ownership |

**Quan trọng:** đây chỉ là các endpoint *nêu trong báo cáo*; không phải danh sách API đầy đủ. Đọc toàn bộ **11 file backend routes** để thu thập **mọi** endpoint còn lại (finance, enrollment cancel/availability, sessions, admin approval, class catalog, notifications, chat, reviews, sponsor, reports, etc.) và bổ sung test từng endpoint. Không tự suy ra tên endpoint từ yêu cầu nếu code không có: ghi `DISCOVER_FROM_SOURCE` và test theo path thực tế.

---

## 8. CÁC PHÁT HIỆN ĐÃ CÓ: PROTOCOL TÁI KIỂM CHỨNG 6 GAP

| ID | Tiền điều kiện | Test bắt buộc | Kết luận đúng cách |
|---|---|---|---|
| GAP-01 | Admin + teacher pending trong TEST | GET `/api/admin/teacher-verifications?status=PENDING` quan sát payload; mở `/admin/teachers/verifications` quan sát rows/total. So FE TS type và `.items` vs `.data`. | `CONFIRMED` nếu API có items mà UI hiển thị 0; `NOT_REPRODUCED` nếu UI đúng; `BLOCKED` nếu không có dữ liệu/môi trường. |
| GAP-02 | Student đã trả sandbox thành công | Xem `/student/payments` và GET `/api/me/payments`; trace router/component/service và refresh/browse khác. | `CONFIRMED` nếu backend có payment mà UI không có vì mock; không kết luận từ trang rỗng khi không có giao dịch. |
| GAP-03 | Tập file giả `.pdf/.jpg/.png/.webp` với MIME đặc biệt | Thử thông qua input UI và kiểm tra validators/safe mocked file input nếu công cụ cho phép, không sửa source. | Phân biệt browser-rejected/backend-rejected/upload-success và MIME nào gây lỗi. |
| GAP-04 | Tài khoản Teacher sandbox **có sẵn** teacherProfile=null | Upload avatar (sandbox only), quan sát 400 code. | Thiếu fixture -> `BLOCKED`, không trực tiếp sửa DB để tạo null. |
| GAP-05 | Admin users list có teacher PENDING | Mở drawer/detail và kiểm kê action tới verification, đồng thời kiểm tra sidebar route có thể duyệt. | Ghi UX gap, không đồng nhất với luồng xét duyệt hỏng. |
| GAP-06 | Source tree hiện tại | Tìm references/imports của từng mock file; đối chiếu các consumer. | `SOURCE_FINDING`, không tự xóa file và không gọi runtime FAIL nếu không có ảnh hưởng. |

---

## 9. KỊCH BẢN BOUNDARY / NEGATIVE CHUNG CHO MỌI TRƯỜNG

Với **mọi** form và API mutate có trong code (chỉ thực thi trên sandbox xác minh):

- Thiếu từng required field; null/undefined/empty string; whitespace; string dài; Unicode/Vietnamese; malformed email/URL/ID; type mismatch; số âm, 0, số thập phân, vượt max; valid boundary min/max.
- Người dùng không có quyền; sai chủ sở hữu; resource đã xóa/không tồn tại; trạng thái không cho phép; repeated submit; submit khi loading; refresh tại thời điểm request.
- API trả 400/401/403/404/409/500, response malformed, timeout/connection refused; UI báo lỗi đúng, không crash và không làm mất dữ liệu nhập.
- Kết quả success phản ánh đúng vào bảng/list/detail, dashboard, counter/notification sau `invalidateQueries` / reload / tab thứ hai.
- Xác minh dữ liệu UI không bị mock hoặc stale: so API trực tiếp, Network response, render, after-refresh state.
- Mỗi file upload cần `filename/ext`, MIME declared, magic byte, size, file nhiều lần, permission denied, signed URL, storage visibility.
- Mỗi bảng cần filter tổ hợp, sort trang đầu/cuối, paging với zero/one/many rows, stale total, clear filter, record removed/updated.

**Nếu chức năng không tồn tại**: sau khi kiểm tra route/components, ghi `NOT_IMPLEMENTED` (feature gap) trong báo cáo, trạng thái test case `N/A` kèm bằng chứng. **Nếu tồn tại nhưng không chạy vì thiếu cấu hình**: `BLOCKED`, không nhầm với feature gap.

---

## 10. CÁCH THỰC THI KHÔNG THAY ĐỔI SOURCE

1. Mở và ghi snapshot `pwd`, git branch/HEAD/status, bộ đếm tracked/untracked/ignored, danh sách services running, env names được redacted; **không in giá trị `MONGODB_URI`, API key, JWT secrets**.
2. Chỉ đọc source bằng search/grep/IDE. Thu đủ toàn bộ route/UI control, đối chiếu mỗi route một dòng trong test inventory.
3. Ưu tiên browser test với automation tool **đã cài sẵn** nếu có; tuyệt đối không cài dependency trong repo. Nếu không có browser automation, chạy thủ công và ghi phương thức; nếu không thể tương tác browser, không giả báo cáo test UI PASS.
4. Tạo test data only in verified sandbox. Có thể login, CRUD, upload giấy tờ giả, chạy webhook sandbox bằng UI/API hợp lệ nếu chắc chắn không làm ảnh hưởng dữ liệu thật. Không bao giờ dùng fixture chứa thông tin người thật.
5. Trước/sau mỗi workflow, đọc API state để xác nhận persistence và consistency; ghi rõ `dev fallback` khi LiveKit giả lập; ghi rõ `sandbox` khi payment không thật.
6. Với backend tests hiện có, kiểm tra config để biết có chạy MongoMemoryServer biệt lập không; nếu thật sự cách ly và không viết repo thì chạy; nếu test tạo log/coverage trong repo, đổi đường output ra ngoài repo chỉ khi script/tool hỗ trợ mà không sửa source, nếu không skip.
7. Snapshot final Git và storage/env unaffected; nếu test tạo dữ liệu QA chỉ trong sandbox, đưa danh sách test IDs/cleanup status. Nếu cleanup gây dữ liệu thật mất hoặc thiếu quyền: không cleanup và ghi rõ.
8. Sau chạy lập **tất cả** file report được chỉ định ở mục 0 ngoài repo; không dừng ở việc trả “OK, đã test xong”.

---

## 11. MẪU BÁO CÁO BẮT BUỘC (`EDUNITY_FULL_TEST_REPORT.md`)

Xuất nội dung có cấu trúc sau, kèm liên kết/tên artifact bằng chứng nếu lưu được:

### 11.1. Phạm vi, môi trường và tính toàn vẹn
- Thời gian bắt đầu/kết thúc, tester/tool, commit/branch, URL FE/API **không bí mật**, phiên bản browser, loại DB đã xác minh (TEST / unknown) và quyền thao tác.
- Xác nhận `SOURCE CHANGES = 0` (hoặc lý do không xác định). Có/không làm thay đổi dữ liệu sandbox: số fixture tạo, nơi lưu, cleanup.
- Phân biệt **source inspection**, **API real execution**, **UI browser real execution**, **integration sandbox simulation**, **blocked**.

### 11.2. Tổng quan kết quả
- Tổng test case: `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN`, `N/A`, `CODE_REVIEW_ONLY`; **không bỏ sót trạng thái**.
- Số route hiện có/đã mở thành công/đã kiểm tra mọi controls; số endpoint hiện có/đã gọi/đã test negative; số workflow xuyên vai trò test đủ.
- Tổng bug P0/P1/P2/P3, bản đồ ảnh hưởng business, top 10 blocker.
- Bảng theo Role (Public/Student/Teacher/Sponsor/Admin) và Module, có tỷ lệ thực thi `(PASS+FAIL)/(PASS+FAIL+BLOCKED+NOT_RUN)` và tỷ lệ pass runtime `PASS/(PASS+FAIL)` khi mẫu đủ; nêu định nghĩa.

### 11.3. Bằng chứng đã kiểm thử theo module
Với **mỗi module**: route/API tested, danh sách case IDs PASS/FAIL/BLOCKED/NOT_RUN, expected/actual trọng yếu, screenshots/log refs, những controls nhỏ chưa test, các contract mismatch, dữ liệu mock/stale.

### 11.4. Báo cáo riêng 6 GAP được nêu ở Phase 0
Mỗi GAP: `CONFIRMED / NOT_REPRODUCED / BLOCKED / SOURCE_ONLY`, nguồn baseline, bằng chứng hiện tại, tái hiện, impact, severity; **không ghi đã sửa**.

### 11.5. Báo cáo bug chi tiết
Mỗi bug `BUG-001...`: title, module, severity/priority/confidence, environment/role, prereq, exact steps, expected, actual, evidence, request/response redacted, frequency, suspected root cause (nếu có và gắn nhãn **giả thuyết**), links case ID, **NO CODE CHANGES**.

### 11.6. Những lỗ hổng bao phủ và blockers
Tách biệt `NOT_IMPLEMENTED`, `ENV_BLOCKER`, `MISSING_TEST_DATA`, `NO_BROWSER`, `NO_PERMISSION`, `SAFETY_HOLD`, `TOOL_LIMITATION`. Liệt kê rõ từng case bị chặn và cách cho phép kiểm thử tiếp mà không thay đổi source.

### 11.7. Tính nhất quán nghiệp vụ & data
Phân biệt source-deduced với runtime confirmed. Nêu các mismatch giữa Student/Teacher/Admin/Sponsor views, payment/enrollment, scholarship, verification, class/sessions, notifications; ghi commit baseline.

### 11.8. Kết luận go/no-go có điều kiện
Không tuyên bố “production ready” khi sandbox payment/EDUNITY_DEV hoặc chưa có E2E automation. Đề xuất thứ tự sửa **chỉ mô tả**, không viết patch; tái kiểm thử cần làm sau khi team tự sửa.

---

## 12. MẪU BUG REGISTER CSV VÀ EVIDENCE INDEX

**`EDUNITY_BUG_REGISTER.csv` header**:

`BugID,Severity,Priority,Confidence,Module,Role,Route_or_API,Title,Preconditions,ReproSteps,Expected,Actual,Frequency,HTTP_Status,RelatedTestIDs,EvidenceRefs,SuspectedCause,Status,Notes`

**`EDUNITY_TEST_EVIDENCE_INDEX.md`**: một bảng `EvidenceID | CaseIDs | Timestamp | CaptureMethod | Redaction | Path/Reference | WhatItProves`. Dùng tên `EV-0001`, `EV-0002`, ...; không đính kèm token/mật khẩu/file CCCD thật, chuỗi ký HMAC hay secrets trong screenshots/HAR.

**`EDUNITY_TEST_CASE_RESULTS.csv`**: giữ đủ các case baseline ở mục 5 + mọi case mở rộng đã tìm trong source. Các case chưa thể chạy vẫn phải xuất `BLOCKED` hoặc `NOT_RUN`, **không xóa khỏi file**. Không tạo kết quả PASS/FAIL giả.

---

## 13. KIỂM TRA TÍNH ĐẦY ĐỦ TRƯỚC KHI KẾT THÚC

Phải tự hỏi và ghi câu trả lời trong báo cáo:

- Đã duyệt **mọi route hiện có** và link/menu dẫn tới chúng chưa? Có route bị bỏ quên hoặc chỉ source-reviewed không?
- Đã inventory **mọi endpoint** từ 11 route files và **mọi FE services/components có user interaction** chưa?
- Có trang nào ghi `VERIFIED` chỉ dựa báo cáo cũ không? Nếu có, hạ trạng thái đúng về `CODE_REVIEW_ONLY/NOT_RUN`.
- Có test từng nút nhỏ: upload/clear, dropdown/sort/page, modal/cancel/confirm, tooltip, lỗi form, empty/error/retry/disabled/loading không?
- Đã kiểm chứng 6 GAP bằng chứng mới, đúng môi trường chưa?
- Đã test cross-role E2E và xác thực dữ liệu xuyên module/refresh/logout chưa?
- Có ngộ nhận EDUNITY_DEV thành LiveKit thật hoặc sandbox payment thành thanh toán thật không?
- Có chức năng mới trong code chưa được thêm vào test matrix không?
- Có P0/P1 nào chưa có steps + evidence + cross-role impact không?
- Đã redacted mọi secret/PII và kiểm tra source/git nguyên vẹn chưa?

**Quy tắc báo cáo cuối:** Chỉ nói “đã kiểm thử toàn bộ” khi coverage thực thi thật đạt 100% inventory và không còn `BLOCKED/NOT_RUN`. Nếu không, báo số liệu thực và phần còn thiếu, tuyệt đối trung thực.

---

## 14. LỆNH THỰC THI DÀNH CHO AI AGENT

**Hãy bắt đầu ngay** bằng việc xác minh sự tồn tại của repository Edunity ở đường dẫn mà tôi cấp, đọc nguồn và kiểm tra quyền/môi trường an toàn. Không hỏi lại những thông tin đã hiện diện trong source/report; chỉ nêu blocker cần quyền xác minh môi trường khi thao tác ghi không an toàn. Tiến hành đọc, liệt kê, kiểm tra, **thực thi các ca test hợp lệ**, thu thập bằng chứng và xuất đủ các báo cáo theo chuẩn trên. Nếu bị giới hạn công cụ/thời gian, vẫn xuất ma trận đầy đủ, ghi trạng thái thực từng case và những việc chưa chạy.

**TUYỆT ĐỐI KHÔNG FIX LỖI, KHÔNG SỬA CODE, KHÔNG TỰ THAY ĐỔI CONFIG/DB PROD, KHÔNG TẠO FILE TRONG REPOSITORY.**
