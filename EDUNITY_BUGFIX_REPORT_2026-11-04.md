# Báo cáo sửa lỗi Edunity — 04/11/2026

Tài liệu tổng hợp các lỗi đã sửa trên nhánh `BE-2` (Backend + Frontend): lỗi là gì, đã sửa ra sao, sửa ở đâu.
Mã lỗi (L01, C01...) theo bảng rà soát lỗi trước khi sửa.

**Kết quả kiểm tra:** Backend 358/358 test đạt (17 bộ test). Frontend: TypeScript không lỗi, `npm run build` thành công.
Chưa chạy thử trên trình duyệt, chưa thử với LiveKit thật và cổng thanh toán thật.

---

## Việc cần làm khi kéo code về

| Việc | Lý do |
|---|---|
| Thêm `DNS_SERVERS=8.8.8.8,1.1.1.1` vào `BackEnd/.env` (nếu máy bạn cần) | Dòng ép DNS trong `server.js` đã chuyển thành cấu hình. Thiếu thì có thể báo lỗi `querySrv ECONNREFUSED` khi kết nối MongoDB Atlas |
| Cấu hình `LIVEKIT_EGRESS_OUTPUT_DIR` khi dùng LiveKit thật | Thư mục (nhìn từ container Egress) trùng volume với `STORAGE_DIR` của backend. Thiếu thì file ghi hình nằm trên máy LiveKit, không xem lại được |
| Xem các biến mới trong `BackEnd/.env.example` | `RECORDING_REQUIRED`, `RECORDING_RETENTION_DAYS`, `RECORDING_PROCESSING_TIMEOUT_HOURS`, `SESSION_AUTO_START_AFTER_MINUTES`, `DNS_SERVERS`, `LIVEKIT_EGRESS_OUTPUT_DIR` |

---

## 1. Buổi học trực tuyến và ghi hình

### Luồng mới
1. **Trước giờ học 10 phút:** job mở phòng (`status = WAITING`) và gửi thông báo "Phòng học đã mở", có câu báo trước buổi học sẽ được ghi hình.
2. **Giáo viên và học sinh vào phòng:** kiểm tra camera, micro. **Chưa ghi hình.** Màn hình chờ hiện thông báo về việc ghi hình.
3. **Giáo viên bấm "Bắt đầu buổi học"** (`POST /api/teacher/sessions/:id/start`): hệ thống bật ghi hình trước, thành công mới chuyển sang `IN_PROGRESS`.
4. **Trong buổi học:** ghi hình chạy liên tục, giáo viên không tắt được. Giáo viên rớt mạng thì ghi hình **không** dừng.
5. **Giáo viên bấm "Kết thúc buổi học":** dừng ghi hình (`PROCESSING`), đóng phòng, chốt điểm danh. Khi LiveKit báo xong thì chuyển sang `AVAILABLE` hoặc `FAILED`.

Nếu giáo viên đã ở trong phòng mà quá 10 phút sau giờ học vẫn chưa bấm "Bắt đầu", hệ thống tự bắt đầu buổi học.

**Vòng đời bản ghi:** `RECORDING` → `PROCESSING` → `AVAILABLE` | `FAILED` → `EXPIRED` (sau 90 ngày, file bị xoá).

### Chi tiết từng lỗi

| Mã | Lỗi trước đây | Đã sửa thế nào | File chính |
|---|---|---|---|
| L01 | Giáo viên kết thúc buổi học nhưng ghi hình không dừng | Gọi dừng ghi hình trước khi đóng phòng | `services/sessionService.js` (`endSession`) |
| L02 | Một buổi học có thể bị ghi hình 2 lần cùng lúc | Chỉ còn một hàm bật ghi hình dùng chung, có kiểm tra bản ghi đang chạy | `services/sessionPresenceService.js` |
| L03 | Buổi bị gián đoạn không bao giờ kết thúc, job xử lý lại mỗi phút và có thể làm nghẽn các buổi khác | Buổi `INTERRUPTED` đã đóng (`roomState = ENDED`) được coi là kết thúc: job bỏ qua, không vào lại được | `jobs/sessionLifecycleJob.js`, `sessionPresenceService.js`, `sessionService.js` |
| L04 | Giáo viên vào phòng là buổi học tự bắt đầu (3 chỗ code), không có nút "Bắt đầu" | Thêm API `/start`. Vào phòng chỉ mở phòng chờ | `sessionService.js` (`startSession`), `sessionPresenceService.js` (`beginTeaching`) |
| L05 | Bật ghi hình lỗi mà không báo cho ai | Thử lại 3 lần. Vẫn lỗi thì báo giáo viên và admin; nếu ghi hình bắt buộc thì trả `503 RECORDING_START_FAILED`, buổi học giữ `WAITING`, cho bấm lại | `sessionPresenceService.js`, `videoProvider.js` |
| L06 | File ghi hình nằm trên máy LiveKit nên backend không phát được | Đường dẫn file theo `LIVEKIT_EGRESS_OUTPUT_DIR` | `videoProvider.js` |
| L07 | Nút "Xem bản ghi" bấm không có tác dụng | Gọi API lấy link có hạn rồi mở ở tab mới; báo rõ khi bản ghi đang xử lý hoặc bị lỗi | FE `StudentClassSessionsPage.tsx`, `session.service.ts` |
| L08 | Chỉ học sinh `CONFIRMED` xem được bản ghi | Giáo viên của buổi học, admin, học sinh `CONFIRMED` và `COMPLETED` đều xem được | `studentService.js`, `studentController.js` |
| L09 | Giáo viên rớt mạng thì ghi hình bị cắt, bản ghi chỉ còn đoạn cuối | Ghi liên tục; chỉ dừng khi kết thúc, tự hoàn tất hoặc bị gián đoạn | `sessionPresenceService.js` |
| L10 | Không phân biệt "đang ghi" với "đang xử lý file", không lưu thời lượng | Thêm trạng thái `RECORDING`/`EXPIRED`; lưu thời lượng khi LiveKit báo xong; báo bản ghi sẵn sàng hoặc lỗi | `models/Session.js`, `sessionPresenceService.js` |
| L11 | Giáo viên bị đẩy ra khi dạy quá giờ | Giáo viên vào lại và giữ token thêm 30 phút sau giờ kết thúc | `sessionService.js` |
| L13 | Mở phòng nhưng `status` vẫn là `SCHEDULED` | Đổi sang `WAITING` cùng lúc với `roomState` | `sessionPresenceService.js` |
| L14 | Mọi lỗi khi xử lý webhook LiveKit đều trả về 401 | Chỉ trả 401 khi chữ ký sai; lỗi khác ghi log và trả 500 để LiveKit gửi lại | `teachingController.js` |
| L15 | Giao diện thiếu nút "Bắt đầu", thiếu chỉ báo "Đang ghi hình", thiếu thông báo trước | Đã thêm. Nút "Kết thúc" chỉ hiện khi buổi đang diễn ra | FE `ClassroomHeader.tsx`, `ClassroomPage.tsx`, `ClassroomPreJoin.tsx`, `LiveKitClassroom.tsx` |
| L16 | Chưa có thời hạn lưu bản ghi; bản ghi có thể kẹt mãi ở "đang xử lý" | Job xoá bản ghi sau 90 ngày; bản ghi kẹt `PROCESSING` quá 6 giờ thì chuyển `FAILED` và báo admin | `services/recordingMaintenanceService.js` (mới) |

## 2. Lớp học và lịch học

| Mã | Lỗi trước đây | Đã sửa thế nào | File chính |
|---|---|---|---|
| C01 | Lớp không bao giờ chuyển sang "đang học" hay "hoàn thành"; đăng ký không bao giờ `COMPLETED` | Job: lớp `OPEN` → `IN_PROGRESS` khi buổi đầu tiên đã bắt đầu; → `COMPLETED` khi mọi buổi đã xong và hết thời gian lớp. Khi hoàn thành: đăng ký → `COMPLETED`, thu nhập giáo viên → `AVAILABLE` | `services/classLifecycleService.js` (mới) |
| C02 | Giáo viên tự đổi giờ hoặc huỷ buổi khi lớp đã có học sinh, không qua duyệt | Lớp `OPEN`/`IN_PROGRESS`: chặn đổi giờ, huỷ và thêm buổi (`409 RESCHEDULE_REQUIRED`), phải gửi yêu cầu dời lịch. Vẫn sửa được tiêu đề và mô tả | `sessionService.js` |
| C03 | Tạo được các buổi trùng giờ nhau | Kiểm tra trùng giờ với mọi buổi của giáo viên, kể cả trong cùng lượt tạo (`409 SESSION_TIME_CONFLICT`) | `sessionService.js` |
| C04 | Tạo được buổi học trong quá khứ | Bắt buộc giờ bắt đầu sau hiện tại (`400 SESSION_IN_PAST`) | `sessionService.js` |
| C05 | Thêm được buổi học khi lớp đã mở tuyển sinh | Gộp chung với cách sửa C02 | `sessionService.js` |

Ở frontend, các lỗi lịch học hiện bằng tiếng Việt (`TeacherClassDetailPage.tsx`).

## 3. Đăng ký học

| Mã | Lỗi trước đây | Đã sửa thế nào | File chính |
|---|---|---|---|
| E01 | Đăng ký lớp miễn phí xong, nút vẫn hiện "Đăng ký ngay" | Làm mới dữ liệu đúng query key: danh sách đăng ký, số chỗ trống, lịch học | FE `useClassEnrollment.tsx` |
| E02 | Đang chờ thanh toán mà bấm lại thì bị báo lỗi, không quay lại trang thanh toán được | Gặp `DUPLICATE_ENROLLMENT` thì chuyển thẳng tới `/checkout/:id` | FE `useClassEnrollment.tsx` |
| E03 | Không có nút "Tiếp tục thanh toán" | Đăng ký đang chờ thanh toán hiện nút này | FE `ClassCard.tsx` |
| E04 | Có hai cách đăng ký khác nhau; thẻ lớp không có lựa chọn học bổng | Với lớp có phí, thẻ lớp dẫn sang trang chi tiết lớp (có cả trả trực tiếp và học bổng) | FE `useClassEnrollment.tsx` |
| E05 | Còn code thanh toán giả lập và câu "hệ thống mock" | Xoá `payment.service.ts` và các hàm giả lập; sửa câu thông báo | FE `enrollment.service.ts`, `EnrollmentPage.tsx` |

## 4. Tài chính

| Mã | Lỗi trước đây | Đã sửa thế nào | File chính |
|---|---|---|---|
| F02 | Thu nhập giáo viên không bao giờ được chi trả | Giáo viên gửi yêu cầu rút tiền (nhập tài khoản ngân hàng); admin xác nhận đã chuyển khoản hoặc từ chối kèm lý do | `services/payoutService.js` (mới), `routes/financeRoutes.js`; FE `TeacherPayoutSection.tsx`, `AdminPayoutsPage.tsx` (trang mới `/admin/payouts`) |
| F03 | Admin duyệt hoàn phí nhưng không có tiền hoàn thật | Tạo giao dịch `REFUND` (học phí ÷ số buổi), trừ vào thu nhập giáo viên chưa chi trả, báo cho học sinh; không duyệt lại được | `settlementService.js` (`issueSessionRefund`), `sessionIncidentService.js` |
| — | Yêu cầu hoàn phí không bao giờ gắn được khoản thanh toán (code tìm sai trạng thái `"SUCCESS"`) | Đổi thành `"COMPLETED"`; lấy đúng số tiền đã trả | `sessionIncidentService.js` |
| — | Sự cố xảy ra lại thì yêu cầu hoàn phí đã duyệt bị mở lại, có thể hoàn tiền 2 lần | Trạng thái chỉ được gán khi tạo mới | `sessionIncidentService.js` |
| F04 | Học bổng hết hạn vẫn giữ tiền của quỹ chiến dịch | Job chuyển học bổng sang `EXPIRED`, trả số dư chưa dùng về quỹ và báo học sinh | `services/scholarshipExpiryService.js` (mới) |
| F05 | Dùng tham số `new: true` đã cũ của mongoose | Đổi sang `returnDocument: "after"` | `paymentService.js`, `scholarshipPaymentService.js` |

**API mới:**
- `GET`/`POST /api/teacher/payouts`
- `GET /api/admin/payouts`
- `POST /api/admin/payouts/:id/complete`
- `POST /api/admin/payouts/:id/reject`

Xem chi tiết trong `BackEnd/docs/api-contract-finance.md`.

## 5. Thông báo

| Mã | Lỗi trước đây | Đã sửa thế nào | File chính |
|---|---|---|---|
| N01 | Bấm vào thông báo thường đi sai trang (đoán theo chữ trong tên loại, không xét vai trò) | Một hàm chung chọn trang theo loại thông báo **và** vai trò | FE `features/notifications/notificationRoute.ts` (mới) |
| N02 | Frontend bỏ mất `sessionId` của thông báo | Giữ lại trường này | FE `communicationAdapters.ts`, `types/communication.ts` |
| N03 | Nhiều sự kiện không gửi thông báo | Đã thêm: đăng ký lớp miễn phí, có học sinh mới (cho giáo viên), hết hạn giữ chỗ, thanh toán thất bại, phòng học đã mở, bản ghi sẵn sàng/lỗi, hoàn phí, rút tiền, lớp hoàn thành, học bổng hết hạn | `notificationService.js`, `enrollmentService.js`, `paymentService.js`, `expireEnrollmentsJob.js`... |
| N04 | Hiện thẳng mã loại thông báo (ví dụ `TEACHER_WARNING_YELLOW`) | Đổi sang nhãn tiếng Việt | FE `NotificationsPage.tsx` |
| N05 | Vẫn tải lại thông báo khi tab đang ẩn | Tắt tải lại khi tab ẩn | FE `NotificationPopover.tsx` |

## 6. Hạ tầng và chất lượng code

| Mã | Lỗi trước đây | Đã sửa thế nào | File chính |
|---|---|---|---|
| H02 | DNS bị ép thành `8.8.8.8`/`1.1.1.1` trong code | Chuyển thành biến tuỳ chọn `DNS_SERVERS` | `server.js` |
| H03 | Chạy nhiều instance backend thì job nền chạy trùng | Khoá dùng chung trong MongoDB, tự hết hạn | `jobs/jobLock.js`, `models/JobLock.js` (mới) |
| H04 | Trang chủ có nhận xét và tin tức tự đặt ra, số liệu không có cơ sở | Ẩn mục nhận xét và tin tức; đổi dải số liệu thành mô tả đúng sự thật | FE `HomePage.tsx`, `data/homeData.ts` |
| H05 | 23 cảnh báo lint | Còn 16 (sửa các `useMemo`/`useEffect` bị tính lại mỗi lần render) | Nhiều file FE |

Job nền mới `jobs/maintenanceJob.js` chạy mỗi 5 phút, gồm: chuyển trạng thái lớp, học bổng hết hạn, xoá bản ghi hết hạn, xử lý bản ghi kẹt.

---

## Quyết định nghiệp vụ đã áp dụng (có thể đổi)

| Nội dung | Giá trị hiện tại | Đổi ở đâu |
|---|---|---|
| Mốc tính trễ +10/+20/+30 phút | Tính từ lúc giáo viên vào phòng | Code `sessionPresenceService.js` |
| Ghi hình bắt buộc | Có, khi đã cấu hình LiveKit | `RECORDING_REQUIRED=false` để tắt |
| Thời gian lưu bản ghi | 90 ngày | `RECORDING_RETENTION_DAYS` |
| Tự bắt đầu buổi học | 10 phút sau giờ học nếu giáo viên đã ở trong phòng | `SESSION_AUTO_START_AFTER_MINUTES` |
| Giáo viên vào lại buổi bị gián đoạn trước giờ kết thúc | Được dạy tiếp | Code `sessionPresenceService.js` |
| Lớp chuyển sang "đang học" (đóng đăng ký) | Khi buổi đầu tiên đã bắt đầu, không theo ngày khai giảng | `classLifecycleService.js` |
| Số tiền hoàn mỗi buổi | Học phí ÷ số buổi của lớp | `settlementService.js` |

## Thay đổi về test

- **Thêm:**
  - `tests/sessionRecordingFixes.test.js`: luồng bắt đầu buổi học, bấm hai lần đồng thời, ghi hình lỗi rồi thử lại, rớt mạng, ghi xong, quyền xem bản ghi.
  - `tests/maintenanceAndFinance.test.js`: vòng đời lớp, quy tắc lịch học, học bổng hết hạn, lưu trữ bản ghi, khoá job, rút tiền, hoàn phí, thông báo đăng ký.
- **Xoá 21 test** trong `tests/sessionConcurrency.test.js`. Các test này kiểm tra cơ chế "giáo viên vào phòng là tự bắt đầu và tự ghi hình", vốn đã bị bỏ; test mới ở trên kiểm tra các tình huống tương đương cho nút bắt đầu.
- **Sửa cho phù hợp luồng mới:** `platform`, `community`, `teacherVerificationAccess`, `smartClassroomAndIncidents`.

## Chưa làm

| Mục | Lý do |
|---|---|
| F01 – Cổng thanh toán thật | Cần tài khoản merchant (VNPay, MoMo...) và thông tin kết nối |
| H01 / N06 – Quên mật khẩu, email báo khoá tài khoản | Chưa có dịch vụ gửi email, cần chọn nhà cung cấp SMTP |
| 16 cảnh báo lint còn lại | Nằm ở logic đếm giờ, thanh toán và đăng nhập; sửa vội dễ đổi hành vi |
| Tính năng còn thiếu theo đặc tả | Trang giao dịch của giáo viên (FR-TEA-18), trang admin theo dõi buổi học (FR-ADM-08), cài đặt nền tảng (FR-ADM-22) |
| Các file báo cáo `.md` cũ ở thư mục gốc | Nội dung đã lỗi thời, nhưng chưa xoá |
