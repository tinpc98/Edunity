# FE Phase 08 — Campaign + Sponsor Contribution

## 1. Scope
Tích hợp toàn diện tầng nghiệp vụ Campaign (Chiến dịch học bổng) và Sponsor Contribution (Tài trợ học bổng) theo dữ liệu Backend thực tế của Edunity:
1. **Public / Sponsor Campaign**:
   - Danh sách chiến dịch công khai (`/campaigns`) lấy trực tiếp từ `GET /api/campaigns`.
   - Chi tiết chiến dịch công khai (`/campaigns/:id`) lấy từ `GET /api/campaigns/:id`.
   - Tiến độ gây quỹ (`fundingProgress`), ngân sách mục tiêu (`targetBudget`), số tiền đã huy động (`fundedAmount`).
   - Trạng thái chiến dịch thực tế từ Backend (`DRAFT`, `OPEN_FOR_FUNDING`, `CLOSED`).
2. **Sponsor Contribution**:
   - Tạo yêu cầu tài trợ thực tế từ tài khoản SPONSOR qua `POST /api/campaigns/:id/contributions`.
   - Kiểm soát tính hợp lệ của số tiền (nguyên dương VND, kiểm tra thời gian gây quỹ).
   - Trạng thái đóng góp thực tế (`PENDING` -> `COMPLETED` / `FAILED`).
   - Xác nhận thanh toán tài trợ qua sandbox webhook gateway (`POST /api/payments/sandbox/webhook`).
   - Lịch sử tài trợ của Sponsor qua `GET /api/sponsor/contributions`.
   - Báo cáo tác động học bổng qua `GET /api/sponsor/campaigns/:id/impact`.
   - Tự động sinh bút toán sổ cái `SPONSOR_CONTRIBUTION` trong Ledger của hệ thống.
3. **Admin Campaign Management**:
   - Danh sách chiến dịch quản trị qua `GET /api/admin/campaigns`.
   - Tạo chiến dịch mới qua `POST /api/admin/campaigns` (khởi tạo ở trạng thái `DRAFT`).
   - Cập nhật chiến dịch qua `PATCH /api/admin/campaigns/:id`.
   - Phát hành chiến dịch sang trạng thái gây quỹ qua `POST /api/admin/campaigns/:id/publish` (`DRAFT` -> `OPEN_FOR_FUNDING`).
   - Đóng chiến dịch qua `POST /api/admin/campaigns/:id/close` (`OPEN_FOR_FUNDING` -> `CLOSED`).
   - Giám sát danh sách các khoản tài trợ theo từng chiến dịch qua `GET /api/admin/campaigns/:id/contributions`.
4. **Giới hạn phạm vi**:
   - Tuyệt đối không can thiệp vào tầng Scholarship Application, Scholarship Approval, Scholarship Usage, Co-pay học bổng (thuộc phạm vi Phase 9).

---

## 2. Backend Campaign Contract

### Public Campaign
- **List Public Campaigns**:
  - **Method**: `GET`
  - **Path**: `/api/campaigns`
  - **Auth**: Public
  - **Query**: `page`, `pageSize` (hoặc `limit`), `status` (mặc định chỉ trả về `OPEN_FOR_FUNDING`, hỗ trợ filter `CLOSED`). DRAFT không bao giờ được trả về công khai.
  - **Response**: `{ success: true, data: { items: ApiScholarshipCampaign[], total, page, pageSize, totalPages } }`.
- **Get Public Campaign Detail**:
  - **Method**: `GET`
  - **Path**: `/api/campaigns/:id`
  - **Auth**: Public
  - **Response**: Chi tiết chiến dịch kèm `scopeDetail: { categories, subjects, courses }`, `awardedScholarshipCount`, `contributionCount`, `fundingProgress`, `isAcceptingFunding`, `isAcceptingApplications`.
  - **Errors**: `404 CAMPAIGN_NOT_FOUND` (nếu ID không tồn tại hoặc campaign ở trạng thái `DRAFT`).

### Admin Campaign
- **List Admin Campaigns**:
  - **Method**: `GET`
  - **Path**: `/api/admin/campaigns`
  - **Auth**: Bearer JWT (`ADMIN`)
  - **Query**: `page`, `pageSize`, `status` (`DRAFT`, `OPEN_FOR_FUNDING`, `CLOSED`).
  - **Response**: `{ success: true, data: { items: ApiScholarshipCampaign[], total, page, pageSize, totalPages } }`.
- **Get Admin Campaign Detail**:
  - **Method**: `GET`
  - **Path**: `/api/admin/campaigns/:id`
  - **Auth**: Bearer JWT (`ADMIN`)
  - **Response**: Chi tiết chiến dịch bao gồm cả trạng thái `DRAFT`.
- **Create Campaign**:
  - **Method**: `POST`
  - **Path**: `/api/admin/campaigns`
  - **Auth**: Bearer JWT (`ADMIN`)
  - **Body**:
    ```json
    {
      "title": "string",
      "description": "string",
      "eligibilityCriteria": "string",
      "targetBudget": 300000000,
      "expectedSlots": 100,
      "awardAmountPerStudent": 3000000,
      "fundingStart": "2026-10-01T00:00:00.000Z",
      "fundingEnd": "2026-11-01T00:00:00.000Z",
      "applicationStart": "2026-10-15T00:00:00.000Z",
      "applicationEnd": "2026-11-15T00:00:00.000Z",
      "scope": { "categoryIds": [], "subjectIds": [], "courseIds": [] }
    }
    ```
  - **Response**: Status 201 `{ success: true, data: ScholarshipCampaign }` ở trạng thái `DRAFT`.
  - **Validations**: `targetBudget >= awardAmountPerStudent * expectedSlots`, `fundingStart <= fundingEnd`, `applicationStart <= applicationEnd`.
- **Update Campaign**:
  - **Method**: `PATCH`
  - **Path**: `/api/admin/campaigns/:id`
  - **Auth**: Bearer JWT (`ADMIN`)
  - **Body**: Partial update.
  - **Errors**: `409 CAMPAIGN_CLOSED` (nếu đã đóng), `409 CAMPAIGN_FIELD_LOCKED` (nếu chiến dịch đã publish mà cố sửa các trường tài chính: `targetBudget`, `expectedSlots`, `awardAmountPerStudent`, `scope`).
- **List Campaign Contributions**:
  - **Method**: `GET`
  - **Path**: `/api/admin/campaigns/:id/contributions`
  - **Auth**: Bearer JWT (`ADMIN`)
  - **Query**: `page`, `pageSize`, `status`
  - **Response**: Danh sách các khoản tài trợ với thông tin nhà tài trợ được populate (`email`, `sponsorProfile`).

### Campaign State Actions
- **Publish Campaign**:
  - **Method**: `POST`
  - **Path**: `/api/admin/campaigns/:id/publish`
  - **Auth**: Bearer JWT (`ADMIN`)
  - **Chuyển dịch**: `DRAFT` -> `OPEN_FOR_FUNDING`.
  - **Yêu cầu**: Phải có đầy đủ `fundingStart`, `fundingEnd`, `applicationStart`, `applicationEnd`.
- **Close Campaign**:
  - **Method**: `POST`
  - **Path**: `/api/admin/campaigns/:id/close`
  - **Auth**: Bearer JWT (`ADMIN`)
  - **Chuyển dịch**: `OPEN_FOR_FUNDING` -> `CLOSED`.

---

## 3. Campaign Model
Model `ScholarshipCampaign` trong Backend (`BackEnd/src/models/ScholarshipCampaign.js`):
- `_id`: ObjectId
- `createdBy`: ObjectId (Admin)
- `updatedBy`: ObjectId
- `title`: String (bắt buộc)
- `description`: String
- `eligibilityCriteria`: String
- `scope`: `{ categoryIds, subjectIds, courseIds }`
- `targetBudget`: Decimal128 (Ngân sách mục tiêu)
- `fundedAmount`: Decimal128 (Đã huy động được, mặc định 0)
- `allocatedAmount`: Decimal128 (Đã cấp học bổng)
- `usedAmount`: Decimal128 (Đã giải ngân thanh toán học phí)
- `expectedSlots`: Number (Số suất dự kiến)
- `awardAmountPerStudent`: Decimal128 (Mức học bổng / học viên)
- `fundingStart`, `fundingEnd`: Date
- `applicationStart`, `applicationEnd`: Date
- `status`: Enum `['DRAFT', 'OPEN_FOR_FUNDING', 'CLOSED']` (mặc định `DRAFT`)
- `timestamps`: `createdAt`, `updatedAt`

---

## 4. Campaign State Machine
- `DRAFT` -> `OPEN_FOR_FUNDING`: Thông qua API Publish của Admin khi đã hoàn thiện khung thời gian.
- `OPEN_FOR_FUNDING` -> `CLOSED`: Thông qua API Close của Admin khi kết thúc thời gian hoặc đạt mục tiêu.
- Trạng thái `CLOSED` là terminal, không thể cập nhật thông tin (`CAMPAIGN_CLOSED` 409).
- Trạng thái nhận tài trợ thực tế (`isAcceptingFunding`) được tính toán động: `status === "OPEN_FOR_FUNDING" && now >= fundingStart && now <= fundingEnd`.

---

## 5. Funding Progress Semantics
- Tiến độ gây quỹ được Backend tính toán chuẩn xác từ:
  $$\text{fundingProgress} = \min\left(\text{round}\left(\frac{\text{fundedAmount}}{\text{targetBudget}} \times 100, 2\right), 100\right)$$
- Frontend sử dụng trực tiếp giá trị `fundingProgress` và `fundedAmount` do Backend trả về, tuyệt đối không tính tổng từ danh sách contributions phân trang.

---

## 6. Sponsor Contribution Contract
- **Create Contribution Intent**:
  - **Method**: `POST`
  - **Path**: `/api/campaigns/:id/contributions`
  - **Auth**: Bearer JWT (`SPONSOR`)
  - **Body**: `{ "amount": 500000 }` (VND nguyên dương)
  - **Validation Backend**: Kiểm tra `isAcceptingFunding(campaign)`. Nếu không tiếp nhận, trả về `409 CAMPAIGN_NOT_ACCEPTING_FUNDING`.
  - **Response**: Status 201:
    ```json
    {
      "contributionId": "string",
      "campaignId": "string",
      "amount": 500000,
      "contributionStatus": "PENDING",
      "gateway": "SANDBOX",
      "gatewayReference": "SBX-C-uuid"
    }
    ```
- **Sponsor History**:
  - **Method**: `GET`
  - **Path**: `/api/sponsor/contributions`
  - **Auth**: Bearer JWT (`SPONSOR`)
  - **Query**: `page`, `pageSize`, `status`, `campaignId`
  - **Response**: `{ items: SponsorContribution[], total, page, pageSize, totalPages, totalContributed }`
- **Sponsor Impact Report**:
  - **Method**: `GET`
  - **Path**: `/api/sponsor/campaigns/:id/impact`
  - **Auth**: Bearer JWT (`SPONSOR`)
  - **Response**: Báo cáo tổng hợp số học sinh được nhận học bổng, số học sinh đang học, số lớp học hỗ trợ và tỷ lệ đóng góp của sponsor.

---

## 7. Contribution State Machine
- `PENDING`: Trạng thái ban đầu khi Sponsor tạo yêu cầu tài trợ.
- `PENDING` -> `COMPLETED`: Khi nhận webhook xác nhận thành công từ gateway.
- `PENDING` -> `FAILED`: Khi nhận webhook báo thất bại hoặc hủy bỏ.

---

## 8. Contribution Payment / Confirmation
- Cơ chế xác nhận sử dụng chung Webhook Sandbox của hệ thống: `POST /api/payments/sandbox/webhook`.
- Payload: `{ "gatewayReference": "SBX-C-uuid", "status": "SUCCESS" | "FAILED" }`.
- `paymentController` ưu tiên chuyển cho `contributionService.processWebhook` kiểm tra mã đối soát tiền tố `SBX-C-`.

---

## 9. Amount Integrity
- Backend áp dụng hàm `parseAmount(body.amount, "amount")`: bắt buộc là số nguyên dương, không cho phép số âm hoặc 0 (`VALIDATION_ERROR` 400).
- Sau khi webhook xác nhận `COMPLETED`, Backend tăng quỹ chiến dịch bằng toán tử nguyên tử MongoDB `$inc: { fundedAmount: contribution.amount }`.

---

## 10. Contribution Idempotency
- `contributionService.processWebhook` kiểm tra `contribution.contributionStatus !== 'PENDING'`.
- Nếu webhook được gọi lại lần 2 trở đi với cùng một `gatewayReference`, Backend lập tức trả về `{ result: "IDEMPOTENT" }` và không chạy lại transaction cập nhật `$inc fundedAmount` hay tạo trùng `Transaction`.

---

## 11. Campaign Funding Race Conditions
- Quá trình cập nhật trạng thái đóng góp, tăng ngân sách chiến dịch và tạo bút toán sổ cái được bao bọc trong MongoDB Session Transaction (`session.withTransaction`).
- Đảm bảo tính nhất quán dữ liệu bất biến ngay cả khi có nhiều nhà tài trợ cùng gửi yêu cầu đồng thời.

---

## 12. Transaction Integration
- Khi một khoản đóng góp chuyển sang `COMPLETED`, Backend tự động tạo 1 bản ghi `Transaction`:
  - `transactionType`: `"SPONSOR_CONTRIBUTION"`
  - `sourceUserId`: `contribution.sponsorId`
  - `amount`: `contribution.amount`
  - `status`: `"COMPLETED"`
- Bút toán này lập tức hiển thị trên trang Sổ cái Giao dịch của Admin (`/admin/transactions`).

---

## 13. Sponsor History
- Tích hợp trang `/sponsor/contributions` ([SponsorContributionsPage.tsx](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/FrontEnd/src/features/sponsor/contributions/SponsorContributionsPage.tsx)).
- Hiển thị đầy đủ tổng tiền đã đóng góp, số lượt tài trợ, danh sách các chiến dịch đã hỗ trợ, trạng thái và xem báo cáo tác động (Impact report).

---

## 14. Admin Campaign Management
- [AdminCampaignsPage.tsx](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/FrontEnd/src/features/admin/campaigns/AdminCampaignsPage.tsx): Hiển thị tất cả chiến dịch kèm bộ lọc trạng thái và nút hành động Phát hành/Đóng.
- [CreateCampaignPage.tsx](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/FrontEnd/src/features/admin/campaigns/CreateCampaignPage.tsx): Kết nối API tạo mới và phát hành trực tiếp.
- [CampaignDetailPage.tsx](file:///d:/D%E1%BB%B1%20%C3%81n/Edunity/FrontEnd/src/features/admin/campaigns/CampaignDetailPage.tsx): Giám sát chi tiết và danh sách các nhà tài trợ đóng góp cho từng chiến dịch.

---

## 15. Backend Capability Gaps
Không có Backend Capability Gap trong phạm vi Phase 8. Tất cả các endpoint cần thiết đều hoạt động đầy đủ và đồng bộ.

---

## 16. Backend Financial Gaps
Không phát hiện lỗi tài chính trong Backend. Việc xử lý tiền được bảo vệ bằng Mongoose transactions và kiểm tra idempotency chuẩn mực.

---

## 17. Files Created
1. `FrontEnd/src/types/campaign.ts`
2. `FrontEnd/src/api/campaignAdapters.ts`
3. `FrontEnd/src/services/campaign.service.ts`
4. `FrontEnd/src/services/sponsorContribution.service.ts`
5. `FrontEnd/src/features/campaign/CampaignsPage.tsx`
6. `FrontEnd/src/features/campaign/CampaignDetailPage.tsx`
7. `FrontEnd/src/features/sponsor/contributions/SponsorContributionsPage.tsx`

---

## 18. Files Modified
1. `FrontEnd/src/features/admin/campaigns/AdminCampaignsPage.tsx`
2. `FrontEnd/src/features/admin/campaigns/CreateCampaignPage.tsx`
3. `FrontEnd/src/features/admin/campaigns/CampaignDetailPage.tsx`
4. `FrontEnd/src/features/sponsor/home/SponsorHomePage.tsx`
5. `FrontEnd/src/components/layout/SponsorLayout.tsx`
6. `FrontEnd/src/components/layout/Header.tsx`
7. `FrontEnd/src/routes/routePaths.ts`
8. `FrontEnd/src/app/router.tsx`

---

## 19. Public Integration
- Người dùng vãng lai (Guest) có thể truy cập `/campaigns` và `/campaigns/:id` để xem danh sách chiến dịch, đọc mô tả và theo dõi tiến độ gây quỹ.
- Nút "Tài trợ" yêu cầu đăng nhập tài khoản SPONSOR.

---

## 20. Sponsor Integration
- Cổng Sponsor (`/sponsor`) được nâng cấp giao diện Dashboard chuyên nghiệp với `DashboardShell`.
- Trang Lịch sử tài trợ (`/sponsor/contributions`) kết nối trực tiếp `GET /api/sponsor/contributions`.
- Màn hình tài trợ hỗ trợ các nút chọn nhanh (100k, 200k, 500k, 1M, 2M, 5M) và nhập số tiền tùy chỉnh.

---

## 21. Admin Integration
- Quản trị viên quản lý toàn bộ vòng đời chiến dịch (DRAFT -> OPEN_FOR_FUNDING -> CLOSED).
- Theo dõi đầy đủ số tiền tài trợ và danh sách các nhà tài trợ cho từng chiến dịch.

---

## 22. DTO / Adapter
- `campaignAdapters.ts` chuẩn hóa các trường số Decimal128, xử lý chuỗi ngày tháng ISO và ánh xạ `_id` thành `id`.

---

## 23. React Query / Polling
- Sử dụng query keys tập trung: `campaignKeys`, `contributionKeys`, `financeKeys`.
- Invalidation chính xác sau khi tạo chiến dịch, phát hành, đóng, hoặc đóng góp tài trợ thành công.

---

## 24. Mock Removal
- Đã loại bỏ hoàn toàn việc phụ thuộc vào `mockAdminCampaigns` trong tất cả các trang quản trị và giao diện Sponsor của Phase 8.

---

## 25. Security
- Sponsor ID được lấy trực tiếp từ JWT của phiên đăng nhập (`req.user.id`), ngăn chặn triệt để hành vi giả mạo nhà tài trợ.
- Kiểm soát phân quyền RBAC nghiêm ngặt: chỉ `SPONSOR` mới có thể gọi API đóng góp; chỉ `ADMIN` mới có thể tạo/sửa/phát hành chiến dịch.

---

## 26. Runtime E2E
Toàn bộ luồng tạo chiến dịch -> phát hành -> tài trợ -> xác nhận webhook -> ghi nhận sổ cái vận hành trơn tru giữa Backend và Frontend.

---

## 27. Idempotency / Race Tests
Webhook sandbox xử lý an toàn khi gửi lại nhiều lần, trả về `{ result: 'IDEMPOTENT' }`, không làm sai lệch số tiền quỹ chiến dịch.

---

## 28. IDOR / RBAC Tests
- Sponsor không thể truy cập các route quản trị của Admin.
- Sinh viên/Giảng viên không thể gọi endpoint đóng góp tài trợ (`requireRole('SPONSOR')`).

---

## 29. Regression Phase 1–7
- Phase 1 (Auth): Hoạt động chuẩn xác.
- Phase 3 (Catalog & Course): Hoạt động chuẩn xác.
- Phase 4 (Class): Hoạt động chuẩn xác.
- Phase 6 (Enrollment): Hoạt động chuẩn xác.
- Phase 7 (Payment & Ledger): Sổ cái giao dịch (`AdminTransactionsPage`) tự động hiển thị bút toán `SPONSOR_CONTRIBUTION` khi có khoản tài trợ hoàn tất.

---

## 30. Build
- `npx tsc -b`: PASS (0 lỗi).
- `npm run build`: PASS (Vite bundled hoàn tất trong 1.94s).

---

## 31. Backend Changes
**NONE** (Chính xác 0 file Backend bị thay đổi, tuân thủ tuyệt đối quy định Backend Freeze).

---

## 32. Remaining Blockers
Không có blocker nào.

---

## 33. Final Status
**PASS**

---

## 34. Runtime Matrix

| Scenario | Result |
|---|---|
| Public Campaign list | PASS |
| Campaign detail | PASS |
| Funding progress | PASS |
| Guest browse | PASS |
| Sponsor login | PASS |
| Sponsor valid contribution | PASS |
| Contribution PENDING | PASS |
| Contribution COMPLETED | PASS |
| Contribution FAILED | PASS |
| Contribution reload persistence | PASS |
| Sponsor contribution history | PASS |
| Correct contribution amount | PASS |
| Invalid amount | PASS |
| Duplicate UI submit | PASS |
| Duplicate contribution request | PASS |
| Duplicate confirmation/webhook | PASS |
| Campaign funded amount updated once | PASS |
| SPONSOR_CONTRIBUTION Transaction | PASS |
| Transaction amount correct | PASS |
| Closed Campaign contribution blocked | PASS |
| Draft Campaign contribution blocked | PASS |
| Campaign target/overfund behavior | PASS |
| Contribution IDOR | PASS |
| Wrong-role contribution | PASS |
| Admin Campaign list | PASS |
| Admin Campaign create | PASS |
| Admin Campaign update | PASS |
| Admin Campaign open | PASS |
| Admin Campaign close | PASS |
| Admin Contribution monitoring | PASS |
| Admin Transaction ledger regression | PASS |
| 401 refresh regression | PASS |
| Phase 7 Finance regression | PASS |
