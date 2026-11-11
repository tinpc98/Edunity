# 28 — SỔ TAY RÀ SOÁT TOÀN BỘ MOCK, FAKE, STUB VÀ FALLBACK
**DỰ ÁN: EDUNITY V3**  
**TASK:** `TIN-FIN-REAL-END-TO-END-AUDIT`  
**OWNER:** TÍN — PAYMENT & FINANCE  
**CHẾ ĐỘ:** NO MOCK ACCEPTANCE AUDIT  
**NGÀY RÀ SOÁT:** 11/11/2026  

---

## I. MỤC TIÊU RÀ SOÁT
Rà soát toàn diện mã nguồn thuộc phạm vi Tín (Backend, Frontend, Services, Controllers, Routes, Adapters, Config, Jobs, Tests) nhằm nhận diện, bóc tách và phân loại mọi cơ chế giả lập, mock, fake, stub, dummy, hardcoded, fallback, demo mode hoặc sandbox.

Mục tiêu đảm bảo:
1. Không có bất kỳ cơ chế fallback nào tự động biến giao dịch thất bại từ Cổng thanh toán thật thành thành công giả mạo trong luồng ứng dụng thực tế.
2. Không có dữ liệu số dư, doanh thu hoặc thống kê bị hardcode trên giao diện người dùng.
3. Phân định rõ ràng giữa các test doubles phục vụ kiểm thử đơn vị cục bộ với môi trường chạy ứng dụng thật.

---

## II. BẢNG PHÂN LOẠI CHI TIẾT CÁC VỊ TRÍ MOCK & SANDBOX ĐƯỢC PHÁT HIỆN

| STT | File | Vị trí (Dòng) | Nội dung / Cơ chế phát hiện | Phân loại | Có chạy trong App không? | Có dùng bởi UI hiện tại? | Có thể tạo trạng thái giả ở Live? | Hành động yêu cầu |
| :---: | :--- | :---: | :--- | :--- | :---: | :---: | :---: | :--- |
| **01** | `BackEnd/src/services/payosService.js` | Dòng 4, 66–71, 391–410 | `isSandboxFallbackAllowed()` & tạo mã VietQR mock tĩnh khi `PAYOS_ENABLED != true` | `SIMULATED_APPLICATION_FLOW` | Có (chỉ khi `NODE_ENV` là `development`/`test` và `ENABLE_PAYMENT_SANDBOX != false`) | Có (khi dev chạy local) | **KHÔNG** (Bị chặn 403 Forbidden ở production / staging live) | Giữ nguyên cho local dev; khi deploy staging/production cấu hình `ENABLE_PAYMENT_SANDBOX=false` và `PAYOS_ENABLED=true`. |
| **02** | `BackEnd/src/services/payosService.js` | Dòng 362–388 | Bắt lỗi từ payOS thật: khi gặp lỗi `ETIMEDOUT` hoặc lỗi từ SDK, ném trực tiếp `AppError` 502/504 | `REAL_IMPLEMENTATION` | Có (khi `PAYOS_ENABLED=true`) | Có | **KHÔNG** (Tuyệt đối không fallback sang mock khi payOS thật bị lỗi) | Đạt chuẩn an toàn ngân hàng: lỗi thật phải trả lỗi thật, bảo vệ trạng thái an toàn của giao dịch. |
| **03** | `BackEnd/src/services/payosService.js` | Dòng 482–486 | `signWebhookDataForChannel`: Hàm hỗ trợ ký HMAC cho test hoặc nội bộ bằng `@payos/node` crypto | `TEST_ONLY_DOUBLE` | Không (chỉ test gọi) | Không | **KHÔNG** | Đạt chuẩn: Chỉ phục vụ các bộ test tích hợp chữ ký. |
| **04** | `BackEnd/src/services/paymentService.js` | Dòng 34–46 | `fallbackCounters`: Bộ đếm in-process dự phòng khi không kết nối MongoDB | `TEST_ONLY_DOUBLE` | Không (trong runtime thật luôn kết nối MongoDB) | Không | **KHÔNG** | Đạt chuẩn: Chỉ kích hoạt trong isolated unit tests khi disconnected. |
| **05** | `BackEnd/src/controllers/paymentController.js` | Dòng 9–18, 120–145 | `isSandboxEnabled()` và endpoint xử lý webhook sandbox | `SIMULATED_APPLICATION_FLOW` | Có (chỉ dev/test) | Có (nút bấm test) | **KHÔNG** (Bị chặn bởi middleware `sandboxOnly`) | Giữ nguyên cho local dev; môi trường Staging/Production bắt buộc tắt. |
| **06** | `BackEnd/src/routes/paymentRoutes.js` | Dòng 7–18 | Middleware `sandboxOnly` bảo vệ route `POST /api/payments/sandbox/webhook` | `REAL_IMPLEMENTATION` | Có | Không | **KHÔNG** (Chặn 403 ở mọi môi trường khác development/test) | Đạt chuẩn chốt chặn an ninh mạng. |
| **07** | `FrontEnd/src/features/enrollment/CheckoutPage.tsx` | Dòng 229–245, 366–375 | Nút bấm "Xác nhận giả lập Webhook Sandbox" | `SIMULATED_APPLICATION_FLOW` | Có (chỉ hiện khi `activePayment.provider === 'SANDBOX'`) | Có (khi dev) | **KHÔNG** (Ẩn hoàn toàn khi provider là PAYOS thật và production build) | Đạt chuẩn: UI tự động ẩn hoàn toàn khi kết nối payOS thật. |
| **08** | `FrontEnd/src/features/campaign/CampaignDetailPage.tsx` | Dòng 175–185, 222–230 | Nút bấm "Xác nhận đóng góp Sandbox" | `SIMULATED_APPLICATION_FLOW` | Có (chỉ hiện khi sandbox) | Có (khi dev) | **KHÔNG** (Ẩn khi chạy PAYOS thật) | Tương tự CheckoutPage: tự động ẩn ở chế độ thật. |
| **09** | `FrontEnd/src/services/gatewayPayment.service.ts` | Dòng 110–125 | Hàm `triggerSandboxWebhook` gọi về backend sandbox route | `SIMULATED_APPLICATION_FLOW` | Có | Có | **KHÔNG** (Backend chặn nếu không phải dev) | Đạt chuẩn phân tách. |
| **10** | `FrontEnd/src/services/sponsorContribution.service.ts` | Dòng 118–130 | Hàm `triggerSandboxWebhook` cho kênh đóng góp tài trợ | `SIMULATED_APPLICATION_FLOW` | Có | Có | **KHÔNG** | Đạt chuẩn phân tách. |
| **11** | `BackEnd/src/services/payosWebhookService.js` | Dòng 49–70 | `isPayosWebhookTestProbe`: Nhận diện payload kiểm tra kết nối từ payOS Merchant Portal (orderCode: 123) | `REAL_IMPLEMENTATION` | Có | Không | **KHÔNG** (Bỏ qua payload test, tuyệt đối không ghi nhận tiền thật hoặc tạo enrollment) | Đạt chuẩn bảo vệ số dư: Intercept probe request không làm sai lệch số cái. |
| **12** | `BackEnd/src/services/financeService.js` | Dòng 15–80 | Hàm `getFinanceOverview` tính toán số dư và thống kê Dashboard | `REAL_IMPLEMENTATION` | Có | Có | **KHÔNG** (100% tính từ MongoDB Sổ cái và Transaction thật) | Đạt chuẩn: Không có số liệu hardcode. |
| **13** | `FrontEnd/src/features/admin/finance/*.tsx` | Toàn bộ 6 trang Admin Finance | Đọc dữ liệu từ `financeService`, hiển thị bảng biểu, phân trang | `REAL_IMPLEMENTATION` | Có | Có | **KHÔNG** (Hiển thị empty/loading/error state chuẩn khi không có dữ liệu) | Đạt chuẩn: Không dùng mảng tĩnh fake data. |
| **14** | `BackEnd/tests/*.test.js` | Toàn bộ 28 file test | Sử dụng `MongoMemoryReplSet`, `jest.fn()`, fake JWT token | `TEST_ONLY_DOUBLE` | Không (chỉ chạy trong Jest runner) | Không | **KHÔNG** | Đạt chuẩn kiểm thử đơn vị; không tính là bằng chứng Real E2E. |
| **15** | `FrontEnd/e2e/payment-finance.spec.ts` | Dòng 1–250 | Playwright browser E2E test kích hoạt webhook sandbox local | `TEST_ONLY_DOUBLE` | Không (chỉ chạy trong Playwright runner) | Không | **KHÔNG** | Đạt chuẩn kiểm thử tự động giao diện local. |

---

## III. KẾT LUẬN KIỂM TOÁN VỀ MOCK

1. **Không có lỗ hổng UNSAFE_FALLBACK:**
   - Trong toàn bộ mã nguồn `BackEnd`, không tồn tại cơ chế fallback nào cho phép khi gọi API payOS thật bị thất bại/timeout lại tự ý nhảy sang hoàn tất thanh toán thành công.
   - Khi `isPayosEnabled()` trả về `true`, mọi lỗi kết nối đều được phản ánh trung thực bằng mã lỗi HTTP `502 Bad Gateway` hoặc `504 Gateway Timeout`.

2. **Không có HARDCODED_DISPLAY_DATA:**
   - Tất cả các trang giao diện tài chính (Admin Dashboard, Quản lý giao dịch, Danh sách hoàn phí, Ví thù lao giáo viên, Đóng góp nhà tài trợ) đều tiêu thụ dữ liệu trực tiếp từ các API Backend thực tế.
   - Khi cơ sở dữ liệu trống, giao diện hiển thị trạng thái Empty State hoặc bảng trống một cách tự nhiên.

3. **Chốt chặn môi trường nghiêm ngặt:**
   - Tất cả các điểm vào Sandbox (`/api/payments/sandbox/webhook`) đều được kiểm soát bởi middleware `sandboxOnly`, chặn ngay lập tức bằng mã lỗi `403 Forbidden` khi ứng dụng được cấu hình ở môi trường ngoài `development` và `test`.

