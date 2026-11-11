# BÁO CÁO CĂN CHỈNH THỰC TẾ & ĐỒNG BỘ HIỆN TRẠNG DỰ ÁN EDUNITY V3
# DOCUMENT: 22_PR11_LOCAL_ALIGNMENT_REPORT.md
# NHIỆM VỤ: TIN-FIN-PR11-LOCAL-ALIGNMENT

> **Dự án**: EDUNITY V3 — Nền tảng Giáo dục Trực tuyến & Gây quỹ Học bổng  
> **Chủ nhiệm**: Tin — Senior DevOps Architect + Payment Integration Engineer + Financial Security Auditor + QA Lead  
> **Thời điểm xác lập**: 10/11/2026  
> **Nhánh Git**: `feature/teacher-admin`  
> **Hiện trạng xác nhận chính thức từ Team Leader**: Hệ thống đang chạy 100% trên Local; Frontend và Backend đang tiếp tục hoàn thiện; Chưa có VPS/Hosting; Chưa có domain staging/production; Chưa kích hoạt giao dịch tiền thật; Triển khai hạ tầng sẽ chỉ diễn ra sau khi toàn bộ dự án hoàn thiện và nghiệm thu tổng thể.

---

## 1. PHÂN LOẠI TRẠNG THÁI CHÍNH THỨC CỦA HỆ THỐNG

Dựa trên chỉ thị từ Team Leader và hiện trạng thực tế của codebase, hệ thống được phân loại 4 trạng thái kỹ thuật rõ ràng:

```
+-------------------------------+-------------------+-------------------------------------------------------------------------+
| TRẠNG THÁI TIÊU CHUẨN         | KẾT QUẢ ĐÁNH GIÁ  | CĂN CỨ VÀ MINH CHỨNG KỸ THUẬT                                           |
+-------------------------------+-------------------+-------------------------------------------------------------------------+
| 1. LOCAL_READY                | [ ĐẠT / PASS ]    | - Backend: 28/28 Suites PASS, 647/647 Tests PASS (100%).                |
|                               |                   | - Frontend: TypeScript Compiler tsc -b && vite build PASS 0 lỗi.        |
|                               |                   | - Playwright Browser E2E: 8/8 User Flows PASS trên Chromium (9.7s).     |
|                               |                   | - Toàn bộ nghiệp vụ PR1–PR10 hoạt động toàn vẹn trên môi trường Local.   |
+-------------------------------+-------------------+-------------------------------------------------------------------------+
| 2. DEPLOYMENT_PREPARED        | [ ĐẠT / PASS ]    | - Bộ tài liệu thiết kế hạ tầng hoàn thiện (Docs 18, 19, 20, 21).        |
|                               |                   | - File mẫu Nginx Reverse Proxy, cấu hình SSL, kiến trúc bảo mật sẵn sàng.|
|                               |                   | - Bản đặc tả 2 kênh Webhook payOS và kịch bản diễn tập 10 giao dịch mẫu.|
|                               |                   | - Sẵn sàng áp dụng ngay khi Team Leader quyết định kích hoạt Phase C.   |
+-------------------------------+-------------------+-------------------------------------------------------------------------+
| 3. LIVE_INTEGRATION_NOT_RUN   | [ XÁC NHẬN RÕ ]   | - Chưa từng gọi API payOS Live bằng tiền thật.                          |
|                               |                   | - PAYOS_ENABLED=false được duy trì tuyệt đối trên toàn bộ mã nguồn.    |
|                               |                   | - Chưa đăng ký Webhook URL lên Portal payOS Doanh nghiệp thật.          |
|                               |                   | - Chưa thực hiện bất kỳ giao dịch ngân hàng hoặc hoàn tiền thật nào.    |
+-------------------------------+-------------------+-------------------------------------------------------------------------+
| 4. PRODUCTION_NOT_DEPLOYED    | [ XÁC NHẬN RÕ ]   | - Chưa thuê VPS, Cloud Server hay Hosting cho Staging / Production.     |
|                               |                   | - Chưa mua tên miền Production/Staging và chưa cấp phát chứng chỉ HTTPS.|
|                               |                   | - Hệ thống hoàn toàn nội bộ (Localhost), không mở port ra Internet.     |
+-------------------------------+-------------------+-------------------------------------------------------------------------+
```

---

## 2. KIỂM TOÁN GIT WORKING TREE VÀ BẰNG CHỨNG LỊCH SỬ LÀM VIỆC

### 2.1. Hiện trạng Git Working Tree
Kết quả lệnh `git status --short`:
- **File bị xoá (D)**: 15 file Markdown báo cáo audit cũ trước PR1 (như `BACKEND_ACTUAL_API_CONTRACT.md`, `FE_PHASE_...`, `EDUNITY_DEEP_COMPLETION_AUDIT.md`).
- **File chỉnh sửa (M)**: 34 file thuộc `BackEnd/` (models, controllers, services, routes, package.json, tests) và `FrontEnd/` (adapters, routes, layout, pages, types).
- **File thêm mới chưa theo dõi (??)**: 23 file/thư mục bao gồm các Service, Models, Outbox Worker, Job Lock, Playwright E2E suite, 9 file test PR1–PR10 và bộ tài liệu `docs/payment-v3/`.

### 2.2. Giải thích nguyên nhân kỹ thuật
1. **Ràng buộc kỷ luật nghiêm ngặt từ PR1 đến PR11**:
   Trong toàn bộ các prompt chỉ đạo từ Task PR1 đến PR11, quy tắc bất biến được đặt ra là:
   > *"KHÔNG commit, push, merge, reset, rebase, checkout Git."*
2. **Hệ quả logic**:
   - Mọi cải tiến, sửa lỗi bảo mật, bổ sung schema, service và test cases phục vụ PR1 đến PR11 đều được giữ nguyên vẹn trực tiếp trên Working Tree mà không tạo Git Commit trung gian.
   - Trạng thái Working Tree phản ánh chính xác khối lượng công việc khổng lồ đã thực hiện xuyên suốt 11 PRs (647 test cases, 8 Browser E2E flows, hệ thống Ledger, Four-Eyes hardening, Clock injection).
3. **Cam kết an toàn**:
   - **Tuyệt đối không chạy `git reset` hoặc `git checkout`**: Tránh làm mất mã nguồn và kết quả kiểm thử đã nghiệm thu.
   - Khi dự án hoàn thành toàn diện (Phase B), Team Leader sẽ là người duy nhất chủ trì việc review staging index và thực hiện commit tổng hợp chính thức.

---

## 3. KIỂM TRA CẤU HÌNH DNS MONGODB & ĐÁNH GIÁ ẢNH HƯỞNG HẠ TẦNG

### 3.1. Hiện trạng Codebase
- Tại `BackEnd/src/config/db.js` (dòng 4):
  ```javascript
  const mongoose = require("mongoose");
  const dns = require("node:dns");

  dns.setServers(["1.1.1.1", "8.8.8.8"]);
  ```
- Tại `BackEnd/src/server.js` (dòng 5–11):
  ```javascript
  if (process.env.DNS_SERVERS) {
    require("dns").setServers(
      process.env.DNS_SERVERS.split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }
  ```

### 3.2. Đánh giá nguyên nhân & rủi ro khi triển khai Hạ tầng
1. **Mục đích ban đầu trên Local**:
   - Việc gọi `dns.setServers(["1.1.1.1", "8.8.8.8"])` trên Windows Local giúp khắc phục lỗi mạng phổ biến của các nhà mạng tại Việt Nam khi phân giải bản ghi DNS SRV/TXT cho chuỗi kết nối `mongodb+srv://...` của MongoDB Atlas.
2. **Rủi ro khi chuyển sang Docker / VPS / Mạng nội bộ (Private VPC)**:
   - **Môi trường Docker**: Các container liên lạc với nhau thông qua Docker DNS Resolver nội bộ (`127.0.0.11`). Nếu Node.js ép buộc dùng DNS công cộng `1.1.1.1` và `8.8.8.8`, Node.js sẽ không thể phân giải tên host nội bộ (ví dụ: `mongodb://mongo:27017` hoặc `redis:6379`), dẫn đến lỗi `getaddrinfo ENOTFOUND mongo`.
   - **Môi trường Cloud VPS / Private Network**: Nhiều máy chủ trong mạng riêng chặn cổng UDP/TCP 53 ra ngoài Internet vì lý do an ninh, khiến quá trình khởi động server bị treo (DNS timeout).
3. **Khuyến nghị kỹ thuật (Thực hiện khi triển khai Phase C)**:
   - **Giữ nguyên hiện tại trên Local**: Không tự ý sửa code để đảm bảo việc kết nối MongoDB Atlas trên máy dev của toàn đội ngũ tiếp tục ổn định.
   - **Kế hoạch cập nhật tại Phase C**: Chuyển việc thiết lập DNS về dạng có điều kiện, ưu tiên `process.env.DNS_SERVERS` hoặc chỉ kích hoạt khi kết nối `mongodb+srv://` ngoài Docker:
     ```javascript
     // Khuyến nghị cho Phase C:
     if (process.env.DNS_SERVERS) {
       dns.setServers(process.env.DNS_SERVERS.split(",").map(s => s.trim()).filter(Boolean));
     } else if (process.env.NODE_ENV === "development" && uri?.startsWith("mongodb+srv://")) {
       dns.setServers(["1.1.1.1", "8.8.8.8"]);
     }
     ```

---

## 4. LỘ TRÌNH THỰC TẾ 5 PHA TRIỂN KHAI DỰ ÁN EDUNITY V3

Quy trình phát triển và phát hành được đồng bộ hóa thành 5 Pha chuẩn mực, bám sát chỉ đạo của Team Leader:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 LỘ TRÌNH 5 PHA CHUẨN HÓA                               │
└────────────────────────────────────────────────────────────────────────────────────────┘

  [ PHA A: LOCAL DEVELOPMENT ] (HIỆN TẠI)
  │ - Hoàn thiện toàn bộ tính năng nghiệp vụ Frontend và Backend.
  │ - Kiểm thử tích hợp mock nội bộ (Payment & Finance dùng Mock Adapter).
  │ - Giữ PAYOS_ENABLED=false, 0 giao dịch tiền thật, không cần VPS/Domain.
  ▼
  [ PHA B: FULL PROJECT ACCEPTANCE ]
  │ - Đối chiếu toàn diện tài liệu SRS (Software Requirements Specification).
  │ - Kiểm thử liên phân hệ: Khóa học, Lớp học, Điểm danh, LiveKit, Thanh toán, Học bổng.
  │ - Khắc phục triệt để các lỗi tồn đọng P0/P1.
  │ - Team Leader và Product Owner ký duyệt nghiệm thu mã nguồn.
  ▼
  [ PHA C: DEPLOYMENT PREPARATION ]
  │ - Thuê máy chủ VPS / Cloud Staging và đăng ký Tên miền dự án.
  │ - Cấu hình HTTPS / SSL (Let's Encrypt), Nginx Reverse Proxy, Docker Compose.
  │ - Thiết lập MongoDB Staging hỗ trợ Replica Set (phục vụ Multi-document ACID Transactions).
  │ - Nạp biến môi trường và bí mật an toàn qua Server Environment (không lưu vào Git).
  ▼
  [ PHA D: PAYOS LIVE PILOT ]
  │ - Đăng ký chính thức 2 Webhook URL (Tuition & Donation) trên payOS Doanh nghiệp.
  │ - Xác thực kiểm tra bắt tay Test Probe (`200 OK`).
  │ - Diễn tập giới hạn 10 giao dịch tiền thật (100.000 VNĐ) có 3 bên giám sát trực tiếp.
  │ - Đối soát 100% khớp lệnh giữa Database Edunity, Outbox Worker và Sao kê ngân hàng.
  │ - Tuyệt đối khóa tự động luồng tiền ra (Refund và Payout xử lý thủ công có Four-Eyes).
  ▼
  [ PHA E: PRODUCTION RELEASE ]
    - Phát hành chính thức cổng thanh toán ra công chúng sau khi Pilot Pha D đạt chuẩn 100%.
```

---

## 5. TỔNG HỢP DANH MỤC TÀI LIỆU ĐÃ CĂN CHỈNH

Toàn bộ các tài liệu trong `docs/payment-v3/` đã được rà soát và căn chỉnh để phản ánh đúng thực tế dự án:

1. **`18_PR11_STAGING_INFRASTRUCTURE_PLAN.md`**:
   - Chuyển toàn bộ các giá trị IP, Domain thành `DEPLOYMENT_INPUT_REQUIRED` dạng placeholder.
   - Xác định rõ đây là bản thiết kế chuẩn bị, chỉ được đưa vào thực thi khi bước vào **Pha C**.
   - Không yêu cầu Team Leader phải mua sắm VPS hay Domain tại thời điểm hiện tại.
2. **`19_PAYOS_TWO_CHANNEL_WEBHOOK_SETUP_GUIDE.md`**:
   - Làm rõ trạng thái `CONFIGURED` trong `.env` chỉ là khai báo định dạng cục bộ.
   - Quy định việc đăng ký Webhook URL lên Portal payOS chỉ thực hiện ở **Pha D** khi đã có HTTPS công khai.
3. **`20_CONTROLLED_LIVE_PILOT_RUNBOOK.md`**:
   - Quy định rõ ràng kịch bản 10 giao dịch tiền thật (100.000 VNĐ) chỉ diễn ra trong **Pha D**.
   - Thiết lập điều kiện tiên quyết: Phải có chữ ký phê duyệt của Giám đốc/Kế toán trưởng và sự giám sát đồng thời của 3 bên.
4. **`21_PR11_GO_NO_GO_REPORT.md`**:
   - Cập nhật định danh nhánh Git phản ánh đúng việc Working Tree giữ toàn bộ thay đổi PR1–PR11.
   - Xác định trạng thái: `LOCAL_READY` [PASS], `STAGING_PILOT` [WAITING FOR PHASE C/D], `PRODUCTION_RELEASE` [STRICT NO-GO].
5. **`22_PR11_LOCAL_ALIGNMENT_REPORT.md` (Tài liệu này)**:
   - Tổng kết và đồng bộ toàn bộ hiện trạng, phân loại 4 trạng thái kỹ thuật và hướng dẫn hành động tiếp theo.

---

## 6. DANH MỤC HÀNH ĐỘNG SAU KHI HOÀN THIỆN TOÀN BỘ DỰ ÁN

Khi toàn bộ các phân hệ của Edunity V3 được hoàn tất và nghiệm thu tại Local (hoàn thành Pha A và Pha B), các bước tiếp theo sẽ được triển khai theo thứ tự:

- [ ] **Bước 1 (Bàn giao Git)**: Team Leader thực hiện review toàn bộ working tree, đối soát git diff và tạo commit chính thức gom toàn bộ PR1–PR11 lên nhánh chính.
- [ ] **Bước 2 (Khởi tạo Hạ tầng - Pha C)**:
  - Khởi tạo VPS Staging (Ubuntu 22.04 LTS / 24.04 LTS).
  - Trỏ DNS 2 domain: `staging.edunity.vn` (Frontend) và `api-staging.edunity.vn` (Backend).
  - Cài đặt Nginx, cấp chứng chỉ SSL Let's Encrypt qua Certbot.
  - Khởi chạy MongoDB Staging Replica Set (`--replSet rs0`).
  - Xử lý dòng cấu hình DNS trong `BackEnd/src/config/db.js` theo khuyến nghị tại Mục 3.3.
- [ ] **Bước 3 (Triển khai Ứng dụng)**:
  - Build Frontend (`npm run build`) và đưa vào Web Root Nginx.
  - Thiết lập Backend chạy qua PM2 Cluster Mode hoặc Docker.
  - Kích hoạt Outbox Worker (`ENABLE_FINANCIAL_OUTBOX_WORKER=true`).
- [ ] **Bước 4 (Kết nối payOS & Diễn tập - Pha D)**:
  - Đăng ký Webhook 2 kênh trên Portal payOS.
  - Tiến hành diễn tập 10 giao dịch pilot theo đúng `20_CONTROLLED_LIVE_PILOT_RUNBOOK.md`.
  - Kế toán trưởng đối soát sao kê ngân hàng thật.
- [ ] **Bước 5 (Ký biên bản & Phát hành - Pha E)**:
  - Ban Quản trị phê duyệt nghiệm thu toàn bộ.
  - Mở cổng thanh toán cho người dùng thực tế.

---

## 7. KẾT LUẬN & CAM KẾT KỸ THUẬT

1. **Tính độc lập & an toàn**: Toàn bộ hệ sinh thái mã nguồn Thanh toán & Tài chính (PR1–PR10) hoàn toàn sẵn sàng, ổn định tuyệt đối trên môi trường Local và không có bất kỳ rủi ro nào về rò rỉ dữ liệu hay thất thoát tài chính.
2. **Không áp đặt chi phí sớm**: Đội ngũ kỹ thuật hoàn toàn thống nhất với Team Leader không mua VPS hay tên miền vào lúc này, tập trung 100% nguồn lực để hoàn thiện các tính năng còn lại của Edunity.
3. **Kỷ luật Git & Quy chuẩn**: Tuyệt đối không tự ý commit, push, checkout hay reset. Dự án sẵn sàng chuyển giao mượt mà sang các pha tiếp theo khi có lệnh chính thức từ Team Leader.

