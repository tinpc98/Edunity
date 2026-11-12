# EDUNITY V3 — CHECKLIST PHÂN CÔNG CÔNG VIỆC

**Hướng dẫn:** Thay `[ ]` bằng `[x]` khi hoàn thành và đã kiểm thử. Danh sách này là backlog phân công mới, không có nghĩa tất cả các chức năng đều chưa được viết.

**Phạm vi:** Tin phụ trách toàn bộ Payment/Finance; Băng phụ trách Frontend và QA; Bảo phụ trách Security/eKYC/hợp đồng; Châu phụ trách Backend đào tạo/LMS/DB phi tài chính.

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
### G3 · G3 — Học tập, bài tập, đánh giá

- [ ] **LMS-02** — UI Student làm placement / Teacher tạo và xem kết quả _(ưu tiên P1; tiêu chí: Tự lưu bài, nộp đúng hạn, quyền riêng)_
- [ ] **LMS-04** — Trang giáo án, tài liệu, bài tham khảo cho Student/Teacher _(ưu tiên P1; tiêu chí: Hiển thị theo Class, Session, Course)_
- [ ] **LMS-06** — UI giao bài, nộp bài, xem feedback và hạn nộp _(ưu tiên P1; tiêu chí: Đủ trạng thái open/submitted/graded/late)_
- [ ] **LMS-09** — UI tạo đề, thi online, kết quả, review bài thi _(ưu tiên P1; tiêu chí: Timer server-trusted, lỗi mạng có xử lý)_
- [ ] **LMS-11** — UI đánh giá giảng viên sau buổi và cuối khóa _(ưu tiên P1; tiêu chí: Phân biệt 2 loại, có kênh khiếu nại)_
- [ ] **LMS-15** — UI tiến bộ học tập Student và kết quả nhóm cho Teacher/Admin _(ưu tiên P2; tiêu chí: Không lộ dữ liệu điểm học sinh khác)_
### G3 · Nghiệm thu & vận hành

- [ ] **QA-03** — Browser E2E Student → Enroll → Join → Homework → Review _(ưu tiên P0; tiêu chí: Kịch bản cross-role chạy được trên Staging)_
### G1 · Nghiệm thu & vận hành

- [ ] **QA-04** — Browser E2E Teacher KYC → Contract → Class → Incident _(ưu tiên P0; tiêu chí: Không có bước bypass; ghi nhận trace)_
### G2 · Nghiệm thu & vận hành

- [ ] **QA-05** — Browser E2E QR payment + scholarship + Sponsor Donate (Băng test độc lập, Tin sửa lỗi tài chính) _(ưu tiên P0; tiêu chí: Các trạng thái pending/success/error chính xác)_
### G3 · Nghiệm thu & vận hành

- [ ] **QA-09** — Kiểm thử UI responsive, accessibility, lỗi kết nối, loading _(ưu tiên P2; tiêu chí: 4 vai trò thao tác được trên desktop/mobile)_

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
### G3 · G3 — Học tập, bài tập, đánh giá

- [ ] **LMS-01** — Assessment PLACEMENT đầu vào theo Class/Course/Syllabus _(ưu tiên P1; tiêu chí: Làm bài, nộp bài, trả kết quả; không chặn học mặc định)_
- [ ] **LMS-03** — LearningResource/Tài liệu học và quyền truy cập file _(ưu tiên P1; tiêu chí: Chỉ người có quyền mới tải tài liệu riêng)_
- [ ] **LMS-05** — Assignment + Submission + deadline + file upload _(ưu tiên P1; tiêu chí: Nộp nhiều lần theo quy định, không xem bài của bạn học)_
- [ ] **LMS-07** — Grade/Feedback, rubric và lịch sử chấm điểm _(ưu tiên P1; tiêu chí: Không mất lịch sử sửa điểm, quyền Teacher chính xác)_
- [ ] **LMS-08** — Assessment, Question, Attempt và chấm trắc nghiệm/tự luận _(ưu tiên P1; tiêu chí: Câu hỏi/snapshot đề thi được version, tránh lộ đáp án)_
- [ ] **LMS-10** — Review Teacher sau mỗi Session và cuối Class _(ưu tiên P1; tiêu chí: Mỗi học viên 1 review đúng scope và điều kiện)_
- [ ] **LMS-12** — Teacher đánh giá quá trình và tiến bộ Student theo quyền _(ưu tiên P2; tiêu chí: Lưu theo Class, không phát tán điểm riêng tư)_
- [ ] **LMS-13** — Messaging Student–Teacher trong Class (tùy chọn) _(ưu tiên P3; tiêu chí: Chỉ thành viên lớp, có báo cáo lạm dụng)_
- [ ] **LMS-14** — Tổng hợp kết quả học tập, tiến bộ và attendance cho dashboard _(ưu tiên P2; tiêu chí: Dữ liệu từ Assignment/Assessment/Session, không mock)_
### G0 · Nghiệm thu & vận hành

- [ ] **QA-01** — Hồi quy Session 05D/E: pre-open 10p, join 20p, online, attendance 70% (bảo trì từ code Tin) _(ưu tiên P0; tiêu chí: Có test webhook mất/trùng và auto-close đúng rule)_
- [ ] **QA-07** — Backup/restore và migration thử nghiệm trên DB clone _(ưu tiên P0; tiêu chí: Có log khôi phục và thời gian phục hồi kiểm chứng)_
### G4 · G4 — AI (sau MVP)

- [ ] **AI-01** — Đánh giá AI hỗ trợ gợi ý tài liệu cho Student (chỉ từ dữ liệu được phép) _(ưu tiên P3; tiêu chí: Không dùng hồ sơ KYC hay dữ liệu cá nhân nhạy cảm)_
- [ ] **AI-02** — AI hỗ trợ giáo viên soạn giáo án, câu hỏi, bài tập _(ưu tiên P3; tiêu chí: Có người duyệt nội dung, không tự publish)_
- [ ] **AI-03** — AI báo cáo tổng hợp Admin và giám sát chất lượng _(ưu tiên P3; tiêu chí: Sử dụng dữ liệu tổng hợp, bảo mật quyền)_
- [ ] **AI-04** — AI tổng hợp báo cáo tác động nhà tài trợ _(ưu tiên P3; tiêu chí: Không lộ dữ liệu người thụ hưởng)_

---

**Lưu ý:** Các mục phụ thuộc nhà cung cấp thật, tiền thật, hồ sơ định danh hoặc quyết định chưa hoàn tất chỉ triển khai ở mức an toàn đến khi chính sách được xác nhận.
